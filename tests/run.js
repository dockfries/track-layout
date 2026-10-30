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

console.log('road graph');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nodes.json'), 'utf8'));
const graph = T.buildGraph(raw);

test('graph stats', () => {
  assert.strictEqual(graph.stats.nodes, 30587);
  assert.ok(graph.stats.edges > 60000, `edges ${graph.stats.edges}`);
  assert.ok(graph.stats.highway > 1000);
});

test('nearest node and A*', () => {
  const snap = graph.nearest(-2427.6, -2474.8, 35.8, 50, true);
  assert.ok(snap, 'no nearest node');
  assert.ok(snap.dist < 10, `snap distance ${snap.dist}`);
  const a = graph.nearest(2287.4, -1605.9, 0, 100, false);
  const b = graph.nearest(1617.6, -1205.8, 0, 100, false);
  const route = graph.routeNodes(a.index, b.index);
  assert.ok(route, 'A* returned null');
  assert.ok(route.length > 100);
  assert.ok(route.nodes.length > 2);
  const cached = graph.routeNodes(a.index, b.index);
  assert.strictEqual(cached.cached, true);
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
