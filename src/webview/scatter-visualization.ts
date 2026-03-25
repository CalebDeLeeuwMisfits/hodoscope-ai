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
  <title>Hodoscope AI — PR Trace Explorer</title>
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

    /* Empty */
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #484f58; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;">
      <span class="header-title">Hodoscope AI</span>
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
    <div class="stat"><div class="stat-val t">${stats.totalPRs}</div><div class="stat-lbl">Total PRs</div></div>
    <div class="stat"><div class="stat-val m">${stats.mergedPRs}</div><div class="stat-lbl">Merged</div></div>
    <div class="stat"><div class="stat-val o">${stats.openPRs}</div><div class="stat-lbl">Open</div></div>
    <div class="stat"><div class="stat-val c">${stats.closedPRs}</div><div class="stat-lbl">Closed</div></div>
    <div class="stat"><div class="stat-val a">${stats.uniqueAuthors}</div><div class="stat-lbl">Authors</div></div>
  </div>

  <div class="main">
    <div class="canvas-wrap">
      ${hasData ? '<canvas id="c"></canvas>' : '<div class="empty"><div style="font-size:36px;opacity:0.2;">&#9678;</div><div>No PR traces</div></div>'}
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

    // ===== COLORING =====
    var colorBy = 'author';
    var hidden = {};
    var searchTxt = '';

    function recolor() {
      var vals = [];
      pts.forEach(function(p) { if (vals.indexOf(p[colorBy]) === -1) vals.push(p[colorBy]); });
      var cmap = {};
      vals.forEach(function(v, i) { cmap[v] = PAL[i % PAL.length]; });
      pts.forEach(function(p) { p.color = cmap[p[colorBy]]; });
      buildLegend(vals, cmap);
    }

    function buildLegend(vals, cmap) {
      var el = document.getElementById('legend');
      el.innerHTML = vals.map(function(v) {
        var cnt = pts.filter(function(p) { return p[colorBy] === v; }).length;
        var vis = pts.filter(function(p) { return p[colorBy] === v && isVisible(p); }).length;
        var off = hidden[v] ? ' off' : '';
        return '<div class="leg-item' + off + '" data-v="' + esc(v) + '">' +
          '<span class="leg-dot" style="color:' + cmap[v] + ';background:' + cmap[v] + '"></span>' +
          '<span>' + esc(v) + '</span>' +
          '<span class="leg-cnt">' + vis + '/' + cnt + '</span></div>';
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

    // ===== DRAW =====
    var hovered = null;

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

        // Outer glow halo (primary color)
        var grd2 = ctx.createRadialGradient(px, py, 0, px, py, r * (isH ? 4 : 2.5));
        grd2.addColorStop(0, p.color + '40');
        grd2.addColorStop(1, p.color + '00');
        ctx.fillStyle = grd2;
        ctx.beginPath();
        ctx.arc(px, py, r * (isH ? 4 : 2.5), 0, Math.PI * 2);
        ctx.fill();

        // Repo indicator ring (always visible, subtle when not coloring by repo)
        var ringAlpha = colorBy === 'repoName' ? '00' : 'aa'; // hide ring when already coloring by repo
        ctx.beginPath();
        ctx.arc(px, py, r * (isH ? 1.7 : 1.3), 0, Math.PI * 2);
        ctx.strokeStyle = p._repoColor + ringAlpha;
        ctx.lineWidth = isH ? 2.5 : 1.5;
        ctx.stroke();

        // Core dot (primary color)
        ctx.beginPath();
        ctx.arc(px, py, r * (isH ? 1.4 : 1), 0, Math.PI * 2);
        ctx.fillStyle = p.color + (isH ? 'ff' : 'cc');
        ctx.fill();

        // Bright center
        ctx.beginPath();
        ctx.arc(px, py, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffffaa';
        ctx.fill();

        // Store screen pos for hit testing
        p._sx = px; p._sy = py; p._r = r;
      });

      // ===== REPO LABELS at cluster centroids =====
      if (colorBy !== 'repoName') {
        // Group visible points by repo, compute centroids, label repos with 3+ points
        var repoCentroids = {};
        visPts.forEach(function(p) {
          if (!repoCentroids[p.repoName]) repoCentroids[p.repoName] = { sx: 0, sy: 0, n: 0, color: p._repoColor };
          repoCentroids[p.repoName].sx += sx(p.x);
          repoCentroids[p.repoName].sy += sy(p.y);
          repoCentroids[p.repoName].n++;
        });

        ctx.font = '9px "JetBrains Mono", "Fira Code", monospace';
        ctx.textAlign = 'center';
        Object.keys(repoCentroids).forEach(function(repo) {
          var c = repoCentroids[repo];
          if (c.n < 2) return; // only label repos with 2+ visible PRs
          var cx = c.sx / c.n;
          var cy = c.sy / c.n - 18; // offset above centroid

          // Background pill
          var tw = ctx.measureText(repo).width + 8;
          ctx.fillStyle = '#0a0a0f99';
          ctx.beginPath();
          ctx.roundRect(cx - tw/2, cy - 7, tw, 14, 3);
          ctx.fill();

          // Border in repo color
          ctx.strokeStyle = c.color + '60';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Text
          ctx.fillStyle = c.color + 'cc';
          ctx.fillText(repo, cx, cy + 3);
        });
      }

      requestAnimationFrame(draw);
    }

    // ===== HOVER =====
    var tip = document.getElementById('tip');
    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      hovered = null;
      var visPts = pts.filter(isVisible);
      for (var i = visPts.length - 1; i >= 0; i--) {
        var p = visPts[i];
        if (!p._sx) continue;
        var dx = mx - p._sx, dy = my - p._sy;
        if (dx*dx + dy*dy < (p._r + 6) * (p._r + 6)) { hovered = p; break; }
      }
      if (hovered) {
        var p = hovered;
        var statusColors = {merged:'#00CC96',open:'#636EFA',closed:'#EF553B',draft:'#8b949e'};
        tip.innerHTML =
          '<div class="tt-title">PR #' + p.prNumber + ': ' + esc(p.title) + '</div>' +
          '<div class="tt-meta">' + esc(p.author) + ' &middot; ' + esc(p.repoName) + ' &middot; ' + p.sourceBranch + ' → ' + p.targetBranch + '</div>' +
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

    // ===== CLICK → DETAIL PANEL =====
    var detail = document.getElementById('detail');
    var detailBody = document.getElementById('detail-body');
    canvas.addEventListener('click', function() {
      if (!hovered) { detail.classList.remove('open'); return; }
      var p = hovered;
      var statusColors = {merged:'#00CC96',open:'#636EFA',closed:'#EF553B',draft:'#8b949e'};
      detailBody.innerHTML =
        '<h3>PR #' + p.prNumber + '</h3>' +
        '<div style="margin-bottom:8px;font-size:12px;color:#e0e0e0;">' + esc(p.title) + '</div>' +
        '<a class="detail-link" href="' + esc(p.url) + '" target="_blank">Open in browser &rarr;</a>' +
        '<div style="margin-top:12px;">' +
        row('Status', '<span class="tt-badge" style="background:' + (statusColors[p.status]||'#8b949e') + '30;color:' + (statusColors[p.status]||'#8b949e') + '">' + p.status + '</span>') +
        row('Author', p.author) +
        row('Provider', p.provider) +
        row('Repo', p.repoName) +
        row('Branch', p.sourceBranch + ' → ' + p.targetBranch) +
        row('Changes', '+' + p.additions + ' / -' + p.deletions + ' (' + p.changedFiles + ' files)') +
        row('Events', p.eventCount) +
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

    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // ===== INIT =====
    recolor();
    draw();
  }
  </script>
</body>
</html>`;
}
