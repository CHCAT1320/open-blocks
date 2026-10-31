import css from '../styles.css';
import { renderMarkdown } from './markdown.js';
import { escapeHtml, prettyJSON, truncate, clampNumber } from '../util/format.js';
import { clearLayout, loadLayout, saveLayout, PROVIDER_PRESETS } from '../util/storage.js';
import { redoCount, redoLastSnapshot, restoreLastSnapshot, snapshotCount } from '../vm/api.js';
import { testConnection } from '../agent/llm.js';
import {
  GEAR_ICON,
  TRASH_ICON,
  CLOSE_ICON,
  SEND_ICON,
  STOP_ICON,
  UNDO_ICON,
  SPARK_ICON,
  CHECK_ICON,
  CHEVRON_ICON,
  EDIT_ICON,
  REDO_ICON
} from './icons.js';

const TOOL_LABELS = {
  get_project: '读取项目',
  get_block_catalog: '查询积木',
  create_sprite: '创建角色',
  delete_sprite: '删除角色',
  rename_sprite: '重命名角色',
  set_sprite: '调整角色',
  create_variable: '创建变量',
  set_variable: '设置变量',
  add_script: '拼装积木',
  delete_script: '删除脚本',
  clear_scripts: '清空脚本',
  add_costume: '添加造型',
  set_backdrop: '切换背景',
  set_stage: '设置舞台',
  run_project: '运行项目',
  stop_project: '停止项目',
  export_project: '导出项目',
  undo_last_change: '撤销修改',
  update_plan: '更新计划',
  get_runtime_state: '读取运行状态',
  wait: '等待',
  wait_until: '等待条件',
  verify_project: '运行验证',
  capture_stage: '舞台截图',
  search_project: '搜索项目',
  find_references: '查找引用',
  redo_last_change: '重做修改'
};

function formatTokenCount(value) {
  const number = Number(value) || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return String(number);
}

const SUGGESTIONS = [
  '做一个打砖块游戏',
  '给角色加一个跟随鼠标的脚本',
  '做一个收集金币的小关卡',
  '解释当前项目的脚本结构'
];

function providerLabel(settings) {
  return PROVIDER_PRESETS[settings.provider]?.label || settings.provider;
}

function toolLabel(name) {
  return TOOL_LABELS[name] || name;
}

function formatValue(value, max = 4000) {
  if (value === undefined) return '';
  if (typeof value === 'string') return truncate(value, max);
  return prettyJSON(value, max);
}

function iconSvg(svg) {
  return svg;
}

export class Panel {
  constructor({ agent, settings, onSettingsChange, getContextLabel }) {
    this.agent = agent;
    this.settings = settings;
    this.onSettingsChange = onSettingsChange || (() => {});
    this.getContextLabel = getContextLabel || (() => 'Stage');
    this.host = null;
    this.shadow = null;
    this.mounted = false;
    this.running = false;
    this.toastTimer = null;
    this.confirmResolve = null;
    this.drag = null;
  }

  mount() {
    if (this.mounted) return;
    if (!document.body) {
      setTimeout(() => this.mount(), 200);
      return;
    }
    if (document.querySelector('div[data-openblocks-ai="true"]')) return;

    const host = document.createElement('div');
    host.dataset.openblocksAi = 'true';
    host.style.all = 'initial';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${css}</style>${this.template()}`;
    this.host = host;
    this.shadow = shadow;
    this.mounted = true;

    this.edgeTab = shadow.querySelector('#ob-edge-tab');
    this.panel = shadow.querySelector('#ob-panel');
    this.messages = shadow.querySelector('#ob-messages');
    this.planEl = shadow.querySelector('#ob-plan');
    this.input = shadow.querySelector('#ob-input');
    this.sendBtn = shadow.querySelector('#ob-send');
    this.stopBtn = shadow.querySelector('#ob-stop');
    this.statusEl = shadow.querySelector('#ob-status');
    this.subtitle = shadow.querySelector('#ob-subtitle');
    this.liveDot = shadow.querySelector('#ob-live-dot');
    this.statsEl = shadow.querySelector('#ob-stats');
    this.modelBadge = shadow.querySelector('#ob-model-badge');
    this.contextModel = shadow.querySelector('#ob-context-model');
    this.contextTarget = shadow.querySelector('#ob-context-target');
    this.settingsOverlay = shadow.querySelector('#ob-settings');
    this.settingsStatus = shadow.querySelector('#ob-settings-status');
    this.confirmOverlay = shadow.querySelector('#ob-confirm');
    this.confirmTitle = shadow.querySelector('#ob-confirm-title');
    this.confirmMessage = shadow.querySelector('#ob-confirm-message');
    this.toastEl = shadow.querySelector('#ob-toast');

    this.bind();
    this.agent.onEvent = event => this.handleEvent(event);
    this.agent.confirm = options => this.confirm(options);
    this.renderDisplay();
    this.renderPlan(this.agent.getPlan());
    this.updateSubtitle();
    this.refreshContext();
    this.setBusy(this.agent.running);
    this.updateSendState();
    this.applyLayout();
  }

  template() {
    const providerOptions = Object.entries(PROVIDER_PRESETS)
      .map(([key, preset]) => `<option value="${escapeHtml(key)}">${escapeHtml(preset.label)}</option>`)
      .join('');
    return `
      <button class="ob-edge-tab" id="ob-edge-tab" title="打开 OpenBlocks（Ctrl+Shift+A）" aria-label="打开 OpenBlocks" hidden>
        <span class="ob-edge-tab-icon">${iconSvg(SPARK_ICON)}</span>
        <span class="ob-edge-tab-text">OB</span>
      </button>
      <section class="ob-panel" id="ob-panel" aria-label="OpenBlocks 助手">
        <header class="ob-header" id="ob-header" title="拖动标题栏移动窗口，双击恢复右侧停靠">
          <div class="ob-brand">
            <div class="ob-logo">${iconSvg(SPARK_ICON)}</div>
            <div>
              <div class="ob-title-row"><div class="ob-title">OpenBlocks</div><span class="ob-live-dot" id="ob-live-dot"></span></div>
              <div class="ob-subtitle" id="ob-subtitle">TurboWarp Agent</div>
            </div>
          </div>
          <div class="ob-header-actions">
            <button class="ob-icon-btn" id="ob-undo" title="撤销 AI 修改" aria-label="撤销 AI 修改">${iconSvg(UNDO_ICON)}</button>
            <button class="ob-icon-btn" id="ob-redo" title="重做 AI 修改" aria-label="重做 AI 修改">${iconSvg(REDO_ICON)}</button>
            <button class="ob-icon-btn" id="ob-settings-open" title="设置" aria-label="设置">${iconSvg(GEAR_ICON)}</button>
            <button class="ob-icon-btn" id="ob-clear" title="清空对话" aria-label="清空对话">${iconSvg(TRASH_ICON)}</button>
            <button class="ob-icon-btn" id="ob-close" title="关闭" aria-label="关闭">${iconSvg(CLOSE_ICON)}</button>
          </div>
        </header>
        <div class="ob-context">
          <span class="ob-chip"><span class="ob-dot"></span><b>模型</b><span id="ob-context-model"></span></span>
          <span class="ob-chip"><b>当前</b><span id="ob-context-target"></span></span>
          <span class="ob-context-stats" id="ob-stats"></span>
        </div>
        <div class="ob-messages" id="ob-messages" role="log" aria-live="polite"></div>
        <div class="ob-plan" id="ob-plan" hidden></div>
        <div class="ob-composer">
          <div class="ob-input-wrap">
            <textarea class="ob-input" id="ob-input" rows="1" placeholder="描述你想做的项目，或让我修改当前作品…"></textarea>
            <button class="ob-send" id="ob-send" title="发送" aria-label="发送">${iconSvg(SEND_ICON)}</button>
            <button class="ob-stop" id="ob-stop" title="停止" aria-label="停止" hidden>${iconSvg(STOP_ICON)}</button>
          </div>
          <div class="ob-composer-foot">
            <div class="ob-composer-badges">
              <span class="ob-mode-badge">Agent</span>
              <button class="ob-model-badge" id="ob-model-badge" type="button" title="打开 AI 设置"></button>
            </div>
            <span class="ob-status" id="ob-status">就绪</span>
          </div>
        </div>

        <div class="ob-settings" id="ob-settings" hidden>
          <div class="ob-settings-head">
            <h3>OpenBlocks 设置</h3>
            <button class="ob-icon-btn" id="ob-settings-close" aria-label="关闭设置">${iconSvg(CLOSE_ICON)}</button>
          </div>
          <div class="ob-settings-body">
            <div class="ob-field">
              <label for="ob-provider">服务商</label>
              <select id="ob-provider">${providerOptions}</select>
              <div class="ob-hint">选择预设后会自动填入 Base URL 和模型，可再手动修改。</div>
            </div>
            <div class="ob-field">
              <label for="ob-base-url">API Base URL</label>
              <input id="ob-base-url" type="url" spellcheck="false" placeholder="https://api.openai.com/v1">
              <div class="ob-hint">OpenAI 兼容接口。通常需要包含 <code>/v1</code>；也可以直接填写完整的 <code>/chat/completions</code> 地址。</div>
            </div>
            <div class="ob-field">
              <label for="ob-api-key">API Key</label>
              <input id="ob-api-key" type="password" spellcheck="false" autocomplete="off" placeholder="sk-...">
              <div class="ob-hint">Key 只保存在本机浏览器 localStorage。公共电脑上请取消勾选“记住 Key”。</div>
            </div>
            <div class="ob-field">
              <label for="ob-model">模型</label>
              <input id="ob-model" type="text" spellcheck="false" placeholder="gpt-4o-mini">
            </div>
            <div class="ob-field-row">
              <div class="ob-field">
                <label for="ob-temperature">Temperature</label>
                <input id="ob-temperature" type="number" min="0" max="2" step="0.1">
              </div>
              <div class="ob-field">
                <label for="ob-max-steps">最大工具步骤</label>
                <input id="ob-max-steps" type="number" min="1" max="30" step="1">
              </div>
            </div>
            <div class="ob-field">
              <label for="ob-max-retries">失败自动重试次数</label>
              <input id="ob-max-retries" type="number" min="0" max="8" step="1">
              <div class="ob-hint">遇到 429 / 500 / 502 / 503 / 504 或网络错误时自动重试，使用指数退避。</div>
            </div>
            <label class="ob-check"><input type="checkbox" id="ob-stream"><span>流式输出<small>逐字显示回复；如果接口不支持可以关闭。</small></span></label>
            <label class="ob-check"><input type="checkbox" id="ob-auto-context"><span>自动附带项目上下文<small>每次请求前注入当前角色、变量和脚本数量摘要。</small></span></label>
            <label class="ob-check"><input type="checkbox" id="ob-confirm-destructive"><span>破坏性操作前询问<small>删除角色、删除/清空脚本时弹出确认框。</small></span></label>
            <label class="ob-check"><input type="checkbox" id="ob-remember-key"><span>记住 API Key<small>取消后刷新页面需要重新输入。</small></span></label>
            <div class="ob-field">
              <label for="ob-extra-prompt">附加系统提示词</label>
              <textarea id="ob-extra-prompt" placeholder="例如：所有变量名使用英文；优先使用克隆体；代码注释用中文……"></textarea>
            </div>
          </div>
          <div class="ob-settings-foot">
            <span class="ob-settings-status" id="ob-settings-status"></span>
            <button class="ob-btn" id="ob-test">测试连接</button>
            <button class="ob-btn" id="ob-settings-cancel">取消</button>
            <button class="ob-btn ob-primary" id="ob-settings-save">保存</button>
          </div>
        </div>

        <div class="ob-confirm" id="ob-confirm" hidden>
          <div class="ob-confirm-box">
            <h4 id="ob-confirm-title">确认操作</h4>
            <p id="ob-confirm-message"></p>
            <div class="ob-confirm-actions">
              <button class="ob-btn" id="ob-confirm-cancel">取消</button>
              <button class="ob-btn ob-primary" id="ob-confirm-ok">确认</button>
            </div>
          </div>
        </div>
      </section>
      <div class="ob-toast" id="ob-toast" hidden></div>
    `;
  }

  bind() {
    const $ = selector => this.shadow.querySelector(selector);
    this.edgeTab.addEventListener('click', () => this.open());
    $('#ob-close').addEventListener('click', () => this.close());
    $('#ob-model-badge').addEventListener('click', () => this.openSettings());
    $('#ob-settings-open').addEventListener('click', () => this.openSettings());
    $('#ob-clear').addEventListener('click', () => this.clearChat());
    $('#ob-undo').addEventListener('click', () => this.undo());
    $('#ob-redo').addEventListener('click', () => this.redo());
    this.sendBtn.addEventListener('click', () => this.send());
    this.stopBtn.addEventListener('click', () => this.agent.stop());
    this.input.addEventListener('input', () => {
      this.resizeInput();
      this.updateSendState();
    });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.send();
      }
    });

    $('#ob-header').addEventListener('pointerdown', event => this.startDrag(event));
    $('#ob-header').addEventListener('dblclick', event => this.resetLayout(event));
    window.addEventListener('resize', () => this.applyLayout());

    $('#ob-settings-close').addEventListener('click', () => this.closeSettings());
    $('#ob-settings-cancel').addEventListener('click', () => this.closeSettings());
    $('#ob-settings-save').addEventListener('click', () => this.saveSettings());
    $('#ob-test').addEventListener('click', () => this.runConnectionTest());
    $('#ob-provider').addEventListener('change', event => this.applyProviderPreset(event.target.value));
    $('#ob-confirm-cancel').addEventListener('click', () => this.finishConfirm(false));
    $('#ob-confirm-ok').addEventListener('click', () => this.finishConfirm(true));

    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.shiftKey && (event.key === 'A' || event.key === 'a')) {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (event.key === 'Escape') {
        if (!this.settingsOverlay.hidden) {
          this.closeSettings();
        } else if (!this.confirmOverlay.hidden) {
          this.finishConfirm(false);
        } else if (!this.panel.hidden) {
          this.close();
        }
      }
    });

  }

  toggle() {
    if (this.panel.hidden) this.open();
    else this.close();
  }

  applyLayout() {
    if (!this.panel || window.innerWidth <= 560) return;
    const layout = loadLayout();
    if (!layout) return;
    const width = Math.min(Math.max(320, Number(layout.width) || 430), Math.max(320, window.innerWidth - 16));
    const height = Math.min(Math.max(300, Number(layout.height) || 600), Math.max(300, window.innerHeight - 16));
    const left = Math.min(Math.max(0, Number(layout.left) || 0), Math.max(0, window.innerWidth - width));
    const top = Math.min(Math.max(0, Number(layout.top) || 0), Math.max(0, window.innerHeight - height));
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    this.panel.style.width = `${width}px`;
    this.panel.style.height = `${height}px`;
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
  }

  startDrag(event) {
    if (!this.panel || window.innerWidth <= 560) return;
    if (event.target.closest('button') || event.button !== 0) return;
    const rect = this.panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const height = Math.min(rect.height, Math.max(360, window.innerHeight - 140));
    const top = Math.min(rect.top, Math.max(0, window.innerHeight - height - 8));
    let started = false;

    event.preventDefault();

    const onMove = moveEvent => {
      if (!started) {
        if (Math.abs(moveEvent.clientX - startX) < 3 && Math.abs(moveEvent.clientY - startY) < 3) return;
        started = true;
        this.drag = {
          offsetX: startX - rect.left,
          offsetY: startY - top,
          width: rect.width,
          height
        };
        this.panel.style.left = `${rect.left}px`;
        this.panel.style.top = `${top}px`;
        this.panel.style.width = `${rect.width}px`;
        this.panel.style.height = `${height}px`;
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
      }
      if (!this.drag) return;
      const left = Math.min(
        Math.max(0, moveEvent.clientX - this.drag.offsetX),
        Math.max(0, window.innerWidth - this.drag.width)
      );
      const nextTop = Math.min(
        Math.max(0, moveEvent.clientY - this.drag.offsetY),
        Math.max(0, window.innerHeight - this.drag.height)
      );
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${nextTop}px`;
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!started || !this.drag) {
        this.drag = null;
        return;
      }
      saveLayout({
        left: parseFloat(this.panel.style.left) || 0,
        top: parseFloat(this.panel.style.top) || 0,
        width: this.drag.width,
        height: this.drag.height
      });
      this.drag = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  resetLayout(event) {
    if (!this.panel) return;
    if (event && event.target.closest('button')) return;
    clearLayout();
    for (const prop of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
      this.panel.style[prop] = '';
    }
    this.drag = null;
    this.toast('已恢复右侧停靠布局。', 'success');
  }

  open() {
    if (!this.panel) return;
    this.panel.hidden = false;
    if (this.edgeTab) this.edgeTab.hidden = true;
    this.refreshContext();
    this.updateSubtitle();
    this.renderDisplay();
    this.renderPlan(this.agent.getPlan());
    this.setBusy(this.agent.running);
    this.scrollToBottom();
    setTimeout(() => {
      this.resizeInput();
      this.input.focus();
    }, 80);
  }

  close() {
    if (!this.panel) return;
    this.panel.hidden = true;
    if (this.edgeTab) this.edgeTab.hidden = false;
  }

  send() {
    const text = this.input.value.trim();
    if (!text || this.agent.running) return;
    this.input.value = '';
    this.resizeInput();
    this.updateSendState();
    this.agent.send(text).catch(error => {
      this.toast(error && error.message ? error.message : String(error), 'error');
    });
  }

  resizeInput() {
    if (!this.input) return;
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(150, Math.max(38, this.input.scrollHeight))}px`;
  }

  updateSendState() {
    if (!this.sendBtn) return;
    this.sendBtn.disabled = this.running || !this.input.value.trim();
  }

  setBusy(running) {
    this.running = Boolean(running);
    if (!this.panel) return;
    if (this.liveDot) this.liveDot.classList.toggle('ob-live', this.running);
    this.sendBtn.hidden = this.running;
    this.stopBtn.hidden = !this.running;
    this.updateSendState();
    this.setStatus(this.running ? 'AI 正在工作…' : '就绪', this.running);
  }

  setStatus(text, working = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text || '';
    this.statusEl.classList.toggle('ob-working', Boolean(working));
  }

  updateSubtitle() {
    if (!this.subtitle) return;
    const provider = providerLabel(this.settings);
    if (this.settings.provider === 'mock') {
      this.subtitle.textContent = '本地演示模式 · 无需 API Key';
    } else {
      this.subtitle.textContent = `${provider} · ${this.settings.model || '未设置模型'}`;
    }
    if (this.contextModel) this.contextModel.textContent = this.settings.model || provider;
    if (this.modelBadge) this.modelBadge.textContent = this.settings.model || provider;
  }

  refreshContext() {
    if (!this.contextTarget) return;
    let label = 'Stage';
    try {
      label = this.getContextLabel() || 'Stage';
    } catch {
      label = 'Stage';
    }
    this.contextTarget.textContent = label;
    if (this.contextModel) this.contextModel.textContent = this.settings.model || providerLabel(this.settings);
    if (this.modelBadge) this.modelBadge.textContent = this.settings.model || providerLabel(this.settings);
    this.refreshStats();
  }

  refreshStats() {
    if (!this.statsEl) return;
    const display = this.agent.getDisplay();
    const messages = display.filter(entry => entry.type === 'user' || entry.type === 'assistant').length;
    const tools = display.filter(entry => entry.type === 'tool').length;
    const tokens = Number(this.agent.usage?.total_tokens) || 0;
    this.statsEl.textContent = `${messages} 条消息 · ${tools} 次工具${tokens ? ` · ${formatTokenCount(tokens)} tokens` : ''}`;
  }

  scrollToBottom() {
    if (!this.messages) return;
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  renderDisplay() {
    if (!this.messages) return;
    const display = this.agent.getDisplay();
    this.messages.innerHTML = '';
    if (!display.length) {
      this.renderEmpty();
      return;
    }
    for (const entry of display) {
      if (entry.type === 'user') {
        this.messages.appendChild(this.createUserBubble(entry));
      } else if (entry.type === 'assistant') {
        this.messages.appendChild(this.createAssistantBubble(entry));
      } else if (entry.type === 'tool') {
        this.messages.appendChild(this.createToolCard(entry));
      } else if (entry.type === 'error') {
        this.messages.appendChild(this.createErrorBubble(entry.content));
      }
    }
    this.refreshStats();
    this.scrollToBottom();
  }

  renderEmpty() {
    if (!this.messages) return;
    this.messages.innerHTML = `
      <div class="ob-empty">
        <div class="ob-empty-icon">${iconSvg(SPARK_ICON)}</div>
        <h3>让 AI 帮你做作品</h3>
        <p>描述你想要的角色、玩法或效果。我会读取当前项目，直接拼装积木、创建变量和角色。</p>
        <div class="ob-suggestions">
          ${SUGGESTIONS.map(text => `<button class="ob-suggestion" data-prompt="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}
        </div>
      </div>
    `;
    this.messages.querySelectorAll('[data-prompt]').forEach(button => {
      button.addEventListener('click', () => {
        this.input.value = button.dataset.prompt || '';
        this.resizeInput();
        this.updateSendState();
        this.input.focus();
      });
    });
  }

  createUserBubble(entry) {
    const row = document.createElement('div');
    row.className = 'ob-user-row';

    const actions = document.createElement('div');
    actions.className = 'ob-user-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ob-edit-btn';
    edit.title = '撤回并编辑';
    edit.setAttribute('aria-label', '撤回并编辑这条消息');
    edit.innerHTML = iconSvg(EDIT_ICON);
    edit.addEventListener('click', event => {
      event.stopPropagation();
      this.retractMessage(entry);
    });
    actions.appendChild(edit);

    const bubble = document.createElement('div');
    bubble.className = 'ob-msg ob-msg-user';
    bubble.textContent = entry.content || '';

    row.append(actions, bubble);
    return row;
  }

  async retractMessage(entry) {
    if (this.agent.running) {
      this.toast('请先停止当前 AI 任务。', 'info');
      return;
    }
    const approved = await this.confirm({
      title: '撤回并编辑',
      message: '将删除这条消息及其后的所有对话，并尝试把项目恢复到发送这条消息之前的状态。'
    });
    if (!approved) return;
    try {
      await this.agent.retractFrom(entry.id);
    } catch (error) {
      this.toast(error && error.message ? error.message : String(error), 'error');
    }
  }

  createErrorBubble(text) {
    const el = document.createElement('div');
    el.className = 'ob-msg ob-msg-error';
    el.textContent = text || '未知错误';
    return el;
  }

  createAssistantBubble(entry) {
    const el = document.createElement('div');
    el.className = 'ob-msg ob-msg-assistant';
    el.dataset.id = entry.id;
    if (entry.streaming) el.classList.add('ob-streaming');

    const reasoning = document.createElement('details');
    reasoning.className = 'ob-reasoning';
    const summary = document.createElement('summary');
    summary.textContent = '思考过程';
    const reasoningText = document.createElement('pre');
    reasoning.append(summary, reasoningText);
    reasoning.hidden = !entry.reasoning;
    reasoning.open = Boolean(entry.streaming && entry.reasoning && !entry.content);

    const content = document.createElement('div');
    content.className = 'ob-content';

    const avatar = document.createElement('div');
    avatar.className = 'ob-msg-avatar';
    avatar.innerHTML = iconSvg(SPARK_ICON);
    const body = document.createElement('div');
    body.className = 'ob-msg-body';
    body.append(reasoning, content);
    el.append(avatar, body);
    this.updateAssistantBubble(el, entry);
    return el;
  }

  updateAssistantBubble(el, entry) {
    if (!el || !entry) return;
    const reasoning = el.querySelector('.ob-reasoning');
    const reasoningText = el.querySelector('.ob-reasoning pre');
    const content = el.querySelector('.ob-content');
    if (reasoning && reasoningText) {
      reasoningText.textContent = entry.reasoning || '';
      reasoning.hidden = !entry.reasoning;
      if (!entry.streaming) reasoning.open = false;
    }
    if (content) {
      content.innerHTML = entry.content
        ? renderMarkdown(entry.content)
        : entry.streaming
          ? '<span style="color:var(--ob-muted)">…</span>'
          : '';
    }
    el.classList.toggle('ob-streaming', Boolean(entry.streaming));
  }

  createToolCard(entry) {
    const card = document.createElement('div');
    card.className = 'ob-tool';
    card.dataset.toolId = entry.id;

    const head = document.createElement('div');
    head.className = 'ob-tool-head';
    const status = document.createElement('span');
    status.className = 'ob-tool-status';
    const name = document.createElement('span');
    name.className = 'ob-tool-name';
    name.textContent = `${toolLabel(entry.name)} · ${entry.name}`;
    const label = document.createElement('span');
    label.className = 'ob-tool-label';
    const chevron = document.createElement('span');
    chevron.innerHTML = iconSvg(CHEVRON_ICON);
    chevron.style.width = '14px';
    chevron.style.height = '14px';
    chevron.style.display = 'flex';
    head.append(status, name, label, chevron);

    const preview = document.createElement('div');
    preview.className = 'ob-tool-preview';
    preview.hidden = true;

    const body = document.createElement('div');
    body.className = 'ob-tool-body';
    body.hidden = true;
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
    });

    card.append(head, preview, body);
    this.updateToolCard(card, entry);
    return card;
  }

  updateToolCard(card, entry) {
    if (!card || !entry) return;
    const status = card.querySelector('.ob-tool-status');
    const label = card.querySelector('.ob-tool-label');
    const body = card.querySelector('.ob-tool-body');
    const preview = card.querySelector('.ob-tool-preview');
    if (status) {
      status.className = 'ob-tool-status';
      if (entry.status === 'running') status.classList.add('ob-running');
      else if (entry.status === 'error') status.classList.add('ob-error');
      else status.classList.add('ob-done');
    }
    if (label) {
      label.textContent = entry.status === 'running' ? '执行中…' : entry.status === 'error' ? '失败' : '完成';
    }
    if (!body) return;
    const argsText = formatValue(entry.args || {}, 3000);
    const resultText = entry.result === undefined ? '' : formatValue(entry.result, 4000);
    const errorText = entry.error ? truncate(String(entry.error), 4000) : '';
    body.innerHTML = '';
    const argsSection = document.createElement('div');
    argsSection.className = 'ob-tool-section';
    argsSection.innerHTML = '<b>参数</b>';
    const argsPre = document.createElement('div');
    argsPre.textContent = argsText || '（无）';
    argsSection.appendChild(argsPre);
    body.appendChild(argsSection);

    if (resultText) {
      const resultSection = document.createElement('div');
      resultSection.className = 'ob-tool-section';
      resultSection.innerHTML = '<b>结果</b>';
      const resultPre = document.createElement('div');
      resultPre.textContent = resultText;
      resultSection.appendChild(resultPre);
      body.appendChild(resultSection);
    }
    if (preview) {
      preview.innerHTML = '';
      const imageUrl = entry.result && typeof entry.result === 'object'
        ? entry.result.image_data_url || entry.result.screenshot?.image_data_url
        : null;
      if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
        const imageWrap = document.createElement('div');
        imageWrap.className = 'ob-tool-image-wrap';
        const image = document.createElement('img');
        image.className = 'ob-tool-image';
        image.src = imageUrl;
        image.alt = '舞台截图';
        imageWrap.appendChild(image);
        preview.appendChild(imageWrap);
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    }
    if (errorText) {
      const errorSection = document.createElement('div');
      errorSection.className = 'ob-tool-section ob-error-text';
      errorSection.innerHTML = '<b>错误</b>';
      const errorPre = document.createElement('div');
      errorPre.textContent = errorText;
      errorSection.appendChild(errorPre);
      body.appendChild(errorSection);
      body.hidden = false;
    }
  }

  renderPlan(steps) {
    if (!this.planEl) return;
    const list = Array.isArray(steps) ? steps : [];
    if (!list.length) {
      this.planEl.hidden = true;
      this.planEl.innerHTML = '';
      return;
    }
    const done = list.filter(step => step.status === 'done').length;
    this.planEl.hidden = false;
    this.planEl.innerHTML = `
      <div class="ob-plan-head"><b>任务计划</b><span>${done}/${list.length}</span></div>
      ${list
        .map(step => {
          const status = ['pending', 'in_progress', 'done'].includes(step.status) ? step.status : 'pending';
          const icon = status === 'done' ? iconSvg(CHECK_ICON) : '';
          return `<div class="ob-plan-step ob-${status}">
            <span class="ob-plan-icon">${icon}</span>
            <span>${escapeHtml(step.title || '')}</span>
          </div>`;
        })
        .join('')}
    `;
  }

  handleEvent(event) {
    if (!this.mounted) return;
    switch (event.type) {
      case 'user':
        this.removeEmpty();
        this.messages.appendChild(this.createUserBubble(event.entry));
        this.refreshStats();
        this.scrollToBottom();
        break;
      case 'assistant_start':
        this.removeEmpty();
        if (event.entry && event.entry.type === 'error') {
          this.messages.appendChild(this.createErrorBubble(event.entry.content));
        } else if (event.entry) {
          this.messages.appendChild(this.createAssistantBubble(event.entry));
        }
        this.refreshStats();
        this.scrollToBottom();
        break;
      case 'assistant_delta': {
        const entry = this.agent.getDisplay().find(item => item.id === event.id);
        const bubble = this.messages.querySelector(`.ob-msg-assistant[data-id="${event.id}"]`);
        if (entry && bubble) this.updateAssistantBubble(bubble, entry);
        this.scrollToBottom();
        break;
      }
      case 'reasoning_delta': {
        const entry = this.agent.getDisplay().find(item => item.id === event.id);
        const bubble = this.messages.querySelector(`.ob-msg-assistant[data-id="${event.id}"]`);
        if (entry && bubble) this.updateAssistantBubble(bubble, entry);
        this.scrollToBottom();
        break;
      }
      case 'assistant_end': {
        const entry = event.entry;
        const bubble = entry && this.messages.querySelector(`.ob-msg-assistant[data-id="${entry.id}"]`);
        if (entry && bubble) this.updateAssistantBubble(bubble, entry);
        this.refreshStats();
        this.scrollToBottom();
        break;
      }
      case 'tool_end': {
        const card = this.messages.querySelector(`.ob-tool[data-tool-id="${event.entry.id}"]`);
        if (card) this.updateToolCard(card, event.entry);
        this.scrollToBottom();
        this.refreshContext();
        break;
      }
      case 'tool_start':
        this.removeEmpty();
        this.messages.appendChild(this.createToolCard(event.entry));
        this.refreshStats();
        this.scrollToBottom();
        break;
      case 'plan':
        this.renderPlan(event.steps);
        break;
      case 'status':
        this.setStatus(event.text || '', this.running);
        break;
      case 'error':
        this.toast(event.message || '发生错误', 'error');
        this.setStatus('出错', false);
        break;
      case 'usage':
        this.refreshStats();
        break;
      case 'running':
        this.setBusy(event.value);
        if (event.value) this.setStatus('AI 正在工作…', true);
        break;
      case 'done':
        this.setStatus('就绪', false);
        this.refreshContext();
        this.refreshStats();
        break;
      case 'clear':
        this.renderDisplay();
        this.renderPlan([]);
        this.refreshStats();
        break;
      case 'retract':
        this.renderDisplay();
        this.renderPlan(this.agent.getPlan());
        this.input.value = event.text || '';
        this.resizeInput();
        this.updateSendState();
        this.refreshContext();
        this.input.focus();
        if (event.rollbackError) {
          this.toast(event.rollbackError, 'error');
        } else if (event.restored > 0) {
          this.toast('已撤回，并恢复了项目状态。可以编辑后重新发送。', 'success');
        } else {
          this.toast('已撤回，可以编辑后重新发送。', 'success');
        }
        break;
      default:
        break;
    }
  }

  removeEmpty() {
    const empty = this.messages && this.messages.querySelector('.ob-empty');
    if (empty) empty.remove();
  }

  async clearChat() {
    if (this.agent.running) {
      this.toast('请先停止当前 AI 任务。', 'info');
      return;
    }
    const approved = await this.confirm({
      title: '清空对话',
      message: '这会删除本地保存的对话记录和任务计划，但不会撤销已经应用到项目中的积木修改。'
    });
    if (!approved) return;
    this.agent.clear();
  }

  async redo() {
    if (this.agent.running) {
      this.toast('请先停止当前 AI 任务。', 'info');
      return;
    }
    if (redoCount() === 0) {
      this.toast('没有可重做的 AI 修改。', 'info');
      return;
    }
    try {
      await redoLastSnapshot();
      this.toast('已重做最近的 AI 修改。', 'success');
      this.refreshContext();
    } catch (error) {
      this.toast(error && error.message ? error.message : String(error), 'error');
    }
  }

  async undo() {
    if (this.agent.running) {
      this.toast('请先停止当前 AI 任务。', 'info');
      return;
    }
    if (snapshotCount() === 0) {
      this.toast('没有可撤销的 AI 修改。', 'info');
      return;
    }
    const approved = await this.confirm({
      title: '撤销 AI 修改',
      message: '将把项目恢复到最近一次 AI 修改之前的快照。未保存的当前改动也会被覆盖。'
    });
    if (!approved) return;
    try {
      await restoreLastSnapshot();
      this.toast('已恢复到 AI 修改前的状态。', 'success');
      this.refreshContext();
    } catch (error) {
      this.toast(error && error.message ? error.message : String(error), 'error');
    }
  }

  openSettings() {
    if (!this.settingsOverlay) return;
    this.open();
    this.fillSettingsForm(this.settings);
    this.settingsStatus.textContent = '';
    this.settingsStatus.style.color = '';
    this.settingsOverlay.hidden = false;
  }

  closeSettings() {
    if (this.settingsOverlay) this.settingsOverlay.hidden = true;
  }

  fillSettingsForm(settings) {
    const $ = selector => this.shadow.querySelector(selector);
    $('#ob-provider').value = settings.provider || 'openai';
    $('#ob-base-url').value = settings.baseUrl || '';
    $('#ob-api-key').value = settings.apiKey || '';
    $('#ob-model').value = settings.model || '';
    $('#ob-temperature').value = settings.temperature ?? 0.3;
    $('#ob-max-steps').value = settings.maxSteps ?? 12;
    $('#ob-max-retries').value = settings.maxRetries ?? 3;
    $('#ob-stream').checked = settings.stream !== false;
    $('#ob-auto-context').checked = settings.autoContext !== false;
    $('#ob-confirm-destructive').checked = settings.confirmDestructive !== false;
    $('#ob-remember-key').checked = settings.rememberKey !== false;
    $('#ob-extra-prompt').value = settings.systemPromptExtra || '';
  }

  readSettingsForm() {
    const $ = selector => this.shadow.querySelector(selector);
    return {
      ...this.settings,
      provider: $('#ob-provider').value,
      baseUrl: $('#ob-base-url').value.trim(),
      apiKey: $('#ob-api-key').value.trim(),
      model: $('#ob-model').value.trim(),
      temperature: clampNumber($('#ob-temperature').value, 0, 2, 0.3),
      maxSteps: clampNumber($('#ob-max-steps').value, 1, 30, 12),
      maxRetries: clampNumber($('#ob-max-retries').value, 0, 8, 3),
      stream: $('#ob-stream').checked,
      autoContext: $('#ob-auto-context').checked,
      confirmDestructive: $('#ob-confirm-destructive').checked,
      rememberKey: $('#ob-remember-key').checked,
      systemPromptExtra: $('#ob-extra-prompt').value
    };
  }

  applyProviderPreset(provider) {
    const preset = PROVIDER_PRESETS[provider];
    if (!preset) return;
    if (provider === 'custom') return;
    const $ = selector => this.shadow.querySelector(selector);
    $('#ob-base-url').value = preset.baseUrl || '';
    $('#ob-model').value = preset.model || '';
    if (provider === 'mock') {
      this.settingsStatus.textContent = '演示模式不会调用真实接口。';
    }
  }

  async runConnectionTest() {
    const settings = this.readSettingsForm();
    if (settings.provider !== 'mock' && (!settings.baseUrl || !settings.model)) {
      this.settingsStatus.textContent = '请先填写 Base URL 和模型。';
      return;
    }
    const button = this.shadow.querySelector('#ob-test');
    button.disabled = true;
    this.settingsStatus.textContent = '正在测试连接…';
    try {
      const result = await testConnection(settings);
      this.settingsStatus.textContent = `连接成功：${truncate(result.message, 120)}`;
      this.settingsStatus.style.color = 'var(--ob-success)';
    } catch (error) {
      this.settingsStatus.textContent = truncate(error && error.message ? error.message : String(error), 240);
      this.settingsStatus.style.color = 'var(--ob-danger)';
    } finally {
      button.disabled = false;
    }
  }

  saveSettings() {
    const settings = this.readSettingsForm();
    if (settings.provider !== 'mock' && (!settings.baseUrl || !settings.model)) {
      this.settingsStatus.textContent = '请先填写 Base URL 和模型。';
      this.settingsStatus.style.color = 'var(--ob-danger)';
      return;
    }
    this.settings = settings;
    this.onSettingsChange(settings);
    this.updateSubtitle();
    this.refreshContext();
    this.closeSettings();
    this.toast('设置已保存。', 'success');
  }

  confirm(options = {}) {
    this.open();
    if (this.confirmResolve) {
      this.confirmResolve(false);
      this.confirmResolve = null;
    }
    this.confirmTitle.textContent = options.title || '确认操作';
    this.confirmMessage.textContent = options.message || '';
    this.confirmOverlay.hidden = false;
    return new Promise(resolve => {
      this.confirmResolve = resolve;
    });
  }

  finishConfirm(value) {
    if (this.confirmOverlay) this.confirmOverlay.hidden = true;
    if (this.confirmResolve) {
      const resolve = this.confirmResolve;
      this.confirmResolve = null;
      resolve(Boolean(value));
    }
  }

  toast(message, type = 'info') {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.className = `ob-toast${type === 'error' ? ' ob-toast-error' : type === 'success' ? ' ob-toast-success' : ''}`;
    this.toastEl.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.hidden = true;
    }, 3800);
  }
}
