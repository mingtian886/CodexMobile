/**
 * 测试 app/runtime-debug-client.js：客户端调试事件开关与回传。
 *
 * Keywords: runtime-debug, client, tests
 *
 * Exports: 无导出 / 内含用例
 *
 * Inward: app/runtime-debug-client.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clientRuntimeDebug,
  setClientRuntimeDebugEnabled
} from './app/runtime-debug-client.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('clientRuntimeDebug posts events only when enabled', async () => {
  const calls = [];
  globalThis.window = {};
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  globalThis.fetch = async (path, options) => {
    calls.push({ path, headers: options.headers, body: JSON.parse(options.body) });
    return { ok: true, text: async () => '{}' };
  };

  clientRuntimeDebug('chat.scroll', { scrollTop: 10 });
  assert.equal(calls.length, 0);

  localStorage.setItem('codexmobile.deviceToken', 'token-1');
  setClientRuntimeDebugEnabled(true);
  clientRuntimeDebug('chat.scroll', { scrollTop: 10 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/runtime-debug/client-event');
  assert.equal(calls[0].headers.authorization, 'Bearer token-1');
  assert.equal(calls[0].body.event, 'chat.scroll');
  assert.equal(calls[0].body.scrollTop, 10);
  assert.deepEqual(calls[0].body, {
    event: 'chat.scroll',
    clientAssetSignature: '',
    scrollTop: 10
  });

  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.fetch;
});
