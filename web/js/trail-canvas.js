// =============================================================================
// He-Kim-Koo 2D Vector Trail Inspector Canvas (Clean Light Theme)
// =============================================================================

function renderCanvas(origPoints, simpPoints) {
  const trailCanvas = document.getElementById('trailCanvas');
  if (!origPoints || !simpPoints || !trailCanvas) return;
  const canvas = trailCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Subtle topographic grid lines in light mode
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  const gridStep = 40;
  for (let x = 0; x < rect.width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }
  for (let y = 0; y < rect.height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
  }

  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  origPoints.forEach((p) => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  });

  const padding = 28;
  const drawW = rect.width - padding * 2;
  const drawH = rect.height - padding * 2;

  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const geoW = (maxLon - minLon) * cosLat;
  const geoH = maxLat - minLat;

  const scale = Math.min(drawW / (geoW || 0.0001), drawH / (geoH || 0.0001));
  const offsetX = padding + (drawW - geoW * scale) / 2;
  const offsetY = padding + (drawH - geoH * scale) / 2;

  function toScreen(p) {
    const x = offsetX + (p.lon - minLon) * cosLat * scale;
    const y = offsetY + (maxLat - p.lat) * scale;
    return { x, y };
  }

  // 1. Original track (subtle gray)
  ctx.beginPath();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  origPoints.forEach((p, idx) => {
    const pt = toScreen(p);
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // 2. Simplified track (crisp emerald green)
  ctx.beginPath();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  simpPoints.forEach((p, idx) => {
    const pt = toScreen(p);
    if (idx === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // 3. Anchor nodes (cyan dots with white border)
  simpPoints.forEach((p, idx) => {
    if (idx !== 0 && idx !== simpPoints.length - 1) {
      const pt = toScreen(p);
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // 4. Start (green) & End (red)
  const startPt = toScreen(simpPoints[0]);
  const endPt = toScreen(simpPoints[simpPoints.length - 1]);

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(startPt.x, startPt.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(endPt.x, endPt.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

window.renderCanvas = renderCanvas;
