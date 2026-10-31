// Track Layout: interface languages. English is the default. UI code uses
// semantic English keys in MESSAGES; STATIC_TEXT maps the legacy Chinese text
// in the static HTML to English as a fallback. The UI follows the browser
// locale (zh* -> Chinese, everything else -> English) unless the user picks one.
(function (root) {
  'use strict';

  const I18N_LANGS = { en: 'EN', zh: '中文' };
  const STORAGE_KEY = 'track-layout:lang';

  // Semantic message keys. English is the source language; zh values are the translations.
  const MESSAGES = {
    "action.delete": { en: "Delete", zh: "删除" },
    "action.moveDown": { en: "Move down", zh: "下移" },
    "action.moveUp": { en: "Move up", zh: "上移" },
    "app.title": { en: "Track Layout · Race Route Studio", zh: "Track Layout · 赛道路线图工作台" },
    "aria.numericInput": { en: "Enter a numeric value", zh: "手动输入数值" },
    "common.loading": { en: "Loading…", zh: "载入中…" },
    "cp.added": { en: "Added {0}", zh: "已添加 {0}" },
    "cp.empty": { en: "No checkpoints yet. Open a JSON file or use \"Add on map\".", zh: "还没有检查点。打开 JSON，或点「地图添加」。" },
    "cp.finish": { en: "Finish", zh: "终点" },
    "cp.keepAtLeastOne": { en: "Keep at least one checkpoint", zh: "至少保留一个检查点" },
    "cp.loaded": { en: "Loaded {0} · {1} checkpoints", zh: "已载入 {0} · {1} 个检查点" },
    "cp.loop": { en: "Start / Finish", zh: "起终点" },
    "cp.minTwo": { en: "Load at least two checkpoints first", zh: "先载入至少两个检查点" },
    "cp.newBlank": { en: "Created a blank track", zh: "已新建空白赛道" },
    "cp.newConfirm": { en: "Creating a new track clears the current track (style and export settings are kept). Continue?", zh: "新建会清空当前赛道（样式与导出设置会保留），继续？" },
    "cp.notSnapped": { en: "Not snapped", zh: "未吸附" },
    "cp.redo": { en: "Redid the checkpoint edit", zh: "已重做检查点编辑" },
    "cp.snapDistance": { en: "Snap {0}m", zh: "路网 {0}m" },
    "cp.start": { en: "Start", zh: "起点" },
    "cp.undo": { en: "Undid the checkpoint edit", zh: "已撤销检查点编辑" },
    "cp.untitled": { en: "Untitled track", zh: "未命名赛道" },
    "dialog.clearCache": { en: "Clearing local cache will remove the track, styles, theme, and language settings, then reload. Continue?", zh: "清除本地缓存会删除赛道、样式、主题和语言设置，并刷新页面。继续？" },
    "error.boundsInvalid": { en: "Invalid bounds: max must be greater than min", zh: "范围无效：max 必须大于 min" },
    "error.coordRange": { en: "Coordinates must be between -100000 and 100000", zh: "坐标必须在 -100000 到 100000 之间" },
    "error.checkpointsEmpty": { en: "Checkpoint array is empty", zh: "检查点数组是空的" },
    "error.copyFailed": { en: "Copy failed; select the text manually", zh: "复制失败，请手动选择文本" },
    "error.customMapFirst": { en: "Choose a custom base map first", zh: "请先选择一张自定义底图" },
    "error.fileProtocol": { en: "Start a local server (node server.js) and open it over HTTP; file:// cannot load the road graph.", zh: "请通过 node server.js 启动本地服务器后访问，file:// 无法读取路网数据" },
    "error.graphBadData": { en: "Road graph data has an invalid format", zh: "路网数据格式不正确" },
    "error.imageDecode": { en: "Could not decode the image", zh: "图片无法解码" },
    "error.imageFile": { en: "Choose an image file", zh: "请选择图片文件" },
    "error.imageTooLarge": { en: "Image is too large (30 MB max)", zh: "图片太大（上限 30 MB）" },
    "error.jsonParse": { en: "JSON parse failed: {0}", zh: "JSON 解析失败：{0}" },
    "error.jsonParseNear": { en: "JSON parse failed near character {0}: {1}", zh: "JSON 解析失败（第 {0} 个字符附近）：{1}" },
    "error.load": { en: "Load failed: {0}", zh: "载入失败：{0}" },
    "error.loadTrackFirst": { en: "Load or create a track first", zh: "先载入或创建一个赛道" },
    "error.noCheckpoints": { en: "No checkpoint array found: use checkpoints / cps / points, or a top-level JSON array", zh: "找不到检查点数组：需要 checkpoints / cps / points 其中之一，或直接使用 JSON 数组" },
    "error.pngCreate": { en: "The browser could not create the PNG", zh: "浏览器无法生成 PNG" },
    "error.pngExport": { en: "PNG export failed: {0}", zh: "PNG 导出失败：{0}" },
    "error.pointBadXY": { en: "Checkpoint {0} has an invalid x / y value", zh: "第 {0} 个检查点的 x / y 不是有效数字" },
    "error.pointBadZ": { en: "Checkpoint {0} has an invalid z value", zh: "第 {0} 个检查点的 z 不是有效数字" },
    "error.pointNoCoords": { en: "Checkpoint {0} has no coordinates: use {x, y, z} or [x, y, z]", zh: "第 {0} 个检查点没有坐标：需要 {x, y, z} 或 [x, y, z]" },
    "error.pointTooFar": { en: "Checkpoint {0} at {1}, {2} is far outside the map", zh: "第 {0} 个检查点坐标 {1}, {2} 远超地图范围" },
    "error.preview": { en: "Preview failed: {0}", zh: "预览失败：{0}" },
    "error.readImage": { en: "Could not read the image", zh: "读取图片失败" },
    "error.roadGraphFailed": { en: "Road graph failed to load: {0}. Spline/straight modes still work.", zh: "路网载入失败：{0}。仍可使用平滑 / 直线模式。" },
    "error.routeFailed": { en: "Route calculation failed: {0}", zh: "路线计算失败：{0}" },
    "error.sampleLoad": { en: "Sample failed: {0}", zh: "示例载入失败：{0}" },
    "error.svgExport": { en: "SVG export failed: {0}", zh: "SVG 导出失败：{0}" },
    "error.trackFileEmpty": { en: "Track file is empty", zh: "赛道文件是空的" },
    "error.trackFileNotText": { en: "Track file is not text", zh: "赛道文件不是文本" },
    "error.valueRange": { en: "Value must be between {0} and {1}", zh: "数值必须在 {0}–{1} 之间" },
    "field.checkpointCount": { en: "Checkpoints", zh: "检查点数" },
    "field.checkpoints": { en: "Checkpoints", zh: "检查点" },
    "field.computeTime": { en: "Compute time", zh: "计算耗时" },
    "field.length": { en: "Length", zh: "总长度" },
    "field.routeLength": { en: "Route length", zh: "路线长度" },
    "field.routePoints": { en: "Route points", zh: "路线点数" },
    "field.routing": { en: "Routing", zh: "计算方式" },
    "hint.export.png": { en: "PNG: easy to share; supports transparent backgrounds and 2×/4K output.", zh: "PNG：适合直接分享；支持透明背景与 2× / 4K 输出。" },
    "hint.export.redraw": { en: "Export re-renders at the chosen resolution; map filters, gradients, and text are baked in.", zh: "导出会按输出分辨率重新绘制，底图滤镜、渐变与文字都会一并烘焙。" },
    "hint.export.svg": { en: "SVG: route, CPs, title, and legend stay vector; the base map is embedded as a bitmap — good for print or further editing.", zh: "SVG：路线、CP、标题与图例保持矢量；底图以位图嵌入，适合印刷或二次编辑。" },
    "hint.export.svgMap": { en: "SVG embeds the base map as a bitmap; turn off \"Include base map\" for a pure vector route.", zh: "SVG 会把底图作为嵌入位图；关闭「包含底图」可得到纯矢量路线图。" },
    "hint.mode.auto": { en: "Auto: prefer a full A* route; if some CPs cannot snap, keep as much road as possible and fill gaps with straight lines.", zh: "自动：优先全程走 A*；无法全程吸附时尽量沿路网连接，缺口用直线补齐。" },
    "hint.mode.road": { en: "Road: snap each CP to vehicle nodes and route with A*; failed segments fall back to straight lines.", zh: "路网：逐段吸附到车辆道路节点并 A* 寻路；失败的路段用直线补齐。" },
    "hint.mode.spline": { en: "Spline: a Catmull-Rom curve through all CPs; good for air, water, or custom maps.", zh: "平滑：用 Catmull-Rom 曲线穿过所有 CP，适合空中、水上或自制地图。" },
    "hint.mode.straight": { en: "Straight: connect CPs in order; good for quick drafts.", zh: "直线：按顺序直接连接 CP，适合快速草图。" },
    "hint.numericEdit": { en: "Click to enter a value", zh: "点击手动输入" },
    "hint.playbackSpeedDefault": { en: "Double-click to reset to 1.0×", zh: "双击恢复 1.0×" },
    "hint.preview": { en: "Click \"Preview export\" to see the final image", zh: "点击「预览导出」查看最终画面" },
    "hint.sliderDefault": { en: "Double-click to reset to the default", zh: "双击恢复默认值" },
    "label.customImage": { en: "Custom image", zh: "自定义图片" },
    "label.exportPreview": { en: "Export preview", zh: "导出预览" },
    "label.mapExcluded": { en: "Base map excluded", zh: "未包含底图" },
    "label.mapIncluded": { en: "Base map included in export", zh: "底图已包含在导出中" },
    "label.notSelected": { en: "Not selected", zh: "未选择" },
    "label.pngPreview": { en: "PNG preview", zh: "PNG 预览" },
    "meta.description": { en: "Import GTA San Andreas track JSON, route CPs along the road graph, style the map, and export PNG / SVG.", zh: "导入 GTA San Andreas 赛道 JSON，自动沿路网计算 CP 路线，定制视觉风格并导出 PNG / SVG。" },
    "mode.auto": { en: "Auto", zh: "自动" },
    "mode.empty": { en: "Empty", zh: "空" },
    "mode.point": { en: "Single point", zh: "单点" },
    "mode.roadAStar": { en: "Road A*", zh: "路网 A*" },
    "mode.roadAStarPartial": { en: "Road A* · partial", zh: "路网 A* · 部分" },
    "mode.spline": { en: "Spline", zh: "平滑曲线" },
    "mode.straight": { en: "Straight", zh: "直线连接" },
    "sample.all": { en: "All {0} samples", zh: "全部 {0} 个示例" },
    "sample.count": { en: "{0} samples", zh: "{0} 个示例" },
    "sample.countFiltered": { en: "{0} / {1} samples", zh: "{0} / {1} 个示例" },
    "sample.loaded": { en: "Loaded sample: {0}", zh: "已载入示例：{0}" },
    "sample.noMatch": { en: "No matching samples", zh: "没有匹配的示例" },
    "sample.listLabel": { en: "Sample list", zh: "示例列表" },
    "ui.mapLabel": { en: "Track map", zh: "赛道地图" },
    "sample.none": { en: "No samples available", zh: "没有可用示例" },
    "status.calculating": { en: "Calculating route…", zh: "计算路线…" },
    "status.calculatingGraph": { en: "Calculating route (loading road graph)…", zh: "计算路线（路网载入中）…" },
    "status.exportFailed": { en: "Export failed", zh: "导出失败" },
    "status.routeFailed": { en: "Route calculation failed", zh: "路线计算失败" },
    "status.loadingRoadGraph": { en: "Loading road graph…", zh: "路网载入中…" },
    "status.loadingRoadGraphData": { en: "Loading road graph data…", zh: "载入路网数据…" },
    "status.noTrack": { en: "No track loaded", zh: "还没有赛道" },
    "status.pngExported": { en: "PNG exported", zh: "PNG 已导出" },
    "status.previewFailed": { en: "Preview failed", zh: "预览失败" },
    "status.previewReady": { en: "Preview ready", zh: "预览已生成" },
    "status.ready": { en: "Ready", zh: "准备就绪" },
    "status.renderingPng": { en: "Rendering PNG…", zh: "渲染 PNG…" },
    "status.renderingPreview": { en: "Rendering preview…", zh: "渲染预览…" },
    "status.renderingSvg": { en: "Rendering SVG…", zh: "渲染 SVG…" },
    "status.roadGraphFailed": { en: "Road graph failed to load", zh: "路网载入失败" },
    "status.roadGraphNodes": { en: "Road graph · {0} nodes", zh: "路网 {0} 节点" },
    "status.roadGraphNotUsed": { en: "Road graph not used", zh: "未使用路网" },
    "status.roadGraphReady": { en: "Road graph ready · {0} ms", zh: "路网已就绪 · {0} ms" },
    "status.roadGraphUnavailable": { en: "Road graph unavailable", zh: "路网不可用" },
    "status.routeReady": { en: "Route ready · {0}", zh: "路线就绪 · {0}" },
    "status.routeReadyPartial": { en: "Route ready · {0} · partial road", zh: "路线就绪 · {0} · 部分路网" },
    "status.svgExported": { en: "SVG exported", zh: "SVG 已导出" },
    "status.svgExportFailed": { en: "SVG export failed", zh: "SVG 导出失败" },
    "toast.exported": { en: "Exported {0}", zh: "已导出 {0}" },
    "toast.mapBoundsUpdated": { en: "Base map bounds updated", zh: "底图范围已更新" },
    "toast.mapLoaded": { en: "Base map loaded: {0}", zh: "已载入底图：{0}" },
    "toast.specCopied": { en: "Example JSON copied", zh: "示例 JSON 已复制" },
    "toast.themeRestored": { en: "Restored theme: {0}", zh: "已还原主题：{0}" },
    "toast.themeChanged": { en: "Theme: {0}", zh: "已切换主题：{0}" },
    "theme.custom": { en: "Custom", zh: "自定义" },
    "theme.basedOn": { en: "Based on {0}", zh: "基于{0}" },
    "theme.restore": { en: "Restore preset", zh: "还原预设" },
    "theme.reset": { en: "Reset", zh: "重置" },
    "theme.restoreHint": { en: "Restore to “{0}”", zh: "还原为「{0}」" },
    "theme.resetHint": { en: "Reset to “{0}”", zh: "重置为「{0}」" },
    "toast.trackSaved": { en: "Track JSON saved", zh: "赛道 JSON 已保存" },
    "unit.points": { en: "{0} pts", zh: "{0} 点" },
    "unit.segments": { en: "{0}/{1} segments", zh: "{0}/{1} 段" },
    "warning.allSegmentsRoad": { en: "All segments use the road graph.", zh: "所有路段都已使用路网。" },
    "warning.autoSpline": { en: "Could not snap the whole track to the road graph; using a smooth spline", zh: "未能全程吸附到路网，已自动改用平滑曲线" },
    "warning.duplicate": { en: "{0} is at the same position as the previous one", zh: "{0} 与上一个位置重复" },
    "warning.duplicateStart": { en: "{0} is at the same position as the start", zh: "{0} 与起点位置重复" },
    "warning.emptyRoute": { en: "Load a track to see segments that could not be routed.", zh: "载入赛道后，这里会列出无法寻路的路段。" },
    "warning.emptyTrack": { en: "Load a track to see checkpoint and snapping notes.", zh: "载入赛道后，这里会列出检查点与路网吸附的提示。" },
    "warning.noIssues": { en: "No obvious issues.", zh: "没有发现明显问题。" },
    "warning.noRoadAtAll": { en: "No segment could use the road graph; connected with straight lines", zh: "没有任何路段能使用路网，已用直线连接" },
    "warning.noSnap": { en: "{0}: no drivable road node within {1}m", zh: "{0}：{1}m 内没有可驾驶道路节点" },
    "warning.baseMapMissing": { en: "The base map is unavailable; exporting without it.", zh: "底图不可用，将不包含底图导出。" },
    "warning.outsideMap": { en: "{0} ({1}, {2}) is outside the San Andreas map", zh: "{0} ({1}, {2}) 在 San Andreas 地图边界之外" },
    "warning.partialRoad": { en: "Could not snap the whole track to the road graph; kept as much road as possible and filled the gaps with straight lines", zh: "未能全程吸附到路网，已尽量沿路网连接，缺口用直线补齐" },
    "warning.roadGraphNotLoadedLine": { en: "Road graph is not loaded; connected with straight lines", zh: "路网数据尚未载入，已用直线连接" },
    "warning.roadGraphNotLoadedSpline": { en: "Road graph is not loaded; using a smooth spline", zh: "路网数据尚未载入，已使用平滑曲线" },
    "warning.roadGraphUnavailable": { en: "Road graph unavailable; connected with straight lines", zh: "路网不可用，已用直线连接" },
    "warning.unreachable": { en: "No road route from {0} to {1}; connected with a straight line", zh: "{0} → {1} 路网不可达，已用直线连接" },
    "warning.unreachableClosed": { en: "No road route from {0} to {1}; closed with a straight line", zh: "{0} → {1} 路网不可达，已用直线闭合" },
    "warning.usingNoGraph": { en: "Using {0}; road snapping is not used.", zh: "当前使用{0}，不依赖路网吸附。" },
    "playback.play": { en: "Play route animation", zh: "播放路线动画" },
    "playback.pause": { en: "Pause animation", zh: "暂停动画" },
    "playback.playShort": { en: "Play", zh: "播放" },
    "playback.pauseShort": { en: "Pause", zh: "暂停" },
    "cp.expand": { en: "Expand checkpoints", zh: "展开检查点" },
    "cp.collapse": { en: "Collapse checkpoints", zh: "折叠检查点" },
    "cp.lockDrag": { en: "Lock map CP dragging (L)", zh: "锁定地图 CP 拖动 (L)" },
    "cp.unlockDrag": { en: "Unlock map CP dragging (L)", zh: "解锁地图 CP 拖动 (L)" },
    "cp.locked": { en: "Checkpoint dragging locked", zh: "检查点拖动已锁定" },
    "cp.unlocked": { en: "Checkpoint dragging unlocked", zh: "检查点拖动已解锁" },
    "warning.expand": { en: "Expand notes", zh: "展开提示" },
    "warning.collapse": { en: "Collapse notes", zh: "折叠提示" },
    "toast.mapShown": { en: "Base map shown", zh: "底图已显示" },
    "toast.mapHidden": { en: "Base map hidden", zh: "底图已隐藏" },
    "toast.gridShown": { en: "Grid shown", zh: "网格已显示" },
    "toast.gridHidden": { en: "Grid hidden", zh: "网格已隐藏" },
    "toast.cpShown": { en: "Checkpoints shown", zh: "已显示检查点" },
    "toast.cpHidden": { en: "Checkpoints hidden", zh: "已隐藏检查点" },
    "label.route": { en: "Route", zh: "路线" },
    "label.startFinish": { en: "Start / Finish", zh: "起点 / 终点" },
    "label.endpoints": { en: "Both ends", zh: "起终点" },
    "cp.snapDistanceLong": { en: "Snap {0} m", zh: "吸附 {0} m" },
    "playback.playing": { en: "Playing", zh: "播放中" },
    "playback.paused": { en: "Paused", zh: "已暂停" },
    "playback.finished": { en: "Finished", zh: "已结束" },
    "playback.replay": { en: "Replay route animation", zh: "重播路线动画" },
    "playback.replayShort": { en: "Replay", zh: "重播" },
    "playback.stop": { en: "Stop animation", zh: "停止动画" },
    "lightbox.enterFullscreen": { en: "Fullscreen", zh: "全屏" },
    "lightbox.exitFullscreen": { en: "Exit fullscreen", zh: "退出全屏" },
    "preview.updating": { en: "Updating preview…", zh: "正在更新预览…" },
    "sheet.resize": { en: "Resize panel height", zh: "调整面板高度" },
    "sheet.expand": { en: "Expand panel", zh: "展开面板" },
    "sheet.collapse": { en: "Collapse panel", zh: "收起面板" },
    "side.expand": { en: "Expand sidebar", zh: "展开侧栏" },
    "side.collapse": { en: "Collapse sidebar", zh: "收起侧栏" },
    "warning.collapseRoute": { en: "Collapse route notes", zh: "折叠路段提示" },
    "warning.expandRoute": { en: "Expand route notes", zh: "展开路段提示" },
  };

  const STATIC_TEXT = {
    // ── brand / document ──
    'Track Layout · 赛道路线图工作台': 'Track Layout · Race Route Studio',
    '赛道路线图工作台': 'Race Route Studio',
    '导入 GTA San Andreas 赛道 JSON，自动沿路网计算 CP 路线，定制视觉风格并导出 PNG / SVG。':
      'Import GTA San Andreas track JSON, route CPs along the road graph, style the map, and export PNG / SVG.',

    // ── top bar / toolbar ──
    '打开 JSON': 'Open JSON',
    '示例': 'Samples',
    '搜索示例…': 'Search samples…',
    '搜索示例': 'Search samples',
    '清空搜索': 'Clear search',
    '没有匹配的示例': 'No matching samples',
    '{0} 个示例': '{0} samples',
    '{0} / {1} 个示例': '{0} / {1} samples',
    '全部 {0} 个示例': 'All {0} samples',
    '载入中…': 'Loading…',
    '适配赛道 (F)': 'Fit track (F)',
    '赛道 JSON 格式': 'Track JSON format',
    '键盘快捷键': 'Keyboard shortcuts',
    '键盘快捷键 (?)': 'Keyboard shortcuts (?)',
    '常用操作都集中在这里。输入框获得焦点时，单键快捷键不会触发。':
      'All common actions are collected here. Single-key shortcuts are ignored while an input has focus.',
    '查看': 'View',
    '适配赛道': 'Fit track',
    '显示 / 隐藏底图': 'Show / hide base map',
    '显示 / 隐藏网格': 'Show / hide grid',
    '显示 / 隐藏检查点': 'Show / hide checkpoints',
    '编辑': 'Edit',
    '进入 / 退出地图加点模式': 'Enter / leave map add-CP mode',
    '取消加点 / 关闭菜单或弹窗': 'Cancel add mode / close menu or dialog',
    '删除选中的检查点': 'Delete selected checkpoint',
    '撤销': 'Undo',
    '重做': 'Redo',
    '撤销上一步': 'Undo last step',
    '撤销检查点编辑': 'Undo checkpoint edit',
    '重做检查点编辑': 'Redo checkpoint edit',
    '路线动画': 'Route animation',
    '播放': 'Play',
    '暂停': 'Pause',
    '播放路线动画': 'Play route animation',
    '暂停动画': 'Pause animation',
    '重置动画': 'Reset animation',
    '播放速度': 'Playback speed',
    '双击恢复 1.0×': 'Double-click to reset to 1.0×',
    '箭头动画仅用于地图预览，不影响导出画面。':
      'The arrow animation is for the map preview only and does not affect exports.',
    '先载入至少两个检查点': 'Load at least two checkpoints first',
    '撤销检查点编辑 (Ctrl/Cmd+Z)': 'Undo checkpoint edit (Ctrl/Cmd+Z)',
    '重做检查点编辑 (Ctrl/Cmd+Shift+Z)': 'Redo checkpoint edit (Ctrl/Cmd+Shift+Z)',
    '撤销 (Ctrl/Cmd+Z)': 'Undo (Ctrl/Cmd+Z)',
    '重做 (Ctrl/Cmd+Shift+Z)': 'Redo (Ctrl/Cmd+Shift+Z)',
    '锁定 / 解锁地图 CP 拖动': 'Lock / unlock map CP dragging',
    '锁定地图 CP 拖动 (L)': 'Lock map CP dragging (L)',
    '解锁地图 CP 拖动 (L)': 'Unlock map CP dragging (L)',
    '检查点拖动已锁定': 'Checkpoint dragging locked',
    '检查点拖动已解锁': 'Checkpoint dragging unlocked',
    '已撤销上一步': 'Undid the last step',
    '已重做': 'Redid the last step',
    '已撤销检查点编辑': 'Undid the checkpoint edit',
    '已重做检查点编辑': 'Redid the checkpoint edit',
    '清除缓存': 'Clear cache',
    '清除本地缓存': 'Clear local cache',
    '清除本地缓存会删除赛道、样式、主题和语言设置，并刷新页面。继续？':
      'Clearing local cache will remove the track, styles, theme, and language settings, then reload. Continue?',
    '文件': 'File',
    '打开此快捷键面板': 'Open this shortcuts panel',
    '示例搜索': 'Sample search',
    '在搜索结果中上下选择': 'Move through search results',
    '载入当前示例': 'Load the current sample',
    '清空搜索 / 关闭示例菜单': 'Clear search / close sample menu',
    '按 ? 随时打开': 'Press ? anytime to open',
    '点击地图放置检查点': 'Click the map to place a checkpoint',
    '取消': 'Cancel',
    '点击地图添加检查点': 'Add a checkpoint on the map',
    '显示 / 隐藏检查点 (C)': 'Show / hide checkpoints (C)',
    '显示检查点': 'Show checkpoints',
    '已显示检查点': 'Checkpoints shown',
    '已隐藏检查点': 'Checkpoints hidden',
    '显示 / 隐藏底图 (M)': 'Show / hide base map (M)',
    '显示 / 隐藏网格 (G)': 'Show / hide grid (G)',
    '语言': 'Language',

    // ── empty state ──
    '把 CP 点变成一张赛道路线图': 'Turn checkpoint data into a race route map',
    '拖入赛道 JSON，工具会沿 San Andreas 路网自动寻路，按你的风格渲染，并导出 PNG / SVG。':
      'Drop a track JSON. It routes along the San Andreas road graph, styles the map, and exports PNG / SVG.',
    '打开赛道 JSON': 'Open track JSON',
    '载入示例': 'Load sample',
    '格式：': 'Format:',
    '查看说明': 'View docs',

    // ── tabs / panes ──
    '赛道': 'Track',
    '路线': 'Route',
    '样式': 'Style',
    '导出': 'Export',
    '上传 JSON，按顺序连接检查点': 'Upload JSON; connect checkpoints in order',
    '路网载入中…': 'Loading road graph…',
    '赛道名称': 'Track name',
    '未命名赛道': 'Untitled track',
    '作者': 'Author',
    '可选': 'Optional',
    '保存 JSON': 'Save JSON',
    '新建': 'New',
    '格式说明': 'Format docs',
    '示例赛道': 'Sample tracks',
    '检查点': 'Checkpoints',
    '＋ 地图添加': '＋ Add on map',
    '地图添加': 'Add on map',
    '折叠检查点': 'Collapse checkpoints',
    '展开检查点': 'Expand checkpoints',
    '折叠提示': 'Collapse notes',
    '展开提示': 'Expand notes',
    '还没有检查点。打开 JSON，或点「地图添加」。':
      'No checkpoints yet. Open a JSON file or use "Add on map".',
    '首点为起点，末点为终点。拖动地图上的编号可微调位置，↑↓ 调整顺序；点击侧栏中的检查点行可在地图上高亮。':
      'The first point is the start and the last is the finish. Drag a number on the map to adjust it, use ↑↓ to reorder; click a checkpoint row in the sidebar to highlight it on the map.',
    '提示': 'Notes',
    '自动保存在本浏览器 · 赛道数据不会上传': 'Saved automatically in this browser · track data is never uploaded',

    // ── route pane ──
    '从 CP 自动生成可驾驶路径': 'Generate a drivable route from CPs',
    '计算方式': 'Routing',
    '自动': 'Auto',
    '跟随系统': 'System',
    '深色': 'Dark',
    '浅色': 'Light',
    '路网': 'Road',
    '平滑': 'Spline',
    '直线': 'Straight',
    '自动：优先全程走 A*；无法全程吸附时尽量沿路网连接，缺口用直线补齐。':
      'Auto: prefer a full A* route; if some CPs cannot snap, keep as much road as possible and fill gaps with straight lines.',
    '路网：逐段吸附到车辆道路节点并 A* 寻路；失败的路段用直线补齐。':
      'Road: snap each CP to vehicle nodes and route with A*; failed segments fall back to straight lines.',
    '平滑：用 Catmull-Rom 曲线穿过所有 CP，适合空中、水上或自制地图。':
      'Spline: a Catmull-Rom curve through all CPs; good for air, water, or custom maps.',
    '直线：按顺序直接连接 CP，适合快速草图。':
      'Straight: connect CPs in order; good for quick drafts.',
    '路线参数': 'Route settings',
    '路网吸附半径': 'Snap radius',
    '平滑度': 'Smoothing',
    '闭环赛道（末点回到起点）': 'Closed loop (last point returns to start)',
    '重新计算': 'Recalculate',
    '总长度': 'Length',
    '路线长度': 'Route length',
    '检查点数': 'Checkpoints',
    '路线点数': 'Route points',
    '计算耗时': 'Compute time',
    '路网覆盖': 'Road coverage',
    '所有路段都已使用路网。': 'All segments use the road graph.',
    '当前使用{0}，不依赖路网吸附。': 'Using {0}; road snapping is not used.',
    '未使用路网': 'Road graph not used',
    '载入赛道后，这里会列出检查点与路网吸附的提示。':
      'Load a track to see checkpoint and snapping notes.',
    '载入赛道后，这里会列出无法寻路的路段。':
      'Load a track to see segments that could not be routed.',
    '没有发现明显问题。': 'No obvious issues.',
    '路网来自 GTA SA 的 NODES0–63 车辆节点；寻路权重会避开水上与应急道路。':
      'Road graph from GTA SA NODES0–63 vehicle nodes; routing penalizes water and emergency roads.',

    // ── style pane ──
    '路线、检查点与底图的视觉风格': 'Visual style for route, checkpoints, and base map',
    '重置': 'Reset',
    '主题预设': 'Theme presets',
    '底图': 'Base map',
    '标题与图例': 'Title & legend',
    '渐变方式': 'Gradient',
    '纯色': 'Solid',
    '沿线': 'Along path',
    '线性': 'Linear',
    '高程': 'Elevation',
    '主色': 'Primary',
    '渐变终点色': 'Gradient end',
    '线性渐变角度': 'Linear gradient angle',
    '线宽': 'Line width',
    '不透明度': 'Opacity',
    '背景不透明度': 'Background opacity',
    '描边 / 边框': 'Outline / border',
    '描边颜色': 'Outline color',
    '描边宽度': 'Outline width',
    '辉光': 'Glow',
    '辉光颜色': 'Glow color',
    '辉光范围': 'Glow size',
    '虚线': 'Dashes',
    '方向箭头': 'Direction arrows',
    '箭头间距': 'Arrow spacing',
    '箭头大小': 'Arrow size',
    '箭头颜色': 'Arrow color',
    '形状': 'Shape',
    '圆形': 'Circle',
    '方形': 'Square',
    '菱形': 'Diamond',
    '大小': 'Size',
    '填充': 'Fill',
    '边框': 'Border',
    '数字': 'Number',
    '起点': 'Start',
    '终点': 'Finish',
    '显示范围': 'Display range',
    '全部': 'All',
    '区分起终点配色': 'Distinguish start / finish colors',
    '彩虹': 'Rainbow',
    '反色': 'Invert',
    '彩虹模式使用连续光谱光轨，主色 / 渐变终点色不参与。':
      'Rainbow uses a continuous spectrum; primary and gradient-end colours are ignored.',
    '全部＝起点、终点和中间 CP；起终点＝只显示首尾；起点 / 终点＝只显示各自。仅影响地图与导出标记，侧栏仍保留全部检查点。':
      'All = start, finish and intermediate CPs; Both ends = start and finish only; Start / Finish = that end only. Affects map and export markers; the sidebar still lists every checkpoint.',
    '边框粗细': 'Border width',
    '显示编号': 'Show numbers',
    '显示名称': 'Show labels',
    '名称颜色': 'Label color',
    '外圈光晕': 'Halo',
    '光晕颜色': 'Halo color',
    '光晕强度': 'Halo opacity',
    '底图来源': 'Base map source',
    '内置 SA 地图': 'Built-in SA map',
    '自定义图片': 'Custom image',
    '选择图片…': 'Choose image…',
    '未选择': 'Not selected',
    '应用范围': 'Apply bounds',
    '自定义底图用于其他游戏或自制地图；路网寻路仍使用 GTA SA 坐标系。刷新后需重新选择图片。':
      'Custom base maps work for other games or hand-made maps; routing still uses SA coordinates. Re-select the image after refresh.',
    '显示底图': 'Show base map',
    '底图透明度': 'Base map opacity',
    '亮度': 'Brightness',
    '对比度': 'Contrast',
    '饱和度': 'Saturation',
    '色相偏移': 'Hue shift',
    '模糊': 'Blur',
    '染色': 'Tint',
    '背景': 'Background',
    '染色强度': 'Tint strength',
    '网格': 'Grid',
    '网格颜色': 'Grid color',
    '网格透明度': 'Grid opacity',
    '显示标题': 'Show title',
    '眉题': 'Eyebrow',
    '标题（留空使用赛道名称）': 'Title (blank = track name)',
    '留空 = 赛道名称': 'Blank = track name',
    '副标题（留空自动生成）': 'Subtitle (auto if blank)',
    '留空 = CP 数量 · 长度': 'Blank = CP count · length',
    '文字': 'Text',
    '强调': 'Accent',
    '标题缩放': 'Title scale',
    '整体缩放': 'Overall scale',
    '标题字号': 'Title size',
    '副标题字号': 'Subtitle size',
    '双击恢复默认值': 'Double-click to reset to the default',
    '点击手动输入': 'Click to enter a value',
    '手动输入数值': 'Enter a numeric value',
    '数值必须在 {0}–{1} 之间': 'Value must be between {0} and {1}',
    '显示图例': 'Show legend',
    '图例文字': 'Legend text',
    '图例底色': 'Legend background',

    // ── export pane ──
    '按输出分辨率重新渲染，所见即所得': 'Re-rendered at output resolution; WYSIWYG',
    '格式': 'Format',
    'PNG 位图': 'PNG bitmap',
    'SVG 矢量': 'SVG vector',
    'PNG：适合直接分享；支持透明背景与 2× / 4K 输出。':
      'PNG: easy to share; supports transparent backgrounds and 2×/4K output.',
    'SVG：路线、CP、标题与图例保持矢量；底图以位图嵌入，适合印刷或二次编辑。':
      'SVG: route, CPs, title, and legend stay vector; the base map is embedded as a bitmap — good for print or further editing.',
    'SVG 会把底图作为嵌入位图；关闭「包含底图」可得到纯矢量路线图。':
      'SVG embeds the base map as a bitmap; turn off "Include base map" for a pure vector route.',
    '导出会按输出分辨率重新绘制，底图滤镜、渐变与文字都会一并烘焙。':
      'Export re-renders at the chosen resolution; map filters, gradients, and text are baked in.',
    '画布尺寸': 'Canvas size',
    '自定义…': 'Custom…',
    '宽': 'Width',
    '高': 'Height',
    '取景范围': 'Framing',
    '完整赛道': 'Full track',
    '当前地图视图': 'Current map view',
    '完整赛道会自动留白并适配画布比例。': 'Full track adds margin and fits the canvas aspect.',
    '跟随主题': 'Theme',
    '透明': 'Transparent',
    '自定义': 'Custom',
    '背景色': 'Background color',
    '包含底图': 'Include base map',
    '输出': 'Output',
    '预览导出': 'Preview export',
    '下载 PNG': 'Download PNG',
    '下载 SVG': 'Download SVG',
    '点击「预览导出」查看最终画面': 'Click "Preview export" to see the final image',
    '准备就绪': 'Ready',

    // ── drop overlay ──
    '松开以载入': 'Drop to load',
    '赛道 JSON 或底图图片': 'Track JSON or base map image',

    // ── help dialog ──
    '兼容写法': 'Accepted variants',
    '坐标系': 'Coordinate system',
    '路网计算': 'Road routing',
    '复制示例 JSON': 'Copy example JSON',
    '载入示例赛道': 'Load sample track',

    // ── dialogs / preview ──
    '关闭': 'Close',
    '导出预览': 'Export preview',
    'PNG 预览': 'PNG preview',
    '底图已包含在导出中': 'Base map included in export',
    '未包含底图': 'Base map excluded',

    // ── runtime status / toasts ──
    '计算路线…': 'Calculating route…',
    '计算路线（路网载入中）…': 'Calculating route (loading road graph)…',
    '路线就绪 · {0}': 'Route ready · {0}',
    '路线计算失败：{0}': 'Route calculation failed: {0}',
    '已载入 {0} · {1} 个检查点': 'Loaded {0} · {1} checkpoints',
    '已载入示例：{0}': 'Loaded sample: {0}',
    '示例载入失败：{0}': 'Sample failed: {0}',
    '载入失败：{0}': 'Load failed: {0}',
    '已添加 {0}': 'Added {0}',
    '至少保留一个检查点': 'Keep at least one checkpoint',
    '新建会清空当前赛道（样式与导出设置会保留），继续？':
      'Creating a new track clears the current track (style and export settings are kept). Continue?',
    '已新建空白赛道': 'Created a blank track',
    '已切换主题：{0}': 'Theme: {0}',
    '样式已重置': 'Style reset',
    '底图已显示': 'Base map shown',
    '底图已隐藏': 'Base map hidden',
    '网格已显示': 'Grid shown',
    '网格已隐藏': 'Grid hidden',
    '请选择图片文件': 'Choose an image file',
    '图片太大（上限 30 MB）': 'Image is too large (30 MB max)',
    '读取图片失败': 'Could not read the image',
    '图片无法解码': 'Could not decode the image',
    '已载入底图：{0}': 'Base map loaded: {0}',
    '范围无效：max 必须大于 min': 'Invalid bounds: max must be greater than min',
    '请先选择一张自定义底图': 'Choose a custom base map first',
    '底图范围已更新': 'Base map bounds updated',
    '没有可用示例': 'No samples available',
    '还没有赛道': 'No track loaded',
    '赛道 JSON 已保存': 'Track JSON saved',
    '先载入或创建一个赛道': 'Load or create a track first',
    '渲染预览…': 'Rendering preview…',
    '预览已生成': 'Preview ready',
    '预览失败': 'Preview failed',
    '预览失败：{0}': 'Preview failed: {0}',
    '渲染 PNG…': 'Rendering PNG…',
    'PNG 已导出': 'PNG exported',
    '已导出 {0}': 'Exported {0}',
    '浏览器无法生成 PNG': 'The browser could not create the PNG',
    '导出失败': 'Export failed',
    'PNG 导出失败：{0}': 'PNG export failed: {0}',
    '渲染 SVG…': 'Rendering SVG…',
    'SVG 已导出': 'SVG exported',
    'SVG 导出失败': 'SVG export failed',
    'SVG 导出失败：{0}': 'SVG export failed: {0}',
    '载入路网数据…': 'Loading road graph data…',
    '路网 {0} 节点': 'Road graph · {0} nodes',
    '路网已就绪 · {0} ms': 'Road graph ready · {0} ms',
    '路网不可用': 'Road graph unavailable',
    '路网载入失败': 'Road graph failed to load',
    '路网载入失败：{0}。仍可使用平滑 / 直线模式。':
      'Road graph failed to load: {0}. Spline/straight modes still work.',
    '示例 JSON 已复制': 'Example JSON copied',
    '复制失败，请手动选择文本': 'Copy failed; select the text manually',
    '请通过 node server.js 启动本地服务器后访问，file:// 无法读取路网数据':
      'Start a local server (node server.js) and open it over HTTP; file:// cannot load the road graph.',

    // ── modes / units ──
    '路网 A*': 'Road A*',
    '路网 A* · 部分': 'Road A* · partial',
    '部分路网': 'partial road',
    '路线就绪 · {0} · 部分路网': 'Route ready · {0} · partial road',
    '平滑曲线': 'Spline',
    '直线连接': 'Straight',
    '单点': 'Single point',
    '空': 'Empty',
    '{0} 点': '{0} pts',
    '{0}/{1} 段': '{0}/{1} segments',
    '路网 {0}m': 'Snap {0}m',
    '未吸附': 'Not snapped',
    '上移': 'Move up',
    '下移': 'Move down',
    '删除': 'Delete',
    '起点 / 终点': 'Start / Finish',
    '起终点': 'Both ends',
    '吸附 {0} m': 'Snap {0} m',

    // ── warnings ──
    '{0} 与上一个位置重复': '{0} is at the same position as the previous one',
    '{0} ({1}, {2}) 在 San Andreas 地图边界之外':
      '{0} ({1}, {2}) is outside the San Andreas map',
    '{0}：{1}m 内没有可驾驶道路节点':
      '{0}: no drivable road node within {1}m',
    '{0} → {1} 路网不可达，已用直线连接':
      'No road route from {0} to {1}; connected with a straight line',
    '{0} → {1} 路网不可达，已用直线闭合':
      'No road route from {0} to {1}; closed with a straight line',
    '未能全程吸附到路网，已自动改用平滑曲线':
      'Could not snap the whole track to the road graph; using a smooth spline',
    '未能全程吸附到路网，已尽量沿路网连接，缺口用直线补齐':
      'Could not snap the whole track to the road graph; kept as much road as possible and filled the gaps with straight lines',
    '路网数据尚未载入，已使用平滑曲线':
      'Road graph is not loaded; using a smooth spline',
    '路网不可用，已用直线连接': 'Road graph unavailable; connected with straight lines',
    '没有任何路段能使用路网，已用直线连接':
      'No segment could use the road graph; connected with straight lines',
    '路网数据尚未载入，已用直线连接':
      'Road graph is not loaded; connected with straight lines',

    // ── track parser errors ──
    '赛道文件不是文本': 'Track file is not text',
    '赛道文件是空的': 'Track file is empty',
    '找不到检查点数组：需要 checkpoints / cps / points 其中之一，或直接使用 JSON 数组':
      'No checkpoint array found: use checkpoints / cps / points, or a top-level JSON array',
    '检查点数组是空的': 'Checkpoint array is empty',
    '第 {0} 个检查点没有坐标：需要 {x, y, z} 或 [x, y, z]':
      'Checkpoint {0} has no coordinates: use {x, y, z} or [x, y, z]',
    '第 {0} 个检查点的 x / y 不是有效数字':
      'Checkpoint {0} has an invalid x / y value',
    '第 {0} 个检查点坐标 {1}, {2} 远超地图范围':
      'Checkpoint {0} at {1}, {2} is far outside the map',
    '第 {0} 个检查点的 z 不是有效数字':
      'Checkpoint {0} has an invalid z value',
    '路网数据格式不正确': 'Road graph data has an invalid format',
    'JSON 解析失败（第 {0} 个字符附近）：{1}':
      'JSON parse failed near character {0}: {1}',
    'JSON 解析失败：{0}': 'JSON parse failed: {0}',
    '路段提示': 'Route notes',
    '折叠路段提示': 'Collapse route notes',
    '展开路段提示': 'Expand route notes',
    '停止动画': 'Stop animation',
    '地图跟随播放': 'Follow playback',
    '拖动或缩放地图会自动关闭跟随。': 'Dragging or zooming the map turns following off.',
    '画布尺寸预设': 'Canvas size preset',
    '选择赛道 JSON': 'Choose a track JSON file',
    '选择自定义底图': 'Choose a custom base map',
    '赛道地图': 'Track map',
    '示例列表': 'Sample list',
    '右下角水印': 'Bottom-right watermark',
    '完整赛道会自动留白并适配画布比例；当前地图视图会按输出比例居中裁切。':
      'Full track pads to the canvas aspect; the current map view is center-cropped to the output aspect.',
    'GitHub 源码': 'GitHub source',
    '操作菜单': 'Actions',
    '适配': 'Fit',
    '帮助': 'Help',
    '快捷键': 'Shortcuts',
    '全屏预览': 'Fullscreen preview',
    '打开全屏预览': 'Open fullscreen preview',
    '点击全屏预览': 'Click for fullscreen preview',
    '缩小': 'Zoom out',
    '放大': 'Zoom in',
    '重置缩放': 'Reset zoom',
    '全屏': 'Fullscreen',
    '退出全屏': 'Exit fullscreen',
    '可缩放导出预览': 'Zoomable export preview',
    '标题位置': 'Title position',
    '图例位置': 'Legend position',
    '水平偏移': 'Horizontal offset',
    '垂直偏移': 'Vertical offset',
    '左上': 'Top left',
    '上中': 'Top center',
    '右上': 'Top right',
    '左下': 'Bottom left',
    '下中': 'Bottom center',
    '右下': 'Bottom right',
    '偏移量单位为画布宽高的百分比，正数向右 / 向下。':
      'Offsets are percentages of canvas width/height; positive values move right / down.',
    '正在更新预览…': 'Updating preview…',
    '调整面板高度': 'Resize panel height',
    '展开面板': 'Expand panel',
    '收起面板': 'Collapse panel',
    '展开侧栏': 'Expand sidebar',
    '收起侧栏': 'Collapse sidebar',
    '拖动平移 · 滚轮 / 双指缩放 · 双击切换 · Esc 关闭':
      'Drag to pan · wheel / pinch to zoom · double-click to toggle · Esc to close',
    '启用单键快捷键': 'Enable single-key shortcuts',
    '关闭后仍可使用 Ctrl / Cmd 组合键、Delete 和 Esc。':
      'Ctrl / Cmd shortcuts, Delete, and Esc still work when this is off.',
    'Theme / 主题': 'Theme',
    'Sections / 分区': 'Sections',
    '倍速只改变时间轴，帧率跟随浏览器刷新率；0.1× 时箭头位移很小是正常的。':
      'Speed changes the timeline only; rendering stays at the browser refresh rate. At 0.1× the arrow moves very slowly by design.',
  };

  // Rich-text blocks (help dialog) keep inline <code>; keyed separately so the
  // text walker does not translate the fragments around the tags.
  const RICH = {
    'help.intro': {
      en: 'The tool only needs an ordered checkpoint array. Each point requires <code>x</code> and <code>y</code>; <code>z</code> is optional. The order is the track order: the first point is the start and the last is the finish (for a closed loop, the first point is start/finish).',
      zh: '工具只需要一个有序的检查点数组。每个点必填 <code>x</code>、<code>y</code>，<code>z</code> 可选；顺序即赛道顺序，首点为起点、末点为终点（闭环时首点为起终点）。',
    },
    'help.v1': {
      en: 'Top-level array: <code>[{ "x": 0, "y": 0 }, ...]</code>',
      zh: '顶层直接放数组：<code>[{ "x": 0, "y": 0 }, ...]</code>',
    },
    'help.v2': {
      en: 'Array keys: <code>checkpoints</code>, <code>cps</code>, <code>points</code>, <code>cp</code>, <code>waypoints</code>.',
      zh: '数组键名可用 <code>checkpoints</code>、<code>cps</code>、<code>points</code>、<code>cp</code>、<code>waypoints</code>。',
    },
    'help.v3': {
      en: 'Point forms: <code>[x, y, z]</code>, <code>{ "pos": [x, y, z] }</code>, <code>{ "position": { "x": … } }</code>.',
      zh: '点位可用 <code>[x, y, z]</code>、<code>{ "pos": [x, y, z] }</code>、<code>{ "position": { "x": … } }</code>。',
    },
    'help.v4': {
      en: '<code>type</code> may be <code>start</code> / <code>cp</code> / <code>finish</code>, but the final role is determined by order.',
      zh: '<code>type</code> 可写 <code>start</code> / <code>cp</code> / <code>finish</code>，但最终角色由顺序决定。',
    },
    'help.v5': {
      en: 'Optional fields: <code>label</code> (display name), <code>radius</code> (reserved).',
      zh: '可选字段：<code>label</code>（显示名称）、<code>radius</code>（保留字段）。',
    },
    'help.coords': {
      en: 'GTA San Andreas: <code>x</code> east, <code>y</code> north, <code>z</code> up; the map spans about −3000…3000. Routing uses SA vehicle nodes; a custom base map only changes the display, not the coordinates.',
      zh: 'GTA San Andreas：<code>x</code> 向东，<code>y</code> 向北，<code>z</code> 向上，地图范围约 −3000…3000。路网寻路使用 SA 的车辆节点；自定义底图只改变显示，不改变坐标系。',
    },
    'help.routing': {
      en: 'Each CP snaps to the nearest vehicle node (80 m by default), then A* routes segment by segment. If a CP cannot snap or a segment is unreachable, Auto keeps the road-connected parts and fills the gaps with straight lines, then lists the reason under Route. It does not replace the whole track with a spline just because one CP is off-road.',
      zh: '每个 CP 会吸附到最近的车辆道路节点（默认 80 m），然后用 A* 逐段寻路；如果某个 CP 无法吸附或某段不可达，自动模式会保留已连通的路网、把缺口用直线补齐，并在「路线」页列出原因，而不会因为一个 CP 偏离路网就整条改用平滑曲线。',
    },
  };

  let i18nLang = 'en';
  let originalText = new WeakMap();
  let originalAttrs = new WeakMap();
  let originalRich = new WeakMap();

  function normalizeLang(lang) {
    return I18N_LANGS[lang] ? lang : 'en';
  }

  function detectLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && I18N_LANGS[saved]) return saved;
    } catch { /* storage unavailable */ }
    let langs = [];
    try {
      langs = (navigator.languages && navigator.languages.length)
        ? Array.from(navigator.languages)
        : [navigator.language || 'en'];
    } catch { langs = ['en']; }
    return /^zh(-|$)/i.test(String(langs[0] || 'en')) ? 'zh' : 'en';
  }

  function t(key, ...args) {
    const message = MESSAGES[key];
    let out = message ? (i18nLang === 'zh' ? message.zh : message.en) : key;
    return args.length
      ? out.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m))
      : out;
  }

  const SKIP_SELECTOR = 'script, style, svg, #map, [data-no-i18n]';

  function translatePage(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement && node.parentElement.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      const source = originalText.get(node);
      const key = source.trim();
      const lead = source.match(/^\s*/)[0];
      const trail = source.match(/\s*$/)[0];
      const translated = i18nLang === 'en' ? (STATIC_TEXT[key] || key) : key;
      node.nodeValue = lead + translated + trail;
    }

    for (const el of root.querySelectorAll('[title], [placeholder], [aria-label], [alt]')) {
      if (el.closest(SKIP_SELECTOR)) continue;
      let saved = originalAttrs.get(el);
      if (!saved) {
        saved = {};
        for (const attr of ['title', 'placeholder', 'aria-label', 'alt']) {
          if (el.hasAttribute(attr)) saved[attr] = el.getAttribute(attr);
        }
        originalAttrs.set(el, saved);
      }
      for (const [attr, value] of Object.entries(saved)) {
        el.setAttribute(attr, i18nLang === 'en' ? (STATIC_TEXT[value] || value) : value);
      }
    }

    for (const el of root.querySelectorAll('[data-i18n-html]')) {
      const key = el.dataset.i18nHtml;
      if (!RICH[key]) continue;
      if (!originalRich.has(el)) originalRich.set(el, el.innerHTML);
      el.innerHTML = RICH[key][i18nLang] || originalRich.get(el);
    }
  }

  function setLanguage(lang, onChange) {
    i18nLang = normalizeLang(lang);
    document.documentElement.lang = i18nLang === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem(STORAGE_KEY, i18nLang); } catch { /* storage unavailable */ }
    translatePage();
    document.documentElement.classList.remove('i18n-pending');
    updateMeta();
    if (onChange) onChange(i18nLang);
  }

  function updateMeta() {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', t("meta.description"));
    }
  }

  function getLanguage() { return i18nLang; }

  function roleLabel(cp, index) {
    if (!cp) return '';
    if (cp.role === 'start') return t("cp.start");
    if (cp.role === 'finish') return t("cp.finish");
    if (cp.role === 'loop') return t("cp.loop");
    return `CP ${index}`;
  }

  const EYEBROW_ZH = {
    'TRACK LAYOUT': '赛道布局',
    'TACTICAL ROUTE': '战术路线',
    'ROUTE MAP': '路线图',
    'SUNSET RUN': '落日竞速',
    'BLUEPRINT': '赛道蓝图',
    'CONTRAST': '高对比',
  };

  function localizeEyebrow(text) {
    if (i18nLang === 'zh' && EYEBROW_ZH[text]) return EYEBROW_ZH[text];
    return text;
  }

  function authorLine(name) {
    if (!name) return '';
    return i18nLang === 'zh' ? `作者：${name}` : `by ${name}`;
  }

  function themeName(theme) {
    if (!theme) return '';
    return i18nLang === 'en' ? (theme.en || theme.name) : theme.name;
  }

  function themeNote(theme) {
    if (!theme) return '';
    return i18nLang === 'en' ? (theme.noteEn || theme.note) : theme.note;
  }

  function sampleName(sample) {
    if (!sample) return '';
    return i18nLang === 'en' ? (sample.nameEn || sample.name) : sample.name;
  }

  function sampleNote(sample) {
    if (!sample) return '';
    return i18nLang === 'en' ? (sample.noteEn || sample.note) : sample.note;
  }

  function warningText(w, track) {
    if (!w) return '';
    const cpLabel = (index) => {
      const cp = track && track.checkpoints && track.checkpoints[index];
      return cp ? roleLabel(cp, index) : `CP ${index}`;
    };
    switch (w.code) {
      case 'duplicate':
        return t("warning.duplicate", cpLabel(w.index || 0));
      case 'duplicate-start':
        return t("warning.duplicateStart", cpLabel(w.index || 0));
      case 'bounds': {
        const cp = track && track.checkpoints && track.checkpoints[w.index];
        const x = w.x !== undefined ? w.x : (cp ? cp.x : 0);
        const y = w.y !== undefined ? w.y : (cp ? cp.y : 0);
        return t("warning.outsideMap", cpLabel(w.index || 0), round(x, 1), round(y, 1));
      }
      case 'no-snap':
        return t("warning.noSnap", cpLabel(w.index || 0), Math.round(w.radius || 80));
      case 'unreachable':
        if (w.closed) return t("warning.unreachableClosed", cpLabel(w.from || 0), cpLabel(w.to || 0));
        return t("warning.unreachable", cpLabel(w.from || 0), cpLabel(w.to || 0));
      case 'partial-road':
        return t("warning.partialRoad");
      case 'fallback':
        if (w.reason === 'auto') return t("warning.autoSpline");
        if (w.reason === 'road-no-graph') return t("warning.roadGraphNotLoadedLine");
        if (w.reason === 'no-road') return t("warning.noRoadAtAll");
        if (w.reason === 'road') return t("warning.roadGraphUnavailable");
        return t("warning.roadGraphNotLoadedSpline");
      default:
        return i18nLang === 'en' ? (STATIC_TEXT[w.text] || w.text || '') : (w.text || '');
    }
  }

  function errorText(err) {
    if (!err) return '';
    const code = err.code;
    const args = Array.isArray(err.args) ? err.args : [];
    switch (code) {
      case 'track-file-not-text': return t("error.trackFileNotText");
      case 'track-file-empty': return t("error.trackFileEmpty");
      case 'json-parse':
        if (args[0] !== null && args[0] !== undefined) return t("error.jsonParseNear", args[0], args[1] || '');
        return t("error.jsonParse", args[1] || '');
      case 'checkpoints-missing': return t("error.noCheckpoints");
      case 'checkpoints-empty': return t("error.checkpointsEmpty");
      case 'point-no-coords': return t("error.pointNoCoords", args[0]);
      case 'point-bad-xy': return t("error.pointBadXY", args[0]);
      case 'point-too-far': return t("error.pointTooFar", args[0], args[1], args[2]);
      case 'point-bad-z': return t("error.pointBadZ", args[0]);
      case 'graph-bad-data': return t("error.graphBadData");
      default:
        return i18nLang === 'en'
          ? (STATIC_TEXT[err.message || String(err)] || err.message || String(err))
          : (err.message || String(err));
    }
  }

  function round(v, digits) {
    const k = Math.pow(10, digits);
    return Math.round(Number(v) * k) / k;
  }

  root.I18n = {
    I18N_LANGS, STORAGE_KEY, MESSAGES, STATIC_TEXT, RICH,
    detectLanguage, setLanguage, getLanguage, t, translatePage, updateMeta,
    roleLabel, authorLine, themeName, themeNote, sampleName, sampleNote,
    localizeEyebrow, warningText, errorText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
