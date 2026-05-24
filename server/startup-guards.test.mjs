import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleHttpListenError,
  installFatalProcessGuards
} from './startup-guards.js';

test('installFatalProcessGuards exits through the injected exit hook', () => {
  const logs = [];
  let exitCode = null;
  const processRef = {
    on(event, handler) {
      this.handlers[event] = handler;
    },
    handlers: {}
  };
  installFatalProcessGuards({
    processRef,
    logger: { error: (message) => logs.push(String(message)) },
    exit: (code) => { exitCode = code; }
  });
  processRef.handlers.uncaughtException(new Error('boom'));
  assert.equal(exitCode, 1);
  assert.equal(logs.some((line) => line.includes('uncaughtException')), true);
});

test('handleHttpListenError exits non-zero with the port in the message', () => {
  const logs = [];
  let exitCode = null;
  handleHttpListenError(new Error('EADDRINUSE'), {
    host: '0.0.0.0',
    port: 3321,
    logger: { error: (message) => logs.push(String(message)) },
    exit: (code) => { exitCode = code; }
  });
  assert.equal(exitCode, 1);
  assert.equal(logs.some((line) => line.includes('3321')), true);
});
