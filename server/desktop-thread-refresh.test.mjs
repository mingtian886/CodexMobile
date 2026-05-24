/**
 * 测试 server/desktop-thread-refresh.js：桌面线程状态变更的终态推断。
 *
 * Keywords: desktop-thread-refresh, infer-idle-completion, test
 *
 * Exports: 无导出 / 内含用例。
 *
 * Inward: desktop-thread-refresh.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDesktopThreadBroadcastStatus,
  planDesktopThreadRefreshAfterStateChange,
  shouldInferIdleCompletionAfterDesktopThreadStateChange
} from './desktop-thread-refresh.js';

test('desktop thread refresh does not infer completion when stream state change has no explicit status', () => {
  assert.equal(
    shouldInferIdleCompletionAfterDesktopThreadStateChange({
      isStreamStateChange: true,
      status: ''
    }),
    false
  );
});

test('desktop thread refresh can infer completion when stream state change reports a terminal status', () => {
  assert.equal(
    shouldInferIdleCompletionAfterDesktopThreadStateChange({
      isStreamStateChange: true,
      status: 'completed'
    }),
    true
  );
});

test('desktop thread refresh keeps active runtime when stream state change omits status', () => {
  assert.deepEqual(
    planDesktopThreadRefreshAfterStateChange({
      isStreamStateChange: true,
      status: '',
      hasDesktopRuntime: true
    }),
    {
      shouldRefresh: true,
      inferIdleCompletion: false
    }
  );
});

test('desktop thread refresh can refresh and infer completion for explicit terminal stream status', () => {
  assert.deepEqual(
    planDesktopThreadRefreshAfterStateChange({
      isStreamStateChange: true,
      status: 'completed',
      hasDesktopRuntime: true
    }),
    {
      shouldRefresh: true,
      inferIdleCompletion: true
    }
  );
});

test('desktop read-state change with isStreaming false does not prematurely infer completion', () => {
  assert.equal(
    normalizeDesktopThreadBroadcastStatus({
      method: 'thread-read-state-changed',
      params: {
        isStreaming: false
      }
    }),
    ''
  );
});

test('desktop stream-state change with isStreaming false still marks completion', () => {
  assert.equal(
    normalizeDesktopThreadBroadcastStatus({
      method: 'thread-stream-state-changed',
      params: {
        isStreaming: false
      }
    }),
    'completed'
  );
});
