/**
 * 桌面桥规范化与 Composer 发送按钮禁用态/文案推导。
 *
 * Keywords: desktop-bridge, composer, send-state, capabilities
 *
 * Exports:
 * - normalizeDesktopBridge — 统一 bridge 形状。
 * - desktopBridgeCanCreateThread — 兼容旧调用；移动端发送不再依赖此能力。
 * - composerSendState — disabled、label、mode 等发送区状态。
 * - shouldBlurComposerBeforeSubmit — start 发送前是否先收起输入法。
 * - shouldDeferComposerSubmitAfterBlur — 收起软键盘期间是否延后提交。
 * - shouldRequestChatBottomPinBeforeSubmit — 兼容旧调用；手机端提交不再主动钉底。
 * - shouldSuspendChatAutoFollowBeforeSubmit — start 发送前是否暂停聊天区自动跟随。
 * - shouldKeepComposerFocusOnSubmitPointerDown — 点击发送按钮时是否阻止按钮抢焦点。
 *
 * Inward: 无。
 *
 * Outward: Composer、提交流程与会话创建入口。
 */

export function normalizeDesktopBridge(bridge = null) {
  return {
    strict: bridge?.strict !== false,
    connected: Boolean(bridge?.connected),
    mode: bridge?.mode || 'unavailable',
    reason: bridge?.reason || null,
    capabilities: bridge?.capabilities && typeof bridge.capabilities === 'object'
      ? bridge.capabilities
      : {}
  };
}

export function desktopBridgeCanCreateThread(bridge = null) {
  const normalized = normalizeDesktopBridge(bridge);
  if (!normalized.connected) {
    return false;
  }
  if (normalized.mode === 'desktop-ipc') {
    return true;
  }
  if (normalized.capabilities.backgroundCodex || normalized.capabilities.createThreadViaBackground) {
    return true;
  }
  if (normalized.capabilities.createThread === false) {
    return false;
  }
  if (normalized.mode === 'desktop-ipc' && normalized.capabilities.createThread !== true) {
    return false;
  }
  return true;
}

export function composerSendState({
  running = false,
  hasInput = false,
  uploading = false,
  desktopBridge = null,
  steerable = true,
  sessionIsDraft = false
} = {}) {
  const bridge = normalizeDesktopBridge(desktopBridge);
  void bridge;
  void sessionIsDraft;
  if (uploading) {
    return {
      disabled: true,
      label: '正在上传',
      mode: 'uploading',
      showMenu: false,
      showStopButton: false,
      canSteer: false,
      canQueue: false,
      canInterrupt: false
    };
  }
  if (running && !hasInput) {
    return {
      disabled: false,
      label: '中止当前任务',
      mode: 'abort',
      showMenu: false,
      showStopButton: false,
      canSteer: false,
      canQueue: false,
      canInterrupt: true
    };
  }
  if (running && hasInput) {
    return {
      disabled: false,
      label: '选择发送方式',
      mode: steerable ? 'steer' : 'queue',
      showMenu: true,
      showStopButton: false,
      canSteer: Boolean(steerable),
      canQueue: true,
      canInterrupt: true
    };
  }
  return {
    disabled: !hasInput,
    label: '发送消息',
    mode: 'start',
    showMenu: false,
    showStopButton: false,
    canSteer: false,
    canQueue: false,
    canInterrupt: false
  };
}

export function shouldBlurComposerBeforeSubmit(sendState = {}) {
  void sendState;
  return false;
}

export function shouldDeferComposerSubmitAfterBlur({ sendState = {}, keyboardOpen = false } = {}) {
  return shouldBlurComposerBeforeSubmit(sendState) && keyboardOpen;
}

export function shouldRequestChatBottomPinBeforeSubmit({ sendState = {}, keyboardOpen = false } = {}) {
  void keyboardOpen;
  return false;
}

export function shouldSuspendChatAutoFollowBeforeSubmit(input = {}) {
  const submitMode = input?.submitMode || input?.mode;
  return ['start', 'steer', 'queue', 'interrupt'].includes(submitMode);
}

export function shouldKeepComposerFocusOnSubmitPointerDown(sendState = {}) {
  return sendState.mode === 'start';
}
