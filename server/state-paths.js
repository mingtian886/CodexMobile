/**
 * 统一解析 CodexMobile 本地状态目录与状态文件路径。
 *
 * Keywords: state-paths, codexmobile-home, local-state
 *
 * Exports:
 * - CODEXMOBILE_STATE_DIR — 本地状态根目录。
 * - stateFilePath — 拼出状态文件绝对路径。
 *
 * Inward（本模块依赖/组装的关键符号）: Node path、process env。
 *
 * Outward（谁在用/调用场景）: auth、codex-data、session-local-state。
 *
 * 不负责: 文件读写。
 */
import path from 'node:path';

export const CODEXMOBILE_STATE_DIR = process.env.CODEXMOBILE_HOME || path.join(process.cwd(), '.codexmobile', 'state');

export function stateFilePath(fileName) {
  return path.join(CODEXMOBILE_STATE_DIR, fileName);
}
