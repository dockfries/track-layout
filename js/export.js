// Track Layout: PNG / SVG export renderer.
// The export is a self-contained re-draw of the scene (base map, tint, grid,
// route, arrows, CP markers, title and legend) at the requested resolution.
(function (root) {
  'use strict';

  const Style = root.Style;
  const Track = root.Track;
  const I18n = root.I18n;
  const FONT = 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif';
  const FONT_SVG = "Inter, 'Segoe UI', 'Microsoft YaHei', sans-serif";
  const GRID_STEP = 500;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  function r2(v) { return Math.round(v * 100) / 100; }

  // ── View / layout ──────────────────────────────────────────────────────
  function computeView(opts) {
    const { route, track, width, height, scope, currentBounds } = opts;
    let bb = null;
    if (scope === 'view' && currentBounds) {
      bb = {
        minX: currentBounds.minX, maxX: currentBounds.maxX,
        minY: currentBounds.minY, maxY: currentBounds.maxY,
      };
    } else {
      const pts = [];
      if (route && route.points && route.points.length) pts.push(...route.points);
      if (track && track.checkpoints) pts.push(...track.checkpoints);
      if (!pts.length) {
        bb = { minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 };
      } else {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        bb = { minX, maxX, minY, maxY };
      }
      let w = Math.max(1, bb.maxX - bb.minX);
      let h = Math.max(1, bb.maxY - bb.minY);
      const pad = Math.max(90, Math.max(w, h) * 0.09);
      const cx = (bb.minX + bb.maxX) / 2;
      const cy = (bb.minY + bb.maxY) / 2;
      w += pad * 2;
      h += pad * 2;
      bb = { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2 };
    }
    const aspect = Math.max(0.05, width / height);
    let w = Math.max(20, bb.maxX - bb.minX);
    let h = Math.max(20, bb.maxY - bb.minY);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    let view = { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2 };

    // Keep a full-track crop inside the base map when there is room for it, so
    // the export does not end with a dead strip along the map edge.
    const mb = opts.map && opts.map.bounds;
    if (mb && scope !== 'view') {
      const vw = view.maxX - view.minX;
      const vh = view.maxY - view.minY;
      const mw = mb.maxX - mb.minX;
      const mh = mb.maxY - mb.minY;
      if (vw <= mw) {
        if (view.maxX > mb.maxX) {
          const d = view.maxX - mb.maxX;
          if (view.minX - d >= mb.minX) { view.minX -= d; view.maxX -= d; }
          else { view.minX = mb.minX; view.maxX = mb.minX + vw; }
        }
        if (view.minX < mb.minX) { view.minX = mb.minX; view.maxX = mb.minX + vw; }
      }
      if (vh <= mh) {
        if (view.maxY > mb.maxY) {
          const d = view.maxY - mb.maxY;
          if (view.minY - d >= mb.minY) { view.minY -= d; view.maxY -= d; }
          else { view.minY = mb.minY; view.maxY = mb.minY + vh; }
        }
        if (view.minY < mb.minY) { view.minY = mb.minY; view.maxY = mb.minY + vh; }
      }
    }
    return view;
  }

  function computeLayout(opts) {
    const width = clamp(Math.round(num(opts.width, 1920)), 64, 4096);
    const height = clamp(Math.round(num(opts.height, 1080)), 64, 4096);
    const view = computeView({ ...opts, width, height });
    const scale = Math.min(width / (view.maxX - view.minX), height / (view.maxY - view.minY));
    const xToPx = (x) => (x - view.minX) * scale;
    const yToPx = (y) => (view.maxY - y) * scale;
    const k = clamp(Math.max(width, height) / 1600, 0.62, 2.9);
    return { width, height, view, scale, xToPx, yToPx, k };
  }

  function resolveBackground(opts, style) {
    if (opts.background === 'transparent') return null;
    if (opts.background === 'custom') return opts.bgColor || style.map.background;
    return style.map.background;
  }

  // ── Base map ───────────────────────────────────────────────────────────
  function mapIntersection(map, view) {
    const mb = map && map.bounds;
    if (!mb) return null;
    const minX = Math.max(view.minX, mb.minX);
    const maxX = Math.min(view.maxX, mb.maxX);
    const minY = Math.max(view.minY, mb.minY);
    const maxY = Math.min(view.maxY, mb.maxY);
    if (maxX - minX < 0.001 || maxY - minY < 0.001) return null;
    return { minX, maxX, minY, maxY, mb };
  }

  function mapSourceRect(map, rect, image) {
    const mb = rect.mb;
    const iw = image.naturalWidth || image.width || 1;
    const ih = image.naturalHeight || image.height || 1;
    const sx = ((rect.minX - mb.minX) / (mb.maxX - mb.minX)) * iw;
    const sy = ((mb.maxY - rect.maxY) / (mb.maxY - mb.minY)) * ih;
    const sw = ((rect.maxX - rect.minX) / (mb.maxX - mb.minX)) * iw;
    const sh = ((rect.maxY - rect.minY) / (mb.maxY - mb.minY)) * ih;
    return { sx: clamp(sx, 0, iw - 1), sy: clamp(sy, 0, ih - 1), sw: Math.max(1, Math.min(sw, iw - sx)), sh: Math.max(1, Math.min(sh, ih - sy)), iw, ih };
  }

  // Draw a filtered + tinted crop through a temporary canvas, so the tint is
  // limited to the map's own pixels instead of the background.
  function paintMapToContext(ctx, map, style, layout) {
    if (!map || !map.image || !style.map.visible || style.map.opacity <= 0) return;
    const image = map.image;
    if (!image.complete && image.naturalWidth === 0) return;
    const rect = mapIntersection(map, layout.view);
    if (!rect) return;

    const dx = layout.xToPx(rect.minX);
    const dy = layout.yToPx(rect.maxY);
    const dw = (rect.maxX - rect.minX) * layout.scale;
    const dh = (rect.maxY - rect.minY) * layout.scale;
    if (dw < 1 || dh < 1) return;

    const src = mapSourceRect(map, rect, image);
    const tw = clamp(Math.round(dw), 1, 4096);
    const th = clamp(Math.round(dh), 1, 4096);
    const tmp = makeCanvas(tw, th);
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    applyCanvasFilter(tctx, style.map);
    tctx.drawImage(image, src.sx, src.sy, src.sw, src.sh, 0, 0, tw, th);
    tctx.filter = 'none';

    if (style.map.tintOpacity > 0.001) {
      tctx.globalCompositeOperation = 'multiply';
      tctx.globalAlpha = style.map.tintOpacity;
      tctx.fillStyle = style.map.tint;
      tctx.fillRect(0, 0, tw, th);
      // Keep the source alpha so transparent map areas stay transparent.
      tctx.globalCompositeOperation = 'destination-in';
      tctx.globalAlpha = 1;
      tctx.drawImage(image, src.sx, src.sy, src.sw, src.sh, 0, 0, tw, th);
    }

    ctx.save();
    ctx.globalAlpha = style.map.opacity;
    ctx.drawImage(tmp, dx, dy, dw, dh);
    ctx.restore();
  }

  function applyCanvasFilter(ctx, mapStyle) {
    if (typeof ctx.filter === 'undefined') return;
    const filter = Style.cssFilter(mapStyle);
    if (filter !== 'none') ctx.filter = filter;
  }

  function drawGrid(ctx, map, style, layout) {
    if (!style.map.grid) return;
    const view = layout.view;
    const step = GRID_STEP;
    const startX = Math.ceil(view.minX / step) * step;
    const startY = Math.ceil(view.minY / step) * step;
    ctx.save();
    if (style.map.visible && map) {
      const rect = mapIntersection(map, view);
      if (rect) {
        ctx.beginPath();
        ctx.rect(layout.xToPx(rect.minX), layout.yToPx(rect.maxY),
          (rect.maxX - rect.minX) * layout.scale, (rect.maxY - rect.minY) * layout.scale);
        ctx.clip();
      }
    }
    ctx.strokeStyle = Style.withAlpha(style.map.gridColor, style.map.gridOpacity);
    ctx.lineWidth = Math.max(0.5, layout.k * 0.85);
    ctx.beginPath();
    for (let x = startX; x <= view.maxX; x += step) {
      const px = layout.xToPx(x);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, layout.height);
    }
    for (let y = startY; y <= view.maxY; y += step) {
      const py = layout.yToPx(y);
      ctx.moveTo(0, py);
      ctx.lineTo(layout.width, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Route ──────────────────────────────────────────────────────────────
  function pixels(points, layout) {
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i++) out[i] = [layout.xToPx(points[i].x), layout.yToPx(points[i].y)];
    return out;
  }

  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  function drawRoute(ctx, route, style, layout) {
    if (!route || !route.points || route.points.length < 2) return;
    const pts = pixels(route.points, layout);
    const r = style.route;
    const w = Math.max(0.5, r.width * layout.k);
    const dash = r.dash * layout.k;
    const dashArray = dash > 0.1 ? [dash, dash * 0.8] : [];

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (r.glow && r.glowSize > 0) {
      const passes = [
        [r.glowSize * 2.0, 0.055],
        [r.glowSize * 1.15, 0.11],
        [r.glowSize * 0.5, 0.18],
      ];
      tracePath(ctx, pts);
      for (const [extra, alpha] of passes) {
        ctx.globalAlpha = Math.min(1, r.opacity) * alpha;
        ctx.strokeStyle = r.glowColor;
        ctx.lineWidth = Math.max(1, w + extra * layout.k);
        ctx.setLineDash([]);
        ctx.stroke();
      }
    }

    if (r.outline) {
      ctx.globalAlpha = Math.min(1, r.opacity);
      ctx.strokeStyle = r.outlineColor;
      ctx.lineWidth = Math.max(0.5, w + r.outlineWidth * 2 * layout.k);
      ctx.setLineDash(dashArray);
      tracePath(ctx, pts);
      ctx.stroke();
    }

    ctx.globalAlpha = Math.min(1, r.opacity);
    ctx.lineWidth = w;
    ctx.setLineDash(dashArray);
    const runs = Style.routeRuns(route.points, route.zRange, style);
    for (const run of runs) {
      if (run.points.length < 2) continue;
      ctx.strokeStyle = run.color;
      tracePath(ctx, pixels(run.points, layout));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawArrows(ctx, route, track, style, layout) {
    if (!style.route.arrows || !route || route.points.length < 2) return;
    const arrows = Track.sampleArrows(route.points, Math.max(20, style.route.arrowGap), false);
    if (!arrows.length) return;
    const size = clamp(style.route.width * 2.3, 7, 22) * layout.k * style.route.arrowSize;
    const cpsPx = (style.cp.visible === false ? [] : (track.checkpoints || [])).map((cp) => [layout.xToPx(cp.x), layout.yToPx(cp.y)]);
    const safe = Math.max(12, style.cp.size * layout.k * 1.15);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const arrow of arrows) {
      const x = layout.xToPx(arrow.x);
      const y = layout.yToPx(arrow.y);
      let near = false;
      for (const cp of cpsPx) {
        if ((cp[0] - x) ** 2 + (cp[1] - y) ** 2 < safe * safe) { near = true; break; }
      }
      if (near) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-arrow.angle);
      ctx.beginPath();
      ctx.moveTo(size * 0.7, 0);
      ctx.lineTo(-size * 0.55, size * 0.62);
      ctx.lineTo(-size * 0.18, 0);
      ctx.lineTo(-size * 0.55, -size * 0.62);
      ctx.closePath();
      ctx.fillStyle = style.route.arrowColor;
      ctx.fill();
      if (style.route.arrowOutline && style.route.arrowOutline !== 'transparent') {
        ctx.strokeStyle = style.route.arrowOutline;
        ctx.lineWidth = Math.max(0.5, layout.k * 0.9);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ── Checkpoints ────────────────────────────────────────────────────────
  function markerShapePath(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else if (shape === 'square') {
      const s = r * 0.88;
      const rad = Math.max(1.5, r * 0.14);
      if (ctx.roundRect) {
        ctx.roundRect(x - s, y - s, s * 2, s * 2, rad);
      } else {
        ctx.rect(x - s, y - s, s * 2, s * 2);
      }
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }

  function drawMarkers(ctx, track, style, layout) {
    if (style.cp.visible === false) return;
    const cps = track.checkpoints || [];
    if (!cps.length) return;
    const s = style.cp;
    const size = s.size * layout.k;
    const r = size / 2;
    const border = Math.max(0.6, s.borderWidth * layout.k);

    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      const x = layout.xToPx(cp.x);
      const y = layout.yToPx(cp.y);
      const fill = Style.markerFill(cp, style);
      const textColor = Style.markerTextColor(cp, style);
      const label = Style.markerLabel(cp, i);

      if (s.halo) {
        ctx.beginPath();
        ctx.arc(x, y, r + 7 * layout.k, 0, Math.PI * 2);
        ctx.fillStyle = Style.withAlpha(s.haloColor, s.haloOpacity);
        ctx.fill();
      }

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 7 * layout.k;
      ctx.shadowOffsetY = 2 * layout.k;
      markerShapePath(ctx, s.shape, x, y, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();

      markerShapePath(ctx, s.shape, x, y, r);
      ctx.lineWidth = border;
      ctx.strokeStyle = s.border;
      ctx.stroke();

      if (s.showNumbers) {
        const fontSize = (label.length > 1 ? size * 0.34 : size * 0.46);
        ctx.fillStyle = textColor;
        ctx.font = `700 ${fontSize}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y + fontSize * 0.02);
      }

      if (s.showLabels) {
        const labelText = cp.label || I18n.roleLabel(cp, i);
        ctx.font = `600 ${Math.max(8, 11.5 * layout.k)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3 * layout.k;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(labelText, x, y + r + 7 * layout.k);
        ctx.fillStyle = s.labelColor;
        ctx.fillText(labelText, x, y + r + 7 * layout.k);
      }
    }
  }

  // ── Title / legend ─────────────────────────────────────────────────────
  function titleContent(track, route, style) {
    const title = ((style.title.text || '').trim()) || track.name || I18n.t('cp.untitled');
    let sub = (style.title.sub || '').trim();
    if (!sub) {
      const parts = [];
      if (track.author) parts.push(I18n.authorLine(track.author));
      parts.push(`${track.checkpoints.length} CP`);
      parts.push(Track.formatDistance(route ? route.length : 0));
      sub = parts.join('  ·  ');
    }
    return { title, sub, eyebrow: I18n.localizeEyebrow((style.title.eyebrow || '').trim()) };
  }

  function isDark(color) {
    const c = Style.parseColor(color);
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) < 128;
  }

  function measureText(text, font) {
    if (!measureText.ctx) {
      const c = document.createElement('canvas');
      measureText.ctx = c.getContext('2d');
    }
    measureText.ctx.font = font;
    return measureText.ctx.measureText(text).width;
  }

  function ellipsizeText(text, font, maxWidth) {
    const value = String(text || '');
    if (measureText(value, font) <= maxWidth) return value;
    const chars = Array.from(value);
    let lo = 0, hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = `${chars.slice(0, mid).join('').trimEnd()}…`;
      if (measureText(candidate, font) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? `${chars.slice(0, lo).join('').trimEnd()}…` : '…';
  }

  function titleMetrics(style, layout, title, sub) {
    const k = layout.k;
    const ts = clamp(Number(style.title.size) || 1, 0.5, 2);
    const titleScale = clamp(Number(style.title.titleSize) || 1, 0.5, 2);
    const subScale = clamp(Number(style.title.subSize) || 1, 0.5, 2);
    const margin = 40 * k;
    const maxW = layout.width - margin * 2 - 30 * k;
    const titleShift = Math.max(0, titleScale - 1) * 16 * k * ts;
    const subShift = Math.max(0, subScale - 1) * 6 * k * ts;
    const titleFont = (size) => `700 ${size}px ${FONT}`;
    let titleSize = 32 * k * ts * titleScale;
    while (titleSize > 16 * k && measureText(title, titleFont(titleSize)) > maxW) titleSize -= 1 * k;
    const subSize = 12.5 * k * ts * subScale;
    const subFont = `500 ${subSize}px ${FONT}`;
    const titleText = ellipsizeText(title, titleFont(titleSize), maxW);
    const subText = ellipsizeText(sub, subFont, maxW);
    const accentH = 56 * k * ts + titleShift * 0.7;
    const measured = Math.max(measureText(titleText, titleFont(titleSize)), measureText(subText, subFont));
    const scrimW = Math.min(layout.width * 0.94, Math.max(780 * k * ts, Math.min(measured, maxW) + 34 * k));
    const scrimH = 150 * k * ts + Math.max(0, titleScale - 1) * 18 * k + Math.max(0, subScale - 1) * 8 * k;
    return {
      k, ts, titleScale, subScale, margin, maxW, titleShift, subShift,
      titleSize, subSize, titleFont, subFont, titleText, subText,
      accentH, scrimW, scrimH,
    };
  }

  function drawTitleScrim(ctx, track, route, style, layout, bg) {
    if (!style.title.show) return;
    const opacity = clamp(Number(style.title.bgOpacity) || 0, 0, 1);
    if (opacity <= 0) return;
    const color = style.title.bgColor || bg || style.map.background;
    const { title, sub } = titleContent(track, route, style);
    const { scrimW, scrimH } = titleMetrics(style, layout, title, sub);
    const g = ctx.createLinearGradient(0, 0, scrimW, 0);
    g.addColorStop(0, Style.withAlpha(color, opacity));
    g.addColorStop(0.62, Style.withAlpha(color, opacity * 0.55));
    g.addColorStop(1, Style.withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, scrimW, scrimH);
  }

  function drawTitle(ctx, track, route, style, layout) {
    if (!style.title.show) return;
    const { title, sub, eyebrow } = titleContent(track, route, style);
    const metrics = titleMetrics(style, layout, title, sub);
    const { k, ts } = metrics;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const x = metrics.margin;
    const y = metrics.margin;
    ctx.fillStyle = style.title.accent;
    ctx.fillRect(x, y + 4 * k, 4 * k, metrics.accentH);

    if (eyebrow) {
      ctx.fillStyle = Style.withAlpha(style.title.accent, 0.92);
      ctx.font = `700 ${10.5 * k * ts}px ${FONT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${1.5 * k}px`;
      ctx.fillText(eyebrow.toUpperCase(), x + 16 * k, y + 15 * k * ts);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    ctx.fillStyle = style.title.color;
    ctx.font = metrics.titleFont(metrics.titleSize);
    ctx.fillText(metrics.titleText, x + 16 * k, y + 48 * k * ts + metrics.titleShift);

    ctx.fillStyle = Style.withAlpha(style.title.color, 0.7);
    ctx.font = metrics.subFont;
    ctx.fillText(metrics.subText, x + 16 * k, y + 70 * k * ts + metrics.titleShift + metrics.subShift);
  }

  function legendRows(track, style) {
    const loop = track.closed;
    const rows = [];
    if (style.cp.visible === false) {
      rows.push([I18n.t('label.route'), style.route.color]);
      return rows;
    }
    if (loop) {
      rows.push([I18n.t('label.startFinish'), style.cp.startColor]);
      rows.push([I18n.t('field.checkpoints'), style.cp.border]);
    } else {
      rows.push([I18n.t('cp.start'), style.cp.startColor]);
      rows.push([I18n.t('field.checkpoints'), style.cp.border]);
      rows.push([I18n.t('cp.finish'), style.cp.finishColor]);
    }
    return rows;
  }

  function drawLegend(ctx, track, route, style, layout) {
    if (!style.legend.show) return;
    const k = layout.k;
    const margin = 40 * k;
    const rows = legendRows(track, style);
    const pad = 14 * k;
    const rowH = 20 * k;
    const width = 172 * k;
    const height = pad * 2 + rows.length * rowH + 18 * k;
    const x = margin;
    const y = layout.height - margin - height;

    ctx.save();
    ctx.fillStyle = style.legend.background;
    roundRect(ctx, x, y, width, height, 10 * k);
    ctx.fill();
    ctx.strokeStyle = Style.withAlpha(style.legend.color, 0.12);
    ctx.lineWidth = Math.max(0.5, k);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${12 * k}px ${FONT}`;
    rows.forEach(([label, color], i) => {
      const cy = y + pad + i * rowH + rowH * 0.45;
      ctx.beginPath();
      ctx.arc(x + pad + 4 * k, cy, 4.5 * k, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = Style.withAlpha(style.legend.color, 0.35);
      ctx.lineWidth = Math.max(0.4, 0.8 * k);
      ctx.stroke();
      ctx.fillStyle = style.legend.color;
      ctx.fillText(label, x + pad + 16 * k, cy);
    });

    ctx.fillStyle = Style.withAlpha(style.legend.color, 0.6);
    ctx.font = `500 ${10 * k}px ${FONT}`;
    ctx.fillText(`${track.checkpoints.length} CP · ${Track.formatDistance(route ? route.length : 0)}`, x + pad, y + height - pad * 0.65);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rad);
      return;
    }
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawCredits(ctx, style, layout) {
    const k = layout.k;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = Style.withAlpha(style.legend.color, 0.38);
    ctx.font = `600 ${9 * k}px ${FONT}`;
    ctx.fillText('GTA: SAN ANDREAS · TRACK LAYOUT', layout.width - 26 * k, layout.height - 18 * k);
    ctx.restore();
  }

  // ── PNG ────────────────────────────────────────────────────────────────
  function renderCanvas(opts) {
    const { track, route, style, map } = opts;
    const layout = computeLayout(opts);
    const canvas = makeCanvas(layout.width, layout.height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const bg = resolveBackground(opts, style);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, layout.width, layout.height);
    }
    if (opts.includeMap !== false) paintMapToContext(ctx, map, style, layout);
    drawGrid(ctx, map, style, layout);
    drawTitleScrim(ctx, track, route, style, layout, bg);
    drawRoute(ctx, route, style, layout);
    drawArrows(ctx, route, track, style, layout);
    drawMarkers(ctx, track, style, layout);
    drawTitle(ctx, track, route, style, layout);
    drawLegend(ctx, track, route, style, layout);
    drawCredits(ctx, style, layout);

    return { canvas, layout };
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // ── SVG ────────────────────────────────────────────────────────────────
  function svgPath(points, layout) {
    if (!points.length) return '';
    let d = `M ${r2(layout.xToPx(points[0].x))} ${r2(layout.yToPx(points[0].y))}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${r2(layout.xToPx(points[i].x))} ${r2(layout.yToPx(points[i].y))}`;
    }
    return d;
  }

  function mapSvgImage(map, style, layout) {
    if (!map || !map.image || !style.map.visible || style.map.opacity <= 0) return null;
    if (!map.image.complete && map.image.naturalWidth === 0) return null;
    const rect = mapIntersection(map, layout.view);
    if (!rect) return null;
    const image = map.image;
    const src = mapSourceRect(map, rect, image);
    const rw = clamp(Math.round(src.sw), 1, 4096);
    const rh = clamp(Math.round(src.sh), 1, 4096);
    const tmp = makeCanvas(rw, rh);
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = true;
    applyCanvasFilter(tctx, style.map);
    tctx.drawImage(image, src.sx, src.sy, src.sw, src.sh, 0, 0, rw, rh);
    tctx.filter = 'none';
    if (style.map.tintOpacity > 0.001) {
      tctx.globalCompositeOperation = 'multiply';
      tctx.globalAlpha = style.map.tintOpacity;
      tctx.fillStyle = style.map.tint;
      tctx.fillRect(0, 0, rw, rh);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.globalAlpha = 1;
      tctx.drawImage(image, src.sx, src.sy, src.sw, src.sh, 0, 0, rw, rh);
    }
    let href;
    try {
      href = tmp.toDataURL('image/png');
    } catch (err) {
      console.warn('Track Layout: could not embed the base map in SVG', err);
      return null;
    }
    const dx = layout.xToPx(rect.minX);
    const dy = layout.yToPx(rect.maxY);
    const dw = (rect.maxX - rect.minX) * layout.scale;
    const dh = (rect.maxY - rect.minY) * layout.scale;
    return `<image x="${r2(dx)}" y="${r2(dy)}" width="${r2(dw)}" height="${r2(dh)}" preserveAspectRatio="none" opacity="${style.map.opacity}" href="${href}"/>`;
  }

  function gridSvg(map, style, layout) {
    if (!style.map.grid) return '';
    const k = layout.k;
    const view = layout.view;
    let d = '';
    for (let x = Math.ceil(view.minX / GRID_STEP) * GRID_STEP; x <= view.maxX; x += GRID_STEP) {
      const px = r2(layout.xToPx(x));
      d += `M ${px} 0 L ${px} ${layout.height} `;
    }
    for (let y = Math.ceil(view.minY / GRID_STEP) * GRID_STEP; y <= view.maxY; y += GRID_STEP) {
      const py = r2(layout.yToPx(y));
      d += `M 0 ${py} L ${layout.width} ${py} `;
    }
    if (!d) return '';
    let clip = '';
    let close = '';
    if (style.map.visible && map) {
      const rect = mapIntersection(map, view);
      if (rect) {
        const x = layout.xToPx(rect.minX), y = layout.yToPx(rect.maxY);
        clip = `<clipPath id="gridClip"><rect x="${r2(x)}" y="${r2(y)}" width="${r2((rect.maxX - rect.minX) * layout.scale)}" height="${r2((rect.maxY - rect.minY) * layout.scale)}"/></clipPath>`;
        close = ' clip-path="url(#gridClip)"';
      }
    }
    return `${clip}<path d="${d.trim()}" fill="none" stroke="${Style.withAlpha(style.map.gridColor, style.map.gridOpacity)}" stroke-width="${r2(Math.max(0.5, k * 0.85))}"${close}/>`;
  }

  function routeSvg(route, style, layout) {
    if (!route || route.points.length < 2) return '';
    const r = style.route;
    const w = Math.max(0.5, r.width * layout.k);
    const dash = r.dash * layout.k;
    const dashAttr = dash > 0.1 ? ` stroke-dasharray="${r2(dash)} ${r2(dash * 0.8)}"` : '';
    const d = svgPath(route.points, layout);
    const parts = [];
    if (r.glow && r.glowSize > 0) {
      const passes = [
        [r.glowSize * 2.0, 0.055],
        [r.glowSize * 1.15, 0.11],
        [r.glowSize * 0.5, 0.18],
      ];
      for (const [extra, alpha] of passes) {
        parts.push(`<path d="${d}" fill="none" stroke="${r.glowColor}" stroke-width="${r2(Math.max(1, w + extra * layout.k))}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${r2(Math.min(1, r.opacity) * alpha)}"/>`);
      }
    }
    if (r.outline) {
      parts.push(`<path d="${d}" fill="none" stroke="${r.outlineColor}" stroke-width="${r2(Math.max(0.5, w + r.outlineWidth * 2 * layout.k))}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${r2(Math.min(1, r.opacity))}"${dashAttr}/>`);
    }
    const runs = Style.routeRuns(route.points, route.zRange, style);
    for (const run of runs) {
      if (run.points.length < 2) continue;
      parts.push(`<path d="${svgPath(run.points, layout)}" fill="none" stroke="${run.color}" stroke-width="${r2(w)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${r2(Math.min(1, r.opacity))}"${dashAttr}/>`);
    }
    return parts.join('');
  }

  function arrowsSvg(route, track, style, layout) {
    if (!style.route.arrows || !route || route.points.length < 2) return '';
    const arrows = Track.sampleArrows(route.points, Math.max(20, style.route.arrowGap), false);
    if (!arrows.length) return '';
    const size = clamp(style.route.width * 2.3, 7, 22) * layout.k * style.route.arrowSize;
    const safe = Math.max(12, style.cp.size * layout.k * 1.15);
    const cps = (style.cp.visible === false ? [] : (track.checkpoints || [])).map((cp) => [layout.xToPx(cp.x), layout.yToPx(cp.y)]);
    const outline = style.route.arrowOutline && style.route.arrowOutline !== 'transparent'
      ? ` stroke="${style.route.arrowOutline}" stroke-width="${r2(Math.max(0.5, layout.k * 0.9))}"`
      : '';
    const shape = `M ${r2(size * 0.7)} 0 L ${r2(-size * 0.55)} ${r2(size * 0.62)} L ${r2(-size * 0.18)} 0 L ${r2(-size * 0.55)} ${r2(-size * 0.62)} Z`;
    const out = [];
    for (const arrow of arrows) {
      const x = layout.xToPx(arrow.x), y = layout.yToPx(arrow.y);
      let near = false;
      for (const cp of cps) if ((cp[0] - x) ** 2 + (cp[1] - y) ** 2 < safe * safe) { near = true; break; }
      if (near) continue;
      const deg = r2(-arrow.angle * 180 / Math.PI);
      out.push(`<path d="${shape}" fill="${style.route.arrowColor}"${outline} transform="translate(${r2(x)} ${r2(y)}) rotate(${deg})"/>`);
    }
    return out.join('');
  }

  function markersSvg(track, style, layout) {
    if (style.cp.visible === false) return '';
    const s = style.cp;
    const size = s.size * layout.k;
    const r = size / 2;
    const border = Math.max(0.6, s.borderWidth * layout.k);
    const out = [];
    const cps = track.checkpoints || [];
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      const x = layout.xToPx(cp.x), y = layout.yToPx(cp.y);
      const fill = Style.markerFill(cp, style);
      const textColor = Style.markerTextColor(cp, style);
      const label = Style.markerLabel(cp, i);
      const parts = [];
      if (s.halo) {
        parts.push(`<circle r="${r2(r + 7 * layout.k)}" fill="${s.haloColor}" opacity="${s.haloOpacity}"/>`);
      }
      if (s.shape === 'diamond') {
        parts.push(`<path d="M 0 ${r2(-r)} L ${r2(r)} 0 L 0 ${r2(r)} L ${r2(-r)} 0 Z" fill="${fill}" stroke="${s.border}" stroke-width="${r2(border)}" stroke-linejoin="round"/>`);
      } else if (s.shape === 'square') {
        const side = r * 0.88 * 2;
        parts.push(`<rect x="${r2(-side / 2)}" y="${r2(-side / 2)}" width="${r2(side)}" height="${r2(side)}" rx="${r2(Math.max(1.5, r * 0.14))}" fill="${fill}" stroke="${s.border}" stroke-width="${r2(border)}"/>`);
      } else {
        parts.push(`<circle r="${r2(r)}" fill="${fill}" stroke="${s.border}" stroke-width="${r2(border)}"/>`);
      }
      if (s.showNumbers) {
        const fontSize = label.length > 1 ? size * 0.34 : size * 0.46;
        parts.push(`<text x="0" y="${r2(fontSize * 0.02)}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-family="${FONT_SVG}" font-size="${r2(fontSize)}" font-weight="700">${Style.escapeXml(label)}</text>`);
      }
      if (s.showLabels) {
        const labelText = cp.label || I18n.roleLabel(cp, i);
        const fs = Math.max(8, 11.5 * layout.k);
        parts.push(`<text x="0" y="${r2(r + 7 * layout.k + fs)}" text-anchor="middle" fill="${s.labelColor}" font-family="${FONT_SVG}" font-size="${r2(fs)}" font-weight="600" stroke="rgba(0,0,0,0.55)" stroke-width="${r2(3 * layout.k)}" paint-order="stroke">${Style.escapeXml(labelText)}</text>`);
      }
      out.push(`<g transform="translate(${r2(x)} ${r2(y)})">${parts.join('')}</g>`);
    }
    return out.join('');
  }

  function titleSvg(track, route, style, layout, bg) {
    if (!style.title.show) return null;
    const { title, sub, eyebrow } = titleContent(track, route, style);
    const metrics = titleMetrics(style, layout, title, sub);
    const { k, ts } = metrics;
    const parts = [];
    let defs = '';
    let scrim = '';
    const scrimOpacity = clamp(Number(style.title.bgOpacity) || 0, 0, 1);
    if (scrimOpacity > 0) {
      const scrimColor = style.title.bgColor || bg || style.map.background;
      defs += `<linearGradient id="titleScrim" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="${scrimColor}" stop-opacity="${r2(scrimOpacity)}"/>` +
        `<stop offset="0.62" stop-color="${scrimColor}" stop-opacity="${r2(scrimOpacity * 0.55)}"/>` +
        `<stop offset="1" stop-color="${scrimColor}" stop-opacity="0"/>` +
        `</linearGradient>`;
      scrim = `<rect x="0" y="0" width="${r2(metrics.scrimW)}" height="${r2(metrics.scrimH)}" fill="url(#titleScrim)"/>`;
    }
    const x = metrics.margin, y = metrics.margin;
    parts.push(`<rect x="${r2(x)}" y="${r2(y + 4 * k)}" width="${r2(4 * k)}" height="${r2(metrics.accentH)}" fill="${style.title.accent}"/>`);
    if (eyebrow) {
      parts.push(`<text x="${r2(x + 16 * k)}" y="${r2(y + 15 * k * ts)}" fill="${style.title.accent}" font-family="${FONT_SVG}" font-size="${r2(10.5 * k * ts)}" font-weight="700" letter-spacing="${r2(1.5 * k)}">${Style.escapeXml(eyebrow.toUpperCase())}</text>`);
    }
    parts.push(`<text x="${r2(x + 16 * k)}" y="${r2(y + 48 * k * ts + metrics.titleShift)}" fill="${style.title.color}" font-family="${FONT_SVG}" font-size="${r2(metrics.titleSize)}" font-weight="700">${Style.escapeXml(metrics.titleText)}</text>`);
    parts.push(`<text x="${r2(x + 16 * k)}" y="${r2(y + 70 * k * ts + metrics.titleShift + metrics.subShift)}" fill="${style.title.color}" fill-opacity="0.7" font-family="${FONT_SVG}" font-size="${r2(metrics.subSize)}" font-weight="500">${Style.escapeXml(metrics.subText)}</text>`);
    return { defs, scrim, body: parts.join('') };
  }

  function legendSvg(track, route, style, layout) {
    if (!style.legend.show) return '';
    const k = layout.k;
    const margin = 40 * k;
    const rows = legendRows(track, style);
    const pad = 14 * k;
    const rowH = 20 * k;
    const w = 172 * k;
    const h = pad * 2 + rows.length * rowH + 18 * k;
    const x = margin, y = layout.height - margin - h;
    const parts = [];
    parts.push(`<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(10 * k)}" fill="${style.legend.background}" stroke="${Style.withAlpha(style.legend.color, 0.12)}" stroke-width="${r2(Math.max(0.5, k))}"/>`);
    rows.forEach(([label, color], i) => {
      const cy = y + pad + i * rowH + rowH * 0.45;
      parts.push(`<circle cx="${r2(x + pad + 4 * k)}" cy="${r2(cy)}" r="${r2(4.5 * k)}" fill="${color}" stroke="${Style.withAlpha(style.legend.color, 0.35)}" stroke-width="${r2(Math.max(0.4, 0.8 * k))}"/>`);
      parts.push(`<text x="${r2(x + pad + 16 * k)}" y="${r2(cy)}" dominant-baseline="central" fill="${style.legend.color}" font-family="${FONT_SVG}" font-size="${r2(12 * k)}" font-weight="500">${Style.escapeXml(label)}</text>`);
    });
    parts.push(`<text x="${r2(x + pad)}" y="${r2(y + h - pad * 0.65)}" fill="${style.legend.color}" fill-opacity="0.6" font-family="${FONT_SVG}" font-size="${r2(10 * k)}" font-weight="500">${Style.escapeXml(`${track.checkpoints.length} CP · ${Track.formatDistance(route ? route.length : 0)}`)}</text>`);
    return parts.join('');
  }

  function creditsSvg(style, layout) {
    const k = layout.k;
    return `<text x="${r2(layout.width - 26 * k)}" y="${r2(layout.height - 18 * k)}" text-anchor="end" fill="${style.legend.color}" fill-opacity="0.38" font-family="${FONT_SVG}" font-size="${r2(9 * k)}" font-weight="600">GTA: SAN ANDREAS · TRACK LAYOUT</text>`;
  }

  function renderSVG(opts) {
    const { track, route, style, map } = opts;
    const layout = computeLayout(opts);
    const bg = resolveBackground(opts, style);
    const defs = [];
    const body = [];
    if (bg) body.push(`<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${bg}"/>`);
    if (opts.includeMap !== false) {
      const img = mapSvgImage(map, style, layout);
      if (img) body.push(img);
    }
    const grid = gridSvg(map, style, layout);
    if (grid) body.push(grid);
    const title = titleSvg(track, route, style, layout, bg);
    if (title) {
      if (title.defs) defs.push(title.defs);
      if (title.scrim) body.push(title.scrim);
    }
    body.push(routeSvg(route, style, layout));
    body.push(arrowsSvg(route, track, style, layout));
    body.push(markersSvg(track, style, layout));
    if (title) body.push(title.body);
    body.push(legendSvg(track, route, style, layout));
    body.push(creditsSvg(style, layout));

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">` +
      `<title>${Style.escapeXml(track.name || 'Track Layout')}</title>` +
      `<desc>${Style.escapeXml(`Track route map exported by Track Layout · GTA: San Andreas · ${track.checkpoints.length} CP · ${Track.formatDistance(route ? route.length : 0)}`)}</desc>` +
      (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
      body.join('') +
      `</svg>`;
  }

  root.Exporter = { computeView, computeLayout, renderCanvas, renderSVG, titleContent, resolveBackground };
})(typeof window !== 'undefined' ? window : globalThis);
