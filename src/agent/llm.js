import { mockChat } from './mock.js';

export class LLMError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = options.status;
    this.body = options.body;
    this.hint = options.hint;
  }
}

function fetchImpl() {
  const scratch = globalThis.Scratch;
  if (scratch && typeof scratch.fetch === 'function') {
    return scratch.fetch.bind(scratch);
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new LLMError('当前环境不支持 fetch，无法调用 AI 接口。');
}

export function resolveEndpoint(baseUrl) {
  let base = String(baseUrl || '').trim();
  if (!base) throw new LLMError('请先在设置中填写 API Base URL。');
  base = base.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (!/\/v\d+(?:\.\d+)?$/i.test(base)) {
    try {
      const url = new URL(base);
      if (!url.pathname || url.pathname === '/') {
        base += '/v1';
      }
    } catch {
      // keep base as-is
    }
  }
  return `${base}/chat/completions`;
}

function buildHeaders(settings) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  if (/openrouter\.ai/i.test(settings.baseUrl || '')) {
    headers['HTTP-Referer'] = 'https://turbowarp.org';
    headers['X-Title'] = 'OpenBlocks';
  }
  return headers;
}

function contentToString(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('');
  }
  if (content === null || content === undefined) return '';
  return String(content);
}

function reasoningToString(reasoning) {
  if (typeof reasoning === 'string') return reasoning;
  if (reasoning && typeof reasoning.content === 'string') return reasoning.content;
  if (reasoning && typeof reasoning.text === 'string') return reasoning.text;
  return '';
}

function normalizeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .filter(call => call && (call.function || call.name))
    .map((call, index) => {
      const fn = call.function || call;
      let args = fn.arguments;
      if (args === undefined || args === null) args = '{}';
      if (typeof args !== 'string') args = JSON.stringify(args);
      return {
        id: call.id || `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: fn.name || '',
          arguments: args
        }
      };
    })
    .filter(call => call.function.name);
}

function createAccumulator() {
  return {
    content: '',
    reasoning: '',
    toolCalls: [],
    usage: null
  };
}

function ensureToolCall(accumulator, index) {
  if (!accumulator.toolCalls[index]) {
    accumulator.toolCalls[index] = {
      id: '',
      type: 'function',
      function: { name: '', arguments: '' }
    };
  }
  return accumulator.toolCalls[index];
}

function applyDelta(accumulator, data, callbacks) {
  if (data.usage) accumulator.usage = data.usage;
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  if (!choice) return;
  const delta = choice.delta || choice.message || {};
  const content = contentToString(delta.content);
  if (content) {
    accumulator.content += content;
    callbacks.onDelta?.(content);
  }
  const reasoning = reasoningToString(delta.reasoning_content ?? delta.reasoning);
  if (reasoning) {
    accumulator.reasoning += reasoning;
    callbacks.onReasoning?.(reasoning);
  }
  if (Array.isArray(delta.tool_calls)) {
    for (const toolCall of delta.tool_calls) {
      const index = Number.isInteger(toolCall.index) ? toolCall.index : 0;
      const target = ensureToolCall(accumulator, index);
      if (toolCall.id) target.id = toolCall.id;
      if (toolCall.type) target.type = toolCall.type;
      if (toolCall.function) {
        if (toolCall.function.name) target.function.name += toolCall.function.name;
        if (toolCall.function.arguments) target.function.arguments += toolCall.function.arguments;
      }
    }
  }
}

function finalizeAccumulator(accumulator) {
  accumulator.toolCalls = accumulator.toolCalls
    .filter(call => call && call.function && call.function.name)
    .map((call, index) => ({
      id: call.id || `call_${Date.now()}_${index}`,
      type: 'function',
      function: {
        name: call.function.name,
        arguments: call.function.arguments || '{}'
      }
    }));
  return accumulator;
}

async function readSSE(response, callbacks, signal) {
  const accumulator = createAccumulator();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':') || !line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    applyDelta(accumulator, json, callbacks);
  };

  while (true) {
    if (signal && signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      handleLine(line);
    }
  }
  if (buffer.trim()) handleLine(buffer);
  return finalizeAccumulator(accumulator);
}

async function readJSONResponse(response, callbacks) {
  const data = await response.json();
  const accumulator = createAccumulator();
  accumulator.usage = data.usage || null;
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice?.message || {};
  accumulator.content = contentToString(message.content);
  accumulator.reasoning = reasoningToString(message.reasoning_content ?? message.reasoning);
  if (accumulator.content) callbacks.onDelta?.(accumulator.content);
  if (accumulator.reasoning) callbacks.onReasoning?.(accumulator.reasoning);
  accumulator.toolCalls = normalizeToolCalls(message.tool_calls);
  return accumulator;
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    let timer;
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfter(response) {
  try {
    const header = response.headers?.get?.('retry-after');
    if (!header) return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  } catch {
    // ignore
  }
  return null;
}

function retryDelay(retryNumber, response, settings) {
  const maxDelay = Number.isFinite(Number(settings.maxRetryDelay)) ? Number(settings.maxRetryDelay) : 10000;
  const retryAfter = response ? parseRetryAfter(response) : null;
  if (retryAfter !== null) return Math.min(retryAfter, maxDelay);
  const base = Number.isFinite(Number(settings.retryBaseDelay)) ? Number(settings.retryBaseDelay) : 900;
  const exponential = base * Math.pow(2, Math.max(0, retryNumber - 1));
  const jitter = Math.random() * Math.min(400, exponential * 0.25);
  return Math.min(maxDelay, exponential + jitter);
}

function errorDetail(text) {
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    detail = parsed.error?.message || parsed.message || text;
  } catch {
    // keep text
  }
  return detail;
}

function statusHint(status) {
  if (status === 401) return 'API Key 无效或未填写。';
  if (status === 404) return '模型名或 Base URL 不正确。';
  if (status === 429) return '请求过于频繁或额度不足。';
  if (status === 503) return '服务暂时不可用，已自动重试；如果持续失败，可在设置中提高“失败自动重试次数”，或稍后再试/切换服务商。';
  return undefined;
}

export async function chat({ settings, messages, tools = [], signal, onDelta, onReasoning, onRetry, maxTokens, stream }) {
  if (settings.provider === 'mock') {
    return mockChat({ settings, messages, signal, onDelta, onReasoning });
  }

  const endpoint = resolveEndpoint(settings.baseUrl);
  const useStream = stream === undefined ? settings.stream !== false : Boolean(stream);
  const body = {
    model: settings.model || 'gpt-4o-mini',
    messages,
    temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.3,
    stream: useStream
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  if (maxTokens) body.max_tokens = maxTokens;

  const configuredRetries = Number(settings.maxRetries);
  const maxRetries = Math.max(0, Math.min(8, Number.isFinite(configuredRetries) ? configuredRetries : 3));
  const fetchFn = fetchImpl();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetchFn(endpoint, {
        method: 'POST',
        headers: buildHeaders(settings),
        body: JSON.stringify(body),
        signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      if (attempt < maxRetries) {
        const delay = retryDelay(attempt + 1, null, settings);
        onRetry?.({
          attempt: attempt + 1,
          maxRetries,
          delay,
          reason: 'network',
          error: error && error.message ? error.message : String(error)
        });
        await sleep(delay, signal);
        continue;
      }
      const suffix = attempt > 0 ? `（已重试 ${attempt} 次）` : '';
      throw new LLMError(`无法连接 AI 接口${suffix}：${error && error.message ? error.message : error}`, {
        hint:
          '请检查 Base URL、网络和浏览器 CORS 设置。OpenAI 兼容接口通常需要允许浏览器跨域；本地 Ollama 需要设置 OLLAMA_ORIGINS=*。'
      });
    }

    if (response.ok) {
      if (useStream && response.body) {
        return readSSE(response, { onDelta, onReasoning }, signal);
      }
      return readJSONResponse(response, { onDelta, onReasoning });
    }

    let text = '';
    try {
      text = await response.text();
    } catch {
      // ignore
    }
    const detail = errorDetail(text);
    const status = response.status;

    if (RETRYABLE_STATUS.has(status) && attempt < maxRetries) {
      const delay = retryDelay(attempt + 1, response, settings);
      onRetry?.({
        attempt: attempt + 1,
        maxRetries,
        delay,
        reason: 'status',
        status,
        detail
      });
      await sleep(delay, signal);
      continue;
    }

    const suffix = attempt > 0 ? `（已重试 ${attempt} 次）` : '';
    throw new LLMError(`AI 接口返回 ${status}${suffix}: ${detail || response.statusText}`, {
      status,
      body: text,
      hint: statusHint(status)
    });
  }

  throw new LLMError('AI 请求失败：已达到最大重试次数。');
}

export async function testConnection(settings) {
  if (settings.provider === 'mock') {
    return { ok: true, message: '本地演示模式可用。' };
  }
  const result = await chat({
    settings,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    tools: [],
    stream: false,
    maxTokens: 16
  });
  return { ok: true, message: result.content || '(接口返回空内容)' };
}
