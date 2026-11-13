// =============================================================================
// He-Kim-Koo 1:1 Garmin Venu 2 Plus AMOLED Simulator Engine
// =============================================================================

// DOM Elements
const watchHousing = document.getElementById('watchHousing');
const watchCanvas = document.getElementById('watchCanvas');
const watchCtx = watchCanvas ? watchCanvas.getContext('2d') : null;
const btnSimPlay = document.getElementById('btnSimPlay');
const btnSimReset = document.getElementById('btnSimReset');
const simSpeedSelect = document.getElementById('simSpeedSelect');

// Settings & Controls
const timelineSlider = document.getElementById('timelineSlider');
const timelineDistLabel = document.getElementById('timelineDistLabel');
const btnDirForward = document.getElementById('btnDirForward');
const btnDirReverse = document.getElementById('btnDirReverse');
const toggleDirection = document.getElementById('toggleDirection');
const toggleDim = document.getElementById('toggleDim');
const toggleTurnCue = document.getElementById('toggleTurnCue');
const toggleAnchors = document.getElementById('toggleAnchors');
const toggleProgress = document.getElementById('toggleProgress');
const toggleVibration = document.getElementById('toggleVibration');

// Backward compatibility references (if old markup exists)
const btnSimDirection = document.getElementById('btnSimDirection');
const btnToggleDirection = document.getElementById('btnToggleDirection');
const btnToggleDim = document.getElementById('btnToggleDim');
const btnToggleTurnCue = document.getElementById('btnToggleTurnCue');
const btnToggleAnchors = document.getElementById('btnToggleAnchors');

const btnSimDeviate = document.getElementById('btnSimDeviate');
const simRangeSlider = document.getElementById('simRangeSlider');
const simRangeVal = document.getElementById('simRangeVal');
const simHeadingSlider = document.getElementById('simHeadingSlider');
const simHeadingVal = document.getElementById('simHeadingVal');
const hapticBadge = document.getElementById('hapticBadge');

const simDistSlider = document.getElementById('simDistSlider');
const simDistVal = document.getElementById('simDistVal');
const btnDistAtStart = document.getElementById('btnDistAtStart');
const btnDistNear = document.getElementById('btnDistNear');
const btnDistFar = document.getElementById('btnDistFar');

const btnTestStart = document.getElementById('btnTestStart');
const btnTestMidStart = document.getElementById('btnTestMidStart');
const btnTestFarAway = document.getElementById('btnTestFarAway');

const readoutHeading = document.getElementById('readoutHeading');
const readoutCtd = document.getElementById('readoutCtd');
const readoutStatus = document.getElementById('readoutStatus');

// Simulation State Variables
let isReversed = false;
let simRoute = [];
let simChevrons = [];
let cornerAnchors = [];
let visitedSegments = [];
let simTrail = [];
let simSparks = [];

const simState = {
  segIdx: 0,
  segProgress: 0.0,
  currLat: 0,
  currLon: 0,
  targetHeadingRad: 0.0,
  renderHeadingRad: 0.0,
  manualHeading: false,
  mapRange: 175,
  showDirection: true,
  deviateMeters: 0,
  isPlaying: false,
  lastTrailLat: 0,
  lastTrailLon: 0,
  lastSparkLat: 0,
  lastSparkLon: 0,
  animFrame: null,
  dimCompletedPath: true,
  showTurnCue: true,
  showCornerAnchors: true,
  showProgress: true,
  simulateHaptic: true,
  fieldHeight: 416,
  wasOffCourse: false,
  isOffCourse: false,
  offCourseCount: 0,
  gpsQuality: 3,
  lastHapticTime: 0,
  totalRouteDist: 0,
  boxWidthM: 0,
  boxHeightM: 0,
  centerLat: 0,
  centerLon: 0,
  previewMode: false,
  distToStart: 0,
  bearingToStart: 0,
  lastVibedCornerIdx: -1,
  routeStatus: 'OK',
  truncatedTotalPts: 0,
};

function triggerHaptic(type = 'vibe', message = 'Off-Course Alert (+45m)') {
  if (!simState.simulateHaptic) return;
  const now = performance.now();
  if (now - simState.lastHapticTime < 2000 && type !== 'finish') return;
  simState.lastHapticTime = now;

  if (!watchHousing || !hapticBadge) return;
  watchHousing.classList.remove('vibrating', 'finished');
  void watchHousing.offsetWidth; // Force CSS reflow to re-trigger animation

  if (type === 'finish') {
    watchHousing.classList.add('finished');
    hapticBadge.className = 'haptic-alert-pill pill-finish show';
  } else {
    watchHousing.classList.add('vibrating');
    hapticBadge.className = 'haptic-alert-pill show';
  }
  hapticBadge.innerText = message;

  setTimeout(() => {
    hapticBadge.classList.remove('show');
    watchHousing.classList.remove('vibrating', 'finished');
  }, 2200);
}

function calcRouteDistances() {
  simState.totalRouteDist = 0;
  simState.cumDistances = [0];
  if (!simRoute || simRoute.length < 2) return;
  let minLat = simRoute[0].lat,
    maxLat = simRoute[0].lat;
  let minLon = simRoute[0].lon,
    maxLon = simRoute[0].lon;

  for (let i = 0; i < simRoute.length - 1; i++) {
    const d = calcDistanceMeters(simRoute[i], simRoute[i + 1]);
    simState.totalRouteDist += d;
    simState.cumDistances.push(simState.totalRouteDist);
  }

  for (let i = 0; i < simRoute.length; i++) {
    if (simRoute[i].lat < minLat) minLat = simRoute[i].lat;
    if (simRoute[i].lat > maxLat) maxLat = simRoute[i].lat;
    if (simRoute[i].lon < minLon) minLon = simRoute[i].lon;
    if (simRoute[i].lon > maxLon) maxLon = simRoute[i].lon;
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  simState.boxWidthM = (maxLon - minLon) * 111319.5 * cosLat;
  simState.boxHeightM = (maxLat - minLat) * 111132.9;
  simState.centerLat = centerLat;
  simState.centerLon = centerLon;
  simState.minLat = minLat;
  simState.maxLat = maxLat;
  simState.minLon = minLon;
  simState.maxLon = maxLon;
}

function updateTimelineUI(currDist) {
  const total = simState.totalRouteDist || 0;
  if (timelineDistLabel) {
    if (total > 0) {
      timelineDistLabel.innerText = `${(currDist / 1000).toFixed(1)} / ${(total / 1000).toFixed(1)} km`;
    } else {
      timelineDistLabel.innerText = currDist >= 1000 ? `${(currDist / 1000).toFixed(2)} km (Free Walk)` : `${Math.round(currDist)} m (Free Walk)`;
    }
  }
  if (timelineSlider && document.activeElement !== timelineSlider) {
    const pct = total > 0 ? Math.min(1000, Math.round((currDist / total) * 1000)) : 0;
    timelineSlider.value = pct;
  }
}

function seekToDistance(targetMeters) {
  if (!simRoute || simRoute.length < 2 || !simState.cumDistances) return;
  targetMeters = Math.max(0, Math.min(targetMeters, simState.totalRouteDist));

  let seg = 0;
  while (seg < simRoute.length - 2 && simState.cumDistances[seg + 1] <= targetMeters) {
    seg++;
  }
  const segStartDist = simState.cumDistances[seg] || 0;
  const pA = simRoute[seg];
  const pB = simRoute[seg + 1];
  const segLen = calcDistanceMeters(pA, pB);
  const progress = segLen > 0.001 ? Math.max(0, Math.min(1.0, (targetMeters - segStartDist) / segLen)) : 0;

  simState.segIdx = seg;
  simState.segProgress = progress;
  simState.hasFinished = false;
  simState.lastVibedCornerIdx = -1;

  for (let i = 0; i < visitedSegments.length; i++) {
    visitedSegments[i] = i < seg;
  }

  const baseLat = pA.lat + (pB.lat - pA.lat) * progress;
  const baseLon = pA.lon + (pB.lon - pA.lon) * progress;
  simState.currLat = baseLat;
  simState.currLon = baseLon;

  const vLat = pB.lat - pA.lat;
  const vLon = (pB.lon - pA.lon) * Math.cos((baseLat * Math.PI) / 180);
  const natHeading = Math.atan2(vLon, vLat);

  if (!simState.manualHeading) {
    simState.targetHeadingRad = natHeading;
    simState.renderHeadingRad = natHeading;
    const deg = Math.round(((natHeading * 180) / Math.PI + 360) % 360);
    if (simHeadingSlider) simHeadingSlider.value = deg;
    if (simHeadingVal) simHeadingVal.innerText = deg + '°';
  }

  simTrail = [{ lat: baseLat, lon: baseLon }];
  simSparks = [{ lat: baseLat, lon: baseLon }];
  simState.lastTrailLat = baseLat;
  simState.lastTrailLon = baseLon;

  updateTimelineUI(targetMeters);
  drawWatchScreen();
}

function getNextTurnCue() {
  if (!simRoute || simRoute.length < 3 || simState.segIdx >= simRoute.length - 1) return null;
  const pCurA = simRoute[simState.segIdx];
  const pCurB = simRoute[simState.segIdx + 1];
  const curSegLen = calcDistanceMeters(pCurA, pCurB);
  let distAhead = curSegLen * (1 - simState.segProgress);

  for (let i = simState.segIdx + 1; i < simRoute.length - 1; i++) {
    const p0 = simRoute[i - 1];
    const p1 = simRoute[i];
    const p2 = simRoute[i + 1];

    const cosLat = Math.cos((p1.lat * Math.PI) / 180);
    const v1x = (p1.lon - p0.lon) * 111319.5 * cosLat;
    const v1y = (p1.lat - p0.lat) * 111132.9;
    const v2x = (p2.lon - p1.lon) * 111319.5 * cosLat;
    const v2y = (p2.lat - p1.lat) * 111132.9;

    const a1 = Math.atan2(v1x, v1y);
    const a2 = Math.atan2(v2x, v2y);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const deg = (diff * 180) / Math.PI;
    if (Math.abs(deg) >= 35) {
      return {
        cornerIdx: i,
        dist: Math.round(distAhead),
        direction: deg > 0 ? 'right' : 'left',
        label: deg > 0 ? `↱ ${Math.round(distAhead)}m` : `↰ ${Math.round(distAhead)}m`,
      };
    }
    distAhead += calcDistanceMeters(p1, p2);
    if (distAhead > 130) break;
  }
  return null;
}

function precomputeChevrons() {
  simChevrons = [];
  if (!simRoute || simRoute.length < 2) return;

  const cosLat = Math.cos((simRoute[0].lat * Math.PI) / 180);
  let targetDist = 50.0;
  let currentDist = 0.0;
  let chevronIdx = 1;

  for (let i = 0; i < simRoute.length - 1; i++) {
    const p1 = simRoute[i];
    const p2 = simRoute[i + 1];
    const dx = (p2.lon - p1.lon) * 111319.5 * cosLat;
    const dy = (p2.lat - p1.lat) * 111132.9;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.1) continue;

    const ux = dx / segLen;
    const uy = dy / segLen;

    while (targetDist <= currentDist + segLen) {
      const t = (targetDist - currentDist) / segLen;
      const cLat = p1.lat + t * (p2.lat - p1.lat);
      const cLon = p1.lon + t * (p2.lon - p1.lon);
      const isMajor = chevronIdx % 5 === 0;

      simChevrons.push({
        lat: cLat,
        lon: cLon,
        ux: ux,
        uy: uy,
        isMajor: isMajor,
        dist: targetDist,
      });

      chevronIdx++;
      targetDist += 50.0;
    }
    currentDist += segLen;
  }
}

function precomputeCornerAnchors() {
  cornerAnchors = [];
  if (!simRoute || simRoute.length < 3) return;
  for (let i = 1; i < simRoute.length - 1; i++) {
    const p0 = simRoute[i - 1];
    const p1 = simRoute[i];
    const p2 = simRoute[i + 1];

    const cosLat = Math.cos((p1.lat * Math.PI) / 180);
    const v1x = (p1.lon - p0.lon) * 111319.5 * cosLat;
    const v1y = (p1.lat - p0.lat) * 111132.9;
    const v2x = (p2.lon - p1.lon) * 111319.5 * cosLat;
    const v2y = (p2.lat - p1.lat) * 111132.9;

    const a1 = Math.atan2(v1x, v1y);
    const a2 = Math.atan2(v2x, v2y);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const deg = (Math.abs(diff) * 180) / Math.PI;
    if (deg >= 38) {
      cornerAnchors.push({
        idx: i,
        lat: p1.lat,
        lon: p1.lon,
        deg: Math.round(deg),
      });
    }
  }
}

function initWatchSimulation(points) {
  simRoute = points ? points.slice() : [];
  if (isReversed && simRoute.length >= 2) {
    simRoute.reverse();
  }
  if (simRoute.length >= 2) {
    calcRouteDistances();
    precomputeChevrons();
    precomputeCornerAnchors();
  } else {
    simChevrons = [];
    cornerAnchors = [];
    visitedSegments = [];
    simState.totalRouteDist = 0;
  }
  resetSimulationState(0);
  drawWatchScreen();
}

function resetSimulationState(startSegIdx = 0) {
  if (!simRoute || simRoute.length < 2) {
    simState.segIdx = 0;
    simState.segProgress = 0.0;
    if (!simState.currLat || !simState.currLon) {
      simState.currLat = 25.062702;
      simState.currLon = 121.530339;
    }
    simState.deviateMeters = 0;
    simState.isGuideToStart = false;
    simState.hasFinished = false;
    simState.wasOffCourse = false;
    simState.lastVibedCornerIdx = -1;
    simState.previewMode = false;
    simState.freeWalkDistance = 0;
    simState.randomWalkStepDist = 0;
    simState.nextTurnDistance = 4.0 + Math.random() * 5.0;

    simTrail = [{ lat: simState.currLat, lon: simState.currLon }];
    simSparks = [{ lat: simState.currLat, lon: simState.currLon }];
    simState.lastTrailLat = simState.currLat;
    simState.lastTrailLon = simState.currLon;
    simState.lastSparkLat = simState.currLat;
    simState.lastSparkLon = simState.currLon;

    if (btnSimDeviate) {
      btnSimDeviate.innerText = 'Off-Course Test (+45m)';
    }
    if (simDistSlider) simDistSlider.value = 0;
    if (simDistVal) simDistVal.innerText = '0 m';

    updateTimelineUI(0);
    return;
  }

  const validStart = Math.min(Math.max(0, startSegIdx), simRoute.length - 2);
  simState.segIdx = validStart;
  simState.segProgress = 0.0;
  simState.currLat = simRoute[validStart].lat;
  simState.currLon = simRoute[validStart].lon;
  simState.deviateMeters = 0;
  simState.isGuideToStart = false;
  simState.hasFinished = false;
  simState.wasOffCourse = false;
  simState.previewMode = false;

  visitedSegments = new Array(simRoute.length - 1).fill(false);

  simTrail = [{ lat: simRoute[validStart].lat, lon: simRoute[validStart].lon }];
  simSparks = [{ lat: simRoute[validStart].lat, lon: simRoute[validStart].lon }];
  simState.lastTrailLat = simRoute[validStart].lat;
  simState.lastTrailLon = simRoute[validStart].lon;
  simState.lastSparkLat = simRoute[validStart].lat;
  simState.lastSparkLon = simRoute[validStart].lon;

  const nextIdx = validStart + 1;
  const vLat = simRoute[nextIdx].lat - simRoute[validStart].lat;
  const vLon = (simRoute[nextIdx].lon - simRoute[validStart].lon) * Math.cos((simRoute[validStart].lat * Math.PI) / 180);
  const initHeading = Math.atan2(vLon, vLat);
  simState.targetHeadingRad = initHeading;
  simState.renderHeadingRad = initHeading;
  if (simHeadingSlider) {
    simHeadingSlider.value = Math.round(((initHeading * 180) / Math.PI + 360) % 360);
  }
  if (simHeadingVal && simHeadingSlider) {
    simHeadingVal.innerText = simHeadingSlider.value + '°';
  }

  if (btnSimDeviate) {
    btnSimDeviate.innerText = 'Off-Course Test (+45m)';
  }

  if (simDistSlider) simDistSlider.value = 0;
  if (simDistVal) simDistVal.innerText = '0 m';
  if (btnDistAtStart) btnDistAtStart.classList.add('btn-active');
  if (btnDistNear) btnDistNear.classList.remove('btn-active');
  if (btnDistFar) btnDistFar.classList.remove('btn-active');

  const currentDist = simState.cumDistances && simState.cumDistances[validStart] ? simState.cumDistances[validStart] : 0;
  updateTimelineUI(currentDist);
}

function togglePlayPause() {
  const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');

  if (simState.isPlaying) {
    simState.isPlaying = false;
    if (btnSimPlay) btnSimPlay.innerText = 'Resume Simulation';
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Resume';
    if (simState.animFrame) cancelAnimationFrame(simState.animFrame);
  } else {
    // If starting a run from preview mode or finished, reset to start of route
    if (simRoute && simRoute.length >= 2) {
      if (simState.previewMode || simState.distToStart > 50 || simState.segIdx >= simRoute.length - 1 || simState.hasFinished) {
        setDistanceToStart(0);
      }
    }
    simState.manualHeading = false; // Release manual lock so runner faces moving direction
    simState.isPlaying = true;
    if (btnSimPlay) btnSimPlay.innerText = 'Pause Simulation';
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Pause';
    simState.lastTick = performance.now();
    requestAnimationFrame(simAnimationLoop);
  }
}

// Control Event Bindings
if (btnSimPlay) {
  btnSimPlay.addEventListener('click', togglePlayPause);
}

if (btnSimReset) {
  btnSimReset.addEventListener('click', () => {
    const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');
    simState.isPlaying = false;
    if (btnSimPlay) btnSimPlay.innerText = 'Start Run Simulation';
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Start';
    if (simState.animFrame) cancelAnimationFrame(simState.animFrame);
    resetSimulationState();
    drawWatchScreen();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'KeyR') {
    e.preventDefault();
    if (btnSimReset) btnSimReset.click();
  }
});

if (btnSimDeviate) {
  btnSimDeviate.addEventListener('click', () => {
    if (simState.deviateMeters === 0) {
      simState.deviateMeters = 45;
      btnSimDeviate.innerText = 'Back on Course (0m)';
    } else {
      simState.deviateMeters = 0;
      btnSimDeviate.innerText = 'Off-Course Test (+45m)';
    }
    drawWatchScreen();
  });
}

if (simHeadingSlider) {
  simHeadingSlider.addEventListener('input', (e) => {
    const deg = parseFloat(e.target.value);
    if (simHeadingVal) simHeadingVal.innerText = deg + '°';
    const rad = (deg * Math.PI) / 180;
    simState.targetHeadingRad = rad;
    simState.renderHeadingRad = rad; // Immediate update for preview & navigation
    simState.manualHeading = true;
    drawWatchScreen();
  });
}

if (simRangeSlider) {
  simRangeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (simRangeVal) simRangeVal.innerText = val + 'm';
    simState.mapRange = val;
    drawWatchScreen();
  });
}

// Route direction segmented control
function setRouteDirection(reversed) {
  if (isReversed === reversed) return;
  isReversed = reversed;
  if (btnDirForward) btnDirForward.classList.toggle('active', !isReversed);
  if (btnDirReverse) btnDirReverse.classList.toggle('active', isReversed);
  if (btnSimDirection) {
    btnSimDirection.innerText = isReversed ? 'Reverse (Inverted)' : 'Forward (Original)';
  }
  if (simRoute && simRoute.length >= 2) {
    simRoute.reverse();
    calcRouteDistances();
    precomputeChevrons();
    precomputeCornerAnchors();
    resetSimulationState(0);
    drawWatchScreen();
  }
}

if (btnDirForward) {
  btnDirForward.addEventListener('click', () => setRouteDirection(false));
}
if (btnDirReverse) {
  btnDirReverse.addEventListener('click', () => setRouteDirection(true));
}

if (btnSimDirection) {
  btnSimDirection.addEventListener('click', () => {
    setRouteDirection(!isReversed);
  });
}

// Hardware switch toggles
if (toggleDirection) {
  toggleDirection.checked = simState.showDirection;
  toggleDirection.addEventListener('change', (e) => {
    simState.showDirection = e.target.checked;
    drawWatchScreen();
  });
}

if (toggleDim) {
  toggleDim.checked = simState.dimCompletedPath;
  toggleDim.addEventListener('change', (e) => {
    simState.dimCompletedPath = e.target.checked;
    drawWatchScreen();
  });
}

if (toggleTurnCue) {
  toggleTurnCue.checked = simState.showTurnCue;
  toggleTurnCue.addEventListener('change', (e) => {
    simState.showTurnCue = e.target.checked;
    drawWatchScreen();
  });
}

if (toggleAnchors) {
  toggleAnchors.checked = simState.showCornerAnchors;
  toggleAnchors.addEventListener('change', (e) => {
    simState.showCornerAnchors = e.target.checked;
    drawWatchScreen();
  });
}

if (toggleProgress) {
  toggleProgress.checked = simState.showProgress;
  toggleProgress.addEventListener('change', (e) => {
    simState.showProgress = e.target.checked;
    drawWatchScreen();
  });
}

if (toggleVibration) {
  toggleVibration.checked = simState.simulateHaptic;
  toggleVibration.addEventListener('change', (e) => {
    simState.simulateHaptic = e.target.checked;
  });
}

const simLayoutSelect = document.getElementById('simLayoutSelect');
if (simLayoutSelect) {
  simLayoutSelect.value = String(simState.fieldHeight || 416);
  simLayoutSelect.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    simState.fieldHeight = Number.isFinite(val) ? val : 416;
    drawWatchScreen();
  });
}

// Timeline Scrubber Slider
if (timelineSlider) {
  timelineSlider.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10) / 1000;
    const targetMeters = pct * (simState.totalRouteDist || 0);
    seekToDistance(targetMeters);
  });
}

// Legacy button compatibility
if (btnToggleDirection) {
  btnToggleDirection.addEventListener('click', () => {
    simState.showDirection = !simState.showDirection;
    if (toggleDirection) toggleDirection.checked = simState.showDirection;
    btnToggleDirection.classList.toggle('btn-active', simState.showDirection);
    btnToggleDirection.innerText = simState.showDirection ? 'ON (50m/250m)' : 'OFF';
    drawWatchScreen();
  });
}

if (btnToggleDim) {
  btnToggleDim.addEventListener('click', () => {
    simState.dimCompletedPath = !simState.dimCompletedPath;
    if (toggleDim) toggleDim.checked = simState.dimCompletedPath;
    btnToggleDim.classList.toggle('btn-active', simState.dimCompletedPath);
    btnToggleDim.innerText = simState.dimCompletedPath ? 'ON (Dimmed)' : 'OFF (Bright)';
    drawWatchScreen();
  });
}

if (btnToggleTurnCue) {
  btnToggleTurnCue.addEventListener('click', () => {
    simState.showTurnCue = !simState.showTurnCue;
    if (toggleTurnCue) toggleTurnCue.checked = simState.showTurnCue;
    btnToggleTurnCue.classList.toggle('btn-active', simState.showTurnCue);
    btnToggleTurnCue.innerText = simState.showTurnCue ? 'ON' : 'OFF';
    drawWatchScreen();
  });
}

if (btnToggleAnchors) {
  btnToggleAnchors.addEventListener('click', () => {
    simState.showCornerAnchors = !simState.showCornerAnchors;
    if (toggleAnchors) toggleAnchors.checked = simState.showCornerAnchors;
    btnToggleAnchors.classList.toggle('btn-active', simState.showCornerAnchors);
    btnToggleAnchors.innerText = simState.showCornerAnchors ? 'ON' : 'OFF';
    drawWatchScreen();
  });
}

function setDistanceToStart(distMeters) {
  if (!simRoute || simRoute.length < 2) return;
  const pStart = simRoute[0];
  const cosLat0 = Math.cos((pStart.lat * Math.PI) / 180);

  // Stop active playback if running
  simState.isPlaying = false;
  if (simState.animFrame) cancelAnimationFrame(simState.animFrame);
  if (btnSimPlay) btnSimPlay.innerText = 'Start Run Simulation';
  const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');
  if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Start';

  const D = Math.max(0, distMeters);

  if (D === 0) {
    simState.previewMode = false;
    simState.manualHeading = false;
    simState.segIdx = 0;
    simState.segProgress = 0.0;
    simState.currLat = pStart.lat;
    simState.currLon = pStart.lon;
    simState.distToStart = 0;
    if (simRoute.length >= 2) {
      const pB = simRoute[1];
      const vLat = pB.lat - pStart.lat;
      const vLon = (pB.lon - pStart.lon) * cosLat0;
      const initH = Math.atan2(vLon, vLat);
      simState.targetHeadingRad = initH;
      simState.renderHeadingRad = initH;
      const deg = Math.round(((initH * 180) / Math.PI + 360) % 360);
      if (simHeadingSlider) simHeadingSlider.value = deg;
      if (simHeadingVal) simHeadingVal.innerText = deg + '°';
    }
    simTrail = [{ lat: pStart.lat, lon: pStart.lon }];
    simSparks = [{ lat: pStart.lat, lon: pStart.lon }];
    updateTimelineUI(0);
  } else {
    // Offset along Southwest bearing (225 deg) from start point
    const bearingRad = (225 * Math.PI) / 180;
    const dLat = (D * Math.cos(bearingRad)) / 111132.9;
    const dLon = (D * Math.sin(bearingRad)) / (111319.5 * cosLat0);
    simState.currLat = pStart.lat + dLat;
    simState.currLon = pStart.lon + dLon;
    simState.distToStart = D;
    simState.previewMode = (D > 100);
    simState.renderHeadingRad = simState.targetHeadingRad;
  }

  // Update slider & readout
  if (simDistSlider) simDistSlider.value = D;
  if (simDistVal) {
    simDistVal.innerText = D >= 1000 ? `${(D / 1000).toFixed(1)} km` : `${Math.round(D)} m`;
  }

  // Update button active state
  if (btnDistAtStart) btnDistAtStart.classList.toggle('btn-active', D === 0);
  if (btnDistNear) btnDistNear.classList.toggle('btn-active', D > 100 && D < 1000);
  if (btnDistFar) btnDistFar.classList.toggle('btn-active', D >= 1000);

  drawWatchScreen();
}

if (simDistSlider) {
  simDistSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    setDistanceToStart(val);
  });
}

if (btnDistAtStart) {
  btnDistAtStart.addEventListener('click', () => setDistanceToStart(0));
}

if (btnDistNear) {
  btnDistNear.addEventListener('click', () => setDistanceToStart(450));
}

if (btnDistFar) {
  btnDistFar.addEventListener('click', () => setDistanceToStart(3000));
}

if (btnTestFarAway) {
  btnTestFarAway.addEventListener('click', () => setDistanceToStart(3000));
}

function simAnimationLoop(now) {
  if (!simState.isPlaying) return;
  const dt = Math.min((now - (simState.lastTick || now)) / 1000, 0.1);
  simState.lastTick = now;

  const speedMultiplier = simSpeedSelect ? parseFloat(simSpeedSelect.value) : 5.0;
  const runSpeedMetersPerSec = 3.2 * speedMultiplier;

  if (simRoute && simRoute.length >= 2) {
    advanceRunner(runSpeedMetersPerSec * dt);
  } else {
    advanceRandomWalker(runSpeedMetersPerSec * dt);
  }

  let diff = simState.targetHeadingRad - simState.renderHeadingRad;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  simState.renderHeadingRad += diff * 0.18;

  drawWatchScreen();
  simState.animFrame = requestAnimationFrame(simAnimationLoop);
}

function advanceRandomWalker(distanceM) {
  if (simState.randomWalkStepDist === undefined) {
    simState.randomWalkStepDist = 0;
  }
  if (!simState.nextTurnDistance) {
    simState.nextTurnDistance = 4.0 + Math.random() * 5.0; // 4m ~ 9m per heading tweak
  }

  simState.randomWalkStepDist += distanceM;
  if (simState.randomWalkStepDist >= simState.nextTurnDistance) {
    simState.randomWalkStepDist = 0;
    simState.nextTurnDistance = 4.0 + Math.random() * 5.0;

    const r = Math.random();
    let maxAngleRad = (15 * Math.PI) / 180;
    if (r < 0.50) {
      // 50% chance: advance within 30 deg cone (±15° subtle heading adjustment)
      maxAngleRad = (15 * Math.PI) / 180;
    } else if (r < 0.80) {
      // 30% chance: turn within 180 deg range (±90° street/corner turn)
      maxAngleRad = (90 * Math.PI) / 180;
    } else {
      // 20% chance: wide exploration within 270 deg range (±135° sharp turn/loop)
      maxAngleRad = (135 * Math.PI) / 180;
    }

    const deltaRad = (Math.random() * 2 - 1) * maxAngleRad;
    const currentHeading = simState.targetHeadingRad || 0.0;
    let nextHeading = currentHeading + deltaRad;
    while (nextHeading > Math.PI) nextHeading -= 2 * Math.PI;
    while (nextHeading < -Math.PI) nextHeading += 2 * Math.PI;
    simState.targetHeadingRad = nextHeading;

    if (!simState.manualHeading && simHeadingSlider) {
      const deg = Math.round(((nextHeading * 180) / Math.PI + 360) % 360);
      simHeadingSlider.value = deg;
      if (simHeadingVal) simHeadingVal.innerText = deg + '°';
    }
  }

  // Move forward in current renderHeading direction
  const heading = simState.renderHeadingRad || 0.0;
  const baseLat = simState.currLat;
  const cosLat = Math.cos((baseLat * Math.PI) / 180);
  const dLat = (distanceM * Math.cos(heading)) / 111132.9;
  const dLon = (distanceM * Math.sin(heading)) / (111319.5 * cosLat);

  simState.currLat += dLat;
  simState.currLon += dLon;

  simState.freeWalkDistance = (simState.freeWalkDistance || 0) + distanceM;
  updateTimelineUI(simState.freeWalkDistance);

  recordTrailAndSparks();
}

function advanceRunner(distanceM) {
  const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');
  visitedSegments[simState.segIdx] = true;

  if (simState.segIdx >= simRoute.length - 1) {
    const hasUnvisited = visitedSegments.some((v) => !v);
    if (hasUnvisited) {
      simState.segIdx = 0;
      simState.segProgress = 0;
    } else {
      simState.isPlaying = false;
      simState.hasFinished = true;
      if (btnSimPlay) btnSimPlay.innerText = 'Replay Simulation';
      if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Replay';
      updateTimelineUI(simState.totalRouteDist || 0);
      triggerHaptic('finish', 'GPS Art Completed!');
      return;
    }
  }

  const pA = simRoute[simState.segIdx];
  const pB = simRoute[simState.segIdx + 1];
  const segLen = calcDistanceMeters(pA, pB);

  if (segLen <= 0.001) {
    simState.segIdx++;
    simState.segProgress = 0;
    return;
  }

  simState.segProgress += distanceM / segLen;
  if (simState.segProgress >= 1.0) {
    visitedSegments[simState.segIdx] = true;
    simState.segProgress = 0;
    simState.segIdx++;
    if (simState.segIdx >= simRoute.length - 1) {
      const hasUnvisited = visitedSegments.some((v) => !v);
      if (hasUnvisited) {
        simState.segIdx = 0;
        simState.segProgress = 0;
      } else {
        simState.isPlaying = false;
        simState.hasFinished = true;
        if (btnSimPlay) btnSimPlay.innerText = 'Replay Simulation';
        if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Replay';
        updateTimelineUI(simState.totalRouteDist || 0);
        triggerHaptic('finish', 'GPS Art Completed!');
        return;
      }
    }
  }

  const currA = simRoute[simState.segIdx];
  const currB = simRoute[simState.segIdx + 1];
  const t = simState.segProgress;
  const baseLat = currA.lat + (currB.lat - currA.lat) * t;
  const baseLon = currA.lon + (currB.lon - currA.lon) * t;

  const vLat = currB.lat - currA.lat;
  const vLon = (currB.lon - currA.lon) * Math.cos((baseLat * Math.PI) / 180);
  const naturalHeading = Math.atan2(vLon, vLat);

  if (!simState.manualHeading) {
    simState.targetHeadingRad = naturalHeading;
    const deg = Math.round(((naturalHeading * 180) / Math.PI + 360) % 360);
    if (simHeadingSlider) simHeadingSlider.value = deg;
    if (simHeadingVal) simHeadingVal.innerText = deg + '°';
  }

  if (simState.deviateMeters > 0) {
    const rightAngle = simState.renderHeadingRad + Math.PI / 2;
    const dLat = (simState.deviateMeters * Math.cos(rightAngle)) / 111132.9;
    const dLon = (simState.deviateMeters * Math.sin(rightAngle)) / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
    simState.currLat = baseLat + dLat;
    simState.currLon = baseLon + dLon;
  } else {
    simState.currLat = baseLat;
    simState.currLon = baseLon;
  }

  const currDist = (simState.cumDistances && simState.cumDistances[simState.segIdx] ? simState.cumDistances[simState.segIdx] : 0) + simState.segProgress * segLen;
  updateTimelineUI(currDist);

  recordTrailAndSparks();
}

function recordTrailAndSparks() {
  const baseLat = simState.currLat;
  const dLatM = (simState.currLat - simState.lastTrailLat) * 111132.9;
  const dLonM = (simState.currLon - simState.lastTrailLon) * 111319.5 * Math.cos((baseLat * Math.PI) / 180);

  if (dLatM * dLatM + dLonM * dLonM > 25.0 || simTrail.length === 0) {
    simTrail.push({ lat: simState.currLat, lon: simState.currLon });
    if (simTrail.length > 24) simTrail.shift();
    simState.lastTrailLat = simState.currLat;
    simState.lastTrailLon = simState.currLon;
  }

  const dSparkLatM = (simState.currLat - simState.lastSparkLat) * 111132.9;
  const dSparkLonM = (simState.currLon - simState.lastSparkLon) * 111319.5 * Math.cos((baseLat * Math.PI) / 180);

  if (dSparkLatM * dSparkLatM + dSparkLonM * dSparkLonM >= 400.0) {
    simSparks.push({ lat: simState.currLat, lon: simState.currLon });
    if (simSparks.length > 10) simSparks.shift();
    simState.lastSparkLat = simState.currLat;
    simState.lastSparkLon = simState.currLon;
  }
}

function formatDistanceWeb(meters) {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(1) + ' km';
  }
  return Math.round(meters) + ' m';
}


function renderRoutePreviewWeb(dc, cx, cy, w, h) {
  if (!simRoute || simRoute.length < 2) return;

  const ringR = Math.min(cx, cy) - 10;

  dc.save();

  // 1. Outer Compass Ring & 12 o'clock Watch Heading Index Tick
  dc.strokeStyle = '#1e293b';
  dc.lineWidth = 1;
  dc.beginPath();
  dc.arc(cx, cy, ringR, 0, Math.PI * 2);
  dc.stroke();

  // Top 12 o'clock Reference Mark (Watch Heading Axis)
  dc.strokeStyle = '#ffffff';
  dc.lineWidth = 2;
  dc.beginPath();
  dc.moveTo(cx, cy - ringR - 3);
  dc.lineTo(cx, cy - ringR + 3);
  dc.stroke();

  // 2. Compute route thumbnail placement & scaling (Spacious central display without top header)
  const thumbCy = Math.round(h * 0.44);
  const maxThumbW = w * 0.56;
  const maxThumbH = h * 0.36;

  const centerLat = simState.centerLat || simRoute[0].lat;
  const centerLon = simState.centerLon || simRoute[0].lon;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  const dLonMetric = Math.max(1.0, (simState.maxLon - simState.minLon) * 111319.5 * cosLat);
  const dLatMetric = Math.max(1.0, (simState.maxLat - simState.minLat) * 111132.9);

  const scaleX = maxThumbW / dLonMetric;
  const scaleY = maxThumbH / dLatMetric;
  const thumbScale = Math.min(scaleX, scaleY);

  dc.strokeStyle = '#00e5ff';
  dc.lineWidth = 3;
  dc.lineCap = 'round';
  dc.lineJoin = 'round';
  dc.beginPath();

  const p0 = simRoute[0];
  const startSx = cx + (p0.lon - centerLon) * 111319.5 * cosLat * thumbScale;
  const startSy = thumbCy - (p0.lat - centerLat) * 111132.9 * thumbScale;
  dc.moveTo(startSx, startSy);

  for (let i = 1; i < simRoute.length; i++) {
    const pt = simRoute[i];
    const sx = cx + (pt.lon - centerLon) * 111319.5 * cosLat * thumbScale;
    const sy = thumbCy - (pt.lat - centerLat) * 111132.9 * thumbScale;
    dc.lineTo(sx, sy);
  }
  dc.stroke();

  const pEnd = simRoute[simRoute.length - 1];
  const endSx = cx + (pEnd.lon - centerLon) * 111319.5 * cosLat * thumbScale;
  const endSy = thumbCy - (pEnd.lat - centerLat) * 111132.9 * thumbScale;
  const isLoop = Math.hypot(startSx - endSx, startSy - endSy) < 6;

  // Route Start landmark anchor (Clean glowing beacon without overlapping text)
  dc.fillStyle = 'rgba(163, 230, 53, 0.4)';
  dc.beginPath();
  dc.arc(startSx, startSy, 8, 0, Math.PI * 2);
  dc.fill();

  dc.fillStyle = '#a3e635';
  dc.beginPath();
  dc.arc(startSx, startSy, 5, 0, Math.PI * 2);
  dc.fill();

  dc.fillStyle = '#ffffff';
  dc.beginPath();
  dc.arc(startSx, startSy, 2, 0, Math.PI * 2);
  dc.fill();

  if (!isLoop) {
    dc.fillStyle = '#00e5ff';
    dc.beginPath();
    dc.arc(endSx, endSy, 5, 0, Math.PI * 2);
    dc.fill();

    dc.fillStyle = '#ffffff';
    dc.beginPath();
    dc.arc(endSx, endSy, 2, 0, Math.PI * 2);
    dc.fill();
  }

  // 4. Adaptive Visual Scale Bar (|── 500 m ──|)
  const pixelsPerMeter = thumbScale;
  if (pixelsPerMeter > 0.00001) {
    const targetSteps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    let bestStep = 500;
    let bestDiff = Infinity;
    for (const step of targetSteps) {
      const barPixels = step * pixelsPerMeter;
      const diff = Math.abs(barPixels - 55);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestStep = step;
      }
    }

    const barW = Math.max(24, Math.min(120, Math.round(bestStep * pixelsPerMeter)));
    const barX = cx - barW / 2;
    const barY = Math.round(h * 0.7);

    const scaleLabel = bestStep >= 1000 ? `${bestStep / 1000} km` : `${bestStep} m`;
    dc.fillStyle = '#94a3b8';
    dc.font = 'bold 11px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.textBaseline = 'bottom';
    dc.fillText(scaleLabel, cx, barY - 6);
    dc.textBaseline = 'alphabetic';

    dc.strokeStyle = '#94a3b8';
    dc.lineWidth = 2;
    dc.beginPath();
    dc.moveTo(barX, barY);
    dc.lineTo(barX + barW, barY);
    dc.moveTo(barX, barY - 3);
    dc.lineTo(barX, barY + 3);
    dc.moveTo(barX + barW, barY - 3);
    dc.lineTo(barX + barW, barY + 3);
    dc.stroke();
  }

  // 4b. Total Route Distance inside Bioluminescent Pill Capsule
  const totalDistStr = formatDistanceWeb(simState.totalRouteDist);
  const totalY = Math.round(h * 0.80);
  dc.font = 'bold 15px -apple-system, sans-serif';
  const textW = dc.measureText(totalDistStr).width;
  const pillW = Math.round(textW + 24);
  const pillH = 26;
  const pillX = Math.round(cx - pillW / 2);
  const pillY = Math.round(totalY - pillH / 2);
  const pillR = Math.round(pillH / 2);

  dc.save();
  dc.beginPath();
  if (dc.roundRect) {
    dc.roundRect(pillX, pillY, pillW, pillH, pillR);
  } else {
    dc.arc(pillX + pillR, pillY + pillR, pillR, Math.PI / 2, (3 * Math.PI) / 2);
    dc.arc(pillX + pillW - pillR, pillY + pillR, pillR, -Math.PI / 2, Math.PI / 2);
    dc.closePath();
  }
  dc.fillStyle = 'rgba(0, 229, 255, 0.08)';
  dc.fill();
  dc.strokeStyle = '#00e5ff';
  dc.lineWidth = 1;
  dc.stroke();

  dc.fillStyle = '#00e5ff';
  dc.textAlign = 'center';
  dc.textBaseline = 'middle';
  dc.fillText(totalDistStr, cx, totalY);
  dc.restore();

  // 5. Outer Ring Indicators & Navigation Guidance
  if (simState.currLat && simState.currLon) {
    const userDx = (simState.currLon - centerLon) * 111319.5 * cosLat * thumbScale;
    const userDy = -(simState.currLat - centerLat) * 111132.9 * thumbScale;
    const userSx = cx + userDx;
    const userSy = thumbCy + userDy;

    const udxFromCenter = userSx - cx;
    const udyFromCenter = userSy - cy;
    const uDist = Math.hypot(udxFromCenter, udyFromCenter);

    const maxInnerR = ringR - 14;
    const isOutOfRange = uDist > maxInnerR;

    // =================================================================
    // User Location: Only turns into a directional navigation arrow when inside map bounds
    // Rotates dynamically based on movement track (if moving) or watch compass (if stationary)
    // =================================================================
    if (!isOutOfRange) {
      const uPlotX = userSx;
      const uPlotY = userSy;

      // Heading in screen space (Preview map is North-up)
      const uHeading = simState.renderHeadingRad || 0.0;
      const hSin = Math.sin(uHeading);
      const hCos = Math.cos(uHeading);
      const hdx = hSin;
      const hdy = -hCos;
      const hpx = -hdy;
      const hpy = hdx;

      const aTipX = uPlotX + hdx * 8;
      const aTipY = uPlotY + hdy * 8;
      const aW1X = uPlotX - hdx * 6 + hpx * 5;
      const aW1Y = uPlotY - hdy * 6 + hpy * 5;
      const aW2X = uPlotX - hdx * 6 - hpx * 5;
      const aW2Y = uPlotY - hdy * 6 - hpy * 5;
      const aNotchX = uPlotX - hdx * 2;
      const aNotchY = uPlotY - hdy * 2;

      // Bioluminescent Cyan navigation arrow with white outline
      dc.fillStyle = '#00e5ff';
      dc.beginPath();
      dc.moveTo(aTipX, aTipY);
      dc.lineTo(aW1X, aW1Y);
      dc.lineTo(aNotchX, aNotchY);
      dc.lineTo(aW2X, aW2Y);
      dc.closePath();
      dc.fill();

      dc.strokeStyle = '#ffffff';
      dc.lineWidth = 1;
      dc.beginPath();
      dc.moveTo(aTipX, aTipY);
      dc.lineTo(aW1X, aW1Y);
      dc.lineTo(aNotchX, aNotchY);
      dc.lineTo(aW2X, aW2Y);
      dc.closePath();
      dc.stroke();

      // Dotted guidance line from user position towards route start point
      const gdx = startSx - uPlotX;
      const gdy = startSy - uPlotY;
      const gDist = Math.hypot(gdx, gdy);
      if (gDist > 14) {
        dc.save();
        dc.strokeStyle = 'rgba(163, 230, 53, 0.45)';
        dc.lineWidth = 1.5;
        dc.setLineDash([4, 4]);
        dc.beginPath();
        dc.moveTo(uPlotX, uPlotY);
        dc.lineTo(startSx, startSy);
        dc.stroke();
        dc.restore();
      }
    }

    // =================================================================
    // Indicator: Target Direction to Start Point
    // Dynamically rotates with watch heading until pointing straight up (12 o'clock)
    // =================================================================
    const currentHeading = simState.renderHeadingRad || 0.0;
    let targetAngle = simState.bearingToStart - currentHeading;
    while (targetAngle > Math.PI) targetAngle -= 2 * Math.PI;
    while (targetAngle < -Math.PI) targetAngle += 2 * Math.PI;

    const tSin = Math.sin(targetAngle);
    const tCos = Math.cos(targetAngle);
    const trx = tSin;
    const tryVec = -tCos;
    const ttx = -tryVec;
    const tty = trx;

    // Ensure the arrow tip stays cleanly inside the outer compass ring and visible display area
    const arrowTipR = ringR - 4;
    const arrowLen = 13;
    const arrowWingSpan = 6;
    const arrowNotch = 4;

    const tTipX = cx + trx * arrowTipR;
    const tTipY = cy + tryVec * arrowTipR;
    const tw1X = cx + trx * (arrowTipR - arrowLen) + ttx * arrowWingSpan;
    const tw1Y = cy + tryVec * (arrowTipR - arrowLen) + tty * arrowWingSpan;
    const tw2X = cx + trx * (arrowTipR - arrowLen) - ttx * arrowWingSpan;
    const tw2Y = cy + tryVec * (arrowTipR - arrowLen) - tty * arrowWingSpan;
    const tNotchX = cx + trx * (arrowTipR - arrowLen + arrowNotch);
    const tNotchY = cy + tryVec * (arrowTipR - arrowLen + arrowNotch);

    dc.fillStyle = '#a3e635';
    dc.beginPath();
    dc.moveTo(tTipX, tTipY);
    dc.lineTo(tw1X, tw1Y);
    dc.lineTo(tNotchX, tNotchY);
    dc.lineTo(tw2X, tw2Y);
    dc.closePath();
    dc.fill();

    dc.strokeStyle = '#ffffff';
    dc.lineWidth = 1;
    dc.beginPath();
    dc.moveTo(tTipX, tTipY);
    dc.lineTo(tw1X, tw1Y);
    dc.lineTo(tNotchX, tNotchY);
    dc.lineTo(tw2X, tw2Y);
    dc.closePath();
    dc.stroke();

    // Label for target direction arrow: "START" with distance to start directly beneath it
    const startDistStr = formatDistanceWeb(simState.distToStart);
    const fontH1 = 11;
    const fontH2 = 15;
    const lineGap = 2;
    const halfH = (fontH1 + fontH2 + lineGap) / 2;

    dc.font = 'bold 11px -apple-system, sans-serif';
    const textW1 = dc.measureText('START').width;
    dc.font = 'bold 15px -apple-system, sans-serif';
    const textW2 = dc.measureText(startDistStr).width;
    const maxTextW = Math.max(textW1, textW2);
    const halfW = maxTextW / 2;

    const absTdx = Math.abs(trx);
    const absTdy = Math.abs(tryVec);
    const textRadialSpan = absTdx * halfW + absTdy * halfH;

    // Gap between arrow inner boundary (wings) and text box outer boundary
    const gap = 8;
    const arrowInnerR = arrowTipR - arrowLen;
    const lblR = arrowInnerR - gap - textRadialSpan;

    const lblBaseX = cx + trx * lblR;
    const lblBaseY = cy + tryVec * lblR;

    const line1Y = lblBaseY - halfH + (fontH1 / 2);
    const line2Y = lblBaseY + halfH - (fontH2 / 2);

    dc.textAlign = 'center';
    dc.textBaseline = 'middle';

    // Line 1: START (lime green)
    dc.fillStyle = '#a3e635';
    dc.font = 'bold 11px -apple-system, sans-serif';
    dc.fillText('START', lblBaseX, line1Y);

    // Line 2: Distance directly underneath START (white, prominent larger font)
    dc.fillStyle = '#ffffff';
    dc.font = 'bold 15px -apple-system, sans-serif';
    dc.fillText(startDistStr, lblBaseX, line2Y);
  } else {
    // Waiting for GPS message
    dc.fillStyle = '#eab308';
    dc.font = 'bold 12px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.textBaseline = 'middle';
    dc.fillText('WAITING FOR GPS...', cx, Math.round(h * 0.85));
  }

  dc.restore();
}

function renderNoRouteCapsuleWeb(dc, cx, h) {
  dc.save();
  const topY = Math.round(h * 0.14);
  const isInvalid = simState.routeStatus === 'INVALID';
  const textStr = isInvalid ? 'INVALID ROUTE' : 'NO ROUTE';
  dc.font = 'bold 12px -apple-system, sans-serif';
  const textW = dc.measureText(textStr).width;
  const pillW = textW + 20;
  const pillH = 22;
  const pillX = cx - pillW / 2;
  const pillY = topY - pillH / 2;
  const pillR = pillH / 2;

  // Background
  dc.fillStyle = isInvalid ? 'rgba(69, 10, 10, 0.92)' : '#041c24';
  roundRect(dc, pillX, pillY, pillW, pillH, pillR);
  dc.fill();

  // Border
  dc.strokeStyle = isInvalid ? '#ef4444' : '#00e5ff';
  dc.lineWidth = 1;
  roundRect(dc, pillX, pillY, pillW, pillH, pillR);
  dc.stroke();

  // Text
  dc.fillStyle = isInvalid ? '#fca5a5' : '#00e5ff';
  dc.textAlign = 'center';
  dc.textBaseline = 'middle';
  dc.fillText(textStr, cx, topY);
  dc.restore();
}

function findNearestRouteSegmentWeb(currLat, currLon, cosLat, headingRad) {
  const N = simRoute.length;
  let minDist = Infinity;
  let minScore = Infinity;

  const hx = Math.sin(headingRad);
  const hy = Math.cos(headingRad);
  const startSearch = Math.max(0, simState.segIdx - 2);
  const endSearch = Math.min(N - 2, simState.segIdx + 4);

  for (let pass = 0; pass < 2; pass++) {
    const loopStart = pass === 0 ? startSearch : 0;
    const loopEnd = pass === 0 ? endSearch : N - 2;

    for (let i = loopStart; i <= loopEnd; i++) {
      if (pass === 1 && i >= startSearch && i <= endSearch) continue;
      const pA = simRoute[i];
      const pB = simRoute[i + 1];

      const ax = (pA.lon - currLon) * 111319.5 * cosLat;
      const ay = (pA.lat - currLat) * 111132.9;
      const bx = (pB.lon - currLon) * 111319.5 * cosLat;
      const by = (pB.lat - currLat) * 111132.9;

      const vx = bx - ax;
      const vy = by - ay;
      const segLenSq = vx * vx + vy * vy;

      let d = 0;
      if (segLenSq < 0.001) {
        d = Math.hypot(ax, ay);
      } else {
        const t = Math.max(0, Math.min(1, (-ax * vx - ay * vy) / segLenSq));
        d = Math.hypot(ax + t * vx, ay + t * vy);
      }

      // Continuity hysteresis + Heading-weighted penalty for opposite direction (> 90 deg)
      let score = i === simState.segIdx || i === simState.segIdx + 1 ? d * 0.8 : d;
      if (segLenSq >= 0.01) {
        const segLen = Math.sqrt(segLenSq);
        const cosTheta = (hx * vx + hy * vy) / segLen;
        if (cosTheta < 0) {
          score += 30.0 * -cosTheta;
        }
      }

      if (score < minScore) {
        minScore = score;
        minDist = d;
      }
    }

    if (minDist <= 45.0) break;
  }

  return minDist;
}

function drawWatchScreen() {
  if (!watchCtx) return;
  const dc = watchCtx;
  const w = 416;
  const h = simState.fieldHeight || 416;
  const cx = 208;
  const cy = Math.round(h / 2);

  dc.fillStyle = '#000000';
  dc.fillRect(0, 0, 416, 416);

  dc.save();
  dc.beginPath();
  dc.rect(0, 0, w, h);
  dc.clip();

  try {
    drawWatchScreenContent(dc, w, h, cx, cy);
  } finally {
    dc.restore();
  }

  if (h < 416) {
    dc.save();
    dc.fillStyle = '#090d16';
    dc.fillRect(0, h, w, 416 - h);
    dc.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    dc.lineWidth = 2;
    dc.beginPath();
    dc.moveTo(0, h);
    dc.lineTo(w, h);
    dc.stroke();

    dc.fillStyle = 'rgba(148, 163, 184, 0.5)';
    dc.font = '600 13px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.textBaseline = 'middle';
    dc.fillText(`OTHER DATA FIELD (${w}×${416 - h})`, cx, h + (416 - h) * 0.35);
    dc.restore();
  }
}

function drawWatchScreenContent(dc, w, h, cx, cy) {
  const mapRange = simState.mapRange || 175;
  const ZOOM_SCALE = cx / mapRange;
  const OFF_COURSE_THRESHOLD_M = 35.0;
  const OFF_COURSE_CLEAR_THRESHOLD_M = 25.0;
  const GPS_QUALITY_USABLE = 3;
  const CULL_DIST_SQ = Math.pow(mapRange * 1.3, 2);

  dc.fillStyle = '#000000';
  dc.fillRect(0, 0, w, h);

  if (simRoute.length < 2) {
    // Free exploration mode without preloaded route:
    // Still render firefly trail, sparks, runner cursor, and "NO ROUTE" capsule badge!
    const heading = simState.renderHeadingRad || 0.0;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const currLat = simState.currLat;
    const currLon = simState.currLon;
    const cosLat = Math.cos((currLat * Math.PI) / 180);

    // Trail
    const M = simTrail.length;
    if (M > 1) {
      dc.save();
      dc.beginPath();
      let started = false;
      for (let t = 0; t < M; t++) {
        const p = simTrail[t];
        const tax = (p.lon - currLon) * 111319.5 * cosLat;
        const tay = (p.lat - currLat) * 111132.9;
        const tsx = cx + (tax * cosH - tay * sinH) * ZOOM_SCALE;
        const tsy = cy - (tay * cosH + tax * sinH) * ZOOM_SCALE;
        if (!started) {
          dc.moveTo(tsx, tsy);
          started = true;
        } else {
          dc.lineTo(tsx, tsy);
        }
      }
      dc.lineTo(cx, cy + 4);
      dc.strokeStyle = '#a3e635';
      dc.lineWidth = 3;
      dc.lineCap = 'round';
      dc.lineJoin = 'round';
      dc.stroke();
      dc.restore();

      const S = simSparks.length;
      if (S > 0) {
        for (let s = 0; s < S; s++) {
          const sp = simSparks[s];
          const ratio = (s + 1) / S;
          const sax = (sp.lon - currLon) * 111319.5 * cosLat;
          const say = (sp.lat - currLat) * 111132.9;
          if (sax * sax + say * say > CULL_DIST_SQ) continue;
          const ssx = cx + (sax * cosH - say * sinH) * ZOOM_SCALE;
          const ssy = cy - (say * cosH + sax * sinH) * ZOOM_SCALE;
          const alpha = 0.15 + 0.8 * ratio;
          const radius = 2.0 + 1.8 * ratio;
          dc.fillStyle = `rgba(163, 230, 53, ${(alpha * 0.45).toFixed(2)})`;
          dc.beginPath();
          dc.arc(ssx, ssy, radius + 2.2, 0, Math.PI * 2);
          dc.fill();
          dc.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
          dc.beginPath();
          dc.arc(ssx, ssy, radius * 0.65, 0, Math.PI * 2);
          dc.fill();
        }
      }
    }

    // Runner Dart
    dc.save();
    dc.lineJoin = 'round';
    dc.lineCap = 'round';
    dc.fillStyle = '#a3e635';
    dc.beginPath();
    dc.moveTo(cx, cy - 13);
    dc.lineTo(cx + 8.5, cy + 9);
    dc.lineTo(cx, cy + 4);
    dc.lineTo(cx - 8.5, cy + 9);
    dc.closePath();
    dc.fill();

    dc.strokeStyle = '#ffffff';
    dc.lineWidth = 2;
    dc.stroke();

    dc.fillStyle = '#ffffff';
    dc.beginPath();
    dc.arc(cx, cy - 1, 2.5, 0, Math.PI * 2);
    dc.fill();
    dc.restore();

    // "NO ROUTE" capsule badge at top
    renderNoRouteCapsuleWeb(dc, cx, h);

    if (readoutHeading) {
      const deg = Math.round(((heading * 180) / Math.PI + 360) % 360);
      readoutHeading.innerText = `${deg}°`;
    }
    if (readoutCtd) {
      const d = simState.freeWalkDistance || 0;
      readoutCtd.innerText = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    }
    if (readoutStatus) readoutStatus.innerHTML = `<span style="color: var(--accent-cyan)">No Route</span>`;
    return;
  }

  const currLat = simState.currLat;
  const currLon = simState.currLon;
  const cosLat = Math.cos((currLat * Math.PI) / 180);
  const heading = simState.renderHeadingRad;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);

  const minDist = findNearestRouteSegmentWeb(currLat, currLon, cosLat, simState.targetHeadingRad || heading);

  const pStart = simRoute[0];
  const sax = (pStart.lon - currLon) * 111319.5 * cosLat;
  const say = (pStart.lat - currLat) * 111132.9;
  const distToStart = Math.hypot(sax, say);
  simState.distToStart = distToStart;
  simState.bearingToStart = Math.atan2(sax, say);

  const isFarAway = !simState.isGuideToStart && minDist > 250.0;
  if (simState.previewMode || isFarAway) {
    simState.isOffCourse = false;
    simState.offCourseCount = 0;
    renderRoutePreviewWeb(dc, cx, cy, w, h);
    if (readoutHeading) readoutHeading.innerText = `${Math.round(((heading * 180) / Math.PI + 360) % 360)}°`;
    if (readoutCtd) readoutCtd.innerText = distToStart >= 1000 ? `${(distToStart / 1000).toFixed(1)} km` : `${Math.round(distToStart)} m`;
    if (readoutStatus) readoutStatus.innerHTML = `<span style="color: var(--accent-cyan);">Map Preview</span>`;
    return;
  }

  // Off-course debouncing (3 consecutive samples > 35m) & hysteresis (clear <= 25m) with GPS quality filter
  const currentGpsQuality = simState.gpsQuality !== undefined ? simState.gpsQuality : 3;
  if (currentGpsQuality >= GPS_QUALITY_USABLE && !simState.isGuideToStart) {
    if (simState.isOffCourse) {
      if (minDist <= OFF_COURSE_CLEAR_THRESHOLD_M) {
        simState.isOffCourse = false;
        simState.offCourseCount = 0;
      }
    } else {
      if (minDist > OFF_COURSE_THRESHOLD_M) {
        simState.offCourseCount = (simState.offCourseCount || 0) + 1;
        if (simState.offCourseCount >= 3) {
          simState.isOffCourse = true;
          triggerHaptic('vibe', `Off-Course Alert (+${Math.round(minDist)}m)`);
        }
      } else {
        simState.offCourseCount = 0;
      }
    }
  }

  const isOffCourse = simState.isOffCourse;
  simState.wasOffCourse = isOffCourse;

  const isDim = simState.dimCompletedPath && !simState.isGuideToStart;
  const currentSeg = simState.segIdx;

  dc.lineCap = 'round';
  dc.lineJoin = 'round';

  for (let i = 0; i < simRoute.length - 1; i++) {
    const pA = simRoute[i];
    const pB = simRoute[i + 1];

    const ax = (pA.lon - currLon) * 111319.5 * cosLat;
    const ay = (pA.lat - currLat) * 111132.9;
    const bx = (pB.lon - currLon) * 111319.5 * cosLat;
    const by = (pB.lat - currLat) * 111132.9;

    if (ax * ax + ay * ay > CULL_DIST_SQ && bx * bx + by * by > CULL_DIST_SQ) continue;

    const sx1 = cx + (ax * cosH - ay * sinH) * ZOOM_SCALE;
    const sy1 = cy - (ay * cosH + ax * sinH) * ZOOM_SCALE;
    const sx2 = cx + (bx * cosH - by * sinH) * ZOOM_SCALE;
    const sy2 = cy - (by * cosH + bx * sinH) * ZOOM_SCALE;

    const isVisited = visitedSegments && visitedSegments[i];
    const isCurrent = i === currentSeg;

    dc.save();
    if (isDim && isVisited && !isCurrent) {
      dc.strokeStyle = 'rgba(0, 229, 255, 0.28)';
      dc.lineWidth = 3;
      dc.beginPath();
      dc.moveTo(sx1, sy1);
      dc.lineTo(sx2, sy2);
      dc.stroke();
    } else if (isDim && isCurrent) {
      const t = simState.segProgress;
      const midX = sx1 + (sx2 - sx1) * t;
      const midY = sy1 + (sy2 - sy1) * t;

      dc.strokeStyle = 'rgba(0, 229, 255, 0.28)';
      dc.lineWidth = 3;
      dc.beginPath();
      dc.moveTo(sx1, sy1);
      dc.lineTo(midX, midY);
      dc.stroke();

      dc.strokeStyle = '#00e5ff';
      dc.lineWidth = 4;
      dc.beginPath();
      dc.moveTo(midX, midY);
      dc.lineTo(sx2, sy2);
      dc.stroke();
    } else {
      dc.strokeStyle = '#00e5ff';
      dc.lineWidth = 4;
      dc.beginPath();
      dc.moveTo(sx1, sy1);
      dc.lineTo(sx2, sy2);
      dc.stroke();
    }
    dc.restore();
  }

  if (simState.showDirection) {
    const curSegIdx = simState.segIdx;
    const pA = simRoute[curSegIdx];
    const pB = simRoute[curSegIdx + 1];
    const curSegLen = pA && pB ? calcDistanceMeters(pA, pB) : 0;
    const runnerDist = (simState.cumDistances && simState.cumDistances[curSegIdx] ? simState.cumDistances[curSegIdx] : 0) + simState.segProgress * curSegLen;

    for (let k = 0; k < simChevrons.length; k++) {
      const ch = simChevrons[k];
      const ax = (ch.lon - currLon) * 111319.5 * cosLat;
      const ay = (ch.lat - currLat) * 111132.9;

      if (ax * ax + ay * ay > CULL_DIST_SQ) continue;

      const sx = cx + (ax * cosH - ay * sinH) * ZOOM_SCALE;
      const sy = cy - (ay * cosH + ax * sinH) * ZOOM_SCALE;

      if (sx < -25 || sx > w + 25 || sy < -25 || sy > h + 25) continue;

      const sux = ch.ux * cosH - ch.uy * sinH;
      const suy = -(ch.uy * cosH + ch.ux * sinH);
      const snx = -suy;
      const sny = sux;

      const isChevronPassed = ch.dist <= runnerDist;
      const isDimmed = simState.dimCompletedPath && isChevronPassed;
      const chColor = isDimmed ? 'rgba(0, 229, 255, 0.28)' : '#00e5ff';
      const chPenMajor = isDimmed ? 2 : 4;
      const chPenMinor = isDimmed ? 1 : 2;

      dc.save();
      dc.strokeStyle = chColor;
      dc.lineCap = 'round';
      dc.lineJoin = 'round';

      if (ch.isMajor) {
        dc.lineWidth = chPenMajor;
        const tipX = sx + sux * 9.0;
        const tipY = sy + suy * 9.0;
        const leftX = sx - sux * 6.0 + snx * 10.0;
        const leftY = sy - suy * 6.0 + sny * 10.0;
        const rightX = sx - sux * 6.0 - snx * 10.0;
        const rightY = sy - suy * 6.0 - sny * 10.0;

        dc.beginPath();
        dc.moveTo(leftX, leftY);
        dc.lineTo(tipX, tipY);
        dc.lineTo(rightX, rightY);
        dc.stroke();
      } else {
        dc.lineWidth = chPenMinor;
        const tipX = sx + sux * 5.0;
        const tipY = sy + suy * 5.0;
        const leftX = sx - sux * 3.0 + snx * 5.0;
        const leftY = sy - suy * 3.0 + sny * 5.0;
        const rightX = sx - sux * 3.0 - snx * 5.0;
        const rightY = sy - suy * 3.0 - sny * 5.0;

        dc.beginPath();
        dc.moveTo(leftX, leftY);
        dc.lineTo(tipX, tipY);
        dc.lineTo(rightX, rightY);
        dc.stroke();
      }
      dc.restore();
    }
  }

  if (simState.showCornerAnchors && cornerAnchors.length > 0) {
    for (let c = 0; c < cornerAnchors.length; c++) {
      const anchor = cornerAnchors[c];
      const ax = (anchor.lon - currLon) * 111319.5 * cosLat;
      const ay = (anchor.lat - currLat) * 111132.9;

      if (ax * ax + ay * ay > CULL_DIST_SQ) continue;

      const sx = cx + (ax * cosH - ay * sinH) * ZOOM_SCALE;
      const sy = cy - (ay * cosH + ax * sinH) * ZOOM_SCALE;

      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      const isPassed = simState.dimCompletedPath && visitedSegments[anchor.idx];

      dc.save();
      if (isPassed) {
        dc.fillStyle = 'rgba(0, 229, 255, 0.35)';
        dc.beginPath();
        dc.arc(sx, sy, 3, 0, Math.PI * 2);
        dc.fill();
      } else {
        dc.fillStyle = 'rgba(0, 229, 255, 0.3)';
        dc.beginPath();
        dc.arc(sx, sy, 7, 0, Math.PI * 2);
        dc.fill();

        dc.fillStyle = '#00e5ff';
        dc.beginPath();
        dc.arc(sx, sy, 4, 0, Math.PI * 2);
        dc.fill();

        dc.fillStyle = '#ffffff';
        dc.beginPath();
        dc.arc(sx, sy, 2, 0, Math.PI * 2);
        dc.fill();
      }
      dc.restore();
    }
  }

  const M = simTrail.length;
  if (M > 1) {
    dc.save();
    dc.beginPath();
    let started = false;
    for (let t = 0; t < M; t++) {
      const p = simTrail[t];
      const tax = (p.lon - currLon) * 111319.5 * cosLat;
      const tay = (p.lat - currLat) * 111132.9;
      const tsx = cx + (tax * cosH - tay * sinH) * ZOOM_SCALE;
      const tsy = cy - (tay * cosH + tax * sinH) * ZOOM_SCALE;
      if (!started) {
        dc.moveTo(tsx, tsy);
        started = true;
      } else {
        dc.lineTo(tsx, tsy);
      }
    }
    dc.lineTo(cx, cy + 4);
    dc.strokeStyle = '#a3e635';
    dc.lineWidth = 3;
    dc.lineCap = 'round';
    dc.lineJoin = 'round';
    dc.stroke();
    dc.restore();

    const S = simSparks.length;
    if (S > 0) {
      for (let s = 0; s < S; s++) {
        const sp = simSparks[s];
        const ratio = (s + 1) / S;

        const sax = (sp.lon - currLon) * 111319.5 * cosLat;
        const say = (sp.lat - currLat) * 111132.9;

        if (sax * sax + say * say > CULL_DIST_SQ) continue;

        const ssx = cx + (sax * cosH - say * sinH) * ZOOM_SCALE;
        const ssy = cy - (say * cosH + sax * sinH) * ZOOM_SCALE;

        const alpha = 0.15 + 0.8 * ratio;
        const radius = 2.0 + 1.8 * ratio;

        dc.fillStyle = `rgba(163, 230, 53, ${(alpha * 0.45).toFixed(2)})`;
        dc.beginPath();
        dc.arc(ssx, ssy, radius + 2.2, 0, Math.PI * 2);
        dc.fill();

        dc.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
        dc.beginPath();
        dc.arc(ssx, ssy, radius * 0.65, 0, Math.PI * 2);
        dc.fill();
      }
    }
  }

  dc.save();
  dc.lineJoin = 'round';
  dc.lineCap = 'round';

  dc.fillStyle = '#a3e635';
  dc.beginPath();
  dc.moveTo(cx, cy - 13);
  dc.lineTo(cx + 8.5, cy + 9);
  dc.lineTo(cx, cy + 4);
  dc.lineTo(cx - 8.5, cy + 9);
  dc.closePath();
  dc.fill();

  dc.strokeStyle = '#ffffff';
  dc.lineWidth = 2;
  dc.stroke();

  dc.fillStyle = '#ffffff';
  dc.beginPath();
  dc.arc(cx, cy - 1, 2.5, 0, Math.PI * 2);
  dc.fill();
  dc.restore();

  if (simState.showTurnCue && !isOffCourse && !simState.isGuideToStart && !simState.hasFinished) {
    const turn = getNextTurnCue();
    if (turn && turn.dist <= 60) {
      dc.save();
      const badgeW = 144;
      const badgeH = 38;
      const badgeX = cx - badgeW / 2;
      const badgeY = 26;

      const isImminent = turn.dist <= 20;
      if (isImminent && simState.lastVibedCornerIdx !== turn.cornerIdx) {
        simState.lastVibedCornerIdx = turn.cornerIdx;
        triggerHaptic('vibe', `Imminent Turn (${turn.label})`);
      }
      dc.fillStyle = isImminent ? 'rgba(217, 119, 6, 0.95)' : 'rgba(15, 23, 42, 0.92)';
      roundRect(dc, badgeX, badgeY, badgeW, badgeH, 8);
      dc.fill();

      dc.strokeStyle = isImminent ? '#fbbf24' : '#00e5ff';
      dc.lineWidth = 2.5;
      roundRect(dc, badgeX, badgeY, badgeW, badgeH, 8);
      dc.stroke();

      dc.fillStyle = '#ffffff';
      dc.font = 'bold 16px -apple-system, sans-serif';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText(turn.label, cx, badgeY + badgeH / 2);
      dc.restore();
    }
  }

  if (isOffCourse) {
    const bannerW = 230;
    const bannerH = 36;
    const bannerX = cx - bannerW / 2;
    const bannerY = 26;

    dc.fillStyle = '#dc2626';
    roundRect(dc, bannerX, bannerY, bannerW, bannerH, 6);
    dc.fill();

    dc.fillStyle = '#ffffff';
    dc.font = 'bold 15px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.fillText(`OFF COURSE (+${Math.round(minDist)}m)`, cx, bannerY + 23);
  }

  if (simState.hasFinished) {
    dc.save();
    const badgeW = 180;
    const badgeH = 28;
    const badgeX = cx - badgeW / 2; // Fixed: cx - badgeW / 2 (was bannerW)
    const badgeY = 26;

    dc.fillStyle = 'rgba(15, 23, 42, 0.88)';
    roundRect(dc, badgeX, badgeY, badgeW, badgeH, 8);
    dc.fill();

    dc.strokeStyle = '#84cc16';
    dc.lineWidth = 1.5;
    roundRect(dc, badgeX, badgeY, badgeW, badgeH, 8);
    dc.stroke();

    dc.fillStyle = '#a3e635';
    dc.font = 'bold 13px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.fillText('GPS ART COMPLETED', cx, badgeY + 19);
    dc.restore();
  }

  // Truncation warning pill at top when no higher-priority alert banner is active
  if (simState.routeStatus === 'TRUNCATED' && !isOffCourse && !simState.hasFinished && !(simState.showTurnCue && getNextTurnCue()?.dist <= 60)) {
    dc.save();
    const warnStr = `TRUNCATED 150/${simState.truncatedTotalPts}`;
    dc.font = 'bold 11px -apple-system, sans-serif';
    const wW = dc.measureText(warnStr).width + 20;
    const wH = 22;
    const wX = cx - wW / 2;
    const wY = 26;
    dc.fillStyle = 'rgba(120, 53, 15, 0.92)';
    roundRect(dc, wX, wY, wW, wH, wH / 2);
    dc.fill();
    dc.strokeStyle = '#fbbf24';
    dc.lineWidth = 1;
    roundRect(dc, wX, wY, wW, wH, wH / 2);
    dc.stroke();
    dc.fillStyle = '#fde68a';
    dc.textAlign = 'center';
    dc.textBaseline = 'middle';
    dc.fillText(warnStr, cx, wY + wH / 2);
    dc.restore();
  }

  // Bottom HUD pill: Remaining Distance & Completion %
  if (simState.showProgress && simState.totalRouteDist > 0 && simState.cumDistances && simState.cumDistances.length >= 2) {
    const segStartD = simState.cumDistances[simState.segIdx] || 0;
    const segEndD = simState.cumDistances[simState.segIdx + 1] ?? segStartD;
    const coveredM = simState.hasFinished
      ? simState.totalRouteDist
      : segStartD + (segEndD - segStartD) * simState.segProgress;
    const remM = Math.max(0, simState.totalRouteDist - coveredM);
    const pct = simState.hasFinished ? 100 : Math.min(100, Math.round((coveredM / simState.totalRouteDist) * 100));
    const hudText = simState.hasFinished ? '0 m · 100%' : `${formatDistanceWeb(remM)} · ${pct}%`;

    dc.save();
    dc.font = 'bold 13px -apple-system, sans-serif';
    const pillW = dc.measureText(hudText).width + 24;
    const pillH = 24;
    const pillX = cx - pillW / 2;
    const pillY = (h < 240 ? h - 20 : h * 0.87) - pillH / 2;
    dc.fillStyle = 'rgba(15, 23, 42, 0.88)';
    roundRect(dc, pillX, pillY, pillW, pillH, pillH / 2);
    dc.fill();
    dc.strokeStyle = simState.hasFinished ? '#84cc16' : 'rgba(56, 189, 248, 0.55)';
    dc.lineWidth = 1;
    roundRect(dc, pillX, pillY, pillW, pillH, pillH / 2);
    dc.stroke();
    dc.fillStyle = simState.hasFinished ? '#a3e635' : '#e2e8f0';
    dc.textAlign = 'center';
    dc.textBaseline = 'middle';
    dc.fillText(hudText, cx, pillY + pillH / 2);
    dc.restore();
  }

  if (readoutHeading) {
    readoutHeading.innerText = `${Math.round(((heading * 180) / Math.PI + 360) % 360)}°`;
  }
  if (readoutCtd) {
    readoutCtd.innerText = `${minDist.toFixed(1)} m`;
  }

  if (readoutStatus) {
    if (isOffCourse) {
      readoutStatus.innerHTML = `<span style="color: var(--accent-red)">Off Course (+${Math.round(minDist)}m)</span>`;
    } else if (simState.hasFinished) {
      readoutStatus.innerHTML = `<span style="color: var(--accent-green)">Completed</span>`;
    } else {
      readoutStatus.innerHTML = `<span style="color: var(--accent-green)">On Course</span>`;
    }
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Expose globals for app controller
window.WatchSimulator = {
  simState,
  initWatchSimulation,
  resetSimulationState,
  togglePlayPause,
  drawWatchScreen,
  triggerHaptic,
};
window.initWatchSimulation = initWatchSimulation;
window.resetSimulationState = resetSimulationState;
window.togglePlayPause = togglePlayPause;
window.drawWatchScreen = drawWatchScreen;
window.simState = simState;
