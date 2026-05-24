/**
 * 测试 pairing-flow.js：默认设备名识别与配对码规范化。
 *
 * Keywords: pairing-flow, device-name, tests
 *
 * Exports: 无导出 / 内含用例
 *
 * Inward: pairing-flow.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PAIRING_CODE_LENGTH, defaultDeviceName, normalizePairingCode, pairingRequestFromSearch, startPairingRequest } from './pairing-flow.js';

test('defaultDeviceName recognizes common mobile browsers', () => {
  assert.equal(defaultDeviceName({ platform: 'iPhone', userAgent: 'Mobile Safari' }), 'iPhone');
  assert.equal(defaultDeviceName({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (iPad)' }), 'iPad');
  assert.equal(defaultDeviceName({ platform: 'Linux armv8', userAgent: 'Android Chrome' }), 'Android');
  assert.equal(defaultDeviceName({ platform: 'MacIntel', userAgent: 'Desktop' }), 'Mac');
  assert.equal(defaultDeviceName({ platform: 'Win32', userAgent: 'Chrome' }), 'Windows PC');
});

test('pairingRequestFromSearch parses terminal pairing links safely', () => {
  assert.deepEqual(
    pairingRequestFromSearch('?requestId=req-1&code=110-110&codeLength=6'),
    { requestId: 'req-1', code: '110110', codeLength: 6, autoSubmit: true }
  );
  assert.equal(pairingRequestFromSearch('?requestId=req-1&code=bad*&codeLength=6'), null);
  assert.equal(pairingRequestFromSearch('?code=110110'), null);
});

test('normalizePairingCode accepts terminal formatted codes with separators', () => {
  assert.equal(DEFAULT_PAIRING_CODE_LENGTH, 6);
  assert.equal(normalizePairingCode('110-110', 6), '110110');
  assert.equal(normalizePairingCode(' 110 110 ', 6), '110110');
});

test('startPairingRequest asks the server to create a phone pairing request', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify({ requestId: 'req-phone', codeLength: 6 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  globalThis.localStorage = {
    getItem: () => '',
    removeItem: () => {}
  };

  try {
    const result = await startPairingRequest({ deviceName: 'iPhone' });

    assert.deepEqual(result, { requestId: 'req-phone', codeLength: 6 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/api/pair/request');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { deviceName: 'iPhone' });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});
