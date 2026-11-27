/**
 * agy-sidebar-enhance — Standalone user/custom.js plugin for chuanban-antigravity-theme-patch >= 6.0.0
 *
 * Features:
 * - Bell toggle icon in the "Projects" sidebar header that switches the entire Projects list
 *   in-place to a DSH-style time-grouped "Recent" view (top 15 conversations grouped by
 *   Active / Today / Yesterday / Earlier, single-line title + right-aligned project name).
 * - Full native-parity hover action bar on every Recent row (Archive/Stop, Pin/Unpin, More ⋮)
 *   plus right-click & kebab menu matching Antigravity's native menu (Rename, Pin/Unpin,
 *   Mark Read/Unread, Copy Name/ID/Project, Split Right/Down, Archive, Delete).
 * - Collapsed project folder status badges (aggregated pending / running / unread indicators).
 * - Independent switches in Settings -> Appearance, synced across windows via localStorage.
 * - Full chuanban 5-theme palette, font stack & [ EN | 中文 ] language sync.
 *
 * Credits (MIT License):
 * - Sidebar Redux/Fiber state & Recent/Folder-Status logic adapted from fxzer/agy-kit (src/folder-status.js, src/recent-section.js).
 * - chuanban user/ layer plugin & Appearance settings pattern adapted from ghang/ghang-antigravity-local-ui.
 */
(function (ctx) {
  'use strict';

  try {
    if (typeof window.__ag_teardown_sidebar_enhance_fn === 'function') {
      window.__ag_teardown_sidebar_enhance_fn();
    }
  } catch (e) {}

  const PREFS_STORAGE_KEY = 'ag_sidebar_enhance_prefs_v1';
  const RECENT_LIMIT = 15;
  const RECENT_LIST_WRAP_ID = 'ag-sb-recent-list-wrap';
  const KEBAB_MENU_ID = 'ag-sb-kebab-menu';
  const KEBAB_SUBMENU_ID = 'ag-sb-kebab-submenu';
  const DELETE_BACKDROP_ID = 'ag-sb-delete-backdrop';
  const RECENT_MODE_ATTR = 'data-ag-sb-recent-mode';
  const LIST_ROOT_ATTR = 'data-ag-sb-list-root';
  const STICKY_HDR_ATTR = 'data-ag-sb-sticky-hdr';
  const STATE_WATCH_INTERVAL_MS = 1500;

  const CASCADE_STATUS = { UNSPECIFIED: 0, IDLE: 1, RUNNING: 2, CANCELING: 3, BUSY: 4 };
  const IGNORED_TRAJECTORY_TYPES = new Set([21, 22, 23]);

  const COPY = {
    en: {
      title: 'Recent',
      aria: 'Recent conversations',
      empty: 'No recent conversations',
      toggleToRecent: 'Switch to Recent (15)',
      toggleToProjects: 'Back to Projects',
      groupActive: 'Active',
      groupToday: 'Today',
      groupYesterday: 'Yesterday',
      groupEarlier: 'Earlier',
      pendingLabel: 'action required',
      runningLabel: 'running',
      unreadLabel: 'unread',
      actArchive: 'Archive conversation',
      actStop: 'Stop execution',
      actPin: 'Pin conversation',
      actUnpin: 'Unpin conversation',
      actMore: 'More options',
      menuRename: 'Rename',
      menuPin: 'Pin',
      menuUnpin: 'Unpin',
      menuMarkUnread: 'Mark Unread',
      menuMarkRead: 'Mark Read',
      menuCopy: 'Copy',
      menuCopyName: 'Conversation Name',
      menuCopyId: 'Conversation ID',
      menuCopyProject: 'Project Name',
      menuSplit: 'Split',
      menuSplitRight: 'Split Right',
      menuSplitDown: 'Split Down',
      menuArchive: 'Archive',
      menuDelete: 'Delete',
      deleteTitle: 'Delete conversation?',
      deleteDesc: (name) => `Delete "${name}" permanently? This cannot be undone.`,
      cancel: 'Cancel',
      confirmDelete: 'Delete',
      recentSettingLabel: 'Sidebar Recent Toggle',
      recentSettingDesc: 'Add bell icon in Projects header to switch to grouped top 15 recent tasks',
      folderSettingLabel: 'Collapsed Project Badges',
      folderSettingDesc: 'Show pending, running & unread badges on collapsed projects'
    },
    zh: {
      title: '最近',
      aria: '最近任务',
      empty: '暂无最近对话',
      toggleToRecent: '切换为最近任务（15 条）',
      toggleToProjects: '返回项目管理',
      groupActive: '进行中',
      groupToday: '今天',
      groupYesterday: '昨天',
      groupEarlier: '更早',
      pendingLabel: '待处理',
      runningLabel: '运行中',
      unreadLabel: '已完成未读',
      actArchive: '归档对话',
      actStop: '停止执行',
      actPin: '置顶对话',
      actUnpin: '取消置顶',
      actMore: '更多选项',
      menuRename: '重命名',
      menuPin: '置顶',
      menuUnpin: '取消置顶',
      menuMarkUnread: '标记为未读',
      menuMarkRead: '标记为已读',
      menuCopy: '复制',
      menuCopyName: '对话名称',
      menuCopyId: '对话 ID',
      menuCopyProject: '项目名称',
      menuSplit: '分屏打开',
      menuSplitRight: '向右分屏',
      menuSplitDown: '向下分屏',
      menuArchive: '归档',
      menuDelete: '删除',
      deleteTitle: '删除对话？',
      deleteDesc: (name) => `确定永久删除「${name}」吗？此操作无法撤销。`,
      cancel: '取消',
      confirmDelete: '删除',
      recentSettingLabel: '侧边栏最近任务切换',
      recentSettingDesc: '在项目管理右侧新增小铃铛图标，点击切换为按时间分组的最近 15 条任务',
      folderSettingLabel: '折叠项目状态角标',
      folderSettingDesc: '项目折叠时聚合显示待授权、运行中与已完成未读角标'
    }
  };

  // Native Material Symbols SVGs (0 -960 960 960) matching Antigravity 2.35.0
  const BELL_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M180-210v-60h70v-290q0-88 53.5-154.5T440-802v-28q0-17 11.5-28.5T480-870q17 0 28.5 11.5T520-830v28q83 21 136.5 87.5T710-560v290h70v60H180Zm300-300Zm0 410q-33 0-56.5-23.5T400-180h160q0 33-23.5 56.5T480-100ZM310-270h340v-290q0-71-49.5-120.5T480-730q-71 0-120.5 49.5T310-560v290Z"/></svg>';
  const ARCHIVE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-256.16L626.15-402.31L584-444.46l-74,74v-178H450v178l-74-74l-42.15,42.15L480-256.16ZM200-643.85v431.54q0,5.39 3.46,8.85t8.85,3.46H747.69q5.39,0 8.85-3.46t3.46-8.85V-643.85H200ZM215.39-140q-29.92,0-52.65-22.73T140-215.39V-679.77q0-12.85 4.12-24.5t12.35-21.5l56.15-67.92q9.85-12.85 24.62-19.58T268.46-820h422.3q16.46,0 31.42,6.73T747-793.69L803.54-725q8.23,9.85 12.35,21.69T820-678.61v463.23q0,29.92-22.73,52.65T744.61-140H215.39Zm0.23-563.84H744l-43.62-51.92q-1.92-1.92-4.42-3.08T690.77-760H268.85q-2.69,0-5.19,1.15t-4.42,3.08l-43.62,51.92Z"/></svg>';
  const STOP_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M330-330H630V-630H330v300ZM480-100q-79,0-148.5-30t-121-81.5T130-332T100-480t30-148.5t81.5-121T332-830T480-860t148.5,30t121,81.5T830-628T860-480t-30,148.5t-81.5,121T628-130T480-100Zm0-60q134,0 227-93t93-227t-93-227t-227-93t-227,93t-93,227t93,227t227,93Z"/></svg>';
  const PIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M620-471.54L691.54-400v60H510v220L480-90l-30-30V-340H268.46v-60L340-471.54V-760H300v-60H660v60H620v288.46ZM354-400H606l-46-46V-760H400v314l-46,46Z"/></svg>';
  const UNPIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M620-528l-60-60v-172H400v12l-60-60v-12h320v60h-40v232Zm178 444L542-340h-32v220l-30 30-30-30v-220H268v-60l72-72v-120L98-834l42-42 700 700-42 42ZM354-400h128l-82-82v36l-46 46Z"/></svg>';
  const PIN_SM_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M620-471.54L691.54-400v60H510v220L480-90l-30-30V-340H268.46v-60L340-471.54V-760H300v-60H660v60H620v288.46ZM354-400H606l-46-46V-760H400v314l-46,46Z"/></svg>';
  const KEBAB_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-189.23q-24.75,0-42.37-17.62T420-249.23t17.62-42.37T480-309.23t42.37,17.62T540-249.23t-17.62,42.37T480-189.23ZM480-420q-24.75,0-42.37-17.62T420-480t17.62-42.37T480-540t42.37,17.62T540-480t-17.62,42.37T480-420Zm0-230.77q-24.75,0-42.37-17.62T420-710.77t17.62-42.37T480-770.77t42.37,17.62T540-710.77t-17.62,42.37T480-650.77Z"/></svg>';
  const RENAME_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Z"/></svg>';
  const MAIL_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200Z"/></svg>';
  const COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z"/></svg>';
  const SPLIT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm240-80v-560H200v560h240Zm80 0h240v-560H520v560Z"/></svg>';
  const DELETE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360Z"/></svg>';
  const CHEVRON_RIGHT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" class="ag-sb-menu-arrow"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>';

  const DEFAULT_ICON_BTN_CLASS =
    'agy-button agy-button-icon-sm inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer justify-center disabled:opacity-50 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:text-foreground focus-visible:bg-secondary h-5 w-5 shrink-0 flex items-center justify-center rounded-md hover:bg-sidebar-secondary';

  function normalizeBoolPref(val, fallback = true) {
    if (typeof val === 'boolean') return val;
    if (val === 'false' || val === '0' || val === 0 || val === 'off') return false;
    if (val === 'true' || val === '1' || val === 1 || val === 'on') return true;
    return fallback;
  }

  function isZhLang() {
    try {
      const attr = String(document.documentElement?.getAttribute?.('data-ag-lang') || '').trim().toLowerCase();
      if (attr) {
        if (attr === 'en' || attr.startsWith('en-')) return false;
        if (attr.startsWith('zh')) return true;
        return false;
      }
    } catch (e) {}
    if (ctx?.modules?.i18n === false) return false;
    try {
      const inst = String(ctx?.config?.installedLocale || '').trim().toLowerCase();
      if (inst === 'none' || inst === 'en' || inst.startsWith('en-')) return false;
      if (inst.startsWith('zh')) return true;
    } catch (e) {}
    if (typeof document === 'object') {
      const title = document.querySelector?.('[data-testid="section-header"]')?.getAttribute?.('data-title') || '';
      if (title) return /[\u4e00-\u9fff]/.test(title);
      const lang = document.documentElement?.lang || '';
      if (lang) return /^zh/i.test(lang);
    }
    return true;
  }

  function getCopy(zh = isZhLang()) {
    return zh ? COPY.zh : COPY.en;
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function secondsOf(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (ts.seconds !== undefined && ts.seconds !== null) return Number(ts.seconds) || 0;
    return 0;
  }

  function resolvePendingKind(waitingStep) {
    const tool = String(waitingStep?.metadata?.toolCall?.name || '').split(':').pop();
    if (tool === 'ask_permission') {
      try {
        const args = JSON.parse(waitingStep?.metadata?.toolCall?.argumentsJson || '{}');
        if (args.command || args.CommandLine) return 'terminal';
        if (args.read_file || args.write_file || args.Path || args.AbsolutePath || args.TargetFile) return 'file';
      } catch (e) {}
      return 'lock';
    }
    if (/run_command|command/i.test(tool)) return 'terminal';
    if (/question|ask_user/i.test(tool)) return 'bell';
    return 'bell';
  }

  function isHiddenConversation(id, summary) {
    if (!id || !summary) return true;
    if (summary.annotations?.archived) return true;
    const meta = summary.trajectoryMetadata;
    if (meta?.parentConversationId) return true;
    if (meta?.isBattleModeFork) return true;
    if (meta?.sourceMetadata?.hideFromConversationList) return true;
    if (meta?.rootConversationId && meta.rootConversationId !== id && !summary.forkParentConversationId) return true;
    if (IGNORED_TRAJECTORY_TYPES.has(summary.trajectoryType)) return true;
    return false;
  }

  function classifyConversation(id, summary, state, activeCascadeId, hasFocus = true) {
    if (isHiddenConversation(id, summary)) return null;

    const summaries = state?.trajectorySummaries?.summaries || {};
    const indexes = state?.trajectorySummaries?.indexes;
    let waitingStep = summary.waitingSteps?.[0] || null;
    const rawChildren = indexes?.byParent?.[id];
    if (!waitingStep && rawChildren) {
      const childIds =
        typeof rawChildren[Symbol.iterator] === 'function'
          ? rawChildren
          : typeof rawChildren === 'object'
            ? Object.keys(rawChildren)
            : [];
      for (const childId of childIds) {
        const child = summaries[childId];
        if (child?.waitingSteps?.length) {
          waitingStep = child.waitingSteps[0];
          break;
        }
      }
    }
    if (waitingStep) {
      return {
        kind: 'pending',
        subkind: resolvePendingKind(waitingStep),
        title: summary.annotations?.title || summary.summary || id
      };
    }

    const status = summary.status ?? CASCADE_STATUS.UNSPECIFIED;
    const isWorking =
      !summary.killed &&
      (status === CASCADE_STATUS.RUNNING ||
        status === CASCADE_STATUS.BUSY ||
        status === CASCADE_STATUS.CANCELING ||
        !!summary.hasRunningSubagents);
    const isBackgroundWorking =
      !summary.killed &&
      (status === CASCADE_STATUS.IDLE || status === CASCADE_STATUS.UNSPECIFIED) &&
      !summary.hasRunningSubagents &&
      !!summary.notFullyIdle;

    if (isWorking || isBackgroundWorking) {
      return {
        kind: 'running',
        subkind: isWorking ? 'loading' : 'background',
        title: summary.annotations?.title || summary.summary || id
      };
    }

    if (!summary.notFullyIdle) {
      const marked = !!summary.annotations?.markedAsUnread;
      const isCurrentFocused = activeCascadeId === id && hasFocus;
      if (marked || !isCurrentFocused) {
        const lastMod = secondsOf(summary.lastModifiedTime);
        const remoteView = secondsOf(summary.annotations?.lastUserViewTime);
        const localView = Number(state?.conversation?.localLastViewedTimes?.[id] || 0);
        const viewedAt = Math.max(remoteView, localView);
        if (marked || (lastMod > 0 && lastMod > viewedAt)) {
          return {
            kind: 'unread',
            subkind: 'dot',
            title: summary.annotations?.title || summary.summary || id
          };
        }
      }
    }

    return null;
  }

  function aggregateProject(conversationIds, state, activeCascadeId, hasFocus = true, zh = isZhLang()) {
    const summaries = state?.trajectorySummaries?.summaries || {};
    const buckets = {
      pending: { kind: 'pending', count: 0, subkind: null, titles: [] },
      running: { kind: 'running', count: 0, subkind: null, titles: [] },
      unread: { kind: 'unread', count: 0, subkind: 'dot', titles: [] }
    };
    const seen = new Set();

    for (const id of conversationIds || []) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const item = classifyConversation(id, summaries[id], state, activeCascadeId, hasFocus);
      if (!item) continue;
      const b = buckets[item.kind];
      b.count += 1;
      if (!b.subkind || item.subkind === 'loading') b.subkind = item.subkind;
      if (b.titles.length < 3 && item.title) b.titles.push(item.title);
    }

    const active = ['pending', 'running', 'unread'].map((k) => buckets[k]).filter((b) => b.count > 0);
    if (!active.length) return { badges: [], summaryText: '', tooltipText: '', all: [] };

    const t = getCopy(zh);
    const labels = { pending: t.pendingLabel, running: t.runningLabel, unread: t.unreadLabel };
    const summaryText = active
      .map((b) => (zh ? `${b.count} 个${labels[b.kind]}` : `${b.count} ${labels[b.kind]}`))
      .join(' · ');
    const detailLines = active.flatMap((b) => b.titles.map((title) => `${labels[b.kind]}: ${title}`)).slice(0, 4);
    const tooltipText = detailLines.length ? `${summaryText}\n${detailLines.join('\n')}` : summaryText;

    return {
      badges: active.slice(0, 2),
      all: active,
      summaryText,
      tooltipText
    };
  }

  function renderBadgeIcon(kind, subkind) {
    if (kind === 'unread') {
      return '<span aria-hidden="true" data-testid="ag-sb-folder-unread-dot" class="relative inline-flex items-center justify-center shrink-0" style="width:16px;height:16px"><span class="ag-sb-unread-halo absolute rounded-full" style="width:12px;height:12px"></span><span class="ag-sb-unread-core rounded-full" style="width:6px;height:6px"></span></span>';
    }
    if (kind === 'running') {
      if (subkind === 'background') {
        return '<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="opacity-70 shrink-0"><path d="M3.7 5.2L6.7 8L3.7 10.8"/><path d="M8.3 10.8H12.3"/></svg>';
      }
      return '<span aria-hidden="true" data-testid="ag-sb-status-loading-spinner" class="grid place-content-center shrink-0 opacity-70" style="width:16px;height:16px;grid-template-columns:repeat(2,4px);gap:2px"><span data-agent-state-dot="" class="ag-sb-dot-pulse rounded-full bg-current" style="width:4px;height:4px;animation-delay:0s"></span><span data-agent-state-dot="" class="ag-sb-dot-pulse rounded-full bg-current" style="width:4px;height:4px;animation-delay:-1.05s"></span><span data-agent-state-dot="" class="ag-sb-dot-pulse rounded-full bg-current" style="width:4px;height:4px;animation-delay:-0.35s"></span><span data-agent-state-dot="" class="ag-sb-dot-pulse rounded-full bg-current" style="width:4px;height:4px;animation-delay:-0.7s"></span></span>';
    }
    const glyph =
      subkind === 'terminal'
        ? '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5l3 3-3 3"/><path d="M8 11h4.5"/></svg>'
        : subkind === 'lock'
          ? '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="9" height="6" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>'
          : '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 6.5a3.5 3.5 0 1 0-7 0c0 3.2-1.3 4.3-1.3 4.3h9.6s-1.3-1.1-1.3-4.3"/><path d="M6.8 13a1.3 1.3 0 0 0 2.4 0"/></svg>';
    return `<span aria-hidden="true" class="relative inline-flex items-center justify-center shrink-0" style="width:16px;height:16px">${glyph}<span class="ag-sb-pending-dot absolute rounded-full" style="width:5px;height:5px;top:0;right:0"></span></span>`;
  }

  function findSidebarBindings() {
    if (typeof document !== 'object') return null;
    const sidebar = document.querySelector?.('[data-testid="conversation-list-sidebar"]');
    if (!sidebar) return null;
    const listDiv = sidebar.firstElementChild || sidebar;
    const key =
      Object.keys(listDiv).find((k) => k.startsWith('__reactFiber$')) ||
      Object.keys(sidebar).find((k) => k.startsWith('__reactFiber$'));
    let f = key ? listDiv[key] || sidebar[key] : null;
    let store = null;
    let router = null;
    let agentService = null;
    let startProjectConversation = null;
    const groupsById = new Map();
    const projectLabels = new Map();
    for (let d = 0; f && d < 36; d++, f = f.return) {
      for (let s = f.memoizedState; s; s = s.next) {
        const v = s.memoizedState;
        if (!groupsById.size && Array.isArray(v) && v.length && v[0]?.conversationIds) {
          for (const g of v) {
            if (g?.id) {
              groupsById.set(g.id, g.conversationIds);
              if (typeof g.label === 'string') projectLabels.set(g.id, g.label);
            }
          }
        }
        if (
          !startProjectConversation &&
          Array.isArray(v) &&
          typeof v[0] === 'function' &&
          String(v[0]).includes('AGENT_MANAGER_NEW_WORKSPACE_CONVERSATION')
        ) {
          startProjectConversation = v[0];
        }
      }
      if (!store || !router || !agentService) {
        for (let c = f.dependencies?.firstContext; c; c = c.next) {
          const v = c.memoizedValue;
          if (!store && v?.store && typeof v.store.getState === 'function' && typeof v.store.subscribe === 'function') {
            store = v.store;
          }
          if (!router && v && typeof v.navigate === 'function' && v.buildLocation) {
            router = v;
          }
          if (!agentService && v && typeof v.updateConversationAnnotations === 'function') {
            agentService = v;
          }
        }
      }
      if (store && router && agentService && groupsById.size && startProjectConversation) break;
    }
    return store ? { store, router, agentService, startProjectConversation, groupsById, projectLabels, sidebar } : null;
  }

  function conversationIdsForProject(projectId, state, groupsById) {
    if (groupsById?.has(projectId)) return groupsById.get(projectId);
    const summaries = state?.trajectorySummaries?.summaries || {};
    const ids = [];
    for (const [id, summary] of Object.entries(summaries)) {
      const pid = summary?.trajectoryMetadata?.projectId || 'outside-of-project';
      if (pid === projectId) ids.push(id);
    }
    return ids;
  }

  function resolveProjectLabel(summary, projectLabels) {
    const pid = summary?.trajectoryMetadata?.projectId;
    if (pid === 'outside-of-project') return '';
    if (pid && projectLabels?.has(pid)) return projectLabels.get(pid);
    const uri = summary?.trajectoryMetadata?.workspaceUris?.[0] || '';
    try {
      const name = decodeURIComponent(String(uri).split('/').filter(Boolean).pop() || '');
      return name || '';
    } catch (e) {
      return String(uri).split('/').filter(Boolean).pop() || '';
    }
  }

  function resolveProjectId(summary, projectLabels, projectLabel) {
    const pid = summary?.trajectoryMetadata?.projectId;
    if (pid && pid !== 'outside-of-project') return pid;
    const label = projectLabel ?? resolveProjectLabel(summary, projectLabels);
    if (label && projectLabels && typeof projectLabels.entries === 'function') {
      for (const [id, name] of projectLabels.entries()) {
        if (name === label && id && id !== 'outside-of-project') return id;
      }
    }
    return summary?.trajectoryMetadata?.workspaceUris?.[0] || '';
  }

  function selectRecentConversations(state, projectLabels, activeCascadeId, hasFocus = true, limit = RECENT_LIMIT) {
    const summaries = state?.trajectorySummaries?.summaries || {};
    const list = [];
    for (const [id, summary] of Object.entries(summaries)) {
      if (isHiddenConversation(id, summary)) continue;
      const title = summary.annotations?.title || summary.summary;
      if (!title) continue;
      const updatedAt = Math.max(secondsOf(summary.lastModifiedTime), secondsOf(summary.createdTime));
      const status = classifyConversation(id, summary, state, activeCascadeId, hasFocus);
      const priority = status?.kind === 'pending' ? 3 : status?.kind === 'running' ? 2 : 1;
      const project = resolveProjectLabel(summary, projectLabels);
      const projectId = project ? resolveProjectId(summary, projectLabels, project) : '';
      const pinned = Boolean(summary.annotations?.pinned);
      const isUnread = status?.kind === 'unread' || Boolean(summary.annotations?.markedAsUnread);
      list.push({
        id,
        title,
        project,
        projectId,
        updatedAt,
        status,
        priority,
        pinned,
        isUnread
      });
    }
    list.sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);
    return { items: list.slice(0, limit), total: list.length };
  }

  function groupRecentConversations(items, nowMs = Date.now(), zh = isZhLang()) {
    const t = getCopy(zh);
    const nowDate = new Date(nowMs);
    const todayStartSec = Math.floor(
      new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime() / 1000
    );
    const yesterdayStartSec = todayStartSec - 86400;

    const buckets = [
      { key: 'active', label: t.groupActive, items: [] },
      { key: 'today', label: t.groupToday, items: [] },
      { key: 'yesterday', label: t.groupYesterday, items: [] },
      { key: 'earlier', label: t.groupEarlier, items: [] }
    ];

    for (const item of items || []) {
      if (item.priority >= 2) {
        buckets[0].items.push(item);
      } else if (item.updatedAt >= todayStartSec) {
        buckets[1].items.push(item);
      } else if (item.updatedAt >= yesterdayStartSec) {
        buckets[2].items.push(item);
      } else {
        buckets[3].items.push(item);
      }
    }

    return buckets.filter((b) => b.items.length > 0);
  }

  function navigateToConversation(id, router) {
    if (!id) return;
    if (router && typeof router.navigate === 'function') {
      try {
        router.navigate({ to: '/c/$cascadeId', params: { cascadeId: id } });
        return;
      } catch (e) {}
    }
    const existing = typeof document === 'object' ? document.querySelector?.(`a[href*="/c/${id}"]`) : null;
    if (existing && typeof existing.click === 'function') {
      existing.click();
      return;
    }
    if (typeof history === 'object' && typeof history.pushState === 'function') {
      history.pushState(null, '', `/c/${id}`);
      if (typeof window === 'object' && typeof PopStateEvent === 'function') {
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }

  async function copyTextSafe(text) {
    if (!text) return false;
    try {
      if (typeof navigator === 'object' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(String(text));
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand?.('copy');
      ta.remove();
      return true;
    } catch (e) {
      return false;
    }
  }

  function dispatchSplitConversation(id, direction, bindings) {
    const store = bindings?.store;
    if (!id || !store || typeof store.dispatch !== 'function') return false;
    try {
      const targetPaneId = store.getState?.()?.multiConvoLayout?.focusedPaneId || undefined;
      store.dispatch({
        type: 'multiConvoLayout/splitPane',
        payload: {
          targetPaneId,
          cascadeId: id,
          direction: direction === 'vertical' ? 'vertical' : 'horizontal'
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function runConversationAction(action, item, bindings, extra = {}) {
    if (!item?.id) return false;
    const svc = bindings?.agentService;
    const id = item.id;
    try {
      if (action === 'archive') {
        if (typeof svc?.updateConversationAnnotations === 'function') {
          await svc.updateConversationAnnotations(id, { archived: true }, true);
          return true;
        }
      } else if (action === 'stop') {
        if (typeof svc?.cancelCascadeInvocation === 'function') {
          await svc.cancelCascadeInvocation({ conversationId: id });
          return true;
        }
      } else if (action === 'pin') {
        if (typeof svc?.updateConversationAnnotations === 'function') {
          await svc.updateConversationAnnotations(id, { pinned: !item.pinned }, true);
          return true;
        }
      } else if (action === 'toggle-read') {
        if (typeof svc?.updateConversationAnnotations === 'function') {
          if (item.isUnread) {
            await svc.updateConversationAnnotations(
              id,
              { markedAsUnread: false, lastUserViewTime: { seconds: Math.floor(Date.now() / 1000) } },
              true
            );
          } else {
            await svc.updateConversationAnnotations(id, { markedAsUnread: true }, true);
          }
          return true;
        }
      } else if (action === 'rename') {
        const nextTitle = String(extra.title || '').trim();
        if (nextTitle && nextTitle !== item.title && typeof svc?.updateConversationAnnotations === 'function') {
          await svc.updateConversationAnnotations(id, { title: nextTitle }, true);
          return true;
        }
      } else if (action === 'delete') {
        if (typeof svc?.deleteCascadeTrajectory === 'function') {
          await svc.deleteCascadeTrajectory(id);
          return true;
        }
      } else if (action === 'copy-name') {
        return await copyTextSafe(item.title);
      } else if (action === 'copy-id') {
        return await copyTextSafe(item.id);
      } else if (action === 'copy-project') {
        return await copyTextSafe(item.project);
      } else if (action === 'split-right') {
        return dispatchSplitConversation(id, 'horizontal', bindings);
      } else if (action === 'split-down') {
        return dispatchSplitConversation(id, 'vertical', bindings);
      }
    } catch (e) {}
    return false;
  }

  function findProjectsSectionHeader(sidebar) {
    if (!sidebar) return null;
    const exact = sidebar.querySelector?.('[data-testid="section-header"][data-section-id="main-section-header"]');
    if (exact) return exact;
    const all = sidebar.querySelectorAll?.('[data-testid="section-header"]') || [];
    for (const el of all) {
      const dt = String(el.getAttribute?.('data-title') || '');
      if (/projects|项目管理/i.test(dt)) return el;
    }
    return all[0] || null;
  }

  function findHeaderActionsContainer(sectionHeader) {
    if (!sectionHeader) return null;
    const addBtn = sectionHeader.querySelector?.('[data-testid="sidebar-add-project-button"]');
    if (addBtn?.parentElement) return addBtn.parentElement;
    const btns = Array.from(sectionHeader.querySelectorAll?.('button') || []).filter((b) => !b.closest?.('h2'));
    if (btns.length && btns[0].parentElement) return btns[0].parentElement;
    return null;
  }

  class FolderStatusModule {
    constructor() {
      this.mounted = false;
      this.observer = null;
      this.sidebarEl = null;
      this.unsubscribe = null;
      this.storeRef = null;
      this.timer = null;
      this.onFocus = () => this.scheduleSync();
    }

    mount() {
      if (this.mounted) return;
      this.mounted = true;
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('blur', this.onFocus);
      this.attachObserver();
      this.sync();
    }

    attachObserver() {
      if (!this.mounted) return;
      const sidebar = document.querySelector?.('[data-testid="conversation-list-sidebar"]');
      if (!sidebar) {
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
          this.sidebarEl = null;
        }
        return;
      }
      if (this.sidebarEl === sidebar && this.observer) return;
      this.observer?.disconnect();
      this.sidebarEl = sidebar;
      if (typeof MutationObserver === 'function') {
        this.observer = new MutationObserver(() => this.scheduleSync());
        this.observer.observe(sidebar, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-expanded']
        });
      }
    }

    scheduleSync() {
      if (!this.mounted) return;
      this.attachObserver();
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.sync();
      }, 120);
    }

    ensureSubscription(store) {
      if (this.storeRef === store) return;
      this.unsubscribe?.();
      this.storeRef = store;
      this.unsubscribe = store.subscribe(() => this.scheduleSync());
    }

    sync() {
      if (!this.mounted) return;
      this.attachObserver();
      const bindings = findSidebarBindings();
      if (!bindings) {
        this.clearBadges();
        return;
      }
      const { store, groupsById } = bindings;
      this.ensureSubscription(store);
      const state = store.getState();
      const activeId =
        (typeof location === 'object' ? location.pathname.match(/\/c\/([a-f0-9-]{36})/i)?.[1] : null) || null;
      const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      const zh = isZhLang();

      const headers = document.querySelectorAll?.('[data-testid="project-header"]') || [];
      for (const btn of headers) {
        const container = btn.closest?.('[data-sidebar-section-drop-id]');
        const labelSpan = btn.querySelector?.('.truncate');
        const host = labelSpan?.parentElement || btn;
        if (!container || !host) continue;
        const expanded = btn.getAttribute('aria-expanded') !== 'false';
        const existing = container.querySelector?.('.ag-sb-folder-badges');
        if (expanded) {
          existing?.remove();
          continue;
        }
        const projectId = container.getAttribute('data-sidebar-section-drop-id');
        const ids = conversationIdsForProject(projectId, state, groupsById);
        const result = aggregateProject(ids, state, activeId, hasFocus, zh);
        if (!result.badges.length) {
          existing?.remove();
          continue;
        }
        const badgeEl = existing && existing.parentElement === host ? existing : document.createElement('span');
        if (existing && existing !== badgeEl) existing.remove();
        badgeEl.className = 'ag-sb-folder-badges';
        badgeEl.setAttribute('data-ag-sb-ui', '1');
        badgeEl.setAttribute('aria-label', result.summaryText);
        badgeEl.setAttribute('title', result.tooltipText || result.summaryText);
        const html = result.badges
          .map((b) => {
            const count = b.count > 1 ? `<span class="ag-sb-folder-badge-count">${b.count}</span>` : '';
            return `<span class="ag-sb-folder-badge" data-kind="${b.kind}">${renderBadgeIcon(b.kind, b.subkind)}${count}</span>`;
          })
          .join('');
        if (badgeEl.__agSbHtml !== html) {
          badgeEl.innerHTML = html;
          badgeEl.__agSbHtml = html;
        }
        if (!badgeEl.isConnected) host.appendChild(badgeEl);
      }
    }

    clearBadges() {
      const list = document.querySelectorAll?.('.ag-sb-folder-badges') || [];
      for (const el of list) el.remove();
    }

    unmount() {
      if (!this.mounted) return;
      this.mounted = false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.observer?.disconnect();
      this.observer = null;
      this.sidebarEl = null;
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.storeRef = null;
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('blur', this.onFocus);
      this.clearBadges();
    }
  }

  class RecentToggleModule {
    constructor() {
      this.mounted = false;
      this.recentMode = Boolean(window.__ag_sb_recent_mode_state);
      this.limit = RECENT_LIMIT;
      this.bellBtn = null;
      this.titleLabel = null;
      this.listWrap = null;
      this.sidebarEl = null;
      this.listRootEl = null;
      this.stickyHdrEl = null;
      this.sectionHdrEl = null;
      this.observer = null;
      this.storeRef = null;
      this.routerRef = null;
      this.bindingsRef = null;
      this.unsubscribe = null;
      this.timer = null;
      this.savedScrollTop = 0;
      this.itemsById = new Map();
      this.menuEl = null;
      this.submenuEl = null;
      this.menuOpenId = null;
      this.renamingId = null;
      this.deleteBackdropEl = null;
      this.onFocus = () => {
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
          this.closeKebabMenu();
        }
        this.scheduleSync();
      };
      this.onGlobalPointerDown = (ev) => {
        if (!this.menuEl) return;
        const target = ev?.target;
        if (
          target &&
          (this.menuEl.contains?.(target) ||
            this.submenuEl?.contains?.(target) ||
            target.closest?.('[data-recent-action="more"]'))
        ) {
          return;
        }
        this.closeKebabMenu();
      };
      this.onGlobalKeydown = (ev) => {
        if (ev?.key === 'Escape') {
          if (this.deleteBackdropEl) this.closeDeleteDialog();
          else if (this.menuEl) this.closeKebabMenu();
          else if (this.renamingId) {
            this.renamingId = null;
            this.sync();
          }
        }
      };
    }

    mount() {
      if (this.mounted) return;
      this.mounted = true;
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('blur', this.onFocus);
      document.addEventListener?.('pointerdown', this.onGlobalPointerDown, true);
      document.addEventListener?.('keydown', this.onGlobalKeydown, true);
      this.attachObserver();
      this.sync();
    }

    attachObserver() {
      if (!this.mounted) return;
      const sidebar = document.querySelector?.('[data-testid="conversation-list-sidebar"]');
      if (!sidebar) {
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
        return;
      }
      if (this.sidebarEl === sidebar && this.observer) return;
      this.observer?.disconnect();
      this.sidebarEl = sidebar;
      if (typeof MutationObserver === 'function') {
        this.observer = new MutationObserver(() => {
          if (!this.mounted) return;
          const hdr = findProjectsSectionHeader(sidebar);
          if (hdr && (!this.bellBtn || !this.bellBtn.isConnected)) {
            this.scheduleSync();
          }
        });
        this.observer.observe(sidebar, { childList: true, subtree: true });
      }
    }

    scheduleSync() {
      if (!this.mounted) return;
      this.attachObserver();
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.sync();
      }, 100);
    }

    ensureSubscription(store) {
      if (this.storeRef === store) return;
      this.unsubscribe?.();
      this.storeRef = store;
      this.unsubscribe = store.subscribe(() => {
        if (this.recentMode && !this.renamingId) this.scheduleSync();
      });
    }

    setRecentMode(nextMode) {
      const target = Boolean(nextMode);
      if (this.recentMode === target) return;
      this.closeKebabMenu();
      this.closeDeleteDialog();
      this.renamingId = null;
      if (target && this.sidebarEl && typeof this.sidebarEl.scrollTop === 'number') {
        this.savedScrollTop = this.sidebarEl.scrollTop;
      }
      this.recentMode = target;
      window.__ag_sb_recent_mode_state = target;
      this.sync();
      if (this.sidebarEl && typeof this.sidebarEl.scrollTop === 'number') {
        this.sidebarEl.scrollTop = target ? 0 : this.savedScrollTop;
      }
    }

    ensureHeaderControls(sectionHdr, zh) {
      const t = getCopy(zh);
      const actions = findHeaderActionsContainer(sectionHdr);
      if (actions) {
        let btn = actions.querySelector?.('.ag-sb-recent-bell-btn');
        if (!btn) {
          const siblingBtn = actions.querySelector?.('button');
          btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `ag-sb-recent-bell-btn ${siblingBtn ? siblingBtn.className.replace(/\bpopover-trigger-element\b/g, '').trim() : DEFAULT_ICON_BTN_CLASS}`;
          btn.setAttribute('data-ag-sb-ui', '1');
          btn.setAttribute('data-testid', 'ag-sb-recent-toggle-button');
          btn.setAttribute('data-no-drag', '');
          btn.innerHTML = BELL_SVG;
          btn.addEventListener('click', (ev) => {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            this.setRecentMode(!this.recentMode);
          });
          actions.insertBefore(btn, actions.firstChild || null);
        }
        const tip = this.recentMode ? t.toggleToProjects : t.toggleToRecent;
        if (btn.getAttribute('aria-pressed') !== String(this.recentMode)) {
          btn.setAttribute('aria-pressed', String(this.recentMode));
        }
        if (btn.getAttribute('aria-label') !== tip) btn.setAttribute('aria-label', tip);
        if (btn.getAttribute('title') !== tip) btn.setAttribute('title', tip);
        this.bellBtn = btn;
      }

      const h2 = sectionHdr.querySelector?.('h2');
      if (h2) {
        let lbl = h2.querySelector?.('.ag-sb-recent-title-label');
        if (!lbl) {
          lbl = document.createElement('span');
          lbl.className = 'ag-sb-recent-title-label truncate';
          lbl.setAttribute('data-ag-sb-ui', '1');
          h2.appendChild(lbl);
        }
        if (lbl.textContent !== t.title) lbl.textContent = t.title;
        this.titleLabel = lbl;
      }
    }

    closeSubmenu() {
      this.submenuEl?.remove();
      this.submenuEl = null;
      if (this.menuEl) {
        const opened = this.menuEl.querySelectorAll?.('[data-sub-open="1"]') || [];
        for (const el of opened) el.removeAttribute('data-sub-open');
      }
    }

    closeKebabMenu() {
      this.closeSubmenu();
      this.menuEl?.remove();
      this.menuEl = null;
      if (this.menuOpenId && this.listWrap) {
        const prevRow = this.listWrap.querySelector?.(`[data-recent-id="${this.menuOpenId}"]`);
        prevRow?.removeAttribute?.('data-menu-open');
      }
      this.menuOpenId = null;
    }

    closeDeleteDialog() {
      this.deleteBackdropEl?.remove();
      this.deleteBackdropEl = null;
    }

    openDeleteDialog(item) {
      this.closeKebabMenu();
      this.closeDeleteDialog();
      if (!item || !document.body) return;
      const t = getCopy();
      const backdrop = document.createElement('div');
      backdrop.id = DELETE_BACKDROP_ID;
      backdrop.setAttribute('data-ag-sb-ui', '1');
      const dlg = document.createElement('div');
      dlg.id = 'ag-sb-delete-dialog';
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.innerHTML = `
        <h3 class="ag-sb-dlg-title">${esc(t.deleteTitle)}</h3>
        <p class="ag-sb-dlg-desc">${esc(t.deleteDesc(item.title))}</p>
        <div class="ag-sb-dlg-actions">
          <button type="button" class="ag-sb-dlg-btn" data-cancel="1">${esc(t.cancel)}</button>
          <button type="button" class="ag-sb-dlg-btn" data-confirm="1">${esc(t.confirmDelete)}</button>
        </div>
      `;
      backdrop.addEventListener('click', (ev) => {
        if (ev.target === backdrop || ev.target.closest?.('[data-cancel="1"]')) {
          this.closeDeleteDialog();
          return;
        }
        if (ev.target.closest?.('[data-confirm="1"]')) {
          this.closeDeleteDialog();
          void runConversationAction('delete', item, this.bindingsRef).then(() => this.scheduleSync());
        }
      });
      backdrop.appendChild(dlg);
      document.body.appendChild(backdrop);
      this.deleteBackdropEl = backdrop;
    }

    startInlineRename(item) {
      this.closeKebabMenu();
      if (!item?.id) return;
      this.renamingId = item.id;
      this.sync();
      if (!this.listWrap) return;
      const input = this.listWrap.querySelector?.('.ag-sb-rename-input');
      if (!input) return;
      input.focus?.();
      input.select?.();
      let settled = false;
      const finish = (commit) => {
        if (settled) return;
        settled = true;
        const val = String(input.value || '').trim();
        this.renamingId = null;
        if (commit && val && val !== item.title) {
          void runConversationAction('rename', item, this.bindingsRef, { title: val }).then(() => this.scheduleSync());
        }
        this.sync();
      };
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation?.();
        if (ev.key === 'Enter') {
          ev.preventDefault?.();
          finish(true);
        } else if (ev.key === 'Escape') {
          ev.preventDefault?.();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (ev) => ev.stopPropagation?.());
    }

    openSubmenu(parentBtn, subItems, item) {
      this.closeSubmenu();
      if (!parentBtn || !subItems?.length || !document.body) return;
      parentBtn.setAttribute('data-sub-open', '1');
      const sub = document.createElement('div');
      sub.id = KEBAB_SUBMENU_ID;
      sub.setAttribute('role', 'menu');
      sub.setAttribute('data-ag-sb-ui', '1');
      for (const s of subItems) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ag-sb-menu-item';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('data-menu-act', s.act);
        b.innerHTML = `<span class="ag-sb-menu-item-left"><span>${esc(s.label)}</span></span>`;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation?.();
          this.closeKebabMenu();
          void runConversationAction(s.act, item, this.bindingsRef).then(() => this.scheduleSync());
        });
        sub.appendChild(b);
      }
      document.body.appendChild(sub);
      const pr = parentBtn.getBoundingClientRect ? parentBtn.getBoundingClientRect() : { right: 260, top: 100, left: 100 };
      const sr = sub.getBoundingClientRect ? sub.getBoundingClientRect() : { width: 156, height: 96 };
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      let left = pr.right + 4;
      if (left + sr.width > vw - 8) left = Math.max(8, pr.left - sr.width - 4);
      let top = pr.top - 4;
      if (top + sr.height > vh - 8) top = Math.max(8, vh - sr.height - 8);
      if (sub.style) {
        sub.style.left = `${Math.round(left)}px`;
        sub.style.top = `${Math.round(top)}px`;
      }
      this.submenuEl = sub;
    }

    openKebabMenu(item, anchorRect) {
      if (!item || !document.body) return;
      if (this.menuOpenId === item.id && this.menuEl) {
        this.closeKebabMenu();
        return;
      }
      this.closeKebabMenu();
      const t = getCopy();
      const menu = document.createElement('div');
      menu.id = KEBAB_MENU_ID;
      menu.setAttribute('role', 'menu');
      menu.setAttribute('data-ag-sb-ui', '1');
      menu.setAttribute('data-cascade-id', item.id);

      const copySubItems = [
        { act: 'copy-name', label: t.menuCopyName },
        { act: 'copy-id', label: t.menuCopyId }
      ];
      if (item.project) copySubItems.push({ act: 'copy-project', label: t.menuCopyProject });

      const splitSubItems = [
        { act: 'split-right', label: t.menuSplitRight },
        { act: 'split-down', label: t.menuSplitDown }
      ];

      const entries = [
        { act: 'rename', label: t.menuRename, icon: RENAME_SVG },
        { act: 'pin', label: item.pinned ? t.menuUnpin : t.menuPin, icon: item.pinned ? UNPIN_SVG : PIN_SVG },
        { act: 'toggle-read', label: item.isUnread ? t.menuMarkRead : t.menuMarkUnread, icon: MAIL_SVG },
        { sep: true },
        { act: 'copy', label: t.menuCopy, icon: COPY_SVG, submenu: copySubItems },
        { act: 'split', label: t.menuSplit, icon: SPLIT_SVG, submenu: splitSubItems },
        { sep: true },
        { act: 'archive', label: t.menuArchive, icon: ARCHIVE_SVG },
        { act: 'delete', label: t.menuDelete, icon: DELETE_SVG, danger: true }
      ];

      for (const entry of entries) {
        if (entry.sep) {
          const sep = document.createElement('div');
          sep.className = 'ag-sb-menu-sep';
          menu.appendChild(sep);
          continue;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ag-sb-menu-item';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('data-menu-act', entry.act);
        if (entry.danger) b.setAttribute('data-danger', '1');
        b.innerHTML = `<span class="ag-sb-menu-item-left"><span class="ag-sb-menu-item-icon">${entry.icon}</span><span>${esc(entry.label)}</span></span>${entry.submenu ? CHEVRON_RIGHT_SVG : ''}`;
        if (entry.submenu) {
          b.addEventListener('mouseenter', () => this.openSubmenu(b, entry.submenu, item));
          b.addEventListener('click', (ev) => {
            ev.stopPropagation?.();
            this.openSubmenu(b, entry.submenu, item);
          });
        } else {
          b.addEventListener('mouseenter', () => this.closeSubmenu());
          b.addEventListener('click', (ev) => {
            ev.stopPropagation?.();
            if (entry.act === 'rename') {
              this.startInlineRename(item);
            } else if (entry.act === 'delete') {
              this.openDeleteDialog(item);
            } else {
              this.closeKebabMenu();
              void runConversationAction(entry.act, item, this.bindingsRef).then(() => this.scheduleSync());
            }
          });
        }
        menu.appendChild(b);
      }

      document.body.appendChild(menu);
      const mr = menu.getBoundingClientRect ? menu.getBoundingClientRect() : { width: 176, height: 270 };
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      let left = anchorRect.left;
      if (left + mr.width > vw - 8) left = Math.max(8, vw - mr.width - 8);
      let top = anchorRect.bottom + 4;
      if (top + mr.height > vh - 8) top = Math.max(8, anchorRect.top - mr.height - 4);
      if (menu.style) {
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
      }

      this.menuEl = menu;
      this.menuOpenId = item.id;
      const row = this.listWrap?.querySelector?.(`[data-recent-id="${item.id}"]`);
      row?.setAttribute?.('data-menu-open', '1');
    }

    ensureListWrap(listRoot, stickyHdr) {
      if (this.listWrap && this.listWrap.parentElement === listRoot) return this.listWrap;
      this.listWrap?.remove();
      const wrap = document.createElement('div');
      wrap.id = RECENT_LIST_WRAP_ID;
      wrap.setAttribute('data-ag-sb-ui', '1');
      wrap.setAttribute('role', 'region');
      wrap.addEventListener('click', (e) => {
        if (e.target.closest?.('.ag-sb-rename-input')) return;
        const actBtn = e.target.closest?.('[data-recent-action]');
        if (actBtn) {
          e.preventDefault?.();
          e.stopPropagation?.();
          const row = actBtn.closest?.('[data-recent-id]');
          const id = row?.dataset?.recentId;
          const item = id ? this.itemsById.get(id) : null;
          if (!item) return;
          const act = actBtn.getAttribute('data-recent-action');
          if (act === 'more') {
            const r = actBtn.getBoundingClientRect
              ? actBtn.getBoundingClientRect()
              : { left: 180, top: 120, bottom: 144 };
            this.openKebabMenu(item, r);
          } else {
            this.closeKebabMenu();
            void runConversationAction(act, item, this.bindingsRef).then(() => this.scheduleSync());
          }
          return;
        }
        const row = e.target.closest?.('[data-recent-id]');
        if (row) {
          this.closeKebabMenu();
          navigateToConversation(row.dataset.recentId, this.routerRef);
          this.scheduleSync();
        }
      });
      wrap.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest?.('.ag-sb-rename-input') || e.target.closest?.('[data-recent-action]')) return;
        const row = e.target.closest?.('[data-recent-id]');
        if (row) {
          e.preventDefault?.();
          this.closeKebabMenu();
          navigateToConversation(row.dataset.recentId, this.routerRef);
          this.scheduleSync();
        }
      });
      wrap.addEventListener('contextmenu', (e) => {
        const row = e.target.closest?.('[data-recent-id]');
        if (!row) return;
        const item = this.itemsById.get(row.dataset.recentId);
        if (!item) return;
        e.preventDefault?.();
        e.stopPropagation?.();
        this.openKebabMenu(item, {
          left: e.clientX || 180,
          top: e.clientY || 120,
          bottom: (e.clientY || 120) + 2
        });
      });
      const nextSib = stickyHdr && stickyHdr.parentElement === listRoot ? stickyHdr.nextSibling : null;
      listRoot.insertBefore(wrap, nextSib);
      this.listWrap = wrap;
      return wrap;
    }

    clearModeAttrs() {
      this.closeKebabMenu();
      this.closeDeleteDialog();
      this.renamingId = null;
      this.listWrap?.remove();
      this.listWrap = null;
      try {
        this.sidebarEl?.removeAttribute?.(RECENT_MODE_ATTR);
        this.sectionHdrEl?.removeAttribute?.(RECENT_MODE_ATTR);
        this.listRootEl?.removeAttribute?.(LIST_ROOT_ATTR);
        this.stickyHdrEl?.removeAttribute?.(STICKY_HDR_ATTR);
      } catch (e) {}
    }

    sync() {
      if (!this.mounted) return;
      this.attachObserver();
      const bindings = findSidebarBindings();
      if (!bindings?.sidebar) return;

      const { store, router, projectLabels, sidebar } = bindings;
      this.bindingsRef = bindings;
      this.routerRef = router || this.routerRef;
      this.sidebarEl = sidebar;
      this.ensureSubscription(store);

      const sectionHdr = findProjectsSectionHeader(sidebar);
      if (!sectionHdr) return;
      this.sectionHdrEl = sectionHdr;

      const zh = isZhLang();
      const t = getCopy(zh);
      this.ensureHeaderControls(sectionHdr, zh);

      const listRoot = sidebar.firstElementChild || sidebar;
      let stickyHdr = sectionHdr;
      while (stickyHdr && stickyHdr.parentElement && stickyHdr.parentElement !== listRoot) {
        stickyHdr = stickyHdr.parentElement;
      }
      this.listRootEl = listRoot;
      this.stickyHdrEl = stickyHdr && stickyHdr.parentElement === listRoot ? stickyHdr : null;

      if (!this.recentMode) {
        this.clearModeAttrs();
        return;
      }

      listRoot.setAttribute?.(LIST_ROOT_ATTR, '1');
      this.stickyHdrEl?.setAttribute?.(STICKY_HDR_ATTR, '1');
      sidebar.setAttribute?.(RECENT_MODE_ATTR, '1');
      sectionHdr.setAttribute?.(RECENT_MODE_ATTR, '1');

      const state = store.getState();
      const activeId =
        (typeof location === 'object' ? location.pathname.match(/\/c\/([a-f0-9-]{36})/i)?.[1] : null) || null;
      const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      const { items } = selectRecentConversations(state, projectLabels, activeId, hasFocus, this.limit);

      this.itemsById.clear();
      for (const it of items) this.itemsById.set(it.id, it);

      const groups = groupRecentConversations(items, Date.now(), zh);
      const wrap = this.ensureListWrap(listRoot, this.stickyHdrEl);
      wrap.setAttribute('aria-label', t.aria);

      const html = groups.length
        ? groups
            .map((grp) => {
              const rowsHtml = grp.items
                .map((item) => {
                  const selected = item.id === activeId;
                  const isRunning = item.status?.kind === 'running';
                  const isRenaming = this.renamingId === item.id;
                  const isMenuOpen = this.menuOpenId === item.id;
                  const firstAct = isRunning ? 'stop' : 'archive';
                  const firstLabel = isRunning ? t.actStop : t.actArchive;
                  const firstSvg = isRunning ? STOP_SVG : ARCHIVE_SVG;
                  const pinLabel = item.pinned ? t.actUnpin : t.actPin;
                  const pinSvg = item.pinned ? UNPIN_SVG : PIN_SVG;
                  const statusHtml = item.status
                    ? `<span class="ag-sb-recent-status-slot" data-kind="${item.status.kind}">${renderBadgeIcon(item.status.kind, item.status.subkind)}</span>`
                    : '';
                  const pinDotHtml =
                    item.pinned && !item.status ? `<span class="ag-sb-recent-pin-dot">${PIN_SM_SVG}</span>` : '';
                  const titleHtml = isRenaming
                    ? `<input type="text" class="ag-sb-rename-input" value="${esc(item.title)}" />`
                    : `<span class="ag-sb-recent-title" title="${esc(item.title)}">${esc(item.title)}</span>`;
                  const projHtml = item.project
                    ? `<span class="ag-sb-recent-project" title="${esc(item.project)}">${esc(item.project)}</span>`
                    : '';

                  return `
                    <div role="button" tabindex="0" class="ag-sb-recent-row agy-sidebar-row group" data-recent-id="${esc(item.id)}" data-selected="${selected}" data-pinned="${item.pinned}"${isMenuOpen ? ' data-menu-open="1"' : ''}${isRenaming ? ' data-renaming="1"' : ''}>
                      <span class="ag-sb-recent-row-left">${statusHtml}${pinDotHtml}${titleHtml}</span>
                      ${projHtml}
                      <span class="ag-sb-row-actions">
                        <button type="button" class="ag-sb-row-act-btn" data-recent-action="${firstAct}" aria-label="${esc(firstLabel)}" title="${esc(firstLabel)}">${firstSvg}</button>
                        <button type="button" class="ag-sb-row-act-btn" data-recent-action="pin" data-pinned="${item.pinned}" aria-label="${esc(pinLabel)}" title="${esc(pinLabel)}">${pinSvg}</button>
                        <button type="button" class="ag-sb-row-act-btn" data-recent-action="more" aria-label="${esc(t.actMore)}" title="${esc(t.actMore)}">${KEBAB_SVG}</button>
                      </span>
                    </div>
                  `;
                })
                .join('');
              return `
                <div class="ag-sb-time-group" data-time-group="${grp.key}">
                  <div class="ag-sb-time-group-label">${esc(grp.label)}</div>
                  ${rowsHtml}
                </div>
              `;
            })
            .join('')
        : `<div class="ag-sb-recent-empty">${esc(t.empty)}</div>`;

      if (wrap.__agSbHtml !== html) {
        wrap.innerHTML = html;
        wrap.__agSbHtml = html;
      }
    }

    unmount(resetMode = false) {
      if (!this.mounted) return;
      this.mounted = false;
      if (resetMode) {
        this.recentMode = false;
        window.__ag_sb_recent_mode_state = false;
      }
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.observer?.disconnect();
      this.observer = null;
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.storeRef = null;
      this.routerRef = null;
      this.bindingsRef = null;
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('blur', this.onFocus);
      document.removeEventListener?.('pointerdown', this.onGlobalPointerDown, true);
      document.removeEventListener?.('keydown', this.onGlobalKeydown, true);
      this.clearModeAttrs();
      this.bellBtn?.remove();
      this.bellBtn = null;
      this.titleLabel?.remove();
      this.titleLabel = null;
      this.sidebarEl = null;
      this.listRootEl = null;
      this.stickyHdrEl = null;
      this.sectionHdrEl = null;
    }
  }

  // ==========================================================================
  // Preferences & Settings -> Appearance Independent Switches
  // ==========================================================================

  function readPrefsFromStorage() {
    const cfg = ctx?.config || {};
    const defaults = {
      recentSection: normalizeBoolPref(cfg.sidebarRecentSection, true),
      folderStatus: normalizeBoolPref(cfg.sidebarFolderStatus, true)
    };
    try {
      const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      return {
        recentSection:
          parsed.recentSection !== undefined ? normalizeBoolPref(parsed.recentSection, defaults.recentSection) : defaults.recentSection,
        folderStatus:
          parsed.folderStatus !== undefined ? normalizeBoolPref(parsed.folderStatus, defaults.folderStatus) : defaults.folderStatus
      };
    } catch (e) {
      return defaults;
    }
  }

  function writePrefsToStorage(nextPrefs) {
    try {
      window.localStorage.setItem(
        PREFS_STORAGE_KEY,
        JSON.stringify({
          recentSection: normalizeBoolPref(nextPrefs.recentSection, true),
          folderStatus: normalizeBoolPref(nextPrefs.folderStatus, true)
        })
      );
    } catch (e) {}
  }

  let disposed = false;
  let prefs = readPrefsFromStorage();
  let lastLangZh = isZhLang();
  let stateWatcherTimer = null;
  let settingsSyncTimer1 = null;
  let settingsSyncTimer2 = null;

  const recentMod = new RecentToggleModule();
  const folderMod = new FolderStatusModule();

  function applyModulesForPrefs() {
    if (disposed) return;
    if (prefs.recentSection) {
      if (!recentMod.mounted) recentMod.mount();
      else recentMod.sync();
    } else if (recentMod.mounted) {
      recentMod.unmount(true);
    }
    if (prefs.folderStatus) {
      if (!folderMod.mounted) folderMod.mount();
      else folderMod.sync();
    } else if (folderMod.mounted) {
      folderMod.unmount();
    }
  }

  function findAppearanceThemeGroup() {
    const marked = document.querySelector?.('[data-slot="toggle-group"][data-ag-theme-toggle-group="1"]');
    if (marked) return marked;
    const groups = document.querySelectorAll?.('.agy-card [data-slot="toggle-group"]') || [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.querySelector?.('button[data-ag-native-theme-slot="light"]')) return g;
      if (g.getAttribute?.('data-ag-theme-toggle-group') === '0') continue;
      const btns = g.querySelectorAll?.('button') || [];
      if (btns.length >= 3) {
        const joined = Array.from(btns)
          .map((b) => String(b.getAttribute?.('aria-label') || ''))
          .join('|');
        if (/light|dark|system|浅色|深色|跟随系统|ライト|ダーク/i.test(joined)) return g;
      }
    }
    return null;
  }

  function syncAppearanceSidebarSettingsRows() {
    const t = getCopy();
    const specs = [
      {
        rowAttr: 'data-ag-sb-recent-row',
        labelAttr: 'data-ag-sb-recent-label',
        descAttr: 'data-ag-sb-recent-desc',
        swAttr: 'data-ag-sb-recent-switch',
        label: t.recentSettingLabel,
        desc: t.recentSettingDesc,
        checked: Boolean(prefs.recentSection)
      },
      {
        rowAttr: 'data-ag-sb-folder-row',
        labelAttr: 'data-ag-sb-folder-label',
        descAttr: 'data-ag-sb-folder-desc',
        swAttr: 'data-ag-sb-folder-switch',
        label: t.folderSettingLabel,
        desc: t.folderSettingDesc,
        checked: Boolean(prefs.folderStatus)
      }
    ];
    for (const spec of specs) {
      const rows = document.querySelectorAll?.(`[${spec.rowAttr}="1"]`) || [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lbl = row.querySelector?.(`[${spec.labelAttr}="1"]`);
        if (lbl && lbl.textContent !== spec.label) lbl.textContent = spec.label;
        const desc = row.querySelector?.(`[${spec.descAttr}="1"]`);
        if (desc && desc.textContent !== spec.desc) desc.textContent = spec.desc;
        const sw = row.querySelector?.(`[${spec.swAttr}="1"]`);
        if (sw) {
          if (sw.getAttribute('aria-checked') !== String(spec.checked)) {
            sw.setAttribute('aria-checked', String(spec.checked));
          }
          if (sw.getAttribute('aria-label') !== spec.label) {
            sw.setAttribute('aria-label', spec.label);
          }
        }
      }
    }
  }

  function buildSwitchRow(rowClassName, spec, onToggle) {
    const row = document.createElement('div');
    row.setAttribute(spec.rowAttr, '1');
    row.setAttribute('data-ag-sb-ui', '1');
    row.className = rowClassName;

    const leftCol = document.createElement('div');
    leftCol.className = 'flex-1 flex flex-col gap-0.5';
    const labelInner = document.createElement('div');
    labelInner.className = 'flex items-center gap-1.5';
    const labelSpan = document.createElement('span');
    labelSpan.setAttribute(spec.labelAttr, '1');
    labelSpan.textContent = spec.label;
    labelInner.appendChild(labelSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'ag-sb-row-desc';
    descSpan.setAttribute(spec.descAttr, '1');
    descSpan.textContent = spec.desc;

    leftCol.appendChild(labelInner);
    leftCol.appendChild(descSpan);

    const rightCol = document.createElement('div');
    rightCol.className = 'shrink-0 flex items-center';
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('data-ag-sb-switch', spec.key);
    sw.setAttribute(spec.swAttr, '1');
    sw.setAttribute('aria-checked', String(spec.checked));
    sw.setAttribute('aria-label', spec.label);
    const thumb = document.createElement('span');
    thumb.className = 'ag-sb-switch-thumb';
    sw.appendChild(thumb);
    sw.addEventListener('click', (ev) => {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      onToggle();
    });
    rightCol.appendChild(sw);

    row.appendChild(leftCol);
    row.appendChild(rightCol);
    return row;
  }

  function ensureAppearanceSidebarSettingsRows() {
    const group = findAppearanceThemeGroup();
    if (!group) return false;
    const themeRow = group.closest ? group.closest('.agy-card > div') : null;
    const card = themeRow ? themeRow.parentElement : null;
    if (!card) return false;

    const rowClassName =
      themeRow?.className || 'py-2 px-3 w-full bg-transparent flex justify-between gap-4 items-center';
    const t = getCopy();

    if (!card.querySelector?.('[data-ag-sb-recent-row="1"]')) {
      card.appendChild(
        buildSwitchRow(
          rowClassName,
          {
            key: 'recentSection',
            rowAttr: 'data-ag-sb-recent-row',
            labelAttr: 'data-ag-sb-recent-label',
            descAttr: 'data-ag-sb-recent-desc',
            swAttr: 'data-ag-sb-recent-switch',
            label: t.recentSettingLabel,
            desc: t.recentSettingDesc,
            checked: Boolean(prefs.recentSection)
          },
          () => setSidebarEnhancePrefs({ recentSection: !prefs.recentSection }, true)
        )
      );
    }

    if (!card.querySelector?.('[data-ag-sb-folder-row="1"]')) {
      card.appendChild(
        buildSwitchRow(
          rowClassName,
          {
            key: 'folderStatus',
            rowAttr: 'data-ag-sb-folder-row',
            labelAttr: 'data-ag-sb-folder-label',
            descAttr: 'data-ag-sb-folder-desc',
            swAttr: 'data-ag-sb-folder-switch',
            label: t.folderSettingLabel,
            desc: t.folderSettingDesc,
            checked: Boolean(prefs.folderStatus)
          },
          () => setSidebarEnhancePrefs({ folderStatus: !prefs.folderStatus }, true)
        )
      );
    }

    syncAppearanceSidebarSettingsRows();
    return true;
  }

  function setSidebarEnhancePrefs(nextPrefs, persist = true) {
    if (!nextPrefs || typeof nextPrefs !== 'object') return;
    prefs = {
      recentSection:
        nextPrefs.recentSection !== undefined
          ? normalizeBoolPref(nextPrefs.recentSection, prefs.recentSection)
          : prefs.recentSection,
      folderStatus:
        nextPrefs.folderStatus !== undefined
          ? normalizeBoolPref(nextPrefs.folderStatus, prefs.folderStatus)
          : prefs.folderStatus
    };
    if (persist) writePrefsToStorage(prefs);
    applyModulesForPrefs();
    syncAppearanceSidebarSettingsRows();
  }

  function pollRuntimeSignals() {
    if (disposed) return;
    const nowZh = isZhLang();
    const langChanged = nowZh !== lastLangZh;
    if (langChanged) {
      lastLangZh = nowZh;
      if (prefs.recentSection && recentMod.mounted && !recentMod.renamingId) recentMod.sync();
      if (prefs.folderStatus && folderMod.mounted) folderMod.sync();
    }
    if (prefs.recentSection && recentMod.mounted && !recentMod.bellBtn?.isConnected) {
      recentMod.sync();
    }
    if (prefs.folderStatus && folderMod.mounted && !folderMod.sidebarEl?.isConnected) {
      folderMod.sync();
    }
    ensureAppearanceSidebarSettingsRows();
  }

  function handleDocumentClick(ev) {
    if (disposed) return;
    const t = ev?.target;
    if (!t || typeof t.closest !== 'function') return;
    if (
      t.closest('[data-testid="settings-button"]') ||
      t.closest('[data-testid^="settings-nav-item-"]') ||
      t.closest('[data-ag-lang-toggle-group="1"]') ||
      t.closest('[data-ag-theme-toggle-group="1"]')
    ) {
      if (settingsSyncTimer1) clearTimeout(settingsSyncTimer1);
      if (settingsSyncTimer2) clearTimeout(settingsSyncTimer2);
      settingsSyncTimer1 = setTimeout(() => {
        settingsSyncTimer1 = null;
        if (!disposed) pollRuntimeSignals();
      }, 80);
      settingsSyncTimer2 = setTimeout(() => {
        settingsSyncTimer2 = null;
        if (!disposed) pollRuntimeSignals();
      }, 260);
    }
  }

  function handleStorageSync(ev) {
    if (disposed || !ev) return;
    if (ev.key === PREFS_STORAGE_KEY) {
      prefs = readPrefsFromStorage();
      applyModulesForPrefs();
      syncAppearanceSidebarSettingsRows();
    }
  }

  function handlePopstate() {
    if (disposed) return;
    if (prefs.recentSection && recentMod.mounted && recentMod.recentMode) recentMod.scheduleSync();
    if (prefs.folderStatus && folderMod.mounted) folderMod.scheduleSync();
  }

  function cleanupSettingsDom() {
    const els = document.querySelectorAll?.('[data-ag-sb-recent-row="1"], [data-ag-sb-folder-row="1"]') || [];
    for (const el of els) el.remove();
  }

  function teardownSidebarEnhance() {
    if (disposed) return;
    disposed = true;
    if (stateWatcherTimer) clearInterval(stateWatcherTimer);
    if (settingsSyncTimer1) clearTimeout(settingsSyncTimer1);
    if (settingsSyncTimer2) clearTimeout(settingsSyncTimer2);
    stateWatcherTimer = settingsSyncTimer1 = settingsSyncTimer2 = null;
    document.removeEventListener?.('click', handleDocumentClick, true);
    window.removeEventListener?.('storage', handleStorageSync);
    window.removeEventListener?.('popstate', handlePopstate);
    recentMod.unmount(false);
    folderMod.unmount();
    cleanupSettingsDom();
    try {
      delete window.__ag_teardown_sidebar_enhance_fn;
      delete window.__ag_sync_sidebar_enhance_fn;
      delete window.__ag_set_sidebar_enhance_prefs_fn;
    } catch (e) {
      window.__ag_teardown_sidebar_enhance_fn = null;
      window.__ag_sync_sidebar_enhance_fn = null;
      window.__ag_set_sidebar_enhance_prefs_fn = null;
    }
  }

  window.__ag_teardown_sidebar_enhance_fn = teardownSidebarEnhance;
  window.__ag_sync_sidebar_enhance_fn = () => {
    if (disposed) return;
    pollRuntimeSignals();
    if (prefs.recentSection && recentMod.mounted) recentMod.sync();
    if (prefs.folderStatus && folderMod.mounted) folderMod.sync();
  };
  window.__ag_set_sidebar_enhance_prefs_fn = setSidebarEnhancePrefs;

  if (ctx && ctx.__agSidebarEnhanceExposeForTest) {
    ctx.__agSidebarEnhanceExports = {
      isHiddenConversation,
      classifyConversation,
      aggregateProject,
      conversationIdsForProject,
      renderBadgeIcon,
      secondsOf,
      findSidebarBindings,
      isZhLang,
      resolveProjectLabel,
      resolveProjectId,
      selectRecentConversations,
      groupRecentConversations,
      navigateToConversation,
      runConversationAction,
      dispatchSplitConversation,
      FolderStatusModule,
      RecentToggleModule,
      ensureAppearanceSidebarSettingsRows,
      syncAppearanceSidebarSettingsRows,
      setSidebarEnhancePrefs,
      getPrefs: () => ({ ...prefs }),
      teardownSidebarEnhance,
      recentMod,
      folderMod
    };
  }

  document.addEventListener?.('click', handleDocumentClick, true);
  window.addEventListener?.('storage', handleStorageSync);
  window.addEventListener?.('popstate', handlePopstate);

  stateWatcherTimer = setInterval(pollRuntimeSignals, STATE_WATCH_INTERVAL_MS);

  if (typeof ctx?.onCleanup === 'function') {
    ctx.onCleanup(teardownSidebarEnhance);
  } else if (Array.isArray(window.__ag_cleanup_fns)) {
    window.__ag_cleanup_fns.push(teardownSidebarEnhance);
  }

  if (document.body) {
    applyModulesForPrefs();
    ensureAppearanceSidebarSettingsRows();
  }
})(typeof ctx !== 'undefined' ? ctx : undefined);
