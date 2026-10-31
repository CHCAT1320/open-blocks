const DB_NAME = 'openblocks-ai-checkpoints';
const STORE_NAME = 'checkpoints';
const MAX_CHECKPOINTS = 10;

let dbPromise = null;

function openDB() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveCheckpoint(label, json) {
  try {
    const db = await openDB();
    if (!db) return null;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id, label: String(label || 'AI 修改'), at: Date.now(), json });
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

export async function listCheckpoints() {
  try {
    const db = await openDB();
    if (!db) return [];
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    return items
      .map(item => ({ id: item.id, label: item.label, at: item.at, size: item.json ? item.json.length : 0 }))
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function loadCheckpoint(id) {
  try {
    const db = await openDB();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(String(id));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function deleteCheckpoint(id) {
  try {
    const db = await openDB();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(String(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}
