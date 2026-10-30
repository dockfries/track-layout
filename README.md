# Track Layout · Race Route Studio

**[English](README.md) · [简体中文](README.zh-CN.md)**

Track Layout is a fully static **GTA San Andreas race-route map builder**. Give it a track JSON that only contains checkpoints; it snaps each CP to the game's road graph, routes between them with A*, renders a customizable route map, and exports PNG / SVG.

> **Pure vibe coding**: architecture, code, debugging, docs and samples were iterated by AI in conversation. It works, but review and test it before production use.

![Track Layout dark UI](docs/preview.jpg)

> Inspired by and built on data from [neufox's Node Viewer](https://github.com/itsneufox/neufox-node-viewer) and [neufox's Rec Editor](https://github.com/itsneufox/neufox-rec-editor): plain HTML/CSS/JS + Leaflet `CRS.Simple` + `samap.png`, with no build step and no application backend (`server.js` is only a local static file server).

## Features

- **Track JSON import**: choose a file or drop it in; tolerant parsing for arrays, `checkpoints` / `cps` / `points`, `[x,y,z]`, `pos` / `position`, and similar shapes.
- **Automatic road routing**: the default **Auto** mode prefers a full A* route over SA vehicle nodes. If some CPs cannot snap, it still keeps as much of the road network as possible, fills gaps with straight lines, and explains this under **Route**. You can also force **Road / Spline / Straight**.
- **Closed loops**: when **Closed loop** is enabled, the last point returns to the start and the first point becomes both start and finish.
- **CP editing**: drag on the map, edit coordinates, move up/down, delete, or add CPs by clicking the map. Show or hide checkpoints in both the map and the export; the sidebar list is collapsible and virtualized for tracks with hundreds of CPs.
- **Large warning sets**: the notes/warnings panel is collapsible too, and both warning lists virtualize their rows so large tracks stay responsive.
- **Visual customization**: 6 theme presets; solid / along-route / linear / elevation route gradients; outline, glow, dashes, direction arrows; CP shape, size, colors, numbering and labels; base-map brightness / contrast / saturation / hue / blur / tint / grid; title and legend.
- **PNG export**: 16:9, 4:3, 1:1, 9:16, 4K, transparent background, and **full track / current view** framing.
- **SVG export**: route, CPs, title and legend stay vector; the base map is embedded as a raster image, or turn it off for a pure-vector route map.
- **Custom base maps**: upload an image and set its coordinate bounds for other games or hand-made maps.
- **Autosave**: track, styles and export settings live in this browser's `localStorage` and survive reloads.
- **Internationalization**: first visit follows the browser locale (`zh*` → Simplified Chinese, everything else → English); the `EN / 中文` picker in the top bar overrides it. UI, map title/legend, CP list, notices, help and PNG/SVG export text all follow the active language.
- **Dark / light UI**: choose **System / Dark / Light** in the top bar. **System** follows `prefers-color-scheme` live, and the choice is remembered in this browser. This only affects the app chrome, not the route-map artwork itself.

## Quick Start

Requires Node.js 18+. The app is static: no build step and no `npm install` required.

```bash
git clone <repo-url>
cd track-layout

# Option A (recommended): temporary static server via npx
npx --yes serve . -l 8173

# Option B: the zero-dependency static server in this repo
node server.js 8173
# or: npm start
```

Open <http://127.0.0.1:8173/>. The first visit automatically loads the Los Santos Loop sample.

- `npx serve` downloads `serve` temporarily on first use; it does not write into this repo.
- `npm run serve` is equivalent to Option A; `npm start` is equivalent to Option B.
- Both options only serve static files. No track data is uploaded.
- If port 8173 is taken, `serve` may choose another port; use the URL printed in the terminal.
- Open the app over HTTP. It needs `fetch('data/nodes.json')`; double-clicking `index.html` will be blocked by the browser's `file://` restrictions.

Tests:

```bash
npm test
# or: node tests/run.js
```

## Language / Internationalization

- **Default language**: the first visit reads `navigator.languages`. Chinese locales such as `zh`, `zh-CN` and `zh-Hans` get Simplified Chinese; every other locale gets English.
- **Switch and remember**: use the `EN / 中文` picker in the top bar. The choice is stored in `localStorage` under `track-layout:lang`.
- **Coverage**: static UI, tabs, help dialog, map title/legend, CP list, route notices, toasts, sample names, theme names, and PNG/SVG title, legend and CP labels all follow the active language.
- **Adding strings**: `js/i18n.js` maps Chinese source strings to English in the `EN` dictionary; rich help HTML lives in `RICH`. Add an entry when you add UI copy.
- `html.i18n-pending` hides the UI until a language is applied, so English users do not see a flash of Chinese text.

## Appearance

![Light UI](docs/preview-light.jpg)

- Use the **System / Dark / Light** picker in the top bar to switch the workbench appearance.
- **System** follows `prefers-color-scheme` and updates live when the OS changes.
- Manual choices are stored in `localStorage` under `track-layout:theme` and survive reloads; choose **System** to follow the OS again.
- Appearance only affects the workbench UI (sidebar, dialogs, map controls, etc.). The map title, legend, CP markers and export artwork are still controlled by the themes under **Style**.

## Track JSON Format

The simplest form is an **ordered CP array**; array order is track order:

```json
{
  "name": "Los Santos Loop",
  "author": "your name",
  "closed": false,
  "checkpoints": [
    { "x": 2287.4, "y": -1605.9, "z": 2.6 },
    { "x": 1617.6, "y": -1205.8, "z": 51.8 },
    { "x": 1599.0,  "y": -2378.2, "z": 12.4 }
  ]
}
```

| Field | Required | Description |
| --- | --- | --- |
| `checkpoints` | yes* | Checkpoint array. Also accepts `cps` / `points` / `cp` / `waypoints`. |
| `name` | no | Track name; falls back to the file name. |
| `author` | no | Author. |
| `description` | no | Description; kept only in the JSON. |
| `closed` | no | Whether the track is a closed loop; default `false`. |
| `map` | no | Map name; default `san-andreas`. |
| `checkpoints[].x` / `.y` | yes | World coordinates. `x` is east, `y` is north. |
| `checkpoints[].z` | no | Elevation; used for elevation gradients and height-aware snapping. |
| `checkpoints[].label` | no | Display label. |
| `checkpoints[].radius` | no | Reserved field, preserved as-is. |

\* A top-level array is also accepted: `[{ "x": 0, "y": 0 }, ...]`.

Accepted variants:

```json
[
  [100, 200, 10],
  { "pos": [300, 400, 12] },
  { "position": { "x": 500, "y": 600, "z": 8 } },
  { "x": 700, "y": 800, "type": "finish", "label": "Finish" }
]
```

**Roles come from order, not `type`**: for an open track the first point is Start and the last is Finish; for a closed loop the first point is Start / Finish. `type` is parsed, but the final role is always determined by order.

**CP numbering**: Start / Finish use `S`, `F` and `S/F` badges; ordinary checkpoints use their array index. The sidebar, map markers and route notices all share this numbering.

See [`track.schema.json`](track.schema.json) for the full JSON Schema and [`samples/`](samples/) for examples.

## Routing

- The road graph comes from `data/nodes.json` (extracted from `NODES0.DAT`–`NODES63.DAT`: 30,587 vehicle nodes and about 63k directed connections).
- Each CP looks for its nearest vehicle node within the **snap radius** (80 m by default); when `z` is available, height difference adds a penalty.
- Adjacent CPs are connected with **A\***. Edge cost = 2D length × average of the two node weights:

  | Node type | Weight |
  | --- | --- |
  | Highway | 0.8 |
  | Normal road | 1.0 |
  | Parking | 1.3 |
  | Emergency lane | 2.6 |
  | Water path | 12 |

- **Auto** first tries a full road-network A* route. If some CPs cannot snap or some segments are unreachable, it keeps the reachable road parts, fills gaps with straight lines, and shows **partial road** plus the specific reasons under **Route**. If no leg at all can be routed, it uses straight connections. Only when the road graph is unavailable does it fall back to a **Catmull–Rom spline**.
- **Road** mode routes segment by segment, fills failed segments with straight lines, and lists the reasons under **Route**.
- Road routes are simplified with Douglas–Peucker and 0–2 Chaikin corner-cutting passes for a cleaner race line; the smoothing slider controls the strength.
- Closed loops additionally route the last point back to the start.

Limitation: a custom base map only changes the display, not the coordinate system or the road graph. Routing still uses GTA SA vehicle nodes. Use **Spline** or **Straight** for air, water or hand-made maps.

## Visual Styling

- **Theme presets**: Neon Night, Tactical Radar, Paper Map, Miami Sunset, Blueprint, Mono.
- **Route gradients**:
  - Solid
  - Along route: start color → finish color over route length
  - Linear: gradient in canvas direction
  - Elevation: gradient by CP / route `z`
- **Route layer**: outline, glow, dashes, direction arrows (spacing / size / color).
- **Checkpoints**: show / hide, circle / square / diamond, size, fill, border, numbering, labels, halo, start color, finish color.
- **Base map**: brightness, contrast, saturation, hue, blur, tint strength, grid, background color, visibility; upload a custom image and set `minX/maxX/minY/maxY`. Custom images are not written to `localStorage` (too large); re-select them after reload, while bounds are saved.
- **Title & legend**: show switches, eyebrow, title, subtitle, text/accent/background colors, background opacity, overall scale, title font size, subtitle font size, legend background.

Can visual styles be saved to JSON? Currently they are autosaved in `localStorage` only; **Save JSON** contains track data, not visual styles.

## Export

**Preview export** renders a fresh PNG at the current output size in a dialog; **Download PNG** and **Download SVG** use the same renderer.

- **PNG**: raster output, transparent background, full track / current map view, 16:9 / 4:3 / 1:1 / 9:16 / 4K or custom sizes (up to 4096).
- **SVG**: route, CPs, arrows, title and legend stay vector; the base map is embedded as a cropped raster with current filters/tint. Turn off **Include base map** for a pure-vector route map.
- Exports crop to the track bounds with padding; near map edges the viewport is pushed back inside the map where possible to avoid blank strips.
- Title scale, title/subtitle font sizes, theme colors and map filters are re-rendered for export, not screenshotted.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `F` | Fit track |
| `G` | Show / hide grid |
| `M` | Show / hide base map |
| `C` | Show / hide checkpoints |
| `+` / `=` | Enter / leave map add-CP mode |
| `Esc` | Cancel add mode / clear selection / close dialog |
| `Delete` | Delete the selected checkpoint |
| `Ctrl/Cmd + O` | Open JSON |

## Project Structure

```
README.md               English documentation
README.zh-CN.md         Simplified Chinese documentation
LICENSE                 MIT license
package.json            start / test scripts
.gitignore              ignores for local caches, debugging and editor files
index.html              page shell
style.css               workbench styling
js/track.js             JSON parsing, road graph, A*, smoothing, geometry
js/style.js             style model, themes, colors, marker SVG
js/i18n.js              EN/ZH strings, browser locale detection, language switch
js/mapview.js           Leaflet map rendering and CP interaction
js/export.js            PNG / SVG renderer
js/app.js               app state and UI wiring
data/nodes.json         SA vehicle road graph (required, commit it)
assets/samap.png        SA base map (required, commit it)
assets/icons/           Lucide / Iconify sprite and license
samples/                sample tracks + index.json (commit them)
docs/preview.jpg        dark README screenshot
docs/preview-light.jpg  light README screenshot
vendor/leaflet/         Leaflet 1.9.4 (commit it)
tools/make-samples.js   regenerate samples from the road graph
tests/run.js            parser / geometry / routing tests
server.js               local static server
track.schema.json       track JSON Schema
```

### Git Ignore Rules

`.gitignore` only excludes local artifacts such as `node_modules/`, logs, build caches, `.env`, editor/OS files, temporary backups, and headless-browser artifacts such as `tools/debug/`, `tools/edge-*/` and `tools/*-profile/`.

`data/nodes.json`, `assets/samap.png`, `assets/icons/`, `docs/preview.jpg`, `docs/preview-light.jpg`, `samples/*.json` and `vendor/leaflet/` are required runtime or documentation assets. **Keep them in the repository**; do not delete them or add them to the ignore list.

## Regenerating Samples

Sample CPs are real road-graph paths built from hand-picked waypoints (each waypoint plus each segment midpoint), so re-routing cannot cut corners:

```bash
npm run samples
```

## Credits

**Pure vibe coding**: architecture, code, debugging, docs and samples were iterated by AI in conversation; there is no hand-written line-by-line implementation. Review and test before use.

### Reference Projects

- **[neufox's Node Viewer](https://github.com/itsneufox/neufox-node-viewer)**: provided `samap.png`, `data/nodes.json` (extracted from `NODES0.DAT`–`NODES63.DAT`), the Leaflet `CRS.Simple` map presentation, and the vehicle-node flags / adjacency structure. This project extends those data and ideas with CP snapping, A* routing and route rendering.
- **[neufox's Rec Editor](https://github.com/itsneufox/neufox-rec-editor)**: provided the static, no-build page organization and interaction ideas around path smoothing / resampling / drag editing. The CP editor, map interaction and export flow here reference it.

### Data and Third-Party Assets

- `samap.png` and `data/nodes.json` come from `neufox-node-viewer`; the road graph was extracted from GTA San Andreas `NODES0.DAT`–`NODES63.DAT`.
- Map engine: [Leaflet](https://leafletjs.com/), BSD-2-Clause, vendored under `vendor/leaflet/`.
- UI icons: [Lucide](https://lucide.dev/), fetched through [Iconify](https://iconify.design/) and bundled in `assets/icons/sprite.svg`. Lucide uses the ISC license; see `assets/icons/LICENSE`.
- GTA: San Andreas and its map/road data are owned by Rockstar Games. This is an unofficial fan tool and is not affiliated with Rockstar.

## License

Source code, documentation and configuration generated by this project are released under the **MIT License**; see [LICENSE](LICENSE).

MIT covers this repository's source, docs and generated configuration only. The following retain their original rights:

- `assets/samap.png`, `data/nodes.json`: from `neufox-node-viewer` / GTA: San Andreas; rights belong to Rockstar Games and the original project authors.
- `docs/preview.jpg`, `docs/preview-light.jpg`: screenshots containing GTA: San Andreas map imagery; not covered by MIT.
- `assets/icons/`: Lucide icons, ISC license; see `assets/icons/LICENSE`.
- `vendor/leaflet/`: Leaflet, BSD-2-Clause; see `vendor/leaflet/LICENSE`.
- GTA coordinate data in sample tracks is subject to the original game-data rights as well.

The GTA map and road data are included for this unofficial fan project with attribution. No separate redistribution license is granted for them; confirm that you have the right to redistribute them before publishing a fork or using them commercially.

## Privacy

Track JSON, dropped images and style settings are processed entirely in the browser. There is no upload endpoint and no analytics. The only external requests are for local `data/nodes.json`, `samples/*.json` and base-map files.
