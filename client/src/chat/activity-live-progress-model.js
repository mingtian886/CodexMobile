/**
 * Build the live progress bubble model while preserving the full running output.
 */

export const LIVE_PROGRESS_VISIBLE_STEP_LIMIT = Number.POSITIVE_INFINITY;

export function liveProgressDisplayModel(steps = []) {
  const sourceSteps = Array.isArray(steps) ? steps : [];
  return {
    visibleSteps: [...sourceSteps],
    hiddenCount: 0
  };
}
