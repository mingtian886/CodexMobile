/**
 * 将流式活动步骤合并进当前步骤列表（同 id 更新、思考步骤折叠、同工作项合并）。
 *
 * Keywords: activity, merge, steps, streaming, reasoning
 *
 * Exports:
 * - mergeActivityStep — 返回更新后的步骤数组。
 *
 * Inward: activity-display.js（思考步骤判定）。
 *
 * Outward: 活动消息 upsert、实时会话状态。
 */

import { isThinkingActivityStep } from './activity-display.js';

function keepRicherRunningField(previous, next, field) {
  const previousValue = String(previous?.[field] || '');
  const nextValue = String(next?.[field] || '');
  if (!previousValue || !nextValue || nextValue.length >= previousValue.length || !previousValue.includes(nextValue)) {
    return nextValue || previousValue;
  }
  return previousValue;
}

function mergeActivityStepFields(previous, step) {
  const merged = { ...previous, ...step };
  if (String(step?.status || '') === 'failed') {
    return merged;
  }
  return {
    ...merged,
    detail: keepRicherRunningField(previous, step, 'detail'),
    output: keepRicherRunningField(previous, step, 'output'),
    error: keepRicherRunningField(previous, step, 'error')
  };
}

export function mergeActivityStep(currentSteps, step) {
  if (!step) {
    return currentSteps || [];
  }
  const steps = [...(currentSteps || [])];
  const existingIndex = steps.findIndex((item) => item.id === step.id);
  if (existingIndex >= 0) {
    steps[existingIndex] = mergeActivityStepFields(steps[existingIndex], step);
    return steps;
  }

  if (isThinkingActivityStep(step)) {
    const thinkingIndex = steps.findIndex((item) => isThinkingActivityStep(item));
    if (thinkingIndex >= 0) {
      steps[thinkingIndex] = mergeActivityStepFields(steps[thinkingIndex], step);
      return steps;
    }
  }

  const sameWorkIndex = steps.findIndex(
    (item) =>
      item.kind === step.kind &&
      item.label === step.label &&
      (item.command || '') === (step.command || '')
  );
  if (sameWorkIndex >= 0) {
    steps[sameWorkIndex] = mergeActivityStepFields(steps[sameWorkIndex], step);
    return steps;
  }
  const last = steps[steps.length - 1];
  if (last && last.label === step.label && last.detail === step.detail && last.status === step.status) {
    return steps;
  }
  return [...steps, step];
}
