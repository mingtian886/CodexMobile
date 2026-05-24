/**
 * LaunchAgent / 后台入口：加载 .env、注入系统代理后，以最小监督模式守护 HTTP 服务。
 *
 * Keywords: launchd, supervisor, health-check, restart, server-bootstrap
 *
 * Exports:
 * - 无 default，CLI 自执行。
 *
 * Inward（本模块依赖/组装的关键符号）: system-proxy-env.mjs；server-supervisor.mjs；仓库根 .env。
 *
 * Outward（谁在用/调用场景）: install-macos-autostart 生成的 plist ProgramArguments；start-server.mjs 拉起的后台守护入口。
 */

import fs from 'node:fs';
import path from 'node:path';

import { applyMacSystemProxyEnv } from './system-proxy-env.mjs';
import {
  buildChildEnv,
  childMemoryLimitExceeded,
  loadDotEnv,
  nextRestartDelayMs,
  processWorkingSetBytes,
  readServerHealth,
  rotateLogFiles,
  shouldRestartServer,
  sleep,
  spawnServerProcess,
  waitForServerHealthy
} from './server-supervisor.mjs';

const root = path.resolve(import.meta.dirname, '..');
const logDir = path.join(root, '.codexmobile');
const stateDir = path.join(logDir, 'state');
const outPath = path.join(logDir, 'server.out.log');
const errPath = path.join(logDir, 'server.err.log');
const supervisorStatePath = path.join(stateDir, 'server-supervisor.json');
const port = Number(process.env.PORT || 3321);
const healthTimeoutMs = Number(process.env.CODEXMOBILE_SERVER_HEALTH_TIMEOUT_MS || 20_000);
const runtimeHealthIntervalMs = Number(process.env.CODEXMOBILE_RUNTIME_HEALTH_INTERVAL_MS || 5000);
const restartMemoryLimitMb = Number(process.env.CODEXMOBILE_RESTART_MEMORY_MB || 1200);
const maxLogBytes = Number(process.env.CODEXMOBILE_LOG_MAX_BYTES || 5 * 1024 * 1024);

fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });
rotateLogFiles([outPath, errPath], { maxBytes: maxLogBytes, keep: 3 });

loadDotEnv(root);
const proxyEnv = applyMacSystemProxyEnv();
if (proxyEnv.applied) {
  console.log(`[launchd] Using macOS system proxy for background Codex requests: ${proxyEnv.proxyUrl}`);
}
console.log(`[launchd] CodexMobile run-server starting cwd=${process.cwd()} node=${process.execPath}`);

let stopping = false;
let child = null;

function writeSupervisorState(payload = {}) {
  const next = {
    pid: process.pid,
    childPid: payload.childPid || null,
    port,
    updatedAt: new Date().toISOString(),
    restarts: payload.restarts || 0,
    status: payload.status || 'starting',
    lastFailure: payload.lastFailure || null
  };
  fs.writeFileSync(supervisorStatePath, JSON.stringify(next, null, 2), 'utf8');
}

function clearSupervisorState() {
  try {
    fs.rmSync(supervisorStatePath, { force: true });
  } catch {
    // Ignore cleanup failure.
  }
}

function forwardSignal(signal) {
  stopping = true;
  if (child?.pid) {
    try {
      process.kill(child.pid, signal);
    } catch {
      // Child already exited.
    }
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));
process.on('exit', () => {
  if (stopping) {
    clearSupervisorState();
  }
});

async function launchOnce(restarts) {
  const out = fs.openSync(outPath, 'a');
  const err = fs.openSync(errPath, 'a');
  try {
    child = spawnServerProcess({
      root,
      outFd: out,
      errFd: err,
      detached: false,
      env: buildChildEnv(process.env),
      serverArgs: ['server/index.js']
    });
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }

  writeSupervisorState({ childPid: child.pid, restarts, status: 'booting' });

  const health = await waitForServerHealthy({
    timeoutMs: healthTimeoutMs,
    intervalMs: 1000,
    readHealth: ({ signal } = {}) => readServerHealth({ port, signal })
  });

  if (!health.ready) {
    const detail = health.lastError?.message || 'health-timeout';
    console.error(`[supervisor] Server failed health check on port ${port}: ${detail}`);
    writeSupervisorState({
      childPid: child?.pid || null,
      restarts,
      status: 'boot-failed',
      lastFailure: detail
    });
    if (child?.pid) {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // Child already exited.
      }
    }
  } else {
    writeSupervisorState({ childPid: child.pid, restarts, status: 'healthy' });
    console.log(`[supervisor] CodexMobile healthy on http://127.0.0.1:${port} pid=${child.pid}`);
  }

  let runtimeHealthTimer = null;
  if (health.ready && runtimeHealthIntervalMs > 0 && restartMemoryLimitMb > 0) {
    runtimeHealthTimer = setInterval(() => {
      if (!child?.pid) {
        return;
      }
      const workingSetBytes = processWorkingSetBytes(child.pid);
      if (!childMemoryLimitExceeded({ workingSetBytes, limitMb: restartMemoryLimitMb })) {
        return;
      }
      const detail = `memory-limit-exceeded ${Math.round(workingSetBytes / 1024 / 1024)}MB>${restartMemoryLimitMb}MB`;
      console.warn(`[supervisor] Restarting CodexMobile child: ${detail}`);
      writeSupervisorState({
        childPid: child.pid,
        restarts,
        status: 'restarting-memory-limit',
        lastFailure: detail
      });
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // Child already exited.
      }
    }, runtimeHealthIntervalMs);
    if (typeof runtimeHealthTimer.unref === 'function') {
      runtimeHealthTimer.unref();
    }
  }

  const exit = await new Promise((resolve) => {
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  if (runtimeHealthTimer) {
    clearInterval(runtimeHealthTimer);
  }
  return { ...exit, health };
}

async function main() {
  let restarts = 0;
  while (!stopping) {
    const result = await launchOnce(restarts);
    if (!shouldRestartServer({
      exitCode: result.exitCode,
      signal: result.signal,
      stopping,
      supervise: true
    })) {
      clearSupervisorState();
      if (result.exitCode && !stopping) {
        process.exitCode = result.exitCode;
      }
      return;
    }
    const delayMs = nextRestartDelayMs(restarts);
    restarts += 1;
    writeSupervisorState({ childPid: null, restarts, status: `restarting-in-${delayMs}ms` });
    console.warn(`[supervisor] CodexMobile exited unexpectedly (code=${result.exitCode ?? 'null'} signal=${result.signal ?? 'null'}), restarting in ${delayMs} ms.`);
    await sleep(delayMs);
  }
  clearSupervisorState();
}

main().catch((error) => {
  console.error('[supervisor] Failed to start:', error);
  clearSupervisorState();
  process.exitCode = 1;
});
