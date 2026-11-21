// 读取配置：config.json（可选，不提交）→ 环境变量覆盖 → 默认值。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(overrides = {}) {
  let file = {};
  const configPath = path.join(APP_ROOT, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      throw new Error(`config.json 不是有效的 JSON：${e.message}`);
    }
  }
  const port = Number(process.env.JZ_PORT || overrides.port || file.port || 4520);
  const dataDir = path.resolve(APP_ROOT, process.env.JZ_DATA_DIR || overrides.dataDir || file.dataDir || 'data');
  const roots = (overrides.workspaceRoots || file.workspaceRoots || ['..']).map((r) => path.resolve(APP_ROOT, r));
  const dataRealish = path.resolve(dataDir);
  return {
    port,
    host: '127.0.0.1',
    dataDir: dataRealish,
    workspaceRoots: roots,
    appRoot: APP_ROOT,
  };
}
