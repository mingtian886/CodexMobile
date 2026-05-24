# CodexMobile 远端仓库与本地仓库对照

## 结论

远端仓库 `RNG2018-mlxg/CodexMobile` 当前 `main` 更像一个轻量基础版；本地 `CodexMobile-public` 是明显扩展后的 2.0 版。

## 远端仓库特征

- 版本号较早，`package.json` 体量小。
- 依赖集中在 `react`、`vite`、`ws`、`lucide-react`、`opencc-js`、`@openai/codex-sdk` 等基础能力。
- 脚本较少，主要是开发、构建、启动、ASR、smoke 测试。
- 顶层目录更收敛，主要是 `asr-service/`、`client/`、`scripts/`、`server/`、`skills/`、`docs/`。
- README 的定位偏向 iPhone-first PWA bridge，强调轻量接入本机 Codex。

## 本地仓库特征

- 版本号更高，功能面更宽。
- 依赖更多，覆盖 `mermaid`、`pdfjs-dist`、`react-markdown`、`web-push`、`xlsx`、`jszip` 等扩展能力。
- 目录层次更细，包含 `shared/`、`marketing/`、更完整的 `client/src` 分层和大量测试文件。
- README 已经覆盖桌面同步、Git、通知、安全、Feishu、语音、上传、设置等完整工作台能力。

## 如果要继续向远端对齐

- 先确认目标是“仅参考远端结构”，还是“真的回退到远端基础版”。
- 如果是前者，建议按模块挑选迁移点，不要直接覆盖本地主线。
- 如果是后者，需要同步处理 README、依赖、脚本、前后端目录和功能边界。
