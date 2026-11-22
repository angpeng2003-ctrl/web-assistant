// 交付后的上传检查和本地文件夹清理。
// 只用只读的 Git 命令（fetch / status / for-each-ref / ls-remote），不提交、不推送、不改仓库。
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './store.js';

const isWin = process.platform === 'win32';
const norm = (p) => (isWin ? path.resolve(p).toLowerCase() : path.resolve(p));

// 能重新生成的东西（装依赖、构建出来的），删除时直接删掉，不算“只在本地的文件”
const REGENERABLE = new Set([
  'node_modules', '.next', 'out', 'dist', 'build', '.turbo', '.cache', '.vercel', 'coverage', '.parcel-cache',
  'next-env.d.ts', 'tsconfig.tsbuildinfo', '.eslintcache', '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);

export function isRegenerable(entry) {
  const parts = entry.replace(/\/+$/, '').split('/');
  return parts.some((p) => REGENERABLE.has(p));
}

/** 去掉网址里可能带的账号密码 */
export function cleanRemote(url) {
  return String(url || '').trim().replace(/\/\/[^/@\s]+@/, '//');
}

export function runGit(cwd, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', ...args], {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', LC_ALL: 'C' },
    }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), missing: err && err.code === 'ENOENT' });
    });
  });
}

function firstLine(s) {
  return cleanRemote(String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '');
}

async function childRepos(folder) {
  const out = [];
  try {
    for (const e of await fs.readdir(folder, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
      try {
        await fs.access(path.join(folder, e.name, '.git'));
        out.push(e.name);
      } catch {
        /* 不是仓库 */
      }
    }
  } catch {
    /* 读不了就算了 */
  }
  return out;
}

/**
 * 检查本地文件夹是否已经全部上传到 GitHub。
 * 返回 { ok, checkedAt, remote, head, branch, passed[], issues[], notes[], localOnly[], regenerable[] }
 */
export async function checkRepo(folder) {
  const r = { ok: false, checkedAt: new Date().toISOString(), remote: '', head: '', branch: '', passed: [], issues: [], notes: [], localOnly: [], regenerable: [] };
  const done = () => {
    r.ok = r.issues.length === 0;
    return r;
  };

  const top = await runGit(folder, ['rev-parse', '--show-toplevel']);
  if (top.missing) {
    r.issues.push('这台电脑上找不到 git 命令，没法检查。请先安装 Git。');
    return done();
  }
  if (top.code !== 0) {
    r.issues.push('这个文件夹不是 Git 仓库，没有东西上传到 GitHub。');
    const kids = await childRepos(folder);
    if (kids.length) r.notes.push(`仓库可能在子文件夹里：${kids.join('、')}。把工作环境改成那个文件夹再检查。`);
    return done();
  }
  if (norm(top.stdout.trim()) !== norm(folder)) {
    r.issues.push(`这个文件夹在另一个仓库里面（仓库根目录是 ${top.stdout.trim()}）。请把工作环境改成仓库根目录。`);
    return done();
  }
  r.passed.push('是 Git 仓库');

  const remote = await runGit(folder, ['remote', 'get-url', 'origin']);
  if (remote.code !== 0) {
    r.issues.push('没有设置远程仓库（origin），代码还没连到 GitHub。');
    return done();
  }
  r.remote = cleanRemote(remote.stdout);
  if (/github\.com[/:]/i.test(r.remote)) r.passed.push(`远程仓库：${r.remote}`);
  else r.notes.push(`远程仓库不是 GitHub 地址：${r.remote}`);

  const fetch = await runGit(folder, ['fetch', '--prune', '--quiet', 'origin'], { timeout: 120000 });
  if (fetch.code !== 0) {
    r.issues.push(`连不上远程仓库，没法确认线上的最新状态：${firstLine(fetch.stderr) || '未知错误'}`);
    return done();
  }
  r.passed.push('已从 GitHub 取回最新状态');

  const head = await runGit(folder, ['rev-parse', '--short', 'HEAD']);
  if (head.code !== 0) {
    r.issues.push('仓库里还没有任何提交。');
    return done();
  }
  r.head = head.stdout.trim();
  const br = await runGit(folder, ['rev-parse', '--abbrev-ref', 'HEAD']);
  r.branch = br.stdout.trim();

  // 工作区：没提交的改动、没加入仓库的文件、被忽略的文件
  const st = await runGit(folder, ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=normal']);
  const changed = [];
  const untracked = [];
  for (const line of st.stdout.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    let file = line.slice(3).trim();
    if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
    if (code === '!!') (isRegenerable(file) ? r.regenerable : r.localOnly).push(file);
    else if (code === '??') untracked.push(file);
    else changed.push(file);
  }
  if (changed.length) r.issues.push(`有 ${changed.length} 个文件改了没提交：${changed.slice(0, 8).join('、')}${changed.length > 8 ? ' 等' : ''}`);
  if (untracked.length) r.issues.push(`有 ${untracked.length} 个新文件没加进仓库：${untracked.slice(0, 8).join('、')}${untracked.length > 8 ? ' 等' : ''}`);
  if (!changed.length && !untracked.length) r.passed.push('没有未提交的改动');

  // 每个本地分支都要推送过，且没有领先远程的提交
  const refs = await runGit(folder, ['for-each-ref', '--format=%(refname:short)|%(upstream:short)|%(upstream:track)', 'refs/heads']);
  let branchOk = true;
  for (const line of refs.stdout.split('\n')) {
    if (!line.trim()) continue;
    const [name, up, track] = line.split('|');
    if (!up) {
      branchOk = false;
      r.issues.push(`分支 ${name} 没有推送到 GitHub。`);
    } else if (/gone/.test(track)) {
      branchOk = false;
      r.issues.push(`分支 ${name} 对应的远程分支已经不存在。`);
    } else if (/ahead/.test(track)) {
      branchOk = false;
      r.issues.push(`分支 ${name} 有提交还没推送（${track}）。`);
    } else if (/behind/.test(track)) {
      r.notes.push(`分支 ${name} 比 GitHub 上旧（${track}），本地少的提交在线上都有，不影响删除。`);
    }
  }
  const contains = await runGit(folder, ['branch', '-r', '--contains', 'HEAD']);
  if (!contains.stdout.trim()) {
    branchOk = false;
    r.issues.push(`当前提交 ${r.head} 不在任何远程分支上。`);
  }
  if (branchOk) r.passed.push('所有分支和提交都已推送');

  const stash = await runGit(folder, ['stash', 'list']);
  const stashes = stash.stdout.split('\n').filter((x) => x.trim()).length;
  if (stashes) r.issues.push(`有 ${stashes} 个暂存（git stash）只在本地。`);

  const localTags = (await runGit(folder, ['tag', '--list'])).stdout.split('\n').map((x) => x.trim()).filter(Boolean);
  if (localTags.length) {
    const remoteTags = await runGit(folder, ['ls-remote', '--tags', 'origin'], { timeout: 60000 });
    const have = new Set(remoteTags.stdout.split('\n').map((l) => l.split('refs/tags/')[1]).filter(Boolean).map((t) => t.replace(/\^\{\}$/, '')));
    const missing = localTags.filter((t) => !have.has(t));
    if (missing.length) r.issues.push(`有标签没推送：${missing.slice(0, 8).join('、')}`);
  }

  if (r.localOnly.length) r.notes.push(`有 ${r.localOnly.length} 项被 .gitignore 排除、只在本地（例如密钥文件、原始素材），删除文件夹时会一起删掉。`);
  return done();
}

/**
 * 从远程仓库下载代码到一个刚建好的空文件夹（继续修改用）。
 * 只把代码取到本地，不改远程仓库。地址只接受 https（测试可放开）。
 */
export async function cloneRepo(url, target, { allowAnyRemote = false } = {}) {
  const u = String(url || '').trim();
  if (!allowAnyRemote && !/^https:\/\/[^\s]+$/i.test(u)) {
    throw new HttpError(400, '仓库地址要以 https:// 开头，例如 https://github.com/店的账号/仓库名');
  }
  const r = await runGit(path.dirname(target), ['clone', '--quiet', '--', u, target], { timeout: 10 * 60 * 1000 });
  if (r.missing) throw new HttpError(500, '这台电脑上找不到 git 命令，请先安装 Git。');
  if (r.code !== 0) {
    const msg = firstLine(r.stderr) || '未知错误';
    const hint = /authentication|could not read username|403|not found|repository .* not found/i.test(r.stderr)
      ? '（可能是仓库地址不对，或者这台电脑还没登录能访问这个仓库的 GitHub 账号）' : '';
    throw new HttpError(502, `下载失败：${msg}${hint}`);
  }
  const head = await runGit(target, ['rev-parse', '--short', 'HEAD']);
  const br = await runGit(target, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return { head: head.stdout.trim(), branch: br.stdout.trim(), remote: cleanRemote(u) };
}

// Mac 上让 Finder 把文件夹移到废纸篓（能在废纸篓里“放回原处”）。
// 路径作为参数传给脚本（argv），不拼进脚本字符串。
const MAC_TRASH_SCRIPT = [
  'on run argv',
  'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
  'end run',
];

/**
 * 默认的删除方式：移到系统回收站（可以找回）。
 * Windows：回收站；macOS：废纸篓；其他系统不支持。
 * opts.platform / opts.exec 只给测试用。
 */
export function moveToRecycleBin(target, { platform = process.platform, exec = execFile } = {}) {
  return new Promise((resolve, reject) => {
    if (platform === 'win32') {
      const ps = "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:JZ_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')";
      exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        timeout: 10 * 60 * 1000,
        windowsHide: true,
        env: { ...process.env, JZ_TARGET: target },
      }, (err, _out, stderr) => {
        if (err) reject(new HttpError(500, `移到回收站失败：${firstLine(stderr) || err.message}`));
        else resolve();
      });
      return;
    }
    if (platform === 'darwin') {
      if (!path.isAbsolute(target)) {
        reject(new HttpError(400, '要删除的文件夹路径不对。'));
        return;
      }
      const args = MAC_TRASH_SCRIPT.flatMap((line) => ['-e', line]);
      exec('osascript', [...args, target], { timeout: 10 * 60 * 1000 }, (err, _out, stderr) => {
        if (!err) {
          resolve();
          return;
        }
        const msg = firstLine(stderr) || err.message;
        const hint = /-1743|not authori[sz]ed|不允许/i.test(String(stderr))
          ? '（需要允许建站助手控制“访达”：系统设置 → 隐私与安全性 → 自动化，打开运行建站助手的终端对“访达”的权限，再试一次）' : '';
        reject(new HttpError(500, `移到废纸篓失败：${msg}${hint}`));
      });
      return;
    }
    reject(new HttpError(501, '这个系统不支持移到回收站，目前只支持 Windows 回收站和 Mac 废纸篓。'));
  });
}

/** 删除能重新生成的东西（node_modules 等），只删检查结果里列出的、在文件夹里面的路径 */
export async function removeRegenerable(folder, entries) {
  const root = norm(folder) + path.sep;
  for (const e of entries) {
    const p = path.resolve(folder, ...e.replace(/\/+$/, '').split('/'));
    if (!norm(p).startsWith(root)) continue;
    await fs.rm(p, { recursive: true, force: true, maxRetries: 3 });
  }
}
