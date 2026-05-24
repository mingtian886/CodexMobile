/**
 * Cookie 认证 API 封装，并保留旧 localStorage Bearer token 的一次性迁移。
 *
 * Keywords: fetch, api, cookie-auth, bearer-migration, timeout
 *
 * Exports:
 * - getToken / setToken / clearToken — 旧 localStorage token 迁移兼容。
 * - apiFetch / apiBlobFetch — 统一 headers、Cookie 凭据、超时与响应错误处理。
 * - websocketUrl — 返回 Cookie 鉴权的同源 WS 地址。
 *
 * Inward: fetch、localStorage。
 *
 * Outward: 客户端所有 REST 调用入口。
 */

const TOKEN_KEY = 'codexmobile.deviceToken';
const MIGRATED_HEADERS = ['x-codexmobile-token-migrated', 'x-codexmobile-clear-legacy-token'];

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  clearToken();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function maybeClearMigratedToken(response) {
  if (MIGRATED_HEADERS.some((header) => response.headers.get(header) === '1')) {
    clearToken();
  }
}

function legacyAuthHeaders(headers = {}) {
  const token = getToken();
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers
  };
}

export async function apiFetch(path, options = {}) {
  const { timeoutMs: rawTimeoutMs, ...fetchOptions } = options;
  const timeoutMs = Number(rawTimeoutMs || 0);
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeout = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  const headers = {
    ...(fetchOptions.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
    ...legacyAuthHeaders(fetchOptions.headers || {})
  };

  let response;
  try {
    response = await fetch(path, {
      ...fetchOptions,
      credentials: fetchOptions.credentials || 'same-origin',
      headers,
      signal: fetchOptions.signal || controller?.signal,
      body:
        fetchOptions.body && !(fetchOptions.body instanceof FormData) && typeof fetchOptions.body !== 'string'
          ? JSON.stringify(fetchOptions.body)
          : fetchOptions.body
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('请求超时，请在桌面端确认 Git 操作状态');
      timeoutError.code = 'timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout) {
      globalThis.clearTimeout(timeout);
    }
  }

  maybeClearMigratedToken(response);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
  return data;
}

export async function apiBlobFetch(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
    ...legacyAuthHeaders(options.headers || {})
  };

  const response = await fetch(path, {
    ...options,
    credentials: options.credentials || 'same-origin',
    headers,
    body:
      options.body && !(options.body instanceof FormData) && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body
  });

  maybeClearMigratedToken(response);
  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed: ${response.status}`;
    let code = null;
    try {
      const data = text ? JSON.parse(text) : {};
      message = data.error || message;
      code = data.code || null;
    } catch {
      message = text || message;
    }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
  }

  return response.blob();
}

export function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
