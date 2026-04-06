// NOTE: Particle trace view — the scatter deep-dive detail panel lives in scatter-visualization.ts
import type { TracePath, TraceStats } from '../models/types';

/**
 * Generate the full self-contained HTML for the Hodoscope webview.
 *
 * This is a particle-physics-inspired visualization:
 * - Dark background like a bubble chamber photograph
 * - PRs rendered as glowing particle traces with animated trails
 * - Events are nodes along the trace (like detector hits)
 * - Hover reveals details; click opens PR URL
 * - Stats dashboard shows KPIs for managers
 * - Fully self-contained — no external CDN dependencies
 */
export interface WebviewOptions {
  /** When true, omit CSP and nonces for standalone browser use */
  standalone?: boolean;
}

export function generateWebviewHTML(
  traces: TracePath[],
  stats: TraceStats,
  nonce: string,
  cspSource: string,
  options: WebviewOptions = {}
): string {
  // Escape for safe embedding in <script> tags — prevent </script> injection
  // and escape special chars that break HTML embedding
  const tracesJSON = JSON.stringify(traces)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const statsJSON = JSON.stringify(stats)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  const hasData = traces.length > 0;
  const { standalone = false } = options;

  // In standalone mode, skip CSP entirely (file:// doesn't support nonces)
  const cspTag = standalone
    ? ''
    : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource} https:;">`;
  const nonceAttr = standalone ? '' : ` nonce="${nonce}"`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspTag}
  <title>Hodoscope AI — PR Trace Visualizer</title>
  <style${nonceAttr}>
    /* ===== GLOBAL RESET & DARK THEME ===== */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      color: #e0e0e0;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ===== HEADER BAR ===== */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
      border-bottom: 1px solid #21262d;
      flex-shrink: 0;
      z-index: 100;
    }
    .header-title {
      font-size: 14px;
      font-weight: 600;
      background: linear-gradient(90deg, #00ff87, #4ecdc4, #54a0ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header-subtitle {
      font-size: 11px;
      color: #8b949e;
      margin-left: 12px;
    }

    /* ===== STATS PANEL (manager-friendly KPIs) ===== */
    .stats-panel {
      display: flex;
      gap: 2px;
      padding: 6px 16px;
      background: #0d1117;
      border-bottom: 1px solid #21262d;
      flex-shrink: 0;
    }
    .stat-card {
      flex: 1;
      padding: 8px 12px;
      background: linear-gradient(135deg, #161b22 0%, #1c2128 100%);
      border-radius: 6px;
      text-align: center;
      border: 1px solid #21262d;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
    }
    .stat-value.merged { color: #00ff87; }
    .stat-value.open { color: #54a0ff; }
    .stat-value.closed { color: #ff6b6b; }
    .stat-value.total { color: #ffd93d; }
    .stat-value.authors { color: #c8d6e5; }
    .stat-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #8b949e;
      margin-top: 2px;
    }

    /* ===== MAIN LAYOUT ===== */
    .main-container {
      flex: 1;
      display: flex;
      position: relative;
      overflow: hidden;
    }

    /* ===== CANVAS (particle chamber) ===== */
    .canvas-container {
      flex: 1;
      position: relative;
    }
    canvas#hodoscope-canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: crosshair;
    }

    /* ===== LEGEND & FILTERS SIDEBAR ===== */
    .sidebar {
      width: 220px;
      background: #0d1117;
      border-left: 1px solid #21262d;
      padding: 12px;
      overflow-y: auto;
      flex-shrink: 0;
    }
    .sidebar-section {
      margin-bottom: 16px;
    }
    .sidebar-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #8b949e;
      margin-bottom: 8px;
      border-bottom: 1px solid #21262d;
      padding-bottom: 4px;
    }

    /* Filter controls */
    .filter-group { margin-bottom: 8px; }
    .filter-label {
      font-size: 10px;
      color: #8b949e;
      margin-bottom: 3px;
      display: block;
    }
    .filter-input, .filter-select {
      width: 100%;
      padding: 4px 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 12px;
      outline: none;
    }
    .filter-input:focus, .filter-select:focus {
      border-color: #00ff87;
      box-shadow: 0 0 0 1px #00ff8733;
    }
    .filter-input::placeholder { color: #484f58; }

    /* Legend items */
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
      font-size: 11px;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.2s;
    }
    .legend-item:hover { opacity: 0.8; }
    .legend-item.hidden { opacity: 0.3; text-decoration: line-through; }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: 0 0 6px currentColor;
    }
    .legend-count {
      margin-left: auto;
      color: #8b949e;
      font-size: 10px;
    }

    /* ===== TOOLTIP ===== */
    .tooltip {
      position: absolute;
      pointer-events: none;
      background: #1c2128ee;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 10px 14px;
      max-width: 320px;
      font-size: 12px;
      z-index: 999;
      box-shadow: 0 4px 20px #00000080;
      backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .tooltip.visible { opacity: 1; }
    .tooltip-title {
      font-weight: 600;
      color: #e0e0e0;
      margin-bottom: 4px;
    }
    .tooltip-meta {
      font-size: 10px;
      color: #8b949e;
    }
    .tooltip-event {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #30363d;
      font-size: 11px;
    }
    .tooltip-event-type {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* ===== EMPTY STATE ===== */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #8b949e;
      font-size: 14px;
    }
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    /* ===== TOP AUTHORS BAR ===== */
    .top-authors {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .author-badge {
      padding: 2px 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      font-size: 10px;
      color: #c8d6e5;
    }
    .author-badge-count {
      color: #8b949e;
      margin-left: 4px;
    }

    /* ===== COLOR-BY SELECTOR ===== */
    .color-by-group {
      display: flex;
      gap: 4px;
    }
    .color-by-btn {
      padding: 3px 8px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 4px;
      color: #8b949e;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .color-by-btn:hover { border-color: #00ff87; color: #e0e0e0; }
    .color-by-btn.active {
      background: #00ff8720;
      border-color: #00ff87;
      color: #00ff87;
    }

    /* ===== PLAYBACK CONTROLS ===== */
    .playback {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .playback-btn {
      background: none;
      border: 1px solid #30363d;
      border-radius: 4px;
      color: #e0e0e0;
      padding: 3px 10px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .playback-btn:hover { border-color: #00ff87; color: #00ff87; }
    .playback-btn.active { background: #00ff8720; border-color: #00ff87; color: #00ff87; }
    .time-label {
      font-size: 10px;
      color: #8b949e;
      min-width: 120px;
      text-align: center;
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header">
    <div style="display:flex;align-items:center;">
      <span class="header-title">Hodoscope AI</span>
      <span class="header-subtitle">PR Trace Visualizer</span>
    </div>
    <div class="playback">
      <button class="playback-btn" id="btn-replay" title="Replay animation">&#9654; Replay</button>
      <button class="playback-btn" id="btn-pause" title="Pause">&#10074;&#10074;</button>
      <span class="time-label" id="time-label"></span>
      <div class="color-by-group">
        <button class="color-by-btn active" data-colorby="author">Author</button>
        <button class="color-by-btn" data-colorby="status">Status</button>
        <button class="color-by-btn" data-colorby="provider">Provider</button>
        <button class="color-by-btn" data-colorby="targetBranch">Branch</button>
      </div>
    </div>
  </div>

  <!-- STATS DASHBOARD -->
  <div class="stats-panel" id="stats-panel">
    <div class="stat-card">
      <div class="stat-value total" id="stat-total">${stats.totalPRs}</div>
      <div class="stat-label">Total PRs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value merged" id="stat-merged">${stats.mergedPRs}</div>
      <div class="stat-label">Merged</div>
    </div>
    <div class="stat-card">
      <div class="stat-value open" id="stat-open">${stats.openPRs}</div>
      <div class="stat-label">Open</div>
    </div>
    <div class="stat-card">
      <div class="stat-value closed" id="stat-closed">${stats.closedPRs}</div>
      <div class="stat-label">Closed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value authors" id="stat-authors">${stats.uniqueAuthors}</div>
      <div class="stat-label">Contributors</div>
    </div>
  </div>

  <!-- MAIN -->
  <div class="main-container">
    <div class="canvas-container">
      ${hasData ? `<canvas id="hodoscope-canvas"></canvas>` : `
      <div class="empty-state">
        <div class="empty-state-icon">&#8962;</div>
        <div>No PR traces to display</div>
        <div style="font-size:12px;margin-top:8px;color:#484f58;">Run "Hodoscope: Select Repository" to get started</div>
      </div>`}
      <div class="tooltip" id="tooltip"></div>
    </div>

    <!-- SIDEBAR -->
    <div class="sidebar">
      <!-- Search filter -->
      <div class="sidebar-section">
        <div class="sidebar-title">Search</div>
        <div class="filter-group">
          <input type="text" class="filter-input" id="filter-search" placeholder="Filter PRs by title, author...">
        </div>
      </div>

      <!-- Status filter -->
      <div class="sidebar-section">
        <div class="sidebar-title">Status</div>
        <div class="filter-group">
          <select class="filter-select" id="filter-status">
            <option value="all">All</option>
            <option value="merged">Merged</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <!-- Legend -->
      <div class="sidebar-section">
        <div class="sidebar-title">Legend</div>
        <div id="legend"></div>
      </div>

      <!-- Top Authors -->
      <div class="sidebar-section">
        <div class="sidebar-title">Top Authors</div>
        <div class="top-authors" id="top-authors">
          ${stats.topAuthors.map(a =>
            `<span class="author-badge">${escapeHtml(a.author)}<span class="author-badge-count">${a.count}</span></span>`
          ).join('')}
        </div>
      </div>
    </div>
  </div>

  <!-- DATA -->
  <script${nonceAttr}>
    window.__HODOSCOPE_DATA__ = ${tracesJSON};
    window.__HODOSCOPE_STATS__ = ${statsJSON};
  </script>

  <!-- RENDERER -->
  <script${nonceAttr}>
  // Defer init to ensure layout is computed
  window.addEventListener('DOMContentLoaded', function() {
    requestAnimationFrame(function() { initHodoscope(); });
  });
  // Fallback if DOMContentLoaded already fired
  if (document.readyState !== 'loading') {
    requestAnimationFrame(function() { initHodoscope(); });
  }

  var _hodoInitDone = false;
  function initHodoscope() {
    if (_hodoInitDone) return;
    _hodoInitDone = true;
    'use strict';

    const traces = window.__HODOSCOPE_DATA__;
    if (!traces || traces.length === 0) return;

    // ===== CANVAS SETUP =====
    const canvas = document.getElementById('hodoscope-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    const DPR = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      W = rect.width || window.innerWidth - 220;
      H = rect.height || window.innerHeight - 120;
      if (W < 100) W = window.innerWidth - 220;
      if (H < 100) H = window.innerHeight - 120;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // ===== LAYOUT CONSTANTS =====
    const MARGIN = { top: 40, right: 30, bottom: 50, left: 60 };
    const LAYER_LABELS = ['Created', 'Commits', 'Force Push', 'Review Req', 'Comments', 'Reviews', 'Changes Req', 'Approved', 'CI', 'Labels', 'Merged/Closed'];
    const NODE_RADIUS = 5;

    // ===== TIMING & ANIMATION STATE =====
    let animationProgress = 0; // 0..1
    let animationSpeed = 0.008;
    let paused = false;
    let particles = [];

    // ===== COORDINATE MAPPING =====
    // Find global time range across all traces
    let globalMinT = Infinity, globalMaxT = -Infinity;
    for (const trace of traces) {
      for (const p of trace.points) {
        if (p.timestamp < globalMinT) globalMinT = p.timestamp;
        if (p.timestamp > globalMaxT) globalMaxT = p.timestamp;
      }
    }
    const timeRange = globalMaxT - globalMinT || 1;

    function mapX(timestamp) {
      return MARGIN.left + ((timestamp - globalMinT) / timeRange) * (W - MARGIN.left - MARGIN.right);
    }

    function mapY(layerY) {
      // Map 0..6 layer range to vertical space
      const usableH = H - MARGIN.top - MARGIN.bottom;
      return MARGIN.top + (layerY / 6.5) * usableH;
    }

    // ===== PARTICLE SYSTEM =====
    function spawnParticle(x, y, color) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.8;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.008 + Math.random() * 0.015,
        color,
        size: 1 + Math.random() * 2,
      });
    }

    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = p.life * 0.6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ===== BACKGROUND GRID =====
    function drawBackground() {
      // Deep dark background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, W, H);

      // Subtle radial gradient center glow
      const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.6);
      grd.addColorStop(0, '#0f1520');
      grd.addColorStop(1, '#0a0a0f');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // Detector layer lines (horizontal, faint)
      ctx.strokeStyle = '#ffffff08';
      ctx.lineWidth = 1;
      for (let layer = 0; layer <= 6; layer++) {
        const y = mapY(layer);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, y);
        ctx.lineTo(W - MARGIN.right, y);
        ctx.stroke();
      }

      // Layer labels on left
      ctx.fillStyle = '#484f58';
      ctx.font = '9px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      const labels = ['Create', 'Code', '', 'Review', '', '', 'Merge'];
      labels.forEach((label, i) => {
        if (label) ctx.fillText(label, MARGIN.left - 8, mapY(i) + 3);
      });

      // Time axis
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, H - MARGIN.bottom);
      ctx.lineTo(W - MARGIN.right, H - MARGIN.bottom);
      ctx.stroke();

      // Time ticks
      ctx.fillStyle = '#484f58';
      ctx.font = '9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const tickCount = Math.min(8, Math.floor((W - MARGIN.left - MARGIN.right) / 100));
      for (let i = 0; i <= tickCount; i++) {
        const t = globalMinT + (i / tickCount) * timeRange;
        const x = mapX(t);
        const d = new Date(t);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        ctx.fillText(label, x, H - MARGIN.bottom + 16);

        ctx.strokeStyle = '#ffffff06';
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, H - MARGIN.bottom);
        ctx.stroke();
      }
    }

    // ===== TRACE RENDERING =====
    // Visibility state for legend toggling
    let hiddenTraceIds = new Set();
    let searchFilter = '';
    let statusFilter = 'all';
    let hoveredPoint = null;

    function getVisibleTraces() {
      return traces.filter(t => {
        if (hiddenTraceIds.has(t.traceId)) return false;
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (searchFilter) {
          const s = searchFilter.toLowerCase();
          const searchable = (t.prTitle + ' ' + t.author + ' #' + t.prNumber).toLowerCase();
          if (!searchable.includes(s)) return false;
        }
        return true;
      });
    }

    function drawTrace(trace, progress) {
      const pts = trace.points;
      if (pts.length === 0) return;

      // Determine how many points to show based on animation progress
      const showCount = Math.ceil(pts.length * progress);
      const visiblePts = pts.slice(0, showCount);

      // Map to screen coordinates — spread FIRST so computed x/y override originals
      const screenPts = visiblePts.map(p => ({
        ...p,
        x: mapX(p.timestamp),
        y: mapY(p.y) + (trace.prNumber % 20 - 10) * 1.5, // slight vertical jitter per PR
      }));

      if (screenPts.length < 1) return;

      // Draw trace line with glow
      ctx.save();

      // Outer glow
      ctx.strokeStyle = trace.color + '30';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        // Bezier curve for smooth traces
        const prev = screenPts[i-1];
        const curr = screenPts[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        ctx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      ctx.stroke();

      // Inner bright line
      ctx.strokeStyle = trace.color + 'cc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        const prev = screenPts[i-1];
        const curr = screenPts[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.quadraticCurveTo(prev.x + (cpx - prev.x) * 0.8, prev.y, cpx, (prev.y + curr.y) / 2);
        ctx.quadraticCurveTo(curr.x - (curr.x - cpx) * 0.8, curr.y, curr.x, curr.y);
      }
      ctx.stroke();

      // Draw event nodes
      for (let i = 0; i < screenPts.length; i++) {
        const sp = screenPts[i];
        const isLast = (i === screenPts.length - 1) && progress < 1;
        const r = isLast ? NODE_RADIUS + 2 : NODE_RADIUS;

        // Node glow
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = trace.color + '20';
        ctx.fill();

        // Node fill
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = getEventColor(sp.type, trace.color);
        ctx.fill();

        // Node border
        ctx.strokeStyle = '#ffffff40';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Spawn particles at the leading edge
        if (isLast && Math.random() < 0.4) {
          spawnParticle(sp.x, sp.y, trace.color);
        }

        // Store for hit testing
        sp._sx = sp.x;
        sp._sy = sp.y;
        sp._r = r;
        sp._trace = trace;
      }

      ctx.restore();
    }

    function getEventColor(type, baseColor) {
      const eventColors = {
        created: '#54a0ff',
        commit: baseColor,
        merged: '#00ff87',
        closed: '#ff6b6b',
        approved: '#00ff87',
        changes_requested: '#ff9f43',
        comment: '#ffd93d',
        review_submitted: '#4ecdc4',
        review_requested: '#6c5ce7',
        ci_passed: '#00ff87',
        ci_failed: '#ff6b6b',
        force_pushed: '#ff9ff3',
        label_added: '#c8d6e5',
        label_removed: '#c8d6e5',
        reopened: '#54a0ff',
        branch_updated: baseColor,
      };
      return eventColors[type] || baseColor;
    }

    // ===== MAIN ANIMATION LOOP =====
    function draw() {
      drawBackground();

      const visible = getVisibleTraces();

      // Draw all traces
      for (const trace of visible) {
        drawTrace(trace, animationProgress);
      }

      // Draw particles on top
      updateParticles();
      drawParticles();

      // Advance animation
      if (!paused && animationProgress < 1) {
        animationProgress += animationSpeed;
        if (animationProgress > 1) animationProgress = 1;
      }

      // Update time label
      const currentT = globalMinT + animationProgress * timeRange;
      const d = new Date(currentT);
      document.getElementById('time-label').textContent =
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      requestAnimationFrame(draw);
    }

    // ===== INTERACTION: HOVER TOOLTIP =====
    const tooltip = document.getElementById('tooltip');
    canvas.addEventListener('mousemove', function(e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      hoveredPoint = null;
      const visible = getVisibleTraces();

      // Hit test all visible points
      outer:
      for (const trace of visible) {
        const showCount = Math.ceil(trace.points.length * animationProgress);
        for (let i = 0; i < showCount && i < trace.points.length; i++) {
          const p = trace.points[i];
          if (!p._sx) continue;
          const dx = mx - p._sx;
          const dy = my - p._sy;
          if (dx*dx + dy*dy < (p._r + 6) * (p._r + 6)) {
            hoveredPoint = { point: p, trace };
            break outer;
          }
        }
      }

      if (hoveredPoint) {
        const p = hoveredPoint.point;
        const t = hoveredPoint.trace;
        tooltip.innerHTML =
          '<div class="tooltip-title">PR #' + t.prNumber + ': ' + escapeHtmlJS(t.prTitle) + '</div>' +
          '<div class="tooltip-meta">' + escapeHtmlJS(t.author) + ' &middot; ' + t.sourceBranch + ' → ' + t.targetBranch + '</div>' +
          '<div class="tooltip-event">' +
          '<span class="tooltip-event-type" style="background:' + getEventColor(p.type, t.color) + '30;color:' + getEventColor(p.type, t.color) + '">' + p.type.replace(/_/g, ' ') + '</span> ' +
          '<span style="color:#c8d6e5">' + escapeHtmlJS(p.description) + '</span>' +
          '<div style="margin-top:4px;font-size:10px;color:#8b949e">' + new Date(p.timestamp).toLocaleString() + ' &middot; by ' + escapeHtmlJS(p.author) + '</div>' +
          '</div>';
        tooltip.classList.add('visible');

        // Position tooltip near cursor
        let tx = e.clientX - rect.left + 16;
        let ty = e.clientY - rect.top - 10;
        if (tx + 320 > W) tx = mx - 330;
        if (ty + 100 > H) ty = my - 110;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
      } else {
        tooltip.classList.remove('visible');
      }
    });

    // Click to open PR URL (post message to VS Code)
    canvas.addEventListener('click', function() {
      if (hoveredPoint) {
        const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
        if (vscode) {
          vscode.postMessage({ type: 'openPR', traceId: hoveredPoint.trace.traceId });
        }
      }
    });

    // ===== CONTROLS =====
    document.getElementById('btn-replay').addEventListener('click', function() {
      animationProgress = 0;
      paused = false;
      particles = [];
    });

    document.getElementById('btn-pause').addEventListener('click', function() {
      paused = !paused;
      this.textContent = paused ? '▶' : '⏸';
    });

    // Color-by buttons
    document.querySelectorAll('.color-by-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.color-by-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        recolorTraces(this.dataset.colorby);
      });
    });

    // Search filter
    document.getElementById('filter-search').addEventListener('input', function() {
      searchFilter = this.value;
      updateLegend();
    });

    // Status filter
    document.getElementById('filter-status').addEventListener('change', function() {
      statusFilter = this.value;
      updateLegend();
    });

    // ===== RECOLOR =====
    const PALETTE = ['#00ff87','#ff6b6b','#4ecdc4','#ffd93d','#6c5ce7','#ff9ff3','#54a0ff','#ff9f43','#00d2d3','#c8d6e5','#f368e0','#01a3a4','#5f27cd','#ee5253','#10ac84','#2e86de'];

    function recolorTraces(colorBy) {
      const values = [...new Set(traces.map(t => t[colorBy]))];
      const colorMap = {};
      values.forEach((v, i) => { colorMap[v] = PALETTE[i % PALETTE.length]; });
      for (const t of traces) {
        t.color = colorMap[t[colorBy]] || PALETTE[0];
      }
      updateLegend();
    }

    // ===== LEGEND =====
    function updateLegend() {
      const legendEl = document.getElementById('legend');
      const visible = getVisibleTraces();
      const colorByBtn = document.querySelector('.color-by-btn.active');
      const colorBy = colorByBtn ? colorByBtn.dataset.colorby : 'author';

      const groups = {};
      for (const t of traces) {
        const key = t[colorBy];
        if (!groups[key]) groups[key] = { color: t.color, count: 0, visible: 0 };
        groups[key].count++;
        if (visible.find(v => v.traceId === t.traceId)) groups[key].visible++;
      }

      legendEl.innerHTML = Object.entries(groups).map(function(entry) {
        const key = entry[0], g = entry[1];
        const hidden = hiddenTraceIds.has('__group__' + key) ? ' hidden' : '';
        return '<div class="legend-item' + hidden + '" data-group="' + escapeHtmlJS(key) + '">' +
          '<span class="legend-dot" style="color:' + g.color + ';background:' + g.color + '"></span>' +
          '<span>' + escapeHtmlJS(key) + '</span>' +
          '<span class="legend-count">' + g.visible + '/' + g.count + '</span>' +
          '</div>';
      }).join('');

      // Click legend items to toggle
      legendEl.querySelectorAll('.legend-item').forEach(function(item) {
        item.addEventListener('click', function() {
          const group = this.dataset.group;
          const toggleKey = '__group__' + group;
          if (hiddenTraceIds.has(toggleKey)) {
            hiddenTraceIds.delete(toggleKey);
            // Show all traces in this group
            traces.forEach(function(t) {
              const colorByActive = document.querySelector('.color-by-btn.active').dataset.colorby;
              if (t[colorByActive] === group) hiddenTraceIds.delete(t.traceId);
            });
          } else {
            hiddenTraceIds.add(toggleKey);
            const colorByActive = document.querySelector('.color-by-btn.active').dataset.colorby;
            traces.forEach(function(t) {
              if (t[colorByActive] === group) hiddenTraceIds.add(t.traceId);
            });
          }
          updateLegend();
        });
      });
    }

    function escapeHtmlJS(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ===== INIT =====
    recolorTraces('author');
    updateLegend();
    draw();
  }
  </script>
</body>
</html>`;
}

/** Server-side HTML escaping */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
