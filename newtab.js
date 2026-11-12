'use strict';

import { CATEGORY_INDEX, categorizeTab, compileCustomGroups, matchCustomDomain } from './categories.js';
import {
  GROUPS_KEY,
  GROUP_COLORS,
  assignDomain,
  createGroup,
  deleteGroup,
  editGroup,
  loadGroups,
  moveGroup,
  normalizeDomain,
  unassignDomain,
} from './custom-groups.js';
import {
  archivePlan,
  skipReason,
  deleteBatch,
  exportArchive,
  forgetSuspended,
  importArchive,
  isBatchKey,
  isSuspendedKey,
  loadArchive,
  loadSuspended,
  planArchive,
  removeArchivedTabs,
  reopenArchivedTab,
  restoreBatch,
} from './archive.js';
import { SUSPENDED_WINDOW_ID, placeSuspended, reopenSuspended, suspendTabs } from './suspend.js';

const SELF_URL = globalThis.chrome?.runtime?.getURL
  ? chrome.runtime.getURL('newtab.html')
  : '';
const EXTENSION_ORIGIN = globalThis.chrome?.runtime?.getURL
  ? chrome.runtime.getURL('')
  : '';

const COLLAPSED_KEY = 'tabOverview.collapsedGroups';
const COLLAPSED_CATEGORIES_KEY = 'tabOverview.collapsedCategories';
const ARCHIVE_COLLAPSED_KEY = 'tabOverview.collapsedArchiveGroups';
const VIEW_KEY = 'tabOverview.view';
const SOURCE_KEY = 'tabOverview.source';
const SHOW_EMPTY_GROUPS_KEY = 'tabOverview.showEmptyGroups';
const OPENED_AT_PREFIX = 'tabOpenedAt:';
const VIEWS = new Set(['windows', 'sorted']);
const EXTENSION_STORAGE = Boolean(globalThis.chrome?.storage?.local?.get);
const SOURCE_NAMES = new Set(EXTENSION_STORAGE ? ['open', 'archive'] : ['open']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ICONS = {
  chevron:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round"/></svg>',
  pin:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 ' +
    '15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 ' +
    '2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round"/></svg>',
  audio:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 ' +
    '1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" ' +
    'fill="currentColor"/><path d="M16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.8" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 ' +
    '1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" ' +
    'fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round"/></svg>',
  grid:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" ' +
    'stroke-width="1.6"/><rect x="14" y="3" width="7" height="7" rx="2" ' +
    'stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="7" ' +
    'height="7" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="14" ' +
    'y="14" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.6"/>' +
    '</svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="m16.2 16.2 4.3 4.3" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 3.5 21 20H3L12 3.5Z" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linejoin="round"/><path d="M12 9v5" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1" ' +
    'fill="currentColor"/></svg>',
  archive:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="5" rx="1.5" stroke="currentColor" ' +
    'stroke-width="1.6"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  more:
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/>' +
    '<circle cx="12.5" cy="8" r="1.3"/></svg>',
  pencil:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M10.5 3.5l2 2L6 12l-2.6.6L4 10z" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linejoin="round"/></svg>',
  suspend:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linejoin="round"/></svg>',
};

const SOURCES = {
  open: {
    collapsedKey: COLLAPSED_KEY,
    tabNoun: 'tab',
    containerNoun: ['window', 'windows'],
    windows: () => state.windows,
    containerCount: () => state.windows.filter((win) => win.id !== SUSPENDED_WINDOW_ID).length,
    error: () => state.openError,
    errorTitle: 'Couldn’t read your tabs',
    renderWindows: renderWindowView,
    ageOf: openedAge,
    empty: {
      icon: ICONS.grid,
      title: 'No other tabs open',
      message: 'This is the only tab in your browser right now. Open a page and it will show up here.',
    },
    actions: {
      activate: activateTab,
      activateLabel: 'Switch to',
      dismiss: closeTab,
      dismissLabel: 'Close',
      middleClick: closeTab,
      archiveSection: promptArchive,
      suspendSection: suspendScope,
      reopenSection: reopenScope,
      closeSection: promptClose,
    },
    // A suspended tab is listed with the open tabs but is closed in the browser.
    suspended: {
      ageOf: suspendedAge,
      actions: {
        activate: reopenTab,
        activateLabel: 'Reopen',
        dismiss: forgetTab,
        dismissLabel: 'Forget suspended tab',
      },
    },
  },
  archive: {
    collapsedKey: ARCHIVE_COLLAPSED_KEY,
    tabNoun: 'archived tab',
    containerNoun: ['batch', 'batches'],
    windows: () => state.batches.flatMap((batch) => batch.windows),
    containerCount: () => state.batches.length,
    error: () => state.archiveError,
    errorTitle: 'Couldn’t read the archive',
    renderWindows: renderBatchesView,
    ageOf: archivedAge,
    empty: {
      icon: ICONS.archive,
      title: 'Your archive is empty',
      message: 'Archive all, on the Open view, saves every open tab here and closes it. ' +
        'Archived tabs keep their windows and groups, and you can search and reopen them ' +
        'any time. Import brings back a backup file you exported earlier.',
      actionLabel: 'Show open tabs',
      onAction: () => switchSource('open'),
    },
    actions: {
      activate: openArchivedTab,
      activateLabel: 'Open',
      dismiss: deleteArchivedTab,
      dismissLabel: 'Remove from archive',
    },
  },
};

const state = {
  windows: [],
  openedAt: new Map(),
  openError: null,
  batches: [],
  archiveError: null,
  query: '',
  source: loadChoice(SOURCE_KEY, SOURCE_NAMES, 'open'),
  view: loadChoice(VIEW_KEY, VIEWS, 'windows'),
  collapsed: {
    open: loadSet(COLLAPSED_KEY, (value) => toNumberId(value) ?? toStringId(value)),
    archive: loadSet(ARCHIVE_COLLAPSED_KEY, toStringId),
  },
  collapsedCategories: loadSet(COLLAPSED_CATEGORIES_KEY, toStringId),
  showEmptyGroups: loadChoice(SHOW_EMPTY_GROUPS_KEY, new Set(['true']), 'false') === 'true',
  // null | { kind: 'confirm' | 'closeConfirm', scope, returnFocus } | { kind: 'busy', text }
  //      | { kind: 'result', text, detail, tone, batchId? }
  // scope: { kind: 'all' | 'window' | 'group' | 'category', id, name, label }
  prompt: null,
  confirmDeleteBatchId: null,
  customGroups: [],
  groupRules: compileCustomGroups([]),
  // null | { key, host, naming, draft }: the open tab card menu
  menu: null,
  loading: true,
};

const els = {};
const iconTemplates = new Map();
const pendingArchivedTabs = new Set();
let refreshTimer = null;

/* ------------------------------------------------------------------ startup */

function init() {
  els.overview = document.getElementById('overview');
  els.summary = document.getElementById('summary');
  els.search = document.getElementById('search');
  els.viewButtons = document.querySelectorAll('.view-button[data-view]');
  els.sourceSwitch = document.getElementById('source-switch');
  els.sourceButtons = document.querySelectorAll('.source-button');
  els.openCount = document.getElementById('open-count');
  els.archiveCount = document.getElementById('archive-count');
  els.archiveAll = document.getElementById('archive-all');
  els.archiveExport = document.getElementById('archive-export');
  els.archiveImport = document.getElementById('archive-import');
  els.archiveImportFile = document.getElementById('archive-import-file');
  els.banner = document.getElementById('banner');
  els.footerHint = document.getElementById('footer-hint');
  els.groupsAdd = document.getElementById('groups-add');
  els.groupsShowEmpty = document.getElementById('groups-show-empty');

  if (!globalThis.chrome?.tabs?.query || !globalThis.chrome?.windows?.getAll) {
    renderUnsupported();
    return;
  }

  bindEvents();
  bindPointerHold();
  bindSearch();
  bindViewSwitch();
  bindArchiveControls();
  bindCustomGroups();
  applyViewButtons();

  requestTimeSync()
    .then(refresh)
    .catch(() => refresh());

  setInterval(updateAges, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateAges();
  });
}

async function requestTimeSync() {
  if (!chrome.runtime?.sendMessage) return;
  try {
    await chrome.runtime.sendMessage({ type: 'syncTabTimes' });
  } catch {
    // Timestamps are optional; the overview still works without them.
  }
}

const LOADERS = EXTENSION_STORAGE
  ? { open: loadOpen, archive: loadArchiveState, groups: loadCustomGroups }
  : { open: loadOpen };
const pendingParts = new Set();

const isBusy = () => state.prompt?.kind === 'busy';

async function refresh(parts = Object.keys(LOADERS)) {
  // Long archive operations refresh once when they finish; re-rendering on
  // every intermediate tab or storage event would only flicker.
  if (isBusy()) return;
  await Promise.all(parts.map((part) => LOADERS[part]()));
  state.loading = false;
  renderWhenReleased();
}

function scheduleRefresh(part) {
  pendingParts.add(part);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(flushRefresh, 80);
}

// A render replaces the page's buttons, and a button replaced between mousedown
// and mouseup never gets the click. Tab events arrive several times a second
// while pages load, so renders wait until the pointer is released. The check
// sits right before render(), because a refresh started before the press
// finishes loading during it. The 2 s cap covers a release outside the window
// that never reports.
let pointerDownAt = 0;
let renderDeferred = false;

const pointerHeld = () => pointerDownAt !== 0 && Date.now() - pointerDownAt < 2000;

function renderWhenReleased() {
  if (pointerHeld()) {
    renderDeferred = true;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(flushRefresh, 100);
    return;
  }
  render();
}

function flushRefresh() {
  if (pointerHeld()) {
    refreshTimer = setTimeout(flushRefresh, 100);
    return;
  }
  if (pendingParts.size > 0) {
    renderDeferred = false;
    const parts = [...pendingParts];
    pendingParts.clear();
    refresh(parts);
  } else if (renderDeferred) {
    renderDeferred = false;
    render();
  }
}

function bindPointerHold() {
  document.addEventListener('pointerdown', () => {
    pointerDownAt = Date.now();
  }, true);
  const release = () => {
    pointerDownAt = 0;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(flushRefresh, 0);
  };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
}

// Reading suspended tabs reads all of storage, archive included, so it happens
// once per change and not on every tab event. The version tells a read that
// began before a change from one that saw it.
let suspendedVersion = 0;
let suspendedCache = { version: -1, entries: [] };

async function currentSuspended() {
  if (!EXTENSION_STORAGE) return [];
  if (suspendedCache.version === suspendedVersion) return suspendedCache.entries;
  const version = suspendedVersion;
  const entries = await loadSuspended();
  suspendedCache = { version, entries };
  return entries;
}

async function loadOpen() {
  try {
    const [windows, openedAt] = await Promise.all([readOpenWindows(await currentSuspended()), loadTabTimes()]);
    state.windows = windows;
    state.openedAt = openedAt;
    state.openError = null;
    pruneCollapsed('open', windows);
  } catch (error) {
    console.error('Tab Overview: failed to read tabs', error);
    state.openError = error;
  }
}

async function loadArchiveState() {
  try {
    const batches = await loadArchive();
    for (const batch of batches) {
      const badge = {
        text: formatShortDate(batch.archivedAt),
        title: `Archived ${formatDate(batch.archivedAt)}`,
      };
      for (const win of batch.windows) win.badge = badge;
    }
    state.batches = batches;
    state.archiveError = null;
    const live = new Set(batches.flatMap((batch) =>
      batch.windows.flatMap((win) => win.tabs.map(archivedTabKey))));
    for (const key of pendingArchivedTabs) {
      if (!live.has(key)) pendingArchivedTabs.delete(key);
    }
    pruneCollapsed('archive', batches.flatMap((batch) => batch.windows));
  } catch (error) {
    console.error('Tab Overview: failed to read the archive', error);
    state.archiveError = error;
  }
}

async function loadCustomGroups() {
  try {
    state.customGroups = await loadGroups();
  } catch (error) {
    console.error('Tab Overview: failed to read custom groups', error);
  }
  state.groupRules = compileCustomGroups(state.customGroups);
}

async function readOpenWindows(suspended) {
  const [windows, groups, selfTab] = await Promise.all([
    chrome.windows.getAll({ populate: true }),
    chrome.tabGroups?.query ? chrome.tabGroups.query({}) : Promise.resolve([]),
    chrome.tabs.getCurrent ? chrome.tabs.getCurrent().catch(() => null) : Promise.resolve(null),
  ]);

  // Placed before the overview's own tab is dropped, so saved indexes line up,
  // and before empty windows are, so a window left with only the overview
  // keeps its suspended tabs.
  const placed = placeSuspended(
    windows.map((win) => ({ ...win, tabs: [...(win.tabs || [])].sort((a, b) => a.index - b.index) })),
    groups,
    suspended,
  );
  const selfTabId = selfTab?.id ?? null;
  const groupsById = new Map(placed.groups.map((group) => [group.id, group]));

  const open = placed.windows
    .map((win) => ({ ...win, tabs: win.tabs.filter((tab) => tab.id !== selfTabId && !isSelfTab(tab)) }))
    .filter((win) => win.tabs.length > 0)
    .sort((a, b) => Number(b.focused) - Number(a.focused) || a.id - b.id)
    .map((win, index) => {
      const title = win.focused ? 'Current window' : `Window ${index + 1}`;
      return {
        id: win.id,
        title,
        label: `Window ${index + 1}`,
        focused: win.focused,
        incognito: win.incognito,
        badge: { text: `W${index + 1}`, title },
        tabs: win.tabs,
        ...groupTabs(win.tabs, groupsById),
      };
    });

  if (placed.orphans.length === 0) return open;
  const title = 'Suspended from closed windows';
  return [...open, {
    id: SUSPENDED_WINDOW_ID,
    title,
    label: title,
    focused: false,
    incognito: false,
    badge: { text: 'Closed', title },
    tabs: placed.orphans,
    ...groupTabs(placed.orphans, groupsById),
  }];
}

function groupTabs(tabs, groupsById) {
  const byGroup = new Map();
  const ungrouped = [];

  tabs.forEach((tab, position) => {
    if (tab.groupId === -1 || tab.groupId === undefined) {
      ungrouped.push(tab);
      return;
    }
    if (!byGroup.has(tab.groupId)) byGroup.set(tab.groupId, { position, tabs: [] });
    byGroup.get(tab.groupId).tabs.push(tab);
  });

  const groups = [...byGroup.entries()]
    .sort(([, a], [, b]) => a.position - b.position)
    .map(([id, { tabs: groupTabs }]) => {
      const meta = groupsById.get(id);
      return {
        id,
        title: meta?.title || '',
        color: meta?.color || 'grey',
        tabs: groupTabs,
      };
    });

  return { groups, ungrouped };
}

function pruneCollapsed(source, windows) {
  const live = new Set(windows.flatMap((win) => win.groups.map((group) => group.id)));
  const collapsed = state.collapsed[source];
  const stale = [...collapsed].filter((id) => !live.has(id));
  if (stale.length === 0) return;
  for (const id of stale) collapsed.delete(id);
  saveSet(SOURCES[source].collapsedKey, collapsed);
}

async function loadTabTimes() {
  if (!chrome.storage?.session?.get) return new Map();

  try {
    const stored = await chrome.storage.session.get(null);
    const times = new Map();

    for (const [key, value] of Object.entries(stored)) {
      if (!key.startsWith(OPENED_AT_PREFIX)) continue;
      const id = Number(key.slice(OPENED_AT_PREFIX.length));
      if (!Number.isFinite(id)) continue;
      if (!value || typeof value.openedAt !== 'number') continue;
      times.set(id, {
        openedAt: value.openedAt,
        approximate: value.approximate === true,
      });
    }

    return times;
  } catch {
    return new Map();
  }
}

/* ------------------------------------------------------------------ events */

function bindEvents() {
  const reload = () => scheduleRefresh('open');

  for (const name of ['onCreated', 'onRemoved', 'onMoved', 'onAttached', 'onDetached', 'onActivated']) {
    chrome.tabs[name]?.addListener(reload);
  }

  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    const relevant = [
      'title', 'url', 'favIconUrl', 'status', 'pinned',
      'audible', 'mutedInfo', 'discarded', 'groupId',
    ];
    if (relevant.some((key) => key in changeInfo)) reload();
  });

  for (const name of ['onCreated', 'onUpdated', 'onRemoved', 'onMoved']) {
    chrome.tabGroups?.[name]?.addListener(reload);
  }

  for (const name of ['onCreated', 'onRemoved', 'onFocusChanged']) {
    chrome.windows?.[name]?.addListener(reload);
  }

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    const keys = Object.keys(changes);
    if (areaName === 'session' && keys.some((key) => key.startsWith(OPENED_AT_PREFIX))) {
      reload();
    }
    if (areaName === 'local' && EXTENSION_STORAGE && keys.some(isBatchKey)) {
      scheduleRefresh('archive');
    }
    if (areaName === 'local' && EXTENSION_STORAGE && keys.some(isSuspendedKey)) {
      suspendedVersion += 1;
      reload();
    }
    if (areaName === 'local' && EXTENSION_STORAGE && keys.includes(GROUPS_KEY)) {
      scheduleRefresh('groups');
    }
  });
}

function bindSearch() {
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    if (state.query.trim()) openEditor = null;
    render();
  });

  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSearch();
      return;
    }

    if (event.key === 'Enter') {
      const first = els.overview.querySelector('.tab');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;

    if (event.key === 'Escape' && state.menu) {
      event.preventDefault();
      closeMenu({ focusButton: true });
      return;
    }

    if (event.key === 'Escape' && openEditor?.confirmingDelete) {
      event.preventDefault();
      cancelGroupDelete();
      return;
    }

    if (event.key === 'Escape' && openEditor) {
      event.preventDefault();
      closeGroupEditor({ focusButton: true });
      return;
    }

    if (event.key === 'Escape' && isConfirm(state.prompt)) {
      event.preventDefault();
      dismissPrompt();
      return;
    }

    if (event.key === 'Escape' && state.confirmDeleteBatchId) {
      event.preventDefault();
      cancelBatchDelete(state.confirmDeleteBatchId);
      return;
    }

    if (event.key === 'Escape' && state.query) {
      event.preventDefault();
      clearSearch();
      return;
    }

    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const typing = target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (typing) return;
    event.preventDefault();
    els.search.focus();
    els.search.select();
  });
}

function clearSearch() {
  state.query = '';
  if (els.search) {
    els.search.value = '';
    els.search.focus();
  }
  render();
}

function bindViewSwitch() {
  for (const button of els.viewButtons) {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (!VIEWS.has(view) || view === state.view) return;
      state.view = view;
      saveValue(VIEW_KEY, view);
      applyViewButtons();
      render();
    });
  }
}

function applyViewButtons() {
  for (const button of els.viewButtons) {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    if (button.dataset.view === 'windows') {
      button.textContent = state.source === 'archive' ? 'Batches' : 'Windows';
    }
  }
  for (const button of els.sourceButtons) {
    const active = button.dataset.source === state.source;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
}

function bindArchiveControls() {
  els.sourceSwitch.hidden = !EXTENSION_STORAGE;
  if (!EXTENSION_STORAGE) return;

  for (const button of els.sourceButtons) {
    button.addEventListener('click', () => switchSource(button.dataset.source));
  }
  els.sourceSwitch.addEventListener('keydown', (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const buttons = [...els.sourceButtons];
    const current = buttons.findIndex((button) => button.dataset.source === state.source);
    const index = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (index === undefined) return;
    event.preventDefault();
    const next = buttons[(index + buttons.length) % buttons.length];
    switchSource(next.dataset.source);
    next.focus();
  });
  els.archiveAll.addEventListener('click', () => promptArchive(ALL_TABS, '#archive-all'));
  els.archiveExport.addEventListener('click', downloadArchive);
  els.archiveImport.addEventListener('click', () => els.archiveImportFile.click());
  els.archiveImportFile.addEventListener('change', () => {
    const [file] = els.archiveImportFile.files;
    els.archiveImportFile.value = '';
    if (file) importArchiveFile(file);
  });
}

function switchSource(source) {
  if (!SOURCE_NAMES.has(source) || source === state.source) return;
  state.source = source;
  state.confirmDeleteBatchId = null;
  state.menu = null;
  saveValue(SOURCE_KEY, source);
  applyViewButtons();
  render();
}

/* ------------------------------------------------------------------ render */

function render() {
  if (!els.overview) return;

  const focus = focusKey();
  const ctx = sourceContext(state.source);
  renderControls();
  renderBanner();

  if (state.loading) {
    els.summary.textContent = 'Reading your tabs…';
    els.overview.replaceChildren();
    return;
  }

  clearOverview();
  renderSource(ctx);
  finishOverview();
  // The menu's tab closed or left this view.
  if (state.menu && !els.overview.querySelector('.tab-menu')) state.menu = null;
  restoreFocus(focus);
}

// The open group editor's section stays in the page across renders, and the
// rest of the overview is rebuilt around it. Moving or rebuilding it would
// drop focus and the field being typed in, and the button under a click that
// started a save.
let mountBefore = null;

function clearOverview() {
  const kept = openEditor?.section.parentNode === els.overview ? openEditor.section : null;
  for (const child of [...els.overview.children]) {
    if (child !== kept) child.remove();
  }
  mountBefore = kept;
}

function mount(node) {
  if (node === mountBefore) {
    mountBefore = null;
    return;
  }
  els.overview.insertBefore(node, mountBefore);
}

function finishOverview() {
  mountBefore?.remove();
  mountBefore = null;
  if (openEditor && !openEditor.section.isConnected) openEditor = null;
}

function sourceContext(source) {
  return {
    ...SOURCES[source],
    source,
    query: state.query.trim().toLowerCase(),
    collapsed: state.collapsed[source],
  };
}

function renderSource(ctx) {
  els.groupsShowEmpty.hidden = true;
  const error = ctx.error();
  if (error) {
    renderError(error, ctx.errorTitle);
    return;
  }

  const windows = ctx.windows();
  const totalTabs = windows.reduce((sum, win) => sum + win.tabs.length, 0);
  const suspended = windows.reduce((sum, win) => sum + win.tabs.filter(isSuspended).length, 0);

  if (totalTabs === 0) {
    mount(createEmptyState(ctx.empty));
    els.summary.textContent = plural(0, ctx.tabNoun);
    // Custom groups can still be shown, made, and edited.
    if (state.view === 'sorted' && !ctx.query) renderSortedView(windows, ctx);
    return;
  }

  const { matched, detail } = state.view === 'sorted'
    ? renderSortedView(windows, ctx)
    : ctx.renderWindows(ctx);

  if (matched === 0) {
    renderEmptySearch(totalTabs, ctx);
    return;
  }

  const [one, many] = ctx.containerNoun;
  els.summary.textContent = ctx.query
    ? matchSummary(matched, totalTabs, ctx.tabNoun)
    : [
      plural(totalTabs - suspended, ctx.tabNoun),
      suspended > 0 ? `${suspended} suspended` : '',
      detail,
      plural(ctx.containerCount(), one, many),
    ].filter(Boolean).join(' · ');
}

function renderControls() {
  if (!EXTENSION_STORAGE) return;
  const busy = isBusy();
  const archived = state.batches.reduce((sum, batch) => sum + batch.tabCount, 0);
  els.archiveCount.textContent = String(archived);
  els.openCount.textContent = String(state.windows.reduce((sum, win) => sum + win.tabs.filter((tab) => !isSuspended(tab)).length, 0));

  const count = planArchive(state.windows).count;
  els.archiveAll.hidden = state.source !== 'open';
  els.archiveAll.disabled = busy || count === 0;
  els.archiveAll.title = count === 0
    ? 'No tabs to archive'
    : `Save ${plural(count, 'tab')} to the archive and close them`;

  els.groupsAdd.hidden = state.view !== 'sorted';
  els.groupsAdd.disabled = busy;
  els.archiveExport.hidden = state.source !== 'archive';
  els.archiveImport.hidden = state.source !== 'archive';
  const suspended = state.windows.reduce((sum, win) => sum + win.tabs.filter(isSuspended).length, 0);
  els.archiveExport.disabled = busy || (archived === 0 && state.customGroups.length === 0 && suspended === 0);
  els.archiveImport.disabled = busy;

  els.footerHint.textContent = state.source === 'archive'
    ? 'Click an archived tab to reopen it'
    : 'Click a tab to switch to it';
}

// The confirm prompt recounts on every render, so tabs opened or closed while
// it is showing are reflected before the user confirms.
const BANNERS = {
  confirm: (prompt) => {
    const plan = planArchive(scopeWindows(state.windows, prompt.scope));
    if (plan.count === 0) return null;
    const where = prompt.scope.name ? ` in ${prompt.scope.name}` : '';
    const suspended = scopeTabs(prompt.scope, isSuspended).length;
    return {
      text: `Archive and close ${plural(plan.count, 'tab')}${where}?`,
      detail: [
        suspended > 0 ? `${plural(suspended, 'suspended tab')} ${suspended === 1 ? 'is' : 'are'} included.` : '',
        leftOpenText(plan.skipped, 'stay open'),
      ].filter(Boolean).join(' '),
      buttons: [
      { id: 'archive-confirm', label: 'Archive and close', primary: true, onClick: confirmArchive },
        { id: 'archive-cancel', label: 'Cancel', onClick: dismissPrompt },
      ],
    };
  },
  // Closing keeps nothing, so it asks first, like archiving does.
  closeConfirm: (prompt) => {
    const count = scopeTabs(prompt.scope, closable).length;
    if (count === 0) return null;
    const pinned = scopeTabs(prompt.scope, (tab) => !isSuspended(tab) && tab.pinned).length;
    return {
      text: `Close ${plural(count, 'tab')} in ${prompt.scope.name}?`,
      detail: [
        'They are not archived or suspended.',
        pinned > 0 ? `${plural(pinned, 'pinned tab')} ${pinned === 1 ? 'stays' : 'stay'} open.` : '',
      ].filter(Boolean).join(' '),
      buttons: [
        { id: 'close-confirm', label: 'Close tabs', primary: true, onClick: confirmClose },
        { id: 'close-cancel', label: 'Cancel', onClick: dismissPrompt },
      ],
    };
  },
  busy: (prompt) => ({ text: prompt.text, buttons: [] }),
  result: (prompt) => ({
    text: prompt.text,
    detail: prompt.detail,
    tone: prompt.tone,
    buttons: [
      ...(prompt.batchId
        ? [{ id: 'banner-view-archive', label: 'View in archive', onClick: () => viewArchivedBatch(prompt.batchId) }]
        : []),
      { id: 'banner-dismiss', label: 'Dismiss', onClick: dismissPrompt },
    ],
  }),
};

const SCOPE_MATCHERS = {
  all: () => () => true,
  tab: (scope) => (tab) => tab.id === scope.id,
  window: (scope) => (tab, win) => win.id === scope.id,
  group: (scope) => (tab) => tab.groupId === scope.id,
  category: (scope) => (tab) => categorizeTab(tab, state.groupRules).id === scope.id,
};

const ALL_TABS = { kind: 'all', id: null, name: '', label: '' };

function scopeWindows(windows, scope) {
  const includes = SCOPE_MATCHERS[scope.kind](scope);
  return windows.map((win) => ({ ...win, tabs: win.tabs.filter((tab) => includes(tab, win)) }));
}

const isSuspended = (tab) => tab.suspended === true;
const archivableCount = (tabs) => tabs.filter((tab) => !skipReason(tab)).length;
const suspendable = (tab) => !isSuspended(tab) && !skipReason(tab);
const closable = (tab) => !isSuspended(tab) && !tab.pinned;
const isConfirm = (prompt) => prompt?.kind === 'confirm' || prompt?.kind === 'closeConfirm';
const scopeTabs = (scope, include) => scopeWindows(state.windows, scope).flatMap((win) => win.tabs).filter(include);

function renderBanner() {
  const view = state.prompt && BANNERS[state.prompt.kind](state.prompt);
  if (!view) state.prompt = null;
  const prompt = state.prompt;
  els.banner.hidden = !prompt;
  if (!prompt) {
    els.banner.replaceChildren();
    return;
  }

  const banner = el('div', 'banner');
  banner.dataset.kind = prompt.kind;
  if (view.tone) banner.dataset.tone = view.tone;

  const text = el('div', 'banner-text');
  const strong = el('strong');
  strong.textContent = view.text;
  text.append(strong);
  if (view.detail) {
    const detail = el('span', 'banner-detail');
    detail.textContent = view.detail;
    text.append(detail);
  }

  const buttons = el('div', 'banner-actions');
  for (const spec of view.buttons) {
    const button = createButton(spec.label, spec.onClick, spec.primary ? 'is-primary' : '');
    button.id = spec.id;
    buttons.append(button);
  }

  banner.append(text, buttons);
  els.banner.replaceChildren(banner);
}

function dismissPrompt() {
  if (isBusy()) return;
  const returnFocus = state.prompt?.returnFocus;
  state.prompt = null;
  render();
  const target = returnFocus && document.querySelector(returnFocus);
  if (target) {
    target.focus();
  } else {
    focusFirst(['#archive-all:not([hidden]):not(:disabled)', '#search']);
  }
}

function focusFirst(selectors) {
  for (const selector of selectors) {
    const target = document.querySelector(selector);
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
}

function createButton(label, onClick, modifier = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${modifier}`.trim();
  button.textContent = label;
  button.disabled = isBusy();
  button.addEventListener('click', onClick);
  return button;
}

const SKIP_LABELS = {
  pinned: ['pinned', 'pinned'],
  private: ['private', 'private'],
  unsupported: ['browser or local page', 'browser or local pages'],
};

function leftOpenText(skipped, verb) {
  const parts = Object.entries(skipped)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${count} ${SKIP_LABELS[reason][count === 1 ? 0 : 1]}`);
  if (parts.length === 0) return '';
  const total = Object.values(skipped).reduce((sum, count) => sum + count, 0);
  return `${plural(total, 'tab')} ${verb}: ${parts.join(', ')}.`;
}

function renderBatchesView(ctx) {
  let matched = 0;
  let groups = 0;

  for (const batch of state.batches) {
    const { sections, matched: count } = filterWindows(batch.windows, ctx.query);
    if (count === 0) continue;
    matched += count;
    groups += countGroups(batch.windows);
    mount(renderBatch(batch, sections, count, ctx));
  }

  return { matched, detail: plural(groups, 'group') };
}

function renderBatch(batch, sections, count, ctx) {
  const section = el('section', 'batch');
  section.dataset.batchId = batch.id;

  const head = el('div', 'batch-head');
  const heading = document.createElement('h2');
  const tabs = count === batch.tabCount
    ? plural(count, 'tab')
    : `${count} of ${plural(batch.tabCount, 'tab')}`;
  heading.textContent = [formatDate(batch.archivedAt), batch.label, tabs].filter(Boolean).join(' · ');
  heading.title = `Archived ${new Date(batch.archivedAt).toLocaleString()}`;

  const actions = el('div', 'batch-actions');
  if (state.confirmDeleteBatchId === batch.id) {
    const question = el('span', 'batch-question');
    question.textContent = `Delete ${plural(batch.tabCount, 'archived tab')}?`;
    actions.append(
      question,
      createButton('Delete', () => deleteArchivedBatch(batch), 'is-danger batch-delete-confirm'),
      createButton('Cancel', () => cancelBatchDelete(batch.id), 'batch-delete-cancel'),
    );
  } else {
    const restore = createButton('Restore', () => restoreArchivedBatch(batch), 'batch-restore');
    restore.title = `Reopen ${plural(batch.tabCount, 'tab')} in ${plural(batch.windows.length, 'window')}`;
    actions.append(
      restore,
      createButton('Delete', () => {
        state.confirmDeleteBatchId = batch.id;
        render();
        els.overview
          .querySelector(`[data-batch-id="${CSS.escape(batch.id)}"] .batch-delete-cancel`)
          ?.focus();
      }, 'batch-delete'),
    );
  }

  head.append(heading, actions);
  section.append(head);
  for (const windowSection of sections) section.append(renderWindow(windowSection, ctx));
  return section;
}

function cancelBatchDelete(batchId) {
  state.confirmDeleteBatchId = null;
  render();
  focusFirst([`[data-batch-id="${CSS.escape(batchId)}"] .batch-delete`, '#search']);
}

function renderWindowView(ctx) {
  const { sections, matched } = filterWindows(state.windows, ctx.query);
  for (const section of sections) {
    mount(renderWindow(section, ctx));
  }
  return { matched, detail: plural(countGroups(state.windows), 'group') };
}

function filterWindows(windows, query) {
  const sections = [];
  let matched = 0;

  for (const win of windows) {
    const filtered = filterWindow(win, query);
    const count = countVisible(filtered);
    if (count === 0) continue;
    matched += count;
    sections.push({ win, ...filtered, count });
  }

  return { sections, matched };
}

function renderSortedView(windows, ctx) {
  const categories = buildCategories(windows, ctx.query);
  const emptyGroups = categories.filter((bucket) => bucket.tabs.length === 0).length;
  for (const bucket of categories) {
    const shown = bucket.tabs.length > 0 || state.showEmptyGroups || openEditor?.id === bucket.meta.groupId;
    if (shown) mount(renderCategory(bucket, ctx));
  }
  renderEmptyGroupsToggle(emptyGroups);
  return {
    matched: categories.reduce((sum, bucket) => sum + bucket.tabs.length, 0),
    detail: plural(categories.filter((bucket) => bucket.tabs.length > 0).length, 'category', 'categories'),
  };
}

function renderEmptyGroupsToggle(count) {
  const button = els.groupsShowEmpty;
  button.hidden = count === 0;
  button.setAttribute('aria-pressed', String(state.showEmptyGroups));
  button.textContent = state.showEmptyGroups ? 'Hide empty groups' : `Show ${plural(count, 'empty group')}`;
  button.title = state.showEmptyGroups
    ? 'Hide your custom groups that have no tabs'
    : 'Show your custom groups that have no tabs, so you can edit them';
}

function toggleEmptyGroups() {
  state.showEmptyGroups = !state.showEmptyGroups;
  saveValue(SHOW_EMPTY_GROUPS_KEY, String(state.showEmptyGroups));
  render();
}

function renderEmptySearch(totalTabs, ctx) {
  mount(createEmptyState({
    icon: ICONS.search,
    title: `No ${ctx.tabNoun}s match “${state.query.trim()}”`,
    message: 'Try a shorter search, or search by site address.',
    actionLabel: 'Clear search',
    onAction: clearSearch,
  }));
  els.summary.textContent = matchSummary(0, totalTabs, ctx.tabNoun);
}

const FOCUS_KEYS = ['data-group-id', 'data-color'];
const FOCUS_SCOPES = [
  'data-tab-id', 'data-custom-group-id', 'data-group-id', 'data-category-id', 'data-batch-id', 'data-window-id',
];

// Every render rebuilds the overview, so focus is remembered as a selector and
// put back on the equivalent new element.
function focusKey() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (active.id) return `#${CSS.escape(active.id)}`;

  for (const attr of FOCUS_SCOPES) {
    const scope = active.closest(`[${attr}]`);
    if (!scope) continue;
    const base = `[${attr}="${CSS.escape(scope.getAttribute(attr))}"]`;
    if (scope === active) return base;
    const classes = [...active.classList].map((name) => `.${CSS.escape(name)}`).join('');
    // Siblings that share classes, like menu items, tell apart by their key.
    const keys = FOCUS_KEYS.filter((key) => active.hasAttribute(key))
      .map((key) => `[${key}="${CSS.escape(active.getAttribute(key))}"]`).join('');
    return classes ? `${base} ${classes}${keys}` : null;
  }
  return null;
}

function restoreFocus(key) {
  if (!key) return;
  const target = document.querySelector(key);
  if (target && target !== document.activeElement) target.focus({ preventScroll: true });
}

// tabs are the ones a search matches; all are every tab of the category.
const emptyBucket = (meta) => ({ meta, tabs: [], all: [], windows: new Set() });

function buildCategories(windows, query) {
  // Without a search, every custom group gets a bucket, so the caller can show
  // the ones with no tabs on request.
  const buckets = new Map(query ? [] : state.groupRules.categories.map((meta) => [meta.id, emptyBucket(meta)]));

  for (const win of windows) {
    const groupTitles = new Map(win.groups.map((group) => [group.id, group.title]));

    for (const tab of win.tabs) {
      const category = categorizeTab(tab, state.groupRules);
      if (!buckets.has(category.id)) buckets.set(category.id, emptyBucket(category));
      const bucket = buckets.get(category.id);
      // A section action takes the whole category, matched by search or not.
      bucket.all.push(tab);

      const categoryMatches = category.label.toLowerCase().includes(query);
      if (query && !categoryMatches && !tabMatchesQuery(tab, groupTitles.get(tab.groupId), query)) continue;

      bucket.tabs.push({ tab, win });
      bucket.windows.add(win.id);
    }
  }

  const rank = (meta) => (meta.custom ? meta.order : state.customGroups.length + CATEGORY_INDEX.get(meta.id));
  return [...buckets.values()]
    .filter((bucket) => bucket.tabs.length > 0 || (bucket.meta.custom && !query))
    .sort((a, b) => rank(a.meta) - rank(b.meta));
}

function tabMatchesQuery(tab, groupTitle, query) {
  return (tab.title || '').toLowerCase().includes(query) ||
    (tab.url || '').toLowerCase().includes(query) ||
    (groupTitle || '').toLowerCase().includes(query);
}

function renderCategory({ meta, tabs, all }, ctx) {
  const editor = meta.custom && openEditor?.id === meta.groupId ? openEditor : null;
  const section = editor?.section ?? el('section');
  for (const child of [...section.children]) {
    if (child !== editor?.item) child.remove();
  }
  section.className = 'category';
  section.dataset.category = meta.custom ? 'custom' : meta.id;
  if (meta.custom) section.dataset.color = meta.color;
  if (tabs.length === 0) section.classList.add('is-empty');

  const isCollapsed = ctx.query === '' && state.collapsedCategories.has(meta.id);
  if (isCollapsed) section.classList.add('is-collapsed');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'group-header category-header';
  header.setAttribute('aria-expanded', String(!isCollapsed));
  header.setAttribute('aria-label', `${meta.label}, ${plural(tabs.length, 'tab')}`);

  const chevron = el('span', 'group-chevron');
  chevron.append(createIcon(ICONS.chevron));

  const dot = el('span', 'group-dot');
  const name = el('span', 'group-name');
  name.textContent = meta.label;
  const count = el('span', 'group-count');
  count.textContent = String(tabs.length);

  header.append(chevron, dot, name, count);
  header.addEventListener('click', () => toggleCategory(meta.id));
  const { reopen, suspend, archive, close } = sectionActions(ctx,
    { kind: 'category', id: meta.id, name: meta.label, label: meta.label },
    all, 'category', `[data-category-id="${CSS.escape(meta.id)}"]`);
  section.prepend(headerRow('categoryId', meta.id, header,
    reopen, meta.custom ? editGroupButton(meta) : null, suspend, archive, close));
  if (editor) updateGroupEditor(editor, state.customGroups[meta.order], meta.order);

  if (isCollapsed) return section;
  if (tabs.length === 0) {
    const note = el('p', 'category-empty');
    note.textContent = 'No tabs yet. Add domains, or use a tab’s ⋯ menu.';
    section.append(note);
    return section;
  }
  const grid = el('div', 'group-tabs');
  for (const { tab, win } of tabs) {
    grid.append(renderTab(tab, ctx, { windowBadge: win.badge }));
  }
  section.append(grid);
  return section;
}

// The header is a toggle button, so the section's other controls sit beside
// it in a row that carries the focus scope for all of them.
function headerRow(scopeKey, scopeId, header, ...controls) {
  const row = el('div', 'group-header-row');
  row.dataset[scopeKey] = String(scopeId);
  row.append(header, ...controls.filter(Boolean));
  return row;
}

function editGroupButton(meta) {
  const open = openEditor?.id === meta.groupId;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'section-edit category-edit';
  button.title = `Edit ${meta.label}`;
  button.setAttribute('aria-label', `Edit ${meta.label}`);
  button.setAttribute('aria-expanded', String(open));
  button.append(createIcon(ICONS.pencil));
  button.addEventListener('click', () => (open
    ? closeGroupEditor({ focusButton: true })
    : openGroupEditor(meta.groupId)));
  return button;
}

// The controls beside a section header. Each acts on the whole section, so a
// search narrows what is shown but not what they take. A control's class is
// <kind>-<name>, such as group-archive, and focus returns to it afterwards.
function sectionActions(ctx, scope, tabs, kind, scopeSelector) {
  const { actions } = ctx;
  const control = (name, action, count, label, content) => {
    if (!action || count === 0) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `section-${name} ${kind}-${name}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.disabled = isBusy();
    if (content.icon) button.append(createIcon(content.icon));
    else button.textContent = content.text;
    button.addEventListener('click', () => action(scope, `${scopeSelector} .${kind}-${name}`));
    return button;
  };

  const suspended = tabs.filter(isSuspended).length;
  const live = tabs.filter(suspendable).length;
  const archivable = archivableCount(tabs);
  const open = tabs.filter(closable).length;
  return {
    reopen: control('reopen', actions.reopenSection, suspended,
      `Reopen ${plural(suspended, 'suspended tab')} in ${scope.name}`, { text: `Reopen ${suspended}` }),
    suspend: control('suspend', actions.suspendSection, live,
      `Suspend ${plural(live, 'tab')} in ${scope.name}`, { icon: ICONS.suspend }),
    archive: control('archive', actions.archiveSection, archivable,
      `Archive ${plural(archivable, 'tab')} in ${scope.name}`, { icon: ICONS.archive }),
    close: control('close', actions.closeSection, open,
      `Close ${plural(open, 'tab')} in ${scope.name}`, { icon: ICONS.close }),
  };
}

function toggleCategory(categoryId) {
  if (state.collapsedCategories.has(categoryId)) {
    state.collapsedCategories.delete(categoryId);
  } else {
    state.collapsedCategories.add(categoryId);
  }
  saveSet(COLLAPSED_CATEGORIES_KEY, state.collapsedCategories);
  render();
}

function filterWindow(win, query) {
  const { groups, ungrouped } = win;
  if (!query) return { groups, ungrouped };

  return {
    groups: groups
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => tabMatchesQuery(tab, group.title, query)),
      }))
      .filter((group) => group.tabs.length > 0),
    ungrouped: ungrouped.filter((tab) => tabMatchesQuery(tab, '', query)),
  };
}

function renderWindow({ win, groups, ungrouped, count }, ctx) {
  const section = el('section', 'window');
  section.dataset.windowId = String(win.id);
  if (win.focused) section.classList.add('is-focused');
  if (win.id === SUSPENDED_WINDOW_ID) section.classList.add('is-suspended');

  const head = el('div', 'window-head');
  const titleWrap = el('div', 'window-title');
  titleWrap.append(el('span', 'window-dot'));

  const heading = document.createElement('h2');
  heading.textContent = win.title;
  titleWrap.append(heading);

  if (win.incognito) {
    const pill = el('span', 'pill');
    pill.textContent = 'Incognito';
    titleWrap.append(pill);
  }

  const meta = el('div', 'window-meta');
  const tabCount = el('span', 'window-count');
  const suspended = win.tabs.filter((tab) => tab.suspended).length;
  const open = win.tabs.length - suspended;
  if (count !== win.tabs.length) {
    tabCount.textContent = `${count} of ${plural(win.tabs.length, 'tab')}`;
    meta.append(tabCount);
  } else {
    // Matches the summary, which counts open tabs and suspended ones apart.
    if (open > 0 || suspended === 0) {
      tabCount.textContent = plural(open, 'tab');
      meta.append(tabCount);
    }
    if (suspended > 0) {
      const suspendedCount = el('span', 'window-count');
      suspendedCount.textContent = `${suspended} suspended`;
      meta.append(suspendedCount);
    }
  }

  if (groups.length > 0) {
    const groupCount = el('span', 'window-count');
    groupCount.textContent = plural(groups.length, 'group');
    meta.append(groupCount);
  }

  const { reopen, suspend, archive } = sectionActions(ctx, {
    kind: 'window', id: win.id, name: win.focused ? 'the current window' : win.title, label: win.label,
  }, win.tabs, 'window', `[data-window-id="${CSS.escape(String(win.id))}"]`);
  meta.append(...[reopen, suspend, archive].filter(Boolean));

  head.append(titleWrap, meta);
  section.append(head);

  const fullGroups = new Map(win.groups.map((group) => [group.id, group]));
  const body = el('div', 'window-body');
  for (const group of groups) body.append(renderGroup(group, ctx, fullGroups.get(group.id).tabs));
  if (ungrouped.length > 0) body.append(renderUngrouped(ungrouped, groups.length > 0, ctx));
  section.append(body);

  return section;
}

function renderGroup(group, ctx, allTabs) {
  const section = el('section', 'group');
  const color = GROUP_COLORS.has(group.color) ? group.color : 'grey';
  section.dataset.color = color;

  const isCollapsed = ctx.query === '' && ctx.collapsed.has(group.id);
  if (isCollapsed) section.classList.add('is-collapsed');

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'group-header';
  header.setAttribute('aria-expanded', String(!isCollapsed));
  header.setAttribute(
    'aria-label',
    `${group.title || 'Untitled group'}, ${plural(group.tabs.length, 'tab')}`,
  );

  const chevron = el('span', 'group-chevron');
  chevron.append(createIcon(ICONS.chevron));

  const dot = el('span', 'group-dot');
  const name = el('span', 'group-name');
  name.textContent = group.title || 'Untitled group';
  const count = el('span', 'group-count');
  count.textContent = String(group.tabs.length);

  header.append(chevron, dot, name, count);
  header.addEventListener('click', () => toggleGroup(ctx, group.id));
  const groupName = group.title || 'Untitled group';
  const { reopen, suspend, archive, close } = sectionActions(ctx,
    { kind: 'group', id: group.id, name: groupName, label: groupName },
    allTabs, 'group', `[data-group-id="${CSS.escape(String(group.id))}"]`);
  section.append(headerRow('groupId', group.id, header, reopen, suspend, archive, close));

  if (!isCollapsed) {
    const tabs = el('div', 'group-tabs');
    for (const tab of group.tabs) tabs.append(renderTab(tab, ctx));
    section.append(tabs);
  }

  return section;
}

function renderUngrouped(tabs, showLabel, ctx) {
  const section = el('section', 'group group-ungrouped');
  if (showLabel) section.classList.add('has-label');

  if (showLabel) {
    const label = el('div', 'ungrouped-label');
    const name = el('span');
    name.textContent = 'Ungrouped';
    const count = el('span', 'ungrouped-count');
    count.textContent = String(tabs.length);
    label.append(name, count);
    section.append(label);
  }

  const grid = el('div', 'group-tabs');
  for (const tab of tabs) grid.append(renderTab(tab, ctx));
  section.append(grid);

  return section;
}

function renderTab(tab, ctx, options = {}) {
  const { actions, ageOf } = isSuspended(tab) ? ctx.suspended : ctx;
  const card = el('div', 'tab');
  card.dataset.tabId = String(tab.id);
  if (ctx.source === 'archive') card.dataset.archiveId = tab.id;

  const titleText = tab.title?.trim() || displayUrl(tab.url) || 'Untitled tab';
  card.title = [tab.title?.trim(), tab.url].filter(Boolean).join('\n');

  if (tab.active) card.classList.add('is-active');
  if (tab.discarded) card.classList.add('is-discarded');
  if (isSuspended(tab)) card.classList.add('is-suspended');

  const main = el('div', 'tab-main');
  main.tabIndex = 0;
  main.setAttribute('role', 'button');
  main.setAttribute('aria-label', `${actions.activateLabel} ${titleText}`);

  main.append(createFavicon(tab));

  const text = el('div', 'tab-text');
  const titleRow = el('div', 'tab-title-row');
  const title = el('span', 'tab-title');
  title.textContent = titleText;
  titleRow.append(title);

  const flags = el('span', 'tab-flags');
  if (isSuspended(tab)) flags.append(createFlag(ICONS.suspend, 'Suspended'));
  if (tab.pinned) flags.append(createFlag(ICONS.pin, 'Pinned'));
  if (tab.audible) {
    const muted = tab.mutedInfo?.muted;
    flags.append(createFlag(muted ? ICONS.muted : ICONS.audio, muted ? 'Muted' : 'Playing audio'));
  }
  if (flags.childElementCount > 0) titleRow.append(flags);

  const urlText = displayUrl(tab.url);
  const age = ageOf(tab);

  text.append(titleRow);

  const meta = el('div', 'tab-url');
  if (urlText && urlText !== titleText) {
    const url = el('span', 'tab-url-text');
    url.textContent = urlText;
    meta.append(url);
  }

  if (age) {
    const ageEl = el('span', 'tab-age');
    ageEl.title = age.title;
    if (typeof age.since === 'number') {
      ageEl.textContent = age.prefix + formatAge(age.since);
      ageEl.dataset.since = String(age.since);
      ageEl.dataset.prefix = age.prefix;
    } else {
      ageEl.textContent = age.text;
    }
    meta.append(ageEl);
  }

  if (options.windowBadge) {
    const badge = el('span', 'tab-window');
    badge.textContent = options.windowBadge.text;
    badge.title = options.windowBadge.title;
    meta.append(badge);
  }

  if (meta.childElementCount > 0) text.append(meta);

  main.append(text);
  main.addEventListener('click', () => actions.activate(tab));
  main.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      actions.activate(tab);
    }
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tab-close';
  close.title = actions.dismissLabel;
  close.setAttribute('aria-label', `${actions.dismissLabel} ${titleText}`);
  close.append(createIcon(ICONS.close));
  close.addEventListener('click', () => actions.dismiss(tab));

  card.append(main, close);
  const host = groupableHost(tab.url);
  if (host && EXTENSION_STORAGE) {
    const suspend = ctx.actions.suspendSection && suspendable(tab)
      ? () => ctx.actions.suspendSection({ kind: 'tab', id: tab.id, name: '', label: '' })
      : null;
    appendTabMenu(card, `${ctx.source}:${tab.id}`, tab.id, host, tab.url, suspend);
  }
  if (actions.middleClick) {
    card.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        actions.middleClick(tab);
      }
    });
  }

  return card;
}

function archivedAge(tab) {
  return {
    since: tab.archivedAt,
    prefix: 'archived ',
    title: `Archived ${new Date(tab.archivedAt).toLocaleString()}`,
  };
}

function suspendedAge(tab) {
  return {
    since: tab.suspendedAt,
    prefix: 'suspended ',
    title: `Suspended ${new Date(tab.suspendedAt).toLocaleString()}`,
  };
}

function openedAge(tab) {
  const opened = state.openedAt.get(tab.id);
  if (!opened) return null;
  if (opened.approximate) {
    return {
      text: 'Before tracking',
      title: 'This tab was already open when Tab Overview started tracking.',
    };
  }
  return {
    since: opened.openedAt,
    prefix: '',
    title: `Opened ${new Date(opened.openedAt).toLocaleString()}`,
  };
}

function createFavicon(tab) {
  const wrap = el('span', 'tab-favicon');
  const url = tab.url || '';

  let src = '';
  if (tab.favIconUrl && /^data:/i.test(tab.favIconUrl)) {
    src = tab.favIconUrl;
  } else if (/^(https?|file):/i.test(url)) {
    src = `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;
  }

  if (!src) {
    wrap.append(fallbackFavicon(tab));
    return wrap;
  }

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.width = 20;
  img.height = 20;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    img.remove();
    wrap.append(fallbackFavicon(tab));
  }, { once: true });
  wrap.append(img);

  return wrap;
}

function fallbackFavicon(tab) {
  const span = el('span', 'favicon-fallback');
  const source = hostnameOf(tab.url) || tab.title || '?';
  span.textContent = (Array.from(source.trim())[0] || '?').toUpperCase();
  span.style.setProperty('--hue', String(hashString(source) % 360));
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function createFlag(svg, label) {
  const span = el('span', 'tab-flag');
  span.append(createIcon(svg));
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', label);
  span.title = label;
  return span;
}

function createEmptyState({ icon, title, message, actionLabel, onAction }) {
  const wrap = el('div', 'empty');

  const iconEl = el('div', 'empty-icon');
  iconEl.append(createIcon(icon));

  const heading = document.createElement('h2');
  heading.textContent = title;

  const text = document.createElement('p');
  text.textContent = message;

  wrap.append(iconEl, heading, text);

  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = actionLabel;
    button.addEventListener('click', onAction);
    wrap.append(button);
  }

  return wrap;
}

function renderUnsupported() {
  els.summary.textContent = 'Preview mode';
  els.overview.replaceChildren(createEmptyState({
    icon: ICONS.grid,
    title: 'This page is not running as an extension',
    message: 'Load this folder as an unpacked extension in Chrome or Brave, then open a new tab.',
  }));
}

function renderError(error, title) {
  els.summary.textContent = 'Something went wrong';
  els.overview.replaceChildren(createEmptyState({
    icon: ICONS.alert,
    title,
    message: error?.message || 'Chrome blocked access to the tabs API.',
    actionLabel: 'Try again',
    onAction: () => {
      state.loading = true;
      render();
      refresh();
    },
  }));
}

/* ----------------------------------------------------------------- actions */

async function activateTab(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (error) {
    console.warn('Tab Overview: could not switch to tab', error);
    scheduleRefresh('open');
  }
}

async function closeTab(tab) {
  try {
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.warn('Tab Overview: could not close tab', error);
    scheduleRefresh('open');
  }
}

// Suspending needs no confirmation: the tabs stay listed and reopen with a
// click. It runs as busy, so no render shows a tab both open and suspended.
async function suspendScope(scope, returnFocus = '') {
  if (isBusy()) return;
  const tabs = scopeTabs(scope, suspendable);
  if (tabs.length === 0) return;
  state.prompt = { kind: 'busy', text: `Suspending ${plural(tabs.length, 'tab')}…` };
  render();

  let result = null;
  const focus = [returnFocus];
  try {
    const { suspended, leftOpen } = await suspendTabs(tabs, state.windows.flatMap((win) => win.groups));
    if (suspended.length > 0) focus.push(cardFocus(suspended[0]));
    if (leftOpen > 0) {
      result = {
        kind: 'result',
        text: `Suspended ${plural(suspended.length, 'tab')}`,
        detail: `${plural(leftOpen, 'tab')} changed or could not be closed and ${leftOpen === 1 ? 'stays' : 'stay'} open.`,
        tone: 'warn',
      };
    }
  } catch (error) {
    console.error('Tab Overview: suspend failed', error);
    result = { kind: 'result', text: 'Nothing was suspended and no tab was closed', detail: error?.message || '', tone: 'error' };
  }

  state.prompt = result;
  await refresh();
  focusFirst([...(result ? ['#banner-dismiss'] : []), ...focus.filter(Boolean), '#search']);
}

async function reopenScope(scope, returnFocus = '') {
  if (isBusy()) return;
  const tabs = scopeTabs(scope, isSuspended);
  if (tabs.length === 0) return;
  state.prompt = { kind: 'busy', text: `Reopening ${plural(tabs.length, 'tab')}…` };
  render();

  let result = null;
  const focus = [returnFocus];
  try {
    const { opened, failed } = await reopenSuspended(tabs);
    if (opened.length > 0) focus.push(cardFocus(opened[0]));
    if (failed > 0) {
      result = {
        kind: 'result',
        text: `Reopened ${plural(opened.length, 'tab')}`,
        detail: `${plural(failed, 'tab')} could not be opened and ${failed === 1 ? 'stays' : 'stay'} suspended.`,
        tone: 'warn',
      };
    }
  } catch (error) {
    console.error('Tab Overview: reopen failed', error);
    result = { kind: 'result', text: 'Could not reopen the suspended tabs', detail: error?.message || '', tone: 'error' };
  }

  state.prompt = result;
  await refresh();
  focusFirst([...(result ? ['#banner-dismiss'] : []), ...focus.filter(Boolean), '#search']);
}

async function reopenTab(tab) {
  if (isBusy()) return;
  try {
    const { failed } = await reopenSuspended([tab], { activate: true });
    if (failed > 0) {
      state.prompt = { kind: 'result', text: 'Could not reopen the tab', detail: 'It stays suspended.', tone: 'warn' };
    }
  } catch (error) {
    console.warn('Tab Overview: could not reopen suspended tab', error);
  }
  scheduleRefresh('open');
}

async function forgetTab(tab) {
  if (isBusy()) return;
  try {
    await forgetSuspended([tab.id]);
  } catch (error) {
    console.warn('Tab Overview: could not forget suspended tab', error);
  }
  scheduleRefresh('open');
}

function promptClose(scope, returnFocus = '') {
  if (isBusy()) return;
  if (scopeTabs(scope, closable).length === 0) return;
  state.prompt = { kind: 'closeConfirm', scope, returnFocus };
  render();
  document.getElementById('close-confirm')?.focus();
}

async function confirmClose() {
  if (isBusy() || state.prompt?.kind !== 'closeConfirm') return;
  const { scope, returnFocus } = state.prompt;
  const tabs = scopeTabs(scope, closable);
  state.prompt = { kind: 'busy', text: `Closing ${plural(tabs.length, 'tab')}…` };
  render();

  // One at a time, so a tab that closed meanwhile doesn't fail the rest.
  const results = await Promise.allSettled(tabs.map((tab) => chrome.tabs.remove(tab.id)));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) console.warn('Tab Overview: could not close some tabs', results);
  state.prompt = failed > 0
    ? {
      kind: 'result',
      text: `Closed ${plural(tabs.length - failed, 'tab')} in ${scope.name}`,
      detail: `${plural(failed, 'tab')} could not be closed.`,
      tone: 'warn',
    }
    : null;
  await refresh();
  focusFirst([...(failed > 0 ? ['#banner-dismiss'] : []), returnFocus, '#search'].filter(Boolean));
}

const cardFocus = (tabId) => `[data-tab-id="${CSS.escape(String(tabId))}"] .tab-main`;

function promptArchive(scope = ALL_TABS, returnFocus = '') {
  if (isBusy()) return;
  if (planArchive(scopeWindows(state.windows, scope)).count === 0) return;
  state.prompt = { kind: 'confirm', scope, returnFocus };
  render();
  document.getElementById('archive-confirm')?.focus();
}

async function confirmArchive() {
  if (isBusy() || state.prompt?.kind !== 'confirm') return;
  const { scope } = state.prompt;
  state.prompt = { kind: 'busy', text: 'Archiving tabs…' };
  render();

  let result;
  try {
    // Re-read so tabs opened or closed since the confirmation are accounted for.
    const plan = planArchive(scopeWindows(await readOpenWindows(await loadSuspended()), scope));
    const { archived, closeFailed, batchId } = await archivePlan(plan, scope.label);
    const notes = [leftOpenText(plan.skipped, 'left open')];
    if (closeFailed > 0) {
      notes.push(`${plural(closeFailed, 'archived tab')} changed or could not be closed and ` +
        `${closeFailed === 1 ? 'is' : 'are'} still open.`);
    }
    result = {
      kind: 'result',
      text: `Archived ${plural(archived, 'tab')}${scope.name ? ` from ${scope.name}` : ''}`,
      detail: notes.filter(Boolean).join(' '),
      tone: closeFailed > 0 ? 'warn' : '',
    };
    if (archived > 0 && scope.kind === 'all') {
      state.source = 'archive';
      saveValue(SOURCE_KEY, 'archive');
      applyViewButtons();
    } else if (archived > 0) {
      result.batchId = batchId;
    }
  } catch (error) {
    console.error('Tab Overview: archive failed', error);
    result = {
      kind: 'result',
      text: 'Nothing was archived and no tab was closed',
      detail: error?.message || '',
      tone: 'error',
    };
  }

  state.prompt = result;
  await refresh();
  focusFirst(['#banner-dismiss']);
}

function viewArchivedBatch(batchId) {
  state.prompt = null;
  switchSource('archive');
  render();
  focusFirst([`[data-batch-id="${CSS.escape(batchId)}"] .batch-restore`, '#search']);
}

async function restoreArchivedBatch(batch) {
  if (isBusy()) return;
  state.prompt = { kind: 'busy', text: `Restoring ${plural(batch.tabCount, 'tab')}…` };
  render();

  let result;
  try {
    const { restored, failed, windows } = await restoreBatch(batch.id);
    result = {
      kind: 'result',
      text: restored + failed === 0
        ? 'This batch was already restored or deleted'
        : `Restored ${plural(restored, 'tab')} in ${plural(windows, 'window')}`,
      detail: failed > 0 ? `${plural(failed, 'tab')} could not be opened and stay in the archive.` : '',
      tone: failed > 0 ? 'warn' : '',
    };
  } catch (error) {
    console.error('Tab Overview: restore failed', error);
    result = { kind: 'result', text: 'Could not restore the batch', detail: error?.message || '', tone: 'error' };
  }

  state.prompt = result;
  await refresh();
  focusFirst(['#banner-dismiss']);
}

async function deleteArchivedBatch(batch) {
  if (isBusy()) return;
  state.confirmDeleteBatchId = null;
  try {
    await deleteBatch(batch.id);
  } catch (error) {
    console.error('Tab Overview: could not delete batch', error);
    state.prompt = { kind: 'result', text: 'Could not delete the batch', detail: error?.message || '', tone: 'error' };
  }
  await refresh(['archive']);
  focusFirst(['#banner-dismiss', '#search']);
}

async function openArchivedTab(tab) {
  await changeArchivedTab(tab, reopenArchivedTab, 'could not reopen archived tab');
}

async function deleteArchivedTab(tab) {
  await changeArchivedTab(tab, (target) => removeArchivedTabs(target.batchId, [target.id]),
    'could not remove archived tab');
}

// The card stays on screen until the next archive load; until then a second
// click would act on the same tab again.
async function changeArchivedTab(tab, change, failure) {
  const key = archivedTabKey(tab);
  if (isBusy() || pendingArchivedTabs.has(key)) return;
  pendingArchivedTabs.add(key);
  try {
    await change(tab);
  } catch (error) {
    pendingArchivedTabs.delete(key);
    console.warn(`Tab Overview: ${failure}`, error);
  }
  scheduleRefresh('archive');
}

function archivedTabKey(tab) {
  return `${tab.batchId}:${tab.id}`;
}

async function downloadArchive() {
  if (isBusy()) return;
  try {
    const backup = await exportArchive();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tab-archive-${isoDate(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    console.error('Tab Overview: export failed', error);
    state.prompt = { kind: 'result', text: 'Could not export the archive', detail: error?.message || '', tone: 'error' };
    render();
  }
}

async function importArchiveFile(file) {
  if (isBusy()) return;
  let result;
  try {
    const { batches, tabs, skipped, invalid, groups, groupsSkipped, groupsInvalid, suspended } =
      await importArchive(await file.text());
    const notes = [];
    if (skipped > 0) notes.push(`${plural(skipped, 'batch', 'batches')} already in the archive were skipped.`);
    if (invalid > 0) notes.push(`${plural(invalid, 'batch', 'batches')} had no tabs that can be reopened.`);
    if (groupsSkipped > 0) notes.push(`Skipped ${plural(groupsSkipped, 'group')} you already have.`);
    if (groupsInvalid > 0) notes.push(`${plural(groupsInvalid, 'group')} without a valid id ${groupsInvalid === 1 ? 'was' : 'were'} left out.`);
    result = {
      kind: 'result',
      text: [
        `Imported ${plural(batches, 'batch', 'batches')}`,
        plural(tabs, 'tab'),
        plural(groups, 'group'),
        ...(suspended > 0 ? [plural(suspended, 'suspended tab')] : []),
      ].join(', '),
      detail: notes.join(' '),
      tone: '',
    };
  } catch (error) {
    result = { kind: 'result', text: 'Nothing was imported', detail: error?.message || '', tone: 'error' };
  }
  state.prompt = result;
  await refresh(['archive', 'groups']);
}

/* ----------------------------------------------------------- custom groups */

function groupableHost(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? normalizeDomain(parsed.hostname) : null;
  } catch {
    return null;
  }
}

function bindCustomGroups() {
  if (!EXTENSION_STORAGE) return;
  els.groupsAdd.addEventListener('click', addGroup);
  els.groupsShowEmpty.addEventListener('click', toggleEmptyGroups);
  // mousedown, not click: closing must not rebuild the page under a click
  // that is about to land on another card.
  document.addEventListener('mousedown', (event) => {
    if (state.menu && !event.target.closest?.('.tab-menu, .tab-menu-button')) closeMenu();
  });
}

// Mutations resolve with the stored groups, so the page updates even when
// storage reports no change (a save that normalized to the same value).
async function changeGroups(change) {
  try {
    const groups = await change();
    state.customGroups = groups;
    state.groupRules = compileCustomGroups(groups);
    // A save often starts with the mousedown that blurs a field; rendering
    // before the mouseup would replace the button being clicked.
    renderWhenReleased();
    return groups;
  } catch (error) {
    console.error('Tab Overview: could not save custom groups', error);
    state.prompt = { kind: 'result', text: 'Could not save your custom groups', detail: error?.message || '', tone: 'error' };
    render();
    return null;
  }
}

const groupOf = (host) => state.customGroups.find((group) => group.domains.includes(host));
const menuButtonSelector = (tabId) => `[data-tab-id="${CSS.escape(String(tabId))}"] .tab-menu-button`;

function appendTabMenu(card, key, tabId, host, url, suspend) {
  const open = state.menu?.key === key;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tab-menu-button';
  button.title = suspend ? 'Group or suspend' : 'Custom group';
  button.setAttribute('aria-label', suspend ? `Put ${host} in a custom group, or suspend the tab` : `Put ${host} in a custom group`);
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', String(open));
  button.append(createIcon(ICONS.more));
  button.addEventListener('click', () => toggleMenu({ key, tabId, host }));
  card.append(button);

  if (!open) return;
  card.classList.add('has-menu');
  card.append(renderTabMenu(host, url, suspend));
}

function renderTabMenu(host, url, suspend) {
  const menu = el('div', 'tab-menu');
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', `Custom group for ${host}`);
  menu.addEventListener('auxclick', (event) => event.stopPropagation());

  const title = el('div', 'tab-menu-title');
  title.textContent = `Put ${host} in…`;
  menu.append(title);

  const current = groupOf(host);
  const matched = current ? null : matchCustomDomain(url, state.groupRules);
  if (matched) {
    const note = el('div', 'tab-menu-current');
    note.textContent = `In ${matched.category.label} through ${matched.entry}`;
    menu.append(note);
  }
  for (const group of state.customGroups) {
    const item = menuItem(group.label, () => changeGroups(() => assignDomain(host, group.id))
      .then(() => closeMenu({ focusButton: true })), 'tab-menu-group');
    item.dataset.groupId = group.id;
    const dot = el('span', 'tab-menu-dot');
    dot.dataset.color = group.color;
    item.prepend(dot);
    if (group === current || group.id === matched?.category.groupId) {
      item.disabled = true;
      item.setAttribute('aria-current', 'true');
      item.title = current ? `${host} is in ${group.label}` : `In ${group.label} through ${matched.entry}`;
    }
    menu.append(item);
  }

  if (state.menu.naming) {
    const row = el('div', 'tab-menu-naming');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-menu-input';
    input.placeholder = 'Group name';
    input.setAttribute('aria-label', 'New group name');
    input.maxLength = 80;
    input.value = state.menu.draft;
    input.addEventListener('input', () => { state.menu.draft = input.value; });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createGroupFromMenu(host);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.menu.naming = false;
        render();
        document.querySelector('.tab-menu .tab-menu-new')?.focus();
      }
    });
    row.append(input, menuItem('Create', () => createGroupFromMenu(host), 'tab-menu-create'));
    menu.append(row);
  } else {
    menu.append(menuItem('New group…', () => {
      state.menu.naming = true;
      render();
      document.querySelector('.tab-menu .tab-menu-input')?.focus();
    }, 'tab-menu-new'));
  }

  if (current) {
    menu.append(el('div', 'tab-menu-divider'));
    menu.append(menuItem(`Remove from ${current.label}`, () => changeGroups(() => unassignDomain(host, current.id))
      .then(() => closeMenu({ focusButton: true })), 'tab-menu-remove'));
  }

  if (suspend) {
    menu.append(el('div', 'tab-menu-divider'));
    const item = menuItem('Suspend tab', () => {
      closeMenu();
      suspend();
    }, 'tab-menu-suspend');
    item.title = 'Close the tab and keep it here, to reopen later';
    item.prepend(createIcon(ICONS.suspend));
    menu.append(item);
  }

  return menu;
}

function menuItem(label, onClick, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `tab-menu-item ${className}`;
  const text = el('span', 'tab-menu-label');
  text.textContent = label;
  button.append(text);
  button.addEventListener('click', onClick);
  return button;
}

function toggleMenu(menu) {
  if (state.menu?.key === menu.key) {
    closeMenu({ focusButton: true });
    return;
  }
  state.menu = { ...menu, naming: false, draft: '' };
  render();
  document.querySelector('.tab-menu .tab-menu-item:not(:disabled)')?.focus();
}

async function createGroupFromMenu(host) {
  const label = state.menu?.draft.trim();
  if (!label) {
    document.querySelector('.tab-menu .tab-menu-input')?.focus();
    return;
  }
  await changeGroups(() => createGroup({ label, domains: [host] }));
  closeMenu({ focusButton: true });
}

// Takes the menu out of the page without a full render, so a click that
// started outside the menu still reaches its target.
function closeMenu({ focusButton = false } = {}) {
  const tabId = state.menu?.tabId;
  state.menu = null;
  for (const node of document.querySelectorAll('.tab-menu')) node.remove();
  for (const card of document.querySelectorAll('.tab.has-menu')) {
    card.classList.remove('has-menu');
    card.querySelector('.tab-menu-button')?.setAttribute('aria-expanded', 'false');
  }
  if (focusButton && tabId !== undefined) document.querySelector(menuButtonSelector(tabId))?.focus();
}

// null | GroupEditor: the one inline editor, in its group's Sorted section.
// GroupEditor { id, section, item, confirmingDelete, ...its fields and buttons }
let openEditor = null;

function openGroupEditor(id, { select = false } = {}) {
  // A search hides groups without matching tabs, so an edit could hide the
  // group being edited, and a new group has no tabs at all.
  state.query = '';
  els.search.value = '';
  openEditor = createGroupEditor(id);
  render();
  if (!openEditor) return;
  openEditor.label.focus();
  if (select) openEditor.label.select();
}

function closeGroupEditor({ focusButton = false } = {}) {
  if (!openEditor) return;
  const { id, item } = openEditor;
  // Blurring commits a field that is still being typed in.
  if (item.contains(document.activeElement)) document.activeElement.blur();
  openEditor = null;
  render();
  if (focusButton) focusFirst([`[data-category-id="${CSS.escape(`custom:${id}`)}"] .category-edit`, '#groups-show-empty', '#groups-add']);
}

function createGroupEditor(id) {
  const save = (patch) => changeGroups(() => editGroup(id, patch));
  const item = el('div', 'group-editor');
  item.dataset.customGroupId = id;

  const head = el('div', 'group-editor-head');
  const label = document.createElement('input');
  label.type = 'text';
  label.className = 'group-edit-label';
  label.maxLength = 80;
  label.setAttribute('aria-label', 'Group name');
  label.addEventListener('change', () => save({ label: label.value }));
  label.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') label.blur();
  });

  const colors = el('div', 'group-edit-color');
  colors.setAttribute('role', 'group');
  colors.setAttribute('aria-label', 'Color');
  const swatches = [...GROUP_COLORS].map((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.dataset.color = color;
    swatch.title = color;
    swatch.setAttribute('aria-label', color);
    swatch.addEventListener('click', () => save({ color }));
    return swatch;
  });
  colors.append(...swatches);

  const actions = el('div', 'group-editor-actions');
  const up = createButton('Move up', () => moveCustomGroup(id, -1), 'is-ghost group-move-up');
  const down = createButton('Move down', () => moveCustomGroup(id, 1), 'is-ghost group-move-down');
  const deleteButton = createButton('Delete group', () => {
    openEditor.confirmingDelete = true;
    render();
    item.querySelector('.group-delete-cancel').focus();
  }, 'is-ghost group-delete');
  const done = createButton('Done', () => closeGroupEditor({ focusButton: true }), 'group-edit-done');
  actions.append(up, down, deleteButton, done);

  const confirm = el('div', 'group-editor-actions group-delete-prompt');
  const question = el('span', 'group-delete-question');
  confirm.append(
    question,
    createButton('Delete', () => {
      openEditor.confirmingDelete = false;
      changeGroups(() => deleteGroup(id)).then(() => focusFirst(['#groups-add']));
    }, 'is-danger group-delete-confirm'),
    createButton('Cancel', cancelGroupDelete, 'group-delete-cancel'),
  );

  head.append(label, colors, actions, confirm);

  const domains = listField('Domains · one per line', 'group-edit-domains', 'example.com\ngithub.com/your-org',
    (lines) => save({ domains: lines }));
  const keywords = listField('Keywords · optional', 'group-edit-keywords', 'invoice\nquarterly report',
    (lines) => save({ keywords: lines }));
  const fields = el('div', 'group-editor-fields');
  fields.append(domains.wrap, keywords.wrap);
  const hint = el('p', 'group-editor-hint');
  hint.textContent = 'A domain also covers its subdomains; add a path, like github.com/your-org, to match ' +
    'only part of a site. Keywords match whole words in the title or address. Fields save when you leave them.';

  item.append(head, fields, hint);
  const section = el('section');
  section.append(item);
  return {
    id, section, item, confirmingDelete: false,
    label, swatches, up, down, deleteButton, done, actions, confirm, question,
    domains: domains.area, keywords: keywords.area,
  };
}

// A focused field keeps what is being typed; it saves when it loses focus.
function setFieldValue(field, value) {
  if (field !== document.activeElement && field.value !== value) field.value = value;
}

function updateGroupEditor(editor, group, index) {
  const busy = isBusy();
  editor.item.dataset.color = group.color;
  setFieldValue(editor.label, group.label);
  setFieldValue(editor.domains, group.domains.join('\n'));
  setFieldValue(editor.keywords, group.keywords.join('\n'));
  editor.domains.rows = Math.min(8, Math.max(3, group.domains.length + 1));
  editor.keywords.rows = Math.min(8, Math.max(3, group.keywords.length + 1));
  for (const swatch of editor.swatches) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.color === group.color));
    swatch.disabled = busy;
  }
  editor.up.disabled = busy || index === 0;
  editor.down.disabled = busy || index === state.customGroups.length - 1;
  editor.deleteButton.disabled = busy;
  editor.done.disabled = busy;
  editor.up.setAttribute('aria-label', `Move ${group.label} up`);
  editor.down.setAttribute('aria-label', `Move ${group.label} down`);

  editor.actions.hidden = editor.confirmingDelete;
  editor.confirm.hidden = !editor.confirmingDelete;
  editor.question.textContent = `Delete ${group.label}?`;
  for (const button of editor.confirm.querySelectorAll('button')) button.disabled = busy;
}

function listField(title, className, placeholder, save) {
  const wrap = el('label', 'group-field');
  const name = el('span', 'group-field-name');
  name.textContent = title;
  const area = document.createElement('textarea');
  area.className = className;
  area.spellcheck = false;
  area.placeholder = placeholder;
  area.addEventListener('change', () => save(area.value.split('\n')));
  wrap.append(name, area);
  return { wrap, area };
}

async function addGroup() {
  if (isBusy()) return;
  const groups = await changeGroups(() => createGroup({ label: 'New group' }));
  const created = groups?.at(-1);
  if (created) openGroupEditor(created.id, { select: true });
}

async function moveCustomGroup(id, offset) {
  await changeGroups(() => moveGroup(id, offset));
  const editor = `[data-custom-group-id="${CSS.escape(id)}"]`;
  // The button just pressed is disabled once the group reaches the end of the list.
  const active = document.activeElement;
  if (!openEditor?.item.contains(active) || active.disabled) {
    focusFirst([
      `${editor} ${offset < 0 ? '.group-move-up' : '.group-move-down'}:not(:disabled)`,
      `${editor} .group-move-up:not(:disabled)`,
      `${editor} .group-move-down:not(:disabled)`,
    ]);
  }
}

function cancelGroupDelete() {
  if (!openEditor) return;
  openEditor.confirmingDelete = false;
  render();
  openEditor?.deleteButton.focus();
}

function toggleGroup(ctx, groupId) {
  if (ctx.collapsed.has(groupId)) {
    ctx.collapsed.delete(groupId);
  } else {
    ctx.collapsed.add(groupId);
  }
  saveSet(ctx.collapsedKey, ctx.collapsed);
  render();
}

/* --------------------------------------------------------------- utilities */

function isSelfTab(tab) {
  const url = tab.url || tab.pendingUrl || '';
  if (!url) return false;
  return url === SELF_URL ||
    url.startsWith(EXTENSION_ORIGIN) ||
    /^(?:chrome|brave|edge|opera|vivaldi):\/\/new-?tab/.test(url);
}

function loadSet(key, normalize) {
  try {
    const raw = localStorage.getItem(key);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(ids) ? ids.map(normalize).filter((id) => id !== null) : [],
    );
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  saveValue(key, JSON.stringify([...set]));
}

function toNumberId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function toStringId(value) {
  return typeof value === 'string' ? value : null;
}

function loadChoice(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.has(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function countGroups(windows) {
  return windows.reduce((sum, win) => sum + win.groups.length, 0);
}

function countVisible({ groups, ungrouped }) {
  return groups.reduce((sum, group) => sum + group.tabs.length, 0) + ungrouped.length;
}

function plural(count, word, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${formatShortDate(timestamp)} ${date.getFullYear()}, ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function isoDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatAge(openedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

function updateAges() {
  if (document.visibilityState !== 'visible') return;

  for (const node of document.querySelectorAll('.tab-age[data-since]')) {
    const since = Number(node.dataset.since);
    if (Number.isFinite(since)) node.textContent = (node.dataset.prefix || '') + formatAge(since);
  }
}

function matchSummary(matched, total, noun) {
  return `${matched} of ${plural(total, noun)} ${matched === 1 ? 'matches' : 'match'}`;
}

function displayUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
      return `${parsed.host.replace(/^www\./, '')}${path}`;
    }
    if (parsed.protocol === 'file:') {
      return parsed.pathname.split('/').filter(Boolean).pop() || 'file';
    }
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:' || parsed.protocol === 'about:') {
      return url.replace(/\/$/, '');
    }
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

function hostnameOf(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname) return parsed.hostname.replace(/^www\./, '');
    if (parsed.protocol === 'file:') {
      return parsed.pathname.split('/').filter(Boolean).pop() || 'file';
    }
    return parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function createIcon(markup) {
  let template = iconTemplates.get(markup);
  if (!template) {
    // text/html, not image/svg+xml: the HTML parser namespaces <svg> without an xmlns attribute.
    template = new DOMParser().parseFromString(markup, 'text/html').body.firstElementChild;
    iconTemplates.set(markup, template);
  }
  return template.cloneNode(true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
