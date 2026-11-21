// HTTP 服务：本机网页界面 + JSON 接口。只监听 127.0.0.1。
import fs from 'node:fs/promises';
import path from 'node:path';
import { Store, HttpError } from './store.js';
import { checkObject, isRealDate, URL_RE } from './validate.js';
import { workspaceDocs, readRulesTemplate, writeRulesTemplate, DEFAULT_RULES } from './docs.js';
import { resolveFolder, planFiles, writeFiles, listDirs, createProjectFolder, resolveDeletableFolder } from './workspace.js';
import { checkRepo, moveToRecycleBin, removeRegenerable, cloneRepo } from './git.js';

const BODY_LIMIT = 1024 * 1024;

export const MAINT_CATEGORIES = ['缺陷修复', '新需求', '账号或密码相关协助', '其他'];
export const MAINT_STATUSES = ['待处理', '处理中', '已完成', '不处理'];

// 第 2 步：域名和固定的账号清单。都不强制，只记账号名，不记密码；填了的才写进报告和建站规则。
export const ENV_KEYS = ['domain', 'domainPrice', 'gmail', 'github', 'repo', 'vercel', 'registrar', 'resend', 'supabase'];
const ENV_FIELDS = {
  domain: { type: 'string', max: 253, optional: true },
  domainPrice: { type: 'string', max: 20, optional: true },
  gmail: { type: 'string', max: 200, optional: true },
  github: { type: 'string', max: 100, optional: true },
  repo: { type: 'string', max: 500, pattern: URL_RE, optional: true },
  vercel: { type: 'string', max: 200, optional: true },
  registrar: { type: 'string', max: 200, optional: true },
  resend: { type: 'string', max: 200, optional: true },
  supabase: { type: 'string', max: 200, optional: true },
};

export function envOf(rec) {
  return { ...Object.fromEntries(ENV_KEYS.map((k) => [k, ''])), ...(rec.env || {}) };
}

const INFO_FIELDS = {
  contact: { type: 'string', max: 100, optional: true },
  phone: { type: 'string', max: 100, optional: true },
  address: { type: 'string', max: 500, optional: true },
  email: { type: 'string', max: 200, optional: true },
  fee: { type: 'string', max: 500, optional: true },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function warrantyEnd(delivery) {
  if (!delivery.firstDeliveredAt) return null;
  return addDays(delivery.firstDeliveredAt, delivery.warrantyDays || 0);
}

function infoOf(rec) {
  return { contact: '', phone: '', address: '', email: '', fee: '', ...(rec.info || {}) };
}

function wsOf(rec) {
  return { folder: '', lastWrite: null, lastCheck: null, removed: null, ...(rec.workspace || {}) };
}

function summary(rec) {
  if (rec.broken) return rec;
  const info = infoOf(rec);
  return {
    id: rec.id,
    name: rec.name,
    contact: info.contact,
    phone: info.phone,
    status: rec.status,
    liveUrl: rec.liveUrl,
    archivedAt: rec.archivedAt,
    trashedAt: rec.trashedAt,
    updatedAt: rec.updatedAt,
  };
}

function full(rec) {
  return {
    id: rec.id,
    name: rec.name,
    status: rec.status,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    trashedAt: rec.trashedAt,
    liveUrl: rec.liveUrl,
    info: infoOf(rec),
    env: envOf(rec),
    workspace: wsOf(rec),
    delivery: rec.delivery,
    maintenance: rec.maintenance,
    log: rec.log,
    computed: { warrantyEnd: warrantyEnd(rec.delivery) },
  };
}

async function readJson(req) {
  const ct = String(req.headers['content-type'] || '');
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > BODY_LIMIT) throw new HttpError(413, '提交的内容太大。');
    chunks.push(c);
  }
  if (size === 0) return {};
  if (!ct.toLowerCase().startsWith('application/json')) throw new HttpError(415, '只接受 JSON。');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '提交的内容不是有效的 JSON。');
  }
}

function sendJson(res, status, obj) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function localDate(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${localDate(now)}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * config: { dataDir, workspaceRoots, appRoot }
 * hooks（测试用）：{ trash(folder) } 代替“移到回收站”
 */
export function createApp(config, hooks = {}) {
  const store = new Store(config.dataDir);
  const ready = store.init();
  const publicDir = path.join(config.appRoot, 'public');
  const sharedDir = path.join(config.appRoot, 'shared');
  const excludes = [config.appRoot];
  const trash = hooks.trash || moveToRecycleBin;

  async function serveStatic(req, res, pathname) {
    let base;
    let rel;
    if (pathname === '/' || pathname === '/index.html') {
      base = publicDir;
      rel = 'index.html';
    } else if (pathname.startsWith('/shared/')) {
      base = sharedDir;
      rel = pathname.slice('/shared/'.length);
    } else {
      base = publicDir;
      rel = pathname.slice(1);
    }
    if (!/^[A-Za-z0-9_\-./]+$/.test(rel) || rel.includes('..')) return false;
    const file = path.resolve(base, rel);
    if (!file.startsWith(base + path.sep)) return false;
    const ext = path.extname(file);
    if (!MIME[ext]) return false;
    let buf;
    try {
      buf = await fs.readFile(file);
    } catch {
      return false;
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
    return true;
  }

  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern}$`), fn });
  const ID = '(JZ-\\d{4,6})';

  // ---- 配置、规则模板、目录浏览 ----
  route('GET', '/api/config', async () => ({
    dataDir: config.dataDir,
    workspaceRoots: config.workspaceRoots,
    maintCategories: MAINT_CATEGORIES,
    maintStatuses: MAINT_STATUSES,
    today: localDate(),
    platform: process.platform,
  }));
  route('GET', '/api/fs/list', async ({ url }) => listDirs(url.searchParams.get('path') || '', config.workspaceRoots, excludes));
  route('GET', '/api/rules-template', async () => ({ ...(await readRulesTemplate(config.dataDir)), defaultText: DEFAULT_RULES }));
  route('PUT', '/api/rules-template', async ({ body }) => {
    const b = checkObject(body, { text: { type: 'string', max: 50000 } }, '规则模板');
    if (!b.text.trim()) throw new HttpError(400, '规则模板不能是空的。');
    await writeRulesTemplate(config.dataDir, b.text);
    return { ...(await readRulesTemplate(config.dataDir)), defaultText: DEFAULT_RULES };
  });

  // ---- 客户记录 ----
  route('GET', '/api/clients', async ({ url }) => {
    const view = url.searchParams.get('view') || 'active';
    const all = await store.list();
    const filtered = all.filter((r) => {
      if (r.broken) return view === 'active';
      if (view === 'trash') return !!r.trashedAt;
      if (view === 'archived') return !r.trashedAt && !!r.archivedAt;
      return !r.trashedAt && !r.archivedAt;
    });
    const counts = {
      active: all.filter((r) => !r.broken && !r.trashedAt && !r.archivedAt).length,
      archived: all.filter((r) => !r.broken && !r.trashedAt && r.archivedAt).length,
      trash: all.filter((r) => !r.broken && r.trashedAt).length,
    };
    return { clients: filtered.map(summary), counts };
  });

  route('POST', '/api/clients', async ({ body }) => {
    const b = checkObject(body, { name: { type: 'string', max: 100 } });
    const name = b.name.trim();
    if (!name) throw new HttpError(400, '请填写客户或网站名称。');
    return full(await store.create(name, new Date().toISOString()));
  });

  route('GET', `/api/clients/${ID}`, async ({ m }) => full(await store.read(m[1])));

  route('PATCH', `/api/clients/${ID}`, async ({ m, body }) => {
    const b = checkObject(body, {
      name: { type: 'string', max: 100, optional: true },
      liveUrl: { type: 'string', max: 500, pattern: URL_RE, optional: true },
    });
    if (b.name !== undefined && !b.name.trim()) throw new HttpError(400, '名称不能为空。');
    return full(await store.update(m[1], (r) => {
      if (b.name !== undefined) r.name = b.name.trim();
      if (b.liveUrl !== undefined) r.liveUrl = b.liveUrl.trim();
    }, { log: '修改名称或网址', coalesce: true }));
  });

  const lifecycle = (action, fn, log) =>
    route('POST', `/api/clients/${ID}/${action}`, async ({ m }) => full(await store.update(m[1], fn, { allowInactive: true, log })));
  lifecycle('archive', (r) => {
    if (r.trashedAt) throw new HttpError(409, '回收站里的记录不能归档，先恢复。');
    if (!r.archivedAt) r.archivedAt = new Date().toISOString();
  }, '归档');
  lifecycle('unarchive', (r) => {
    if (r.trashedAt) throw new HttpError(409, '先从回收站恢复。');
    r.archivedAt = null;
  }, '从归档恢复');
  lifecycle('trash', (r) => {
    if (!r.trashedAt) r.trashedAt = new Date().toISOString();
  }, '移到回收站');
  lifecycle('restore', (r) => {
    r.trashedAt = null;
  }, '从回收站恢复');

  // ---- 第 1 步：客户信息 ----
  route('PUT', `/api/clients/${ID}/info`, async ({ m, body }) => {
    const b = checkObject(body, INFO_FIELDS, '客户信息');
    return full(await store.update(m[1], (r) => {
      r.info = infoOf(r);
      for (const [k, v] of Object.entries(b)) r.info[k] = v.trim();
    }, { log: '修改客户信息', coalesce: true }));
  });

  // ---- 第 2 步：账号与准备（域名 + 固定账号清单）----
  route('PUT', `/api/clients/${ID}/env`, async ({ m, body }) => {
    const b = checkObject(body, ENV_FIELDS, '账号与准备');
    if (b.domainPrice && !/^\$?\d{1,6}(\.\d{1,2})?$/.test(b.domainPrice.trim())) throw new HttpError(400, '域名价格只填数字，例如 12.99。');
    return full(await store.update(m[1], (r) => {
      r.env = envOf(r);
      for (const [k, v] of Object.entries(b)) r.env[k] = k === 'domainPrice' ? v.trim().replace(/^\$/, '') : v.trim();
    }, { log: '修改账号与准备', coalesce: true }));
  });
  // ---- 旧版账号清单接口已停用（数据还留在文件里）----
  // ---- 第 3 步：工作环境 ----
  function setFolder(r, folder) {
    r.workspace = wsOf(r);
    if (r.workspace.folder !== folder) r.workspace.lastCheck = null;
    r.workspace.folder = folder;
  }

  function writeRecord(now, folder, results) {
    return { at: now.toISOString(), folder, results: results.map(({ rel, outcome, savedAs }) => ({ rel, outcome, savedAs: savedAs || null })) };
  }

  // 新建项目文件夹，并写入建站规则
  route('POST', `/api/clients/${ID}/workspace/create`, async ({ m, body }) => {
    const b = checkObject(body, {
      parent: { type: 'string', max: 1000, allowSecret: true },
      name: { type: 'string', max: 80 },
    }, '新建文件夹');
    const rec = await store.read(m[1]);
    if (rec.trashedAt || rec.archivedAt) throw new HttpError(409, '归档或回收站里的客户不能建文件夹，先恢复。');
    const folder = await createProjectFolder(b.parent, b.name, config.workspaceRoots, excludes);
    const docs = await workspaceDocs(rec, config.dataDir);
    const now = new Date();
    const results = await writeFiles({
      folder,
      docs,
      choices: Object.fromEntries(docs.map((d) => [d.key, 'write'])),
      expected: {},
      backupDir: path.join(config.dataDir, 'backups', rec.id, stamp(now)),
      dateStr: localDate(now),
    });
    const updated = await store.update(m[1], (r) => {
      setFolder(r, folder);
      r.workspace.removed = null;
      r.workspace.lastWrite = writeRecord(now, folder, results);
    }, { log: `新建项目文件夹并写入规则：${path.basename(folder)}` });
    return { folder, results, record: full(updated) };
  });

  // 用已有文件夹：列出规则文件的现状
  route('POST', `/api/clients/${ID}/workspace/plan`, async ({ m, body }) => {
    const b = checkObject(body, { folder: { type: 'string', max: 1000, allowSecret: true } });
    const folder = await resolveFolder(b.folder, config.workspaceRoots, excludes);
    const rec = await store.update(m[1], (r) => setFolder(r, folder), { log: '选择项目文件夹', coalesce: true });
    const docs = await workspaceDocs(rec, config.dataDir);
    return { folder, files: await planFiles(folder, docs), record: full(rec) };
  });

  route('POST', `/api/clients/${ID}/workspace/write`, async ({ m, body }) => {
    const keys = ['rules'];
    const choiceRule = { type: 'string', enum: ['write', 'overwrite', 'newVersion', 'skip'], optional: true };
    const hashRule = { type: 'string', max: 64, pattern: /^[0-9a-f]{64}$/, optional: true, nullable: true };
    const b = checkObject(body, {
      folder: { type: 'string', max: 1000, allowSecret: true },
      choices: { type: 'object' },
      expected: { type: 'object', optional: true },
    });
    const choices = checkObject(b.choices, Object.fromEntries(keys.map((k) => [k, choiceRule])), '写入选择');
    const expected = checkObject(b.expected || {}, Object.fromEntries(keys.map((k) => [k, hashRule])), '文件指纹');
    const folder = await resolveFolder(b.folder, config.workspaceRoots, excludes);
    const rec = await store.read(m[1]);
    if (rec.trashedAt || rec.archivedAt) throw new HttpError(409, '归档或回收站里的客户不能写文件，先恢复。');
    const docs = await workspaceDocs(rec, config.dataDir);
    const now = new Date();
    const results = await writeFiles({
      folder, docs, choices, expected,
      backupDir: path.join(config.dataDir, 'backups', rec.id, stamp(now)),
      dateStr: localDate(now),
    });
    const updated = await store.update(m[1], (r) => {
      setFolder(r, folder);
      r.workspace.lastWrite = writeRecord(now, folder, results);
    }, { log: `写入建站规则（${results.filter((x) => ['created', 'overwritten', 'savedAs'].includes(x.outcome)).length} 个文件）` });
    return { results, record: full(updated) };
  });

  route('POST', `/api/clients/${ID}/workspace/unlink`, async ({ m, body }) => {
    checkObject(body, {});
    return full(await store.update(m[1], (r) => setFolder(r, ''), { log: '取消关联项目文件夹（文件夹本身没动）' }));
  });

  // ---- 第 4 步：上传检查和删除本地文件夹 ----
  route('POST', `/api/clients/${ID}/repo/check`, async ({ m, body }) => {
    checkObject(body, {});
    const rec = await store.read(m[1]);
    const ws = wsOf(rec);
    if (!ws.folder) throw new HttpError(409, '还没有关联项目文件夹，先在“工作环境”里选或新建。');
    const folder = await resolveFolder(ws.folder, config.workspaceRoots, excludes);
    const check = await checkRepo(folder);
    const updated = await store.update(m[1], (r) => {
      r.workspace = wsOf(r);
      r.workspace.lastCheck = { ...check, folder };
    }, { log: `检查 GitHub 上传：${check.ok ? '全部通过' : `${check.issues.length} 个问题`}`, allowInactive: true });
    return { check, record: full(updated) };
  });

  // 下载继续修改：把 GitHub 上的代码取到一个新的本地文件夹，并关联为项目文件夹
  route('POST', `/api/clients/${ID}/repo/clone`, async ({ m, body }) => {
    const b = checkObject(body, {
      parent: { type: 'string', max: 1000, allowSecret: true },
      name: { type: 'string', max: 80 },
      url: { type: 'string', max: 500 },
    }, '下载继续修改');
    const rec = await store.read(m[1]);
    if (rec.trashedAt || rec.archivedAt) throw new HttpError(409, '归档或回收站里的客户不能做这个操作，先恢复。');
    if (wsOf(rec).folder) throw new HttpError(409, '已经关联了本地项目文件夹，不用再下载。要换文件夹先在“工作环境”里点“换一个文件夹”。');
    const folder = await createProjectFolder(b.parent, b.name, config.workspaceRoots, excludes);
    let got;
    try {
      got = await cloneRepo(b.url, folder, { allowAnyRemote: !!hooks.allowAnyRemote });
    } catch (e) {
      // 下载失败：把刚建的空文件夹收回（git 可能已经删掉了它；里面有东西就不动）
      await fs.rmdir(folder).catch(() => {});
      throw e;
    }
    const now = new Date().toISOString();
    const updated = await store.update(m[1], (r) => {
      setFolder(r, folder);
      r.workspace.restored = { at: now, folder, remote: got.remote, head: got.head, branch: got.branch };
    }, { log: `从 GitHub 下载到本地继续修改：${path.basename(folder)}（提交 ${got.head}）` });
    return { folder, ...got, record: full(updated) };
  });

  route('POST', `/api/clients/${ID}/repo/remove`, async ({ m, body }) => {
    const b = checkObject(body, {
      confirmName: { type: 'string', max: 200, allowSecret: true },
      ackLocalOnly: { type: 'boolean', optional: true },
    }, '删除本地文件夹');
    const rec = await store.read(m[1]);
    if (rec.trashedAt || rec.archivedAt) throw new HttpError(409, '归档或回收站里的客户不能做这个操作，先恢复。');
    if (!rec.delivery || !rec.delivery.firstDeliveredAt) throw new HttpError(409, '还没有记录交付。确认交付之后才能删除本地文件夹。');
    const ws = wsOf(rec);
    if (!ws.folder) throw new HttpError(409, '没有关联的项目文件夹。');
    const folder = await resolveDeletableFolder(ws.folder, config.workspaceRoots, excludes);
    if (b.confirmName.trim() !== path.basename(folder)) throw new HttpError(400, `确认名称不对。请输入文件夹名：${path.basename(folder)}`);
    // 删除前当场再检查一次，不用旧结果
    const check = await checkRepo(folder);
    if (!check.ok) {
      await store.update(m[1], (r) => {
        r.workspace = wsOf(r);
        r.workspace.lastCheck = { ...check, folder };
      }, { log: '删除前检查没通过，没有删除' });
      throw new HttpError(409, `删除前检查没通过，没有删除：${check.issues[0]}`, { check });
    }
    if (check.localOnly.length && !b.ackLocalOnly) {
      throw new HttpError(409, `有 ${check.localOnly.length} 项只在本地，请先确认知道它们会被一起删除。`, { check });
    }
    await removeRegenerable(folder, check.regenerable);
    await trash(folder);
    let stillThere = true;
    try {
      await fs.lstat(folder);
    } catch {
      stillThere = false;
    }
    if (stillThere) throw new HttpError(500, '移到回收站后文件夹还在，请手动检查。');
    const now = new Date().toISOString();
    const updated = await store.update(m[1], (r) => {
      r.workspace = wsOf(r);
      r.workspace.removed = { at: now, folder, remote: check.remote, head: check.head, branch: check.branch, localOnly: check.localOnly };
      r.workspace.folder = '';
      r.workspace.lastCheck = { ...check, folder };
      if (check.remote && /^https:\/\//.test(check.remote) && !r.delivery.repoUrl) r.delivery.repoUrl = check.remote.replace(/\.git$/, '');
    }, { log: `本地文件夹已移到回收站：${path.basename(folder)}（提交 ${check.head}）` });
    return { removed: updated.workspace.removed, record: full(updated) };
  });

  // ---- 交付与维护 ----
  const platformItem = {
    name: { type: 'string', max: 100 },
    purpose: { type: 'string', max: 200 },
    cost: { type: 'string', max: 200 },
    sourceUrl: { type: 'string', max: 500, pattern: URL_RE },
    verifiedOn: { type: 'string', max: 10 },
  };

  route('PUT', `/api/clients/${ID}/delivery`, async ({ m, body }) => {
    const b = checkObject(body, {
      siteName: { type: 'string', max: 200, optional: true },
      siteUrl: { type: 'string', max: 500, pattern: URL_RE, optional: true },
      repoUrl: { type: 'string', max: 500, pattern: URL_RE, optional: true },
      scope: { type: 'string', max: 4000, optional: true },
      customerKeeps: { type: 'string', max: 4000, optional: true },
      maintenanceMethod: { type: 'string', max: 2000, optional: true },
      warrantyDays: { type: 'integer', min: 0, max: 3650, optional: true },
      platforms: { type: 'array', maxItems: 20, items: platformItem, optional: true },
      price: { type: 'string', max: 200, optional: true },
      paymentTerms: { type: 'string', max: 2000, optional: true },
      notIncluded: { type: 'string', max: 4000, optional: true },
      providerName: { type: 'string', max: 200, optional: true },
      clientSigner: { type: 'string', max: 200, optional: true },
    }, '交付信息');
    if (b.platforms) {
      for (const p of b.platforms) {
        if (p.verifiedOn && !isRealDate(p.verifiedOn)) throw new HttpError(400, '核实日期应为 年-月-日。');
      }
    }
    return full(await store.update(m[1], (r) => {
      for (const k of ['siteName', 'repoUrl', 'scope', 'customerKeeps', 'maintenanceMethod', 'warrantyDays', 'platforms', 'price', 'paymentTerms', 'notIncluded', 'providerName', 'clientSigner']) {
        if (b[k] !== undefined) r.delivery[k] = b[k];
      }
      if (b.siteUrl !== undefined) r.liveUrl = b.siteUrl.trim();
    }, { log: '修改交付信息', coalesce: true }));
  });

  route('POST', `/api/clients/${ID}/delivery/deliver`, async ({ m, body }) => {
    const b = checkObject(body, { date: { type: 'string', max: 10 }, note: { type: 'string', max: 1000, optional: true } }, '交付');
    if (!isRealDate(b.date)) throw new HttpError(400, '交付日期应为 年-月-日。');
    return full(await store.update(m[1], (r) => {
      const first = !r.delivery.firstDeliveredAt;
      if (first) r.delivery.firstDeliveredAt = b.date;
      r.delivery.deliveries.push({ date: b.date, note: (b.note || '').trim(), at: new Date().toISOString(), first });
      r.status = 'delivered';
    }, { log: '记录交付' }));
  });

  route('POST', `/api/clients/${ID}/delivery/reopen`, async ({ m, body }) => {
    checkObject(body, { reason: { type: 'string', max: 500, optional: true } });
    return full(await store.update(m[1], (r) => {
      r.status = 'active';
    }, { log: '重新打开（售后起算日不变）' }));
  });

  route('POST', `/api/clients/${ID}/delivery/correct-start`, async ({ m, body }) => {
    const b = checkObject(body, { date: { type: 'string', max: 10 }, reason: { type: 'string', max: 500 } }, '更正起算日');
    if (!isRealDate(b.date)) throw new HttpError(400, '日期应为 年-月-日。');
    if (!b.reason.trim()) throw new HttpError(400, '更正售后起算日必须写明原因。');
    return full(await store.update(m[1], (r) => {
      if (!r.delivery.firstDeliveredAt) throw new HttpError(409, '还没有交付记录，不需要更正。');
      r.delivery.startCorrections.push({ from: r.delivery.firstDeliveredAt, to: b.date, reason: b.reason.trim(), at: new Date().toISOString() });
      r.delivery.firstDeliveredAt = b.date;
    }, { log: '更正售后起算日' }));
  });

  route('POST', `/api/clients/${ID}/maintenance`, async ({ m, body }) => {
    const b = checkObject(body, {
      date: { type: 'string', max: 10 },
      category: { type: 'string', enum: MAINT_CATEGORIES },
      title: { type: 'string', max: 200 },
      detail: { type: 'string', max: 4000, optional: true },
      status: { type: 'string', enum: MAINT_STATUSES, optional: true },
    }, '维护请求');
    if (!isRealDate(b.date)) throw new HttpError(400, '日期应为 年-月-日。');
    if (!b.title.trim()) throw new HttpError(400, '请写一句话说明是什么事。');
    return full(await store.update(m[1], (r) => {
      const end = warrantyEnd(r.delivery);
      const n = r.maintenance.reduce((mx, x) => Math.max(mx, Number(String(x.id).slice(1)) || 0), 0) + 1;
      r.maintenance.unshift({
        id: `M${n}`,
        date: b.date,
        category: b.category,
        title: b.title.trim(),
        detail: (b.detail || '').trim(),
        status: b.status || '待处理',
        resolution: '',
        inWarranty: end ? (b.date <= end ? 'yes' : 'no') : 'unknown',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }, { log: '新增维护请求' }));
  });

  route('PATCH', `/api/clients/${ID}/maintenance/(M\\d+)`, async ({ m, body }) => {
    const b = checkObject(body, {
      status: { type: 'string', enum: MAINT_STATUSES, optional: true },
      resolution: { type: 'string', max: 2000, optional: true },
    }, '维护请求');
    return full(await store.update(m[1], (r) => {
      const it = r.maintenance.find((x) => x.id === m[2]);
      if (!it) throw new HttpError(404, '没有这条维护请求。');
      if (b.status !== undefined) it.status = b.status;
      if (b.resolution !== undefined) it.resolution = b.resolution.trim();
      it.updatedAt = new Date().toISOString();
    }, { log: '更新维护请求', coalesce: true }));
  });

  async function handler(req, res) {
    try {
      await ready;
      const port = req.socket.localPort;
      const host = String(req.headers.host || '');
      const okHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!okHosts.includes(host)) {
        res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('只接受本机访问。');
        return;
      }
      const url = new URL(req.url, `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith('/api/')) {
        if ((req.method === 'GET' || req.method === 'HEAD') && (await serveStatic(req, res, pathname))) return;
        res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('没有这个页面。');
        return;
      }
      const mutating = !['GET', 'HEAD'].includes(req.method);
      if (mutating) {
        // 防止其他网站借浏览器向本机接口提交（跨站请求）
        const origin = req.headers.origin;
        if (origin && !okHosts.map((h) => `http://${h}`).includes(origin)) throw new HttpError(403, '拒绝来自其他网站的请求。');
        if (req.headers['x-jz-request'] !== '1') throw new HttpError(403, '缺少请求标记。');
      }
      const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
      if (!r) throw new HttpError(404, '没有这个接口。');
      const m = r.re.exec(pathname);
      const body = mutating ? await readJson(req) : undefined;
      const out = await r.fn({ req, res, url, m, body });
      if (out !== undefined) sendJson(res, 200, out);
    } catch (e) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message, ...e.extra });
      else {
        console.error(e);
        sendJson(res, 500, { error: `出错了：${e.message}` });
      }
    }
  }

  return { handler, store, ready };
}
