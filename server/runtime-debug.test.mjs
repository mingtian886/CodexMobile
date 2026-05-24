/**
 * 测试 server/runtime-debug.js：节流、客户端事件清洗、activeRuns 压缩与事件行格式。
 *
 * Keywords: runtime-debug, test, jsonl
 *
 * Exports: 无导出，内含用例
 *
 * Inward: runtime-debug.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactActiveRuns,
  isRuntimeDebugEnabled,
  sanitizeClientRuntimeDebugPayload,
  runtimeDebugLine,
  runtimeDebugStatusActiveRuns
} from './runtime-debug.js';

test('compactActiveRuns maps stable shape', () => {
  const rows = [
    { sessionId: 's1', turnId: 't1', previousSessionId: 'p', source: 'x', status: 'running', steerable: true }
  ];
  assert.deepEqual(compactActiveRuns(rows), [
    {
      sessionId: 's1',
      turnId: 't1',
      previousSessionId: 'p',
      source: 'x',
      status: 'running',
      steerable: true
    }
  ]);
});

test('runtime debug helpers do not throw when disabled', () => {
  if (!isRuntimeDebugEnabled()) {
    assert.doesNotThrow(() => {
      runtimeDebugLine('test.event', { ok: true });
      runtimeDebugStatusActiveRuns([]);
    });
  }
});

test('sanitizeClientRuntimeDebugPayload keeps scroll metrics and drops free text', () => {
  assert.deepEqual(
    sanitizeClientRuntimeDebugPayload(
      {
        event: 'chat.scroll',
        clientAssetSignature: '/assets/index-DPdy14TP.js|/assets/index-DfNYVPnv.css',
        text: 'do not log this',
        scrollTop: 120,
        scrollHeight: 900,
        clientHeight: 500,
        keyboard: 'open',
        reason: 'after-submit',
        sessionId: 'session-1',
        weird: { nested: true }
      },
      { userAgent: 'Mobile Safari Test Agent', remoteAddress: '127.0.0.1' }
    ),
    {
      clientEvent: 'chat.scroll',
      sessionId: 'session-1',
      reason: 'after-submit',
      keyboard: 'open',
      scrollTop: 120,
      scrollHeight: 900,
      clientHeight: 500,
      clientAssetSignature: '/assets/index-DPdy14TP.js|/assets/index-DfNYVPnv.css',
      userAgent: 'Mobile Safari Test Agent',
      remoteAddress: '127.0.0.1'
    }
  );
});

test('sanitizeClientRuntimeDebugPayload keeps bounded message summaries', () => {
  assert.deepEqual(
    sanitizeClientRuntimeDebugPayload(
      {
        event: 'chat.render.snapshot',
        messages: {
          count: 3,
          roleCounts: { user: 1, activity: 2 },
          tail: [
            {
              id: 'abc123',
              role: 'activity',
              status: 'running',
              contentLen: 0,
              activityFootprint: 1200,
              ignoredText: 'x'.repeat(500)
            }
          ]
        },
        renderItems: {
          count: 2,
          typeCounts: { message: 2 }
        }
      },
      {}
    ),
    {
      clientEvent: 'chat.render.snapshot',
      messages: {
        count: 3,
        roleCounts: { user: 1, activity: 2 },
        tail: [
          {
            id: 'abc123',
            role: 'activity',
            status: 'running',
            contentLen: 0,
            activityFootprint: 1200,
            ignoredText: 'x'.repeat(220)
          }
        ]
      },
      renderItems: {
        count: 2,
        typeCounts: { message: 2 }
      }
    }
  );
});
