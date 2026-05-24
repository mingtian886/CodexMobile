/**
 * Tests for full live progress display.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { liveProgressDisplayModel } from './chat/activity-live-progress-model.js';

test('liveProgressDisplayModel keeps all visible steps for monitoring', () => {
  const steps = Array.from({ length: 7 }, (_, index) => ({
    id: `step-${index + 1}`,
    label: `step ${index + 1}`
  }));

  const model = liveProgressDisplayModel(steps, { limit: 4 });

  assert.deepEqual(
    model.visibleSteps.map((step) => step.id),
    ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6', 'step-7']
  );
  assert.equal(model.hiddenCount, 0);
});

test('liveProgressDisplayModel keeps short progress unchanged', () => {
  const steps = [
    { id: 'step-1', label: 'first' },
    { id: 'step-2', label: 'second' }
  ];

  const model = liveProgressDisplayModel(steps, { limit: 4 });

  assert.deepEqual(model.visibleSteps, steps);
  assert.equal(model.hiddenCount, 0);
  assert.notEqual(model.visibleSteps, steps);
});
