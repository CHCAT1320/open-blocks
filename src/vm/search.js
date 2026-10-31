import { getEditingTarget, getStage, getTargetByName, getTargets } from './api.js';
import { describeBlockLine } from './describe.js';

function topLevelId(blocks, block) {
  let current = block;
  while (current && !current.topLevel && current.parent) {
    const parent = blocks.getBlock(current.parent);
    if (!parent) break;
    current = parent;
  }
  return current ? current.id : null;
}

function variableType(type) {
  if (type === 'list') return 'list';
  if (type === 'broadcast') return 'broadcast_msg';
  return '';
}

function targetList(targetName) {
  if (!targetName) return getTargets();
  const target = getTargetByName(targetName, false);
  return target ? [target] : [];
}

function blockLine(target, block) {
  try {
    return describeBlockLine(block.id, target.blocks, { seen: new Set() });
  } catch {
    return block.opcode;
  }
}

export function searchProject({ query, target: targetName, limit = 60 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) throw new Error('search_project 需要 query。');
  const max = Math.max(1, Math.min(200, Number(limit) || 60));
  const matches = [];
  let truncated = false;

  for (const target of targetList(targetName)) {
    for (const variable of Object.values(target.variables || {})) {
      const valueText = Array.isArray(variable.value) ? variable.value.join(', ') : String(variable.value ?? '');
      if (variable.name.toLowerCase().includes(q) || valueText.toLowerCase().includes(q)) {
        matches.push({
          kind: variable.type === 'list' ? 'list' : variable.type === 'broadcast_msg' ? 'broadcast' : 'variable',
          target: target.getName(),
          name: variable.name,
          value: valueText.slice(0, 240)
        });
      }
    }
    for (const costume of target.getCostumes()) {
      if (costume.name.toLowerCase().includes(q)) matches.push({ kind: 'costume', target: target.getName(), name: costume.name });
    }
    for (const sound of target.getSounds()) {
      if (sound.name.toLowerCase().includes(q)) matches.push({ kind: 'sound', target: target.getName(), name: sound.name });
    }
    for (const block of Object.values(target.blocks._blocks || {})) {
      if (!block || block.shadow) continue;
      const line = blockLine(target, block);
      const fieldValues = Object.values(block.fields || {}).map(field => String(field?.value ?? '')).join(' ');
      const haystack = `${block.opcode} ${line} ${fieldValues}`.toLowerCase();
      if (!haystack.includes(q) && !block.opcode.toLowerCase().includes(q)) continue;
      matches.push({
        kind: 'block',
        target: target.getName(),
        blockId: block.id,
        scriptId: topLevelId(target.blocks, block),
        opcode: block.opcode,
        text: line
      });
      if (matches.length >= max) {
        truncated = true;
        break;
      }
    }
    if (matches.length >= max) {
      truncated = true;
      break;
    }
  }

  return { query: String(query), matches: matches.slice(0, max), truncated, count: Math.min(matches.length, max) };
}

export function findReferences({ name, type = 'variable', target: targetName } = {}) {
  const wanted = String(name || '').trim();
  if (!wanted) throw new Error('find_references 需要 name。');
  const references = [];
  const normalizedType = ['variable', 'list', 'broadcast', 'costume', 'sound', 'sprite'].includes(type) ? type : 'variable';

  if (normalizedType === 'variable' || normalizedType === 'list' || normalizedType === 'broadcast') {
    const varType = variableType(normalizedType);
    let variable = null;
    let holder = null;
    for (const target of targetList(targetName)) {
      const found = target.lookupVariableByNameAndType(wanted, varType);
      if (found) {
        variable = found;
        holder = target.variables && target.variables[found.id] ? target : getStage();
        break;
      }
    }
    if (!variable) return { name: wanted, type: normalizedType, references: [], count: 0, found: false };
    for (const target of getTargets()) {
      for (const block of Object.values(target.blocks._blocks || {})) {
        if (!block) continue;
        for (const [fieldName, field] of Object.entries(block.fields || {})) {
          if (!field) continue;
          if (field.id === variable.id || (field.value === variable.name && field.variableType === varType)) {
            references.push({
              target: target.getName(),
              blockId: block.id,
              scriptId: topLevelId(target.blocks, block),
              opcode: block.opcode,
              field: fieldName,
              text: blockLine(target, block)
            });
          }
        }
      }
    }
    return {
      name: variable.name,
      type: normalizedType,
      id: variable.id,
      scope: holder?.isStage ? 'global' : 'local',
      references,
      count: references.length,
      found: true
    };
  }

  const fieldNames = normalizedType === 'costume'
    ? new Set(['COSTUME', 'BACKDROP', 'COSTUME_MENU'])
    : normalizedType === 'sound'
      ? new Set(['SOUND_MENU'])
      : new Set(['TO', 'TOWARDS', 'TOUCHINGOBJECTMENU', 'DISTANCETOMENU', 'OBJECT', 'CLONE_OPTION']);

  for (const target of targetList(targetName)) {
    for (const block of Object.values(target.blocks._blocks || {})) {
      if (!block) continue;
      for (const [fieldName, field] of Object.entries(block.fields || {})) {
        if (!field || !fieldNames.has(fieldName)) continue;
        if (String(field.value) === wanted) {
          references.push({
            target: target.getName(),
            blockId: block.id,
            scriptId: topLevelId(target.blocks, block),
            opcode: block.opcode,
            field: fieldName,
            text: blockLine(target, block)
          });
        }
      }
    }
  }

  return { name: wanted, type: normalizedType, references, count: references.length, found: references.length > 0 };
}
