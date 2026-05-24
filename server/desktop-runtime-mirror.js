/**
 * 桌面线程运行态镜像：轮询 active desktop-ipc session，把运行中的 assistant/activity 增量投递给移动端。
 */

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function truncateRealtimeField(value, limit = 8000) {
  const text = String(value || '');
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars for live stability]`;
}

function assistantEntry(message = {}, runtime = {}) {
  const content = String(message?.content || '').trim();
  const id = String(message?.id || '').trim();
  if (!content || !id) {
    return null;
  }
  return {
    key: `assistant:${id}`,
    signature: [id, message.turnId, message.timestamp, content].join('|'),
    payload: {
      type: 'assistant-update',
      source: 'desktop-ipc',
      sessionId: message.sessionId || runtime.sessionId || null,
      previousSessionId: runtime.previousSessionId || null,
      turnId: message.turnId || runtime.turnId || null,
      clientTurnId: runtime.clientTurnId || null,
      messageId: id,
      role: 'assistant',
      kind: message.kind || 'agent_message',
      phase: 'final_answer',
      content: truncateRealtimeField(content, 12000),
      status: runtime.status === 'queued' ? 'queued' : 'running',
      done: false,
      timestamp: message.timestamp || runtime.updatedAt || new Date().toISOString()
    }
  };
}

function activityEntries(message = {}, runtime = {}) {
  const activities = Array.isArray(message?.activities) ? message.activities : [];
  return activities
    .map((activity) => {
      const activityId = String(activity?.id || '').trim();
      if (!activityId) {
        return null;
      }
      return {
        key: `activity:${activityId}`,
        signature: [
          activityId,
          activity?.status || '',
          activity?.label || '',
          activity?.detail || '',
          activity?.command || '',
          activity?.output || '',
          activity?.error || '',
          safeJson(activity?.fileChanges || [])
        ].join('|'),
        payload: {
          type: 'activity-update',
          source: 'desktop-ipc',
          sessionId: message.sessionId || runtime.sessionId || null,
          previousSessionId: message.previousSessionId || runtime.previousSessionId || null,
          turnId: message.turnId || runtime.turnId || null,
          clientTurnId: message.clientTurnId || runtime.clientTurnId || null,
          messageId: activityId,
          kind: activity?.kind || 'activity',
          label: activity?.label || '',
          status: activity?.status || runtime.status || 'running',
          detail: activity?.detail || '',
          command: activity?.command || '',
          output: truncateRealtimeField(activity?.output || ''),
          error: truncateRealtimeField(activity?.error || ''),
          exitCode: activity?.exitCode ?? null,
          fileChanges: Array.isArray(activity?.fileChanges) ? activity.fileChanges : [],
          planImplementation: activity?.planImplementation || null,
          toolName: activity?.toolName || '',
          durationMs: activity?.durationMs ?? null,
          startedAt: activity?.startedAt || null,
          completedAt: activity?.completedAt || null,
          timestamp: activity?.timestamp || message.timestamp || runtime.updatedAt || new Date().toISOString()
        }
      };
    })
    .filter(Boolean);
}

export function projectDesktopRuntimeMirrorPayloads(messages = [], runtime = {}, previousByKey = new Map()) {
  const nextByKey = new Map();
  const payloads = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role === 'assistant') {
      const entry = assistantEntry(message, runtime);
      if (!entry) {
        continue;
      }
      nextByKey.set(entry.key, entry.signature);
      if (previousByKey.get(entry.key) !== entry.signature) {
        payloads.push(entry.payload);
      }
      continue;
    }
    if (message?.role === 'activity') {
      for (const entry of activityEntries(message, runtime)) {
        nextByKey.set(entry.key, entry.signature);
        if (previousByKey.get(entry.key) !== entry.signature) {
          payloads.push(entry.payload);
        }
      }
    }
  }

  return { payloads, nextByKey };
}

export function createDesktopRuntimeMirror({
  listActiveDesktopRuntimes,
  readSessionMessages,
  broadcast,
  intervalMs = 1200,
  logger = console
} = {}) {
  let timer = null;
  let running = false;
  let stopped = false;
  const sessionState = new Map();

  async function tick() {
    if (running || stopped) {
      return;
    }
    running = true;
    try {
      const runtimes = Array.isArray(listActiveDesktopRuntimes?.()) ? listActiveDesktopRuntimes() : [];
      const activeSessionIds = new Set();
      for (const runtime of runtimes) {
        const sessionId = String(runtime?.sessionId || '').trim();
        if (!sessionId) {
          continue;
        }
        activeSessionIds.add(sessionId);
        const previousByKey = sessionState.get(sessionId) || new Map();
        try {
          const data = await readSessionMessages(sessionId, {
            limit: 200,
            latest: true,
            includeActivity: true
          });
          const { payloads, nextByKey } = projectDesktopRuntimeMirrorPayloads(data?.messages || [], runtime, previousByKey);
          sessionState.set(sessionId, nextByKey);
          for (const payload of payloads) {
            broadcast(payload);
          }
        } catch (error) {
          logger.warn?.('[desktop-runtime-mirror] session poll failed:', sessionId, error.message);
        }
      }
      for (const sessionId of [...sessionState.keys()]) {
        if (!activeSessionIds.has(sessionId)) {
          sessionState.delete(sessionId);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    start() {
      stopped = false;
      void tick();
      timer = setInterval(() => {
        void tick();
      }, intervalMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      sessionState.clear();
    },
    async tickNow() {
      await tick();
    }
  };
}
