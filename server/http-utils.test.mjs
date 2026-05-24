/**
 * 测试 HTTP 通用工具：静态资源缓存策略与基础响应辅助逻辑。
 *
 * Keywords: http-utils, test, cache-control
 *
 * Exports: 无导出，内含用例。
 *
 * Inward: http-utils.js
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { staticCacheControl } from './http-utils.js';

test('staticCacheControl keeps mutable PWA entry resources uncached', () => {
  const clientDist = path.join('/tmp', 'codexmobile-dist');

  assert.equal(staticCacheControl('.webmanifest', path.join(clientDist, 'manifest.webmanifest')), 'no-store');
  assert.equal(staticCacheControl('.webmanifest', path.join(clientDist, 'assets', 'manifest-AbC_123.webmanifest')), 'no-store');
  assert.equal(staticCacheControl('.js', path.join(clientDist, 'codexmobile-sw.js')), 'no-store');
  assert.equal(staticCacheControl('.svg', path.join(clientDist, 'icon.svg')), 'no-store');
  assert.equal(staticCacheControl('.png', path.join(clientDist, 'apple-touch-icon.png')), 'no-store');
  assert.equal(staticCacheControl('.png', path.join(clientDist, 'codex-icon-180.png')), 'no-store');
});

test('staticCacheControl preserves immutable hashed assets', () => {
  assert.equal(
    staticCacheControl('.js', path.join('/tmp', 'codexmobile-dist', 'assets', 'index-a1b2c3.js')),
    'public, max-age=31536000, immutable'
  );
});
