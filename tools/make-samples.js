#!/usr/bin/env node
// Build the bundled sample tracks from hand-picked road waypoints.
// The CPs are sampled along the computed road path, so every sample snaps
// cleanly to the vehicle graph. Run: node tools/make-samples.js
'use strict';

const fs = require('fs');
const path = require('path');
const Track = require('../js/track.js');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nodes.json'), 'utf8'));
const graph = Track.buildGraph(data);

const SAMPLES = [
  {
    file: 'los-santos-loop',
    name: 'Los Santos 环城',
    nameEn: 'Los Santos Loop',
    author: 'Track Layout',
    note: '海滩 → 东岸 → 市中心 → 南城 → 西城 → 北环，再回到海滩。',
    noteEn: 'Beach → east coast → downtown → south LS → west side → north loop, then back to the beach.',
    closed: true,
    waypoints: [
      [2287.4, -1605.9],
      [2399.8, -974.6],
      [1617.6, -1205.8],
      [1599.0, -2378.2],
      [395.6, -1587.1],
      [1201.0, -754.0],
    ],
  },
  {
    file: 'san-fierro-hills',
    name: 'San Fierro 山路',
    nameEn: 'San Fierro Hills',
    author: 'Track Layout',
    note: '市中心出发，绕西城、南城与东湾，穿过多段起伏山路。',
    noteEn: 'From downtown, around the west side, south city, and east bay over rolling hills.',
    closed: true,
    waypoints: [
      [-2143.2, 998.4],
      [-1899.0, 815.0],
      [-2606.6, 895.9],
      [-2003.6, 398.2],
      [-1673.6, 593.5],
      [-1689.0, 1187.0],
    ],
  },
  {
    file: 'las-venturas-strip',
    name: 'Las Venturas 大道',
    nameEn: 'Las Venturas Strip',
    author: 'Track Layout',
    note: '机场 → 南大道 → 东环 → 赌城大道，再回到机场。',
    noteEn: 'Airport → south strip → east loop → the Strip, then back to the airport.',
    closed: true,
    waypoints: [
      [1021.9, 2527.4],
      [1403.1, 1193.1],
      [2197.1, 1773.0],
      [1401.8, 2313.1],
    ],
  },
];

function snap(x, y) {
  const n = graph.nearest(x, y, 0, 150, false);
  if (!n) throw new Error(`no road node near ${x}, ${y}`);
  return n;
}

function concatRoute(nodes, closed) {
  const out = [];
  const seen = new Set();
  const push = (i) => {
    if (out.length && out[out.length - 1] === i) return;
    out.push(i);
  };
  for (let k = 0; k < nodes.length - 1; k++) {
    const r = graph.routeNodes(nodes[k].index, nodes[k + 1].index);
    if (!r) throw new Error(`no route ${nodes[k].index} -> ${nodes[k + 1].index}`);
    for (let j = k === 0 ? 0 : 1; j < r.nodes.length; j++) push(r.nodes[j]);
  }
  if (closed) {
    const r = graph.routeNodes(nodes[nodes.length - 1].index, nodes[0].index);
    if (!r) throw new Error('no closing route');
    for (let j = 1; j < r.nodes.length; j++) push(r.nodes[j]);
  }
  return out.map((i) => ({ x: graph.xs[i], y: graph.ys[i], z: graph.zs[i] }));
}

function cumulative(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return cum;
}

function nearestRoutePoint(points, cum, d) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const delta = Math.abs(cum[i] - d);
    if (delta < bestD) { bestD = delta; best = i; }
  }
  return points[best];
}

function sampleCps(points, waypointDistances, closed) {
  // Include every waypoint and the midpoint of every leg. Use real path nodes
  // (not interpolated points) so the nearest-node snap always lands on the
  // intended road instead of a side street.
  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  const marks = [...new Set(waypointDistances.map((d) => Math.max(0, Math.min(total, d))))].sort((a, b) => a - b);
  const out = [];
  const pushAt = (d) => {
    const p = nearestRoutePoint(points, cum, d);
    if (out.length && Math.hypot(out[out.length - 1].x - p.x, out[out.length - 1].y - p.y) < 2) return;
    out.push({
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round((p.z || 0) * 100) / 100,
    });
  };
  if (closed) {
    for (let i = 0; i < marks.length; i++) {
      const a = marks[i];
      const b = marks[(i + 1) % marks.length] + (i === marks.length - 1 ? total : 0);
      pushAt(a);
      pushAt((a + b) / 2);
    }
  } else {
    for (let i = 0; i < marks.length - 1; i++) {
      pushAt(marks[i]);
      pushAt((marks[i] + marks[i + 1]) / 2);
    }
    pushAt(marks[marks.length - 1]);
  }
  // A closed loop should not end with a duplicate of its first point.
  if (closed && out.length > 1) {
    const first = out[0], last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 2) out.pop();
  }
  return out;
}

function nearestDistance(points, cum, x, y) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].x - x) ** 2 + (points[i].y - y) ** 2;
    if (d < bestD) { bestD = d; best = cum[i]; }
  }
  return best;
}

function makeTrack(sample) {
  const snapped = sample.waypoints.map(([x, y]) => snap(x, y));
  const points = concatRoute(snapped, sample.closed);
  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  const waypointDistances = snapped.map((n) => nearestDistance(points, cum, n.x, n.y));
  const cps = sampleCps(points, waypointDistances, sample.closed);
  const track = Track.parseTrack(JSON.stringify({
    name: sample.name,
    author: sample.author,
    description: sample.note,
    closed: sample.closed,
    checkpoints: cps,
  }), `${sample.file}.json`);
  const route = Track.computeRoute(track, graph, {
    mode: 'auto', snapRadius: 80, smooth: 45, closed: sample.closed,
  });
  const ratio = route.length / total;
  console.log(`${sample.file}: waypoints ${sample.waypoints.length}, path ${total.toFixed(0)} m, cps ${cps.length}, re-route ${route.length.toFixed(0)} m (${(ratio * 100).toFixed(1)}%), ${route.modeUsed}, ${route.ms.toFixed(0)} ms`);
  if (route.modeUsed !== 'road') console.warn(`  ! ${sample.file} did not use the road graph`);
  if (ratio < 0.9) console.warn(`  ! ${sample.file} re-route is much shorter; CPs may be skipping a branch`);
  return { track: Track.toJSON(track), route, cps };
}

function main() {
  fs.mkdirSync(path.join(ROOT, 'samples'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'tools', 'debug'), { recursive: true });
  const index = [];
  for (const sample of SAMPLES) {
    const { track, route, cps } = makeTrack(sample);
    track.format = 'track-layout/v1';
    const outFile = path.join(ROOT, 'samples', `${sample.file}.json`);
    fs.writeFileSync(outFile, JSON.stringify(track, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(ROOT, 'tools', 'debug', `${sample.file}.json`), JSON.stringify({
      name: sample.name,
      closed: sample.closed,
      route: route.points.map((p) => [p.x, p.y]),
      cps: cps.map((p) => [p.x, p.y]),
    }), 'utf8');
    index.push({
      file: `${sample.file}.json`,
      name: sample.name,
      nameEn: sample.nameEn,
      note: sample.note,
      noteEn: sample.noteEn,
      cps: cps.length,
      length: Track.formatDistance(route.length),
    });
  }
  fs.writeFileSync(path.join(ROOT, 'samples', 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log('samples/index.json written');
}

main();
