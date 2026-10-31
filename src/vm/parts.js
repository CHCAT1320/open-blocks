import { deleteBlock } from './builder.js';
import { emitProjectChanged, focusTarget, getRuntime, getStage, getTargets, getVM, requireTarget } from './api.js';

function variableType(type) {
  return type === 'list' ? 'list' : type === 'broadcast' ? 'broadcast_msg' : '';
}

function findVariable(target, name, type) {
  return target.lookupVariableByNameAndType(String(name || '').trim(), type) || null;
}

function variableHolder(target, variable) {
  if (target.variables && target.variables[variable.id]) return target;
  return getStage();
}

function costumeIndex(target, { name, index } = {}) {
  const costumes = target.getCostumes();
  let idx = Number(index);
  if (!Number.isFinite(idx)) idx = costumes.findIndex(costume => costume.name === name);
  if (idx < 0 || idx >= costumes.length) {
    throw new Error(`找不到造型 "${name ?? index}"。可用造型: ${costumes.map(c => c.name).join(', ')}`);
  }
  return idx;
}

function soundIndex(target, { name, index } = {}) {
  const sounds = target.getSounds();
  let idx = Number(index);
  if (!Number.isFinite(idx)) idx = sounds.findIndex(sound => sound.name === name);
  if (idx < 0 || idx >= sounds.length) {
    throw new Error(`找不到声音 "${name ?? index}"。可用声音: ${sounds.map(s => s.name).join(', ')}`);
  }
  return idx;
}

function updateVariableFieldValues(variable, name) {
  for (const target of getTargets()) {
    for (const block of Object.values(target.blocks._blocks || {})) {
      for (const field of Object.values(block.fields || {})) {
        if (field && field.id === variable.id) field.value = name;
      }
    }
  }
}

export function renameVariable({ target: targetName, name, new_name, type = 'variable' } = {}) {
  const target = requireTarget(targetName, true);
  const varType = variableType(type);
  const variable = findVariable(target, name, varType);
  if (!variable) throw new Error(`找不到${varType === 'list' ? '列表' : varType === 'broadcast_msg' ? '广播' : '变量'} "${name}"。`);
  const newName = String(new_name || '').trim();
  if (!newName) throw new Error('new_name 不能为空。');
  const holder = variableHolder(target, variable);
  const duplicate = Object.values(holder.variables || {}).find(item => item.id !== variable.id && item.name === newName && item.type === varType);
  if (duplicate) throw new Error(`已存在同名${varType === 'list' ? '列表' : '变量'} "${newName}"。`);

  const oldName = variable.name;
  holder.renameVariable(variable.id, newName);
  const actualName = holder.variables[variable.id]?.name || newName;
  updateVariableFieldValues(variable, actualName);
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return {
    target: target.getName(),
    id: variable.id,
    oldName,
    name: actualName,
    type: varType === 'list' ? 'list' : varType === 'broadcast_msg' ? 'broadcast' : 'variable',
    scope: holder.isStage ? 'global' : 'local'
  };
}

export function deleteVariable({ target: targetName, name, type = 'variable' } = {}) {
  const target = requireTarget(targetName, true);
  const varType = variableType(type);
  const variable = findVariable(target, name, varType);
  if (!variable) throw new Error(`找不到${varType === 'list' ? '列表' : varType === 'broadcast_msg' ? '广播' : '变量'} "${name}"。`);
  const holder = variableHolder(target, variable);
  const refs = [];
  for (const current of getTargets()) {
    for (const block of Object.values(current.blocks._blocks || {})) {
      if (!block) continue;
      const uses = Object.values(block.fields || {}).some(field => field && field.id === variable.id);
      if (uses) refs.push({ target: current, blockId: block.id });
    }
  }

  let clearedBlocks = 0;
  const seen = new Set();
  for (const ref of refs) {
    const key = `${ref.target.id}:${ref.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!ref.target.blocks.getBlock(ref.blockId)) continue;
    try {
      deleteBlock({ target: ref.target.getName(), block_id: ref.blockId });
      clearedBlocks++;
    } catch {
      // A block may already have been removed as part of a parent subtree.
    }
  }

  holder.deleteVariable(variable.id);
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return {
    target: target.getName(),
    deleted: variable.name,
    id: variable.id,
    type: varType === 'list' ? 'list' : varType === 'broadcast_msg' ? 'broadcast' : 'variable',
    scope: holder.isStage ? 'global' : 'local',
    clearedBlocks
  };
}

export function renameCostume({ target: targetName, name, index, new_name } = {}) {
  const target = requireTarget(targetName, true);
  const idx = costumeIndex(target, { name, index });
  const oldName = target.getCostumes()[idx].name;
  const newName = String(new_name || '').trim();
  if (!newName) throw new Error('new_name 不能为空。');
  target.renameCostume(idx, newName);
  const actualName = target.getCostumes()[idx].name;
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return { target: target.getName(), index: idx, oldName, name: actualName };
}

export function deleteCostume({ target: targetName, name, index } = {}) {
  const target = requireTarget(targetName, true);
  const costumes = target.getCostumes();
  if (costumes.length <= 1) throw new Error('不能删除最后一个造型/背景。');
  const idx = costumeIndex(target, { name, index });
  const oldName = costumes[idx].name;
  target.deleteCostume(idx);
  const remaining = target.getCostumes();
  const replacement = remaining[Math.min(idx, remaining.length - 1)]?.name || '';
  if (oldName && replacement) {
    if (target.isStage) {
      for (const current of getTargets()) {
        current.blocks.updateAssetName(oldName, replacement, 'backdrop');
      }
    } else {
      target.blocks.updateAssetName(oldName, replacement, 'costume');
    }
  }
  if (Number(target.currentCostume) >= idx) {
    target.setCostume(Math.min(idx, remaining.length - 1));
  }
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return { target: target.getName(), deleted: oldName, index: idx, replacement };
}

export function renameSound({ target: targetName, name, index, new_name } = {}) {
  const target = requireTarget(targetName, true);
  const idx = soundIndex(target, { name, index });
  const oldName = target.getSounds()[idx].name;
  const newName = String(new_name || '').trim();
  if (!newName) throw new Error('new_name 不能为空。');
  target.renameSound(idx, newName);
  const actualName = target.getSounds()[idx].name;
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return { target: target.getName(), index: idx, oldName, name: actualName };
}

export function deleteSound({ target: targetName, name, index } = {}) {
  const target = requireTarget(targetName, true);
  const idx = soundIndex(target, { name, index });
  const oldName = target.getSounds()[idx].name;
  target.deleteSound(idx);
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return { target: target.getName(), deleted: oldName, index: idx };
}

export function reorderCostume({ target: targetName, name, index, new_index } = {}) {
  const target = requireTarget(targetName, true);
  const costumes = target.getCostumes();
  if (costumes.length < 2) throw new Error('至少需要两个造型才能重排。');
  const from = costumeIndex(target, { name, index });
  const to = Math.max(0, Math.min(costumes.length - 1, Number(new_index) || 0));
  if (from === to) return { target: target.getName(), moved: costumes[from].name, from, to };
  const currentName = costumes[target.currentCostume]?.name || null;
  const [item] = costumes.splice(from, 1);
  costumes.splice(to, 0, item);
  if (currentName) {
    const currentIndex = costumes.findIndex(costume => costume.name === currentName);
    if (currentIndex >= 0) target.setCostume(currentIndex);
  }
  getRuntime().requestTargetsUpdate(target);
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return { target: target.getName(), moved: item.name, from, to };
}

export function reorderSound({ target: targetName, name, index, new_index } = {}) {
  const target = requireTarget(targetName, true);
  const sounds = target.getSounds();
  if (sounds.length < 2) throw new Error('至少需要两个声音才能重排。');
  const from = soundIndex(target, { name, index });
  const to = Math.max(0, Math.min(sounds.length - 1, Number(new_index) || 0));
  if (from === to) return { target: target.getName(), moved: sounds[from].name, from, to };
  const [item] = sounds.splice(from, 1);
  sounds.splice(to, 0, item);
  getRuntime().requestTargetsUpdate(target);
  getVM().emitWorkspaceUpdate();
  emitProjectChanged();
  focusTarget(target);
  return { target: target.getName(), moved: item.name, from, to };
}
