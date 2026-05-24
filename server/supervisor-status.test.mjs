import assert from 'node:assert/strict';
import test from 'node:test';
import { readSupervisorPublicStatus } from './supervisor-status.js';

test('readSupervisorPublicStatus returns stable supervisor summary', () => {
  const status = readSupervisorPublicStatus({
    rootDir: 'D:\\CodexMobile',
    fsRef: {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({
        pid: 1,
        childPid: 2,
        port: 3321,
        status: 'healthy',
        restarts: 0,
        lastFailure: null,
        updatedAt: '2026-05-15T14:00:00.000Z'
      })
    }
  });

  assert.deepEqual(status, {
    statePath: 'D:\\CodexMobile\\.codexmobile\\state\\server-supervisor.json',
    running: true,
    pid: 1,
    childPid: 2,
    port: 3321,
    status: 'healthy',
    restarts: 0,
    lastFailure: null,
    updatedAt: '2026-05-15T14:00:00.000Z'
  });
});

test('readSupervisorPublicStatus is explicit when state is missing', () => {
  const status = readSupervisorPublicStatus({
    rootDir: 'D:\\CodexMobile',
    fsRef: {
      existsSync: () => false
    }
  });

  assert.equal(status.running, false);
  assert.equal(status.status, 'missing');
});
