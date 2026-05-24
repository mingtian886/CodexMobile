/**
 * 桌面线程刷新辅助：判断 IPC 流状态变更后是否允许推断终态。
 *
 * Keywords: desktop-thread-refresh, stream-state, runtime-inference
 *
 * Exports:
 * - shouldInferIdleCompletionAfterDesktopThreadStateChange — 仅在明确终态时允许推断完成。
 */

export function shouldInferIdleCompletionAfterDesktopThreadStateChange({
  isStreamStateChange = false,
  status = ''
} = {}) {
  if (!isStreamStateChange) {
    return false;
  }
  return ['completed', 'failed', 'aborted'].includes(String(status || '').trim().toLowerCase());
}

export function normalizeDesktopThreadBroadcastStatus(message = {}) {
  const method = String(message.method || '');
  const params = message.params || {};
  const change = params.change || params.state || params.thread || {};
  const status = String(
    params.status ||
    params.streamState ||
    params.stream_state ||
    change.status ||
    change.streamState ||
    change.stream_state ||
    ''
  ).toLowerCase();
  if (['running', 'queued', 'streaming', 'active'].includes(status)) {
    return 'running';
  }
  if (['completed', 'complete', 'success', 'succeeded', 'idle', 'stopped'].includes(status)) {
    return 'completed';
  }
  if (['failed', 'error', 'cancelled', 'canceled', 'interrupted', 'aborted'].includes(status)) {
    return 'failed';
  }
  if (
    method === 'thread-stream-state-changed' &&
    (params.isStreaming === false || params.streaming === false || change.isStreaming === false || change.streaming === false)
  ) {
    return 'completed';
  }
  return '';
}

export function planDesktopThreadRefreshAfterStateChange({
  isStreamStateChange = false,
  status = '',
  hasDesktopRuntime = false
} = {}) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const shouldRefresh =
    (isStreamStateChange && Boolean(normalizedStatus) && normalizedStatus !== 'running') ||
    (isStreamStateChange && !normalizedStatus && hasDesktopRuntime);
  return {
    shouldRefresh,
    inferIdleCompletion: shouldInferIdleCompletionAfterDesktopThreadStateChange({
      isStreamStateChange,
      status: normalizedStatus
    })
  };
}
