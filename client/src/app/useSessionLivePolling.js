/**
 * 空闲时拉取选中会话消息并做轻量合并，作为 WebSocket sync events 的补账层。
 *
 * Keywords: idle-polling, session-messages, reconcile
 *
 * Exports:
 * - shouldPollSelectedSession — 判断当前选中会话是否应发起补账轮询。
 * - `useSessionLivePolling` — 基于认证与选中会话驱动轮询的 effect hook。
 *
 * Inward: `api`、`session-live-refresh`、`activity-model` 签名、`session-utils`。
 *
 * Outward: `App.jsx` 与会话实时展示链路配合。
 */

import { useEffect } from 'react';
import { apiFetch } from '../api.js';
import {
  messageStreamSignature
} from '../chat/activity-model.js';
import {
  hasStaleRunningActivityResolvedByLoaded,
  mergeLiveSelectedThreadMessages
} from '../session-live-refresh.js';
import { clientRuntimeDebug, isClientScrollDebugActive } from './runtime-debug-client.js';
import { summarizeMessagesForDebug } from './message-debug-summary.js';
import { mergeContextStatus } from './context-status.js';
import {
  isDraftSession,
  sessionMessagesApiPath
} from './session-utils.js';

const DESKTOP_LIVE_POLL_INTERVAL_MS = 2000;
const IDLE_SELECTED_SESSION_POLL_INTERVAL_MS = 5000;

export function shouldPollSelectedSession({
  authenticated,
  selectedSession,
  running,
  pollInFlight,
  selectedRuntime
} = {}) {
  if (!authenticated || !selectedSession?.id || isDraftSession(selectedSession)) {
    return false;
  }
  const desktopIpcRunning =
    selectedRuntime?.status === 'running' && String(selectedRuntime?.source || '') === 'desktop-ipc';
  if (pollInFlight || (running && !desktopIpcRunning)) {
    return false;
  }
  return true;
}

export function selectedSessionPollIntervalMs({
  running,
  selectedRuntime
} = {}) {
  const desktopIpcRunning =
    running &&
    selectedRuntime?.status === 'running' &&
    String(selectedRuntime?.source || '') === 'desktop-ipc';
  return desktopIpcRunning ? DESKTOP_LIVE_POLL_INTERVAL_MS : IDLE_SELECTED_SESSION_POLL_INTERVAL_MS;
}

function contextStatusSignature(value = null) {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const autoCompact = value.autoCompact && typeof value.autoCompact === 'object' ? value.autoCompact : {};
  return JSON.stringify({
    inputTokens: value.inputTokens ?? null,
    totalTokens: value.totalTokens ?? null,
    contextWindow: value.contextWindow ?? null,
    percent: value.percent ?? null,
    updatedAt: value.updatedAt ?? null,
    autoCompact: {
      enabled: autoCompact.enabled ?? null,
      detected: autoCompact.detected ?? null,
      tokenLimit: autoCompact.tokenLimit ?? null,
      status: autoCompact.status ?? null,
      lastCompactedAt: autoCompact.lastCompactedAt ?? null,
      reason: autoCompact.reason ?? ''
    }
  });
}

function finalAssistantLoaded(current = [], loaded = []) {
  return loaded.some((message) =>
    message?.role === 'assistant' &&
    String(message.content || '').trim() &&
    !['running', 'queued'].includes(String(message?.status || '').toLowerCase())
  ) && !current.some((message) =>
    message?.role === 'activity' &&
    ['running', 'queued'].includes(String(message?.status || '')) &&
    !message?.transient
  );
}

export function shouldClearSelectedRuntimeAfterPoll({
  current = [],
  loaded = [],
  selectedRuntime = null
} = {}) {
  return selectedRuntime?.status === 'running' &&
    String(selectedRuntime?.source || '') === 'desktop-ipc' &&
    hasStaleRunningActivityResolvedByLoaded(current, loaded);
}

export function useSessionLivePolling({
  authenticated,
  selectedSession,
  running,
  selectedRuntime,
  defaultStatus,
  sessionLivePollRef,
  selectedSessionRef,
  clearRun,
  setContextStatus,
  setMessages
}) {
  useEffect(() => {
    if (!authenticated || !selectedSession?.id || isDraftSession(selectedSession)) {
      return undefined;
    }

    const sessionId = selectedSession.id;
    let stopped = false;
    async function pollSelectedSession() {
      if (
        stopped ||
        !shouldPollSelectedSession({
          authenticated,
          selectedSession,
          running,
          selectedRuntime,
          pollInFlight: sessionLivePollRef.current
        })
      ) {
        return;
      }
      sessionLivePollRef.current = true;
      try {
        const data = await apiFetch(sessionMessagesApiPath(sessionId));
        if (!stopped && selectedSessionRef.current?.id === sessionId && Array.isArray(data.messages)) {
          setContextStatus((current) => {
            const next = mergeContextStatus(current, data.context || defaultStatus.context, defaultStatus.context);
            return contextStatusSignature(current) === contextStatusSignature(next) ? current : next;
          });
          setMessages((current) => {
            const sameSignature = messageStreamSignature(current) === messageStreamSignature(data.messages);
            const shouldClearRuntime = shouldClearSelectedRuntimeAfterPoll({
              current,
              loaded: data.messages,
              selectedRuntime
            }) && finalAssistantLoaded(current, data.messages);
            const next = sameSignature
              ? current
              : mergeLiveSelectedThreadMessages(current, data.messages, {
                forceDropStaleRunning: shouldClearRuntime
              });
            if (shouldClearRuntime) {
              clearRun?.({
                ...selectedRuntime,
                sessionId: selectedRuntime.sessionId || sessionId,
                completedAt: data.messages.find((message) => message?.role === 'assistant')?.timestamp || new Date().toISOString()
              });
            }
            if (isClientScrollDebugActive() && !sameSignature) {
              clientRuntimeDebug('messages.merge.poll', {
                sessionId,
                clearRuntime: shouldClearRuntime ? 1 : 0,
                current: summarizeMessagesForDebug(current),
                loaded: summarizeMessagesForDebug(data.messages),
                next: summarizeMessagesForDebug(next)
              });
            }
            return next;
          });
        }
      } catch {
        // Keep the currently rendered conversation if a transient poll fails.
      } finally {
        sessionLivePollRef.current = false;
      }
    }

    const intervalMs = selectedSessionPollIntervalMs({ running, selectedRuntime });
    const timer = window.setInterval(pollSelectedSession, intervalMs);
    pollSelectedSession();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    authenticated,
    selectedSession?.id,
    running,
    selectedRuntime?.status,
    selectedRuntime?.source
  ]);
}
