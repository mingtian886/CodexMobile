import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopRuntimeMirror,
  projectDesktopRuntimeMirrorPayloads
} from './desktop-runtime-mirror.js';

test('projectDesktopRuntimeMirrorPayloads emits only incremental assistant/activity payloads', () => {
  const runtime = {
    source: 'desktop-ipc',
    status: 'running',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    clientTurnId: 'client-turn-1'
  };
  const messages = [
    {
      id: 'activity-turn-1',
      role: 'activity',
      sessionId: 'thread-1',
      turnId: 'turn-1',
      activities: [
        {
          id: 'step-1',
          kind: 'command_execution',
          label: '运行命令',
          status: 'running',
          detail: 'npm run build',
          command: 'npm run build',
          output: 'building'
        }
      ]
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      sessionId: 'thread-1',
      turnId: 'turn-1',
      content: '正在处理第一步'
    }
  ];

  const first = projectDesktopRuntimeMirrorPayloads(messages, runtime, new Map());
  assert.equal(first.payloads.length, 2);
  assert.equal(first.payloads[0].type, 'activity-update');
  assert.equal(first.payloads[1].type, 'assistant-update');

  const second = projectDesktopRuntimeMirrorPayloads(messages, runtime, first.nextByKey);
  assert.equal(second.payloads.length, 0);

  const changed = projectDesktopRuntimeMirrorPayloads([
    messages[0],
    { ...messages[1], content: '正在处理第二步' }
  ], runtime, first.nextByKey);
  assert.equal(changed.payloads.length, 1);
  assert.equal(changed.payloads[0].type, 'assistant-update');
  assert.match(changed.payloads[0].content, /第二步/);
});

test('desktop runtime mirror polls active desktop sessions and broadcasts only changed payloads', async () => {
  const broadcasts = [];
  let callCount = 0;
  const mirror = createDesktopRuntimeMirror({
    listActiveDesktopRuntimes: () => ([
      {
        source: 'desktop-ipc',
        status: 'running',
        sessionId: 'thread-1',
        turnId: 'turn-1',
        clientTurnId: 'client-turn-1'
      }
    ]),
    readSessionMessages: async () => {
      callCount += 1;
      return {
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            sessionId: 'thread-1',
            turnId: 'turn-1',
            content: callCount === 1 ? '第一段输出' : '第二段输出'
          }
        ]
      };
    },
    broadcast: (payload) => broadcasts.push(payload),
    intervalMs: 10
  });

  await mirror.tickNow();
  assert.equal(broadcasts.length, 1);
  assert.match(broadcasts[0].content, /第一段输出/);

  await mirror.tickNow();
  assert.equal(broadcasts.length, 2);
  assert.match(broadcasts[1].content, /第二段输出/);

  await mirror.tickNow();
  assert.equal(broadcasts.length, 2);
});

test('projectDesktopRuntimeMirrorPayloads truncates oversized activity output for stability', () => {
  const longOutput = 'x'.repeat(20_000);
  const result = projectDesktopRuntimeMirrorPayloads([
    {
      id: 'activity-turn-1',
      role: 'activity',
      sessionId: 'thread-1',
      turnId: 'turn-1',
      activities: [
        {
          id: 'step-1',
          kind: 'command_execution',
          status: 'running',
          output: longOutput
        }
      ]
    }
  ], {
    source: 'desktop-ipc',
    status: 'running',
    sessionId: 'thread-1',
    turnId: 'turn-1'
  }, new Map());

  assert.equal(result.payloads.length, 1);
  assert.ok(result.payloads[0].output.length < longOutput.length);
  assert.match(result.payloads[0].output, /truncated/);
});
