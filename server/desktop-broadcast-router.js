/**
 * 桌面 IPC 广播路由辅助：识别线程运行、归档与标题变更相关 payload。
 *
 * Keywords: desktop-ipc, broadcast, archive, runtime, thread
 *
 * Exports:
 * - desktopBroadcastSessionId — 从不同桌面广播形态中提取会话 id。
 * - desktopBroadcastRuntimeStatus — 把桌面运行态归一化为 running/completed/failed。
 * - desktopBroadcastIsThreadStateChange — 判断是否为线程运行/读状态变化。
 * - desktopBroadcastIsArchiveChange — 判断是否为归档/取消归档变化。
 *
 * Inward（本模块依赖/组装的关键符号）: 纯 payload 解析，无外部依赖。
 *
 * Outward（谁在用/调用场景）: server/index 的桌面 IPC broadcast listener。
 *
 * 不负责: 刷新缓存、广播 WebSocket 或修改会话状态。
 */

export function desktopBroadcastSessionId(message = {}) {
  const params = message.params || {};
  const change = params.change || params.state || params.thread || {};
  return String(
    params.conversationId ||
    params.conversation_id ||
    params.threadId ||
    params.thread_id ||
    params.sessionId ||
    params.session_id ||
    change.conversationId ||
    change.conversation_id ||
    change.threadId ||
    change.thread_id ||
    change.sessionId ||
    change.session_id ||
    ''
  ).trim();
}

export function desktopBroadcastRuntimeStatus(message = {}) {
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
  if (params.isStreaming === false || params.streaming === false || change.isStreaming === false || change.streaming === false) {
    return 'completed';
  }
  return '';
}

export function desktopBroadcastIsThreadStateChange(message = {}) {
  return ['thread-stream-state-changed', 'thread-read-state-changed'].includes(String(message.method || ''));
}

export function desktopBroadcastIsArchiveChange(message = {}) {
  return ['thread-archived', 'thread-unarchived'].includes(String(message.method || ''));
}
