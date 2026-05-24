/**
 * React 应用挂载入口：按路由动态加载主应用、文件预览或截图演示。
 *
 * Keywords: entry, React, createRoot, dynamic-import, preview-route
 *
 * Exports:
 * - 无 default；顶层执行 createRoot 挂载。
 *
 * Inward: App.jsx、FilePreviewApp、DemoScreenshotApp、全局样式。
 *
 * Outward: Vite HTML 入口 `index.html` 所引脚本。
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

const routeLoaders = {
  '/preview/file': () => import('./app/FilePreviewApp.jsx'),
  '/demo/screenshots': () => import('./demo/DemoScreenshotApp.jsx')
};

const rootNode = document.getElementById('root');

if (!rootNode) {
  throw new Error('Root element not found');
}

const root = createRoot(rootNode);

async function bootstrap() {
  const loader = routeLoaders[window.location.pathname] || (() => import('./App.jsx'));
  const { default: RootApp } = await loader();

  root.render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>
  );
}

void bootstrap().catch((error) => {
  console.error('Failed to bootstrap CodexMobile', error);
  root.render(
    <div style={{ alignItems: 'center', color: 'inherit', display: 'flex', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      启动失败，请刷新重试。
    </div>
  );
});
