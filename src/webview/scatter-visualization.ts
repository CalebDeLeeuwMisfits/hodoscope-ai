import type { TraceStats, PRStatus, SCMProvider } from '../models/types';

/**
 * A PR projected to 2D for the scatter plot.
 * Pre-computed by the demo/extension before calling generateScatterHTML.
 */
export interface ScatterPoint {
  id: string;
  x: number; // t-SNE / PCA x
  y: number; // t-SNE / PCA y
  prNumber: number;
  title: string;
  author: string;
  status: PRStatus;
  provider: SCMProvider;
  repoName: string;
  sourceBranch: string;
  targetBranch: string;
  url: string;
  eventCount: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  labels: string[];
  reviewers: string[];
  // Event breakdown counts
  reviewCount?: number;
  approvalCount?: number;
  commentCount?: number;
  timelineEventCount?: number;
  color?: string;
}

export interface ScatterOptions {
  standalone?: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate Hodoscope-style scatter plot visualization.
 * t-SNE clustered layout, glowing points, density halo, dark background.
 */
export function generateScatterHTML(
  points: ScatterPoint[],
  stats: TraceStats,
  nonce: string,
  cspSource: string,
  options: ScatterOptions = {}
): string {
  const { standalone = false } = options;
  const cspTag = standalone
    ? ''
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource} https:;">`;
  const nonceAttr = standalone ? '' : ` nonce="${nonce}"`;

  const pointsJSON = JSON.stringify(points)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const statsJSON = JSON.stringify(stats)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  const hasData = points.length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspTag}
  <title>Misfits and Machines X Hodoscope AI — PR Trace Explorer</title>
  <style${nonceAttr}>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      color: #e0e0e0;
      font-family: 'JetBrains Mono', 'Fira Code', 'Segoe UI', monospace;
      overflow: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ===== HEADER ===== */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
      flex-shrink: 0;
    }
    .header-title {
      font-size: 13px;
      font-weight: 700;
      background: linear-gradient(90deg, #636EFA, #00CC96, #AB63FA);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .header-sub { font-size: 10px; color: #8b949e; margin-left: 12px; }

    /* ===== STATS ===== */
    .stats-bar {
      display: flex;
      gap: 1px;
      padding: 4px 16px;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
      flex-shrink: 0;
    }
    .stat { flex: 1; text-align: center; padding: 6px 8px; background: #161b22; }
    .stat-val { font-size: 18px; font-weight: 700; }
    .stat-val.m { color: #00CC96; }
    .stat-val.o { color: #636EFA; }
    .stat-val.c { color: #EF553B; }
    .stat-val.t { color: #FFA15A; }
    .stat-val.a { color: #AB63FA; }
    .stat-val.r { color: #00d2d3; }
    .stat-val.w { color: #ffb347; }
    .stat-lbl { font-size: 8px; text-transform: uppercase; letter-spacing: 1.5px; color: #8b949e; margin-top: 2px; }

    /* ===== MAIN ===== */
    .main { flex: 1; display: flex; overflow: hidden; min-width: 0; }

    /* ===== CANVAS ===== */
    .canvas-wrap { flex: 1; position: relative; min-width: 0; overflow: hidden; }
    canvas { display: block; cursor: crosshair; }

    /* ===== SIDEBAR ===== */
    .side {
      width: 240px;
      background: #0d1117;
      border-left: 1px solid #21262d;
      padding: 12px;
      overflow-y: auto;
      flex-shrink: 0;
      font-size: 11px;
    }
    .side-title {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #8b949e;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #21262d;
    }
    .side-section { margin-bottom: 14px; }

    /* Filter */
    .filter-input {
      width: 100%; padding: 4px 8px;
      background: #161b22; border: 1px solid #30363d;
      border-radius: 4px; color: #e0e0e0; font-size: 11px; outline: none;
      font-family: inherit;
    }
    .filter-input:focus { border-color: #636EFA; }
    .filter-input::placeholder { color: #484f58; }

    /* Color-by buttons */
    .color-btns { display: flex; gap: 3px; flex-wrap: wrap; }
    .cbtn {
      padding: 2px 7px; background: #161b22; border: 1px solid #30363d;
      border-radius: 3px; color: #8b949e; font-size: 9px; cursor: pointer;
      font-family: inherit; transition: all 0.15s;
    }
    .cbtn:hover { border-color: #636EFA; color: #e0e0e0; }
    .cbtn.active { background: #636EFA20; border-color: #636EFA; color: #636EFA; }

    /* Legend */
    .leg-item {
      display: flex; align-items: center; gap: 6px;
      padding: 2px 0; cursor: pointer; transition: opacity 0.15s;
    }
    .leg-item:hover { opacity: 0.8; }
    .leg-item.off { opacity: 0.25; text-decoration: line-through; }
    .leg-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 0 4px currentColor;
    }
    .leg-cnt { margin-left: auto; color: #8b949e; font-size: 9px; }

    /* Tooltip */
    .tooltip {
      position: absolute; pointer-events: none;
      background: #1c2128ee; border: 1px solid #30363d;
      border-radius: 8px; padding: 10px 14px;
      max-width: 300px; font-size: 11px; z-index: 999;
      box-shadow: 0 4px 24px #00000088;
      backdrop-filter: blur(8px);
      opacity: 0; transition: opacity 0.12s;
    }
    .tooltip.vis { opacity: 1; }
    .tt-title { font-weight: 700; margin-bottom: 3px; }
    .tt-meta { font-size: 9px; color: #8b949e; margin-bottom: 4px; }
    .tt-row { display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: #c8d6e5; }
    .tt-badge {
      display: inline-block; padding: 1px 5px; border-radius: 3px;
      font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    }

    /* Detail panel (click) */
    .detail {
      position: absolute; right: 0; top: 0; bottom: 0; width: 320px;
      background: #0d1117ee; border-left: 1px solid #21262d;
      padding: 16px; overflow-y: auto; z-index: 50;
      transform: translateX(100%); transition: transform 0.2s ease;
      backdrop-filter: blur(12px);
    }
    .detail.open { transform: translateX(0); }
    .detail-close {
      position: absolute; top: 8px; right: 8px; background: none;
      border: 1px solid #30363d; border-radius: 4px; color: #8b949e;
      padding: 2px 8px; cursor: pointer; font-size: 10px;
    }
    .detail-close:hover { color: #e0e0e0; border-color: #636EFA; }
    .detail h3 { font-size: 13px; margin-bottom: 8px; }
    .detail-row { display: flex; justify-content: space-between; font-size: 10px; color: #c8d6e5; padding: 3px 0; border-bottom: 1px solid #21262d; }
    .detail-label { color: #8b949e; }
    .detail-link { color: #636EFA; text-decoration: none; font-size: 10px; }
    .detail-link:hover { text-decoration: underline; }

    /* Toggle button */
    .toggle-labels {
      position: absolute; bottom: 12px; left: 12px; z-index: 20;
      background: #161b22; border: 1px solid #30363d; border-radius: 5px;
      color: #8b949e; padding: 4px 10px; font-size: 10px; cursor: pointer;
      font-family: inherit; transition: all 0.15s; display: flex; align-items: center; gap: 5px;
    }
    .toggle-labels:hover { border-color: #636EFA; color: #e0e0e0; }
    .toggle-labels.on { background: #636EFA18; border-color: #636EFA; color: #636EFA; }
    .toggle-labels .ico { font-size: 12px; }

    /* Timeline bar */
    .timeline-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
      flex-shrink: 0;
    }
    .tl-play, .tl-live {
      padding: 3px 8px; background: #161b22; border: 1px solid #30363d;
      border-radius: 4px; color: #8b949e; font-size: 11px; cursor: pointer;
      font-family: inherit; transition: all 0.15s; min-width: 28px; text-align: center;
    }
    .tl-play:hover, .tl-live:hover { border-color: #636EFA; color: #e0e0e0; }
    .tl-live.live { background: #00CC9620; border-color: #00CC96; color: #00CC96; }
    .tl-range-wrap {
      flex: 1; position: relative; height: 14px;
      display: flex; align-items: center;
    }
    .tl-range-track {
      position: absolute; left: 0; right: 0; top: 50%;
      transform: translateY(-50%);
      height: 4px; background: #21262d; border-radius: 2px;
      pointer-events: none;
    }
    .tl-range-fill {
      position: absolute; top: 50%;
      transform: translateY(-50%);
      height: 4px; background: #636EFA55; border-radius: 2px;
      pointer-events: none;
    }
    .tl-slider {
      position: absolute; top: 0; left: 0; width: 100%;
      height: 14px; background: transparent;
      -webkit-appearance: none; appearance: none;
      pointer-events: none; margin: 0;
    }
    .tl-slider::-webkit-slider-runnable-track { background: transparent; height: 14px; }
    .tl-slider::-moz-range-track { background: transparent; height: 14px; }
    .tl-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      pointer-events: auto;
      width: 14px; height: 14px; border-radius: 50%;
      background: #636EFA; cursor: pointer; border: 2px solid #0d1117;
      box-shadow: 0 0 6px #636EFA88;
      margin-top: 0;
    }
    .tl-slider::-moz-range-thumb {
      pointer-events: auto;
      width: 14px; height: 14px; border-radius: 50%;
      background: #636EFA; cursor: pointer; border: 2px solid #0d1117;
      box-shadow: 0 0 6px #636EFA88;
    }
    .tl-slider-lower::-webkit-slider-thumb {
      background: #FFA15A; box-shadow: 0 0 6px #FFA15A88;
    }
    .tl-slider-lower::-moz-range-thumb {
      background: #FFA15A; box-shadow: 0 0 6px #FFA15A88;
    }
    .tl-date { font-size: 10px; color: #e0e0e0; min-width: 150px; text-align: center; }
    .tl-count { font-size: 9px; color: #8b949e; min-width: 60px; text-align: center; }
    .tl-speed-btns { display: flex; gap: 2px; }
    .tl-speed-btn {
      padding: 2px 6px; background: #161b22; border: 1px solid #30363d;
      border-radius: 3px; color: #8b949e; font-size: 9px; cursor: pointer;
      font-family: inherit; transition: all 0.15s;
    }
    .tl-speed-btn:hover { border-color: #636EFA; color: #e0e0e0; }
    .tl-speed-btn.active { background: #636EFA20; border-color: #636EFA; color: #636EFA; }

    /* Empty */
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #484f58; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;">
      <img src="data:image/jpeg;base64,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" width="20" style="border-radius:50%;margin-right:6px;">
      <span class="header-title">Misfits and Machines X Hodoscope AI</span>
      <span class="header-sub">PR Trace Explorer</span>
    </div>
    <div class="color-btns">
      <span style="color:#8b949e;font-size:9px;margin-right:4px;">Color:</span>
      <button class="cbtn active" data-c="author">Author</button>
      <button class="cbtn" data-c="status">Status</button>
      <button class="cbtn" data-c="provider">Provider</button>
      <button class="cbtn" data-c="repoName">Repo</button>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat"><div class="stat-val t" id="stat-total">${stats.totalPRs - (stats.repoCreatedCount || 0)}</div><div class="stat-lbl">Total PRs</div></div>
    <div class="stat"><div class="stat-val m" id="stat-merged">${stats.mergedPRs}</div><div class="stat-lbl">Merged</div></div>
    <div class="stat"><div class="stat-val o" id="stat-open">${stats.openPRs}</div><div class="stat-lbl">Open</div></div>
    <div class="stat"><div class="stat-val c" id="stat-closed">${stats.closedPRs}</div><div class="stat-lbl">Closed</div></div>
    <div class="stat"><div class="stat-val a" id="stat-authors">${stats.uniqueAuthors}</div><div class="stat-lbl">Authors</div></div>
    <div class="stat"><div class="stat-val r" id="stat-repos">${stats.repoCreatedCount || 0}</div><div class="stat-lbl">Repos</div></div>
    <div class="stat"><div class="stat-val w" id="stat-workitems">0</div><div class="stat-lbl">Work Items</div></div>
  </div>

  ${hasData ? '<div class="timeline-bar">' +
    '<button class="tl-play" id="tl-play" title="Play/Pause">&#9654;</button>' +
    '<div class="tl-range-wrap">' +
      '<div class="tl-range-track"></div>' +
      '<div class="tl-range-fill" id="tl-range-fill"></div>' +
      '<input type="range" class="tl-slider tl-slider-lower" id="tl-slider-min" min="0" max="1000" value="0" title="Drag to hide items older than this date">' +
      '<input type="range" class="tl-slider" id="tl-slider" min="0" max="1000" value="1000" title="Drag or click Play to animate forward">' +
    '</div>' +
    '<span class="tl-date" id="tl-date">Live</span>' +
    '<span class="tl-count" id="tl-count"></span>' +
    '<div class="tl-speed-btns">' +
      '<button class="tl-speed-btn" data-speed="0.5">½×</button>' +
      '<button class="tl-speed-btn active" data-speed="1">1×</button>' +
      '<button class="tl-speed-btn" data-speed="2">2×</button>' +
      '<button class="tl-speed-btn" data-speed="4">4×</button>' +
    '</div>' +
    '<button class="tl-live" id="tl-live" title="Jump to live (reset window)">Live</button>' +
  '</div>' : ''}

  <div class="main">
    <div class="canvas-wrap">
      ${hasData ? '<canvas id="c"></canvas>' : '<div class="empty"><div style="font-size:36px;opacity:0.2;">&#9678;</div><div>No PR traces</div></div>'}
      ${hasData ? '<button class="toggle-labels on" id="toggle-labels"><span class="ico">&#9781;</span> Labels</button>' : ''}
      <div class="tooltip" id="tip"></div>
      <div class="detail" id="detail">
        <button class="detail-close" id="detail-close">&times;</button>
        <div id="detail-body"></div>
      </div>
    </div>

    <div class="side">
      <div class="side-section">
        <div class="side-title">Search</div>
        <input class="filter-input" id="search" placeholder="Filter PRs...">
      </div>
      <div class="side-section">
        <div class="side-title">Legend</div>
        <div id="legend"></div>
      </div>
      <div class="side-section">
        <div class="side-title">Top Authors</div>
        <div id="authors">${stats.topAuthors.slice(0, 10).map(a =>
          `<div style="display:flex;justify-content:space-between;padding:1px 0;"><span>${escapeHtml(a.author)}</span><span style="color:#8b949e">${a.count}</span></div>`
        ).join('')}</div>
      </div>
    </div>
  </div>

  <script${nonceAttr}>
    window.__HODO_PTS__ = ${pointsJSON};
    window.__HODO_STATS__ = ${statsJSON};
  </script>

  <script${nonceAttr}>
  var _hi = false;
  window.addEventListener('DOMContentLoaded', function() { requestAnimationFrame(initScatter); });
  if (document.readyState !== 'loading') requestAnimationFrame(initScatter);

  function initScatter() {
    if (_hi) return; _hi = true;

    var pts = window.__HODO_PTS__;
    if (!pts || !pts.length) return;
    var canvas = document.getElementById('c');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var DPR = window.devicePixelRatio || 1;
    var W, H;

    function resize() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = r.width || window.innerWidth - 240;
      H = r.height || window.innerHeight - 100;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', function() { resize(); });

    // ===== PALETTE =====
    var PAL = ['#636EFA','#EF553B','#00CC96','#AB63FA','#FFA15A','#19D3F3','#FF6692','#B6E880','#FF97FF','#FECB52','#7F7F7F','#1CBE4F','#C49C94','#F58518','#72B7B2','#EECA3B'];

    // ===== COORDINATE MAPPING =====
    var MARGIN = 60;
    var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    pts.forEach(function(p) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    });
    var xRange = xMax - xMin || 1;
    var yRange = yMax - yMin || 1;
    // Maintain aspect ratio
    var scale = Math.min((W - 2*MARGIN) / xRange, (H - 2*MARGIN) / yRange);
    var xOff = (W - xRange * scale) / 2;
    var yOff = (H - yRange * scale) / 2;

    function sx(x) { return xOff + (x - xMin) * scale; }
    function sy(y) { return yOff + (y - yMin) * scale; }

    // ===== POINT SIZE by event count =====
    var maxEvt = Math.max.apply(null, pts.map(function(p) { return p.eventCount; })) || 1;
    function radius(p) { return 4 + (p.eventCount / maxEvt) * 12; }

    // ===== STABLE REPO COLOR MAP (always visible as ring) =====
    var REPO_PAL = ['#FF6692','#19D3F3','#B6E880','#FECB52','#AB63FA','#FFA15A','#636EFA','#EF553B','#00CC96','#FF97FF','#7F7F7F','#1CBE4F','#C49C94','#72B7B2','#F58518','#EECA3B'];
    var repoNames = [];
    pts.forEach(function(p) { if (repoNames.indexOf(p.repoName) === -1) repoNames.push(p.repoName); });
    var repoColorMap = {};
    repoNames.forEach(function(v, i) { repoColorMap[v] = REPO_PAL[i % REPO_PAL.length]; });
    // Assign stable repo color to each point
    pts.forEach(function(p) { p._repoColor = repoColorMap[p.repoName]; });

    // ===== REPO HIGHLIGHT STATE =====
    var highlightedRepo = null; // when set, dims all non-matching dots
    var showRepoLabels = true; // toggle via bottom-left button

    // ===== COLORING =====
    var colorBy = 'author';
    var hidden = {};
    var searchTxt = '';

    // ===== TIMELINE STATE =====
    var tlTimes = pts.map(function(p) { return new Date(p.createdAt).getTime(); }).filter(function(t) { return !isNaN(t); });
    tlTimes.sort(function(a, b) { return a - b; });
    var tlMinTime = tlTimes[0] || 0;
    var tlMaxTime = tlTimes[tlTimes.length - 1] || 0;
    var tlRange = tlMaxTime - tlMinTime || 1;
    // Upper handle (end of window). tlLive = true means pinned to tlMaxTime and
    // no upper-bound filtering. Playback animates this handle.
    var tlLive = true;
    var tlCursor = tlMaxTime;
    // Lower handle (start of window). Independent of tlLive; once moved off
    // tlMinTime it hides older points even in "Live" mode. Playback does not
    // touch this value.
    var tlLowerCursor = tlMinTime;
    var tlPlaying = false;
    var tlSpeed = 1;
    // Step: each animation frame at 1× covers ~1 day of simulated time
    var tlStepMs = tlRange / 200;
    var _tlLastFrame = 0;

    function recolor() {
      var vals = [];
      pts.forEach(function(p) { if (vals.indexOf(p[colorBy]) === -1) vals.push(p[colorBy]); });
      var cmap = {};
      vals.forEach(function(v, i) { cmap[v] = PAL[i % PAL.length]; });
      pts.forEach(function(p) { p.color = cmap[p[colorBy]]; });
      buildLegend(vals, cmap);
      updateStats();
    }

    function updateStats() {
      var vis = pts.filter(isVisible);
      var total = 0, merged = 0, open = 0, closed = 0, repos = 0, workItems = 0;
      var authorSet = {};
      for (var i = 0; i < vis.length; i++) {
        var p = vis[i];
        if (p.status === 'repo_created') { repos++; continue; }
        if (p.status === 'work_item') {
          workItems++;
          if (p.author) authorSet[p.author] = 1;
          continue;
        }
        total++;
        if (p.status === 'merged') merged++;
        else if (p.status === 'open' || p.status === 'draft') open++;
        else if (p.status === 'closed') closed++;
        if (p.author) authorSet[p.author] = 1;
      }
      var elTotal = document.getElementById('stat-total');
      var elMerged = document.getElementById('stat-merged');
      var elOpen = document.getElementById('stat-open');
      var elClosed = document.getElementById('stat-closed');
      var elAuthors = document.getElementById('stat-authors');
      var elRepos = document.getElementById('stat-repos');
      var elWorkItems = document.getElementById('stat-workitems');
      if (elTotal) elTotal.textContent = String(total);
      if (elMerged) elMerged.textContent = String(merged);
      if (elOpen) elOpen.textContent = String(open);
      if (elClosed) elClosed.textContent = String(closed);
      if (elAuthors) elAuthors.textContent = String(Object.keys(authorSet).length);
      if (elRepos) elRepos.textContent = String(repos);
      if (elWorkItems) elWorkItems.textContent = String(workItems);
    }

    function buildLegend(vals, cmap) {
      var el = document.getElementById('legend');
      el.innerHTML = vals.map(function(v) {
        var prPts = pts.filter(function(p) { return p[colorBy] === v && p.status !== 'repo_created' && p.status !== 'work_item'; });
        var repoPts = pts.filter(function(p) { return p[colorBy] === v && p.status === 'repo_created'; });
        var wiPts = pts.filter(function(p) { return p[colorBy] === v && p.status === 'work_item'; });
        var vis = prPts.filter(function(p) { return isVisible(p); }).length;
        var cnt = prPts.length;
        var repoCount = repoPts.length;
        var wiCount = wiPts.length;
        var off = hidden[v] ? ' off' : '';
        return '<div class="leg-item' + off + '" data-v="' + esc(v) + '">' +
          '<span class="leg-dot" style="color:' + cmap[v] + ';background:' + cmap[v] + '"></span>' +
          '<span>' + esc(v) + '</span>' +
          '<span class="leg-cnt">' + vis + '/' + cnt +
            (repoCount > 0 ? ' <span style="color:#00d2d3;" title="Repos founded">◆' + repoCount + '</span>' : '') +
            (wiCount > 0 ? ' <span style="color:#ffb347;" title="Work items">▲' + wiCount + '</span>' : '') +
          '</span></div>';
      }).join('');
      el.querySelectorAll('.leg-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var v = this.dataset.v;
          hidden[v] = !hidden[v];
          recolor();
        });
      });
    }

    function isVisible(p) {
      if (hidden[p[colorBy]]) return false;
      if (searchTxt) {
        var s = searchTxt.toLowerCase();
        var hay = (p.title + ' ' + p.author + ' #' + p.prNumber + ' ' + p.repoName).toLowerCase();
        if (hay.indexOf(s) === -1) return false;
      }
      // Timeline filter: restrict to [tlLowerCursor, tlCursor].
      // Lower bound always applies (independent of Live). Upper bound only
      // applies when not Live (playback or manual scrub).
      var t = new Date(p.createdAt).getTime();
      if (!isNaN(t)) {
        if (t < tlLowerCursor) return false;
        if (!tlLive && t > tlCursor) return false;
      }
      return true;
    }

    // ===== DENSITY HEATMAP (Gaussian KDE) =====
    function drawDensity() {
      var visPts = pts.filter(isVisible);
      if (visPts.length < 3) return;
      var bw = scale * (xRange + yRange) * 0.03; // bandwidth
      var gridSize = 3; // pixel step
      var img = ctx.createImageData(Math.ceil(W / gridSize), Math.ceil(H / gridSize));

      for (var gy = 0; gy < img.height; gy++) {
        for (var gx = 0; gx < img.width; gx++) {
          var px = gx * gridSize;
          var py = gy * gridSize;
          var d = 0;
          for (var k = 0; k < visPts.length; k++) {
            var dx = px - sx(visPts[k].x);
            var dy = py - sy(visPts[k].y);
            d += Math.exp(-(dx*dx + dy*dy) / (2*bw*bw));
          }
          d /= visPts.length;
          var idx = (gy * img.width + gx) * 4;
          // Map density to a blue-purple glow
          var intensity = Math.min(d * 800, 1);
          img.data[idx]     = Math.floor(99 * intensity);  // R
          img.data[idx + 1] = Math.floor(110 * intensity); // G
          img.data[idx + 2] = Math.floor(250 * intensity); // B
          img.data[idx + 3] = Math.floor(40 * intensity);  // A
        }
      }

      // Draw scaled
      var tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = img.width;
      tmpCanvas.height = img.height;
      tmpCanvas.getContext('2d').putImageData(img, 0, 0);
      ctx.drawImage(tmpCanvas, 0, 0, W, H);
    }

    // ===== SHAPE HELPERS =====
    function drawDiamond(cx, cy, size) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
    }

    function drawTriangle(cx, cy, size) {
      // Equilateral, pointing up — chosen to visually distinguish work items
      // (ADO tickets) from repo_created diamonds and PR circles.
      var h = size * 1.1547; // 2/sqrt(3) for equilateral
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.66);
      ctx.lineTo(cx + size, cy + h * 0.33);
      ctx.lineTo(cx - size, cy + h * 0.33);
      ctx.closePath();
    }

    function drawShape(status, cx, cy, size) {
      if (status === 'repo_created') { drawDiamond(cx, cy, size); return; }
      if (status === 'work_item') { drawTriangle(cx, cy, size); return; }
      ctx.beginPath();
      ctx.arc(cx, cy, size, 0, Math.PI * 2);
    }

    // ===== DRAW =====
    var hovered = null;
    var _repoLabelHits = []; // [{repo, x, y, w, h}] for click detection
    var _hoveredLabelCluster = null; // labels being fanned out
    var _labelMouseX = 0, _labelMouseY = 0;

    function draw() {
      // Background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, W, H);

      // Subtle radial glow
      var grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.5);
      grd.addColorStop(0, '#10131a');
      grd.addColorStop(1, '#0a0a0f');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // Density
      drawDensity();

      // Draw points
      var visPts = pts.filter(isVisible);
      visPts.forEach(function(p) {
        var px = sx(p.x), py = sy(p.y);
        var r = radius(p);
        var isH = hovered && hovered.id === p.id;
        var dimmed = highlightedRepo && p.repoName !== highlightedRepo;
        var isHighlit = highlightedRepo && p.repoName === highlightedRepo;

        if (dimmed) {
          // Dimmed: faint ghost dot
          ctx.globalAlpha = 0.12;
          ctx.beginPath();
          ctx.arc(px, py, r * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = '#8b949e';
          ctx.fill();
          ctx.globalAlpha = 1;
          p._sx = px; p._sy = py; p._r = r;
          return;
        }

        var shape = p.status; // 'repo_created' | 'work_item' | other (→ circle)
        // Outer glow halo (circular for all shapes — looks natural behind them)
        var glowMult = isHighlit ? 1.5 : 1;
        var grd2 = ctx.createRadialGradient(px, py, 0, px, py, r * (isH ? 4 : 2.5) * glowMult);
        grd2.addColorStop(0, (isHighlit ? p._repoColor : p.color) + '60');
        grd2.addColorStop(1, (isHighlit ? p._repoColor : p.color) + '00');
        ctx.fillStyle = grd2;
        ctx.beginPath();
        ctx.arc(px, py, r * (isH ? 4 : 2.5) * glowMult, 0, Math.PI * 2);
        ctx.fill();

        // Repo indicator ring (always visible, brighter when highlighted)
        var ringAlpha = colorBy === 'repoName' ? '00' : (isHighlit ? 'ff' : 'aa');
        drawShape(shape, px, py, r * (isH ? 1.7 : 1.3));
        ctx.strokeStyle = p._repoColor + ringAlpha;
        ctx.lineWidth = isHighlit ? 3 : (isH ? 2.5 : 1.5);
        ctx.stroke();

        // Core shape (primary color, or repo color when highlighted)
        drawShape(shape, px, py, r * (isH ? 1.4 : 1));
        ctx.fillStyle = (isHighlit ? p._repoColor : p.color) + (isH ? 'ff' : 'cc');
        ctx.fill();

        // Bright center
        drawShape(shape, px, py, r * 0.4);
        ctx.fillStyle = isHighlit ? '#ffffffdd' : '#ffffffaa';
        ctx.fill();

        // Store screen pos for hit testing
        p._sx = px; p._sy = py; p._r = r;

        // Author label on highlighted nodes
        if (isHighlit) {
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e0e0e0cc';
          ctx.fillText(p.author, px, py + r + 12);
        }
      });

      // ===== REPO LABELS at cluster centroids (clickable) =====
      _repoLabelHits = []; // clear hit areas each frame
      if (!showRepoLabels && !highlightedRepo) {
        // Skip labels but keep animation loop
      } else {
      // Always show repo labels (even when colored by repo)
      var repoCentroids = {};
      visPts.forEach(function(p) {
        if (!repoCentroids[p.repoName]) repoCentroids[p.repoName] = { sx: 0, sy: 0, n: 0, color: p._repoColor };
        repoCentroids[p.repoName].sx += sx(p.x);
        repoCentroids[p.repoName].sy += sy(p.y);
        repoCentroids[p.repoName].n++;
      });

      ctx.font = '9px "JetBrains Mono", "Fira Code", monospace';
      ctx.textAlign = 'center';

      // Build label positions and detect overlaps
      var labels = [];
      Object.keys(repoCentroids).forEach(function(repo) {
        var c = repoCentroids[repo];
        if (c.n < 2) return;
        var cx = c.sx / c.n;
        var cy = c.sy / c.n - 18;
        var tw = ctx.measureText(repo).width + 10;
        labels.push({ repo: repo, cx: cx, cy: cy, tw: tw, color: c.color });
      });

      // When mouse is near overlapping labels, fan them out vertically
      if (_hoveredLabelCluster) {
        var cluster = _hoveredLabelCluster;
        // Check if mouse is still near the cluster
        var nearCluster = false;
        for (var ci = 0; ci < cluster.length; ci++) {
          var cl = cluster[ci];
          if (Math.abs(_labelMouseX - cl.cx) < cl.tw && Math.abs(_labelMouseY - cl.cy) < 60) {
            nearCluster = true; break;
          }
        }
        if (!nearCluster) _hoveredLabelCluster = null;
      }

      // Detect overlap groups near the mouse
      if (!_hoveredLabelCluster) {
        for (var li = 0; li < labels.length; li++) {
          var la = labels[li];
          var lx1 = la.cx - la.tw/2, lx2 = la.cx + la.tw/2;
          var ly1 = la.cy - 8, ly2 = la.cy + 8;
          if (_labelMouseX >= lx1 - 20 && _labelMouseX <= lx2 + 20 && _labelMouseY >= ly1 - 20 && _labelMouseY <= ly2 + 20) {
            // Find all labels overlapping with this one
            var group = [la];
            for (var lj = 0; lj < labels.length; lj++) {
              if (li === lj) continue;
              var lb = labels[lj];
              var dx = Math.abs(la.cx - lb.cx);
              var dy = Math.abs(la.cy - lb.cy);
              if (dx < (la.tw + lb.tw) / 2 && dy < 18) group.push(lb);
            }
            if (group.length > 1) { _hoveredLabelCluster = group; break; }
          }
        }
      }

      // Apply fan-out offset to clustered labels
      if (_hoveredLabelCluster) {
        var fanGroup = _hoveredLabelCluster;
        // Sort by original cy position
        fanGroup.sort(function(a, b) { return a.cy - b.cy; });
        var midY = 0;
        for (var fi = 0; fi < fanGroup.length; fi++) midY += fanGroup[fi].cy;
        midY /= fanGroup.length;
        var spacing = 20;
        var startY = midY - ((fanGroup.length - 1) * spacing) / 2;
        for (var fi = 0; fi < fanGroup.length; fi++) {
          fanGroup[fi]._fanY = startY + fi * spacing;
        }
      }

      labels.forEach(function(l) {
        var isActive = highlightedRepo === l.repo;
        var isFanned = l._fanY !== undefined;
        var drawY = isFanned ? l._fanY : l.cy;
        var lx = l.cx - l.tw/2, ly = drawY - 8, lw = l.tw, lh = 16;

        // Background pill
        var bgAlpha = isFanned ? 'ee' : 'bb';
        ctx.fillStyle = isActive ? l.color + '30' : '#0a0a0f' + bgAlpha;
        ctx.beginPath();
        ctx.roundRect(lx, ly, lw, lh, 4);
        ctx.fill();

        // Border — more visible when fanned
        ctx.strokeStyle = isActive ? l.color + 'ff' : l.color + (isFanned ? 'cc' : '60');
        ctx.lineWidth = isActive ? 1.5 : (isFanned ? 1 : 0.5);
        ctx.stroke();

        // Text
        ctx.fillStyle = isActive ? l.color + 'ff' : l.color + (isFanned ? 'ff' : 'cc');
        ctx.fillText(l.repo, l.cx, drawY + 3);

        // Store hit area
        _repoLabelHits.push({ repo: l.repo, x: lx, y: ly, w: lw, h: lh });
      });
      } // end showRepoLabels else block

      requestAnimationFrame(draw);
    }

    // ===== HOVER =====
    var tip = document.getElementById('tip');
    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      _labelMouseX = mx; _labelMouseY = my;
      hovered = null;
      // Check repo label hover for cursor
      var overLabel = false;
      for (var li = 0; li < _repoLabelHits.length; li++) {
        var lbl = _repoLabelHits[li];
        if (mx >= lbl.x && mx <= lbl.x + lbl.w && my >= lbl.y && my <= lbl.y + lbl.h) { overLabel = true; break; }
      }
      canvas.style.cursor = overLabel ? 'pointer' : 'crosshair';

      var visPts = pts.filter(isVisible);
      for (var i = visPts.length - 1; i >= 0; i--) {
        var p = visPts[i];
        if (!p._sx) continue;
        var dx = mx - p._sx, dy = my - p._sy;
        if (dx*dx + dy*dy < (p._r + 6) * (p._r + 6)) { hovered = p; canvas.style.cursor = 'pointer'; break; }
      }
      if (hovered) {
        var p = hovered;
        var statusColors = {merged:'#00CC96',open:'#636EFA',closed:'#EF553B',draft:'#8b949e',deferred:'#FFA15A',repo_created:'#00d2d3',work_item:'#ffb347'};
        var ttPrefix = p.status === 'repo_created' ? '◆ '
          : p.status === 'work_item' ? '▲ WI #'
          : (p.provider === 'wrike' ? 'Task ' : 'PR #');
        var ttTitle = p.status === 'repo_created' ? esc(p.title)
          : p.status === 'work_item' ? ttPrefix + p.prNumber + ': ' + esc(p.title)
          : ttPrefix + p.prNumber + ': ' + esc(p.title);
        var showBranch = p.status !== 'repo_created' && p.provider !== 'wrike';
        tip.innerHTML =
          '<div class="tt-title">' + ttTitle + '</div>' +
          '<div class="tt-meta">' + esc(p.author) + ' &middot; ' + esc(p.repoName) + (showBranch ? ' &middot; ' + p.sourceBranch + ' → ' + p.targetBranch : '') + '</div>' +
          '<div style="margin:4px 0"><span class="tt-badge" style="background:' + (statusColors[p.status]||'#8b949e') + '30;color:' + (statusColors[p.status]||'#8b949e') + '">' + p.status + '</span>' +
          ' <span class="tt-badge" style="background:#30363d;color:#c8d6e5">' + p.provider + '</span></div>' +
          '<div class="tt-row"><span>+' + p.additions + ' / -' + p.deletions + '</span><span>' + p.eventCount + ' events</span></div>' +
          '<div class="tt-row"><span>' + p.changedFiles + ' files</span><span>' + new Date(p.createdAt).toLocaleDateString() + '</span></div>';
        tip.classList.add('vis');
        var tx = e.clientX - rect.left + 16, ty = e.clientY - rect.top - 10;
        if (tx + 310 > W) tx = mx - 320;
        if (ty + 120 > H) ty = my - 130;
        tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
      } else {
        tip.classList.remove('vis');
      }
    });

    // ===== CLICK → REPO LABEL or DETAIL PANEL =====
    var detail = document.getElementById('detail');
    var detailBody = document.getElementById('detail-body');
    canvas.addEventListener('click', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;

      // Check if clicked a repo label
      for (var li = 0; li < _repoLabelHits.length; li++) {
        var lbl = _repoLabelHits[li];
        if (mx >= lbl.x && mx <= lbl.x + lbl.w && my >= lbl.y && my <= lbl.y + lbl.h) {
          // Toggle highlight: click same repo again to un-highlight
          highlightedRepo = (highlightedRepo === lbl.repo) ? null : lbl.repo;
          return;
        }
      }

      // Click empty area clears repo highlight
      if (!hovered && highlightedRepo) { highlightedRepo = null; return; }

      if (!hovered) { detail.classList.remove('open'); return; }
      var p = hovered;
      var statusColors = {merged:'#00CC96',open:'#636EFA',closed:'#EF553B',draft:'#8b949e',deferred:'#FFA15A',repo_created:'#00d2d3',work_item:'#ffb347'};
      var detailPrefix = p.status === 'repo_created' ? '◆ Repo Created'
        : p.status === 'work_item' ? '▲ Work Item #' + p.prNumber
        : (p.provider === 'wrike' ? 'Task ' : 'PR #') + p.prNumber;
      var providerName = p.provider === 'github' ? 'GitHub' : p.provider === 'azure-devops' ? 'Azure DevOps' : 'Wrike';
      var linkText = p.status === 'repo_created' ? 'View Repository'
        : p.status === 'work_item' ? 'Open Work Item'
        : 'Open in ' + providerName;
      var branchRow = p.status === 'repo_created' ? ''
        : p.status === 'work_item' ? row('State', p.targetBranch || '—') + (p.reviewers && p.reviewers.length ? row('Assigned to', p.reviewers.join(', ')) : '')
        : (p.provider === 'wrike' ? row('Project', p.targetBranch) : row('Branch', p.sourceBranch + ' → ' + p.targetBranch));
      var evtBreakdown = (p.reviewCount || p.approvalCount || p.commentCount || p.timelineEventCount) ?
        ' <span style="font-size:9px;color:#8b949e;">(' +
        [p.reviewCount ? p.reviewCount + ' reviews' : '',
         p.approvalCount ? p.approvalCount + ' approvals' : '',
         p.commentCount ? p.commentCount + ' comments' : '',
         p.timelineEventCount ? p.timelineEventCount + ' timeline' : '']
        .filter(function(s) { return s; }).join(', ') + ')</span>' : '';
      detailBody.innerHTML =
        '<h3>' + detailPrefix + '</h3>' +
        '<div style="margin-bottom:8px;font-size:12px;color:#e0e0e0;">' + esc(p.title) + '</div>' +
        '<a class="detail-link" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + linkText + ' &rarr;</a>' +
        '<div style="margin-top:12px;">' +
        row('Status', '<span class="tt-badge" style="background:' + (statusColors[p.status]||'#8b949e') + '30;color:' + (statusColors[p.status]||'#8b949e') + '">' + p.status + '</span>') +
        row('Author', p.author) +
        row('Provider', p.provider) +
        row('Repo', p.repoName) +
        branchRow +
        row('Changes', '+' + p.additions + ' / -' + p.deletions + ' (' + p.changedFiles + ' files)') +
        row('Events', p.eventCount + evtBreakdown) +
        row('Created', new Date(p.createdAt).toLocaleString()) +
        row('Reviewers', p.reviewers.join(', ') || 'none') +
        row('Labels', p.labels.join(', ') || 'none') +
        '</div>';
      detail.classList.add('open');
    });
    document.getElementById('detail-close').addEventListener('click', function() {
      detail.classList.remove('open');
    });

    function row(label, val) {
      return '<div class="detail-row"><span class="detail-label">' + label + '</span><span>' + val + '</span></div>';
    }

    // ===== CONTROLS =====
    document.querySelectorAll('.cbtn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.cbtn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        colorBy = this.dataset.c;
        hidden = {};
        recolor();
      });
    });

    document.getElementById('search').addEventListener('input', function() {
      searchTxt = this.value;
      recolor();
    });

    // Toggle repo labels
    var toggleBtn = document.getElementById('toggle-labels');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        showRepoLabels = !showRepoLabels;
        this.classList.toggle('on', showRepoLabels);
      });
    }

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // ===== GUIDE OVERLAY =====
    var guideBtn = document.getElementById('guide-btn');
    var guideOverlay = document.getElementById('guide-overlay');
    var guideClose = document.getElementById('guide-close');
    if (guideBtn) {
      guideBtn.addEventListener('click', function() {
        guideOverlay.classList.toggle('vis');
      });
    }
    if (guideClose) {
      guideClose.addEventListener('click', function() {
        guideOverlay.classList.remove('vis');
      });
    }

    // ===== KEY TABLE (always visible, updates with color mode) =====
    function buildKeyTable() {
      var el = document.getElementById('key-table');
      if (!el) return;
      var vals = [];
      pts.forEach(function(p) { if (vals.indexOf(p[colorBy]) === -1) vals.push(p[colorBy]); });
      var cmap = {};
      vals.forEach(function(v, i) { cmap[v] = PAL[i % PAL.length]; });
      var modeLabel = colorBy === 'repoName' ? 'Repo' : colorBy.charAt(0).toUpperCase() + colorBy.slice(1);

      var html = '<div class="key-title">Key: ' + modeLabel + '</div>';
      vals.slice(0, 8).forEach(function(v) {
        var cnt = pts.filter(function(p) { return p[colorBy] === v && p.status !== 'repo_created' && p.status !== 'work_item'; }).length;
        var repoCount = pts.filter(function(p) { return p[colorBy] === v && p.status === 'repo_created'; }).length;
        var wiCount = pts.filter(function(p) { return p[colorBy] === v && p.status === 'work_item'; }).length;
        html += '<div class="key-row"><span class="key-swatch" style="color:' + cmap[v] + ';background:' + cmap[v] + '"></span><span>' + esc(v) + '</span><span style="color:#8b949e;margin-left:auto;">' + cnt +
          (repoCount > 0 ? ' <span style="color:#00d2d3;">◆' + repoCount + '</span>' : '') +
          (wiCount > 0 ? ' <span style="color:#ffb347;">▲' + wiCount + '</span>' : '') +
          '</span></div>';
      });
      if (vals.length > 8) {
        html += '<div style="color:#484f58;padding-top:2px;">+' + (vals.length - 8) + ' more</div>';
      }
      // Add ring explanation
      if (colorBy !== 'repoName') {
        html += '<div style="margin-top:6px;padding-top:4px;border-top:1px solid #21262d;">';
        html += '<div class="key-title" style="margin-bottom:3px;">Ring = Repo</div>';
        repoNames.slice(0, 4).forEach(function(r) {
          html += '<div class="key-row"><span class="key-ring" style="border-color:' + repoColorMap[r] + ';color:' + repoColorMap[r] + '"></span><span>' + esc(r) + '</span></div>';
        });
        if (repoNames.length > 4) {
          html += '<div style="color:#484f58;padding-top:2px;">+' + (repoNames.length - 4) + ' more</div>';
        }
        html += '</div>';
      }
      el.innerHTML = html;
    }

    // ===== TIME-LAPSE CONTROLS =====
    var tlSlider = document.getElementById('tl-slider');
    var tlSliderMin = document.getElementById('tl-slider-min');
    var tlFillEl = document.getElementById('tl-range-fill');
    var tlDateEl = document.getElementById('tl-date');
    var tlCountEl = document.getElementById('tl-count');
    var tlPlayBtn = document.getElementById('tl-play');
    var tlLiveBtn = document.getElementById('tl-live');

    function fmtDate(ms) {
      return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function updateTlUI() {
      if (!tlSlider) return;
      var lowerPct = (tlLowerCursor - tlMinTime) / tlRange;
      var upperPct = tlLive ? 1 : (tlCursor - tlMinTime) / tlRange;
      if (tlSliderMin) tlSliderMin.value = String(Math.round(lowerPct * 1000));
      tlSlider.value = String(Math.round(upperPct * 1000));
      if (tlFillEl) {
        tlFillEl.style.left = (lowerPct * 100) + '%';
        tlFillEl.style.right = ((1 - upperPct) * 100) + '%';
      }
      var rightLabel = tlLive ? 'Live' : fmtDate(tlCursor);
      var leftFiltered = tlLowerCursor > tlMinTime + 1;
      tlDateEl.textContent = leftFiltered
        ? fmtDate(tlLowerCursor) + ' → ' + rightLabel
        : rightLabel;
      if (tlLive && !leftFiltered) tlLiveBtn.classList.add('live');
      else tlLiveBtn.classList.remove('live');
      tlCountEl.textContent = pts.filter(isVisible).length + ' / ' + pts.length;
    }

    function tlTick(now) {
      if (!tlPlaying || tlLive) return;
      if (_tlLastFrame) {
        var dt = (now - _tlLastFrame) * tlSpeed;
        // Map 16ms of real time to tlStepMs of simulated time
        tlCursor += tlStepMs * (dt / 16);
        if (tlCursor >= tlMaxTime) {
          tlCursor = tlMaxTime;
          tlPlaying = false;
          tlLive = true;
          if (tlPlayBtn) tlPlayBtn.innerHTML = '&#9654;';
        }
        updateTlUI();
        recolor();
      }
      _tlLastFrame = now;
      if (tlPlaying) requestAnimationFrame(tlTick);
    }

    if (tlPlayBtn) {
      tlPlayBtn.addEventListener('click', function() {
        if (tlLive) {
          // Start playback from the lower cursor (respects date-range window)
          tlLive = false;
          tlCursor = tlLowerCursor;
          tlPlaying = true;
          _tlLastFrame = 0;
          this.innerHTML = '&#9646;&#9646;';
          updateTlUI();
          recolor();
          requestAnimationFrame(tlTick);
        } else if (tlPlaying) {
          // Pause
          tlPlaying = false;
          this.innerHTML = '&#9654;';
        } else {
          // Resume
          if (tlCursor >= tlMaxTime) tlCursor = tlLowerCursor;
          tlPlaying = true;
          _tlLastFrame = 0;
          this.innerHTML = '&#9646;&#9646;';
          requestAnimationFrame(tlTick);
        }
      });
    }

    // Minimum gap (epoch ms) between lower and upper handles to keep them draggable.
    var tlHandleGap = Math.max(tlRange * 0.01, 1);

    if (tlSlider) {
      tlSlider.addEventListener('input', function() {
        tlLive = false;
        tlPlaying = false;
        if (tlPlayBtn) tlPlayBtn.innerHTML = '&#9654;';
        var pct = parseInt(this.value) / 1000;
        tlCursor = tlMinTime + pct * tlRange;
        if (tlCursor < tlLowerCursor + tlHandleGap) tlCursor = tlLowerCursor + tlHandleGap;
        if (tlCursor > tlMaxTime) tlCursor = tlMaxTime;
        updateTlUI();
        recolor();
      });
    }

    if (tlSliderMin) {
      tlSliderMin.addEventListener('input', function() {
        var pct = parseInt(this.value) / 1000;
        tlLowerCursor = tlMinTime + pct * tlRange;
        // Clamp so the two handles never cross
        var upperBound = tlLive ? tlMaxTime : tlCursor;
        if (tlLowerCursor > upperBound - tlHandleGap) {
          tlLowerCursor = upperBound - tlHandleGap;
        }
        if (tlLowerCursor < tlMinTime) tlLowerCursor = tlMinTime;
        updateTlUI();
        recolor();
      });
    }

    if (tlLiveBtn) {
      tlLiveBtn.addEventListener('click', function() {
        // Reset window: pin upper to live AND release the lower cutoff.
        tlLive = true;
        tlPlaying = false;
        tlCursor = tlMaxTime;
        tlLowerCursor = tlMinTime;
        if (tlPlayBtn) tlPlayBtn.innerHTML = '&#9654;';
        updateTlUI();
        recolor();
      });
    }

    // Speed buttons
    document.querySelectorAll('.tl-speed-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tl-speed-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        tlSpeed = parseFloat(this.dataset.speed);
      });
    });

    // ===== INIT =====
    recolor();
    draw();
  }
  </script>
</body>
</html>`;
}
