// 工作环境文件：检查目标文件夹、列出将要生成的文件、安全写入。
// 不启动程序、不安装依赖、不运行 Git；只写建站助手管理的几个文档。
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError, atomicWrite } from './store.js';

const isWin = process.platform === 'win32';
const norm = (p) => {
  const r = path.resolve(p);
  return isWin ? r.toLowerCase() : r;
};

export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function within(child, parent) {
  const c = norm(child);
  const p = norm(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

async function realRoots(roots) {
  const out = [];
  for (const r of roots) {
    try {
      out.push(await fs.realpath(r));
    } catch {
      /* 不存在的根目录忽略 */
    }
  }
  return out;
}

/** 校验用户选的项目文件夹：绝对路径、存在、是普通文件夹、不是链接、在允许的范围里 */
export async function resolveFolder(input, roots, excludes = []) {
  if (typeof input !== 'string' || input.trim() === '') throw new HttpError(400, '请先选择项目文件夹。');
  if (input.length > 1000) throw new HttpError(400, '路径太长。');
  const raw = input.trim();
  if (!path.isAbsolute(raw)) throw new HttpError(400, '请填写完整路径（从盘符开始，例如 C:\\...）。');
  if (raw.includes('\0')) throw new HttpError(400, '路径里有非法字符。');
  const abs = path.resolve(raw);
  let st;
  try {
    st = await fs.lstat(abs);
  } catch {
    throw new HttpError(400, '这个文件夹不存在。建站助手不会新建项目文件夹，请先在电脑上建好。');
  }
  if (st.isSymbolicLink()) throw new HttpError(400, '这是一个文件夹链接（快捷方式或联接点），为安全起见不往里写。请选真实的文件夹。');
  if (!st.isDirectory()) throw new HttpError(400, '选的不是文件夹。');
  const real = await fs.realpath(abs);
  if (norm(real) !== norm(abs)) throw new HttpError(400, '路径中经过了文件夹链接，为安全起见不往里写。请选真实路径。');
  const rr = await realRoots(roots);
  if (!rr.some((r) => within(real, r))) {
    throw new HttpError(400, `只能选允许范围里的文件夹：${rr.join('；') || '（没有配置）'}。要改范围，请编辑 config.json 的 workspaceRoots。`);
  }
  for (const ex of excludes) {
    if (within(real, ex) || within(ex, real)) throw new HttpError(400, '不能选建站助手自己的文件夹（或包含它的上级文件夹），请选客户的项目文件夹。');
  }
  return real;
}

const BAD_NAME = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** 检查新文件夹名：不能带路径符号和 Windows 不允许的字符 */
export function checkFolderName(name) {
  const n = String(name || '').trim();
  if (!n) throw new HttpError(400, '请填写文件夹名。');
  if (n.length > 80) throw new HttpError(400, '文件夹名太长（最多 80 个字）。');
  if (BAD_NAME.test(n) || n === '.' || n === '..' || RESERVED.test(n) || /[. ]$/.test(n)) {
    throw new HttpError(400, '文件夹名里不能有 \\ / : * ? " < > | 这些符号，也不能以点或空格结尾。');
  }
  return n;
}

/** 在允许范围内的上级文件夹里新建一个空文件夹；已存在就报错，不会覆盖 */
export async function createProjectFolder(parentInput, name, roots, excludes = []) {
  const parent = await resolveFolder(parentInput, roots, []);
  for (const ex of excludes) {
    if (within(parent, ex)) throw new HttpError(400, '不能建在建站助手自己的文件夹里。');
  }
  const n = checkFolderName(name);
  const target = path.join(parent, n);
  try {
    await fs.mkdir(target);
  } catch (e) {
    if (e.code === 'EEXIST') throw new HttpError(409, `“${n}”已经存在。换个名字，或者用“已有文件夹”选它。`);
    throw new HttpError(500, `建文件夹失败：${e.code || e.message}`);
  }
  return target;
}

/** 删除前检查：文件夹必须在允许范围里面（不能是范围本身），不能是建站助手自己 */
export async function resolveDeletableFolder(input, roots, excludes = []) {
  const real = await resolveFolder(input, roots, excludes);
  const rr = await realRoots(roots);
  if (rr.some((r) => norm(r) === norm(real))) throw new HttpError(400, '不能删除允许范围的根文件夹本身。');
  return real;
}

/** 检查一个目标文件的现状 */
async function inspectTarget(folder, rel) {
  const parts = rel.split('/');
  // 逐级检查父文件夹不是链接
  let cur = folder;
  for (const p of parts.slice(0, -1)) {
    cur = path.join(cur, p);
    try {
      const st = await fs.lstat(cur);
      if (st.isSymbolicLink() || !st.isDirectory()) return { state: 'blocked', reason: `${p} 不是普通文件夹（可能是链接或文件）` };
    } catch {
      return { state: 'new', missingDir: true };
    }
  }
  const target = path.join(folder, ...parts);
  let st;
  try {
    st = await fs.lstat(target);
  } catch {
    return { state: 'new' };
  }
  if (st.isSymbolicLink()) return { state: 'blocked', reason: '同名的是一个链接，不往里写' };
  if (!st.isFile()) return { state: 'blocked', reason: '同名的不是普通文件' };
  const buf = await fs.readFile(target);
  return { state: 'exists', hash: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
}

function datedName(rel, dateStr, n) {
  const ext = path.posix.extname(rel);
  const base = rel.slice(0, rel.length - ext.length);
  return `${base}-${dateStr}${n > 1 ? `-${n}` : ''}${ext}`;
}

async function freeVersionName(folder, rel, dateStr) {
  for (let n = 1; n < 100; n++) {
    const cand = datedName(rel, dateStr, n);
    try {
      await fs.lstat(path.join(folder, ...cand.split('/')));
    } catch {
      return cand;
    }
  }
  throw new HttpError(409, '同名新版本太多，请先整理文件夹。');
}

/** 列出将生成的文件和每个文件的状态 */
export async function planFiles(folder, docs) {
  const files = [];
  for (const d of docs) {
    const info = await inspectTarget(folder, d.rel);
    const newHash = sha256(d.content);
    let status;
    if (info.state === 'new') status = 'new';
    else if (info.state === 'blocked') status = 'blocked';
    else status = info.hash === newHash ? 'same' : 'conflict';
    files.push({
      key: d.key,
      rel: d.rel,
      title: d.title,
      status,
      reason: info.reason || '',
      existingHash: info.hash || null,
      size: Buffer.byteLength(d.content, 'utf8'),
    });
  }
  return files;
}

async function ensureDirChain(folder, rel) {
  const parts = rel.split('/').slice(0, -1);
  let cur = folder;
  for (const p of parts) {
    cur = path.join(cur, p);
    try {
      await fs.mkdir(cur);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const st = await fs.lstat(cur);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new HttpError(409, `${p} 不是普通文件夹，没有写入。`);
  }
}

/**
 * 按用户的选择写入。choices: { [key]: 'write' | 'overwrite' | 'newVersion' | 'skip' }
 * expected: { [key]: existingHash }（检查时看到的旧文件指纹，写入前再核对一次）
 * backupDir：覆盖前把旧内容存一份到这里
 */
export async function writeFiles({ folder, docs, choices, expected, backupDir, dateStr }) {
  const results = [];
  for (const d of docs) {
    const choice = choices[d.key] || 'skip';
    const rel = d.rel;
    try {
      if (choice === 'skip') {
        results.push({ rel, outcome: 'skipped', detail: '按你的选择跳过' });
        continue;
      }
      const info = await inspectTarget(folder, rel);
      if (info.state === 'blocked') {
        results.push({ rel, outcome: 'failed', detail: `没有写入：${info.reason}` });
        continue;
      }
      const newHash = sha256(d.content);
      if (info.state === 'exists' && info.hash === newHash) {
        results.push({ rel, outcome: 'unchanged', detail: '内容一样，不需要改' });
        continue;
      }
      if (info.state === 'new') {
        await ensureDirChain(folder, rel);
        await fs.writeFile(path.join(folder, ...rel.split('/')), d.content, { encoding: 'utf8', flag: 'wx' });
        results.push({ rel, outcome: 'created', detail: '新建' });
        continue;
      }
      // 已有不同内容
      if (choice === 'write') {
        results.push({ rel, outcome: 'conflict', detail: '已有同名但内容不同的文件，没有写入。请选择覆盖、另存新版本或跳过。' });
        continue;
      }
      if (expected[d.key] !== info.hash) {
        results.push({ rel, outcome: 'conflict', detail: '检查之后这个文件又被改过，没有写入。请重新检查。' });
        continue;
      }
      if (choice === 'newVersion') {
        const alt = await freeVersionName(folder, rel, dateStr);
        await fs.writeFile(path.join(folder, ...alt.split('/')), d.content, { encoding: 'utf8', flag: 'wx' });
        results.push({ rel, outcome: 'savedAs', detail: `原文件没动，新版本另存为 ${alt}`, savedAs: alt });
        continue;
      }
      if (choice === 'overwrite') {
        const target = path.join(folder, ...rel.split('/'));
        const old = await fs.readFile(target);
        const bdir = path.join(backupDir, ...path.posix.dirname(rel).split('/').filter((x) => x && x !== '.'));
        await fs.mkdir(bdir, { recursive: true });
        const bfile = path.join(bdir, path.posix.basename(rel));
        await fs.writeFile(bfile, old);
        await atomicWrite(target, d.content);
        results.push({ rel, outcome: 'overwritten', detail: `已覆盖，旧内容备份在 ${bfile}` });
        continue;
      }
      results.push({ rel, outcome: 'failed', detail: '不认识的选择' });
    } catch (e) {
      if (e.code === 'EEXIST') results.push({ rel, outcome: 'conflict', detail: '写入时发现同名文件刚刚出现，没有覆盖。请重新检查。' });
      else results.push({ rel, outcome: 'failed', detail: e instanceof HttpError ? e.message : `写入失败：${e.code || e.message}` });
    }
  }
  return results;
}

/** 目录浏览（只列允许范围内的普通子文件夹） */
export async function listDirs(input, roots, excludes = []) {
  const rr = await realRoots(roots);
  if (!input) return { path: null, parent: null, roots: rr, dirs: rr.map((r) => ({ name: r, path: r })) };
  let real;
  try {
    real = await resolveFolder(input, roots, excludes);
  } catch (e) {
    // 根目录本身包含建站助手时，仍允许浏览，只是不能选
    if (!rr.some((r) => norm(r) === norm(path.resolve(input)))) throw e;
    real = rr.find((r) => norm(r) === norm(path.resolve(input)));
  }
  const entries = await fs.readdir(real, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => ({ name: e.name, path: path.join(real, e.name) }))
    .filter((d) => !excludes.some((ex) => within(d.path, ex)))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const parentPath = path.dirname(real);
  const parent = rr.some((r) => within(parentPath, r)) && norm(parentPath) !== norm(real) ? parentPath : null;
  return { path: real, parent, roots: rr, dirs };
}
