// 本地数据存储：每个客户一个 JSON 文件，写入用“先写临时文件再改名”，同一客户的写入排队进行。
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const ID_RE = /^JZ-\d{4,6}$/;
const LOG_LIMIT = 300;

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function atomicWrite(file, text) {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, text, { encoding: 'utf8', flag: 'wx' });
  for (let i = 0; ; i++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (e) {
      // Windows 上文件被杀毒或索引短暂占用时会失败，稍等重试
      if ((e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES') && i < 6) {
        await sleep(50 * (i + 1));
        continue;
      }
      await fs.rm(tmp, { force: true });
      throw e;
    }
  }
}

export function newClientRecord(id, name, now) {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    status: 'active', // active 进行中 | delivered 已交付
    archivedAt: null,
    trashedAt: null,
    liveUrl: '',
    info: { contact: '', phone: '', address: '', email: '', fee: '' },
    outline: { text: '', updatedAt: null },
    accounts: null, // null = 还没编辑过，界面显示默认清单
    workspace: { folder: '', lastWrite: null, lastCheck: null, removed: null },
    delivery: {
      siteName: '',
      siteUrl: '',
      repoUrl: '',
      scope: '',
      customerKeeps: '',
      maintenanceMethod: '',
      warrantyDays: 30,
      platforms: [],
      firstDeliveredAt: null,
      deliveries: [],
      startCorrections: [],
    },
    maintenance: [],
    log: [],
  };
}

export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.clientsDir = path.join(dataDir, 'clients');
    this.backupsDir = path.join(dataDir, 'backups');
    this.metaFile = path.join(dataDir, 'meta.json');
    this.chains = new Map();
  }

  async init() {
    await fs.mkdir(this.clientsDir, { recursive: true });
    await fs.mkdir(this.backupsDir, { recursive: true });
    try {
      await fs.access(this.metaFile);
    } catch {
      await atomicWrite(this.metaFile, JSON.stringify({ nextNumber: 1 }, null, 2));
    }
  }

  // 同一个 key 的操作排队，避免两次自动保存互相覆盖
  serial(key, fn) {
    const prev = this.chains.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    const tail = next.catch(() => {}).finally(() => {
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    this.chains.set(key, tail);
    return next;
  }

  fileOf(id) {
    if (!ID_RE.test(id)) throw new HttpError(404, '没有这个客户编号');
    return path.join(this.clientsDir, `${id}.json`);
  }

  async read(id) {
    const file = this.fileOf(id);
    let text;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') throw new HttpError(404, '没有这个客户编号');
      throw e;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(500, `客户文件 ${id}.json 损坏，没有改动它。可以用同目录的 ${id}.json.bak 恢复。`);
    }
  }

  async list() {
    const names = await fs.readdir(this.clientsDir);
    const out = [];
    for (const n of names) {
      const m = /^(JZ-\d{4,6})\.json$/.exec(n);
      if (!m) continue;
      try {
        out.push(await this.read(m[1]));
      } catch (e) {
        out.push({ id: m[1], name: '（文件损坏）', broken: true, error: e.message });
      }
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  async create(name, now) {
    return this.serial('meta', async () => {
      const meta = JSON.parse(await fs.readFile(this.metaFile, 'utf8'));
      let n = meta.nextNumber || 1;
      // 防止 meta 被手动改小后撞号
      while (true) {
        const id = `JZ-${String(n).padStart(4, '0')}`;
        try {
          await fs.access(this.fileOf(id));
          n++;
        } catch {
          break;
        }
      }
      const id = `JZ-${String(n).padStart(4, '0')}`;
      const rec = newClientRecord(id, name, now);
      rec.log.push({ at: now, action: '新建客户记录' });
      await fs.writeFile(this.fileOf(id), JSON.stringify(rec, null, 2), { encoding: 'utf8', flag: 'wx' });
      meta.nextNumber = n + 1;
      await atomicWrite(this.metaFile, JSON.stringify(meta, null, 2));
      return rec;
    });
  }

  /**
   * 读出→修改→写回。fn 可以返回任意值作为结果。
   * opts.allowInactive：归档或回收站里的记录默认只读，恢复类操作才放行。
   */
  async update(id, fn, opts = {}) {
    const file = this.fileOf(id);
    return this.serial(id, async () => {
      const rec = await this.read(id);
      if (!opts.allowInactive) {
        if (rec.trashedAt) throw new HttpError(409, '这个客户在回收站里，先恢复再修改。');
        if (rec.archivedAt) throw new HttpError(409, '这个客户已归档，先恢复再修改。');
      }
      const result = await fn(rec);
      const now = opts.now || new Date().toISOString();
      rec.updatedAt = now;
      if (opts.log) {
        const last = rec.log[rec.log.length - 1];
        // 自动保存时同一件事 10 分钟内只记一条
        if (opts.coalesce && last && last.action === opts.log && Date.parse(now) - Date.parse(last.at) < 10 * 60 * 1000) {
          last.at = now;
        } else {
          rec.log.push({ at: now, action: opts.log });
        }
        if (rec.log.length > LOG_LIMIT) rec.log.splice(0, rec.log.length - LOG_LIMIT);
      }
      // 留一份上一版，文件意外损坏时可以手动恢复
      try {
        await fs.copyFile(file, `${file}.bak`);
      } catch {
        /* 第一次写入时没有旧文件 */
      }
      await atomicWrite(file, JSON.stringify(rec, null, 2));
      return result === undefined ? rec : result;
    });
  }
}
