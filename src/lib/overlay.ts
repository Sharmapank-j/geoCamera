// src/lib/overlay.ts
// Renders a GPS-camera style overlay onto an image entirely client-side (Canvas API).
// Works 100% offline — no network calls.

export interface OverlayMeta {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  capturedAt?: string; // ISO string
  address?: string;
}

export async function generateOverlay(
  imageBlob: Blob,
  meta: OverlayMeta
): Promise<Blob> {
  const img = await createImageBitmap(imageBlob);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // 1. Draw original photo
  ctx.drawImage(img, 0, 0);
  img.close();

  // 2. Compute panel metrics
  const panelH = Math.round(canvas.height * 0.22);
  const panelY = canvas.height - panelH;
  const fontSize = Math.max(14, Math.round(canvas.width / 55));
  const lineH = Math.round(fontSize * 1.55);
  const pad = Math.round(fontSize * 0.75);

  // 3. Dark translucent panel
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, panelY, canvas.width, panelH);

  // Subtle top border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, panelY);
  ctx.lineTo(canvas.width, panelY);
  ctx.stroke();

  // 4. Mini-map placeholder (right side)
  const mapSize = panelH - pad * 2;
  const mapX = canvas.width - mapSize - pad;
  const mapY = panelY + pad;
  // Map background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(mapX, mapY, mapSize, mapSize);
  // Subtle grid
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1;
  const gridStep = mapSize / 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(mapX + i * gridStep, mapY);
    ctx.lineTo(mapX + i * gridStep, mapY + mapSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mapX, mapY + i * gridStep);
    ctx.lineTo(mapX + mapSize, mapY + i * gridStep);
    ctx.stroke();
  }
  // Crosshair
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mapX + mapSize / 2, mapY);
  ctx.lineTo(mapX + mapSize / 2, mapY + mapSize);
  ctx.moveTo(mapX, mapY + mapSize / 2);
  ctx.lineTo(mapX + mapSize, mapY + mapSize / 2);
  ctx.stroke();
  // Location pulse ring
  const cx = mapX + mapSize / 2;
  const cy = mapY + mapSize / 2;
  ctx.strokeStyle = 'rgba(239,68,68,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, mapSize * 0.18, 0, Math.PI * 2);
  ctx.stroke();
  // Location dot
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx, cy, mapSize * 0.08, 0, Math.PI * 2);
  ctx.fill();
  // "GPS" label
  const smallFont = Math.max(9, Math.round(fontSize * 0.65));
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${smallFont}px sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText('GPS', mapX + 3, mapY + mapSize - 2);

  // 5. Text content (left side, stops before map)
  const textMaxW = mapX - pad * 2;
  ctx.font = `bold ${Math.round(fontSize * 1.1)}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('📍 GeoTag Camera', pad, panelY + pad);

  ctx.font = `${fontSize}px sans-serif`;
  let y = panelY + pad + lineH;

  const drawLine = (text: string, color = '#e2e8f0') => {
    if (!text) return;
    ctx.fillStyle = color;
    // Truncate if too wide
    let txt = text;
    while (ctx.measureText(txt).width > textMaxW && txt.length > 8) {
      txt = txt.slice(0, -1);
    }
    if (txt !== text) txt += '…';
    ctx.fillText(txt, pad, y);
    y += lineH;
  };

  if (meta.address) drawLine(meta.address, '#93c5fd');

  if (meta.latitude !== undefined && meta.longitude !== undefined) {
    drawLine(`Lat  ${meta.latitude.toFixed(6)}°`, '#86efac');
    drawLine(`Lng  ${meta.longitude.toFixed(6)}°`, '#86efac');
  }

  if (meta.accuracy !== undefined) {
    drawLine(`Acc  ±${meta.accuracy.toFixed(1)} m`, '#fde68a');
  }

  if (meta.capturedAt) {
    const d = new Date(meta.capturedAt);
    drawLine(`Date ${d.toLocaleDateString()}`, '#e2e8f0');
    drawLine(`Time ${d.toLocaleTimeString()}`, '#e2e8f0');
  }

  // 6. Return as JPEG blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      0.93
    );
  });
}
