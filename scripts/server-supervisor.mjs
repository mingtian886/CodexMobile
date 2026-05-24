import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function dedupePath(value) {
  const seen = new Set();
  return String(value || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = process.platform === 'win32' ? item.toLowerCase() : item;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .join(path.delimiter);
}

export function buildChildEnv(sourceEnv = process.env) {
  if (process.platform !== 'win32') {
    return sourceEnv;
  }

  const env = {};
  const seen = new Set();
  for (const [key, value] of Object.entries(sourceEnv)) {
    const normalized = key.toLowerCase();
    if (normalized === 'path' || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    env[key] = value;
  }

  const appData = String(sourceEnv.APPDATA || '').trim();
  const localAppData = String(sourceEnv.LOCALAPPDATA || '').trim();
  const codexPathHints = [
    appData ? path.join(appData, 'npm') : '',
    localAppData ? path.join(localAppData, 'OpenAI', 'Codex', 'bin') : ''
  ].filter(Boolean);
  env.Path = dedupePath([
    ...codexPathHints,
    sourceEnv.Path,
    sourceEnv.PATH
  ].filter(Boolean).join(path.delimiter));
  const codexBinary = [
    appData ? path.join(appData, 'npm', 'codex.cmd') : '',
    localAppData ? path.join(localAppData, 'OpenAI', 'Codex', 'bin', 'codex.exe') : ''
  ].find((candidate) => candidate && fs.existsSync(candidate));
  if (codexBinary && !env.CODEXMOBILE_CODEX_BINARY) {
    env.CODEXMOBILE_CODEX_BINARY = codexBinary;
  }
  return env;
}

export function loadDotEnv(root, targetEnv = process.env) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || targetEnv[match[1]] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    targetEnv[match[1]] = value;
  }
}

export function readSupervisorState(statePath, { fsRef = fs } = {}) {
  if (!statePath || !fsRef.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fsRef.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

export function rotateLogFileIfNeeded(logPath, {
  maxBytes = 5 * 1024 * 1024,
  keep = 3,
  fsRef = fs
} = {}) {
  if (!logPath || !fsRef.existsSync(logPath)) {
    return false;
  }
  const size = fsRef.statSync(logPath).size;
  if (!Number.isFinite(size) || size <= maxBytes) {
    return false;
  }
  for (let index = keep; index >= 1; index -= 1) {
    const current = `${logPath}.${index}`;
    const next = `${logPath}.${index + 1}`;
    if (!fsRef.existsSync(current)) {
      continue;
    }
    if (index >= keep) {
      fsRef.rmSync(current, { force: true });
    } else {
      fsRef.renameSync(current, next);
    }
  }
  fsRef.renameSync(logPath, `${logPath}.1`);
  fsRef.writeFileSync(logPath, '', 'utf8');
  return true;
}

export function rotateLogFiles(logPaths = [], options = {}) {
  return logPaths
    .map((logPath) => ({ logPath, rotated: rotateLogFileIfNeeded(logPath, options) }))
    .filter((item) => item.rotated);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readServerHealth({ port = 3321, signal } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/status`, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.connected) {
    const error = new Error(`health-check-failed status=${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { ok: true, status: response.status, body };
}

export async function waitForServerHealthy({
  timeoutMs,
  intervalMs = 1000,
  readHealth = readServerHealth,
  sleep: sleepFn = sleep,
  now = () => Date.now()
} = {}) {
  const startedAt = now();
  let attempts = 0;
  let lastError = null;
  while (now() - startedAt < timeoutMs) {
    attempts += 1;
    try {
      const health = await readHealth();
      return { ready: true, attempts, health };
    } catch (error) {
      lastError = error;
    }
    await sleepFn(intervalMs);
  }
  return { ready: false, attempts, lastError };
}

export function serverMemoryArgs({ maxOldSpaceMb } = {}) {
  const value = Number(maxOldSpaceMb || process.env.CODEXMOBILE_MAX_OLD_SPACE_MB || 1536);
  return Number.isFinite(value) && value > 0 ? [`--max-old-space-size=${Math.floor(value)}`] : [];
}

export function childMemoryLimitExceeded({
  workingSetBytes,
  limitMb
} = {}) {
  const bytes = Number(workingSetBytes);
  const limit = Number(limitMb);
  return Number.isFinite(bytes) && Number.isFinite(limit) && limit > 0 && bytes > limit * 1024 * 1024;
}

export function processWorkingSetBytes(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return null;
  }
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${numericPid}").WorkingSetSize`
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    const value = Number(String(result.stdout || '').trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return null;
}

export function nextRestartDelayMs(attempt) {
  const retry = Math.max(0, Number(attempt) || 0);
  return Math.min(1000 * (2 ** retry), 10_000);
}

export function shouldRestartServer({ exitCode, signal, stopping, supervise } = {}) {
  if (!supervise || stopping) {
    return false;
  }
  if (signal) {
    return true;
  }
  return Number(exitCode) !== 0;
}

export function spawnServerProcess({
  root,
  outFd = 'inherit',
  errFd = 'inherit',
  detached = false,
  windowsHide = true,
  env = buildChildEnv(),
  serverArgs = []
} = {}) {
  return spawn(process.execPath, [...serverMemoryArgs(), ...serverArgs], {
    cwd: root,
    detached,
    stdio: ['ignore', outFd, errFd],
    windowsHide,
    env
  });
}

export function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function listenerPidsForPort(port) {
  if (process.platform === 'win32') {
    const command = [
      '$ErrorActionPreference = "SilentlyContinue";',
      `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq ${Number(port)} } |`,
      'Select-Object -ExpandProperty OwningProcess -Unique'
    ].join(' ');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true
    });
    if (result.status !== 0 && !result.stdout) {
      return [];
    }
    return String(result.stdout || '')
      .split(/\s+/)
      .map((item) => Number(item))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  }

  const result = spawnSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  });
  if (result.status !== 0 && !result.stdout) {
    return [];
  }
  return String(result.stdout || '')
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

export function commandForPid(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    return result.status === 0 ? String(result.stdout || '').trim() : '';
  }

  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8'
  });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

export function listNodeProcesses() {
  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.Name -match "node" } | Select-Object ProcessId,CommandLine,ExecutablePath | ConvertTo-Json -Compress'
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    if (result.status !== 0 || !String(result.stdout || '').trim()) {
      return [];
    }
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      pid: Number(item.ProcessId),
      command: String(item.CommandLine || ''),
      cwd: ''
    }));
  }
  return [];
}

export function runningSupervisorPids({
  root,
  currentPid = process.pid,
  listProcesses: listProcessesFn = listNodeProcesses
} = {}) {
  const normalizedRoot = String(root || '').toLowerCase();
  return listProcessesFn()
    .filter((item) => {
      const pid = Number(item.pid);
      const command = String(item.command || '');
      const cwd = String(item.cwd || '').toLowerCase();
      if (!Number.isInteger(pid) || pid <= 0 || pid === currentPid) {
        return false;
      }
      if (!command.includes('scripts/run-server.mjs')) {
        return false;
      }
      return !normalizedRoot || !cwd || cwd === normalizedRoot || command.includes(root);
    })
    .map((item) => Number(item.pid));
}

export function pidsFromSupervisorState({
  state,
  currentPid = process.pid,
  commandForPid: commandForPidFn = commandForPid
} = {}) {
  const pidValues = [state?.pid, state?.childPid]
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== currentPid);
  const supervisorPid = pidValues.find((pid) => commandForPidFn(pid).includes('scripts/run-server.mjs'));
  if (!supervisorPid) {
    return [];
  }
  return [...new Set(pidValues)];
}

export async function stopSupervisorFromState({
  root,
  statePath,
  log = () => {}
} = {}) {
  const runningPids = runningSupervisorPids({ root });
  for (const pid of runningPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  if (!statePath || !fs.existsSync(statePath)) {
    return runningPids;
  }
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return runningPids;
  }
  const pids = [...new Set([...runningPids, ...pidsFromSupervisorState({ state })])];
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (pids.every((pid) => !pidIsAlive(pid))) {
      log(`Stopped existing CodexMobile supervisor from state: ${pids.join(', ')}`);
      return pids;
    }
    await sleep(100);
  }
  for (const pid of pids) {
    if (pidIsAlive(pid)) {
      process.kill(pid, 'SIGKILL');
    }
  }
  log(`Force-stopped existing CodexMobile supervisor from state: ${pids.join(', ')}`);
  return pids;
}

export async function stopExistingCodexMobileServer({
  port,
  log = () => {}
} = {}) {
  const pids = listenerPidsForPort(port).filter((pid) => {
    const command = commandForPid(pid);
    return command.includes('server/index.js') || command.includes('scripts/run-server.mjs');
  });
  if (!pids.length) {
    return [];
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (pids.every((pid) => !pidIsAlive(pid))) {
      log(`Stopped existing CodexMobile server on port ${port}: ${pids.join(', ')}`);
      return pids;
    }
    await sleep(100);
  }
  for (const pid of pids) {
    if (pidIsAlive(pid)) {
      process.kill(pid, 'SIGKILL');
    }
  }
  log(`Force-stopped existing CodexMobile server on port ${port}: ${pids.join(', ')}`);
  return pids;
}
