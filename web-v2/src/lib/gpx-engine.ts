// =============================================================================
// He-Kim-Koo GPX Engine & Simplification Algorithms (TypeScript v2)
// =============================================================================

import type { LatLon } from '../types/route';

export type GeoJsonPosition = [number, number];

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: GeoJsonPosition[];
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: GeoJsonPosition;
}

export interface GeoJsonFeature<
  G extends GeoJsonLineString | GeoJsonPoint,
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface GeoJsonFeatureCollection<
  G extends GeoJsonLineString | GeoJsonPoint,
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'FeatureCollection';
  features: Array<GeoJsonFeature<G, P>>;
}

export interface RouteEndpointProperties {
  role: 'start' | 'end';
  [key: string]: unknown;
}

export interface DirectionArrowProperties {
  bearing: number;
  index: number;
  [key: string]: unknown;
}

export interface RouteGeoJson {
  rawLine: GeoJsonFeatureCollection<GeoJsonLineString>;
  simpLine: GeoJsonFeatureCollection<GeoJsonLineString>;
  startPoint: GeoJsonFeatureCollection<GeoJsonPoint, RouteEndpointProperties>;
  endPoint: GeoJsonFeatureCollection<GeoJsonPoint, RouteEndpointProperties>;
  directionArrows: GeoJsonFeatureCollection<GeoJsonPoint, DirectionArrowProperties>;
}

/**
 * Calculates Haversine distance in meters between two coordinates.
 */
export function calcDistanceMeters(p1: LatLon, p2: LatLon): number {
  const R = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates total path distance in meters along an ordered sequence of points.
 */
export function calcTotalDistanceMeters(points: LatLon[]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calcDistanceMeters(points[i], points[i + 1]);
  }
  return total;
}

/**
 * Removes GPS micro-jitter (<4m clusters) and tiny corner knots/pigtails
 * (e.g. a small loop at a corner causing 3 left turns instead of 1 right turn),
 * while preserving genuine 180-degree out-and-back hairpin turns.
 */
export function cleanCornerKnots(
  points: LatLon[],
  minStepMeters = 4.0,
  maxLoopMeters = 55.0,
  maxChordMeters = 14.0
): LatLon[] {
  if (!points || points.length < 4) return points ? points.slice() : [];

  // 1. Remove sub-4m GPS cluster jitter (always keep start & end)
  const decimated: LatLon[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (calcDistanceMeters(decimated[decimated.length - 1], points[i]) >= minStepMeters) {
      decimated.push(points[i]);
    }
  }
  decimated.push(points[points.length - 1]);

  if (decimated.length < 4) return decimated;

  // 2. Collapse small corner knots/loops where path detours <= 55m and returns within 14m
  const cleaned: LatLon[] = [];
  let i = 0;
  const n = decimated.length;

  while (i < n) {
    cleaned.push(decimated[i]);
    if (i >= n - 3) {
      i++;
      continue;
    }

    let arcLen = 0;
    let bestJump = -1;
    const maxJ = Math.min(n - 1, i + 16);

    for (let j = i + 1; j <= maxJ; j++) {
      arcLen += calcDistanceMeters(decimated[j - 1], decimated[j]);
      if (arcLen > maxLoopMeters) break;

      if (j === i + 2) {
        // 2-segment out-and-back overshoot spike at a corner (e.g. <= 15m spur)
        const chordDist = calcDistanceMeters(decimated[i], decimated[j]);
        if (arcLen <= 30.0 && chordDist <= 6.0 && arcLen >= Math.max(6.0, chordDist * 2.5)) {
          let isHairpin = false;
          if (chordDist > 1.5 && i > 0 && j < n - 1) {
            const cosLat = Math.cos((decimated[i].lat * Math.PI) / 180);
            const inX = (decimated[i].lon - decimated[i - 1].lon) * cosLat;
            const inY = decimated[i].lat - decimated[i - 1].lat;
            const outX = (decimated[j + 1].lon - decimated[j].lon) * cosLat;
            const outY = decimated[j + 1].lat - decimated[j].lat;
            const inMag = Math.hypot(inX, inY);
            const outMag = Math.hypot(outX, outY);
            if (inMag > 0 && outMag > 0 && (inX * outX + inY * outY) / (inMag * outMag) < -0.75) {
              isHairpin = true;
            }
          }
          if (!isHairpin) {
            bestJump = chordDist < 2.0 && j + 1 < n ? j + 1 : j;
          }
        }
      } else if (j >= i + 3) {
        const chordDist = calcDistanceMeters(decimated[i], decimated[j]);
        if (chordDist <= maxChordMeters && arcLen >= Math.max(15.0, chordDist * 2.2)) {
          // Protect genuine 180-deg out-and-back hairpins
          let isHairpin = false;
          if (i > 0 && j < n - 1) {
            const cosLat = Math.cos((decimated[i].lat * Math.PI) / 180);
            const inX = (decimated[i].lon - decimated[i - 1].lon) * cosLat;
            const inY = decimated[i].lat - decimated[i - 1].lat;
            const outX = (decimated[j + 1].lon - decimated[j].lon) * cosLat;
            const outY = decimated[j + 1].lat - decimated[j].lat;
            const inMag = Math.hypot(inX, inY);
            const outMag = Math.hypot(outX, outY);
            if (inMag > 0 && outMag > 0) {
              const dot = (inX * outX + inY * outY) / (inMag * outMag);
              if (dot < -0.75) {
                isHairpin = true;
              }
            }
          }

          if (!isHairpin) {
            bestJump = chordDist < 2.0 && j + 1 < n ? j + 1 : j;
          }
        }
      }
    }

    i = bestJump !== -1 ? bestJump : i + 1;
  }

  return cleaned;
}

/**
 * Perpendicular distance in meters from point `p` to segment `a`–`b`.
 */
export function pointToSegmentDistanceMeters(p: LatLon, a: LatLon, b: LatLon): number {
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lon * 111319.5 * cosLat;
  const ay = a.lat * 111132.9;
  const bx = b.lon * 111319.5 * cosLat;
  const by = b.lat * 111132.9;
  const px = p.lon * 111319.5 * cosLat;
  const py = p.lat * 111132.9;

  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Ramer-Douglas-Peucker simplification on a contiguous segment of points.
 */
export function simplifySegment(segment: LatLon[], epsilonMeters: number): LatLon[] {
  if (segment.length <= 2) return segment.slice();

  let maxDist = 0;
  let maxIndex = 0;
  const pStart = segment[0];
  const pEnd = segment[segment.length - 1];

  for (let i = 1; i < segment.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(segment[i], pStart, pEnd);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }

  if (maxDist > epsilonMeters) {
    const left = simplifySegment(segment.slice(0, maxIndex + 1), epsilonMeters);
    const right = simplifySegment(segment.slice(maxIndex), epsilonMeters);
    return [...left.slice(0, -1), ...right];
  }

  return [pStart, pEnd];
}

/**
 * Runs Ramer-Douglas-Peucker simplification between mandatory anchor indices.
 */
export function rdpWithAnchors(
  points: LatLon[],
  epsilonMeters: number,
  anchors: Set<number>
): LatLon[] {
  if (points.length <= 2) return points.slice();

  const validAnchors = new Set<number>([0, points.length - 1]);
  anchors.forEach((idx) => {
    if (idx >= 0 && idx < points.length) {
      validAnchors.add(idx);
    }
  });
  const anchorIndices = Array.from(validAnchors).sort((a, b) => a - b);

  const result: LatLon[] = [];
  for (let i = 0; i < anchorIndices.length - 1; i++) {
    const startIdx = anchorIndices[i];
    const endIdx = anchorIndices[i + 1];
    if (endIdx - startIdx > 1) {
      const simplified = simplifySegment(points.slice(startIdx, endIdx + 1), epsilonMeters);
      for (let k = 0; k < simplified.length - 1; k++) {
        result.push(simplified[k]);
      }
    } else {
      result.push(points[startIdx]);
    }
  }
  result.push(points[anchorIndices[anchorIndices.length - 1]]);

  return result;
}

/**
 * Smart simplification preserving sharp corner anchors (>42 deg)
 * and iteratively targeting 100~130 points for Garmin memory bounds.
 */
export function smartSimplifyRoute(
  points: LatLon[],
  minTarget = 100,
  maxTarget = 130
): LatLon[] {
  const cleaned = cleanCornerKnots(points);
  if (cleaned.length <= maxTarget) return cleaned;

  const anchors = new Set<number>([0, cleaned.length - 1]);
  for (let i = 1; i < cleaned.length - 1; i++) {
    const cosLat = Math.cos((cleaned[i].lat * Math.PI) / 180);
    const v1x = (cleaned[i].lon - cleaned[i - 1].lon) * cosLat;
    const v1y = cleaned[i].lat - cleaned[i - 1].lat;
    const v2x = (cleaned[i + 1].lon - cleaned[i].lon) * cosLat;
    const v2y = cleaned[i + 1].lat - cleaned[i].lat;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (mag1 > 0 && mag2 > 0) {
      const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
      const angleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
      if (angleDeg > 42) {
        anchors.add(i);
      }
    }
  }

  let low = 0.5;
  let high = 500.0;
  let bestResult = cleaned;

  for (let iter = 0; iter < 18; iter++) {
    const mid = (low + high) / 2;
    const res = rdpWithAnchors(cleaned, mid, anchors);
    bestResult = res;

    if (res.length > maxTarget) {
      low = mid;
    } else if (res.length < minTarget) {
      high = mid;
    } else {
      break;
    }
  }

  return bestResult;
}

function encodeSigned(num: number): string {
  let sgnNum = num < 0 ? ~(num << 1) : num << 1;
  let str = '';
  while (sgnNum >= 0x20) {
    str += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>= 5;
  }
  str += String.fromCharCode(sgnNum + 63);
  return str;
}

function encodeSignedGarminSafe(d: number): { enc: string; adjustedDelta: number } {
  const enc = encodeSigned(d);
  if (!enc.includes('\\')) {
    return { enc, adjustedDelta: d };
  }
  // Nudge by smallest delta offset that avoids backslash
  for (let offset = 1; offset <= 32; offset++) {
    let testEnc = encodeSigned(d + offset);
    if (!testEnc.includes('\\')) {
      return { enc: testEnc, adjustedDelta: d + offset };
    }
    testEnc = encodeSigned(d - offset);
    if (!testEnc.includes('\\')) {
      return { enc: testEnc, adjustedDelta: d - offset };
    }
  }
  return { enc, adjustedDelta: d };
}

/**
 * Encodes GPS coordinates into standard Google Polyline format.
 * Includes Garmin-Safe Encoding: Automatically nudges delta by ~1 meter if it
 * would produce a backslash ('\'), preventing Garmin Connect Mobile JSON save errors.
 */
export function encodeGooglePolyline(points: LatLon[]): string {
  let output = '';
  let prevLat = 0;
  let prevLon = 0;

  for (let i = 0; i < points.length; i++) {
    const targetLat = Math.round(points[i].lat * 1e5);
    const targetLon = Math.round(points[i].lon * 1e5);

    const safeLat = encodeSignedGarminSafe(targetLat - prevLat);
    output += safeLat.enc;
    prevLat += safeLat.adjustedDelta;

    const safeLon = encodeSignedGarminSafe(targetLon - prevLon);
    output += safeLon.enc;
    prevLon += safeLon.adjustedDelta;
  }

  return output;
}

/**
 * Decodes standard Google Encoded Polyline string into an array of {lat, lon} points.
 */
export function decodeGooglePolyline(encoded: string): LatLon[] {
  if (!encoded || typeof encoded !== 'string') return [];
  let s = encoded.trim().replace(/^["']|["']$/g, '');
  if (s.includes('\\\\')) {
    s = s.replace(/\\\\/g, '\\');
  }

  const points: LatLon[] = [];
  let index = 0;
  const len = s.length;
  let lat = 0;
  let lon = 0;

  while (index < len) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      if (index >= len) break;
      b = s.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      if (index >= len) break;
      b = s.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlon = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lon += dlon;

    points.push({
      lat: lat / 1e5,
      lon: lon / 1e5,
    });
  }

  return points;
}

/**
 * Parses GPX XML string into an array of {lat, lon} points.
 * Uses DOMParser in browser environments with a regex fallback for Node/test runtimes.
 */
export function parseGpx(xmlText: string): LatLon[] {
  if (!xmlText || typeof xmlText !== 'string') return [];

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const points: LatLon[] = [];
    const trkpts = xmlDoc.querySelectorAll('trkpt, rtept');
    for (let i = 0; i < trkpts.length; i++) {
      const latAttr = trkpts[i].getAttribute('lat');
      const lonAttr = trkpts[i].getAttribute('lon');
      if (latAttr === null || lonAttr === null) continue;
      const lat = parseFloat(latAttr);
      const lon = parseFloat(lonAttr);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        points.push({ lat, lon });
      }
    }
    return points;
  }

  // Fallback for non-DOM environments (e.g., Node Vitest)
  const points: LatLon[] = [];
  const tagRegex = /<(?:trkpt|rtept)\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(xmlText)) !== null) {
    const attrs = match[1];
    const latMatch = /\blat\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const lonMatch = /\blon\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (latMatch && lonMatch) {
      const lat = parseFloat(latMatch[1]);
      const lon = parseFloat(lonMatch[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        points.push({ lat, lon });
      }
    }
  }
  return points;
}

/**
 * Formats distance in meters into human-readable metric string.
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Returns a copy of points ordered according to direction:
 * 0 = Forward (Start -> End), 1 = Reverse (End -> Start).
 */
export function getOrderedPoints(points: LatLon[], direction: 0 | 1): LatLon[] {
  if (!points) return [];
  return direction === 1 ? points.slice().reverse() : points.slice();
}

/**
 * Builds MapLibre-ready GeoJSON FeatureCollections for the raw GPX track,
 * simplified track, start/end markers, and evenly spaced directional arrows
 * along the ordered simplified route.
 */
export function buildRouteGeoJson(
  origPoints: LatLon[],
  simpPoints: LatLon[],
  direction: 0 | 1
): RouteGeoJson {
  const orderedOrig = getOrderedPoints(origPoints, direction);
  const orderedSimp = getOrderedPoints(simpPoints, direction);

  const rawLine: GeoJsonFeatureCollection<GeoJsonLineString> = {
    type: 'FeatureCollection',
    features:
      orderedOrig.length >= 2
        ? [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: orderedOrig.map((p) => [p.lon, p.lat]),
              },
              properties: {},
            },
          ]
        : [],
  };

  const simpLine: GeoJsonFeatureCollection<GeoJsonLineString> = {
    type: 'FeatureCollection',
    features:
      orderedSimp.length >= 2
        ? [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: orderedSimp.map((p) => [p.lon, p.lat]),
              },
              properties: {},
            },
          ]
        : [],
  };

  const startPoint: GeoJsonFeatureCollection<GeoJsonPoint, RouteEndpointProperties> = {
    type: 'FeatureCollection',
    features:
      orderedSimp.length >= 1
        ? [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [orderedSimp[0].lon, orderedSimp[0].lat],
              },
              properties: { role: 'start' },
            },
          ]
        : [],
  };

  const endPoint: GeoJsonFeatureCollection<GeoJsonPoint, RouteEndpointProperties> = {
    type: 'FeatureCollection',
    features:
      orderedSimp.length >= 2
        ? [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [
                  orderedSimp[orderedSimp.length - 1].lon,
                  orderedSimp[orderedSimp.length - 1].lat,
                ],
              },
              properties: { role: 'end' },
            },
          ]
        : [],
  };

  const arrowFeatures: Array<GeoJsonFeature<GeoJsonPoint, DirectionArrowProperties>> = [];
  if (orderedSimp.length >= 2) {
    const totalDist = calcTotalDistanceMeters(orderedSimp);
    if (totalDist > 20) {
      const arrowCount = Math.max(3, Math.min(24, Math.round(totalDist / 150)));
      const step = totalDist / (arrowCount + 1);
      let nextTarget = step;
      let accumDist = 0;
      let arrowIndex = 0;

      for (let i = 0; i < orderedSimp.length - 1 && arrowIndex < arrowCount; i++) {
        const p1 = orderedSimp[i];
        const p2 = orderedSimp[i + 1];
        const segLen = calcDistanceMeters(p1, p2);
        if (segLen < 0.1) continue;

        const cosLat = Math.cos(((p1.lat + p2.lat) * 0.5 * Math.PI) / 180);
        const dx = (p2.lon - p1.lon) * 111319.5 * cosLat;
        const dy = (p2.lat - p1.lat) * 111132.9;
        const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

        while (nextTarget <= accumDist + segLen && arrowIndex < arrowCount) {
          const t = (nextTarget - accumDist) / segLen;
          const lat = p1.lat + (p2.lat - p1.lat) * t;
          const lon = p1.lon + (p2.lon - p1.lon) * t;
          arrowFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lon, lat],
            },
            properties: {
              bearing,
              index: arrowIndex,
            },
          });
          arrowIndex++;
          nextTarget += step;
        }
        accumDist += segLen;
      }
    }
  }

  const directionArrows: GeoJsonFeatureCollection<GeoJsonPoint, DirectionArrowProperties> = {
    type: 'FeatureCollection',
    features: arrowFeatures,
  };

  return {
    rawLine,
    simpLine,
    startPoint,
    endPoint,
    directionArrows,
  };
}
