#!/usr/bin/env node
// Track Layout tests: parser, geometry and road-graph routing.
// Run: node tests/run.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/track.js');
require('../js/style.js');
const S = globalThis.Style;
globalThis.Track = T;
require('../js/i18n.js');
require('../js/export.js');
const E = globalThis.Exporter;

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

function approx(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label || 'value'}: ${actual} not within ${tolerance} of ${expected}`);
}

function throws(fn, pattern) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    if (pattern) assert.ok(pattern.test(err.message), `error message did not match ${pattern}: ${err.message}`);
  }
  assert.ok(threw, 'expected an error');
}

console.log('parser');

test('canonical object', () => {
  const track = T.parseTrack(JSON.stringify({
    name: 'Test Track',
    author: 'Tester',
    closed: false,
    checkpoints: [
      { x: 10, y: 20, z: 3 },
      { x: 30, y: 40 },
      { x: 50, y: 60, z: 7 },
    ],
  }), 'test.json');
  assert.strictEqual(track.name, 'Test Track');
  assert.strictEqual(track.author, 'Tester');
  assert.strictEqual(track.closed, false);
  assert.strictEqual(track.checkpoints.length, 3);
  assert.deepStrictEqual(track.checkpoints.map((c) => c.role), [T.ROLE.START, T.ROLE.CP, T.ROLE.FINISH]);
  assert.strictEqual(track.checkpoints[0].z, 3);
  assert.strictEqual(track.checkpoints[1].z, 0);
  assert.strictEqual(track.checkpoints[1].hasZ, false);
});

test('top-level array and aliases', () => {
  const a = T.parseTrack('[[1,2,3],[4,5,6]]', 'array.json');
  assert.strictEqual(a.checkpoints.length, 2);
  assert.strictEqual(a.name, 'array');
  const b = T.parseTrack(JSON.stringify({ cps: [{ pos: [1, 2, 3] }, { position: { x: 4, y: 5, z: 6 } }] }), 'b.json');
  assert.strictEqual(b.checkpoints[1].x, 4);
  assert.strictEqual(b.checkpoints[1].z, 6);
  const c = T.parseTrack(JSON.stringify({ track: { title: 'Wrapped', points: [{ x: 7, y: 8 }] } }), 'c.json');
  assert.strictEqual(c.name, 'Wrapped');
  assert.strictEqual(c.checkpoints.length, 1);
  const alias = T.parseTrack(JSON.stringify({ checkpoints: [{ pos: [], position: [1, 2] }] }), 'alias.json');
  assert.strictEqual(alias.checkpoints[0].x, 1);
  assert.strictEqual(alias.checkpoints[0].y, 2);
});

test('closed roles', () => {
  const track = T.parseTrack(JSON.stringify({ closed: true, checkpoints: [[0, 0], [10, 0], [10, 10]] }), 'loop.json');
  assert.deepStrictEqual(track.checkpoints.map((c) => c.role), [T.ROLE.LOOP, T.ROLE.CP, T.ROLE.CP]);
  assert.strictEqual(T.roleLabel(track.checkpoints[0], 0), '起终点');
});

test('labels and radius', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [{ x: 1, y: 2, label: 'Hairpin', radius: 12 }] }), 'x.json');
  assert.strictEqual(track.checkpoints[0].label, 'Hairpin');
  assert.strictEqual(track.checkpoints[0].radius, 12);
});

test('invalid inputs throw', () => {
  throws(() => T.parseTrack('', 'x.json'), /空的/);
  throws(() => T.parseTrack('{oops', 'x.json'), /JSON 解析失败/);
  throws(() => T.parseTrack('{"checkpoints":[]}', 'x.json'), /空的/);
  throws(() => T.parseTrack('{"checkpoints":[{"x":1}]}', 'x.json'), /没有坐标/);
  throws(() => T.parseTrack('{"checkpoints":[{"x":"a","y":2}]}', 'x.json'), /没有坐标|不是有效数字/);
  throws(() => T.parseTrack('{"checkpoints":[{"x":1,"y":2,"z":"nope"}]}', 'x.json'), /z 不是有效数字/);
  throws(() => T.parseTrack('{"checkpoints":[[1,2,"nope"]]}', 'x.json'), /z 不是有效数字/);
  throws(() => T.parseTrack('{"foo":1}', 'x.json'), /找不到检查点数组/);
});

test('array coordinates reject null/boolean/nested/string coercion', () => {
  throws(() => T.parseTrack('[[null,null]]', 'x.json'), /不是有效数字/);
  throws(() => T.parseTrack('[[true,false]]', 'x.json'), /不是有效数字/);
  throws(() => T.parseTrack('[[[1],[2]]]', 'x.json'), /不是有效数字/);
  throws(() => T.parseTrack('[["12","34"]]', 'x.json'), /不是有效数字/);
});

test('z coordinates reject strings and nulls instead of coercing', () => {
  throws(() => T.parseTrack('[[1,2,"3"]]', 'x.json'), /z 不是有效数字/);
  throws(() => T.parseTrack('[[1,2,null]]', 'x.json'), /z 不是有效数字/);
  throws(() => T.parseTrack('{"checkpoints":[{"x":1,"y":2,"z":"3"}]}', 'x.json'), /z 不是有效数字/);
  throws(() => T.parseTrack('{"checkpoints":[{"x":1,"y":2,"z":null}]}', 'x.json'), /z 不是有效数字/);
  throws(() => T.parseTrack('[[1,2,1000000000]]', 'x.json'), /z 超出有效范围/);
});

test('parser errors carry i18n codes', () => {
  try {
    T.parseTrack('{"checkpoints":[]}', 'x.json');
    assert.fail('expected an error');
  } catch (err) {
    assert.strictEqual(err.code, 'checkpoints-empty');
    assert.deepStrictEqual(err.args, []);
  }
  try {
    T.parseTrack('{"checkpoints":[{"x":1}]}', 'x.json');
    assert.fail('expected an error');
  } catch (err) {
    assert.strictEqual(err.code, 'point-no-coords');
    assert.deepStrictEqual(err.args, [1]);
  }
});

test('out-of-bounds warning', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [[9999, 0], [10, 10]] }), 'x.json');
  assert.ok(track.warnings.some((w) => w.code === 'bounds'));
});

test('closed track warns when the last CP duplicates the start', () => {
  const track = T.parseTrack(JSON.stringify({
    closed: true,
    checkpoints: [[0, 0], [100, 0], [100, 100], [0, 0]],
  }), 'closed-dup.json');
  assert.ok(track.warnings.some((w) => w.code === 'duplicate-start'));
});

test('toJSON roundtrip', () => {
  const original = T.parseTrack(JSON.stringify({
    name: 'Roundtrip', author: 'A', description: 'D', closed: true,
    checkpoints: [{ x: 1.234, y: -5.678, z: 9 }, { x: 10, y: 20, label: 'X' }, { x: 30, y: 40 }],
  }), 'r.json');
  const json = T.toJSON(original);
  const again = T.parseTrack(JSON.stringify(json), 'r.json');
  assert.strictEqual(again.name, original.name);
  assert.strictEqual(again.closed, original.closed);
  assert.strictEqual(again.checkpoints.length, original.checkpoints.length);
  approx(again.checkpoints[0].x, 1.234, 0.001);
  assert.strictEqual(again.checkpoints[1].label, 'X');
});

console.log('geometry');

test('simplify keeps endpoints and drops middle collinear points', () => {
  const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const out = T.simplify(pts, 0.5);
  assert.deepStrictEqual(out, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
});

test('chaikin preserves endpoints and produces finite points', () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 1 }, { x: 10, y: 10, z: 2 }, { x: 0, y: 10, z: 3 }];
  const out = T.chaikin(pts, 2, false);
  assert.deepStrictEqual(out[0], pts[0]);
  assert.deepStrictEqual(out[out.length - 1], pts[pts.length - 1]);
  assert.ok(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const capped = T.chaikin(pts, Infinity, false);
  assert.ok(capped.length < 100000, 'infinite iterations should be bounded');
  assert.ok(capped.every((p) => Number.isFinite(p.z)));
});

test('catmull-rom open and closed', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const open = T.catmullRom(pts, false, 5);
  assert.ok(open.length > pts.length);
  approx(open[0].x, 0, 0.01);
  approx(open[0].y, 0, 0.01);
  approx(open[open.length - 1].x, 0, 0.01);
  approx(open[open.length - 1].y, 100, 0.01);
  const closed = T.catmullRom(pts, true, 5);
  assert.ok(closed.length > pts.length);
  approx(closed[0].x, 0, 0.01);
  approx(closed[closed.length - 1].x, 0, 0.01);
  approx(closed[closed.length - 1].y, 0, 0.01);
});

test('arrow sampling', () => {
  const pts = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }];
  const arrows = T.sampleArrows(pts, 100, false);
  assert.ok(arrows.length >= 9 && arrows.length <= 10, `unexpected arrow count ${arrows.length}`);
  assert.ok(arrows.every((a) => Number.isFinite(a.angle) && Number.isFinite(a.x)));
});

test('path length and z range', () => {
  const pts = [{ x: 0, y: 0, z: -5 }, { x: 3, y: 4, z: 10 }];
  approx(T.pathLength(pts, false), 5, 1e-9);
  assert.deepStrictEqual(T.zRange(pts), [-5, 10]);
});

test('invalid route paint falls back to solid instead of throwing', () => {
  const style = S.defaultVisual();
  style.route.paint = 'not-a-paint-mode';
  const runs = S.routeRuns([{ x: 0, y: 0 }, { x: 10, y: 10 }], [0, 0], style);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].color, style.route.color);
});

test('grid step grows for very large custom bounds', () => {
  assert.strictEqual(S.gridStep({ minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 }), 500);
  assert.ok(S.gridStep({ minX: -10000000, maxX: 10000000, minY: -10000000, maxY: 10000000 }) > 500);
});

test('deepMerge ignores prototype-pollution keys', () => {
  const patch = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"x":1},"safe":2}');
  const out = S.deepMerge({ a: 1 }, patch);
  assert.strictEqual(out.safe, 2);
  assert.ok(!('polluted' in out));
  assert.strictEqual({}.polluted, undefined);
});

console.log('export');

test('export view keeps the requested aspect and clamps output size', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [[0, 0], [100, 100]] }), 'x.json');
  const route = T.computeRoute(track, null, { mode: 'straight' });
  const view = E.computeView({ track, route, width: 1920, height: 1080 });
  approx((view.maxX - view.minX) / (view.maxY - view.minY), 16 / 9, 1e-6);
  const layout = E.computeLayout({ track, route, width: 5000, height: 100 });
  assert.strictEqual(layout.width, 4096);
  assert.strictEqual(layout.height, 100);
});

test('export title content falls back to track metadata', () => {
  const track = T.parseTrack(JSON.stringify({ name: 'Export Test', checkpoints: [[0, 0], [100, 100]] }), 'x.json');
  const route = T.computeRoute(track, null, { mode: 'straight' });
  const content = E.titleContent(track, route, S.defaultVisual());
  assert.strictEqual(content.title, 'Export Test');
  assert.ok(content.sub.includes('2 CP'));
});

test('overlay positions accept presets and clamp fine offsets', () => {
  assert.strictEqual(S.overlayPosition('br', 'tl'), 'br');
  assert.strictEqual(S.overlayPosition('nope', 'tl'), 'tl');
  assert.strictEqual(S.overlayOffset(12.5), 12.5);
  assert.strictEqual(S.overlayOffset(200), 50);
  assert.strictEqual(S.overlayOffset(-200), -50);
  assert.strictEqual(S.overlayOffset('bad'), 0);
});

test('theme comparison ignores content/toggles and detects visual overrides', () => {
  const style = S.defaultVisual();
  assert.strictEqual(style.baseTheme, 'neon');
  assert.ok(S.sameTheme(style, 'neon'));
  style.title.text = 'Custom title';
  style.title.sub = 'Custom subtitle';
  style.title.show = false;
  style.legend.show = false;
  style.map.visible = false;
  style.cp.visible = false;
  style.cp.filter = 'start';
  style.cp.distinguish = false;
  style.map.source = 'custom';
  assert.ok(S.sameTheme(style, 'neon'), 'content and visibility are not theme overrides');
  style.title.position = 'br';
  assert.ok(!S.sameTheme(style, 'neon'), 'placement is a visual override');
  const tactical = S.applyTheme('tactical');
  assert.strictEqual(tactical.baseTheme, 'tactical');
  assert.ok(S.sameTheme(tactical, 'tactical'));
  tactical.title.size = 1.2;
  assert.ok(!S.sameTheme(tactical, 'tactical'), 'scale is a visual override');
});

test('checkpoint filters and uniform role styling', () => {
  const style = S.defaultVisual();
  const start = { role: 'start' };
  const mid = { role: 'cp' };
  const finish = { role: 'finish' };
  const loop = { role: 'loop' };
  assert.ok(S.cpVisible(start, style));
  assert.ok(S.cpVisible(mid, style));
  style.cp.filter = 'endpoints';
  assert.ok(S.cpVisible(start, style));
  assert.ok(!S.cpVisible(mid, style));
  assert.ok(S.cpVisible(finish, style));
  style.cp.filter = 'start';
  assert.ok(S.cpVisible(loop, style));
  assert.ok(!S.cpVisible(finish, style));
  style.cp.filter = 'finish';
  assert.ok(S.cpVisible(loop, style));
  assert.ok(!S.cpVisible(start, style));
  style.cp.filter = 'invalid';
  assert.strictEqual(S.cpFilter(style), 'all');
  style.cp.filter = 'all';
  style.cp.distinguish = false;
  assert.strictEqual(S.markerFill(start, style), style.cp.fill);
  assert.strictEqual(S.markerFill(finish, style), style.cp.fill);
  assert.strictEqual(S.markerTextColor(start, style), style.cp.textColor);
});

test('checkpoint legend mirrors filters and visible count', () => {
  const style = S.defaultVisual();
  const track = {
    closed: false,
    checkpoints: [{ role: 'start' }, { role: 'cp' }, { role: 'finish' }],
  };
  let legend = S.cpLegend(track, style, globalThis.I18n.t);
  assert.strictEqual(legend.count, 3);
  assert.strictEqual(legend.rows.length, 3);
  style.cp.filter = 'endpoints';
  legend = S.cpLegend(track, style, globalThis.I18n.t);
  assert.strictEqual(legend.count, 2);
  assert.strictEqual(legend.rows.length, 2);
  style.cp.filter = 'all';
  style.cp.distinguish = false;
  legend = S.cpLegend(track, style, globalThis.I18n.t);
  assert.strictEqual(legend.count, 3);
  assert.strictEqual(legend.rows.length, 1);
  style.cp.filter = 'start';
  legend = S.cpLegend(track, style, globalThis.I18n.t);
  assert.strictEqual(legend.count, 1);
});

test('checkpoint display density thins markers without renumbering', () => {
  const style = S.defaultVisual();
  const track = {
    closed: false,
    checkpoints: Array.from({ length: 300 }, (_, i) => ({
      role: i === 0 ? 'start' : i === 299 ? 'finish' : 'cp',
    })),
  };
  assert.strictEqual(S.visibleCheckpoints(track, style).length, 300);
  style.cp.interval = 10;
  const visible = S.visibleCheckpoints(track, style);
  assert.strictEqual(visible.length, 31);
  assert.ok(S.cpVisibleAt(track.checkpoints[0], 0, track, style));
  assert.ok(!S.cpVisibleAt(track.checkpoints[1], 1, track, style));
  assert.ok(S.cpVisibleAt(track.checkpoints[10], 10, track, style));
  assert.ok(S.cpVisibleAt(track.checkpoints[299], 299, track, style));
  const legend = S.cpLegend(track, style, globalThis.I18n.t);
  assert.strictEqual(legend.count, 31);
  assert.strictEqual(legend.total, 300);
  style.cp.filter = 'endpoints';
  assert.strictEqual(S.visibleCheckpoints(track, style).length, 2);
  style.cp.filter = 'all';
  style.cp.interval = 20;
  assert.strictEqual(S.visibleCheckpoints(track, style).length, 16);
  style.cp.interval = 7;
  assert.strictEqual(S.cpInterval(style), 1);
});

test('new theme presets and rainbow/invert modes', () => {
  const byKey = Object.fromEntries(S.THEMES.map((theme) => [theme.key, theme]));
  assert.strictEqual(S.THEMES.length, 9);
  assert.ok(byKey.cyberpunk);
  assert.strictEqual(byKey.cyberpunk.patch.route.paint, 'linear');
  assert.strictEqual(byKey.inverted.patch.map.invert, 1);
  assert.strictEqual(byKey.rainbow.patch.route.paint, 'rainbow');
  const filter = S.cssFilter({ invert: 1, brightness: 1, contrast: 1, saturate: 1, hue: 0, blur: 0 });
  assert.ok(filter.includes('invert(1)'));
  const style = S.defaultVisual();
  style.route.paint = 'rainbow';
  const points = Array.from({ length: 20 }, (_, i) => ({ x: i * 20, y: i % 3 }));
  const runs = S.routeRuns(points, [0, 0], style);
  assert.ok(runs.length > 4, 'rainbow should produce multiple runs');
  assert.ok(new Set(runs.map((run) => run.color)).size > 4, 'rainbow colours should vary');
});

test('short wide exports scale overlay chrome down to fit', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [[0, 0], [100, 100]] }), 'x.json');
  const route = T.computeRoute(track, null, { mode: 'straight' });
  const layout = E.computeLayout({ track, route, width: 4096, height: 320 });
  assert.ok(layout.overlayK < layout.k, `overlay ${layout.overlayK} k ${layout.k}`);
  assert.ok(layout.overlayK * 150 < 320, 'title scrim should fit');
});

test('excluded map does not clamp the export view to map bounds', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [[2900, -2900], [2950, -2850]] }), 'x.json');
  const route = T.computeRoute(track, null, { mode: 'straight' });
  const base = { width: 1920, height: 1080, track, route };
  const map = { image: { naturalWidth: 1 }, bounds: { minX: -3000, maxX: 3000, minY: -3000, maxY: 3000 } };
  const withMap = E.computeView({ ...base, map, includeMap: true });
  const withoutMap = E.computeView({ ...base, map, includeMap: false });
  assert.ok(Math.abs(withMap.maxX - withoutMap.maxX) > 1, 'framing should differ when map is excluded');
});

test('current-view scope crops to the output aspect', () => {
  const view = E.computeView({
    width: 1000,
    height: 1000,
    scope: 'view',
    currentBounds: { minX: 0, maxX: 1600, minY: 0, maxY: 900 },
  });
  assert.ok(view.maxX - view.minX <= 1600);
  approx((view.maxX - view.minX) / (view.maxY - view.minY), 1, 1e-9);
});

console.log('road graph');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nodes.json'), 'utf8'));
const graph = T.buildGraph(raw);

test('graph stats', () => {
  assert.strictEqual(graph.stats.nodes, 30587);
  assert.ok(graph.stats.edges > 60000, `edges ${graph.stats.edges}`);
  assert.ok(graph.stats.highway > 1000);
  assert.ok(graph.stats.components > 1);
  assert.ok(graph.stats.mainComponentSize > 20000);
});

test('malformed adjacency entries are rejected', () => {
  throws(() => T.buildGraph({ v: [[0, 0, 0, 0, 0, [1.5]]] }), /邻接|无效/);
  throws(() => T.buildGraph({ v: [[0, 0, 0, 0, 0, [99]]] }), /邻接|无效/);
  assert.strictEqual(T.astar(graph, 99999, 99999), null);
});

test('component labels use weak connectivity for directed custom graphs', () => {
  const g = T.buildGraph({
    v: [
      [0, 0, 0, 0, 0, [1]],
      [10, 0, 0, 0, 0, []],
      [20, 0, 0, 0, 0, [1]],
    ],
  });
  assert.strictEqual(g.stats.components, 1);
  assert.strictEqual(g.components[0], g.components[1]);
  assert.strictEqual(g.components[1], g.components[2]);
});

test('nearest node and A*', () => {
  const snap = graph.nearest(-2427.6, -2474.8, 35.8, 50, true);
  assert.ok(snap, 'no nearest node');
  assert.ok(snap.dist < 10, `snap distance ${snap.dist}`);
  const huge = graph.nearest(-2427.6, -2474.8, 0, 1e9, false);
  assert.ok(huge, 'huge finite radius should still terminate');
  const noZ = graph.nearest(2287.4, -1605.9, NaN, 100, true);
  assert.ok(noZ, 'invalid z should not poison the nearest query');
  const a = graph.nearest(2287.4, -1605.9, 0, 100, false);
  const b = graph.nearest(1617.6, -1205.8, 0, 100, false);
  const route = graph.routeNodes(a.index, b.index);
  assert.ok(route, 'A* returned null');
  assert.ok(route.length > 100);
  assert.ok(route.nodes.length > 2);
  const cached = graph.routeNodes(a.index, b.index);
  assert.strictEqual(cached.cached, true);
});

test('snapping prefers the main road component over a nearby island', () => {
  const track = T.parseTrack(JSON.stringify({
    checkpoints: [
      [1944.2, 193.2, 32.5],
      [2287.4, -1605.9, 0],
    ],
  }), 'island-adjacent.json');
  const route = T.computeRoute(track, graph, { mode: 'auto', snapRadius: 80, smooth: 45, closed: false });
  assert.strictEqual(route.modeUsed, 'road');
  assert.ok(route.segments.every((segment) => segment.routed));
});

test('A* rejects different components and caches the failure', () => {
  assert.strictEqual(graph.routeNodes(19676, 19522), null);
  assert.strictEqual(graph.routeNodes(19676, 19522), null);
});

test('A* caches a same-component directed failure', () => {
  const g = T.buildGraph({
    v: [
      [0, 0, 0, 0, 0, [1]],
      [10, 0, 0, 0, 0, []],
      [20, 0, 0, 0, 0, [0]],
    ],
  });
  assert.strictEqual(g.routeNodes(1, 2), null);
  assert.strictEqual(g.routeNodes(1, 2), null);
  assert.ok(g.cache.has('1|2'));
});

test('island-local tracks do not mix main and island snaps per CP', () => {
  const a = raw.v[1228];
  const b = raw.v[958];
  const track = T.parseTrack(JSON.stringify({
    checkpoints: [[a[0], a[1], a[2]], [b[0], b[1], b[2]]],
  }), 'island-local.json');
  const route = T.computeRoute(track, graph, { mode: 'auto', snapRadius: 80, smooth: 45, closed: false });
  assert.strictEqual(route.modeUsed, 'road');
  assert.ok(route.segments.every((segment) => segment.routed));
});

test('a short island route is not detoured onto the mainland', () => {
  const a = raw.v[11065];
  const b = raw.v[11066];
  const track = T.parseTrack(JSON.stringify({
    checkpoints: [[a[0], a[1], a[2]], [b[0], b[1], b[2]]],
  }), 'island-short.json');
  const route = T.computeRoute(track, graph, { mode: 'auto', snapRadius: 80, smooth: 0, closed: false });
  assert.strictEqual(route.modeUsed, 'road');
  assert.ok(route.length < 100, `expected local route, got ${route.length}`);
});

test('sample loop routes on the road graph', () => {
  const sample = T.parseTrack(fs.readFileSync(path.join(ROOT, 'samples/los-santos-loop.json'), 'utf8'), 'sample.json');
  const route = T.computeRoute(sample, graph, { mode: 'auto', snapRadius: 80, smooth: 45, closed: true });
  assert.strictEqual(route.modeUsed, 'road');
  assert.ok(route.points.length > 100);
  assert.ok(route.length > 9000 && route.length < 11000, `length ${route.length}`);
  assert.ok(route.segments.every((s) => s.routed), 'some segment was not routed');
  assert.strictEqual(route.warnings.length, 0, JSON.stringify(route.warnings));
});

test('open route is shorter than the closed loop', () => {
  const sample = T.parseTrack(fs.readFileSync(path.join(ROOT, 'samples/los-santos-loop.json'), 'utf8'), 'sample.json');
  const closed = T.computeRoute(sample, graph, { mode: 'auto', snapRadius: 80, smooth: 45, closed: true });
  const open = T.computeRoute(sample, graph, { mode: 'auto', snapRadius: 80, smooth: 45, closed: false });
  assert.strictEqual(open.modeUsed, 'road');
  assert.ok(open.length < closed.length, 'open should be shorter');
  assert.strictEqual(open.cps[0].role, T.ROLE.START);
  assert.strictEqual(open.cps[open.cps.length - 1].role, T.ROLE.FINISH);
});

test('fully off-road auto falls back to straight with a warning', () => {
  const track = T.parseTrack(JSON.stringify({
    checkpoints: [[90000, 90000], [80000, -90000], [-90000, -90000]],
  }), 'offroad.json');
  const route = T.computeRoute(track, graph, { mode: 'auto', snapRadius: 60, smooth: 45, closed: false });
  assert.strictEqual(route.modeUsed, 'straight');
  assert.ok(route.warnings.some((w) => w.code === 'fallback' && w.reason === 'no-road'));
  assert.ok(route.segments.every((s) => !s.routed));
});

test('partially off-road auto keeps routed legs and fills gaps', () => {
  const track = T.parseTrack(fs.readFileSync(path.join(ROOT, 'samples/los-santos-loop.json'), 'utf8'), 'sample.json');
  track.checkpoints[5].x = 90000;
  track.checkpoints[5].y = 90000;
  track.checkpoints[5].hasZ = false;
  const route = T.computeRoute(track, graph, { mode: 'auto', snapRadius: 60, smooth: 45, closed: true });
  assert.strictEqual(route.modeUsed, 'road');
  assert.strictEqual(route.partial, true);
  assert.ok(route.segments.some((s) => s.routed), 'expected at least one road leg');
  assert.ok(route.segments.some((s) => !s.routed), 'expected at least one straight gap');
  assert.ok(route.warnings.some((w) => w.code === 'partial-road'));
});

test('road mode without a graph falls back to straight with a warning', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [[0, 0], [100, 100]] }), 'x.json');
  const route = T.computeRoute(track, null, { mode: 'road', snapRadius: 80, smooth: 45, closed: false });
  assert.strictEqual(route.modeUsed, 'straight');
  assert.ok(route.warnings.some((w) => w.code === 'fallback'));
});

test('failed first leg does not leave a dead-end spur from CP0', () => {
  const a = { x: graph.xs[0], y: graph.ys[0] };
  const b = { x: graph.xs[959], y: graph.ys[959] };
  const track = T.parseTrack(JSON.stringify({
    checkpoints: [[a.x + 40, a.y], [5, -2346], [b.x, b.y]],
  }), 'spur.json');
  const route = T.computeRoute(track, graph, { mode: 'auto', snapRadius: 80, smooth: 0, closed: false });
  assert.strictEqual(route.modeUsed, 'road');
  assert.strictEqual(route.segments[0].routed, false);
  approx(route.points[1].x, 5, 0.01);
  approx(route.points[1].y, -2346, 0.01);
  assert.ok(Math.hypot(route.points[1].x - a.x, route.points[1].y - a.y) > 20);
});

test('closed tracks with coincident points keep a renderable route', () => {
  const track = T.parseTrack(JSON.stringify({
    closed: true,
    checkpoints: [[0, 0], [0.05, 0], [0.1, 0]],
  }), 'tiny.json');
  const route = T.computeRoute(track, null, { mode: 'spline', closed: true });
  assert.ok(route.points.length >= 2, `points ${route.points.length}`);
  assert.ok(Number.isFinite(route.length));
});

test('spline, straight and single-point modes', () => {
  const track = T.parseTrack(JSON.stringify({ checkpoints: [[0, 0], [0, 100], [100, 100], [100, 0]] }), 'x.json');
  const spline = T.computeRoute(track, graph, { mode: 'spline', closed: true });
  assert.strictEqual(spline.modeUsed, 'spline');
  approx(spline.points[0].x, spline.points[spline.points.length - 1].x, 0.01);
  const straight = T.computeRoute(track, graph, { mode: 'straight', closed: false });
  assert.strictEqual(straight.modeUsed, 'straight');
  assert.strictEqual(straight.points.length, 4);
  const one = T.computeRoute(T.parseTrack('[[1,2,3]]', 'one.json'), graph, { mode: 'auto' });
  assert.strictEqual(one.modeUsed, 'point');
  assert.strictEqual(one.points.length, 1);

  const two = T.parseTrack('[[100,100],[200,200]]', 'two.json');
  const twoLoop = T.computeRoute(two, graph, { mode: 'spline', closed: true });
  assert.ok(twoLoop.points.length >= 3, 'closed 2-CP spline should include the return leg');
  approx(twoLoop.points[0].x, twoLoop.points[twoLoop.points.length - 1].x, 0.01);
  approx(twoLoop.points[0].y, twoLoop.points[twoLoop.points.length - 1].y, 0.01);
  approx(twoLoop.length, Math.hypot(100, 100) * 2, 0.5);
});

test('open route keeps a finish point near the start', () => {
  const track = T.parseTrack('[[0,0],[100,0],[0.1,0]]', 'near.json');
  const route = T.computeRoute(track, graph, { mode: 'straight', closed: false });
  assert.strictEqual(route.points.length, 3);
  approx(route.points[2].x, 0.1, 0.001);
});

test('malformed graph data has a localized error code', () => {
  assert.throws(() => T.buildGraph({ v: [null] }), (err) => err.code === 'graph-bad-data');
});

test('closed accepts common truthy spellings', () => {
  assert.strictEqual(T.parseTrack('{"closed":"1","checkpoints":[[1,2],[3,4]]}', 'x.json').closed, true);
  assert.strictEqual(T.parseTrack('{"loop":"yes","checkpoints":[[1,2],[3,4]]}', 'x.json').closed, true);
  assert.strictEqual(T.parseTrack('{"closed":0,"checkpoints":[[1,2],[3,4]]}', 'x.json').closed, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
