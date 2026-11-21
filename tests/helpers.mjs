// 测试工具：在临时文件夹里起一个独立的服务实例
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { APP_ROOT } from '../server/config.js';

export async function tempDir(prefix = 'jz-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function startServer({ dataDir, roots, hooks } = {}) {
  const dir = dataDir || (await tempDir());
  const wsRoot = roots || [await tempDir('jz-ws-')];
  const config = { port: 0, host: '127.0.0.1', dataDir: dir, workspaceRoots: wsRoot, appRoot: APP_ROOT };
  const { handler, ready } = createApp(config, hooks);
  await ready;
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, body, headers = {}) {
    const opts = { method, headers: { ...headers } };
    if (method !== 'GET') {
      opts.headers['x-jz-request'] ??= '1';
      opts.headers['content-type'] ??= 'application/json';
      opts.body = JSON.stringify(body ?? {});
    }
    const res = await fetch(base + url, opts);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }

  return {
    base,
    dataDir: dir,
    roots: wsRoot,
    call,
    close: () => new Promise((r) => server.close(r)),
  };
}
