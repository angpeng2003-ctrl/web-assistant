// 建站助手前端。所有用户输入都用 textContent / value 显示，从不当作 HTML。
// 交互规范见 docs/design-system.md
import { detectSecret } from '/shared/secrets.js';

// ---------- 小工具 ----------
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v; // 用 CSSOM 设置，符合内容安全策略
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'open'].includes(k)) el[k] = v;
      else if (k.startsWith('on')) throw new Error('不要用字符串事件');
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 往元素里放子节点：自动跳过 null/false，并展开数组
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  return el;
}

// 线条图标（Lucide 风格，内联 SVG，不加载外部文件）
const ICONS = {
  plus: ['M5 12h14', 'M12 5v14'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  check: ['M20 6 9 17l-5-5'],
  back: ['m15 18-6-6 6-6'],
  next: ['m9 18 6-6-6-6'],
  folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  up: ['m18 15-6-6-6 6'],
  search: ['M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'm21 21-4.3-4.3'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  archive: ['M2 4h20v5H2z', 'M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9', 'M10 13h4'],
  restore: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  pencil: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  copy: ['M8 8h12v12H8z', 'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8'],
  printer: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
  present: ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'm7 21 5-5 5 5'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z', 'M12 9v4', 'M12 17h.01'],
  info: ['M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M12 16v-4', 'M12 8h.01'],
  loader: ['M21 12a9 9 0 1 1-6.22-8.56'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  exit: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  save: ['M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7', 'M7 3v4a1 1 0 0 0 1 1h7'],
  site: ['M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
};
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name, cls = '') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `i ${cls}`.trim());
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** 按钮：btn('文字', { icon, variant: 'primary'|'danger'|'ghost'|'danger-solid', small, onClick, disabled, title, label }) */
function btn(text, o = {}) {
  return h('button', {
    type: o.type || 'button',
    class: ['btn', o.variant, o.small && 'small', o.cls].filter(Boolean).join(' '),
    disabled: o.disabled,
    title: o.title,
    'aria-label': o.label,
    dataset: o.dataset,
    on: o.onClick ? { click: o.onClick } : undefined,
  }, o.icon ? icon(o.icon) : null, text);
}

function notice(kind, iconName, ...content) {
  return h('div', { class: `notice ${kind || ''}`, role: kind === 'danger' ? 'alert' : null }, icon(iconName || 'info'), h('div', null, ...content));
}

function safeHref(u) {
  return typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) ? u : null;
}

function extLink(url, text) {
  const href = safeHref(url);
  if (!href) return document.createTextNode(text || url || '');
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text || url, icon('external'));
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 提示：成功 3.5 秒自动消失；错误留 7 秒，可以手动关
function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info'),
    h('span', null, msg),
    h('button', { type: 'button', 'aria-label': '关闭提示', on: { click: () => t.remove() } }, icon('x')));
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}

// 页内对话框：代替浏览器自带的 confirm / prompt
function openDialog({ title, body = [], confirmText = '确定', cancelText = '取消', danger = false, iconName, input = null, check = null, requireText = null, extra = null }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    let field = null;
    if (input) field = h('input', { type: 'text', id: 'dlg-input', value: input.value || '', maxlength: input.max || 100, placeholder: input.placeholder || '', autocomplete: 'off' });
    const ok = btn(confirmText, { type: 'submit', variant: danger ? 'danger-solid' : 'primary' });
    const checkBox = check ? h('input', { type: 'checkbox', id: 'dlg-check' }) : null;
    // 需要输入名称或打勾才能确认（用于删除这类不好撤销的操作）
    const refreshOk = () => {
      ok.disabled = (requireText != null && (!field || field.value.trim() !== requireText)) || (checkBox && !checkBox.checked);
    };
    if (field) field.addEventListener('input', refreshOk);
    if (checkBox) checkBox.addEventListener('change', refreshOk);
    const cancel = btn(cancelText, { onClick: () => close(null) });
    const dlg = h('dialog', { class: `dlg ${danger ? 'danger' : ''}`, 'aria-labelledby': 'dlg-title' });
    const form = h('form', {
      on: {
        submit: (e) => {
          e.preventDefault();
          if (ok.disabled) return;
          if (input && !field.value.trim()) {
            field.focus();
            return;
          }
          close(input ? field.value.trim() : true);
        },
      },
    },
    h('h2', { id: 'dlg-title' }, icon(iconName || (danger ? 'alert' : 'info')), title),
    (Array.isArray(body) ? body : [body]).map((p) => h('p', null, p)),
    extra,
    check ? h('label', { class: 'dlg-check', for: 'dlg-check' }, checkBox, check) : null,
    input ? h('label', { class: 'f-label', for: 'dlg-input' }, h('span', null, input.label || ''), field) : null,
    h('div', { class: 'dlg-actions' }, cancel, ok));
    dlg.append(form);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    function close(v) {
      dlg.close();
      dlg.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    }
    document.body.append(dlg);
    refreshOk();
    dlg.showModal();
    (field || (danger ? cancel : ok)).focus();
    if (field) field.select();
  });
}
const confirmDialog = (o) => openDialog(o).then((v) => v === true);

class ApiError extends Error {
  constructor(msg, data) {
    super(msg);
    this.data = data;
  }
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (method !== 'GET') {
    opts.headers['x-jz-request'] = '1';
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body || {});
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError('连不上建站助手的本机服务，请确认它还在运行。');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError((data && data.error) || `请求失败（${res.status}）`, data);
  return data;
}

function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    return fn(...a);
  };
  return d;
}

// ---------- 状态 ----------
const state = {
  config: null,
  view: 'active',
  search: '',
  clients: [],
  counts: { active: 0, archived: 0, trash: 0 },
  current: null,
  step: 'info',
  pendingSaves: 0,
  saveErrors: new Map(),
  lastSavedAt: null,
  lastPlan: null,
};

const STEPS = [
  { id: 'info', title: '客户信息', en: 'Client' },
  { id: 'accounts', title: '账号与准备', en: 'Accounts' },
  { id: 'workspace', title: '工作环境', en: 'Project files' },
  { id: 'delivery', title: '交付与维护', en: 'Delivery & care' },
];

const app = document.getElementById('app');
let mainEl;
let sidebarEl;

window.addEventListener('beforeunload', (e) => {
  if (state.pendingSaves > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- 顶栏的保存状态 ----------
function beginSave() {
  state.pendingSaves++;
  updateSaveIndicator();
}
function endSave(key, error) {
  state.pendingSaves = Math.max(0, state.pendingSaves - 1);
  if (error) state.saveErrors.set(key, error);
  else {
    state.saveErrors.delete(key);
    state.lastSavedAt = new Date();
  }
  updateSaveIndicator();
}
function markUnsaved(key, msg) {
  state.saveErrors.set(key, msg);
  updateSaveIndicator();
}
function updateSaveIndicator() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.className = 'save-indicator';
  el.disabled = true;
  el.hidden = false;
  if (state.pendingSaves > 0) {
    el.classList.add('saving');
    fill(el, icon('loader', 'spin'), '正在保存…');
  } else if (state.saveErrors.size) {
    el.classList.add('error');
    el.disabled = false;
    el.title = [...state.saveErrors.values()].join('\n');
    fill(el, icon('alert'), `${state.saveErrors.size} 处没保存`);
  } else if (state.lastSavedAt) {
    el.title = '';
    fill(el, icon('check'), `已保存 ${hhmm(state.lastSavedAt)}`);
  } else {
    el.hidden = true;
  }
}
function jumpToError() {
  const bad = document.querySelector('.field-error, .save-state.error');
  if (bad) {
    bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const inp = bad.querySelector && bad.querySelector('input, textarea');
    if (inp) inp.focus({ preventScroll: true });
  } else {
    toast([...state.saveErrors.values()][0] || '没有找到出错的地方', 'error');
  }
}

// ---------- 网址里记住当前客户和步骤：#/JZ-0001/profile ----------
const ROUTE_STEPS = ['info', 'accounts', 'workspace', 'delivery'];
function routeHash() {
  if (!state.current) return '#/';
  return `#/${state.current.id}/${state.step}`;
}
function syncRoute(push) {
  const target = routeHash();
  if (location.hash === target || (target === '#/' && !location.hash)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', target);
}
function parseRoute() {
  const m = /^#\/(JZ-\d{4,6})(?:\/([a-z]+))?$/.exec(location.hash);
  if (!m) return null;
  return { id: m[1], step: ROUTE_STEPS.includes(m[2]) ? m[2] : 'info' };
}
window.addEventListener('popstate', async () => {
  const r = parseRoute();
  if (!r) {
    state.current = null;
    renderSidebar();
    renderMain();
    return;
  }
  state.step = r.step;
  if (!state.current || state.current.id !== r.id) await openClient(r.id, null, { fromRoute: true });
  else renderMain();
});

// ---------- 骨架 ----------
function renderShell() {
  app.replaceChildren();
  const saveEl = h('button', { id: 'save-indicator', class: 'save-indicator', type: 'button', hidden: true, 'aria-live': 'polite', on: { click: jumpToError } });
  const top = h('header', { class: 'topbar' },
    h('h1', null, h('span', { class: 'logo' }, icon('site')), '建站助手'),
    h('span', { class: 'spacer' }),
    saveEl,
    h('span', { class: 'data-hint', title: `数据位置：${state.config.dataDir}` }, `数据：${state.config.dataDir}`),
  );
  sidebarEl = h('aside', { class: 'sidebar', 'aria-label': '客户网站台账' });
  mainEl = h('main', { class: 'main', id: 'main' });
  app.append(top, h('div', { class: 'layout' }, sidebarEl, mainEl));
}

// ---------- 左侧台账 ----------
async function loadClients() {
  const data = await api('GET', `/api/clients?view=${state.view}`);
  state.clients = data.clients;
  state.counts = data.counts;
  renderSidebar();
}

function statusBadge(c) {
  if (c.trashedAt) return h('span', { class: 'badge danger' }, '回收站');
  if (c.archivedAt) return h('span', { class: 'badge muted' }, '已归档');
  if (c.status === 'delivered') return h('span', { class: 'badge delivered' }, icon('check'), '已交付');
  return h('span', { class: 'badge' }, '进行中');
}

let listEl;
function renderClientList() {
  const q = state.search.trim().toLowerCase();
  const shown = state.clients.filter((c) => !q || [c.id, c.name, c.liveUrl, c.contact, c.phone].some((x) => String(x || '').toLowerCase().includes(q)));
  const items = shown.map((c) => {
    if (c.broken) return h('li', null, h('div', { class: 'client-item' }, h('span', { class: 'cid' }, c.id), h('span', { class: 'err-text' }, c.error)));
    return h('li', null,
      h('button', {
        type: 'button',
        class: 'client-item',
        'aria-current': String(!!(state.current && state.current.id === c.id)),
        on: { click: () => openClient(c.id) },
      },
      h('span', { class: 'row1' }, h('span', { class: 'cid' }, c.id), statusBadge(c)),
      h('span', { class: 'cname' }, c.name),
      (c.contact || c.phone) ? h('span', { class: 'cprog' }, [c.contact, c.phone].filter(Boolean).join(' · ')) : null,
      h('span', { class: 'curl' }, c.liveUrl || '还没有线上网址')));
  });
  let empty = null;
  if (!shown.length) {
    empty = h('li', { class: 'empty-note' },
      q ? `没有找到“${state.search.trim()}”。` : state.view === 'active' ? '还没有客户。在上面输入名称，按回车新建。' : state.view === 'archived' ? '没有归档的客户。' : '回收站是空的。');
  }
  fill(listEl, items, empty);
}

function renderSidebar() {
  const input = h('input', { type: 'text', id: 'new-client-name', placeholder: '新客户或网站名称', maxlength: 100, 'aria-label': '新客户名称' });
  const create = async () => {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return toast('先写上客户或网站的名称', 'error');
    }
    try {
      const rec = await api('POST', '/api/clients', { name });
      toast(`已新建 ${rec.id} ${rec.name}`, 'ok');
      input.value = '';
      state.view = 'active';
      state.search = '';
      await loadClients();
      await openClient(rec.id, rec);
      const first = document.getElementById('info-contact');
      if (first) first.focus();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') create();
  });

  const search = h('input', { type: 'search', placeholder: '搜索名称、负责人、电话', value: state.search, 'aria-label': '搜索客户' });
  search.addEventListener('input', () => {
    state.search = search.value;
    renderClientList();
  });

  const tab = (id, label) =>
    h('button', {
      type: 'button',
      'aria-pressed': String(state.view === id),
      on: { click: async () => { state.view = id; await loadClients(); } },
    }, `${label} ${state.counts[id] ?? 0}`);

  listEl = h('ul', { class: 'client-list', 'aria-label': '客户列表' });
  fill(sidebarEl,
    h('div', { class: 'new-client' }, input, btn('新建', { icon: 'plus', variant: 'primary', onClick: create })),
    h('div', { class: 'search-box' }, icon('search'), search),
    h('div', { class: 'view-tabs', role: 'group', 'aria-label': '按状态筛选' }, tab('active', '在做'), tab('archived', '已归档'), tab('trash', '回收站')),
    listEl,
  );
  renderClientList();
}

// ---------- 打开客户 ----------
async function openClient(id, rec, opts = {}) {
  const switching = !state.current || state.current.id !== id;
  try {
    state.current = rec || (await api('GET', `/api/clients/${id}`));
  } catch (e) {
    toast(e.message, 'error');
    if (opts.fromRoute) {
      state.current = null;
      syncRoute(false);
      renderSidebar();
      renderMain();
    }
    return;
  }
  if (switching) {
    state.saveErrors.clear();
    updateSaveIndicator();
    if (!opts.fromRoute) state.step = 'info';
  }
  state.lastPlan = null;
  document.body.classList.add('has-client');
  syncRoute(!opts.fromRoute);
  renderClientList();
  renderMain();
  window.scrollTo(0, 0);
}

async function backToList() {
  state.current = null;
  syncRoute(true);
  renderSidebar();
  renderMain();
}

function inactive() {
  const c = state.current;
  return !!(c && (c.archivedAt || c.trashedAt));
}

function setCurrent(rec) {
  state.current = rec;
  const s = state.clients.find((x) => x.id === rec.id);
  if (s) {
    s.name = rec.name;
    s.liveUrl = rec.liveUrl;
    s.status = rec.status;
    s.contact = rec.info.contact;
    s.phone = rec.info.phone;
  }
}

function stepInfo(c) {
  const core = ['domain', 'gmail', 'github', 'repo', 'vercel', 'registrar'];
  const filled = core.filter((k) => c.env[k]).length;
  const ws = c.workspace;
  const infoFilled = ['contact', 'phone', 'email', 'address'].filter((k) => c.info[k]).length;
  return {
    info: {
      sub: [c.info.contact || '负责人未填', c.info.phone].filter(Boolean).join(' · '),
      done: infoFilled >= 2,
    },
    accounts: { sub: c.env.domain ? `${c.env.domain} · 已填 ${filled}/${core.length}` : `已填 ${filled}/${core.length}`, done: filled === core.length },
    workspace: {
      sub: ws.folder ? ws.folder.split(/[\\/]/).pop() : ws.removed ? '本地文件夹已清理' : '还没建文件夹',
      done: !!(ws.folder ? (ws.lastWrite || ws.restored) : ws.removed),
    },
    delivery: {
      sub: ws.removed && !ws.folder ? `已交付 · 本地已清理` : c.delivery.firstDeliveredAt ? `首次交付 ${c.delivery.firstDeliveredAt}` : '还没交付',
      done: !!c.delivery.firstDeliveredAt,
    },
  };
}

function renderMain() {
  const c = state.current;
  if (!c) {
    document.body.classList.remove('has-client');
    fill(mainEl, h('div', { class: 'welcome' },
      h('h2', null, '建站助手'),
      h('p', null, '帮你和小商家客户一起梳理建站需求、整理给开发者的建站说明、准备项目文档，并记录交付和维护。'),
      h('ul', null,
        h('li', null, '客户信息：名字、负责人、电话、地址、邮箱、费用'),
        h('li', null, '账号与准备：域名、仓库、托管等账号的准备情况'),
        h('li', null, '工作环境：一键建项目文件夹，写好建站规则'),
        h('li', null, '交付与维护：记录交付，检查代码都传到 GitHub 后清理本地文件夹')),
      h('div', { class: 'toolbar' },
        btn('新建客户', { icon: 'plus', variant: 'primary', onClick: () => document.getElementById('new-client-name').focus() }),
        state.clients.length ? h('span', { class: 'muted small' }, '或者在左边选一个客户') : null),
      h('p', { class: 'muted small' }, `数据都存在这台电脑上：${state.config.dataDir}。备份就是复制这个文件夹。`),
      h('p', { class: 'muted small' }, '这个工具不写网站代码、不运行客户网站、不提交也不推送代码；Git 只用来检查上传情况。'),
    ));
    return;
  }

  const head = h('div', { class: 'client-head' },
    btn('客户列表', { icon: 'back', cls: 'back-to-list', onClick: backToList }),
    h('div', { class: 'title' },
      h('h2', null, c.name),
      h('div', { class: 'meta' },
        h('span', null, c.id),
        statusBadge(c),
        c.liveUrl ? extLink(c.liveUrl) : h('span', null, '还没有线上网址'),
      )),
    clientActions(c),
  );

  const banner = inactive()
    ? notice('warn', 'archive',
      h('p', null, c.trashedAt ? `这个客户在回收站里（${fmtTime(c.trashedAt)} 移入）。内容只能查看，恢复后才能修改。` : `这个客户已归档（${fmtTime(c.archivedAt)}）。内容只能查看，恢复后才能修改。`),
      h('div', { class: 'toolbar', style: 'margin:8px 0 0' },
        btn(c.trashedAt ? '从回收站恢复' : '恢复到在做', { icon: 'restore', variant: 'primary', onClick: () => lifecycle(c.trashedAt ? 'restore' : 'unarchive', c.trashedAt ? '已从回收站恢复' : '已从归档恢复') })))
    : null;

  const info = stepInfo(c);
  const steps = h('nav', { class: 'steps', 'aria-label': '建站四个步骤' },
    STEPS.map((s, i) => h('button', {
      type: 'button',
      class: info[s.id].done ? 'done' : '',
      'aria-current': state.step === s.id ? 'step' : 'false',
      'aria-label': `第 ${i + 1} 步，共 4 步：${s.title}，${info[s.id].sub}${info[s.id].done ? '，已完成' : ''}`,
      on: { click: () => goStep(s.id) },
    },
    h('span', { class: 'num' }, info[s.id].done ? icon('check') : i + 1),
    h('span', { class: 't' }, s.title),
    h('span', { class: 'sub' }, info[s.id].sub))));

  const body = h('div', { id: 'step-body' });
  fill(mainEl, head, banner, steps, body);
  renderStep(body);
  syncRoute(false);
}

function clientActions(c) {
  if (inactive()) return null;
  return h('div', { class: 'client-actions' },
    btn('改名', { icon: 'pencil', onClick: renameClient }),
    btn('归档', { icon: 'archive', onClick: archiveClient }),
    btn('删除', { icon: 'trash', variant: 'danger', onClick: trashClient }),
  );
}

async function renameClient() {
  const name = await openDialog({ title: '改名', iconName: 'pencil', input: { label: '客户或网站名称', value: state.current.name, max: 100 }, confirmText: '保存' });
  if (name == null || name === state.current.name) return;
  try {
    setCurrent(await api('PATCH', `/api/clients/${state.current.id}`, { name }));
    toast('已改名', 'ok');
    renderClientList();
    renderMain();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function archiveClient() {
  const c = state.current;
  const ok = await confirmDialog({
    title: `归档 ${c.name}？`,
    iconName: 'archive',
    body: ['归档后从“在做”列表里移走，内容只能查看。随时可以在“已归档”里恢复。'],
    confirmText: '归档',
  });
  if (ok) lifecycle('archive', '已归档，可在“已归档”里恢复');
}

async function trashClient() {
  const c = state.current;
  const ok = await confirmDialog({
    title: `把 ${c.name} 移到回收站？`,
    iconName: 'trash',
    danger: true,
    body: [`${c.id} 的全部记录会移到回收站，随时可以恢复。`, '不会动任何项目文件夹、代码仓库或线上网站。'],
    confirmText: '移到回收站',
  });
  if (ok) lifecycle('trash', '已移到回收站，可在“回收站”里恢复');
}

async function lifecycle(action, okMsg) {
  try {
    const rec = await api('POST', `/api/clients/${state.current.id}/${action}`, {});
    state.current = rec;
    toast(okMsg, 'ok');
    await loadClients();
    renderMain();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function goStep(id) {
  state.step = id;
  syncRoute(true);
  renderMain();
  const cur = mainEl.querySelector('.steps button[aria-current="step"]');
  if (cur) cur.focus({ preventScroll: true });
}

function renderStep(body) {
  if (state.step === 'info') return renderInfo(body);
  if (state.step === 'accounts') return renderAccounts(body);
  if (state.step === 'workspace') return renderWorkspace(body);
  if (state.step === 'delivery') return renderDelivery(body);
}

// ---------- 第 1 步：客户信息 ----------
function renderInfo(body) {
  const c = state.current;
  const ro = inactive();
  const info = { ...c.info };
  const infoState = h('span', { class: 'save-state', role: 'status' }, '改动会自动保存');
  const errKey = `${c.id}:info`;

  const saveInfo = debounce(async () => {
    const bad = Object.values(info).map(detectSecret).find(Boolean);
    if (bad) {
      infoState.textContent = `有疑似${bad.kind}，没有保存。请删掉。`;
      infoState.classList.add('error');
      markUnsaved(errKey, `客户信息：疑似${bad.kind}，没有保存`);
      return;
    }
    beginSave();
    infoState.textContent = '正在保存…';
    try {
      setCurrent(await api('PUT', `/api/clients/${c.id}/info`, info));
      infoState.textContent = `已保存 ${hhmm(new Date())}`;
      infoState.classList.remove('error');
      renderClientList();
      endSave(errKey);
    } catch (e) {
      infoState.textContent = e.message;
      infoState.classList.add('error');
      endSave(errKey, `客户信息：${e.message}`);
    }
  }, 700);

  const field = (k, label, opts = {}) => {
    const id = `info-${k}`;
    const el = opts.multiline
      ? h('textarea', { id, rows: opts.rows || 2, maxlength: opts.max || 500, disabled: ro, placeholder: opts.ph || '' })
      : h('input', { id, type: 'text', maxlength: opts.max || 200, disabled: ro, placeholder: opts.ph || '', autocomplete: 'off' });
    el.value = info[k] || '';
    el.addEventListener('input', () => { info[k] = el.value; saveInfo(); });
    el.addEventListener('blur', () => saveInfo.flush());
    return h('label', { class: `f-label ${opts.full ? 'full' : ''}`, for: id }, h('span', null, label), el);
  };

  // 名称单独保存（改名也会同步到台账）
  const nameInput = h('input', { id: 'info-name', type: 'text', maxlength: 100, value: c.name, disabled: ro, autocomplete: 'off' });
  nameInput.addEventListener('change', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.value = state.current.name;
      return toast('名称不能为空', 'error');
    }
    if (name === state.current.name) return;
    try {
      setCurrent(await api('PATCH', `/api/clients/${c.id}`, { name }));
      toast('已改名', 'ok');
      renderClientList();
      const t = mainEl.querySelector('.client-head h2');
      if (t) t.textContent = name;
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  body.replaceChildren(
    h('div', { class: 'panel' },
      h('h3', null, '客户基本信息', h('span', { class: 'en' }, '台账用，不写进网站文件')),
      h('div', { class: 'grid2' },
        h('label', { class: 'f-label', for: 'info-name' }, h('span', null, '客户或网站名称'), nameInput),
        field('contact', '负责人', { ph: '客户那边对接的人' }),
        field('phone', '电话'),
        field('email', '邮箱'),
        field('address', '地址', { full: true }),
        field('fee', '费用', { full: true, multiline: true, max: 500, ph: '例如：建站 1500 美元，已付一半；域名每年约 20 美元由客户付' })),
      h('div', { class: 'toolbar', style: 'margin:12px 0 0' }, infoState),
      h('p', { class: 'muted small', style: 'margin:6px 0 0' }, '不要在这里记密码、令牌或密钥。')),
  );
}

// ---------- 第 3 步：工作环境 ----------
const FILE_STATUS = {
  new: ['新建', 'badge delivered'],
  same: ['内容相同，不用改', 'badge muted'],
  conflict: ['已有同名的不同内容', 'badge warn'],
  blocked: ['不能写入', 'badge danger'],
};
const WRITE_OUTCOME = {
  created: ['已新建', 'badge delivered'],
  overwritten: ['已覆盖', 'badge warn'],
  savedAs: ['已另存', 'badge delivered'],
  unchanged: ['没变化', 'badge muted'],
  skipped: ['跳过', 'badge muted'],
  conflict: ['没写入', 'badge danger'],
  failed: ['失败', 'badge danger'],
};

function resultList(results) {
  return h('ul', { class: 'result-list' }, results.map((x) => h('li', null,
    h('span', { class: WRITE_OUTCOME[x.outcome][1] }, WRITE_OUTCOME[x.outcome][0]),
    h('span', { class: 'path' }, x.savedAs || x.rel),
    x.detail ? h('span', { class: 'muted small' }, x.detail) : null)));
}

function safeFolderName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || '新客户';
}

function renderWorkspace(body) {
  const c = state.current;
  const ro = inactive();
  const ws = c.workspace;
  const planBox = h('div');
  const resultBox = h('div');

  // 写入建站规则：先列现状，再按选择写
  async function plan(folder) {
    resultBox.replaceChildren();
    try {
      const r = await api('POST', `/api/clients/${c.id}/workspace/plan`, { folder });
      setCurrent(r.record);
      drawPlan(r);
    } catch (e) {
      planBox.replaceChildren(notice('danger', 'alert', h('p', null, e.message)));
    }
  }

  function drawPlan(r) {
    const pick = {};
    const rows = r.files.map((f) => {
      let choice;
      if (f.status === 'new') {
        const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': `生成 ${f.rel}` });
        pick[f.key] = () => (cb.checked ? 'write' : 'skip');
        choice = h('label', { class: 'small', style: 'display:inline-flex;gap:6px;align-items:center' }, cb, '生成');
      } else if (f.status === 'conflict') {
        const sel = h('select', { 'aria-label': `${f.rel} 怎么处理` },
          h('option', { value: 'skip' }, '取消（不动这个文件）'),
          h('option', { value: 'newVersion' }, '另存新版本（原文件不动）'),
          h('option', { value: 'overwrite' }, '覆盖（旧内容先备份）'));
        pick[f.key] = () => sel.value;
        choice = sel;
      } else {
        pick[f.key] = () => 'skip';
        choice = h('span', { class: 'muted small' }, f.status === 'blocked' ? f.reason : '不需要操作');
      }
      return h('tr', null,
        h('td', null, h('div', null, f.title), h('div', { class: 'path' }, f.rel)),
        h('td', null, h('span', { class: FILE_STATUS[f.status][1] }, FILE_STATUS[f.status][0])),
        h('td', null, choice));
    });

    async function write() {
      const choices = {};
      const expected = {};
      for (const f of r.files) {
        choices[f.key] = pick[f.key]();
        if (f.existingHash) expected[f.key] = f.existingHash;
      }
      const n = Object.values(choices).filter((x) => x !== 'skip').length;
      if (n === 0) return toast('没有要写入的文件', 'error');
      const over = Object.values(choices).filter((x) => x === 'overwrite').length;
      const ok = await confirmDialog({
        title: `写入 ${n} 个文件？`,
        iconName: 'file',
        danger: over > 0,
        body: [`位置：${r.folder}`, over ? `其中覆盖 ${over} 个：旧内容会先备份到建站助手的数据文件夹。` : '不会改动或删除文件夹里已有的其他文件。'],
        confirmText: '写入',
      });
      if (!ok) return;
      try {
        const out = await api('POST', `/api/clients/${c.id}/workspace/write`, { folder: r.folder, choices, expected });
        setCurrent(out.record);
        planBox.replaceChildren();
        const bad = out.results.filter((x) => ['failed', 'conflict'].includes(x.outcome)).length;
        toast(bad ? '规则文件没写入，见上面的说明' : '建站规则已写好', bad ? 'error' : 'ok');
        renderMain();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    planBox.replaceChildren(h('div', { class: 'panel' },
      h('h3', null, '将要写入的文件'),
      h('p', { class: 'small' }, '项目文件夹：', h('span', { class: 'path' }, r.folder)),
      h('table', { class: 'plan-table' },
        h('thead', null, h('tr', null, h('th', null, '文件'), h('th', null, '现状'), h('th', null, '怎么处理'))),
        h('tbody', null, rows)),
      h('div', { class: 'toolbar', style: 'margin-top:12px' },
        btn('确认写入', { icon: 'check', variant: 'primary', onClick: write }),
        btn('取消', { onClick: () => planBox.replaceChildren() }))));
    planBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // 已有文件夹的选择器（路径 + 浏览）
  function folderPicker(initial) {
    const input = h('input', { type: 'text', id: 'ws-folder', value: initial || '', placeholder: '粘贴完整路径，或点“浏览”', disabled: ro });
    const browser = h('div', { class: 'dir-browser', hidden: true });
    async function browse(p) {
      try {
        const d = await api('GET', `/api/fs/list?path=${encodeURIComponent(p || '')}`);
        browser.hidden = false;
        fill(browser,
          h('div', { class: 'cur' },
            d.path ? h('span', { class: 'path' }, d.path) : h('span', null, '允许的范围'),
            d.path ? btn('选这个文件夹', { icon: 'check', small: true, variant: 'primary', onClick: () => { input.value = d.path; browser.hidden = true; input.focus(); } }) : null,
            d.parent ? btn('上一级', { icon: 'up', small: true, onClick: () => browse(d.parent) }) : d.path ? btn('回到范围列表', { icon: 'up', small: true, onClick: () => browse('') }) : null,
            btn('关闭', { icon: 'x', small: true, variant: 'ghost', onClick: () => { browser.hidden = true; } })),
          d.dirs.length ? d.dirs.map((x) => h('button', { type: 'button', class: 'dir', on: { click: () => browse(x.path) } }, icon('folder'), x.name)) : h('div', { class: 'empty-note', style: 'padding:6px 12px' }, '没有子文件夹'));
      } catch (e) {
        toast(e.message, 'error');
      }
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') plan(input.value.trim()); });
    return {
      input,
      el: h('div', null,
        h('div', { class: 'new-client' }, input, btn('浏览', { icon: 'folder', disabled: ro, onClick: () => browse(input.value.trim()) })),
        browser),
    };
  }

  const parts = [
    notice('', 'info',
      h('p', null, '一键建好项目文件夹，写入 ', h('strong', null, 'CLAUDE.md'), '（建站规则，要求先用 UI UX Pro Max 定设计）。'),
      h('p', null, '之后用 Claude Code 打开这个文件夹开工。建站助手不运行网站代码、不安装依赖、不提交也不推送代码。')),
  ];

  if (ws.removed && !ws.folder) {
    const rm = ws.removed;
    parts.push(notice('', 'check',
      h('p', null, h('strong', null, `本地文件夹已于 ${fmtTime(rm.at)} 移到回收站。`)),
      h('p', { class: 'small' }, h('span', { class: 'path' }, rm.folder)),
      h('p', { class: 'small' }, `当时的提交 ${rm.head}${rm.branch ? `（${rm.branch} 分支）` : ''}，代码在：`, rm.remote ? extLink(rm.remote) : '（没记下远程地址）'),
      h('p', { class: 'small muted' }, '要继续改网站，就再建一个文件夹，从 GitHub 把代码取回来。')));
  }

  if (ws.folder) {
    const last = ws.lastWrite && ws.lastWrite.folder === ws.folder ? ws.lastWrite : null;
    parts.push(h('div', { class: 'panel' },
      h('h3', null, '项目文件夹'),
      h('p', { class: 'path', style: 'margin:0 0 12px' }, ws.folder),
      last ? h('div', { class: 'small muted' }, `上次写入 ${fmtTime(last.at)}`, resultList(last.results)) : h('p', { class: 'muted small' }, '还没往这个文件夹写过建站规则。'),
      h('div', { class: 'toolbar', style: 'margin:12px 0 0' },
        btn('重新写入建站规则', { icon: 'refresh', variant: 'primary', disabled: ro, onClick: () => plan(ws.folder) }),
        btn('换一个文件夹', {
          icon: 'folder', disabled: ro,
          onClick: async () => {
            const ok = await confirmDialog({ title: '换一个文件夹？', iconName: 'folder', body: ['只是不再关联现在这个文件夹，文件夹和里面的东西都不动。'], confirmText: '换' });
            if (!ok) return;
            try {
              setCurrent(await api('POST', `/api/clients/${c.id}/workspace/unlink`, {}));
              renderMain();
            } catch (e) {
              toast(e.message, 'error');
            }
          },
        }))));
  } else {
    const roots = state.config.workspaceRoots;
    const parentSel = h('select', { id: 'ws-parent', disabled: ro }, roots.map((r) => h('option', { value: r }, r)));
    const nameInput = h('input', { id: 'ws-name', type: 'text', maxlength: 80, value: safeFolderName(c.name), disabled: ro, autocomplete: 'off' });
    const create = async () => {
      try {
        const r = await api('POST', `/api/clients/${c.id}/workspace/create`, { parent: parentSel.value, name: nameInput.value.trim() });
        setCurrent(r.record);
        toast(`已建好 ${r.folder}，建站规则已写入`, 'ok');
        renderMain();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
    const picker = folderPicker('');
    parts.push(h('div', { class: 'panel' },
      h('h3', null, '新建项目文件夹'),
      h('div', { class: 'grid2' },
        h('label', { class: 'f-label', for: 'ws-parent' }, h('span', null, '建在哪里'), parentSel),
        h('label', { class: 'f-label', for: 'ws-name' }, h('span', null, '文件夹名'), nameInput)),
      h('ul', { class: 'file-list', 'aria-label': '会写入的文件' }, h('li', null, icon('file'), 'CLAUDE.md（建站规则）')),
      btn('建立文件夹并写入规则', { icon: 'plus', variant: 'primary', disabled: ro, onClick: create })),
    h('details', { class: 'panel' },
      h('summary', null, '用已有的文件夹'),
      h('div', { style: 'margin-top:12px' },
        h('label', { class: 'f-label', for: 'ws-folder' }, h('span', null, '项目文件夹'), h('small', null, `只能选这个范围里的文件夹：${roots.join('；')}`)),
        picker.el,
        h('div', { style: 'margin-top:10px' }, btn('检查并写入建站规则', { icon: 'search', disabled: ro, onClick: () => plan(picker.input.value.trim()) })))));
  }

  parts.push(planBox, resultBox, renderRulesTemplate(ro));
  fill(body, parts);
}

// 规则模板：所有客户共用
function renderRulesTemplate(ro) {
  const box = h('details', { class: 'panel internal' }, h('summary', null, '规则模板（所有客户共用，写进 CLAUDE.md）'));
  const area = h('textarea', { class: 'code-editor', rows: 20, maxlength: 50000, disabled: ro, spellcheck: 'false', 'aria-label': '规则模板' });
  const stateEl = h('span', { class: 'save-state' });
  let loaded = null;
  box.addEventListener('toggle', async () => {
    if (!box.open || loaded) return;
    try {
      loaded = await api('GET', '/api/rules-template');
      area.value = loaded.text;
      stateEl.textContent = loaded.custom ? '用的是你改过的模板' : '用的是默认模板';
    } catch (e) {
      stateEl.textContent = e.message;
    }
  });
  async function save(text) {
    try {
      loaded = await api('PUT', '/api/rules-template', { text });
      area.value = loaded.text;
      stateEl.textContent = `已保存 ${hhmm(new Date())}。以后写入的 CLAUDE.md 用这一版；已经写好的文件不会自动改。`;
      toast('规则模板已保存', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  box.append(h('div', { style: 'margin-top:12px' },
    h('p', { class: 'small muted', style: 'margin-top:0' }, '可以用 {{店名}} 和 {{编号}}，写入时会换成客户的名称和编号。'),
    area,
    h('div', { class: 'toolbar', style: 'margin:10px 0 0' },
      btn('保存模板', { icon: 'save', variant: 'primary', disabled: ro, onClick: () => save(area.value) }),
      btn('恢复默认', {
        icon: 'restore', disabled: ro,
        onClick: async () => {
          if (!loaded) return;
          const ok = await confirmDialog({ title: '恢复默认规则模板？', iconName: 'restore', body: ['你改过的模板会被默认内容替换。'], confirmText: '恢复默认' });
          if (ok) save(loaded.defaultText);
        },
      }),
      stateEl)));
  return box;
}

// ---------- 第 4 步里的：下载继续修改 ----------
// 本地没有项目文件夹时（例如交付后清理掉了），从 GitHub 把代码下载到一个新文件夹，接着改
function renderCloneForm(c, ro) {
  const ws = c.workspace;
  const roots = state.config.workspaceRoots;
  const removedName = ws.removed && ws.removed.folder ? ws.removed.folder.split(/[\\/]/).pop() : '';
  const defaultUrl = (c.env.repo || c.delivery.repoUrl || (ws.removed && ws.removed.remote) || '').replace(/\.git$/, '');
  const parentSel = h('select', { id: 'clone-parent', disabled: ro }, roots.map((r) => h('option', { value: r }, r)));
  const nameInput = h('input', { id: 'clone-name', type: 'text', maxlength: 80, value: removedName || safeFolderName(c.name), disabled: ro, autocomplete: 'off' });
  const urlInput = h('input', { id: 'clone-url', type: 'text', maxlength: 500, value: defaultUrl, placeholder: 'https://github.com/店的账号/仓库名', disabled: ro, autocomplete: 'off', spellcheck: 'false', class: 'mono' });
  const go = btn('下载，继续修改', { icon: 'download', variant: 'primary', disabled: ro });
  go.addEventListener('click', async () => {
    if (!/^https:\/\/\S+$/i.test(urlInput.value.trim())) {
      urlInput.focus();
      return toast('仓库地址要以 https:// 开头', 'error');
    }
    go.disabled = true;
    fill(go, icon('loader', 'spin'), '正在下载…');
    try {
      const r = await api('POST', `/api/clients/${c.id}/repo/clone`, { parent: parentSel.value, name: nameInput.value.trim(), url: urlInput.value.trim() });
      setCurrent(r.record);
      toast(`已下载到 ${r.folder}（提交 ${r.head}），可以接着改了`, 'ok');
      renderMain();
    } catch (e) {
      toast(e.message, 'error');
      go.disabled = false;
      fill(go, icon('download'), '下载，继续修改');
    }
  });
  return h('div', { class: 'clone-box' },
    h('h3', null, '下载继续修改', h('span', { class: 'en' }, '从 GitHub 把最新代码下载到本地一个新文件夹，之后用 Claude Code 打开接着改')),
    h('div', { class: 'grid2' },
      h('label', { class: 'f-label full', for: 'clone-url' }, h('span', null, '仓库地址'), urlInput),
      h('label', { class: 'f-label', for: 'clone-parent' }, h('span', null, '下载到哪里'), parentSel),
      h('label', { class: 'f-label', for: 'clone-name' }, h('span', null, '文件夹名'), nameInput)),
    h('p', { class: 'small muted', style: 'margin:8px 0 10px' }, '只下载代码，不改 GitHub 上的东西。只在本地的文件（.env.local、_原素材/ 等）不在 GitHub 上，需要的话另外放回去。'),
    go);
}

// ---------- 第 4 步里的：上传检查和清理本地文件夹 ----------
function renderRepoPanel(c, ro) {
  const ws = c.workspace;
  const panel = h('div', { class: 'panel' }, h('h3', null, '上传检查和清理本地文件夹'));
  if (!ws.folder) {
    if (ws.removed) {
      panel.append(notice('', 'check',
        h('p', null, `本地文件夹已于 ${fmtTime(ws.removed.at)} 移到回收站（提交 ${ws.removed.head}）。`),
        h('p', { class: 'small' }, '代码在：', ws.removed.remote ? extLink(ws.removed.remote) : '（没记下远程地址）')));
    } else {
      panel.append(h('p', { class: 'muted' }, '还没有关联项目文件夹。先在“工作环境”里建一个或选一个；代码已经在 GitHub 上的，也可以直接下载。'));
    }
    panel.append(renderCloneForm(c, ro));
    return panel;
  }

  const lc = ws.lastCheck && ws.lastCheck.folder === ws.folder ? ws.lastCheck : null;
  const delivered = !!c.delivery.firstDeliveredAt;
  const checkBtn = btn('检查 GitHub 上传', { icon: 'search', variant: lc && lc.ok ? '' : 'primary', disabled: ro });
  const removeBtn = btn('删除本地文件夹', { icon: 'trash', variant: 'danger', disabled: ro || !delivered || !(lc && lc.ok) });

  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    fill(checkBtn, icon('loader', 'spin'), '正在检查…');
    try {
      const r = await api('POST', `/api/clients/${c.id}/repo/check`, {});
      setCurrent(r.record);
      toast(r.check.ok ? '检查通过：代码都在 GitHub 上了' : `有 ${r.check.issues.length} 个问题，见检查结果`, r.check.ok ? 'ok' : 'error');
    } catch (e) {
      toast(e.message, 'error');
    }
    renderMain();
  });

  removeBtn.addEventListener('click', async () => {
    const base = ws.folder.split(/[\\/]/).pop();
    const localOnly = (lc && lc.localOnly) || [];
    const value = await openDialog({
      title: '把本地文件夹移到回收站？',
      iconName: 'trash',
      danger: true,
      body: [
        `位置：${ws.folder}`,
        '删除前会当场再检查一次 GitHub，不通过就不删。',
        'node_modules、.next 这类能重新安装或生成的直接删除；其余整个文件夹移到 Windows 回收站，需要时可以还原。',
      ],
      extra: localOnly.length ? h('div', { class: 'dlg-list' },
        h('p', null, h('strong', null, `下面 ${localOnly.length} 项没上传到 GitHub，会一起被删：`)),
        h('ul', null, localOnly.slice(0, 30).map((x) => h('li', { class: 'path' }, x)), localOnly.length > 30 ? h('li', null, `……还有 ${localOnly.length - 30} 项`) : null)) : null,
      check: localOnly.length ? `我知道这 ${localOnly.length} 项只在本地，会一起删掉` : null,
      input: { label: `输入文件夹名“${base}”确认`, value: '', placeholder: base, max: 200 },
      requireText: base,
      confirmText: '移到回收站',
    });
    if (value == null) return;
    removeBtn.disabled = true;
    fill(removeBtn, icon('loader', 'spin'), '正在删除…');
    try {
      const r = await api('POST', `/api/clients/${c.id}/repo/remove`, { confirmName: value, ackLocalOnly: localOnly.length > 0 });
      setCurrent(r.record);
      toast('本地文件夹已移到回收站', 'ok');
    } catch (e) {
      if (e.data && e.data.check) {
        try {
          setCurrent(await api('GET', `/api/clients/${c.id}`));
        } catch {
          /* 忽略 */
        }
      }
      toast(e.message, 'error');
    }
    renderMain();
  });

  const why = !delivered ? '先在上面记录交付，才能删除本地文件夹。' : !lc ? '先检查一次 GitHub 上传。' : !lc.ok ? '检查没通过，处理好上面的问题再检查。' : '检查通过，可以删除本地文件夹。';

  panel.append(
    h('p', { class: 'path', style: 'margin:0 0 10px' }, ws.folder),
    lc ? h('div', { class: 'check-result' },
      h('p', { class: 'small muted', style: 'margin:0 0 6px' }, `检查时间 ${fmtTime(lc.checkedAt)}${lc.head ? ` · 提交 ${lc.head}` : ''}${lc.branch ? `（${lc.branch}）` : ''}`),
      h('ul', { class: 'check-list' },
        lc.passed.map((x) => h('li', { class: 'ok' }, icon('check'), x)),
        lc.issues.map((x) => h('li', { class: 'bad' }, icon('x'), x)),
        lc.notes.map((x) => h('li', { class: 'note' }, icon('info'), x))),
      lc.localOnly.length ? h('details', null, h('summary', null, `只在本地的 ${lc.localOnly.length} 项`), h('ul', { class: 'small' }, lc.localOnly.slice(0, 50).map((x) => h('li', { class: 'path' }, x)))) : null)
      : null,
    h('div', { class: 'toolbar', style: 'margin:12px 0 4px' }, checkBtn, removeBtn),
    h('p', { class: 'small muted', style: 'margin:0' }, why),
  );
  return panel;
}

// ---------- 第 2 步：账号与准备 ----------
// 固定的账号清单：只填账号名；“你自己核实”是提醒，建站助手查不到这些账号，所以不显示状态。
const ENV_ROWS = [
  { k: 'gmail', label: 'Gmail', check: '能收验证邮件', en: 'Gmail', use: 'The accounts below are registered with it' },
  { k: 'github', label: 'GitHub', check: '你是仓库协作者，能推送', en: 'GitHub', use: 'Holds your website code' },
  { k: 'repo', label: '主仓库', ph: 'https://github.com/店的账号/仓库名', check: '只有这一个仓库：网站代码 + 压缩后的图片', en: 'Code repository', use: 'Website code and images' },
  { k: 'vercel', label: 'Vercel', check: '已连上客户 GitHub、能导入仓库', en: 'Vercel', use: 'Puts the website online' },
  { k: 'registrar', label: '域名注册商', check: '域名在客户名下、开启自动续费', en: 'Domain registrar', use: 'Where your domain is registered' },
  { k: 'resend', label: 'Resend', ph: '不用就空着', check: '发件域名验证；要用才填', en: 'Resend', use: 'Sends emails from the website' },
  { k: 'supabase', label: 'Supabase', ph: '不用就空着', check: '项目在客户账号下；要用才填', en: 'Supabase', use: 'Stores website data' },
];

function renderAccounts(body) {
  const c = state.current;
  const ro = inactive();
  const env = { ...c.env };
  const stateEl = h('span', { class: 'save-state', role: 'status' }, '改动会自动保存');
  const errKey = `${c.id}:env`;

  const save = debounce(async () => {
    const bad = Object.values(env).map(detectSecret).find(Boolean);
    let problem = bad ? `有疑似${bad.kind}，没有保存。这里只写账号名，不写密码。` : '';
    if (!problem && env.repo && !/^https?:\/\/\S+$/i.test(env.repo)) problem = '主仓库要填完整网址（https:// 开头），没有保存';
    if (!problem && env.domainPrice && !/^\$?\d{1,6}(\.\d{1,2})?$/.test(env.domainPrice.trim())) problem = '域名价格只填数字，例如 12.99，没有保存';
    if (problem) {
      stateEl.textContent = problem;
      stateEl.classList.add('error');
      markUnsaved(errKey, `账号与准备：${problem}`);
      return;
    }
    beginSave();
    stateEl.textContent = '正在保存…';
    try {
      setCurrent(await api('PUT', `/api/clients/${c.id}/env`, env));
      stateEl.textContent = `已保存 ${hhmm(new Date())}`;
      stateEl.classList.remove('error');
      endSave(errKey);
    } catch (e) {
      stateEl.textContent = e.message;
      stateEl.classList.add('error');
      endSave(errKey, `账号与准备：${e.message}`);
    }
  }, 700);

  const input = (k, opts = {}) => {
    const el = h('input', {
      id: `env-${k}`, type: 'text', value: env[k] || '', disabled: ro, autocomplete: 'off', spellcheck: 'false',
      maxlength: k === 'repo' ? 500 : k === 'domain' ? 253 : k === 'domainPrice' ? 20 : 200,
      placeholder: opts.ph || '', class: opts.mono ? 'mono' : null, inputmode: k === 'domainPrice' ? 'decimal' : null,
    });
    el.addEventListener('input', () => { env[k] = el.value; save(); });
    el.addEventListener('blur', () => save.flush());
    return el;
  };

  body.replaceChildren(
    notice('', 'info', h('p', null, '账号由你提前手动准备，客户拥有全部账号、自己付平台费。这里都是你人工填写、自己核实：建站助手查不到这些账号，所以不显示状态，不记密码、不登录任何账号。')),
    h('div', { class: 'panel' },
      h('h3', null, '域名'),
      h('div', { class: 'grid2' },
        h('label', { class: 'f-label', for: 'env-domain' }, h('span', null, '买好的域名'), input('domain', { ph: '例如 example.com', mono: true })),
        h('label', { class: 'f-label', for: 'env-domainPrice' }, h('span', null, '购买价格（每年，可不填）'), input('domainPrice', { ph: '例如 12.99' }),
          h('small', null, '填了，报告写这个数；没填，报告写“$15–30 / 年”。')))),
    h('div', { class: 'panel' },
      h('h3', null, '账号清单', h('span', { class: 'en' }, '都不强制：有什么环境就填什么，留空不挡你建环境，报告和建站规则里也就不写它。')),
      h('div', { class: 'env-table', role: 'table', 'aria-label': '账号清单' },
        h('div', { class: 'env-row head', role: 'row' },
          h('span', { role: 'columnheader' }, '账号'), h('span', { role: 'columnheader' }, '账号名'), h('span', { role: 'columnheader' }, '你自己核实')),
        ENV_ROWS.map((r) => h('div', { class: 'env-row', role: 'row' },
          h('label', { class: 'env-name', for: `env-${r.k}`, role: 'rowheader' }, r.label),
          h('span', { role: 'cell' }, input(r.k, { ph: r.ph, mono: true })),
          h('span', { class: 'env-check', role: 'cell' }, r.check)))),
      h('p', { class: 'small muted', style: 'margin:12px 0 0' }, 'Resend、Supabase 填了，建站规则才写进去；记得在 Vercel 加它们的环境变量。'),
      h('div', { class: 'toolbar', style: 'margin:8px 0 0' }, stateEl)),
  );
}

// ---------- 第 4 步：交付与维护 ----------
function renderDelivery(body) {
  const c = state.current;
  const d = c.delivery;
  const ro = inactive();
  const stateEl = h('span', { class: 'save-state' }, '改动会自动保存');
  const form = {
    siteName: d.siteName || '',
    siteUrl: c.liveUrl || '',
    repoUrl: d.repoUrl || '',
    scope: d.scope || '',
    customerKeeps: d.customerKeeps || '',
    maintenanceMethod: d.maintenanceMethod || '',
    warrantyDays: d.warrantyDays ?? 30,
    platforms: (d.platforms || []).map((p) => ({ ...p })),
    price: d.price || '',
    paymentTerms: d.paymentTerms || '',
    notIncluded: d.notIncluded || '',
    providerName: d.providerName || '',
    clientSigner: d.clientSigner || c.info.contact || '',
  };

  const save = debounce(async () => {
    for (const k of ['siteUrl', 'repoUrl']) {
      if (form[k] && !/^https?:\/\/\S+$/i.test(form[k])) {
        stateEl.textContent = '网址要以 http:// 或 https:// 开头，没有保存';
        stateEl.classList.add('error');
        markUnsaved(`${c.id}:delivery`, '交付信息：网址要以 http:// 或 https:// 开头');
        return;
      }
    }
    for (const p of form.platforms) {
      if (p.sourceUrl && !/^https?:\/\/\S+$/i.test(p.sourceUrl)) {
        stateEl.textContent = '核实来源要填以 http(s):// 开头的网址，没有保存';
        stateEl.classList.add('error');
        markUnsaved(`${c.id}:delivery`, '交付信息：核实来源要填以 http(s):// 开头的网址');
        return;
      }
    }
    const s = [form.siteName, form.scope, form.customerKeeps, form.maintenanceMethod, form.price, form.paymentTerms, form.notIncluded, form.providerName, form.clientSigner, ...form.platforms.flatMap((p) => [p.name, p.purpose, p.cost])].map(detectSecret).find(Boolean);
    if (s) {
      stateEl.textContent = `有疑似${s.kind}，没有保存。请删掉。`;
      stateEl.classList.add('error');
      markUnsaved(`${c.id}:delivery`, `交付信息：疑似${s.kind}，没有保存`);
      return;
    }
    beginSave();
    stateEl.textContent = '正在保存…';
    try {
      const rec = await api('PUT', `/api/clients/${c.id}/delivery`, form);
      setCurrent(rec);
      stateEl.textContent = `已自动保存 ${fmtTime(rec.updatedAt)}`;
      stateEl.classList.remove('error');
      renderClientList();
      endSave(`${c.id}:delivery`);
    } catch (e) {
      stateEl.textContent = e.message;
      stateEl.classList.add('error');
      endSave(`${c.id}:delivery`, `交付信息：${e.message}`);
    }
  }, 700);

  const field = (k, label, opts = {}) => {
    const el = opts.multiline
      ? h('textarea', { rows: opts.rows || 3, maxlength: opts.max || 4000, disabled: ro, placeholder: opts.ph || '' })
      : h('input', { type: opts.type || 'text', maxlength: opts.max || 500, disabled: ro, placeholder: opts.ph || '', min: opts.min });
    el.value = form[k];
    el.addEventListener('input', () => {
      form[k] = opts.type === 'number' ? Math.max(0, parseInt(el.value || '0', 10) || 0) : el.value;
      save();
    });
    el.addEventListener('blur', () => save.flush());
    return h('label', { class: `f-label ${opts.full ? 'full' : ''}` }, h('span', null, label), opts.hint ? h('small', null, opts.hint) : null, el);
  };

  const scopeField = field('scope', '网站功能范围', { multiline: true, full: true, ph: '例如：首页、产品目录、关于我们、联系 / 询价；手机适配；询价表单' });
  // “不包含”清单
  const notIncludedField = field('notIncluded', '不包含的内容', { multiline: true, full: true, rows: 6, max: 4000, ph: '点下面的按钮填入常用清单，再删掉客户其实买了的几项' });
  const fillNotIncluded = () => {
    const el = notIncludedField.querySelector('textarea');
    if (el.value.trim()) return toast('这一栏已经有内容了，常用清单只在空的时候填入', 'error');
    form.notIncluded = NOT_INCLUDED_DEFAULT;
    el.value = form.notIncluded;
    save.flush();
  };

  // 平台和费用
  const platBox = h('div', { class: 'rows' });
  function drawPlatforms() {
    platBox.replaceChildren(...form.platforms.map((p, i) => {
      const inp = (k, label, cls, type, ph) => {
        const el = h('input', { type: type || 'text', value: p[k] || '', disabled: ro, placeholder: ph || '', maxlength: k === 'sourceUrl' ? 500 : 200 });
        el.addEventListener('input', () => { p[k] = el.value; save(); });
        el.addEventListener('blur', () => save.flush());
        return h('label', { class: `f ${cls || ''}` }, h('span', null, label), el);
      };
      return h('div', { class: 'row-card' },
        inp('name', '平台', '', '', '例如 Vercel'),
        inp('purpose', '用途', 'w2', '', '例如 网站托管'),
        inp('cost', '费用说明', 'w3', '', '例如 免费档 / 每年约 X 美元'),
        inp('sourceUrl', '核实来源（服务商价格页网址）', 'w3', 'url', 'https://...'),
        inp('verifiedOn', '核实日期', 'w2', 'date'),
        h('div', { class: 'actions' }, btn('删掉', { icon: 'trash', small: true, variant: 'danger', disabled: ro, label: `删掉平台 ${p.name || ''}`, onClick: () => { form.platforms.splice(i, 1); drawPlatforms(); save.flush(); } })));
    }));
  }
  drawPlatforms();

  // 交付操作
  const dateInput = h('input', { type: 'date', value: state.config.today || today(), disabled: ro, 'aria-label': '交付日期', style: 'width:auto' });
  const noteInput = h('input', { type: 'text', maxlength: 1000, placeholder: '这次交付了什么（可不填）', disabled: ro, 'aria-label': '交付说明', style: 'flex:1 1 200px;width:auto' });
  async function deliver() {
    if (!dateInput.value) return toast('请选交付日期', 'error');
    const first = !d.firstDeliveredAt;
    const ok = await confirmDialog({
      title: first ? `记录首次交付：${dateInput.value}` : `再记一次交付：${dateInput.value}`,
      iconName: 'send',
      body: first
        ? ['售后期从这一天起算。以后再交付或重新打开都不会改这个日期；真记错了可以用“更正售后起算日”并写明原因。']
        : [`售后起算日仍是首次交付的 ${d.firstDeliveredAt}，不会改。`],
      confirmText: '记录交付',
    });
    if (!ok) return;
    try {
      setCurrent(await api('POST', `/api/clients/${c.id}/delivery/deliver`, { date: dateInput.value, note: noteInput.value }));
      toast('已记录交付', 'ok');
      await loadClients();
      renderMain();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  async function reopen() {
    const ok = await confirmDialog({
      title: '重新打开这个项目？',
      iconName: 'restore',
      body: ['状态改回“进行中”。售后起算日不变。'],
      confirmText: '重新打开',
    });
    if (!ok) return;
    try {
      setCurrent(await api('POST', `/api/clients/${c.id}/delivery/reopen`, {}));
      toast('已重新打开，售后起算日不变', 'ok');
      await loadClients();
      renderMain();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  const corrDate = h('input', { type: 'date', disabled: ro, 'aria-label': '正确的起算日', style: 'width:auto' });
  const corrReason = h('input', { type: 'text', maxlength: 500, placeholder: '必须写原因，例如：当时日期记错了', disabled: ro, 'aria-label': '更正原因', style: 'flex:1 1 200px;width:auto' });
  async function correctStart() {
    try {
      setCurrent(await api('POST', `/api/clients/${c.id}/delivery/correct-start`, { date: corrDate.value, reason: corrReason.value }));
      toast('已更正售后起算日，并记下了原因', 'ok');
      renderMain();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const statusPanel = h('div', { class: 'panel' },
    h('h3', null, '交付状态'),
    h('dl', { class: 'kv' },
      h('dt', null, '状态'), h('dd', null, c.status === 'delivered' ? '已交付' : '进行中'),
      h('dt', null, '首次交付日期（售后起算日）'), h('dd', null, d.firstDeliveredAt || '还没交付'),
      h('dt', null, '售后期限'), h('dd', null, d.firstDeliveredAt ? `${d.warrantyDays} 天，到 ${c.computed.warrantyEnd} 为止` : `${d.warrantyDays} 天（从首次交付起算）`)),
    h('div', { class: 'toolbar', style: 'margin-top:10px' },
      h('label', { class: 'small' }, '交付日期 ', dateInput),
      noteInput,
      btn(d.firstDeliveredAt ? '再记一次交付' : '记录首次交付', { icon: 'send', variant: 'primary', disabled: ro, onClick: deliver }),
      c.status === 'delivered' ? btn('重新打开', { icon: 'restore', disabled: ro, onClick: reopen }) : null,
      btn('交付报告（英文）', { icon: 'printer', title: '可以打印，或在打印窗口里选“另存为 PDF”', onClick: async () => { await save.flush(); openReport(state.current); } })),
    d.deliveries.length ? h('details', { class: 'internal' }, h('summary', null, `交付记录（${d.deliveries.length} 次）`),
      h('ul', null, d.deliveries.map((x) => h('li', null, `${x.date}${x.first ? '（首次）' : ''}${x.note ? ` · ${x.note}` : ''}`)))) : null,
    d.firstDeliveredAt ? h('details', { class: 'internal' }, h('summary', null, '更正售后起算日（只在当初记错时用）'),
      h('div', { class: 'toolbar', style: 'margin-top:8px' }, corrDate, corrReason, btn('更正', { icon: 'pencil', disabled: ro, onClick: correctStart })),
      d.startCorrections.length ? h('ul', { class: 'small' }, d.startCorrections.map((x) => h('li', null, `${fmtTime(x.at)}：${x.from} → ${x.to}，原因：${x.reason}`))) : null) : null,
  );

  const infoPanel = h('div', { class: 'panel' },
    h('h3', null, '交付信息', h('span', { class: 'en' }, '交付报告是英文的，下面这些栏请用英文写')),
    h('div', { class: 'toolbar' }, stateEl),
    h('div', { class: 'grid2' },
      field('siteName', '网站名称', { ph: c.name }),
      field('siteUrl', '网址（线上地址）', { type: 'url', ph: 'https://' }),
      field('repoUrl', '代码仓库地址', { type: 'url', ph: 'https://github.com/...' }),
      field('warrantyDays', '售后天数', { type: 'number', min: 0, max: 5 }),
      scopeField,
      field('customerKeeps', '由客户自行保管的事项', { multiline: true, full: true, ph: '例如：域名注册商账号和密码、托管平台账号、邮箱登录——都由客户本人保管，我们不保存任何密码' }),
      field('maintenanceMethod', '后续维护方式', { multiline: true, full: true, ph: '例如：售后期内修复缺陷免费；新需求另行报价；通过微信或邮件联系' }),
    ),
    h('h3', { style: 'margin-top:16px' }, '不包含的内容和价格', h('span', { class: 'en' }, '印在交付报告里；打印后在空白处手写签字即可')),
    h('div', { class: 'grid2' },
      notIncludedField,
      h('div', { class: 'full' }, btn('填入常用的“不包含”清单', { icon: 'file', small: true, variant: 'ghost', disabled: ro, onClick: fillNotIncluded })),
      field('price', '总价', { ph: 'e.g. $1,500' }),
      field('paymentTerms', '付款和修改约定', { multiline: true, full: true, ph: 'e.g. 50% deposit paid on Nov 1, 2026; balance of $750 due at delivery. Two rounds of revisions included; extra changes at $__/hour.' }),
    ),
    h('h3', { style: 'margin-top:16px' }, '使用的平台及费用'),
    h('p', { class: 'small muted' }, '只有同时填了“核实来源”和“核实日期”的费用会写进报告；没核实的一律显示“请以服务商当前页面为准”。'),
    platBox,
    h('div', { style: 'margin-top:10px' }, btn('加一个平台', { icon: 'plus', disabled: ro, onClick: () => { form.platforms.push({ name: '', purpose: '', cost: '', sourceUrl: '', verifiedOn: '' }); drawPlatforms(); const ins = platBox.querySelectorAll('.row-card:last-child input'); if (ins[0]) ins[0].focus(); } })),
  );

  body.replaceChildren(statusPanel, renderRepoPanel(c, ro), infoPanel, renderMaintenance(c, ro), renderLog(c));
}

function renderMaintenance(c, ro) {
  const dateIn = h('input', { type: 'date', value: today(), disabled: ro });
  const cat = h('select', { disabled: ro }, state.config.maintCategories.map((x) => h('option', { value: x }, x)));
  const title = h('input', { type: 'text', maxlength: 200, placeholder: '一句话说明，例如：联系页电话打不通', disabled: ro });
  const detail = h('textarea', { rows: 2, maxlength: 4000, placeholder: '细节（可不填）', disabled: ro });
  const warn = notice('warn', 'alert', h('p', null, '账号或密码相关的协助：只记要帮客户做什么，不要记录密码、验证码或密钥。'));
  warn.hidden = true;
  cat.addEventListener('change', () => { warn.hidden = cat.value !== '账号或密码相关协助'; });
  const errEl = h('div', { class: 'err-text', hidden: true });

  async function add() {
    const s = detectSecret(title.value) || detectSecret(detail.value);
    if (s) {
      errEl.hidden = false;
      errEl.textContent = `有疑似${s.kind}，没有保存。请删掉。`;
      return;
    }
    try {
      setCurrent(await api('POST', `/api/clients/${c.id}/maintenance`, { date: dateIn.value, category: cat.value, title: title.value, detail: detail.value }));
      toast('已记下维护请求', 'ok');
      renderMain();
    } catch (e) {
      errEl.hidden = false;
      errEl.textContent = e.message;
    }
  }

  const items = c.maintenance.map((m) => {
    const st = h('select', { disabled: ro, 'aria-label': '处理状态' }, state.config.maintStatuses.map((x) => h('option', { value: x, selected: m.status === x }, x)));
    const res = h('input', { type: 'text', maxlength: 2000, value: m.resolution || '', placeholder: '处理结果（可不填）', disabled: ro });
    const patch = async (bodyObj) => {
      const s = bodyObj.resolution && detectSecret(bodyObj.resolution);
      if (s) return toast(`有疑似${s.kind}，没有保存`, 'error');
      try {
        setCurrent(await api('PATCH', `/api/clients/${c.id}/maintenance/${m.id}`, bodyObj));
        toast('已更新', 'ok');
      } catch (e) {
        toast(e.message, 'error');
      }
    };
    st.addEventListener('change', () => patch({ status: st.value }));
    res.addEventListener('change', () => patch({ resolution: res.value }));
    return h('div', { class: 'maint-item' },
      h('div', { class: 'top' },
        h('span', { class: 'badge muted' }, m.id),
        h('span', null, m.date),
        h('span', { class: 'badge' }, m.category),
        h('span', { class: m.inWarranty === 'yes' ? 'badge delivered' : m.inWarranty === 'no' ? 'badge warn' : 'badge muted' },
          m.inWarranty === 'yes' ? '售后期内' : m.inWarranty === 'no' ? '售后期外' : '还没交付'),
        h('strong', null, m.title)),
      m.detail ? h('div', { class: 'pre small' }, m.detail) : null,
      h('div', { class: 'toolbar' }, st, res));
  });

  return h('div', { class: 'panel' },
    h('h3', null, '维护请求'),
    h('div', { class: 'grid2' },
      h('label', { class: 'f-label' }, h('span', null, '日期'), dateIn),
      h('label', { class: 'f-label' }, h('span', null, '类别'), cat),
      h('label', { class: 'f-label full' }, h('span', null, '是什么事'), title),
      h('label', { class: 'f-label full' }, h('span', null, '细节'), detail)),
    warn, errEl,
    h('div', { style: 'margin-top:10px' }, btn('记下这条请求', { icon: 'plus', variant: 'primary', disabled: ro, onClick: add })),
    items.length ? items : h('p', { class: 'muted' }, '还没有维护请求。'));
}

function renderLog(c) {
  return h('details', { class: 'panel internal' },
    h('summary', null, `操作记录（最近 ${Math.min(c.log.length, 300)} 条）`),
    h('ul', { class: 'log-list' }, c.log.slice().reverse().map((x) => h('li', null, `${fmtTime(x.at)}　${x.action}`))));
}

// ---------- 交付报告 ----------
// 交付报告是给客户看的英文版本。默认清单里的中文名称和状态换成英文；你自己填的文字原样显示。
function dateEn(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function openReport(c) {
  const d = c.delivery;
  const env = c.env;
  const row = (cells, tag = 'td') => h('tr', null, cells.map((x) => h(tag, null, x)));
  const kv = (...pairs) => h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  const blank = (text) => h('span', { class: 'muted' }, text);
  const lines = (text) => String(text || '').split('\n').map((x) => x.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
  const platforms = (d.platforms || []).filter((p) => p.name);
  const accountRows = ENV_ROWS.filter((r) => env[r.k]);
  const name = d.siteName || c.name;
  const repoUrl = d.repoUrl || env.repo;
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const verified = platforms.filter((p) => p.sourceUrl && p.verifiedOn).map((p) => p.verifiedOn).sort();

  const report = h('article', { class: 'report', lang: 'en' },
    h('header', { class: 'report-head' },
      h('h1', null, `${name} • Website Delivery Report`),
      h('span', { class: 'report-date' }, todayStr)),

    h('h2', null, 'Website'),
    kv(
      ['Reference', c.id],
      ['Live address', c.liveUrl ? extLink(c.liveUrl) : blank('Not set yet')],
      env.domain ? ['Domain', env.domain] : null,
      ['Launch date', d.firstDeliveredAt ? dateEn(d.firstDeliveredAt) : blank('Not delivered yet')],
      repoUrl ? ['Code', extLink(repoUrl)] : null,
      ['Included', d.scope ? h('span', { class: 'pre' }, d.scope) : blank('Not filled in yet')],
      d.notIncluded ? ['Not included', h('span', { class: 'muted' }, lines(d.notIncluded).join(', '))] : null,
    ),

    h('h2', null, 'Accounts (all owned by you)'),
    accountRows.length
      ? h('table', { class: 'accounts-table' },
        h('thead', null, row(['Account', 'Login', 'Used for'], 'th')),
        h('tbody', null, accountRows.map((r) => row([
          r.en,
          r.k === 'repo' && safeHref(env[r.k]) ? extLink(env[r.k]) : h('span', { class: 'login' }, env[r.k]),
          r.use,
        ]))))
      : h('p', null, blank('No accounts recorded yet')),
    h('p', { class: 'small' }, d.customerKeeps || 'Passwords are handed over separately. Please change them right away and turn on two-step verification.'),

    h('h2', null, 'Support'),
    kv(
      ['Starts', d.firstDeliveredAt ? dateEn(d.firstDeliveredAt) : blank('(the day the website is delivered)')],
      ['Ends', d.firstDeliveredAt ? `${dateEn(c.computed.warrantyEnd)} (${d.warrantyDays} days)` : blank(`(${d.warrantyDays} days after the start date)`)],
      ['Covers', 'Free fixes for defects in features delivered'],
      ['Not covered', 'New features, content changes, changes made by the platforms themselves, renewals'],
      d.maintenanceMethod ? ['How to reach us', h('span', { class: 'pre' }, d.maintenanceMethod)] : null,
    ),

    (d.price || d.paymentTerms) ? [
      h('h2', null, 'Price and payment'),
      kv(
        d.price ? ['Total price', d.price] : null,
        d.paymentTerms ? ['Payment', h('span', { class: 'pre' }, d.paymentTerms)] : null,
      ),
    ] : null,

    h('h2', null, 'Running costs'),
    (env.domain || platforms.length)
      ? h('table', null,
        h('thead', null, row(['Item', 'Used for', 'Cost'], 'th')),
        h('tbody', null,
          env.domain ? row(['Domain', 'Your website address', env.domainPrice ? `$${env.domainPrice} / year` : '$15–30 / year']) : null,
          platforms.map((p) => row([p.name, p.purpose || '',
            p.sourceUrl && p.verifiedOn ? (p.cost || '') : 'See the provider’s current pricing']))))
      : h('p', null, blank('No running costs recorded yet')),
    env.domain ? h('ul', { class: 'report-list small' }, h('li', null, 'Domain: please keep auto-renew turned on.')) : null,
    h('p', { class: 'foot' },
      'Platform fees are paid by you directly to each platform. ',
      verified.length ? `Prices were checked on ${dateEn(verified[verified.length - 1])} on each platform’s official website and may change.` : 'Prices change over time; please check each platform’s current pricing page.'),
  );

  const overlay = h('div', { class: 'report-overlay', role: 'dialog', 'aria-label': '交付报告（英文）' },
    h('div', { class: 'report-toolbar' },
      btn('打印 / 保存为 PDF', { icon: 'printer', variant: 'primary', onClick: () => window.print() }),
      btn('关闭', { icon: 'x', onClick: () => closeReport() })),
    report);
  const prevFocus = document.activeElement;
  function closeReport() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') closeReport();
  }
  document.addEventListener('keydown', onKey);
  app.append(overlay);
  overlay.querySelector('button').focus();
}

// ---------- 启动 ----------
async function boot() {
  try {
    state.config = await api('GET', '/api/config');
  } catch (e) {
    app.replaceChildren(h('p', { class: 'boot' }, e.message));
    return;
  }
  renderShell();
  await loadClients();
  // 网址里带着客户和步骤时（刷新、书签），直接回到那里
  const r = parseRoute();
  if (r) {
    state.step = r.step;
    await openClient(r.id, null, { fromRoute: true });
  } else {
    renderMain();
  }
}

boot();
