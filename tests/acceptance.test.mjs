// 验收测试：台账、客户信息、账号清单、工作环境（建文件夹写规则）、交付、上传检查和清理本地文件夹
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer, tempDir } from './helpers.mjs';
import { detectSecret, redactSecrets } from '../shared/secrets.js';
import { APP_ROOT } from '../server/config.js';

const exists = async (p) => fs.access(p).then(() => true, () => false);

// ---------- Git 测试工具：用本地的裸仓库模拟 GitHub ----------
function g(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=测试', '-c', 'user.email=test@example.invalid', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
async function makePushedRepo(parent, name) {
  const origin = path.join(await tempDir('jz-origin-'), 'origin.git');
  g(path.dirname(origin), 'init', '--bare', '-q', origin);
  const repo = path.join(parent, name);
  await fs.mkdir(repo);
  g(repo, 'init', '-q');
  await fs.writeFile(path.join(repo, 'index.html'), '<h1>hi</h1>\n');
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.env*\n_原素材/\n');
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'init');
  g(repo, 'remote', 'add', 'origin', origin);
  g(repo, 'push', '-q', '-u', 'origin', 'main');
  return repo;
}

// 假回收站：移到临时文件夹，测试不碰真实的回收站
async function fakeTrashHooks() {
  const bin = await tempDir('jz-trash-');
  const moved = [];
  return {
    moved,
    hooks: {
      trash: async (folder) => {
        const dest = path.join(bin, `${moved.length}-${path.basename(folder)}`);
        await fs.rename(folder, dest);
        moved.push(dest);
      },
    },
  };
}

test('1. 可新建多个客户，编号唯一，记录互相隔离', async () => {
  const s = await startServer();
  try {
    const a = (await s.call('POST', '/api/clients', { name: '甲店' })).data;
    const b = (await s.call('POST', '/api/clients', { name: '乙店' })).data;
    assert.equal(a.id, 'JZ-0001');
    assert.equal(b.id, 'JZ-0002');
    await s.call('PUT', `/api/clients/${a.id}/info`, { phone: '111-1111', contact: '王一' });
    await s.call('PUT', `/api/clients/${b.id}/info`, { phone: '222-2222', contact: '李二' });
    const ra = (await s.call('GET', `/api/clients/${a.id}`)).data;
    assert.equal(ra.info.phone, '111-1111');
    assert.ok(!JSON.stringify(ra).includes('222-2222'));
    const list = (await s.call('GET', '/api/clients')).data.clients;
    assert.deepEqual(list.map((c) => [c.id, c.contact]), [['JZ-0001', '王一'], ['JZ-0002', '李二']]);
    assert.equal((await s.call('GET', '/api/clients/..%2Fmeta')).status, 404);
    assert.equal((await s.call('GET', '/api/clients/JZ-9999')).status, 404);
  } finally {
    await s.close();
  }
});

test('2. 客户信息自动保存，重启后仍能读取；提纲接口已去掉', async () => {
  const dataDir = await tempDir();
  let s = await startServer({ dataDir });
  const { id } = (await s.call('POST', '/api/clients', { name: '丙店' })).data;
  await s.call('PUT', `/api/clients/${id}/info`, { contact: '张三', phone: '(626) 555-0100', address: '1 Main St', email: 'a@b.com', fee: '建站 1500 美元，已付一半' });
  await s.close();
  s = await startServer({ dataDir });
  try {
    const rec = (await s.call('GET', `/api/clients/${id}`)).data;
    assert.deepEqual(rec.info, { contact: '张三', phone: '(626) 555-0100', address: '1 Main St', email: 'a@b.com', fee: '建站 1500 美元，已付一半' });
    assert.equal(rec.outline, undefined);
    assert.equal((await s.call('PUT', `/api/clients/${id}/outline`, { text: 'x' })).status, 404);
    // 只改一项不会清掉别的
    await s.call('PUT', `/api/clients/${id}/info`, { phone: '999' });
    const rec2 = (await s.call('GET', `/api/clients/${id}`)).data;
    assert.equal(rec2.info.contact, '张三');
    assert.equal(rec2.info.phone, '999');
  } finally {
    await s.close();
  }
});

test('3. 新建项目文件夹：只写入建站规则（要求用 UI UX Pro Max），不覆盖已有文件夹', async () => {
  const root = await tempDir('jz-root-');
  const s = await startServer({ roots: [root] });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '绿叶餐厅' })).data;
    const r = await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: root, name: '绿叶餐厅' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const folder = path.join(root, '绿叶餐厅');
    const rules = await fs.readFile(path.join(folder, 'CLAUDE.md'), 'utf8');
    assert.match(rules, /绿叶餐厅 · 建站规则/);
    assert.match(rules, /UI UX Pro Max/);
    assert.match(rules, new RegExp(id));
    assert.doesNotMatch(rules, /提纲/);
    assert.deepEqual(await fs.readdir(folder), ['CLAUDE.md']);
    assert.equal(r.data.record.workspace.folder, folder);
    // 同名文件夹已存在：不覆盖
    assert.equal((await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: root, name: '绿叶餐厅' })).status, 409);
    // 不合法的名字、范围外、建站助手自己的文件夹
    for (const name of ['a/b', '..', 'CON', 'x.']) {
      assert.equal((await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: root, name })).status, 400, name);
    }
    const outside = await tempDir('jz-outside-');
    assert.equal((await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: outside, name: 'x' })).status, 400);
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await s.close();
  }
});

test('3b. 不能把建站助手自己的文件夹选成客户项目文件夹', async () => {
  const s = await startServer({ roots: [path.resolve(APP_ROOT, '..')] });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '自身保护' })).data;
    for (const folder of [APP_ROOT, path.join(APP_ROOT, 'server'), path.resolve(APP_ROOT, '..')]) {
      assert.equal((await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder })).status, 400, folder);
    }
    assert.equal((await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: APP_ROOT, name: 'x' })).status, 400);
    const list = (await s.call('GET', `/api/fs/list?path=${encodeURIComponent(path.resolve(APP_ROOT, '..'))}`)).data;
    assert.ok(!list.dirs.some((d) => d.path === APP_ROOT));
  } finally {
    await s.close();
  }
});

test('4. 已有文件夹写规则：不覆盖不同内容，可另存或覆盖并备份，拒绝链接', async () => {
  const root = await tempDir('jz-root-');
  const s = await startServer({ roots: [root] });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '辛店' })).data;
    const proj = path.join(root, '辛店项目');
    await fs.mkdir(proj);
    await fs.writeFile(path.join(proj, 'CLAUDE.md'), '客户自己的旧规则', 'utf8');
    await fs.writeFile(path.join(proj, 'index.html'), '<p>已有文件</p>', 'utf8');
    const plan = (await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: proj })).data;
    const st = Object.fromEntries(plan.files.map((f) => [f.key, f.status]));
    assert.deepEqual(st, { rules: 'conflict' });
    const expected = { rules: plan.files.find((f) => f.key === 'rules').existingHash };

    let w = (await s.call('POST', `/api/clients/${id}/workspace/write`, { folder: proj, choices: { rules: 'write' }, expected })).data;
    assert.equal(w.results.find((x) => x.rel === 'CLAUDE.md').outcome, 'conflict');
    assert.equal(await fs.readFile(path.join(proj, 'CLAUDE.md'), 'utf8'), '客户自己的旧规则');
    assert.equal(await exists(path.join(proj, 'docs')), false);

    w = (await s.call('POST', `/api/clients/${id}/workspace/write`, { folder: proj, choices: { rules: 'newVersion' }, expected })).data;
    assert.equal(w.results[0].outcome, 'savedAs');
    assert.equal(await fs.readFile(path.join(proj, 'CLAUDE.md'), 'utf8'), '客户自己的旧规则');

    await fs.writeFile(path.join(proj, 'CLAUDE.md'), '客户刚改过', 'utf8');
    w = (await s.call('POST', `/api/clients/${id}/workspace/write`, { folder: proj, choices: { rules: 'overwrite' }, expected })).data;
    assert.equal(w.results[0].outcome, 'conflict');

    const plan2 = (await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: proj })).data;
    const exp2 = { rules: plan2.files.find((f) => f.key === 'rules').existingHash };
    w = (await s.call('POST', `/api/clients/${id}/workspace/write`, { folder: proj, choices: { rules: 'overwrite' }, expected: exp2 })).data;
    assert.equal(w.results[0].outcome, 'overwritten');
    const backups = await fs.readdir(path.join(s.dataDir, 'backups', id), { recursive: true });
    assert.ok(backups.some((f) => f.endsWith('CLAUDE.md')));
    assert.equal(await fs.readFile(path.join(proj, 'index.html'), 'utf8'), '<p>已有文件</p>');

    const outside = await tempDir('jz-outside-');
    const link = path.join(root, '链接');
    await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const r2 = await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: link });
    assert.equal(r2.status, 400);
    assert.match(r2.data.error, /链接/);
    assert.equal((await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: proj, run: 'npm install' })).status, 400);
  } finally {
    await s.close();
  }
});

test('5. 规则模板可以修改，新写入的规则用新模板', async () => {
  const root = await tempDir('jz-root-');
  const s = await startServer({ roots: [root] });
  try {
    const t = (await s.call('GET', '/api/rules-template')).data;
    assert.equal(t.custom, false);
    assert.match(t.text, /UI UX Pro Max/);
    assert.equal((await s.call('PUT', '/api/rules-template', { text: '  ' })).status, 400);
    assert.equal((await s.call('PUT', '/api/rules-template', { text: '# {{店名}} 规则\n编号 {{编号}}\n用 UI UX Pro Max。' })).status, 200);
    const { id } = (await s.call('POST', '/api/clients', { name: '模板店' })).data;
    await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: root, name: '模板店' });
    assert.equal(await fs.readFile(path.join(root, '模板店', 'CLAUDE.md'), 'utf8'), `# 模板店 规则\n编号 ${id}\n用 UI UX Pro Max。\n`);
  } finally {
    await s.close();
  }
});

test('6. 上传检查：区分已全部推送、没提交、没推送、只在本地的文件', async () => {
  const root = await tempDir('jz-root-');
  const s = await startServer({ roots: [root] });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '检查店' })).data;
    // 还没关联文件夹
    assert.equal((await s.call('POST', `/api/clients/${id}/repo/check`)).status, 409);
    // 不是仓库
    const plain = path.join(root, '普通文件夹');
    await fs.mkdir(plain);
    await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: plain });
    let c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.equal(c.ok, false);
    assert.match(c.issues[0], /不是 Git 仓库/);

    const repo = await makePushedRepo(root, 'site');
    await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: repo });
    // 有新文件没加进仓库
    await fs.mkdir(path.join(repo, 'docs'));
    await fs.writeFile(path.join(repo, 'docs', '新文件.md'), '新');
    c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.equal(c.ok, false);
    assert.ok(c.issues.some((x) => /没加进仓库/.test(x)), c.issues.join('|'));
    await fs.rm(path.join(repo, 'docs'), { recursive: true, force: true });

    // 全部推送：通过；node_modules 算能重新生成，.env.local 算只在本地
    await fs.mkdir(path.join(repo, 'node_modules', 'x'), { recursive: true });
    await fs.writeFile(path.join(repo, 'node_modules', 'x', 'a.js'), '1');
    await fs.writeFile(path.join(repo, '.env.local'), 'ADMIN_PASSWORD=whatever');
    c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.equal(c.ok, true, c.issues.join('|'));
    assert.deepEqual(c.regenerable, ['node_modules/']);
    assert.deepEqual(c.localOnly, ['.env.local']);
    assert.ok(c.notes.some((x) => /不是 GitHub/.test(x)));

    // 改了没提交
    await fs.writeFile(path.join(repo, 'index.html'), '<h1>changed</h1>\n');
    c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.ok(c.issues.some((x) => /改了没提交/.test(x)));
    // 提交了没推送
    g(repo, 'commit', '-q', '-am', 'change');
    c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.ok(c.issues.some((x) => /还没推送/.test(x)), c.issues.join('|'));
    g(repo, 'push', '-q');
    c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.equal(c.ok, true, c.issues.join('|'));
    // 本地多出没推送的分支
    g(repo, 'branch', 'draft');
    c = (await s.call('POST', `/api/clients/${id}/repo/check`)).data.check;
    assert.ok(c.issues.some((x) => /draft/.test(x)));
  } finally {
    await s.close();
  }
});

test('7. 删除本地文件夹：必须已交付、名称确认、当场检查通过、确认只在本地的文件', async () => {
  const root = await tempDir('jz-root-');
  const trash = await fakeTrashHooks();
  const s = await startServer({ roots: [root], hooks: trash.hooks });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '清理店' })).data;
    const repo = await makePushedRepo(root, 'qingli-site');
    await s.call('POST', `/api/clients/${id}/workspace/plan`, { folder: repo });
    await fs.mkdir(path.join(repo, 'node_modules'));
    await fs.writeFile(path.join(repo, 'node_modules', 'big.js'), 'x');
    await fs.writeFile(path.join(repo, '.env.local'), 'KEY=1');

    // 还没交付
    let r = await s.call('POST', `/api/clients/${id}/repo/remove`, { confirmName: 'qingli-site', ackLocalOnly: true });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /交付/);
    await s.call('POST', `/api/clients/${id}/delivery/deliver`, { date: '2026-11-20' });
    // 名称不对
    r = await s.call('POST', `/api/clients/${id}/repo/remove`, { confirmName: 'wrong', ackLocalOnly: true });
    assert.equal(r.status, 400);
    // 有只在本地的文件但没确认
    r = await s.call('POST', `/api/clients/${id}/repo/remove`, { confirmName: 'qingli-site' });
    assert.equal(r.status, 409);
    assert.ok(await exists(repo));
    // 有没推送的改动：当场检查不通过，不删
    await fs.writeFile(path.join(repo, 'new.txt'), 'new');
    r = await s.call('POST', `/api/clients/${id}/repo/remove`, { confirmName: 'qingli-site', ackLocalOnly: true });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /检查没通过/);
    assert.ok(await exists(path.join(repo, 'new.txt')));
    await fs.rm(path.join(repo, 'new.txt'));
    // 全部满足：node_modules 直接删，其余进（假的）回收站
    r = await s.call('POST', `/api/clients/${id}/repo/remove`, { confirmName: 'qingli-site', ackLocalOnly: true });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(await exists(repo), false);
    assert.equal(trash.moved.length, 1);
    assert.equal(await exists(path.join(trash.moved[0], 'node_modules')), false);
    assert.ok(await exists(path.join(trash.moved[0], '.env.local')));
    assert.equal(r.data.record.workspace.folder, '');
    assert.equal(r.data.removed.folder, repo);
    assert.ok(r.data.removed.head);
    assert.deepEqual(r.data.removed.localOnly, ['.env.local']);
    // 范围根目录本身不能删
    const { id: id2 } = (await s.call('POST', '/api/clients', { name: '根目录' })).data;
    await s.call('POST', `/api/clients/${id2}/delivery/deliver`, { date: '2026-11-20' });
    await s.call('POST', `/api/clients/${id2}/workspace/plan`, { folder: root });
    r = await s.call('POST', `/api/clients/${id2}/repo/remove`, { confirmName: path.basename(root), ackLocalOnly: true });
    assert.equal(r.status, 400);
    assert.ok(await exists(root));
  } finally {
    await s.close();
  }
});

test('8. 交付日期：再次交付和重新打开不改售后起算日', async () => {
  const s = await startServer();
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '壬店' })).data;
    await s.call('PUT', `/api/clients/${id}/delivery`, { siteUrl: 'https://example.com', warrantyDays: 30 });
    let rec = (await s.call('POST', `/api/clients/${id}/delivery/deliver`, { date: '2026-11-01' })).data;
    assert.equal(rec.status, 'delivered');
    assert.equal(rec.delivery.firstDeliveredAt, '2026-11-01');
    assert.equal(rec.computed.warrantyEnd, '2026-12-01');
    assert.equal(rec.liveUrl, 'https://example.com');
    rec = (await s.call('POST', `/api/clients/${id}/delivery/reopen`)).data;
    assert.equal(rec.status, 'active');
    rec = (await s.call('POST', `/api/clients/${id}/delivery/deliver`, { date: '2026-11-15', note: '改版' })).data;
    assert.equal(rec.delivery.firstDeliveredAt, '2026-11-01');
    assert.equal((await s.call('POST', `/api/clients/${id}/delivery/correct-start`, { date: '2026-10-30', reason: '' })).status, 400);
    rec = (await s.call('POST', `/api/clients/${id}/delivery/correct-start`, { date: '2026-10-30', reason: '当时记错' })).data;
    assert.equal(rec.delivery.firstDeliveredAt, '2026-10-30');
    assert.equal((await s.call('PUT', `/api/clients/${id}/delivery`, { siteUrl: 'javascript:alert(1)' })).status, 400);
    // 签字页用到的范围、价格和签字人
    rec = (await s.call('PUT', `/api/clients/${id}/delivery`, { price: '$1,500', paymentTerms: '50% deposit, balance at delivery', notIncluded: 'Online store\nBlog', providerName: 'Jane Doe', clientSigner: 'John Smith' })).data;
    assert.equal(rec.delivery.price, '$1,500');
    assert.equal(rec.delivery.notIncluded, 'Online store\nBlog');
    assert.equal(rec.delivery.clientSigner, 'John Smith');
    assert.equal((await s.call('PUT', `/api/clients/${id}/delivery`, { price: 'x'.repeat(201) })).status, 400);
    assert.equal((await s.call('PUT', `/api/clients/${id}/delivery`, { paymentTerms: 'token=ghp_abcdefghijklmnopqrstuvwxyz0123' })).status, 422);
  } finally {
    await s.close();
  }
});

test('9. 维护请求可记录；归档、回收站都可恢复，且期间只读', async () => {
  const s = await startServer();
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '癸店' })).data;
    await s.call('POST', `/api/clients/${id}/delivery/deliver`, { date: '2026-11-01' });
    let rec = (await s.call('POST', `/api/clients/${id}/maintenance`, { date: '2026-11-10', category: '缺陷修复', title: '联系页电话打不通' })).data;
    assert.equal(rec.maintenance[0].inWarranty, 'yes');
    rec = (await s.call('PATCH', `/api/clients/${id}/maintenance/M1`, { status: '已完成', resolution: '改好了' })).data;
    assert.equal(rec.maintenance[0].status, '已完成');
    await s.call('POST', `/api/clients/${id}/archive`);
    assert.equal((await s.call('PUT', `/api/clients/${id}/info`, { phone: '1' })).status, 409);
    await s.call('POST', `/api/clients/${id}/unarchive`);
    await s.call('POST', `/api/clients/${id}/trash`);
    assert.equal((await s.call('GET', '/api/clients?view=trash')).data.clients.length, 1);
    await fs.access(path.join(s.dataDir, 'clients', `${id}.json`));
    await s.call('POST', `/api/clients/${id}/restore`);
    rec = (await s.call('GET', `/api/clients/${id}`)).data;
    assert.equal(rec.trashedAt, null);
    assert.equal(rec.maintenance.length, 1);
  } finally {
    await s.close();
  }
});

test('10. 疑似密码或密钥不会被保存，也不会写进项目文件', async () => {
  const root = await tempDir('jz-root-');
  const s = await startServer({ roots: [root] });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '密钥测试店' })).data;
    const samples = [
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
      'sk-proj-abcdefghijklmnop1234567890',
      're_AbCdEfGh12345678ijkl',
      '密码：Abc12345',
      'password = hunter2!x',
      '-----BEGIN RSA PRIVATE KEY-----',
      'AKIAABCDEFGHIJKLMNOP',
    ];
    for (const v of samples) {
      assert.equal((await s.call('PUT', `/api/clients/${id}/info`, { fee: v })).status, 422, v);
      assert.equal((await s.call('PUT', `/api/clients/${id}/info`, { address: `1 Main St ${v}` })).status, 422, v);
    }
    assert.equal((await s.call('PUT', `/api/clients/${id}/env`, { vercel: '密码：Abc12345' })).status, 422);
    assert.equal((await s.call('POST', `/api/clients/${id}/maintenance`, { date: '2026-11-10', category: '账号或密码相关协助', title: '重置密码', detail: '新密码是 Xyz98765!' })).status, 422);
    assert.equal((await s.call('PUT', '/api/rules-template', { text: 'token=ghp_abcdefghijklmnopqrstuvwxyz0123' })).status, 422);
    const raw = await fs.readFile(path.join(s.dataDir, 'clients', `${id}.json`), 'utf8');
    for (const v of samples) assert.ok(!raw.includes(v.split(/[:：=]\s*/).pop()), `数据里出现了 ${v}`);
    for (const ok of ['密码由客户自己保管', 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345', '3f1c2a9b7e4d5068a1b2c3d4e5f60718293a4b5c', '(555) 010-0100']) {
      assert.equal(detectSecret(ok), null, `误判：${ok}`);
    }
    assert.ok(!redactSecrets('令牌 ghp_abcdefghijklmnopqrstuvwxyz0123456789 结束').includes('ghp_'));
  } finally {
    await s.close();
  }
});

test('11. 服务端安全边界：只认本机来源、拒绝未知字段、限制长度', async () => {
  const s = await startServer();
  try {
    assert.equal((await s.call('POST', '/api/clients', { name: 'x' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await s.call('POST', '/api/clients', { name: 'x' }, { 'x-jz-request': '0' })).status, 403);
    assert.equal((await s.call('POST', '/api/clients', { name: 'x', admin: true })).status, 400);
    assert.equal((await s.call('POST', '/api/clients', { name: 'x'.repeat(101) })).status, 400);
    const { id } = (await s.call('POST', '/api/clients', { name: '正常店' })).data;
    assert.equal((await s.call('PUT', `/api/clients/${id}/info`, { phone: 'x'.repeat(101) })).status, 400);
    assert.equal((await s.call('PUT', `/api/clients/${id}/info`, { shopName: 'x' })).status, 400);
    // 旧的资料表单和建站说明接口已经去掉
    assert.equal((await s.call('PUT', `/api/clients/${id}/answers/phone`, { v: '1' })).status, 404);
    assert.equal((await s.call('POST', `/api/clients/${id}/brief/generate`)).status, 404);
    assert.equal((await s.call('GET', '/..%2F..%2Fpackage.json')).status, 404);
    assert.equal((await s.call('GET', '/shared/../server/app.js')).status, 404);
    const page = await s.call('GET', '/');
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  } finally {
    await s.close();
  }
});

test('12. 账号与准备：域名和固定账号清单只记账号名；填了的才写进建站规则', async () => {
  const root = await tempDir('jz-root-');
  const s = await startServer({ roots: [root] });
  try {
    const { id } = (await s.call('POST', '/api/clients', { name: '账号店' })).data;
    const fresh = (await s.call('GET', `/api/clients/${id}`)).data;
    assert.deepEqual(Object.keys(fresh.env), ['domain', 'domainPrice', 'gmail', 'github', 'repo', 'vercel', 'registrar', 'resend', 'supabase']);
    assert.ok(Object.values(fresh.env).every((v) => v === ''));
    // 一项都没填：规则里没有“账号和环境”这一节
    await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: root, name: '空账号' });
    assert.doesNotMatch(await fs.readFile(path.join(root, '空账号', 'CLAUDE.md'), 'utf8'), /账号和环境/);

    let rec = (await s.call('PUT', `/api/clients/${id}/env`, { domain: 'shop.example', domainPrice: '$12.99', github: 'shop-owner', repo: 'https://github.com/shop-owner/site', resend: 're-account@shop.example' })).data;
    assert.equal(rec.env.domainPrice, '12.99');
    assert.equal(rec.env.github, 'shop-owner');
    // 只改一项不会清掉别的
    rec = (await s.call('PUT', `/api/clients/${id}/env`, { vercel: 'shop-owner' })).data;
    assert.equal(rec.env.domain, 'shop.example');
    // 校验
    assert.equal((await s.call('PUT', `/api/clients/${id}/env`, { repo: 'github.com/x' })).status, 400);
    assert.equal((await s.call('PUT', `/api/clients/${id}/env`, { domainPrice: '大概十几块' })).status, 400);
    assert.equal((await s.call('PUT', `/api/clients/${id}/env`, { github: 'password: Abc12345!' })).status, 422);
    assert.equal((await s.call('PUT', `/api/clients/${id}/env`, { password: 'x' })).status, 400);
    assert.equal((await s.call('PUT', `/api/clients/${id}/accounts`, { accounts: [] })).status, 404);

    // 填了的才写进规则，没填的（Supabase、Gmail、注册商）不出现
    await s.call('POST', `/api/clients/${id}/workspace/create`, { parent: root, name: '有账号' });
    const rules = await fs.readFile(path.join(root, '有账号', 'CLAUDE.md'), 'utf8');
    assert.match(rules, /## 账号和环境/);
    assert.match(rules, /域名：shop\.example/);
    assert.match(rules, /主仓库：https:\/\/github\.com\/shop-owner\/site/);
    assert.match(rules, /RESEND_API_KEY/);
    assert.doesNotMatch(rules, /Supabase|Gmail|域名注册商：/);
  } finally {
    await s.close();
  }
});
