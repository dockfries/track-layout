// Track Layout: track JSON parsing, San Andreas road-graph routing and path geometry.
// Pure functions with no DOM access, so the page and tests/run.js can share them.
(function (root) {
  'use strict';

  const SA_BOUNDS = { minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 };
  const SA_HELP = 'San Andreas coordinates: x = east, y = north, z = up.';
  const FORMAT = 'track-layout/v1';

  // GTA SA path-node flags (see neufox-node-viewer).
  const FLAG_ROADBLOCK = 1 << 6;
  const FLAG_BOAT = 1 << 7;
  const FLAG_EMERGENCY = 1 << 8;
  const FLAG_NOT_HIGHWAY = 1 << 12;
  const FLAG_HIGHWAY = 1 << 13;
  const FLAG_PARKING = 1 << 21;

  const MODES = ['auto', 'road', 'spline', 'straight'];
  const ROLE = { START: 'start', CP: 'cp', FINISH: 'finish', LOOP: 'loop' };

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function round(v, digits = 2) {
    const k = Math.pow(10, digits);
    return Math.round(v * k) / k;
  }

  // Errors keep a code + args so the UI can localize them without parsing the
  // Chinese fallback message (which the tests still assert on).
  function trackError(code, args, message) {
    const err = new Error(message);
    err.code = code;
    err.args = args || [];
    return err;
  }

  // ── Track JSON ──────────────────────────────────────────────────────────
  // Accepted shapes (see README): an array of points, or an object with
  // checkpoints/cps/points/cp, plus optional name/author/closed/map.
  function parseTrack(text, fileName = 'track.json') {
    if (typeof text !== 'string') throw trackError('track-file-not-text', [], '赛道文件不是文本');
    text = text.replace(/^\uFEFF/, '').trim();
    if (!text) throw trackError('track-file-empty', [], '赛道文件是空的');

    let raw;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      const m = /position\s+(\d+)/i.exec(err.message || '');
      throw trackError('json-parse', [m ? Number(m[1]) : null, err.message],
        `JSON 解析失败${m ? `（第 ${m[1]} 个字符附近）` : ''}：${err.message}`);
    }

    let obj = null;
    let list = null;
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      obj = raw;
      const keys = ['checkpoints', 'cps', 'points', 'cp', 'waypoints'];
      for (const key of keys) {
        if (Array.isArray(raw[key])) { list = raw[key]; break; }
      }
      if (!list && raw.track && typeof raw.track === 'object') {
        obj = raw.track;
        for (const key of keys) {
          if (Array.isArray(obj[key])) { list = obj[key]; break; }
        }
      }
    }

    if (!Array.isArray(list)) {
      throw trackError('checkpoints-missing', [],
        '找不到检查点数组：需要 checkpoints / cps / points 其中之一，或直接使用 JSON 数组');
    }
    if (!list.length) throw trackError('checkpoints-empty', [], '检查点数组是空的');

    const warnings = [];
    const checkpoints = list.map((p, i) => parsePoint(p, i, warnings));

    for (let i = 1; i < checkpoints.length; i++) {
      const a = checkpoints[i - 1], b = checkpoints[i];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01) {
        warnings.push({ code: 'duplicate', index: i, text: `CP ${i} 与上一个位置重复` });
      }
    }

    const name = firstString(obj, ['name', 'title', 'trackName', 'track_name']) ||
      cleanFileName(fileName) || '未命名赛道';
    const author = firstString(obj, ['author', 'creator', 'by', 'maker']) || '';
    const description = firstString(obj, ['description', 'desc', 'subtitle', 'note']) || '';
    const closedRaw = obj && (obj.closed ?? obj.loop ?? obj.isLoop);
    const closed = closedRaw === true || closedRaw === 1 ||
      ['true', '1', 'yes', 'loop'].includes(String(closedRaw).toLowerCase());

    if (closed && checkpoints.length > 1) {
      const first = checkpoints[0];
      const last = checkpoints[checkpoints.length - 1];
      const lastIndex = checkpoints.length - 1;
      if (Math.hypot(first.x - last.x, first.y - last.y) < 0.01 &&
          !warnings.some((w) => w.code === 'duplicate' && w.index === lastIndex)) {
        warnings.push({
          code: 'duplicate-start',
          index: lastIndex,
          text: `CP ${lastIndex} 与起点位置重复`,
        });
      }
    }

    const track = {
      format: FORMAT,
      name, author, description,
      closed: !!closed,
      map: firstString(obj, ['map', 'game', 'mapName']) || 'san-andreas',
      checkpoints,
      warnings,
      sourceName: fileName,
    };
    assignRoles(track);
    return track;
  }

  function firstString(obj, keys) {
    if (!obj) return '';
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  function cleanFileName(name) {
    return String(name || '').replace(/^.*[\\/]/, '').replace(/\.json$/i, '').trim();
  }

  function parsePoint(raw, index, warnings) {
    const label = `第 ${index + 1} 个检查点`;
    let coords = null;
    let meta = {};

    if (Array.isArray(raw)) {
      coords = raw;
    } else if (typeof raw === 'string') {
      coords = raw.split(/[\s,;]+/).filter(Boolean).map(Number);
    } else if (raw && typeof raw === 'object') {
      meta = raw;
      if (isFiniteNumber(raw.x) && isFiniteNumber(raw.y)) {
        coords = raw.z !== undefined ? [raw.x, raw.y, raw.z] : [raw.x, raw.y];
      } else {
        for (const key of ['pos', 'position', 'coords', 'coord', 'point', 'p', 'location', 'loc']) {
          const v = raw[key];
          if (Array.isArray(v) && v.length >= 2 &&
              typeof v[0] === 'number' && typeof v[1] === 'number' &&
              Number.isFinite(v[0]) && Number.isFinite(v[1])) {
            coords = v;
            break;
          }
          if (v && typeof v === 'object' && isFiniteNumber(v.x) && isFiniteNumber(v.y)) {
            coords = v.z !== undefined ? [v.x, v.y, v.z] : [v.x, v.y];
            break;
          }
        }
      }
    }

    if (!coords || coords.length < 2) {
      throw trackError('point-no-coords', [index + 1], `${label}没有坐标：需要 {x, y, z} 或 [x, y, z]`);
    }
    const rawX = coords[0];
    const rawY = coords[1];
    if (typeof rawX !== 'number' || typeof rawY !== 'number' || !Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      throw trackError('point-bad-xy', [index + 1], `${label}的 x / y 不是有效数字`);
    }
    const x = rawX;
    const y = rawY;
    const rawZ = coords.length > 2 ? coords[2] : meta.z;
    const hasZField = rawZ !== undefined;
    let hasZ = false;
    let z = 0;
    if (hasZField) {
      if (typeof rawZ !== 'number' || !Number.isFinite(rawZ)) {
        throw trackError('point-bad-z', [index + 1], `${label}的 z 不是有效数字`);
      }
      hasZ = true;
      z = rawZ;
    }

    if (Math.abs(x) > 100000 || Math.abs(y) > 100000) {
      throw trackError('point-too-far', [index + 1, x, y], `${label}坐标 ${x}, ${y} 远超地图范围`);
    }
    if (hasZField && Math.abs(z) > 100000) {
      throw trackError('point-bad-z', [index + 1], `${label}的 z 超出有效范围`);
    }

    const typeRaw = meta.type ?? meta.kind ?? meta.role;
    const declaredType = normalizeType(typeRaw);
    const radiusRaw = Number(meta.radius ?? meta.size ?? meta.r);
    const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 0;
    const pointLabel = firstString(meta, ['label', 'name', 'title', 'cpName', 'cp_name']);

    if (x < SA_BOUNDS.minX || x > SA_BOUNDS.maxX || y < SA_BOUNDS.minY || y > SA_BOUNDS.maxY) {
      warnings.push({ code: 'bounds', index, x, y, text: `CP ${index} (${round(x, 1)}, ${round(y, 1)}) 在 San Andreas 地图边界之外` });
    }

    return { x, y, z, hasZ, declaredType, radius, label: pointLabel, role: ROLE.CP };
  }

  function normalizeType(v) {
    if (v === undefined || v === null || v === '') return '';
    const s = String(v).trim().toLowerCase();
    if (['start', 'begin', 'first', 'spawn', 's'].includes(s)) return ROLE.START;
    if (['finish', 'end', 'last', 'f'].includes(s)) return ROLE.FINISH;
    if (['cp', 'checkpoint', 'check', 'waypoint', 'w'].includes(s)) return ROLE.CP;
    if (['loop', 'startfinish', 'start/finish', 'sf'].includes(s)) return ROLE.LOOP;
    return '';
  }

  // Roles are defined by order (and the closed flag), not by the uploader's type:
  // a race track is a sequence, so the first point is the start and the last the finish.
  function assignRoles(track) {
    const cps = track.checkpoints;
    for (const cp of cps) cp.role = ROLE.CP;
    if (!cps.length) return;
    if (track.closed) {
      cps[0].role = ROLE.LOOP;
    } else if (cps.length === 1) {
      cps[0].role = ROLE.START;
    } else {
      cps[0].role = ROLE.START;
      cps[cps.length - 1].role = ROLE.FINISH;
    }
  }

  function roleLabel(cp, index) {
    if (cp.role === ROLE.START) return '起点';
    if (cp.role === ROLE.FINISH) return '终点';
    if (cp.role === ROLE.LOOP) return '起终点';
    return `CP ${index}`;
  }

  function toJSON(track) {
    return {
      format: FORMAT,
      name: track.name,
      author: track.author || undefined,
      description: track.description || undefined,
      map: track.map || 'san-andreas',
      closed: !!track.closed,
      checkpoints: track.checkpoints.map((cp) => {
        const out = { x: round(cp.x, 3), y: round(cp.y, 3) };
        if (cp.hasZ || cp.z) out.z = round(cp.z, 3);
        if (cp.radius) out.radius = round(cp.radius, 2);
        if (cp.label) out.label = cp.label;
        return out;
      }),
    };
  }

  function normalizeTrack(track) {
    const copy = {
      name: track.name || '未命名赛道',
      author: track.author || '',
      description: track.description || '',
      map: track.map || 'san-andreas',
      closed: !!track.closed,
      checkpoints: track.checkpoints.map((cp) => ({
        x: Number(cp.x) || 0,
        y: Number(cp.y) || 0,
        z: Number(cp.z) || 0,
        hasZ: !!cp.hasZ,
        radius: Number(cp.radius) || 0,
        label: cp.label || '',
        declaredType: cp.declaredType || '',
        role: ROLE.CP,
      })),
      warnings: [],
      sourceName: track.sourceName || '',
      format: FORMAT,
    };
    assignRoles(copy);
    return copy;
  }

  // ── Road graph ─────────────────────────────────────────────────────────
  // nodes.json (neufox-node-viewer): v[i] = [x, y, z, area, flags, [adjacent ids]].
  function buildGraph(data) {
    if (!data || !Array.isArray(data.v)) throw trackError('graph-bad-data', [], '路网数据格式不正确');
    const n = data.v.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const zs = new Float32Array(n);
    const flags = new Uint32Array(n);
    const weights = new Float32Array(n);

    let edgeCount = 0;
    for (let i = 0; i < n; i++) {
      const row = data.v[i];
      if (!Array.isArray(row) || !Number.isFinite(Number(row[0])) || !Number.isFinite(Number(row[1]))) {
        throw trackError('graph-bad-data', [i], `路网节点 ${i} 缺少有效坐标`);
      }
      if (row[5] !== undefined && !Array.isArray(row[5])) {
        throw trackError('graph-bad-data', [i], `路网节点 ${i} 的邻接表格式不正确`);
      }
      xs[i] = Number(row[0]);
      ys[i] = Number(row[1]);
      zs[i] = Number.isFinite(Number(row[2])) ? Number(row[2]) : 0;
      flags[i] = Number(row[4]) >>> 0;
      weights[i] = nodeWeight(flags[i]);
      if (Array.isArray(row[5])) edgeCount += row[5].length;
    }

    const offsets = new Int32Array(n + 1);
    const targets = new Int32Array(edgeCount);
    let at = 0;
    for (let i = 0; i < n; i++) {
      offsets[i] = at;
      const adj = data.v[i][5] || [];
      for (let k = 0; k < adj.length; k++) {
        const j = adj[k];
        if (!Number.isInteger(j) || j < 0 || j >= n) {
          throw trackError('graph-bad-data', [i], `路网节点 ${i} 的邻接节点 ${j} 无效`);
        }
        if (j !== i) targets[at++] = j;
      }
    }
    offsets[n] = at;
    const usedTargets = at === targets.length ? targets : targets.subarray(0, at);

    // Weakly connected components: prefer the main road network when a CP is
    // next to both a tiny island component and the drivable main graph. Union
    // over both directions so directed custom graphs are grouped correctly.
    const parent = new Int32Array(n);
    const rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      while (parent[x] !== x) {
        const next = parent[x];
        parent[x] = r;
        x = next;
      }
      return r;
    };
    const union = (a, b) => {
      let ra = find(a), rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) { const t = ra; ra = rb; rb = t; }
      parent[rb] = ra;
      if (rank[ra] === rank[rb]) rank[ra]++;
    };
    for (let u = 0; u < n; u++) {
      for (let e = offsets[u]; e < offsets[u + 1]; e++) union(u, usedTargets[e]);
    }
    const components = new Int32Array(n).fill(-1);
    const componentSizes = [];
    const rootLabels = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      let label = rootLabels.get(root);
      if (label === undefined) {
        label = componentSizes.length;
        rootLabels.set(root, label);
        componentSizes.push(0);
      }
      components[i] = label;
      componentSizes[label]++;
    }
    let mainComponent = 0;
    for (let i = 1; i < componentSizes.length; i++) {
      if (componentSizes[i] > componentSizes[mainComponent]) mainComponent = i;
    }

    // 100 m spatial grid; enough for fast nearest-node queries at snapping distances.
    const cell = 100;
    const span = SA_BOUNDS.maxX - SA_BOUNDS.minX;
    const cols = Math.ceil(span / cell) + 1;
    const grid = new Array(cols * cols);
    for (let i = 0; i < n; i++) {
      const gx = clampInt(Math.floor((xs[i] - SA_BOUNDS.minX) / cell), 0, cols - 1);
      const gy = clampInt(Math.floor((ys[i] - SA_BOUNDS.minY) / cell), 0, cols - 1);
      const key = gy * cols + gx;
      (grid[key] || (grid[key] = [])).push(i);
    }

    const graph = {
      n, xs, ys, zs, flags, weights, offsets,
      targets: usedTargets,
      components, componentSizes, mainComponent,
      cell, cols, grid,
      cache: new Map(),
      stats: {
        nodes: n,
        edges: usedTargets.length,
        components: componentSizes.length,
        mainComponentSize: componentSizes[mainComponent] || 0,
        highway: countFlags(flags, FLAG_HIGHWAY),
        boat: countFlags(flags, FLAG_BOAT),
        emergency: countFlags(flags, FLAG_EMERGENCY),
      },
      nearest(x, y, z, maxDist, useZ, maxZ, component) {
        return nearestNode(graph, x, y, z, maxDist, useZ, maxZ, component);
      },
      routeNodes(a, b) {
        return astar(graph, a, b);
      },
      clearCache() { graph.cache.clear(); },
    };
    return graph;
  }

  function countFlags(flags, bit) {
    let c = 0;
    for (let i = 0; i < flags.length; i++) if (flags[i] & bit) c++;
    return c;
  }

  function nodeWeight(f) {
    if (f & FLAG_BOAT) return 12;
    if (f & FLAG_EMERGENCY) return 2.6;
    if (f & FLAG_PARKING) return 1.3;
    if (f & FLAG_HIGHWAY) return 0.8;
    return 1;
  }

  function clampInt(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function nearestNode(graph, x, y, z, maxDist, useZ, maxZ, component) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!Number.isFinite(maxDist) || maxDist < 0) return null;
    const { cell, cols, grid, xs, ys, zs } = graph;
    const zLimit = Number.isFinite(maxZ) ? maxZ : Infinity;
    const useZActual = !!useZ && Number.isFinite(z);
    const zz = useZActual ? z : 0;
    const gx = clampInt(Math.floor((x - SA_BOUNDS.minX) / cell), 0, cols - 1);
    const gy = clampInt(Math.floor((y - SA_BOUNDS.minY) / cell), 0, cols - 1);
    const reach = Math.min(cols, Math.max(1, Math.ceil(maxDist / cell)));
    let best = -1;
    let bestScore = Infinity;
    let bestDist = Infinity;

    for (let oy = -reach; oy <= reach; oy++) {
      const cy = gy + oy;
      if (cy < 0 || cy >= cols) continue;
      for (let ox = -reach; ox <= reach; ox++) {
        const cx = gx + ox;
        if (cx < 0 || cx >= cols) continue;
        const bucket = grid[cy * cols + cx];
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const i = bucket[k];
          if (component !== undefined && graph.components[i] !== component) continue;
          const dx = xs[i] - x, dy = ys[i] - y;
          const dist = Math.hypot(dx, dy);
          if (dist > maxDist) continue;
          const dz = useZActual ? Math.abs(zs[i] - zz) : 0;
          if (useZActual && dz > zLimit) continue;
          const score = dist + dz * 0.65;
          if (score < bestScore) {
            bestScore = score;
            bestDist = dist;
            best = i;
          }
        }
      }
    }
    if (best < 0) return null;
    return { index: best, x: xs[best], y: ys[best], z: zs[best], dist: bestDist, score: bestScore };
  }

  // A* over the vehicle graph. Edge cost = 2D length × average node penalty.
  function astar(graph, start, goal) {
    if (!Number.isInteger(start) || !Number.isInteger(goal) ||
        start < 0 || goal < 0 || start >= graph.n || goal >= graph.n) return null;
    if (start === goal) {
      return { nodes: [start], length: 0, expansions: 0, cached: false };
    }
    // Different weakly connected components cannot be connected by any path.
    if (graph.components[start] !== graph.components[goal]) return null;
    const key = `${start}|${goal}`;
    if (graph.cache.has(key)) {
      const cached = graph.cache.get(key);
      return cached ? { ...cached, cached: true } : null;
    }

    const n = graph.n;
    const gScore = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const hf = [];
    const hi = [];

    const h = (i) => Math.hypot(graph.xs[i] - graph.xs[goal], graph.ys[i] - graph.ys[goal]) * 0.8;
    const push = (f, i) => {
      let k = hf.length;
      hf.push(f); hi.push(i);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= hf[k]) break;
        const tf = hf[p]; hf[p] = hf[k]; hf[k] = tf;
        const ti = hi[p]; hi[p] = hi[k]; hi[k] = ti;
        k = p;
      }
    };
    const pop = () => {
      const topF = hf[0], topI = hi[0];
      const lastF = hf.pop(), lastI = hi.pop();
      if (hf.length) {
        hf[0] = lastF; hi[0] = lastI;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < hf.length && hf[l] < hf[m]) m = l;
          if (r < hf.length && hf[r] < hf[m]) m = r;
          if (m === k) break;
          const tf = hf[m]; hf[m] = hf[k]; hf[k] = tf;
          const ti = hi[m]; hi[m] = hi[k]; hi[k] = ti;
          k = m;
        }
      }
      return [topF, topI];
    };

    gScore[start] = 0;
    push(h(start), start);
    let expansions = 0;
    let found = false;
    const LIMIT = 400000;

    while (hf.length) {
      const [, u] = pop();
      if (closed[u]) continue;
      closed[u] = 1;
      expansions++;
      if (u === goal) { found = true; break; }
      if (expansions > LIMIT) break;
      const wu = graph.weights[u];
      for (let e = graph.offsets[u]; e < graph.offsets[u + 1]; e++) {
        const v = graph.targets[e];
        if (closed[v]) continue;
        const dx = graph.xs[v] - graph.xs[u];
        const dy = graph.ys[v] - graph.ys[u];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;
        const cost = len * (wu + graph.weights[v]) * 0.5;
        const ng = gScore[u] + cost;
        if (ng < gScore[v]) {
          gScore[v] = ng;
          came[v] = u;
          push(ng + h(v), v);
        }
      }
    }

    if (!found) {
      if (graph.cache.size > 240) graph.cache.clear();
      graph.cache.set(key, null);
      return null;
    }
    const nodes = [];
    let u = goal;
    while (u !== -1) {
      nodes.push(u);
      u = came[u];
    }
    nodes.reverse();
    const result = { nodes, length: gScore[goal], expansions, cached: false };
    if (graph.cache.size > 240) graph.cache.clear();
    graph.cache.set(key, result);
    return result;
  }

  // ── Path geometry ──────────────────────────────────────────────────────
  function pathLength(points, closed) {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    if (closed && points.length > 1) {
      len += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
    }
    return len;
  }

  function zRange(points) {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      const z = Number.isFinite(p.z) ? p.z : 0;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    return Number.isFinite(lo) ? [lo, hi] : [0, 0];
  }

  // Ramer–Douglas–Peucker on x/y, keeping z of the surviving points.
  function simplify(points, tolerance) {
    if (points.length <= 2 || !Number.isFinite(tolerance) || tolerance <= 0) return points.slice();
    const sq = tolerance * tolerance;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = -1, maxI = -1;
      const ax = points[a].x, ay = points[a].y;
      const bx = points[b].x, by = points[b].y;
      const dx = bx - ax, dy = by - ay;
      const den = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        const px = points[i].x, py = points[i].y;
        let d;
        if (den < 1e-9) {
          d = (px - ax) * (px - ax) + (py - ay) * (py - ay);
        } else {
          let t = ((px - ax) * dx + (py - ay) * dy) / den;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t, qy = ay + dy * t;
          d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
        }
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > sq && maxI > 0) {
        keep[maxI] = 1;
        stack.push([a, maxI], [maxI, b]);
      }
    }
    const out = [];
    for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
    return out;
  }

  // Chaikin corner cutting. Endpoints stay put for open paths.
  function chaikin(points, iterations, closed) {
    const passes = Number(iterations);
    if (points.length < 3 || !Number.isFinite(passes) || passes <= 0) return points.slice();
    const n = Math.min(8, Math.floor(passes));
    let src = points;
    for (let pass = 0; pass < n; pass++) {
      const out = [];
      if (!closed) out.push(src[0]);
      const count = closed ? src.length : src.length - 1;
      for (let i = 0; i < count; i++) {
        const a = src[i];
        const b = src[(i + 1) % src.length];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, z: (a.z || 0) * 0.75 + (b.z || 0) * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, z: (a.z || 0) * 0.25 + (b.z || 0) * 0.75 });
      }
      if (!closed) out.push(src[src.length - 1]);
      src = out;
    }
    return src;
  }

  function dedupe(points, epsilon = 0.2, closed = false) {
    if (!points.length) return [];
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const p = points[i], q = out[out.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) >= epsilon) out.push(p);
    }
    if (closed && points.length > 1) {
      const first = points[0], last = out[out.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < epsilon && out.length > 2) out[out.length - 1] = first;
    }
    return out;
  }

  function lerpPoint(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t,
    };
  }

  // Centripetal Catmull–Rom through every control point (used for smooth tracks).
  function catmullRom(points, closed, spacing = 6) {
    spacing = Number.isFinite(Number(spacing)) && Number(spacing) > 0 ? Number(spacing) : 6;
    const pts = points.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
    if (pts.length < 2) return pts;
    if (pts.length === 2) return closed ? [...pts, { ...pts[0] }] : pts.slice();
    const ext = [];
    if (closed) {
      ext.push(pts[pts.length - 1], ...pts, pts[0], pts[1]);
    } else {
      ext.push(pts[0], ...pts, pts[pts.length - 1]);
    }
    const out = [];
    const segments = closed ? pts.length : pts.length - 1;

    const alpha = 0.5;
    const knot = (ti, a, b) => ti + Math.pow(Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y, (b.z - a.z) * 0.4)), alpha);

    for (let i = 0; i < segments; i++) {
      const p0 = ext[i], p1 = ext[i + 1], p2 = ext[i + 2], p3 = ext[i + 3];
      const t0 = 0;
      const t1 = knot(t0, p0, p1);
      const t2 = knot(t1, p1, p2);
      const t3 = knot(t2, p2, p3);
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(5, Math.min(80, Math.ceil(segLen / spacing)));
      for (let s = 0; s < steps; s++) {
        const u = s / steps;
        const t = t1 + (t2 - t1) * u;
        out.push(catmullSegment(p0, p1, p2, p3, t0, t1, t2, t3, t));
      }
    }
    out.push({ ...pts[closed ? 0 : pts.length - 1] });
    return out;
  }

  function catmullSegment(p0, p1, p2, p3, t0, t1, t2, t3, t) {
    const mix = (a, b, ta, tb, tt) => {
      const d = tb - ta;
      if (Math.abs(d) < 1e-9) return { x: a.x, y: a.y, z: a.z };
      const u = (tt - ta) / d;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    };
    const a1 = mix(p0, p1, t0, t1, t);
    const a2 = mix(p1, p2, t1, t2, t);
    const a3 = mix(p2, p3, t2, t3, t);
    const b1 = mix(a1, a2, t0, t2, t);
    const b2 = mix(a2, a3, t1, t3, t);
    return mix(b1, b2, t1, t2, t);
  }

  // ── Route building ─────────────────────────────────────────────────────
  function roleForIndex(index, count, closed) {
    if (!count) return ROLE.CP;
    if (closed) return index === 0 ? ROLE.LOOP : ROLE.CP;
    if (count === 1) return ROLE.START;
    if (index === 0) return ROLE.START;
    if (index === count - 1) return ROLE.FINISH;
    return ROLE.CP;
  }

  function computeRoute(track, graph, options = {}) {
    options = options || {};
    const opts = {
      mode: MODES.includes(options.mode) ? options.mode : 'auto',
      snapRadius: clampNumber(options.snapRadius, 5, 500, 80),
      smooth: clampNumber(options.smooth, 0, 100, 45),
      closed: options.closed !== undefined ? !!options.closed : !!track.closed,
      maxSnapZ: 60,
    };
    // Return CPs whose roles match the requested closed/open mode, even when
    // the caller's track object still carries the other mode's roles.
    const cps = track.checkpoints.map((cp, i) => ({
      ...cp,
      role: roleForIndex(i, track.checkpoints.length, opts.closed),
    }));
    const warnings = [];
    const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (!cps || !cps.length) {
      return emptyRoute(opts, warnings, 'empty', started);
    }
    if (cps.length === 1) {
      return {
        mode: opts.mode, modeUsed: 'point',
        points: [{ x: cps[0].x, y: cps[0].y, z: cps[0].z || 0, cp: 0 }],
        cps: cps.map((cp) => ({ ...cp, snap: null })),
        segments: [],
        length: 0, zRange: [cps[0].z || 0, cps[0].z || 0],
        warnings, closed: opts.closed, ms: 0,
      };
    }

    let result;
    if (opts.mode === 'straight') {
      result = buildStraight(cps, opts);
    } else if (opts.mode === 'spline') {
      result = buildSpline(cps, opts);
    } else if (opts.mode === 'auto') {
      const local = [];
      result = tryRoad(cps, graph, opts, local, true);
      if (!result && graph) {
        // Keep as much of the road network as possible instead of dropping the
        // whole track onto a decorative spline. Missing links become straight
        // gaps and are surfaced as warnings.
        local.length = 0;
        result = tryRoad(cps, graph, opts, local, false);
        if (result && result.segments.some((segment) => segment.routed)) {
          warnings.push({
            code: 'partial-road',
            text: '未能全程吸附到路网，已尽量沿路网连接，缺口用直线补齐',
          });
          warnings.push(...local);
        } else if (result) {
          // Nothing could be routed: straight lines are still more honest than
          // calling the result a "partial road" route.
          warnings.push(...local);
          warnings.push({
            code: 'fallback',
            reason: 'no-road',
            text: '没有任何路段能使用路网，已用直线连接',
          });
          result = buildStraight(cps, opts);
        }
      }
      if (!result) {
        result = buildSpline(cps, opts);
        warnings.push({
          code: 'fallback',
          reason: graph ? 'auto' : 'no-graph',
          text: graph ? '未能全程吸附到路网，已自动改用平滑曲线' : '路网数据尚未载入，已使用平滑曲线',
        });
      }
    } else {
      const local = [];
      result = tryRoad(cps, graph, opts, local, false);
      if (!result || !result.segments.some((segment) => segment.routed)) {
        warnings.push(...local);
        result = buildStraight(cps, opts);
        warnings.push({
          code: 'fallback',
          reason: graph ? 'road' : 'road-no-graph',
          text: graph ? '路网不可用，已用直线连接' : '路网数据尚未载入，已用直线连接',
        });
      } else {
        warnings.push(...local);
      }
    }

    if (!result) result = buildStraight(cps, opts);

    // Decorative smoothing: simplify then corner-cut. Keep endpoints exact.
    let points = dedupe(result.points, 0.25, opts.closed);
    if (result.modeUsed === 'road') {
      const tol = 0.35 + (opts.smooth / 100) * 2.2;
      const iterations = opts.smooth >= 72 ? 2 : opts.smooth >= 25 ? 1 : 0;
      points = simplify(points, tol);
      if (iterations) points = chaikin(points, iterations, false);
      points = dedupe(points, 0.2, opts.closed);
    }
    points = ensureCpPoints(points, cps, result.modeUsed);
    if (points.length < 2) {
      // Coincident or near-coincident CPs can collapse under dedupe. Keep the
      // route renderable instead of returning a one-point "route" with legs.
      points = [cpPoint(cps[0], 0), cpPoint(cps[cps.length - 1], cps.length - 1)];
    }

    const zr = zRange(points);
    return {
      mode: opts.mode,
      modeUsed: result.modeUsed,
      partial: result.modeUsed === 'road' && (result.segments.some((s) => !s.routed) || warnings.some((w) => w.code === 'partial-road')),
      points,
      cps: result.cps,
      segments: result.segments,
      length: pathLength(points, opts.closed),
      zRange: zr,
      warnings: warnings.concat(result.warnings || []),
      closed: opts.closed,
      ms: now() - started,
    };
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function clampNumber(v, lo, hi, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return n < lo ? lo : n > hi ? hi : n;
  }

  function emptyRoute(opts, warnings, modeUsed, started) {
    return {
      mode: opts.mode, modeUsed, points: [], cps: [], segments: [],
      length: 0, zRange: [0, 0], warnings, closed: opts.closed, ms: 0,
    };
  }

  function cpPoint(cp, index) {
    return { x: cp.x, y: cp.y, z: cp.z || 0, cp: index };
  }

  function buildStraight(cps, opts) {
    const points = [];
    const links = [];
    for (let i = 0; i < cps.length; i++) {
      points.push(cpPoint(cps[i], i));
      if (i < cps.length - 1) links.push({ from: i, to: i + 1, routed: false, length: dist2(cps[i], cps[i + 1]) });
    }
    if (opts.closed) {
      points.push(cpPoint(cps[0], 0));
      links.push({ from: cps.length - 1, to: 0, routed: false, length: dist2(cps[cps.length - 1], cps[0]) });
    }
    return {
      points, modeUsed: 'straight', cps: cps.map((cp) => ({ ...cp, snap: null })),
      segments: links, warnings: [],
    };
  }

  function buildSpline(cps, opts) {
    const control = cps.map((cp, i) => ({ x: cp.x, y: cp.y, z: cp.z || 0, cp: i }));
    const points = catmullRom(control, opts.closed, 6);
    const links = [];
    for (let i = 0; i < cps.length - 1; i++) {
      links.push({ from: i, to: i + 1, routed: true, length: dist2(cps[i], cps[i + 1]) });
    }
    if (opts.closed) links.push({ from: cps.length - 1, to: 0, routed: true, length: dist2(cps[cps.length - 1], cps[0]) });
    return {
      points, modeUsed: 'spline',
      cps: cps.map((cp) => ({ ...cp, snap: null })),
      segments: links, warnings: [],
    };
  }

  // Route through the road graph. strict = true is used by 'auto' for the
  // full-road attempt; if that fails, auto retries non-strict and keeps the
  // reachable road parts instead of dropping the whole track to a spline.
  function tryRoad(cps, graph, opts, warnings, strict) {
    if (!graph) return null;

    const localWarnings = [];
    const nearestSnaps = cps.map((cp) =>
      graph.nearest(cp.x, cp.y, cp.z, opts.snapRadius, !!cp.hasZ, opts.maxSnapZ));
    const mainSnaps = cps.map((cp) =>
      graph.nearest(cp.x, cp.y, cp.z, opts.snapRadius, !!cp.hasZ, opts.maxSnapZ, graph.mainComponent));
    const nearestSet = new Set(nearestSnaps.filter(Boolean).map((snap) => graph.components[snap.index]));
    const allNearest = nearestSnaps.every(Boolean);
    // A track wholly on one local component should stay local even if every
    // CP also has a main-network node within the snap radius.
    const localOnly = allNearest && nearestSet.size === 1;
    const snaps = localOnly ? nearestSnaps : (mainSnaps.every(Boolean) ? mainSnaps : nearestSnaps);
    if (snaps.some((s) => !s)) {
      if (strict) return null;
      for (let i = 0; i < snaps.length; i++) {
        if (snaps[i]) continue;
        localWarnings.push({
          code: 'no-snap', index: i, radius: opts.snapRadius,
          text: `CP ${i}：${Math.round(opts.snapRadius)}m 内没有可驾驶道路节点`,
        });
      }
    }

    const pts = [];
    const links = [];
    const cpsOut = cps.map((cp, i) => ({
      ...cp,
      snap: snaps[i] ? { index: snaps[i].index, x: snaps[i].x, y: snaps[i].y, z: snaps[i].z, dist: snaps[i].dist } : null,
    }));

    const append = (p) => {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.05) pts.push(p);
    };
    const appendNode = (ni) => append({ x: graph.xs[ni], y: graph.ys[ni], z: graph.zs[ni], snapped: true });
    const appendCp = (i) => append({ x: cps[i].x, y: cps[i].y, z: cps[i].z || 0, cp: i });

    // Start exactly on CP 1. The first snapped node is only appended if leg 0
    // actually routes; otherwise it would create a dead-end spur from CP0.
    appendCp(0);

    for (let i = 0; i < cps.length - 1; i++) {
      const a = snaps[i], b = snaps[i + 1];
      let routed = false;
      let roadLen = 0;
      if (a && b) {
        const route = graph.routeNodes(a.index, b.index);
        if (route) {
          routed = true;
          appendNode(a.index);
          roadLen = 0;
          for (let k = 1; k < route.nodes.length; k++) {
            const prev = route.nodes[k - 1], next = route.nodes[k];
            roadLen += Math.hypot(graph.xs[next] - graph.xs[prev], graph.ys[next] - graph.ys[prev]);
            appendNode(next);
          }
        }
      }
      if (!routed) {
        if (strict) return null;
        if (a && b) {
          localWarnings.push({
            code: 'unreachable', index: i, from: i, to: i + 1,
            text: `CP ${i} → CP ${i + 1} 路网不可达，已用直线连接`,
          });
        }
        appendCp(i + 1);
      } else if (b && b.dist > 2.5) {
        appendCp(i + 1);
      }
      links.push({ from: i, to: i + 1, routed, length: routed ? roadLen : dist2(cps[i], cps[i + 1]) });
    }

    if (opts.closed) {
      const lastIndex = cps.length - 1;
      const a = snaps[lastIndex], b = snaps[0];
      let routed = false;
      let roadLen = 0;
      if (a && b) {
        const route = graph.routeNodes(a.index, b.index);
        if (route) {
          routed = true;
          appendNode(a.index);
          roadLen = 0;
          for (let k = 1; k < route.nodes.length; k++) {
            const prev = route.nodes[k - 1], next = route.nodes[k];
            roadLen += Math.hypot(graph.xs[next] - graph.xs[prev], graph.ys[next] - graph.ys[prev]);
            appendNode(next);
          }
        }
      }
      if (!routed && strict) return null;
      if (!routed) {
        localWarnings.push({
          code: 'unreachable', index: lastIndex, from: lastIndex, to: 0, closed: true,
          text: `CP ${lastIndex} → 起点路网不可达，已用直线闭合`,
        });
      }
      appendCp(0);
      links.push({ from: lastIndex, to: 0, routed, length: routed ? roadLen : dist2(cps[lastIndex], cps[0]) });
    } else {
      const last = cps.length - 1;
      const snap = snaps[last];
      if (snap && snap.dist > 2.5) appendCp(last);
      if (!snap) appendCp(last);
    }

    if (pts.length < 2) return null;
    warnings.push(...localWarnings);
    return { points: pts, modeUsed: 'road', cps: cpsOut, segments: links, warnings: [] };
  }

  function dist2(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Guarantee every CP is at least visually close to the line. A CP that sits
  // within 10 m of a segment is left alone: inserting it would make a visible
  // out-and-back spur when the CP is only a few metres off the road centreline.
  function ensureCpPoints(points, cps, modeUsed) {
    if (modeUsed !== 'road' || points.length < 2) return points;
    const out = points.slice();
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      let bestDist = Infinity;
      let bestSeg = -1;
      for (let k = 1; k < out.length; k++) {
        const a = out[k - 1], b = out[k];
        const dx = b.x - a.x, dy = b.y - a.y;
        const den = dx * dx + dy * dy;
        let t = den > 1e-9 ? ((cp.x - a.x) * dx + (cp.y - a.y) * dy) / den : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + dx * t, qy = a.y + dy * t;
        const d = Math.hypot(cp.x - qx, cp.y - qy);
        if (d < bestDist) { bestDist = d; bestSeg = k; }
      }
      if (bestSeg < 0 || bestDist <= 10) continue;
      out.splice(bestSeg, 0, { x: cp.x, y: cp.y, z: cp.z || 0, cp: i });
    }
    return out;
  }

  // ── Demo / tests ───────────────────────────────────────────────────────
  function sampleArrows(points, spacing, closed) {
    const arrows = [];
    if (points.length < 2 || spacing <= 0) return arrows;
    const segs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (d < 0.01) continue;
      segs.push({ a: points[i - 1], b: points[i], d, at: total });
      total += d;
    }
    if (closed && points.length > 1) {
      const a = points[points.length - 1], b = points[0];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 0.01) { segs.push({ a, b, d, at: total }); total += d; }
    }
    if (!segs.length) return arrows;
    let si = 0;
    for (let s = spacing * 0.5; s < total; s += spacing) {
      while (si < segs.length - 1 && s > segs[si].at + segs[si].d) si++;
      const seg = segs[si];
      const u = Math.max(0, Math.min(1, (s - seg.at) / seg.d));
      const x = seg.a.x + (seg.b.x - seg.a.x) * u;
      const y = seg.a.y + (seg.b.y - seg.a.y) * u;
      const angle = Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x);
      arrows.push({ x, y, angle, along: s });
    }
    return arrows;
  }

  function formatDistance(m) {
    if (!Number.isFinite(m)) return '–';
    if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km`;
    return `${Math.round(m)} m`;
  }

  const api = {
    SA_BOUNDS, FORMAT, MODES, ROLE,
    FLAG_ROADBLOCK, FLAG_BOAT, FLAG_EMERGENCY, FLAG_NOT_HIGHWAY, FLAG_HIGHWAY, FLAG_PARKING,
    parseTrack, normalizeTrack, assignRoles, roleLabel, roleForIndex, toJSON,
    buildGraph, nodeWeight, nearestNode, astar,
    computeRoute, pathLength, zRange, simplify, chaikin, catmullRom, dedupe,
    sampleArrows, formatDistance, dist2,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Track = api;
})(typeof window !== 'undefined' ? window : globalThis);
