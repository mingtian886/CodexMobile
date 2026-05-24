/**
 * 测试 sync/useSyncSocket.js：统一同步事件如何确认用户消息并归并执行过程。
 * Keywords: sync-socket, user-message, pending, activity, commentary, tests
 * Exports: 无导出 / 内含用例
 * Inward: sync/useSyncSocket.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { applySyncSocketPayload } from './sync/useSyncSocket.js';

function applyWithMessages(messages, event) {
  let nextMessages = messages;
  const handled = applySyncSocketPayload({
    type: 'sync-event',
    event
  }, {
    selectedSessionRef: { current: { id: event.sessionId, turnId: event.clientTurnId } },
    setMessages(update) {
      nextMessages = update(nextMessages);
    }
  });
  return { handled, messages: nextMessages };
}

test('message.user confirms only the matching pending duplicate content message', () => {
  const current = [
    {
      id: 'old-user',
      role: 'user',
      content: '继续',
      sessionId: 'thread-1',
      turnId: 'old-turn',
      deliveryState: 'confirmed',
      timestamp: '2026-05-13T00:00:00.000Z'
    },
    {
      id: 'local-user',
      role: 'user',
      content: '继续',
      sessionId: 'thread-1',
      turnId: 'client-turn-2',
      deliveryState: 'pending',
      timestamp: '2026-05-13T00:01:00.000Z'
    }
  ];

  const result = applyWithMessages(current, {
    eventType: 'message.user',
    sessionId: 'thread-1',
    turnId: 'real-turn-2',
    clientTurnId: 'client-turn-2',
    message: {
      id: 'server-user',
      role: 'user',
      content: '继续',
      timestamp: '2026-05-13T00:01:01.000Z'
    }
  });

  assert.equal(result.handled, true);
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].turnId, 'old-turn');
  assert.equal(result.messages[0].deliveryState, 'confirmed');
  assert.equal(result.messages[1].turnId, 'real-turn-2');
  assert.equal(result.messages[1].deliveryState, 'confirmed');
});

test('commentary assistant deltas render inside the execution card instead of chat bubbles', () => {
  const result = applyWithMessages([], {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'commentary-1',
      role: 'assistant',
      phase: 'commentary',
      content: '现在已经输出到第 5 行，继续等工具结果。',
      done: false,
      timestamp: '2026-05-13T00:02:00.000Z'
    }
  });

  assert.equal(result.handled, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, 'activity');
  assert.equal(result.messages[0].activities.length, 1);
  assert.equal(result.messages[0].activities[0].id, 'commentary-1');
  assert.equal(result.messages[0].activities[0].kind, 'agent_message');
  assert.equal(result.messages[0].activities[0].label, '现在已经输出到第 5 行，继续等工具结果。');
});

test('final answer assistant deltas still render as assistant chat bubbles', () => {
  const result = applyWithMessages([], {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'answer-1',
      role: 'assistant',
      phase: 'final_answer',
      content: '最终回答正在输出。',
      done: false,
      timestamp: '2026-05-13T00:03:00.000Z'
    }
  });

  assert.equal(result.handled, true);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, 'assistant');
  assert.equal(result.messages[0].content, '最终回答正在输出。');
});

test('interaction sync events insert and resolve pending request messages', () => {
  const requested = applyWithMessages([], {
    eventType: 'interaction.requested',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'pending',
    interaction: {
      id: 'interaction-1',
      kind: 'user_input',
      title: '检查方式',
      questions: [{ id: 'check_method', question: '怎么检查？', options: [] }]
    }
  });

  assert.equal(requested.handled, true);
  assert.equal(requested.messages.length, 1);
  assert.equal(requested.messages[0].role, 'interaction_request');
  assert.equal(requested.messages[0].interaction.title, '检查方式');

  const resolved = applyWithMessages(requested.messages, {
    eventType: 'interaction.resolved',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'completed',
    interactionId: 'interaction-1'
  });

  assert.equal(resolved.handled, true);
  assert.deepEqual(resolved.messages, []);
});

test('commentary assistant event removes earlier same item assistant bubble', () => {
  const prematureBubble = applyWithMessages([], {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'agent-message-1',
      role: 'assistant',
      phase: 'final_answer',
      content: '现在到第 7 次输出，工具 session 仍然保持运行。',
      done: false
    }
  });
  const commentary = applyWithMessages(prematureBubble.messages, {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'agent-message-1',
      role: 'assistant',
      phase: 'commentary',
      content: '现在到第 7 次输出，工具 session 仍然保持运行。',
      done: false
    }
  });

  assert.equal(prematureBubble.messages.length, 1);
  assert.equal(prematureBubble.messages[0].role, 'assistant');
  assert.equal(commentary.messages.length, 1);
  assert.equal(commentary.messages[0].role, 'activity');
  assert.equal(commentary.messages[0].activities[0].label, '现在到第 7 次输出，工具 session 仍然保持运行。');
});

test('commentary activity event removes earlier same item assistant bubble', () => {
  const prematureBubble = applyWithMessages([], {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'agent-message-2',
      role: 'assistant',
      phase: 'final_answer',
      content: '任务在跑，当前到第 3 次输出。',
      done: false
    }
  });
  const activity = applyWithMessages(prematureBubble.messages, {
    eventType: 'activity.updated',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    activity: {
      sessionId: 'thread-1',
      turnId: 'turn-1',
      messageId: 'agent-message-2',
      itemId: 'agent-message-2',
      kind: 'agent_message',
      phase: 'commentary',
      status: 'running',
      label: '任务在跑，当前到第 3 次输出。',
      content: '任务在跑，当前到第 3 次输出。'
    }
  });

  assert.equal(activity.messages.length, 1);
  assert.equal(activity.messages[0].role, 'activity');
  assert.equal(activity.messages[0].activities.length, 1);
  assert.equal(activity.messages[0].activities[0].id, 'agent-message-2');
});

test('final completed answer folds prior commentary activity and keeps final bubble separate', () => {
  const commentary = applyWithMessages([], {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'commentary-1',
      role: 'assistant',
      phase: 'commentary',
      content: '先看工具输出。',
      done: false,
      timestamp: '2026-05-13T00:04:00.000Z'
    }
  });

  const completed = applyWithMessages(commentary.messages, {
    eventType: 'message.assistant.completed',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'completed',
    message: {
      id: 'answer-1',
      role: 'assistant',
      phase: 'final_answer',
      content: '最终回答。',
      done: true,
      timestamp: '2026-05-13T00:04:30.000Z'
    }
  });

  assert.equal(completed.messages.length, 2);
  assert.equal(completed.messages[0].role, 'activity');
  assert.equal(completed.messages[0].status, 'completed');
  assert.equal(completed.messages[0].activities[0].status, 'completed');
  assert.equal(completed.messages[1].role, 'assistant');
  assert.equal(completed.messages[1].content, '最终回答。');
});

test('commentary and tool activity accumulate in one execution card during a turn', () => {
  const first = applyWithMessages([], {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'commentary-1',
      role: 'assistant',
      phase: 'commentary',
      content: '先启动命令。',
      done: false
    }
  });
  const tool = applyWithMessages(first.messages, {
    eventType: 'activity.updated',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    activity: {
      sessionId: 'thread-1',
      turnId: 'turn-1',
      messageId: 'cmd-1',
      kind: 'command_execution',
      status: 'running',
      label: '正在处理本地任务',
      command: 'sleep 5'
    }
  });
  const second = applyWithMessages(tool.messages, {
    eventType: 'message.assistant.delta',
    source: 'headless-local',
    sessionId: 'thread-1',
    turnId: 'turn-1',
    status: 'running',
    message: {
      id: 'commentary-2',
      role: 'assistant',
      phase: 'commentary',
      content: '命令还在跑，继续等结果。',
      done: false
    }
  });

  assert.equal(second.messages.length, 1);
  assert.equal(second.messages[0].role, 'activity');
  assert.deepEqual(
    second.messages[0].activities.map((activity) => activity.kind),
    ['agent_message', 'command_execution', 'agent_message']
  );
});
