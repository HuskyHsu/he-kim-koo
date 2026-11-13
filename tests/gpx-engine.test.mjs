import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  calcDistanceMeters,
  cleanCornerKnots,
  smartSimplifyRoute,
  encodeGooglePolyline,
  decodeGooglePolyline,
} = require('../web/js/gpx-engine.js');

test('smartSimplifyRoute preserves sharp North-South 90-deg corner anchor', () => {
  const points = [];
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
  assert.ok(simplified.length <= 40, `Expected <= 40 points, got ${simplified.length}`);
  assert.ok(simplified.length >= 3, 'Should keep at least start, corner, end');

  const hasCorner = simplified.some(
    (p) => Math.abs(p.lat - cornerLat) < 1e-7 && Math.abs(p.lon - cornerLon) < 1e-7
  );
  assert.ok(hasCorner, 'Sharp 90-degree corner anchor must be preserved');
});

test('smartSimplifyRoute preserves 180-deg North-South hairpin U-turn', () => {
  const points = [];
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
  assert.ok(hasApex, '180-deg North-South hairpin apex must be preserved');
});

test('encodeGooglePolyline avoids backslash for Garmin Connect Mobile safety', () => {
  const points = [
    { lat: 25.0, lon: 121.5 },
    { lat: 25.00029, lon: 121.50029 },
    { lat: 25.001, lon: 121.501 },
  ];
  const encoded = encodeGooglePolyline(points);
  assert.ok(!encoded.includes('\\'), `Encoded string must not contain backslash: ${encoded}`);

  const decoded = decodeGooglePolyline(encoded);
  assert.equal(decoded.length, points.length);
  for (let i = 0; i < points.length; i++) {
    assert.ok(calcDistanceMeters(points[i], decoded[i]) < 5.0);
  }
});

test('cleanCornerKnots smooths a 3-left-turn corner knot into a single right turn', () => {
  const baseLat = 25.0;
  const baseLon = 121.5;
  const mLat = 1 / 111132.9;
  const mLon = 1 / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
  const pt = (xM, yM) => ({ lat: baseLat + yM * mLat, lon: baseLon + xM * mLon });

  const points = [
    pt(0, 0),
    pt(0, 50),
    pt(5, 58),
    pt(-6, 62),
    pt(-4, 52),
    pt(10, 50),
    pt(60, 50),
  ];

  const cleaned = cleanCornerKnots(points);
  assert.equal(cleaned.length, 4);
  assert.ok(cleaned[1].lat === points[1].lat);
  assert.ok(cleaned[2].lon === points[5].lon);
});

test('cleanCornerKnots removes 2-segment corner overshoot spikes (dino.gpx pattern)', () => {
  const baseLat = 25.0;
  const baseLon = 121.5;
  const mLat = 1 / 111132.9;
  const mLon = 1 / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
  const pt = (xM, yM) => ({ lat: baseLat + yM * mLat, lon: baseLon + xM * mLon });

  const points = [
    pt(0, 0),
    pt(0, 50),
    pt(-2, 56),
    pt(0, 50),
    pt(-50, 50),
  ];

  const cleaned = cleanCornerKnots(points);
  assert.equal(cleaned.length, 3);
  assert.ok(Math.abs(cleaned[1].lat - points[1].lat) < 1e-7);
  assert.ok(Math.abs(cleaned[2].lon - points[4].lon) < 1e-7);
});

test('smartSimplifyRoute enforces maxPoints cap and preserves start/end on large curves', () => {
  const points = [];
  for (let i = 0; i < 400; i++) {
    const theta = (i / 399) * Math.PI * 2;
    points.push({
      lat: 25.0 + 0.01 * Math.sin(theta),
      lon: 121.5 + 0.01 * Math.cos(theta),
    });
  }

  const simplified = smartSimplifyRoute(points, 100, 150);
  assert.ok(simplified.length <= 150, `Expected <= 150 points, got ${simplified.length}`);
  assert.ok(simplified.length >= 100, `Expected >= 100 curve resolution, got ${simplified.length}`);
  assert.deepEqual(simplified[0], points[0]);
  assert.deepEqual(simplified[simplified.length - 1], points[points.length - 1]);
});

test('smartSimplifyRoute handles short or empty inputs safely', () => {
  assert.deepEqual(smartSimplifyRoute([], 10, 150), []);
  const twoPts = [
    { lat: 25.0, lon: 121.5 },
    { lat: 25.001, lon: 121.501 },
  ];
  assert.deepEqual(smartSimplifyRoute(twoPts, 10, 150), twoPts);
});

test('encode/decode roundtrip supports negative coordinates and escaped backslashes', () => {
  const southernWestern = [
    { lat: -33.8688, lon: 151.2093 },
    { lat: -33.8695, lon: 151.2102 },
    { lat: 40.7128, lon: -74.006 },
  ];
  const encoded = encodeGooglePolyline(southernWestern);
  assert.ok(!encoded.includes('\\'));

  const decoded = decodeGooglePolyline(`  "${encoded}"  `);
  assert.equal(decoded.length, southernWestern.length);
  for (let i = 0; i < southernWestern.length; i++) {
    assert.ok(calcDistanceMeters(southernWestern[i], decoded[i]) < 5.0);
  }

  assert.deepEqual(decodeGooglePolyline(''), []);
  assert.deepEqual(decodeGooglePolyline(null), []);
});

test('cleanCornerKnots preserves legitimate wide hairpin turns (> maxSpanMeters)', () => {
  const baseLat = 25.0;
  const baseLon = 121.5;
  const mLat = 1 / 111132.9;
  const mLon = 1 / (111319.5 * Math.cos((baseLat * Math.PI) / 180));
  const pt = (xM, yM) => ({ lat: baseLat + yM * mLat, lon: baseLon + xM * mLon });

  const points = [
    pt(0, 0),
    pt(0, 100),
    pt(60, 140),
    pt(120, 100),
    pt(120, 0),
  ];

  const cleaned = cleanCornerKnots(points);
  assert.equal(cleaned.length, points.length);
});
