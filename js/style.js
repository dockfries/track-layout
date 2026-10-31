// Track Layout: visual style model, theme presets and small colour helpers.
// Shared by the interactive map (app.js), the PNG/SVG renderer (export.js) and
// the on-map marker markup, so a track looks the same everywhere.
(function (root) {
  'use strict';

  const DEFAULT_VISUAL = {
    theme: 'neon',
    baseTheme: 'neon',
    route: {
      paint: 'along',        // solid | along | linear | elevation
      color: '#ff2d75',
      color2: '#22d3ee',
      angle: 45,             // linear gradient angle, degrees
      width: 5,
      opacity: 1,
      outline: true,
      outlineColor: '#04060d',
      outlineWidth: 3,
      glow: true,
      glowColor: '#ff2d75',
      glowSize: 18,
      dash: 0,               // 0 = solid; otherwise dash length in px
      arrows: true,
      arrowAuto: true,       // compute spacing from route length
      arrowGap: 260,         // metres between direction arrows (manual)
      arrowColor: '#ffffff',
      arrowOutline: 'rgba(0,0,0,0.55)',
      arrowSize: 1,
    },
    cp: {
      visible: true,
      filter: 'all',          // all | endpoints | start | finish | checkpoints
      interval: 'auto',       // auto | 1 | 2 | 5 | 10 | 20
      distinguish: true,
      shape: 'circle',       // circle | square | diamond
      size: 22,
      fill: '#070b14',
      border: '#ffffff',
      borderWidth: 2.5,
      textColor: '#ffffff',
      startColor: '#22c55e',
      finishColor: '#ff2d75',
      showNumbers: true,
      showLabels: false,
      labelColor: '#ffffff',
      halo: true,
      haloColor: '#ffffff',
      haloOpacity: 0.16,
    },
    map: {
      source: 'builtin',
      visible: true,
      opacity: 1,
      brightness: 0.55,
      contrast: 1.08,
      saturate: 0.5,
      hue: 0,
      blur: 0,
      invert: 0,
      tint: '#0b1b3a',
      tintOpacity: 0.22,
      grid: false,
      gridColor: '#ffffff',
      gridOpacity: 0.08,
      gridNumbers: false,
      background: '#050811',
    },
    title: {
      show: true,
      eyebrow: 'TRACK LAYOUT',
      text: '',
      sub: '',
      color: '#ffffff',
      accent: '#ff2d75',
      bgColor: '#050811',
      bgOpacity: 0.55,
      size: 1,
      titleSize: 1,
      subSize: 1,
      position: 'tl',
      offsetX: 0,
      offsetY: 0,
    },
    legend: {
      show: true,
      color: '#dbe7f5',
      background: 'rgba(5,8,17,0.76)',
      accent: '#ffffff',
      position: 'bl',
      offsetX: 0,
      offsetY: 0,
    },
  };

  const DEFAULT_EXPORT = {
    format: 'png',
    preset: '1920x1080',
    width: 1920,
    height: 1080,
    scope: 'track',        // track | view
    background: 'style',   // style | transparent | custom
    bgColor: '#050811',
    includeMap: true,
    watermark: true,
  };

  const THEMES = [
    {
      key: 'neon', name: '霓虹夜行', en: 'Neon Night',
      note: '洋红→青渐变，强辉光', noteEn: 'Magenta → cyan gradient, strong glow', swatch: ['#ff2d75', '#22d3ee', '#050811'],
      patch: {},
    },
    {
      key: 'tactical', name: '战术雷达', en: 'Tactical Radar',
      note: '荧光绿、方格底纹、方形 CP', noteEn: 'Neon green, grid texture, square CPs', swatch: ['#b6f36b', '#facc15', '#040b07'],
      patch: {
        route: { paint: 'solid', color: '#b6f36b', color2: '#b6f36b', width: 3.5, outline: true, outlineColor: '#061009', outlineWidth: 2.5, glow: true, glowColor: '#6ee7b7', glowSize: 12, arrows: true, arrowColor: '#b6f36b', arrowOutline: 'rgba(0,0,0,0.7)', arrowGap: 230 },
        cp: { shape: 'square', size: 19, fill: '#061009', border: '#b6f36b', borderWidth: 2, textColor: '#d9ffcf', startColor: '#facc15', finishColor: '#fb7185', halo: false },
        map: { brightness: 0.5, contrast: 1.15, saturate: 0.35, hue: 55, tint: '#0e2a1b', tintOpacity: 0.3, grid: true, gridColor: '#8dff9e', gridOpacity: 0.09, background: '#040b07' },
        title: { accent: '#b6f36b', eyebrow: 'TACTICAL ROUTE', color: '#e7ffe0', bgColor: '#040b07', bgOpacity: 0.55 },
        legend: { color: '#c9ffd2', background: 'rgba(4,11,7,0.8)' },
      },
    },
    {
      key: 'paper', name: '极简纸图', en: 'Paper Map',
      note: '暖白底图，细黑字，无辉光', noteEn: 'Warm paper map, thin dark type, no glow', swatch: ['#d7263d', '#f59e0b', '#f4efe4'],
      patch: {
        route: { paint: 'along', color: '#d7263d', color2: '#f59e0b', width: 4, outline: true, outlineColor: '#fffaf0', outlineWidth: 2.5, glow: false, glowColor: '#d7263d', glowSize: 0, arrows: true, arrowColor: '#1f2937', arrowOutline: 'rgba(255,255,255,0.65)', arrowGap: 300 },
        cp: { shape: 'circle', size: 20, fill: '#fffaf0', border: '#1f2937', borderWidth: 2, textColor: '#1f2937', startColor: '#15803d', finishColor: '#b91c1c', halo: false },
        map: { brightness: 1.13, contrast: 0.94, saturate: 0.25, hue: 0, tint: '#f5e7c8', tintOpacity: 0.12, grid: false, gridColor: '#1f2937', gridOpacity: 0.06, background: '#f4efe4' },
        title: { accent: '#d7263d', eyebrow: 'ROUTE MAP', color: '#1f2937', bgColor: '#f4efe4', bgOpacity: 0.55 },
        legend: { color: '#1f2937', background: 'rgba(255,250,240,0.85)' },
      },
    },
    {
      key: 'miami', name: '迈阿密落日', en: 'Miami Sunset',
      note: '粉橙长渐变，紫调夜空', noteEn: 'Pink-orange gradient, violet night', swatch: ['#ff4d8d', '#ffb703', '#12051c'],
      patch: {
        route: { paint: 'along', color: '#ff4d8d', color2: '#ffb703', width: 6, outline: true, outlineColor: '#2a0a3a', outlineWidth: 3, glow: true, glowColor: '#ff4d8d', glowSize: 26, arrows: true, arrowColor: '#fff4e6', arrowGap: 240 },
        cp: { shape: 'circle', size: 23, fill: '#1a0826', border: '#ffd166', borderWidth: 2.5, textColor: '#fff4e6', startColor: '#22d3ee', finishColor: '#ff4d8d', halo: true, haloColor: '#ffd166', haloOpacity: 0.2 },
        map: { brightness: 0.62, contrast: 1.05, saturate: 0.7, hue: -18, tint: '#3a0f4d', tintOpacity: 0.28, grid: false, background: '#12051c' },
        title: { accent: '#ffb703', eyebrow: 'SUNSET RUN', color: '#fff4e6', bgColor: '#12051c', bgOpacity: 0.55 },
        legend: { color: '#ffe8d6', background: 'rgba(18,5,28,0.8)' },
      },
    },
    {
      key: 'blueprint', name: '赛道蓝图', en: 'Blueprint',
      note: '冷蓝网格，青紫细线', noteEn: 'Cool blue grid, cyan-violet lines', swatch: ['#38bdf8', '#a78bfa', '#03101f'],
      patch: {
        route: { paint: 'along', color: '#38bdf8', color2: '#a78bfa', width: 3, outline: true, outlineColor: '#041225', outlineWidth: 2, glow: true, glowColor: '#38bdf8', glowSize: 14, arrows: true, arrowColor: '#bae6fd', arrowGap: 280 },
        cp: { shape: 'diamond', size: 20, fill: '#041225', border: '#7dd3fc', borderWidth: 2, textColor: '#e0f2fe', startColor: '#34d399', finishColor: '#fb7185', halo: false },
        map: { brightness: 0.45, contrast: 1.2, saturate: 0.25, hue: 190, tint: '#062a4a', tintOpacity: 0.34, grid: true, gridColor: '#7dd3fc', gridOpacity: 0.1, background: '#03101f' },
        title: { accent: '#38bdf8', eyebrow: 'BLUEPRINT', color: '#e0f2fe', bgColor: '#03101f', bgOpacity: 0.55 },
        legend: { color: '#c7e8ff', background: 'rgba(3,16,31,0.82)' },
      },
    },
    {
      key: 'mono', name: '黑白高对比', en: 'Mono',
      note: '纯白路线，黑色描边，清晰优先', noteEn: 'White line, black outline, clarity first', swatch: ['#ffffff', '#111111', '#050505'],
      patch: {
        route: { paint: 'solid', color: '#ffffff', color2: '#ffffff', width: 4, outline: true, outlineColor: '#000000', outlineWidth: 3, glow: true, glowColor: '#ffffff', glowSize: 8, arrows: true, arrowColor: '#111111', arrowOutline: 'rgba(255,255,255,0.7)', arrowGap: 260 },
        cp: { shape: 'circle', size: 21, fill: '#000000', border: '#ffffff', borderWidth: 2, textColor: '#ffffff', startColor: '#a3e635', finishColor: '#f43f5e', halo: false },
        map: { brightness: 0.35, contrast: 1.25, saturate: 0, hue: 0, tint: '#000000', tintOpacity: 0.3, grid: false, gridColor: '#ffffff', gridOpacity: 0.05, background: '#050505' },
        title: { accent: '#ffffff', eyebrow: 'CONTRAST', color: '#ffffff', bgColor: '#050505', bgOpacity: 0.55 },
        legend: { color: '#ffffff', background: 'rgba(5,5,5,0.85)' },
      },
    },
    {
      key: 'cyberpunk', name: '赛博朋克 2077', en: 'Cyberpunk 2077',
      note: '夜之城黄青霓虹，硬朗菱形 CP', noteEn: 'Night City yellow/cyan neon, angular CPs', swatch: ['#fcee0a', '#00f0ff', '#0a0a0a'],
      patch: {
        route: { paint: 'linear', color: '#fcee0a', color2: '#00f0ff', angle: 135, width: 4, outline: true, outlineColor: '#050505', outlineWidth: 2.5, glow: true, glowColor: '#fcee0a', glowSize: 18, arrows: true, arrowColor: '#00f0ff', arrowOutline: 'rgba(5,5,5,0.8)', arrowGap: 240 },
        cp: { shape: 'diamond', size: 21, fill: '#0a0a0a', border: '#fcee0a', borderWidth: 2, textColor: '#fcee0a', startColor: '#fcee0a', finishColor: '#ff2a6d', halo: true, haloColor: '#00f0ff', haloOpacity: 0.2 },
        map: { brightness: 0.46, contrast: 1.28, saturate: 0.8, hue: -8, tint: '#03151a', tintOpacity: 0.35, grid: true, gridColor: '#00f0ff', gridOpacity: 0.08, background: '#05070a' },
        title: { accent: '#fcee0a', eyebrow: 'NIGHT CITY', color: '#fcee0a', bgColor: '#05070a', bgOpacity: 0.68 },
        legend: { color: '#d8fbff', background: 'rgba(5,7,10,0.86)' },
      },
    },
    {
      key: 'inverted', name: '白巧地图', en: 'White Chocolate',
      note: '奶油白底图，黑色路线，柔和低对比', noteEn: 'Cream-white base map, black route, soft low contrast', swatch: ['#1a1712', '#f6f1e6', '#ffffff'],
      patch: {
        route: { paint: 'solid', color: '#050505', color2: '#050505', width: 4.5, outline: true, outlineColor: '#ffffff', outlineWidth: 2.5, glow: false, glowColor: '#ffffff', glowSize: 0, arrows: true, arrowColor: '#050505', arrowOutline: 'rgba(255,255,255,0.8)', arrowGap: 260 },
        cp: { shape: 'circle', size: 21, fill: '#fffdf8', border: '#1a1712', borderWidth: 2.5, textColor: '#1a1712', startColor: '#1a1712', finishColor: '#1a1712', halo: false },
        map: { invert: 1, brightness: 1.85, contrast: 0.45, saturate: 0, hue: 0, opacity: 0.45, tint: '#f4ead8', tintOpacity: 0.12, grid: true, gridColor: '#3a3126', gridOpacity: 0.06, background: '#f6f1e6' },
        title: { accent: '#1a1712', eyebrow: 'WHITE CHOC', color: '#1a1712', bgColor: '#fbf7ee', bgOpacity: 0.78 },
        legend: { color: '#1a1712', background: 'rgba(251,247,238,0.92)' },
      },
    },
    {
      key: 'rainbow', name: '彩虹光轨', en: 'Rainbow Flow',
      note: '特斯拉式连续光谱光轨，深色夜空', noteEn: 'Tesla-style full-spectrum route on a dark sky', swatch: ['#ff3b30', '#ffd60a', '#34c759'],
      patch: {
        route: { paint: 'rainbow', color: '#ff3b30', color2: '#a855f7', width: 4.5, outline: true, outlineColor: '#05060a', outlineWidth: 2.5, glow: true, glowColor: '#ffffff', glowSize: 12, arrows: true, arrowColor: '#ffffff', arrowOutline: 'rgba(0,0,0,0.7)', arrowGap: 240 },
        cp: { shape: 'circle', size: 21, fill: '#05060a', border: '#ffffff', borderWidth: 2, textColor: '#ffffff', startColor: '#34c759', finishColor: '#ff3b30', halo: true, haloColor: '#ffffff', haloOpacity: 0.16 },
        map: { brightness: 0.5, contrast: 1.12, saturate: 0.6, hue: 0, tint: '#07111f', tintOpacity: 0.28, grid: true, gridColor: '#ffffff', gridOpacity: 0.05, background: '#05070c' },
        title: { accent: '#ffd60a', eyebrow: 'RAINBOW RUN', color: '#ffffff', bgColor: '#05070c', bgOpacity: 0.62 },
        legend: { color: '#f4f8ff', background: 'rgba(5,7,12,0.84)' },
      },
    },
  ];

  const EXPORT_PRESETS = [
    { key: '1920x1080', name: '16:9 · 1920×1080', w: 1920, h: 1080 },
    { key: '2560x1440', name: '16:9 · 2560×1440', w: 2560, h: 1440 },
    { key: '1600x1200', name: '4:3 · 1600×1200', w: 1600, h: 1200 },
    { key: '1600x1600', name: '1:1 · 1600×1600', w: 1600, h: 1600 },
    { key: '1080x1920', name: '9:16 · 1080×1920', w: 1080, h: 1920 },
    { key: '3840x2160', name: '4K · 3840×2160', w: 3840, h: 2160 },
  ];

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(base, patch) {
    if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null) {
      return patch === undefined ? base : patch;
    }
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const key of Object.keys(patch)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      out[key] = deepMerge(base[key], patch[key]);
    }
    return out;
  }

  function defaultVisual() { return clone(DEFAULT_VISUAL); }
  function defaultExport() { return clone(DEFAULT_EXPORT); }

  const OVERLAY_POSITIONS = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];
  const CP_FILTERS = ['all', 'endpoints', 'start', 'finish', 'checkpoints'];
  const CP_INTERVALS = [1, 2, 5, 10, 20];

  function overlayPosition(value, fallback) {
    return OVERLAY_POSITIONS.includes(value) ? value : fallback;
  }

  function overlayOffset(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(-50, Math.min(50, n)) : 0;
  }

  function cpFilter(style) {
    const value = style && style.cp ? style.cp.filter : 'all';
    return CP_FILTERS.includes(value) ? value : 'all';
  }

  function cpInterval(style, track, routeLength) {
    const raw = style && style.cp ? style.cp.interval : 1;
    if (raw === 'auto') {
      const total = track && Array.isArray(track.checkpoints) ? track.checkpoints.length : 0;
      if (total <= 1) return 1;
      const length = Number(routeLength);
      const target = length > 0
        ? Math.max(12, Math.min(72, Math.round(length / 600)))
        : 72;
      return Math.max(1, Math.ceil(total / target));
    }
    const value = Number(raw);
    return CP_INTERVALS.includes(value) ? value : 1;
  }

  function cpVisible(cp, style) {
    if (!cp || !style || style.cp.visible === false) return false;
    const filter = cpFilter(style);
    if (filter === 'all' || filter === 'checkpoints') return true;
    const endpoint = cp.role === 'start' || cp.role === 'finish' || cp.role === 'loop';
    if (filter === 'endpoints') return endpoint;
    if (filter === 'start') return cp.role === 'start' || cp.role === 'loop';
    return cp.role === 'finish' || cp.role === 'loop';
  }

  // Typical case is ~600 m between displayed CP markers, with 12..72 markers.
  // The interval is still index-based so labels and routing keep their original
  // checkpoint indices; long routes simply skip more intermediate markers.
  function cpVisibleAt(cp, index, track, style, routeLength) {
    if (!cpVisible(cp, style)) return false;
    const interval = cpInterval(style, track, routeLength);
    if (interval <= 1) return true;
    if (cp.role === 'start' || cp.role === 'finish' || cp.role === 'loop') return true;
    return Number.isInteger(index) && index > 0 && index % interval === 0;
  }

  function visibleCheckpoints(track, style, routeLength) {
    return track
      ? track.checkpoints.filter((cp, index) => cpVisibleAt(cp, index, track, style, routeLength))
      : [];
  }

  function cpLegend(track, style, t, routeLength) {
    const legend = buildCpLegend(track, style, t, routeLength);
    legend.total = track && Array.isArray(track.checkpoints) ? track.checkpoints.length : 0;
    return legend;
  }

  function buildCpLegend(track, style, t, routeLength) {
    const routeRow = [t('label.route'), style.route.color];
    if (!track) return { rows: [routeRow], count: 0 };
    const visible = visibleCheckpoints(track, style, routeLength);
    if (!visible.length) return { rows: [routeRow], count: 0 };
    const filter = cpFilter(style);
    if (filter === 'checkpoints') {
      return { rows: [[t('field.checkpoints'), style.cp.border]], count: visible.length };
    }
    if (style.cp.distinguish === false) {
      let label = t('field.checkpoints');
      if (track.closed && filter !== 'all') label = t('label.startFinish');
      else if (filter === 'start') label = t('cp.start');
      else if (filter === 'finish') label = t('cp.finish');
      else if (filter === 'endpoints') label = t('label.endpoints');
      return { rows: [[label, style.cp.border]], count: visible.length };
    }
    if (filter === 'start') {
      return {
        rows: [track.closed
          ? [t('label.startFinish'), style.cp.startColor]
          : [t('cp.start'), style.cp.startColor]],
        count: visible.length,
      };
    }
    if (filter === 'finish') {
      return {
        rows: [track.closed
          ? [t('label.startFinish'), style.cp.startColor]
          : [t('cp.finish'), style.cp.finishColor]],
        count: visible.length,
      };
    }
    if (filter === 'endpoints') {
      return {
        rows: track.closed
          ? [[t('label.startFinish'), style.cp.startColor]]
          : [[t('cp.start'), style.cp.startColor], [t('cp.finish'), style.cp.finishColor]],
        count: visible.length,
      };
    }
    if (track.closed) {
      return {
        rows: [
          [t('label.startFinish'), style.cp.startColor],
          [t('field.checkpoints'), style.cp.border],
        ],
        count: visible.length,
      };
    }
    const rows = [[t('cp.start'), style.cp.startColor]];
    if (track.checkpoints.length > 2) rows.push([t('field.checkpoints'), style.cp.border]);
    rows.push([t('cp.finish'), style.cp.finishColor]);
    return { rows, count: visible.length };
  }

  function applyTheme(key) {
    const theme = THEMES.find((t) => t.key === key);
    if (!theme) return defaultVisual();
    const next = deepMerge(defaultVisual(), theme.patch);
    next.theme = key;
    next.baseTheme = key;
    return next;
  }

  // Theme comparison intentionally ignores content, map source and visibility
  // toggles: editing a track title should not mean "custom theme".
  const THEME_IGNORED_PATHS = [
    'theme',
    'baseTheme',
    'title.text',
    'title.sub',
    'title.show',
    'legend.show',
    'map.source',
    'map.visible',
    'cp.visible',
    'cp.filter',
    'cp.distinguish',
    'cp.interval',
  ];

  function deletePath(obj, path) {
    const parts = path.split('.');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node || typeof node !== 'object') return;
      node = node[parts[i]];
    }
    if (node && typeof node === 'object') delete node[parts[parts.length - 1]];
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
    return out;
  }

  function comparableThemeStyle(style) {
    const out = clone(style);
    for (const path of THEME_IGNORED_PATHS) deletePath(out, path);
    return stableValue(out);
  }

  function sameTheme(style, baseTheme) {
    const base = THEMES.some((t) => t.key === baseTheme) ? baseTheme : 'neon';
    return JSON.stringify(comparableThemeStyle(style)) ===
      JSON.stringify(comparableThemeStyle(applyTheme(base)));
  }

  // ── Colour helpers ─────────────────────────────────────────────────────
  function parseColor(input) {
    if (typeof input !== 'string') return { r: 255, g: 255, b: 255, a: 1 };
    const s = input.trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
      return {
        r: parseInt(m[1][0] + m[1][0], 16),
        g: parseInt(m[1][1] + m[1][1], 16),
        b: parseInt(m[1][2] + m[1][2], 16),
        a: 1,
      };
    }
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
    if (m) {
      return {
        r: parseInt(m[1].slice(0, 2), 16),
        g: parseInt(m[1].slice(2, 4), 16),
        b: parseInt(m[1].slice(4, 6), 16),
        a: m[2] ? parseInt(m[2], 16) / 255 : 1,
      };
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(s);
    if (m) {
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function toHex(c) {
    const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }

  function mixColor(a, b, t) {
    const ca = parseColor(a), cb = parseColor(b);
    const u = Math.max(0, Math.min(1, t));
    return toHex({
      r: ca.r + (cb.r - ca.r) * u,
      g: ca.g + (cb.g - ca.g) * u,
      b: ca.b + (cb.b - ca.b) * u,
    });
  }

  function withAlpha(color, alpha) {
    const c = parseColor(color);
    const a = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : c.a));
    return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;
  }

  // White or near-black, whichever reads better on the fill.
  function contrastText(color, light = '#ffffff', dark = '#061009') {
    const c = parseColor(color);
    const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return l > 150 ? dark : light;
  }

  function routeColor(t, style) {
    if (style.route.paint === 'rainbow') {
      const hue = ((clampNumber(t, 0, 1) * 360) + 8) % 360;
      return `hsl(${hue.toFixed(1)}, 92%, 60%)`;
    }
    return mixColor(style.route.color, style.route.color2, t);
  }

  function clampNumber(value, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
  }

  // Split the route into contiguous colour runs. Used by both the Leaflet map
  // and the exporter so every paint mode matches in the final image.
  function routeRuns(points, zRange, style) {
    const requested = style.route.paint;
    const mode = ['solid', 'along', 'linear', 'elevation', 'rainbow'].includes(requested) ? requested : 'solid';
    if (!points || points.length < 2) return [];
    if (mode === 'solid') return [{ color: style.route.color, points: points.slice() }];

    let total = 0;
    const cum = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      if (i > 0) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      cum[i] = total;
    }

    let axis = null;
    if (mode === 'linear') {
      const a = (Number(style.route.angle) || 0) * Math.PI / 180;
      const vx = Math.cos(a), vy = Math.sin(a);
      let lo = Infinity, hi = -Infinity;
      for (const p of points) {
        const d = p.x * vx + p.y * vy;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      axis = { vx, vy, lo, span: Math.max(1e-6, hi - lo) };
    }
    const zLo = zRange ? zRange[0] : 0;
    const zSpan = zRange ? Math.max(1e-6, zRange[1] - zRange[0]) : 1;
    const BUCKETS = 64;
    const runs = [];
    let current = null;

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg < 1e-6) continue;
      let t;
      if (mode === 'along' || mode === 'rainbow') {
        t = total > 0 ? (cum[i - 1] + seg * 0.5) / total : 0;
      } else if (mode === 'elevation') {
        t = (((a.z || 0) + (b.z || 0)) * 0.5 - zLo) / zSpan;
      } else {
        const mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
        t = (mx * axis.vx + my * axis.vy - axis.lo) / axis.span;
      }
      t = Math.max(0, Math.min(0.999999, t));
      const bucket = Math.floor(t * BUCKETS);
      if (!current || current.bucket !== bucket) {
        current = { bucket, color: routeColor((bucket + 0.5) / BUCKETS, style), points: [a] };
        runs.push(current);
      }
      current.points.push(b);
    }
    return runs;
  }

  // Keep direction arrows readable and bounded: ~48 arrows for a long route,
  // with a 140 m floor so short routes do not become dotted with arrows.
  function effectiveArrowGap(route, style) {
    const length = Number(route && route.length);
    if (style.route.arrowAuto !== false && Number.isFinite(length) && length > 0) {
      return Math.max(140, length / 48);
    }
    return Math.max(20, Number(style.route.arrowGap) || 260);
  }

  function cssFilter(mapStyle, blurScale = 1) {    const parts = [];
    if (Number(mapStyle.invert) > 0.001) parts.push(`invert(${Math.min(1, Math.max(0, Number(mapStyle.invert)))})`);
    if (mapStyle.brightness !== 1) parts.push(`brightness(${mapStyle.brightness})`);
    if (mapStyle.contrast !== 1) parts.push(`contrast(${mapStyle.contrast})`);
    if (mapStyle.saturate !== 1) parts.push(`saturate(${mapStyle.saturate})`);
    if (mapStyle.hue) parts.push(`hue-rotate(${mapStyle.hue}deg)`);
    if (mapStyle.blur > 0) parts.push(`blur(${mapStyle.blur * blurScale}px)`);
    return parts.length ? parts.join(' ') : 'none';
  }

  // Keep the grid readable and bounded for very large custom base-map bounds.
  function gridStep(view) {
    const spanX = Math.max(0, Number(view && view.maxX) - Number(view && view.minX));
    const spanY = Math.max(0, Number(view && view.maxY) - Number(view && view.minY));
    let step = 750;
    let guard = 0;
    while (spanX / step + spanY / step > 2400 && guard++ < 32) step *= 2;
    return step;
  }

  // Stable, row-major grid-cell numbers starting at 0 (top-left to bottom-right).
  function gridCells(bounds, step) {
    if (!bounds || !Number.isFinite(step) || step <= 0) return [];
    const minX = Number(bounds.minX), maxX = Number(bounds.maxX);
    const minY = Number(bounds.minY), maxY = Number(bounds.maxY);
    if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return [];
    const x0 = Math.ceil(minX / step) * step;
    const x1 = Math.floor(maxX / step) * step;
    const y0 = Math.ceil(minY / step) * step;
    const y1 = Math.floor(maxY / step) * step;
    const cols = Math.max(0, Math.round((x1 - x0) / step));
    const rows = Math.max(0, Math.round((y1 - y0) / step));
    const cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = x0 + (col + 0.5) * step;
        const y = y1 - (row + 0.5) * step;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        cells.push({ x, y });
      }
    }
    return cells.map((cell, index) => ({ ...cell, index }));
  }

  function gridNumberAlpha(mapStyle) {
    const value = Number(mapStyle && mapStyle.gridOpacity) || 0;
    return Math.min(0.8, Math.max(0.34, value * 4 + 0.2));
  }

  function markerLabel(cp, index, style) {
    if (style && cpFilter(style) === 'checkpoints') return String(index);
    if (cp.role === 'start') return 'S';
    if (cp.role === 'finish') return 'F';
    if (cp.role === 'loop') return 'S/F';
    return String(index);
  }

  function markerFill(cp, style) {
    if (style.cp.distinguish === false || cpFilter(style) === 'checkpoints') return style.cp.fill;
    if (cp.role === 'start' || cp.role === 'loop') return style.cp.startColor;
    if (cp.role === 'finish') return style.cp.finishColor;
    return style.cp.fill;
  }

  function markerTextColor(cp, style) {
    if (style.cp.distinguish === false || cpFilter(style) === 'checkpoints') return style.cp.textColor;
    if (cp.role === 'start' || cp.role === 'loop' || cp.role === 'finish') {
      return contrastText(markerFill(cp, style), '#ffffff', '#08110b');
    }
    return style.cp.textColor;
  }

  // Inline SVG marker used by the Leaflet divIcons. Export draws the same shapes
  // with canvas/SVG primitives, so this is the visual reference.
  function markerSvg(cp, index, style) {
    const s = style.cp;
    const size = Math.max(10, Math.min(64, s.size));
    const r = size / 2;
    const border = s.borderWidth;
    const halo = s.halo ? r + 7 : 0;
    const total = (halo ? halo * 2 : size + border * 2) + 2;
    const c = total / 2;
    const fill = markerFill(cp, style);
    const textColor = markerTextColor(cp, style);
    const label = markerLabel(cp, index, style);
    const fontSize = label.length > 1 ? size * 0.34 : size * 0.46;

    const shape = (extra = '') => {
      if (s.shape === 'diamond') {
        return `<path d="M ${c} ${c - r} L ${c + r} ${c} L ${c} ${c + r} L ${c - r} ${c} Z" fill="${fill}" stroke="${s.border}" stroke-width="${border}" stroke-linejoin="round" ${extra}/>`;
      }
      if (s.shape === 'square') {
        const side = size * 0.88;
        return `<rect x="${c - side / 2}" y="${c - side / 2}" width="${side}" height="${side}" rx="${Math.max(2, size * 0.11)}" fill="${fill}" stroke="${s.border}" stroke-width="${border}" ${extra}/>`;
      }
      return `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${s.border}" stroke-width="${border}" ${extra}/>`;
    };

    const haloMarkup = s.halo
      ? `<circle cx="${c}" cy="${c}" r="${halo}" fill="${s.haloColor}" opacity="${s.haloOpacity}"/>`
      : '';
    const text = s.showNumbers
      ? `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-family="Inter, 'Segoe UI', 'Microsoft YaHei', sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="${label.length > 1 ? -0.3 : 0}">${escapeXml(label)}</text>`
      : '';

    return `<svg width="${total}" height="${total}" viewBox="0 0 ${total} ${total}" overflow="visible" xmlns="http://www.w3.org/2000/svg">${haloMarkup}${shape()}${text}</svg>`;
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  }

  function markerTotalSize(style) {
    const size = Math.max(10, Math.min(64, style.cp.size));
    const border = style.cp.borderWidth;
    const halo = style.cp.halo ? size / 2 + 7 : 0;
    return (halo ? halo * 2 : size + border * 2) + 2;
  }

  root.Style = {
    DEFAULT_VISUAL, DEFAULT_EXPORT, THEMES, EXPORT_PRESETS,
    clone, deepMerge, defaultVisual, defaultExport, applyTheme,
    sameTheme,
    OVERLAY_POSITIONS, overlayPosition, overlayOffset,
    CP_FILTERS, cpFilter, cpVisible,
    CP_INTERVALS, cpInterval, cpVisibleAt,
    visibleCheckpoints, cpLegend,
    parseColor, toHex, mixColor, withAlpha, contrastText, routeColor, routeRuns, cssFilter,
    effectiveArrowGap,
    gridStep,
    gridCells, gridNumberAlpha,
    markerLabel, markerFill, markerTextColor, markerSvg, markerTotalSize, escapeXml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
