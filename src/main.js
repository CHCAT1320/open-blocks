import { App } from './app.js';
import { iconURI } from './icon.js';

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error(
      'OpenBlocks 必须以「不启用沙箱」方式加载。请通过 http://localhost:8000/ 提供扩展，或在加载文件时勾选“在不使用沙箱的情况下运行扩展”。'
    );
  }

  if (Scratch.openBlocks || Scratch.openBlocksAI) {
    try {
      (Scratch.openBlocks || Scratch.openBlocksAI).openPanel();
    } catch {
      // ignore
    }
    return;
  }

  const app = new App(Scratch);

  class OpenBlocksExtension {
    getInfo() {
      return {
        id: 'openblocksai',
        name: 'OpenBlocks',
        color1: '#7c6cff',
        color2: '#6b5ce7',
        color3: '#4b3fc4',
        menuIconURI: iconURI,
        blockIconURI: iconURI,
        blocks: [
          {
            opcode: 'openPanel',
            blockType: Scratch.BlockType.COMMAND,
            text: '打开 AI 助手面板'
          },
          {
            opcode: 'openSettings',
            blockType: Scratch.BlockType.COMMAND,
            text: '打开 AI 设置'
          },
          '---',
          {
            opcode: 'ask',
            blockType: Scratch.BlockType.REPORTER,
            text: '问 AI [PROMPT]',
            disableMonitor: true,
            arguments: {
              PROMPT: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '用一句话介绍这个项目'
              }
            }
          },
          {
            opcode: 'build',
            blockType: Scratch.BlockType.COMMAND,
            text: '让 AI 构建 [PROMPT]',
            arguments: {
              PROMPT: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '做一个可以移动的角色'
              }
            }
          },
          {
            opcode: 'undo',
            blockType: Scratch.BlockType.COMMAND,
            text: '撤销最近的 AI 修改'
          },
          '---',
          {
            opcode: 'model',
            blockType: Scratch.BlockType.REPORTER,
            text: '当前 AI 模型',
            disableMonitor: true
          },
          {
            opcode: 'busy',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'AI 正在工作？'
          }
        ]
      };
    }

    openPanel() {
      app.openPanel();
    }

    openSettings() {
      app.openSettings();
    }

    async ask(args) {
      try {
        const text = await app.ask(args.PROMPT);
        return text || '（AI 没有返回文本）';
      } catch (error) {
        return `AI 错误：${error && error.message ? error.message : String(error)}`;
      }
    }

    async build(args) {
      try {
        await app.ask(args.PROMPT);
      } catch (error) {
        console.error('[OpenBlocks]', error);
      }
    }

    async undo() {
      try {
        await app.undo();
      } catch (error) {
        console.error('[OpenBlocks]', error);
      }
    }

    model() {
      return app.getModel();
    }

    busy() {
      return app.isBusy();
    }
  }

  Scratch.extensions.register(new OpenBlocksExtension());
  app.boot();
})(Scratch);
