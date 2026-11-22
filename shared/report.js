// 浏览器和服务端共用：按系统显示的“回收站 / 废纸篓”文案，和交付报告里给客户看的说明。
// 只返回纯文本，由调用方按纯文本显示。

/** 系统自带的回收站叫什么：Mac 是“废纸篓”，Windows 和其他系统是“回收站” */
export function trashName(platform) {
  return platform === 'darwin' ? '废纸篓' : '回收站';
}

/** 售后天数大于 0 才在报告里显示 Support 一段 */
export function hasSupport(delivery) {
  return Number(delivery && delivery.warrantyDays) > 0;
}

const filled = (v) => (v == null ? '' : String(v).trim());

/**
 * 交付报告 “How to use your website” 一段，写给客户看的英文。
 * 返回 [{ label, text }]；“What you own” 只提账号清单里填了的。
 */
export function howToUse(rec) {
  const env = (rec && rec.env) || {};
  const d = (rec && rec.delivery) || {};
  const repo = filled(d.repoUrl) || filled(env.repo);
  const hasCode = !!(repo || filled(env.github));
  const hasVercel = !!filled(env.vercel);
  const out = [];

  const where = hasCode ? 'Your website’s code is stored in your own GitHub repository' : 'Your website’s code is stored in your own code repository';
  const deploy = hasVercel
    ? 'When changes are pushed to its main branch, Vercel puts them online automatically.'
    : 'When changes are pushed to its main branch, the website is updated.';
  out.push({ label: 'Making changes', text: `${where}${repo ? ` (${repo})` : ''}. ${deploy} If you are not comfortable editing code, please ask a developer to make changes for you.` });

  const owned = [];
  if (filled(env.domain)) owned.push(`the domain ${filled(env.domain)}${filled(env.registrar) ? ` (registered with ${filled(env.registrar)})` : ''}`);
  if (hasVercel) owned.push('the hosting on Vercel');
  if (hasCode) owned.push('the code on GitHub');
  if (owned.length) {
    const list = owned.length === 1 ? owned[0] : `${owned.slice(0, -1).join(', ')} and ${owned[owned.length - 1]}`;
    const cap = list.charAt(0).toUpperCase() + list.slice(1);
    out.push({ label: 'What you own', text: `${cap} ${owned.length === 1 ? 'is' : 'are'} in your name. You pay each platform directly.` });
  }

  out.push({
    label: 'Maintenance',
    text: `${hasSupport(d) ? 'Apart from the support period below, ongoing' : 'Ongoing'} maintenance is not included after delivery. If you would like changes later, please contact us to arrange them separately.`,
  });
  return out;
}

/**
 * 交付报告 “Developer access” 一段（只对云端建站的客户）：
 * 建站时开发者是仓库协作者、仓库上装了 Claude GitHub App；交接后这些权限还在，要告诉客户怎么移除。
 * 返回 [{ label, text }]，没有就返回空列表。
 */
export function developerAccess(rec) {
  if (!rec || rec.buildMode !== 'cloud') return [];
  return [
    {
      label: 'What remains',
      text: 'While building your website, our GitHub account was added to your code repository as a collaborator, and the Claude GitHub App was installed on it so the website could be built in the cloud. Both still have access after delivery.',
    },
    {
      label: 'Your choice',
      text: 'You can keep this access if you want us to be able to make changes later, or remove it at any time. Removing it does not affect your live website.',
    },
    {
      label: 'How to remove it',
      text: 'In GitHub, open the repository, go to Settings → Collaborators and remove our account. Then go to your account Settings → Applications → Installed GitHub Apps and uninstall Claude (or remove this repository from it).',
    },
  ];
}
