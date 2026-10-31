import { getEditingTarget, getRuntime, getStage, getTargetByName, getTargets, getVM } from './api.js';

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

function summarizeValue(value) {
  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map(item => String(item).slice(0, 120));
    return items.length < value.length ? [...items, `… (${value.length} items)`] : items;
  }
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return value;
}

function listVars(target) {
  return {
    variables: Object.values(target.variables || {})
      .filter(variable => variable.type === '')
      .map(variable => ({ name: variable.name, value: summarizeValue(variable.value), id: variable.id })),
    lists: Object.values(target.variables || {})
      .filter(variable => variable.type === 'list')
      .map(variable => ({
        name: variable.name,
        value: summarizeValue(variable.value),
        length: Array.isArray(variable.value) ? variable.value.length : 0,
        id: variable.id
      })),
    broadcasts: Object.values(target.variables || {})
      .filter(variable => variable.type === 'broadcast_msg')
      .map(variable => ({ name: variable.name, value: variable.value, id: variable.id }))
  };
}

function targetState(target) {
  let costumeName = null;
  try {
    costumeName = target.getCostumes()[target.currentCostume]?.name || null;
  } catch {
    // ignore
  }
  const cloneCount = target.isSprite && target.isSprite()
    ? Math.max(0, (target.sprite?.clones?.length || 1) - 1)
    : 0;
  return {
    name: target.getName(),
    isStage: Boolean(target.isStage),
    x: Math.round((target.x || 0) * 100) / 100,
    y: Math.round((target.y || 0) * 100) / 100,
    direction: Math.round((target.direction || 0) * 100) / 100,
    size: Math.round((target.size || 100) * 100) / 100,
    visible: target.visible !== false,
    draggable: Boolean(target.draggable),
    rotationStyle: target.rotationStyle || 'all around',
    currentCostume: target.currentCostume || 0,
    costumeName,
    cloneCount,
    scriptCount: (target.blocks?._scripts || []).length,
    blockCount: Object.keys(target.blocks?._blocks || {}).length,
    ...listVars(target)
  };
}

function readTimer(runtime) {
  try {
    const value = runtime.ioDevices?.clock?.projectTimer?.();
    if (Number.isFinite(value)) return value;
  } catch {
    // ignore
  }
  return 0;
}

function readMonitors(runtime) {
  const result = [];
  try {
    const map = runtime._monitorState?.map;
    if (map && typeof map.forEach === 'function') {
      map.forEach(monitor => {
        result.push({
          id: monitor.id,
          opcode: monitor.opcode,
          value: summarizeValue(monitor.value),
          visible: monitor.visible !== false,
          x: monitor.x,
          y: monitor.y,
          width: monitor.width,
          height: monitor.height,
          spriteName: monitor.spriteName || null,
          params: monitor.params || null
        });
      });
    }
  } catch {
    // ignore
  }
  return result;
}

export function getRuntimeState(targetName) {
  const vm = getVM();
  const runtime = getRuntime();
  const stage = getStage();
  let sprites = getTargets().filter(target => target.isSprite && target.isSprite());
  if (targetName) {
    const target = getTargetByName(targetName, false);
    sprites = target && target.isSprite && target.isSprite() ? [target] : [];
  }
  return {
    editingTarget: vm.editingTarget ? vm.editingTarget.getName() : null,
    running: (runtime.threads?.length || 0) > 0,
    threadCount: runtime.threads?.length || 0,
    fps: Number.isFinite(runtime.fps)
      ? Math.round(runtime.fps * 10) / 10
      : runtime.currentStepTime
        ? Math.round((1000 / runtime.currentStepTime) * 10) / 10
        : null,
    cloneCounter: runtime._cloneCounter ?? null,
    timer: Math.round(readTimer(runtime) * 1000) / 1000,
    turboMode: Boolean(runtime.turboMode),
    interpolationEnabled: Boolean(runtime.interpolationEnabled),
    stage: targetState(stage),
    sprites: sprites.map(targetState),
    monitors: readMonitors(runtime).slice(0, 50),
    threads: (runtime.threads || []).slice(0, 20).map(thread => ({
      target: thread.target?.getName?.() || null,
      topBlock: thread.topBlock || null,
      status: thread.status ?? null
    }))
  };
}

function normalizeForCompare(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (value === undefined || value === null) return '';
  return String(value);
}

function compare(actual, op, expected) {
  if (op === 'exists') return actual !== undefined && actual !== null;
  if (op === 'truthy') return Boolean(actual);
  if (op === 'contains') return String(actual ?? '').includes(String(expected ?? ''));

  const actualValue = normalizeForCompare(actual);
  const expectedValue = normalizeForCompare(expected);
  const numeric = typeof expected === 'number' || (typeof actual === 'number' && typeof expected !== 'string');
  const left = numeric ? Number(actual) : actualValue;
  const right = numeric ? Number(expected) : expectedValue;
  if (numeric && (!Number.isFinite(left) || !Number.isFinite(right))) return false;

  switch (op) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    default: return false;
  }
}

function variableType(type) {
  if (type === 'list') return 'list';
  if (type === 'broadcast') return 'broadcast_msg';
  return '';
}

function cloneCount(target) {
  return target.isSprite && target.isSprite()
    ? Math.max(0, (target.sprite?.clones?.length || 1) - 1)
    : 0;
}

export function evaluateCondition(condition) {
  const type = condition.type || 'variable';
  const runtime = getRuntime();
  if (type === 'threads') {
    return {
      actual: runtime.threads?.length || 0,
      expected: condition.value,
      ok: compare(runtime.threads?.length || 0, condition.op || '==', condition.value)
    };
  }
  if (type === 'timer') {
    const actual = readTimer(runtime);
    return { actual, expected: condition.value, ok: compare(actual, condition.op || '>=', condition.value) };
  }
  if (type === 'sprite' || type === 'clone') {
    const target = condition.target ? getTargetByName(condition.target, false) : getEditingTarget();
    if (!target) return { actual: undefined, expected: condition.value, ok: false, error: '找不到角色。' };
    let actual;
    if (type === 'clone') {
      actual = cloneCount(target);
    } else {
      switch (condition.property || 'x') {
        case 'x': actual = target.x; break;
        case 'y': actual = target.y; break;
        case 'direction': actual = target.direction; break;
        case 'size': actual = target.size; break;
        case 'visible': actual = target.visible !== false; break;
        case 'draggable': actual = Boolean(target.draggable); break;
        case 'costume': actual = target.getCostumes()[target.currentCostume]?.name; break;
        case 'cloneCount': actual = cloneCount(target); break;
        default: actual = undefined;
      }
    }
    return { actual, expected: condition.value, ok: compare(actual, condition.op || '==', condition.value) };
  }

  const target = condition.target ? getTargetByName(condition.target, true) : getEditingTarget() || getStage();
  if (!target) return { actual: undefined, expected: condition.value, ok: false, error: '找不到目标。' };
  const variable = target.lookupVariableByNameAndType(condition.name, variableType(type));
  if (!variable) return { actual: undefined, expected: condition.value, ok: false, error: `找不到变量 ${condition.name}` };
  let actual = variable.value;
  if (type === 'list') {
    if (condition.property === 'length') actual = Array.isArray(variable.value) ? variable.value.length : 0;
    else if (condition.property === 'contains') {
      const found = Array.isArray(variable.value) && variable.value.map(String).includes(String(condition.value));
      return { actual: found, expected: true, ok: found };
    }
  }
  return { actual, expected: condition.value, ok: compare(actual, condition.op || '==', condition.value) };
}

export async function waitUntil({ conditions, timeout = 5, interval = 0.1, signal } = {}) {
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.length) throw new Error('wait_until 需要至少一个条件。');
  const timeoutMs = Math.max(0, Math.min(60, Number(timeout) || 5)) * 1000;
  const intervalMs = Math.max(50, Math.min(2000, (Number(interval) || 0.1) * 1000));
  const start = Date.now();
  let lastChecks = [];
  while (true) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    lastChecks = list.map(evaluateCondition);
    if (lastChecks.every(check => check.ok)) {
      return {
        ok: true,
        elapsed: Math.round((Date.now() - start) / 10) / 100,
        checks: lastChecks,
        state: getRuntimeState()
      };
    }
    if (Date.now() - start >= timeoutMs) {
      return {
        ok: false,
        timedOut: true,
        elapsed: Math.round((Date.now() - start) / 10) / 100,
        checks: lastChecks,
        state: getRuntimeState()
      };
    }
    await sleep(intervalMs, signal);
  }
}

export async function waitSeconds(seconds, signal) {
  const ms = Math.max(0, Math.min(60, Number(seconds) || 0)) * 1000;
  const start = Date.now();
  await sleep(ms, signal);
  return { waited: Math.round((Date.now() - start) / 10) / 100, state: getRuntimeState() };
}

export async function captureStage() {
  const vm = getVM();
  const runtime = getRuntime();
  const renderer = runtime.renderer || globalThis.Scratch?.renderer;
  if (!renderer || typeof renderer.requestSnapshot !== 'function') {
    throw new Error('当前渲染器不支持截图。');
  }
  const dataUrl = await new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('舞台截图超时。'));
    }, 4000);
    try {
      renderer.requestSnapshot(data => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (typeof data === 'string') resolve(data);
        else if (data && typeof data.toDataURL === 'function') resolve(data.toDataURL('image/png'));
        else reject(new Error('截图格式不受支持。'));
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
  return {
    image_data_url: dataUrl,
    width: runtime.stageWidth || 480,
    height: runtime.stageHeight || 360,
    timestamp: Date.now()
  };
}
