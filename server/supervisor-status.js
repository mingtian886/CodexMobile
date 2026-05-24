/**
 * 读取 CodexMobile 监督进程状态并输出前端可展示的摘要。
 *
 * Keywords: supervisor, status, startup, server, state
 *
 * Exports:
 * - supervisorStatePath — 解析监督进程状态文件路径。
 * - readSupervisorPublicStatus — 读取并归一化公开状态摘要。
 *
 * Inward（本模块依赖/组装的关键符号）: Node fs/path、本地 .codexmobile 状态文件。
 *
 * Outward（谁在用/调用场景）: server index/health status 与 supervisor 状态测试。
 */
import fs from 'node:fs';
import path from 'node:path';

export function supervisorStatePath(rootDir) {
  const pathApi = /^[A-Za-z]:[\\/]/.test(String(rootDir || '')) || String(rootDir || '').includes('\\')
    ? path.win32
    : path;
  return pathApi.join(rootDir, '.codexmobile', 'state', 'server-supervisor.json');
}

export function readSupervisorPublicStatus({
  rootDir,
  fsRef = fs
} = {}) {
  const statePath = supervisorStatePath(rootDir || process.cwd());
  if (!fsRef.existsSync(statePath)) {
    return {
      statePath,
      running: false,
      pid: null,
      childPid: null,
      port: null,
      status: 'missing',
      restarts: null,
      lastFailure: null,
      updatedAt: null
    };
  }
  try {
    const state = JSON.parse(fsRef.readFileSync(statePath, 'utf8'));
    return {
      statePath,
      running: String(state.status || '') === 'healthy',
      pid: state.pid ?? null,
      childPid: state.childPid ?? null,
      port: state.port ?? null,
      status: state.status || 'unknown',
      restarts: state.restarts ?? null,
      lastFailure: state.lastFailure ?? null,
      updatedAt: state.updatedAt || null
    };
  } catch (error) {
    return {
      statePath,
      running: false,
      pid: null,
      childPid: null,
      port: null,
      status: 'unreadable',
      restarts: null,
      lastFailure: error.message,
      updatedAt: null
    };
  }
}
