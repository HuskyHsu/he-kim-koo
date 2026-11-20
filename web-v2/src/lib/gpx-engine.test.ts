import { describe, expect, it } from 'vitest';
import type { LatLon } from '../types/route';
import {
  buildRouteGeoJson,
  calcDistanceMeters,
  cleanCornerKnots,
  decodeGooglePolyline,
  encodeGooglePolyline,
  getOrderedPoints,
  smartSimplifyRoute,
} from './gpx-engine';

describe('gpx-engine', () => {
  it('smartSimplifyRoute preserves sharp North-South 90-deg corner anchor', () => {
    const points: LatLon[] = [];
    const cornerLat = 25.0;
    const cornerLon = 121.5 + 80 * 0.0001;

    for (let i = 0; i < 80; i++) {
      points.push({ lat: cornerLat, lon: 121.5 + i * 0.0001 });
    }
    points.push({ lat: cornerLat, lon: cornerLon });
    for (let i = 1; i <= 80; i++) {
      points.push({ lat: cornerLat + i * 0.0001, lon: cornerLon });
    }

    const simplified = smartSimplifyRoute(points, 10, 40);
    expect(simplified.length).toBeLessThanOrEqual(40);
    expect(simplified.length).toBeGreaterThanOrEqual(3);

    const hasCorner = simplified.some(
      (p) => Math.abs(p.lat - cornerLat) < 1e-7 && Math.abs(p.lon - cornerLon) < 1e-7
    );
    expect(hasCorner).toBe(true);
  });

  it('smartSimplifyRoute preserves 180-deg North-South hairpin U-turn', () => {
    const points: LatLon[] = [];
    const apexLat = 25.0 + 80 * 0.0001;
    const lon = 121.5;

    for (let i = 0; i < 80; i++) {
      points.push({ lat: 25.0 + i * 0.0001, lon });
    }
    points.push({ lat: apexLat, lon });
    for (let i = 1; i <= 80; i++) {
      points.push({ lat: apexLat - i * 0.0001, lon: lon + 0.00005 });
    }

    const simplified = smartSimplifyRoute(points, 10, 40);
    const hasApex = simplified.some(
      (p) => Math.abs(p.lat - apexLat) < 1e-7 && Math.abs(p.lon - lon) < 1e-7
    );
    expect(hasApex).toBe(true);
  });

  it('encodeGooglePolyline avoids backslash for Garmin Connect Mobile safety', () => {
    const points: LatLon[] = [
      { lat: 25.0, lon: 121.5 },
      { lat: 25.00029, lon: 121.50029 },
      { lat: 25.001, lon: 121.501 },
    ];
    const encoded = encodeGooglePolyline(points);
    expect(encoded.includes('\\')).toBe(false);

    const decoded = decodeGooglePolyline(encoded);
    expect(decoded.length).toBe(points.length);
    for (let i = 0; i < points.length; i++) {
      expect(calcDistanceMeters(points[i], decoded[i])).toBeLessThan(5.0);
    }
  });

  it('cleanCornerKnots smooths a 3-left-turn corner knot into a single right turn', () => {
    const baseLat = 25.0;
    const baseLon = 121.5;
    const mLat = 1 / 111132.9;
    const mLon = 1 / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
    const pt = (xM: number, yM: number): LatLon => ({
      lat: baseLat + yM * mLat,
      lon: baseLon + xM * mLon,
    });

    const points: LatLon[] = [
      pt(0, 0),
      pt(0, 50),
      pt(5, 58),
      pt(-6, 62),
      pt(-4, 52),
      pt(10, 50),
      pt(60, 50),
    ];

    const cleaned = cleanCornerKnots(points);
    expect(cleaned.length).toBe(4);
    expect(cleaned[1].lat).toBe(points[1].lat);
    expect(cleaned[2].lon).toBe(points[5].lon);
  });

  it('cleanCornerKnots removes 2-segment corner overshoot spikes (dino.gpx pattern)', () => {
    const baseLat = 25.0;
    const baseLon = 121.5;
    const mLat = 1 / 111132.9;
    const mLon = 1 / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
    const pt = (xM: number, yM: number): LatLon => ({
      lat: baseLat + yM * mLat,
      lon: baseLon + xM * mLon,
    });

    const points: LatLon[] = [
      pt(0, 0),
      pt(0, 50),
      pt(-2, 56),
      pt(0, 50),
      pt(-50, 50),
    ];

    const cleaned = cleanCornerKnots(points);
    expect(cleaned.length).toBe(3);
    expect(Math.abs(cleaned[1].lat - points[1].lat)).toBeLessThan(1e-7);
    expect(Math.abs(cleaned[2].lon - points[4].lon)).toBeLessThan(1e-7);
  });

  it('smartSimplifyRoute enforces maxPoints cap and preserves start/end on large curves', () => {
    const points: LatLon[] = [];
    for (let i = 0; i < 400; i++) {
      const theta = (i / 399) * Math.PI * 2;
      points.push({
        lat: 25.0 + 0.01 * Math.sin(theta),
        lon: 121.5 + 0.01 * Math.cos(theta),
      });
    }

    const simplified = smartSimplifyRoute(points, 100, 150);
    expect(simplified.length).toBeLessThanOrEqual(150);
    expect(simplified.length).toBeGreaterThanOrEqual(100);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it('smartSimplifyRoute handles short or empty inputs safely', () => {
    expect(smartSimplifyRoute([], 10, 150)).toEqual([]);
    const twoPts: LatLon[] = [
      { lat: 25.0, lon: 121.5 },
      { lat: 25.001, lon: 121.501 },
    ];
    expect(smartSimplifyRoute(twoPts, 10, 150)).toEqual(twoPts);
  });

  it('encode/decode roundtrip supports negative coordinates and escaped backslashes', () => {
    const southernWestern: LatLon[] = [
      { lat: -33.8688, lon: 151.2093 },
      { lat: -33.8695, lon: 151.2102 },
      { lat: 40.7128, lon: -74.006 },
    ];
    const encoded = encodeGooglePolyline(southernWestern);
    expect(encoded.includes('\\')).toBe(false);

    const decoded = decodeGooglePolyline(`  "${encoded}"  `);
    expect(decoded.length).toBe(southernWestern.length);
    for (let i = 0; i < southernWestern.length; i++) {
      expect(calcDistanceMeters(southernWestern[i], decoded[i])).toBeLessThan(5.0);
    }

    expect(decodeGooglePolyline('')).toEqual([]);
    expect(decodeGooglePolyline(null as unknown as string)).toEqual([]);
  });

  it('cleanCornerKnots preserves legitimate wide hairpin turns (> maxSpanMeters)', () => {
    const baseLat = 25.0;
    const baseLon = 121.5;
    const mLat = 1 / 111132.9;
    const mLon = 1 / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
    const pt = (xM: number, yM: number): LatLon => ({
      lat: baseLat + yM * mLat,
      lon: baseLon + xM * mLon,
    });

    const points: LatLon[] = [
      pt(0, 0),
      pt(0, 100),
      pt(60, 140),
      pt(120, 100),
      pt(120, 0),
    ];

    const cleaned = cleanCornerKnots(points);
    expect(cleaned.length).toBe(points.length);
  });

  it('getOrderedPoints bakes reverse direction into polyline roundtrip without mutating input', () => {
    const original: LatLon[] = [
      { lat: 25.01, lon: 121.51 },
      { lat: 25.015, lon: 121.515 },
      { lat: 25.02, lon: 121.52 },
    ];

    const forward = getOrderedPoints(original, 0);
    const reversed = getOrderedPoints(original, 1);

    // Original must not be mutated
    expect(original[0]).toEqual({ lat: 25.01, lon: 121.51 });
    expect(forward).toEqual(original);
    expect(reversed).toEqual([original[2], original[1], original[0]]);

    // Encoding reversed points produces a polyline whose decoded order starts at original end
    const encodedRev = encodeGooglePolyline(reversed);
    expect(encodedRev.includes('\\')).toBe(false);
    const decodedRev = decodeGooglePolyline(encodedRev);
    expect(decodedRev.length).toBe(original.length);
    expect(calcDistanceMeters(decodedRev[0], original[2])).toBeLessThan(5.0);
    expect(calcDistanceMeters(decodedRev[2], original[0])).toBeLessThan(5.0);

    // GeoJSON start/end and arrow bearings flip on reverse
    const geoFwd = buildRouteGeoJson(original, original, 0);
    const geoRev = buildRouteGeoJson(original, original, 1);
    expect(geoFwd.startPoint.features[0].geometry.coordinates).toEqual([121.51, 25.01]);
    expect(geoRev.startPoint.features[0].geometry.coordinates).toEqual([121.52, 25.02]);
    expect(geoFwd.directionArrows.features.length).toBeGreaterThan(0);
    expect(geoRev.directionArrows.features.length).toBe(geoFwd.directionArrows.features.length);
    const bearingDelta =
      (geoRev.directionArrows.features[0].properties.bearing -
        geoFwd.directionArrows.features[0].properties.bearing +
        360) %
      360;
    expect(Math.abs(bearingDelta - 180)).toBeLessThan(2);
  });
});
