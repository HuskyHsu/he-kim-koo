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
  simulateHaptic: true,
  wasOffCourse: false,
  lastHapticTime: 0,
  totalRouteDist: 0,
  boxWidthM: 0,
  boxHeightM: 0,
  centerLat: 0,
  centerLon: 0,
  previewMode: false,
  distToStart: 0,
  bearingToStart: 0,
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
  if (!simRoute || simRoute.length < 2) return;
  let minLat = simRoute[0].lat,
    maxLat = simRoute[0].lat;
  let minLon = simRoute[0].lon,
    maxLon = simRoute[0].lon;

  for (let i = 0; i < simRoute.length - 1; i++) {
    simState.totalRouteDist += calcDistanceMeters(simRoute[i], simRoute[i + 1]);
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
  simRoute = points.slice();
  if (isReversed) {
    simRoute.reverse();
  }
  calcRouteDistances();
  precomputeChevrons();
  precomputeCornerAnchors();
  resetSimulationState(0);
  drawWatchScreen();
}

function resetSimulationState(startSegIdx = 0) {
  if (!simRoute || simRoute.length < 2) return;
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
  const vLon =
    (simRoute[nextIdx].lon - simRoute[validStart].lon) *
    Math.cos((simRoute[validStart].lat * Math.PI) / 180);
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
}

function togglePlayPause() {
  if (!simRoute || simRoute.length < 2) return;
  const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');

  if (simState.isPlaying) {
    simState.isPlaying = false;
    if (btnSimPlay) btnSimPlay.innerText = 'Resume Simulation';
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Resume';
    if (simState.animFrame) cancelAnimationFrame(simState.animFrame);
  } else {
    if (simState.segIdx >= simRoute.length - 1 || simState.hasFinished) {
      resetSimulationState();
    }
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
    simState.targetHeadingRad = (deg * Math.PI) / 180;
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

if (btnSimDirection) {
  btnSimDirection.addEventListener('click', () => {
    isReversed = !isReversed;
    btnSimDirection.innerText = isReversed ? 'Reverse (Inverted)' : 'Forward (Original)';
    if (simRoute && simRoute.length >= 2) {
      simRoute.reverse();
      precomputeChevrons();
      precomputeCornerAnchors();
      resetSimulationState(0);
      drawWatchScreen();
    }
  });
}

if (btnToggleDirection) {
  btnToggleDirection.addEventListener('click', () => {
    simState.showDirection = !simState.showDirection;
    btnToggleDirection.classList.toggle('btn-active', simState.showDirection);
    btnToggleDirection.innerText = simState.showDirection ? 'ON (50m/250m)' : 'OFF';
    drawWatchScreen();
  });
}

if (btnToggleDim) {
  btnToggleDim.addEventListener('click', () => {
    simState.dimCompletedPath = !simState.dimCompletedPath;
    btnToggleDim.classList.toggle('btn-active', simState.dimCompletedPath);
    btnToggleDim.innerText = simState.dimCompletedPath ? 'ON (Dimmed)' : 'OFF (Bright)';
    drawWatchScreen();
  });
}

if (btnToggleTurnCue) {
  btnToggleTurnCue.addEventListener('click', () => {
    simState.showTurnCue = !simState.showTurnCue;
    btnToggleTurnCue.classList.toggle('btn-active', simState.showTurnCue);
    btnToggleTurnCue.innerText = simState.showTurnCue ? 'ON' : 'OFF';
    drawWatchScreen();
  });
}

if (btnToggleAnchors) {
  btnToggleAnchors.addEventListener('click', () => {
    simState.showCornerAnchors = !simState.showCornerAnchors;
    btnToggleAnchors.classList.toggle('btn-active', simState.showCornerAnchors);
    btnToggleAnchors.innerText = simState.showCornerAnchors ? 'ON' : 'OFF';
    drawWatchScreen();
  });
}

if (btnTestStart) {
  btnTestStart.addEventListener('click', () => {
    if (!simRoute || simRoute.length < 2) return;
    resetSimulationState(0);
    if (!simState.isPlaying) togglePlayPause();
    drawWatchScreen();
  });
}

if (btnTestMidStart) {
  btnTestMidStart.addEventListener('click', () => {
    if (!simRoute || simRoute.length < 5) return;
    const targetSeg = Math.min(4, simRoute.length - 2);
    resetSimulationState(targetSeg);
    if (!simState.isPlaying) togglePlayPause();
    drawWatchScreen();
  });
}

if (btnTestFarAway) {
  btnTestFarAway.addEventListener('click', () => {
    if (!simRoute || simRoute.length < 2) return;
    const mBtnPlayToggle = document.getElementById('mBtnPlayToggle');
    simState.isPlaying = false;
    if (simState.animFrame) cancelAnimationFrame(simState.animFrame);
    if (btnSimPlay) btnSimPlay.innerText = 'Start Run Simulation';
    if (mBtnPlayToggle) mBtnPlayToggle.innerText = 'Start';

    const pStart = simRoute[0];
    const cosLat0 = Math.cos((pStart.lat * Math.PI) / 180);
    simState.currLat = pStart.lat - 10000 / 111132.9;
    simState.currLon = pStart.lon - 7500 / (111319.5 * cosLat0);
    simState.previewMode = true;
    drawWatchScreen();
  });
}

function simAnimationLoop(now) {
  if (!simState.isPlaying) return;
  const dt = Math.min((now - (simState.lastTick || now)) / 1000, 0.1);
  simState.lastTick = now;

  const speedMultiplier = simSpeedSelect ? parseFloat(simSpeedSelect.value) : 2.0;
  const runSpeedMetersPerSec = 3.2 * speedMultiplier;

  advanceRunner(runSpeedMetersPerSec * dt);

  let diff = simState.targetHeadingRad - simState.renderHeadingRad;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  simState.renderHeadingRad += diff * 0.18;

  drawWatchScreen();
  simState.animFrame = requestAnimationFrame(simAnimationLoop);
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
    const dLon =
      (simState.deviateMeters * Math.sin(rightAngle)) /
      (111319.5 * Math.cos((baseLat * Math.PI) / 180));
    simState.currLat = baseLat + dLat;
    simState.currLon = baseLon + dLon;
  } else {
    simState.currLat = baseLat;
    simState.currLon = baseLon;
  }

  recordTrailAndSparks();
}

function recordTrailAndSparks() {
  const baseLat = simState.currLat;
  const dLatM = (simState.currLat - simState.lastTrailLat) * 111132.9;
  const dLonM =
    (simState.currLon - simState.lastTrailLon) *
    111319.5 *
    Math.cos((baseLat * Math.PI) / 180);

  if (dLatM * dLatM + dLonM * dLonM > 6.25 || simTrail.length === 0) {
    simTrail.push({ lat: simState.currLat, lon: simState.currLon });
    if (simTrail.length > 80) simTrail.shift();
    simState.lastTrailLat = simState.currLat;
    simState.lastTrailLon = simState.currLon;
  }

  const dSparkLatM = (simState.currLat - simState.lastSparkLat) * 111132.9;
  const dSparkLonM =
    (simState.currLon - simState.lastSparkLon) *
    111319.5 *
    Math.cos((baseLat * Math.PI) / 180);

  if (dSparkLatM * dSparkLatM + dSparkLonM * dSparkLonM >= 400.0) {
    simSparks.push({ lat: simState.currLat, lon: simState.currLon });
    if (simSparks.length > 10) simSparks.shift();
    simState.lastSparkLat = simState.currLat;
    simState.lastSparkLon = simState.currLon;
  }
}

function renderRoutePreviewWeb(dc, cx, cy, w, h) {
  if (!simRoute || simRoute.length < 2) return;

  const totalDistStr =
    simState.totalRouteDist >= 1000
      ? (simState.totalRouteDist / 1000).toFixed(1) + ' km'
      : Math.round(simState.totalRouteDist) + ' m';

  dc.save();
  dc.fillStyle = '#00e5ff';
  dc.font = 'bold 15px -apple-system, sans-serif';
  dc.textAlign = 'center';
  dc.fillText(`GPS ART (${totalDistStr})`, cx, 28);

  const wStr =
    simState.boxWidthM >= 1000
      ? 'W ' + (simState.boxWidthM / 1000).toFixed(1) + 'k'
      : 'W ' + Math.round(simState.boxWidthM) + 'm';
  const hStr =
    simState.boxHeightM >= 1000
      ? 'H ' + (simState.boxHeightM / 1000).toFixed(1) + 'k'
      : 'H ' + Math.round(simState.boxHeightM) + 'm';

  dc.fillStyle = '#94a3b8';
  dc.font = '12px -apple-system, sans-serif';
  dc.fillText(`${wStr}   ${hStr}`, cx, 48);

  const thumbCy = cy - 2;
  const maxThumbW = w * 0.65;
  const maxThumbH = h * 0.46;

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

  dc.fillStyle = 'rgba(163, 230, 53, 0.4)';
  dc.beginPath();
  dc.arc(startSx, startSy, 9, 0, Math.PI * 2);
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
    const barY = Math.round(h * 0.77);

    dc.strokeStyle = '#ffffff';
    dc.lineWidth = 2;
    dc.beginPath();
    dc.moveTo(barX, barY);
    dc.lineTo(barX + barW, barY);
    dc.moveTo(barX, barY - 4);
    dc.lineTo(barX, barY + 4);
    dc.moveTo(barX + barW, barY - 4);
    dc.lineTo(barX + barW, barY + 4);
    dc.stroke();

    const scaleLabel = bestStep >= 1000 ? `${bestStep / 1000} km` : `${bestStep} m`;
    dc.fillStyle = '#f8fafc';
    dc.font = 'bold 11px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.fillText(scaleLabel, cx, barY - 7);
  }

  const pillW = 200;
  const pillH = 30;
  const pillX = cx - pillW / 2;
  const pillY = Math.round(h * 0.85);

  dc.fillStyle = 'rgba(15, 23, 42, 0.9)';
  roundRect(dc, pillX, pillY, pillW, pillH, 8);
  dc.fill();

  dc.strokeStyle = '#38bdf8';
  dc.lineWidth = 1.5;
  roundRect(dc, pillX, pillY, pillW, pillH, 8);
  dc.stroke();

  const relAngle = simState.bearingToStart - simState.renderHeadingRad;
  const arrowCx = pillX + 22;
  const arrowCy = pillY + 15;
  const adx = Math.sin(relAngle) * 7.5;
  const ady = -Math.cos(relAngle) * 7.5;

  dc.strokeStyle = '#a3e635';
  dc.lineWidth = 2;
  dc.beginPath();
  dc.moveTo(arrowCx - adx * 0.5, arrowCy - ady * 0.5);
  dc.lineTo(arrowCx + adx, arrowCy + ady);
  const sideAngle1 = relAngle + 2.5;
  const sideAngle2 = relAngle - 2.5;
  dc.moveTo(arrowCx + adx, arrowCy + ady);
  dc.lineTo(
    arrowCx + adx + Math.sin(sideAngle1) * 4.5,
    arrowCy + ady - Math.cos(sideAngle1) * 4.5
  );
  dc.moveTo(arrowCx + adx, arrowCy + ady);
  dc.lineTo(
    arrowCx + adx + Math.sin(sideAngle2) * 4.5,
    arrowCy + ady - Math.cos(sideAngle2) * 4.5
  );
  dc.stroke();

  const startDistStr =
    simState.distToStart >= 1000
      ? (simState.distToStart / 1000).toFixed(1) + ' km'
      : Math.round(simState.distToStart) + ' m';

  dc.fillStyle = '#ffffff';
  dc.font = 'bold 12px -apple-system, sans-serif';
  dc.textAlign = 'left';
  dc.fillText(`TO START: ${startDistStr}`, pillX + 40, pillY + 19);

  dc.restore();
}

function drawWatchScreen() {
  if (!watchCtx) return;
  const dc = watchCtx;
  const w = 416,
    h = 416;
  const cx = 208,
    cy = 208;
  const mapRange = simState.mapRange || 175;
  const ZOOM_SCALE = cx / mapRange;
  const OFF_COURSE_THRESHOLD_M = 35.0;
  const CULL_DIST_SQ = Math.pow(mapRange * 1.3, 2);

  dc.fillStyle = '#000000';
  dc.fillRect(0, 0, w, h);

  if (simRoute.length < 2) {
    dc.fillStyle = '#ffffff';
    dc.font = '16px -apple-system, sans-serif';
    dc.textAlign = 'center';
    dc.fillText('NO ROUTE LOADED', cx, cy);
    return;
  }

  const currLat = simState.currLat;
  const currLon = simState.currLon;
  const cosLat = Math.cos((currLat * Math.PI) / 180);
  const heading = simState.renderHeadingRad;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);

  const N = simRoute.length;
  let minDist = Infinity;

  const startSearch = Math.max(0, simState.segIdx - 2);
  const endSearch = Math.min(N - 2, simState.segIdx + 4);

  for (let i = startSearch; i <= endSearch; i++) {
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

    if (d < minDist) minDist = d;
  }

  if (minDist > 45.0) {
    for (let i = 0; i < N - 1; i++) {
      if (i >= startSearch && i <= endSearch) continue;
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

      if (d < minDist) minDist = d;
    }
  }

  const pStart = simRoute[0];
  const sax = (pStart.lon - currLon) * 111319.5 * cosLat;
  const say = (pStart.lat - currLat) * 111132.9;
  const distToStart = Math.hypot(sax, say);
  simState.distToStart = distToStart;
  simState.bearingToStart = Math.atan2(sax, say);

  const isFarAway = !simState.isGuideToStart && minDist > 250.0;
  if (simState.previewMode || isFarAway) {
    renderRoutePreviewWeb(dc, cx, cy, w, h);
    if (readoutHeading) readoutHeading.innerText = `${Math.round(((heading * 180) / Math.PI + 360) % 360)}°`;
    if (readoutCtd) readoutCtd.innerText = distToStart >= 1000 ? `${(distToStart / 1000).toFixed(1)} km` : `${Math.round(distToStart)} m`;
    if (readoutStatus) readoutStatus.innerHTML = `<span style="color: var(--accent-cyan);">Map Preview</span>`;
    return;
  }

  const isOffCourse = !simState.isGuideToStart && minDist > OFF_COURSE_THRESHOLD_M;
  if (isOffCourse && !simState.wasOffCourse) {
    triggerHaptic('vibe', `Off-Course Alert (+${Math.round(minDist)}m)`);
  }
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

      dc.save();
      dc.strokeStyle = '#00e5ff';
      dc.lineCap = 'round';
      dc.lineJoin = 'round';

      if (ch.isMajor) {
        dc.lineWidth = 4;
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
        dc.lineWidth = 2;
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
    for (let t = 0; t < M - 1; t++) {
      const p1 = simTrail[t];
      const p2 = simTrail[t + 1];
      const ratio = t / (M - 1);

      const tax1 = (p1.lon - currLon) * 111319.5 * cosLat;
      const tay1 = (p1.lat - currLat) * 111132.9;
      const tax2 = (p2.lon - currLon) * 111319.5 * cosLat;
      const tay2 = (p2.lat - currLat) * 111132.9;

      const tsx1 = cx + (tax1 * cosH - tay1 * sinH) * ZOOM_SCALE;
      const tsy1 = cy - (tay1 * cosH + tax1 * sinH) * ZOOM_SCALE;
      const tsx2 = cx + (tax2 * cosH - tay2 * sinH) * ZOOM_SCALE;
      const tsy2 = cy - (tay2 * cosH + tax2 * sinH) * ZOOM_SCALE;

      const segWidth = 2.0 + 3.5 * Math.pow(ratio, 1.2);
      const segAlpha = 0.35 + 0.6 * ratio;

      dc.beginPath();
      dc.strokeStyle = `rgba(163, 230, 53, ${segAlpha.toFixed(2)})`;
      dc.lineWidth = segWidth;
      dc.lineCap = 'round';
      dc.lineJoin = 'round';
      dc.moveTo(tsx1, tsy1);
      dc.lineTo(tsx2, tsy2);
      dc.stroke();
    }

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

  if (
    simState.showTurnCue &&
    !isOffCourse &&
    !simState.isGuideToStart &&
    !simState.hasFinished
  ) {
    const turn = getNextTurnCue();
    if (turn && turn.dist <= 60) {
      dc.save();
      const badgeW = 86;
      const badgeH = 28;
      const badgeX = cx + 30;
      const badgeY = cy - 144;

      const isImminent = turn.dist <= 20;
      dc.fillStyle = isImminent ? 'rgba(217, 119, 6, 0.9)' : 'rgba(15, 23, 42, 0.85)';
      roundRect(dc, badgeX, badgeY, badgeW, badgeH, 6);
      dc.fill();

      dc.strokeStyle = isImminent ? '#fbbf24' : '#38bdf8';
      dc.lineWidth = 1.5;
      roundRect(dc, badgeX, badgeY, badgeW, badgeH, 6);
      dc.stroke();

      dc.fillStyle = '#ffffff';
      dc.font = 'bold 13px -apple-system, sans-serif';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText(turn.label, badgeX + badgeW / 2, badgeY + badgeH / 2);
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

