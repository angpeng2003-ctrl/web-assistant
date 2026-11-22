// 浏览器和服务端共用：云端建站的“开工准备”步骤（只是负责人自己打勾的进度，建站助手不检查任何账号）。
// key 是存进客户记录 setup.done 的名字，改名会让已勾的步骤丢失。
export const SETUP_STEPS = [
  { key: 'gmail', group: 'start', title: '注册客户的 Gmail' },
  { key: 'github', group: 'start', title: '用这个 Gmail 注册 GitHub' },
  { key: 'repo', group: 'start', title: '新建网站仓库' },
  { key: 'collab', group: 'start', title: '把你加成协作者' },
  { key: 'app', group: 'start', title: '装 Claude GitHub App' },
  { key: 'project', group: 'start', title: '在 claude.ai 建 Project' },
  { key: 'starter', group: 'start', title: '把开工包贴进 Project' },
  { key: 'domain', group: 'launch', title: '买域名' },
  { key: 'vercel', group: 'launch', title: '在 Vercel 导入仓库' },
  { key: 'golive', group: 'launch', title: '填环境变量、绑定域名' },
];
export const SETUP_KEYS = SETUP_STEPS.map((s) => s.key);

/** 进度：{ done, total, startDone, startTotal }；startDone === startTotal 就可以开始建站 */
export function setupProgress(setup) {
  const d = (setup && setup.done) || {};
  const start = SETUP_STEPS.filter((s) => s.group === 'start');
  return {
    done: SETUP_STEPS.filter((s) => d[s.key]).length,
    total: SETUP_STEPS.length,
    startDone: start.filter((s) => d[s.key]).length,
    startTotal: start.length,
  };
}
