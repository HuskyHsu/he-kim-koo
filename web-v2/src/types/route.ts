export interface LatLon {
  lat: number;
  lon: number;
}

export interface WatchLayoutOption {
  label: string;
  height: number;
}

export interface WatchProfile {
  id: string;
  name: string;
  series: string;
  status: 'active' | 'preview';
  screenSize: number; // e.g., 416, 454, 260
  shape: 'round';
  displayType: 'AMOLED' | 'MIP';
  maxPoints: number; // e.g., 130
  layouts: WatchLayoutOption[];
}

export interface WatchSettings {
  routeDirection: 0 | 1; // 0 = Forward, 1 = Reverse
  mapRange: number; // 50..1000
  showDirection: boolean;
  dimCompletedPath: boolean;
  showCornerAnchors: boolean;
  showTurnCue: boolean;
  showProgress: boolean;
  enableVibration: boolean;
}

export interface SimDebugOptions {
  speed: 1 | 5 | 10;
  headingOffsetDeg: number; // 0..360
  distanceToStartMeters: number; // 0..3000
  deviateMeters: number; // 0 or 45
  layoutHeight: number; // from active profile.layouts
}

export interface RouteData {
  id: string;
  name: string;
  source: 'sample' | 'gpx' | 'polyline' | 'none';
  isNoRoute?: boolean;
  origPoints: LatLon[];
  simpPoints: LatLon[];
  distanceMeters: number;
}

export const DEFAULT_WATCH_SETTINGS: WatchSettings = {
  routeDirection: 0,
  mapRange: 175,
  showDirection: true,
  dimCompletedPath: true,
  showCornerAnchors: true,
  showTurnCue: true,
  showProgress: true,
  enableVibration: true,
};

export const DEFAULT_SIM_DEBUG: SimDebugOptions = {
  speed: 5,
  headingOffsetDeg: 0,
  distanceToStartMeters: 0,
  deviateMeters: 0,
  layoutHeight: 416,
};
