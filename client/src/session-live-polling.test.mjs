/**
 * 测试 app/useSessionLivePolling.js：选中会话空闲补账轮询的触发条件。
 * Keywords: session-polling, stale-activity, tests
 * Exports: 无导出 / 内含用例
 * Inward: app/useSessionLivePolling.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldClearSelectedRuntimeAfterPoll,
  selectedSessionPollIntervalMs,
  shouldPollSelectedSession
} from './app/useSessionLivePolling.js';

test('stale running activity does not block polling when live runtime is idle', () => {
  assert.equal(
    shouldPollSelectedSession({
      authenticated: true,
      selectedSession: { id: 'thread-1' },
      running: false,
      hasRunningActivity: true,
      pollInFlight: false
    }),
    true
  );
});

test('live runtime still blocks selected session polling', () => {
  assert.equal(
    shouldPollSelectedSession({
      authenticated: true,
      selectedSession: { id: 'thread-1' },
      running: true,
      hasRunningActivity: true,
      pollInFlight: false
    }),
    false
  );
});

test('desktop ipc runtime keeps selected session polling enabled for live desktop refresh', () => {
  assert.equal(
    shouldPollSelectedSession({
      authenticated: true,
      selectedSession: { id: 'thread-1' },
      running: true,
      selectedRuntime: { status: 'running', source: 'desktop-ipc' },
      pollInFlight: false
    }),
    true
  );
});

test('desktop ipc runtime uses a faster live polling interval', () => {
  assert.equal(
    selectedSessionPollIntervalMs({
      running: true,
      selectedRuntime: { status: 'running', source: 'desktop-ipc' }
    }),
    2000
  );
});

test('idle selected session polling backs off to reduce load', () => {
  assert.equal(
    selectedSessionPollIntervalMs({
      running: false,
      selectedRuntime: null
    }),
    5000
  );
});

test('selected session poll can clear desktop runtime once final assistant is loaded', () => {
  const current = [
    {
      id: 'status-client-turn',
      role: 'activity',
      status: 'running',
      source: 'desktop-ipc',
      sessionId: 'thread-1',
      turnId: 'client-turn-1'
    }
  ];
  const loaded = [
    {
      id: 'u-desktop',
      role: 'user',
      content: 'run',
      sessionId: 'thread-1',
      turnId: 'desktop-turn-1'
    },
    {
      id: 'a-desktop',
      role: 'assistant',
      content: 'done',
      sessionId: 'thread-1',
      turnId: 'desktop-turn-1'
    }
  ];

  assert.equal(
    shouldClearSelectedRuntimeAfterPoll({
      current,
      loaded,
      selectedRuntime: { status: 'running', source: 'desktop-ipc', sessionId: 'thread-1', turnId: 'client-turn-1' }
    }),
    true
  );
});

test('selected session poll does not clear desktop runtime without final assistant', () => {
  assert.equal(
    shouldClearSelectedRuntimeAfterPoll({
      current: [
        {
          id: 'status-client-turn',
          role: 'activity',
          status: 'running',
          source: 'desktop-ipc',
          sessionId: 'thread-1',
          turnId: 'client-turn-1'
        }
      ],
      loaded: [
        {
          id: 'u-desktop',
          role: 'user',
          content: 'run',
          sessionId: 'thread-1',
          turnId: 'desktop-turn-1'
        }
      ],
      selectedRuntime: { status: 'running', source: 'desktop-ipc', sessionId: 'thread-1', turnId: 'client-turn-1' }
    }),
    false
  );
});

test('final assistant gate blocks stale runtime clearing when poll is still incomplete', () => {
  const current = [
    {
      id: 'status-client-turn',
      role: 'activity',
      status: 'running',
      source: 'desktop-ipc',
      sessionId: 'thread-1',
      turnId: 'client-turn-1'
    }
  ];
  const loaded = [
    {
      id: 'u-desktop',
      role: 'user',
      content: 'run',
      sessionId: 'thread-1',
      turnId: 'desktop-turn-1'
    }
  ];

  assert.equal(
    shouldClearSelectedRuntimeAfterPoll({
      current,
      loaded,
      selectedRuntime: { status: 'running', source: 'desktop-ipc', sessionId: 'thread-1', turnId: 'client-turn-1' }
    }),
    false
  );
});
