import assert from 'node:assert/strict';
import test from 'node:test';

import {
  childMemoryLimitExceeded,
  readSupervisorState,
  rotateLogFileIfNeeded,
  nextRestartDelayMs,
  pidsFromSupervisorState,
  runningSupervisorPids,
  shouldRestartServer,
  waitForServerHealthy
} from './server-supervisor.mjs';

test('waitForServerHealthy returns when health probe becomes ready', async () => {
  const calls = [];
  const result = await waitForServerHealthy({
    timeoutMs: 100,
    intervalMs: 1,
    sleep: async () => {},
    readHealth: async () => {
      calls.push(calls.length);
      if (calls.length < 3) {
        throw new Error('booting');
      }
      return { ok: true, status: 200 };
    }
  });

  assert.equal(result.ready, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.health.status, 200);
});

test('waitForServerHealthy reports timeout with last error details', async () => {
  const result = await waitForServerHealthy({
    timeoutMs: 5,
    intervalMs: 1,
    sleep: async () => {},
    now: (() => {
      let tick = 0;
      return () => {
        tick += 3;
        return tick;
      };
    })(),
    readHealth: async () => {
      throw new Error('connection refused');
    }
  });

  assert.equal(result.ready, false);
  assert.match(result.lastError?.message || '', /connection refused/);
});

test('shouldRestartServer only restarts unexpected exits when supervision is enabled', () => {
  assert.equal(shouldRestartServer({ exitCode: 1, signal: null, stopping: false, supervise: true }), true);
  assert.equal(shouldRestartServer({ exitCode: 0, signal: null, stopping: false, supervise: true }), false);
  assert.equal(shouldRestartServer({ exitCode: 1, signal: null, stopping: true, supervise: true }), false);
  assert.equal(shouldRestartServer({ exitCode: 1, signal: null, stopping: false, supervise: false }), false);
});

test('nextRestartDelayMs grows with attempts and respects cap', () => {
  assert.equal(nextRestartDelayMs(0), 1000);
  assert.equal(nextRestartDelayMs(1), 2000);
  assert.equal(nextRestartDelayMs(4), 10000);
  assert.equal(nextRestartDelayMs(9), 10000);
});

test('pidsFromSupervisorState only returns supervisor-managed run-server processes', () => {
  const pids = pidsFromSupervisorState({
    state: { pid: 123, childPid: 456 },
    currentPid: 999,
    commandForPid: (pid) => {
      if (pid === 123) {
        return 'node scripts/run-server.mjs';
      }
      if (pid === 456) {
        return 'node server/index.js';
      }
      return '';
    }
  });

  assert.deepEqual(pids, [123, 456]);
});

test('runningSupervisorPids finds only run-server commands for this root', () => {
  const pids = runningSupervisorPids({
    root: 'D:\\CodexMobile',
    currentPid: 999,
    listProcesses: () => [
      { pid: 123, command: '"C:\\Program Files\\nodejs\\node.exe" scripts/run-server.mjs', cwd: 'D:\\CodexMobile' },
      { pid: 456, command: '"C:\\Program Files\\nodejs\\node.exe" server/index.js', cwd: 'D:\\CodexMobile' },
      { pid: 654, command: '"C:\\Program Files\\nodejs\\node.exe" scripts/run-server.mjs', cwd: '' },
      { pid: 789, command: '"C:\\Program Files\\nodejs\\node.exe" scripts/run-server.mjs', cwd: 'D:\\Other' }
    ]
  });

  assert.deepEqual(pids, [123, 654]);
});

test('childMemoryLimitExceeded trips before the Node heap hard limit', () => {
  assert.equal(
    childMemoryLimitExceeded({
      workingSetBytes: 1_250 * 1024 * 1024,
      limitMb: 1200
    }),
    true
  );
  assert.equal(
    childMemoryLimitExceeded({
      workingSetBytes: 900 * 1024 * 1024,
      limitMb: 1200
    }),
    false
  );
});

test('rotateLogFileIfNeeded rotates oversized logs and keeps recent backups', () => {
  const calls = [];
  const files = new Map([
    ['D:\\CodexMobile\\.codexmobile\\server.err.log', 'x'.repeat(20)],
    ['D:\\CodexMobile\\.codexmobile\\server.err.log.1', 'old-1'],
    ['D:\\CodexMobile\\.codexmobile\\server.err.log.2', 'old-2']
  ]);
  const fsRef = {
    existsSync: (file) => files.has(file),
    statSync: (file) => ({ size: files.get(file)?.length || 0 }),
    rmSync: (file) => {
      calls.push(['rm', file]);
      files.delete(file);
    },
    renameSync: (from, to) => {
      calls.push(['rename', from, to]);
      files.set(to, files.get(from));
      files.delete(from);
    },
    writeFileSync: (file, content) => {
      calls.push(['write', file, content]);
      files.set(file, content);
    }
  };

  const rotated = rotateLogFileIfNeeded('D:\\CodexMobile\\.codexmobile\\server.err.log', {
    maxBytes: 10,
    keep: 2,
    fsRef
  });

  assert.equal(rotated, true);
  assert.equal(files.get('D:\\CodexMobile\\.codexmobile\\server.err.log'), '');
  assert.equal(files.get('D:\\CodexMobile\\.codexmobile\\server.err.log.1'), 'x'.repeat(20));
  assert.equal(files.get('D:\\CodexMobile\\.codexmobile\\server.err.log.2'), 'old-1');
});

test('readSupervisorState returns parsed state or null', () => {
  const statePath = 'D:\\CodexMobile\\.codexmobile\\state\\server-supervisor.json';
  const state = readSupervisorState(statePath, {
    fsRef: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ status: 'healthy', childPid: 123 })
    }
  });

  assert.deepEqual(state, { status: 'healthy', childPid: 123 });
  assert.equal(readSupervisorState('', { fsRef: { existsSync: () => false } }), null);
});
