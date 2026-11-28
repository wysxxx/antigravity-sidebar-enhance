import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLUGIN_MARKER_START,
  PLUGIN_MARKER_END,
  installPlugin,
  uninstallPlugin,
  getPluginStatus
} from './install.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JS_SRC = readFileSync(join(HERE, 'sidebar-enhance.js'), 'utf8');
const CSS_SRC = readFileSync(join(HERE, 'sidebar-enhance.css'), 'utf8');

function createMockElement(tag = 'div') {
  const attrs = new Map();
  const listeners = new Map();
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    isConnected: false,
    parentElement: null,
    children: [],
    scrollTop: 0,
    get firstElementChild() {
      return el.children[0] || null;
    },
    get firstChild() {
      return el.children[0] || null;
    },
    get nextSibling() {
      if (!el.parentElement) return null;
      const idx = el.parentElement.children.indexOf(el);
      return idx >= 0 && idx + 1 < el.parentElement.children.length ? el.parentElement.children[idx + 1] : null;
    },
    contains(other) {
      if (other === el) return true;
      return el.children.some((c) => c.contains(other));
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k === 'id') el.id = String(v);
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        el.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
    },
    appendChild(child) {
      child.parentElement = el;
      child.isConnected = true;
      el.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      child.parentElement = el;
      child.isConnected = true;
      const idx = ref ? el.children.indexOf(ref) : -1;
      if (idx >= 0) el.children.splice(idx, 0, child);
      else el.children.push(child);
      return child;
    },
    remove() {
      el.isConnected = false;
      if (el.parentElement) {
        const idx = el.parentElement.children.indexOf(el);
        if (idx >= 0) el.parentElement.children.splice(idx, 1);
      }
      el.parentElement = null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatch(type, ev = {}) {
      for (const fn of listeners.get(type) || []) fn(ev);
    },
    matches(sel) {
      if (sel.includes('>')) {
        const parts = sel.split('>').map((s) => s.trim());
        if (parts.length === 2) {
          return el.matches(parts[1]) && Boolean(el.parentElement && el.parentElement.matches(parts[0]));
        }
      }
      const multiAttr = sel.match(/^(\[[^\]]+\])+$/);
      if (multiAttr) {
        const tokens = sel.match(/\[[^\]]+\]/g) || [];
        return tokens.every((tok) => {
          const m = tok.match(/^\[([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
          if (!m) return false;
          const val = attrs.get(m[1]);
          if (m[2] !== undefined) return val === m[2];
          return val !== undefined;
        });
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1).replace(/\\/g, '');
        return el.className.split(/\s+/).includes(cls);
      }
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      return el.tagName.toLowerCase() === sel.toLowerCase();
    },
    querySelector(sel) {
      for (const c of el.children) {
        if (c.matches(sel)) return c;
        const found = c.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      for (const c of el.children) {
        if (c.matches(sel)) out.push(c);
        out.push(...c.querySelectorAll(sel));
      }
      return out;
    },
    closest(sel) {
      let cur = el;
      while (cur) {
        if (cur.matches(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  };
  return el;
}

function loadPluginInSandbox({ doc, win, ctxExtra = {} }) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevMut = globalThis.MutationObserver;
  const prevLoc = globalThis.location;
  const cleanups = [];
  const mutObservedTargets = [];
  const mutObservers = [];

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.location = win.location || { pathname: '/' };
  globalThis.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.disconnected = false;
      mutObservers.push(this);
    }
    observe(target) {
      mutObservedTargets.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    trigger(mutations) {
      if (!this.disconnected && typeof this.cb === 'function') this.cb(mutations);
    }
  };

  const ctx = {
    version: '6.0.2',
    preset: 'morandi',
    config: { installedLocale: 'zh-CN' },
    modules: { i18n: true },
    __agSidebarEnhanceExposeForTest: true,
    onCleanup(fn) {
      cleanups.push(fn);
    },
    ...ctxExtra
  };

  const fn = new Function('ctx', JS_SRC);
  fn(ctx);

  return {
    exports: ctx.__agSidebarEnhanceExports,
    cleanups,
    mutObservedTargets,
    mutObservers,
    restore() {
      for (const c of cleanups) {
        try {
          c();
        } catch {}
      }
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
      globalThis.MutationObserver = prevMut;
      globalThis.location = prevLoc;
    }
  };
}

test('sidebar-enhance.css has balanced braces, all 5 chuanban presets, grouped rows & floating kebab menu', () => {
  let depth = 0;
  for (const ch of CSS_SRC) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'Unmatched closing brace');
  }
  assert.equal(depth, 0, 'Unbalanced braces in sidebar-enhance.css');
  assert.match(CSS_SRC, /\[data-ag-preset="absolutely"\]/);
  assert.match(CSS_SRC, /\[data-ag-preset="native"\]/);
  assert.match(CSS_SRC, /\[data-ag-theme-mode="dark"\]/);
  assert.match(CSS_SRC, /\[data-ag-dark-preset="claude-warm"\]/);
  assert.match(CSS_SRC, /\.ag-sb-time-group-label/);
  assert.match(CSS_SRC, /\.ag-sb-row-actions/);
  assert.match(CSS_SRC, /flex:\s*0 0 auto;\s*max-width:\s*clamp\(52px,\s*32%,\s*108px\);/);
  assert.match(CSS_SRC, /#ag-sb-kebab-menu/);
  assert.match(CSS_SRC, /#ag-sb-delete-dialog/);
});

test('selects top 15 recent tasks and groups them cleanly into Active / Today / Yesterday / Earlier', () => {
  const storage = new Map();
  const win = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    addEventListener() {},
    removeEventListener() {}
  };
  const doc = {
    body: null,
    documentElement: { getAttribute: () => 'zh-CN', lang: 'zh-CN' },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    hasFocus: () => true
  };
  const env = loadPluginInSandbox({ doc, win });
  try {
    const { selectRecentConversations, groupRecentConversations } = env.exports;
    const nowMs = new Date(2026, 10, 26, 10, 0, 0).getTime();
    const todayNoonSec = Math.floor(new Date(2026, 10, 26, 9, 0, 0).getTime() / 1000);
    const yesterdaySec = Math.floor(new Date(2026, 10, 25, 15, 0, 0).getTime() / 1000);
    const earlierSec = Math.floor(new Date(2026, 10, 20, 12, 0, 0).getTime() / 1000);

    const summaries = {
      active_pending: {
        status: 1,
        lastModifiedTime: { seconds: earlierSec },
        waitingSteps: [{ metadata: { toolCall: { name: 'ask_permission', argumentsJson: '{"command":"ls"}' } } }],
        annotations: { title: '待授权任务' }
      },
      active_running: {
        status: 2,
        notFullyIdle: true,
        lastModifiedTime: { seconds: todayNoonSec },
        annotations: { title: '运行中任务' }
      },
      today_1: {
        status: 1,
        lastModifiedTime: { seconds: todayNoonSec },
        annotations: { title: '今天任务', pinned: true },
        trajectoryMetadata: { projectId: 'p1' }
      },
      yesterday_1: {
        status: 1,
        lastModifiedTime: { seconds: yesterdaySec },
        annotations: { title: '昨天任务' },
        trajectoryMetadata: { projectId: 'p1' }
      }
    };
    for (let i = 1; i <= 14; i++) {
      summaries[`old_${i}`] = {
        status: 1,
        lastModifiedTime: { seconds: earlierSec + i },
        annotations: { title: `更早_${i}` },
        trajectoryMetadata: { projectId: 'p1' }
      };
    }
    const state = { conversation: { localLastViewedTimes: {} }, trajectorySummaries: { summaries } };
    const { items, total } = selectRecentConversations(state, new Map([['p1', 'api-gateway']]), null, true, 15);
    assert.equal(total, 18);
    assert.equal(items.length, 15);
    assert.equal(items[0].id, 'active_pending');
    assert.equal(items[1].id, 'active_running');
    assert.equal(items[2].pinned, true);

    const groups = groupRecentConversations(items, nowMs, true);
    assert.deepEqual(groups.map((g) => g.key), ['active', 'today', 'yesterday', 'earlier']);
    assert.deepEqual(groups.map((g) => g.label), ['进行中', '今天', '昨天', '更早']);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 1);
    assert.equal(groups[2].items.length, 1);
    assert.equal(groups[3].items.length, 11);
  } finally {
    env.restore();
  }
});

test('bell toggles grouped top-15 Recent view, wires native Archive/Stop/Pin/Split/Delete/Rename/Kebab actions', async () => {
  const storage = new Map();
  const navigated = [];
  const dispatched = [];
  const annCalls = [];
  const deletedIds = [];
  const canceledIds = [];
  let unsubscribed = 0;

  const nowSec = Math.floor(Date.now() / 1000);
  const summaries = {};
  for (let i = 1; i <= 16; i++) {
    summaries[`c${i}`] = {
      status: i === 16 ? 2 : 1,
      notFullyIdle: i === 16,
      lastModifiedTime: { seconds: nowSec - (16 - i) * 3600 },
      annotations: { title: `任务_${i}`, pinned: i === 15 },
      trajectoryMetadata: { projectId: 'p1' }
    };
  }
  const state = {
    conversation: { localLastViewedTimes: {} },
    multiConvoLayout: { focusedPaneId: 'pane-1' },
    trajectorySummaries: { summaries }
  };
  const store = {
    getState: () => state,
    dispatch: (act) => dispatched.push(act),
    subscribe: () => () => {
      unsubscribed++;
    }
  };
  const router = {
    navigate: (opts) => navigated.push(opts),
    buildLocation() {}
  };
  const agentService = {
    updateConversationAnnotations: async (id, ann, merge) => {
      annCalls.push({ id, ann, merge });
    },
    deleteCascadeTrajectory: async (id) => {
      deletedIds.push(id);
    },
    cancelCascadeInvocation: async (arg) => {
      canceledIds.push(arg);
    }
  };

  const body = createMockElement('body');
  const sidebar = createMockElement('div');
  sidebar.setAttribute('data-testid', 'conversation-list-sidebar');
  const listRoot = createMockElement('div');
  listRoot.__reactFiber$1 = {
    memoizedState: { memoizedState: [{ id: 'p1', label: 'api-gateway', conversationIds: Object.keys(summaries) }] },
    dependencies: {
      firstContext: {
        memoizedValue: {
          store,
          navigate: router.navigate,
          buildLocation: router.buildLocation,
          ...agentService
        }
      }
    },
    return: null
  };

  const stickyHdr = createMockElement('div');
  const sectionHdr = createMockElement('div');
  sectionHdr.setAttribute('data-testid', 'section-header');
  sectionHdr.setAttribute('data-section-id', 'main-section-header');
  sectionHdr.setAttribute('data-title', 'Projects');
  const hdrInner = createMockElement('div');
  const h2 = createMockElement('h2');
  const nativeTitleBtn = createMockElement('button');
  nativeTitleBtn.textContent = '项目管理';
  h2.appendChild(nativeTitleBtn);
  const actionsWrap = createMockElement('div');
  const btnSpan = createMockElement('span');
  const filterBtn = createMockElement('button');
  filterBtn.className = 'agy-button agy-button-icon-sm h-5 w-5';
  const addProjBtn = createMockElement('button');
  addProjBtn.className = 'agy-button agy-button-icon-sm h-5 w-5';
  addProjBtn.setAttribute('data-testid', 'sidebar-add-project-button');
  btnSpan.appendChild(filterBtn);
  btnSpan.appendChild(addProjBtn);
  actionsWrap.appendChild(btnSpan);
  hdrInner.appendChild(h2);
  hdrInner.appendChild(actionsWrap);
  sectionHdr.appendChild(hdrInner);
  stickyHdr.appendChild(sectionHdr);
  listRoot.appendChild(stickyHdr);

  // Collapsed project row (mirrors native button > titleRow > span.truncate)
  const projRow = createMockElement('div');
  const dropSection = createMockElement('div');
  dropSection.setAttribute('data-sidebar-section-drop-id', 'p1');
  const groupHeader = createMockElement('div');
  groupHeader.className = 'group/header';
  const projBtn = createMockElement('button');
  projBtn.setAttribute('data-testid', 'project-header');
  projBtn.setAttribute('aria-expanded', 'false');
  const titleRow = createMockElement('span');
  titleRow.className = 'flex items-center min-w-0 gap-0.5';
  const titleSpan = createMockElement('span');
  titleSpan.className = 'truncate';
  titleSpan.textContent = 'api-gateway';
  titleRow.appendChild(titleSpan);
  projBtn.appendChild(titleRow);
  groupHeader.appendChild(projBtn);
  dropSection.appendChild(groupHeader);
  projRow.appendChild(dropSection);
  listRoot.appendChild(projRow);

  sidebar.appendChild(listRoot);
  body.appendChild(sidebar);

  let blurCount = 0;
  projBtn.blur = () => {
    blurCount++;
    doc.activeElement = body;
  };
  const docClickListeners = [];
  const win = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    addEventListener() {},
    removeEventListener() {}
  };
  const doc = {
    body,
    activeElement: body,
    documentElement: { getAttribute: () => 'zh-CN', lang: 'zh-CN' },
    createElement: (tag) => createMockElement(tag),
    querySelector: (sel) => {
      if (sel === '[data-testid="conversation-list-sidebar"]') return sidebar;
      return body.querySelector(sel);
    },
    querySelectorAll: (sel) => {
      if (sel === '[data-testid="project-header"]') return [projBtn];
      return body.querySelectorAll(sel);
    },
    addEventListener(type, fn) {
      if (type === 'click') docClickListeners.push(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'click') {
        const i = docClickListeners.indexOf(fn);
        if (i >= 0) docClickListeners.splice(i, 1);
      }
    },
    hasFocus: () => true
  };

  const env = loadPluginInSandbox({ doc, win });
  try {
    const bellBtn = btnSpan.children[0];
    assert.equal(bellBtn.getAttribute('data-testid'), 'ag-sb-recent-toggle-button');

    // Toggle Recent view ON -> renders 15 grouped single-line rows with 3 native action buttons
    bellBtn.dispatch('click', { preventDefault() {}, stopPropagation() {} });
    const wrap = listRoot.querySelector('#ag-sb-recent-list-wrap');
    assert.ok(wrap);
    assert.equal((wrap.innerHTML.match(/data-recent-id=/g) || []).length, 15);
    assert.match(wrap.innerHTML, /data-time-group="active"/);
    assert.match(wrap.innerHTML, /data-recent-action="stop"/);
    assert.match(wrap.innerHTML, /data-recent-action="archive"/);
    assert.match(wrap.innerHTML, /data-recent-action="pin"/);
    assert.match(wrap.innerHTML, /data-recent-action="more"/);
    assert.match(wrap.innerHTML, /ag-sb-recent-project/);

    // Native action execution via runConversationAction
    const { runConversationAction, recentMod } = env.exports;
    const bindings = recentMod.bindingsRef;
    const item15 = recentMod.itemsById.get('c15');
    const item16 = recentMod.itemsById.get('c16');
    assert.equal(item15.pinned, true);

    await runConversationAction('archive', item15, bindings);
    await runConversationAction('pin', item15, bindings);
    await runConversationAction('rename', item15, bindings, { title: '新标题' });
    await runConversationAction('stop', item16, bindings);
    await runConversationAction('split-right', item15, bindings);
    await runConversationAction('delete', item15, bindings);

    assert.deepEqual(annCalls[0], { id: 'c15', ann: { archived: true }, merge: true });
    assert.deepEqual(annCalls[1], { id: 'c15', ann: { pinned: false }, merge: true });
    assert.deepEqual(annCalls[2], { id: 'c15', ann: { title: '新标题' }, merge: true });
    assert.deepEqual(canceledIds[0], { conversationId: 'c16' });
    assert.deepEqual(dispatched[0], {
      type: 'multiConvoLayout/splitPane',
      payload: { targetPaneId: 'pane-1', cascadeId: 'c15', direction: 'horizontal' }
    });
    assert.deepEqual(deletedIds, ['c15']);

    // Open kebab menu -> verify all native items exist (rename, pin, toggle-read, copy, split, archive, delete)
    recentMod.openKebabMenu(item15, { left: 100, top: 100, bottom: 124 });
    const menu = body.querySelector('#ag-sb-kebab-menu');
    assert.ok(menu);
    const acts = menu.querySelectorAll('.ag-sb-menu-item').map((el) => el.getAttribute('data-menu-act'));
    assert.deepEqual(acts, ['rename', 'pin', 'toggle-read', 'copy', 'split', 'archive', 'delete']);
    recentMod.closeKebabMenu();
    assert.equal(body.querySelector('#ag-sb-kebab-menu'), null);

    // Collapsed project badge mounts inline right after titleSpan with native 16px / 4px dot spinner
    const inlineBadge = titleRow.querySelector('.ag-sb-folder-badges');
    assert.ok(inlineBadge, 'Badge should mount inline inside titleRow next to project name');
    assert.equal(inlineBadge.parentElement, titleRow);
    assert.match(inlineBadge.innerHTML, /width:16px;height:16px;grid-template-columns:repeat\(2,4px\);gap:2px/);
    assert.match(inlineBadge.innerHTML, /width:4px;height:4px/);

    // Keyboard Enter on a Recent row navigates via TanStack Router
    wrap.dispatch('keydown', {
      key: 'Enter',
      preventDefault() {},
      target: {
        closest: (s) => (s === '[data-recent-id]' ? { dataset: { recentId: 'c14' } } : null)
      }
    });
    assert.deepEqual(navigated[0], { to: '/c/$cascadeId', params: { cascadeId: 'c14' } });

    env.restore();
    assert.ok(unsubscribed >= 2);
  } finally {
    env.restore();
  }
});

test('teardown removes 100% of window and document listeners with zero leaks', () => {
  const winMap = new Map();
  const docMap = new Map();
  const track = (map, type, fn, add) => {
    if (!map.has(type)) map.set(type, new Set());
    if (add) map.get(type).add(fn);
    else map.get(type).delete(fn);
  };
  const body = createMockElement('body');
  const card = createMockElement('div');
  card.className = 'agy-card';
  const themeRow = createMockElement('div');
  const toggleGroup = createMockElement('div');
  toggleGroup.setAttribute('data-slot', 'toggle-group');
  toggleGroup.setAttribute('data-ag-theme-toggle-group', '1');
  themeRow.appendChild(toggleGroup);
  card.appendChild(themeRow);
  body.appendChild(card);

  const storage = new Map();
  const win = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    addEventListener: (t, fn) => track(winMap, t, fn, true),
    removeEventListener: (t, fn) => track(winMap, t, fn, false)
  };
  const doc = {
    body,
    documentElement: { getAttribute: () => 'zh-CN', lang: 'zh-CN' },
    createElement: (tag) => createMockElement(tag),
    querySelector: (sel) => (sel === '[data-slot="toggle-group"][data-ag-theme-toggle-group="1"]' ? toggleGroup : body.querySelector(sel)),
    querySelectorAll: (sel) => {
      if (sel === '[data-ag-sb-recent-row="1"], [data-ag-sb-folder-row="1"]') {
        return [...card.querySelectorAll('[data-ag-sb-recent-row="1"]'), ...card.querySelectorAll('[data-ag-sb-folder-row="1"]')];
      }
      return body.querySelectorAll(sel);
    },
    addEventListener: (t, fn) => track(docMap, t, fn, true),
    removeEventListener: (t, fn) => track(docMap, t, fn, false),
    hasFocus: () => true
  };

  const env = loadPluginInSandbox({ doc, win });
  assert.ok(card.querySelector('[data-ag-sb-recent-switch="1"]'), 'Recent switch mounted in Appearance');
  assert.ok(card.querySelector('[data-ag-sb-folder-switch="1"]'), 'Folder switch mounted in Appearance');
  env.restore();

  for (const [t, set] of winMap.entries()) {
    assert.equal(set.size, 0, `Leaked window listener for "${t}"`);
  }
  for (const [t, set] of docMap.entries()) {
    assert.equal(set.size, 0, `Leaked document listener for "${t}"`);
  }
  assert.equal(card.querySelector('[data-ag-sb-recent-row="1"]'), null);
  assert.equal(card.querySelector('[data-ag-sb-folder-row="1"]'), null);
});

test('install.mjs coexists cleanly with ghang marker block, is idempotent, and uninstalls without side effects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ag-sb-test-'));
  try {
    const ghangJs = '/* __AG_PLUGIN_QUOTA_BAR_START__ */\nconsole.log("ghang");\n/* __AG_PLUGIN_QUOTA_BAR_END__ */\n';
    const ghangCss = '/* __AG_PLUGIN_QUOTA_BAR_START__ */\n.ghang { color: red; }\n/* __AG_PLUGIN_QUOTA_BAR_END__ */\n';
    writeFileSync(join(dir, 'custom.js'), ghangJs, 'utf8');
    writeFileSync(join(dir, 'custom.css'), ghangCss, 'utf8');
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ enabled: true, modules: { customCss: true, customJs: true } }), 'utf8');

    const r1 = installPlugin({ targetDir: dir });
    assert.equal(r1.ok, true);
    assert.equal(r1.jsChanged, true);
    assert.equal(r1.cssChanged, true);

    const r2 = installPlugin({ targetDir: dir });
    assert.equal(r2.jsChanged, false);
    assert.equal(r2.cssChanged, false);

    const st = getPluginStatus({ targetDir: dir });
    assert.equal(st.jsInstalled, true);
    assert.equal(st.cssInstalled, true);

    const u = uninstallPlugin({ targetDir: dir });
    assert.equal(u.jsRemoved, true);
    assert.equal(u.cssRemoved, true);
    assert.equal(readFileSync(join(dir, 'custom.js'), 'utf8'), ghangJs);
    assert.equal(readFileSync(join(dir, 'custom.css'), 'utf8'), ghangCss);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('caches Fiber bindings, short-circuits streaming Recent syncs, and filters self badge mutations', () => {
  const storage = new Map();
  const nowSec = Math.floor(Date.now() / 1000);
  let summaries = {};
  for (let i = 1; i <= 30; i++) {
    summaries[`c${i}`] = {
      status: i === 30 ? 2 : 1,
      notFullyIdle: i === 30,
      lastModifiedTime: { seconds: nowSec - (30 - i) * 60 },
      annotations: { title: `Task ${i}` },
      trajectoryMetadata: { projectId: 'p1' }
    };
  }
  const viewed = {};
  const state = {
    conversation: { localLastViewedTimes: viewed },
    trajectorySummaries: { summaries }
  };
  const store = {
    getState: () => state,
    subscribe: () => () => {}
  };
  const router = { navigate() {}, buildLocation() {} };
  const agentService = { updateConversationAnnotations: async () => {} };

  const body = createMockElement('body');
  const sidebar = createMockElement('div');
  sidebar.setAttribute('data-testid', 'conversation-list-sidebar');
  const listRoot = createMockElement('div');
  listRoot.__reactFiber$1 = {
    memoizedState: { memoizedState: [{ id: 'p1', label: 'api-gateway', conversationIds: Object.keys(summaries) }] },
    dependencies: {
      firstContext: {
        memoizedValue: { store, navigate: router.navigate, buildLocation: router.buildLocation, ...agentService }
      }
    },
    return: null
  };

  const stickyHdr = createMockElement('div');
  const sectionHdr = createMockElement('div');
  sectionHdr.setAttribute('data-testid', 'section-header');
  sectionHdr.setAttribute('data-section-id', 'main-section-header');
  sectionHdr.setAttribute('data-title', 'Projects');
  const h2 = createMockElement('h2');
  const actionsWrap = createMockElement('span');
  const addProjBtn = createMockElement('button');
  addProjBtn.setAttribute('data-testid', 'sidebar-add-project-button');
  actionsWrap.appendChild(addProjBtn);
  sectionHdr.appendChild(h2);
  sectionHdr.appendChild(actionsWrap);
  stickyHdr.appendChild(sectionHdr);
  listRoot.appendChild(stickyHdr);

  const dropSection = createMockElement('div');
  dropSection.setAttribute('data-sidebar-section-drop-id', 'p1');
  const projBtn = createMockElement('button');
  projBtn.setAttribute('data-testid', 'project-header');
  projBtn.setAttribute('aria-expanded', 'false');
  const titleRow = createMockElement('span');
  const titleSpan = createMockElement('span');
  titleSpan.className = 'truncate';
  titleSpan.textContent = 'api-gateway';
  titleRow.appendChild(titleSpan);
  projBtn.appendChild(titleRow);
  dropSection.appendChild(projBtn);
  listRoot.appendChild(dropSection);
  sidebar.appendChild(listRoot);
  body.appendChild(sidebar);

  const win = {
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v))
    },
    addEventListener() {},
    removeEventListener() {}
  };
  const doc = {
    body,
    documentElement: { getAttribute: () => 'zh-CN', lang: 'zh-CN' },
    createElement: (tag) => createMockElement(tag),
    querySelector: (sel) => (sel === '[data-testid="conversation-list-sidebar"]' ? sidebar : body.querySelector(sel)),
    querySelectorAll: (sel) => (sel === '[data-testid="project-header"]' ? [projBtn] : body.querySelectorAll(sel)),
    addEventListener() {},
    removeEventListener() {},
    hasFocus: () => true
  };

  const env = loadPluginInSandbox({ doc, win });
  try {
    const { bindingsCache, recentMod, folderMod, isSelfSidebarMutation } = env.exports;

    // 1. Fiber binding cache: full crawl happens only once for the same connected sidebar
    const crawlsAfterMount = bindingsCache.fullCrawlCount;
    assert.equal(crawlsAfterMount, 1);

    // Toggle Recent view on -> renders once, still 0 additional full Fiber crawls
    const bellBtn = actionsWrap.children[0];
    bellBtn.dispatch('click', { preventDefault() {}, stopPropagation() {} });
    assert.equal(bindingsCache.fullCrawlCount, 1);
    assert.equal(recentMod.selectRunCount, 1);
    assert.equal(recentMod.renderWriteCount, 1);

    // Verify v6.0.7 universal no-i18n contract attributes
    const wrap = listRoot.querySelector('#ag-sb-recent-list-wrap');
    assert.equal(wrap.getAttribute('data-ag-plugin-ui'), '1');
    assert.equal(wrap.getAttribute('data-ag-no-i18n'), '1');

    // 2a. Level-1 short-circuit: unrelated Redux tick (same summaries reference) skips O(N) selection completely
    recentMod.sync();
    recentMod.sync();
    assert.equal(recentMod.selectRunCount, 1);
    assert.equal(recentMod.renderWriteCount, 1);

    // 2b. Level-2 short-circuit: streaming updates running item timestamp (new summaries ref),
    // but Top-15 render signature is unchanged -> skips DOM innerHTML rebuild so hover is never disrupted
    summaries = {
      ...summaries,
      c30: { ...summaries.c30, lastModifiedTime: { seconds: nowSec + 5 } }
    };
    state.trajectorySummaries = { summaries };
    recentMod.sync();
    assert.equal(recentMod.selectRunCount, 2);
    assert.equal(recentMod.renderWriteCount, 1);

    // Real visual change (title changes) -> triggers DOM rebuild
    summaries = {
      ...summaries,
      c30: { ...summaries.c30, annotations: { title: 'Task 30 Updated' } }
    };
    state.trajectorySummaries = { summaries };
    recentMod.sync();
    assert.equal(recentMod.renderWriteCount, 2);
    assert.match(wrap.innerHTML, /Task 30 Updated/);

    // 3. FolderStatusModule observer ignores self-inflicted badge mutations
    const badgeEl = titleRow.querySelector('.ag-sb-folder-badges');
    assert.ok(badgeEl);
    assert.equal(badgeEl.getAttribute('data-ag-plugin-ui'), '1');
    assert.equal(isSelfSidebarMutation({ type: 'childList', target: badgeEl, addedNodes: [], removedNodes: [] }), true);
    assert.equal(isSelfSidebarMutation({ type: 'childList', target: titleRow, addedNodes: [badgeEl], removedNodes: [] }), true);
    assert.equal(isSelfSidebarMutation({ type: 'attributes', target: projBtn, attributeName: 'aria-expanded' }), false);

    let scheduled = 0;
    const origSchedule = folderMod.scheduleSync.bind(folderMod);
    folderMod.scheduleSync = () => {
      scheduled++;
    };
    try {
      folderMod.observer.trigger([
        { type: 'childList', target: badgeEl, addedNodes: [], removedNodes: [] },
        { type: 'childList', target: titleRow, addedNodes: [badgeEl], removedNodes: [] }
      ]);
      assert.equal(scheduled, 0, 'Self badge mutations must not re-schedule sync');

      folderMod.observer.trigger([{ type: 'attributes', target: projBtn, attributeName: 'aria-expanded' }]);
      assert.equal(scheduled, 1, 'Native project-header aria-expanded change must still schedule sync');
    } finally {
      folderMod.scheduleSync = origSchedule;
    }
  } finally {
    env.restore();
  }
});
