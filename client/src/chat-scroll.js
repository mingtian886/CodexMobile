/**
 * 聊天滚动钉底：判断是否在底部附近及是否应跟随输出滚动。
 *
 * Keywords: chat, scroll, pinned-bottom, follow-output
 *
 * Exports:
 * - CHAT_BOTTOM_THRESHOLD_PX — 距底阈值像素。
 * - CHAT_FORCE_FOLLOW_EVENT — Composer 请求聊天区临时钉底的浏览器事件名。
 * - isNearChatBottom — 当前滚动位置是否贴近底部。
 * - readChatPaneMetrics — 读取聊天滚动容器的数值化布局指标。
 * - readChatViewportAnchor — 读取当前视口内第一条稳定聊天锚点。
 * - restoreChatViewportAnchor — 让同一锚点恢复到原视觉位置。
 * - shouldSettleSuspendedSubmitToBottom — 提交前贴底时，冻结后是否先落到新底部。
 * - shouldFollowChatOutput — 是否继续自动滚到底。
 * - shouldFollowChatLayoutChange — 布局变化后是否应保持钉底。
 * - isForcedChatFollowActive — 临时强制钉底窗口是否仍有效。
 *
 * Inward: 无。
 *
 * Outward: Chat 面板与 Composer 联动。
 */

export const CHAT_BOTTOM_THRESHOLD_PX = 96;
export const CHAT_FORCE_FOLLOW_EVENT = 'codexmobile:chat-pin-bottom';
export const CHAT_FORCE_FOLLOW_DURATION_MS = 2800;
export const CHAT_SUSPEND_FOLLOW_EVENT = 'codexmobile:chat-suspend-follow';
export const CHAT_SUBMIT_SCROLL_FREEZE_MS = 8000;
export const CHAT_VIEWPORT_ANCHOR_SELECTOR = '[data-chat-scroll-anchor]';

export function isNearChatBottom(pane, threshold = CHAT_BOTTOM_THRESHOLD_PX) {
  if (!pane) {
    return true;
  }
  const scrollHeight = Number(pane.scrollHeight) || 0;
  const scrollTop = Number(pane.scrollTop) || 0;
  const clientHeight = Number(pane.clientHeight) || 0;
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function readChatPaneMetrics(pane) {
  if (!pane) {
    return null;
  }
  return {
    scrollHeight: Number(pane.scrollHeight) || 0,
    scrollTop: Number(pane.scrollTop) || 0,
    clientHeight: Number(pane.clientHeight) || 0
  };
}

export function readChatViewportAnchor(pane, selector = CHAT_VIEWPORT_ANCHOR_SELECTOR) {
  if (!pane?.querySelectorAll || typeof pane.getBoundingClientRect !== 'function') {
    return null;
  }
  const paneRect = pane.getBoundingClientRect();
  const candidates = Array.from(pane.querySelectorAll(selector));
  for (const element of candidates) {
    if (typeof element.getBoundingClientRect !== 'function') {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= paneRect.top || rect.top >= paneRect.bottom) {
      continue;
    }
    return {
      element,
      offsetTop: rect.top - paneRect.top
    };
  }
  return null;
}

export function restoreChatViewportAnchor(pane, anchor) {
  if (!pane || !anchor?.element || typeof pane.getBoundingClientRect !== 'function') {
    return false;
  }
  if (typeof pane.contains === 'function' && !pane.contains(anchor.element)) {
    return false;
  }
  if (typeof anchor.element.getBoundingClientRect !== 'function') {
    return false;
  }
  const paneRect = pane.getBoundingClientRect();
  const rect = anchor.element.getBoundingClientRect();
  const nextOffsetTop = rect.top - paneRect.top;
  const delta = nextOffsetTop - Number(anchor.offsetTop || 0);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) {
    return false;
  }
  pane.scrollTop = (Number(pane.scrollTop) || 0) + delta;
  return true;
}

export function shouldSettleSuspendedSubmitToBottom({ pending = false, wasNearBottom = false } = {}) {
  return Boolean(pending && wasNearBottom);
}

export function shouldFollowChatOutput({ pinnedToBottom, pinnedBeforeUpdate = false, force = false }) {
  return Boolean(force || pinnedToBottom || pinnedBeforeUpdate);
}

export function shouldFollowChatLayoutChange({ before, force = false } = {}) {
  return shouldFollowChatOutput({
    force,
    pinnedToBottom: false,
    pinnedBeforeUpdate: isNearChatBottom(before)
  });
}

export function isForcedChatFollowActive(until = 0, now = Date.now()) {
  return Number(until) > Number(now);
}

export function isChatAutoFollowSuspended({ until = 0, untilRunComplete = false, running = false, now = Date.now() } = {}) {
  return Boolean((untilRunComplete && running) || Number(until) > Number(now));
}
