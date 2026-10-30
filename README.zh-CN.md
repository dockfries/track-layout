# Track Layout · 赛道路线图工作台

**[English](README.md) · [简体中文](README.zh-CN.md)**

Track Layout 是一个纯前端的 **GTA San Andreas 赛道路线图生成器**。上传一份只包含 CP 点的赛道 JSON，它会自动把点吸附到游戏路网、用 A* 逐段寻路，画出可定制的赛道图，并导出 PNG / SVG。

> **纯 vibe coding 产物**：从架构、代码、调试到文档与示例，均由 AI 在对话中迭代生成；功能可用，但用于生产前请自行 review 与测试。

![Track Layout 深色界面](docs/preview.jpg)

> 灵感与底层数据来自 [neufox's Node Viewer](https://github.com/itsneufox/neufox-node-viewer) 与 [neufox's Rec Editor](https://github.com/itsneufox/neufox-rec-editor)：同样是纯 HTML/CSS/JS + Leaflet `CRS.Simple` + `samap.png`，没有构建步骤，也没有业务后端（`server.js` 只是本地静态文件服务器）。

## 功能

- **赛道 JSON 导入**：文件选择或直接拖入；容错支持数组、`checkpoints` / `cps` / `points`、`[x,y,z]`、`pos` / `position` 等写法。
- **自动路网寻路**：默认「自动」模式优先全程吸附 SA 车辆节点并 A* 寻路；局部无法吸附时仍尽量沿路网连接，缺口用直线补齐，并在「路线」页提示。也可以强制「路网 / 平滑 / 直线」。
- **闭环赛道**：勾选「闭环」后末点回到起点，首点变为起终点。
- **CP 编辑**：地图拖拽、坐标输入、上下移动、删除、地图点击加点；可一键显示 / 隐藏地图与导出中的检查点；侧栏列表支持折叠与虚拟滚动，几百个 CP 也不卡。
- **大量提示**：提示面板同样可折叠，检查点提示和路线提示都使用虚拟滚动，大列表下也保持流畅。
- **视觉定制**：6 套主题预设；路线纯色 / 沿线渐变 / 线性渐变 / 高程渐变，描边、辉光、虚线、方向箭头；CP 形状、大小、颜色、编号、名称；底图亮度 / 对比度 / 饱和度 / 色相 / 模糊 / 染色 / 网格；标题与图例。
- **PNG 导出**：16:9、4:3、1:1、9:16、4K，支持透明背景与「完整赛道 / 当前视图」取景。
- **SVG 导出**：路线、CP、标题、图例保持矢量；底图作为位图嵌入，也可以关闭底图得到纯矢量图。
- **自定义底图**：上传图片并设置坐标范围，用于其他游戏或自制地图。
- **示例库**：示例菜单支持模糊搜索、键盘导航和虚拟滚动；fork 后加入几百个示例也不会拖慢界面，侧栏只展示前几个并提供「全部示例」入口。
- **自动保存**：赛道、样式和导出设置保存在本浏览器 `localStorage`，刷新不丢。
- **堆叠提示**：连续操作最多同时显示 5 条顶部居中提示，多出的会排队，并按从旧到新的顺序消失。
- **快捷键面板**：按 `?` 或点击键盘图标，打开按场景分组的键盘快捷键说明。
- **滑杆助手**：双击滑杆恢复当前主题/默认值；点击右侧数字可手动输入精确值，并校验范围。
- **响应式地图**：窗口缩放做 180 ms 防抖，随后重新适配当前赛道；虚拟列表和比例尺也会同步刷新。
- **国际化**：默认根据浏览器 locale 选择语言（`zh*` → 简体中文，其他 → English）；右上角 `EN / 中文` 可手动切换。界面、地图标题/图例、CP 列表、提示、帮助和 PNG/SVG 导出文字都会跟随当前语言。
- **深色 / 浅色**：顶栏可选择 `跟随系统 / 深色 / 浅色`；`跟随系统` 跟随系统 `prefers-color-scheme` 并实时响应变化，选择保存在本浏览器。只影响工作台 UI，不改变地图本身的视觉主题。

## 快速开始

需要 Node.js 18+。页面本身是纯静态的，不需要构建，也不需要 `npm install`。

```bash
git clone https://github.com/dockfries/track-layout
cd track-layout

# 方式 A（推荐）：用 npx 临时启动 serve
npx --yes serve . -l 8173

# 方式 B：仓库自带的零依赖静态服务器
node server.js 8173
# 或 npm start
```

打开 <http://127.0.0.1:8173/>。首次打开会自动载入 Los Santos 环城示例。

- `npx serve` 首次运行会临时下载 `serve`，不会写入本仓库；之后可直接复用。
- `npm run serve` 等价于方式 A；`npm start` 等价于方式 B。
- 两种方式都只是静态文件服务器，不会上传赛道数据。
- 如果 8173 被占用，`serve` 可能会改用其它端口，以终端打印的地址为准。
- 必须通过 HTTP 打开：页面需要 `fetch('data/nodes.json')`，直接双击 `index.html` 会被浏览器的 `file://` 跨域策略拦住。

测试：

```bash
npm test
# 或 node tests/run.js
```

## Language / 国际化

- **默认语言**：首次访问根据浏览器 `navigator.languages` 判断。`zh`、`zh-CN`、`zh-Hans` 等中文 locale 显示简体中文；其他 locale 默认英文。
- **切换与记忆**：顶栏右侧的 `EN / 中文` 选择器可手动切换，选择保存在 `localStorage` 的 `track-layout:lang`。
- **覆盖范围**：静态界面、Tabs、帮助弹窗、地图标题/图例、CP 列表、路线提示、Toast、示例名称、主题名称，以及 PNG/SVG 导出里的标题/图例/CP 名称都会使用当前语言。
- **加新文案**：`js/i18n.js` 的 `EN` 字典把中文源文案映射到英文；帮助弹窗里的富文本在 `RICH`。新增 UI 文案时补对应条目即可。
- `html.i18n-pending` 会在语言应用前隐藏 UI，避免英文用户先看到中文闪烁。

## 外观 / Appearance

![浅色模式](docs/preview-light.jpg)

- 顶栏右侧的 `跟随系统 / 深色 / 浅色` 选择器切换工作台外观。
- `跟随系统` 使用系统 `prefers-color-scheme`；系统切换深/浅色时页面实时跟随。
- 手动选择保存在 `localStorage` 的 `track-layout:theme`，刷新后保持；改回 `跟随系统` 可重新跟随系统。
- 外观只影响工作台 UI（侧栏、弹窗、地图控件等）；地图标题、图例、CP 标记和导出画面仍由「样式」里的主题控制。

## 赛道 JSON 格式

最简形式是**有序的 CP 数组**，顺序即赛道顺序：

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

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `checkpoints` | 是* | 检查点数组。也接受 `cps` / `points` / `cp` / `waypoints`。 |
| `name` | 否 | 赛道名；缺省用文件名。 |
| `author` | 否 | 作者。 |
| `description` | 否 | 描述，仅保留在 JSON 中。 |
| `closed` | 否 | 是否闭环，默认 `false`。 |
| `map` | 否 | 地图名，默认 `san-andreas`。 |
| `checkpoints[].x` / `.y` | 是 | 世界坐标。`x` 向东，`y` 向北。 |
| `checkpoints[].z` | 否 | 高度；用于高程渐变和高度吸附。 |
| `checkpoints[].label` | 否 | 显示名称。 |
| `checkpoints[].radius` | 否 | 保留字段，原样保存。 |

\* 也允许顶层直接是数组：`[{ "x": 0, "y": 0 }, ...]`。

兼容写法：

```json
[
  [100, 200, 10],
  { "pos": [300, 400, 12] },
  { "position": { "x": 500, "y": 600, "z": 8 } },
  { "x": 700, "y": 800, "type": "finish", "label": "Finish" }
]
```

**角色由顺序决定，而不是 `type`**：非闭环时首点是起点、末点是终点；闭环时首点是起终点。`type` 会被解析但最终角色仍按顺序计算。

**CP 编号**：起点 / 终点使用 `S`、`F`、`S/F` 标签，普通检查点使用数组索引标签；侧栏、地图标记和路线提示共用这一套编号。

完整 JSON Schema 见 [`track.schema.json`](track.schema.json)。示例文件在 [`samples/`](samples/)。

## 路线计算

- 路网来自 `data/nodes.json`（由 `NODES0.DAT`–`NODES63.DAT` 提取，30,587 个车辆节点、约 6.3 万条有向连接）。
- 每个 CP 在 **吸附半径**（默认 80 m）内找最近的车辆节点；有 `z` 时会额外惩罚高度差。
- 相邻 CP 之间用 **A\*** 寻路，边权 = 2D 长度 × 两端节点权重均值：

  | 节点类型 | 权重 |
  | --- | --- |
  | 高速公路 | 0.8 |
  | 普通道路 | 1.0 |
  | 停车区 | 1.3 |
  | 应急车道 | 2.6 |
  | 水上路径 | 12 |

- **自动**模式优先全路段网 A*；如果部分 CP 无法吸附或路段不可达，仍尽量沿路网连接，缺口用直线补齐，并在「路线」页显示「部分路网」与具体原因。如果没有任何路段能走通，则用直线连接；只有路网不可用时才退回 **Catmull–Rom 平滑曲线**。
- **路网**模式逐段寻路，失败段用直线补齐，并在「路线」页列出原因。
- 路网模式下路线会做 Douglas–Peucker 简化 + 0–2 次 Chaikin 切角，得到更干净的赛道线；平滑度滑杆控制强度。
- 闭环会额外计算末点 → 起点。

限制：自定义底图只改变显示，不改变坐标系和路网；路网寻路仍使用 GTA SA 的车辆节点。空中、水上或自制地图赛道请用「平滑」或「直线」。

## 视觉样式

- **主题预设**：霓虹夜行、战术雷达、极简纸图、迈阿密落日、赛道蓝图、黑白高对比。
- **路线渐变**：
  - 纯色
  - 沿线：起点色 → 终点色沿路线长度渐变
  - 线性：按画布方向渐变
  - 高程：按 CP / 路线 `z` 高度渐变
- **路线层**：描边、辉光、虚线、方向箭头（间距 / 大小 / 颜色）。
- **检查点**：显示 / 隐藏、圆形 / 方形 / 菱形、大小、填充、边框、编号、名称、光晕、起点色、终点色。
- **底图**：亮度、对比度、饱和度、色相、模糊、染色强度、网格、背景色、显示开关；也可以上传自定义图片并设置 `minX/maxX/minY/maxY` 范围。自定义底图图片不会写入 `localStorage`（太大），刷新后需要重新选择；坐标范围会保存。
- **标题与图例**：显示开关、眉题、标题、副标题、文字/强调/背景色、背景不透明度、整体缩放、标题字号、副标题字号、图例底色。

样式状态可以保存到 JSON 吗？目前只自动保存在 `localStorage`；赛道 JSON 只包含赛道数据 (`保存 JSON`)，不包含视觉样式。

## 导出

点击「预览导出」会按当前输出尺寸重新渲染一张 PNG，并显示在弹窗中；「下载 PNG」「下载 SVG」使用同一套渲染逻辑。

- **PNG**：位图，支持透明背景、完整赛道 / 当前地图视图、16:9 / 4:3 / 1:1 / 9:16 / 4K 或自定义尺寸（最大 4096）。
- **SVG**：路线、CP、方向箭头、标题、图例都是矢量；底图会以当前滤镜/染色的裁切位图嵌入。关闭「包含底图」可得到纯矢量路线图。
- 导出会自动裁切到赛道范围并留白；如果赛道靠近地图边缘，会尽量把视口推回地图范围内，避免出现空白条。
- 整体缩放、标题字号、副标题字号、主题颜色、地图滤镜都会在导出中重新绘制，不会截屏。
- 超长标题和副标题会在导出中自动省略，避免超出画布边缘。

## 快捷键

| 键 | 作用 |
| --- | --- |
| `F` | 适配赛道 |
| `G` | 显示 / 隐藏网格 |
| `M` | 显示 / 隐藏底图 |
| `C` | 显示 / 隐藏检查点 |
| `+` / `=` | 进入 / 退出地图加点模式 |
| `Esc` | 取消加点 / 取消选中 / 关闭弹窗 |
| `Delete` | 删除当前选中的检查点 |
| `Ctrl/Cmd + O` | 打开 JSON |
| `?` | 打开快捷键面板 |

## 目录结构

```
README.md               英文说明
README.zh-CN.md         中文说明
LICENSE                 MIT 许可证
package.json            启动 / 测试脚本
.gitignore              本地缓存、调试和编辑器文件的忽略规则
index.html              页面骨架
style.css               界面样式
js/track.js             JSON 解析、路网、A*、平滑、几何
js/style.js             样式模型、主题、颜色、标记 SVG
js/i18n.js              中英文文案、浏览器 locale 检测、语言切换
js/mapview.js           Leaflet 地图渲染与 CP 交互
js/export.js            PNG / SVG 渲染器
js/app.js               应用状态与 UI 绑定
data/nodes.json         SA 车辆路网（运行必需，需要提交）
assets/samap.png        SA 底图（运行必需，需要提交）
assets/icons/           Lucide / Iconify 图标 sprite 与许可证
samples/                示例赛道 + index.json（需要提交）
docs/preview.jpg        README 深色截图
docs/preview-light.jpg  README 浅色截图
vendor/leaflet/         Leaflet 1.9.4（需要提交）
tools/make-samples.js   从路网重新生成示例
tests/run.js            解析 / 几何 / 寻路测试
server.js               本地静态服务器
track.schema.json       赛道 JSON Schema
```

### Git 忽略规则

`.gitignore` 只忽略本地产生的文件，例如 `node_modules/`、日志、构建缓存、`.env`、编辑器/系统文件、临时备份，以及 `tools/debug/`、`tools/edge-*/`、`tools/*-profile/` 这类无头浏览器测试产物。

`data/nodes.json`、`assets/samap.png`、`assets/icons/`、`docs/preview.jpg`、`docs/preview-light.jpg`、`samples/*.json` 和 `vendor/leaflet/` 是运行或展示所需资源，**需要保留在仓库中**，不要误删或加入忽略列表。

## 重新生成示例

示例 CP 是沿手工挑选的路点生成的真实路网路径（每个路点 + 每段中点），这样重新寻路时不会抄近道：

```bash
npm run samples
```

## Credits

本项目是 **纯 vibe coding** 生成：架构、代码、调试、文档与示例均由 AI 在对话中迭代完成，没有手工逐行编写的现成实现；使用前请自行 review / 测试。

### 参考项目

- **[neufox's Node Viewer](https://github.com/itsneufox/neufox-node-viewer)**：提供了 `samap.png`、`data/nodes.json`（由 `NODES0.DAT`–`NODES63.DAT` 提取）、Leaflet `CRS.Simple` 的 SA 地图呈现方式，以及车辆节点的 flags / 邻接结构。本项目的 CP 吸附、A* 路网寻路和赛道渲染是在这些数据与思路上的扩展。
- **[neufox's Rec Editor](https://github.com/itsneufox/neufox-rec-editor)**：提供了纯静态、无构建的页面组织方式，以及路径平滑 / 重采样 / 拖拽编辑等交互思路。本项目的 CP 编辑器、地图交互和导出流程参考了它。

### 数据与第三方

- `samap.png` 与 `data/nodes.json` 取自 `neufox-node-viewer`；路网由 GTA San Andreas 的 `NODES0.DAT`–`NODES63.DAT` 提取。
- 地图引擎为 [Leaflet](https://leafletjs.com/)，以 BSD-2-Clause 许可分发，源码在 `vendor/leaflet/`。
- UI 图标来自 [Lucide](https://lucide.dev/)，通过 [Iconify](https://iconify.design/) 获取并打包在 `assets/icons/sprite.svg`；Lucide 使用 ISC 许可，详见 `assets/icons/LICENSE`。
- GTA: San Andreas 及其地图、路网数据版权归 Rockstar Games 所有。本项目是非官方粉丝工具，与 Rockstar 无关。

## License

本项目源码、文档和由本项目生成的配置采用 **MIT License**，见 [LICENSE](LICENSE)。

MIT 仅覆盖本仓库中的源代码、文档和本项目生成的配置；以下内容不适用 MIT，仍归各自原始权利人所有：

- `assets/samap.png`、`data/nodes.json`：来自 `neufox-node-viewer` / GTA: San Andreas，版权归 Rockstar Games 及原项目作者。
- `docs/preview.jpg`、`docs/preview-light.jpg`：包含 GTA: San Andreas 地图画面的截图，不适用 MIT。
- `assets/icons/`：Lucide 图标，ISC 许可；详见 `assets/icons/LICENSE`。
- `vendor/leaflet/`：Leaflet，BSD-2-Clause；详见 `vendor/leaflet/LICENSE`。
- 示例赛道中的 GTA 坐标数据同样受原始游戏数据权利约束。

GTA 地图与路网数据仅作为非官方粉丝项目的一部分、并保留署名地提供；未额外授予再分发许可。发布 fork 或用于商业用途前，请自行确认拥有相应再分发权利。

## 隐私

赛道 JSON、拖入的图片、样式设置全部在浏览器本地处理；没有上传接口、没有分析脚本。唯一的外发请求是加载本地的 `data/nodes.json` / `samples/*.json` / 底图文件。
