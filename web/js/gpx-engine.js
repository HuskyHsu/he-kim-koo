// =============================================================================
// He-Kim-Koo GPX Engine & Simplification Algorithms
// =============================================================================

/**
 * Calculates Haversine distance in meters between two coordinates.
 */
function calcDistanceMeters(p1, p2) {
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
 * Removes GPS micro-jitter (<4m clusters) and tiny corner knots/pigtails
 * (e.g. a small loop at a corner causing 3 left turns instead of 1 right turn),
 * while preserving genuine 180-degree out-and-back hairpin turns.
 */
function cleanCornerKnots(points, minStepMeters = 4.0, maxLoopMeters = 55.0, maxChordMeters = 14.0) {
  if (!points || points.length < 4) return points;

  // 1. Remove sub-4m GPS cluster jitter (always keep start & end)
  const decimated = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (calcDistanceMeters(decimated[decimated.length - 1], points[i]) >= minStepMeters) {
      decimated.push(points[i]);
    }
  }
  decimated.push(points[points.length - 1]);

  if (decimated.length < 4) return decimated;

  // 2. Collapse small corner knots/loops where path detours <= 55m and returns within 14m
  const cleaned = [];
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
 * Smart simplification preserving sharp corner anchors (>42 deg)
 * and iteratively targeting 100~130 points for Garmin memory bounds.
 */
function smartSimplifyRoute(points, minTarget = 100, maxTarget = 130) {
  points = cleanCornerKnots(points);
  if (points.length <= maxTarget) return points;

  const anchors = new Set([0, points.length - 1]);
  for (let i = 1; i < points.length - 1; i++) {
    const cosLat = Math.cos((points[i].lat * Math.PI) / 180);
    const v1 = {
      x: (points[i].lon - points[i - 1].lon) * cosLat,
      y: points[i].lat - points[i - 1].lat,
    };
    const v2 = {
      x: (points[i + 1].lon - points[i].lon) * cosLat,
      y: points[i + 1].lat - points[i].lat,
    };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
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
  let bestResult = points;

  for (let iter = 0; iter < 18; iter++) {
    const mid = (low + high) / 2;
    const res = rdpWithAnchors(
      points,
      Array.from(anchors).sort((a, b) => a - b),
      mid
    );
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

function rdpWithAnchors(points, anchorIndices, epsilonMeters) {
  const keptIndices = new Set(anchorIndices);

  for (let i = 0; i < anchorIndices.length - 1; i++) {
    const startIdx = anchorIndices[i];
    const endIdx = anchorIndices[i + 1];
    if (endIdx - startIdx > 1) {
      simplifySegment(points, startIdx, endIdx, epsilonMeters, keptIndices);
    }
  }

  const sorted = Array.from(keptIndices).sort((a, b) => a - b);
  return sorted.map((idx) => points[idx]);
}

function simplifySegment(points, start, end, epsilon, kept) {
  let maxDist = 0;
  let maxIndex = start;
  const pStart = points[start];
  const pEnd = points[end];

  for (let i = start + 1; i < end; i++) {
    const d = pointToSegmentDistanceMeters(points[i], pStart, pEnd);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    kept.add(maxIndex);
    simplifySegment(points, start, maxIndex, epsilon, kept);
    simplifySegment(points, maxIndex, end, epsilon, kept);
  }
}

function pointToSegmentDistanceMeters(p, a, b) {
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
 * Encodes GPS coordinates into standard Google Polyline format.
 * Includes Garmin-Safe Encoding: Automatically nudges delta by ~1 meter if it
 * would produce a backslash ('\'), preventing Garmin Connect Mobile JSON save errors.
 */
function encodeGooglePolyline(points) {
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

function encodeSignedGarminSafe(d) {
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

function encodeSigned(num) {
  let sgnNum = num < 0 ? ~(num << 1) : num << 1;
  let str = '';
  while (sgnNum >= 0x20) {
    str += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>= 5;
  }
  str += String.fromCharCode(sgnNum + 63);
  return str;
}

/**
 * Decodes standard Google Encoded Polyline string into an array of {lat, lon} points.
 */
function decodeGooglePolyline(str) {
  if (!str || typeof str !== 'string') return [];
  let s = str.trim().replace(/^["']|["']$/g, '');
  if (s.includes('\\\\')) {
    s = s.replace(/\\\\/g, '\\');
  }

  const points = [];
  let index = 0;
  const len = s.length;
  let lat = 0;
  let lon = 0;

  while (index < len) {
    let b;
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
 * Quickly extracts point count and total distance from a GPX XML string.
 */
function extractGpxSummary(xmlText) {
  if (!xmlText) return null;
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const trkpts = xmlDoc.querySelectorAll('trkpt, rtept');
    if (trkpts.length < 2) return null;

    let totalMeters = 0;
    let prev = null;
    for (let i = 0; i < trkpts.length; i++) {
      const lat = parseFloat(trkpts[i].getAttribute('lat'));
      const lon = parseFloat(trkpts[i].getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) {
        const pt = { lat, lon };
        if (prev) totalMeters += calcDistanceMeters(prev, pt);
        prev = pt;
      }
    }
    const km = totalMeters / 1000;
    return {
      points: trkpts.length,
      distMeters: totalMeters,
      distLabel: km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(totalMeters)} m`,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Parses GPX XML string into an array of {lat, lon} points.
 */
function parseGpx(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const points = [];
  const trkpts = xmlDoc.querySelectorAll('trkpt, rtept');
  for (let i = 0; i < trkpts.length; i++) {
    const lat = parseFloat(trkpts[i].getAttribute('lat'));
    const lon = parseFloat(trkpts[i].getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lon)) {
      points.push({ lat, lon });
    }
  }
  return points;
}

const gpxEngineExports = {
  calcDistanceMeters,
  cleanCornerKnots,
  smartSimplifyRoute,
  rdpWithAnchors,
  simplifySegment,
  pointToSegmentDistanceMeters,
  encodeGooglePolyline,
  decodeGooglePolyline,
  encodeSigned,
  extractGpxSummary,
  parseGpx,
};

if (typeof window !== 'undefined') {
  window.GpxEngine = gpxEngineExports;
  window.calcDistanceMeters = calcDistanceMeters;
  window.cleanCornerKnots = cleanCornerKnots;
  window.smartSimplifyRoute = smartSimplifyRoute;
  window.rdpWithAnchors = rdpWithAnchors;
  window.simplifySegment = simplifySegment;
  window.pointToSegmentDistanceMeters = pointToSegmentDistanceMeters;
  window.encodeGooglePolyline = encodeGooglePolyline;
  window.decodeGooglePolyline = decodeGooglePolyline;
  window.encodeSigned = encodeSigned;
  window.extractGpxSummary = extractGpxSummary;
  window.parseGpx = parseGpx;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = gpxEngineExports;
}

