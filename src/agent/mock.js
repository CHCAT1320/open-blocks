function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function streamText(text, onDelta, signal) {
  if (!text) return;
  const chunkSize = 10;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    onDelta?.(text.slice(i, i + chunkSize));
    await sleep(14, signal);
  }
}

function toolCall(name, args, index = 0) {
  return {
    id: `mock_${Date.now()}_${index}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args || {})
    }
  };
}

function findLastTool(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'tool') continue;
    let name = message.name || '';
    if (!name && message.tool_call_id) {
      for (let j = i - 1; j >= 0; j--) {
        const assistant = messages[j];
        if (assistant.role === 'assistant' && Array.isArray(assistant.tool_calls)) {
          const call = assistant.tool_calls.find(item => item.id === message.tool_call_id);
          if (call) {
            name = call.function?.name || '';
            break;
          }
        }
      }
    }
    let result = null;
    try {
      result = JSON.parse(message.content);
    } catch {
      result = { raw: message.content };
    }
    return { name, result, content: message.content };
  }
  return null;
}

function findToolResult(messages, name) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'tool') continue;
    let callName = message.name || '';
    if (!callName && message.tool_call_id) {
      for (let j = i - 1; j >= 0; j--) {
        const assistant = messages[j];
        if (assistant.role === 'assistant' && Array.isArray(assistant.tool_calls)) {
          const call = assistant.tool_calls.find(item => item.id === message.tool_call_id);
          if (call) {
            callName = call.function?.name || '';
            break;
          }
        }
      }
    }
    if (callName !== name) continue;
    try {
      return JSON.parse(message.content);
    } catch {
      return null;
    }
  }
  return null;
}

function lastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return String(messages[i].content || '');
  }
  return '';
}

function demoScripts() {
  return [
    {
      opcode: 'event_whenflagclicked',
      next: [
        {
          opcode: 'looks_switchcostumeto',
          inputs: { COSTUME: 'costume1' }
        },
        {
          opcode: 'looks_sayforsecs',
          inputs: { MESSAGE: '你好！我是 OpenBlocks。', SECS: 2 }
        },
        {
          opcode: 'control_repeat',
          inputs: { TIMES: 10 },
          substacks: {
            SUBSTACK: [
              { opcode: 'motion_movesteps', inputs: { STEPS: 12 } },
              { opcode: 'motion_turnright', inputs: { DEGREES: 18 } },
              { opcode: 'motion_ifonedgebounce' }
            ]
          }
        },
        {
          opcode: 'looks_say',
          inputs: { MESSAGE: '按空格键加分！' }
        }
      ]
    },
    {
      opcode: 'event_whenkeypressed',
      fields: { KEY_OPTION: 'space' },
      next: [
        {
          opcode: 'data_changevariableby',
          fields: { VARIABLE: 'score' },
          inputs: { VALUE: 1 }
        },
        {
          opcode: 'looks_say',
          inputs: {
            MESSAGE: {
              opcode: 'operator_join',
              inputs: {
                STRING1: '得分: ',
                STRING2: { variable: 'score' }
              }
            }
          }
        }
      ]
    }
  ];
}

function demoTarget(messages) {
  const created = findToolResult(messages, 'create_sprite');
  if (created && created.name) return created.name;
  const project = findToolResult(messages, 'get_project');
  if (project && Array.isArray(project.sprites) && project.sprites.length) {
    return project.sprites[0].name;
  }
  return 'Stage';
}

function planSteps(phase = 'build') {
  const step2 = phase === 'build' ? 'in_progress' : 'done';
  const step3 = phase === 'done' ? 'done' : phase === 'run' ? 'in_progress' : 'pending';
  return [
    { title: '读取当前项目结构', status: 'done' },
    { title: '创建演示角色与脚本', status: step2 },
    { title: '运行并检查结果', status: step3 }
  ];
}

export async function mockChat({ messages, signal, onDelta, onReasoning }) {
  if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const lastTool = findLastTool(messages);
  const user = lastUserMessage(messages);

  if (!lastTool) {
    if (/demo|示例|演示|测试|hello|你好|做一个|build|game|游戏|脚本/i.test(user)) {
      await onReasoning?.('我先读取项目，确认有哪些角色和变量。');
      await streamText('我先查看当前项目结构。', onDelta, signal);
      return {
        content: '我先查看当前项目结构。',
        reasoning: '我先读取项目，确认有哪些角色和变量。',
        toolCalls: [toolCall('get_project', { detail: 'summary' })],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    const text =
      '当前是「本地演示模式」，不会调用真实 AI。\n\n' +
      '发送包含「示例」的消息，我会演示如何读取项目、自动创建角色、拼装积木并运行。\n\n' +
      '要使用真正的 AI，请点击右上角设置，选择 OpenAI / DeepSeek / OpenRouter / Ollama，并填写 API Key。';
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: '',
      toolCalls: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  if (lastTool.name === 'get_project') {
    const project = lastTool.result || {};
    const hasSprite = Array.isArray(project.sprites) && project.sprites.length > 0;
    if (!hasSprite) {
      const text = '项目里还没有角色，我先创建一个演示角色。';
      await onReasoning?.('没有可用角色，需要先创建。');
      await streamText(text, onDelta, signal);
      return {
        content: text,
        reasoning: '没有可用角色，需要先创建。',
        toolCalls: [toolCall('create_sprite', { name: 'AI Demo', x: 0, y: 0 })],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    const text = '项目结构正常，我来规划并写入积木。';
    await onReasoning?.('已有角色，直接更新计划并构建脚本。');
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: '已有角色，直接更新计划并构建脚本。',
      toolCalls: [toolCall('update_plan', { steps: planSteps('build') })],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  if (lastTool.name === 'create_sprite') {
    const text = '角色已创建，现在规划积木。';
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: '',
      toolCalls: [toolCall('update_plan', { steps: planSteps('build') })],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  if (lastTool.name === 'update_plan') {
    if (findToolResult(messages, 'run_project')) {
      const text =
        '演示完成。我创建了：\n\n' +
        '1. 绿旗脚本：切换造型 → 说话 → 重复移动/转向 → 边缘反弹 → 提示。\n' +
        '2. 空格键脚本：把全局变量 `score` 加 1，并说出得分。\n\n' +
        '你可以在舞台里按空格键测试，或继续让我修改。';
      await onReasoning?.('演示流程结束，总结改动。');
      await streamText(text, onDelta, signal);
      return {
        content: text,
        reasoning: '演示流程结束，总结改动。',
        toolCalls: [],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    if (findToolResult(messages, 'add_script')) {
      const text = '积木已经拼好了，我运行一下看看效果。';
      await streamText(text, onDelta, signal);
      return {
        content: text,
        reasoning: '',
        toolCalls: [toolCall('run_project', {})],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    const target = demoTarget(messages);
    const text = `我要给「${target}」添加两个脚本：绿旗动画和空格键计分。`;
    await onReasoning?.('使用 add_script 的 DSL，包含控制、运动、外观、变量和菜单输入。');
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: '使用 add_script 的 DSL，包含控制、运动、外观、变量和菜单输入。',
      toolCalls: [
        toolCall('add_script', {
          target,
          scripts: demoScripts(),
          auto_create_variables: true
        })
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  if (lastTool.name === 'add_script') {
    const text = '积木已经拼好了，我更新计划并运行看看效果。';
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: '',
      toolCalls: [toolCall('update_plan', { steps: planSteps('run') })],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  if (lastTool.name === 'run_project') {
    const text = '运行完成，更新任务计划。';
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: '',
      toolCalls: [toolCall('update_plan', { steps: planSteps('done') })],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  const text = '演示完成。你可以继续描述想做的功能，或打开设置接入真实 AI。';
  await streamText(text, onDelta, signal);
  return {
    content: text,
    reasoning: '',
    toolCalls: [],
    usage: { prompt_tokens: 0, completion_tokens: 0 }
  };
}
