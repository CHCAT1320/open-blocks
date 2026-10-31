import { uid } from '../util/id.js';
import { BLOCK_BY_OPCODE } from './catalog.js';
import { focusTarget, getStage, getTargetByName, getVM, requireTarget } from './api.js';

const MENU_SHADOWS = {
  'looks_switchcostumeto:COSTUME': { opcode: 'looks_costume', field: 'COSTUME' },
  'looks_switchbackdropto:BACKDROP': { opcode: 'looks_backdrops', field: 'BACKDROP' },
  'looks_switchbackdroptoandwait:BACKDROP': { opcode: 'looks_backdrops', field: 'BACKDROP' },
  'sound_play:SOUND_MENU': { opcode: 'sound_sounds_menu', field: 'SOUND_MENU' },
  'sound_playuntildone:SOUND_MENU': { opcode: 'sound_sounds_menu', field: 'SOUND_MENU' },
  'motion_goto:TO': { opcode: 'motion_goto_menu', field: 'TO' },
  'motion_glideto:TO': { opcode: 'motion_glideto_menu', field: 'TO' },
  'motion_pointtowards:TOWARDS': { opcode: 'motion_pointtowards_menu', field: 'TOWARDS' },
  'sensing_touchingobject:TOUCHINGOBJECTMENU': { opcode: 'sensing_touchingobjectmenu', field: 'TOUCHINGOBJECTMENU' },
  'sensing_distanceto:DISTANCETOMENU': { opcode: 'sensing_distancetomenu', field: 'DISTANCETOMENU' },
  'sensing_keypressed:KEY_OPTION': { opcode: 'sensing_keyoptions', field: 'KEY_OPTION' },
  'sensing_of:OBJECT': { opcode: 'sensing_of_object_menu', field: 'OBJECT' },
  'control_create_clone_of:CLONE_OPTION': { opcode: 'control_create_clone_of_menu', field: 'CLONE_OPTION' },
  'event_broadcast:BROADCAST_INPUT': { opcode: 'event_broadcast_menu', field: 'BROADCAST_OPTION', broadcast: true },
  'event_broadcastandwait:BROADCAST_INPUT': { opcode: 'event_broadcast_menu', field: 'BROADCAST_OPTION', broadcast: true }
};

const MENU_BY_INPUT = {
  COSTUME: { opcode: 'looks_costume', field: 'COSTUME' },
  BACKDROP: { opcode: 'looks_backdrops', field: 'BACKDROP' },
  SOUND_MENU: { opcode: 'sound_sounds_menu', field: 'SOUND_MENU' },
  TOWARDS: { opcode: 'motion_pointtowards_menu', field: 'TOWARDS' },
  TOUCHINGOBJECTMENU: { opcode: 'sensing_touchingobjectmenu', field: 'TOUCHINGOBJECTMENU' },
  DISTANCETOMENU: { opcode: 'sensing_distancetomenu', field: 'DISTANCETOMENU' },
  KEY_OPTION: { opcode: 'sensing_keyoptions', field: 'KEY_OPTION' },
  OBJECT: { opcode: 'sensing_of_object_menu', field: 'OBJECT' },
  CLONE_OPTION: { opcode: 'control_create_clone_of_menu', field: 'CLONE_OPTION' },
  BROADCAST_INPUT: { opcode: 'event_broadcast_menu', field: 'BROADCAST_OPTION', broadcast: true }
};

const VARIABLE_FIELDS = new Set(['VARIABLE', 'LIST', 'BROADCAST_OPTION']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBlockLike(value) {
  return (
    isObject(value) &&
    (typeof value.opcode === 'string' ||
      typeof value.variable === 'string' ||
      typeof value.list === 'string' ||
      typeof value.broadcast === 'string' ||
      typeof value.color === 'string' ||
      typeof value.menu === 'string' ||
      isObject(value.block) ||
      isObject(value.raw))
  );
}

function blockInputType(opcode, inputName) {
  const definition = BLOCK_BY_OPCODE.get(opcode);
  return definition?.inputs?.[inputName] || 'any';
}

function menuInfoFor(opcode, inputName) {
  return (
    MENU_SHADOWS[`${opcode}:${inputName}`] ||
    MENU_BY_INPUT[inputName] ||
    null
  );
}

function variableTypeName(type) {
  if (type === 'list') return '列表';
  if (type === 'broadcast_msg') return '广播';
  return '变量';
}

function findVariable(target, name, type, scope) {
  if (scope === 'local' && target.isSprite && target.isSprite()) {
    return Object.values(target.variables || {}).find(variable => variable.name === name && variable.type === type) || null;
  }
  return target.lookupVariableByNameAndType(name, type) || null;
}

function resolveVariable(target, name, type, scope, state) {
  const wantedName = String(name ?? '').trim();
  if (!wantedName) throw new Error('变量名不能为空。');
  const found = findVariable(target, wantedName, type, scope);
  if (found) return found;
  if (!state.autoCreateVariables) {
    throw new Error(`${variableTypeName(type)} "${wantedName}" 不存在。请先用 create_variable 创建，或让 add_script 自动创建。`);
  }
  const stage = getStage();
  const id = uid('var');
  stage.createVariable(id, wantedName, type);
  const variable = stage.variables[id];
  if (type === 'broadcast_msg') variable.value = wantedName;
  else if (type === 'list') variable.value = [];
  else variable.value = 0;
  state.createdVariables.push({
    name: wantedName,
    type: type === 'list' ? 'list' : type === 'broadcast_msg' ? 'broadcast' : 'variable',
    scope: 'global'
  });
  return variable;
}

function variableField(target, fieldName, variableName, type, scope, state) {
  const variable = resolveVariable(target, variableName, type, scope, state);
  return {
    name: fieldName,
    value: variable.name,
    id: variable.id,
    variableType: type
  };
}

function makeField(target, fieldName, rawValue, state) {
  if (isObject(rawValue) && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
    rawValue = rawValue.value;
  }
  if (fieldName === 'VARIABLE') {
    const name = isObject(rawValue) ? rawValue.name : rawValue;
    return variableField(target, fieldName, name, '', 'auto', state);
  }
  if (fieldName === 'LIST') {
    const name = isObject(rawValue) ? rawValue.name : rawValue;
    return variableField(target, fieldName, name, 'list', 'auto', state);
  }
  if (fieldName === 'BROADCAST_OPTION') {
    const name = isObject(rawValue) ? rawValue.name : rawValue;
    return variableField(target, fieldName, name, 'broadcast_msg', 'global', state);
  }
  return {
    name: fieldName,
    value: rawValue
  };
}

function firstCostume(target) {
  try {
    return target.getCostumes()[0]?.name || 'costume1';
  } catch {
    return 'costume1';
  }
}

function firstSound(target) {
  try {
    return target.getSounds()[0]?.name || 'pop';
  } catch {
    return 'pop';
  }
}

function firstBroadcast() {
  const stage = getStage();
  const broadcast = Object.values(stage.variables || {}).find(variable => variable.type === 'broadcast_msg');
  return broadcast ? broadcast.name : 'message1';
}

function defaultMenuValue(menu, target) {
  if (!menu) return '';
  switch (menu.opcode) {
    case 'looks_costume':
      return firstCostume(target);
    case 'looks_backdrops':
      return firstCostume(getStage());
    case 'sound_sounds_menu':
      return firstSound(target);
    case 'motion_goto_menu':
    case 'motion_glideto_menu':
      return '_random_';
    case 'motion_pointtowards_menu':
      return '_mouse_';
    case 'sensing_touchingobjectmenu':
      return '_mouse_';
    case 'sensing_distancetomenu':
      return '_mouse_';
    case 'sensing_keyoptions':
      return 'space';
    case 'sensing_of_object_menu':
      return '_stage_';
    case 'control_create_clone_of_menu':
      return '_myself_';
    case 'event_broadcast_menu':
      return firstBroadcast();
    default:
      return '';
  }
}

function makeMenuShadow(target, menu, value, parentId, state) {
  const fieldValue = value === undefined || value === null || value === '' ? defaultMenuValue(menu, target) : String(value);
  const field = {
    name: menu.field,
    value: fieldValue
  };
  if (menu.broadcast) {
    const variable = resolveVariable(target, fieldValue, 'broadcast_msg', 'global', state);
    field.value = variable.name;
    field.id = variable.id;
    field.variableType = 'broadcast_msg';
  }
  const id = uid('b');
  const block = {
    id,
    opcode: menu.opcode,
    next: null,
    parent: parentId,
    inputs: {},
    fields: { [menu.field]: field },
    shadow: true,
    topLevel: false,
    x: 0,
    y: 0
  };
  state.blocks.push(block);
  return id;
}

function makePrimitiveShadow(kind, value, parentId) {
  const id = uid('b');
  let block;
  if (kind === 'color') {
    block = {
      id,
      opcode: 'colour_picker',
      next: null,
      parent: parentId,
      inputs: {},
      fields: { COLOUR: { name: 'COLOUR', value: String(value || '#ff0000') } },
      shadow: true,
      topLevel: false,
      x: 0,
      y: 0
    };
  } else if (kind === 'number') {
    const number = Number(value);
    block = {
      id,
      opcode: 'math_number',
      next: null,
      parent: parentId,
      inputs: {},
      fields: { NUM: { name: 'NUM', value: Number.isFinite(number) ? number : 0 } },
      shadow: true,
      topLevel: false,
      x: 0,
      y: 0
    };
  } else {
    block = {
      id,
      opcode: 'text',
      next: null,
      parent: parentId,
      inputs: {},
      fields: { TEXT: { name: 'TEXT', value: String(value ?? '') } },
      shadow: true,
      topLevel: false,
      x: 0,
      y: 0
    };
  }
  return { id, block };
}

function makeShadow(target, opcode, inputName, inputType, value, parentId, state) {
  const menu = menuInfoFor(opcode, inputName);
  if (menu) {
    return makeMenuShadow(target, menu, value, parentId, state);
  }
  if (inputType === 'boolean') return null;
  if (inputType === 'color') {
    const primitive = makePrimitiveShadow('color', value, parentId);
    state.blocks.push(primitive.block);
    return primitive.id;
  }
  if (inputType === 'number') {
    const primitive = makePrimitiveShadow('number', value, parentId);
    state.blocks.push(primitive.block);
    return primitive.id;
  }
  if (inputType === 'any' && typeof value === 'number') {
    const primitive = makePrimitiveShadow('number', value, parentId);
    state.blocks.push(primitive.block);
    return primitive.id;
  }
  const primitive = makePrimitiveShadow('text', value, parentId);
  state.blocks.push(primitive.block);
  return primitive.id;
}

function buildStack(specs, parentId, state) {
  if (!Array.isArray(specs) || specs.length === 0) return null;
  let firstId = null;
  let previousId = null;
  for (const spec of specs) {
    if (!isObject(spec)) {
      throw new Error('脚本数组中的每一项都必须是积木对象。');
    }
    const id = createBlock(spec, parentId ?? previousId, false, 0, 0, state);
    if (previousId) {
      state.blockById.get(previousId).next = id;
    } else {
      firstId = id;
    }
    previousId = id;
  }
  return firstId;
}

function createBlock(spec, parentId, topLevel, x, y, state) {
  if (!isObject(spec) || typeof spec.opcode !== 'string' || !spec.opcode.trim()) {
    throw new Error('积木缺少 opcode。每个积木必须形如 {"opcode":"motion_movesteps","inputs":{"STEPS":10}}。');
  }
  const opcode = spec.opcode.trim();
  const id = uid('b');
  const block = {
    id,
    opcode,
    next: null,
    parent: parentId || null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: Boolean(topLevel),
    x: Number(x) || 0,
    y: Number(y) || 0
  };
  if (isObject(spec.mutation)) {
    block.mutation = normalizeMutation(spec.mutation);
  }
  state.blocks.push(block);
  state.blockById.set(id, block);

  for (const [fieldName, rawValue] of Object.entries(spec.fields || {})) {
    block.fields[fieldName] = makeField(state.target, fieldName, rawValue, state);
  }

  for (const [inputName, rawValue] of Object.entries(spec.inputs || {})) {
    if (inputName.startsWith('SUBSTACK') && Array.isArray(rawValue)) {
      const first = buildStack(rawValue, id, state);
      if (first) {
        block.inputs[inputName] = { name: inputName, block: first, shadow: null };
      }
      continue;
    }
    const input = makeInput(state.target, opcode, inputName, rawValue, id, state);
    if (input) block.inputs[inputName] = { name: inputName, ...input };
  }

  for (const [branchName, branchSpecs] of Object.entries(spec.substacks || {})) {
    if (!Array.isArray(branchSpecs)) {
      throw new Error(`substacks.${branchName} 必须是数组。`);
    }
    const first = buildStack(branchSpecs, id, state);
    if (first) {
      block.inputs[branchName] = { name: branchName, block: first, shadow: null };
    }
  }

  if (Array.isArray(spec.next)) {
    const first = buildStack(spec.next, id, state);
    if (first) block.next = first;
  }

  return id;
}

function makeInput(target, opcode, inputName, rawValue, parentId, state) {
  if (rawValue === undefined || rawValue === null) return null;
  const inputType = blockInputType(opcode, inputName);
  const menu = menuInfoFor(opcode, inputName);

  if (Array.isArray(rawValue)) {
    throw new Error(`输入 ${inputName} 不支持数组。分支请使用 substacks 或 SUBSTACK 数组。`);
  }

  if (isObject(rawValue)) {
    if (rawValue.block && isObject(rawValue.block)) {
      const childId = createBlock(rawValue.block, parentId, false, 0, 0, state);
      const shadowId = makeShadow(target, opcode, inputName, inputType, undefined, parentId, state);
      return { block: childId, shadow: shadowId };
    }
    if (rawValue.raw && isObject(rawValue.raw)) {
      const childId = createBlock(rawValue.raw, parentId, false, 0, 0, state);
      const shadowId = makeShadow(target, opcode, inputName, inputType, undefined, parentId, state);
      return { block: childId, shadow: shadowId };
    }
    if (typeof rawValue.variable === 'string') {
      const childId = createBlock(
        { opcode: 'data_variable', fields: { VARIABLE: rawValue.variable } },
        parentId,
        false,
        0,
        0,
        state
      );
      const shadowId = makeShadow(target, opcode, inputName, inputType, undefined, parentId, state);
      return { block: childId, shadow: shadowId };
    }
    if (typeof rawValue.list === 'string') {
      const childId = createBlock(
        { opcode: 'data_listcontents', fields: { LIST: rawValue.list } },
        parentId,
        false,
        0,
        0,
        state
      );
      const shadowId = makeShadow(target, opcode, inputName, inputType, undefined, parentId, state);
      return { block: childId, shadow: shadowId };
    }
    if (typeof rawValue.broadcast === 'string' && menu && menu.broadcast) {
      const shadowId = makeMenuShadow(target, menu, rawValue.broadcast, parentId, state);
      return { block: shadowId, shadow: shadowId };
    }
    if (typeof rawValue.color === 'string') {
      const shadowId = makeShadow(target, opcode, inputName, 'color', rawValue.color, parentId, state);
      return { block: shadowId, shadow: shadowId };
    }
    if (typeof rawValue.menu === 'string') {
      const shadowId = makeShadow(target, opcode, inputName, inputType, rawValue.menu, parentId, state);
      return { block: shadowId, shadow: shadowId };
    }
    if (typeof rawValue.number === 'number') {
      const shadowId = makeShadow(target, opcode, inputName, 'number', rawValue.number, parentId, state);
      return { block: shadowId, shadow: shadowId };
    }
    if (typeof rawValue.text === 'string') {
      const shadowId = makeShadow(target, opcode, inputName, 'string', rawValue.text, parentId, state);
      return { block: shadowId, shadow: shadowId };
    }
    if (typeof rawValue.opcode === 'string') {
      const childId = createBlock(rawValue, parentId, false, 0, 0, state);
      const shadowId = makeShadow(target, opcode, inputName, inputType, undefined, parentId, state);
      return { block: childId, shadow: shadowId };
    }
    throw new Error(`无法识别的输入 ${inputName}: ${JSON.stringify(rawValue)}`);
  }

  const shadowId = makeShadow(target, opcode, inputName, inputType, rawValue, parentId, state);
  if (shadowId === null) return null;
  return { block: shadowId, shadow: shadowId };
}

function normalizeMutation(mutation) {
  const result = { tagName: 'mutation', children: [], ...mutation };
  if (Array.isArray(result.argumentids)) result.argumentids = JSON.stringify(result.argumentids);
  if (Array.isArray(result.argumentnames)) result.argumentnames = JSON.stringify(result.argumentnames);
  if (Array.isArray(result.argumentdefaults)) result.argumentdefaults = JSON.stringify(result.argumentdefaults);
  if (typeof result.warp === 'boolean') result.warp = result.warp ? 'true' : 'false';
  if (typeof result.hasnext === 'boolean') result.hasnext = result.hasnext ? 'true' : 'false';
  if (!Array.isArray(result.children)) result.children = [];
  return result;
}

function fieldVariableName(rawValue) {
  if (isObject(rawValue)) return rawValue.name ?? rawValue.value;
  return rawValue;
}

function collectVariableRefs(spec, refs) {
  if (!isObject(spec)) return;
  for (const [fieldName, rawValue] of Object.entries(spec.fields || {})) {
    const name = fieldVariableName(rawValue);
    if (name === undefined || name === null || name === '') continue;
    if (fieldName === 'VARIABLE') refs.push({ name, type: '', scope: 'auto' });
    else if (fieldName === 'LIST') refs.push({ name, type: 'list', scope: 'auto' });
    else if (fieldName === 'BROADCAST_OPTION') refs.push({ name, type: 'broadcast_msg', scope: 'global' });
  }
  for (const [inputName, rawValue] of Object.entries(spec.inputs || {})) {
    if (Array.isArray(rawValue)) {
      if (inputName.startsWith('SUBSTACK')) {
        for (const child of rawValue) collectVariableRefs(child, refs);
      }
      continue;
    }
    if (!isObject(rawValue)) continue;
    if (typeof rawValue.variable === 'string') refs.push({ name: rawValue.variable, type: '', scope: 'auto' });
    else if (typeof rawValue.list === 'string') refs.push({ name: rawValue.list, type: 'list', scope: 'auto' });
    else if (typeof rawValue.broadcast === 'string') refs.push({ name: rawValue.broadcast, type: 'broadcast_msg', scope: 'global' });
    else if (isObject(rawValue.block)) collectVariableRefs(rawValue.block, refs);
    else if (isObject(rawValue.raw)) collectVariableRefs(rawValue.raw, refs);
    else if (typeof rawValue.opcode === 'string') collectVariableRefs(rawValue, refs);
  }
  for (const branch of Object.values(spec.substacks || {})) {
    if (Array.isArray(branch)) {
      for (const child of branch) collectVariableRefs(child, refs);
    }
  }
  if (Array.isArray(spec.next)) {
    for (const child of spec.next) collectVariableRefs(child, refs);
  }
}

function syncWorkspaceVariable(variable) {
  try {
    const workspace = globalThis.Blockly && globalThis.Blockly.getMainWorkspace && globalThis.Blockly.getMainWorkspace();
    if (!workspace || !workspace.getVariableMap) return;
    const map = workspace.getVariableMap();
    const existing = map.getVariable ? map.getVariable(variable.name, variable.type) : null;
    const existingId = existing && (typeof existing.getId === 'function' ? existing.getId() : existing.id);
    if (existingId === variable.id) return;
    if (existing && map.deleteVariable) {
      try {
        map.deleteVariable(existing);
      } catch {
        // ignore
      }
    }
    if (map.createVariable) map.createVariable(variable.name, variable.type, variable.id);
  } catch {
    // The workspace may not be available in headless environments.
  }
}

function estimateSpecHeight(spec) {
  if (!isObject(spec)) return 0;
  let height = 56;
  for (const branch of Object.values(spec.substacks || {})) {
    if (Array.isArray(branch) && branch.length) {
      height += estimateStackHeight(branch) + 32;
    }
  }
  for (const [inputName, value] of Object.entries(spec.inputs || {})) {
    if (inputName.startsWith('SUBSTACK') && Array.isArray(value) && value.length) {
      height += estimateStackHeight(value) + 32;
    }
  }
  if (Array.isArray(spec.next) && spec.next.length) {
    height += estimateStackHeight(spec.next);
  }
  return height;
}

function estimateStackHeight(specs) {
  let height = 0;
  for (const spec of specs) height += estimateSpecHeight(spec);
  return height;
}

function estimateBlockTreeHeight(blocks, blockId, seen = new Set()) {
  if (!blockId || seen.has(blockId)) return 0;
  const block = blocks.getBlock(blockId);
  if (!block) return 0;
  seen.add(blockId);
  let height = 56;
  for (const [inputName, input] of Object.entries(block.inputs || {})) {
    if (inputName.startsWith('SUBSTACK') && input && input.block) {
      height += estimateBlockTreeHeight(blocks, input.block, seen) + 32;
    }
  }
  if (block.next) height += estimateBlockTreeHeight(blocks, block.next, seen);
  return height;
}

function estimateExistingBottom(target) {
  let bottom = 0;
  for (const id of target.blocks._scripts || []) {
    const block = target.blocks.getBlock(id);
    if (!block) continue;
    const top = Number(block.y) || 0;
    const height = estimateBlockTreeHeight(target.blocks, id, new Set());
    bottom = Math.max(bottom, top + height);
  }
  return bottom;
}

export async function addScripts({ target: targetName, scripts, script, blocks, x, y, autoCreateVariables = true } = {}) {
  const target = targetName ? requireTarget(targetName, true) : getTargetByName(null, true);
  if (!target) throw new Error('找不到要写入积木的角色。');
  const list = Array.isArray(scripts) ? scripts : Array.isArray(blocks) ? blocks : script ? [script] : null;
  if (!list || list.length === 0) throw new Error('scripts 必须是非空的积木数组。');

  const state = {
    target,
    blocks: [],
    blockById: new Map(),
    createdVariables: [],
    autoCreateVariables: autoCreateVariables !== false
  };

  const variableRefs = [];
  for (const spec of list) collectVariableRefs(spec, variableRefs);
  for (const ref of variableRefs) {
    resolveVariable(target, ref.name, ref.type, ref.scope, state);
  }
  if (state.createdVariables.length) {
    const vm = getVM();
    for (const created of state.createdVariables) {
      const stage = getStage();
      const variable = Object.values(stage.variables || {}).find(item => item.name === created.name && (item.type || '') === (created.type === 'list' ? 'list' : created.type === 'broadcast' ? 'broadcast_msg' : ''));
      if (variable) syncWorkspaceVariable(variable);
    }
    vm.emitWorkspaceUpdate();
    await new Promise(resolve => setTimeout(resolve, 60));
  }

  const baseX = Number.isFinite(Number(x)) ? Number(x) : 48;
  const explicitBaseY = Number.isFinite(Number(y));
  const topIds = [];
  let cursorY = explicitBaseY ? Number(y) : Math.max(48, estimateExistingBottom(target) + 64);
  for (let i = 0; i < list.length; i++) {
    const spec = list[i];
    if (!isObject(spec)) throw new Error(`scripts[${i}] 必须是积木对象。`);
    const explicitY = Number.isFinite(Number(spec.y));
    const topX = Number.isFinite(Number(spec.x)) ? Number(spec.x) : baseX;
    const topY = explicitY ? Number(spec.y) : cursorY;
    const id = createBlock(spec, null, true, topX, topY, state);
    topIds.push(id);
    const height = estimateSpecHeight(spec);
    cursorY = Math.max(cursorY, topY + height + 64);
  }

  const vm = getVM();
  for (const block of state.blocks) {
    target.blocks.createBlock(block);
  }
  target.blocks.resetCache();
  target.blocks.emitProjectChanged();
  vm.emitWorkspaceUpdate();
  focusTarget(target);

  return {
    target: target.getName(),
    scriptIds: topIds,
    blockCount: state.blocks.length,
    createdVariables: state.createdVariables,
    scriptsCreated: topIds.length
  };
}

export function deleteScript({ target: targetName, script_id } = {}) {
  const target = requireTarget(targetName, true);
  const blockId = String(script_id || '').trim();
  if (!blockId) throw new Error('script_id 不能为空。');
  const block = target.blocks.getBlock(blockId);
  if (!block) throw new Error(`找不到脚本 ${blockId}。`);
  if (!block.topLevel) throw new Error(`${blockId} 不是顶层脚本。请使用 get_project 获取脚本 id。`);
  target.blocks.deleteBlock(blockId);
  target.blocks.resetCache();
  target.blocks.emitProjectChanged();
  getVM().emitWorkspaceUpdate();
  focusTarget(target);
  return { target: target.getName(), deleted: blockId };
}

export function clearScripts({ target: targetName } = {}) {
  const target = requireTarget(targetName, true);
  const count = (target.blocks._scripts || []).length;
  target.blocks.deleteAllBlocks();
  target.blocks.resetCache();
  target.blocks.emitProjectChanged();
  getVM().emitWorkspaceUpdate();
  focusTarget(target);
  return { target: target.getName(), deletedScripts: count };
}


function commitBlockChange(target) {
  const vm = getVM();
  target.blocks.resetCache();
  target.blocks.emitProjectChanged();
  vm.emitWorkspaceUpdate();
  focusTarget(target);
}

function findTopLevelBlock(blocks, block) {
  let current = block;
  while (current && !current.topLevel && current.parent) {
    const parent = blocks.getBlock(current.parent);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function findInputRef(parent, childId) {
  for (const [name, input] of Object.entries(parent.inputs || {})) {
    if (input && input.block === childId) return { name, input };
  }
  return null;
}

function lastInChain(blocks, id) {
  let current = blocks.getBlock(id);
  const seen = new Set();
  while (current && current.next && !seen.has(current.next)) {
    seen.add(current.id);
    const next = blocks.getBlock(current.next);
    if (!next) break;
    current = next;
  }
  return current ? current.id : id;
}

function collectTreeIds(blocks, id, includeNext, set = new Set()) {
  const block = blocks.getBlock(id);
  if (!block || set.has(id)) return set;
  set.add(id);
  for (const input of Object.values(block.inputs || {})) {
    if (input && input.block) collectTreeIds(blocks, input.block, true, set);
  }
  if (includeNext && block.next) collectTreeIds(blocks, block.next, true, set);
  return set;
}

function specType(spec) {
  return BLOCK_BY_OPCODE.get(spec && spec.opcode)?.type || 'stack';
}

function removeOldInputs(blocks, toDelete, keepBlock, keepShadow) {
  for (const id of toDelete) {
    if (!id || id === keepBlock || id === keepShadow || !blocks.getBlock(id)) continue;
    blocks.deleteBlock(id);
  }
}

export function deleteBlock({ target: targetName, block_id, mode = 'block' } = {}) {
  const target = requireTarget(targetName, true);
  const blocks = target.blocks;
  const block = blocks.getBlock(block_id);
  if (!block) throw new Error(`找不到积木 ${block_id}。`);
  const normalizedMode = ['block', 'chain', 'script'].includes(mode) ? mode : 'block';

  if (normalizedMode === 'script') {
    const top = findTopLevelBlock(blocks, block);
    if (!top) throw new Error('找不到所属的顶层脚本。');
    blocks.deleteBlock(top.id);
    commitBlockChange(target);
    return { target: target.getName(), deleted: top.id, mode: 'script', deletedTopLevel: true };
  }

  if (block.topLevel) {
    blocks.deleteBlock(block.id);
    commitBlockChange(target);
    return { target: target.getName(), deleted: block.id, mode: normalizedMode, deletedTopLevel: true };
  }

  const parent = block.parent ? blocks.getBlock(block.parent) : null;
  if (!parent) {
    blocks.deleteBlock(block.id);
    commitBlockChange(target);
    return { target: target.getName(), deleted: block.id, mode: normalizedMode };
  }

  const inputRef = findInputRef(parent, block.id);
  if (block.shadow && inputRef && inputRef.input.block === block.id && inputRef.input.shadow === block.id) {
    return deleteBlock({ target: target.getName(), block_id: parent.id, mode: normalizedMode });
  }
  if (block.shadow && !inputRef) {
    const shadowRef = Object.entries(parent.inputs || {}).find(([, input]) => input && input.shadow === block.id);
    if (shadowRef) {
      throw new Error('这是被覆盖的隐藏输入积木，请修改父积木的输入，而不是直接删除它。');
    }
  }

  let reconnectedTo = null;
  if (parent.next === block.id) {
    if (normalizedMode === 'chain') {
      parent.next = null;
    } else {
      parent.next = block.next || null;
      if (block.next) {
        const nextBlock = blocks.getBlock(block.next);
        if (nextBlock) nextBlock.parent = parent.id;
      }
      reconnectedTo = block.next || null;
      block.next = null;
    }
  } else if (inputRef) {
    if (normalizedMode === 'chain') {
      if (inputRef.name.startsWith('SUBSTACK')) {
        inputRef.input.block = null;
      } else {
        inputRef.input.block = inputRef.input.shadow || null;
        if (!inputRef.input.block) delete parent.inputs[inputRef.name];
      }
    } else if (inputRef.name.startsWith('SUBSTACK')) {
      inputRef.input.block = block.next || null;
      if (block.next) {
        const nextBlock = blocks.getBlock(block.next);
        if (nextBlock) nextBlock.parent = parent.id;
      }
      reconnectedTo = block.next || null;
      block.next = null;
    } else {
      inputRef.input.block = inputRef.input.shadow || null;
      if (!inputRef.input.block) delete parent.inputs[inputRef.name];
    }
  }

  blocks.deleteBlock(block.id);
  commitBlockChange(target);
  return {
    target: target.getName(),
    deleted: block.id,
    mode: normalizedMode,
    reconnectedTo,
    parentOpcode: parent.opcode
  };
}

export function editBlock({ target: targetName, block_id, fields, inputs, substacks, auto_create_variables = true } = {}) {
  const target = requireTarget(targetName, true);
  const blocks = target.blocks;
  const block = blocks.getBlock(block_id);
  if (!block) throw new Error(`找不到积木 ${block_id}。`);
  if (!fields && !inputs && !substacks) {
    throw new Error('edit_block 至少需要 fields、inputs 或 substacks 之一。');
  }

  const state = {
    target,
    blocks: [],
    blockById: new Map(),
    createdVariables: [],
    autoCreateVariables: auto_create_variables !== false
  };
  const toDelete = new Set();
  const scheduleDeleteInput = input => {
    if (!input) return;
    if (input.block) toDelete.add(input.block);
    if (input.shadow && input.shadow !== input.block) toDelete.add(input.shadow);
  };

  for (const [fieldName, value] of Object.entries(fields || {})) {
    if (value === undefined) continue;
    block.fields[fieldName] = makeField(target, fieldName, value, state);
  }

  for (const [inputName, value] of Object.entries(inputs || {})) {
    if (value === undefined) continue;
    const old = block.inputs[inputName];
    if (value === null) {
      delete block.inputs[inputName];
      scheduleDeleteInput(old);
      continue;
    }
    if (inputName.startsWith('SUBSTACK') && Array.isArray(value)) {
      const first = buildStack(value, block.id, state);
      scheduleDeleteInput(old);
      if (first) block.inputs[inputName] = { name: inputName, block: first, shadow: null };
      else delete block.inputs[inputName];
      continue;
    }
    const nextInput = makeInput(target, block.opcode, inputName, value, block.id, state);
    if (!nextInput) {
      scheduleDeleteInput(old);
      delete block.inputs[inputName];
      continue;
    }
    if (old) {
      if (old.block && old.block !== nextInput.block && old.block !== nextInput.shadow) toDelete.add(old.block);
      if (old.shadow && old.shadow !== nextInput.shadow && old.shadow !== nextInput.block) toDelete.add(old.shadow);
    }
    block.inputs[inputName] = { name: inputName, ...nextInput };
  }

  for (const [branchName, branchSpecs] of Object.entries(substacks || {})) {
    if (!Array.isArray(branchSpecs)) throw new Error(`substacks.${branchName} 必须是数组。`);
    const old = block.inputs[branchName];
    const first = buildStack(branchSpecs, block.id, state);
    scheduleDeleteInput(old);
    if (first) block.inputs[branchName] = { name: branchName, block: first, shadow: null };
    else delete block.inputs[branchName];
  }

  for (const newBlock of state.blocks) blocks.createBlock(newBlock);
  removeOldInputs(blocks, toDelete);
  commitBlockChange(target);
  return {
    target: target.getName(),
    blockId: block.id,
    blockCount: state.blocks.length,
    createdVariables: state.createdVariables
  };
}

export function insertBlock({ target: targetName, block, position = 'after', anchor_id, parent_id, input_name, auto_create_variables = true } = {}) {
  const target = requireTarget(targetName, true);
  const blocks = target.blocks;
  if (!isObject(block) || typeof block.opcode !== 'string') {
    throw new Error('insert_block 需要 block.opcode。');
  }
  const pos = ['after', 'before', 'substack', 'input'].includes(position) ? position : 'after';
  const type = specType(block);
  if ((pos === 'after' || pos === 'before' || pos === 'substack') && (type === 'reporter' || type === 'boolean')) {
    throw new Error('reporter/boolean 积木不能插入脚本堆叠，请使用 position="input"。');
  }
  if ((pos === 'after' || pos === 'before') && type === 'hat') {
    throw new Error('帽子积木只能作为顶层脚本，请使用 add_script。');
  }
  if (pos === 'input' && (type === 'stack' || type === 'hat')) {
    throw new Error('只支持把 reporter/boolean 积木插入输入框。');
  }

  const state = {
    target,
    blocks: [],
    blockById: new Map(),
    createdVariables: [],
    autoCreateVariables: auto_create_variables !== false
  };

  let insertedId = null;
  if (pos === 'after') {
    const anchor = blocks.getBlock(anchor_id);
    if (!anchor || anchor.shadow) throw new Error('anchor_id 必须是一个可连接的普通积木。');
    const newId = createBlock(block, anchor.id, false, 0, 0, state);
    for (const newBlock of state.blocks) blocks.createBlock(newBlock);
    const oldNext = anchor.next || null;
    const newBlock = blocks.getBlock(newId);
    anchor.next = newId;
    newBlock.parent = anchor.id;
    const last = lastInChain(blocks, newId);
    const lastBlock = blocks.getBlock(last);
    lastBlock.next = oldNext;
    if (oldNext) blocks.getBlock(oldNext).parent = last;
    insertedId = newId;
  } else if (pos === 'before') {
    const anchor = blocks.getBlock(anchor_id);
    if (!anchor || anchor.shadow || anchor.topLevel) throw new Error('before 需要一个非顶层的普通积木作为 anchor_id。');
    const parent = blocks.getBlock(anchor.parent);
    if (!parent) throw new Error('找不到 anchor 的父积木。');
    const inputRef = findInputRef(parent, anchor.id);
    const inStack = parent.next === anchor.id;
    const inSubstack = inputRef && inputRef.name.startsWith('SUBSTACK');
    if (!inStack && !inSubstack) throw new Error('anchor 不在可插入的脚本堆叠中。');
    const newId = createBlock(block, parent.id, false, 0, 0, state);
    for (const newBlock of state.blocks) blocks.createBlock(newBlock);
    const newBlock = blocks.getBlock(newId);
    const last = lastInChain(blocks, newId);
    blocks.getBlock(last).next = anchor.id;
    anchor.parent = last;
    if (inStack) {
      parent.next = newId;
      newBlock.parent = parent.id;
    } else {
      inputRef.input.block = newId;
      newBlock.parent = parent.id;
    }
    insertedId = newId;
  } else if (pos === 'substack') {
    const parent = blocks.getBlock(parent_id);
    if (!parent) throw new Error('找不到 parent_id。');
    const branch = input_name || 'SUBSTACK';
    if (!branch.startsWith('SUBSTACK')) throw new Error('substack 的 input_name 必须是 SUBSTACK / SUBSTACK2。');
    const oldFirst = parent.inputs[branch]?.block || null;
    const newId = createBlock(block, parent.id, false, 0, 0, state);
    for (const newBlock of state.blocks) blocks.createBlock(newBlock);
    const newBlock = blocks.getBlock(newId);
    const last = lastInChain(blocks, newId);
    blocks.getBlock(last).next = oldFirst;
    if (oldFirst) blocks.getBlock(oldFirst).parent = last;
    parent.inputs[branch] = { name: branch, block: newId, shadow: null };
    newBlock.parent = parent.id;
    insertedId = newId;
  } else {
    const parent = blocks.getBlock(parent_id);
    if (!parent) throw new Error('找不到 parent_id。');
    const inputName = input_name;
    if (!inputName) throw new Error('position="input" 需要 input_name。');
    const nextInput = makeInput(target, parent.opcode, inputName, block, parent.id, state);
    if (!nextInput) throw new Error('无法构建输入值。');
    const old = parent.inputs[inputName];
    const toDelete = new Set();
    if (old) {
      if (old.block) toDelete.add(old.block);
      if (old.shadow && old.shadow !== old.block) toDelete.add(old.shadow);
    }
    for (const newBlock of state.blocks) blocks.createBlock(newBlock);
    parent.inputs[inputName] = { name: inputName, ...nextInput };
    removeOldInputs(blocks, toDelete, nextInput.block, nextInput.shadow);
    insertedId = nextInput.block;
  }

  commitBlockChange(target);
  return {
    target: target.getName(),
    inserted: insertedId,
    position: pos,
    anchorId: anchor_id || null,
    parentId: parent_id || null,
    inputName: input_name || null,
    createdVariables: state.createdVariables
  };
}

export function moveBlock({ target: targetName, block_id, position = 'after', anchor_id, parent_id, input_name, with_next = true } = {}) {
  const target = requireTarget(targetName, true);
  const blocks = target.blocks;
  const block = blocks.getBlock(block_id);
  if (!block) throw new Error(`找不到积木 ${block_id}。`);
  if (block.shadow) throw new Error('不能移动隐藏的菜单/字面量积木。');
  if (block.topLevel) throw new Error('不能移动顶层脚本，请使用 delete_script + add_script 重建。');
  const pos = ['after', 'substack', 'input'].includes(position) ? position : 'after';
  const type = specType(block);
  if ((pos === 'after' || pos === 'substack') && (type === 'reporter' || type === 'boolean' || type === 'hat')) {
    throw new Error('只有普通堆叠积木可以移动到脚本堆叠或分支中。');
  }
  if (pos === 'input' && (type === 'stack' || type === 'hat')) {
    throw new Error('只有 reporter/boolean 积木可以移动到输入框。');
  }

  const movedIds = collectTreeIds(blocks, block.id, with_next !== false);
  let anchor = null;
  let parent = null;
  let oldNext = null;
  let oldFirst = null;
  let branch = input_name || null;

  if (pos === 'after') {
    anchor = blocks.getBlock(anchor_id);
    if (!anchor || anchor.shadow) throw new Error('anchor_id 必须是一个可连接的普通积木。');
    if (movedIds.has(anchor.id)) throw new Error('不能把积木移动到它自己的子树里。');
    oldNext = anchor.next || null;
    if (oldNext && movedIds.has(oldNext) && oldNext !== block.id) {
      throw new Error('目标位置在积木自己的后续链中，会形成循环。');
    }
    if (anchor.id === block.parent && anchor.next === block.id) {
      return { target: target.getName(), moved: block.id, position: pos, noop: true };
    }
  } else if (pos === 'substack') {
    parent = blocks.getBlock(parent_id);
    if (!parent) throw new Error('找不到 parent_id。');
    if (movedIds.has(parent.id)) throw new Error('不能把积木移动到它自己的子树里。');
    branch = branch || 'SUBSTACK';
    if (!branch.startsWith('SUBSTACK')) throw new Error('substack 的 input_name 必须是 SUBSTACK / SUBSTACK2。');
    oldFirst = parent.inputs[branch]?.block || null;
    if (oldFirst && movedIds.has(oldFirst)) throw new Error('目标分支在积木自己的子树里，会形成循环。');
  } else {
    parent = blocks.getBlock(parent_id);
    if (!parent) throw new Error('找不到 parent_id。');
    if (movedIds.has(parent.id)) throw new Error('不能把积木移动到它自己的子树里。');
    if (!branch) throw new Error('position="input" 需要 input_name。');
    const existing = parent.inputs[branch];
    if (existing && existing.block && existing.block !== existing.shadow && existing.block !== block.id) {
      throw new Error('目标输入框已经有积木，请先删除或编辑目标输入。');
    }
  }

  const currentParent = block.parent ? blocks.getBlock(block.parent) : null;
  if (!currentParent) throw new Error('找不到积木当前的父级连接。');
  const currentInputRef = findInputRef(currentParent, block.id);

  if (currentParent.next === block.id) {
    if (with_next !== false) {
      currentParent.next = null;
    } else {
      currentParent.next = block.next || null;
      if (block.next) {
        const nextBlock = blocks.getBlock(block.next);
        if (nextBlock) nextBlock.parent = currentParent.id;
      }
      block.next = null;
    }
  } else if (currentInputRef) {
    if (currentInputRef.name.startsWith('SUBSTACK')) {
      if (with_next !== false) {
        currentInputRef.input.block = null;
      } else {
        currentInputRef.input.block = block.next || null;
        if (block.next) {
        const nextBlock = blocks.getBlock(block.next);
        if (nextBlock) nextBlock.parent = currentParent.id;
      }
        block.next = null;
      }
    } else {
      currentInputRef.input.block = currentInputRef.input.shadow || null;
      if (!currentInputRef.input.block) delete currentParent.inputs[currentInputRef.name];
      block.next = null;
    }
  } else {
    throw new Error('找不到积木当前的连接位置。');
  }
  block.parent = null;

  if (pos === 'after') {
    anchor.next = block.id;
    block.parent = anchor.id;
    const last = lastInChain(blocks, block.id);
    const lastBlock = blocks.getBlock(last);
    lastBlock.next = oldNext;
    if (oldNext) blocks.getBlock(oldNext).parent = last;
  } else if (pos === 'substack') {
    parent.inputs[branch] = { name: branch, block: block.id, shadow: null };
    block.parent = parent.id;
    const last = lastInChain(blocks, block.id);
    const lastBlock = blocks.getBlock(last);
    lastBlock.next = oldFirst;
    if (oldFirst) blocks.getBlock(oldFirst).parent = last;
  } else {
    const existing = parent.inputs[branch] || null;
    let shadow = existing?.shadow || null;
    if (!shadow) {
      const inputType = blockInputType(parent.opcode, branch);
      const state = {
        target,
        blocks: [],
        blockById: new Map(),
        createdVariables: [],
        autoCreateVariables: true
      };
      const shadowId = makeShadow(target, parent.opcode, branch, inputType, undefined, parent.id, state);
      if (shadowId) {
        for (const newBlock of state.blocks) blocks.createBlock(newBlock);
        shadow = shadowId;
      }
    }
    parent.inputs[branch] = { name: branch, block: block.id, shadow };
    block.parent = parent.id;
    block.next = null;
  }

  commitBlockChange(target);
  return { target: target.getName(), moved: block.id, position: pos, anchorId: anchor_id || null, parentId: parent_id || null, inputName: branch };
}
