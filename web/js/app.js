// =============================================================================
// He-Kim-Koo Main Application Controller
// =============================================================================

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const globalDropOverlay = document.getElementById('globalDropOverlay');
const memoryBudgetLabel = document.getElementById('memoryBudgetLabel');
const memoryBarFill = document.getElementById('memoryBarFill');
const memoryBadge = document.getElementById('memoryBadge');
const exportCharCount = document.getElementById('exportCharCount');
const btnCopyLabel = document.getElementById('btnCopyLabel');

const valOrigPoints = document.getElementById('valOrigPoints');
const valSimpPoints = document.getElementById('valSimpPoints');
const valDistance = document.getElementById('valDistance');
const valStrLen = document.getElementById('valStrLen');
const outputPolyline = document.getElementById('outputPolyline');
const btnCopy = document.getElementById('btnCopy');
const trailCanvas = document.getElementById('trailCanvas');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const canvasPointCount = document.getElementById('canvasPointCount');
const routeCatalogContainer = document.getElementById('routeCatalogContainer');

// Desktop View Tabs
const tabWatchView = document.getElementById('tabWatchView');
const tabCanvasView = document.getElementById('tabCanvasView');
const tabSplitView = document.getElementById('tabSplitView');
const panelWatchSim = document.getElementById('panelWatchSim');
const panelRouteCanvas = document.getElementById('panelRouteCanvas');

// Mobile Tabs
const mTabWatch = document.getElementById('mTabWatch');
const mTabCanvas = document.getElementById('mTabCanvas');
const mTabSettings = document.getElementById('mTabSettings');
const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');
const mBtnQuickCopy = document.getElementById('mBtnQuickCopy');

// Cached points
let cachedOrigPoints = null;
let cachedSimpPoints = null;

// Desktop View Switcher
function setDesktopViewMode(mode) {
  if (tabWatchView) tabWatchView.classList.remove('active');
  if (tabCanvasView) tabCanvasView.classList.remove('active');
  if (tabSplitView) tabSplitView.classList.remove('active');

  if (mode === 'watch') {
    if (tabWatchView) tabWatchView.classList.add('active');
    if (panelWatchSim) panelWatchSim.style.display = 'flex';
    if (panelRouteCanvas) panelRouteCanvas.style.display = 'none';
  } else if (mode === 'canvas') {
    if (tabCanvasView) tabCanvasView.classList.add('active');
    if (panelWatchSim) panelWatchSim.style.display = 'none';
    if (panelRouteCanvas) panelRouteCanvas.style.display = 'flex';
    if (cachedOrigPoints && cachedSimpPoints) {
      setTimeout(() => renderCanvas(cachedOrigPoints, cachedSimpPoints), 50);
    }
  } else if (mode === 'split') {
    if (tabSplitView) tabSplitView.classList.add('active');
    if (panelWatchSim) panelWatchSim.style.display = 'flex';
    if (panelRouteCanvas) panelRouteCanvas.style.display = 'flex';
    if (cachedOrigPoints && cachedSimpPoints) {
      setTimeout(() => renderCanvas(cachedOrigPoints, cachedSimpPoints), 50);
    }
  }
}

if (tabWatchView) tabWatchView.addEventListener('click', () => setDesktopViewMode('watch'));
if (tabCanvasView) tabCanvasView.addEventListener('click', () => setDesktopViewMode('canvas'));
if (tabSplitView) tabSplitView.addEventListener('click', () => setDesktopViewMode('split'));

// Mobile View Switcher
function setMobileViewMode(mode) {
  document.body.classList.remove('view-mode-watch', 'view-mode-canvas', 'view-mode-settings');
  if (mTabWatch) mTabWatch.classList.remove('active');
  if (mTabCanvas) mTabCanvas.classList.remove('active');
  if (mTabSettings) mTabSettings.classList.remove('active');

  if (mode === 'watch') {
    document.body.classList.add('view-mode-watch');
    if (mTabWatch) mTabWatch.classList.add('active');
    if (panelWatchSim) panelWatchSim.style.display = 'flex';
    if (mBtnPlayToggle) {
      mBtnPlayToggle.innerText = window.simState && window.simState.isPlaying ? 'Pause' : 'Start';
    }
    if (mBtnQuickCopy) mBtnQuickCopy.innerText = 'Copy Route String';
  } else if (mode === 'canvas') {
    document.body.classList.add('view-mode-canvas');
    if (mTabCanvas) mTabCanvas.classList.add('active');
    if (panelRouteCanvas) panelRouteCanvas.style.display = 'flex';
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Go to Watch Sim ➔';
    if (mBtnQuickCopy) mBtnQuickCopy.innerText = 'Copy Route String';
    if (cachedOrigPoints && cachedSimpPoints) {
      setTimeout(() => renderCanvas(cachedOrigPoints, cachedSimpPoints), 50);
    }
  } else if (mode === 'settings') {
    document.body.classList.add('view-mode-settings');
    if (mTabSettings) mTabSettings.classList.add('active');
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Copy Route String';
    if (mBtnQuickCopy) mBtnQuickCopy.innerText = 'Go to Watch Sim ➔';
  }
}

if (mTabWatch) mTabWatch.addEventListener('click', () => setMobileViewMode('watch'));
if (mTabCanvas) mTabCanvas.addEventListener('click', () => setMobileViewMode('canvas'));
if (mTabSettings) mTabSettings.addEventListener('click', () => setMobileViewMode('settings'));

// Mobile Quick Action Buttons
if (mBtnPlayToggle) {
  mBtnPlayToggle.addEventListener('click', () => {
    if (document.body.classList.contains('view-mode-settings')) {
      if (btnCopy) btnCopy.click();
    } else if (document.body.classList.contains('view-mode-canvas')) {
      setMobileViewMode('watch');
    } else {
      if (btnSimPlay) btnSimPlay.click();
    }
  });
}

if (mBtnQuickCopy) {
  mBtnQuickCopy.addEventListener('click', () => {
    if (document.body.classList.contains('view-mode-settings')) {
      setMobileViewMode('watch');
    } else {
      if (btnCopy) btnCopy.click();
    }
  });
}

// Window resize handler: redraw canvas cleanly on mobile orientation change
window.addEventListener('resize', () => {
  if (cachedOrigPoints && cachedSimpPoints) {
    renderCanvas(cachedOrigPoints, cachedSimpPoints);
  }
});

// Global Full-Window Drag & Drop
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  if (globalDropOverlay) globalDropOverlay.classList.add('active');
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth--;
  if (dragDepth <= 0) {
    dragDepth = 0;
    if (globalDropOverlay) globalDropOverlay.classList.remove('active');
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  if (globalDropOverlay) globalDropOverlay.classList.remove('active');
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// Dropzone file drag & drop
if (dropzone && fileInput) {
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });
}

// Polyline string manual input handler
const btnLoadPolyline = document.getElementById('btnLoadPolyline');
const inputPolyline = document.getElementById('inputPolyline');

if (btnLoadPolyline && inputPolyline) {
  btnLoadPolyline.addEventListener('click', () => {
    const val = inputPolyline.value;
    if (processPolylineString(val, 'Shared Polyline')) {
      inputPolyline.blur();
    }
  });

  inputPolyline.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnLoadPolyline.click();
    }
  });

  inputPolyline.addEventListener('input', () => {
    hidePolylineError();
  });
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = (e.target.result || '').trim();
    if (content.startsWith('<') || content.includes('<gpx')) {
      processGpxXml(content, file.name.replace(/\.gpx$/i, ''));
    } else {
      // Attempt decoding as polyline string
      if (!processPolylineString(content, file.name.replace(/\.(txt|polyline)$/i, ''))) {
        processGpxXml(content, file.name);
      }
    }
  };
  reader.readAsText(file);
}

function showPolylineError(msg) {
  const errEl = document.getElementById('polylineError');
  if (errEl) {
    errEl.innerText = msg;
    errEl.style.display = 'block';
  } else {
    alert(msg);
  }
}

function hidePolylineError() {
  const errEl = document.getElementById('polylineError');
  if (errEl) {
    errEl.style.display = 'none';
  }
}

// Unified route application pipeline
function applyRouteData(points, simplified, routeLabel = 'Custom Route') {
  let totalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalMeters += calcDistanceMeters(points[i], points[i + 1]);
  }

  const encoded = encodeGooglePolyline(simplified);

  cachedOrigPoints = points;
  cachedSimpPoints = simplified;

  if (valOrigPoints) valOrigPoints.innerText = points.length.toLocaleString();
  if (valSimpPoints) valSimpPoints.innerText = simplified.length.toLocaleString();
  if (valDistance) valDistance.innerText = (totalMeters / 1000).toFixed(2) + ' km';
  if (valStrLen) valStrLen.innerText = encoded.length.toLocaleString() + ' chars';
  if (outputPolyline) outputPolyline.value = encoded;

  // Memory Budget Meter (130 max Garmin anchor threshold)
  const simplifiedCount = simplified.length;
  const maxBudget = 130;
  const pct = Math.min(100, Math.round((simplifiedCount / maxBudget) * 100));

  if (memoryBudgetLabel) {
    memoryBudgetLabel.innerText = `${simplifiedCount} / ${maxBudget} pts (${pct}%)`;
  }
  if (memoryBarFill) {
    memoryBarFill.style.width = `${pct}%`;
    if (simplifiedCount > maxBudget) {
      memoryBarFill.style.background = 'var(--accent-red)';
    } else if (simplifiedCount > 115) {
      memoryBarFill.style.background = '#eab308';
    } else {
      memoryBarFill.style.background = 'var(--accent-brand)';
    }
  }
  if (memoryBadge) {
    if (simplifiedCount <= maxBudget) {
      memoryBadge.innerText = 'Memory Safe';
      memoryBadge.style.color = 'var(--accent-green)';
      memoryBadge.style.background = 'var(--accent-green-light)';
      memoryBadge.style.borderColor = 'rgba(22, 163, 74, 0.25)';
    } else {
      memoryBadge.innerText = 'Exceeds Budget';
      memoryBadge.style.color = 'var(--accent-red)';
      memoryBadge.style.background = 'var(--accent-red-light)';
      memoryBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
    }
  }
  if (exportCharCount) {
    exportCharCount.innerText = `${encoded.length.toLocaleString()} chars`;
  }

  if (canvasPointCount) {
    canvasPointCount.innerText = `${points.length} Raw Pts ➔ ${simplified.length} Simplified`;
  }

  // Update badge in route catalog
  const distKm = totalMeters / 1000;
  const distLabel = distKm >= 1 ? `${distKm.toFixed(1)} km` : `${Math.round(totalMeters)} m`;
  updateRouteCatalogBadge(routeLabel, points.length, distLabel);

  renderCanvas(points, simplified);
  if (window.initWatchSimulation) {
    initWatchSimulation(simplified);
  }
}

// Core GPX Processing Function
function processGpxXml(xmlText, routeLabel = 'Custom Route') {
  const points = parseGpx(xmlText);

  if (points.length < 2) {
    alert('No valid GPS track points found in file (<trkpt> or <rtept>).');
    return;
  }

  const simplified = smartSimplifyRoute(points, 100, 130);
  applyRouteData(points, simplified, routeLabel);
}

// Core Polyline String Processing Function
function processPolylineString(polylineStr, routeLabel = 'Shared Polyline') {
  if (!polylineStr || typeof polylineStr !== 'string') {
    showPolylineError('Please enter a valid polyline string.');
    return false;
  }

  const cleanStr = polylineStr.trim().replace(/^["']|["']$/g, '');
  if (!cleanStr) {
    showPolylineError('Polyline string is empty.');
    return false;
  }

  let points;
  try {
    points = decodeGooglePolyline(cleanStr);
  } catch (err) {
    showPolylineError('Failed to decode polyline: ' + (err.message || 'Malformed format'));
    return false;
  }

  if (!points || points.length < 2) {
    showPolylineError('Invalid polyline: decoded less than 2 coordinate points.');
    return false;
  }

  hidePolylineError();

  // If already <= 130 points, keep exact anchors intact without re-simplifying
  const simplified = points.length <= 130 ? points : smartSimplifyRoute(points, 100, 130);
  applyRouteData(points, simplified, routeLabel);
  return true;
}

function updateRouteCatalogBadge(name, pointCount, distLabel) {
  if (!routeCatalogContainer) return;
  const activeItem = routeCatalogContainer.querySelector('.route-item.active');
  if (activeItem) {
    const badge = activeItem.querySelector('.route-item-badge');
    if (badge) badge.innerText = `${distLabel} • ${pointCount} pts`;
    return;
  }

  // If user uploaded a new file, generate a custom route card dynamically at top
  let customItem = document.getElementById('customRouteItem');
  if (!customItem) {
    customItem = document.createElement('div');
    customItem.id = 'customRouteItem';
    customItem.className = 'route-item active';
    routeCatalogContainer.prepend(customItem);
  }
  document.querySelectorAll('.route-item').forEach((el) => el.classList.remove('active'));
  customItem.classList.add('active');
  customItem.innerHTML = `
    <div class="route-item-header">
      <span class="route-item-title">${name}</span>
      <span class="route-item-badge" style="color: var(--accent-brand); border-color: rgba(234, 88, 12, 0.4); background: var(--accent-brand-light);">${distLabel} • ${pointCount} pts</span>
    </div>
  `;
}

// Copy polyline button with tactile state feedback
if (btnCopy) {
  btnCopy.addEventListener('click', () => {
    if (!outputPolyline || !outputPolyline.value) return;
    outputPolyline.select();
    navigator.clipboard.writeText(outputPolyline.value).then(() => {
      if (btnCopyLabel) {
        btnCopyLabel.innerText = '✓ Copied to Clipboard!';
        btnCopy.classList.add('copied');
        setTimeout(() => {
          btnCopyLabel.innerText = 'Copy Route for Garmin Connect';
          btnCopy.classList.remove('copied');
        }, 2500);
      }
      if (toastMessage) toastMessage.innerText = 'Route string copied to clipboard!';
      if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2200);
      }
    });
  });
}

// Route Catalog Initialization
function initRouteCatalog() {
  if (!routeCatalogContainer || !window.HE_KIM_KOO_ROUTES || !Array.isArray(window.HE_KIM_KOO_ROUTES)) return;

  routeCatalogContainer.innerHTML = '';
  window.HE_KIM_KOO_ROUTES.forEach((route, idx) => {
    let badgeText = 'Click to calculate';
    if (route.isNoRoute) {
      badgeText = 'No Route • Free Walk';
    } else if (route.content) {
      const stats = extractGpxSummary(route.content);
      badgeText = stats ? `${stats.distLabel} • ${stats.points} pts` : 'Click to calculate';
    }

    const item = document.createElement('div');
    item.className = 'route-item' + (idx === 0 ? ' active' : '');
    item.dataset.routeId = route.id;
    item.innerHTML = `
      <div class="route-item-header">
        <span class="route-item-title">${route.name}</span>
        <span class="route-item-badge">${badgeText}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.route-item').forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      loadCatalogRoute(route);
    });

    routeCatalogContainer.appendChild(item);
  });
}

async function loadCatalogRoute(route) {
  if (route.isNoRoute) {
    loadNoRouteMode();
    return;
  }

  if (route.content) {
    processGpxXml(route.content, route.name);
    return;
  }

  if (route.file) {
    try {
      const res = await fetch(route.file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      processGpxXml(text, route.name);
      return;
    } catch (e) {
      console.warn('Failed to fetch route file:', route.file, e);
    }
  }
}

function loadNoRouteMode() {
  cachedOrigPoints = null;
  cachedSimpPoints = null;

  if (valOrigPoints) valOrigPoints.innerText = '0';
  if (valSimpPoints) valSimpPoints.innerText = '0';
  if (valDistance) valDistance.innerText = '0.00 km';
  if (valStrLen) valStrLen.innerText = '0 chars';
  if (outputPolyline) outputPolyline.value = '';

  if (memoryBudgetLabel) {
    memoryBudgetLabel.innerText = '0 / 130 pts (0%)';
  }
  if (memoryBarFill) {
    memoryBarFill.style.width = '0%';
    memoryBarFill.style.background = 'var(--accent-brand)';
  }
  if (memoryBadge) {
    memoryBadge.innerText = 'No Route';
    memoryBadge.style.color = 'var(--accent-cyan)';
    memoryBadge.style.background = 'var(--accent-cyan-light)';
    memoryBadge.style.borderColor = 'rgba(2, 132, 199, 0.25)';
  }
  if (exportCharCount) {
    exportCharCount.innerText = '0 chars';
  }
  if (canvasPointCount) {
    canvasPointCount.innerText = 'No Route Configured (Free Walk)';
  }

  if (trailCanvas) {
    const ctx = trailCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      ctx.fillStyle = '#64748b';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No preloaded route. In Free Exploration mode on watch simulator.', trailCanvas.width / 2, trailCanvas.height / 2);
    }
  }

  if (window.initWatchSimulation) {
    initWatchSimulation([]);
  }
}

// DOM Ready Handler
window.addEventListener('DOMContentLoaded', async () => {
  initRouteCatalog();

  // Mobile default to settings/import view
  if (window.innerWidth <= 880) {
    setMobileViewMode('settings');
  }

  if (window.HE_KIM_KOO_ROUTES && window.HE_KIM_KOO_ROUTES.length > 0) {
    const defaultRoute = window.HE_KIM_KOO_ROUTES[0];
    await loadCatalogRoute(defaultRoute);
  } else {
    try {
      const res = await fetch('routes/dino.gpx');
      if (res.ok) {
        const text = await res.text();
        processGpxXml(text, 'Taipei Dino');
      }
    } catch (e) {
      console.warn('Direct dino.gpx fetch skipped');
    }
  }
});

// Expose app helpers
window.processGpxXml = processGpxXml;
window.processPolylineString = processPolylineString;
window.loadCatalogRoute = loadCatalogRoute;

