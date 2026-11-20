// =============================================================================
// He-Kim-Koo 1:1 Garmin Watch Simulator Renderer (DOM-Free TypeScript Engine)
// =============================================================================

import type {
  LatLon,
  SimDebugOptions,
  WatchProfile,
  WatchSettings,
} from '../types/route';
import { calcDistanceMeters, formatDistance } from './gpx-engine';

export interface WatchSimUpdateState {
  isPlaying: boolean;
  progressRatio: number;
  traveledMeters: number;
  totalMeters: number;
  isOffCourse: boolean;
}

export type WatchSimUpdateCallback = (state: WatchSimUpdateState) => void;

interface ChevronMarker {
  lat: number;
  lon: number;
  ux: number;
  uy: number;
  isMajor: boolean;
  dist: number;
}

interface CornerAnchor {
  idx: number;
  lat: number;
  lon: number;
  deg: number;
}

interface TurnCue {
  cornerIdx: number;
  dist: number;
  direction: 'left' | 'right';
  label: string;
}

interface DisplayPalette {
  bg: string;
  otherFieldBg: string;
  trackBright: string;
  trackDim: string;
  anchorDim: string;
  anchorHalo: string;
  runnerLime: string;
  runnerGlow: string;
  compassRing: string;
  pillBg: string;
  isMip: boolean;
}

const AMOLED_PALETTE: DisplayPalette = {
  bg: '#000000',
  otherFieldBg: '#090d16',
  trackBright: '#00e5ff',
  trackDim: 'rgba(0, 229, 255, 0.28)',
  anchorDim: 'rgba(0, 229, 255, 0.35)',
  anchorHalo: 'rgba(0, 229, 255, 0.3)',
  runnerLime: '#a3e635',
  runnerGlow: 'rgba(163, 230, 53, 0.4)',
  compassRing: '#1e293b',
  pillBg: 'rgba(15, 23, 42, 0.88)',
  isMip: false,
};

const MIP_PALETTE: DisplayPalette = {
  bg: '#111922',
  otherFieldBg: '#1a2433',
  trackBright: '#38e8ff',
  trackDim: 'rgba(56, 232, 255, 0.36)',
  anchorDim: 'rgba(56, 232, 255, 0.42)',
  anchorHalo: 'rgba(56, 232, 255, 0.32)',
  runnerLime: '#bef264',
  runnerGlow: 'rgba(190, 242, 100, 0.38)',
  compassRing: '#334155',
  pillBg: 'rgba(15, 23, 42, 0.94)',
  isMip: true,
};

const LOGICAL_SIZE = 416;
const LOGICAL_CENTER = 208;
const OFF_COURSE_THRESHOLD_M = 35.0;
const OFF_COURSE_CLEAR_THRESHOLD_M = 25.0;
const GPS_QUALITY_USABLE = 3;

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
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

export class WatchSimulatorEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private profile: WatchProfile;

  private settings: WatchSettings = {
    routeDirection: 0,
    mapRange: 175,
    showDirection: true,
    dimCompletedPath: true,
    showCornerAnchors: true,
    showTurnCue: true,
    showProgress: true,
    enableVibration: true,
  };

  private debug: SimDebugOptions = {
    speed: 5,
    headingOffsetDeg: 0,
    distanceToStartMeters: 0,
    deviateMeters: 0,
    layoutHeight: 416,
  };

  // Route & precomputed geometry
  private simRoute: LatLon[] = [];
  private isNoRoute = false;
  private simChevrons: ChevronMarker[] = [];
  private cornerAnchors: CornerAnchor[] = [];
  private visitedSegments: boolean[] = [];
  private simTrail: LatLon[] = [];
  private simSparks: LatLon[] = [];
  private cumDistances: number[] = [0];
  private totalRouteDist = 0;

  // Route bounding box
  private centerLat = 0;
  private centerLon = 0;
  private minLat = 0;
  private maxLat = 0;
  private minLon = 0;
  private maxLon = 0;

  // Runner & animation state
  private segIdx = 0;
  private segProgress = 0.0;
  private baseLat = 25.062702;
  private baseLon = 121.530339;
  private currLat = 25.062702;
  private currLon = 121.530339;
  private targetHeadingRad = 0.0;
  private renderHeadingRad = 0.0;
  private manualHeading = false;
  private isPlaying = false;
  private hasFinished = false;
  private previewMode = false;
  private isGuideToStart = false;
  private distToStart = 0;
  private bearingToStart = 0;
  private isOffCourse = false;
  private offCourseCount = 0;
  private gpsQuality = 3;
  private lastTrailLat = 0;
  private lastTrailLon = 0;
  private lastSparkLat = 0;
  private lastSparkLon = 0;
  private freeWalkDistance = 0;
  private randomWalkStepDist = 0;
  private nextTurnDistance = 6.0;
  private animFrame: number | null = null;
  private lastTick = 0;
  private lastNotifyTime = 0;
  private listeners: Set<WatchSimUpdateCallback> = new Set();

  constructor(canvas: HTMLCanvasElement, profile: WatchProfile) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.profile = profile;
    this.debug.layoutHeight = profile.screenSize;
    this.applyCanvasResolution();
    this.draw();
  }

  public setProfile(profile: WatchProfile): void {
    const prevSize = this.profile.screenSize;
    this.profile = profile;
    if (this.debug.layoutHeight === prevSize || this.debug.layoutHeight > profile.screenSize) {
      this.debug = { ...this.debug, layoutHeight: profile.screenSize };
    }
    this.applyCanvasResolution();
    this.draw();
  }

  public setRoute(orderedPoints: LatLon[], isNoRoute = false): void {
    this.pauseInternal();
    this.isNoRoute = isNoRoute || !orderedPoints || orderedPoints.length < 2;
    this.simRoute = this.isNoRoute ? [] : orderedPoints.slice();

    if (this.simRoute.length >= 2) {
      this.calcRouteDistances();
      this.precomputeChevrons();
      this.precomputeCornerAnchors();
    } else {
      this.simChevrons = [];
      this.cornerAnchors = [];
      this.visitedSegments = [];
      this.cumDistances = [0];
      this.totalRouteDist = 0;
    }

    this.resetSimulationState(0);
    if (!this.isNoRoute && this.debug.distanceToStartMeters > 0) {
      this.applyDistanceToStart(this.debug.distanceToStartMeters);
    }
    this.draw();
    this.notifyListeners(true);
  }

  public setSettings(settings: WatchSettings): void {
    this.settings = { ...settings };
    this.draw();
  }

  public setDebug(debug: SimDebugOptions): void {
    const prev = this.debug;
    this.debug = { ...debug };

    if (debug.distanceToStartMeters !== prev.distanceToStartMeters) {
      this.applyDistanceToStart(debug.distanceToStartMeters);
    }

    if (debug.headingOffsetDeg !== prev.headingOffsetDeg) {
      const rad = (debug.headingOffsetDeg * Math.PI) / 180;
      this.targetHeadingRad = rad;
      this.renderHeadingRad = rad;
      this.manualHeading = true;
    }

    if (debug.deviateMeters !== prev.deviateMeters) {
      if (!this.previewMode && this.simRoute.length >= 2) {
        this.applyDeviationToCurrentPos();
        if (debug.deviateMeters > OFF_COURSE_THRESHOLD_M) {
          this.offCourseCount = 3;
          this.isOffCourse = true;
        } else {
          this.offCourseCount = 0;
          this.isOffCourse = false;
        }
      }
    }

    this.draw();
    this.notifyListeners(true);
  }

  public setProgressRatio(ratio: number): void {
    if (this.simRoute.length < 2 || this.totalRouteDist <= 0) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    this.previewMode = false;
    this.distToStart = 0;
    this.seekToDistance(clamped * this.totalRouteDist);
    this.notifyListeners(true);
  }

  public play(): void {
    if (this.isPlaying) return;

    if (this.simRoute.length >= 2) {
      if (
        this.previewMode ||
        this.distToStart > 50 ||
        this.segIdx >= this.simRoute.length - 1 ||
        this.hasFinished
      ) {
        this.applyDistanceToStart(0);
      }
    }

    this.manualHeading = false;
    this.isPlaying = true;
    this.lastTick = performance.now();
    this.notifyListeners(true);
    this.animFrame = requestAnimationFrame(this.simAnimationLoop);
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.pauseInternal();
    this.notifyListeners(true);
  }

  public reset(): void {
    this.pauseInternal();
    this.debug = {
      ...this.debug,
      distanceToStartMeters: 0,
      deviateMeters: 0,
    };
    this.manualHeading = false;
    this.resetSimulationState(0);
    this.draw();
    this.notifyListeners(true);
  }

  public destroy(): void {
    this.pauseInternal();
    this.listeners.clear();
  }

  public onUpdate(cb: WatchSimUpdateCallback): void {
    this.listeners.add(cb);
    cb(this.getUpdateSnapshot());
  }

  private pauseInternal(): void {
    this.isPlaying = false;
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  private applyCanvasResolution(): void {
    const size = this.profile.screenSize || LOGICAL_SIZE;
    if (this.canvas.width !== size) {
      this.canvas.width = size;
    }
    if (this.canvas.height !== size) {
      this.canvas.height = size;
    }
  }

  private getPalette(): DisplayPalette {
    return this.profile.displayType === 'MIP' ? MIP_PALETTE : AMOLED_PALETTE;
  }

  private getCurrentTraveledMeters(): number {
    if (this.simRoute.length < 2) {
      return this.freeWalkDistance;
    }
    if (this.hasFinished) {
      return this.totalRouteDist;
    }
    const segStart = this.cumDistances[this.segIdx] ?? 0;
    const segEnd = this.cumDistances[this.segIdx + 1] ?? segStart;
    return segStart + (segEnd - segStart) * this.segProgress;
  }

  private getUpdateSnapshot(): WatchSimUpdateState {
    const traveledMeters = this.getCurrentTraveledMeters();
    const totalMeters = this.totalRouteDist;
    const progressRatio =
      totalMeters > 0 ? Math.max(0, Math.min(1, traveledMeters / totalMeters)) : 0;
    return {
      isPlaying: this.isPlaying,
      progressRatio,
      traveledMeters,
      totalMeters,
      isOffCourse: this.isOffCourse,
    };
  }

  private notifyListeners(force = false): void {
    if (this.listeners.size === 0) return;
    const now = performance.now();
    if (!force && now - this.lastNotifyTime < 66) return;
    this.lastNotifyTime = now;
    const snapshot = this.getUpdateSnapshot();
    this.listeners.forEach((cb) => cb(snapshot));
  }

  private calcRouteDistances(): void {
    this.totalRouteDist = 0;
    this.cumDistances = [0];
    if (this.simRoute.length < 2) return;

    let minLat = this.simRoute[0].lat;
    let maxLat = this.simRoute[0].lat;
    let minLon = this.simRoute[0].lon;
    let maxLon = this.simRoute[0].lon;

    for (let i = 0; i < this.simRoute.length - 1; i++) {
      const d = calcDistanceMeters(this.simRoute[i], this.simRoute[i + 1]);
      this.totalRouteDist += d;
      this.cumDistances.push(this.totalRouteDist);
    }

    for (let i = 0; i < this.simRoute.length; i++) {
      const pt = this.simRoute[i];
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
    }

    this.centerLat = (minLat + maxLat) / 2;
    this.centerLon = (minLon + maxLon) / 2;
    this.minLat = minLat;
    this.maxLat = maxLat;
    this.minLon = minLon;
    this.maxLon = maxLon;
  }

  private precomputeChevrons(): void {
    this.simChevrons = [];
    if (this.simRoute.length < 2) return;

    const cosLat = Math.cos((this.simRoute[0].lat * Math.PI) / 180);
    let targetDist = 50.0;
    let currentDist = 0.0;
    let chevronIdx = 1;

    for (let i = 0; i < this.simRoute.length - 1; i++) {
      const p1 = this.simRoute[i];
      const p2 = this.simRoute[i + 1];
      const dx = (p2.lon - p1.lon) * 111319.5 * cosLat;
      const dy = (p2.lat - p1.lat) * 111132.9;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.1) continue;

      const ux = dx / segLen;
      const uy = dy / segLen;

      while (targetDist <= currentDist + segLen) {
        const t = (targetDist - currentDist) / segLen;
        this.simChevrons.push({
          lat: p1.lat + t * (p2.lat - p1.lat),
          lon: p1.lon + t * (p2.lon - p1.lon),
          ux,
          uy,
          isMajor: chevronIdx % 5 === 0,
          dist: targetDist,
        });
        chevronIdx++;
        targetDist += 50.0;
      }
      currentDist += segLen;
    }
  }

  private precomputeCornerAnchors(): void {
    this.cornerAnchors = [];
    if (this.simRoute.length < 3) return;

    for (let i = 1; i < this.simRoute.length - 1; i++) {
      const p0 = this.simRoute[i - 1];
      const p1 = this.simRoute[i];
      const p2 = this.simRoute[i + 1];

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
        this.cornerAnchors.push({
          idx: i,
          lat: p1.lat,
          lon: p1.lon,
          deg: Math.round(deg),
        });
      }
    }
  }

  private resetSimulationState(startSegIdx = 0): void {
    if (this.simRoute.length < 2) {
      this.segIdx = 0;
      this.segProgress = 0.0;
      if (!this.currLat || !this.currLon) {
        this.currLat = 25.062702;
        this.currLon = 121.530339;
      }
      this.baseLat = this.currLat;
      this.baseLon = this.currLon;
      this.isGuideToStart = false;
      this.hasFinished = false;
      this.isOffCourse = false;
      this.offCourseCount = 0;
      this.previewMode = false;
      this.freeWalkDistance = 0;
      this.randomWalkStepDist = 0;
      this.nextTurnDistance = 4.0 + Math.random() * 5.0;

      this.simTrail = [{ lat: this.currLat, lon: this.currLon }];
      this.simSparks = [{ lat: this.currLat, lon: this.currLon }];
      this.lastTrailLat = this.currLat;
      this.lastTrailLon = this.currLon;
      this.lastSparkLat = this.currLat;
      this.lastSparkLon = this.currLon;
      return;
    }

    const validStart = Math.min(Math.max(0, startSegIdx), this.simRoute.length - 2);
    this.segIdx = validStart;
    this.segProgress = 0.0;
    this.baseLat = this.simRoute[validStart].lat;
    this.baseLon = this.simRoute[validStart].lon;
    this.currLat = this.baseLat;
    this.currLon = this.baseLon;
    this.isGuideToStart = false;
    this.hasFinished = false;
    this.isOffCourse = false;
    this.offCourseCount = 0;
    this.previewMode = false;
    this.distToStart = 0;

    this.visitedSegments = new Array<boolean>(this.simRoute.length - 1).fill(false);

    this.simTrail = [{ lat: this.baseLat, lon: this.baseLon }];
    this.simSparks = [{ lat: this.baseLat, lon: this.baseLon }];
    this.lastTrailLat = this.baseLat;
    this.lastTrailLon = this.baseLon;
    this.lastSparkLat = this.baseLat;
    this.lastSparkLon = this.baseLon;

    const nextIdx = validStart + 1;
    const vLat = this.simRoute[nextIdx].lat - this.simRoute[validStart].lat;
    const vLon =
      (this.simRoute[nextIdx].lon - this.simRoute[validStart].lon) *
      Math.cos((this.simRoute[validStart].lat * Math.PI) / 180);
    const initHeading = Math.atan2(vLon, vLat);
    this.targetHeadingRad = initHeading;
    this.renderHeadingRad = initHeading;
  }

  private applyDistanceToStart(distMeters: number): void {
    if (this.simRoute.length < 2) return;
    const pStart = this.simRoute[0];
    const cosLat0 = Math.cos((pStart.lat * Math.PI) / 180);

    this.pauseInternal();
    const D = Math.max(0, distMeters);

    if (D === 0) {
      this.previewMode = false;
      this.manualHeading = false;
      this.segIdx = 0;
      this.segProgress = 0.0;
      this.hasFinished = false;
      this.baseLat = pStart.lat;
      this.baseLon = pStart.lon;
      this.currLat = pStart.lat;
      this.currLon = pStart.lon;
      this.distToStart = 0;
      this.visitedSegments = new Array<boolean>(this.simRoute.length - 1).fill(false);

      const pB = this.simRoute[1];
      const vLat = pB.lat - pStart.lat;
      const vLon = (pB.lon - pStart.lon) * cosLat0;
      const initH = Math.atan2(vLon, vLat);
      this.targetHeadingRad = initH;
      this.renderHeadingRad = initH;

      this.simTrail = [{ lat: pStart.lat, lon: pStart.lon }];
      this.simSparks = [{ lat: pStart.lat, lon: pStart.lon }];
      this.lastTrailLat = pStart.lat;
      this.lastTrailLon = pStart.lon;
      this.lastSparkLat = pStart.lat;
      this.lastSparkLon = pStart.lon;

      this.applyDeviationToCurrentPos();
    } else {
      // Offset along Southwest bearing (225 deg) from start point
      const bearingRad = (225 * Math.PI) / 180;
      const dLat = (D * Math.cos(bearingRad)) / 111132.9;
      const dLon = (D * Math.sin(bearingRad)) / (111319.5 * cosLat0);
      this.baseLat = pStart.lat + dLat;
      this.baseLon = pStart.lon + dLon;
      this.currLat = this.baseLat;
      this.currLon = this.baseLon;
      this.distToStart = D;
      this.previewMode = D > 100;
      this.renderHeadingRad = this.targetHeadingRad;
    }
  }

  private applyDeviationToCurrentPos(): void {
    const dev = this.debug.deviateMeters;
    if (dev > 0) {
      const rightAngle = this.renderHeadingRad + Math.PI / 2;
      const dLat = (dev * Math.cos(rightAngle)) / 111132.9;
      const dLon =
        (dev * Math.sin(rightAngle)) /
        (111319.5 * Math.cos((this.baseLat * Math.PI) / 180));
      this.currLat = this.baseLat + dLat;
      this.currLon = this.baseLon + dLon;
    } else {
      this.currLat = this.baseLat;
      this.currLon = this.baseLon;
    }
  }

  private seekToDistance(targetMeters: number): void {
    if (this.simRoute.length < 2) return;
    const clamped = Math.max(0, Math.min(targetMeters, this.totalRouteDist));

    let seg = 0;
    while (seg < this.simRoute.length - 2 && this.cumDistances[seg + 1] <= clamped) {
      seg++;
    }
    const segStartDist = this.cumDistances[seg] ?? 0;
    const pA = this.simRoute[seg];
    const pB = this.simRoute[seg + 1];
    const segLen = calcDistanceMeters(pA, pB);
    const progress =
      segLen > 0.001 ? Math.max(0, Math.min(1.0, (clamped - segStartDist) / segLen)) : 0;

    this.segIdx = seg;
    this.segProgress = progress;
    this.hasFinished = clamped >= this.totalRouteDist && this.totalRouteDist > 0;

    for (let i = 0; i < this.visitedSegments.length; i++) {
      this.visitedSegments[i] = i < seg || this.hasFinished;
    }

    this.baseLat = pA.lat + (pB.lat - pA.lat) * progress;
    this.baseLon = pA.lon + (pB.lon - pA.lon) * progress;

    const vLat = pB.lat - pA.lat;
    const vLon = (pB.lon - pA.lon) * Math.cos((this.baseLat * Math.PI) / 180);
    const natHeading = Math.atan2(vLon, vLat);

    if (!this.manualHeading) {
      this.targetHeadingRad = natHeading;
      this.renderHeadingRad = natHeading;
    }

    this.applyDeviationToCurrentPos();

    this.simTrail = [{ lat: this.currLat, lon: this.currLon }];
    this.simSparks = [{ lat: this.currLat, lon: this.currLon }];
    this.lastTrailLat = this.currLat;
    this.lastTrailLon = this.currLon;
    this.lastSparkLat = this.currLat;
    this.lastSparkLon = this.currLon;

    this.draw();
  }

  private simAnimationLoop = (now: number): void => {
    if (!this.isPlaying) return;
    const dt = Math.min((now - (this.lastTick || now)) / 1000, 0.1);
    this.lastTick = now;

    const speedMultiplier = this.debug.speed || 5;
    const runSpeedMetersPerSec = 3.2 * speedMultiplier;

    if (this.simRoute.length >= 2) {
      this.advanceRunner(runSpeedMetersPerSec * dt);
    } else {
      this.advanceRandomWalker(runSpeedMetersPerSec * dt);
    }

    let diff = this.targetHeadingRad - this.renderHeadingRad;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    this.renderHeadingRad += diff * 0.18;

    this.draw();
    this.notifyListeners(false);

    if (this.isPlaying) {
      this.animFrame = requestAnimationFrame(this.simAnimationLoop);
    }
  };

  private advanceRandomWalker(distanceM: number): void {
    this.randomWalkStepDist += distanceM;
    if (this.randomWalkStepDist >= this.nextTurnDistance) {
      this.randomWalkStepDist = 0;
      this.nextTurnDistance = 4.0 + Math.random() * 5.0;

      const r = Math.random();
      let maxAngleRad = (15 * Math.PI) / 180;
      if (r < 0.5) {
        maxAngleRad = (15 * Math.PI) / 180;
      } else if (r < 0.8) {
        maxAngleRad = (90 * Math.PI) / 180;
      } else {
        maxAngleRad = (135 * Math.PI) / 180;
      }

      const deltaRad = (Math.random() * 2 - 1) * maxAngleRad;
      let nextHeading = this.targetHeadingRad + deltaRad;
      while (nextHeading > Math.PI) nextHeading -= 2 * Math.PI;
      while (nextHeading < -Math.PI) nextHeading += 2 * Math.PI;
      this.targetHeadingRad = nextHeading;
    }

    const heading = this.renderHeadingRad;
    const cosLat = Math.cos((this.currLat * Math.PI) / 180);
    const dLat = (distanceM * Math.cos(heading)) / 111132.9;
    const dLon = (distanceM * Math.sin(heading)) / (111319.5 * cosLat);

    this.currLat += dLat;
    this.currLon += dLon;
    this.baseLat = this.currLat;
    this.baseLon = this.currLon;
    this.freeWalkDistance += distanceM;

    this.recordTrailAndSparks();
  }

  private advanceRunner(distanceM: number): void {
    this.visitedSegments[this.segIdx] = true;

    if (this.segIdx >= this.simRoute.length - 1) {
      const hasUnvisited = this.visitedSegments.some((v) => !v);
      if (hasUnvisited) {
        this.segIdx = 0;
        this.segProgress = 0;
      } else {
        this.pauseInternal();
        this.hasFinished = true;
        this.notifyListeners(true);
        return;
      }
    }

    const pA = this.simRoute[this.segIdx];
    const pB = this.simRoute[this.segIdx + 1];
    const segLen = calcDistanceMeters(pA, pB);

    if (segLen <= 0.001) {
      this.segIdx++;
      this.segProgress = 0;
      return;
    }

    this.segProgress += distanceM / segLen;
    if (this.segProgress >= 1.0) {
      this.visitedSegments[this.segIdx] = true;
      this.segProgress = 0;
      this.segIdx++;
      if (this.segIdx >= this.simRoute.length - 1) {
        const hasUnvisited = this.visitedSegments.some((v) => !v);
        if (hasUnvisited) {
          this.segIdx = 0;
          this.segProgress = 0;
        } else {
          this.pauseInternal();
          this.hasFinished = true;
          this.notifyListeners(true);
          return;
        }
      }
    }

    const currA = this.simRoute[this.segIdx];
    const currB = this.simRoute[this.segIdx + 1];
    const t = this.segProgress;
    this.baseLat = currA.lat + (currB.lat - currA.lat) * t;
    this.baseLon = currA.lon + (currB.lon - currA.lon) * t;

    const vLat = currB.lat - currA.lat;
    const vLon = (currB.lon - currA.lon) * Math.cos((this.baseLat * Math.PI) / 180);
    const naturalHeading = Math.atan2(vLon, vLat);

    if (!this.manualHeading) {
      this.targetHeadingRad = naturalHeading;
    }

    this.applyDeviationToCurrentPos();
    this.recordTrailAndSparks();
  }

  private recordTrailAndSparks(): void {
    const cosLat = Math.cos((this.currLat * Math.PI) / 180);
    const dLatM = (this.currLat - this.lastTrailLat) * 111132.9;
    const dLonM = (this.currLon - this.lastTrailLon) * 111319.5 * cosLat;

    if (dLatM * dLatM + dLonM * dLonM > 25.0 || this.simTrail.length === 0) {
      this.simTrail.push({ lat: this.currLat, lon: this.currLon });
      if (this.simTrail.length > 24) this.simTrail.shift();
      this.lastTrailLat = this.currLat;
      this.lastTrailLon = this.currLon;
    }

    const dSparkLatM = (this.currLat - this.lastSparkLat) * 111132.9;
    const dSparkLonM = (this.currLon - this.lastSparkLon) * 111319.5 * cosLat;

    if (dSparkLatM * dSparkLatM + dSparkLonM * dSparkLonM >= 400.0) {
      this.simSparks.push({ lat: this.currLat, lon: this.currLon });
      if (this.simSparks.length > 10) this.simSparks.shift();
      this.lastSparkLat = this.currLat;
      this.lastSparkLon = this.currLon;
    }
  }

  private getNextTurnCue(): TurnCue | null {
    if (this.simRoute.length < 3 || this.segIdx >= this.simRoute.length - 1) return null;
    const pCurA = this.simRoute[this.segIdx];
    const pCurB = this.simRoute[this.segIdx + 1];
    const curSegLen = calcDistanceMeters(pCurA, pCurB);
    let distAhead = curSegLen * (1 - this.segProgress);

    for (let i = this.segIdx + 1; i < this.simRoute.length - 1; i++) {
      const p0 = this.simRoute[i - 1];
      const p1 = this.simRoute[i];
      const p2 = this.simRoute[i + 1];

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

  private findNearestRouteSegment(
    currLat: number,
    currLon: number,
    cosLat: number,
    headingRad: number
  ): number {
    const N = this.simRoute.length;
    let minDist = Infinity;
    let minScore = Infinity;

    const hx = Math.sin(headingRad);
    const hy = Math.cos(headingRad);
    const startSearch = Math.max(0, this.segIdx - 2);
    const endSearch = Math.min(N - 2, this.segIdx + 4);

    for (let pass = 0; pass < 2; pass++) {
      const loopStart = pass === 0 ? startSearch : 0;
      const loopEnd = pass === 0 ? endSearch : N - 2;

      for (let i = loopStart; i <= loopEnd; i++) {
        if (pass === 1 && i >= startSearch && i <= endSearch) continue;
        const pA = this.simRoute[i];
        const pB = this.simRoute[i + 1];

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

        let score = i === this.segIdx || i === this.segIdx + 1 ? d * 0.8 : d;
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

  private draw(): void {
    if (!this.ctx) return;
    const dc = this.ctx;
    const palette = this.getPalette();
    const fullSize = this.profile.screenSize || LOGICAL_SIZE;
    const scale = fullSize / LOGICAL_SIZE;
    const physicalH = Math.min(fullSize, Math.max(1, this.debug.layoutHeight || fullSize));
    const logicalH = physicalH / scale;
    const cx = LOGICAL_CENTER;
    const cy = Math.round(logicalH / 2);

    dc.save();
    dc.scale(scale, scale);

    dc.fillStyle = palette.bg;
    dc.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

    dc.save();
    dc.beginPath();
    dc.rect(0, 0, LOGICAL_SIZE, logicalH);
    dc.clip();

    try {
      this.drawWatchScreenContent(dc, LOGICAL_SIZE, logicalH, cx, cy, palette);
    } finally {
      dc.restore();
    }

    if (physicalH < fullSize) {
      dc.save();
      dc.fillStyle = palette.otherFieldBg;
      dc.fillRect(0, logicalH, LOGICAL_SIZE, LOGICAL_SIZE - logicalH);
      dc.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      dc.lineWidth = 2;
      dc.beginPath();
      dc.moveTo(0, logicalH);
      dc.lineTo(LOGICAL_SIZE, logicalH);
      dc.stroke();

      dc.fillStyle = 'rgba(148, 163, 184, 0.6)';
      dc.font = '600 13px -apple-system, sans-serif';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText(
        `OTHER DATA FIELD (${fullSize}×${fullSize - physicalH})`,
        cx,
        logicalH + (LOGICAL_SIZE - logicalH) * 0.35
      );
      dc.restore();
    }

    // Subtle matte glare tint for MIP transflective displays
    if (palette.isMip) {
      dc.save();
      const grad = dc.createLinearGradient(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
      grad.addColorStop(0, 'rgba(226, 232, 240, 0.06)');
      grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.02)');
      grad.addColorStop(1, 'rgba(2, 6, 23, 0.14)');
      dc.fillStyle = grad;
      dc.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
      dc.restore();
    }

    dc.restore();
  }

  private drawWatchScreenContent(
    dc: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    palette: DisplayPalette
  ): void {
    const mapRange = this.settings.mapRange || 175;
    const ZOOM_SCALE = cx / mapRange;
    const CULL_DIST_SQ = Math.pow(mapRange * 1.3, 2);

    dc.fillStyle = palette.bg;
    dc.fillRect(0, 0, w, h);

    if (this.simRoute.length < 2) {
      this.drawNoRouteMode(dc, cx, cy, h, ZOOM_SCALE, CULL_DIST_SQ, palette);
      return;
    }

    const currLat = this.currLat;
    const currLon = this.currLon;
    const cosLat = Math.cos((currLat * Math.PI) / 180);
    const heading = this.renderHeadingRad;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);

    const minDist = this.findNearestRouteSegment(
      currLat,
      currLon,
      cosLat,
      this.targetHeadingRad || heading
    );

    const pStart = this.simRoute[0];
    const sax = (pStart.lon - currLon) * 111319.5 * cosLat;
    const say = (pStart.lat - currLat) * 111132.9;
    const distToStart = Math.hypot(sax, say);
    this.distToStart = distToStart;
    this.bearingToStart = Math.atan2(sax, say);

    const isFarAway = !this.isGuideToStart && minDist > 250.0;
    if (this.previewMode || isFarAway) {
      this.isOffCourse = false;
      this.offCourseCount = 0;
      this.renderRoutePreview(dc, cx, cy, w, h, palette);
      return;
    }

    // Off-course debouncing (3 consecutive samples > 35m) & hysteresis (clear <= 25m)
    const prevOffCourse = this.isOffCourse;
    if (this.gpsQuality >= GPS_QUALITY_USABLE && !this.isGuideToStart) {
      if (this.isOffCourse) {
        if (minDist <= OFF_COURSE_CLEAR_THRESHOLD_M) {
          this.isOffCourse = false;
          this.offCourseCount = 0;
        }
      } else if (minDist > OFF_COURSE_THRESHOLD_M) {
        this.offCourseCount += 1;
        if (this.offCourseCount >= 3) {
          this.isOffCourse = true;
        }
      } else {
        this.offCourseCount = 0;
      }
    }
    if (prevOffCourse !== this.isOffCourse) {
      this.notifyListeners(true);
    }

    const isOffCourse = this.isOffCourse;
    const isDim = this.settings.dimCompletedPath && !this.isGuideToStart;
    const currentSeg = this.segIdx;

    dc.lineCap = 'round';
    dc.lineJoin = 'round';

    // Route polyline segments
    for (let i = 0; i < this.simRoute.length - 1; i++) {
      const pA = this.simRoute[i];
      const pB = this.simRoute[i + 1];

      const ax = (pA.lon - currLon) * 111319.5 * cosLat;
      const ay = (pA.lat - currLat) * 111132.9;
      const bx = (pB.lon - currLon) * 111319.5 * cosLat;
      const by = (pB.lat - currLat) * 111132.9;

      if (ax * ax + ay * ay > CULL_DIST_SQ && bx * bx + by * by > CULL_DIST_SQ) continue;

      const sx1 = cx + (ax * cosH - ay * sinH) * ZOOM_SCALE;
      const sy1 = cy - (ay * cosH + ax * sinH) * ZOOM_SCALE;
      const sx2 = cx + (bx * cosH - by * sinH) * ZOOM_SCALE;
      const sy2 = cy - (by * cosH + bx * sinH) * ZOOM_SCALE;

      const isVisited = Boolean(this.visitedSegments[i]);
      const isCurrent = i === currentSeg;

      dc.save();
      if (isDim && isVisited && !isCurrent) {
        dc.strokeStyle = palette.trackDim;
        dc.lineWidth = 3;
        dc.beginPath();
        dc.moveTo(sx1, sy1);
        dc.lineTo(sx2, sy2);
        dc.stroke();
      } else if (isDim && isCurrent) {
        const t = this.segProgress;
        const midX = sx1 + (sx2 - sx1) * t;
        const midY = sy1 + (sy2 - sy1) * t;

        dc.strokeStyle = palette.trackDim;
        dc.lineWidth = 3;
        dc.beginPath();
        dc.moveTo(sx1, sy1);
        dc.lineTo(midX, midY);
        dc.stroke();

        dc.strokeStyle = palette.trackBright;
        dc.lineWidth = 4;
        dc.beginPath();
        dc.moveTo(midX, midY);
        dc.lineTo(sx2, sy2);
        dc.stroke();
      } else {
        dc.strokeStyle = palette.trackBright;
        dc.lineWidth = 4;
        dc.beginPath();
        dc.moveTo(sx1, sy1);
        dc.lineTo(sx2, sy2);
        dc.stroke();
      }
      dc.restore();
    }

    // Direction chevrons
    if (this.settings.showDirection) {
      const runnerDist = this.getCurrentTraveledMeters();

      for (let k = 0; k < this.simChevrons.length; k++) {
        const ch = this.simChevrons[k];
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
        const isDimmed = this.settings.dimCompletedPath && isChevronPassed;
        const chColor = isDimmed ? palette.trackDim : palette.trackBright;
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

    // Corner anchor dots
    if (this.settings.showCornerAnchors && this.cornerAnchors.length > 0) {
      for (let c = 0; c < this.cornerAnchors.length; c++) {
        const anchor = this.cornerAnchors[c];
        const ax = (anchor.lon - currLon) * 111319.5 * cosLat;
        const ay = (anchor.lat - currLat) * 111132.9;

        if (ax * ax + ay * ay > CULL_DIST_SQ) continue;

        const sx = cx + (ax * cosH - ay * sinH) * ZOOM_SCALE;
        const sy = cy - (ay * cosH + ax * sinH) * ZOOM_SCALE;

        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

        const isPassed = this.settings.dimCompletedPath && Boolean(this.visitedSegments[anchor.idx]);

        dc.save();
        if (isPassed) {
          dc.fillStyle = palette.anchorDim;
          dc.beginPath();
          dc.arc(sx, sy, 3, 0, Math.PI * 2);
          dc.fill();
        } else {
          dc.fillStyle = palette.anchorHalo;
          dc.beginPath();
          dc.arc(sx, sy, 7, 0, Math.PI * 2);
          dc.fill();

          dc.fillStyle = palette.trackBright;
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

    // Firefly trail & 20m sparks
    this.drawTrailAndSparks(dc, cx, cy, currLat, currLon, cosLat, sinH, cosH, ZOOM_SCALE, CULL_DIST_SQ, palette);

    // Runner dart
    this.drawRunnerDart(dc, cx, cy, palette);

    // Upcoming Turn Cue HUD
    if (this.settings.showTurnCue && !isOffCourse && !this.isGuideToStart && !this.hasFinished) {
      const turn = this.getNextTurnCue();
      if (turn && turn.dist <= 60) {
        dc.save();
        const badgeW = 144;
        const badgeH = 38;
        const badgeX = cx - badgeW / 2;
        const badgeY = 26;

        const isImminent = turn.dist <= 20;
        dc.fillStyle = isImminent ? 'rgba(217, 119, 6, 0.95)' : 'rgba(15, 23, 42, 0.92)';
        drawRoundedRectPath(dc, badgeX, badgeY, badgeW, badgeH, 8);
        dc.fill();

        dc.strokeStyle = isImminent ? '#fbbf24' : palette.trackBright;
        dc.lineWidth = 2.5;
        drawRoundedRectPath(dc, badgeX, badgeY, badgeW, badgeH, 8);
        dc.stroke();

        dc.fillStyle = '#ffffff';
        dc.font = 'bold 16px -apple-system, sans-serif';
        dc.textAlign = 'center';
        dc.textBaseline = 'middle';
        dc.fillText(turn.label, cx, badgeY + badgeH / 2);
        dc.restore();
      }
    }

    // Off-Course Alert Banner
    if (isOffCourse) {
      dc.save();
      const bannerW = 230;
      const bannerH = 36;
      const bannerX = cx - bannerW / 2;
      const bannerY = 26;

      dc.fillStyle = '#dc2626';
      drawRoundedRectPath(dc, bannerX, bannerY, bannerW, bannerH, 6);
      dc.fill();

      dc.fillStyle = '#ffffff';
      dc.font = 'bold 15px -apple-system, sans-serif';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText(`OFF COURSE (+${Math.round(minDist)}m)`, cx, bannerY + bannerH / 2);
      dc.restore();
    }

    // Completed Banner
    if (this.hasFinished) {
      dc.save();
      const badgeW = 180;
      const badgeH = 28;
      const badgeX = cx - badgeW / 2;
      const badgeY = 26;

      dc.fillStyle = palette.pillBg;
      drawRoundedRectPath(dc, badgeX, badgeY, badgeW, badgeH, 8);
      dc.fill();

      dc.strokeStyle = '#84cc16';
      dc.lineWidth = 1.5;
      drawRoundedRectPath(dc, badgeX, badgeY, badgeW, badgeH, 8);
      dc.stroke();

      dc.fillStyle = palette.runnerLime;
      dc.font = 'bold 13px -apple-system, sans-serif';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText('GPS ART COMPLETED', cx, badgeY + badgeH / 2);
      dc.restore();
    }

    // Bottom HUD pill: Remaining Distance & Completion %
    if (this.settings.showProgress && this.totalRouteDist > 0 && this.cumDistances.length >= 2) {
      const coveredM = this.getCurrentTraveledMeters();
      const remM = Math.max(0, this.totalRouteDist - coveredM);
      const pct = this.hasFinished
        ? 100
        : Math.min(100, Math.round((coveredM / this.totalRouteDist) * 100));
      const hudText = this.hasFinished ? '0 m · 100%' : `${formatDistance(remM)} · ${pct}%`;

      dc.save();
      dc.font = 'bold 13px -apple-system, sans-serif';
      const pillW = dc.measureText(hudText).width + 24;
      const pillH = 24;
      const pillX = cx - pillW / 2;
      const pillY = (h < 240 ? h - 20 : h * 0.87) - pillH / 2;

      dc.fillStyle = palette.pillBg;
      drawRoundedRectPath(dc, pillX, pillY, pillW, pillH, pillH / 2);
      dc.fill();

      dc.strokeStyle = this.hasFinished ? '#84cc16' : 'rgba(56, 189, 248, 0.55)';
      dc.lineWidth = 1;
      drawRoundedRectPath(dc, pillX, pillY, pillW, pillH, pillH / 2);
      dc.stroke();

      dc.fillStyle = this.hasFinished ? palette.runnerLime : '#e2e8f0';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText(hudText, cx, pillY + pillH / 2);
      dc.restore();
    }
  }

  private drawNoRouteMode(
    dc: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    h: number,
    ZOOM_SCALE: number,
    CULL_DIST_SQ: number,
    palette: DisplayPalette
  ): void {
    const heading = this.renderHeadingRad || 0.0;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const cosLat = Math.cos((this.currLat * Math.PI) / 180);

    this.drawTrailAndSparks(
      dc,
      cx,
      cy,
      this.currLat,
      this.currLon,
      cosLat,
      sinH,
      cosH,
      ZOOM_SCALE,
      CULL_DIST_SQ,
      palette
    );
    this.drawRunnerDart(dc, cx, cy, palette);

    // "NO ROUTE" capsule badge at top
    dc.save();
    const topY = Math.round(h * 0.14);
    const textStr = 'NO ROUTE';
    dc.font = 'bold 12px -apple-system, sans-serif';
    const textW = dc.measureText(textStr).width;
    const pillW = textW + 20;
    const pillH = 22;
    const pillX = cx - pillW / 2;
    const pillY = topY - pillH / 2;
    const pillR = pillH / 2;

    dc.fillStyle = '#041c24';
    drawRoundedRectPath(dc, pillX, pillY, pillW, pillH, pillR);
    dc.fill();

    dc.strokeStyle = palette.trackBright;
    dc.lineWidth = 1;
    drawRoundedRectPath(dc, pillX, pillY, pillW, pillH, pillR);
    dc.stroke();

    dc.fillStyle = palette.trackBright;
    dc.textAlign = 'center';
    dc.textBaseline = 'middle';
    dc.fillText(textStr, cx, topY);
    dc.restore();
  }

  private drawTrailAndSparks(
    dc: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    currLat: number,
    currLon: number,
    cosLat: number,
    sinH: number,
    cosH: number,
    ZOOM_SCALE: number,
    CULL_DIST_SQ: number,
    palette: DisplayPalette
  ): void {
    const M = this.simTrail.length;
    if (M <= 1) return;

    dc.save();
    dc.beginPath();
    for (let t = 0; t < M; t++) {
      const p = this.simTrail[t];
      const tax = (p.lon - currLon) * 111319.5 * cosLat;
      const tay = (p.lat - currLat) * 111132.9;
      const tsx = cx + (tax * cosH - tay * sinH) * ZOOM_SCALE;
      const tsy = cy - (tay * cosH + tax * sinH) * ZOOM_SCALE;
      if (t === 0) {
        dc.moveTo(tsx, tsy);
      } else {
        dc.lineTo(tsx, tsy);
      }
    }
    dc.lineTo(cx, cy + 4);
    dc.strokeStyle = palette.runnerLime;
    dc.lineWidth = 3;
    dc.lineCap = 'round';
    dc.lineJoin = 'round';
    dc.stroke();
    dc.restore();

    const S = this.simSparks.length;
    if (S > 0) {
      for (let s = 0; s < S; s++) {
        const sp = this.simSparks[s];
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

  private drawRunnerDart(
    dc: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    palette: DisplayPalette
  ): void {
    dc.save();
    dc.lineJoin = 'round';
    dc.lineCap = 'round';

    dc.fillStyle = palette.runnerLime;
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
  }

  private renderRoutePreview(
    dc: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
    palette: DisplayPalette
  ): void {
    if (this.simRoute.length < 2) return;

    const ringR = Math.min(cx, cy) - 10;

    dc.save();

    // 1. Outer Compass Ring & 12 o'clock Watch Heading Index Tick
    dc.strokeStyle = palette.compassRing;
    dc.lineWidth = 1;
    dc.beginPath();
    dc.arc(cx, cy, ringR, 0, Math.PI * 2);
    dc.stroke();

    dc.strokeStyle = '#ffffff';
    dc.lineWidth = 2;
    dc.beginPath();
    dc.moveTo(cx, cy - ringR - 3);
    dc.lineTo(cx, cy - ringR + 3);
    dc.stroke();

    // 2. Route thumbnail placement & scaling
    const thumbCy = Math.round(h * 0.44);
    const maxThumbW = w * 0.56;
    const maxThumbH = h * 0.36;

    const centerLat = this.centerLat || this.simRoute[0].lat;
    const centerLon = this.centerLon || this.simRoute[0].lon;
    const cosLat = Math.cos((centerLat * Math.PI) / 180);

    const dLonMetric = Math.max(1.0, (this.maxLon - this.minLon) * 111319.5 * cosLat);
    const dLatMetric = Math.max(1.0, (this.maxLat - this.minLat) * 111132.9);

    const thumbScale = Math.min(maxThumbW / dLonMetric, maxThumbH / dLatMetric);

    dc.strokeStyle = palette.trackBright;
    dc.lineWidth = 3;
    dc.lineCap = 'round';
    dc.lineJoin = 'round';
    dc.beginPath();

    const p0 = this.simRoute[0];
    const startSx = cx + (p0.lon - centerLon) * 111319.5 * cosLat * thumbScale;
    const startSy = thumbCy - (p0.lat - centerLat) * 111132.9 * thumbScale;
    dc.moveTo(startSx, startSy);

    for (let i = 1; i < this.simRoute.length; i++) {
      const pt = this.simRoute[i];
      const sx = cx + (pt.lon - centerLon) * 111319.5 * cosLat * thumbScale;
      const sy = thumbCy - (pt.lat - centerLat) * 111132.9 * thumbScale;
      dc.lineTo(sx, sy);
    }
    dc.stroke();

    const pEnd = this.simRoute[this.simRoute.length - 1];
    const endSx = cx + (pEnd.lon - centerLon) * 111319.5 * cosLat * thumbScale;
    const endSy = thumbCy - (pEnd.lat - centerLat) * 111132.9 * thumbScale;
    const isLoop = Math.hypot(startSx - endSx, startSy - endSy) < 6;

    // Route Start landmark anchor
    dc.fillStyle = palette.runnerGlow;
    dc.beginPath();
    dc.arc(startSx, startSy, 8, 0, Math.PI * 2);
    dc.fill();

    dc.fillStyle = palette.runnerLime;
    dc.beginPath();
    dc.arc(startSx, startSy, 5, 0, Math.PI * 2);
    dc.fill();

    dc.fillStyle = '#ffffff';
    dc.beginPath();
    dc.arc(startSx, startSy, 2, 0, Math.PI * 2);
    dc.fill();

    if (!isLoop) {
      dc.fillStyle = palette.trackBright;
      dc.beginPath();
      dc.arc(endSx, endSy, 5, 0, Math.PI * 2);
      dc.fill();

      dc.fillStyle = '#ffffff';
      dc.beginPath();
      dc.arc(endSx, endSy, 2, 0, Math.PI * 2);
      dc.fill();
    }

    // 3. Adaptive Visual Scale Bar
    const pixelsPerMeter = thumbScale;
    if (pixelsPerMeter > 0.00001) {
      const targetSteps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
      let bestStep = 500;
      let bestDiff = Infinity;
      for (const step of targetSteps) {
        const diff = Math.abs(step * pixelsPerMeter - 55);
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

    // 4. Total Route Distance Pill Capsule
    const totalDistStr = formatDistance(this.totalRouteDist);
    const totalY = Math.round(h * 0.8);
    dc.font = 'bold 15px -apple-system, sans-serif';
    const textW = dc.measureText(totalDistStr).width;
    const pillW = Math.round(textW + 24);
    const pillH = 26;
    const pillX = Math.round(cx - pillW / 2);
    const pillY = Math.round(totalY - pillH / 2);
    const pillR = Math.round(pillH / 2);

    dc.save();
    drawRoundedRectPath(dc, pillX, pillY, pillW, pillH, pillR);
    dc.fillStyle = 'rgba(0, 229, 255, 0.08)';
    dc.fill();
    dc.strokeStyle = palette.trackBright;
    dc.lineWidth = 1;
    dc.stroke();

    dc.fillStyle = palette.trackBright;
    dc.textAlign = 'center';
    dc.textBaseline = 'middle';
    dc.fillText(totalDistStr, cx, totalY);
    dc.restore();

    // 5. Outer Ring Indicators & Navigation Guidance
    if (this.currLat && this.currLon) {
      const userDx = (this.currLon - centerLon) * 111319.5 * cosLat * thumbScale;
      const userDy = -(this.currLat - centerLat) * 111132.9 * thumbScale;
      const userSx = cx + userDx;
      const userSy = thumbCy + userDy;

      const uDist = Math.hypot(userSx - cx, userSy - cy);
      const maxInnerR = ringR - 14;

      if (uDist <= maxInnerR) {
        const uHeading = this.renderHeadingRad || 0.0;
        const hdx = Math.sin(uHeading);
        const hdy = -Math.cos(uHeading);
        const hpx = -hdy;
        const hpy = hdx;

        const aTipX = userSx + hdx * 8;
        const aTipY = userSy + hdy * 8;
        const aW1X = userSx - hdx * 6 + hpx * 5;
        const aW1Y = userSy - hdy * 6 + hpy * 5;
        const aW2X = userSx - hdx * 6 - hpx * 5;
        const aW2Y = userSy - hdy * 6 - hpy * 5;
        const aNotchX = userSx - hdx * 2;
        const aNotchY = userSy - hdy * 2;

        dc.fillStyle = palette.trackBright;
        dc.beginPath();
        dc.moveTo(aTipX, aTipY);
        dc.lineTo(aW1X, aW1Y);
        dc.lineTo(aNotchX, aNotchY);
        dc.lineTo(aW2X, aW2Y);
        dc.closePath();
        dc.fill();

        dc.strokeStyle = '#ffffff';
        dc.lineWidth = 1;
        dc.stroke();

        const gDist = Math.hypot(startSx - userSx, startSy - userSy);
        if (gDist > 14) {
          dc.save();
          dc.strokeStyle = 'rgba(163, 230, 53, 0.45)';
          dc.lineWidth = 1.5;
          dc.setLineDash([4, 4]);
          dc.beginPath();
          dc.moveTo(userSx, userSy);
          dc.lineTo(startSx, startSy);
          dc.stroke();
          dc.restore();
        }
      }

      // Target Direction to Start Point pointer on outer compass ring
      const currentHeading = this.renderHeadingRad || 0.0;
      let targetAngle = this.bearingToStart - currentHeading;
      while (targetAngle > Math.PI) targetAngle -= 2 * Math.PI;
      while (targetAngle < -Math.PI) targetAngle += 2 * Math.PI;

      const trx = Math.sin(targetAngle);
      const tryVec = -Math.cos(targetAngle);
      const ttx = -tryVec;
      const tty = trx;

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

      dc.fillStyle = palette.runnerLime;
      dc.beginPath();
      dc.moveTo(tTipX, tTipY);
      dc.lineTo(tw1X, tw1Y);
      dc.lineTo(tNotchX, tNotchY);
      dc.lineTo(tw2X, tw2Y);
      dc.closePath();
      dc.fill();

      dc.strokeStyle = '#ffffff';
      dc.lineWidth = 1;
      dc.stroke();

      // Label: "START" + distance directly beneath it
      const startDistStr = formatDistance(this.distToStart);
      const fontH1 = 11;
      const fontH2 = 15;
      const lineGap = 2;
      const halfH = (fontH1 + fontH2 + lineGap) / 2;

      dc.font = 'bold 11px -apple-system, sans-serif';
      const textW1 = dc.measureText('START').width;
      dc.font = 'bold 15px -apple-system, sans-serif';
      const textW2 = dc.measureText(startDistStr).width;
      const halfW = Math.max(textW1, textW2) / 2;

      const textRadialSpan = Math.abs(trx) * halfW + Math.abs(tryVec) * halfH;
      const gap = 8;
      const arrowInnerR = arrowTipR - arrowLen;
      const lblR = arrowInnerR - gap - textRadialSpan;

      const lblBaseX = cx + trx * lblR;
      const lblBaseY = cy + tryVec * lblR;
      const line1Y = lblBaseY - halfH + fontH1 / 2;
      const line2Y = lblBaseY + halfH - fontH2 / 2;

      dc.textAlign = 'center';
      dc.textBaseline = 'middle';

      dc.fillStyle = palette.runnerLime;
      dc.font = 'bold 11px -apple-system, sans-serif';
      dc.fillText('START', lblBaseX, line1Y);

      dc.fillStyle = '#ffffff';
      dc.font = 'bold 15px -apple-system, sans-serif';
      dc.fillText(startDistStr, lblBaseX, line2Y);
    } else {
      dc.fillStyle = '#eab308';
      dc.font = 'bold 12px -apple-system, sans-serif';
      dc.textAlign = 'center';
      dc.textBaseline = 'middle';
      dc.fillText('WAITING FOR GPS...', cx, Math.round(h * 0.85));
    }

    dc.restore();
  }
}
