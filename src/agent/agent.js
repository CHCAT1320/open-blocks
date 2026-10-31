import { uid } from '../util/id.js';
import { clampNumber, prettyJSON } from '../util/format.js';
import { loadSession, saveSession, clearSession } from '../util/storage.js';
import { pushSnapshot, restoreLastSnapshot, snapshotCount } from '../vm/api.js';
import { buildSystemMessages } from './prompt.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { LLMError, chat } from './llm.js';

function sanitizeApiMessages(messages) {
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message || typeof message !== 'object') continue;
    if (message.role === 'system') continue;
    if (message.role === 'tool') continue;
    if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      const ids = new Set(message.tool_calls.map(call => call.id));
      const toolMessages = [];
      let j = i + 1;
      while (j < messages.length && messages[j] && messages[j].role === 'tool') {
        if (ids.has(messages[j].tool_call_id)) toolMessages.push(messages[j]);
        j++;
      }
      if (toolMessages.length === ids.size) {
        result.push(message, ...toolMessages);
        i = j - 1;
      } else {
        break;
      }
      continue;
    }
    result.push(message);
  }
  while (result.length && result[result.length - 1].role === 'tool') result.pop();
  return result.slice(-60);
}

function formatError(error) {
  if (!error) return '未知错误';
  if (error instanceof LLMError) {
    return [error.message, error.hint].filter(Boolean).join('\n\n');
  }
  if (error.name === 'AbortError') return '已停止。';
  return error.message || String(error);
}

function compactToolResultForModel(result) {
  if (!result || typeof result !== 'object') return result;
  const copy = { ...result };
  if (typeof copy.image_data_url === 'string') {
    copy.image_data_url = `[PNG data URL omitted (${copy.image_data_url.length} chars)]`;
  }
  if (copy.screenshot && typeof copy.screenshot === 'object' && typeof copy.screenshot.image_data_url === 'string') {
    copy.screenshot = {
      ...copy.screenshot,
      image_data_url: `[PNG data URL omitted (${copy.screenshot.image_data_url.length} chars)]`
    };
  }
  return copy;
}

function parseToolArguments(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('参数必须是 JSON 对象');
    }
    return { ok: true, args: parsed };
  } catch (error) {
    return {
      ok: false,
      error: `工具参数不是合法 JSON: ${error.message}. 原始内容: ${String(raw).slice(0, 800)}`
    };
  }
}

export class Agent {
  constructor({ settings, getContext, confirm, onEvent } = {}) {
    this.settings = settings;
    this.getContext = getContext || (() => '');
    this.confirm = confirm || (async () => true);
    this.onEvent = onEvent || (() => {});
    this.display = [];
    this.apiMessages = [];
    this.plan = [];
    this.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    this.running = false;
    this.abortController = null;
    this.restore();
  }

  getProjectFingerprint() {
    try {
      const vm = globalThis.Scratch && globalThis.Scratch.vm;
      if (!vm || !vm.runtime) return '';
      return vm.runtime.targets
        .filter(target => target.isOriginal)
        .map(target => `${target.id}:${target.getName()}:${(target.blocks && target.blocks._scripts ? target.blocks._scripts.length : 0)}`)
        .join('|');
    } catch {
      return '';
    }
  }

  restore() {
    const session = loadSession();
    const fingerprint = this.getProjectFingerprint();
    if (!session.fingerprint || session.fingerprint !== fingerprint) {
      this.display = [];
      this.apiMessages = [];
      this.plan = [];
      clearSession();
      return;
    }
    this.display = Array.isArray(session.display) ? session.display : [];
    this.apiMessages = sanitizeApiMessages(Array.isArray(session.apiMessages) ? session.apiMessages : []);
    this.plan = Array.isArray(session.plan) ? session.plan : [];
    this.usage = session.usage && typeof session.usage === 'object'
      ? {
          prompt_tokens: Number(session.usage.prompt_tokens) || 0,
          completion_tokens: Number(session.usage.completion_tokens) || 0,
          total_tokens: Number(session.usage.total_tokens) || 0
        }
      : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }

  emit(type, payload = {}) {
    try {
      this.onEvent({ type, ...payload });
    } catch {
      // UI errors must not break the agent
    }
  }

  getDisplay() {
    return this.display;
  }

  getPlan() {
    return this.plan;
  }

  setPlan(steps) {
    this.plan = (Array.isArray(steps) ? steps : [])
      .filter(step => step && typeof step.title === 'string')
      .map(step => ({
        title: step.title.slice(0, 200),
        status: ['pending', 'in_progress', 'done'].includes(step.status) ? step.status : 'pending'
      }));
    this.emit('plan', { steps: this.plan });
    this.persist();
  }

  setSettings(settings) {
    this.settings = settings;
  }

  persist() {
    saveSession({
      display: this.display,
      apiMessages: this.apiMessages,
      plan: this.plan,
      usage: this.usage,
      fingerprint: this.getProjectFingerprint()
    });
  }

  buildContext() {
    try {
      const context = this.getContext();
      if (!context) return '';
      const text = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
      return text.length > 9000 ? `${text.slice(0, 9000)}\n… (context truncated)` : text;
    } catch (error) {
      return `Project context unavailable: ${error && error.message ? error.message : error}`;
    }
  }

  buildMessages() {
    if (this.apiMessages.length > 80) {
      this.apiMessages = sanitizeApiMessages(this.apiMessages.slice(-80));
    }
    return [
      ...buildSystemMessages(this.settings, this.buildContext()),
      ...this.apiMessages
    ];
  }

  async send(text) {
    const prompt = String(text || '').trim();
    if (!prompt) return { ok: false, error: '消息为空。' };
    if (this.running) return { ok: false, error: 'AI 正在处理上一条消息。' };

    this.running = true;
    this.abortController = new AbortController();
    this.emit('running', { value: true });

    const userEntry = {
      id: uid('msg'),
      type: 'user',
      content: prompt,
      time: Date.now(),
      snapshotMark: snapshotCount(),
      planBefore: this.plan.map(step => ({ ...step }))
    };
    this.display.push(userEntry);
    this.emit('user', { entry: userEntry });
    this.apiMessages.push({ role: 'user', content: prompt });
    this.persist();

    let snapshotTaken = false;
    let errorText = '';
    const signal = this.abortController.signal;
    const maxSteps = clampNumber(this.settings.maxSteps, 1, 30, 12);
    let finalText = '';

    const ctx = {
      signal,
      confirmDestructive: this.settings.confirmDestructive !== false,
      confirm: options => this.confirm(options),
      ensureSnapshot: async label => {
        if (snapshotTaken) return;
        snapshotTaken = true;
        await pushSnapshot(label || 'AI 修改');
      },
      setPlan: steps => this.setPlan(steps)
    };

    try {
      for (let step = 0; step < maxSteps; step++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        this.emit('status', { text: step === 0 ? 'AI 正在思考…' : `AI 正在继续处理（第 ${step + 1} 步）…` });

        let assistantEntry = null;
        let firstChunk = true;
        const markFirstChunk = () => {
          if (!firstChunk) return;
          firstChunk = false;
          this.emit('status', { text: 'AI 正在回复…' });
        };
        const ensureAssistant = () => {
          if (assistantEntry) return assistantEntry;
          assistantEntry = {
            id: uid('msg'),
            type: 'assistant',
            content: '',
            reasoning: '',
            time: Date.now()
          };
          this.display.push(assistantEntry);
          this.emit('assistant_start', { entry: assistantEntry });
          return assistantEntry;
        };

        const result = await chat({
          settings: this.settings,
          messages: this.buildMessages(),
          tools: TOOL_SCHEMAS,
          signal,
          onDelta: chunk => {
            if (!chunk) return;
            markFirstChunk();
            const entry = ensureAssistant();
            entry.content += chunk;
            this.emit('assistant_delta', { id: entry.id, text: chunk });
          },
          onReasoning: chunk => {
            if (!chunk) return;
            markFirstChunk();
            const entry = ensureAssistant();
            entry.reasoning += chunk;
            this.emit('reasoning_delta', { id: entry.id, text: chunk });
          },
          onRetry: info => {
            const reason = info.reason === 'status' ? `接口返回 ${info.status}` : '网络异常';
            this.emit('status', {
              text: `${reason}，正在自动重试（${info.attempt}/${info.maxRetries}）…`
            });
          }
        });

        if (result.usage && typeof result.usage === 'object') {
          const promptTokens = Number(result.usage.prompt_tokens) || 0;
          const completionTokens = Number(result.usage.completion_tokens) || 0;
          this.usage.prompt_tokens += promptTokens;
          this.usage.completion_tokens += completionTokens;
          this.usage.total_tokens += Number(result.usage.total_tokens) || promptTokens + completionTokens;
          this.emit('usage', { usage: this.usage });
        }

        const content = result.content || '';
        const reasoning = result.reasoning || '';
        const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];

        if ((content || reasoning) && !assistantEntry) {
          assistantEntry = ensureAssistant();
          if (content) {
            assistantEntry.content = content;
            this.emit('assistant_delta', { id: assistantEntry.id, text: content });
          }
          if (reasoning) {
            assistantEntry.reasoning = reasoning;
            this.emit('reasoning_delta', { id: assistantEntry.id, text: reasoning });
          }
        }
        if (assistantEntry) {
          assistantEntry.content = content || assistantEntry.content;
          assistantEntry.reasoning = reasoning || assistantEntry.reasoning;
          assistantEntry.streaming = false;
          this.emit('assistant_end', { entry: assistantEntry });
        }

        if (toolCalls.length) {
          this.apiMessages.push({
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls
          });
        } else {
          this.apiMessages.push({ role: 'assistant', content: content || '' });
          finalText = content || '';
          this.persist();
          break;
        }

        for (const call of toolCalls) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const name = call.function?.name || 'unknown';
          const parsed = parseToolArguments(call.function?.arguments);
          const args = parsed.ok ? parsed.args : {};
          const toolEntry = {
            id: uid('tool'),
            type: 'tool',
            name,
            args,
            status: 'running',
            time: Date.now()
          };
          this.display.push(toolEntry);
          this.emit('tool_start', { entry: toolEntry });
          this.emit('status', { text: `正在执行 ${name}…` });

          let toolResult;
          if (!parsed.ok) {
            toolResult = { ok: false, error: parsed.error };
          } else {
            toolResult = await executeTool(name, args, ctx);
          }

          toolEntry.status = toolResult.ok ? 'done' : 'error';
          toolEntry.result = toolResult;
          if (!toolResult.ok) toolEntry.error = toolResult.error;
          this.emit('tool_end', { entry: toolEntry });

          const resultText = prettyJSON(compactToolResultForModel(toolResult), 24000);
          this.apiMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: resultText
          });
          this.persist();
        }

        if (step === maxSteps - 1) {
          const message = `已达到最大步骤数（${maxSteps}）。你可以发送“继续”让我接着做。`;
          errorText = message;
          this.emit('error', { message });
          const entry = {
            id: uid('msg'),
            type: 'error',
            content: message,
            time: Date.now()
          };
          this.display.push(entry);
          this.emit('assistant_start', { entry });
          this.emit('assistant_end', { entry });
        }
      }
    } catch (error) {
      if (error && error.name === 'AbortError') {
        errorText = '已停止。';
        this.emit('status', { text: '已停止。' });
      } else {
        const message = formatError(error);
        errorText = message;
        this.emit('error', { message });
        const entry = {
          id: uid('msg'),
          type: 'error',
          content: message,
          time: Date.now()
        };
        this.display.push(entry);
        this.emit('assistant_start', { entry });
        this.emit('assistant_end', { entry });
      }
    } finally {
      this.running = false;
      this.abortController = null;
      this.persist();
      this.emit('running', { value: false });
      this.emit('done', { text: finalText });
    }

    return { ok: !errorText, text: finalText || errorText, error: errorText };
  }

  async ask(text) {
    if (this.running) throw new Error('AI 正在处理其他任务，请稍后再试。');
    const result = await this.send(text);
    return result.text || '';
  }

  async retractFrom(messageId) {
    if (this.running) throw new Error('请先停止当前 AI 任务。');
    const index = this.display.findIndex(entry => entry.type === 'user' && entry.id === messageId);
    if (index < 0) throw new Error('找不到要撤回的消息。');
    const entry = this.display[index];
    const text = entry.content || '';
    const mark = Number.isInteger(entry.snapshotMark) ? entry.snapshotMark : null;
    let restored = 0;
    let rollbackError = '';

    if (mark === null) {
      rollbackError = '这条消息来自旧会话，未记录项目快照；已撤回对话，但未自动撤销项目修改。';
    } else {
      if (snapshotCount() === 0 && mark > 0) {
        rollbackError = '项目快照已丢失（可能刷新过页面），无法自动撤销项目修改。';
      } else {
        try {
          while (snapshotCount() > mark) {
            await restoreLastSnapshot();
            restored++;
          }
          if (snapshotCount() < mark && !rollbackError) {
            rollbackError = '部分项目快照已被清理，可能无法完全恢复项目状态。';
          }
        } catch (error) {
          rollbackError = error && error.message ? error.message : String(error);
        }
      }
    }

    const userMessagesAfter = this.display.slice(index + 1).filter(item => item.type === 'user').length;
    let apiIndex = -1;
    let seen = 0;
    for (let i = this.apiMessages.length - 1; i >= 0; i--) {
      if (this.apiMessages[i].role === 'user') {
        if (seen === userMessagesAfter) {
          apiIndex = i;
          break;
        }
        seen++;
      }
    }
    if (apiIndex < 0) {
      for (let i = this.apiMessages.length - 1; i >= 0; i--) {
        if (this.apiMessages[i].role === 'user' && this.apiMessages[i].content === text) {
          apiIndex = i;
          break;
        }
      }
    }
    this.apiMessages = apiIndex >= 0 ? this.apiMessages.slice(0, apiIndex) : [];

    this.display = this.display.slice(0, index);
    this.plan = Array.isArray(entry.planBefore) ? entry.planBefore.map(step => ({ ...step })) : [];
    this.emit('plan', { steps: this.plan });
    this.persist();
    this.emit('retract', { entry, text, restored, rollbackError });
    return { text, restored, rollbackError };
  }

  stop() {
    if (this.abortController) this.abortController.abort();
  }

  clear() {
    this.stop();
    this.display = [];
    this.apiMessages = [];
    this.plan = [];
    this.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    clearSession();
    this.emit('clear', {});
    this.emit('usage', { usage: this.usage });
    this.emit('plan', { steps: [] });
  }
}
