// Track Layout: application state and UI wiring.
'use strict';

const APP_KEY = 'track-layout:v1';
const THEME_KEY = 'track-layout:theme';
const THEME_MODES = ['system', 'dark', 'light'];
const SA_BOUNDS = { minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 };
const CP_ROW_HEIGHT = 78;
const CP_ROW_STEP = 84;
const CP_ROW_OVERSCAN = 3;
const t = (text, ...args) => I18n.t(text, ...args);
let themeMode = 'system';
let themeMedia = null;
const SAMPLE_FALLBACK = [
  { file: 'los-santos-loop.json', name: 'Los Santos 环城', nameEn: 'Los Santos Loop', note: '海滩 → 东岸 → 市中心 → 南城 → 西城 → 北环，再回到海滩。', noteEn: 'Beach → east coast → downtown → south LS → west side → north loop, then back to the beach.', cps: 12, length: '10.1 km' },
  { file: 'san-fierro-hills.json', name: 'San Fierro 山路', nameEn: 'San Fierro Hills', note: '市中心出发，绕西城、南城与东湾，穿过多段起伏山路。', noteEn: 'From downtown, around the west side, south city, and east bay over rolling hills.', cps: 12, length: '4.48 km' },
  { file: 'las-venturas-strip.json', name: 'Las Venturas 大道', nameEn: 'Las Venturas Strip', note: '机场 → 南大道 → 东环 → 赌城大道，再回到机场。', noteEn: 'Airport → south strip → east loop → the Strip, then back to the airport.', cps: 8, length: '6.34 km' },
];
const SPEC_EXAMPLE = `{
  "name": "Los Santos Loop",
  "author": "your name",
  "closed": false,
  "checkpoints": [
    { "x": 2287.4, "y": -1605.9, "z": 2.6 },
    { "x": 1617.6, "y": -1205.8, "z": 51.8 },
    { "x": 1599.0, "y": -2378.2, "z": 12.4 }
  ]
}`;

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  track: null,
  route: null,
  style: Style.defaultVisual(),
  exportOpts: Style.defaultExport(),
  routing: { mode: 'auto', snapRadius: 80, smooth: 45, closed: false },
  selected: -1,
  addMode: false,
  graph: null,
  netState: 'loading',
  samples: [],
  samplesLoading: true,
  base: { source: 'builtin', customUrl: null, customName: '', bounds: { ...SA_BOUNDS } },
  previewInfo: null,
  routeTimer: 0,
  styleTimer: 0,
  saveTimer: 0,
  metaTimer: 0,
  miniTimer: 0,
  activeTab: 'track',
  cpListCollapsed: false,
  cpWindow: null,
  cpScrollRaf: 0,
};

// ── Utilities ───────────────────────────────────────────────────────────
function getPath(obj, path) {
  return path.split('.').reduce((o, key) => (o && o[key] !== undefined ? o[key] : undefined), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function colorValue(v) {
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())) return v.trim();
  return Style.toHex(Style.parseColor(v));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtCoord(v, digits = 2) {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function safeFileName(name) {
  return String(name || 'track').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'track';
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function closeDialog(dlg) {
  if (!dlg || !dlg.open || dlg.classList.contains('is-closing')) return;
  clearTimeout(dlg._closeTimer);
  dlg.classList.add('is-closing');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  dlg._closeTimer = setTimeout(() => {
    dlg._closeTimer = 0;
    dlg.classList.remove('is-closing');
    dlg.close();
  }, reduced ? 0 : 170);
}

function openDialog(dlg) {
  if (!dlg) return;
  clearTimeout(dlg._closeTimer);
  dlg._closeTimer = 0;
  dlg.classList.remove('is-closing');
  if (!dlg.open) dlg.showModal();
}

function closeOpenDialogs() {
  for (const dlg of qsa('dialog[open]')) closeDialog(dlg);
}

function modeLabel(mode) {
  return {
    auto: t('自动'),
    road: t('路网 A*'),
    spline: t('平滑曲线'),
    straight: t('直线连接'),
    point: t('单点'),
    empty: t('空'),
  }[mode] || mode;
}

// ── Toast / status ──────────────────────────────────────────────────────
let toastTimer = 0;
let toastHideTimer = 0;
function toast(message, kind = '') {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show${kind ? ` ${kind}` : ''}`;
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toastHideTimer = setTimeout(() => { el.className = 'toast hidden'; }, 180);
  }, kind === 'error' ? 4600 : 2800);
}

function setSideStatus(kind, text) {
  const el = $('side-status');
  if (el) el.textContent = text;
  const dot = qs('.dot-live');
  if (dot) dot.className = `dot-live${kind === 'busy' ? ' busy' : kind === 'error' ? ' error' : ''}`;
}

function setNetStatus(kind, text) {
  const el = $('net-status');
  if (!el) return;
  el.textContent = text;
  el.className = `chip ${kind === 'ok' ? 'chip-ok' : kind === 'error' ? 'chip-error' : 'chip-muted'}`;
}

// ── Session / preferences ───────────────────────────────────────────────
function restorePrefs() {
  let saved = null;
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return null;

  if (saved.style && typeof saved.style === 'object') {
    state.style = Style.deepMerge(Style.defaultVisual(), saved.style);
  }
  if (!Style.THEMES.some((theme) => theme.key === state.style.theme)) state.style.theme = 'neon';
  if (saved.exportOpts && typeof saved.exportOpts === 'object') {
    state.exportOpts = Style.deepMerge(Style.defaultExport(), saved.exportOpts);
  }
  if (saved.routing && typeof saved.routing === 'object') {
    state.routing = {
      mode: Track.MODES.includes(saved.routing.mode) ? saved.routing.mode : 'auto',
      snapRadius: clamp(Number(saved.routing.snapRadius) || 80, 20, 200),
      smooth: saved.routing.smooth !== undefined ? clamp(Number(saved.routing.smooth) || 0, 0, 100) : 45,
      closed: !!saved.routing.closed,
    };
  }
  if (saved.base && saved.base.bounds) {
    const b = saved.base.bounds;
    if ([b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) && b.maxX > b.minX && b.maxY > b.minY) {
      state.base.bounds = { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY };
    }
  }
  // Custom base images are not persisted (too large for localStorage).
  if (state.style.map.source === 'custom') state.style.map.source = 'builtin';
  state.exportOpts.width = clamp(Math.round(Number(state.exportOpts.width) || 1920), 320, 4096);
  state.exportOpts.height = clamp(Math.round(Number(state.exportOpts.height) || 1080), 320, 4096);
  return saved;
}

function saveSessionSoon() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveSession, 350);
}

function saveSession() {
  try {
    const payload = {
      v: 1,
      track: state.track ? Track.toJSON(state.track) : null,
      empty: !state.track || !state.track.checkpoints.length,
      routing: state.routing,
      style: state.style,
      exportOpts: state.exportOpts,
      base: { bounds: state.base.bounds },
    };
    localStorage.setItem(APP_KEY, JSON.stringify(payload));
  } catch { /* quota / private mode */ }
}

function loadSessionTrack(saved) {
  if (!saved || !saved.track) return null;
  try {
    const track = Track.parseTrack(JSON.stringify(saved.track), '上次会话.json');
    if (!track.checkpoints.length) return null;
    return track;
  } catch { return null; }
}

// ── Track load / route ─────────────────────────────────────────────────
function applyTrack(track, opts = {}) {
  if (!track) return;
  state.track = track;
  state.routing.closed = !!track.closed;
  state.selected = -1;
  state.addMode = false;
  MapView.setAddMode(false);
  $('track-name').value = track.name || '';
  $('track-author').value = track.author || '';
  $('closed-toggle').checked = state.routing.closed;
  $('empty-state').classList.add('hidden');
  const cpList = $('cp-list');
  if (cpList) cpList.scrollTop = 0;
  updateDocumentTitle();
  syncTrackMeta();
  syncRoutingInputs();
  recomputeRoute({ fit: opts.fit !== false, markers: true, silent: true });
  syncAll();
  saveSessionSoon();
  if (opts.toast) toast(opts.toast, 'ok');
  if (opts.fit !== false) requestAnimationFrame(() => MapView.fitRoute());
}

function recomputeRoute(opts = {}) {
  const markers = opts.markers !== false;
  const renderList = opts.list !== false;
  if (!state.track) {
    state.route = null;
    state.selected = -1;
    MapView.setData({ track: null, route: null, style: state.style, selected: -1 });
    renderTrackSummary();
    renderRouteStats();
    renderCpList();
    renderWarnings();
    setSideStatus('ready', t('准备就绪'));
    return;
  }
  state.track.closed = !!state.routing.closed;
  Track.assignRoles(state.track);
  setSideStatus('busy', state.graph ? t('计算路线…') : t('计算路线（路网载入中）…'));
  let route;
  try {
    route = Track.computeRoute(state.track, state.graph, {
      mode: state.routing.mode,
      snapRadius: state.routing.snapRadius,
      smooth: state.routing.smooth,
      closed: state.routing.closed,
    });
  } catch (err) {
    console.error(err);
    toast(t('路线计算失败：{0}', I18n.errorText(err)), 'error');
    route = Track.computeRoute(state.track, null, {
      mode: state.routing.mode === 'road' ? 'spline' : state.routing.mode,
      snapRadius: state.routing.snapRadius,
      smooth: state.routing.smooth,
      closed: state.routing.closed,
    });
  }
  state.route = route;
  if (markers) {
    MapView.setData({ track: state.track, route, style: state.style, selected: state.selected });
  } else {
    MapView.setRouteOnly(route);
  }
  renderTrackSummary();
  renderRouteStats();
  if (markers) {
    if (renderList) renderCpList();
    else refreshCpSnapBadges();
  }
  renderWarnings();
  const km = route.length >= 1000 ? `${(route.length / 1000).toFixed(2)} km` : `${Math.round(route.length)} m`;
  setSideStatus('ready', route.partial ? t('路线就绪 · {0} · 部分路网', km) : route.modeUsed === 'road' ? t('路线就绪 · {0}', km) : t('路线就绪 · {0}', modeLabel(route.modeUsed)));
  if (opts.fit) requestAnimationFrame(() => MapView.fitRoute());
  saveSessionSoon();
  if (state.activeTab === 'export') scheduleMiniPreview();
}

function scheduleRoute(delay = 120, opts = {}) {
  clearTimeout(state.routeTimer);
  state.routeTimer = setTimeout(() => {
    recomputeRoute({ fit: !!opts.fit, markers: opts.markers !== false });
  }, delay);
}

// ── Rendering: track pane ──────────────────────────────────────────────
function syncTrackMeta() {
  if (!state.track) {
    $('track-name').value = '';
    $('track-author').value = '';
    return;
  }
  if (document.activeElement !== $('track-name')) $('track-name').value = state.track.name || '';
  if (document.activeElement !== $('track-author')) $('track-author').value = state.track.author || '';
}

function renderTrackSummary() {
  const el = $('track-summary');
  const count = $('cp-count');
  if (!el) return;
  if (!state.track) {
    el.innerHTML = '';
    if (count) count.textContent = '0';
    return;
  }
  const r = state.route;
  el.innerHTML = [
    [t('总长度'), r ? Track.formatDistance(r.length) : '–'],
    [t('检查点'), String(state.track.checkpoints.length)],
    [t('计算方式'), r ? modeLabel(r.modeUsed) : '–'],
  ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>`).join('');
  if (count) count.textContent = String(state.track.checkpoints.length);
}

function roleBadge(cp) {
  if (cp.role === Track.ROLE.START) return 'S';
  if (cp.role === Track.ROLE.FINISH) return 'F';
  if (cp.role === Track.ROLE.LOOP) return 'S/F';
  return '';
}

function cpRoleName(cp, i) {
  if (cp.role === Track.ROLE.START) return t('起点');
  if (cp.role === Track.ROLE.FINISH) return t('终点');
  if (cp.role === Track.ROLE.LOOP) return t('起终点');
  return `CP ${i}`;
}

function cpSnapState(index) {
  const route = state.route;
  const routeCp = route && route.cps ? route.cps[index] : null;
  if (!route || route.modeUsed !== 'road' || !routeCp) {
    return { text: '', className: '', offroad: false };
  }
  if (routeCp.snap) {
    const dist = routeCp.snap.dist;
    const offroad = dist > Math.min(50, state.routing.snapRadius * 0.6);
    return {
      text: t('路网 {0}m', Math.round(dist)),
      className: `cp-snap ${offroad ? 'warn' : 'ok'}`,
      offroad,
    };
  }
  return { text: t('未吸附'), className: 'cp-snap warn', offroad: true };
}

function cpRowHtml(cp, i, total) {
  const style = state.style;
  let badge = roleBadge(cp);
  if (!badge) badge = String(i);
  let roleColor;
  if (cp.role === Track.ROLE.START || cp.role === Track.ROLE.LOOP) roleColor = style.cp.startColor;
  else if (cp.role === Track.ROLE.FINISH) roleColor = style.cp.finishColor;
  else roleColor = style.cp.fill;
  const badgeText = (cp.role === Track.ROLE.CP) ? style.cp.textColor : Style.contrastText(roleColor, '#ffffff', '#08110b');
  const snap = cpSnapState(i);
  const snapHtml = snap.text ? `<span class="${snap.className}">${escapeHtml(snap.text)}</span>` : '';
  const label = cp.label ? ` · ${escapeHtml(cp.label)}` : '';
  return `<div class="cp-row${i === state.selected ? ' is-selected' : ''}${snap.offroad ? ' is-offroad' : ''}" data-i="${i}" style="top:${i * CP_ROW_STEP + 3}px;height:${CP_ROW_HEIGHT}px" role="group" tabindex="0" aria-label="${escapeHtml(cpRoleName(cp, i))}" aria-posinset="${i + 1}" aria-setsize="${total}">
      <div class="cp-role" style="background:${roleColor};color:${badgeText}">${escapeHtml(badge)}</div>
      <div class="cp-main">
        <div class="cp-line">
          <span class="cp-name">${escapeHtml(cpRoleName(cp, i))}${label}</span>
          ${snapHtml}
        </div>
        <div class="cp-coords">
          ${['x', 'y', 'z'].map((axis) => `<label class="cp-coord"><span class="axis">${axis.toUpperCase()}</span><input class="cp-input" type="number" step="0.1" data-axis="${axis}" value="${fmtCoord(cp[axis], 2)}"></label>`).join('')}
        </div>
      </div>
      <div class="cp-actions">
        <button class="cp-btn" data-move="-1" title="${escapeHtml(t('上移'))}" ${i === 0 ? 'disabled' : ''}><svg class="ico" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#i-arrow-up"></use></svg></button>
        <button class="cp-btn" data-move="1" title="${escapeHtml(t('下移'))}" ${i === total - 1 ? 'disabled' : ''}><svg class="ico" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#i-arrow-down"></use></svg></button>
        <button class="cp-btn danger" data-del title="${escapeHtml(t('删除'))}"><svg class="ico" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#i-trash-2"></use></svg></button>
      </div>
    </div>`;
}

function renderCpWindow(force = false) {
  const list = $('cp-list');
  if (!list || state.cpListCollapsed) return;
  const cps = state.track && state.track.checkpoints;
  if (!cps || !cps.length) return;
  const total = cps.length;
  const viewport = list.clientHeight || Math.min(420, Math.max(160, window.innerHeight * 0.52));
  const scrollTop = list.scrollTop;
  const start = Math.max(0, Math.floor(scrollTop / CP_ROW_STEP) - CP_ROW_OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / CP_ROW_STEP) + CP_ROW_OVERSCAN);
  if (!force && state.cpWindow &&
      state.cpWindow.start === start && state.cpWindow.end === end && state.cpWindow.total === total) {
    return;
  }
  const rows = [];
  for (let i = start; i < end; i++) rows.push(cpRowHtml(cps[i], i, total));
  list.innerHTML = `<div class="cp-list-spacer" style="height:${total * CP_ROW_STEP}px">${rows.join('')}</div>`;
  list.scrollTop = scrollTop;
  state.cpWindow = { start, end, total };
}

function renderCpList(opts = {}) {
  const list = $('cp-list');
  if (!list) return;
  state.cpWindow = null;
  if (!state.track || !state.track.checkpoints.length) {
    list.innerHTML = `<div class="cp-empty">${escapeHtml(t('还没有检查点。打开 JSON，或点「地图添加」。'))}</div>`;
    return;
  }
  if (state.cpListCollapsed) {
    list.innerHTML = '';
    return;
  }
  if (opts.resetScroll) list.scrollTop = 0;
  renderCpWindow(true);
}

function ensureCpRowVisible(index) {
  const list = $('cp-list');
  if (!list || state.cpListCollapsed) return null;
  const top = index * CP_ROW_STEP;
  const viewTop = list.scrollTop;
  const viewHeight = list.clientHeight || Math.min(420, Math.max(160, window.innerHeight * 0.52));
  let changed = false;
  if (top < viewTop) {
    list.scrollTop = Math.max(0, top - 3);
    changed = true;
  } else if (top + CP_ROW_STEP > viewTop + viewHeight) {
    list.scrollTop = Math.max(0, top + CP_ROW_STEP - viewHeight + 3);
    changed = true;
  }
  if (changed || !state.cpWindow || index < state.cpWindow.start || index >= state.cpWindow.end) {
    renderCpWindow(true);
  }
  return qs(`.cp-row[data-i="${index}"]`, list);
}

function syncCpCollapseButton() {
  const btn = $('cp-collapse');
  if (!btn) return;
  const label = t(state.cpListCollapsed ? '展开检查点' : '折叠检查点');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', String(!state.cpListCollapsed));
  btn.classList.toggle('is-collapsed', state.cpListCollapsed);
}

function setCpListCollapsed(collapsed) {
  state.cpListCollapsed = !!collapsed;
  const body = $('cp-body');
  if (body) body.classList.toggle('hidden', state.cpListCollapsed);
  syncCpCollapseButton();
  if (state.cpListCollapsed) {
    const list = $('cp-list');
    if (list) list.innerHTML = '';
    state.cpWindow = null;
  } else {
    renderCpList();
  }
}

function toggleCpList() {
  setCpListCollapsed(!state.cpListCollapsed);
}

function refreshCpSnapBadges() {
  if (!state.track) return;
  for (const row of qsa('.cp-row')) {
    const i = Number(row.dataset.i);
    const snap = cpSnapState(i);
    const line = row.querySelector('.cp-line');
    let span = row.querySelector('.cp-snap');
    if (!snap.text) {
      if (span) span.remove();
      row.classList.remove('is-offroad');
      continue;
    }
    if (!span && line) {
      span = document.createElement('span');
      line.appendChild(span);
    }
    if (span) {
      span.className = snap.className;
      span.textContent = snap.text;
    }
    row.classList.toggle('is-offroad', snap.offroad);
  }
}

function refreshCpBadges() {
  if (!state.track) return;
  const style = state.style;
  for (const row of qsa('.cp-row')) {
    const i = Number(row.dataset.i);
    const cp = state.track.checkpoints[i];
    const badge = row.querySelector('.cp-role');
    if (!cp || !badge) continue;
    let color;
    if (cp.role === Track.ROLE.START || cp.role === Track.ROLE.LOOP) color = style.cp.startColor;
    else if (cp.role === Track.ROLE.FINISH) color = style.cp.finishColor;
    else color = style.cp.fill;
    badge.style.background = color;
    badge.style.color = (cp.role === Track.ROLE.CP) ? style.cp.textColor : Style.contrastText(color, '#ffffff', '#08110b');
  }
}

function selectCp(index, opts = {}) {
  if (!state.track || index < 0 || index >= state.track.checkpoints.length) return;
  state.selected = index;
  qsa('.cp-row', $('cp-list')).forEach((row) => row.classList.toggle('is-selected', Number(row.dataset.i) === index));
  MapView.setSelected(index);
  if (opts.focus !== false) MapView.focusCp(state.track.checkpoints[index]);
  if (opts.scroll !== false) {
    const row = ensureCpRowVisible(index);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function moveCp(index, dir) {
  if (!state.track) return;
  const j = index + dir;
  if (j < 0 || j >= state.track.checkpoints.length) return;
  const cps = state.track.checkpoints;
  [cps[index], cps[j]] = [cps[j], cps[index]];
  state.selected = j;
  Track.assignRoles(state.track);
  recomputeRoute({ fit: false, markers: true });
  ensureCpRowVisible(j);
  saveSessionSoon();
}

function deleteCp(index) {
  if (!state.track) return;
  if (state.track.checkpoints.length <= 1) {
    toast(t('至少保留一个检查点'), 'error');
    return;
  }
  state.track.checkpoints.splice(index, 1);
  state.selected = Math.min(index, state.track.checkpoints.length - 1);
  Track.assignRoles(state.track);
  recomputeRoute({ fit: false, markers: true });
  ensureCpRowVisible(state.selected);
  saveSessionSoon();
}

function ensureTrack() {
  if (state.track) return state.track;
  const track = {
    format: Track.FORMAT,
    name: t('未命名赛道'),
    author: '',
    description: '',
    map: 'san-andreas',
    closed: false,
    checkpoints: [],
    warnings: [],
    sourceName: '',
  };
  state.track = track;
  state.routing.closed = false;
  $('empty-state').classList.add('hidden');
  $('track-name').value = track.name;
  $('closed-toggle').checked = false;
  updateDocumentTitle();
  return track;
}

function addCpAt(x, y) {
  const track = ensureTrack();
  let z = 0;
  let hasZ = false;
  if (state.graph) {
    const snap = state.graph.nearest(x, y, 0, 80, false);
    if (snap) { z = snap.z; hasZ = true; }
  }
  track.checkpoints.push({ x, y, z, hasZ, radius: 0, label: '', declaredType: '', role: Track.ROLE.CP });
  Track.assignRoles(track);
  state.selected = track.checkpoints.length - 1;
  setAddMode(false);
  recomputeRoute({ fit: false, markers: true });
  renderCpList();
  selectCp(state.selected, { focus: false, scroll: true });
  saveSessionSoon();
  toast(t('已添加 {0}', cpRoleName(track.checkpoints[state.selected], state.selected)), 'ok');
}

function setAddMode(on) {
  state.addMode = !!on;
  if (state.addMode) ensureTrack();
  MapView.setAddMode(state.addMode);
  const btn = $('btn-add-cp');
  if (btn) btn.classList.toggle('active', state.addMode);
  const mapBtn = qs('.map-btn[data-action="add-cp"]');
  if (mapBtn) mapBtn.classList.toggle('active', state.addMode);
  const hint = $('add-hint');
  if (hint) hint.classList.toggle('hidden', !state.addMode);
  syncMapControlButtons();
}

function toggleAddMode() {
  setAddMode(!state.addMode);
}

function newTrack() {
  if (state.track && !confirm(t('新建会清空当前赛道（样式与导出设置会保留），继续？'))) return;
  state.track = null;
  state.route = null;
  state.selected = -1;
  state.routing.closed = false;
  state.addMode = false;
  MapView.setAddMode(false);
  $('track-name').value = '';
  $('track-author').value = '';
  $('closed-toggle').checked = false;
  $('empty-state').classList.remove('hidden');
  updateDocumentTitle();
  const cpList = $('cp-list');
  if (cpList) cpList.scrollTop = 0;
  MapView.setData({ track: null, route: null, style: state.style, selected: -1 });
  MapView.fitBase();
  syncAll();
  renderCpList();
  renderWarnings();
  setSideStatus('ready', t('准备就绪'));
  saveSessionSoon();
  toast(t('已新建空白赛道'));
}

// ── Rendering: route pane ──────────────────────────────────────────────
function renderRouteStats() {
  const el = $('route-stats');
  const route = state.route;
  if (el) {
    if (!state.track || !route) {
      el.innerHTML = '';
    } else {
      el.innerHTML = [
        [t('路线长度'), Track.formatDistance(route.length)],
        [t('检查点数'), String(state.track.checkpoints.length)],
        [t('路线点数'), String(route.points.length)],
        [t('计算耗时'), `${route.ms.toFixed(0)} ms`],
      ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div></div>`).join('');
    }
  }
  const chip = $('route-mode-chip');
  if (chip) {
    if (!route) {
      chip.textContent = '–';
      chip.className = 'chip chip-muted';
    } else {
      const partial = route.modeUsed === 'road' && route.partial;
      chip.textContent = partial ? t('路网 A* · 部分') : modeLabel(route.modeUsed);
      const cls = partial ? 'chip-warn' : route.modeUsed === 'road' ? 'chip-ok' : route.modeUsed === 'spline' || route.modeUsed === 'straight' ? 'chip-warn' : 'chip-muted';
      chip.className = `chip ${cls}`;
    }
  }
  const time = $('route-time');
  if (time) time.textContent = route ? `${route.ms.toFixed(1)} ms · ${t('{0} 点', route.points.length)}` : '';

  let total = 0;
  let routed = 0;
  if (route && route.segments) {
    total = route.segments.length;
    routed = route.segments.filter((s) => s.routed).length;
  }
  const fill = $('coverage-fill');
  const text = $('coverage-text');
  if (route && route.modeUsed === 'road' && total) {
    if (fill) fill.style.width = `${(routed / total) * 100}%`;
    if (text) text.textContent = t('{0}/{1} 段', routed, total);
  } else {
    if (fill) fill.style.width = '0%';
    if (text) text.textContent = route && route.modeUsed !== 'point' ? t('未使用路网') : '–';
  }
}

function renderWarnings() {
  const trackEl = $('track-warnings');
  const routeEl = $('route-warnings');
  if (!trackEl || !routeEl) return;
  const seen = new Set();
  const warnKey = (w) => `${w.code}|${w.index}|${w.from}|${w.to}|${w.reason}`;
  const all = [];
  for (const w of (state.track && state.track.warnings) || []) {
    if (seen.has(warnKey(w))) continue;
    seen.add(warnKey(w));
    all.push({ ...w, level: w.code === 'bounds' || w.code === 'duplicate' ? 'warn' : 'warn' });
  }
  for (const w of (state.route && state.route.warnings) || []) {
    if (seen.has(warnKey(w))) continue;
    seen.add(warnKey(w));
    all.push({ ...w, level: w.code === 'fallback' || w.code === 'partial-road' || w.code === 'unreachable' ? 'warn' : 'info' });
  }

  const warnHtml = (list) => list.map((w) => {
    const focus = Number.isInteger(w.index) ? ` data-focus="${w.index}"` : '';
    const interactive = focus ? ' role="button" tabindex="0"' : '';
    return `<div class="warn-item ${w.level || 'warn'}"${focus}${interactive}><span class="wi-ico">${w.level === 'info' ? 'i' : '!'}</span><span>${escapeHtml(I18n.warningText(w, state.track))}</span></div>`;
  }).join('');

  if (!state.track) {
    trackEl.innerHTML = `<div class="warn-empty">${escapeHtml(t('载入赛道后，这里会列出检查点与路网吸附的提示。'))}</div>`;
    routeEl.innerHTML = `<div class="warn-empty">${escapeHtml(t('载入赛道后，这里会列出无法寻路的路段。'))}</div>`;
    return;
  }
  trackEl.innerHTML = all.length ? warnHtml(all) : `<div class="warn-empty">${escapeHtml(t('没有发现明显问题。'))}</div>`;
  const routeOnly = (state.route && state.route.warnings) || [];
  if (routeOnly.length) {
    routeEl.innerHTML = warnHtml(routeOnly);
  } else if (state.route && state.route.modeUsed === 'road') {
    routeEl.innerHTML = `<div class="warn-empty">${escapeHtml(t('所有路段都已使用路网。'))}</div>`;
  } else {
    routeEl.innerHTML = `<div class="warn-empty">${escapeHtml(t('当前使用{0}，不依赖路网吸附。', modeLabel(state.route ? state.route.modeUsed : 'spline')))}</div>`;
  }
}

// ── Style / controls sync ──────────────────────────────────────────────
function renderThemes() {
  const grid = $('theme-grid');
  if (!grid) return;
  grid.innerHTML = Style.THEMES.map((theme) => {
    const active = state.style.theme === theme.key ? ' active' : '';
    return `<button class="theme-card${active}" data-theme="${theme.key}" type="button">
      <span class="theme-swatches">${theme.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="theme-name">${escapeHtml(I18n.themeName(theme))}</span>
      <span class="theme-note">${escapeHtml(I18n.themeNote(theme))}</span>
    </button>`;
  }).join('');
}

function syncStyleInputs() {
  for (const el of qsa('[data-style]')) {
    const path = el.dataset.style;
    const v = getPath(state.style, path);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'color') el.value = colorValue(v);
    else el.value = v === undefined || v === null ? '' : v;
  }
  for (const seg of qsa('.seg[data-bind^="style."]')) {
    const path = seg.dataset.bind.slice(6);
    const v = getPath(state.style, path);
    for (const btn of seg.querySelectorAll('button[data-value]')) {
      btn.classList.toggle('active', String(v) === btn.dataset.value);
    }
  }
  syncCpToggleButton();
  syncMapControlButtons();
  updateHexLabels();
}

function syncMapControlButtons() {
  const setPressed = (action, pressed) => {
    const btn = qs(`.map-btn[data-action="${action}"]`);
    if (!btn) return;
    btn.classList.toggle('active', pressed);
    btn.setAttribute('aria-pressed', String(pressed));
  };
  setPressed('add-cp', !!state.addMode);
  setPressed('toggle-map', state.style.map.visible !== false);
  setPressed('toggle-grid', !!state.style.map.grid);
}

function syncCpToggleButton() {
  const cpBtn = qs('.map-btn[data-action="toggle-cp"]');
  if (!cpBtn) return;
  const visible = state.style.cp.visible !== false;
  cpBtn.classList.toggle('active', visible);
  cpBtn.setAttribute('aria-pressed', String(visible));
  const use = document.getElementById('cp-visibility-use');
  if (use) use.setAttribute('href', `assets/icons/sprite.svg#i-${visible ? 'eye' : 'eye-off'}`);
}

function syncRoutingInputs() {
  const snap = $('snap-radius');
  if (snap) snap.value = String(state.routing.snapRadius);
  const smooth = $('smooth-value');
  if (smooth) smooth.value = String(state.routing.smooth);
  const closed = $('closed-toggle');
  if (closed) closed.checked = !!state.routing.closed;
  for (const btn of qsa('.seg[data-bind="routing.mode"] button')) {
    btn.classList.toggle('active', btn.dataset.value === state.routing.mode);
  }
  const hint = $('mode-hint');
  if (hint) {
    hint.textContent = {
      auto: t('自动：优先全程走 A*；无法全程吸附时尽量沿路网连接，缺口用直线补齐。'),
      road: t('路网：逐段吸附到车辆道路节点并 A* 寻路；失败的路段用直线补齐。'),
      spline: t('平滑：用 Catmull-Rom 曲线穿过所有 CP，适合空中、水上或自制地图。'),
      straight: t('直线：按顺序直接连接 CP，适合快速草图。'),
    }[state.routing.mode] || '';
  }
  updateOutputs();
}

function syncExportInputs() {
  for (const btn of qsa('.seg[data-bind="export.format"] button')) btn.classList.toggle('active', btn.dataset.value === state.exportOpts.format);
  for (const btn of qsa('.seg[data-bind="export.scope"] button')) btn.classList.toggle('active', btn.dataset.value === state.exportOpts.scope);
  for (const btn of qsa('.seg[data-bind="export.background"] button')) btn.classList.toggle('active', btn.dataset.value === state.exportOpts.background);
  const inc = qs('[data-export="includeMap"]');
  if (inc) inc.checked = state.exportOpts.includeMap !== false;
  const bg = qs('[data-export="bgColor"]');
  if (bg) bg.value = colorValue(state.exportOpts.bgColor);
  const w = $('export-width');
  const h = $('export-height');
  if (w) w.value = String(state.exportOpts.width);
  if (h) h.value = String(state.exportOpts.height);
  const preset = $('export-preset');
  if (preset) {
    const found = Style.EXPORT_PRESETS.find((p) => p.w === Number(state.exportOpts.width) && p.h === Number(state.exportOpts.height));
    preset.value = found ? found.key : 'custom';
    state.exportOpts.preset = preset.value;
  }
  const hint = $('format-hint');
  if (hint) {
    hint.textContent = state.exportOpts.format === 'svg'
      ? t('SVG：路线、CP、标题与图例保持矢量；底图以位图嵌入，适合印刷或二次编辑。')
      : t('PNG：适合直接分享；支持透明背景与 2× / 4K 输出。');
  }
  const note = $('export-note');
  if (note) {
    note.textContent = state.exportOpts.format === 'svg'
      ? t('SVG 会把底图作为嵌入位图；关闭「包含底图」可得到纯矢量路线图。')
      : t('导出会按输出分辨率重新绘制，底图滤镜、渐变与文字都会一并烘焙。');
  }
  updateHexLabels();
  updateOutputs();
}

function syncBoundsInputs() {
  const b = state.base.bounds;
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = String(Math.round(v)); };
  set('base-minx', b.minX);
  set('base-maxx', b.maxX);
  set('base-miny', b.minY);
  set('base-maxy', b.maxY);
  const name = $('custom-map-name');
  if (name) name.textContent = state.base.customUrl ? (state.base.customName || t('自定义图片')) : t('未选择');
}

function syncThemeCards() {
  for (const card of qsa('.theme-card')) card.classList.toggle('active', card.dataset.theme === state.style.theme);
}

function updateHexLabels() {
  for (const el of qsa('[data-hex]')) {
    const path = el.dataset.hex;
    const v = path.startsWith('export.') ? getPath(state.exportOpts, path.slice(7)) : getPath(state.style, path);
    el.textContent = colorValue(v).toUpperCase();
  }
}

function formatOutput(path, v) {
  if (v === undefined || v === null || v === '') return '–';
  if (path.endsWith('opacity') || path.endsWith('Opacity')) return `${Math.round(Number(v) * 100)}%`;
  if (path.endsWith('angle') || path.endsWith('hue')) return `${Math.round(Number(v))}°`;
  if (path.endsWith('arrowGap') || path === 'routing.snapRadius') return `${Math.round(Number(v))} m`;
  if (path === 'style.route.arrowSize' || path === 'style.title.size') return `${Number(v).toFixed(1)}×`;
  if (path === 'style.map.brightness' || path === 'style.map.contrast' || path === 'style.map.saturate') {
    return Number(v).toFixed(2);
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

function updateRangeFill(el) {
  if (!el) return;
  const min = Number(el.min) || 0;
  const max = Number(el.max);
  const value = Number(el.value);
  const pct = Number.isFinite(max) && max > min ? ((value - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, pct))}%`);
}

function updateRangeFills() {
  for (const el of qsa('input[type="range"]')) updateRangeFill(el);
}

function updateOutputs() {
  for (const el of qsa('[data-out]')) {
    const path = el.dataset.out;
    let v;
    if (path.startsWith('routing.')) v = getPath(state.routing, path.slice(8));
    else if (path.startsWith('style.')) v = getPath(state.style, path.slice(6));
    else if (path.startsWith('export.')) v = getPath(state.exportOpts, path.slice(7));
    else v = getPath(state.style, path);
    el.textContent = formatOutput(path, v);
  }
}

function updateConditional() {
  const style = state.style;
  const rules = {
    'route-color2': style.route.paint !== 'solid',
    'route-angle': style.route.paint === 'linear',
    'route-outline': !!style.route.outline,
    'route-glow': !!style.route.glow,
    'route-arrows': !!style.route.arrows,
    'cp-labels': !!style.cp.showLabels,
    'cp-halo': !!style.cp.halo,
    'map-custom': style.map.source === 'custom',
    'map-grid': !!style.map.grid,
    'title': !!style.title.show,
    'legend': !!style.legend.show,
    'export-bg': state.exportOpts.background === 'custom',
  };
  for (const el of qsa('[data-when]')) {
    const key = el.dataset.when;
    el.classList.toggle('hidden', !rules[key]);
  }
}

function syncAll() {
  renderThemes();
  syncCpCollapseButton();
  syncTrackMeta();
  syncStyleInputs();
  syncRoutingInputs();
  syncExportInputs();
  syncBoundsInputs();
  syncThemeCards();
  updateConditional();
  updateOutputs();
  updateRangeFills();
  refreshCpBadges();
  renderTrackSummary();
  renderRouteStats();
  renderWarnings();
  const miniEmpty = qs('.mini-empty');
  if (miniEmpty) miniEmpty.textContent = t('点击「预览导出」查看最终画面');
}

// ── Style changes ──────────────────────────────────────────────────────
function applyStyleChange(path) {
  updateOutputs();
  updateHexLabels();
  updateConditional();
  refreshCpBadges();
  syncCpToggleButton();
  syncMapControlButtons();
  const overlayOnly = path.startsWith('title.') || path.startsWith('legend.');
  clearTimeout(state.styleTimer);
  state.styleTimer = setTimeout(() => {
    if (overlayOnly) MapView.refreshOverlays();
    else MapView.setStyleOnly(state.style);
    if (state.activeTab === 'export') scheduleMiniPreview();
    saveSessionSoon();
  }, overlayOnly ? 30 : 55);
}

function setStyleValue(path, value) {
  setPath(state.style, path, value);
  applyStyleChange(path);
}

function setTheme(key) {
  const keep = {
    titleText: state.style.title.text,
    titleSub: state.style.title.sub,
    titleShow: state.style.title.show,
    legendShow: state.style.legend.show,
    mapSource: state.style.map.source,
    mapVisible: state.style.map.visible,
    cpVisible: state.style.cp.visible,
  };
  state.style = Style.applyTheme(key);
  state.style.theme = key;
  state.style.title.text = keep.titleText;
  state.style.title.sub = keep.titleSub;
  state.style.title.show = keep.titleShow;
  state.style.legend.show = keep.legendShow;
  state.style.map.visible = keep.mapVisible;
  state.style.cp.visible = keep.cpVisible !== false;
  if (keep.mapSource === 'custom' && state.base.customUrl) {
    state.style.map.source = 'custom';
    MapView.setBaseMap(state.base.customUrl, state.base.bounds, false);
  } else {
    state.style.map.source = 'builtin';
  }
  syncAll();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  if (state.activeTab === 'export') scheduleMiniPreview();
  const theme = Style.THEMES.find((item) => item.key === key);
  toast(t('已切换主题：{0}', I18n.themeName(theme) || key), 'ok');
}

function resetStyle() {
  state.style = Style.defaultVisual();
  state.base.bounds = { ...SA_BOUNDS };
  state.style.map.source = 'builtin';
  state.base.source = 'builtin';
  MapView.setBaseMap('assets/samap.png', SA_BOUNDS, false);
  syncAll();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t('样式已重置'), 'ok');
}

function toggleMapVisible() {
  state.style.map.visible = !state.style.map.visible;
  syncStyleInputs();
  updateConditional();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t(state.style.map.visible ? '底图已显示' : '底图已隐藏'));
}

function toggleGrid() {
  state.style.map.grid = !state.style.map.grid;
  syncStyleInputs();
  updateConditional();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t(state.style.map.grid ? '网格已显示' : '网格已隐藏'));
}

function toggleCpVisible() {
  const visible = state.style.cp.visible === false;
  state.style.cp.visible = visible;
  syncStyleInputs();
  updateConditional();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  if (state.activeTab === 'export') scheduleMiniPreview();
  toast(t(visible ? '已显示检查点' : '已隐藏检查点'));
}

// ── Base map ───────────────────────────────────────────────────────────
async function setBuiltinBase(fit = true) {
  state.base.source = 'builtin';
  state.base.bounds = { ...SA_BOUNDS };
  state.style.map.source = 'builtin';
  syncAll();
  await MapView.setBaseMap('assets/samap.png', SA_BOUNDS, fit);
  MapView.setStyleOnly(state.style);
}

async function loadCustomMap(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    toast(t('请选择图片文件'), 'error');
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    toast(t('图片太大（上限 30 MB）'), 'error');
    return;
  }
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('读取图片失败')));
    reader.readAsDataURL(file);
  });
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = () => reject(new Error(t('图片无法解码')));
    img.src = url;
  }).catch((err) => { toast(err.message, 'error'); throw err; });

  state.base.customUrl = url;
  state.base.customName = file.name;
  state.base.source = 'custom';
  state.style.map.source = 'custom';
  syncBoundsInputs();
  syncStyleInputs();
  updateConditional();
  await MapView.setBaseMap(url, state.base.bounds, true);
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t('已载入底图：{0}', file.name), 'ok');
}

async function applyCustomBounds() {
  const b = {
    minX: Number($('base-minx').value),
    maxX: Number($('base-maxx').value),
    minY: Number($('base-miny').value),
    maxY: Number($('base-maxy').value),
  };
  if (![b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) || b.maxX <= b.minX || b.maxY <= b.minY) {
    toast(t('范围无效：max 必须大于 min'), 'error');
    return;
  }
  if (!state.base.customUrl && state.style.map.source !== 'custom') {
    toast(t('请先选择一张自定义底图'), 'error');
    return;
  }
  state.base.bounds = b;
  const url = state.base.customUrl || 'assets/samap.png';
  if (state.base.customUrl) {
    state.style.map.source = 'custom';
    state.base.source = 'custom';
    syncStyleInputs();
    updateConditional();
  }
  await MapView.setBaseMap(url, b, true);
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t('底图范围已更新'), 'ok');
}

// ── File I/O ───────────────────────────────────────────────────────────
function openFilePicker() {
  $('file-input').click();
}

async function readTrackFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const track = Track.parseTrack(text, file.name);
    applyTrack(track, { fit: true, toast: t('已载入 {0} · {1} 个检查点', track.name, track.checkpoints.length) });
  } catch (err) {
    toast(t('载入失败：{0}', I18n.errorText(err)), 'error');
  }
}

async function loadSample(file, opts = {}) {
  if (!file) return;
  const url = /\.json$/i.test(file) ? `samples/${file}` : `samples/${file}.json`;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const track = Track.parseTrack(text, file);
    const sample = findSampleMeta(file);
    if (sample) {
      track.name = I18n.sampleName(sample);
      track.description = I18n.sampleNote(sample) || track.description;
      track.sampleFile = sample.file;
    }
    applyTrack(track, { fit: true, toast: opts.silent ? null : t('已载入示例：{0}', track.name) });
    for (const dlg of qsa('dialog[open]')) closeDialog(dlg);
  } catch (err) {
    toast(t('示例载入失败：{0}', I18n.errorText(err)), 'error');
  }
}

async function loadSamples() {
  let list = [];
  try {
    const res = await fetch('samples/index.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) list = data;
    }
  } catch { /* fall back below */ }
  if (!list.length) list = SAMPLE_FALLBACK;
  state.samples = list.filter((s) => s && typeof s.file === 'string');
  state.samplesLoading = false;
  renderSampleMenu();
  renderSampleChips();
}

function findSampleMeta(file) {
  const plain = String(file || '').replace(/\.json$/i, '');
  const pool = state.samples.length ? state.samples : SAMPLE_FALLBACK;
  return pool.find((s) => {
    const samplePlain = String(s.file || '').replace(/\.json$/i, '');
    return s.file === file || samplePlain === plain;
  }) || null;
}

function renderSampleMenu() {
  const el = $('sample-menu');
  if (!el) return;
  if (!state.samples.length) {
    el.innerHTML = `<div class="menu-loading">${escapeHtml(state.samplesLoading ? t('载入中…') : t('没有可用示例'))}</div>`;
    return;
  }
  el.innerHTML = state.samples.map((s) => `<button class="menu-item" data-sample="${escapeHtml(s.file)}" type="button">
    <span class="mi-dot"></span>
    <span class="mi-text"><span class="mi-name">${escapeHtml(I18n.sampleName(s) || s.file)}</span>
    <span class="mi-meta">${Number(s.cps) || '?'} CP${s.length ? ` · ${escapeHtml(s.length)}` : ''}</span></span>
  </button>`).join('');
}

function renderSampleChips() {
  const el = $('sample-chips');
  if (!el) return;
  if (!state.samples.length) {
    el.innerHTML = `<span class="muted">${escapeHtml(state.samplesLoading ? t('载入中…') : t('没有可用示例'))}</span>`;
    return;
  }
  el.innerHTML = state.samples.map((s) => `<button class="chip-btn" data-sample="${escapeHtml(s.file)}" type="button">
    <span class="sw" style="background:var(--accent)"></span>${escapeHtml(I18n.sampleName(s) || s.file)}
    <span class="meta">${Number(s.cps) || '?'} CP</span>
  </button>`).join('');
}

function saveTrackJSON() {
  if (!state.track) return toast(t('还没有赛道'), 'error');
  const data = Track.toJSON(state.track);
  const text = JSON.stringify(data, null, 2);
  downloadText(`${safeFileName(state.track.name)}.json`, text, 'application/json');
  toast(t('赛道 JSON 已保存'), 'ok');
}

// ── Export ─────────────────────────────────────────────────────────────
function buildExportOptions(overrides = {}) {
  const width = overrides.width || clamp(Math.round(Number(state.exportOpts.width) || 1920), 320, 4096);
  const height = overrides.height || clamp(Math.round(Number(state.exportOpts.height) || 1080), 320, 4096);
  return {
    track: state.track,
    route: state.route,
    style: state.style,
    map: MapView.getExportMap(),
    width,
    height,
    scope: state.exportOpts.scope,
    background: state.exportOpts.background,
    bgColor: state.exportOpts.bgColor,
    includeMap: state.exportOpts.includeMap !== false,
    currentBounds: MapView.getViewBounds(),
    ...overrides,
  };
}

function ensureExportReady() {
  if (!state.track || !state.track.checkpoints.length) {
    toast(t('先载入或创建一个赛道'), 'error');
    return false;
  }
  if (!state.route) {
    recomputeRoute({ fit: false, markers: false });
  }
  return true;
}

async function openPreview() {
  if (!ensureExportReady()) return;
  setSideStatus('busy', t('渲染预览…'));
  await nextFrame();
  try {
    const { canvas } = Exporter.renderCanvas(buildExportOptions());

    const url = canvas.toDataURL('image/png');
    $('preview-img').src = url;
    state.previewInfo = {
      width: canvas.width,
      height: canvas.height,
      includeMap: state.exportOpts.includeMap !== false,
    };
    updatePreviewLabels();
    openDialog($('preview-dialog'));
    updateMiniPreview(canvas);
    setSideStatus('ready', t('预览已生成'));
  } catch (err) {
    console.error(err);
    setSideStatus('error', t('预览失败'));
    toast(t('预览失败：{0}', I18n.errorText(err)), 'error');
  }
}

function updatePreviewLabels() {
  if (!state.previewInfo) return;
  const { width, height, includeMap } = state.previewInfo;
  const meta = $('preview-meta');
  const note = $('preview-note');
  if (meta) meta.textContent = `${width} × ${height} · ${t('PNG 预览')}`;
  if (note) note.textContent = includeMap ? t('底图已包含在导出中') : t('未包含底图');
}

function updateMiniPreview(canvas) {
  if (!canvas) return;
  const tw = 720;
  const th = Math.max(1, Math.round((canvas.height / canvas.width) * tw));
  const mini = document.createElement('canvas');
  mini.width = tw;
  mini.height = th;
  const ctx = mini.getContext('2d');
  ctx.fillStyle = '#0b0e15';
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(canvas, 0, 0, tw, th);
  const el = $('export-mini');
  if (el) {
    const type = state.exportOpts.background === 'transparent' ? 'image/png' : 'image/jpeg';
    el.innerHTML = `<img src="${mini.toDataURL(type, 0.84)}" alt="${escapeHtml(t('导出预览'))}">`;
  }
}

function scheduleMiniPreview(delay = 600) {
  if (state.activeTab !== 'export' || !state.track || !state.route) return;
  clearTimeout(state.miniTimer);
  state.miniTimer = setTimeout(async () => {
    if (state.activeTab !== 'export' || !state.track || !state.route) return;
    try {
      const w = 720;
      const h = Math.max(1, Math.round(720 * (state.exportOpts.height / state.exportOpts.width)));
      const { canvas } = Exporter.renderCanvas(buildExportOptions({ width: w, height: h }));
      updateMiniPreview(canvas);
    } catch (err) {
      console.warn('mini preview failed', err);
    }
  }, delay);
}

async function downloadPNG() {
  if (!ensureExportReady()) return;
  setSideStatus('busy', t('渲染 PNG…'));
  await nextFrame();
  try {
    const { canvas } = Exporter.renderCanvas(buildExportOptions());
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error(t('浏览器无法生成 PNG'));
    const name = `${safeFileName(state.track.name)}-${canvas.width}x${canvas.height}.png`;
    downloadBlob(blob, name);

    setSideStatus('ready', t('PNG 已导出'));
    toast(t('已导出 {0}', name), 'ok');
  } catch (err) {
    console.error(err);
    setSideStatus('error', t('导出失败'));
    toast(t('PNG 导出失败：{0}', I18n.errorText(err)), 'error');
  }
}

async function downloadSVG() {
  if (!ensureExportReady()) return;
  setSideStatus('busy', t('渲染 SVG…'));
  await nextFrame();
  try {
    const svg = Exporter.renderSVG(buildExportOptions());
    const name = `${safeFileName(state.track.name)}-${state.exportOpts.width}x${state.exportOpts.height}.svg`;
    downloadText(name, svg, 'image/svg+xml');
    setSideStatus('ready', t('SVG 已导出'));
    toast(t('已导出 {0}', name), 'ok');
  } catch (err) {
    console.error(err);
    setSideStatus('error', t('SVG 导出失败'));
    toast(t('SVG 导出失败：{0}', I18n.errorText(err)), 'error');
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
}

function downloadText(name, text, mime) {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), name);
}

// ── Graph ──────────────────────────────────────────────────────────────
async function loadGraph() {
  state.netState = 'loading';
  refreshNetStatus();
  setSideStatus('busy', t('载入路网数据…'));
  try {
    const res = await fetch('data/nodes.json', { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const t0 = performance.now();
    state.graph = Track.buildGraph(data);
    const ms = performance.now() - t0;
    state.netState = 'ok';
    state.graphMs = ms;

    refreshNetStatus();
    setSideStatus('ready', t('路网已就绪 · {0} ms', ms.toFixed(0)));
    if (state.track && (state.routing.mode === 'auto' || state.routing.mode === 'road')) {
      recomputeRoute({ fit: false, markers: true });
    }
  } catch (err) {
    console.error(err);

    state.graph = null;
    state.netState = 'error';
    refreshNetStatus();
    setSideStatus('error', t('路网载入失败'));
    toast(t('路网载入失败：{0}。仍可使用平滑 / 直线模式。', I18n.errorText(err)), 'error');
  }
}

function refreshNetStatus() {
  if (state.graph) {
    setNetStatus('ok', t('路网 {0} 节点', fmtInt(state.graph.stats.nodes)));
  } else if (state.netState === 'error') {
    setNetStatus('error', t('路网不可用'));
  } else {
    setNetStatus('muted', t('路网载入中…'));
  }
}

// ── Control binding ────────────────────────────────────────────────────
function bindUi() {
  document.addEventListener('input', (ev) => {
    if (ev.target instanceof HTMLInputElement && ev.target.type === 'range') updateRangeFill(ev.target);
  });

  // Tabs
  for (const tab of qsa('.tab')) {
    tab.addEventListener('click', () => {
      state.activeTab = tab.dataset.tab;
      for (const tabEl of qsa('.tab')) {
        const active = tabEl === tab;
        tabEl.classList.toggle('active', active);
        tabEl.setAttribute('aria-selected', String(active));
        tabEl.tabIndex = active ? 0 : -1;
      }
      for (const p of qsa('.pane')) p.classList.toggle('active', p.dataset.pane === tab.dataset.tab);
      if (state.activeTab === 'export') scheduleMiniPreview(120);
    });
  }
  $('tabs').addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const tabs = qsa('.tab');
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    let next = current;
    if (ev.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (ev.key === 'Home') next = 0;
    else next = tabs.length - 1;
    ev.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });

  // Language picker
  const langSel = $('lang-select');
  if (langSel) {
    langSel.value = I18n.getLanguage();
    langSel.addEventListener('change', (ev) => switchLanguage(ev.target.value));
  }

  // Appearance picker
  const themeSel = $('theme-select');
  if (themeSel) {
    themeSel.value = themeMode;
    themeSel.addEventListener('change', (ev) => setThemeMode(ev.target.value));
  }

  // Action buttons (delegated so sample buttons / dialogs work too)
  document.addEventListener('click', (ev) => {
    const sampleBtn = ev.target.closest('[data-sample]');
    if (sampleBtn) {
      ev.preventDefault();
      const file = sampleBtn.dataset.sample;
      if (file) {
        closeMenus();
        loadSample(file);
      }
      return;
    }
    const themeBtn = ev.target.closest('.theme-card[data-theme]');
    if (themeBtn) {
      setTheme(themeBtn.dataset.theme);
      return;
    }
    const actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      ev.preventDefault();
      runAction(actionBtn.dataset.action, actionBtn);
    }
  });

  // Close menus when clicking elsewhere
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('details')) closeMenus();
  });

  // Segmented controls
  for (const seg of qsa('.seg[data-bind]')) {
    seg.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-value]');
      if (!btn) return;
      onSeg(seg.dataset.bind, btn.dataset.value);
    });
  }

  // Style inputs
  for (const el of qsa('[data-style]')) {
    const path = el.dataset.style;
    const type = el.type;
    const evt = (type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      let v;
      if (type === 'checkbox') v = el.checked;
      else if (type === 'range' || type === 'number') v = Number(el.value);
      else v = el.value;
      if ((type === 'range' || type === 'number') && !Number.isFinite(v)) return;
      setPath(state.style, path, v);
      applyStyleChange(path);
      saveSessionSoon();
    });
  }

  // Routing / export numeric bindings
  for (const el of qsa('[data-bind]')) {
    if (el.classList.contains('seg')) continue;
    const path = el.dataset.bind;
    const evt = el.type === 'range' ? 'input' : 'change';
    el.addEventListener(evt, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'range' || el.type === 'number') v = Number(el.value);
      else v = el.value;
      if ((el.type === 'range' || el.type === 'number') && !Number.isFinite(v)) return;
      applyBinding(path, v);
    });
  }

  // Export inputs
  for (const el of qsa('[data-export]')) {
    const key = el.dataset.export;
    const evt = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      state.exportOpts[key] = el.type === 'checkbox' ? el.checked : el.value;
      syncExportInputs();
      updateConditional();
      saveSessionSoon();
      if (key === 'bgColor') updateHexLabels();
      scheduleMiniPreview();
    });
  }

  // Track meta
  const onMeta = () => {
    if (!state.track) return;
    state.track.name = $('track-name').value.trim() || t('未命名赛道');
    state.track.author = $('track-author').value.trim();
    updateDocumentTitle();
    MapView.refreshOverlays();
    saveSessionSoon();
  };
  for (const id of ['track-name', 'track-author']) {
    $(id).addEventListener('input', () => {
      clearTimeout(state.metaTimer);
      state.metaTimer = setTimeout(onMeta, 180);
    });
  }

  // File pickers
  $('file-input').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (file) readTrackFile(file);
  });
  $('map-input').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (file) loadCustomMap(file).catch(() => {});
  });

  // Export preset / size
  $('export-preset').addEventListener('change', (ev) => {
    const key = ev.target.value;
    if (key === 'custom') {
      state.exportOpts.preset = 'custom';
      syncExportInputs();
      scheduleMiniPreview();
      return;
    }
    const preset = Style.EXPORT_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    state.exportOpts.preset = key;
    state.exportOpts.width = preset.w;
    state.exportOpts.height = preset.h;
    syncExportInputs();
    saveSessionSoon();
    scheduleMiniPreview();
  });
  for (const id of ['export-width', 'export-height']) {
    $(id).addEventListener('change', () => {
      const w = clamp(Math.round(Number($('export-width').value) || 1920), 320, 4096);
      const h = clamp(Math.round(Number($('export-height').value) || 1080), 320, 4096);
      state.exportOpts.width = w;
      state.exportOpts.height = h;
      state.exportOpts.preset = 'custom';
      syncExportInputs();
      saveSessionSoon();
      scheduleMiniPreview();
    });
  }

  // CP list virtualization
  const cpListEl = $('cp-list');
  cpListEl.addEventListener('scroll', () => {
    if (state.cpScrollRaf) return;
    state.cpScrollRaf = requestAnimationFrame(() => {
      state.cpScrollRaf = 0;
      renderCpWindow();
    });
  });
  window.addEventListener('resize', () => renderCpWindow(true));

  // CP list delegation
  $('cp-list').addEventListener('click', (ev) => {
    if (ev.target.closest('input')) return;
    const row = ev.target.closest('.cp-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    const move = ev.target.closest('[data-move]');
    if (move) { moveCp(i, Number(move.dataset.move)); return; }
    if (ev.target.closest('[data-del]')) { deleteCp(i); return; }
    selectCp(i, { focus: true, scroll: false });
  });
  $('cp-list').addEventListener('change', (ev) => {
    const input = ev.target.closest('.cp-input');
    if (!input) return;
    const row = ev.target.closest('.cp-row');
    if (!row || !state.track) return;
    const i = Number(row.dataset.i);
    const axis = input.dataset.axis;
    const cp = state.track.checkpoints[i];
    if (!cp) return;
    if (input.value.trim() === '') {
      input.value = fmtCoord(cp[axis], 2);
      return;
    }
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    cp[axis] = value;
    if (axis === 'z') cp.hasZ = true;
    state.selected = i;
    recomputeRoute({ fit: false, markers: true, list: false });
    selectCp(i, { focus: false, scroll: false });
    saveSessionSoon();
  });
  $('cp-list').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.classList.contains('cp-input')) ev.target.blur();
    if ((ev.key === 'Enter' || ev.key === ' ') && !ev.target.closest('input, button')) {
      const row = ev.target.closest('.cp-row');
      if (!row) return;
      ev.preventDefault();
      selectCp(Number(row.dataset.i), { focus: true, scroll: false });
    }
  });
  $('cp-list').addEventListener('focusin', (ev) => {
    if (!ev.target.classList.contains('cp-row')) return;
    selectCp(Number(ev.target.dataset.i), { focus: true, scroll: false });
  });

  // Warning focus
  for (const id of ['track-warnings', 'route-warnings']) {
    $(id).addEventListener('click', (ev) => {
      const item = ev.target.closest('[data-focus]');
      if (!item) return;
      const i = Number(item.dataset.focus);
      if (Number.isInteger(i) && state.track && state.track.checkpoints[i]) {
        if (state.activeTab !== 'track') qs('.tab[data-tab="track"]').click();
        selectCp(i, { focus: true, scroll: true });
      }
    });
    $(id).addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const item = ev.target.closest('[data-focus]');
      if (!item) return;
      ev.preventDefault();
      item.click();
    });
  }

  // Copy help spec
  // (handled by the delegated [data-action="copy-spec"] listener)

  // Dialog outside click / close
  for (const dlg of qsa('dialog')) {
    dlg.addEventListener('click', (ev) => {
      if (ev.target === dlg) closeDialog(dlg);
    });
    dlg.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      closeDialog(dlg);
    });
  }
  for (const btn of qsa('[data-close-dialog]')) {
    btn.addEventListener('click', () => {
      const dlg = $(btn.dataset.closeDialog);
      if (dlg) closeDialog(dlg);
    });
  }

  // Drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (ev) => {
    if (!ev.dataTransfer || !Array.from(ev.dataTransfer.types || []).includes('Files')) return;
    dragDepth++;
    $('drop-overlay').classList.remove('hidden');
  });
  window.addEventListener('dragleave', () => {
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; $('drop-overlay').classList.add('hidden'); }
  });
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    $('drop-overlay').classList.add('hidden');
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!file) return;
    if (/^image\//.test(file.type)) loadCustomMap(file).catch(() => {});
    else readTrackFile(file);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (ev) => {
    const typing = ev.target instanceof Element && ev.target.matches('input, select, textarea, [contenteditable="true"]');
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o') {
      ev.preventDefault();
      openFilePicker();
      return;
    }
    if (ev.key === 'Escape') {
      if (state.addMode) {
        setAddMode(false);
        if (typing && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
        return;
      }
      if ($('preview-dialog').open) { closeDialog($('preview-dialog')); return; }
      if ($('help-dialog').open) { closeDialog($('help-dialog')); return; }
      if (!typing) {
        state.selected = -1;
        MapView.setSelected(-1);
        qsa('.cp-row').forEach((r) => r.classList.remove('is-selected'));
      }
      return;
    }
    if (qs('dialog[open]')) return;
    if (typing) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (state.selected >= 0 && state.track) { ev.preventDefault(); deleteCp(state.selected); }
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'f') { ev.preventDefault(); MapView.fitRoute(); }
    else if (k === 'g') { ev.preventDefault(); toggleGrid(); }
    else if (k === 'm') { ev.preventDefault(); toggleMapVisible(); }
    else if (k === 'c') { ev.preventDefault(); toggleCpVisible(); }
    else if ((k === '+' || k === '=') && !(ev.target instanceof Element && ev.target.closest('#map'))) {
      ev.preventDefault();
      toggleAddMode();
    }
  });
}

function onSeg(path, value) {
  if (path === 'routing.mode') {
    state.routing.mode = value;
    syncRoutingInputs();
    saveSessionSoon();
    recomputeRoute({ fit: true, markers: true });
    return;
  }
  if (path.startsWith('export.')) {
    const key = path.slice(7);
    state.exportOpts[key] = value;
    syncExportInputs();
    updateConditional();
    saveSessionSoon();
    scheduleMiniPreview();
    return;
  }
  if (path === 'style.map.source') {
    if (value === 'builtin') {
      setBuiltinBase(true);
    } else {
      if (state.base.customUrl) {
        state.style.map.source = 'custom';
        state.base.source = 'custom';
        syncStyleInputs();
        updateConditional();
        MapView.setBaseMap(state.base.customUrl, state.base.bounds, true).then(() => MapView.setStyleOnly(state.style));
        saveSessionSoon();
      } else {
        $('map-input').click();
      }
    }
    return;
  }
  if (path === 'style.route.paint') {
    state.style.route.paint = value;
    syncStyleInputs();
    updateConditional();
    applyStyleChange('route.paint');
    saveSessionSoon();
    return;
  }
  if (path === 'style.cp.shape') {
    state.style.cp.shape = value;
    syncStyleInputs();
    applyStyleChange('cp.shape');
    saveSessionSoon();
    return;
  }
  // generic style segmented control
  if (path.startsWith('style.')) {
    setPath(state.style, path.slice(6), value);
    syncStyleInputs();
    applyStyleChange(path.slice(6));
    saveSessionSoon();
  }
}

function applyBinding(path, value) {
  if (path.startsWith('routing.')) {
    const key = path.slice(8);
    state.routing[key] = value;
    if (key === 'closed' && state.track) {
      state.track.closed = !!value;
      Track.assignRoles(state.track);
      renderCpList();
    }
    syncRoutingInputs();
    saveSessionSoon();
    if (key === 'mode') recomputeRoute({ fit: true, markers: true });
    else scheduleRoute(key === 'snapRadius' ? 90 : 60, { markers: true });
    return;
  }
  if (path.startsWith('export.')) {
    state.exportOpts[path.slice(7)] = value;
    syncExportInputs();
    updateConditional();
    saveSessionSoon();
    scheduleMiniPreview();
    return;
  }
}

function runAction(action) {
  switch (action) {
    case 'open-json': openFilePicker(); break;
    case 'save-json': saveTrackJSON(); break;
    case 'new-track': newTrack(); break;
    case 'help': {
      openDialog($('help-dialog'));
      break;
    }
    case 'fit': MapView.fitRoute(); break;
    case 'add-cp': toggleAddMode(); break;
    case 'toggle-cp-list': toggleCpList(); break;
    case 'toggle-cp': toggleCpVisible(); break;
    case 'toggle-map': toggleMapVisible(); break;
    case 'toggle-grid': toggleGrid(); break;
    case 'recalc': recomputeRoute({ fit: false, markers: true }); break;
    case 'reset-style': resetStyle(); break;
    case 'upload-map': $('map-input').click(); break;
    case 'apply-bounds': applyCustomBounds(); break;
    case 'preview': openPreview(); break;
    case 'download-png': downloadPNG(); break;
    case 'download-svg': downloadSVG(); break;
    case 'copy-spec': copyText(SPEC_EXAMPLE); break;
    case 'load-sample': loadSample('los-santos-loop'); break;
    default: break;
  }
}

function closeMenus() {
  for (const d of qsa('details[open]')) d.removeAttribute('open');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('示例 JSON 已复制'), 'ok');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(t('示例 JSON 已复制'), 'ok'); }
    catch { toast(t('复制失败，请手动选择文本'), 'error'); }
    ta.remove();
  }
}

// ── Map handlers ───────────────────────────────────────────────────────
const mapHandlers = {
  onMapClick({ x, y }) {
    if (state.addMode) {
      addCpAt(x, y);
    } else {
      state.selected = -1;
      MapView.setSelected(-1);
      qsa('.cp-row').forEach((r) => r.classList.remove('is-selected'));
    }
  },
  onSelect(index) {
    if (state.track) selectCp(index, { focus: false, scroll: true });
  },
  onCpDragStart(index) {
    if (state.track) selectCp(index, { focus: false, scroll: false });
  },
  onCpDrag(index, x, y) {
    if (!state.track) return;
    const cp = state.track.checkpoints[index];
    if (!cp) return;
    cp.x = x;
    cp.y = y;
    cp.hasZ = true;
    const row = qs(`.cp-row[data-i="${index}"]`, $('cp-list'));
    if (row) {
      const xi = qs('.cp-input[data-axis="x"]', row);
      const yi = qs('.cp-input[data-axis="y"]', row);
      if (xi) xi.value = fmtCoord(x, 2);
      if (yi) yi.value = fmtCoord(y, 2);
    }
    scheduleRoute(70, { markers: false, fit: false });
  },
  onCpDragEnd(index, x, y) {
    if (!state.track) return;
    const cp = state.track.checkpoints[index];
    if (!cp) return;
    cp.x = x;
    cp.y = y;
    cp.hasZ = true;
    clearTimeout(state.routeTimer);
    selectCp(index, { focus: false, scroll: false });
    recomputeRoute({ fit: false, markers: true });
    saveSessionSoon();
  },
};

// ── Appearance ─────────────────────────────────────────────────────────
function normalizeThemeMode(mode) {
  return THEME_MODES.includes(mode) ? mode : 'system';
}

function readThemeMode() {
  try {
    return normalizeThemeMode(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

function resolvedTheme(mode) {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyThemeMode(mode, opts = {}) {
  themeMode = normalizeThemeMode(mode);
  const theme = resolvedTheme(themeMode);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f2f4f8' : '#0a0c12';
  const select = $('theme-select');
  if (select) select.value = themeMode;
  if (opts.persist) {
    try { localStorage.setItem(THEME_KEY, themeMode); } catch { /* storage may be unavailable */ }
  }
}

function initTheme() {
  applyThemeMode(readThemeMode());
  if (window.matchMedia) {
    themeMedia = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (themeMode === 'system') applyThemeMode('system');
    };
    if (themeMedia.addEventListener) themeMedia.addEventListener('change', onChange);
    else if (themeMedia.addListener) themeMedia.addListener(onChange);
  }
}

function setThemeMode(mode) {
  applyThemeMode(mode, { persist: true });
}

// ── Language ───────────────────────────────────────────────────────────
function updateDocumentTitle() {
  document.title = state.track
    ? `${state.track.name || t('未命名赛道')} · Track Layout`
    : t('Track Layout · 赛道路线图工作台');
  I18n.updateMeta();
}

function localizeSampleTrack() {
  if (!state.track || !state.track.sampleFile) return;
  const sample = findSampleMeta(state.track.sampleFile);
  if (!sample) return;
  const names = [sample.name, sample.nameEn].filter(Boolean);
  if (names.includes(state.track.name)) state.track.name = I18n.sampleName(sample);
  if (state.track.name) {
    const input = $('track-name');
    if (input && document.activeElement !== input) input.value = state.track.name;
  }
}

function localizeUntitledTrack() {
  if (!state.track) return;
  if (state.track.name === '未命名赛道' || state.track.name === 'Untitled track') {
    state.track.name = t('未命名赛道');
    const input = $('track-name');
    if (input && document.activeElement !== input) input.value = state.track.name;
  }
}

function refreshLanguage() {
  localizeSampleTrack();
  localizeUntitledTrack();
  updateDocumentTitle();
  refreshNetStatus();
  updatePreviewLabels();
  syncCpCollapseButton();
  renderThemes();
  renderSampleMenu();
  renderSampleChips();
  if (state.track) {
    recomputeRoute({ fit: false, markers: true, silent: true });
  } else {
    syncAll();
    renderCpList();
    renderWarnings();
    setSideStatus('ready', t('准备就绪'));
  }
  syncAll();
  if (state.activeTab === 'export') scheduleMiniPreview(120);
  saveSessionSoon();
}

function switchLanguage(lang) {
  I18n.setLanguage(lang, () => {
    const select = $('lang-select');
    if (select) select.value = I18n.getLanguage();
    refreshLanguage();
  });
}

// ── Boot ───────────────────────────────────────────────────────────────
async function boot() {
  I18n.setLanguage(I18n.detectLanguage());
  initTheme();
  if (location.protocol === 'file:') {
    setTimeout(() => toast(t('请通过 node server.js 启动本地服务器后访问，file:// 无法读取路网数据'), 'error'), 600);
  }
  const saved = restorePrefs();
  MapView.init(mapHandlers);
  MapView.setData({ track: null, route: null, style: state.style, selected: -1 });
  bindUi();
  renderThemes();
  syncAll();
  renderCpList();
  renderWarnings();
  renderSampleMenu();
  renderSampleChips();
  updateDocumentTitle();
  refreshNetStatus();
  setSideStatus('ready', t('准备就绪'));

  MapView.setBaseMap('assets/samap.png', SA_BOUNDS, false).then(() => {
    MapView.setStyleOnly(state.style);
    if (!state.track) MapView.fitBase();
  });

  loadGraph();
  loadSamples();

  const savedTrack = loadSessionTrack(saved);
  if (savedTrack) {
    applyTrack(savedTrack, { fit: true, silent: true });
  } else if (saved && saved.empty) {
    // The user explicitly created a blank track last time; keep it blank.
    $('empty-state').classList.remove('hidden');
    syncAll();
    renderCpList();
    renderWarnings();
    MapView.fitBase();
  } else {
    // First visit: show a ready-made example instead of an empty map.
    loadSample('los-santos-loop', { silent: true });
  }
  setSideStatus('ready', t('准备就绪'));
}

boot();
