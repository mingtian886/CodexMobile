/**
 * Runtime debug helpers for comparing message/render state without logging full content.
 */

function textLength(value) {
  return String(value || '').length;
}

function shortId(value) {
  const text = String(value || '');
  if (text.length <= 14) {
    return text;
  }
  return `${text.slice(0, 6)}…${text.slice(-6)}`;
}

function activityFootprint(message = {}) {
  let total = textLength(message.content) + textLength(message.detail) + textLength(message.label);
  if (!Array.isArray(message.activities)) {
    return total;
  }
  for (const activity of message.activities) {
    total += textLength(activity?.label);
    total += textLength(activity?.content);
    total += textLength(activity?.detail);
    total += textLength(activity?.command);
    total += textLength(activity?.output);
    total += textLength(activity?.error);
    if (Array.isArray(activity?.fileChanges)) {
      for (const change of activity.fileChanges) {
        total += textLength(change?.path);
        total += textLength(change?.unifiedDiff);
      }
    }
  }
  return total;
}

export function summarizeMessageForDebug(message = {}) {
  const activities = Array.isArray(message.activities) ? message.activities : [];
  const activityStatuses = activities.reduce((counts, activity) => {
    const status = String(activity?.status || 'unknown');
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  return {
    id: shortId(message.id || message.messageId || ''),
    role: message.role || '',
    status: message.status || '',
    turnId: shortId(message.turnId || message.clientTurnId || ''),
    sessionId: shortId(message.sessionId || ''),
    contentLen: textLength(message.content),
    detailLen: textLength(message.detail),
    activityCount: activities.length,
    activityStatuses,
    activityFootprint: activityFootprint(message)
  };
}

export function summarizeMessagesForDebug(messages = [], { tail = 6 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const roleCounts = list.reduce((counts, message) => {
    const role = String(message?.role || 'unknown');
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  return {
    count: list.length,
    roleCounts,
    tail: list.slice(Math.max(0, list.length - tail)).map(summarizeMessageForDebug)
  };
}

export function summarizeRenderItemsForDebug(items = [], { tail = 6 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const typeCounts = list.reduce((counts, item) => {
    const type = String(item?.type || 'unknown');
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  return {
    count: list.length,
    typeCounts,
    tail: list.slice(Math.max(0, list.length - tail)).map((item) => ({
      type: item?.type || '',
      key: shortId(item?.key || ''),
      fileSummaryCount: Array.isArray(item?.fileSummaries) ? item.fileSummaries.length : 0,
      message: item?.message ? summarizeMessageForDebug(item.message) : null
    }))
  };
}
