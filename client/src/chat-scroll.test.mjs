/**
 * 测试 chat-scroll.js：钉底判定与跟随输出策略。
 * Keywords: chat-scroll, tests
 * Exports: 无导出 / 内含用例
 * Inward: chat-scroll.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAT_FORCE_FOLLOW_DURATION_MS,
  CHAT_SUBMIT_SCROLL_FREEZE_MS,
  isChatAutoFollowSuspended,
  isNearChatBottom,
  isForcedChatFollowActive,
  readChatViewportAnchor,
  readChatPaneMetrics,
  restoreChatViewportAnchor,
  shouldSettleSuspendedSubmitToBottom,
  shouldFollowChatLayoutChange,
  shouldFollowChatOutput
} from './chat-scroll.js';

test('detects whether the chat pane is pinned near the bottom', () => {
  assert.equal(isNearChatBottom({ scrollHeight: 1200, scrollTop: 620, clientHeight: 500 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 1200, scrollTop: 420, clientHeight: 500 }), false);
});

test('does not force-follow running output after the user scrolls up', () => {
  assert.equal(shouldFollowChatOutput({ pinnedToBottom: false, running: true }), false);
  assert.equal(shouldFollowChatOutput({ pinnedToBottom: true, running: true }), true);
  assert.equal(shouldFollowChatOutput({ pinnedToBottom: true, running: false }), true);
});

test('allows an explicit session-load scroll to override the pinned state', () => {
  assert.equal(shouldFollowChatOutput({ pinnedToBottom: false, force: true }), true);
});

test('keeps following output when a message replacement temporarily loses the bottom pin', () => {
  assert.equal(
    shouldFollowChatOutput({
      pinnedToBottom: false,
      pinnedBeforeUpdate: true
    }),
    true
  );
});

test('layout changes keep the chat pinned when it was already near the bottom', () => {
  assert.equal(
    shouldFollowChatLayoutChange({
      before: { scrollHeight: 1600, scrollTop: 980, clientHeight: 540 },
      after: { scrollHeight: 1520, scrollTop: 980, clientHeight: 460 }
    }),
    true
  );
});

test('layout changes do not steal scroll when the user is reading older messages', () => {
  assert.equal(
    shouldFollowChatLayoutChange({
      before: { scrollHeight: 1600, scrollTop: 620, clientHeight: 540 },
      after: { scrollHeight: 1520, scrollTop: 620, clientHeight: 460 }
    }),
    false
  );
});

test('layout changes do not steal scroll just because refreshed content lands near bottom', () => {
  assert.equal(
    shouldFollowChatLayoutChange({
      before: { scrollHeight: 1600, scrollTop: 620, clientHeight: 540 },
      after: { scrollHeight: 1520, scrollTop: 970, clientHeight: 460 }
    }),
    false
  );
});

test('readChatPaneMetrics returns normalized numeric values', () => {
  assert.deepEqual(
    readChatPaneMetrics({ scrollHeight: '1200', scrollTop: '600', clientHeight: '500' }),
    { scrollHeight: 1200, scrollTop: 600, clientHeight: 500 }
  );
  assert.equal(readChatPaneMetrics(null), null);
});

test('forced chat follow stays active until its deadline', () => {
  assert.equal(isForcedChatFollowActive(10_000, 9_000), true);
  assert.equal(isForcedChatFollowActive(10_000, 10_000), false);
  assert.equal(isForcedChatFollowActive(Date.now() + CHAT_FORCE_FOLLOW_DURATION_MS), true);
});

test('chat auto-follow suspension stays active for submit freeze or active run', () => {
  assert.equal(
    isChatAutoFollowSuspended({
      until: 10_000,
      now: 9_000
    }),
    true
  );
  assert.equal(
    isChatAutoFollowSuspended({
      until: 10_000,
      now: 10_000
    }),
    false
  );
  assert.equal(
    isChatAutoFollowSuspended({
      untilRunComplete: true,
      running: true,
      now: 20_000
    }),
    true
  );
  assert.equal(
    isChatAutoFollowSuspended({
      untilRunComplete: true,
      running: false,
      now: 20_000
    }),
    false
  );
  assert.equal(isChatAutoFollowSuspended({ until: Date.now() + CHAT_SUBMIT_SCROLL_FREEZE_MS }), true);
});

test('restores the same visible chat row when content above changes height', () => {
  let scrollTop = 1000;
  let anchorTop = 220;
  const row = {
    getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 80 })
  };
  const pane = {
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value) {
      scrollTop = value;
    },
    getBoundingClientRect: () => ({ top: 100, bottom: 600 }),
    querySelectorAll: () => [row],
    contains: (element) => element === row
  };

  const anchor = readChatViewportAnchor(pane);
  anchorTop = 520;

  assert.equal(restoreChatViewportAnchor(pane, anchor), true);
  assert.equal(scrollTop, 1300);
});

test('settles a suspended submit to the new bottom only when it started near bottom', () => {
  assert.equal(
    shouldSettleSuspendedSubmitToBottom({
      pending: true,
      wasNearBottom: true
    }),
    true
  );
  assert.equal(
    shouldSettleSuspendedSubmitToBottom({
      pending: true,
      wasNearBottom: false
    }),
    false
  );
  assert.equal(
    shouldSettleSuspendedSubmitToBottom({
      pending: false,
      wasNearBottom: true
    }),
    false
  );
});
