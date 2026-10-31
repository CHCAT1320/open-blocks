const SETTINGS_KEY = 'openblocks.ai-agent.settings.v1';
const SESSION_KEY = 'openblocks.ai-agent.session.v1';
const LAYOUT_KEY = 'openblocks.ai-agent.layout.v1';

export const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.3,
  maxSteps: 12,
  maxRetries: 3,
  stream: true,
  autoContext: true,
  confirmDestructive: true,
  rememberKey: true,
  systemPromptExtra: '',
  language: 'zh'
};

export const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini'
  },
  ollama: {
    label: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1'
  },
  custom: {
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    model: ''
  },
  mock: {
    label: '本地演示 (无需 API Key)',
    baseUrl: '',
    model: 'openblocks-demo'
  }
};

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const saved = readJSON(SETTINGS_KEY);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  if (settings.rememberKey === false) settings.apiKey = '';
  if (!PROVIDER_PRESETS[settings.provider]) settings.provider = 'openai';
  return settings;
}

export function saveSettings(settings) {
  const toSave = { ...settings };
  if (toSave.rememberKey === false) toSave.apiKey = '';
  return writeJSON(SETTINGS_KEY, toSave);
}

export function loadSession() {
  const saved = readJSON(SESSION_KEY);
  if (!saved || typeof saved !== 'object') {
    return { display: [], apiMessages: [], plan: [] };
  }
  return {
    display: Array.isArray(saved.display) ? saved.display : [],
    apiMessages: Array.isArray(saved.apiMessages) ? saved.apiMessages : [],
    plan: Array.isArray(saved.plan) ? saved.plan : [],
    usage: saved.usage && typeof saved.usage === 'object' ? saved.usage : null,
    fingerprint: typeof saved.fingerprint === 'string' ? saved.fingerprint : ''
  };
}

export function saveSession(session) {
  const display = (session.display || []).slice(-80).map(entry => {
    let result = entry.result;
    if (result && typeof result === 'object') {
      result = { ...result };
      if (typeof result.image_data_url === 'string') result.image_data_url = '[截图已省略]';
      if (result.screenshot && typeof result.screenshot === 'object' && typeof result.screenshot.image_data_url === 'string') {
        result.screenshot = { ...result.screenshot, image_data_url: '[截图已省略]' };
      }
    }
    return {
      ...entry,
      content: typeof entry.content === 'string' ? entry.content.slice(0, 12000) : entry.content,
      result: result === undefined ? undefined : JSON.stringify(result).slice(0, 12000)
    };
  });
  const apiMessages = (session.apiMessages || []).slice(-60).map(message => ({
    ...message,
    content: typeof message.content === 'string' ? message.content.slice(0, 12000) : message.content
  }));
  return writeJSON(SESSION_KEY, {
    display,
    apiMessages,
    plan: session.plan || [],
    usage: session.usage || null,
    fingerprint: session.fingerprint || '',
    savedAt: Date.now()
  });
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadLayout() {
  return readJSON(LAYOUT_KEY) || null;
}

export function saveLayout(layout) {
  writeJSON(LAYOUT_KEY, layout);
}

export function clearLayout() {
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    // ignore
  }
}
