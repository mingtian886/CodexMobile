/**
 * 开发/本机启动器：加载 .env、应用系统代理，拉起后台守护入口并等待服务健康。
 *
 * Keywords: dev-server, supervisor, health-check, spawn, logging, system-proxy
 *
 * Exports:
 * - 无 default，CLI 自执行。
 *
 * Inward（本模块依赖/组装的关键符号）: system-proxy-env.mjs；server-supervisor.mjs；.codexmobile 日志目录。
 *
 * Outward（谁在用/调用场景）: package.json start:bg；本地手动 node scripts/start-server.mjs。
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { applyMacSystemProxyEnv } from './system-proxy-env.mjs';
import {
  buildChildEnv,
  loadDotEnv,
  readServerHealth,
  rotateLogFiles,
  stopExistingCodexMobileServer,
  stopSupervisorFromState,
  waitForServerHealthy
} from './server-supervisor.mjs';

const root = path.resolve(import.meta.dirname, '..');
const logDir = path.join(root, '.codexmobile');
const port = Number(process.env.PORT || 3321);
const launchdLabel = 'com.codexmobile.bridge';
const healthTimeoutMs = Number(process.env.CODEXMOBILE_SERVER_HEALTH_TIMEOUT_MS || 20_000);
fs.mkdirSync(logDir, { recursive: true });

const outPath = path.join(logDir, 'server.out.log');
const errPath = path.join(logDir, 'server.err.log');
const supervisorStatePath = path.join(logDir, 'state', 'server-supervisor.json');
const maxLogBytes = Number(process.env.CODEXMOBILE_LOG_MAX_BYTES || 5 * 1024 * 1024);

loadDotEnv(root);
const proxyEnv = applyMacSystemProxyEnv();
if (proxyEnv.applied) {
  console.log(`Using macOS system proxy for background Codex requests: ${proxyEnv.proxyUrl}`);
}

function launchdDomain() {
  const uid = process.getuid?.();
  return Number.isInteger(uid) ? `gui/${uid}` : 'gui';
}

function restartLaunchAgentIfInstalled() {
  if (process.platform !== 'darwin') {
    return false;
  }
  const domain = launchdDomain();
  const serviceName = `${domain}/${launchdLabel}`;
  const printResult = spawnSync('launchctl', ['print', serviceName], {
    encoding: 'utf8'
  });
  if (printResult.status !== 0) {
    return false;
  }
  const output = `${printResult.stdout || ''}\n${printResult.stderr || ''}`;
  if (!output.includes(root) || !output.includes('scripts/run-server.mjs')) {
    return false;
  }
  const result = spawnSync('launchctl', ['kickstart', '-k', serviceName], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`launchctl kickstart failed${detail ? `:\n${detail}` : ''}`);
  }
  console.log(`CodexMobile is managed by launchd; restarted ${launchdLabel}.`);
  console.log(`Logs: ${path.join(logDir, 'launchd.out.log')}`);
  return true;
}

if (restartLaunchAgentIfInstalled()) {
  process.exit(0);
}

rotateLogFiles([outPath, errPath], { maxBytes: maxLogBytes, keep: 3 });

await stopExistingCodexMobileServer({
  port,
  log: (line) => console.log(line)
});
await stopSupervisorFromState({
  root,
  statePath: supervisorStatePath,
  log: (line) => console.log(line)
});

const out = fs.openSync(outPath, 'a');
const err = fs.openSync(errPath, 'a');
let child = null;
try {
  child = spawn(process.execPath, ['scripts/run-server.mjs'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
    env: buildChildEnv(process.env)
  });
  child.unref();
} finally {
  fs.closeSync(out);
  fs.closeSync(err);
}

const health = await waitForServerHealthy({
  timeoutMs: healthTimeoutMs,
  intervalMs: 1000,
  readHealth: ({ signal } = {}) => readServerHealth({ port, signal })
});

if (!health.ready) {
  try {
    if (child?.pid) {
      process.kill(child.pid, 'SIGTERM');
    }
  } catch {
    // Ignore failed cleanup.
  }
  const detail = health.lastError?.message || 'health-timeout';
  console.error(`CodexMobile server failed health check on port ${port}: ${detail}`);
  process.exit(1);
}

console.log(`CodexMobile server started in background, supervisor pid=${child.pid}`);
console.log(`Healthy URL: http://127.0.0.1:${port}/api/status`);
console.log(`Logs: ${outPath}`);
process.exit(0);
