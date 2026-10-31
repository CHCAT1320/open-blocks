const PRIMITIVE_OPCODES = new Set([
  'math_number',
  'math_positive_number',
  'math_whole_number',
  'math_integer',
  'math_angle',
  'colour_picker',
  'text',
  'event_broadcast_menu',
  'data_variable',
  'data_listcontents'
]);

const MENU_OPCODES = new Set([
  'looks_costume',
  'looks_backdrops',
  'sound_sounds_menu',
  'motion_goto_menu',
  'motion_glideto_menu',
  'motion_pointtowards_menu',
  'sensing_touchingobjectmenu',
  'sensing_distancetomenu',
  'sensing_keyoptions',
  'sensing_of_object_menu',
  'control_create_clone_of_menu',
  'event_broadcast_menu'
]);

function fieldValue(block, name) {
  const field = block && block.fields && block.fields[name];
  return field ? field.value : undefined;
}

function firstFieldValue(block) {
  if (!block || !block.fields) return undefined;
  const key = Object.keys(block.fields)[0];
  return key ? block.fields[key].value : undefined;
}

function quote(value) {
  if (typeof value === 'number') return String(value);
  return JSON.stringify(String(value ?? ''));
}

function primitiveText(block) {
  const opcode = block.opcode;
  if (opcode === 'math_number' || opcode === 'math_positive_number' || opcode === 'math_whole_number' || opcode === 'math_integer' || opcode === 'math_angle') {
    return String(fieldValue(block, 'NUM') ?? 0);
  }
  if (opcode === 'colour_picker') {
    return quote(fieldValue(block, 'COLOUR') ?? '#000000');
  }
  if (opcode === 'text') {
    return quote(fieldValue(block, 'TEXT') ?? '');
  }
  if (opcode === 'event_broadcast_menu') {
    return `broadcast(${quote(fieldValue(block, 'BROADCAST_OPTION') ?? '')})`;
  }
  if (opcode === 'data_variable') {
    return `var(${quote(fieldValue(block, 'VARIABLE') ?? '')})`;
  }
  if (opcode === 'data_listcontents') {
    return `list(${quote(fieldValue(block, 'LIST') ?? '')})`;
  }
  return quote(firstFieldValue(block) ?? '');
}

function inlineBlock(block, blocks, depth, state) {
  if (!block) return 'null';
  if (PRIMITIVE_OPCODES.has(block.opcode)) return primitiveText(block);
  if (MENU_OPCODES.has(block.opcode) || block.opcode.endsWith('_menu')) {
    return quote(firstFieldValue(block) ?? '');
  }
  if (depth > 10 || state.seen.has(block.id)) return `${block.opcode}(…)`;
  state.seen.add(block.id);
  const parts = [block.opcode];
  for (const [name, field] of Object.entries(block.fields || {})) {
    parts.push(`${name}=${formatField(name, field.value)}`);
  }
  for (const [name, input] of Object.entries(block.inputs || {})) {
    if (name.startsWith('SUBSTACK')) continue;
    const value = describeInput(input, blocks, depth + 1, state);
    if (value !== null) parts.push(`${name}=${value}`);
  }
  state.seen.delete(block.id);
  return `${parts.join(' ')}`;
}

function formatField(name, value) {
  if (name === 'VARIABLE') return `var(${quote(value)})`;
  if (name === 'LIST') return `list(${quote(value)})`;
  if (name === 'BROADCAST_OPTION') return `broadcast(${quote(value)})`;
  if (typeof value === 'number') return String(value);
  return quote(value);
}

function describeInput(input, blocks, depth, state) {
  if (!input) return null;
  if (!input.block) {
    if (input.shadow) {
      const shadow = blocks.getBlock(input.shadow);
      if (shadow) return inlineBlock(shadow, blocks, depth, state);
    }
    return null;
  }
  const block = blocks.getBlock(input.block);
  if (!block) return null;
  if (input.block === input.shadow || block.shadow) {
    return inlineBlock(block, blocks, depth, state);
  }
  return inlineBlock(block, blocks, depth, state);
}

export function describeBlockLine(blockId, blocks, state) {
  const block = blocks.getBlock(blockId);
  if (!block) return null;
  if (block.shadow) return primitiveText(block);
  const parts = [block.opcode];
  for (const [name, field] of Object.entries(block.fields || {})) {
    parts.push(`${name}=${formatField(name, field.value)}`);
  }
  for (const [name, input] of Object.entries(block.inputs || {})) {
    if (name.startsWith('SUBSTACK')) continue;
    const value = describeInput(input, blocks, 1, state);
    if (value !== null) parts.push(`${name}=${value}`);
  }
  return parts.join(' ');
}

export function describeStack(blockId, blocks, indent = 0, state = { seen: new Set(), count: 0, maxBlocks: 400, truncated: false }) {
  const lines = [];
  let current = blockId;
  while (current) {
    if (state.count >= state.maxBlocks) {
      state.truncated = true;
      lines.push(`${'  '.repeat(indent)}… (block limit reached)`);
      break;
    }
    const block = blocks.getBlock(current);
    if (!block) break;
    state.count++;
    const line = describeBlockLine(current, blocks, state);
    if (line !== null) lines.push(`${'  '.repeat(indent)}${line}`);
    for (const [name, input] of Object.entries(block.inputs || {})) {
      if (!name.startsWith('SUBSTACK')) continue;
      if (input && input.block) {
        lines.push(`${'  '.repeat(indent)}${name}:`);
        const branch = describeStack(input.block, blocks, indent + 1, state);
        if (branch) lines.push(branch);
      }
    }
    current = block.next;
  }
  return lines.join('\n');
}

export function describeTargetScripts(target, maxBlocks = 400) {
  const blocks = target.blocks;
  const scriptIds = Array.isArray(blocks._scripts) ? [...blocks._scripts] : [];
  const state = { seen: new Set(), count: 0, maxBlocks, truncated: false };
  const scripts = [];
  for (const id of scriptIds) {
    if (state.count >= state.maxBlocks) {
      state.truncated = true;
      break;
    }
    const block = blocks.getBlock(id);
    if (!block) continue;
    const text = describeStack(id, blocks, 0, state);
    scripts.push({
      id,
      opcode: block.opcode,
      x: Math.round(block.x || 0),
      y: Math.round(block.y || 0),
      text
    });
  }
  const allBlocks = Object.values(blocks._blocks || {}).filter(block => block && !block.shadow);
  const blockList = allBlocks.slice(0, maxBlocks).map(block => ({
    id: block.id,
    opcode: block.opcode,
    parent: block.parent || null,
    next: block.next || null,
    topLevel: Boolean(block.topLevel),
    x: Math.round(block.x || 0),
    y: Math.round(block.y || 0),
    inputs: Object.fromEntries(
      Object.entries(block.inputs || {}).map(([name, input]) => [name, input ? { block: input.block || null, shadow: input.shadow || null } : null])
    ),
    fields: Object.fromEntries(
      Object.entries(block.fields || {}).map(([name, field]) => [name, { value: field.value, id: field.id || null, variableType: field.variableType || null }])
    )
  }));
  const truncated = state.truncated || allBlocks.length > blockList.length;
  return { scripts, blocks: blockList, truncated, blockCount: state.count };
}

export function countTargetBlocks(target) {
  return Object.keys(target.blocks._blocks || {}).length;
}
