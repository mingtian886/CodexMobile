/**
 * 聚合 /api/status 对外运行态：以 syncState.runtimeById 为准，并补入本地与图片任务。
 *
 * Keywords: status, active-runs, sync-state, image-run
 *
 * Exports:
 * - collectPublicActiveRuns — 生成对外展示的 activeRuns 列表。
 *
 * Inward（本模块依赖/组装的关键符号）: syncState snapshot、图片任务列表。
 *
 * Outward（谁在用/调用场景）: server/index.js 的 publicStatus 聚合。
 *
 * 不负责: headless 本地运行的中止、排队与内部账本清理。
 */

function isoTime(value) {
  const text = String(value || '').trim();
  return text || null;
}

function activeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'running' || status === 'queued') {
    return status;
  }
  return '';
}

function normalizeRun(run = {}, fallbackSource = null) {
  const status = activeStatus(run.status);
  if (!status) {
    return null;
  }
  const turnId = String(run.turnId || run.clientTurnId || '').trim() || null;
  const sessionId = String(run.sessionId || '').trim() || null;
  const previousSessionId = String(run.previousSessionId || '').trim() || null;
  if (!turnId && !sessionId && !previousSessionId) {
    return null;
  }
  return {
    projectId: String(run.projectId || '').trim() || null,
    sessionId,
    previousSessionId,
    startedAt: isoTime(run.startedAt),
    updatedAt: isoTime(run.updatedAt),
    completedAt: isoTime(run.completedAt),
    status,
    turnId,
    clientTurnId: String(run.clientTurnId || '').trim() || null,
    steerable: run.steerable === undefined ? null : Boolean(run.steerable),
    source: String(run.source || fallbackSource || '').trim() || null,
    kind: String(run.kind || '').trim() || null,
    label: String(run.label || '').trim() || null,
    detail: String(run.detail || '').trim() || null,
    context: run.context || null
  };
}

function runIdentity(run, fallbackKey = '') {
  return String(
    run.turnId ||
      run.clientTurnId ||
      run.sessionId ||
      run.previousSessionId ||
      fallbackKey
  );
}

function pickPreferredRun(current, incoming) {
  if (!current) {
    return incoming;
  }
  const currentTurn = Boolean(current.turnId || current.clientTurnId);
  const incomingTurn = Boolean(incoming.turnId || incoming.clientTurnId);
  if (incomingTurn && !currentTurn) {
    return { ...current, ...incoming };
  }
  if (currentTurn && !incomingTurn) {
    return { ...incoming, ...current };
  }
  const currentUpdatedAt = Date.parse(current.updatedAt || current.startedAt || 0) || 0;
  const incomingUpdatedAt = Date.parse(incoming.updatedAt || incoming.startedAt || 0) || 0;
  if (incomingUpdatedAt >= currentUpdatedAt) {
    return { ...current, ...incoming };
  }
  return { ...incoming, ...current };
}

export function collectPublicActiveRuns(syncState = {}, imageRuns = [], localRuns = []) {
  const deduped = new Map();

  for (const [key, runtime] of Object.entries(syncState?.runtimeById || {})) {
    const normalized = normalizeRun(runtime);
    if (!normalized) {
      continue;
    }
    const identity = runIdentity(normalized, key);
    deduped.set(identity, pickPreferredRun(deduped.get(identity), normalized));
  }

  for (const run of Array.isArray(imageRuns) ? imageRuns : []) {
    const normalized = normalizeRun(run, 'image-generator');
    if (!normalized) {
      continue;
    }
    const identity = runIdentity(normalized);
    deduped.set(identity, pickPreferredRun(deduped.get(identity), normalized));
  }

  for (const run of Array.isArray(localRuns) ? localRuns : []) {
    const normalized = normalizeRun(run, 'headless-local');
    if (!normalized) {
      continue;
    }
    const identity = runIdentity(normalized);
    deduped.set(identity, pickPreferredRun(deduped.get(identity), normalized));
  }

  return [...deduped.values()].sort((left, right) => {
    const leftTime = Date.parse(left.startedAt || left.updatedAt || 0) || 0;
    const rightTime = Date.parse(right.startedAt || right.updatedAt || 0) || 0;
    return leftTime - rightTime;
  });
}
