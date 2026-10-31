import { uid } from '../util/id.js';
import { downloadBlob } from '../util/download.js';
import { saveCheckpoint } from './checkpoints.js';
import { describeTargetScripts, countTargetBlocks } from './describe.js';

const SNAPSHOT_LIMIT = 8;
const snapshots = [];
const redoSnapshots = [];

export function getVM() {
  const vm = globalThis.Scratch && globalThis.Scratch.vm;
  if (!vm || !vm.runtime) {
    throw new Error('Scratch VM 尚未就绪，请等待编辑器加载完成。');
  }
  return vm;
}

export function getRuntime() {
  return getVM().runtime;
}

export function getStage() {
  const stage = getRuntime().getTargetForStage();
  if (!stage) throw new Error('找不到舞台。');
  return stage;
}

export function getTargets() {
  return getRuntime().targets.filter(target => target.isOriginal);
}

export function getSprites() {
  return getTargets().filter(target => target.isSprite && target.isSprite());
}

export function getEditingTarget() {
  return getVM().editingTarget;
}

export function getTargetByName(name, fallbackToEditing = false) {
  if (!name) {
    if (fallbackToEditing) return getEditingTarget();
    return null;
  }
  const wanted = String(name).trim();
  if (!wanted || wanted === 'Stage' || wanted === '舞台' || wanted === '_stage_') {
    return getStage();
  }
  const exact = getTargets().find(target => target.getName() === wanted);
  if (exact) return exact;
  const lower = wanted.toLowerCase();
  return (
    getTargets().find(target => String(target.getName()).toLowerCase() === lower) ||
    (fallbackToEditing ? getEditingTarget() : null)
  );
}

export function requireTarget(name, fallbackToEditing = true) {
  const target = getTargetByName(name, fallbackToEditing);
  if (!target) {
    const names = getTargets().map(t => t.getName()).join(', ');
    throw new Error(`找不到角色 "${name}"。可用角色: ${names || '无'}`);
  }
  return target;
}

export function getCostumeNames(target) {
  try {
    return target.getCostumes().map(costume => costume.name);
  } catch {
    return [];
  }
}

export function getSoundNames(target) {
  try {
    return target.getSounds().map(sound => sound.name);
  } catch {
    return [];
  }
}

function summarizeValue(value) {
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map(item => String(item).slice(0, 80));
    return items.length < value.length ? [...items, `… (${value.length} items)`] : items;
  }
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  return value;
}

export function listVariables(target) {
  return Object.values(target.variables || {})
    .filter(variable => variable.type !== 'broadcast_msg')
    .map(variable => ({
      name: variable.name,
      type: variable.type === 'list' ? 'list' : 'variable',
      value: summarizeValue(variable.value)
    }));
}

export function listBroadcasts() {
  return Object.values(getStage().variables || {})
    .filter(variable => variable.type === 'broadcast_msg')
    .map(variable => variable.name);
}

export function getExtensions() {
  try {
    return Array.from(getVM().extensionManager?._loadedExtensions?.keys?.() || []);
  } catch {
    return [];
  }
}

export function summarizeProject() {
  const vm = getVM();
  const stage = getStage();
  const sprites = getSprites();
  return {
    editingTarget: vm.editingTarget ? vm.editingTarget.getName() : null,
    stage: {
      name: 'Stage',
      backdrops: getCostumeNames(stage),
      sounds: getSoundNames(stage),
      variables: listVariables(stage),
      scriptCount: (stage.blocks._scripts || []).length
    },
    sprites: sprites.map(target => ({
      name: target.getName(),
      x: Math.round(target.x || 0),
      y: Math.round(target.y || 0),
      direction: Math.round(target.direction || 90),
      size: Math.round(target.size || 100),
      visible: target.visible !== false,
      costumes: getCostumeNames(target),
      sounds: getSoundNames(target),
      variables: listVariables(target),
      scriptCount: (target.blocks._scripts || []).length,
      blockCount: countTargetBlocks(target)
    })),
    broadcasts: listBroadcasts(),
    extensions: getExtensions(),
    targetCount: getTargets().length
  };
}

export function getTargetScripts(name, maxBlocks = 400) {
  const target = requireTarget(name, true);
  const result = describeTargetScripts(target, maxBlocks);
  return {
    target: target.getName(),
    ...result
  };
}

export function unusedName(baseName, existingNames) {
  const base = String(baseName || 'Sprite').trim() || 'Sprite';
  const existing = new Set(existingNames.map(name => String(name)));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}${index}`)) index++;
  return `${base}${index}`;
}

function defaultSpriteSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="6" y="12" width="52" height="44" rx="13" fill="#6c5ce7"/>
  <circle cx="24" cy="32" r="6" fill="#ffffff"/>
  <circle cx="40" cy="32" r="6" fill="#ffffff"/>
  <path d="M22 46 Q32 54 42 46" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="28" y="3" width="8" height="11" rx="4" fill="#6c5ce7"/>
  <circle cx="32" cy="4" r="4" fill="#00d2ff"/>
</svg>`;
}

function makeAssetFromBytes(storage, assetType, dataFormat, bytes) {
  return storage.createAsset(assetType, dataFormat, bytes, null, true);
}

function svgSize(svg) {
  const widthMatch = /<svg[^>]*\bwidth=["']?([0-9.]+)/i.exec(svg);
  const heightMatch = /<svg[^>]*\bheight=["']?([0-9.]+)/i.exec(svg);
  const viewBoxMatch = /<svg[^>]*\bviewBox=["']([^"']+)["']/i.exec(svg);
  let width = widthMatch ? Number(widthMatch[1]) : 0;
  let height = heightMatch ? Number(heightMatch[1]) : 0;
  if ((!width || !height) && viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      width = width || parts[2];
      height = height || parts[3];
    }
  }
  return {
    width: Number.isFinite(width) && width > 0 ? width : 64,
    height: Number.isFinite(height) && height > 0 ? height : 64
  };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/s.exec(String(dataUrl));
  if (!match) throw new Error('无效的 data URL。');
  const mime = match[1].toLowerCase();
  const meta = match[2] || '';
  const payload = match[3];
  const isBase64 = /;base64/i.test(meta);
  if (mime === 'image/svg+xml') {
    const svg = isBase64 ? decodeURIComponent(escape(atob(payload))) : decodeURIComponent(payload);
    return { mime, svg };
  }
  if (!isBase64) throw new Error('位图 data URL 必须是 base64 编码。');
  const bytes = base64ToBytes(payload);
  const format = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
  return { mime, bytes, format };
}

async function bitmapSize(bytes, mime) {
  if (typeof createImageBitmap === 'function') {
    try {
      const blob = new Blob([bytes], { type: mime });
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      // fall through
    }
  }
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸。'));
    };
    image.src = url;
  });
}

export async function createSprite({ name, x = 0, y = 0, size = 100, direction = 90, visible = true, costumeSvg } = {}) {
  const vm = getVM();
  const runtime = getRuntime();
  const storage = runtime.storage;
  if (!storage) throw new Error('编辑器存储模块尚未就绪。');

  const finalName = unusedName(name || 'Sprite', getTargets().map(t => t.getName()));
  const svg = costumeSvg || defaultSpriteSvg();
  const { width, height } = svgSize(svg);
  const asset = makeAssetFromBytes(
    storage,
    storage.AssetType.ImageVector,
    storage.DataFormat.SVG,
    new TextEncoder().encode(svg)
  );
  const costume = {
    name: 'costume1',
    assetId: asset.assetId,
    dataFormat: 'svg',
    md5ext: `${asset.assetId}.svg`,
    rotationCenterX: width / 2,
    rotationCenterY: height / 2,
    bitmapResolution: 1,
    asset
  };
  const sprite = {
    isStage: false,
    name: finalName,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [costume],
    sounds: [],
    volume: 100,
    layerOrder: 1,
    visible: Boolean(visible),
    x: Number(x) || 0,
    y: Number(y) || 0,
    size: Number(size) || 100,
    direction: Number(direction) || 90,
    draggable: false,
    rotationStyle: 'all around'
  };

  let target = null;
  try {
    await vm.addSprite(sprite);
    target = vm.editingTarget && vm.editingTarget.isSprite() ? vm.editingTarget : getTargetByName(finalName);
  } catch (error) {
    const source = getSprites()[0];
    if (!source) {
      throw new Error(`创建角色失败: ${error && error.message ? error.message : error}`);
    }
    await vm.duplicateSprite(source.id);
    target = vm.editingTarget;
    if (!target) throw new Error('创建角色失败：无法复制现有角色。');
    target.blocks.deleteAllBlocks();
    for (const id of Object.keys(target.variables || {})) delete target.variables[id];
  }

  if (!target) throw new Error('创建角色失败。');
  try {
    vm.renameSprite(target.id, finalName);
  } catch {
    // name conflicts are handled by the VM
  }
  target.setXY(Number(x) || 0, Number(y) || 0);
  target.setSize(Number(size) || 100);
  target.setDirection(Number(direction) || 90);
  target.setVisible(Boolean(visible));
  runtime.emitProjectChanged();
  focusTarget(target);
  getVM().emitWorkspaceUpdate();
  await new Promise(resolve => setTimeout(resolve, 60));
  return {
    name: target.getName(),
    id: target.id,
    x: target.x,
    y: target.y,
    costumes: getCostumeNames(target)
  };
}

export function deleteSprite(name) {
  const vm = getVM();
  const target = requireTarget(name, false);
  if (!target.isSprite || !target.isSprite()) throw new Error('不能删除舞台。');
  const deletedName = target.getName();
  vm.deleteSprite(target.id);
  getRuntime().emitProjectChanged();
  getVM().emitWorkspaceUpdate();
  return { deleted: deletedName };
}

export function renameSprite(name, newName) {
  const vm = getVM();
  const target = requireTarget(name, false);
  if (!target.isSprite || !target.isSprite()) throw new Error('不能重命名舞台。');
  const oldName = target.getName();
  vm.renameSprite(target.id, newName);
  getRuntime().emitProjectChanged();
  getVM().emitWorkspaceUpdate();
  return { oldName, name: target.getName() };
}

export function setSpriteProps(name, props = {}) {
  const target = requireTarget(name, true);
  const runtime = getRuntime();
  if (props.x !== undefined || props.y !== undefined) {
    target.setXY(
      props.x !== undefined ? Number(props.x) : target.x,
      props.y !== undefined ? Number(props.y) : target.y
    );
  }
  if (props.direction !== undefined) target.setDirection(Number(props.direction));
  if (props.size !== undefined) target.setSize(Number(props.size));
  if (props.visible !== undefined) target.setVisible(Boolean(props.visible));
  if (props.draggable !== undefined) target.setDraggable(Boolean(props.draggable));
  if (props.rotation_style !== undefined) target.setRotationStyle(String(props.rotation_style));
  if (props.current_costume !== undefined) {
    const costumes = target.getCostumes();
    let index = Number(props.current_costume);
    if (!Number.isFinite(index)) {
      index = costumes.findIndex(costume => costume.name === String(props.current_costume));
    }
    if (index >= 0 && index < costumes.length) target.setCostume(index);
  }
  if (props.go_to_front) target.goToFront();
  if (props.go_to_back) target.goToBack();
  runtime.emitProjectChanged();
  return {
    name: target.getName(),
    x: target.x,
    y: target.y,
    direction: target.direction,
    size: target.size,
    visible: target.visible
  };
}

function normalizeVariableValue(type, value) {
  if (type === 'list') {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // not JSON
      }
      return value.length ? value.split(',').map(item => item.trim()) : [];
    }
    if (value === undefined || value === null) return [];
    return [value];
  }
  if (value === undefined || value === null) return 0;
  return value;
}

export function createVariable({ name, value, type = 'variable', scope = 'auto', target: targetName } = {}) {
  const vm = getVM();
  const stage = getStage();
  const target = targetName ? requireTarget(targetName, false) : getEditingTarget() || stage;
  const varType = type === 'list' ? 'list' : type === 'broadcast' ? 'broadcast_msg' : '';
  const wantedScope = scope === 'local' ? 'local' : scope === 'global' ? 'global' : 'auto';
  const holder = varType === 'broadcast_msg' || wantedScope === 'global' || target.isStage ? stage : target;

  let variable = null;
  if (wantedScope === 'local' && !target.isStage) {
    variable = Object.values(target.variables || {}).find(item => item.name === name && item.type === varType) || null;
  } else {
    variable = target.lookupVariableByNameAndType(name, varType) || null;
  }

  let created = false;
  if (!variable) {
    const id = uid('var');
    holder.createVariable(id, name, varType);
    variable = holder.variables[id];
    created = true;
  }
  if (value !== undefined) {
    variable.value = normalizeVariableValue(varType, value);
  } else if (created) {
    variable.value = varType === 'list' ? [] : varType === 'broadcast_msg' ? name : 0;
  }
  vm.emitWorkspaceUpdate();
  getRuntime().emitProjectChanged();
  return {
    name: variable.name,
    id: variable.id,
    type: varType === 'list' ? 'list' : varType === 'broadcast_msg' ? 'broadcast' : 'variable',
    scope: holder.isStage ? 'global' : 'local',
    created,
    value: summarizeValue(variable.value)
  };
}

export function setVariableValue({ name, value, type = 'variable', target: targetName } = {}) {
  const vm = getVM();
  const stage = getStage();
  const target = targetName ? requireTarget(targetName, false) : getEditingTarget() || stage;
  const varType = type === 'list' ? 'list' : type === 'broadcast' ? 'broadcast_msg' : '';
  const variable = target.lookupVariableByNameAndType(name, varType) || stage.lookupVariableByNameAndType(name, varType);
  if (!variable) throw new Error(`找不到${varType === 'list' ? '列表' : '变量'} "${name}"。`);
  variable.value = normalizeVariableValue(varType, value);
  getRuntime().emitProjectChanged();
  return {
    name: variable.name,
    type: varType === 'list' ? 'list' : 'variable',
    value: summarizeValue(variable.value)
  };
}

export async function addCostume({ target: targetName, name, svg, data_url } = {}) {
  const vm = getVM();
  const runtime = getRuntime();
  const storage = runtime.storage;
  if (!storage) throw new Error('编辑器存储模块尚未就绪。');
  const target = targetName ? requireTarget(targetName, true) : getEditingTarget();
  if (!target) throw new Error('没有正在编辑的角色。');

  let asset;
  let dataFormat;
  let width;
  let height;
  let bitmapResolution = 1;

  const rawSvg = svg || (data_url && /^data:image\/svg\+xml/i.test(data_url) ? parseDataUrl(data_url).svg : null);
  if (rawSvg) {
    dataFormat = 'svg';
    const size = svgSize(rawSvg);
    width = size.width;
    height = size.height;
    asset = makeAssetFromBytes(
      storage,
      storage.AssetType.ImageVector,
      storage.DataFormat.SVG,
      new TextEncoder().encode(rawSvg)
    );
  } else if (data_url) {
    const parsed = parseDataUrl(data_url);
    if (!parsed.bytes) throw new Error('仅支持 SVG 字符串或 PNG/JPEG/SVG data URL。');
    dataFormat = parsed.format === 'jpeg' ? 'jpg' : parsed.format;
    asset = makeAssetFromBytes(
      storage,
      storage.AssetType.ImageBitmap,
      dataFormat === 'jpg' ? storage.DataFormat.JPG : storage.DataFormat.PNG,
      parsed.bytes
    );
    const size = await bitmapSize(parsed.bytes, parsed.mime);
    width = size.width;
    height = size.height;
  } else {
    throw new Error('请提供 svg 字符串或 data_url。');
  }

  const costumeName = name || `costume${target.getCostumes().length + 1}`;
  const costume = {
    name: costumeName,
    asset,
    assetId: asset.assetId,
    dataFormat,
    md5ext: `${asset.assetId}.${dataFormat}`,
    rotationCenterX: width / 2,
    rotationCenterY: height / 2,
    bitmapResolution
  };
  await vm.addCostume(costume.md5ext, costume, target.id);
  runtime.emitProjectChanged();
  getVM().emitWorkspaceUpdate();
  await new Promise(resolve => setTimeout(resolve, 60));
  return {
    target: target.getName(),
    name: costumeName,
    index: target.getCostumes().length - 1,
    dataFormat
  };
}

export function setBackdrop({ name, index } = {}) {
  const stage = getStage();
  const costumes = stage.getCostumes();
  let costumeIndex = Number(index);
  if (!Number.isFinite(costumeIndex)) {
    costumeIndex = costumes.findIndex(costume => costume.name === name);
  }
  if (costumeIndex < 0 || costumeIndex >= costumes.length) {
    throw new Error(`找不到背景 "${name ?? index}"。可用背景: ${costumes.map(c => c.name).join(', ')}`);
  }
  stage.setCostume(costumeIndex);
  getRuntime().emitProjectChanged();
  return { name: costumes[costumeIndex].name, index: costumeIndex };
}

export function setStageProps(props = {}) {
  const stage = getStage();
  if (props.tempo !== undefined) stage.tempo = Number(props.tempo);
  if (props.volume !== undefined) stage.volume = Number(props.volume);
  if (props.video_transparency !== undefined) stage.videoTransparency = Number(props.video_transparency);
  if (props.video_state !== undefined) stage.videoState = String(props.video_state);
  if (props.text_to_speech_language !== undefined) {
    stage.textToSpeechLanguage = String(props.text_to_speech_language);
  }
  getRuntime().emitProjectChanged();
  return {
    tempo: stage.tempo,
    volume: stage.volume,
    videoTransparency: stage.videoTransparency,
    videoState: stage.videoState
  };
}

export function runProject() {
  getVM().greenFlag();
  return { running: true };
}

export function stopProject() {
  getVM().stopAll();
  return { running: false };
}

export async function exportProject(filename) {
  const vm = getVM();
  const blob = await vm.saveProjectSb3();
  const finalName = String(filename || `openblocks-${new Date().toISOString().slice(0, 10)}.sb3`).replace(/[\\/:*?"<>|]/g, '_');
  downloadBlob(blob, finalName.endsWith('.sb3') ? finalName : `${finalName}.sb3`);
  return { filename: finalName };
}

export function focusTarget(target) {
  const vm = getVM();
  if (!target) return;
  if (vm.editingTarget !== target) {
    vm.setEditingTarget(target.id);
  }
  vm.emitWorkspaceUpdate();
}

export function emitProjectChanged() {
  try {
    getRuntime().emitProjectChanged();
  } catch {
    // ignore
  }
}

export async function pushSnapshot(label = 'AI 修改') {
  try {
    const json = getVM().toJSON();
    snapshots.push({ json, label, at: Date.now() });
    redoSnapshots.length = 0;
    while (snapshots.length > SNAPSHOT_LIMIT) snapshots.shift();
    void saveCheckpoint(label, json);
    return { ok: true, count: snapshots.length };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

export function snapshotCount() {
  return snapshots.length;
}

export function redoCount() {
  return redoSnapshots.length;
}

export async function restoreLastSnapshot() {
  const snapshot = snapshots.pop();
  if (!snapshot) throw new Error('没有可撤销的 AI 修改。');
  const vm = getVM();
  const editingName = vm.editingTarget ? vm.editingTarget.getName() : null;
  let redoEntry = null;
  try {
    redoEntry = { json: vm.toJSON(), label: '撤销前状态', at: Date.now() };
    redoSnapshots.push(redoEntry);
    while (redoSnapshots.length > SNAPSHOT_LIMIT) redoSnapshots.shift();
    await vm.loadProject(snapshot.json);
    if (editingName) {
      const target = getTargetByName(editingName);
      if (target) vm.setEditingTarget(target.id);
    }
    vm.emitWorkspaceUpdate();
    return { restored: true, label: snapshot.label, at: snapshot.at, remaining: snapshots.length, redo: redoSnapshots.length };
  } catch (error) {
    snapshots.push(snapshot);
    if (redoEntry) {
      const index = redoSnapshots.indexOf(redoEntry);
      if (index >= 0) redoSnapshots.splice(index, 1);
    }
    throw error;
  }
}

export async function redoLastSnapshot() {
  const snapshot = redoSnapshots.pop();
  if (!snapshot) throw new Error('没有可重做的修改。');
  const vm = getVM();
  const editingName = vm.editingTarget ? vm.editingTarget.getName() : null;
  let undoEntry = null;
  try {
    undoEntry = { json: vm.toJSON(), label: '重做前状态', at: Date.now() };
    snapshots.push(undoEntry);
    while (snapshots.length > SNAPSHOT_LIMIT) snapshots.shift();
    await vm.loadProject(snapshot.json);
    if (editingName) {
      const target = getTargetByName(editingName);
      if (target) vm.setEditingTarget(target.id);
    }
    vm.emitWorkspaceUpdate();
    return { redone: true, label: snapshot.label, at: snapshot.at, remaining: redoSnapshots.length };
  } catch (error) {
    redoSnapshots.push(snapshot);
    if (undoEntry) {
      const index = snapshots.indexOf(undoEntry);
      if (index >= 0) snapshots.splice(index, 1);
    }
    throw error;
  }
}
