// src/lib/overlay.ts
// Renders a GPS-camera style overlay onto an image entirely client-side (Canvas API).
// Works 100% offline — no network calls.

export interface OverlayMeta {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  capturedAt?: string; // ISO string
  address?: string;
  style?: 'pro' | 'badge' | 'minimal';
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

  const style = meta.style || 'pro';
  const fontSize = Math.max(14, Math.round(canvas.width / 52));
  const pad = Math.round(fontSize * 0.85);

  if (style === 'minimal') {
    // ── MINIMAL STAMP STYLE ──
    const barH = Math.round(fontSize * 2.8);
    const barY = canvas.height - barH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, barY, canvas.width, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    const dateStr = meta.capturedAt
      ? new Date(meta.capturedAt).toLocaleString()
      : new Date().toLocaleString();

    let coordsStr = 'GeoTag Camera';
    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      coordsStr = `${meta.latitude.toFixed(5)}°, ${meta.longitude.toFixed(5)}°`;
      if (meta.accuracy !== undefined) {
        coordsStr += ` (±${meta.accuracy.toFixed(0)}m)`;
      }
    }

    ctx.fillText(`📍 ${coordsStr}`, pad, barY + barH / 2);
    const dateWidth = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, canvas.width - pad - dateWidth, barY + barH / 2);

  } else if (style === 'badge') {
    // ── FLOATING CORNER BADGE STYLE ──
    const badgeW = Math.min(canvas.width * 0.75, 480);
    const badgeH = Math.round(fontSize * 5.2);
    const badgeX = pad;
    const badgeY = canvas.height - badgeH - pad;
    const radius = Math.round(fontSize * 0.6);

    // Rounded rectangle badge
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(fontSize * 1.1)}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('📍 GeoTag Camera', badgeX + pad, badgeY + pad);

    ctx.font = `${fontSize}px sans-serif`;
    let lineY = badgeY + pad + fontSize * 1.5;

    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(
        `GPS: ${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}°`,
        badgeX + pad,
        lineY
      );
      lineY += fontSize * 1.35;
    }

    if (meta.capturedAt) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(
        new Date(meta.capturedAt).toLocaleString(),
        badgeX + pad,
        lineY
      );
    }
    ctx.restore();

  } else {
    // ── PRO HUD STYLE (Default) ──
    const panelH = Math.round(canvas.height * 0.23);
    const panelY = canvas.height - panelH;
    const lineH = Math.round(fontSize * 1.55);

    // Dark translucent panel with subtle top glow
    ctx.fillStyle = 'rgba(10, 15, 28, 0.82)';
    ctx.fillRect(0, panelY, canvas.width, panelH);

    // Top border highlight line
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = Math.max(2, Math.round(canvas.width / 500));
    ctx.beginPath();
    ctx.moveTo(0, panelY);
    ctx.lineTo(canvas.width, panelY);
    ctx.stroke();

    // Mini-map coordinate grid HUD (Right side)
    const mapSize = panelH - pad * 2;
    const mapX = canvas.width - mapSize - pad;
    const mapY = panelY + pad;

    // Map container
    ctx.fillStyle = '#090d16';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
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
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mapX + mapSize / 2, mapY);
    ctx.lineTo(mapX + mapSize / 2, mapY + mapSize);
    ctx.moveTo(mapX, mapY + mapSize / 2);
    ctx.lineTo(mapX + mapSize, mapY + mapSize / 2);
    ctx.stroke();

    // Pulse circles
    const cx = mapX + mapSize / 2;
    const cy = mapY + mapSize / 2;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, mapSize * 0.28, 0, Math.PI * 2);
    ctx.stroke();

    // Location dot
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, mapSize * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // HUD Label
    const smallFont = Math.max(10, Math.round(fontSize * 0.65));
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold ${smallFont}px monospace`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('GPS LOCK', mapX + 4, mapY + mapSize - 4);

    // Text content on left side
    const textMaxW = mapX - pad * 2;
    ctx.font = `bold ${Math.round(fontSize * 1.15)}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('📍 GeoTag Camera', pad, panelY + pad);

    ctx.font = `${fontSize}px sans-serif`;
    let y = panelY + pad + lineH * 1.05;

    const drawLine = (text: string, color = '#e2e8f0', isMonospace = false) => {
      if (!text) return;
      ctx.fillStyle = color;
      if (isMonospace) {
        ctx.font = `500 ${fontSize}px monospace`;
      } else {
        ctx.font = `${fontSize}px sans-serif`;
      }
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
      drawLine(`LAT  ${meta.latitude.toFixed(6)}°`, '#4ade80', true);
      drawLine(`LNG  ${meta.longitude.toFixed(6)}°`, '#4ade80', true);
    }

    if (meta.accuracy !== undefined) {
      drawLine(`ACC  ±${meta.accuracy.toFixed(1)} m`, '#fde047', true);
    }

    if (meta.capturedAt) {
      const d = new Date(meta.capturedAt);
      drawLine(`DATE ${d.toLocaleDateString()}`, '#cbd5e1', true);
      drawLine(`TIME ${d.toLocaleTimeString()}`, '#cbd5e1', true);
    }
  }

  // Return as JPEG blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      0.94
    );
  });
}
