/**
 * 客户端 runtime 调试开关：读写 localStorage/sessionStorage，并在开启时向控制台打出结构化调试事件。
 *
 * Keywords: runtime-debug, localStorage, client-logging
 *
 * Exports:
 * - `RUNTIME_DEBUG_STORAGE_KEY` — 与本地开关共用的 key 常量。
 * - `setClientRuntimeDebugEnabled` / `isClientRuntimeDebug` — 开关读写。
 * - `clientRuntimeDebug` — 条件化 `console.log` 输出。
 * - `startClientScrollDebugWindow` / `isClientScrollDebugActive` — 短时滚动追踪窗口。
 *
 * Inward: 浏览器 `window` / `localStorage` / `sessionStorage`。
 *
 * Outward: `useTurnRuntime`、`Drawer` 设置项、`session-live-refresh` 等可选埋点。
 */

const STORAGE_KEY = 'codexmobile.runtimeDebug';

export const RUNTIME_DEBUG_STORAGE_KEY = STORAGE_KEY;

let scrollDebugUntil = 0;
let assetSignature = '';

export function setClientRuntimeDebugEnabled(enabled) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function isClientRuntimeDebug() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    if (window.__CODEXMOBILE_RUNTIME_DEBUG__ === true) {
      return true;
    }
    return (
      sessionStorage.getItem(STORAGE_KEY) === '1' || localStorage.getItem(STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function clientRuntimeDebug(event, data = {}) {
  if (!isClientRuntimeDebug()) {
    return;
  }
  const payload = { event, clientAssetSignature: clientRuntimeAssetSignature(), ...data };
  const record = { t: new Date().toISOString(), ...payload };
  console.log(`[runtime-debug][client] ${JSON.stringify(record)}`);
  postClientRuntimeDebug(payload);
}

export function clientRuntimeAssetSignature(doc = globalThis.document) {
  if (assetSignature) {
    return assetSignature;
  }
  try {
    const nodes = Array.from(doc?.querySelectorAll?.('script[src], link[href]') || []);
    assetSignature = nodes
      .map((node) => node.getAttribute?.('src') || node.getAttribute?.('href') || '')
      .filter((value) => /\/assets\/.+\.(?:js|css|webmanifest)(?:\?|$)/i.test(value))
      .sort()
      .join('|');
  } catch {
    assetSignature = '';
  }
  return assetSignature;
}

function postClientRuntimeDebug(payload) {
  if (typeof fetch !== 'function') {
    return;
  }
  let token = '';
  try {
    token = localStorage.getItem('codexmobile.deviceToken') || '';
  } catch {
    token = '';
  }
  fetch('/api/runtime-debug/client-event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => null);
}

export function startClientScrollDebugWindow(durationMs = 3500) {
  if (!isClientRuntimeDebug()) {
    return 0;
  }
  scrollDebugUntil = Date.now() + Math.max(0, Number(durationMs) || 0);
  return scrollDebugUntil;
}

export function isClientScrollDebugActive(now = Date.now()) {
  return isClientRuntimeDebug() && Number(scrollDebugUntil) > Number(now);
}
