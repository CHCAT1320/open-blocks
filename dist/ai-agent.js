var OpenBlocksAIAgentBundle = (() => {
  // src/util/id.js
  var ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function uid(prefix = "") {
    const bytes = new Uint8Array(20);
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return prefix + out;
  }

  // src/util/format.js
  function truncate(value, max = 2e3) {
    const text = typeof value === "string" ? value : String(value ?? "");
    if (text.length <= max) return text;
    return `${text.slice(0, max)}
\u2026 (${text.length - max} more characters)`;
  }
  function safeString(value) {
    if (value === null || value === void 0) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  function prettyJSON(value, max = 12e3) {
    let text;
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = safeString(value);
    }
    return truncate(text, max);
  }
  function escapeHtml(value) {
    return safeString(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function clampNumber(value, min, max, fallback) {
    if (value === "" || value === null || value === void 0) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  // src/util/storage.js
  var SETTINGS_KEY = "openblocks.ai-agent.settings.v1";
  var SESSION_KEY = "openblocks.ai-agent.session.v1";
  var LAYOUT_KEY = "openblocks.ai-agent.layout.v1";
  var DEFAULT_SETTINGS = {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxSteps: 12,
    maxRetries: 3,
    stream: true,
    autoContext: true,
    confirmDestructive: true,
    rememberKey: true,
    systemPromptExtra: "",
    language: "zh"
  };
  var PROVIDER_PRESETS = {
    openai: {
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini"
    },
    deepseek: {
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat"
    },
    openrouter: {
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini"
    },
    ollama: {
      label: "Ollama (\u672C\u5730)",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1"
    },
    custom: {
      label: "\u81EA\u5B9A\u4E49 OpenAI \u517C\u5BB9\u63A5\u53E3",
      baseUrl: "",
      model: ""
    },
    mock: {
      label: "\u672C\u5730\u6F14\u793A (\u65E0\u9700 API Key)",
      baseUrl: "",
      model: "openblocks-demo"
    }
  };
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  function loadSettings() {
    const saved = readJSON(SETTINGS_KEY);
    if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS };
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    if (settings.rememberKey === false) settings.apiKey = "";
    if (!PROVIDER_PRESETS[settings.provider]) settings.provider = "openai";
    return settings;
  }
  function saveSettings(settings) {
    const toSave = { ...settings };
    if (toSave.rememberKey === false) toSave.apiKey = "";
    return writeJSON(SETTINGS_KEY, toSave);
  }
  function loadSession() {
    const saved = readJSON(SESSION_KEY);
    if (!saved || typeof saved !== "object") {
      return { display: [], apiMessages: [], plan: [] };
    }
    return {
      display: Array.isArray(saved.display) ? saved.display : [],
      apiMessages: Array.isArray(saved.apiMessages) ? saved.apiMessages : [],
      plan: Array.isArray(saved.plan) ? saved.plan : [],
      usage: saved.usage && typeof saved.usage === "object" ? saved.usage : null,
      fingerprint: typeof saved.fingerprint === "string" ? saved.fingerprint : ""
    };
  }
  function saveSession(session) {
    const display = (session.display || []).slice(-80).map((entry) => {
      let result = entry.result;
      if (result && typeof result === "object") {
        result = { ...result };
        if (typeof result.image_data_url === "string") result.image_data_url = "[\u622A\u56FE\u5DF2\u7701\u7565]";
        if (result.screenshot && typeof result.screenshot === "object" && typeof result.screenshot.image_data_url === "string") {
          result.screenshot = { ...result.screenshot, image_data_url: "[\u622A\u56FE\u5DF2\u7701\u7565]" };
        }
      }
      return {
        ...entry,
        content: typeof entry.content === "string" ? entry.content.slice(0, 12e3) : entry.content,
        result: result === void 0 ? void 0 : JSON.stringify(result).slice(0, 12e3)
      };
    });
    const apiMessages = (session.apiMessages || []).slice(-60).map((message) => ({
      ...message,
      content: typeof message.content === "string" ? message.content.slice(0, 12e3) : message.content
    }));
    return writeJSON(SESSION_KEY, {
      display,
      apiMessages,
      plan: session.plan || [],
      usage: session.usage || null,
      fingerprint: session.fingerprint || "",
      savedAt: Date.now()
    });
  }
  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
    }
  }
  function loadLayout() {
    return readJSON(LAYOUT_KEY) || null;
  }
  function saveLayout(layout) {
    writeJSON(LAYOUT_KEY, layout);
  }
  function clearLayout() {
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch {
    }
  }

  // src/util/download.js
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4e3);
  }

  // src/vm/checkpoints.js
  var DB_NAME = "openblocks-ai-checkpoints";
  var STORE_NAME = "checkpoints";
  var MAX_CHECKPOINTS = 10;
  var dbPromise = null;
  function openDB() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }
  async function saveCheckpoint(label, json) {
    try {
      const db = await openDB();
      if (!db) return null;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ id, label: String(label || "AI \u4FEE\u6539"), at: Date.now(), json });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      const list = await listCheckpoints();
      for (const item of list.slice(MAX_CHECKPOINTS)) {
        await deleteCheckpoint(item.id);
      }
      return id;
    } catch {
      return null;
    }
  }
  async function listCheckpoints() {
    try {
      const db = await openDB();
      if (!db) return [];
      const items = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      return items.map((item) => ({ id: item.id, label: item.label, at: item.at, size: item.json ? item.json.length : 0 })).sort((a, b2) => b2.at - a.at);
    } catch {
      return [];
    }
  }
  async function loadCheckpoint(id) {
    try {
      const db = await openDB();
      if (!db) return null;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(String(id));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }
  async function deleteCheckpoint(id) {
    try {
      const db = await openDB();
      if (!db) return false;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(String(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch {
      return false;
    }
  }

  // src/vm/describe.js
  var PRIMITIVE_OPCODES = /* @__PURE__ */ new Set([
    "math_number",
    "math_positive_number",
    "math_whole_number",
    "math_integer",
    "math_angle",
    "colour_picker",
    "text",
    "event_broadcast_menu",
    "data_variable",
    "data_listcontents"
  ]);
  var MENU_OPCODES = /* @__PURE__ */ new Set([
    "looks_costume",
    "looks_backdrops",
    "sound_sounds_menu",
    "motion_goto_menu",
    "motion_glideto_menu",
    "motion_pointtowards_menu",
    "sensing_touchingobjectmenu",
    "sensing_distancetomenu",
    "sensing_keyoptions",
    "sensing_of_object_menu",
    "control_create_clone_of_menu",
    "event_broadcast_menu"
  ]);
  function fieldValue(block, name) {
    const field = block && block.fields && block.fields[name];
    return field ? field.value : void 0;
  }
  function firstFieldValue(block) {
    if (!block || !block.fields) return void 0;
    const key = Object.keys(block.fields)[0];
    return key ? block.fields[key].value : void 0;
  }
  function quote(value) {
    if (typeof value === "number") return String(value);
    return JSON.stringify(String(value ?? ""));
  }
  function primitiveText(block) {
    const opcode = block.opcode;
    if (opcode === "math_number" || opcode === "math_positive_number" || opcode === "math_whole_number" || opcode === "math_integer" || opcode === "math_angle") {
      return String(fieldValue(block, "NUM") ?? 0);
    }
    if (opcode === "colour_picker") {
      return quote(fieldValue(block, "COLOUR") ?? "#000000");
    }
    if (opcode === "text") {
      return quote(fieldValue(block, "TEXT") ?? "");
    }
    if (opcode === "event_broadcast_menu") {
      return `broadcast(${quote(fieldValue(block, "BROADCAST_OPTION") ?? "")})`;
    }
    if (opcode === "data_variable") {
      return `var(${quote(fieldValue(block, "VARIABLE") ?? "")})`;
    }
    if (opcode === "data_listcontents") {
      return `list(${quote(fieldValue(block, "LIST") ?? "")})`;
    }
    return quote(firstFieldValue(block) ?? "");
  }
  function inlineBlock(block, blocks, depth, state) {
    if (!block) return "null";
    if (PRIMITIVE_OPCODES.has(block.opcode)) return primitiveText(block);
    if (MENU_OPCODES.has(block.opcode) || block.opcode.endsWith("_menu")) {
      return quote(firstFieldValue(block) ?? "");
    }
    if (depth > 10 || state.seen.has(block.id)) return `${block.opcode}(\u2026)`;
    state.seen.add(block.id);
    const parts = [block.opcode];
    for (const [name, field] of Object.entries(block.fields || {})) {
      parts.push(`${name}=${formatField(name, field.value)}`);
    }
    for (const [name, input] of Object.entries(block.inputs || {})) {
      if (name.startsWith("SUBSTACK")) continue;
      const value = describeInput(input, blocks, depth + 1, state);
      if (value !== null) parts.push(`${name}=${value}`);
    }
    state.seen.delete(block.id);
    return `${parts.join(" ")}`;
  }
  function formatField(name, value) {
    if (name === "VARIABLE") return `var(${quote(value)})`;
    if (name === "LIST") return `list(${quote(value)})`;
    if (name === "BROADCAST_OPTION") return `broadcast(${quote(value)})`;
    if (typeof value === "number") return String(value);
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
  function describeBlockLine(blockId, blocks, state) {
    const block = blocks.getBlock(blockId);
    if (!block) return null;
    if (block.shadow) return primitiveText(block);
    const parts = [block.opcode];
    for (const [name, field] of Object.entries(block.fields || {})) {
      parts.push(`${name}=${formatField(name, field.value)}`);
    }
    for (const [name, input] of Object.entries(block.inputs || {})) {
      if (name.startsWith("SUBSTACK")) continue;
      const value = describeInput(input, blocks, 1, state);
      if (value !== null) parts.push(`${name}=${value}`);
    }
    return parts.join(" ");
  }
  function describeStack(blockId, blocks, indent = 0, state = { seen: /* @__PURE__ */ new Set(), count: 0, maxBlocks: 400, truncated: false }) {
    const lines = [];
    let current = blockId;
    while (current) {
      if (state.count >= state.maxBlocks) {
        state.truncated = true;
        lines.push(`${"  ".repeat(indent)}\u2026 (block limit reached)`);
        break;
      }
      const block = blocks.getBlock(current);
      if (!block) break;
      state.count++;
      const line = describeBlockLine(current, blocks, state);
      if (line !== null) lines.push(`${"  ".repeat(indent)}${line}`);
      for (const [name, input] of Object.entries(block.inputs || {})) {
        if (!name.startsWith("SUBSTACK")) continue;
        if (input && input.block) {
          lines.push(`${"  ".repeat(indent)}${name}:`);
          const branch = describeStack(input.block, blocks, indent + 1, state);
          if (branch) lines.push(branch);
        }
      }
      current = block.next;
    }
    return lines.join("\n");
  }
  function describeTargetScripts(target, maxBlocks = 400) {
    const blocks = target.blocks;
    const scriptIds = Array.isArray(blocks._scripts) ? [...blocks._scripts] : [];
    const state = { seen: /* @__PURE__ */ new Set(), count: 0, maxBlocks, truncated: false };
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
    const allBlocks = Object.values(blocks._blocks || {}).filter((block) => block && !block.shadow);
    const blockList = allBlocks.slice(0, maxBlocks).map((block) => ({
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
  function countTargetBlocks(target) {
    return Object.keys(target.blocks._blocks || {}).length;
  }

  // src/vm/api.js
  var SNAPSHOT_LIMIT = 8;
  var snapshots = [];
  var redoSnapshots = [];
  function getVM() {
    const vm = globalThis.Scratch && globalThis.Scratch.vm;
    if (!vm || !vm.runtime) {
      throw new Error("Scratch VM \u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7B49\u5F85\u7F16\u8F91\u5668\u52A0\u8F7D\u5B8C\u6210\u3002");
    }
    return vm;
  }
  function getRuntime() {
    return getVM().runtime;
  }
  function getStage() {
    const stage = getRuntime().getTargetForStage();
    if (!stage) throw new Error("\u627E\u4E0D\u5230\u821E\u53F0\u3002");
    return stage;
  }
  function getTargets() {
    return getRuntime().targets.filter((target) => target.isOriginal);
  }
  function getSprites() {
    return getTargets().filter((target) => target.isSprite && target.isSprite());
  }
  function getEditingTarget() {
    return getVM().editingTarget;
  }
  function getTargetByName(name, fallbackToEditing = false) {
    if (!name) {
      if (fallbackToEditing) return getEditingTarget();
      return null;
    }
    const wanted = String(name).trim();
    if (!wanted || wanted === "Stage" || wanted === "\u821E\u53F0" || wanted === "_stage_") {
      return getStage();
    }
    const exact = getTargets().find((target) => target.getName() === wanted);
    if (exact) return exact;
    const lower = wanted.toLowerCase();
    return getTargets().find((target) => String(target.getName()).toLowerCase() === lower) || (fallbackToEditing ? getEditingTarget() : null);
  }
  function requireTarget(name, fallbackToEditing = true) {
    const target = getTargetByName(name, fallbackToEditing);
    if (!target) {
      const names = getTargets().map((t) => t.getName()).join(", ");
      throw new Error(`\u627E\u4E0D\u5230\u89D2\u8272 "${name}"\u3002\u53EF\u7528\u89D2\u8272: ${names || "\u65E0"}`);
    }
    return target;
  }
  function getCostumeNames(target) {
    try {
      return target.getCostumes().map((costume) => costume.name);
    } catch {
      return [];
    }
  }
  function getSoundNames(target) {
    try {
      return target.getSounds().map((sound) => sound.name);
    } catch {
      return [];
    }
  }
  function summarizeValue(value) {
    if (Array.isArray(value)) {
      const items = value.slice(0, 20).map((item) => String(item).slice(0, 80));
      return items.length < value.length ? [...items, `\u2026 (${value.length} items)`] : items;
    }
    if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}\u2026` : value;
    return value;
  }
  function listVariables(target) {
    return Object.values(target.variables || {}).filter((variable) => variable.type !== "broadcast_msg").map((variable) => ({
      name: variable.name,
      type: variable.type === "list" ? "list" : "variable",
      value: summarizeValue(variable.value)
    }));
  }
  function listBroadcasts() {
    return Object.values(getStage().variables || {}).filter((variable) => variable.type === "broadcast_msg").map((variable) => variable.name);
  }
  function getExtensions() {
    try {
      return Array.from(getVM().extensionManager?._loadedExtensions?.keys?.() || []);
    } catch {
      return [];
    }
  }
  function summarizeProject() {
    const vm = getVM();
    const stage = getStage();
    const sprites = getSprites();
    return {
      editingTarget: vm.editingTarget ? vm.editingTarget.getName() : null,
      stage: {
        name: "Stage",
        backdrops: getCostumeNames(stage),
        sounds: getSoundNames(stage),
        variables: listVariables(stage),
        scriptCount: (stage.blocks._scripts || []).length
      },
      sprites: sprites.map((target) => ({
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
  function getTargetScripts(name, maxBlocks = 400) {
    const target = requireTarget(name, true);
    const result = describeTargetScripts(target, maxBlocks);
    return {
      target: target.getName(),
      ...result
    };
  }
  function unusedName(baseName, existingNames) {
    const base = String(baseName || "Sprite").trim() || "Sprite";
    const existing = new Set(existingNames.map((name) => String(name)));
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
  function svgSize(svg2) {
    const widthMatch = /<svg[^>]*\bwidth=["']?([0-9.]+)/i.exec(svg2);
    const heightMatch = /<svg[^>]*\bheight=["']?([0-9.]+)/i.exec(svg2);
    const viewBoxMatch = /<svg[^>]*\bviewBox=["']([^"']+)["']/i.exec(svg2);
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
    if (!match) throw new Error("\u65E0\u6548\u7684 data URL\u3002");
    const mime = match[1].toLowerCase();
    const meta = match[2] || "";
    const payload = match[3];
    const isBase64 = /;base64/i.test(meta);
    if (mime === "image/svg+xml") {
      const svg2 = isBase64 ? decodeURIComponent(escape(atob(payload))) : decodeURIComponent(payload);
      return { mime, svg: svg2 };
    }
    if (!isBase64) throw new Error("\u4F4D\u56FE data URL \u5FC5\u987B\u662F base64 \u7F16\u7801\u3002");
    const bytes = base64ToBytes(payload);
    const format = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png";
    return { mime, bytes, format };
  }
  async function bitmapSize(bytes, mime) {
    if (typeof createImageBitmap === "function") {
      try {
        const blob = new Blob([bytes], { type: mime });
        const bitmap = await createImageBitmap(blob);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close?.();
        return size;
      } catch {
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
        reject(new Error("\u65E0\u6CD5\u8BFB\u53D6\u56FE\u7247\u5C3A\u5BF8\u3002"));
      };
      image.src = url;
    });
  }
  async function createSprite({ name, x = 0, y = 0, size = 100, direction = 90, visible = true, costumeSvg } = {}) {
    const vm = getVM();
    const runtime = getRuntime();
    const storage = runtime.storage;
    if (!storage) throw new Error("\u7F16\u8F91\u5668\u5B58\u50A8\u6A21\u5757\u5C1A\u672A\u5C31\u7EEA\u3002");
    const finalName = unusedName(name || "Sprite", getTargets().map((t) => t.getName()));
    const svg2 = costumeSvg || defaultSpriteSvg();
    const { width, height } = svgSize(svg2);
    const asset = makeAssetFromBytes(
      storage,
      storage.AssetType.ImageVector,
      storage.DataFormat.SVG,
      new TextEncoder().encode(svg2)
    );
    const costume = {
      name: "costume1",
      assetId: asset.assetId,
      dataFormat: "svg",
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
      rotationStyle: "all around"
    };
    let target = null;
    try {
      await vm.addSprite(sprite);
      target = vm.editingTarget && vm.editingTarget.isSprite() ? vm.editingTarget : getTargetByName(finalName);
    } catch (error) {
      const source = getSprites()[0];
      if (!source) {
        throw new Error(`\u521B\u5EFA\u89D2\u8272\u5931\u8D25: ${error && error.message ? error.message : error}`);
      }
      await vm.duplicateSprite(source.id);
      target = vm.editingTarget;
      if (!target) throw new Error("\u521B\u5EFA\u89D2\u8272\u5931\u8D25\uFF1A\u65E0\u6CD5\u590D\u5236\u73B0\u6709\u89D2\u8272\u3002");
      target.blocks.deleteAllBlocks();
      for (const id of Object.keys(target.variables || {})) delete target.variables[id];
    }
    if (!target) throw new Error("\u521B\u5EFA\u89D2\u8272\u5931\u8D25\u3002");
    try {
      vm.renameSprite(target.id, finalName);
    } catch {
    }
    target.setXY(Number(x) || 0, Number(y) || 0);
    target.setSize(Number(size) || 100);
    target.setDirection(Number(direction) || 90);
    target.setVisible(Boolean(visible));
    runtime.emitProjectChanged();
    focusTarget(target);
    getVM().emitWorkspaceUpdate();
    await new Promise((resolve) => setTimeout(resolve, 60));
    return {
      name: target.getName(),
      id: target.id,
      x: target.x,
      y: target.y,
      costumes: getCostumeNames(target)
    };
  }
  function deleteSprite(name) {
    const vm = getVM();
    const target = requireTarget(name, false);
    if (!target.isSprite || !target.isSprite()) throw new Error("\u4E0D\u80FD\u5220\u9664\u821E\u53F0\u3002");
    const deletedName = target.getName();
    vm.deleteSprite(target.id);
    getRuntime().emitProjectChanged();
    getVM().emitWorkspaceUpdate();
    return { deleted: deletedName };
  }
  function renameSprite(name, newName) {
    const vm = getVM();
    const target = requireTarget(name, false);
    if (!target.isSprite || !target.isSprite()) throw new Error("\u4E0D\u80FD\u91CD\u547D\u540D\u821E\u53F0\u3002");
    const oldName = target.getName();
    vm.renameSprite(target.id, newName);
    getRuntime().emitProjectChanged();
    getVM().emitWorkspaceUpdate();
    return { oldName, name: target.getName() };
  }
  function setSpriteProps(name, props = {}) {
    const target = requireTarget(name, true);
    const runtime = getRuntime();
    if (props.x !== void 0 || props.y !== void 0) {
      target.setXY(
        props.x !== void 0 ? Number(props.x) : target.x,
        props.y !== void 0 ? Number(props.y) : target.y
      );
    }
    if (props.direction !== void 0) target.setDirection(Number(props.direction));
    if (props.size !== void 0) target.setSize(Number(props.size));
    if (props.visible !== void 0) target.setVisible(Boolean(props.visible));
    if (props.draggable !== void 0) target.setDraggable(Boolean(props.draggable));
    if (props.rotation_style !== void 0) target.setRotationStyle(String(props.rotation_style));
    if (props.current_costume !== void 0) {
      const costumes = target.getCostumes();
      let index = Number(props.current_costume);
      if (!Number.isFinite(index)) {
        index = costumes.findIndex((costume) => costume.name === String(props.current_costume));
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
    if (type === "list") {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
        }
        return value.length ? value.split(",").map((item) => item.trim()) : [];
      }
      if (value === void 0 || value === null) return [];
      return [value];
    }
    if (value === void 0 || value === null) return 0;
    return value;
  }
  function createVariable({ name, value, type = "variable", scope = "auto", target: targetName } = {}) {
    const vm = getVM();
    const stage = getStage();
    const target = targetName ? requireTarget(targetName, false) : getEditingTarget() || stage;
    const varType = type === "list" ? "list" : type === "broadcast" ? "broadcast_msg" : "";
    const wantedScope = scope === "local" ? "local" : scope === "global" ? "global" : "auto";
    const holder = varType === "broadcast_msg" || wantedScope === "global" || target.isStage ? stage : target;
    let variable = null;
    if (wantedScope === "local" && !target.isStage) {
      variable = Object.values(target.variables || {}).find((item) => item.name === name && item.type === varType) || null;
    } else {
      variable = target.lookupVariableByNameAndType(name, varType) || null;
    }
    let created = false;
    if (!variable) {
      const id = uid("var");
      holder.createVariable(id, name, varType);
      variable = holder.variables[id];
      created = true;
    }
    if (value !== void 0) {
      variable.value = normalizeVariableValue(varType, value);
    } else if (created) {
      variable.value = varType === "list" ? [] : varType === "broadcast_msg" ? name : 0;
    }
    vm.emitWorkspaceUpdate();
    getRuntime().emitProjectChanged();
    return {
      name: variable.name,
      id: variable.id,
      type: varType === "list" ? "list" : varType === "broadcast_msg" ? "broadcast" : "variable",
      scope: holder.isStage ? "global" : "local",
      created,
      value: summarizeValue(variable.value)
    };
  }
  function setVariableValue({ name, value, type = "variable", target: targetName } = {}) {
    const vm = getVM();
    const stage = getStage();
    const target = targetName ? requireTarget(targetName, false) : getEditingTarget() || stage;
    const varType = type === "list" ? "list" : type === "broadcast" ? "broadcast_msg" : "";
    const variable = target.lookupVariableByNameAndType(name, varType) || stage.lookupVariableByNameAndType(name, varType);
    if (!variable) throw new Error(`\u627E\u4E0D\u5230${varType === "list" ? "\u5217\u8868" : "\u53D8\u91CF"} "${name}"\u3002`);
    variable.value = normalizeVariableValue(varType, value);
    getRuntime().emitProjectChanged();
    return {
      name: variable.name,
      type: varType === "list" ? "list" : "variable",
      value: summarizeValue(variable.value)
    };
  }
  async function addCostume({ target: targetName, name, svg: svg2, data_url } = {}) {
    const vm = getVM();
    const runtime = getRuntime();
    const storage = runtime.storage;
    if (!storage) throw new Error("\u7F16\u8F91\u5668\u5B58\u50A8\u6A21\u5757\u5C1A\u672A\u5C31\u7EEA\u3002");
    const target = targetName ? requireTarget(targetName, true) : getEditingTarget();
    if (!target) throw new Error("\u6CA1\u6709\u6B63\u5728\u7F16\u8F91\u7684\u89D2\u8272\u3002");
    let asset;
    let dataFormat;
    let width;
    let height;
    let bitmapResolution = 1;
    const rawSvg = svg2 || (data_url && /^data:image\/svg\+xml/i.test(data_url) ? parseDataUrl(data_url).svg : null);
    if (rawSvg) {
      dataFormat = "svg";
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
      if (!parsed.bytes) throw new Error("\u4EC5\u652F\u6301 SVG \u5B57\u7B26\u4E32\u6216 PNG/JPEG/SVG data URL\u3002");
      dataFormat = parsed.format === "jpeg" ? "jpg" : parsed.format;
      asset = makeAssetFromBytes(
        storage,
        storage.AssetType.ImageBitmap,
        dataFormat === "jpg" ? storage.DataFormat.JPG : storage.DataFormat.PNG,
        parsed.bytes
      );
      const size = await bitmapSize(parsed.bytes, parsed.mime);
      width = size.width;
      height = size.height;
    } else {
      throw new Error("\u8BF7\u63D0\u4F9B svg \u5B57\u7B26\u4E32\u6216 data_url\u3002");
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
    await new Promise((resolve) => setTimeout(resolve, 60));
    return {
      target: target.getName(),
      name: costumeName,
      index: target.getCostumes().length - 1,
      dataFormat
    };
  }
  function setBackdrop({ name, index } = {}) {
    const stage = getStage();
    const costumes = stage.getCostumes();
    let costumeIndex2 = Number(index);
    if (!Number.isFinite(costumeIndex2)) {
      costumeIndex2 = costumes.findIndex((costume) => costume.name === name);
    }
    if (costumeIndex2 < 0 || costumeIndex2 >= costumes.length) {
      throw new Error(`\u627E\u4E0D\u5230\u80CC\u666F "${name ?? index}"\u3002\u53EF\u7528\u80CC\u666F: ${costumes.map((c) => c.name).join(", ")}`);
    }
    stage.setCostume(costumeIndex2);
    getRuntime().emitProjectChanged();
    return { name: costumes[costumeIndex2].name, index: costumeIndex2 };
  }
  function setStageProps(props = {}) {
    const stage = getStage();
    if (props.tempo !== void 0) stage.tempo = Number(props.tempo);
    if (props.volume !== void 0) stage.volume = Number(props.volume);
    if (props.video_transparency !== void 0) stage.videoTransparency = Number(props.video_transparency);
    if (props.video_state !== void 0) stage.videoState = String(props.video_state);
    if (props.text_to_speech_language !== void 0) {
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
  function runProject() {
    getVM().greenFlag();
    return { running: true };
  }
  function stopProject() {
    getVM().stopAll();
    return { running: false };
  }
  async function exportProject(filename) {
    const vm = getVM();
    const blob = await vm.saveProjectSb3();
    const finalName = String(filename || `openblocks-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sb3`).replace(/[\\/:*?"<>|]/g, "_");
    downloadBlob(blob, finalName.endsWith(".sb3") ? finalName : `${finalName}.sb3`);
    return { filename: finalName };
  }
  function focusTarget(target) {
    const vm = getVM();
    if (!target) return;
    if (vm.editingTarget !== target) {
      vm.setEditingTarget(target.id);
    }
    vm.emitWorkspaceUpdate();
  }
  function emitProjectChanged() {
    try {
      getRuntime().emitProjectChanged();
    } catch {
    }
  }
  async function pushSnapshot(label = "AI \u4FEE\u6539") {
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
  function snapshotCount() {
    return snapshots.length;
  }
  function redoCount() {
    return redoSnapshots.length;
  }
  async function restoreLastSnapshot() {
    const snapshot = snapshots.pop();
    if (!snapshot) throw new Error("\u6CA1\u6709\u53EF\u64A4\u9500\u7684 AI \u4FEE\u6539\u3002");
    const vm = getVM();
    const editingName = vm.editingTarget ? vm.editingTarget.getName() : null;
    let redoEntry = null;
    try {
      redoEntry = { json: vm.toJSON(), label: "\u64A4\u9500\u524D\u72B6\u6001", at: Date.now() };
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
  async function redoLastSnapshot() {
    const snapshot = redoSnapshots.pop();
    if (!snapshot) throw new Error("\u6CA1\u6709\u53EF\u91CD\u505A\u7684\u4FEE\u6539\u3002");
    const vm = getVM();
    const editingName = vm.editingTarget ? vm.editingTarget.getName() : null;
    let undoEntry = null;
    try {
      undoEntry = { json: vm.toJSON(), label: "\u91CD\u505A\u524D\u72B6\u6001", at: Date.now() };
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

  // src/agent/prompt.js
  var SYSTEM_PROMPT = `You are OpenBlocks, an expert Scratch 3 / TurboWarp project engineer embedded directly inside the TurboWarp editor. You can chat with the user and modify the live project by calling tools.

# Core behavior
- Respond in the same language as the user. Default to Simplified Chinese when the user writes Chinese.
- Be concrete, friendly, and concise. Explain what you changed and how to test it.
- Never claim that you changed the project unless a tool result confirms it.
- Inspect the project before complex edits. Use get_project. Use get_block_catalog when you are unsure about an opcode, input name, field name, or dropdown value.
- For multi-step work, call update_plan and keep the plan current.
- Build in small, verifiable batches. After building, use get_project detail="scripts" to verify, then run_project when it makes sense.
- If a tool returns an error, read the error and fix the cause. Do not repeat the same failing call.
- Do not delete or clear the user's work unless they explicitly asked for it. Destructive tools may require user confirmation.
- Prefer existing sprites, costumes, variables, and lists. Create new ones only when needed.
- Do not use eval, JavaScript blocks, or external scripts unless the user explicitly asks and the tool exists. You only have the provided tools.

# Multi-sprite projects
- The project can contain many sprites plus the Stage. Never assume the editing target is the only character.
- get_project returns the full sprite list. Every block/part tool accepts an explicit target: add_script, edit_block, delete_block, insert_block, move_block, create_variable, rename_variable, delete_variable, add_costume, rename_costume, delete_costume, rename_sound, delete_sound, set_sprite, create_sprite, delete_sprite, etc.
- When a feature spans multiple sprites, edit each sprite separately and coordinate with broadcasts and global variables on the Stage.
- To inspect another sprite's blocks, call get_project detail="scripts" with target="SpriteName". Do not rely only on the editing target.
- The Stage is a valid target for backdrop scripts, global variables and Stage-level scripts.

# How to build blocks
Use add_script. Each script is a JSON block object:
{
  "opcode": "event_whenflagclicked",
  "next": [
    { "opcode": "motion_movesteps", "inputs": { "STEPS": 10 } },
    {
      "opcode": "control_repeat",
      "inputs": { "TIMES": 10 },
      "substacks": {
        "SUBSTACK": [
          { "opcode": "motion_turnright", "inputs": { "DEGREES": 15 } }
        ]
      }
    }
  ]
}

Rules:
- "next" is an array of stack blocks. It creates the vertical sequence.
- C-blocks use "substacks": { "SUBSTACK": [...] } and, for if-else, also "SUBSTACK2": [...].
- "inputs" use the exact input names from Scratch. Values can be:
  - number or string literal, e.g. STEPS: 10, MESSAGE: "Hello"
  - { "variable": "score" } for a variable reporter
  - { "list": "items" } for a list reporter
  - { "broadcast": "start" } for a broadcast menu input
  - { "color": "#ff0000" } for a color input
  - { "menu": "costume1" } for a menu input when you want to be explicit
  - a nested reporter, e.g. { "opcode": "operator_add", "inputs": { "NUM1": 1, "NUM2": 2 } }
- "fields" hold dropdown values, e.g. { "fields": { "KEY_OPTION": "space" } }, { "fields": { "VARIABLE": "score" } }, { "fields": { "BROADCAST_OPTION": "start" } }.
- For a variable or list field, use the variable name. The builder resolves the id. If it does not exist, it is auto-created globally unless auto_create_variables is false.
- For menu inputs such as COSTUME, BACKDROP, SOUND_MENU, TO, TOWARDS, TOUCHINGOBJECTMENU, KEY_OPTION, CLONE_OPTION, BROADCAST_INPUT, pass a plain string. The builder creates the correct hidden menu block.
- Boolean inputs (CONDITION, OPERAND, OPERAND1, OPERAND2) must receive a boolean reporter such as operator_gt, operator_lt, operator_equals, operator_and, operator_or, operator_not, sensing_touchingobject, or sensing_keypressed. Do not pass the literal true/false.
- Every runnable script should start with a hat block: event_whenflagclicked, event_whenkeypressed, event_whenbroadcastreceived, event_whenthisspriteclicked, control_start_as_clone, etc.
- Use exact opcodes. Common ones are listed below, but call get_block_catalog for anything uncertain.

# Editing existing blocks in place
You can modify existing scripts without rebuilding them:
- Call get_project with detail="scripts" to get each script's readable text plus a blocks array. Each block entry has id, opcode, parent, next, topLevel, inputs and fields. Use those ids.
- edit_block changes fields/inputs/substacks on one block in place. Use it for changing a number, text, dropdown, variable reference, nested reporter or C-block branch. Set an input to null to remove it.
- delete_block removes one block. mode="block" (default) deletes just that block and its branches, then reconnects the following stack; mode="chain" also deletes everything below it; mode="script" deletes the whole top-level script.
- insert_block adds a new block after/before an anchor, at the start of a SUBSTACK/SUBSTACK2, or into an input (position="input").
- move_block moves an existing block after an anchor, into a substack, or into an input. with_next defaults to true, moving the block and the stack below it; set with_next=false to move only the block.
- Do not edit hidden shadow/menu blocks directly. Change the parent block's input instead (e.g. set COSTUME on looks_switchcostumeto).
- Variables, lists and broadcasts can be renamed with rename_variable and deleted with delete_variable. Costumes can be renamed/deleted with rename_costume/delete_costume; sounds with rename_sound/delete_sound. Pass the correct target for every part.
- Prefer in-place editing for small changes. Use delete_script/clear_scripts + add_script only when the whole script must be rebuilt.
- After block-level edits, call get_project detail="scripts" to verify the parent/next links, then run_project when appropriate.

# Common opcode cheat sheet
Events: event_whenflagclicked; event_whenkeypressed {KEY_OPTION}; event_whenbroadcastreceived {BROADCAST_OPTION}; event_broadcast / event_broadcastandwait {BROADCAST_INPUT}; event_whenthisspriteclicked.
Control: control_wait {DURATION}; control_repeat {TIMES, SUBSTACK}; control_forever {SUBSTACK}; control_if {CONDITION, SUBSTACK}; control_if_else {CONDITION, SUBSTACK, SUBSTACK2}; control_wait_until {CONDITION}; control_repeat_until {CONDITION, SUBSTACK}; control_while {CONDITION, SUBSTACK}; control_stop {STOP_OPTION}; control_start_as_clone; control_create_clone_of {CLONE_OPTION}; control_delete_this_clone.
Motion: motion_movesteps {STEPS}; motion_turnright / motion_turnleft {DEGREES}; motion_gotoxy {X, Y}; motion_goto {TO}; motion_glidesecstoxy {SECS, X, Y}; motion_pointindirection {DIRECTION}; motion_pointtowards {TOWARDS}; motion_changexby {DX}; motion_setx {X}; motion_changeyby {DY}; motion_sety {Y}; motion_ifonedgebounce; motion_xposition; motion_yposition; motion_direction.
Looks: looks_say {MESSAGE}; looks_sayforsecs {MESSAGE, SECS}; looks_think {MESSAGE}; looks_switchcostumeto {COSTUME}; looks_nextcostume; looks_switchbackdropto {BACKDROP}; looks_setsizeto {SIZE}; looks_changesizeby {CHANGE}; looks_show; looks_hide; looks_changeeffectby {CHANGE, EFFECT}; looks_seteffectto {VALUE, EFFECT}; looks_cleargraphiceffects; looks_gotofrontback {FRONT_BACK}; looks_size.
Sound: sound_play {SOUND_MENU}; sound_playuntildone {SOUND_MENU}; sound_stopallsounds; sound_setvolumeto {VOLUME}; sound_changevolumeby {VOLUME}; sound_volume.
Sensing: sensing_touchingobject {TOUCHINGOBJECTMENU}; sensing_touchingcolor {COLOR}; sensing_distanceto {DISTANCETOMENU}; sensing_keypressed {KEY_OPTION}; sensing_mousedown; sensing_mousex; sensing_mousey; sensing_timer; sensing_resettimer; sensing_askandwait {QUESTION}; sensing_answer; sensing_loudness; sensing_current {CURRENTMENU}; sensing_dayssince2000; sensing_username.
Operators: operator_add / operator_subtract / operator_multiply / operator_divide {NUM1, NUM2}; operator_random {FROM, TO}; operator_gt / operator_lt / operator_equals {OPERAND1, OPERAND2}; operator_and / operator_or {OPERAND1, OPERAND2}; operator_not {OPERAND}; operator_join {STRING1, STRING2}; operator_letter_of {LETTER, STRING}; operator_length {STRING}; operator_contains {STRING1, STRING2}; operator_mod {NUM1, NUM2}; operator_round {NUM}; operator_mathop {NUM, OPERATOR}.
Variables: data_variable {VARIABLE}; data_setvariableto {VALUE, VARIABLE}; data_changevariableby {VALUE, VARIABLE}; data_showvariable / data_hidevariable {VARIABLE}; data_listcontents {LIST}; data_addtolist {ITEM, LIST}; data_deleteoflist {INDEX, LIST}; data_deletealloflist {LIST}; data_insertatlist {ITEM, INDEX, LIST}; data_replaceitemoflist {INDEX, ITEM, LIST}; data_itemoflist {INDEX, LIST}; data_itemnumoflist {ITEM, LIST}; data_lengthoflist {LIST}; data_listcontainsitem {ITEM, LIST}.

# Coordinate and design guidance
- Stage coordinates are x: -240..240 and y: -180..180. Center is (0, 0).
- Use clones for bullets, enemies, particles, and repeated objects. A clone script starts with control_start_as_clone and should eventually call control_delete_this_clone.
- Use broadcasts to coordinate multiple sprites and game states.
- Use variables for score, lives, timers, level, and state. Use lists for inventories, high scores, maps, or queues.
- When making a game, include a start/instruction state, a game loop, win/lose conditions, and a restart path.
- Keep scripts readable: group related blocks, avoid duplicating huge scripts, and use clear variable names.
- If the user asks for a costume or simple art, generate a clean SVG string and use add_costume. SVG is preferred.
- If the user asks for a full project, plan first, then build incrementally and verify.

# Conversation style
- If the request is ambiguous, ask one concise clarifying question instead of guessing on major design choices.
- When you finish, summarize the created sprites, variables, controls, and how to test.
- Do not dump raw JSON or tool arguments into the final answer. Describe the result in natural language.
- You may use short markdown lists and inline code. Keep the final answer focused.`;
  function buildSystemMessages(settings, contextText) {
    const parts = [SYSTEM_PROMPT];
    if (settings.systemPromptExtra && settings.systemPromptExtra.trim()) {
      parts.push(`# User's extra instructions
${settings.systemPromptExtra.trim()}`);
    }
    if (settings.autoContext !== false && contextText) {
      parts.push(`# Live project context
This is a snapshot of the current project. Re-read with get_project if you need more detail.
${contextText}`);
    }
    return [{ role: "system", content: parts.join("\n\n") }];
  }

  // src/vm/catalog.js
  var b = (opcode, type, category, inputs = {}, fields = {}, note = "") => ({
    opcode,
    type,
    category,
    inputs,
    fields,
    note
  });
  var BLOCKS = [
    b("event_whenflagclicked", "hat", "events", {}, {}, "Runs when the green flag is clicked."),
    b("event_whenkeypressed", "hat", "events", {}, { KEY_OPTION: ["space", "up arrow", "down arrow", "right arrow", "left arrow", "any", "a", "b", "c", "d", "1", "2", "3"] }, "Runs when a key is pressed."),
    b("event_whenthisspriteclicked", "hat", "events", {}, {}, "Runs when this sprite is clicked."),
    b("event_whenstageclicked", "hat", "events", {}, {}, "Runs when the stage is clicked."),
    b("event_whenbackdropswitchesto", "hat", "events", {}, { BACKDROP: "backdrop" }, "Runs when the backdrop switches to a named backdrop."),
    b("event_whengreaterthan", "hat", "events", { VALUE: "number" }, { WHENGREATERTHANMENU: ["LOUDNESS", "TIMER"] }, "Runs when loudness or timer is greater than VALUE."),
    b("event_whenbroadcastreceived", "hat", "events", {}, { BROADCAST_OPTION: "broadcast" }, "Runs when a broadcast message is received."),
    b("event_broadcast", "stack", "events", { BROADCAST_INPUT: "broadcast" }, {}, "Sends a broadcast message and continues."),
    b("event_broadcastandwait", "stack", "events", { BROADCAST_INPUT: "broadcast" }, {}, "Sends a broadcast and waits for receivers."),
    b("motion_movesteps", "stack", "motion", { STEPS: "number" }, {}, "Moves forward by STEPS."),
    b("motion_turnright", "stack", "motion", { DEGREES: "number" }, {}, "Turns clockwise by DEGREES."),
    b("motion_turnleft", "stack", "motion", { DEGREES: "number" }, {}, "Turns counter-clockwise by DEGREES."),
    b("motion_goto", "stack", "motion", { TO: "menu" }, {}, "Goes to a sprite, mouse pointer, or random position."),
    b("motion_gotoxy", "stack", "motion", { X: "number", Y: "number" }, {}, "Goes to X, Y."),
    b("motion_glideto", "stack", "motion", { SECS: "number", TO: "menu" }, {}, "Glides to a target in SECS seconds."),
    b("motion_glidesecstoxy", "stack", "motion", { SECS: "number", X: "number", Y: "number" }, {}, "Glides to X, Y in SECS seconds."),
    b("motion_pointindirection", "stack", "motion", { DIRECTION: "number" }, {}, "Points in a direction (90 is right)."),
    b("motion_pointtowards", "stack", "motion", { TOWARDS: "menu" }, {}, "Points towards a target."),
    b("motion_changexby", "stack", "motion", { DX: "number" }, {}, "Changes x by DX."),
    b("motion_setx", "stack", "motion", { X: "number" }, {}, "Sets x to X."),
    b("motion_changeyby", "stack", "motion", { DY: "number" }, {}, "Changes y by DY."),
    b("motion_sety", "stack", "motion", { Y: "number" }, {}, "Sets y to Y."),
    b("motion_ifonedgebounce", "stack", "motion", {}, {}, "Bounces if touching the edge."),
    b("motion_setrotationstyle", "stack", "motion", {}, { STYLE: ["left-right", "don't rotate", "all around"] }, "Sets the rotation style."),
    b("motion_xposition", "reporter", "motion", {}, {}, "Returns x position."),
    b("motion_yposition", "reporter", "motion", {}, {}, "Returns y position."),
    b("motion_direction", "reporter", "motion", {}, {}, "Returns direction."),
    b("looks_say", "stack", "looks", { MESSAGE: "string" }, {}, "Shows a speech bubble."),
    b("looks_sayforsecs", "stack", "looks", { MESSAGE: "string", SECS: "number" }, {}, "Shows a speech bubble for SECS seconds."),
    b("looks_think", "stack", "looks", { MESSAGE: "string" }, {}, "Shows a thought bubble."),
    b("looks_thinkforsecs", "stack", "looks", { MESSAGE: "string", SECS: "number" }, {}, "Shows a thought bubble for SECS seconds."),
    b("looks_show", "stack", "looks", {}, {}, "Shows the sprite."),
    b("looks_hide", "stack", "looks", {}, {}, "Hides the sprite."),
    b("looks_switchcostumeto", "stack", "looks", { COSTUME: "menu" }, {}, "Switches to a costume."),
    b("looks_nextcostume", "stack", "looks", {}, {}, "Switches to the next costume."),
    b("looks_switchbackdropto", "stack", "looks", { BACKDROP: "menu" }, {}, "Switches the backdrop."),
    b("looks_switchbackdroptoandwait", "stack", "looks", { BACKDROP: "menu" }, {}, "Switches the backdrop and waits."),
    b("looks_nextbackdrop", "stack", "looks", {}, {}, "Switches to the next backdrop."),
    b("looks_changesizeby", "stack", "looks", { CHANGE: "number" }, {}, "Changes size by CHANGE."),
    b("looks_setsizeto", "stack", "looks", { SIZE: "number" }, {}, "Sets size to SIZE percent."),
    b("looks_changeeffectby", "stack", "looks", { CHANGE: "number" }, { EFFECT: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"] }, "Changes a graphic effect."),
    b("looks_seteffectto", "stack", "looks", { VALUE: "number" }, { EFFECT: ["color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost"] }, "Sets a graphic effect."),
    b("looks_cleargraphiceffects", "stack", "looks", {}, {}, "Clears all graphic effects."),
    b("looks_gotofrontback", "stack", "looks", {}, { FRONT_BACK: ["front", "back"] }, "Moves to the front or back layer."),
    b("looks_goforwardbackward", "stack", "looks", { NUM: "number" }, { FORWARD_BACKWARD: ["forward", "backward"] }, "Moves a number of layers forward or backward."),
    b("looks_costumenumbername", "reporter", "looks", {}, { NUMBER_NAME: ["number", "name"] }, "Returns costume number or name."),
    b("looks_backdropnumbername", "reporter", "looks", {}, { NUMBER_NAME: ["number", "name"] }, "Returns backdrop number or name."),
    b("looks_size", "reporter", "looks", {}, {}, "Returns size percent."),
    b("sound_play", "stack", "sound", { SOUND_MENU: "menu" }, {}, "Plays a sound."),
    b("sound_playuntildone", "stack", "sound", { SOUND_MENU: "menu" }, {}, "Plays a sound and waits."),
    b("sound_stopallsounds", "stack", "sound", {}, {}, "Stops all sounds."),
    b("sound_changeeffectby", "stack", "sound", { VALUE: "number" }, { EFFECT: ["pitch", "pan"] }, "Changes a sound effect."),
    b("sound_seteffectto", "stack", "sound", { VALUE: "number" }, { EFFECT: ["pitch", "pan"] }, "Sets a sound effect."),
    b("sound_cleareffects", "stack", "sound", {}, {}, "Clears sound effects."),
    b("sound_changevolumeby", "stack", "sound", { VOLUME: "number" }, {}, "Changes volume by VOLUME."),
    b("sound_setvolumeto", "stack", "sound", { VOLUME: "number" }, {}, "Sets volume to VOLUME."),
    b("sound_volume", "reporter", "sound", {}, {}, "Returns volume."),
    b("control_wait", "stack", "control", { DURATION: "number" }, {}, "Waits DURATION seconds."),
    b("control_repeat", "stack", "control", { TIMES: "number" }, {}, "Repeats the SUBSTACK TIMES times."),
    b("control_forever", "stack", "control", {}, {}, "Repeats the SUBSTACK forever."),
    b("control_if", "stack", "control", { CONDITION: "boolean" }, {}, "Runs SUBSTACK if CONDITION is true."),
    b("control_if_else", "stack", "control", { CONDITION: "boolean" }, {}, "Runs SUBSTACK if true, SUBSTACK2 otherwise."),
    b("control_wait_until", "stack", "control", { CONDITION: "boolean" }, {}, "Waits until CONDITION is true."),
    b("control_repeat_until", "stack", "control", { CONDITION: "boolean" }, {}, "Repeats SUBSTACK until CONDITION is true."),
    b("control_while", "stack", "control", { CONDITION: "boolean" }, {}, "TurboWarp: repeats SUBSTACK while CONDITION is true."),
    b("control_stop", "stack", "control", {}, { STOP_OPTION: ["all", "this script", "other scripts in sprite"] }, "Stops scripts."),
    b("control_start_as_clone", "hat", "control", {}, {}, "Runs when a clone starts."),
    b("control_create_clone_of", "stack", "control", { CLONE_OPTION: "menu" }, {}, "Creates a clone."),
    b("control_delete_this_clone", "stack", "control", {}, {}, "Deletes this clone."),
    b("sensing_touchingobject", "boolean", "sensing", { TOUCHINGOBJECTMENU: "menu" }, {}, "True if touching a target."),
    b("sensing_touchingcolor", "boolean", "sensing", { COLOR: "color" }, {}, "True if touching a color."),
    b("sensing_coloristouchingcolor", "boolean", "sensing", { COLOR: "color", COLOR2: "color" }, {}, "True if a color is touching another color."),
    b("sensing_distanceto", "reporter", "sensing", { DISTANCETOMENU: "menu" }, {}, "Returns distance to a target."),
    b("sensing_askandwait", "stack", "sensing", { QUESTION: "string" }, {}, "Asks a question and waits."),
    b("sensing_answer", "reporter", "sensing", {}, {}, "Returns the answer."),
    b("sensing_keypressed", "boolean", "sensing", { KEY_OPTION: "menu" }, {}, "True if a key is pressed."),
    b("sensing_mousedown", "boolean", "sensing", {}, {}, "True if the mouse is down."),
    b("sensing_mousex", "reporter", "sensing", {}, {}, "Returns mouse x."),
    b("sensing_mousey", "reporter", "sensing", {}, {}, "Returns mouse y."),
    b("sensing_setdragmode", "stack", "sensing", {}, { DRAG_MODE: ["draggable", "not draggable"] }, "Sets draggable mode."),
    b("sensing_loudness", "reporter", "sensing", {}, {}, "Returns loudness."),
    b("sensing_timer", "reporter", "sensing", {}, {}, "Returns timer."),
    b("sensing_resettimer", "stack", "sensing", {}, {}, "Resets the timer."),
    b("sensing_of", "reporter", "sensing", { OBJECT: "menu" }, { PROPERTY: ["x position", "y position", "direction", "costume #", "costume name", "size", "volume", "layer #"] }, "Returns a property of a target."),
    b("sensing_current", "reporter", "sensing", {}, { CURRENTMENU: ["year", "month", "date", "dayofweek", "hour", "minute", "second"] }, "Returns current date/time part."),
    b("sensing_dayssince2000", "reporter", "sensing", {}, {}, "Returns days since 2000."),
    b("sensing_username", "reporter", "sensing", {}, {}, "Returns username."),
    b("operator_add", "reporter", "operators", { NUM1: "number", NUM2: "number" }, {}, "Adds NUM1 and NUM2."),
    b("operator_subtract", "reporter", "operators", { NUM1: "number", NUM2: "number" }, {}, "Subtracts NUM2 from NUM1."),
    b("operator_multiply", "reporter", "operators", { NUM1: "number", NUM2: "number" }, {}, "Multiplies NUM1 and NUM2."),
    b("operator_divide", "reporter", "operators", { NUM1: "number", NUM2: "number" }, {}, "Divides NUM1 by NUM2."),
    b("operator_random", "reporter", "operators", { FROM: "number", TO: "number" }, {}, "Returns a random number between FROM and TO."),
    b("operator_gt", "boolean", "operators", { OPERAND1: "any", OPERAND2: "any" }, {}, "True if OPERAND1 > OPERAND2."),
    b("operator_lt", "boolean", "operators", { OPERAND1: "any", OPERAND2: "any" }, {}, "True if OPERAND1 < OPERAND2."),
    b("operator_equals", "boolean", "operators", { OPERAND1: "any", OPERAND2: "any" }, {}, "True if OPERAND1 = OPERAND2."),
    b("operator_and", "boolean", "operators", { OPERAND1: "boolean", OPERAND2: "boolean" }, {}, "Logical AND."),
    b("operator_or", "boolean", "operators", { OPERAND1: "boolean", OPERAND2: "boolean" }, {}, "Logical OR."),
    b("operator_not", "boolean", "operators", { OPERAND: "boolean" }, {}, "Logical NOT."),
    b("operator_join", "reporter", "operators", { STRING1: "string", STRING2: "string" }, {}, "Joins two strings."),
    b("operator_letter_of", "reporter", "operators", { LETTER: "number", STRING: "string" }, {}, "Returns a letter of a string."),
    b("operator_length", "reporter", "operators", { STRING: "string" }, {}, "Returns string length."),
    b("operator_contains", "boolean", "operators", { STRING1: "string", STRING2: "string" }, {}, "True if STRING1 contains STRING2."),
    b("operator_mod", "reporter", "operators", { NUM1: "number", NUM2: "number" }, {}, "Returns NUM1 mod NUM2."),
    b("operator_round", "reporter", "operators", { NUM: "number" }, {}, "Rounds NUM."),
    b("operator_mathop", "reporter", "operators", { NUM: "number" }, { OPERATOR: ["abs", "floor", "ceiling", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "e ^", "10 ^"] }, "Applies a math operation."),
    b("data_variable", "reporter", "variables", {}, { VARIABLE: "variable" }, "Returns a variable."),
    b("data_setvariableto", "stack", "variables", { VALUE: "any" }, { VARIABLE: "variable" }, "Sets a variable."),
    b("data_changevariableby", "stack", "variables", { VALUE: "number" }, { VARIABLE: "variable" }, "Changes a variable by VALUE."),
    b("data_showvariable", "stack", "variables", {}, { VARIABLE: "variable" }, "Shows a variable monitor."),
    b("data_hidevariable", "stack", "variables", {}, { VARIABLE: "variable" }, "Hides a variable monitor."),
    b("data_listcontents", "reporter", "variables", {}, { LIST: "list" }, "Returns a list."),
    b("data_addtolist", "stack", "variables", { ITEM: "any" }, { LIST: "list" }, "Adds ITEM to a list."),
    b("data_deleteoflist", "stack", "variables", { INDEX: "number" }, { LIST: "list" }, "Deletes an item from a list."),
    b("data_deletealloflist", "stack", "variables", {}, { LIST: "list" }, "Deletes all items from a list."),
    b("data_insertatlist", "stack", "variables", { ITEM: "any", INDEX: "number" }, { LIST: "list" }, "Inserts ITEM at INDEX."),
    b("data_replaceitemoflist", "stack", "variables", { INDEX: "number", ITEM: "any" }, { LIST: "list" }, "Replaces an item in a list."),
    b("data_itemoflist", "reporter", "variables", { INDEX: "number" }, { LIST: "list" }, "Returns an item of a list."),
    b("data_itemnumoflist", "reporter", "variables", { ITEM: "any" }, { LIST: "list" }, "Returns the index of an item."),
    b("data_lengthoflist", "reporter", "variables", {}, { LIST: "list" }, "Returns list length."),
    b("data_listcontainsitem", "boolean", "variables", { ITEM: "any" }, { LIST: "list" }, "True if a list contains ITEM."),
    b("data_showlist", "stack", "variables", {}, { LIST: "list" }, "Shows a list monitor."),
    b("data_hidelist", "stack", "variables", {}, { LIST: "list" }, "Hides a list monitor.")
  ];
  var CATEGORIES = [...new Set(BLOCKS.map((block) => block.category))];
  var BLOCK_BY_OPCODE = new Map(BLOCKS.map((block) => [block.opcode, block]));
  function searchCatalog(query, category, limit = 40) {
    const q = String(query || "").trim().toLowerCase();
    let results = BLOCKS;
    if (category) {
      results = results.filter((block) => block.category === String(category).toLowerCase());
    }
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      results = results.filter((block) => {
        const haystack = [
          block.opcode,
          block.category,
          block.type,
          block.note,
          ...Object.keys(block.inputs || {}),
          ...Object.keys(block.fields || {})
        ].join(" ").toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
    }
    return results.slice(0, limit);
  }
  function formatCatalogBlock(block) {
    return {
      opcode: block.opcode,
      type: block.type,
      category: block.category,
      inputs: block.inputs,
      fields: block.fields,
      note: block.note
    };
  }

  // src/vm/builder.js
  var MENU_SHADOWS = {
    "looks_switchcostumeto:COSTUME": { opcode: "looks_costume", field: "COSTUME" },
    "looks_switchbackdropto:BACKDROP": { opcode: "looks_backdrops", field: "BACKDROP" },
    "looks_switchbackdroptoandwait:BACKDROP": { opcode: "looks_backdrops", field: "BACKDROP" },
    "sound_play:SOUND_MENU": { opcode: "sound_sounds_menu", field: "SOUND_MENU" },
    "sound_playuntildone:SOUND_MENU": { opcode: "sound_sounds_menu", field: "SOUND_MENU" },
    "motion_goto:TO": { opcode: "motion_goto_menu", field: "TO" },
    "motion_glideto:TO": { opcode: "motion_glideto_menu", field: "TO" },
    "motion_pointtowards:TOWARDS": { opcode: "motion_pointtowards_menu", field: "TOWARDS" },
    "sensing_touchingobject:TOUCHINGOBJECTMENU": { opcode: "sensing_touchingobjectmenu", field: "TOUCHINGOBJECTMENU" },
    "sensing_distanceto:DISTANCETOMENU": { opcode: "sensing_distancetomenu", field: "DISTANCETOMENU" },
    "sensing_keypressed:KEY_OPTION": { opcode: "sensing_keyoptions", field: "KEY_OPTION" },
    "sensing_of:OBJECT": { opcode: "sensing_of_object_menu", field: "OBJECT" },
    "control_create_clone_of:CLONE_OPTION": { opcode: "control_create_clone_of_menu", field: "CLONE_OPTION" },
    "event_broadcast:BROADCAST_INPUT": { opcode: "event_broadcast_menu", field: "BROADCAST_OPTION", broadcast: true },
    "event_broadcastandwait:BROADCAST_INPUT": { opcode: "event_broadcast_menu", field: "BROADCAST_OPTION", broadcast: true }
  };
  var MENU_BY_INPUT = {
    COSTUME: { opcode: "looks_costume", field: "COSTUME" },
    BACKDROP: { opcode: "looks_backdrops", field: "BACKDROP" },
    SOUND_MENU: { opcode: "sound_sounds_menu", field: "SOUND_MENU" },
    TOWARDS: { opcode: "motion_pointtowards_menu", field: "TOWARDS" },
    TOUCHINGOBJECTMENU: { opcode: "sensing_touchingobjectmenu", field: "TOUCHINGOBJECTMENU" },
    DISTANCETOMENU: { opcode: "sensing_distancetomenu", field: "DISTANCETOMENU" },
    KEY_OPTION: { opcode: "sensing_keyoptions", field: "KEY_OPTION" },
    OBJECT: { opcode: "sensing_of_object_menu", field: "OBJECT" },
    CLONE_OPTION: { opcode: "control_create_clone_of_menu", field: "CLONE_OPTION" },
    BROADCAST_INPUT: { opcode: "event_broadcast_menu", field: "BROADCAST_OPTION", broadcast: true }
  };
  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function blockInputType(opcode, inputName) {
    const definition = BLOCK_BY_OPCODE.get(opcode);
    return definition?.inputs?.[inputName] || "any";
  }
  function menuInfoFor(opcode, inputName) {
    return MENU_SHADOWS[`${opcode}:${inputName}`] || MENU_BY_INPUT[inputName] || null;
  }
  function variableTypeName(type) {
    if (type === "list") return "\u5217\u8868";
    if (type === "broadcast_msg") return "\u5E7F\u64AD";
    return "\u53D8\u91CF";
  }
  function findVariable(target, name, type, scope) {
    if (scope === "local" && target.isSprite && target.isSprite()) {
      return Object.values(target.variables || {}).find((variable) => variable.name === name && variable.type === type) || null;
    }
    return target.lookupVariableByNameAndType(name, type) || null;
  }
  function resolveVariable(target, name, type, scope, state) {
    const wantedName = String(name ?? "").trim();
    if (!wantedName) throw new Error("\u53D8\u91CF\u540D\u4E0D\u80FD\u4E3A\u7A7A\u3002");
    const found = findVariable(target, wantedName, type, scope);
    if (found) return found;
    if (!state.autoCreateVariables) {
      throw new Error(`${variableTypeName(type)} "${wantedName}" \u4E0D\u5B58\u5728\u3002\u8BF7\u5148\u7528 create_variable \u521B\u5EFA\uFF0C\u6216\u8BA9 add_script \u81EA\u52A8\u521B\u5EFA\u3002`);
    }
    const stage = getStage();
    const id = uid("var");
    stage.createVariable(id, wantedName, type);
    const variable = stage.variables[id];
    if (type === "broadcast_msg") variable.value = wantedName;
    else if (type === "list") variable.value = [];
    else variable.value = 0;
    state.createdVariables.push({
      name: wantedName,
      type: type === "list" ? "list" : type === "broadcast_msg" ? "broadcast" : "variable",
      scope: "global"
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
    if (isObject(rawValue) && Object.prototype.hasOwnProperty.call(rawValue, "value")) {
      rawValue = rawValue.value;
    }
    if (fieldName === "VARIABLE") {
      const name = isObject(rawValue) ? rawValue.name : rawValue;
      return variableField(target, fieldName, name, "", "auto", state);
    }
    if (fieldName === "LIST") {
      const name = isObject(rawValue) ? rawValue.name : rawValue;
      return variableField(target, fieldName, name, "list", "auto", state);
    }
    if (fieldName === "BROADCAST_OPTION") {
      const name = isObject(rawValue) ? rawValue.name : rawValue;
      return variableField(target, fieldName, name, "broadcast_msg", "global", state);
    }
    return {
      name: fieldName,
      value: rawValue
    };
  }
  function firstCostume(target) {
    try {
      return target.getCostumes()[0]?.name || "costume1";
    } catch {
      return "costume1";
    }
  }
  function firstSound(target) {
    try {
      return target.getSounds()[0]?.name || "pop";
    } catch {
      return "pop";
    }
  }
  function firstBroadcast() {
    const stage = getStage();
    const broadcast = Object.values(stage.variables || {}).find((variable) => variable.type === "broadcast_msg");
    return broadcast ? broadcast.name : "message1";
  }
  function defaultMenuValue(menu, target) {
    if (!menu) return "";
    switch (menu.opcode) {
      case "looks_costume":
        return firstCostume(target);
      case "looks_backdrops":
        return firstCostume(getStage());
      case "sound_sounds_menu":
        return firstSound(target);
      case "motion_goto_menu":
      case "motion_glideto_menu":
        return "_random_";
      case "motion_pointtowards_menu":
        return "_mouse_";
      case "sensing_touchingobjectmenu":
        return "_mouse_";
      case "sensing_distancetomenu":
        return "_mouse_";
      case "sensing_keyoptions":
        return "space";
      case "sensing_of_object_menu":
        return "_stage_";
      case "control_create_clone_of_menu":
        return "_myself_";
      case "event_broadcast_menu":
        return firstBroadcast();
      default:
        return "";
    }
  }
  function makeMenuShadow(target, menu, value, parentId, state) {
    const fieldValue2 = value === void 0 || value === null || value === "" ? defaultMenuValue(menu, target) : String(value);
    const field = {
      name: menu.field,
      value: fieldValue2
    };
    if (menu.broadcast) {
      const variable = resolveVariable(target, fieldValue2, "broadcast_msg", "global", state);
      field.value = variable.name;
      field.id = variable.id;
      field.variableType = "broadcast_msg";
    }
    const id = uid("b");
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
    const id = uid("b");
    let block;
    if (kind === "color") {
      block = {
        id,
        opcode: "colour_picker",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { COLOUR: { name: "COLOUR", value: String(value || "#ff0000") } },
        shadow: true,
        topLevel: false,
        x: 0,
        y: 0
      };
    } else if (kind === "number") {
      const number = Number(value);
      block = {
        id,
        opcode: "math_number",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { NUM: { name: "NUM", value: Number.isFinite(number) ? number : 0 } },
        shadow: true,
        topLevel: false,
        x: 0,
        y: 0
      };
    } else {
      block = {
        id,
        opcode: "text",
        next: null,
        parent: parentId,
        inputs: {},
        fields: { TEXT: { name: "TEXT", value: String(value ?? "") } },
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
    if (inputType === "boolean") return null;
    if (inputType === "color") {
      const primitive2 = makePrimitiveShadow("color", value, parentId);
      state.blocks.push(primitive2.block);
      return primitive2.id;
    }
    if (inputType === "number") {
      const primitive2 = makePrimitiveShadow("number", value, parentId);
      state.blocks.push(primitive2.block);
      return primitive2.id;
    }
    if (inputType === "any" && typeof value === "number") {
      const primitive2 = makePrimitiveShadow("number", value, parentId);
      state.blocks.push(primitive2.block);
      return primitive2.id;
    }
    const primitive = makePrimitiveShadow("text", value, parentId);
    state.blocks.push(primitive.block);
    return primitive.id;
  }
  function buildStack(specs, parentId, state) {
    if (!Array.isArray(specs) || specs.length === 0) return null;
    let firstId = null;
    let previousId = null;
    for (const spec of specs) {
      if (!isObject(spec)) {
        throw new Error("\u811A\u672C\u6570\u7EC4\u4E2D\u7684\u6BCF\u4E00\u9879\u90FD\u5FC5\u987B\u662F\u79EF\u6728\u5BF9\u8C61\u3002");
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
    if (!isObject(spec) || typeof spec.opcode !== "string" || !spec.opcode.trim()) {
      throw new Error('\u79EF\u6728\u7F3A\u5C11 opcode\u3002\u6BCF\u4E2A\u79EF\u6728\u5FC5\u987B\u5F62\u5982 {"opcode":"motion_movesteps","inputs":{"STEPS":10}}\u3002');
    }
    const opcode = spec.opcode.trim();
    const id = uid("b");
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
      if (inputName.startsWith("SUBSTACK") && Array.isArray(rawValue)) {
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
        throw new Error(`substacks.${branchName} \u5FC5\u987B\u662F\u6570\u7EC4\u3002`);
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
    if (rawValue === void 0 || rawValue === null) return null;
    const inputType = blockInputType(opcode, inputName);
    const menu = menuInfoFor(opcode, inputName);
    if (Array.isArray(rawValue)) {
      throw new Error(`\u8F93\u5165 ${inputName} \u4E0D\u652F\u6301\u6570\u7EC4\u3002\u5206\u652F\u8BF7\u4F7F\u7528 substacks \u6216 SUBSTACK \u6570\u7EC4\u3002`);
    }
    if (isObject(rawValue)) {
      if (rawValue.block && isObject(rawValue.block)) {
        const childId = createBlock(rawValue.block, parentId, false, 0, 0, state);
        const shadowId2 = makeShadow(target, opcode, inputName, inputType, void 0, parentId, state);
        return { block: childId, shadow: shadowId2 };
      }
      if (rawValue.raw && isObject(rawValue.raw)) {
        const childId = createBlock(rawValue.raw, parentId, false, 0, 0, state);
        const shadowId2 = makeShadow(target, opcode, inputName, inputType, void 0, parentId, state);
        return { block: childId, shadow: shadowId2 };
      }
      if (typeof rawValue.variable === "string") {
        const childId = createBlock(
          { opcode: "data_variable", fields: { VARIABLE: rawValue.variable } },
          parentId,
          false,
          0,
          0,
          state
        );
        const shadowId2 = makeShadow(target, opcode, inputName, inputType, void 0, parentId, state);
        return { block: childId, shadow: shadowId2 };
      }
      if (typeof rawValue.list === "string") {
        const childId = createBlock(
          { opcode: "data_listcontents", fields: { LIST: rawValue.list } },
          parentId,
          false,
          0,
          0,
          state
        );
        const shadowId2 = makeShadow(target, opcode, inputName, inputType, void 0, parentId, state);
        return { block: childId, shadow: shadowId2 };
      }
      if (typeof rawValue.broadcast === "string" && menu && menu.broadcast) {
        const shadowId2 = makeMenuShadow(target, menu, rawValue.broadcast, parentId, state);
        return { block: shadowId2, shadow: shadowId2 };
      }
      if (typeof rawValue.color === "string") {
        const shadowId2 = makeShadow(target, opcode, inputName, "color", rawValue.color, parentId, state);
        return { block: shadowId2, shadow: shadowId2 };
      }
      if (typeof rawValue.menu === "string") {
        const shadowId2 = makeShadow(target, opcode, inputName, inputType, rawValue.menu, parentId, state);
        return { block: shadowId2, shadow: shadowId2 };
      }
      if (typeof rawValue.number === "number") {
        const shadowId2 = makeShadow(target, opcode, inputName, "number", rawValue.number, parentId, state);
        return { block: shadowId2, shadow: shadowId2 };
      }
      if (typeof rawValue.text === "string") {
        const shadowId2 = makeShadow(target, opcode, inputName, "string", rawValue.text, parentId, state);
        return { block: shadowId2, shadow: shadowId2 };
      }
      if (typeof rawValue.opcode === "string") {
        const childId = createBlock(rawValue, parentId, false, 0, 0, state);
        const shadowId2 = makeShadow(target, opcode, inputName, inputType, void 0, parentId, state);
        return { block: childId, shadow: shadowId2 };
      }
      throw new Error(`\u65E0\u6CD5\u8BC6\u522B\u7684\u8F93\u5165 ${inputName}: ${JSON.stringify(rawValue)}`);
    }
    const shadowId = makeShadow(target, opcode, inputName, inputType, rawValue, parentId, state);
    if (shadowId === null) return null;
    return { block: shadowId, shadow: shadowId };
  }
  function normalizeMutation(mutation) {
    const result = { tagName: "mutation", children: [], ...mutation };
    if (Array.isArray(result.argumentids)) result.argumentids = JSON.stringify(result.argumentids);
    if (Array.isArray(result.argumentnames)) result.argumentnames = JSON.stringify(result.argumentnames);
    if (Array.isArray(result.argumentdefaults)) result.argumentdefaults = JSON.stringify(result.argumentdefaults);
    if (typeof result.warp === "boolean") result.warp = result.warp ? "true" : "false";
    if (typeof result.hasnext === "boolean") result.hasnext = result.hasnext ? "true" : "false";
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
      if (name === void 0 || name === null || name === "") continue;
      if (fieldName === "VARIABLE") refs.push({ name, type: "", scope: "auto" });
      else if (fieldName === "LIST") refs.push({ name, type: "list", scope: "auto" });
      else if (fieldName === "BROADCAST_OPTION") refs.push({ name, type: "broadcast_msg", scope: "global" });
    }
    for (const [inputName, rawValue] of Object.entries(spec.inputs || {})) {
      if (Array.isArray(rawValue)) {
        if (inputName.startsWith("SUBSTACK")) {
          for (const child of rawValue) collectVariableRefs(child, refs);
        }
        continue;
      }
      if (!isObject(rawValue)) continue;
      if (typeof rawValue.variable === "string") refs.push({ name: rawValue.variable, type: "", scope: "auto" });
      else if (typeof rawValue.list === "string") refs.push({ name: rawValue.list, type: "list", scope: "auto" });
      else if (typeof rawValue.broadcast === "string") refs.push({ name: rawValue.broadcast, type: "broadcast_msg", scope: "global" });
      else if (isObject(rawValue.block)) collectVariableRefs(rawValue.block, refs);
      else if (isObject(rawValue.raw)) collectVariableRefs(rawValue.raw, refs);
      else if (typeof rawValue.opcode === "string") collectVariableRefs(rawValue, refs);
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
      const existingId = existing && (typeof existing.getId === "function" ? existing.getId() : existing.id);
      if (existingId === variable.id) return;
      if (existing && map.deleteVariable) {
        try {
          map.deleteVariable(existing);
        } catch {
        }
      }
      if (map.createVariable) map.createVariable(variable.name, variable.type, variable.id);
    } catch {
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
      if (inputName.startsWith("SUBSTACK") && Array.isArray(value) && value.length) {
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
  function estimateBlockTreeHeight(blocks, blockId, seen = /* @__PURE__ */ new Set()) {
    if (!blockId || seen.has(blockId)) return 0;
    const block = blocks.getBlock(blockId);
    if (!block) return 0;
    seen.add(blockId);
    let height = 56;
    for (const [inputName, input] of Object.entries(block.inputs || {})) {
      if (inputName.startsWith("SUBSTACK") && input && input.block) {
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
      const height = estimateBlockTreeHeight(target.blocks, id, /* @__PURE__ */ new Set());
      bottom = Math.max(bottom, top + height);
    }
    return bottom;
  }
  async function addScripts({ target: targetName, scripts, script, blocks, x, y, autoCreateVariables = true } = {}) {
    const target = targetName ? requireTarget(targetName, true) : getTargetByName(null, true);
    if (!target) throw new Error("\u627E\u4E0D\u5230\u8981\u5199\u5165\u79EF\u6728\u7684\u89D2\u8272\u3002");
    const list = Array.isArray(scripts) ? scripts : Array.isArray(blocks) ? blocks : script ? [script] : null;
    if (!list || list.length === 0) throw new Error("scripts \u5FC5\u987B\u662F\u975E\u7A7A\u7684\u79EF\u6728\u6570\u7EC4\u3002");
    const state = {
      target,
      blocks: [],
      blockById: /* @__PURE__ */ new Map(),
      createdVariables: [],
      autoCreateVariables: autoCreateVariables !== false
    };
    const variableRefs = [];
    for (const spec of list) collectVariableRefs(spec, variableRefs);
    for (const ref of variableRefs) {
      resolveVariable(target, ref.name, ref.type, ref.scope, state);
    }
    if (state.createdVariables.length) {
      const vm2 = getVM();
      for (const created of state.createdVariables) {
        const stage = getStage();
        const variable = Object.values(stage.variables || {}).find((item) => item.name === created.name && (item.type || "") === (created.type === "list" ? "list" : created.type === "broadcast" ? "broadcast_msg" : ""));
        if (variable) syncWorkspaceVariable(variable);
      }
      vm2.emitWorkspaceUpdate();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const baseX = Number.isFinite(Number(x)) ? Number(x) : 48;
    const explicitBaseY = Number.isFinite(Number(y));
    const topIds = [];
    let cursorY = explicitBaseY ? Number(y) : Math.max(48, estimateExistingBottom(target) + 64);
    for (let i = 0; i < list.length; i++) {
      const spec = list[i];
      if (!isObject(spec)) throw new Error(`scripts[${i}] \u5FC5\u987B\u662F\u79EF\u6728\u5BF9\u8C61\u3002`);
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
  function deleteScript({ target: targetName, script_id } = {}) {
    const target = requireTarget(targetName, true);
    const blockId = String(script_id || "").trim();
    if (!blockId) throw new Error("script_id \u4E0D\u80FD\u4E3A\u7A7A\u3002");
    const block = target.blocks.getBlock(blockId);
    if (!block) throw new Error(`\u627E\u4E0D\u5230\u811A\u672C ${blockId}\u3002`);
    if (!block.topLevel) throw new Error(`${blockId} \u4E0D\u662F\u9876\u5C42\u811A\u672C\u3002\u8BF7\u4F7F\u7528 get_project \u83B7\u53D6\u811A\u672C id\u3002`);
    target.blocks.deleteBlock(blockId);
    target.blocks.resetCache();
    target.blocks.emitProjectChanged();
    getVM().emitWorkspaceUpdate();
    focusTarget(target);
    return { target: target.getName(), deleted: blockId };
  }
  function clearScripts({ target: targetName } = {}) {
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
    const seen = /* @__PURE__ */ new Set();
    while (current && current.next && !seen.has(current.next)) {
      seen.add(current.id);
      const next = blocks.getBlock(current.next);
      if (!next) break;
      current = next;
    }
    return current ? current.id : id;
  }
  function collectTreeIds(blocks, id, includeNext, set = /* @__PURE__ */ new Set()) {
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
    return BLOCK_BY_OPCODE.get(spec && spec.opcode)?.type || "stack";
  }
  function removeOldInputs(blocks, toDelete, keepBlock, keepShadow) {
    for (const id of toDelete) {
      if (!id || id === keepBlock || id === keepShadow || !blocks.getBlock(id)) continue;
      blocks.deleteBlock(id);
    }
  }
  function deleteBlock({ target: targetName, block_id, mode = "block" } = {}) {
    const target = requireTarget(targetName, true);
    const blocks = target.blocks;
    const block = blocks.getBlock(block_id);
    if (!block) throw new Error(`\u627E\u4E0D\u5230\u79EF\u6728 ${block_id}\u3002`);
    const normalizedMode = ["block", "chain", "script"].includes(mode) ? mode : "block";
    if (normalizedMode === "script") {
      const top = findTopLevelBlock(blocks, block);
      if (!top) throw new Error("\u627E\u4E0D\u5230\u6240\u5C5E\u7684\u9876\u5C42\u811A\u672C\u3002");
      blocks.deleteBlock(top.id);
      commitBlockChange(target);
      return { target: target.getName(), deleted: top.id, mode: "script", deletedTopLevel: true };
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
        throw new Error("\u8FD9\u662F\u88AB\u8986\u76D6\u7684\u9690\u85CF\u8F93\u5165\u79EF\u6728\uFF0C\u8BF7\u4FEE\u6539\u7236\u79EF\u6728\u7684\u8F93\u5165\uFF0C\u800C\u4E0D\u662F\u76F4\u63A5\u5220\u9664\u5B83\u3002");
      }
    }
    let reconnectedTo = null;
    if (parent.next === block.id) {
      if (normalizedMode === "chain") {
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
      if (normalizedMode === "chain") {
        if (inputRef.name.startsWith("SUBSTACK")) {
          inputRef.input.block = null;
        } else {
          inputRef.input.block = inputRef.input.shadow || null;
          if (!inputRef.input.block) delete parent.inputs[inputRef.name];
        }
      } else if (inputRef.name.startsWith("SUBSTACK")) {
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
  function editBlock({ target: targetName, block_id, fields, inputs, substacks, auto_create_variables = true } = {}) {
    const target = requireTarget(targetName, true);
    const blocks = target.blocks;
    const block = blocks.getBlock(block_id);
    if (!block) throw new Error(`\u627E\u4E0D\u5230\u79EF\u6728 ${block_id}\u3002`);
    if (!fields && !inputs && !substacks) {
      throw new Error("edit_block \u81F3\u5C11\u9700\u8981 fields\u3001inputs \u6216 substacks \u4E4B\u4E00\u3002");
    }
    const state = {
      target,
      blocks: [],
      blockById: /* @__PURE__ */ new Map(),
      createdVariables: [],
      autoCreateVariables: auto_create_variables !== false
    };
    const toDelete = /* @__PURE__ */ new Set();
    const scheduleDeleteInput = (input) => {
      if (!input) return;
      if (input.block) toDelete.add(input.block);
      if (input.shadow && input.shadow !== input.block) toDelete.add(input.shadow);
    };
    for (const [fieldName, value] of Object.entries(fields || {})) {
      if (value === void 0) continue;
      block.fields[fieldName] = makeField(target, fieldName, value, state);
    }
    for (const [inputName, value] of Object.entries(inputs || {})) {
      if (value === void 0) continue;
      const old = block.inputs[inputName];
      if (value === null) {
        delete block.inputs[inputName];
        scheduleDeleteInput(old);
        continue;
      }
      if (inputName.startsWith("SUBSTACK") && Array.isArray(value)) {
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
      if (!Array.isArray(branchSpecs)) throw new Error(`substacks.${branchName} \u5FC5\u987B\u662F\u6570\u7EC4\u3002`);
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
  function insertBlock({ target: targetName, block, position = "after", anchor_id, parent_id, input_name, auto_create_variables = true } = {}) {
    const target = requireTarget(targetName, true);
    const blocks = target.blocks;
    if (!isObject(block) || typeof block.opcode !== "string") {
      throw new Error("insert_block \u9700\u8981 block.opcode\u3002");
    }
    const pos = ["after", "before", "substack", "input"].includes(position) ? position : "after";
    const type = specType(block);
    if ((pos === "after" || pos === "before" || pos === "substack") && (type === "reporter" || type === "boolean")) {
      throw new Error('reporter/boolean \u79EF\u6728\u4E0D\u80FD\u63D2\u5165\u811A\u672C\u5806\u53E0\uFF0C\u8BF7\u4F7F\u7528 position="input"\u3002');
    }
    if ((pos === "after" || pos === "before") && type === "hat") {
      throw new Error("\u5E3D\u5B50\u79EF\u6728\u53EA\u80FD\u4F5C\u4E3A\u9876\u5C42\u811A\u672C\uFF0C\u8BF7\u4F7F\u7528 add_script\u3002");
    }
    if (pos === "input" && (type === "stack" || type === "hat")) {
      throw new Error("\u53EA\u652F\u6301\u628A reporter/boolean \u79EF\u6728\u63D2\u5165\u8F93\u5165\u6846\u3002");
    }
    const state = {
      target,
      blocks: [],
      blockById: /* @__PURE__ */ new Map(),
      createdVariables: [],
      autoCreateVariables: auto_create_variables !== false
    };
    let insertedId = null;
    if (pos === "after") {
      const anchor = blocks.getBlock(anchor_id);
      if (!anchor || anchor.shadow) throw new Error("anchor_id \u5FC5\u987B\u662F\u4E00\u4E2A\u53EF\u8FDE\u63A5\u7684\u666E\u901A\u79EF\u6728\u3002");
      const newId = createBlock(block, anchor.id, false, 0, 0, state);
      for (const newBlock2 of state.blocks) blocks.createBlock(newBlock2);
      const oldNext = anchor.next || null;
      const newBlock = blocks.getBlock(newId);
      anchor.next = newId;
      newBlock.parent = anchor.id;
      const last = lastInChain(blocks, newId);
      const lastBlock = blocks.getBlock(last);
      lastBlock.next = oldNext;
      if (oldNext) blocks.getBlock(oldNext).parent = last;
      insertedId = newId;
    } else if (pos === "before") {
      const anchor = blocks.getBlock(anchor_id);
      if (!anchor || anchor.shadow || anchor.topLevel) throw new Error("before \u9700\u8981\u4E00\u4E2A\u975E\u9876\u5C42\u7684\u666E\u901A\u79EF\u6728\u4F5C\u4E3A anchor_id\u3002");
      const parent = blocks.getBlock(anchor.parent);
      if (!parent) throw new Error("\u627E\u4E0D\u5230 anchor \u7684\u7236\u79EF\u6728\u3002");
      const inputRef = findInputRef(parent, anchor.id);
      const inStack = parent.next === anchor.id;
      const inSubstack = inputRef && inputRef.name.startsWith("SUBSTACK");
      if (!inStack && !inSubstack) throw new Error("anchor \u4E0D\u5728\u53EF\u63D2\u5165\u7684\u811A\u672C\u5806\u53E0\u4E2D\u3002");
      const newId = createBlock(block, parent.id, false, 0, 0, state);
      for (const newBlock2 of state.blocks) blocks.createBlock(newBlock2);
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
    } else if (pos === "substack") {
      const parent = blocks.getBlock(parent_id);
      if (!parent) throw new Error("\u627E\u4E0D\u5230 parent_id\u3002");
      const branch = input_name || "SUBSTACK";
      if (!branch.startsWith("SUBSTACK")) throw new Error("substack \u7684 input_name \u5FC5\u987B\u662F SUBSTACK / SUBSTACK2\u3002");
      const oldFirst = parent.inputs[branch]?.block || null;
      const newId = createBlock(block, parent.id, false, 0, 0, state);
      for (const newBlock2 of state.blocks) blocks.createBlock(newBlock2);
      const newBlock = blocks.getBlock(newId);
      const last = lastInChain(blocks, newId);
      blocks.getBlock(last).next = oldFirst;
      if (oldFirst) blocks.getBlock(oldFirst).parent = last;
      parent.inputs[branch] = { name: branch, block: newId, shadow: null };
      newBlock.parent = parent.id;
      insertedId = newId;
    } else {
      const parent = blocks.getBlock(parent_id);
      if (!parent) throw new Error("\u627E\u4E0D\u5230 parent_id\u3002");
      const inputName = input_name;
      if (!inputName) throw new Error('position="input" \u9700\u8981 input_name\u3002');
      const nextInput = makeInput(target, parent.opcode, inputName, block, parent.id, state);
      if (!nextInput) throw new Error("\u65E0\u6CD5\u6784\u5EFA\u8F93\u5165\u503C\u3002");
      const old = parent.inputs[inputName];
      const toDelete = /* @__PURE__ */ new Set();
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
  function moveBlock({ target: targetName, block_id, position = "after", anchor_id, parent_id, input_name, with_next = true } = {}) {
    const target = requireTarget(targetName, true);
    const blocks = target.blocks;
    const block = blocks.getBlock(block_id);
    if (!block) throw new Error(`\u627E\u4E0D\u5230\u79EF\u6728 ${block_id}\u3002`);
    if (block.shadow) throw new Error("\u4E0D\u80FD\u79FB\u52A8\u9690\u85CF\u7684\u83DC\u5355/\u5B57\u9762\u91CF\u79EF\u6728\u3002");
    if (block.topLevel) throw new Error("\u4E0D\u80FD\u79FB\u52A8\u9876\u5C42\u811A\u672C\uFF0C\u8BF7\u4F7F\u7528 delete_script + add_script \u91CD\u5EFA\u3002");
    const pos = ["after", "substack", "input"].includes(position) ? position : "after";
    const type = specType(block);
    if ((pos === "after" || pos === "substack") && (type === "reporter" || type === "boolean" || type === "hat")) {
      throw new Error("\u53EA\u6709\u666E\u901A\u5806\u53E0\u79EF\u6728\u53EF\u4EE5\u79FB\u52A8\u5230\u811A\u672C\u5806\u53E0\u6216\u5206\u652F\u4E2D\u3002");
    }
    if (pos === "input" && (type === "stack" || type === "hat")) {
      throw new Error("\u53EA\u6709 reporter/boolean \u79EF\u6728\u53EF\u4EE5\u79FB\u52A8\u5230\u8F93\u5165\u6846\u3002");
    }
    const movedIds = collectTreeIds(blocks, block.id, with_next !== false);
    let anchor = null;
    let parent = null;
    let oldNext = null;
    let oldFirst = null;
    let branch = input_name || null;
    if (pos === "after") {
      anchor = blocks.getBlock(anchor_id);
      if (!anchor || anchor.shadow) throw new Error("anchor_id \u5FC5\u987B\u662F\u4E00\u4E2A\u53EF\u8FDE\u63A5\u7684\u666E\u901A\u79EF\u6728\u3002");
      if (movedIds.has(anchor.id)) throw new Error("\u4E0D\u80FD\u628A\u79EF\u6728\u79FB\u52A8\u5230\u5B83\u81EA\u5DF1\u7684\u5B50\u6811\u91CC\u3002");
      oldNext = anchor.next || null;
      if (oldNext && movedIds.has(oldNext) && oldNext !== block.id) {
        throw new Error("\u76EE\u6807\u4F4D\u7F6E\u5728\u79EF\u6728\u81EA\u5DF1\u7684\u540E\u7EED\u94FE\u4E2D\uFF0C\u4F1A\u5F62\u6210\u5FAA\u73AF\u3002");
      }
      if (anchor.id === block.parent && anchor.next === block.id) {
        return { target: target.getName(), moved: block.id, position: pos, noop: true };
      }
    } else if (pos === "substack") {
      parent = blocks.getBlock(parent_id);
      if (!parent) throw new Error("\u627E\u4E0D\u5230 parent_id\u3002");
      if (movedIds.has(parent.id)) throw new Error("\u4E0D\u80FD\u628A\u79EF\u6728\u79FB\u52A8\u5230\u5B83\u81EA\u5DF1\u7684\u5B50\u6811\u91CC\u3002");
      branch = branch || "SUBSTACK";
      if (!branch.startsWith("SUBSTACK")) throw new Error("substack \u7684 input_name \u5FC5\u987B\u662F SUBSTACK / SUBSTACK2\u3002");
      oldFirst = parent.inputs[branch]?.block || null;
      if (oldFirst && movedIds.has(oldFirst)) throw new Error("\u76EE\u6807\u5206\u652F\u5728\u79EF\u6728\u81EA\u5DF1\u7684\u5B50\u6811\u91CC\uFF0C\u4F1A\u5F62\u6210\u5FAA\u73AF\u3002");
    } else {
      parent = blocks.getBlock(parent_id);
      if (!parent) throw new Error("\u627E\u4E0D\u5230 parent_id\u3002");
      if (movedIds.has(parent.id)) throw new Error("\u4E0D\u80FD\u628A\u79EF\u6728\u79FB\u52A8\u5230\u5B83\u81EA\u5DF1\u7684\u5B50\u6811\u91CC\u3002");
      if (!branch) throw new Error('position="input" \u9700\u8981 input_name\u3002');
      const existing = parent.inputs[branch];
      if (existing && existing.block && existing.block !== existing.shadow && existing.block !== block.id) {
        throw new Error("\u76EE\u6807\u8F93\u5165\u6846\u5DF2\u7ECF\u6709\u79EF\u6728\uFF0C\u8BF7\u5148\u5220\u9664\u6216\u7F16\u8F91\u76EE\u6807\u8F93\u5165\u3002");
      }
    }
    const currentParent = block.parent ? blocks.getBlock(block.parent) : null;
    if (!currentParent) throw new Error("\u627E\u4E0D\u5230\u79EF\u6728\u5F53\u524D\u7684\u7236\u7EA7\u8FDE\u63A5\u3002");
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
      if (currentInputRef.name.startsWith("SUBSTACK")) {
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
      throw new Error("\u627E\u4E0D\u5230\u79EF\u6728\u5F53\u524D\u7684\u8FDE\u63A5\u4F4D\u7F6E\u3002");
    }
    block.parent = null;
    if (pos === "after") {
      anchor.next = block.id;
      block.parent = anchor.id;
      const last = lastInChain(blocks, block.id);
      const lastBlock = blocks.getBlock(last);
      lastBlock.next = oldNext;
      if (oldNext) blocks.getBlock(oldNext).parent = last;
    } else if (pos === "substack") {
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
          blockById: /* @__PURE__ */ new Map(),
          createdVariables: [],
          autoCreateVariables: true
        };
        const shadowId = makeShadow(target, parent.opcode, branch, inputType, void 0, parent.id, state);
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

  // src/vm/parts.js
  function variableType(type) {
    return type === "list" ? "list" : type === "broadcast" ? "broadcast_msg" : "";
  }
  function findVariable2(target, name, type) {
    return target.lookupVariableByNameAndType(String(name || "").trim(), type) || null;
  }
  function variableHolder(target, variable) {
    if (target.variables && target.variables[variable.id]) return target;
    return getStage();
  }
  function costumeIndex(target, { name, index } = {}) {
    const costumes = target.getCostumes();
    let idx = Number(index);
    if (!Number.isFinite(idx)) idx = costumes.findIndex((costume) => costume.name === name);
    if (idx < 0 || idx >= costumes.length) {
      throw new Error(`\u627E\u4E0D\u5230\u9020\u578B "${name ?? index}"\u3002\u53EF\u7528\u9020\u578B: ${costumes.map((c) => c.name).join(", ")}`);
    }
    return idx;
  }
  function soundIndex(target, { name, index } = {}) {
    const sounds = target.getSounds();
    let idx = Number(index);
    if (!Number.isFinite(idx)) idx = sounds.findIndex((sound) => sound.name === name);
    if (idx < 0 || idx >= sounds.length) {
      throw new Error(`\u627E\u4E0D\u5230\u58F0\u97F3 "${name ?? index}"\u3002\u53EF\u7528\u58F0\u97F3: ${sounds.map((s) => s.name).join(", ")}`);
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
  function renameVariable({ target: targetName, name, new_name, type = "variable" } = {}) {
    const target = requireTarget(targetName, true);
    const varType = variableType(type);
    const variable = findVariable2(target, name, varType);
    if (!variable) throw new Error(`\u627E\u4E0D\u5230${varType === "list" ? "\u5217\u8868" : varType === "broadcast_msg" ? "\u5E7F\u64AD" : "\u53D8\u91CF"} "${name}"\u3002`);
    const newName = String(new_name || "").trim();
    if (!newName) throw new Error("new_name \u4E0D\u80FD\u4E3A\u7A7A\u3002");
    const holder = variableHolder(target, variable);
    const duplicate = Object.values(holder.variables || {}).find((item) => item.id !== variable.id && item.name === newName && item.type === varType);
    if (duplicate) throw new Error(`\u5DF2\u5B58\u5728\u540C\u540D${varType === "list" ? "\u5217\u8868" : "\u53D8\u91CF"} "${newName}"\u3002`);
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
      type: varType === "list" ? "list" : varType === "broadcast_msg" ? "broadcast" : "variable",
      scope: holder.isStage ? "global" : "local"
    };
  }
  function deleteVariable({ target: targetName, name, type = "variable" } = {}) {
    const target = requireTarget(targetName, true);
    const varType = variableType(type);
    const variable = findVariable2(target, name, varType);
    if (!variable) throw new Error(`\u627E\u4E0D\u5230${varType === "list" ? "\u5217\u8868" : varType === "broadcast_msg" ? "\u5E7F\u64AD" : "\u53D8\u91CF"} "${name}"\u3002`);
    const holder = variableHolder(target, variable);
    const refs = [];
    for (const current of getTargets()) {
      for (const block of Object.values(current.blocks._blocks || {})) {
        if (!block) continue;
        const uses = Object.values(block.fields || {}).some((field) => field && field.id === variable.id);
        if (uses) refs.push({ target: current, blockId: block.id });
      }
    }
    let clearedBlocks = 0;
    const seen = /* @__PURE__ */ new Set();
    for (const ref of refs) {
      const key = `${ref.target.id}:${ref.blockId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!ref.target.blocks.getBlock(ref.blockId)) continue;
      try {
        deleteBlock({ target: ref.target.getName(), block_id: ref.blockId });
        clearedBlocks++;
      } catch {
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
      type: varType === "list" ? "list" : varType === "broadcast_msg" ? "broadcast" : "variable",
      scope: holder.isStage ? "global" : "local",
      clearedBlocks
    };
  }
  function renameCostume({ target: targetName, name, index, new_name } = {}) {
    const target = requireTarget(targetName, true);
    const idx = costumeIndex(target, { name, index });
    const oldName = target.getCostumes()[idx].name;
    const newName = String(new_name || "").trim();
    if (!newName) throw new Error("new_name \u4E0D\u80FD\u4E3A\u7A7A\u3002");
    target.renameCostume(idx, newName);
    const actualName = target.getCostumes()[idx].name;
    getVM().emitWorkspaceUpdate();
    emitProjectChanged();
    focusTarget(target);
    return { target: target.getName(), index: idx, oldName, name: actualName };
  }
  function deleteCostume({ target: targetName, name, index } = {}) {
    const target = requireTarget(targetName, true);
    const costumes = target.getCostumes();
    if (costumes.length <= 1) throw new Error("\u4E0D\u80FD\u5220\u9664\u6700\u540E\u4E00\u4E2A\u9020\u578B/\u80CC\u666F\u3002");
    const idx = costumeIndex(target, { name, index });
    const oldName = costumes[idx].name;
    target.deleteCostume(idx);
    const remaining = target.getCostumes();
    const replacement = remaining[Math.min(idx, remaining.length - 1)]?.name || "";
    if (oldName && replacement) {
      if (target.isStage) {
        for (const current of getTargets()) {
          current.blocks.updateAssetName(oldName, replacement, "backdrop");
        }
      } else {
        target.blocks.updateAssetName(oldName, replacement, "costume");
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
  function renameSound({ target: targetName, name, index, new_name } = {}) {
    const target = requireTarget(targetName, true);
    const idx = soundIndex(target, { name, index });
    const oldName = target.getSounds()[idx].name;
    const newName = String(new_name || "").trim();
    if (!newName) throw new Error("new_name \u4E0D\u80FD\u4E3A\u7A7A\u3002");
    target.renameSound(idx, newName);
    const actualName = target.getSounds()[idx].name;
    getVM().emitWorkspaceUpdate();
    emitProjectChanged();
    focusTarget(target);
    return { target: target.getName(), index: idx, oldName, name: actualName };
  }
  function deleteSound({ target: targetName, name, index } = {}) {
    const target = requireTarget(targetName, true);
    const idx = soundIndex(target, { name, index });
    const oldName = target.getSounds()[idx].name;
    target.deleteSound(idx);
    getVM().emitWorkspaceUpdate();
    emitProjectChanged();
    focusTarget(target);
    return { target: target.getName(), deleted: oldName, index: idx };
  }
  function reorderCostume({ target: targetName, name, index, new_index } = {}) {
    const target = requireTarget(targetName, true);
    const costumes = target.getCostumes();
    if (costumes.length < 2) throw new Error("\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u9020\u578B\u624D\u80FD\u91CD\u6392\u3002");
    const from = costumeIndex(target, { name, index });
    const to = Math.max(0, Math.min(costumes.length - 1, Number(new_index) || 0));
    if (from === to) return { target: target.getName(), moved: costumes[from].name, from, to };
    const currentName = costumes[target.currentCostume]?.name || null;
    const [item] = costumes.splice(from, 1);
    costumes.splice(to, 0, item);
    if (currentName) {
      const currentIndex = costumes.findIndex((costume) => costume.name === currentName);
      if (currentIndex >= 0) target.setCostume(currentIndex);
    }
    getRuntime().requestTargetsUpdate(target);
    getVM().emitWorkspaceUpdate();
    emitProjectChanged();
    focusTarget(target);
    return { target: target.getName(), moved: item.name, from, to };
  }
  function reorderSound({ target: targetName, name, index, new_index } = {}) {
    const target = requireTarget(targetName, true);
    const sounds = target.getSounds();
    if (sounds.length < 2) throw new Error("\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u58F0\u97F3\u624D\u80FD\u91CD\u6392\u3002");
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

  // src/vm/runtime.js
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      let timer;
      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  function summarizeValue2(value) {
    if (Array.isArray(value)) {
      const items = value.slice(0, 50).map((item) => String(item).slice(0, 120));
      return items.length < value.length ? [...items, `\u2026 (${value.length} items)`] : items;
    }
    if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}\u2026` : value;
    return value;
  }
  function listVars(target) {
    return {
      variables: Object.values(target.variables || {}).filter((variable) => variable.type === "").map((variable) => ({ name: variable.name, value: summarizeValue2(variable.value), id: variable.id })),
      lists: Object.values(target.variables || {}).filter((variable) => variable.type === "list").map((variable) => ({
        name: variable.name,
        value: summarizeValue2(variable.value),
        length: Array.isArray(variable.value) ? variable.value.length : 0,
        id: variable.id
      })),
      broadcasts: Object.values(target.variables || {}).filter((variable) => variable.type === "broadcast_msg").map((variable) => ({ name: variable.name, value: variable.value, id: variable.id }))
    };
  }
  function targetState(target) {
    let costumeName = null;
    try {
      costumeName = target.getCostumes()[target.currentCostume]?.name || null;
    } catch {
    }
    const cloneCount2 = target.isSprite && target.isSprite() ? Math.max(0, (target.sprite?.clones?.length || 1) - 1) : 0;
    return {
      name: target.getName(),
      isStage: Boolean(target.isStage),
      x: Math.round((target.x || 0) * 100) / 100,
      y: Math.round((target.y || 0) * 100) / 100,
      direction: Math.round((target.direction || 0) * 100) / 100,
      size: Math.round((target.size || 100) * 100) / 100,
      visible: target.visible !== false,
      draggable: Boolean(target.draggable),
      rotationStyle: target.rotationStyle || "all around",
      currentCostume: target.currentCostume || 0,
      costumeName,
      cloneCount: cloneCount2,
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
    }
    return 0;
  }
  function readMonitors(runtime) {
    const result = [];
    try {
      const map = runtime._monitorState?.map;
      if (map && typeof map.forEach === "function") {
        map.forEach((monitor) => {
          result.push({
            id: monitor.id,
            opcode: monitor.opcode,
            value: summarizeValue2(monitor.value),
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
    }
    return result;
  }
  function getRuntimeState(targetName) {
    const vm = getVM();
    const runtime = getRuntime();
    const stage = getStage();
    let sprites = getTargets().filter((target) => target.isSprite && target.isSprite());
    if (targetName) {
      const target = getTargetByName(targetName, false);
      sprites = target && target.isSprite && target.isSprite() ? [target] : [];
    }
    return {
      editingTarget: vm.editingTarget ? vm.editingTarget.getName() : null,
      running: (runtime.threads?.length || 0) > 0,
      threadCount: runtime.threads?.length || 0,
      fps: Number.isFinite(runtime.fps) ? Math.round(runtime.fps * 10) / 10 : runtime.currentStepTime ? Math.round(1e3 / runtime.currentStepTime * 10) / 10 : null,
      cloneCounter: runtime._cloneCounter ?? null,
      timer: Math.round(readTimer(runtime) * 1e3) / 1e3,
      turboMode: Boolean(runtime.turboMode),
      interpolationEnabled: Boolean(runtime.interpolationEnabled),
      stage: targetState(stage),
      sprites: sprites.map(targetState),
      monitors: readMonitors(runtime).slice(0, 50),
      threads: (runtime.threads || []).slice(0, 20).map((thread) => ({
        target: thread.target?.getName?.() || null,
        topBlock: thread.topBlock || null,
        status: thread.status ?? null
      }))
    };
  }
  function normalizeForCompare(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value;
    if (value === void 0 || value === null) return "";
    return String(value);
  }
  function compare(actual, op, expected) {
    if (op === "exists") return actual !== void 0 && actual !== null;
    if (op === "truthy") return Boolean(actual);
    if (op === "contains") return String(actual ?? "").includes(String(expected ?? ""));
    const actualValue = normalizeForCompare(actual);
    const expectedValue = normalizeForCompare(expected);
    const numeric = typeof expected === "number" || typeof actual === "number" && typeof expected !== "string";
    const left = numeric ? Number(actual) : actualValue;
    const right = numeric ? Number(expected) : expectedValue;
    if (numeric && (!Number.isFinite(left) || !Number.isFinite(right))) return false;
    switch (op) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case ">":
        return left > right;
      case "<":
        return left < right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      default:
        return false;
    }
  }
  function variableType2(type) {
    if (type === "list") return "list";
    if (type === "broadcast") return "broadcast_msg";
    return "";
  }
  function cloneCount(target) {
    return target.isSprite && target.isSprite() ? Math.max(0, (target.sprite?.clones?.length || 1) - 1) : 0;
  }
  function evaluateCondition(condition) {
    const type = condition.type || "variable";
    const runtime = getRuntime();
    if (type === "threads") {
      return {
        actual: runtime.threads?.length || 0,
        expected: condition.value,
        ok: compare(runtime.threads?.length || 0, condition.op || "==", condition.value)
      };
    }
    if (type === "timer") {
      const actual2 = readTimer(runtime);
      return { actual: actual2, expected: condition.value, ok: compare(actual2, condition.op || ">=", condition.value) };
    }
    if (type === "sprite" || type === "clone") {
      const target2 = condition.target ? getTargetByName(condition.target, false) : getEditingTarget();
      if (!target2) return { actual: void 0, expected: condition.value, ok: false, error: "\u627E\u4E0D\u5230\u89D2\u8272\u3002" };
      let actual2;
      if (type === "clone") {
        actual2 = cloneCount(target2);
      } else {
        switch (condition.property || "x") {
          case "x":
            actual2 = target2.x;
            break;
          case "y":
            actual2 = target2.y;
            break;
          case "direction":
            actual2 = target2.direction;
            break;
          case "size":
            actual2 = target2.size;
            break;
          case "visible":
            actual2 = target2.visible !== false;
            break;
          case "draggable":
            actual2 = Boolean(target2.draggable);
            break;
          case "costume":
            actual2 = target2.getCostumes()[target2.currentCostume]?.name;
            break;
          case "cloneCount":
            actual2 = cloneCount(target2);
            break;
          default:
            actual2 = void 0;
        }
      }
      return { actual: actual2, expected: condition.value, ok: compare(actual2, condition.op || "==", condition.value) };
    }
    const target = condition.target ? getTargetByName(condition.target, true) : getEditingTarget() || getStage();
    if (!target) return { actual: void 0, expected: condition.value, ok: false, error: "\u627E\u4E0D\u5230\u76EE\u6807\u3002" };
    const variable = target.lookupVariableByNameAndType(condition.name, variableType2(type));
    if (!variable) return { actual: void 0, expected: condition.value, ok: false, error: `\u627E\u4E0D\u5230\u53D8\u91CF ${condition.name}` };
    let actual = variable.value;
    if (type === "list") {
      if (condition.property === "length") actual = Array.isArray(variable.value) ? variable.value.length : 0;
      else if (condition.property === "contains") {
        const found = Array.isArray(variable.value) && variable.value.map(String).includes(String(condition.value));
        return { actual: found, expected: true, ok: found };
      }
    }
    return { actual, expected: condition.value, ok: compare(actual, condition.op || "==", condition.value) };
  }
  async function waitUntil({ conditions, timeout = 5, interval = 0.1, signal } = {}) {
    const list = Array.isArray(conditions) ? conditions : [];
    if (!list.length) throw new Error("wait_until \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u6761\u4EF6\u3002");
    const timeoutMs = Math.max(0, Math.min(60, Number(timeout) || 5)) * 1e3;
    const intervalMs = Math.max(50, Math.min(2e3, (Number(interval) || 0.1) * 1e3));
    const start = Date.now();
    let lastChecks = [];
    while (true) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      lastChecks = list.map(evaluateCondition);
      if (lastChecks.every((check) => check.ok)) {
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
  async function waitSeconds(seconds, signal) {
    const ms = Math.max(0, Math.min(60, Number(seconds) || 0)) * 1e3;
    const start = Date.now();
    await sleep(ms, signal);
    return { waited: Math.round((Date.now() - start) / 10) / 100, state: getRuntimeState() };
  }
  async function captureStage() {
    const vm = getVM();
    const runtime = getRuntime();
    const renderer = runtime.renderer || globalThis.Scratch?.renderer;
    if (!renderer || typeof renderer.requestSnapshot !== "function") {
      throw new Error("\u5F53\u524D\u6E32\u67D3\u5668\u4E0D\u652F\u6301\u622A\u56FE\u3002");
    }
    const dataUrl = await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("\u821E\u53F0\u622A\u56FE\u8D85\u65F6\u3002"));
      }, 4e3);
      try {
        renderer.requestSnapshot((data) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (typeof data === "string") resolve(data);
          else if (data && typeof data.toDataURL === "function") resolve(data.toDataURL("image/png"));
          else reject(new Error("\u622A\u56FE\u683C\u5F0F\u4E0D\u53D7\u652F\u6301\u3002"));
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

  // src/vm/search.js
  function topLevelId(blocks, block) {
    let current = block;
    while (current && !current.topLevel && current.parent) {
      const parent = blocks.getBlock(current.parent);
      if (!parent) break;
      current = parent;
    }
    return current ? current.id : null;
  }
  function variableType3(type) {
    if (type === "list") return "list";
    if (type === "broadcast") return "broadcast_msg";
    return "";
  }
  function targetList(targetName) {
    if (!targetName) return getTargets();
    const target = getTargetByName(targetName, false);
    return target ? [target] : [];
  }
  function blockLine(target, block) {
    try {
      return describeBlockLine(block.id, target.blocks, { seen: /* @__PURE__ */ new Set() });
    } catch {
      return block.opcode;
    }
  }
  function searchProject({ query, target: targetName, limit = 60 } = {}) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) throw new Error("search_project \u9700\u8981 query\u3002");
    const max = Math.max(1, Math.min(200, Number(limit) || 60));
    const matches = [];
    let truncated = false;
    for (const target of targetList(targetName)) {
      for (const variable of Object.values(target.variables || {})) {
        const valueText = Array.isArray(variable.value) ? variable.value.join(", ") : String(variable.value ?? "");
        if (variable.name.toLowerCase().includes(q) || valueText.toLowerCase().includes(q)) {
          matches.push({
            kind: variable.type === "list" ? "list" : variable.type === "broadcast_msg" ? "broadcast" : "variable",
            target: target.getName(),
            name: variable.name,
            value: valueText.slice(0, 240)
          });
        }
      }
      for (const costume of target.getCostumes()) {
        if (costume.name.toLowerCase().includes(q)) matches.push({ kind: "costume", target: target.getName(), name: costume.name });
      }
      for (const sound of target.getSounds()) {
        if (sound.name.toLowerCase().includes(q)) matches.push({ kind: "sound", target: target.getName(), name: sound.name });
      }
      for (const block of Object.values(target.blocks._blocks || {})) {
        if (!block || block.shadow) continue;
        const line = blockLine(target, block);
        const fieldValues = Object.values(block.fields || {}).map((field) => String(field?.value ?? "")).join(" ");
        const haystack = `${block.opcode} ${line} ${fieldValues}`.toLowerCase();
        if (!haystack.includes(q) && !block.opcode.toLowerCase().includes(q)) continue;
        matches.push({
          kind: "block",
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
  function findReferences({ name, type = "variable", target: targetName } = {}) {
    const wanted = String(name || "").trim();
    if (!wanted) throw new Error("find_references \u9700\u8981 name\u3002");
    const references = [];
    const normalizedType = ["variable", "list", "broadcast", "costume", "sound", "sprite"].includes(type) ? type : "variable";
    if (normalizedType === "variable" || normalizedType === "list" || normalizedType === "broadcast") {
      const varType = variableType3(normalizedType);
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
            if (field.id === variable.id || field.value === variable.name && field.variableType === varType) {
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
        scope: holder?.isStage ? "global" : "local",
        references,
        count: references.length,
        found: true
      };
    }
    const fieldNames = normalizedType === "costume" ? /* @__PURE__ */ new Set(["COSTUME", "BACKDROP", "COSTUME_MENU"]) : normalizedType === "sound" ? /* @__PURE__ */ new Set(["SOUND_MENU"]) : /* @__PURE__ */ new Set(["TO", "TOWARDS", "TOUCHINGOBJECTMENU", "DISTANCETOMENU", "OBJECT", "CLONE_OPTION"]);
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

  // src/agent/tools.js
  var objectSchema = (description) => ({
    type: "object",
    description,
    additionalProperties: true
  });
  function extensionCatalogEntries() {
    try {
      const runtime = getVM().runtime;
      const categories = Array.isArray(runtime._blockInfo) ? runtime._blockInfo : [];
      const entries = [];
      for (const category of categories) {
        if (!category || !Array.isArray(category.blocks)) continue;
        for (const item of category.blocks) {
          const info = item && item.info;
          if (!info || !info.opcode) continue;
          const inputs = {};
          for (const [name, argument] of Object.entries(info.arguments || {})) {
            inputs[name] = argument && argument.type ? argument.type : "string";
          }
          entries.push({
            opcode: `${category.id}_${info.opcode}`,
            type: info.blockType || "command",
            category: category.id,
            inputs,
            fields: {},
            note: info.text || "",
            extension: true,
            arguments: info.arguments || {}
          });
        }
      }
      return entries;
    } catch {
      return [];
    }
  }
  function searchAllCatalog(query, category, limit) {
    const core = searchCatalog(query, category, limit);
    const q = String(query || "").trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    const extension = extensionCatalogEntries().filter((block) => {
      if (category && block.category !== category) return false;
      if (!terms.length) return true;
      const haystack = [block.opcode, block.category, block.note, ...Object.keys(block.inputs)].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return [...core, ...extension].slice(0, limit);
  }
  var TOOL_DEFINITIONS = [
    {
      name: "get_project",
      description: 'Read the live TurboWarp project. Use detail="summary" for sprites, variables, costumes, and script counts. Use detail="scripts" (optionally with target) to read readable block scripts and their top-level script ids. Use detail="full" for both. Always inspect before making complex changes.',
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Optional sprite or Stage name for script details." },
          detail: { type: "string", enum: ["summary", "scripts", "full"], description: "How much project data to return. scripts/full include a blocks array with ids, parent/next links, inputs and fields." },
          max_blocks: { type: "number", description: "Maximum blocks to render for script details (20-800)." }
        }
      },
      handler(args) {
        const detail = args.detail || "summary";
        const maxBlocks = clampNumber(args.max_blocks, 20, 800, 300);
        if (detail === "scripts") return getTargetScripts(args.target, maxBlocks);
        if (detail === "full") {
          return {
            summary: summarizeProject(),
            scripts: getTargetScripts(args.target, maxBlocks)
          };
        }
        return summarizeProject();
      }
    },
    {
      name: "get_block_catalog",
      description: 'Search the built-in Scratch 3 / TurboWarp block catalog. Returns exact opcodes, input names/types, field names/options, and notes. Call this whenever you are unsure about an opcode, input name, or dropdown field. Search by keyword such as "repeat", "touching", "variable", "costume", or filter by category.',
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword to search for in opcodes, inputs, fields, and descriptions." },
          category: { type: "string", description: "Optional block category filter (core category or loaded extension id)." },
          limit: { type: "number", description: "Maximum results (1-80)." }
        }
      },
      handler(args) {
        const limit = clampNumber(args.limit, 1, 80, 40);
        const blocks = searchAllCatalog(args.query, args.category, limit);
        const extensionCategories = [...new Set(extensionCatalogEntries().map((block) => block.category))];
        return {
          categories: [...CATEGORIES, ...extensionCategories],
          extensions: extensionCategories,
          count: blocks.length,
          blocks: blocks.map((block) => block.extension ? block : formatCatalogBlock(block)),
          hint: "Use fields for dropdowns (e.g. KEY_OPTION). Use inputs for values/reporters. Menu inputs accept plain strings; the builder creates the correct menu shadow block. Extension blocks use the full opcode shown here."
        };
      }
    },
    {
      name: "get_runtime_state",
      description: "Read live runtime state after running the project: running/thread count, FPS, timer, clone counter, stage and sprite variables/lists, sprite position/size/costume/clone counts, visible monitors and active threads. Use this to verify behavior instead of guessing. Pass target to focus on one sprite, or omit for all.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Optional sprite name to limit sprite details." }
        }
      },
      handler(args) {
        return getRuntimeState(args.target);
      }
    },
    {
      name: "search_project",
      description: "Search the whole project (all sprites and Stage) by text. Matches opcodes, block text, field values, variable/list values, costume names and sound names. Returns block ids and script ids. Works across multiple sprites; pass target to narrow the search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text, opcode, variable name or value to find." },
          target: { type: "string", description: "Optional sprite/Stage name." },
          limit: { type: "number", description: "Maximum matches (1-200)." }
        },
        required: ["query"]
      },
      handler(args) {
        return searchProject(args);
      }
    },
    {
      name: "find_references",
      description: "Find every block that references a variable, list, broadcast, costume, sound or sprite name across all sprites. Use this before renaming/deleting or when you need to know the impact of a change.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Variable/list/broadcast/costume/sound/sprite name." },
          type: { type: "string", enum: ["variable", "list", "broadcast", "costume", "sound", "sprite"], description: "Default variable." },
          target: { type: "string", description: "Optional sprite/Stage filter." }
        },
        required: ["name"]
      },
      handler(args) {
        return findReferences(args);
      }
    },
    {
      name: "create_sprite",
      description: "Create a new sprite with a generated placeholder costume. Returns the final unique name. Use add_costume afterwards to replace or extend its look. Positions use Scratch stage coordinates (-240..240, -180..180).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Desired sprite name." },
          x: { type: "number", description: "Initial x position. Default 0." },
          y: { type: "number", description: "Initial y position. Default 0." },
          size: { type: "number", description: "Initial size percent. Default 100." },
          direction: { type: "number", description: "Initial direction. Default 90." },
          visible: { type: "boolean", description: "Whether the sprite is visible. Default true." }
        },
        required: ["name"]
      },
      mutating: true,
      handler(args) {
        return createSprite(args);
      }
    },
    {
      name: "delete_sprite",
      description: "Delete a sprite and all of its clones. Requires user confirmation when enabled.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact sprite name to delete." }
        },
        required: ["name"]
      },
      mutating: true,
      destructive: true,
      handler(args) {
        return deleteSprite(args.name);
      }
    },
    {
      name: "rename_sprite",
      description: "Rename a sprite. The VM may adjust the name if it is already used.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Current sprite name." },
          new_name: { type: "string", description: "New sprite name." }
        },
        required: ["target", "new_name"]
      },
      mutating: true,
      handler(args) {
        return renameSprite(args.target, args.new_name);
      }
    },
    {
      name: "set_sprite",
      description: "Change sprite properties: position, direction, size, visibility, draggable, rotation style, current costume, or layer order.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite name. Defaults to the editing target." },
          x: { type: "number" },
          y: { type: "number" },
          direction: { type: "number" },
          size: { type: "number" },
          visible: { type: "boolean" },
          draggable: { type: "boolean" },
          rotation_style: { type: "string", enum: ["all around", "don't rotate", "left-right"] },
          current_costume: { type: ["string", "number"], description: "Costume name or zero-based index." },
          go_to_front: { type: "boolean" },
          go_to_back: { type: "boolean" }
        }
      },
      mutating: true,
      handler(args) {
        const { target, ...props } = args;
        return setSpriteProps(target, props);
      }
    },
    {
      name: "create_variable",
      description: 'Create a scalar variable or list. scope="global" creates it on the Stage (recommended for multi-sprite games); scope="local" creates it on the target sprite. If the variable already exists it is returned with created=false. Lists accept an array value.',
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Variable or list name." },
          value: { description: "Initial value. Use an array for lists." },
          type: { type: "string", enum: ["variable", "list", "broadcast"], description: "Default variable." },
          scope: { type: "string", enum: ["auto", "global", "local"], description: "Default auto (global when created)." },
          target: { type: "string", description: "Sprite name for local scope. Defaults to the editing target." }
        },
        required: ["name"]
      },
      mutating: true,
      handler(args) {
        return createVariable(args);
      }
    },
    {
      name: "set_variable",
      description: "Set an existing scalar variable or list value. For lists, pass an array.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Variable or list name." },
          value: { description: "New value. Use an array for lists." },
          type: { type: "string", enum: ["variable", "list"], description: "Default variable." },
          target: { type: "string", description: "Sprite name to resolve local variables. Defaults to the editing target." }
        },
        required: ["name", "value"]
      },
      mutating: true,
      handler(args) {
        return setVariableValue(args);
      }
    },
    {
      name: "add_script",
      description: 'Build Scratch blocks from a compact JSON DSL. Each script is a block object: {"opcode":"event_whenflagclicked","next":[...]} . Stack blocks connect through "next" (array). C-block branches go in "substacks":{"SUBSTACK":[...],"SUBSTACK2":[...]}. Inputs accept literals, {"variable":"score"}, {"list":"items"}, {"broadcast":"start"}, {"color":"#ff0000"}, {"menu":"costume1"}, or a nested reporter {"opcode":"operator_add","inputs":{"NUM1":1,"NUM2":2}}. Fields hold dropdown values, e.g. {"fields":{"KEY_OPTION":"space"}}. Variables referenced in fields or reporters are auto-created globally unless auto_create_variables=false. Use get_block_catalog for exact opcodes and input names.',
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name. Defaults to the editing target." },
          scripts: {
            type: "array",
            description: "Top-level scripts. Each item is a block object with opcode and optional inputs, fields, substacks, next, mutation, x, y.",
            items: objectSchema("A block object."),
            minItems: 1
          },
          x: { type: "number", description: "Default x for the first top-level script." },
          y: { type: "number", description: "Default y for top-level scripts." },
          auto_create_variables: { type: "boolean", description: "Auto-create missing variables/broadcasts (default true)." }
        },
        required: ["scripts"]
      },
      mutating: true,
      handler(args) {
        return addScripts(args);
      }
    },
    {
      name: "delete_block",
      description: 'Delete one block by its block id. mode="block" (default) removes the block and its nested branches, then reconnects the following stack. mode="chain" also deletes all following blocks in that stack. mode="script" deletes the whole top-level script containing the block. Get exact ids from get_project detail="scripts" (the blocks array).',
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name. Defaults to the editing target." },
          block_id: { type: "string", description: "Block id from get_project." },
          mode: { type: "string", enum: ["block", "chain", "script"], description: "How much to delete. Default block." }
        },
        required: ["block_id"]
      },
      mutating: true,
      handler(args) {
        return deleteBlock(args);
      }
    },
    {
      name: "edit_block",
      description: "Modify a block in place. Use fields for dropdowns (e.g. KEY_OPTION, EFFECT, VARIABLE), inputs for values/reporters using the same DSL as add_script, and substacks to replace C-block branches. Set an input to null to remove it. This preserves the block position and surrounding script; prefer it over deleting and rebuilding a whole script. Do not edit hidden shadow/menu blocks directly; edit the parent input instead.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          block_id: { type: "string", description: "Block id from get_project." },
          fields: objectSchema('Dropdown fields to set, e.g. {"KEY_OPTION":"space"} or {"VARIABLE":"score"}.'),
          inputs: objectSchema('Inputs to set, e.g. {"STEPS":20} or {"MESSAGE":{"variable":"score"}}.'),
          substacks: objectSchema('C-block branches to replace, e.g. {"SUBSTACK":[...]} or {"SUBSTACK2":[...]}.'),
          auto_create_variables: { type: "boolean", description: "Auto-create missing variables (default true)." }
        },
        required: ["block_id"]
      },
      mutating: true,
      handler(args) {
        return editBlock(args);
      }
    },
    {
      name: "insert_block",
      description: 'Insert a new block into an existing script. position="after" inserts after anchor_id in the same stack; "before" inserts before anchor_id; "substack" inserts at the start of parent_id input_name (SUBSTACK or SUBSTACK2); "input" plugs a reporter/boolean into parent_id input_name. The block argument uses the same block DSL as add_script, including inputs, fields and substacks.',
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          block: objectSchema('A block object, e.g. {"opcode":"motion_movesteps","inputs":{"STEPS":10}}.'),
          position: { type: "string", enum: ["after", "before", "substack", "input"], description: "Default after." },
          anchor_id: { type: "string", description: "Anchor block id for after/before." },
          parent_id: { type: "string", description: "Parent block id for substack/input." },
          input_name: { type: "string", description: "Input name for substack/input, e.g. SUBSTACK or MESSAGE." },
          auto_create_variables: { type: "boolean", description: "Auto-create missing variables (default true)." }
        },
        required: ["block"]
      },
      mutating: true,
      handler(args) {
        return insertBlock(args);
      }
    },
    {
      name: "move_block",
      description: 'Move an existing block to a new position. position="after" moves it after anchor_id; "substack" moves it to the start of parent_id input_name; "input" plugs a reporter/boolean into parent_id input_name. By default with_next=true, so the block and everything below it move together; set with_next=false to move only the block. Get ids from get_project. Cannot move top-level scripts or hidden shadow/menu blocks.',
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          block_id: { type: "string", description: "Block id to move." },
          position: { type: "string", enum: ["after", "substack", "input"], description: "Default after." },
          anchor_id: { type: "string", description: "Destination anchor for after." },
          parent_id: { type: "string", description: "Destination parent for substack/input." },
          input_name: { type: "string", description: "Destination input name for substack/input." },
          with_next: { type: "boolean", description: "Move the following stack too (default true)." }
        },
        required: ["block_id"]
      },
      mutating: true,
      handler(args) {
        return moveBlock(args);
      }
    },
    {
      name: "rename_variable",
      description: "Rename a variable, list or broadcast on any sprite or the Stage. Broadcasts live on the Stage. Pass target and type explicitly when working across multiple sprites.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          name: { type: "string", description: "Current variable/list/broadcast name." },
          new_name: { type: "string", description: "New name." },
          type: { type: "string", enum: ["variable", "list", "broadcast"], description: "Default variable." }
        },
        required: ["name", "new_name"]
      },
      mutating: true,
      handler(args) {
        return renameVariable(args);
      }
    },
    {
      name: "delete_variable",
      description: "Delete a variable, list or broadcast and remove/reconnect blocks that reference it. Works on any sprite or the Stage. Requires user confirmation when enabled.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          name: { type: "string", description: "Variable/list/broadcast name." },
          type: { type: "string", enum: ["variable", "list", "broadcast"], description: "Default variable." }
        },
        required: ["name"]
      },
      mutating: true,
      destructive: true,
      handler(args) {
        return deleteVariable(args);
      }
    },
    {
      name: "rename_costume",
      description: "Rename a costume on any sprite, or a backdrop on the Stage. Block references are updated automatically.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite name, or Stage for a backdrop." },
          name: { type: "string", description: "Current costume/backdrop name." },
          index: { type: "number", description: "Zero-based index (alternative to name)." },
          new_name: { type: "string", description: "New costume/backdrop name." }
        },
        required: ["new_name"]
      },
      mutating: true,
      handler(args) {
        return renameCostume(args);
      }
    },
    {
      name: "delete_costume",
      description: "Delete a costume from any sprite, or a backdrop from the Stage. Cannot delete the last costume/backdrop. References are redirected to a remaining costume. Requires user confirmation when enabled.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite name, or Stage for a backdrop." },
          name: { type: "string", description: "Costume/backdrop name." },
          index: { type: "number", description: "Zero-based index (alternative to name)." }
        }
      },
      mutating: true,
      destructive: true,
      handler(args) {
        return deleteCostume(args);
      }
    },
    {
      name: "rename_sound",
      description: "Rename a sound on any sprite or the Stage. Sound block references are updated automatically.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          name: { type: "string", description: "Current sound name." },
          index: { type: "number", description: "Zero-based index (alternative to name)." },
          new_name: { type: "string", description: "New sound name." }
        },
        required: ["new_name"]
      },
      mutating: true,
      handler(args) {
        return renameSound(args);
      }
    },
    {
      name: "delete_sound",
      description: "Delete a sound from any sprite or the Stage. Requires user confirmation when enabled.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          name: { type: "string", description: "Sound name." },
          index: { type: "number", description: "Zero-based index (alternative to name)." }
        }
      },
      mutating: true,
      destructive: true,
      handler(args) {
        return deleteSound(args);
      }
    },
    {
      name: "delete_script",
      description: 'Delete one top-level script by its script id. Get ids from get_project detail="scripts". Requires user confirmation when enabled.',
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          script_id: { type: "string", description: "Top-level block id returned by get_project." }
        },
        required: ["script_id"]
      },
      mutating: true,
      destructive: true,
      handler(args) {
        return deleteScript(args);
      }
    },
    {
      name: "clear_scripts",
      description: "Delete every script on a target. Requires user confirmation when enabled.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." }
        }
      },
      mutating: true,
      destructive: true,
      handler(args) {
        return clearScripts(args);
      }
    },
    {
      name: "add_costume",
      description: "Add a costume to a sprite (or a backdrop to the Stage) from an SVG string or a PNG/JPEG/SVG data URL. SVG is preferred because it is sharp at any size. The new costume becomes the current costume.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite name, or Stage for a backdrop. Defaults to the editing target." },
          name: { type: "string", description: "Costume name." },
          svg: { type: "string", description: "Raw SVG markup." },
          data_url: { type: "string", description: "data:image/... URL." }
        }
      },
      mutating: true,
      handler(args) {
        return addCostume(args);
      }
    },
    {
      name: "reorder_costume",
      description: "Reorder a costume on any sprite, or a backdrop on the Stage. new_index is zero-based and clamped to the available range.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite name, or Stage for a backdrop." },
          name: { type: "string", description: "Costume/backdrop name." },
          index: { type: "number", description: "Current zero-based index (alternative to name)." },
          new_index: { type: "number", description: "New zero-based index." }
        },
        required: ["new_index"]
      },
      mutating: true,
      handler(args) {
        return reorderCostume(args);
      }
    },
    {
      name: "reorder_sound",
      description: "Reorder a sound on any sprite or the Stage. new_index is zero-based and clamped to the available range.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Sprite or Stage name." },
          name: { type: "string", description: "Sound name." },
          index: { type: "number", description: "Current zero-based index (alternative to name)." },
          new_index: { type: "number", description: "New zero-based index." }
        },
        required: ["new_index"]
      },
      mutating: true,
      handler(args) {
        return reorderSound(args);
      }
    },
    {
      name: "set_backdrop",
      description: "Switch the Stage backdrop by name or zero-based index.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Backdrop name." },
          index: { type: "number", description: "Zero-based backdrop index." }
        }
      },
      mutating: true,
      handler(args) {
        return setBackdrop(args);
      }
    },
    {
      name: "set_stage",
      description: "Change Stage properties such as tempo, volume, video transparency, or video state.",
      parameters: {
        type: "object",
        properties: {
          tempo: { type: "number" },
          volume: { type: "number" },
          video_transparency: { type: "number" },
          video_state: { type: "string", enum: ["on", "off", "on-flipped"] },
          text_to_speech_language: { type: "string" }
        }
      },
      mutating: true,
      handler(args) {
        return setStageProps(args);
      }
    },
    {
      name: "run_project",
      description: "Click the green flag and start running the project.",
      parameters: { type: "object", properties: {} },
      handler() {
        return runProject();
      }
    },
    {
      name: "stop_project",
      description: "Stop all running scripts.",
      parameters: { type: "object", properties: {} },
      handler() {
        return stopProject();
      }
    },
    {
      name: "export_project",
      description: "Save the current project as an .sb3 file and download it.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Optional filename." }
        }
      },
      handler(args) {
        return exportProject(args.filename);
      }
    },
    {
      name: "wait",
      description: "Wait a number of seconds without running the project. Useful between run_project and get_runtime_state. Maximum 60 seconds.",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "number", description: "Seconds to wait. Default 1." }
        }
      },
      handler(args, ctx) {
        return waitSeconds(args.seconds, ctx.signal);
      }
    },
    {
      name: "wait_until",
      description: 'Poll live runtime state until all conditions are true or a timeout. Conditions support variable/list values, sprite properties, clone counts, active threads and the project timer. Example: [{"type":"variable","target":"Stage","name":"score","op":">=","value":10},{"type":"threads","op":"==","value":0}].',
      parameters: {
        type: "object",
        properties: {
          conditions: {
            type: "array",
            description: "All conditions must become true.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["variable", "list", "broadcast", "sprite", "clone", "threads", "timer"], description: "Default variable." },
                target: { type: "string", description: "Sprite or Stage name." },
                name: { type: "string", description: "Variable/list name for variable/list/broadcast conditions." },
                property: { type: "string", description: "For sprite: x/y/direction/size/visible/draggable/costume/cloneCount. For list: length/contains." },
                op: { type: "string", enum: ["==", "!=", ">", "<", ">=", "<=", "contains", "exists", "truthy"], description: "Comparison. Default ==." },
                value: { description: "Expected value." }
              },
              additionalProperties: true
            },
            minItems: 1
          },
          timeout: { type: "number", description: "Timeout seconds (0-60). Default 5." },
          interval: { type: "number", description: "Poll interval seconds (0.05-2). Default 0.1." }
        },
        required: ["conditions"]
      },
      handler(args, ctx) {
        return waitUntil({
          conditions: args.conditions,
          timeout: args.timeout,
          interval: args.interval,
          signal: ctx.signal
        });
      }
    },
    {
      name: "verify_project",
      description: "Run the project, wait for a number of seconds or until conditions become true, then return live runtime state. Optionally capture a PNG of the stage and stop the project. Use this to verify gameplay, score changes, clones and threads after edits.",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "number", description: "Wait seconds, or timeout when conditions are provided. Default 2." },
          conditions: { type: "array", items: { type: "object", additionalProperties: true }, description: "Optional wait_until conditions." },
          screenshot: { type: "boolean", description: "Capture the stage as a PNG data URL. Default false." },
          stop_after: { type: "boolean", description: "Stop all scripts after capturing state. Default false." }
        }
      },
      handler: async (args, ctx) => {
        runProject();
        let waitResult;
        if (Array.isArray(args.conditions) && args.conditions.length) {
          waitResult = await waitUntil({
            conditions: args.conditions,
            timeout: args.seconds ?? 5,
            interval: 0.1,
            signal: ctx.signal
          });
        } else {
          waitResult = await waitSeconds(args.seconds ?? 2, ctx.signal);
        }
        const state = getRuntimeState();
        let screenshot = null;
        if (args.screenshot) screenshot = await captureStage();
        if (args.stop_after) stopProject();
        return { wait: waitResult, state, screenshot, stopped: Boolean(args.stop_after) };
      }
    },
    {
      name: "capture_stage",
      description: "Capture the current stage as a PNG data URL. The image is shown in the chat tool card; use get_runtime_state for text-verifiable state.",
      parameters: { type: "object", properties: {} },
      handler() {
        return captureStage();
      }
    },
    {
      name: "undo_last_change",
      description: "Undo the most recent AI edit by restoring the project snapshot taken before that edit.",
      parameters: { type: "object", properties: {} },
      mutating: true,
      snapshot: false,
      handler() {
        return restoreLastSnapshot();
      }
    },
    {
      name: "redo_last_change",
      description: "Redo the most recently undone AI change, restoring the project state that was active before the undo.",
      parameters: { type: "object", properties: {} },
      mutating: true,
      snapshot: false,
      handler() {
        return redoLastSnapshot();
      }
    },
    {
      name: "list_checkpoints",
      description: "List persistent project checkpoints (saved automatically before AI edits, and on demand). Checkpoints survive page reloads via IndexedDB. Returns ids, labels, timestamps and sizes.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ checkpoints: await listCheckpoints() })
    },
    {
      name: "save_checkpoint",
      description: "Save a named checkpoint of the current project that survives page reloads. Use before large experiments or as a manual version marker.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string", description: "Checkpoint label." }
        }
      },
      handler: async (args) => {
        const saved = await pushSnapshot(String(args.label || "\u624B\u52A8\u68C0\u67E5\u70B9"));
        return { saved: Boolean(saved && saved.ok), label: args.label || "\u624B\u52A8\u68C0\u67E5\u70B9", count: saved?.count };
      }
    },
    {
      name: "restore_checkpoint",
      description: "Restore a persistent checkpoint by id. The current project is snapshotted first so the restore itself can be undone.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Checkpoint id from list_checkpoints." }
        },
        required: ["id"]
      },
      mutating: true,
      snapshot: false,
      handler: async (args) => {
        const checkpoint = await loadCheckpoint(args.id);
        if (!checkpoint) throw new Error("\u627E\u4E0D\u5230\u8BE5\u68C0\u67E5\u70B9\u3002");
        await pushSnapshot("\u6062\u590D\u68C0\u67E5\u70B9\u524D");
        const vm = getVM();
        const editingName = vm.editingTarget ? vm.editingTarget.getName() : null;
        await vm.loadProject(checkpoint.json);
        if (editingName) {
          const target = getTargetByName(editingName);
          if (target) vm.setEditingTarget(target.id);
        }
        vm.emitWorkspaceUpdate();
        return { restored: true, id: checkpoint.id, label: checkpoint.label, at: checkpoint.at };
      }
    },
    {
      name: "delete_checkpoint",
      description: "Delete a persistent checkpoint by id. This only removes the saved checkpoint; it does not modify the project.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Checkpoint id from list_checkpoints." }
        },
        required: ["id"]
      },
      handler: async (args) => ({ deleted: await deleteCheckpoint(args.id), id: args.id })
    },
    {
      name: "update_plan",
      description: "Update the visible task plan shown to the user. Use this for multi-step work and keep statuses current. This tool does not modify the project.",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "done"] }
              },
              required: ["title"]
            }
          }
        },
        required: ["steps"]
      },
      handler(args, ctx) {
        const steps = Array.isArray(args.steps) ? args.steps : [];
        ctx.setPlan(steps);
        return { steps };
      }
    }
  ];
  var TOOL_MAP = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
  var TOOL_SCHEMAS = TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
  async function executeTool(name, args, ctx) {
    const tool = TOOL_MAP.get(name);
    if (!tool) {
      return { ok: false, error: `\u672A\u77E5\u5DE5\u5177: ${name}` };
    }
    if (ctx.signal && ctx.signal.aborted) {
      return { ok: false, error: "\u64CD\u4F5C\u5DF2\u53D6\u6D88\u3002" };
    }
    if (tool.destructive && ctx.confirmDestructive) {
      const approved = await ctx.confirm({
        title: "\u786E\u8BA4\u6267\u884C\u7834\u574F\u6027\u64CD\u4F5C",
        message: `AI \u60F3\u8981\u6267\u884C\u300C${tool.name}\u300D\u3002\u8FD9\u4F1A\u4FEE\u6539\u6216\u5220\u9664\u5F53\u524D\u4F5C\u54C1\u5185\u5BB9\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F`
      });
      if (!approved) {
        return { ok: false, error: "\u7528\u6237\u62D2\u7EDD\u4E86\u8BE5\u64CD\u4F5C\u3002" };
      }
    }
    if (tool.mutating && tool.snapshot !== false) {
      await ctx.ensureSnapshot(tool.name);
    }
    try {
      const result = await tool.handler(args || {}, ctx);
      return { ok: true, ...result && typeof result === "object" ? result : { result } };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  }

  // src/agent/mock.js
  function sleep2(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  async function streamText(text, onDelta, signal) {
    if (!text) return;
    const chunkSize = 10;
    for (let i = 0; i < text.length; i += chunkSize) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      onDelta?.(text.slice(i, i + chunkSize));
      await sleep2(14, signal);
    }
  }
  function toolCall(name, args, index = 0) {
    return {
      id: `mock_${Date.now()}_${index}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args || {})
      }
    };
  }
  function findLastTool(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "tool") continue;
      let name = message.name || "";
      if (!name && message.tool_call_id) {
        for (let j = i - 1; j >= 0; j--) {
          const assistant = messages[j];
          if (assistant.role === "assistant" && Array.isArray(assistant.tool_calls)) {
            const call = assistant.tool_calls.find((item) => item.id === message.tool_call_id);
            if (call) {
              name = call.function?.name || "";
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
      if (message.role !== "tool") continue;
      let callName = message.name || "";
      if (!callName && message.tool_call_id) {
        for (let j = i - 1; j >= 0; j--) {
          const assistant = messages[j];
          if (assistant.role === "assistant" && Array.isArray(assistant.tool_calls)) {
            const call = assistant.tool_calls.find((item) => item.id === message.tool_call_id);
            if (call) {
              callName = call.function?.name || "";
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
      if (messages[i].role === "user") return String(messages[i].content || "");
    }
    return "";
  }
  function demoScripts() {
    return [
      {
        opcode: "event_whenflagclicked",
        next: [
          {
            opcode: "looks_switchcostumeto",
            inputs: { COSTUME: "costume1" }
          },
          {
            opcode: "looks_sayforsecs",
            inputs: { MESSAGE: "\u4F60\u597D\uFF01\u6211\u662F OpenBlocks\u3002", SECS: 2 }
          },
          {
            opcode: "control_repeat",
            inputs: { TIMES: 10 },
            substacks: {
              SUBSTACK: [
                { opcode: "motion_movesteps", inputs: { STEPS: 12 } },
                { opcode: "motion_turnright", inputs: { DEGREES: 18 } },
                { opcode: "motion_ifonedgebounce" }
              ]
            }
          },
          {
            opcode: "looks_say",
            inputs: { MESSAGE: "\u6309\u7A7A\u683C\u952E\u52A0\u5206\uFF01" }
          }
        ]
      },
      {
        opcode: "event_whenkeypressed",
        fields: { KEY_OPTION: "space" },
        next: [
          {
            opcode: "data_changevariableby",
            fields: { VARIABLE: "score" },
            inputs: { VALUE: 1 }
          },
          {
            opcode: "looks_say",
            inputs: {
              MESSAGE: {
                opcode: "operator_join",
                inputs: {
                  STRING1: "\u5F97\u5206: ",
                  STRING2: { variable: "score" }
                }
              }
            }
          }
        ]
      }
    ];
  }
  function demoTarget(messages) {
    const created = findToolResult(messages, "create_sprite");
    if (created && created.name) return created.name;
    const project = findToolResult(messages, "get_project");
    if (project && Array.isArray(project.sprites) && project.sprites.length) {
      return project.sprites[0].name;
    }
    return "Stage";
  }
  function planSteps(phase = "build") {
    const step2 = phase === "build" ? "in_progress" : "done";
    const step3 = phase === "done" ? "done" : phase === "run" ? "in_progress" : "pending";
    return [
      { title: "\u8BFB\u53D6\u5F53\u524D\u9879\u76EE\u7ED3\u6784", status: "done" },
      { title: "\u521B\u5EFA\u6F14\u793A\u89D2\u8272\u4E0E\u811A\u672C", status: step2 },
      { title: "\u8FD0\u884C\u5E76\u68C0\u67E5\u7ED3\u679C", status: step3 }
    ];
  }
  async function mockChat({ messages, signal, onDelta, onReasoning }) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    const lastTool = findLastTool(messages);
    const user = lastUserMessage(messages);
    if (!lastTool) {
      if (/demo|示例|演示|测试|hello|你好|做一个|build|game|游戏|脚本/i.test(user)) {
        await onReasoning?.("\u6211\u5148\u8BFB\u53D6\u9879\u76EE\uFF0C\u786E\u8BA4\u6709\u54EA\u4E9B\u89D2\u8272\u548C\u53D8\u91CF\u3002");
        await streamText("\u6211\u5148\u67E5\u770B\u5F53\u524D\u9879\u76EE\u7ED3\u6784\u3002", onDelta, signal);
        return {
          content: "\u6211\u5148\u67E5\u770B\u5F53\u524D\u9879\u76EE\u7ED3\u6784\u3002",
          reasoning: "\u6211\u5148\u8BFB\u53D6\u9879\u76EE\uFF0C\u786E\u8BA4\u6709\u54EA\u4E9B\u89D2\u8272\u548C\u53D8\u91CF\u3002",
          toolCalls: [toolCall("get_project", { detail: "summary" })],
          usage: { prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      const text2 = "\u5F53\u524D\u662F\u300C\u672C\u5730\u6F14\u793A\u6A21\u5F0F\u300D\uFF0C\u4E0D\u4F1A\u8C03\u7528\u771F\u5B9E AI\u3002\n\n\u53D1\u9001\u5305\u542B\u300C\u793A\u4F8B\u300D\u7684\u6D88\u606F\uFF0C\u6211\u4F1A\u6F14\u793A\u5982\u4F55\u8BFB\u53D6\u9879\u76EE\u3001\u81EA\u52A8\u521B\u5EFA\u89D2\u8272\u3001\u62FC\u88C5\u79EF\u6728\u5E76\u8FD0\u884C\u3002\n\n\u8981\u4F7F\u7528\u771F\u6B63\u7684 AI\uFF0C\u8BF7\u70B9\u51FB\u53F3\u4E0A\u89D2\u8BBE\u7F6E\uFF0C\u9009\u62E9 OpenAI / DeepSeek / OpenRouter / Ollama\uFF0C\u5E76\u586B\u5199 API Key\u3002";
      await streamText(text2, onDelta, signal);
      return {
        content: text2,
        reasoning: "",
        toolCalls: [],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    if (lastTool.name === "get_project") {
      const project = lastTool.result || {};
      const hasSprite = Array.isArray(project.sprites) && project.sprites.length > 0;
      if (!hasSprite) {
        const text3 = "\u9879\u76EE\u91CC\u8FD8\u6CA1\u6709\u89D2\u8272\uFF0C\u6211\u5148\u521B\u5EFA\u4E00\u4E2A\u6F14\u793A\u89D2\u8272\u3002";
        await onReasoning?.("\u6CA1\u6709\u53EF\u7528\u89D2\u8272\uFF0C\u9700\u8981\u5148\u521B\u5EFA\u3002");
        await streamText(text3, onDelta, signal);
        return {
          content: text3,
          reasoning: "\u6CA1\u6709\u53EF\u7528\u89D2\u8272\uFF0C\u9700\u8981\u5148\u521B\u5EFA\u3002",
          toolCalls: [toolCall("create_sprite", { name: "AI Demo", x: 0, y: 0 })],
          usage: { prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      const text2 = "\u9879\u76EE\u7ED3\u6784\u6B63\u5E38\uFF0C\u6211\u6765\u89C4\u5212\u5E76\u5199\u5165\u79EF\u6728\u3002";
      await onReasoning?.("\u5DF2\u6709\u89D2\u8272\uFF0C\u76F4\u63A5\u66F4\u65B0\u8BA1\u5212\u5E76\u6784\u5EFA\u811A\u672C\u3002");
      await streamText(text2, onDelta, signal);
      return {
        content: text2,
        reasoning: "\u5DF2\u6709\u89D2\u8272\uFF0C\u76F4\u63A5\u66F4\u65B0\u8BA1\u5212\u5E76\u6784\u5EFA\u811A\u672C\u3002",
        toolCalls: [toolCall("update_plan", { steps: planSteps("build") })],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    if (lastTool.name === "create_sprite") {
      const text2 = "\u89D2\u8272\u5DF2\u521B\u5EFA\uFF0C\u73B0\u5728\u89C4\u5212\u79EF\u6728\u3002";
      await streamText(text2, onDelta, signal);
      return {
        content: text2,
        reasoning: "",
        toolCalls: [toolCall("update_plan", { steps: planSteps("build") })],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    if (lastTool.name === "update_plan") {
      if (findToolResult(messages, "run_project")) {
        const text3 = "\u6F14\u793A\u5B8C\u6210\u3002\u6211\u521B\u5EFA\u4E86\uFF1A\n\n1. \u7EFF\u65D7\u811A\u672C\uFF1A\u5207\u6362\u9020\u578B \u2192 \u8BF4\u8BDD \u2192 \u91CD\u590D\u79FB\u52A8/\u8F6C\u5411 \u2192 \u8FB9\u7F18\u53CD\u5F39 \u2192 \u63D0\u793A\u3002\n2. \u7A7A\u683C\u952E\u811A\u672C\uFF1A\u628A\u5168\u5C40\u53D8\u91CF `score` \u52A0 1\uFF0C\u5E76\u8BF4\u51FA\u5F97\u5206\u3002\n\n\u4F60\u53EF\u4EE5\u5728\u821E\u53F0\u91CC\u6309\u7A7A\u683C\u952E\u6D4B\u8BD5\uFF0C\u6216\u7EE7\u7EED\u8BA9\u6211\u4FEE\u6539\u3002";
        await onReasoning?.("\u6F14\u793A\u6D41\u7A0B\u7ED3\u675F\uFF0C\u603B\u7ED3\u6539\u52A8\u3002");
        await streamText(text3, onDelta, signal);
        return {
          content: text3,
          reasoning: "\u6F14\u793A\u6D41\u7A0B\u7ED3\u675F\uFF0C\u603B\u7ED3\u6539\u52A8\u3002",
          toolCalls: [],
          usage: { prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      if (findToolResult(messages, "add_script")) {
        const text3 = "\u79EF\u6728\u5DF2\u7ECF\u62FC\u597D\u4E86\uFF0C\u6211\u8FD0\u884C\u4E00\u4E0B\u770B\u770B\u6548\u679C\u3002";
        await streamText(text3, onDelta, signal);
        return {
          content: text3,
          reasoning: "",
          toolCalls: [toolCall("run_project", {})],
          usage: { prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      const target = demoTarget(messages);
      const text2 = `\u6211\u8981\u7ED9\u300C${target}\u300D\u6DFB\u52A0\u4E24\u4E2A\u811A\u672C\uFF1A\u7EFF\u65D7\u52A8\u753B\u548C\u7A7A\u683C\u952E\u8BA1\u5206\u3002`;
      await onReasoning?.("\u4F7F\u7528 add_script \u7684 DSL\uFF0C\u5305\u542B\u63A7\u5236\u3001\u8FD0\u52A8\u3001\u5916\u89C2\u3001\u53D8\u91CF\u548C\u83DC\u5355\u8F93\u5165\u3002");
      await streamText(text2, onDelta, signal);
      return {
        content: text2,
        reasoning: "\u4F7F\u7528 add_script \u7684 DSL\uFF0C\u5305\u542B\u63A7\u5236\u3001\u8FD0\u52A8\u3001\u5916\u89C2\u3001\u53D8\u91CF\u548C\u83DC\u5355\u8F93\u5165\u3002",
        toolCalls: [
          toolCall("add_script", {
            target,
            scripts: demoScripts(),
            auto_create_variables: true
          })
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    if (lastTool.name === "add_script") {
      const text2 = "\u79EF\u6728\u5DF2\u7ECF\u62FC\u597D\u4E86\uFF0C\u6211\u66F4\u65B0\u8BA1\u5212\u5E76\u8FD0\u884C\u770B\u770B\u6548\u679C\u3002";
      await streamText(text2, onDelta, signal);
      return {
        content: text2,
        reasoning: "",
        toolCalls: [toolCall("update_plan", { steps: planSteps("run") })],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    if (lastTool.name === "run_project") {
      const text2 = "\u8FD0\u884C\u5B8C\u6210\uFF0C\u66F4\u65B0\u4EFB\u52A1\u8BA1\u5212\u3002";
      await streamText(text2, onDelta, signal);
      return {
        content: text2,
        reasoning: "",
        toolCalls: [toolCall("update_plan", { steps: planSteps("done") })],
        usage: { prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    const text = "\u6F14\u793A\u5B8C\u6210\u3002\u4F60\u53EF\u4EE5\u7EE7\u7EED\u63CF\u8FF0\u60F3\u505A\u7684\u529F\u80FD\uFF0C\u6216\u6253\u5F00\u8BBE\u7F6E\u63A5\u5165\u771F\u5B9E AI\u3002";
    await streamText(text, onDelta, signal);
    return {
      content: text,
      reasoning: "",
      toolCalls: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    };
  }

  // src/agent/llm.js
  var LLMError = class extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = "LLMError";
      this.status = options.status;
      this.body = options.body;
      this.hint = options.hint;
    }
  };
  function fetchImpl() {
    const scratch = globalThis.Scratch;
    if (scratch && typeof scratch.fetch === "function") {
      return scratch.fetch.bind(scratch);
    }
    if (typeof globalThis.fetch === "function") {
      return globalThis.fetch.bind(globalThis);
    }
    throw new LLMError("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 fetch\uFF0C\u65E0\u6CD5\u8C03\u7528 AI \u63A5\u53E3\u3002");
  }
  function resolveEndpoint(baseUrl) {
    let base = String(baseUrl || "").trim();
    if (!base) throw new LLMError("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 API Base URL\u3002");
    base = base.replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(base)) return base;
    if (!/\/v\d+(?:\.\d+)?$/i.test(base)) {
      try {
        const url = new URL(base);
        if (!url.pathname || url.pathname === "/") {
          base += "/v1";
        }
      } catch {
      }
    }
    return `${base}/chat/completions`;
  }
  function buildHeaders(settings) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    if (/openrouter\.ai/i.test(settings.baseUrl || "")) {
      headers["HTTP-Referer"] = "https://turbowarp.org";
      headers["X-Title"] = "OpenBlocks";
    }
    return headers;
  }
  function contentToString(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        if (part && typeof part.content === "string") return part.content;
        return "";
      }).join("");
    }
    if (content === null || content === void 0) return "";
    return String(content);
  }
  function reasoningToString(reasoning) {
    if (typeof reasoning === "string") return reasoning;
    if (reasoning && typeof reasoning.content === "string") return reasoning.content;
    if (reasoning && typeof reasoning.text === "string") return reasoning.text;
    return "";
  }
  function normalizeToolCalls(toolCalls) {
    if (!Array.isArray(toolCalls)) return [];
    return toolCalls.filter((call) => call && (call.function || call.name)).map((call, index) => {
      const fn = call.function || call;
      let args = fn.arguments;
      if (args === void 0 || args === null) args = "{}";
      if (typeof args !== "string") args = JSON.stringify(args);
      return {
        id: call.id || `call_${Date.now()}_${index}`,
        type: "function",
        function: {
          name: fn.name || "",
          arguments: args
        }
      };
    }).filter((call) => call.function.name);
  }
  function createAccumulator() {
    return {
      content: "",
      reasoning: "",
      toolCalls: [],
      usage: null
    };
  }
  function ensureToolCall(accumulator, index) {
    if (!accumulator.toolCalls[index]) {
      accumulator.toolCalls[index] = {
        id: "",
        type: "function",
        function: { name: "", arguments: "" }
      };
    }
    return accumulator.toolCalls[index];
  }
  function applyDelta(accumulator, data, callbacks) {
    if (data.usage) accumulator.usage = data.usage;
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    if (!choice) return;
    const delta = choice.delta || choice.message || {};
    const content = contentToString(delta.content);
    if (content) {
      accumulator.content += content;
      callbacks.onDelta?.(content);
    }
    const reasoning = reasoningToString(delta.reasoning_content ?? delta.reasoning);
    if (reasoning) {
      accumulator.reasoning += reasoning;
      callbacks.onReasoning?.(reasoning);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const toolCall2 of delta.tool_calls) {
        const index = Number.isInteger(toolCall2.index) ? toolCall2.index : 0;
        const target = ensureToolCall(accumulator, index);
        if (toolCall2.id) target.id = toolCall2.id;
        if (toolCall2.type) target.type = toolCall2.type;
        if (toolCall2.function) {
          if (toolCall2.function.name) target.function.name += toolCall2.function.name;
          if (toolCall2.function.arguments) target.function.arguments += toolCall2.function.arguments;
        }
      }
    }
  }
  function finalizeAccumulator(accumulator) {
    accumulator.toolCalls = accumulator.toolCalls.filter((call) => call && call.function && call.function.name).map((call, index) => ({
      id: call.id || `call_${Date.now()}_${index}`,
      type: "function",
      function: {
        name: call.function.name,
        arguments: call.function.arguments || "{}"
      }
    }));
    return accumulator;
  }
  async function readSSE(response, callbacks, signal) {
    const accumulator = createAccumulator();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handleLine = (rawLine) => {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":") || !line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        return;
      }
      applyDelta(accumulator, json, callbacks);
    };
    while (true) {
      if (signal && signal.aborted) {
        try {
          await reader.cancel();
        } catch {
        }
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handleLine(line);
      }
    }
    if (buffer.trim()) handleLine(buffer);
    return finalizeAccumulator(accumulator);
  }
  async function readJSONResponse(response, callbacks) {
    const data = await response.json();
    const accumulator = createAccumulator();
    accumulator.usage = data.usage || null;
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    const message = choice?.message || {};
    accumulator.content = contentToString(message.content);
    accumulator.reasoning = reasoningToString(message.reasoning_content ?? message.reasoning);
    if (accumulator.content) callbacks.onDelta?.(accumulator.content);
    if (accumulator.reasoning) callbacks.onReasoning?.(accumulator.reasoning);
    accumulator.toolCalls = normalizeToolCalls(message.tool_calls);
    return accumulator;
  }
  var RETRYABLE_STATUS = /* @__PURE__ */ new Set([408, 409, 425, 429, 500, 502, 503, 504]);
  function sleep3(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      let timer;
      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  function parseRetryAfter(response) {
    try {
      const header = response.headers?.get?.("retry-after");
      if (!header) return null;
      const seconds = Number(header);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
      const date = Date.parse(header);
      if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    } catch {
    }
    return null;
  }
  function retryDelay(retryNumber, response, settings) {
    const maxDelay = Number.isFinite(Number(settings.maxRetryDelay)) ? Number(settings.maxRetryDelay) : 1e4;
    const retryAfter = response ? parseRetryAfter(response) : null;
    if (retryAfter !== null) return Math.min(retryAfter, maxDelay);
    const base = Number.isFinite(Number(settings.retryBaseDelay)) ? Number(settings.retryBaseDelay) : 900;
    const exponential = base * Math.pow(2, Math.max(0, retryNumber - 1));
    const jitter = Math.random() * Math.min(400, exponential * 0.25);
    return Math.min(maxDelay, exponential + jitter);
  }
  function errorDetail(text) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.error?.message || parsed.message || text;
    } catch {
    }
    return detail;
  }
  function statusHint(status) {
    if (status === 401) return "API Key \u65E0\u6548\u6216\u672A\u586B\u5199\u3002";
    if (status === 404) return "\u6A21\u578B\u540D\u6216 Base URL \u4E0D\u6B63\u786E\u3002";
    if (status === 429) return "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\u6216\u989D\u5EA6\u4E0D\u8DB3\u3002";
    if (status === 503) return "\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u5DF2\u81EA\u52A8\u91CD\u8BD5\uFF1B\u5982\u679C\u6301\u7EED\u5931\u8D25\uFF0C\u53EF\u5728\u8BBE\u7F6E\u4E2D\u63D0\u9AD8\u201C\u5931\u8D25\u81EA\u52A8\u91CD\u8BD5\u6B21\u6570\u201D\uFF0C\u6216\u7A0D\u540E\u518D\u8BD5/\u5207\u6362\u670D\u52A1\u5546\u3002";
    return void 0;
  }
  async function chat({ settings, messages, tools = [], signal, onDelta, onReasoning, onRetry, maxTokens, stream }) {
    if (settings.provider === "mock") {
      return mockChat({ settings, messages, signal, onDelta, onReasoning });
    }
    const endpoint = resolveEndpoint(settings.baseUrl);
    const useStream = stream === void 0 ? settings.stream !== false : Boolean(stream);
    const body = {
      model: settings.model || "gpt-4o-mini",
      messages,
      temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.3,
      stream: useStream
    };
    if (tools.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    if (maxTokens) body.max_tokens = maxTokens;
    const configuredRetries = Number(settings.maxRetries);
    const maxRetries = Math.max(0, Math.min(8, Number.isFinite(configuredRetries) ? configuredRetries : 3));
    const fetchFn = fetchImpl();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let response;
      try {
        response = await fetchFn(endpoint, {
          method: "POST",
          headers: buildHeaders(settings),
          body: JSON.stringify(body),
          signal
        });
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        if (attempt < maxRetries) {
          const delay = retryDelay(attempt + 1, null, settings);
          onRetry?.({
            attempt: attempt + 1,
            maxRetries,
            delay,
            reason: "network",
            error: error && error.message ? error.message : String(error)
          });
          await sleep3(delay, signal);
          continue;
        }
        const suffix2 = attempt > 0 ? `\uFF08\u5DF2\u91CD\u8BD5 ${attempt} \u6B21\uFF09` : "";
        throw new LLMError(`\u65E0\u6CD5\u8FDE\u63A5 AI \u63A5\u53E3${suffix2}\uFF1A${error && error.message ? error.message : error}`, {
          hint: "\u8BF7\u68C0\u67E5 Base URL\u3001\u7F51\u7EDC\u548C\u6D4F\u89C8\u5668 CORS \u8BBE\u7F6E\u3002OpenAI \u517C\u5BB9\u63A5\u53E3\u901A\u5E38\u9700\u8981\u5141\u8BB8\u6D4F\u89C8\u5668\u8DE8\u57DF\uFF1B\u672C\u5730 Ollama \u9700\u8981\u8BBE\u7F6E OLLAMA_ORIGINS=*\u3002"
        });
      }
      if (response.ok) {
        if (useStream && response.body) {
          return readSSE(response, { onDelta, onReasoning }, signal);
        }
        return readJSONResponse(response, { onDelta, onReasoning });
      }
      let text = "";
      try {
        text = await response.text();
      } catch {
      }
      const detail = errorDetail(text);
      const status = response.status;
      if (RETRYABLE_STATUS.has(status) && attempt < maxRetries) {
        const delay = retryDelay(attempt + 1, response, settings);
        onRetry?.({
          attempt: attempt + 1,
          maxRetries,
          delay,
          reason: "status",
          status,
          detail
        });
        await sleep3(delay, signal);
        continue;
      }
      const suffix = attempt > 0 ? `\uFF08\u5DF2\u91CD\u8BD5 ${attempt} \u6B21\uFF09` : "";
      throw new LLMError(`AI \u63A5\u53E3\u8FD4\u56DE ${status}${suffix}: ${detail || response.statusText}`, {
        status,
        body: text,
        hint: statusHint(status)
      });
    }
    throw new LLMError("AI \u8BF7\u6C42\u5931\u8D25\uFF1A\u5DF2\u8FBE\u5230\u6700\u5927\u91CD\u8BD5\u6B21\u6570\u3002");
  }
  async function testConnection(settings) {
    if (settings.provider === "mock") {
      return { ok: true, message: "\u672C\u5730\u6F14\u793A\u6A21\u5F0F\u53EF\u7528\u3002" };
    }
    const result = await chat({
      settings,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      tools: [],
      stream: false,
      maxTokens: 16
    });
    return { ok: true, message: result.content || "(\u63A5\u53E3\u8FD4\u56DE\u7A7A\u5185\u5BB9)" };
  }

  // src/agent/agent.js
  function sanitizeApiMessages(messages) {
    const result = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message || typeof message !== "object") continue;
      if (message.role === "system") continue;
      if (message.role === "tool") continue;
      if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
        const ids = new Set(message.tool_calls.map((call) => call.id));
        const toolMessages = [];
        let j = i + 1;
        while (j < messages.length && messages[j] && messages[j].role === "tool") {
          if (ids.has(messages[j].tool_call_id)) toolMessages.push(messages[j]);
          j++;
        }
        if (toolMessages.length === ids.size) {
          result.push(message, ...toolMessages);
          i = j - 1;
        } else {
          break;
        }
        continue;
      }
      result.push(message);
    }
    while (result.length && result[result.length - 1].role === "tool") result.pop();
    return result.slice(-60);
  }
  function formatError(error) {
    if (!error) return "\u672A\u77E5\u9519\u8BEF";
    if (error instanceof LLMError) {
      return [error.message, error.hint].filter(Boolean).join("\n\n");
    }
    if (error.name === "AbortError") return "\u5DF2\u505C\u6B62\u3002";
    return error.message || String(error);
  }
  function compactToolResultForModel(result) {
    if (!result || typeof result !== "object") return result;
    const copy = { ...result };
    if (typeof copy.image_data_url === "string") {
      copy.image_data_url = `[PNG data URL omitted (${copy.image_data_url.length} chars)]`;
    }
    if (copy.screenshot && typeof copy.screenshot === "object" && typeof copy.screenshot.image_data_url === "string") {
      copy.screenshot = {
        ...copy.screenshot,
        image_data_url: `[PNG data URL omitted (${copy.screenshot.image_data_url.length} chars)]`
      };
    }
    return copy;
  }
  function parseToolArguments(raw) {
    try {
      const parsed = JSON.parse(raw || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("\u53C2\u6570\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
      }
      return { ok: true, args: parsed };
    } catch (error) {
      return {
        ok: false,
        error: `\u5DE5\u5177\u53C2\u6570\u4E0D\u662F\u5408\u6CD5 JSON: ${error.message}. \u539F\u59CB\u5185\u5BB9: ${String(raw).slice(0, 800)}`
      };
    }
  }
  var Agent = class {
    constructor({ settings, getContext, confirm, onEvent } = {}) {
      this.settings = settings;
      this.getContext = getContext || (() => "");
      this.confirm = confirm || (async () => true);
      this.onEvent = onEvent || (() => {
      });
      this.display = [];
      this.apiMessages = [];
      this.plan = [];
      this.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      this.running = false;
      this.abortController = null;
      this.restore();
    }
    getProjectFingerprint() {
      try {
        const vm = globalThis.Scratch && globalThis.Scratch.vm;
        if (!vm || !vm.runtime) return "";
        return vm.runtime.targets.filter((target) => target.isOriginal).map((target) => `${target.id}:${target.getName()}:${target.blocks && target.blocks._scripts ? target.blocks._scripts.length : 0}`).join("|");
      } catch {
        return "";
      }
    }
    restore() {
      const session = loadSession();
      const fingerprint = this.getProjectFingerprint();
      if (!session.fingerprint || session.fingerprint !== fingerprint) {
        this.display = [];
        this.apiMessages = [];
        this.plan = [];
        clearSession();
        return;
      }
      this.display = Array.isArray(session.display) ? session.display : [];
      this.apiMessages = sanitizeApiMessages(Array.isArray(session.apiMessages) ? session.apiMessages : []);
      this.plan = Array.isArray(session.plan) ? session.plan : [];
      this.usage = session.usage && typeof session.usage === "object" ? {
        prompt_tokens: Number(session.usage.prompt_tokens) || 0,
        completion_tokens: Number(session.usage.completion_tokens) || 0,
        total_tokens: Number(session.usage.total_tokens) || 0
      } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }
    emit(type, payload = {}) {
      try {
        this.onEvent({ type, ...payload });
      } catch {
      }
    }
    getDisplay() {
      return this.display;
    }
    getPlan() {
      return this.plan;
    }
    setPlan(steps) {
      this.plan = (Array.isArray(steps) ? steps : []).filter((step) => step && typeof step.title === "string").map((step) => ({
        title: step.title.slice(0, 200),
        status: ["pending", "in_progress", "done"].includes(step.status) ? step.status : "pending"
      }));
      this.emit("plan", { steps: this.plan });
      this.persist();
    }
    setSettings(settings) {
      this.settings = settings;
    }
    persist() {
      saveSession({
        display: this.display,
        apiMessages: this.apiMessages,
        plan: this.plan,
        usage: this.usage,
        fingerprint: this.getProjectFingerprint()
      });
    }
    buildContext() {
      try {
        const context = this.getContext();
        if (!context) return "";
        const text = typeof context === "string" ? context : JSON.stringify(context, null, 2);
        return text.length > 9e3 ? `${text.slice(0, 9e3)}
\u2026 (context truncated)` : text;
      } catch (error) {
        return `Project context unavailable: ${error && error.message ? error.message : error}`;
      }
    }
    buildMessages() {
      if (this.apiMessages.length > 80) {
        this.apiMessages = sanitizeApiMessages(this.apiMessages.slice(-80));
      }
      return [
        ...buildSystemMessages(this.settings, this.buildContext()),
        ...this.apiMessages
      ];
    }
    async send(text) {
      const prompt = String(text || "").trim();
      if (!prompt) return { ok: false, error: "\u6D88\u606F\u4E3A\u7A7A\u3002" };
      if (this.running) return { ok: false, error: "AI \u6B63\u5728\u5904\u7406\u4E0A\u4E00\u6761\u6D88\u606F\u3002" };
      this.running = true;
      this.abortController = new AbortController();
      this.emit("running", { value: true });
      const userEntry = {
        id: uid("msg"),
        type: "user",
        content: prompt,
        time: Date.now(),
        snapshotMark: snapshotCount(),
        planBefore: this.plan.map((step) => ({ ...step }))
      };
      this.display.push(userEntry);
      this.emit("user", { entry: userEntry });
      this.apiMessages.push({ role: "user", content: prompt });
      this.persist();
      let snapshotTaken = false;
      let errorText = "";
      const signal = this.abortController.signal;
      const maxSteps = clampNumber(this.settings.maxSteps, 1, 30, 12);
      let finalText = "";
      const ctx = {
        signal,
        confirmDestructive: this.settings.confirmDestructive !== false,
        confirm: (options) => this.confirm(options),
        ensureSnapshot: async (label) => {
          if (snapshotTaken) return;
          snapshotTaken = true;
          await pushSnapshot(label || "AI \u4FEE\u6539");
        },
        setPlan: (steps) => this.setPlan(steps)
      };
      try {
        for (let step = 0; step < maxSteps; step++) {
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");
          this.emit("status", { text: step === 0 ? "AI \u6B63\u5728\u601D\u8003\u2026" : `AI \u6B63\u5728\u7EE7\u7EED\u5904\u7406\uFF08\u7B2C ${step + 1} \u6B65\uFF09\u2026` });
          let assistantEntry = null;
          let firstChunk = true;
          const markFirstChunk = () => {
            if (!firstChunk) return;
            firstChunk = false;
            this.emit("status", { text: "AI \u6B63\u5728\u56DE\u590D\u2026" });
          };
          const ensureAssistant = () => {
            if (assistantEntry) return assistantEntry;
            assistantEntry = {
              id: uid("msg"),
              type: "assistant",
              content: "",
              reasoning: "",
              time: Date.now()
            };
            this.display.push(assistantEntry);
            this.emit("assistant_start", { entry: assistantEntry });
            return assistantEntry;
          };
          const result = await chat({
            settings: this.settings,
            messages: this.buildMessages(),
            tools: TOOL_SCHEMAS,
            signal,
            onDelta: (chunk) => {
              if (!chunk) return;
              markFirstChunk();
              const entry = ensureAssistant();
              entry.content += chunk;
              this.emit("assistant_delta", { id: entry.id, text: chunk });
            },
            onReasoning: (chunk) => {
              if (!chunk) return;
              markFirstChunk();
              const entry = ensureAssistant();
              entry.reasoning += chunk;
              this.emit("reasoning_delta", { id: entry.id, text: chunk });
            },
            onRetry: (info) => {
              const reason = info.reason === "status" ? `\u63A5\u53E3\u8FD4\u56DE ${info.status}` : "\u7F51\u7EDC\u5F02\u5E38";
              this.emit("status", {
                text: `${reason}\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8BD5\uFF08${info.attempt}/${info.maxRetries}\uFF09\u2026`
              });
            }
          });
          if (result.usage && typeof result.usage === "object") {
            const promptTokens = Number(result.usage.prompt_tokens) || 0;
            const completionTokens = Number(result.usage.completion_tokens) || 0;
            this.usage.prompt_tokens += promptTokens;
            this.usage.completion_tokens += completionTokens;
            this.usage.total_tokens += Number(result.usage.total_tokens) || promptTokens + completionTokens;
            this.emit("usage", { usage: this.usage });
          }
          const content = result.content || "";
          const reasoning = result.reasoning || "";
          const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
          if ((content || reasoning) && !assistantEntry) {
            assistantEntry = ensureAssistant();
            if (content) {
              assistantEntry.content = content;
              this.emit("assistant_delta", { id: assistantEntry.id, text: content });
            }
            if (reasoning) {
              assistantEntry.reasoning = reasoning;
              this.emit("reasoning_delta", { id: assistantEntry.id, text: reasoning });
            }
          }
          if (assistantEntry) {
            assistantEntry.content = content || assistantEntry.content;
            assistantEntry.reasoning = reasoning || assistantEntry.reasoning;
            assistantEntry.streaming = false;
            this.emit("assistant_end", { entry: assistantEntry });
          }
          if (toolCalls.length) {
            this.apiMessages.push({
              role: "assistant",
              content: content || null,
              tool_calls: toolCalls
            });
          } else {
            this.apiMessages.push({ role: "assistant", content: content || "" });
            finalText = content || "";
            this.persist();
            break;
          }
          for (const call of toolCalls) {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            const name = call.function?.name || "unknown";
            const parsed = parseToolArguments(call.function?.arguments);
            const args = parsed.ok ? parsed.args : {};
            const toolEntry = {
              id: uid("tool"),
              type: "tool",
              name,
              args,
              status: "running",
              time: Date.now()
            };
            this.display.push(toolEntry);
            this.emit("tool_start", { entry: toolEntry });
            this.emit("status", { text: `\u6B63\u5728\u6267\u884C ${name}\u2026` });
            let toolResult;
            if (!parsed.ok) {
              toolResult = { ok: false, error: parsed.error };
            } else {
              toolResult = await executeTool(name, args, ctx);
            }
            toolEntry.status = toolResult.ok ? "done" : "error";
            toolEntry.result = toolResult;
            if (!toolResult.ok) toolEntry.error = toolResult.error;
            this.emit("tool_end", { entry: toolEntry });
            const resultText = prettyJSON(compactToolResultForModel(toolResult), 24e3);
            this.apiMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: resultText
            });
            this.persist();
          }
          if (step === maxSteps - 1) {
            const message = `\u5DF2\u8FBE\u5230\u6700\u5927\u6B65\u9AA4\u6570\uFF08${maxSteps}\uFF09\u3002\u4F60\u53EF\u4EE5\u53D1\u9001\u201C\u7EE7\u7EED\u201D\u8BA9\u6211\u63A5\u7740\u505A\u3002`;
            errorText = message;
            this.emit("error", { message });
            const entry = {
              id: uid("msg"),
              type: "error",
              content: message,
              time: Date.now()
            };
            this.display.push(entry);
            this.emit("assistant_start", { entry });
            this.emit("assistant_end", { entry });
          }
        }
      } catch (error) {
        if (error && error.name === "AbortError") {
          errorText = "\u5DF2\u505C\u6B62\u3002";
          this.emit("status", { text: "\u5DF2\u505C\u6B62\u3002" });
        } else {
          const message = formatError(error);
          errorText = message;
          this.emit("error", { message });
          const entry = {
            id: uid("msg"),
            type: "error",
            content: message,
            time: Date.now()
          };
          this.display.push(entry);
          this.emit("assistant_start", { entry });
          this.emit("assistant_end", { entry });
        }
      } finally {
        this.running = false;
        this.abortController = null;
        this.persist();
        this.emit("running", { value: false });
        this.emit("done", { text: finalText });
      }
      return { ok: !errorText, text: finalText || errorText, error: errorText };
    }
    async ask(text) {
      if (this.running) throw new Error("AI \u6B63\u5728\u5904\u7406\u5176\u4ED6\u4EFB\u52A1\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
      const result = await this.send(text);
      return result.text || "";
    }
    async retractFrom(messageId) {
      if (this.running) throw new Error("\u8BF7\u5148\u505C\u6B62\u5F53\u524D AI \u4EFB\u52A1\u3002");
      const index = this.display.findIndex((entry2) => entry2.type === "user" && entry2.id === messageId);
      if (index < 0) throw new Error("\u627E\u4E0D\u5230\u8981\u64A4\u56DE\u7684\u6D88\u606F\u3002");
      const entry = this.display[index];
      const text = entry.content || "";
      const mark = Number.isInteger(entry.snapshotMark) ? entry.snapshotMark : null;
      let restored = 0;
      let rollbackError = "";
      if (mark === null) {
        rollbackError = "\u8FD9\u6761\u6D88\u606F\u6765\u81EA\u65E7\u4F1A\u8BDD\uFF0C\u672A\u8BB0\u5F55\u9879\u76EE\u5FEB\u7167\uFF1B\u5DF2\u64A4\u56DE\u5BF9\u8BDD\uFF0C\u4F46\u672A\u81EA\u52A8\u64A4\u9500\u9879\u76EE\u4FEE\u6539\u3002";
      } else {
        if (snapshotCount() === 0 && mark > 0) {
          rollbackError = "\u9879\u76EE\u5FEB\u7167\u5DF2\u4E22\u5931\uFF08\u53EF\u80FD\u5237\u65B0\u8FC7\u9875\u9762\uFF09\uFF0C\u65E0\u6CD5\u81EA\u52A8\u64A4\u9500\u9879\u76EE\u4FEE\u6539\u3002";
        } else {
          try {
            while (snapshotCount() > mark) {
              await restoreLastSnapshot();
              restored++;
            }
            if (snapshotCount() < mark && !rollbackError) {
              rollbackError = "\u90E8\u5206\u9879\u76EE\u5FEB\u7167\u5DF2\u88AB\u6E05\u7406\uFF0C\u53EF\u80FD\u65E0\u6CD5\u5B8C\u5168\u6062\u590D\u9879\u76EE\u72B6\u6001\u3002";
            }
          } catch (error) {
            rollbackError = error && error.message ? error.message : String(error);
          }
        }
      }
      const userMessagesAfter = this.display.slice(index + 1).filter((item) => item.type === "user").length;
      let apiIndex = -1;
      let seen = 0;
      for (let i = this.apiMessages.length - 1; i >= 0; i--) {
        if (this.apiMessages[i].role === "user") {
          if (seen === userMessagesAfter) {
            apiIndex = i;
            break;
          }
          seen++;
        }
      }
      if (apiIndex < 0) {
        for (let i = this.apiMessages.length - 1; i >= 0; i--) {
          if (this.apiMessages[i].role === "user" && this.apiMessages[i].content === text) {
            apiIndex = i;
            break;
          }
        }
      }
      this.apiMessages = apiIndex >= 0 ? this.apiMessages.slice(0, apiIndex) : [];
      this.display = this.display.slice(0, index);
      this.plan = Array.isArray(entry.planBefore) ? entry.planBefore.map((step) => ({ ...step })) : [];
      this.emit("plan", { steps: this.plan });
      this.persist();
      this.emit("retract", { entry, text, restored, rollbackError });
      return { text, restored, rollbackError };
    }
    stop() {
      if (this.abortController) this.abortController.abort();
    }
    clear() {
      this.stop();
      this.display = [];
      this.apiMessages = [];
      this.plan = [];
      this.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      clearSession();
      this.emit("clear", {});
      this.emit("usage", { usage: this.usage });
      this.emit("plan", { steps: [] });
    }
  };

  // src/styles.css
  var styles_default = ':host {\n  --ob-bg: #1e1e1e;\n  --ob-bg-soft: #252526;\n  --ob-bg-muted: #2d2d30;\n  --ob-panel: #1e1e1e;\n  --ob-border: #3c3c3c;\n  --ob-border-strong: #4b4b4b;\n  --ob-text: #cccccc;\n  --ob-muted: #9d9d9d;\n  --ob-faint: #6f6f6f;\n  --ob-accent: #3794ff;\n  --ob-accent-2: #007acc;\n  --ob-accent-soft: #264f78;\n  --ob-danger: #f48771;\n  --ob-success: #4ec9b0;\n  --ob-warning: #dcdcaa;\n  --ob-font: "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif;\n  --ob-mono: "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace;\n  color-scheme: dark;\n  font-family: var(--ob-font);\n}\n\n* {\n  box-sizing: border-box;\n}\n\n.ob-panel {\n  position: fixed;\n  z-index: 2147483000;\n  top: 38px;\n  right: 0;\n  bottom: 0;\n  width: 430px;\n  display: flex;\n  flex-direction: column;\n  font-family: var(--ob-font);\n  color: var(--ob-text);\n  background: var(--ob-panel);\n  border-left: 1px solid var(--ob-border);\n  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.35);\n  overflow: hidden;\n  animation: ob-panel-in 160ms ease;\n}\n\n.ob-panel[hidden] {\n  display: none !important;\n}\n\n.ob-edge-tab {\n  position: fixed;\n  z-index: 2147483000;\n  top: 50%;\n  right: 0;\n  transform: translateY(-50%);\n  width: 30px;\n  height: 112px;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 7px;\n  border: 1px solid var(--ob-border);\n  border-right: 0;\n  border-radius: 8px 0 0 8px;\n  background: var(--ob-bg-soft);\n  color: var(--ob-text);\n  cursor: pointer;\n  box-shadow: -8px 0 22px rgba(0, 0, 0, 0.28);\n  transition: background 120ms ease, border-color 120ms ease;\n}\n\n.ob-edge-tab[hidden] {\n  display: none;\n}\n\n.ob-edge-tab:hover {\n  background: var(--ob-bg-muted);\n  border-color: var(--ob-border-strong);\n}\n\n.ob-edge-tab-icon {\n  display: flex;\n  color: var(--ob-accent);\n}\n\n.ob-edge-tab-icon svg {\n  width: 16px;\n  height: 16px;\n}\n\n.ob-edge-tab-text {\n  writing-mode: vertical-rl;\n  text-orientation: mixed;\n  font-size: 10px;\n  font-weight: 600;\n  letter-spacing: 1.5px;\n  color: var(--ob-muted);\n}\n\n.ob-header {\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  padding: 9px 10px 9px 12px;\n  min-height: 52px;\n  border-bottom: 1px solid var(--ob-border);\n  background: var(--ob-bg-soft);\n  cursor: grab;\n  user-select: none;\n  flex: 0 0 auto;\n}\n\n.ob-header:active {\n  cursor: grabbing;\n}\n\n.ob-brand {\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  min-width: 0;\n  flex: 1;\n}\n\n.ob-logo {\n  width: 28px;\n  height: 28px;\n  border-radius: 7px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: #ffffff;\n  background: #0e639c;\n  border: 1px solid #1177bb;\n  flex: 0 0 auto;\n}\n\n.ob-logo svg {\n  width: 17px;\n  height: 17px;\n}\n\n.ob-title-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n}\n\n.ob-title {\n  font-size: 13px;\n  font-weight: 600;\n  letter-spacing: 0.1px;\n  line-height: 1.2;\n  color: var(--ob-text);\n}\n\n.ob-live-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: var(--ob-faint);\n  flex: 0 0 auto;\n}\n\n.ob-live-dot.ob-live {\n  background: var(--ob-success);\n  box-shadow: 0 0 6px rgba(78, 201, 176, 0.7);\n  animation: ob-pulse 1.2s infinite;\n}\n\n.ob-subtitle {\n  font-size: 10.5px;\n  color: var(--ob-muted);\n  line-height: 1.35;\n  margin-top: 1px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 250px;\n}\n\n.ob-header-actions {\n  display: flex;\n  align-items: center;\n  gap: 1px;\n  flex: 0 0 auto;\n}\n\n.ob-icon-btn {\n  width: 28px;\n  height: 28px;\n  border: 1px solid transparent;\n  border-radius: 5px;\n  background: transparent;\n  color: var(--ob-muted);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;\n}\n\n.ob-icon-btn:hover {\n  background: var(--ob-bg-muted);\n  border-color: var(--ob-border);\n  color: var(--ob-text);\n}\n\n.ob-icon-btn svg {\n  width: 15px;\n  height: 15px;\n}\n\n.ob-context {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 6px 12px;\n  border-bottom: 1px solid #2d2d30;\n  font-size: 10px;\n  color: var(--ob-muted);\n  background: var(--ob-bg);\n  flex: 0 0 auto;\n  overflow: hidden;\n}\n\n.ob-context .ob-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  padding: 2px 7px;\n  border-radius: 4px;\n  border: 1px solid var(--ob-border);\n  background: var(--ob-bg-soft);\n  white-space: nowrap;\n  max-width: 42%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.ob-context .ob-chip b {\n  color: var(--ob-faint);\n  font-weight: 500;\n}\n\n.ob-context .ob-chip span:last-child {\n  color: var(--ob-text);\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.ob-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: var(--ob-success);\n  flex: 0 0 auto;\n}\n\n.ob-context-stats {\n  margin-left: auto;\n  color: var(--ob-faint);\n  font-size: 10px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.ob-messages {\n  flex: 1 1 auto;\n  overflow-y: auto;\n  overflow-x: hidden;\n  padding: 14px 12px 8px;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  background: var(--ob-bg);\n  scroll-behavior: smooth;\n}\n\n.ob-messages::-webkit-scrollbar,\n.ob-settings-body::-webkit-scrollbar,\n.ob-tool-body::-webkit-scrollbar {\n  width: 10px;\n}\n\n.ob-messages::-webkit-scrollbar-thumb,\n.ob-settings-body::-webkit-scrollbar-thumb,\n.ob-tool-body::-webkit-scrollbar-thumb {\n  background: #424242;\n  border: 2px solid var(--ob-bg);\n  border-radius: 999px;\n}\n\n.ob-messages::-webkit-scrollbar-thumb:hover,\n.ob-settings-body::-webkit-scrollbar-thumb:hover,\n.ob-tool-body::-webkit-scrollbar-thumb:hover {\n  background: #4f4f4f;\n}\n\n.ob-empty {\n  margin: auto;\n  text-align: center;\n  color: var(--ob-muted);\n  padding: 24px 18px;\n  max-width: 330px;\n}\n\n.ob-empty .ob-empty-icon {\n  width: 50px;\n  height: 50px;\n  margin: 0 auto 12px;\n  border-radius: 12px;\n  color: var(--ob-accent);\n  background: var(--ob-bg-soft);\n  border: 1px solid var(--ob-border);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.ob-empty .ob-empty-icon svg {\n  width: 25px;\n  height: 25px;\n}\n\n.ob-empty h3 {\n  margin: 0 0 6px;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--ob-text);\n}\n\n.ob-empty p {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.65;\n  color: var(--ob-muted);\n}\n\n.ob-suggestions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  justify-content: center;\n  margin-top: 14px;\n}\n\n.ob-suggestion {\n  border: 1px solid var(--ob-border);\n  background: var(--ob-bg-soft);\n  color: var(--ob-text);\n  border-radius: 5px;\n  padding: 4px 8px;\n  font-family: var(--ob-font);\n  font-size: 11px;\n  cursor: pointer;\n  transition: background 120ms ease, border-color 120ms ease;\n}\n\n.ob-suggestion:hover {\n  background: var(--ob-bg-muted);\n  border-color: var(--ob-border-strong);\n}\n\n.ob-msg {\n  max-width: 100%;\n  animation: ob-msg-in 120ms ease;\n}\n\n.ob-user-row {\n  align-self: flex-end;\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  max-width: 94%;\n}\n\n.ob-user-actions {\n  display: flex;\n  align-items: center;\n  opacity: 0;\n  transition: opacity 120ms ease;\n}\n\n.ob-user-row:hover .ob-user-actions,\n.ob-user-row:focus-within .ob-user-actions {\n  opacity: 1;\n}\n\n.ob-edit-btn {\n  width: 26px;\n  height: 26px;\n  border: 1px solid transparent;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--ob-muted);\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;\n}\n\n.ob-edit-btn:hover {\n  background: var(--ob-bg-muted);\n  border-color: var(--ob-border);\n  color: var(--ob-text);\n}\n\n.ob-edit-btn svg {\n  width: 14px;\n  height: 14px;\n}\n\n.ob-msg-user {\n  max-width: 100%;\n  padding: 8px 11px;\n  border-radius: 10px 10px 2px 10px;\n  background: #094771;\n  color: #ffffff;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.ob-msg-assistant {\n  align-self: stretch;\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  color: var(--ob-text);\n  word-break: break-word;\n}\n\n.ob-msg-avatar {\n  width: 22px;\n  height: 22px;\n  margin-top: 2px;\n  border-radius: 6px;\n  background: var(--ob-bg-soft);\n  border: 1px solid var(--ob-border);\n  color: var(--ob-accent);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex: 0 0 auto;\n}\n\n.ob-msg-avatar svg {\n  width: 13px;\n  height: 13px;\n}\n\n.ob-msg-body {\n  flex: 1;\n  min-width: 0;\n  padding-top: 1px;\n}\n\n.ob-msg-assistant.ob-streaming .ob-msg-body::after {\n  content: "";\n  display: inline-block;\n  width: 6px;\n  height: 13px;\n  margin-left: 3px;\n  vertical-align: -2px;\n  background: var(--ob-accent);\n  border-radius: 1px;\n  animation: ob-caret 0.9s steps(2) infinite;\n}\n\n.ob-msg-error {\n  align-self: stretch;\n  padding: 8px 10px;\n  border-radius: 6px;\n  background: #3a1d1d;\n  border: 1px solid #5a2a2a;\n  color: var(--ob-danger);\n  font-size: 12px;\n  white-space: pre-wrap;\n}\n\n.ob-msg p {\n  margin: 0 0 8px;\n}\n\n.ob-msg p:last-child {\n  margin-bottom: 0;\n}\n\n.ob-msg h1,\n.ob-msg h2,\n.ob-msg h3,\n.ob-msg h4 {\n  margin: 10px 0 6px;\n  font-size: 13.5px;\n  line-height: 1.35;\n  color: #ffffff;\n}\n\n.ob-msg h1:first-child,\n.ob-msg h2:first-child,\n.ob-msg h3:first-child,\n.ob-msg h4:first-child {\n  margin-top: 0;\n}\n\n.ob-msg ul,\n.ob-msg ol {\n  margin: 4px 0 8px;\n  padding-left: 20px;\n}\n\n.ob-msg li {\n  margin: 2px 0;\n}\n\n.ob-msg code {\n  font-family: var(--ob-mono);\n  font-size: 11.5px;\n  padding: 1px 4px;\n  border-radius: 3px;\n  background: var(--ob-bg-muted);\n  border: 1px solid var(--ob-border);\n  color: #ce9178;\n}\n\n.ob-msg .ob-code {\n  margin: 8px 0;\n  padding: 9px 11px;\n  border-radius: 6px;\n  background: var(--ob-bg-soft);\n  border: 1px solid var(--ob-border);\n  overflow-x: auto;\n}\n\n.ob-msg .ob-code code {\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: #d4d4d4;\n  font-size: 11.5px;\n  line-height: 1.55;\n  white-space: pre;\n}\n\n.ob-msg a {\n  color: var(--ob-accent);\n}\n\n.ob-reasoning {\n  margin-bottom: 7px;\n  border-left: 2px solid var(--ob-border);\n  padding-left: 8px;\n}\n\n.ob-reasoning summary {\n  cursor: pointer;\n  color: var(--ob-muted);\n  font-size: 11px;\n  list-style: none;\n  user-select: none;\n}\n\n.ob-reasoning summary::-webkit-details-marker {\n  display: none;\n}\n\n.ob-reasoning summary::before {\n  content: "\u25B8 ";\n  color: var(--ob-faint);\n}\n\n.ob-reasoning[open] summary::before {\n  content: "\u25BE ";\n}\n\n.ob-reasoning pre {\n  margin: 5px 0 0;\n  color: var(--ob-muted);\n  font-family: var(--ob-font);\n  font-size: 11.5px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.ob-tool {\n  align-self: stretch;\n  border: 1px solid var(--ob-border);\n  border-radius: 6px;\n  background: var(--ob-bg-soft);\n  overflow: hidden;\n}\n\n.ob-tool-head {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  padding: 6px 9px;\n  cursor: pointer;\n  user-select: none;\n  transition: background 120ms ease;\n}\n\n.ob-tool-head:hover {\n  background: #2a2d2e;\n}\n\n.ob-tool-status {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: var(--ob-warning);\n  flex: 0 0 auto;\n}\n\n.ob-tool-status.ob-running {\n  animation: ob-pulse 1.1s infinite;\n}\n\n.ob-tool-status.ob-done {\n  background: var(--ob-success);\n}\n\n.ob-tool-status.ob-error {\n  background: var(--ob-danger);\n}\n\n.ob-tool-name {\n  font-family: var(--ob-mono);\n  font-size: 10.5px;\n  color: #9cdcfe;\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ob-tool-label {\n  font-size: 10px;\n  color: var(--ob-faint);\n  white-space: nowrap;\n}\n\n.ob-tool-body {\n  border-top: 1px solid var(--ob-border);\n  padding: 8px 9px;\n  font-family: var(--ob-mono);\n  font-size: 10.5px;\n  line-height: 1.5;\n  color: var(--ob-muted);\n  max-height: 220px;\n  overflow: auto;\n  white-space: pre-wrap;\n  word-break: break-word;\n  background: var(--ob-bg);\n}\n\n.ob-tool-body[hidden] {\n  display: none;\n}\n\n.ob-tool-section {\n  margin-bottom: 6px;\n}\n\n.ob-tool-section:last-child {\n  margin-bottom: 0;\n}\n\n.ob-tool-section b {\n  color: var(--ob-text);\n  font-weight: 500;\n}\n\n.ob-tool-section.ob-error-text {\n  color: var(--ob-danger);\n}\n\n.ob-tool-preview {\n  padding: 0 9px 9px;\n}\n\n.ob-tool-preview[hidden] {\n  display: none;\n}\n\n.ob-tool-image-wrap {\n  margin-top: 0;\n  border: 1px solid var(--ob-border);\n  border-radius: 6px;\n  overflow: hidden;\n  background: #000000;\n}\n\n.ob-tool-image {\n  display: block;\n  width: 100%;\n  height: auto;\n}\n\n.ob-plan {\n  margin: 0 12px 6px;\n  padding: 8px 10px;\n  border: 1px solid var(--ob-border);\n  border-radius: 6px;\n  background: var(--ob-bg-soft);\n  flex: 0 0 auto;\n}\n\n.ob-plan[hidden] {\n  display: none;\n}\n\n.ob-plan-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  font-size: 10px;\n  color: var(--ob-muted);\n  margin-bottom: 5px;\n}\n\n.ob-plan-head b {\n  color: var(--ob-text);\n  font-size: 11px;\n  font-weight: 500;\n}\n\n.ob-plan-step {\n  display: flex;\n  align-items: flex-start;\n  gap: 7px;\n  font-size: 11px;\n  padding: 2px 0;\n  color: var(--ob-muted);\n}\n\n.ob-plan-step .ob-plan-icon {\n  width: 12px;\n  height: 12px;\n  border-radius: 50%;\n  border: 1px solid var(--ob-border-strong);\n  background: var(--ob-bg);\n  flex: 0 0 auto;\n  margin-top: 2px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 8px;\n}\n\n.ob-plan-step .ob-plan-icon svg {\n  width: 8px;\n  height: 8px;\n}\n\n.ob-plan-step.ob-in_progress {\n  color: var(--ob-text);\n}\n\n.ob-plan-step.ob-in_progress .ob-plan-icon {\n  border-color: var(--ob-accent);\n  background: var(--ob-accent-soft);\n  animation: ob-pulse 1.2s infinite;\n}\n\n.ob-plan-step.ob-done {\n  color: var(--ob-faint);\n  text-decoration: line-through;\n}\n\n.ob-plan-step.ob-done .ob-plan-icon {\n  border-color: var(--ob-success);\n  background: rgba(78, 201, 176, 0.15);\n  color: var(--ob-success);\n}\n\n.ob-composer {\n  flex: 0 0 auto;\n  border-top: 1px solid var(--ob-border);\n  padding: 9px 10px 8px;\n  background: var(--ob-bg-soft);\n}\n\n.ob-input-wrap {\n  display: flex;\n  align-items: flex-end;\n  gap: 7px;\n  border: 1px solid var(--ob-border);\n  border-radius: 7px;\n  background: var(--ob-bg);\n  padding: 6px 7px 6px 10px;\n  transition: border-color 120ms ease, box-shadow 120ms ease;\n}\n\n.ob-input-wrap:focus-within {\n  border-color: var(--ob-accent-2);\n  box-shadow: 0 0 0 1px var(--ob-accent-2);\n}\n\n.ob-input {\n  flex: 1;\n  min-height: 36px;\n  max-height: 150px;\n  resize: none;\n  border: 0;\n  outline: 0;\n  background: transparent;\n  color: var(--ob-text);\n  font-family: var(--ob-font);\n  font-size: 13px;\n  line-height: 1.5;\n  padding: 3px 0;\n}\n\n.ob-input::placeholder {\n  color: var(--ob-faint);\n}\n\n.ob-send,\n.ob-stop {\n  border: 0;\n  border-radius: 5px;\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex: 0 0 auto;\n  transition: background 120ms ease, opacity 120ms ease;\n}\n\n.ob-send svg,\n.ob-stop svg {\n  width: 15px;\n  height: 15px;\n}\n\n.ob-send {\n  background: #0e639c;\n  color: #ffffff;\n}\n\n.ob-send:hover {\n  background: #1177bb;\n}\n\n.ob-send:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n.ob-stop {\n  background: #5a1d1d;\n  color: var(--ob-danger);\n  border: 1px solid #7a2a2a;\n}\n\n.ob-stop:hover {\n  background: #6e2424;\n}\n\n.ob-stop[hidden],\n.ob-send[hidden] {\n  display: none;\n}\n\n.ob-composer-foot {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-top: 6px;\n  font-size: 10px;\n  color: var(--ob-faint);\n}\n\n.ob-composer-badges {\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.ob-mode-badge,\n.ob-model-badge {\n  border: 1px solid var(--ob-border);\n  border-radius: 4px;\n  background: var(--ob-bg-muted);\n  color: var(--ob-muted);\n  font-family: var(--ob-font);\n  font-size: 10px;\n  line-height: 1.5;\n  padding: 1px 6px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 190px;\n}\n\n.ob-model-badge {\n  color: #9cdcfe;\n  cursor: pointer;\n}\n\n.ob-model-badge:hover {\n  border-color: var(--ob-border-strong);\n  color: #c8e6ff;\n}\n\n.ob-status {\n  font-size: 10px;\n  color: var(--ob-faint);\n  min-height: 14px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 42%;\n}\n\n.ob-status.ob-working {\n  color: var(--ob-accent);\n}\n\n.ob-settings {\n  position: absolute;\n  inset: 0;\n  z-index: 5;\n  display: flex;\n  flex-direction: column;\n  background: var(--ob-bg);\n  animation: ob-panel-in 140ms ease;\n}\n\n.ob-settings[hidden] {\n  display: none;\n}\n\n.ob-settings-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 10px 12px;\n  border-bottom: 1px solid var(--ob-border);\n  background: var(--ob-bg-soft);\n  flex: 0 0 auto;\n}\n\n.ob-settings-head h3 {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--ob-text);\n}\n\n.ob-settings-body {\n  flex: 1;\n  overflow-y: auto;\n  padding: 12px;\n  background: var(--ob-bg);\n}\n\n.ob-field {\n  margin-bottom: 12px;\n}\n\n.ob-field label {\n  display: block;\n  font-size: 11px;\n  font-weight: 500;\n  color: var(--ob-muted);\n  margin-bottom: 4px;\n}\n\n.ob-field input,\n.ob-field select,\n.ob-field textarea {\n  width: 100%;\n  border: 1px solid var(--ob-border);\n  border-radius: 5px;\n  background: var(--ob-bg-soft);\n  color: var(--ob-text);\n  font-family: var(--ob-font);\n  font-size: 12px;\n  padding: 7px 8px;\n  outline: 0;\n  transition: border-color 120ms ease, box-shadow 120ms ease;\n}\n\n.ob-field input:focus,\n.ob-field select:focus,\n.ob-field textarea:focus {\n  border-color: var(--ob-accent-2);\n  box-shadow: 0 0 0 1px var(--ob-accent-2);\n}\n\n.ob-field textarea {\n  min-height: 70px;\n  resize: vertical;\n  line-height: 1.5;\n}\n\n.ob-field .ob-hint {\n  font-size: 10px;\n  color: var(--ob-faint);\n  margin-top: 4px;\n  line-height: 1.5;\n}\n\n.ob-field .ob-hint code {\n  font-family: var(--ob-mono);\n  font-size: 9.5px;\n  background: var(--ob-bg-muted);\n  border-radius: 3px;\n  padding: 0 3px;\n}\n\n.ob-field-row {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 10px;\n}\n\n.ob-check {\n  display: flex;\n  align-items: flex-start;\n  gap: 7px;\n  font-size: 12px;\n  color: var(--ob-text);\n  padding: 6px 0;\n  cursor: pointer;\n}\n\n.ob-check input {\n  width: 14px;\n  height: 14px;\n  accent-color: var(--ob-accent-2);\n  margin: 1px 0 0;\n  flex: 0 0 auto;\n}\n\n.ob-check span small {\n  display: block;\n  color: var(--ob-faint);\n  font-size: 10px;\n  line-height: 1.45;\n  margin-top: 1px;\n}\n\n.ob-settings-foot {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  padding: 9px 12px;\n  border-top: 1px solid var(--ob-border);\n  background: var(--ob-bg-soft);\n  flex: 0 0 auto;\n}\n\n.ob-btn {\n  border: 1px solid var(--ob-border);\n  background: var(--ob-bg-muted);\n  color: var(--ob-text);\n  border-radius: 5px;\n  padding: 6px 11px;\n  font-family: var(--ob-font);\n  font-size: 12px;\n  cursor: pointer;\n  transition: background 120ms ease, border-color 120ms ease;\n}\n\n.ob-btn:hover {\n  background: #3a3a3d;\n  border-color: var(--ob-border-strong);\n}\n\n.ob-btn.ob-primary {\n  background: #0e639c;\n  border-color: #1177bb;\n  color: #ffffff;\n  font-weight: 500;\n}\n\n.ob-btn.ob-primary:hover {\n  background: #1177bb;\n}\n\n.ob-btn.ob-danger {\n  color: var(--ob-danger);\n  border-color: #7a2a2a;\n  background: #3a1d1d;\n}\n\n.ob-btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.ob-settings-status {\n  font-size: 10.5px;\n  color: var(--ob-muted);\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.ob-confirm {\n  position: absolute;\n  inset: 0;\n  z-index: 8;\n  background: rgba(0, 0, 0, 0.55);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 18px;\n}\n\n.ob-confirm[hidden] {\n  display: none;\n}\n\n.ob-confirm-box {\n  width: 100%;\n  max-width: 320px;\n  background: var(--ob-bg-soft);\n  border: 1px solid var(--ob-border-strong);\n  border-radius: 8px;\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);\n  padding: 14px;\n}\n\n.ob-confirm-box h4 {\n  margin: 0 0 6px;\n  font-size: 13px;\n  color: var(--ob-text);\n}\n\n.ob-confirm-box p {\n  margin: 0 0 13px;\n  font-size: 12px;\n  color: var(--ob-muted);\n  line-height: 1.6;\n}\n\n.ob-confirm-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 7px;\n}\n\n.ob-toast {\n  position: fixed;\n  z-index: 2147483001;\n  right: 14px;\n  bottom: 18px;\n  max-width: 360px;\n  padding: 8px 11px;\n  border-radius: 6px;\n  background: var(--ob-bg-soft);\n  border: 1px solid var(--ob-border-strong);\n  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);\n  font-family: var(--ob-font);\n  font-size: 12px;\n  color: var(--ob-text);\n  animation: ob-toast-in 140ms ease;\n}\n\n.ob-toast[hidden] {\n  display: none;\n}\n\n.ob-toast.ob-toast-error {\n  border-color: #7a2a2a;\n  background: #3a1d1d;\n  color: var(--ob-danger);\n}\n\n.ob-toast.ob-toast-success {\n  border-color: #2a5a45;\n  background: #1d3a2f;\n  color: var(--ob-success);\n}\n\n@keyframes ob-panel-in {\n  from {\n    opacity: 0;\n    transform: translateX(10px);\n  }\n  to {\n    opacity: 1;\n    transform: translateX(0);\n  }\n}\n\n@keyframes ob-msg-in {\n  from {\n    opacity: 0;\n    transform: translateY(3px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n@keyframes ob-caret {\n  50% {\n    opacity: 0;\n  }\n}\n\n@keyframes ob-pulse {\n  0%,\n  100% {\n    opacity: 1;\n  }\n  50% {\n    opacity: 0.35;\n  }\n}\n\n@keyframes ob-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(5px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n@media (hover: none) {\n  .ob-user-actions {\n    opacity: 1;\n  }\n}\n\n@media (max-width: 560px) {\n  .ob-panel {\n    left: 0;\n    right: 0;\n    width: auto;\n    border-left: 0;\n  }\n\n  .ob-subtitle {\n    max-width: 160px;\n  }\n\n  .ob-settings-foot {\n    flex-wrap: wrap;\n  }\n\n  .ob-settings-status {\n    flex-basis: 100%;\n    order: 2;\n  }\n}\n';

  // src/ui/markdown.js
  function renderInline(raw) {
    let text = escapeHtml(raw);
    text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    text = text.replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return text;
  }
  function renderMarkdown(input) {
    const source = String(input ?? "");
    const codeBlocks = [];
    const withTokens = source.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const token = `\0OBCODE${codeBlocks.length}\0`;
      const language = String(lang || "").trim();
      codeBlocks.push(
        `<pre class="ob-code"${language ? ` data-lang="${escapeHtml(language)}"` : ""}><code>${escapeHtml(
          code.replace(/\n$/, "")
        )}</code></pre>`
      );
      return `
${token}
`;
    });
    const lines = withTokens.split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let listType = null;
    let listItems = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${paragraph.map((line) => renderInline(line)).join("<br>")}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listType) return;
      const tag = listType === "ol" ? "ol" : "ul";
      html.push(`<${tag}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`);
      listType = null;
      listItems = [];
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }
      const tokenMatch = /^\u0000OBCODE(\d+)\u0000$/.exec(trimmed);
      if (tokenMatch) {
        flushParagraph();
        flushList();
        html.push(codeBlocks[Number(tokenMatch[1])] || "");
        continue;
      }
      const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        continue;
      }
      const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
      if (unordered) {
        flushParagraph();
        if (listType !== "ul") {
          flushList();
          listType = "ul";
        }
        listItems.push(unordered[1]);
        continue;
      }
      const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (ordered) {
        flushParagraph();
        if (listType !== "ol") {
          flushList();
          listType = "ol";
        }
        listItems.push(ordered[1]);
        continue;
      }
      flushList();
      paragraph.push(line);
    }
    flushParagraph();
    flushList();
    return html.join("\n").replace(/\u0000OBCODE(\d+)\u0000/g, (_, index) => codeBlocks[Number(index)] || "");
  }

  // src/ui/icons.js
  var SPARK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M11 3.5l1.7 5.1 5.1 1.7-5.1 1.7L11 17.1l-1.7-5.1L4.2 10.3l5.1-1.7L11 3.5Z"/>
  <path d="M18.6 14.2l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z"/>
  <path d="M5.2 2.8l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L3.2 4.8l1.5-.5.5-1.5Z"/>
</svg>`;
  var GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="4" y1="21" x2="4" y2="14"/>
  <line x1="4" y1="10" x2="4" y2="3"/>
  <line x1="12" y1="21" x2="12" y2="12"/>
  <line x1="12" y1="8" x2="12" y2="3"/>
  <line x1="20" y1="21" x2="20" y2="16"/>
  <line x1="20" y1="12" x2="20" y2="3"/>
  <line x1="1" y1="14" x2="7" y2="14"/>
  <line x1="9" y1="8" x2="15" y2="8"/>
  <line x1="17" y1="16" x2="23" y2="16"/>
</svg>`;
  var TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  <path d="M10 11v6M14 11v6"/>
  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
</svg>`;
  var CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <line x1="18" y1="6" x2="6" y2="18"/>
  <line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;
  var SEND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="22" y1="2" x2="11" y2="13"/>
  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
</svg>`;
  var STOP_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <rect x="7" y="7" width="10" height="10" rx="2"/>
</svg>`;
  var UNDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="1 4 1 10 7 10"/>
  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
</svg>`;
  var REDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="23 4 23 10 17 10"/>
  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
</svg>`;
  var CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;
  var EDIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 20h9"/>
  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
</svg>`;
  var CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="6 9 12 15 18 9"/>
</svg>`;

  // src/ui/panel.js
  var TOOL_LABELS = {
    get_project: "\u8BFB\u53D6\u9879\u76EE",
    get_block_catalog: "\u67E5\u8BE2\u79EF\u6728",
    create_sprite: "\u521B\u5EFA\u89D2\u8272",
    delete_sprite: "\u5220\u9664\u89D2\u8272",
    rename_sprite: "\u91CD\u547D\u540D\u89D2\u8272",
    set_sprite: "\u8C03\u6574\u89D2\u8272",
    create_variable: "\u521B\u5EFA\u53D8\u91CF",
    set_variable: "\u8BBE\u7F6E\u53D8\u91CF",
    add_script: "\u62FC\u88C5\u79EF\u6728",
    delete_script: "\u5220\u9664\u811A\u672C",
    clear_scripts: "\u6E05\u7A7A\u811A\u672C",
    add_costume: "\u6DFB\u52A0\u9020\u578B",
    set_backdrop: "\u5207\u6362\u80CC\u666F",
    set_stage: "\u8BBE\u7F6E\u821E\u53F0",
    run_project: "\u8FD0\u884C\u9879\u76EE",
    stop_project: "\u505C\u6B62\u9879\u76EE",
    export_project: "\u5BFC\u51FA\u9879\u76EE",
    undo_last_change: "\u64A4\u9500\u4FEE\u6539",
    update_plan: "\u66F4\u65B0\u8BA1\u5212",
    get_runtime_state: "\u8BFB\u53D6\u8FD0\u884C\u72B6\u6001",
    wait: "\u7B49\u5F85",
    wait_until: "\u7B49\u5F85\u6761\u4EF6",
    verify_project: "\u8FD0\u884C\u9A8C\u8BC1",
    capture_stage: "\u821E\u53F0\u622A\u56FE",
    search_project: "\u641C\u7D22\u9879\u76EE",
    find_references: "\u67E5\u627E\u5F15\u7528",
    redo_last_change: "\u91CD\u505A\u4FEE\u6539"
  };
  function formatTokenCount(value) {
    const number = Number(value) || 0;
    if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
    if (number >= 1e3) return `${(number / 1e3).toFixed(1)}k`;
    return String(number);
  }
  var SUGGESTIONS = [
    "\u505A\u4E00\u4E2A\u6253\u7816\u5757\u6E38\u620F",
    "\u7ED9\u89D2\u8272\u52A0\u4E00\u4E2A\u8DDF\u968F\u9F20\u6807\u7684\u811A\u672C",
    "\u505A\u4E00\u4E2A\u6536\u96C6\u91D1\u5E01\u7684\u5C0F\u5173\u5361",
    "\u89E3\u91CA\u5F53\u524D\u9879\u76EE\u7684\u811A\u672C\u7ED3\u6784"
  ];
  function providerLabel(settings) {
    return PROVIDER_PRESETS[settings.provider]?.label || settings.provider;
  }
  function toolLabel(name) {
    return TOOL_LABELS[name] || name;
  }
  function formatValue(value, max = 4e3) {
    if (value === void 0) return "";
    if (typeof value === "string") return truncate(value, max);
    return prettyJSON(value, max);
  }
  function iconSvg(svg2) {
    return svg2;
  }
  var Panel = class {
    constructor({ agent, settings, onSettingsChange, getContextLabel }) {
      this.agent = agent;
      this.settings = settings;
      this.onSettingsChange = onSettingsChange || (() => {
      });
      this.getContextLabel = getContextLabel || (() => "Stage");
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
      const host = document.createElement("div");
      host.dataset.openblocksAi = "true";
      host.style.all = "initial";
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${styles_default}</style>${this.template()}`;
      this.host = host;
      this.shadow = shadow;
      this.mounted = true;
      this.edgeTab = shadow.querySelector("#ob-edge-tab");
      this.panel = shadow.querySelector("#ob-panel");
      this.messages = shadow.querySelector("#ob-messages");
      this.planEl = shadow.querySelector("#ob-plan");
      this.input = shadow.querySelector("#ob-input");
      this.sendBtn = shadow.querySelector("#ob-send");
      this.stopBtn = shadow.querySelector("#ob-stop");
      this.statusEl = shadow.querySelector("#ob-status");
      this.subtitle = shadow.querySelector("#ob-subtitle");
      this.liveDot = shadow.querySelector("#ob-live-dot");
      this.statsEl = shadow.querySelector("#ob-stats");
      this.modelBadge = shadow.querySelector("#ob-model-badge");
      this.contextModel = shadow.querySelector("#ob-context-model");
      this.contextTarget = shadow.querySelector("#ob-context-target");
      this.settingsOverlay = shadow.querySelector("#ob-settings");
      this.settingsStatus = shadow.querySelector("#ob-settings-status");
      this.confirmOverlay = shadow.querySelector("#ob-confirm");
      this.confirmTitle = shadow.querySelector("#ob-confirm-title");
      this.confirmMessage = shadow.querySelector("#ob-confirm-message");
      this.toastEl = shadow.querySelector("#ob-toast");
      this.bind();
      this.agent.onEvent = (event) => this.handleEvent(event);
      this.agent.confirm = (options) => this.confirm(options);
      this.renderDisplay();
      this.renderPlan(this.agent.getPlan());
      this.updateSubtitle();
      this.refreshContext();
      this.setBusy(this.agent.running);
      this.updateSendState();
      this.applyLayout();
    }
    template() {
      const providerOptions = Object.entries(PROVIDER_PRESETS).map(([key, preset]) => `<option value="${escapeHtml(key)}">${escapeHtml(preset.label)}</option>`).join("");
      return `
      <button class="ob-edge-tab" id="ob-edge-tab" title="\u6253\u5F00 OpenBlocks\uFF08Ctrl+Shift+A\uFF09" aria-label="\u6253\u5F00 OpenBlocks" hidden>
        <span class="ob-edge-tab-icon">${iconSvg(SPARK_ICON)}</span>
        <span class="ob-edge-tab-text">OB</span>
      </button>
      <section class="ob-panel" id="ob-panel" aria-label="OpenBlocks \u52A9\u624B">
        <header class="ob-header" id="ob-header" title="\u62D6\u52A8\u6807\u9898\u680F\u79FB\u52A8\u7A97\u53E3\uFF0C\u53CC\u51FB\u6062\u590D\u53F3\u4FA7\u505C\u9760">
          <div class="ob-brand">
            <div class="ob-logo">${iconSvg(SPARK_ICON)}</div>
            <div>
              <div class="ob-title-row"><div class="ob-title">OpenBlocks</div><span class="ob-live-dot" id="ob-live-dot"></span></div>
              <div class="ob-subtitle" id="ob-subtitle">TurboWarp Agent</div>
            </div>
          </div>
          <div class="ob-header-actions">
            <button class="ob-icon-btn" id="ob-undo" title="\u64A4\u9500 AI \u4FEE\u6539" aria-label="\u64A4\u9500 AI \u4FEE\u6539">${iconSvg(UNDO_ICON)}</button>
            <button class="ob-icon-btn" id="ob-redo" title="\u91CD\u505A AI \u4FEE\u6539" aria-label="\u91CD\u505A AI \u4FEE\u6539">${iconSvg(REDO_ICON)}</button>
            <button class="ob-icon-btn" id="ob-settings-open" title="\u8BBE\u7F6E" aria-label="\u8BBE\u7F6E">${iconSvg(GEAR_ICON)}</button>
            <button class="ob-icon-btn" id="ob-clear" title="\u6E05\u7A7A\u5BF9\u8BDD" aria-label="\u6E05\u7A7A\u5BF9\u8BDD">${iconSvg(TRASH_ICON)}</button>
            <button class="ob-icon-btn" id="ob-close" title="\u5173\u95ED" aria-label="\u5173\u95ED">${iconSvg(CLOSE_ICON)}</button>
          </div>
        </header>
        <div class="ob-context">
          <span class="ob-chip"><span class="ob-dot"></span><b>\u6A21\u578B</b><span id="ob-context-model"></span></span>
          <span class="ob-chip"><b>\u5F53\u524D</b><span id="ob-context-target"></span></span>
          <span class="ob-context-stats" id="ob-stats"></span>
        </div>
        <div class="ob-messages" id="ob-messages" role="log" aria-live="polite"></div>
        <div class="ob-plan" id="ob-plan" hidden></div>
        <div class="ob-composer">
          <div class="ob-input-wrap">
            <textarea class="ob-input" id="ob-input" rows="1" placeholder="\u63CF\u8FF0\u4F60\u60F3\u505A\u7684\u9879\u76EE\uFF0C\u6216\u8BA9\u6211\u4FEE\u6539\u5F53\u524D\u4F5C\u54C1\u2026"></textarea>
            <button class="ob-send" id="ob-send" title="\u53D1\u9001" aria-label="\u53D1\u9001">${iconSvg(SEND_ICON)}</button>
            <button class="ob-stop" id="ob-stop" title="\u505C\u6B62" aria-label="\u505C\u6B62" hidden>${iconSvg(STOP_ICON)}</button>
          </div>
          <div class="ob-composer-foot">
            <div class="ob-composer-badges">
              <span class="ob-mode-badge">Agent</span>
              <button class="ob-model-badge" id="ob-model-badge" type="button" title="\u6253\u5F00 AI \u8BBE\u7F6E"></button>
            </div>
            <span class="ob-status" id="ob-status">\u5C31\u7EEA</span>
          </div>
        </div>

        <div class="ob-settings" id="ob-settings" hidden>
          <div class="ob-settings-head">
            <h3>OpenBlocks \u8BBE\u7F6E</h3>
            <button class="ob-icon-btn" id="ob-settings-close" aria-label="\u5173\u95ED\u8BBE\u7F6E">${iconSvg(CLOSE_ICON)}</button>
          </div>
          <div class="ob-settings-body">
            <div class="ob-field">
              <label for="ob-provider">\u670D\u52A1\u5546</label>
              <select id="ob-provider">${providerOptions}</select>
              <div class="ob-hint">\u9009\u62E9\u9884\u8BBE\u540E\u4F1A\u81EA\u52A8\u586B\u5165 Base URL \u548C\u6A21\u578B\uFF0C\u53EF\u518D\u624B\u52A8\u4FEE\u6539\u3002</div>
            </div>
            <div class="ob-field">
              <label for="ob-base-url">API Base URL</label>
              <input id="ob-base-url" type="url" spellcheck="false" placeholder="https://api.openai.com/v1">
              <div class="ob-hint">OpenAI \u517C\u5BB9\u63A5\u53E3\u3002\u901A\u5E38\u9700\u8981\u5305\u542B <code>/v1</code>\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u586B\u5199\u5B8C\u6574\u7684 <code>/chat/completions</code> \u5730\u5740\u3002</div>
            </div>
            <div class="ob-field">
              <label for="ob-api-key">API Key</label>
              <input id="ob-api-key" type="password" spellcheck="false" autocomplete="off" placeholder="sk-...">
              <div class="ob-hint">Key \u53EA\u4FDD\u5B58\u5728\u672C\u673A\u6D4F\u89C8\u5668 localStorage\u3002\u516C\u5171\u7535\u8111\u4E0A\u8BF7\u53D6\u6D88\u52FE\u9009\u201C\u8BB0\u4F4F Key\u201D\u3002</div>
            </div>
            <div class="ob-field">
              <label for="ob-model">\u6A21\u578B</label>
              <input id="ob-model" type="text" spellcheck="false" placeholder="gpt-4o-mini">
            </div>
            <div class="ob-field-row">
              <div class="ob-field">
                <label for="ob-temperature">Temperature</label>
                <input id="ob-temperature" type="number" min="0" max="2" step="0.1">
              </div>
              <div class="ob-field">
                <label for="ob-max-steps">\u6700\u5927\u5DE5\u5177\u6B65\u9AA4</label>
                <input id="ob-max-steps" type="number" min="1" max="30" step="1">
              </div>
            </div>
            <div class="ob-field">
              <label for="ob-max-retries">\u5931\u8D25\u81EA\u52A8\u91CD\u8BD5\u6B21\u6570</label>
              <input id="ob-max-retries" type="number" min="0" max="8" step="1">
              <div class="ob-hint">\u9047\u5230 429 / 500 / 502 / 503 / 504 \u6216\u7F51\u7EDC\u9519\u8BEF\u65F6\u81EA\u52A8\u91CD\u8BD5\uFF0C\u4F7F\u7528\u6307\u6570\u9000\u907F\u3002</div>
            </div>
            <label class="ob-check"><input type="checkbox" id="ob-stream"><span>\u6D41\u5F0F\u8F93\u51FA<small>\u9010\u5B57\u663E\u793A\u56DE\u590D\uFF1B\u5982\u679C\u63A5\u53E3\u4E0D\u652F\u6301\u53EF\u4EE5\u5173\u95ED\u3002</small></span></label>
            <label class="ob-check"><input type="checkbox" id="ob-auto-context"><span>\u81EA\u52A8\u9644\u5E26\u9879\u76EE\u4E0A\u4E0B\u6587<small>\u6BCF\u6B21\u8BF7\u6C42\u524D\u6CE8\u5165\u5F53\u524D\u89D2\u8272\u3001\u53D8\u91CF\u548C\u811A\u672C\u6570\u91CF\u6458\u8981\u3002</small></span></label>
            <label class="ob-check"><input type="checkbox" id="ob-confirm-destructive"><span>\u7834\u574F\u6027\u64CD\u4F5C\u524D\u8BE2\u95EE<small>\u5220\u9664\u89D2\u8272\u3001\u5220\u9664/\u6E05\u7A7A\u811A\u672C\u65F6\u5F39\u51FA\u786E\u8BA4\u6846\u3002</small></span></label>
            <label class="ob-check"><input type="checkbox" id="ob-remember-key"><span>\u8BB0\u4F4F API Key<small>\u53D6\u6D88\u540E\u5237\u65B0\u9875\u9762\u9700\u8981\u91CD\u65B0\u8F93\u5165\u3002</small></span></label>
            <div class="ob-field">
              <label for="ob-extra-prompt">\u9644\u52A0\u7CFB\u7EDF\u63D0\u793A\u8BCD</label>
              <textarea id="ob-extra-prompt" placeholder="\u4F8B\u5982\uFF1A\u6240\u6709\u53D8\u91CF\u540D\u4F7F\u7528\u82F1\u6587\uFF1B\u4F18\u5148\u4F7F\u7528\u514B\u9686\u4F53\uFF1B\u4EE3\u7801\u6CE8\u91CA\u7528\u4E2D\u6587\u2026\u2026"></textarea>
            </div>
          </div>
          <div class="ob-settings-foot">
            <span class="ob-settings-status" id="ob-settings-status"></span>
            <button class="ob-btn" id="ob-test">\u6D4B\u8BD5\u8FDE\u63A5</button>
            <button class="ob-btn" id="ob-settings-cancel">\u53D6\u6D88</button>
            <button class="ob-btn ob-primary" id="ob-settings-save">\u4FDD\u5B58</button>
          </div>
        </div>

        <div class="ob-confirm" id="ob-confirm" hidden>
          <div class="ob-confirm-box">
            <h4 id="ob-confirm-title">\u786E\u8BA4\u64CD\u4F5C</h4>
            <p id="ob-confirm-message"></p>
            <div class="ob-confirm-actions">
              <button class="ob-btn" id="ob-confirm-cancel">\u53D6\u6D88</button>
              <button class="ob-btn ob-primary" id="ob-confirm-ok">\u786E\u8BA4</button>
            </div>
          </div>
        </div>
      </section>
      <div class="ob-toast" id="ob-toast" hidden></div>
    `;
    }
    bind() {
      const $ = (selector) => this.shadow.querySelector(selector);
      this.edgeTab.addEventListener("click", () => this.open());
      $("#ob-close").addEventListener("click", () => this.close());
      $("#ob-model-badge").addEventListener("click", () => this.openSettings());
      $("#ob-settings-open").addEventListener("click", () => this.openSettings());
      $("#ob-clear").addEventListener("click", () => this.clearChat());
      $("#ob-undo").addEventListener("click", () => this.undo());
      $("#ob-redo").addEventListener("click", () => this.redo());
      this.sendBtn.addEventListener("click", () => this.send());
      this.stopBtn.addEventListener("click", () => this.agent.stop());
      this.input.addEventListener("input", () => {
        this.resizeInput();
        this.updateSendState();
      });
      this.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          this.send();
        }
      });
      $("#ob-header").addEventListener("pointerdown", (event) => this.startDrag(event));
      $("#ob-header").addEventListener("dblclick", (event) => this.resetLayout(event));
      window.addEventListener("resize", () => this.applyLayout());
      $("#ob-settings-close").addEventListener("click", () => this.closeSettings());
      $("#ob-settings-cancel").addEventListener("click", () => this.closeSettings());
      $("#ob-settings-save").addEventListener("click", () => this.saveSettings());
      $("#ob-test").addEventListener("click", () => this.runConnectionTest());
      $("#ob-provider").addEventListener("change", (event) => this.applyProviderPreset(event.target.value));
      $("#ob-confirm-cancel").addEventListener("click", () => this.finishConfirm(false));
      $("#ob-confirm-ok").addEventListener("click", () => this.finishConfirm(true));
      document.addEventListener("keydown", (event) => {
        if (event.ctrlKey && event.shiftKey && (event.key === "A" || event.key === "a")) {
          event.preventDefault();
          this.toggle();
          return;
        }
        if (event.key === "Escape") {
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
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
    }
    startDrag(event) {
      if (!this.panel || window.innerWidth <= 560) return;
      if (event.target.closest("button") || event.button !== 0) return;
      const rect = this.panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const height = Math.min(rect.height, Math.max(360, window.innerHeight - 140));
      const top = Math.min(rect.top, Math.max(0, window.innerHeight - height - 8));
      let started = false;
      event.preventDefault();
      const onMove = (moveEvent) => {
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
          this.panel.style.right = "auto";
          this.panel.style.bottom = "auto";
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
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
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
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    }
    resetLayout(event) {
      if (!this.panel) return;
      if (event && event.target.closest("button")) return;
      clearLayout();
      for (const prop of ["left", "top", "right", "bottom", "width", "height"]) {
        this.panel.style[prop] = "";
      }
      this.drag = null;
      this.toast("\u5DF2\u6062\u590D\u53F3\u4FA7\u505C\u9760\u5E03\u5C40\u3002", "success");
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
      this.input.value = "";
      this.resizeInput();
      this.updateSendState();
      this.agent.send(text).catch((error) => {
        this.toast(error && error.message ? error.message : String(error), "error");
      });
    }
    resizeInput() {
      if (!this.input) return;
      this.input.style.height = "auto";
      this.input.style.height = `${Math.min(150, Math.max(38, this.input.scrollHeight))}px`;
    }
    updateSendState() {
      if (!this.sendBtn) return;
      this.sendBtn.disabled = this.running || !this.input.value.trim();
    }
    setBusy(running) {
      this.running = Boolean(running);
      if (!this.panel) return;
      if (this.liveDot) this.liveDot.classList.toggle("ob-live", this.running);
      this.sendBtn.hidden = this.running;
      this.stopBtn.hidden = !this.running;
      this.updateSendState();
      this.setStatus(this.running ? "AI \u6B63\u5728\u5DE5\u4F5C\u2026" : "\u5C31\u7EEA", this.running);
    }
    setStatus(text, working = false) {
      if (!this.statusEl) return;
      this.statusEl.textContent = text || "";
      this.statusEl.classList.toggle("ob-working", Boolean(working));
    }
    updateSubtitle() {
      if (!this.subtitle) return;
      const provider = providerLabel(this.settings);
      if (this.settings.provider === "mock") {
        this.subtitle.textContent = "\u672C\u5730\u6F14\u793A\u6A21\u5F0F \xB7 \u65E0\u9700 API Key";
      } else {
        this.subtitle.textContent = `${provider} \xB7 ${this.settings.model || "\u672A\u8BBE\u7F6E\u6A21\u578B"}`;
      }
      if (this.contextModel) this.contextModel.textContent = this.settings.model || provider;
      if (this.modelBadge) this.modelBadge.textContent = this.settings.model || provider;
    }
    refreshContext() {
      if (!this.contextTarget) return;
      let label = "Stage";
      try {
        label = this.getContextLabel() || "Stage";
      } catch {
        label = "Stage";
      }
      this.contextTarget.textContent = label;
      if (this.contextModel) this.contextModel.textContent = this.settings.model || providerLabel(this.settings);
      if (this.modelBadge) this.modelBadge.textContent = this.settings.model || providerLabel(this.settings);
      this.refreshStats();
    }
    refreshStats() {
      if (!this.statsEl) return;
      const display = this.agent.getDisplay();
      const messages = display.filter((entry) => entry.type === "user" || entry.type === "assistant").length;
      const tools = display.filter((entry) => entry.type === "tool").length;
      const tokens = Number(this.agent.usage?.total_tokens) || 0;
      this.statsEl.textContent = `${messages} \u6761\u6D88\u606F \xB7 ${tools} \u6B21\u5DE5\u5177${tokens ? ` \xB7 ${formatTokenCount(tokens)} tokens` : ""}`;
    }
    scrollToBottom() {
      if (!this.messages) return;
      this.messages.scrollTop = this.messages.scrollHeight;
    }
    renderDisplay() {
      if (!this.messages) return;
      const display = this.agent.getDisplay();
      this.messages.innerHTML = "";
      if (!display.length) {
        this.renderEmpty();
        return;
      }
      for (const entry of display) {
        if (entry.type === "user") {
          this.messages.appendChild(this.createUserBubble(entry));
        } else if (entry.type === "assistant") {
          this.messages.appendChild(this.createAssistantBubble(entry));
        } else if (entry.type === "tool") {
          this.messages.appendChild(this.createToolCard(entry));
        } else if (entry.type === "error") {
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
        <h3>\u8BA9 AI \u5E2E\u4F60\u505A\u4F5C\u54C1</h3>
        <p>\u63CF\u8FF0\u4F60\u60F3\u8981\u7684\u89D2\u8272\u3001\u73A9\u6CD5\u6216\u6548\u679C\u3002\u6211\u4F1A\u8BFB\u53D6\u5F53\u524D\u9879\u76EE\uFF0C\u76F4\u63A5\u62FC\u88C5\u79EF\u6728\u3001\u521B\u5EFA\u53D8\u91CF\u548C\u89D2\u8272\u3002</p>
        <div class="ob-suggestions">
          ${SUGGESTIONS.map((text) => `<button class="ob-suggestion" data-prompt="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join("")}
        </div>
      </div>
    `;
      this.messages.querySelectorAll("[data-prompt]").forEach((button) => {
        button.addEventListener("click", () => {
          this.input.value = button.dataset.prompt || "";
          this.resizeInput();
          this.updateSendState();
          this.input.focus();
        });
      });
    }
    createUserBubble(entry) {
      const row = document.createElement("div");
      row.className = "ob-user-row";
      const actions = document.createElement("div");
      actions.className = "ob-user-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "ob-edit-btn";
      edit.title = "\u64A4\u56DE\u5E76\u7F16\u8F91";
      edit.setAttribute("aria-label", "\u64A4\u56DE\u5E76\u7F16\u8F91\u8FD9\u6761\u6D88\u606F");
      edit.innerHTML = iconSvg(EDIT_ICON);
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        this.retractMessage(entry);
      });
      actions.appendChild(edit);
      const bubble = document.createElement("div");
      bubble.className = "ob-msg ob-msg-user";
      bubble.textContent = entry.content || "";
      row.append(actions, bubble);
      return row;
    }
    async retractMessage(entry) {
      if (this.agent.running) {
        this.toast("\u8BF7\u5148\u505C\u6B62\u5F53\u524D AI \u4EFB\u52A1\u3002", "info");
        return;
      }
      const approved = await this.confirm({
        title: "\u64A4\u56DE\u5E76\u7F16\u8F91",
        message: "\u5C06\u5220\u9664\u8FD9\u6761\u6D88\u606F\u53CA\u5176\u540E\u7684\u6240\u6709\u5BF9\u8BDD\uFF0C\u5E76\u5C1D\u8BD5\u628A\u9879\u76EE\u6062\u590D\u5230\u53D1\u9001\u8FD9\u6761\u6D88\u606F\u4E4B\u524D\u7684\u72B6\u6001\u3002"
      });
      if (!approved) return;
      try {
        await this.agent.retractFrom(entry.id);
      } catch (error) {
        this.toast(error && error.message ? error.message : String(error), "error");
      }
    }
    createErrorBubble(text) {
      const el = document.createElement("div");
      el.className = "ob-msg ob-msg-error";
      el.textContent = text || "\u672A\u77E5\u9519\u8BEF";
      return el;
    }
    createAssistantBubble(entry) {
      const el = document.createElement("div");
      el.className = "ob-msg ob-msg-assistant";
      el.dataset.id = entry.id;
      if (entry.streaming) el.classList.add("ob-streaming");
      const reasoning = document.createElement("details");
      reasoning.className = "ob-reasoning";
      const summary = document.createElement("summary");
      summary.textContent = "\u601D\u8003\u8FC7\u7A0B";
      const reasoningText = document.createElement("pre");
      reasoning.append(summary, reasoningText);
      reasoning.hidden = !entry.reasoning;
      reasoning.open = Boolean(entry.streaming && entry.reasoning && !entry.content);
      const content = document.createElement("div");
      content.className = "ob-content";
      const avatar = document.createElement("div");
      avatar.className = "ob-msg-avatar";
      avatar.innerHTML = iconSvg(SPARK_ICON);
      const body = document.createElement("div");
      body.className = "ob-msg-body";
      body.append(reasoning, content);
      el.append(avatar, body);
      this.updateAssistantBubble(el, entry);
      return el;
    }
    updateAssistantBubble(el, entry) {
      if (!el || !entry) return;
      const reasoning = el.querySelector(".ob-reasoning");
      const reasoningText = el.querySelector(".ob-reasoning pre");
      const content = el.querySelector(".ob-content");
      if (reasoning && reasoningText) {
        reasoningText.textContent = entry.reasoning || "";
        reasoning.hidden = !entry.reasoning;
        if (!entry.streaming) reasoning.open = false;
      }
      if (content) {
        content.innerHTML = entry.content ? renderMarkdown(entry.content) : entry.streaming ? '<span style="color:var(--ob-muted)">\u2026</span>' : "";
      }
      el.classList.toggle("ob-streaming", Boolean(entry.streaming));
    }
    createToolCard(entry) {
      const card = document.createElement("div");
      card.className = "ob-tool";
      card.dataset.toolId = entry.id;
      const head = document.createElement("div");
      head.className = "ob-tool-head";
      const status = document.createElement("span");
      status.className = "ob-tool-status";
      const name = document.createElement("span");
      name.className = "ob-tool-name";
      name.textContent = `${toolLabel(entry.name)} \xB7 ${entry.name}`;
      const label = document.createElement("span");
      label.className = "ob-tool-label";
      const chevron = document.createElement("span");
      chevron.innerHTML = iconSvg(CHEVRON_ICON);
      chevron.style.width = "14px";
      chevron.style.height = "14px";
      chevron.style.display = "flex";
      head.append(status, name, label, chevron);
      const preview = document.createElement("div");
      preview.className = "ob-tool-preview";
      preview.hidden = true;
      const body = document.createElement("div");
      body.className = "ob-tool-body";
      body.hidden = true;
      head.addEventListener("click", () => {
        body.hidden = !body.hidden;
      });
      card.append(head, preview, body);
      this.updateToolCard(card, entry);
      return card;
    }
    updateToolCard(card, entry) {
      if (!card || !entry) return;
      const status = card.querySelector(".ob-tool-status");
      const label = card.querySelector(".ob-tool-label");
      const body = card.querySelector(".ob-tool-body");
      const preview = card.querySelector(".ob-tool-preview");
      if (status) {
        status.className = "ob-tool-status";
        if (entry.status === "running") status.classList.add("ob-running");
        else if (entry.status === "error") status.classList.add("ob-error");
        else status.classList.add("ob-done");
      }
      if (label) {
        label.textContent = entry.status === "running" ? "\u6267\u884C\u4E2D\u2026" : entry.status === "error" ? "\u5931\u8D25" : "\u5B8C\u6210";
      }
      if (!body) return;
      const argsText = formatValue(entry.args || {}, 3e3);
      const resultText = entry.result === void 0 ? "" : formatValue(entry.result, 4e3);
      const errorText = entry.error ? truncate(String(entry.error), 4e3) : "";
      body.innerHTML = "";
      const argsSection = document.createElement("div");
      argsSection.className = "ob-tool-section";
      argsSection.innerHTML = "<b>\u53C2\u6570</b>";
      const argsPre = document.createElement("div");
      argsPre.textContent = argsText || "\uFF08\u65E0\uFF09";
      argsSection.appendChild(argsPre);
      body.appendChild(argsSection);
      if (resultText) {
        const resultSection = document.createElement("div");
        resultSection.className = "ob-tool-section";
        resultSection.innerHTML = "<b>\u7ED3\u679C</b>";
        const resultPre = document.createElement("div");
        resultPre.textContent = resultText;
        resultSection.appendChild(resultPre);
        body.appendChild(resultSection);
      }
      if (preview) {
        preview.innerHTML = "";
        const imageUrl = entry.result && typeof entry.result === "object" ? entry.result.image_data_url || entry.result.screenshot?.image_data_url : null;
        if (typeof imageUrl === "string" && imageUrl.startsWith("data:image/")) {
          const imageWrap = document.createElement("div");
          imageWrap.className = "ob-tool-image-wrap";
          const image = document.createElement("img");
          image.className = "ob-tool-image";
          image.src = imageUrl;
          image.alt = "\u821E\u53F0\u622A\u56FE";
          imageWrap.appendChild(image);
          preview.appendChild(imageWrap);
          preview.hidden = false;
        } else {
          preview.hidden = true;
        }
      }
      if (errorText) {
        const errorSection = document.createElement("div");
        errorSection.className = "ob-tool-section ob-error-text";
        errorSection.innerHTML = "<b>\u9519\u8BEF</b>";
        const errorPre = document.createElement("div");
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
        this.planEl.innerHTML = "";
        return;
      }
      const done = list.filter((step) => step.status === "done").length;
      this.planEl.hidden = false;
      this.planEl.innerHTML = `
      <div class="ob-plan-head"><b>\u4EFB\u52A1\u8BA1\u5212</b><span>${done}/${list.length}</span></div>
      ${list.map((step) => {
        const status = ["pending", "in_progress", "done"].includes(step.status) ? step.status : "pending";
        const icon = status === "done" ? iconSvg(CHECK_ICON) : "";
        return `<div class="ob-plan-step ob-${status}">
            <span class="ob-plan-icon">${icon}</span>
            <span>${escapeHtml(step.title || "")}</span>
          </div>`;
      }).join("")}
    `;
    }
    handleEvent(event) {
      if (!this.mounted) return;
      switch (event.type) {
        case "user":
          this.removeEmpty();
          this.messages.appendChild(this.createUserBubble(event.entry));
          this.refreshStats();
          this.scrollToBottom();
          break;
        case "assistant_start":
          this.removeEmpty();
          if (event.entry && event.entry.type === "error") {
            this.messages.appendChild(this.createErrorBubble(event.entry.content));
          } else if (event.entry) {
            this.messages.appendChild(this.createAssistantBubble(event.entry));
          }
          this.refreshStats();
          this.scrollToBottom();
          break;
        case "assistant_delta": {
          const entry = this.agent.getDisplay().find((item) => item.id === event.id);
          const bubble = this.messages.querySelector(`.ob-msg-assistant[data-id="${event.id}"]`);
          if (entry && bubble) this.updateAssistantBubble(bubble, entry);
          this.scrollToBottom();
          break;
        }
        case "reasoning_delta": {
          const entry = this.agent.getDisplay().find((item) => item.id === event.id);
          const bubble = this.messages.querySelector(`.ob-msg-assistant[data-id="${event.id}"]`);
          if (entry && bubble) this.updateAssistantBubble(bubble, entry);
          this.scrollToBottom();
          break;
        }
        case "assistant_end": {
          const entry = event.entry;
          const bubble = entry && this.messages.querySelector(`.ob-msg-assistant[data-id="${entry.id}"]`);
          if (entry && bubble) this.updateAssistantBubble(bubble, entry);
          this.refreshStats();
          this.scrollToBottom();
          break;
        }
        case "tool_end": {
          const card = this.messages.querySelector(`.ob-tool[data-tool-id="${event.entry.id}"]`);
          if (card) this.updateToolCard(card, event.entry);
          this.scrollToBottom();
          this.refreshContext();
          break;
        }
        case "tool_start":
          this.removeEmpty();
          this.messages.appendChild(this.createToolCard(event.entry));
          this.refreshStats();
          this.scrollToBottom();
          break;
        case "plan":
          this.renderPlan(event.steps);
          break;
        case "status":
          this.setStatus(event.text || "", this.running);
          break;
        case "error":
          this.toast(event.message || "\u53D1\u751F\u9519\u8BEF", "error");
          this.setStatus("\u51FA\u9519", false);
          break;
        case "usage":
          this.refreshStats();
          break;
        case "running":
          this.setBusy(event.value);
          if (event.value) this.setStatus("AI \u6B63\u5728\u5DE5\u4F5C\u2026", true);
          break;
        case "done":
          this.setStatus("\u5C31\u7EEA", false);
          this.refreshContext();
          this.refreshStats();
          break;
        case "clear":
          this.renderDisplay();
          this.renderPlan([]);
          this.refreshStats();
          break;
        case "retract":
          this.renderDisplay();
          this.renderPlan(this.agent.getPlan());
          this.input.value = event.text || "";
          this.resizeInput();
          this.updateSendState();
          this.refreshContext();
          this.input.focus();
          if (event.rollbackError) {
            this.toast(event.rollbackError, "error");
          } else if (event.restored > 0) {
            this.toast("\u5DF2\u64A4\u56DE\uFF0C\u5E76\u6062\u590D\u4E86\u9879\u76EE\u72B6\u6001\u3002\u53EF\u4EE5\u7F16\u8F91\u540E\u91CD\u65B0\u53D1\u9001\u3002", "success");
          } else {
            this.toast("\u5DF2\u64A4\u56DE\uFF0C\u53EF\u4EE5\u7F16\u8F91\u540E\u91CD\u65B0\u53D1\u9001\u3002", "success");
          }
          break;
        default:
          break;
      }
    }
    removeEmpty() {
      const empty = this.messages && this.messages.querySelector(".ob-empty");
      if (empty) empty.remove();
    }
    async clearChat() {
      if (this.agent.running) {
        this.toast("\u8BF7\u5148\u505C\u6B62\u5F53\u524D AI \u4EFB\u52A1\u3002", "info");
        return;
      }
      const approved = await this.confirm({
        title: "\u6E05\u7A7A\u5BF9\u8BDD",
        message: "\u8FD9\u4F1A\u5220\u9664\u672C\u5730\u4FDD\u5B58\u7684\u5BF9\u8BDD\u8BB0\u5F55\u548C\u4EFB\u52A1\u8BA1\u5212\uFF0C\u4F46\u4E0D\u4F1A\u64A4\u9500\u5DF2\u7ECF\u5E94\u7528\u5230\u9879\u76EE\u4E2D\u7684\u79EF\u6728\u4FEE\u6539\u3002"
      });
      if (!approved) return;
      this.agent.clear();
    }
    async redo() {
      if (this.agent.running) {
        this.toast("\u8BF7\u5148\u505C\u6B62\u5F53\u524D AI \u4EFB\u52A1\u3002", "info");
        return;
      }
      if (redoCount() === 0) {
        this.toast("\u6CA1\u6709\u53EF\u91CD\u505A\u7684 AI \u4FEE\u6539\u3002", "info");
        return;
      }
      try {
        await redoLastSnapshot();
        this.toast("\u5DF2\u91CD\u505A\u6700\u8FD1\u7684 AI \u4FEE\u6539\u3002", "success");
        this.refreshContext();
      } catch (error) {
        this.toast(error && error.message ? error.message : String(error), "error");
      }
    }
    async undo() {
      if (this.agent.running) {
        this.toast("\u8BF7\u5148\u505C\u6B62\u5F53\u524D AI \u4EFB\u52A1\u3002", "info");
        return;
      }
      if (snapshotCount() === 0) {
        this.toast("\u6CA1\u6709\u53EF\u64A4\u9500\u7684 AI \u4FEE\u6539\u3002", "info");
        return;
      }
      const approved = await this.confirm({
        title: "\u64A4\u9500 AI \u4FEE\u6539",
        message: "\u5C06\u628A\u9879\u76EE\u6062\u590D\u5230\u6700\u8FD1\u4E00\u6B21 AI \u4FEE\u6539\u4E4B\u524D\u7684\u5FEB\u7167\u3002\u672A\u4FDD\u5B58\u7684\u5F53\u524D\u6539\u52A8\u4E5F\u4F1A\u88AB\u8986\u76D6\u3002"
      });
      if (!approved) return;
      try {
        await restoreLastSnapshot();
        this.toast("\u5DF2\u6062\u590D\u5230 AI \u4FEE\u6539\u524D\u7684\u72B6\u6001\u3002", "success");
        this.refreshContext();
      } catch (error) {
        this.toast(error && error.message ? error.message : String(error), "error");
      }
    }
    openSettings() {
      if (!this.settingsOverlay) return;
      this.open();
      this.fillSettingsForm(this.settings);
      this.settingsStatus.textContent = "";
      this.settingsStatus.style.color = "";
      this.settingsOverlay.hidden = false;
    }
    closeSettings() {
      if (this.settingsOverlay) this.settingsOverlay.hidden = true;
    }
    fillSettingsForm(settings) {
      const $ = (selector) => this.shadow.querySelector(selector);
      $("#ob-provider").value = settings.provider || "openai";
      $("#ob-base-url").value = settings.baseUrl || "";
      $("#ob-api-key").value = settings.apiKey || "";
      $("#ob-model").value = settings.model || "";
      $("#ob-temperature").value = settings.temperature ?? 0.3;
      $("#ob-max-steps").value = settings.maxSteps ?? 12;
      $("#ob-max-retries").value = settings.maxRetries ?? 3;
      $("#ob-stream").checked = settings.stream !== false;
      $("#ob-auto-context").checked = settings.autoContext !== false;
      $("#ob-confirm-destructive").checked = settings.confirmDestructive !== false;
      $("#ob-remember-key").checked = settings.rememberKey !== false;
      $("#ob-extra-prompt").value = settings.systemPromptExtra || "";
    }
    readSettingsForm() {
      const $ = (selector) => this.shadow.querySelector(selector);
      return {
        ...this.settings,
        provider: $("#ob-provider").value,
        baseUrl: $("#ob-base-url").value.trim(),
        apiKey: $("#ob-api-key").value.trim(),
        model: $("#ob-model").value.trim(),
        temperature: clampNumber($("#ob-temperature").value, 0, 2, 0.3),
        maxSteps: clampNumber($("#ob-max-steps").value, 1, 30, 12),
        maxRetries: clampNumber($("#ob-max-retries").value, 0, 8, 3),
        stream: $("#ob-stream").checked,
        autoContext: $("#ob-auto-context").checked,
        confirmDestructive: $("#ob-confirm-destructive").checked,
        rememberKey: $("#ob-remember-key").checked,
        systemPromptExtra: $("#ob-extra-prompt").value
      };
    }
    applyProviderPreset(provider) {
      const preset = PROVIDER_PRESETS[provider];
      if (!preset) return;
      if (provider === "custom") return;
      const $ = (selector) => this.shadow.querySelector(selector);
      $("#ob-base-url").value = preset.baseUrl || "";
      $("#ob-model").value = preset.model || "";
      if (provider === "mock") {
        this.settingsStatus.textContent = "\u6F14\u793A\u6A21\u5F0F\u4E0D\u4F1A\u8C03\u7528\u771F\u5B9E\u63A5\u53E3\u3002";
      }
    }
    async runConnectionTest() {
      const settings = this.readSettingsForm();
      if (settings.provider !== "mock" && (!settings.baseUrl || !settings.model)) {
        this.settingsStatus.textContent = "\u8BF7\u5148\u586B\u5199 Base URL \u548C\u6A21\u578B\u3002";
        return;
      }
      const button = this.shadow.querySelector("#ob-test");
      button.disabled = true;
      this.settingsStatus.textContent = "\u6B63\u5728\u6D4B\u8BD5\u8FDE\u63A5\u2026";
      try {
        const result = await testConnection(settings);
        this.settingsStatus.textContent = `\u8FDE\u63A5\u6210\u529F\uFF1A${truncate(result.message, 120)}`;
        this.settingsStatus.style.color = "var(--ob-success)";
      } catch (error) {
        this.settingsStatus.textContent = truncate(error && error.message ? error.message : String(error), 240);
        this.settingsStatus.style.color = "var(--ob-danger)";
      } finally {
        button.disabled = false;
      }
    }
    saveSettings() {
      const settings = this.readSettingsForm();
      if (settings.provider !== "mock" && (!settings.baseUrl || !settings.model)) {
        this.settingsStatus.textContent = "\u8BF7\u5148\u586B\u5199 Base URL \u548C\u6A21\u578B\u3002";
        this.settingsStatus.style.color = "var(--ob-danger)";
        return;
      }
      this.settings = settings;
      this.onSettingsChange(settings);
      this.updateSubtitle();
      this.refreshContext();
      this.closeSettings();
      this.toast("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002", "success");
    }
    confirm(options = {}) {
      this.open();
      if (this.confirmResolve) {
        this.confirmResolve(false);
        this.confirmResolve = null;
      }
      this.confirmTitle.textContent = options.title || "\u786E\u8BA4\u64CD\u4F5C";
      this.confirmMessage.textContent = options.message || "";
      this.confirmOverlay.hidden = false;
      return new Promise((resolve) => {
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
    toast(message, type = "info") {
      if (!this.toastEl) return;
      this.toastEl.textContent = message;
      this.toastEl.className = `ob-toast${type === "error" ? " ob-toast-error" : type === "success" ? " ob-toast-success" : ""}`;
      this.toastEl.hidden = false;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toastEl.hidden = true;
      }, 3800);
    }
  };

  // src/app.js
  var App = class {
    constructor(Scratch2) {
      this.Scratch = Scratch2;
      this.settings = loadSettings();
      this.booted = false;
      this.agent = new Agent({
        settings: this.settings,
        getContext: () => summarizeProject(),
        onEvent: () => {
        }
      });
      this.panel = new Panel({
        agent: this.agent,
        settings: this.settings,
        onSettingsChange: (settings) => {
          this.settings = settings;
          saveSettings(settings);
          this.agent.setSettings(settings);
        },
        getContextLabel: () => {
          const vm = Scratch2.vm;
          return vm && vm.editingTarget ? vm.editingTarget.getName() : "Stage";
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
          console.error("[OpenBlocks] \u9762\u677F\u52A0\u8F7D\u5931\u8D25", error);
        }
      };
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount, { once: true });
      try {
        this.Scratch.openBlocks = this;
        this.Scratch.openBlocksAI = this;
      } catch {
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
      return this.settings.model || "";
    }
    isBusy() {
      return this.agent.running;
    }
    async undo() {
      if (snapshotCount() === 0) return "\u6CA1\u6709\u53EF\u64A4\u9500\u7684 AI \u4FEE\u6539\u3002";
      await restoreLastSnapshot();
      return "\u5DF2\u64A4\u9500\u6700\u8FD1\u7684 AI \u4FEE\u6539\u3002";
    }
  };

  // src/icon.js
  var svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#7c5cff"/>
  <path d="M32 13l4.2 12.8L49 30l-12.8 4.2L32 47l-4.2-12.8L15 30l12.8-4.2L32 13Z" fill="#ffffff"/>
  <path d="M47 41l1.6 4.4L53 47l-4.4 1.6L47 53l-1.6-4.4L41 47l4.4-1.6L47 41Z" fill="#ffffff" opacity=".9"/>
</svg>`;
  var iconURI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  // src/main.js
  (function(Scratch2) {
    "use strict";
    if (!Scratch2.extensions.unsandboxed) {
      throw new Error(
        "OpenBlocks \u5FC5\u987B\u4EE5\u300C\u4E0D\u542F\u7528\u6C99\u7BB1\u300D\u65B9\u5F0F\u52A0\u8F7D\u3002\u8BF7\u901A\u8FC7 http://localhost:8000/ \u63D0\u4F9B\u6269\u5C55\uFF0C\u6216\u5728\u52A0\u8F7D\u6587\u4EF6\u65F6\u52FE\u9009\u201C\u5728\u4E0D\u4F7F\u7528\u6C99\u7BB1\u7684\u60C5\u51B5\u4E0B\u8FD0\u884C\u6269\u5C55\u201D\u3002"
      );
    }
    if (Scratch2.openBlocks || Scratch2.openBlocksAI) {
      try {
        (Scratch2.openBlocks || Scratch2.openBlocksAI).openPanel();
      } catch {
      }
      return;
    }
    const app = new App(Scratch2);
    class OpenBlocksExtension {
      getInfo() {
        return {
          id: "openblocksai",
          name: "OpenBlocks",
          color1: "#7c6cff",
          color2: "#6b5ce7",
          color3: "#4b3fc4",
          menuIconURI: iconURI,
          blockIconURI: iconURI,
          blocks: [
            {
              opcode: "openPanel",
              blockType: Scratch2.BlockType.COMMAND,
              text: "\u6253\u5F00 AI \u52A9\u624B\u9762\u677F"
            },
            {
              opcode: "openSettings",
              blockType: Scratch2.BlockType.COMMAND,
              text: "\u6253\u5F00 AI \u8BBE\u7F6E"
            },
            "---",
            {
              opcode: "ask",
              blockType: Scratch2.BlockType.REPORTER,
              text: "\u95EE AI [PROMPT]",
              disableMonitor: true,
              arguments: {
                PROMPT: {
                  type: Scratch2.ArgumentType.STRING,
                  defaultValue: "\u7528\u4E00\u53E5\u8BDD\u4ECB\u7ECD\u8FD9\u4E2A\u9879\u76EE"
                }
              }
            },
            {
              opcode: "build",
              blockType: Scratch2.BlockType.COMMAND,
              text: "\u8BA9 AI \u6784\u5EFA [PROMPT]",
              arguments: {
                PROMPT: {
                  type: Scratch2.ArgumentType.STRING,
                  defaultValue: "\u505A\u4E00\u4E2A\u53EF\u4EE5\u79FB\u52A8\u7684\u89D2\u8272"
                }
              }
            },
            {
              opcode: "undo",
              blockType: Scratch2.BlockType.COMMAND,
              text: "\u64A4\u9500\u6700\u8FD1\u7684 AI \u4FEE\u6539"
            },
            "---",
            {
              opcode: "model",
              blockType: Scratch2.BlockType.REPORTER,
              text: "\u5F53\u524D AI \u6A21\u578B",
              disableMonitor: true
            },
            {
              opcode: "busy",
              blockType: Scratch2.BlockType.BOOLEAN,
              text: "AI \u6B63\u5728\u5DE5\u4F5C\uFF1F"
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
          return text || "\uFF08AI \u6CA1\u6709\u8FD4\u56DE\u6587\u672C\uFF09";
        } catch (error) {
          return `AI \u9519\u8BEF\uFF1A${error && error.message ? error.message : String(error)}`;
        }
      }
      async build(args) {
        try {
          await app.ask(args.PROMPT);
        } catch (error) {
          console.error("[OpenBlocks]", error);
        }
      }
      async undo() {
        try {
          await app.undo();
        } catch (error) {
          console.error("[OpenBlocks]", error);
        }
      }
      model() {
        return app.getModel();
      }
      busy() {
        return app.isBusy();
      }
    }
    Scratch2.extensions.register(new OpenBlocksExtension());
    app.boot();
  })(Scratch);
})();
//# sourceMappingURL=ai-agent.js.map
