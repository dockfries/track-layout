// Track Layout: application state and UI wiring.
'use strict';

const APP_KEY = 'track-layout:v1';
const THEME_KEY = 'track-layout:theme';
const THEME_MODES = ['system', 'dark', 'light'];
const SA_BOUNDS = { minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 };
const CP_ROW_HEIGHT = 78;
const CP_ROW_STEP = 84;
const CP_ROW_OVERSCAN = 3;
const WARN_ROW_HEIGHT = 48;
const WARN_ROW_STEP = 54;
const WARN_ROW_OVERSCAN = 3;
const WARN_VIRTUAL_THRESHOLD = 24;
const SAMPLE_ROW_HEIGHT = 48;
const SAMPLE_ROW_STEP = 52;
const SAMPLE_ROW_OVERSCAN = 3;
const SAMPLE_CHIP_LIMIT = 8;
const ROUTING_DEFAULTS = { snapRadius: 80, smooth: 45 };
const HISTORY_LIMIT = 50;
const PLAYBACK_BASE_MS = 14000;
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
  cpLocked: true,
  undoStack: [],
  redoStack: [],
  playback: { playing: false, progress: 0, speed: 1, raf: 0, lastTs: 0, path: null },
  graph: null,
  netState: 'loading',
  samples: [],
  samplesLoading: true,
  sampleQuery: '',
  sampleFiltered: [],
  sampleWindow: null,
  sampleActive: -1,
  sampleScrollRaf: 0,
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
  warnListCollapsed: false,
  routeWarnCollapsed: false,
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

function visibleRange(scrollTop, viewport, step, total, overscan = 3) {
  const start = Math.max(0, Math.floor(scrollTop / step) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / step) + overscan);
  return { start, end };
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
    auto: t("mode.auto"),
    road: t("mode.roadAStar"),
    spline: t("mode.spline"),
    straight: t("mode.straight"),
    point: t("mode.point"),
    empty: t("mode.empty"),
  }[mode] || mode;
}

// ── Toast / status ──────────────────────────────────────────────────────
const TOAST_MAX = 5;
const TOAST_QUEUE_MAX = 30;
const TOAST_EXIT_MS = 180;
const TOAST_STAGGER_MS = 240;
const toastQueue = [];
let toastDismissTimer = 0;
let toastLastRemovedAt = 0;

function toastDuration(kind) {
  return kind === 'error' ? 4600 : 2800;
}

function scheduleToastDismiss() {
  clearTimeout(toastDismissTimer);
  const stack = $('toast-stack');
  if (!stack) return;
  const first = stack.firstElementChild;
  if (!first) {
    drainToastQueue();
    return;
  }
  const elapsed = Date.now() - (first._createdAt || Date.now());
  const remaining = (first._duration || 2800) - elapsed;
  const afterPrevious = toastLastRemovedAt
    ? toastLastRemovedAt + TOAST_STAGGER_MS - Date.now()
    : 0;
  const wait = Math.max(0, remaining, afterPrevious);
  toastDismissTimer = setTimeout(() => {
    if (first.isConnected) removeToast(first);
  }, wait);
}

function spawnToast(item) {
  const stack = $('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast${item.kind ? ` ${item.kind}` : ''}`;
  el.textContent = item.message;
  el._createdAt = Date.now();
  el._duration = toastDuration(item.kind);
  stack.appendChild(el);
  requestAnimationFrame(() => {
    if (el.isConnected) el.classList.add('show');
  });
  scheduleToastDismiss();
}

function drainToastQueue() {
  const stack = $('toast-stack');
  if (!stack) return;
  while (stack.children.length < TOAST_MAX && toastQueue.length) {
    spawnToast(toastQueue.shift());
  }
}

function removeToast(el) {
  const stack = $('toast-stack');
  if (!stack || el !== stack.firstElementChild || el._removing) return;
  clearTimeout(toastDismissTimer);
  el._removing = true;
  el.classList.remove('show');
  el.classList.add('leaving');
  setTimeout(() => {
    el.remove();
    toastLastRemovedAt = Date.now();
    drainToastQueue();
    scheduleToastDismiss();
  }, TOAST_EXIT_MS);
}

function toast(message, kind = '') {
  const stack = $('toast-stack');
  if (!stack) return;
  if (stack.children.length >= TOAST_MAX) {
    if (toastQueue.length >= TOAST_QUEUE_MAX) toastQueue.shift();
    toastQueue.push({ message, kind });
    return;
  }
  spawnToast({ message, kind });
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
  state.cpLocked = typeof saved.cpLocked === 'boolean' ? saved.cpLocked : true;
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
      cpLocked: state.cpLocked,
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
  if (!opts.preserveHistory) clearHistory();
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
  if (state.playback) resetPlayback();
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
    syncPlaybackUI();
    setSideStatus('ready', t("status.ready"));
    return;
  }
  state.track.closed = !!state.routing.closed;
  Track.assignRoles(state.track);
  setSideStatus('busy', state.graph ? t("status.calculating") : t("status.calculatingGraph"));
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
    toast(t("error.routeFailed", I18n.errorText(err)), 'error');
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
  setSideStatus('ready', route.partial ? t("status.routeReadyPartial", km) : route.modeUsed === 'road' ? t("status.routeReady", km) : t("status.routeReady", modeLabel(route.modeUsed)));
  if (opts.fit) requestAnimationFrame(() => MapView.fitRoute());
  syncPlaybackUI();
  saveSessionSoon();
  if (state.activeTab === 'export') scheduleMiniPreview();
}

function scheduleRoute(delay = 120, opts = {}) {
  clearTimeout(state.routeTimer);
  state.routeTimer = setTimeout(() => {
    recomputeRoute({ fit: !!opts.fit, markers: opts.markers !== false });
  }, delay);
}

// ── Route playback animation ───────────────────────────────────────────
function buildPlaybackPath() {
  const pts = state.route && state.route.points;
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const xs = [pts[0].x];
  const ys = [pts[0].y];
  const cum = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const d = Math.hypot(p.x - xs[xs.length - 1], p.y - ys[ys.length - 1]);
    if (d < 0.05) continue;
    total += d;
    xs.push(p.x);
    ys.push(p.y);
    cum.push(total);
  }
  return xs.length >= 2 ? { xs, ys, cum, total } : null;
}

function playbackPoint(progress) {
  const pb = state.playback;
  const path = pb.path;
  if (!path) return null;
  const target = Math.max(0, Math.min(1, progress)) * path.total;
  let lo = 0, hi = path.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, Math.min(lo - 1, path.cum.length - 2));
  const span = path.cum[i + 1] - path.cum[i];
  const t = span > 0 ? (target - path.cum[i]) / span : 0;
  const x = path.xs[i] + (path.xs[i + 1] - path.xs[i]) * t;
  const y = path.ys[i] + (path.ys[i + 1] - path.ys[i]) * t;
  const angle = Math.atan2(-(path.ys[i + 1] - path.ys[i]), path.xs[i + 1] - path.xs[i]) * 180 / Math.PI;
  return { x, y, angle };
}

function updatePlaybackStatus() {
  const el = $('playback-status');
  const hudPct = $('playback-hud-pct');
  const hudFill = $('playback-hud-fill');
  const pb = state.playback;
  const pct = `${Math.round(pb.progress * 100)}%`;
  if (el) el.textContent = state.route ? pct : '—';
  if (hudPct) hudPct.textContent = pct;
  if (hudFill) hudFill.style.width = pct;
}

function syncPlaybackUI() {
  const pb = state.playback;
  const hasRoute = !!(state.route && state.route.points && state.route.points.length > 1);
  const finished = !pb.playing && pb.progress >= 1;
  const toggle = $('playback-toggle');
  const stop = $('playback-stop');
  if (toggle) {
    toggle.disabled = !hasRoute;
    toggle.title = t(finished ? 'playback.replay' : pb.playing ? 'playback.pause' : 'playback.play');
    toggle.setAttribute('aria-label', toggle.title);
  }
  if (stop) {
    stop.disabled = !hasRoute || (!pb.playing && pb.progress <= 0);
    stop.title = t('playback.stop');
    stop.setAttribute('aria-label', t('playback.stop'));
  }
  const label = $('playback-label');
  if (label) label.textContent = t(finished ? 'playback.replayShort' : pb.playing ? 'playback.pauseShort' : 'playback.playShort');
  const icon = $('playback-icon');
  if (icon) icon.setAttribute('href', `assets/icons/sprite.svg#i-${pb.playing ? 'pause' : 'play'}`);
  const hud = $('playback-hud');
  if (hud) {
    hud.classList.toggle('hidden', !hasRoute || (!pb.playing && pb.progress <= 0));
    const hudState = $('playback-hud-state');
    if (hudState) hudState.textContent = t(pb.playing ? 'playback.playing' : finished ? 'playback.finished' : 'playback.paused');
    const hudIcon = $('playback-hud-icon');
    if (hudIcon) hudIcon.setAttribute('href', `assets/icons/sprite.svg#i-${pb.playing ? 'pause' : 'play'}`);
    const hudToggle = hud.querySelector('[data-action="toggle-playback"]');
    if (hudToggle) {
      hudToggle.title = t(finished ? 'playback.replay' : pb.playing ? 'playback.pause' : 'playback.play');
      hudToggle.setAttribute('aria-label', hudToggle.title);
    }
    const hudStop = hud.querySelector('[data-action="stop-playback"]');
    if (hudStop) {
      hudStop.title = t('playback.stop');
      hudStop.setAttribute('aria-label', t('playback.stop'));
    }
  }
  const speed = $('playback-speed');
  if (speed) {
    speed.title = t('hint.playbackSpeedDefault');
    if (document.activeElement !== speed) speed.value = String(pb.speed);
    updateRangeFill(speed);
  }
  const out = $('playback-speed-out');
  if (out) out.textContent = `${Number(pb.speed).toFixed(1)}×`;
  updatePlaybackStatus();
}

function drawPlayback() {
  const point = playbackPoint(state.playback.progress);
  if (point) MapView.setPlaybackMarker(point);
}

function playbackTick(ts) {
  const pb = state.playback;
  if (!pb.playing) return;
  if (!pb.lastTs) pb.lastTs = ts;
  const delta = Math.min(120, Math.max(0, ts - pb.lastTs));
  pb.lastTs = ts;
  pb.progress = Math.min(1, pb.progress + (delta / PLAYBACK_BASE_MS) * pb.speed);
  drawPlayback();
  updatePlaybackStatus();
  if (pb.progress >= 1) {
    pb.playing = false;
    pb.raf = 0;
    syncPlaybackUI();
    return;
  }
  pb.raf = requestAnimationFrame(playbackTick);
}

function startPlayback() {
  const pb = state.playback;
  if (pb.playing) return;
  if (!state.route || !state.route.points || state.route.points.length < 2) {
    toast(t("cp.minTwo"), 'error');
    return;
  }
  pb.path = buildPlaybackPath();
  if (!pb.path) return;
  if (pb.progress >= 1) pb.progress = 0;
  pb.playing = true;
  pb.lastTs = 0;
  drawPlayback();
  syncPlaybackUI();
  cancelAnimationFrame(pb.raf);
  pb.raf = requestAnimationFrame(playbackTick);
}

function pausePlayback() {
  const pb = state.playback;
  pb.playing = false;
  cancelAnimationFrame(pb.raf);
  pb.raf = 0;
  syncPlaybackUI();
}

function resetPlayback() {
  const pb = state.playback;
  pb.playing = false;
  pb.progress = 0;
  pb.lastTs = 0;
  pb.path = null;
  cancelAnimationFrame(pb.raf);
  pb.raf = 0;
  MapView.clearPlaybackMarker();
  syncPlaybackUI();
}

function stopPlayback() {
  resetPlayback();
}

function togglePlayback() {
  if (state.playback.playing) pausePlayback();
  else startPlayback();
}

function bindPlayback() {
  const speed = $('playback-speed');
  if (!speed) return;
  speed.title = t("hint.playbackSpeedDefault");
  speed.addEventListener('input', () => {
    const value = Number(speed.value);
    if (!Number.isFinite(value)) return;
    state.playback.speed = Math.max(0.1, Math.min(4, value));
    syncPlaybackUI();
  });
  speed.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    state.playback.speed = 1;
    speed.value = '1';
    syncPlaybackUI();
  });
  syncPlaybackUI();
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
    [t("field.length"), r ? Track.formatDistance(r.length) : '–'],
    [t("field.checkpoints"), String(state.track.checkpoints.length)],
    [t("field.routing"), r ? modeLabel(r.modeUsed) : '–'],
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
  if (cp.role === Track.ROLE.START) return t("cp.start");
  if (cp.role === Track.ROLE.FINISH) return t("cp.finish");
  if (cp.role === Track.ROLE.LOOP) return t("cp.loop");
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
      text: t("cp.snapDistance", Math.round(dist)),
      className: `cp-snap ${offroad ? 'warn' : 'ok'}`,
      offroad,
    };
  }
  return { text: t("cp.notSnapped"), className: 'cp-snap warn', offroad: true };
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
        <button class="cp-btn" data-move="-1" title="${escapeHtml(t("action.moveUp"))}" ${i === 0 ? 'disabled' : ''}><svg class="ico" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#i-arrow-up"></use></svg></button>
        <button class="cp-btn" data-move="1" title="${escapeHtml(t("action.moveDown"))}" ${i === total - 1 ? 'disabled' : ''}><svg class="ico" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#i-arrow-down"></use></svg></button>
        <button class="cp-btn danger" data-del title="${escapeHtml(t("action.delete"))}"><svg class="ico" aria-hidden="true" focusable="false"><use href="assets/icons/sprite.svg#i-trash-2"></use></svg></button>
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
  const { start, end } = visibleRange(scrollTop, viewport, CP_ROW_STEP, total, CP_ROW_OVERSCAN);
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
    list.innerHTML = `<div class="cp-empty">${escapeHtml(t("cp.empty"))}</div>`;
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
  const label = t(state.cpListCollapsed ? 'cp.expand' : 'cp.collapse');
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

function captureTrackSnapshot() {
  return {
    track: state.track ? Track.toJSON(state.track) : null,
    sampleFile: state.track && state.track.sampleFile ? state.track.sampleFile : null,
    selected: state.selected,
  };
}

function syncHistoryButtons() {
  const undoBtn = qs('[data-action="undo"]');
  const redoBtn = qs('[data-action="redo"]');
  if (undoBtn) undoBtn.disabled = !state.undoStack.length;
  if (redoBtn) redoBtn.disabled = !state.redoStack.length;
}

function clearHistory() {
  state.undoStack.length = 0;
  state.redoStack.length = 0;
  syncHistoryButtons();
}

function pushUndoSnapshot() {
  state.undoStack.push(captureTrackSnapshot());
  if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
  state.redoStack.length = 0;
  syncHistoryButtons();
}

function restoreEmptyTrackState() {
  clearTimeout(state.routeTimer);
  resetPlayback();
  state.track = null;
  state.route = null;
  state.selected = -1;
  state.addMode = false;
  state.routing.closed = false;
  MapView.setAddMode(false);
  $('empty-state').classList.remove('hidden');
  $('track-name').value = '';
  $('track-author').value = '';
  $('closed-toggle').checked = false;
  MapView.setData({ track: null, route: null, style: state.style, selected: -1 });
  syncAll();
  renderCpList();
  renderWarnings();
  updateDocumentTitle();
  setSideStatus('ready', t("status.ready"));
  saveSessionSoon();
}

function restoreTrackSnapshot(snapshot) {
  if (!snapshot || !snapshot.track || !snapshot.track.checkpoints || !snapshot.track.checkpoints.length) {
    restoreEmptyTrackState();
    return;
  }
  clearTimeout(state.routeTimer);
  const track = Track.parseTrack(JSON.stringify(snapshot.track), snapshot.sampleFile || 'history.json');
  if (snapshot.sampleFile) track.sampleFile = snapshot.sampleFile;
  applyTrack(track, { fit: false, preserveHistory: true });
  const index = Number.isInteger(snapshot.selected)
    ? Math.min(snapshot.selected, track.checkpoints.length - 1)
    : -1;
  state.selected = index;
  MapView.setSelected(index);
  renderCpList();
  if (index >= 0) ensureCpRowVisible(index);
  saveSessionSoon();
}

function undo() {
  if (!state.undoStack.length) return;
  const current = captureTrackSnapshot();
  const previous = state.undoStack.pop();
  state.redoStack.push(current);
  restoreTrackSnapshot(previous);
  syncHistoryButtons();
  toast(t("cp.undo"), 'ok');
}

function redo() {
  if (!state.redoStack.length) return;
  const current = captureTrackSnapshot();
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  restoreTrackSnapshot(next);
  syncHistoryButtons();
  toast(t("cp.redo"), 'ok');
}

function syncCpLockButton() {
  const btn = qs('.map-btn[data-action="toggle-cp-lock"]');
  if (!btn) return;
  const label = t(state.cpLocked ? 'cp.unlockDrag' : 'cp.lockDrag');
  btn.classList.toggle('active', state.cpLocked);
  btn.setAttribute('aria-pressed', String(state.cpLocked));
  btn.title = label;
  btn.setAttribute('aria-label', label);
  const use = document.getElementById('cp-lock-use');
  if (use) use.setAttribute('href', `assets/icons/sprite.svg#i-${state.cpLocked ? 'lock' : 'lock-open'}`);
}

function toggleCpLock() {
  state.cpLocked = !state.cpLocked;
  MapView.setCpLocked(state.cpLocked);
  syncCpLockButton();
  saveSessionSoon();
  toast(t(state.cpLocked ? 'cp.locked' : 'cp.unlocked'), 'ok');
}

function moveCp(index, dir) {
  if (!state.track) return;
  const j = index + dir;
  if (j < 0 || j >= state.track.checkpoints.length) return;
  pushUndoSnapshot();
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
    toast(t("cp.keepAtLeastOne"), 'error');
    return;
  }
  pushUndoSnapshot();
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
    name: t("cp.untitled"),
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
  pushUndoSnapshot();
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
  toast(t("cp.added", cpRoleName(track.checkpoints[state.selected], state.selected)), 'ok');
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
  if (state.track && !confirm(t("cp.newConfirm"))) return;
  clearHistory();
  resetPlayback();
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
  setSideStatus('ready', t("status.ready"));
  saveSessionSoon();
  toast(t("cp.newBlank"));
}

async function clearLocalCache() {
  if (!confirm(t("dialog.clearCache"))) return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('track-layout:')) localStorage.removeItem(key);
    }
  } catch { /* private mode / disabled storage */ }
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch { /* cache storage may be unavailable */ }
  }
  location.reload();
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
        [t("field.routeLength"), Track.formatDistance(route.length)],
        [t("field.checkpointCount"), String(state.track.checkpoints.length)],
        [t("field.routePoints"), String(route.points.length)],
        [t("field.computeTime"), `${route.ms.toFixed(0)} ms`],
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
      chip.textContent = partial ? t("mode.roadAStarPartial") : modeLabel(route.modeUsed);
      const cls = partial ? 'chip-warn' : route.modeUsed === 'road' ? 'chip-ok' : route.modeUsed === 'spline' || route.modeUsed === 'straight' ? 'chip-warn' : 'chip-muted';
      chip.className = `chip ${cls}`;
    }
  }
  const time = $('route-time');
  if (time) time.textContent = route ? `${route.ms.toFixed(1)} ms · ${t("unit.points", route.points.length)}` : '';

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
    if (text) text.textContent = t("unit.segments", routed, total);
  } else {
    if (fill) fill.style.width = '0%';
    if (text) text.textContent = route && route.modeUsed !== 'point' ? t("status.roadGraphNotUsed") : '–';
  }
}

function warningItemHtml(w, index, total, virtual) {
  const text = I18n.warningText(w, state.track);
  const focus = Number.isInteger(w.index) ? ` data-focus="${w.index}"` : '';
  const interactive = focus ? ' role="button" tabindex="0"' : '';
  const style = virtual ? ` style="top:${index * WARN_ROW_STEP + 3}px;height:${WARN_ROW_HEIGHT}px"` : '';
  const position = virtual ? ` aria-posinset="${index + 1}" aria-setsize="${total}"` : '';
  return `<div class="warn-item ${w.level || 'warn'}"${style}${focus}${interactive}${position} title="${escapeHtml(text)}" aria-label="${escapeHtml(text)}"><span class="wi-ico">${w.level === 'info' ? 'i' : '!'}</span><span>${escapeHtml(text)}</span></div>`;
}

function renderWarnWindow(el, force = false) {
  if (!el || !el.classList.contains('virtual')) return;
  const items = el._warnItems || [];
  if (!items.length) return;
  const total = items.length;
  const viewport = el.clientHeight || Math.min(280, Math.max(160, window.innerHeight * 0.38));
  const scrollTop = el.scrollTop;
  const { start, end } = visibleRange(scrollTop, viewport, WARN_ROW_STEP, total, WARN_ROW_OVERSCAN);
  if (!force && el._warnWindow &&
      el._warnWindow.start === start && el._warnWindow.end === end && el._warnWindow.total === total) {
    return;
  }
  const rows = [];
  for (let i = start; i < end; i++) rows.push(warningItemHtml(items[i], i, total, true));
  el.innerHTML = `<div class="warn-list-spacer" style="height:${total * WARN_ROW_STEP}px">${rows.join('')}</div>`;
  el.scrollTop = scrollTop;
  el._warnWindow = { start, end, total };
}

function renderWarnList(el, items) {
  if (!el) return;
  const oldScroll = el.scrollTop;
  el._warnItems = items;
  el._warnWindow = null;
  const virtual = items.length > WARN_VIRTUAL_THRESHOLD;
  el.classList.toggle('virtual', virtual);
  if (!virtual) {
    el.innerHTML = items.map((w) => warningItemHtml(w, 0, items.length, false)).join('');
    el.scrollTop = 0;
    return;
  }
  renderWarnWindow(el, true);
  el.scrollTop = oldScroll;
}

function syncWarnCollapseButton() {
  const btn = $('warn-collapse');
  if (!btn) return;
  const label = t(state.warnListCollapsed ? 'warning.expand' : 'warning.collapse');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', String(!state.warnListCollapsed));
  btn.classList.toggle('is-collapsed', state.warnListCollapsed);
}

function setWarnListCollapsed(collapsed) {
  state.warnListCollapsed = !!collapsed;
  syncWarnCollapseButton();
  if (state.warnListCollapsed) {
    const el = $('track-warnings');
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('virtual');
      el._warnItems = [];
      el._warnWindow = null;
      el.innerHTML = '';
    }
  } else {
    const el = $('track-warnings');
    if (el) el.classList.remove('hidden');
    renderWarnings();
  }
}

function toggleWarnList() {
  setWarnListCollapsed(!state.warnListCollapsed);
}

function syncRouteWarnCollapseButton() {
  const btn = $('route-warn-collapse');
  if (!btn) return;
  const label = t(state.routeWarnCollapsed ? 'warning.expandRoute' : 'warning.collapseRoute');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', String(!state.routeWarnCollapsed));
  btn.classList.toggle('is-collapsed', state.routeWarnCollapsed);
}

function setRouteWarnCollapsed(collapsed) {
  state.routeWarnCollapsed = !!collapsed;
  syncRouteWarnCollapseButton();
  const el = $('route-warnings');
  if (state.routeWarnCollapsed) {
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('virtual');
      el._warnItems = [];
      el._warnWindow = null;
      el.innerHTML = '';
    }
  } else {
    if (el) el.classList.remove('hidden');
    renderWarnings();
  }
}

function toggleRouteWarnList() {
  setRouteWarnCollapsed(!state.routeWarnCollapsed);
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

  const empty = (el, text) => {
    el.classList.remove('virtual');
    el._warnItems = [];
    el._warnWindow = null;
    el.innerHTML = `<div class="warn-empty">${escapeHtml(text)}</div>`;
  };

  if (!state.track) {
    if (state.warnListCollapsed) {
      trackEl.classList.add('hidden');
      trackEl.classList.remove('virtual');
      trackEl._warnItems = [];
      trackEl._warnWindow = null;
      trackEl.innerHTML = '';
    } else {
      trackEl.classList.remove('hidden');
      empty(trackEl, t("warning.emptyTrack"));
    }
    if (state.routeWarnCollapsed) {
      routeEl.classList.add('hidden');
      routeEl.classList.remove('virtual');
      routeEl._warnItems = [];
      routeEl._warnWindow = null;
      routeEl.innerHTML = '';
    } else {
      routeEl.classList.remove('hidden');
      empty(routeEl, t("warning.emptyRoute"));
    }
    return;
  }
  if (state.warnListCollapsed) {
    trackEl.classList.add('hidden');
    trackEl.classList.remove('virtual');
    trackEl._warnItems = [];
    trackEl._warnWindow = null;
    trackEl.innerHTML = '';
  } else {
    trackEl.classList.remove('hidden');
    if (all.length) renderWarnList(trackEl, all);
    else empty(trackEl, t("warning.noIssues"));
  }
  if (state.routeWarnCollapsed) {
    routeEl.classList.add('hidden');
    routeEl.classList.remove('virtual');
    routeEl._warnItems = [];
    routeEl._warnWindow = null;
    routeEl.innerHTML = '';
    return;
  }
  routeEl.classList.remove('hidden');
  const routeOnly = (state.route && state.route.warnings) || [];
  if (routeOnly.length) {
    renderWarnList(routeEl, routeOnly);
  } else if (state.route && state.route.modeUsed === 'road') {
    empty(routeEl, t("warning.allSegmentsRoad"));
  } else {
    empty(routeEl, t("warning.usingNoGraph", modeLabel(state.route ? state.route.modeUsed : 'spline')));
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
      auto: t("hint.mode.auto"),
      road: t("hint.mode.road"),
      spline: t("hint.mode.spline"),
      straight: t("hint.mode.straight"),
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
      ? t("hint.export.svg")
      : t("hint.export.png");
  }
  const note = $('export-note');
  if (note) {
    note.textContent = state.exportOpts.format === 'svg'
      ? t("hint.export.svgMap")
      : t("hint.export.redraw");
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
  if (name) name.textContent = state.base.customUrl ? (state.base.customName || t("label.customImage")) : t("label.notSelected");
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
  if (path === 'style.route.arrowSize' || path === 'style.title.size' ||
      path === 'style.title.titleSize' || path === 'style.title.subSize') return `${Number(v).toFixed(1)}×`;
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

function rangePath(range) {
  if (range.dataset.bind) return range.dataset.bind;
  if (range.dataset.style) return `style.${range.dataset.style}`;
  return '';
}

function defaultRangeValue(path) {
  if (path.startsWith('routing.')) return ROUTING_DEFAULTS[path.slice(8)];
  if (path.startsWith('style.')) {
    const defaults = Style.applyTheme(state.style.theme);
    return getPath(defaults, path.slice(6));
  }
  return undefined;
}

function resetRangeToDefault(range) {
  const path = rangePath(range);
  const value = defaultRangeValue(path);
  if (value === undefined || value === null) return;
  range.value = String(value);
  range.dispatchEvent(new Event('input', { bubbles: true }));
}

function findRangeForOutput(output) {
  const path = output.dataset.out;
  return qsa('input[type="range"]').find((range) => rangePath(range) === path) || null;
}

function syncRangeHelperLabels() {
  for (const range of qsa('input[type="range"]')) {
    if (!rangePath(range)) continue;
    range.title = t("hint.sliderDefault");
  }
  for (const output of qsa('[data-out]')) {
    if (!findRangeForOutput(output)) continue;
    output.tabIndex = 0;
    output.setAttribute('role', 'button');
    output.title = t("hint.numericEdit");
    const label = output.closest('.field-line')?.querySelector('label')?.textContent.trim();
    output.setAttribute('aria-label', label ? `${label} · ${t("aria.numericInput")}` : t("aria.numericInput"));
  }
}

function startOutputEdit(output) {
  if (!output || output.hidden || output._editing) return;
  const range = findRangeForOutput(output);
  if (!range) return;
  output._editing = true;
  const editor = document.createElement('input');
  editor.type = 'text';
  editor.className = 'out-edit';
  editor.inputMode = 'decimal';
  editor.autocomplete = 'off';
  editor.spellcheck = false;
  editor.value = range.value;
  editor.setAttribute('aria-label', output.getAttribute('aria-label') || t("aria.numericInput"));
  output.hidden = true;
  output.after(editor);

  let closed = false;
  const invalidMessage = () => t("error.valueRange", range.min, range.max);

  const close = (focusOutput) => {
    if (closed) return;
    closed = true;
    output._editing = false;
    editor.remove();
    output.hidden = false;
    updateOutputs();
    if (focusOutput) output.focus();
  };

  const commit = (fromBlur) => {
    if (closed) return false;
    const raw = editor.value.trim().replace(',', '.');
    const value = Number(raw);
    const min = Number(range.min);
    const max = Number(range.max);
    const step = Number(range.step) || 1;
    if (!Number.isFinite(value) || value < min || value > max) {
      if (fromBlur) {
        close(false);
        toast(invalidMessage(), 'error');
        return false;
      }
      editor.classList.add('is-invalid');
      editor.setAttribute('aria-invalid', 'true');
      toast(invalidMessage(), 'error');
      editor.focus();
      editor.select();
      return false;
    }
    const snapped = Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step));
    range.value = String(Number(snapped.toFixed(6)));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    close(!fromBlur);
    return true;
  };

  editor.addEventListener('input', () => {
    editor.classList.remove('is-invalid');
    editor.removeAttribute('aria-invalid');
  });
  editor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commit(false);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      close(true);
    }
  });
  editor.addEventListener('blur', () => {
    if (!closed) commit(true);
  });
  editor.focus();
  editor.select();
}

function bindRangeInteractions() {
  for (const range of qsa('input[type="range"]')) {
    if (!rangePath(range)) continue;
    range.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      resetRangeToDefault(range);
    });
  }
  for (const output of qsa('[data-out]')) {
    if (!findRangeForOutput(output)) continue;
    output.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      startOutputEdit(output);
    });
    output.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      startOutputEdit(output);
    });
  }
  syncRangeHelperLabels();
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
  syncWarnCollapseButton();
  syncRouteWarnCollapseButton();
  syncCpLockButton();
  syncHistoryButtons();
  syncPlaybackUI();
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
  if (miniEmpty) miniEmpty.textContent = t("hint.preview");
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
    titleSize: state.style.title.size,
    titleScale: state.style.title.titleSize,
    subScale: state.style.title.subSize,
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
  state.style.title.size = keep.titleSize;
  state.style.title.titleSize = keep.titleScale;
  state.style.title.subSize = keep.subScale;
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
  toast(t("toast.themeChanged", I18n.themeName(theme) || key), 'ok');
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
  toast(t("toast.styleReset"), 'ok');
}

function toggleMapVisible() {
  state.style.map.visible = !state.style.map.visible;
  syncStyleInputs();
  updateConditional();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t(state.style.map.visible ? 'toast.mapShown' : 'toast.mapHidden'));
}

function toggleGrid() {
  state.style.map.grid = !state.style.map.grid;
  syncStyleInputs();
  updateConditional();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  toast(t(state.style.map.grid ? 'toast.gridShown' : 'toast.gridHidden'));
}

function toggleCpVisible() {
  const visible = state.style.cp.visible === false;
  state.style.cp.visible = visible;
  syncStyleInputs();
  updateConditional();
  MapView.setStyleOnly(state.style);
  saveSessionSoon();
  if (state.activeTab === 'export') scheduleMiniPreview();
  toast(t(visible ? 'toast.cpShown' : 'toast.cpHidden'));
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
    toast(t("error.imageFile"), 'error');
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    toast(t("error.imageTooLarge"), 'error');
    return;
  }
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t("error.readImage")));
    reader.readAsDataURL(file);
  });
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = () => reject(new Error(t("error.imageDecode")));
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
  toast(t("toast.mapLoaded", file.name), 'ok');
}

async function applyCustomBounds() {
  const b = {
    minX: Number($('base-minx').value),
    maxX: Number($('base-maxx').value),
    minY: Number($('base-miny').value),
    maxY: Number($('base-maxy').value),
  };
  if (![b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) || b.maxX <= b.minX || b.maxY <= b.minY) {
    toast(t("error.boundsInvalid"), 'error');
    return;
  }
  if (!state.base.customUrl && state.style.map.source !== 'custom') {
    toast(t("error.customMapFirst"), 'error');
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
  toast(t("toast.mapBoundsUpdated"), 'ok');
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
    applyTrack(track, { fit: true, toast: t("cp.loaded", track.name, track.checkpoints.length) });
  } catch (err) {
    toast(t("error.load", I18n.errorText(err)), 'error');
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
    applyTrack(track, { fit: true, toast: opts.silent ? null : t("sample.loaded", track.name) });
    for (const dlg of qsa('dialog[open]')) closeDialog(dlg);
  } catch (err) {
    toast(t("error.sampleLoad", I18n.errorText(err)), 'error');
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

function normalizeSampleText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isSubsequence(token, text) {
  let pos = 0;
  for (const ch of token) {
    pos = text.indexOf(ch, pos);
    if (pos < 0) return false;
    pos += 1;
  }
  return true;
}

function sampleFieldScore(text, token) {
  if (!text) return -Infinity;
  const at = text.indexOf(token);
  if (at === 0) return 120;
  if (at > 0) return 90 - Math.min(at, 50);
  return isSubsequence(token, text) ? 24 : -Infinity;
}

function filterSampleList(query) {
  const q = normalizeSampleText(query).trim();
  if (!q) return state.samples.slice();
  const tokens = q.split(/\s+/).filter(Boolean);
  const ranked = [];
  state.samples.forEach((sample, order) => {
    const fields = [
      { text: normalizeSampleText(I18n.sampleName(sample) || sample.file), weight: 4 },
      { text: normalizeSampleText(sample.name), weight: 3 },
      { text: normalizeSampleText(sample.nameEn), weight: 3 },
      { text: normalizeSampleText(I18n.sampleNote(sample)), weight: 1.2 },
      { text: normalizeSampleText(sample.note), weight: 1 },
      { text: normalizeSampleText(sample.noteEn), weight: 1 },
      { text: normalizeSampleText(sample.file), weight: 2 },
      { text: normalizeSampleText(`${sample.cps || ''} ${sample.length || ''}`), weight: 1 },
    ];
    let score = 0;
    for (const token of tokens) {
      let best = -Infinity;
      for (const field of fields) {
        if (!field.text) continue;
        const current = sampleFieldScore(field.text, token);
        if (current > -Infinity) best = Math.max(best, current * field.weight);
      }
      if (!Number.isFinite(best)) return;
      score += best;
    }
    ranked.push({ sample, order, score });
  });
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked.map((entry) => entry.sample);
}

function sampleRowHtml(sample, index, total) {
  const name = I18n.sampleName(sample) || sample.file;
  const note = I18n.sampleNote(sample) || sample.note || '';
  const meta = `${Number(sample.cps) || '?'} CP${sample.length ? ` · ${escapeHtml(sample.length)}` : ''}`;
  const active = index === state.sampleActive;
  return `<button class="menu-item sample-item${active ? ' is-active' : ''}" data-sample="${escapeHtml(sample.file)}" id="sample-opt-${index}" role="option" aria-selected="${active}" aria-posinset="${index + 1}" aria-setsize="${total}" tabindex="-1" style="top:${index * SAMPLE_ROW_STEP + 2}px;height:${SAMPLE_ROW_HEIGHT}px" type="button" title="${escapeHtml(note)}">
    <span class="mi-dot"></span>
    <span class="mi-text"><span class="mi-name">${escapeHtml(name)}</span>
    <span class="mi-meta">${meta}</span></span>
  </button>`;
}

function renderSampleWindow(force = false) {
  const list = $('sample-menu');
  if (!list) return;
  const items = state.sampleFiltered;
  if (!items.length) return;
  const total = items.length;
  const viewport = Math.max(
    list.clientHeight || 0,
    Math.min(420, Math.max(160, window.innerHeight * 0.55))
  );
  const scrollTop = list.scrollTop;
  const { start, end } = visibleRange(scrollTop, viewport, SAMPLE_ROW_STEP, total, SAMPLE_ROW_OVERSCAN);
  if (!force && state.sampleWindow &&
      state.sampleWindow.start === start && state.sampleWindow.end === end && state.sampleWindow.total === total) {
    return;
  }
  const rows = [];
  for (let i = start; i < end; i++) rows.push(sampleRowHtml(items[i], i, total));
  list.innerHTML = `<div class="sample-list-spacer" style="height:${total * SAMPLE_ROW_STEP}px">${rows.join('')}</div>`;
  list.scrollTop = scrollTop;
  state.sampleWindow = { start, end, total };
}

function updateSampleFooter() {
  const footer = $('sample-footer');
  if (!footer) return;
  if (state.samplesLoading) {
    footer.textContent = '';
  } else if (state.sampleQuery) {
    footer.textContent = t("sample.countFiltered", state.sampleFiltered.length, state.samples.length);
  } else {
    footer.textContent = t("sample.count", state.samples.length);
  }
}

function updateSampleClearButton() {
  const clear = $('sample-search-clear');
  if (clear) clear.classList.toggle('hidden', !state.sampleQuery);
}

function renderSampleMenu(opts = {}) {
  const list = $('sample-menu');
  if (!list) return;
  state.sampleFiltered = filterSampleList(state.sampleQuery);
  state.sampleWindow = null;
  if (opts.resetScroll) list.scrollTop = 0;
  updateSampleClearButton();
  if (!state.samples.length) {
    list.innerHTML = `<div class="menu-loading">${escapeHtml(state.samplesLoading ? t("common.loading") : t("sample.none"))}</div>`;
    state.sampleFiltered = [];
    updateSampleFooter();
    return;
  }
  if (!state.sampleFiltered.length) {
    list.innerHTML = `<div class="sample-empty">${escapeHtml(t("sample.noMatch"))}</div>`;
    updateSampleFooter();
    return;
  }
  renderSampleWindow(true);
  updateSampleFooter();
}

function resetSampleSearch() {
  state.sampleQuery = '';
  state.sampleActive = -1;
  state.sampleWindow = null;
  const input = $('sample-search');
  if (input) {
    input.value = '';
    input.removeAttribute('aria-activedescendant');
  }
  updateSampleClearButton();
}

function openSamplesMenu() {
  const menu = $('samples-menu');
  if (!menu) return;
  menu.open = true;
  renderSampleMenu();
  requestAnimationFrame(() => {
    const input = $('sample-search');
    if (input) input.focus();
  });
}

function setSampleActive(index) {
  const total = state.sampleFiltered.length;
  if (!total) {
    state.sampleActive = -1;
    return;
  }
  state.sampleActive = ((index % total) + total) % total;
  const list = $('sample-menu');
  if (list) {
    const top = state.sampleActive * SAMPLE_ROW_STEP;
    const viewHeight = list.clientHeight || Math.min(420, Math.max(160, window.innerHeight * 0.55));
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 3);
    else if (top + SAMPLE_ROW_STEP > list.scrollTop + viewHeight) {
      list.scrollTop = Math.max(0, top + SAMPLE_ROW_STEP - viewHeight + 3);
    }
    renderSampleWindow(true);
  }
  const input = $('sample-search');
  if (input) input.setAttribute('aria-activedescendant', `sample-opt-${state.sampleActive}`);
}

function renderSampleChips() {
  const el = $('sample-chips');
  if (!el) return;
  if (!state.samples.length) {
    el.innerHTML = `<span class="muted">${escapeHtml(state.samplesLoading ? t("common.loading") : t("sample.none"))}</span>`;
    return;
  }
  const shown = state.samples.slice(0, SAMPLE_CHIP_LIMIT);
  let html = shown.map((s) => `<button class="chip-btn" data-sample="${escapeHtml(s.file)}" type="button">
    <span class="sw" style="background:var(--accent)"></span>${escapeHtml(I18n.sampleName(s) || s.file)}
    <span class="meta">${Number(s.cps) || '?'} CP</span>
  </button>`).join('');
  if (state.samples.length > SAMPLE_CHIP_LIMIT) {
    html += `<button class="chip-btn chip-more" data-action="open-samples-menu" type="button">${escapeHtml(t("sample.all", state.samples.length))}</button>`;
  }
  el.innerHTML = html;
}

function saveTrackJSON() {
  if (!state.track) return toast(t("status.noTrack"), 'error');
  const data = Track.toJSON(state.track);
  const text = JSON.stringify(data, null, 2);
  downloadText(`${safeFileName(state.track.name)}.json`, text, 'application/json');
  toast(t("toast.trackSaved"), 'ok');
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
    toast(t("error.loadTrackFirst"), 'error');
    return false;
  }
  if (!state.route) {
    recomputeRoute({ fit: false, markers: false });
  }
  return true;
}

async function openPreview() {
  if (!ensureExportReady()) return;
  setSideStatus('busy', t("status.renderingPreview"));
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
    setSideStatus('ready', t("status.previewReady"));
  } catch (err) {
    console.error(err);
    setSideStatus('error', t("status.previewFailed"));
    toast(t("error.preview", I18n.errorText(err)), 'error');
  }
}

function updatePreviewLabels() {
  if (!state.previewInfo) return;
  const { width, height, includeMap } = state.previewInfo;
  const meta = $('preview-meta');
  const note = $('preview-note');
  if (meta) meta.textContent = `${width} × ${height} · ${t("label.pngPreview")}`;
  if (note) note.textContent = includeMap ? t("label.mapIncluded") : t("label.mapExcluded");
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
    el.innerHTML = `<img src="${mini.toDataURL(type, 0.84)}" alt="${escapeHtml(t("label.exportPreview"))}">`;
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
  setSideStatus('busy', t("status.renderingPng"));
  await nextFrame();
  try {
    const { canvas } = Exporter.renderCanvas(buildExportOptions());
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error(t("error.pngCreate"));
    const name = `${safeFileName(state.track.name)}-${canvas.width}x${canvas.height}.png`;
    downloadBlob(blob, name);

    setSideStatus('ready', t("status.pngExported"));
    toast(t("toast.exported", name), 'ok');
  } catch (err) {
    console.error(err);
    setSideStatus('error', t("status.exportFailed"));
    toast(t("error.pngExport", I18n.errorText(err)), 'error');
  }
}

async function downloadSVG() {
  if (!ensureExportReady()) return;
  setSideStatus('busy', t("status.renderingSvg"));
  await nextFrame();
  try {
    const svg = Exporter.renderSVG(buildExportOptions());
    const name = `${safeFileName(state.track.name)}-${state.exportOpts.width}x${state.exportOpts.height}.svg`;
    downloadText(name, svg, 'image/svg+xml');
    setSideStatus('ready', t("status.svgExported"));
    toast(t("toast.exported", name), 'ok');
  } catch (err) {
    console.error(err);
    setSideStatus('error', t("status.svgExportFailed"));
    toast(t("error.svgExport", I18n.errorText(err)), 'error');
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
  setSideStatus('busy', t("status.loadingRoadGraphData"));
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
    setSideStatus('ready', t("status.roadGraphReady", ms.toFixed(0)));
    if (state.track && (state.routing.mode === 'auto' || state.routing.mode === 'road')) {
      recomputeRoute({ fit: false, markers: true });
    }
  } catch (err) {
    console.error(err);

    state.graph = null;
    state.netState = 'error';
    refreshNetStatus();
    setSideStatus('error', t("status.roadGraphFailed"));
    toast(t("error.roadGraphFailed", I18n.errorText(err)), 'error');
  }
}

function refreshNetStatus() {
  if (state.graph) {
    setNetStatus('ok', t("status.roadGraphNodes", fmtInt(state.graph.stats.nodes)));
  } else if (state.netState === 'error') {
    setNetStatus('error', t("status.roadGraphUnavailable"));
  } else {
    setNetStatus('muted', t("status.loadingRoadGraph"));
  }
}

// ── Control binding ────────────────────────────────────────────────────
function bindUi() {
  let viewportResizeTimer = 0;
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

  // Sample search / virtual dropdown
  const samplesMenu = $('samples-menu');
  const sampleSearch = $('sample-search');
  if (samplesMenu && sampleSearch) {
    samplesMenu.addEventListener('toggle', () => {
      sampleSearch.setAttribute('aria-expanded', String(samplesMenu.open));
      if (samplesMenu.open) {
        renderSampleMenu();
        requestAnimationFrame(() => sampleSearch.focus());
      } else {
        resetSampleSearch();
      }
    });
    sampleSearch.addEventListener('input', () => {
      state.sampleQuery = sampleSearch.value;
      state.sampleActive = -1;
      sampleSearch.removeAttribute('aria-activedescendant');
      renderSampleMenu({ resetScroll: true });
    });
    sampleSearch.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!state.sampleFiltered.length) return;
        if (state.sampleActive < 0) setSampleActive(ev.key === 'ArrowDown' ? 0 : state.sampleFiltered.length - 1);
        else setSampleActive(state.sampleActive + (ev.key === 'ArrowDown' ? 1 : -1));
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        const sample = state.sampleFiltered[state.sampleActive >= 0 ? state.sampleActive : 0];
        if (sample) {
          closeMenus();
          loadSample(sample.file);
        }
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (state.sampleQuery) {
          sampleSearch.value = '';
          state.sampleQuery = '';
          state.sampleActive = -1;
          sampleSearch.removeAttribute('aria-activedescendant');
          renderSampleMenu({ resetScroll: true });
          sampleSearch.focus();
        } else {
          samplesMenu.open = false;
          sampleSearch.blur();
          const summary = qs('summary', samplesMenu);
          if (summary) summary.focus();
        }
      }
    });
    const clearSearch = $('sample-search-clear');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        sampleSearch.value = '';
        state.sampleQuery = '';
        state.sampleActive = -1;
        sampleSearch.removeAttribute('aria-activedescendant');
        renderSampleMenu({ resetScroll: true });
        sampleSearch.focus();
      });
    }
    $('sample-menu').addEventListener('scroll', () => {
      if (state.sampleScrollRaf) return;
      state.sampleScrollRaf = requestAnimationFrame(() => {
        state.sampleScrollRaf = 0;
        renderSampleWindow();
      });
    });
  }

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
    if (ev.target.closest('details')) return;
    if (ev.target.closest('[data-action="open-samples-menu"]')) return;
    closeMenus();
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
    state.track.name = $('track-name').value.trim() || t("cp.untitled");
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
  window.addEventListener('resize', () => {
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer = setTimeout(() => {
      renderCpWindow(true);
      renderWarnWindow($('track-warnings'), true);
      renderWarnWindow($('route-warnings'), true);
      renderSampleWindow(true);
      const map = MapView.map();
      if (map) map.invalidateSize({ pan: false });
      requestAnimationFrame(() => {
        if (state.track) MapView.fitRoute();
        else MapView.fitBase();
      });
    }, 180);
  });

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
    if (Number(cp[axis]) !== value) pushUndoSnapshot();
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
    const warnEl = $(id);
    warnEl.addEventListener('scroll', () => {
      if (warnEl._warnRaf) return;
      warnEl._warnRaf = requestAnimationFrame(() => {
        warnEl._warnRaf = 0;
        renderWarnWindow(warnEl);
      });
    });
    warnEl.addEventListener('click', (ev) => {
      const item = ev.target.closest('[data-focus]');
      if (!item) return;
      const i = Number(item.dataset.focus);
      if (Number.isInteger(i) && state.track && state.track.checkpoints[i]) {
        if (state.activeTab !== 'track') qs('.tab[data-tab="track"]').click();
        selectCp(i, { focus: true, scroll: true });
      }
    });
    warnEl.addEventListener('keydown', (ev) => {
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
  bindRangeInteractions();
  bindPlayback();

  document.addEventListener('keydown', (ev) => {
    const typing = ev.target instanceof Element && ev.target.matches('input, select, textarea, [contenteditable="true"]');
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o') {
      ev.preventDefault();
      openFilePicker();
      return;
    }
    if (ev.key === 'Escape') {
      if ($('samples-menu') && $('samples-menu').open) { closeMenus(); return; }
      if (state.addMode) {
        setAddMode(false);
        if (typing && ev.target && typeof ev.target.blur === 'function') ev.target.blur();
        return;
      }
      if ($('preview-dialog').open) { closeDialog($('preview-dialog')); return; }
      if ($('help-dialog').open) { closeDialog($('help-dialog')); return; }
      if ($('shortcuts-dialog').open) { closeDialog($('shortcuts-dialog')); return; }
      if (!typing) {
        state.selected = -1;
        MapView.setSelected(-1);
        qsa('.cp-row').forEach((r) => r.classList.remove('is-selected'));
      }
      return;
    }
    if (qs('dialog[open]')) return;
    if (typing) return;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'y') {
      ev.preventDefault();
      redo();
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (state.selected >= 0 && state.track) { ev.preventDefault(); deleteCp(state.selected); }
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === '?') {
      ev.preventDefault();
      openDialog($('shortcuts-dialog'));
      return;
    }
    const k = ev.key.toLowerCase();
    if (k === 'f') { ev.preventDefault(); MapView.fitRoute(); }
    else if (k === 'g') { ev.preventDefault(); toggleGrid(); }
    else if (k === 'm') { ev.preventDefault(); toggleMapVisible(); }
    else if (k === 'c') { ev.preventDefault(); toggleCpVisible(); }
    else if (k === 'l') { ev.preventDefault(); toggleCpLock(); }
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
    case 'clear-cache': clearLocalCache(); break;
    case 'help': {
      openDialog($('help-dialog'));
      break;
    }
    case 'shortcuts': {
      openDialog($('shortcuts-dialog'));
      break;
    }
    case 'fit': MapView.fitRoute(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'toggle-playback': togglePlayback(); break;
    case 'stop-playback': stopPlayback(); break;
    case 'toggle-cp-lock': toggleCpLock(); break;
    case 'add-cp': toggleAddMode(); break;
    case 'toggle-cp-list': toggleCpList(); break;
    case 'toggle-warn-list': toggleWarnList(); break;
    case 'toggle-route-warn': toggleRouteWarnList(); break;
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
    case 'open-samples-menu': openSamplesMenu(); break;
    default: break;
  }
}

function closeMenus() {
  for (const d of qsa('details[open]')) d.removeAttribute('open');
  resetSampleSearch();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("toast.specCopied"), 'ok');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(t("toast.specCopied"), 'ok'); }
    catch { toast(t("error.copyFailed"), 'error'); }
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
    if (state.cpLocked) return;
    pushUndoSnapshot();
    if (state.track) selectCp(index, { focus: false, scroll: false });
  },
  onCpDrag(index, x, y) {
    if (state.cpLocked || !state.track) return;
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
    if (state.cpLocked || !state.track) return;
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
    ? `${state.track.name || t("cp.untitled")} · Track Layout`
    : t("app.title");
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
    state.track.name = t("cp.untitled");
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
  syncWarnCollapseButton();
  syncRouteWarnCollapseButton();
  syncRangeHelperLabels();
  syncPlaybackUI();
  renderThemes();
  renderSampleMenu();
  renderSampleChips();
  if (state.track) {
    recomputeRoute({ fit: false, markers: true, silent: true });
  } else {
    syncAll();
    renderCpList();
    renderWarnings();
    setSideStatus('ready', t("status.ready"));
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
    setTimeout(() => toast(t("error.fileProtocol"), 'error'), 600);
  }
  const saved = restorePrefs();
  MapView.init(mapHandlers);
  MapView.setCpLocked(!!state.cpLocked);
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
  setSideStatus('ready', t("status.ready"));

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
  setSideStatus('ready', t("status.ready"));
}

boot();
