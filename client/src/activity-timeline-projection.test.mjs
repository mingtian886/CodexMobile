/**
 * Tests for activity timeline projection options.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { projectActivityTimeline } from './chat/activity-timeline-projection.js';

test('projectActivityTimeline keeps all tool burst items when visible count is infinite', () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `tool-${index + 1}`,
    label: `tool ${index + 1}`
  }));
  const timeline = [{
    id: 'burst',
    type: 'meta',
    metaType: 'command',
    title: '运行命令',
    items
  }];

  const projected = projectActivityTimeline(timeline, {
    burstVisibleCount: Number.POSITIVE_INFINITY
  });

  assert.equal(projected[0].type, 'meta');
  assert.equal(projected[0].items.length, 8);
  assert.equal(projected[0].hiddenCount, undefined);
});
