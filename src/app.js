import { Agent } from './agent/agent.js';
import { Panel } from './ui/panel.js';
import { loadSettings, saveSettings } from './util/storage.js';
import { restoreLastSnapshot, snapshotCount, summarizeProject } from './vm/api.js';

export class App {
  constructor(Scratch) {
    this.Scratch = Scratch;
    this.settings = loadSettings();
    this.booted = false;
    this.agent = new Agent({
      settings: this.settings,
      getContext: () => summarizeProject(),
      onEvent: () => {}
    });
    this.panel = new Panel({
      agent: this.agent,
      settings: this.settings,
      onSettingsChange: settings => {
        this.settings = settings;
        saveSettings(settings);
        this.agent.setSettings(settings);
      },
      getContextLabel: () => {
        const vm = Scratch.vm;
        return vm && vm.editingTarget ? vm.editingTarget.getName() : 'Stage';
      }
    });
  }

  boot() {
    if (this.booted) return;
    this.booted = true;
    const mount = () => {
      try {
        this.panel.mount();
      } catch (error) {
        console.error('[OpenBlocks] 面板加载失败', error);
      }
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
    try {
      this.Scratch.openBlocks = this;
      this.Scratch.openBlocksAI = this;
    } catch {
      // ignore
    }
  }

  openPanel() {
    this.panel.mount();
    this.panel.open();
  }

  openSettings() {
    this.panel.mount();
    this.panel.openSettings();
  }

  async ask(prompt) {
    return this.agent.ask(prompt);
  }

  getModel() {
    return this.settings.model || '';
  }

  isBusy() {
    return this.agent.running;
  }

  async undo() {
    if (snapshotCount() === 0) return '没有可撤销的 AI 修改。';
    await restoreLastSnapshot();
    return '已撤销最近的 AI 修改。';
  }
}
