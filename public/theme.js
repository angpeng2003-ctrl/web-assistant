// 白天 / 夜间配色。在 <head> 里同步运行，页面画出来之前就套上配色，不会先闪一下白。
// 没选过就跟随系统；点顶栏按钮切换后记在本机浏览器里。切回和系统一样的配色时清掉记录，重新跟随系统。
(() => {
  const KEY = 'jz-theme';
  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const listeners = new Set();
  const system = () => (mq.matches ? 'dark' : 'light');
  const saved = () => {
    try {
      const t = localStorage.getItem(KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch {
      return null;
    }
  };
  const apply = () => {
    root.dataset.theme = saved() || system();
    for (const fn of listeners) fn(root.dataset.theme);
  };
  apply();
  mq.addEventListener('change', () => { if (!saved()) apply(); });
  window.jzTheme = {
    current: () => root.dataset.theme,
    toggle() {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        if (next === system()) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch { /* 浏览器不让存就只管这一次 */ }
      root.dataset.theme = next;
      for (const fn of listeners) fn(next);
    },
    onChange(fn) { listeners.add(fn); },
  };
})();
