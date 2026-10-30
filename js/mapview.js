// Track Layout: Leaflet map view (base map, tint, grid, route, arrows, CP markers).
// The exporter mirrors this scene with canvas/SVG, so keep visual decisions in
// style.js where both sides can share them.
(function (root) {
  'use strict';

  const Style = root.Style;
  const Track = root.Track;
  const I18n = root.I18n;

  const SA_BOUNDS = { minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 };
  const GRID_STEP = 500;

  let map = null;
  let baseOverlay = null;
  let baseImage = null;
  let baseBounds = { ...SA_BOUNDS };
  let tintRect = null;
  let tintRenderer = null;
  let gridRenderer = null;
  let routeRenderer = null;
  let gridGroup = null;
  let routeGroup = null;
  let arrowGroup = null;
  let cpGroup = null;
  let handlers = {};
  let coordsTimer = 0;
  let playbackMarker = null;

  const state = {
    track: null,
    route: null,
    style: null,
    selected: -1,
    addMode: false,
    dragging: false,
    cpLocked: true,
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function formatScaleDistance(meters) {
    if (!Number.isFinite(meters) || meters <= 0) return '';
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
    }
    if (meters >= 100) {
      const rounded = Math.round(meters / 10) * 10;
      return rounded >= 1000 ? '1.0 km' : `${rounded} m`;
    }
    if (meters >= 10) return `${Math.round(meters)} m`;
    return `${Math.max(1, Math.round(meters))} m`;
  }

  function hideCoords() {
    clearTimeout(coordsTimer);
    const el = document.getElementById('map-coords');
    if (el) el.classList.remove('is-visible');
  }

  function init(opts) {
    handlers = opts || {};
    map = L.map('map', {
      crs: L.CRS.Simple,
      center: [0, 0],
      zoom: -1,
      minZoom: -3.5,
      maxZoom: 6,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    map.createPane('tintPane').style.zIndex = 410;
    map.createPane('gridPane').style.zIndex = 420;
    map.createPane('routePane').style.zIndex = 430;
    for (const name of ['tintPane', 'gridPane', 'routePane']) {
      map.getPane(name).style.pointerEvents = 'none';
    }

    tintRenderer = L.svg({ pane: 'tintPane', interactive: false });
    gridRenderer = L.svg({ pane: 'gridPane', interactive: false });
    routeRenderer = L.canvas({ pane: 'routePane', padding: 0.6, tolerance: 4 });

    tintRect = L.rectangle([[-3000, -3000], [3000, 3000]], {
      renderer: tintRenderer,
      stroke: false,
      fillColor: '#000000',
      fillOpacity: 0,
      interactive: false,
      className: 'tl-tint',
    }).addTo(map);

    gridGroup = L.layerGroup().addTo(map);
    routeGroup = L.layerGroup().addTo(map);
    arrowGroup = L.layerGroup().addTo(map);
    cpGroup = L.layerGroup().addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    const SimpleScale = L.Control.extend({
      options: { position: 'bottomright', width: 100 },
      onAdd(leafletMap) {
        this._map = leafletMap;
        const container = L.DomUtil.create('div', 'leaflet-control-scale leaflet-control');
        this._line = L.DomUtil.create('div', 'leaflet-control-scale-line', container);
        leafletMap.on('zoomend moveend resize', this._update, this);
        this._update();
        return container;
      },
      onRemove(leafletMap) {
        leafletMap.off('zoomend moveend resize', this._update, this);
      },
      _update() {
        if (!this._map || !this._line) return;
        const width = this.options.width;
        const y = Math.max(1, this._map.getSize().y / 2);
        const left = this._map.containerPointToLatLng([0, y]);
        const right = this._map.containerPointToLatLng([width, y]);
        const meters = this._map.distance(left, right);
        this._line.style.width = `${width}px`;
        this._line.textContent = formatScaleDistance(meters);
      },
    });
    new SimpleScale().addTo(map);

    map.on('click', (e) => {
      if (handlers.onMapClick) handlers.onMapClick({ x: e.latlng.lng, y: e.latlng.lat });
    });
    map.on('mousemove', (e) => {
      const el = document.getElementById('map-coords');
      if (!el) return;
      el.textContent = `x ${e.latlng.lng.toFixed(1)}  ·  y ${e.latlng.lat.toFixed(1)}`;
      el.classList.add('is-visible');
      clearTimeout(coordsTimer);
      coordsTimer = setTimeout(hideCoords, 1500);
    });
    map.on('mouseout', hideCoords);
    map.on('dragstart', hideCoords);
    map.getContainer().addEventListener('pointerleave', hideCoords);
    map.on('zoomend', () => {
      // Arrow size is fixed in screen pixels; nothing to redraw, but keep the
      // coordinate readout meaningful after a zoom.
    });

    const wrap = document.getElementById('map');
    if (typeof ResizeObserver !== 'undefined' && wrap) {
      new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(wrap);
    }
    return map;
  }

  function setBaseMap(url, bounds, fit = true) {
    baseBounds = normalizeBounds(bounds || SA_BOUNDS);
    if (baseOverlay) {
      map.removeLayer(baseOverlay);
      baseOverlay = null;
      baseImage = null;
    }
    tintRect.setBounds([[baseBounds.minY, baseBounds.minX], [baseBounds.maxY, baseBounds.maxX]]);
    applyBaseStyle();
    rebuildGrid();

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        baseImage = baseOverlay ? baseOverlay.getElement() : null;
        applyBaseStyle();
        rebuildGrid();
        if (fit) fitBase();
        resolve(baseImage);
      };
      baseOverlay = L.imageOverlay(url, [[baseBounds.minY, baseBounds.minX], [baseBounds.maxY, baseBounds.maxX]], {
        className: 'tl-basemap',
        interactive: false,
      });
      baseOverlay.on('load', finish);
      baseOverlay.on('error', finish);
      baseOverlay.addTo(map);
      const el = baseOverlay.getElement();
      if (el) {
        if (el.complete) finish();
        else el.addEventListener('load', finish, { once: true });
        el.addEventListener('error', finish, { once: true });
      }
      setTimeout(finish, 2500);
    });
  }

  function normalizeBounds(b) {
    return {
      minX: Math.min(b.minX, b.maxX),
      maxX: Math.max(b.minX, b.maxX),
      minY: Math.min(b.minY, b.maxY),
      maxY: Math.max(b.minY, b.maxY),
    };
  }

  function applyBaseStyle() {
    if (!state.style) return;
    const ms = state.style.map;
    if (baseImage) {
      baseImage.style.filter = Style.cssFilter(ms);
      baseImage.style.opacity = String(ms.visible ? ms.opacity : 0);
    }
    if (tintRect) {
      tintRect.setStyle({
        fillColor: ms.tint,
        fillOpacity: ms.visible ? ms.tintOpacity * (Number(ms.opacity) || 0) : 0,
      });
    }
    const el = map && map.getContainer();
    if (el) el.style.background = ms.background;
  }

  function rebuildGrid() {
    if (!gridGroup || !state.style) return;
    gridGroup.clearLayers();
    const ms = state.style.map;
    if (!ms.grid) return;
    const b = baseBounds;
    const color = ms.gridColor;
    const opacity = ms.gridOpacity;
    const lines = [];
    const startX = Math.ceil(b.minX / GRID_STEP) * GRID_STEP;
    const startY = Math.ceil(b.minY / GRID_STEP) * GRID_STEP;
    for (let x = startX; x <= b.maxX; x += GRID_STEP) {
      lines.push([[b.minY, x], [b.maxY, x]]);
    }
    for (let y = startY; y <= b.maxY; y += GRID_STEP) {
      lines.push([[y, b.minX], [y, b.maxX]]);
    }
    for (const latlngs of lines) {
      gridGroup.addLayer(L.polyline(latlngs, {
        renderer: gridRenderer,
        color,
        weight: 1,
        opacity,
        interactive: false,
      }));
    }
  }

  function rebuildRoute() {
    if (!routeGroup || !arrowGroup || !state.style) return;
    routeGroup.clearLayers();
    arrowGroup.clearLayers();
    const route = state.route;
    const style = state.style;
    if (!route || !route.points || route.points.length < 2) return;
    const r = style.route;
    const latlngs = route.points.map((p) => [p.y, p.x]);
    const dash = r.dash > 0.1 ? `${r.dash} ${r.dash * 0.8}` : null;

    if (r.glow && r.glowSize > 0) {
      const passes = [
        [r.glowSize * 2.0, 0.055],
        [r.glowSize * 1.15, 0.11],
        [r.glowSize * 0.5, 0.18],
      ];
      for (const [extra, alpha] of passes) {
        routeGroup.addLayer(L.polyline(latlngs, {
          renderer: routeRenderer,
          color: r.glowColor,
          weight: Math.max(1, r.width + extra),
          opacity: Math.min(1, r.opacity) * alpha,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          smoothFactor: 0.4,
        }));
      }
    }

    if (r.outline) {
      routeGroup.addLayer(L.polyline(latlngs, {
        renderer: routeRenderer,
        color: r.outlineColor,
        weight: Math.max(0.5, r.width + r.outlineWidth * 2),
        opacity: Math.min(1, r.opacity),
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: dash,
        interactive: false,
        smoothFactor: 0.4,
      }));
    }

    const runs = Style.routeRuns(route.points, route.zRange, style);
    for (const run of runs) {
      if (run.points.length < 2) continue;
      routeGroup.addLayer(L.polyline(run.points.map((p) => [p.y, p.x]), {
        renderer: routeRenderer,
        color: run.color,
        weight: r.width,
        opacity: Math.min(1, r.opacity),
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: dash,
        interactive: false,
        smoothFactor: 0.4,
      }));
    }

    if (r.arrows) {
      const arrows = Track.sampleArrows(route.points, Math.max(20, r.arrowGap), false);
      const size = clamp(r.width * 2.3, 7, 22) * r.arrowSize;
      const cps = (style.cp.visible === false ? [] : (state.track ? state.track.checkpoints : [])).map((cp) => [cp.x, cp.y]);
      const safe = Math.max(12, style.cp.size * 1.15);
      for (const arrow of arrows) {
        let near = false;
        for (const cp of cps) {
          if ((cp[0] - arrow.x) ** 2 + (cp[1] - arrow.y) ** 2 < safe * safe) { near = true; break; }
        }
        if (near) continue;
        const deg = -arrow.angle * 180 / Math.PI;
        const half = size / 2;
        const shape = `M ${(size * 0.7).toFixed(2)} 0 L ${(-size * 0.55).toFixed(2)} ${(size * 0.62).toFixed(2)} L ${(-size * 0.18).toFixed(2)} 0 L ${(-size * 0.55).toFixed(2)} ${(-size * 0.62).toFixed(2)} Z`;
        const stroke = r.arrowOutline && r.arrowOutline !== 'transparent'
          ? ` stroke="${r.arrowOutline}" stroke-width="0.9"` : '';
        const html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">` +
          `<g transform="translate(${half} ${half}) rotate(${deg.toFixed(1)})"><path d="${shape}" fill="${r.arrowColor}"${stroke}/></g></svg>`;
        const icon = L.divIcon({
          className: 'tl-arrow',
          html,
          iconSize: [size, size],
          iconAnchor: [half, half],
        });
        arrowGroup.addLayer(L.marker([arrow.y, arrow.x], {
          icon,
          interactive: false,
          keyboard: false,
          pane: 'markerPane',
        }));
      }
    }
  }

  function cpMarkerHtml(cp, index, style) {
    const label = cp.label || I18n.roleLabel(cp, index);
    const labelHtml = style.cp.showLabels
      ? `<span class="tl-cp-label" style="color:${style.cp.labelColor}">${escapeHtml(label)}</span>`
      : '';
    return `<div class="tl-cp-wrap">${Style.markerSvg(cp, index, style)}${labelHtml}</div>`;
  }

  function rebuildMarkers() {
    if (!cpGroup || !state.style) return;
    cpGroup.clearLayers();
    const track = state.track;
    if (!track || state.style.cp.visible === false) return;
    const style = state.style;
    const total = Style.markerTotalSize(style);
    track.checkpoints.forEach((cp, i) => {
      const icon = L.divIcon({
        className: `tl-cp${i === state.selected ? ' is-selected' : ''}${state.cpLocked ? ' is-locked' : ''}`,
        html: cpMarkerHtml(cp, i, style),
        iconSize: [total, total],
        iconAnchor: [total / 2, total / 2],
      });
      const marker = L.marker([cp.y, cp.x], {
        icon,
        draggable: true,
        keyboard: false,
        riseOnHover: true,
        autoPan: true,
        zIndexOffset: 1000 + i,
      });
      marker._cpIndex = i;
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev.originalEvent || ev);
        if (handlers.onSelect) handlers.onSelect(i);
      });
      marker.on('dragstart', () => {
        if (state.cpLocked) {
          if (marker.dragging) marker.dragging.disable();
          return;
        }
        state.dragging = true;
        if (handlers.onCpDragStart) handlers.onCpDragStart(i);
      });
      marker.on('drag', (ev) => {
        if (state.cpLocked) return;
        const ll = ev.target.getLatLng();
        if (handlers.onCpDrag) handlers.onCpDrag(i, ll.lng, ll.lat);
      });
      marker.on('dragend', (ev) => {
        if (state.cpLocked) {
          state.dragging = false;
          return;
        }
        const ll = ev.target.getLatLng();
        state.dragging = false;
        if (handlers.onCpDragEnd) handlers.onCpDragEnd(i, ll.lng, ll.lat);
      });

      const role = I18n.roleLabel(cp, i);
      const routeCp = state.route && state.route.cps ? state.route.cps[i] : null;
      const label = cp.label ? `${role} · ${escapeHtml(cp.label)}` : role;
      marker.bindTooltip(
        `<div class="tl-tip-title">${label}</div><div class="tl-tip-coord">${cp.x.toFixed(1)}, ${cp.y.toFixed(1)}${cp.hasZ ? `, ${cp.z.toFixed(1)}` : ''}</div>` +
        (routeCp && routeCp.snap && routeCp.snap.dist > 3 ? `<div class="tl-tip-note">${escapeHtml(I18n.t('cp.snapDistanceLong', routeCp.snap.dist.toFixed(0)))}</div>` : ''),
        { direction: 'top', offset: [0, -total / 2], opacity: 1, className: 'tl-tooltip', sticky: false }
      );
      marker.addTo(cpGroup);
      if (state.cpLocked && marker.dragging) marker.dragging.disable();
    });
  }

  function setSelected(index) {    state.selected = Number.isInteger(index) ? index : -1;
    if (!cpGroup) return;
    cpGroup.eachLayer((marker) => {
      const el = marker.getElement();
      if (!el) return;
      el.classList.toggle('is-selected', marker._cpIndex === state.selected);
    });
  }

  function updateOverlays() {
    const track = state.track;
    const style = state.style;
    const route = state.route;
    const titleEl = document.getElementById('map-title');
    const legendEl = document.getElementById('map-legend');

    if (titleEl) {
      const show = !!track && style.title.show;
      titleEl.classList.toggle('hidden', !show);
      if (show) {
        const title = (style.title.text || '').trim() || track.name || I18n.t('cp.untitled');
        let sub = (style.title.sub || '').trim();
        if (!sub) {
          const parts = [];
          if (track.author) parts.push(I18n.authorLine(track.author));
          parts.push(`${track.checkpoints.length} CP`);
          parts.push(Track.formatDistance(route ? route.length : 0));
          sub = parts.join('  ·  ');
        }
        titleEl.innerHTML =
          `<div class="mt-eyebrow">${escapeHtml(I18n.localizeEyebrow((style.title.eyebrow || '').trim()))}</div>` +
          `<div class="mt-title">${escapeHtml(title)}</div>` +
          `<div class="mt-sub">${escapeHtml(sub)}</div>`;
        titleEl.style.setProperty('--mt-accent', style.title.accent);
        titleEl.style.setProperty('--mt-color', style.title.color);
        const titleBgOpacity = Number.isFinite(Number(style.title.bgOpacity))
          ? Math.max(0, Math.min(1, Number(style.title.bgOpacity)))
          : 0.55;
        const titleBgColor = style.title.bgColor || style.map.background;
        titleEl.style.setProperty('--mt-bg', Style.withAlpha(titleBgColor, titleBgOpacity));
        titleEl.style.setProperty('--mt-bg-soft', Style.withAlpha(titleBgColor, titleBgOpacity * 0.55));
        titleEl.style.setProperty('--mt-scale', String(style.title.size || 1));
        titleEl.style.setProperty('--mt-title-scale', String(style.title.titleSize || 1));
        titleEl.style.setProperty('--mt-sub-scale', String(style.title.subSize || 1));
        titleEl.classList.toggle('is-light', !isDark(style.map.background));
      } else {
        titleEl.innerHTML = '';
      }
    }

    if (legendEl) {
      const show = !!track && style.legend.show;
      legendEl.classList.toggle('hidden', !show);
      if (show) {
        const rows = [];
        if (style.cp.visible === false) {
          rows.push([I18n.t('label.route'), style.route.color]);
        } else if (track.closed) {
          rows.push([I18n.t('label.startFinish'), style.cp.startColor]);
          rows.push([I18n.t('field.checkpoints'), style.cp.border]);
        } else {
          rows.push([I18n.t('cp.start'), style.cp.startColor]);
          rows.push([I18n.t('field.checkpoints'), style.cp.border]);
          rows.push([I18n.t('cp.finish'), style.cp.finishColor]);
        }
        legendEl.style.background = style.legend.background;
        legendEl.style.color = style.legend.color;
        legendEl.innerHTML = rows.map(([label, color]) =>
          `<div class="ml-row"><span class="ml-dot" style="background:${color}"></span><span>${label}</span></div>`
        ).join('') +
          `<div class="ml-foot">${track.checkpoints.length} CP · ${Track.formatDistance(route ? route.length : 0)}</div>`;
      } else {
        legendEl.innerHTML = '';
      }
    }
  }

  function isDark(color) {
    const c = Style.parseColor(color);
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) < 128;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setData({ track, route, style, selected }) {
    if (track !== undefined) state.track = track;
    if (route !== undefined) state.route = route;
    if (style !== undefined) state.style = style;
    if (selected !== undefined) state.selected = selected;
    if (!state.style) return;
    applyBaseStyle();
    rebuildGrid();
    rebuildRoute();
    rebuildMarkers();
    updateOverlays();
  }

  function setRouteOnly(route) {
    state.route = route;
    rebuildRoute();
    updateOverlays();
  }

  function setStyleOnly(style) {
    state.style = style;
    applyBaseStyle();
    rebuildGrid();
    rebuildRoute();
    rebuildMarkers();
    updateOverlays();
  }

  function fitBase() {
    if (!map) return;
    map.fitBounds([[baseBounds.minY, baseBounds.minX], [baseBounds.maxY, baseBounds.maxX]], { animate: false });
  }

  function fitRoute() {
    if (!map) return;
    const pts = [];
    if (state.route && state.route.points) pts.push(...state.route.points);
    if (state.track) pts.push(...state.track.checkpoints);
    if (!pts.length) return fitBase();
    map.fitBounds(L.latLngBounds(pts.map((p) => [p.y, p.x])).pad(0.07), { maxZoom: 4, animate: false });
  }

  function focusCp(cp) {
    if (!map || !cp) return;
    map.setView([cp.y, cp.x], Math.max(map.getZoom(), 2.5), { animate: true });
  }

  function setAddMode(on) {
    state.addMode = !!on;
    const el = map && map.getContainer();
    if (el) el.classList.toggle('is-adding', state.addMode);
    const hint = document.getElementById('add-hint');
    if (hint) hint.classList.toggle('hidden', !state.addMode);
  }

  function setCpLocked(locked) {
    state.cpLocked = !!locked;
    if (!cpGroup) return;
    cpGroup.eachLayer((marker) => {
      marker.options.draggable = !state.cpLocked;
      if (marker.dragging) {
        if (state.cpLocked) marker.dragging.disable();
        else marker.dragging.enable();
      }
      const el = marker.getElement();
      if (el) el.classList.toggle('is-locked', state.cpLocked);
    });
  }

  function centerOn(point) {
    if (!map || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    map.panTo([point.y, point.x], { animate: false });
  }

  function setPlaybackMarker(point) {
    if (!map || !point) return;
    if (!playbackMarker) {
      const icon = L.divIcon({
        className: 'tl-playback-marker',
        html: '<div class="tl-playback-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h14M13 5l7 7-7 7"/></svg></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      playbackMarker = L.marker([point.y, point.x], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 3000,
      }).addTo(map);
    }
    playbackMarker.setLatLng([point.y, point.x]);
    const arrow = playbackMarker.getElement()?.querySelector('.tl-playback-arrow');
    if (arrow) arrow.style.transform = `rotate(${point.angle}deg)`;
  }

  function clearPlaybackMarker() {
    if (playbackMarker && map) map.removeLayer(playbackMarker);
    playbackMarker = null;
  }

  function getExportMap() {
    return { image: baseImage, bounds: { ...baseBounds } };
  }

  function getViewBounds() {
    if (!map) return { ...SA_BOUNDS };
    const b = map.getBounds();
    return { minX: b.getWest(), maxX: b.getEast(), minY: b.getSouth(), maxY: b.getNorth() };
  }

  function getZoom() { return map ? map.getZoom() : 0; }

  root.MapView = {
    init, setBaseMap, setData, setRouteOnly, setStyleOnly, setSelected,
    fitRoute, fitBase, focusCp, setAddMode, setCpLocked, getExportMap, getViewBounds,
    setPlaybackMarker, clearPlaybackMarker, centerOn,
    refreshOverlays: updateOverlays, getZoom, map: () => map,
  };
})(typeof window !== 'undefined' ? window : globalThis);
