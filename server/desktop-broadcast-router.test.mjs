/**
 * 测试 server/desktop-broadcast-router.js：桌面 IPC 广播识别与会话 id 提取。
 * Keywords: desktop-ipc, archive, broadcast, tests
 * Exports: 无导出 / 内含用例
 * Inward: desktop-broadcast-router.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  desktopBroadcastIsArchiveChange,
  desktopBroadcastIsThreadStateChange,
  desktopBroadcastRuntimeStatus,
  desktopBroadcastSessionId
} from './desktop-broadcast-router.js';

test('desktop archive broadcasts are recognized and expose session id from direct params', () => {
  const archived = {
    method: 'thread-archived',
    params: {
      conversationId: 'thread-1'
    }
  };
  const unarchived = {
    method: 'thread-unarchived',
    params: {
      thread_id: 'thread-2'
    }
  };

  assert.equal(desktopBroadcastIsArchiveChange(archived), true);
  assert.equal(desktopBroadcastIsArchiveChange(unarchived), true);
  assert.equal(desktopBroadcastSessionId(archived), 'thread-1');
  assert.equal(desktopBroadcastSessionId(unarchived), 'thread-2');
});

test('desktop broadcast helpers accept nested state payloads used by app thread changes', () => {
  const message = {
    method: 'thread-stream-state-changed',
    params: {
      state: {
        session_id: 'thread-3',
        stream_state: 'stopped'
      }
    }
  };

  assert.equal(desktopBroadcastIsThreadStateChange(message), true);
  assert.equal(desktopBroadcastSessionId(message), 'thread-3');
  assert.equal(desktopBroadcastRuntimeStatus(message), 'completed');
});

test('desktop broadcast runtime status maps active and failed variants', () => {
  assert.equal(desktopBroadcastRuntimeStatus({ params: { streamState: 'streaming' } }), 'running');
  assert.equal(desktopBroadcastRuntimeStatus({ params: { status: 'interrupted' } }), 'failed');
  assert.equal(desktopBroadcastRuntimeStatus({ params: { isStreaming: false } }), 'completed');
});
