/**
 * 测试 server/status-active-runs.js：对外 activeRuns 只以同步 runtime 为准，并合并图片任务。
 *
 * Keywords: status, active-runs, test
 *
 * Exports: 无导出，内含用例
 *
 * Inward: status-active-runs.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPublicActiveRuns } from './status-active-runs.js';

test('collectPublicActiveRuns ignores stale internal headless runs once sync state is terminal', () => {
  const runs = collectPublicActiveRuns({
    runtimeById: {},
    terminalById: {
      'turn-1': {
        status: 'completed',
        sessionId: 'thread-1',
        turnId: 'turn-1',
        completedAt: '2026-05-21T14:50:39.654Z'
      }
    }
  });

  assert.deepEqual(runs, []);
});

test('collectPublicActiveRuns dedupes sync runtime aliases into one public run', () => {
  const runs = collectPublicActiveRuns({
    runtimeById: {
      'turn-1': {
        source: 'headless-local',
        status: 'running',
        sessionId: 'thread-1',
        turnId: 'turn-1',
        label: '正在思考',
        startedAt: '2026-05-21T14:49:00.000Z',
        updatedAt: '2026-05-21T14:49:03.000Z'
      },
      'thread-1': {
        source: 'headless-local',
        status: 'running',
        sessionId: 'thread-1',
        turnId: 'turn-1',
        label: '正在思考',
        startedAt: '2026-05-21T14:49:00.000Z',
        updatedAt: '2026-05-21T14:49:03.000Z'
      }
    }
  });

  assert.equal(runs.length, 1);
  assert.equal(runs[0].turnId, 'turn-1');
  assert.equal(runs[0].sessionId, 'thread-1');
  assert.equal(runs[0].source, 'headless-local');
});

test('collectPublicActiveRuns keeps image runs alongside sync runtime', () => {
  const runs = collectPublicActiveRuns(
    {
      runtimeById: {
        'desktop-turn': {
          source: 'desktop-ipc',
          status: 'running',
          sessionId: 'desktop-thread',
          turnId: 'desktop-turn',
          label: '桌面端处理中',
          startedAt: '2026-05-21T14:48:00.000Z'
        }
      }
    },
    [{
      source: 'image-generator',
      status: 'running',
      sessionId: 'image-thread',
      turnId: 'image-turn',
      label: '正在生成图片',
      kind: 'image_generation_call',
      startedAt: '2026-05-21T14:49:00.000Z'
    }]
  );

  assert.equal(runs.length, 2);
  assert.deepEqual(
    runs.map((run) => ({ turnId: run.turnId, source: run.source, kind: run.kind })),
    [
      { turnId: 'desktop-turn', source: 'desktop-ipc', kind: null },
      { turnId: 'image-turn', source: 'image-generator', kind: 'image_generation_call' }
    ]
  );
});

test('collectPublicActiveRuns keeps local headless runs not yet projected into sync state', () => {
  const runs = collectPublicActiveRuns(
    { runtimeById: {} },
    [],
    [{
      source: 'headless-local',
      status: 'running',
      sessionId: 'thread-local',
      turnId: 'turn-local',
      label: '正在思考',
      startedAt: '2026-05-21T14:49:00.000Z'
    }]
  );

  assert.equal(runs.length, 1);
  assert.equal(runs[0].turnId, 'turn-local');
  assert.equal(runs[0].source, 'headless-local');
});
