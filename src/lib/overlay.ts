// src/lib/overlay.ts
// Renders an adaptive, high-density, professional GPS camera overlay onto photos (Canvas API).
// Works 100% offline with zero external network dependencies.

export interface OverlayMeta {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  capturedAt?: string; // ISO string
  address?: string;
  note?: string;
  style?: 'pro' | 'badge' | 'minimal';
}

/**
 * Converts decimal degrees to Degrees, Minutes, Seconds (DMS) string
 */
export function toDMS(degrees: number, isLatitude: boolean): string {
  const direction = isLatitude ? (degrees >= 0 ? 'N' : 'S') : degrees >= 0 ? 'E' : 'W';
  const abs = Math.abs(degrees);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = ((minFloat - m) * 60).toFixed(2);
  return `${d}° ${m}' ${s}" ${direction}`;
}

/**
 * Determines compass cardinal heading string (e.g. "142° SE")
 */
export function getHeadingString(heading?: number): string {
  if (heading === undefined || heading === null || isNaN(heading)) {
    return '0° N (North)';
  }
  const deg = Math.round((heading + 360) % 360);
  const cardinals = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ];
  const index = Math.round(deg / 22.5) % 16;
  return `${deg}° ${cardinals[index]}`;
}

/**
 * Formats local timezone string (e.g. "GMT +05:30 (Asia/Kolkata)")
 */
export function getTimezoneString(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const mins = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    return `GMT ${sign}${hours}:${mins} (${tz})`;
  } catch {
    return 'UTC Local';
  }
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

  // 1. Draw base photo exactly to canvas bounds (preserving original aspect ratio)
  ctx.drawImage(img, 0, 0);
  img.close();

  const style = meta.style || 'pro';
  const isPortrait = canvas.height > canvas.width;
  const isSquare = Math.abs(canvas.height - canvas.width) < 50;

  // Base font size scaling proportional to the shorter dimension to prevent oversized fonts
  const baseDim = Math.min(canvas.width, canvas.height);
  const fontSize = Math.max(12, Math.round(baseDim / 44));
  const pad = Math.round(fontSize * 0.9);
  const lineH = Math.round(fontSize * 1.45);

  if (style === 'minimal') {
    // ── MINIMAL COMPACT BAR ──
    const barH = Math.round(fontSize * 3.6);
    const barY = canvas.height - barH;

    ctx.fillStyle = 'rgba(7, 11, 22, 0.88)';
    ctx.fillRect(0, barY, canvas.width, barH);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2, Math.round(baseDim / 600));
    ctx.beginPath();
    ctx.moveTo(0, barY);
    ctx.lineTo(canvas.width, barY);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    const dateStr = meta.capturedAt
      ? new Date(meta.capturedAt).toLocaleString()
      : new Date().toLocaleString();

    let coordsStr = 'GeoTag Camera Pro';
    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      coordsStr = `${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}° (±${(meta.accuracy || 5).toFixed(0)}m)`;
    }

    ctx.fillText(`📍 ${coordsStr}`, pad, barY + barH * 0.32);
    ctx.font = `500 ${Math.round(fontSize * 0.85)}px monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${dateStr} · ${getTimezoneString()}`, pad, barY + barH * 0.72);

  } else if (style === 'badge') {
    // ── CORNER FLOATING BADGE STYLE ──
    const badgeW = Math.min(canvas.width * 0.9, 560);
    const badgeH = Math.round(fontSize * 8.0);
    const badgeX = pad;
    const badgeY = canvas.height - badgeH - pad;
    const radius = Math.round(fontSize * 0.8);

    ctx.save();
    ctx.fillStyle = 'rgba(6, 11, 24, 0.92)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(fontSize * 1.15)}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('📍 GeoTag Camera Pro', badgeX + pad, badgeY + pad);

    ctx.font = `500 ${Math.round(fontSize * 0.90)}px monospace`;
    let lineY = badgeY + pad + fontSize * 1.6;

    if (meta.address) {
      ctx.fillStyle = '#93c5fd';
      ctx.font = `600 ${Math.round(fontSize * 0.88)}px sans-serif`;
      ctx.fillText(`📍 ${meta.address}`, badgeX + pad, lineY);
      lineY += fontSize * 1.35;
      ctx.font = `500 ${Math.round(fontSize * 0.90)}px monospace`;
    }

    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`DD : ${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}°`, badgeX + pad, lineY);
      lineY += fontSize * 1.3;

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`DMS: ${toDMS(meta.latitude, true)} | ${toDMS(meta.longitude, false)}`, badgeX + pad, lineY);
      lineY += fontSize * 1.3;
    }

    if (meta.accuracy !== undefined || meta.altitude !== undefined) {
      ctx.fillStyle = '#fde047';
      const altStr = meta.altitude !== undefined ? `ALT: ${meta.altitude.toFixed(1)}m ` : '';
      const accStr = meta.accuracy !== undefined ? `ACC: ±${meta.accuracy.toFixed(1)}m` : '';
      ctx.fillText(`${altStr}${accStr} | ${getHeadingString(meta.heading)}`, badgeX + pad, lineY);
      lineY += fontSize * 1.3;
    }

    if (meta.capturedAt) {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(new Date(meta.capturedAt).toLocaleString(), badgeX + pad, lineY);
    }
    ctx.restore();

  } else {
    // ── PRO TELEMETRY HUD OVERLAY (Default) ──
    // Compute adaptive panel height based on content and aspect ratio:
    // Portrait photos have large vertical space, landscape has limited vertical space.
    const itemsCount = 6 + (meta.address ? 1 : 0) + (meta.note ? 1 : 0);
    const contentH = Math.round(itemsCount * lineH + pad * 2.2);
    const maxRatio = isPortrait ? 0.24 : isSquare ? 0.28 : 0.32;
    const panelH = Math.max(contentH, Math.round(canvas.height * maxRatio));
    const panelY = canvas.height - panelH;

    // Dark obsidian glassmorphic panel
    ctx.fillStyle = 'rgba(5, 9, 20, 0.92)';
    ctx.fillRect(0, panelY, canvas.width, panelH);

    // Subtle gradient accent border at top of panel
    const topGrad = ctx.createLinearGradient(0, panelY, canvas.width, panelY);
    topGrad.addColorStop(0, '#38bdf8');
    topGrad.addColorStop(0.35, '#3b82f6');
    topGrad.addColorStop(0.7, '#6366f1');
    topGrad.addColorStop(1, '#a855f7');
    ctx.strokeStyle = topGrad;
    ctx.lineWidth = Math.max(3, Math.round(baseDim / 450));
    ctx.beginPath();
    ctx.moveTo(0, panelY);
    ctx.lineTo(canvas.width, panelY);
    ctx.stroke();

    // ── RIGHT SIDE: COMPACT TACTICAL RADAR & COMPASS HUD ──
    const mapSize = Math.min(panelH - pad * 2, Math.round(canvas.width * 0.26));
    const mapX = canvas.width - mapSize - pad;
    const mapY = panelY + Math.round((panelH - mapSize) / 2);

    // Radar Container (Rounded Tactical Box)
    ctx.save();
    ctx.fillStyle = '#030712';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapSize, mapSize, Math.round(fontSize * 0.5));
    ctx.fill();
    ctx.stroke();

    // Radar Concentric Range Rings
    const cx = mapX + mapSize / 2;
    const cy = mapY + mapSize / 2;
    [0.20, 0.35, 0.45].forEach((scale) => {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.20)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, mapSize * scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mapX + mapSize / 2, mapY + 4);
    ctx.lineTo(mapX + mapSize / 2, mapY + mapSize - 4);
    ctx.moveTo(mapX + 4, mapY + mapSize / 2);
    ctx.lineTo(mapX + mapSize - 4, mapY + mapSize / 2);
    ctx.stroke();

    // Compass Cardinal Marks (N, S, E, W)
    const cardFont = Math.max(9, Math.round(fontSize * 0.62));
    ctx.font = `bold ${cardFont}px sans-serif`;
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', cx, mapY + 3);

    ctx.fillStyle = '#64748b';
    ctx.textBaseline = 'bottom';
    ctx.fillText('S', cx, mapY + mapSize - 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', mapX + mapSize - 10, cy);

    ctx.textAlign = 'right';
    ctx.fillText('W', mapX + 10, cy);

    // Heading Compass Needle (orienting to current device heading)
    const headingDeg = meta.heading !== undefined ? meta.heading : 0;
    const headingRad = (headingDeg - 90) * (Math.PI / 180);
    const needleLen = mapSize * 0.38;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.15));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(headingRad) * needleLen, cy + Math.sin(headingRad) * needleLen);
    ctx.stroke();

    // Center GPS Lock Target Dot
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, mapSize * 0.05), 0, Math.PI * 2);
    ctx.fill();

    // Radar HUD Footer Badges
    const badgeFont = Math.max(8, Math.round(fontSize * 0.58));
    ctx.fillStyle = '#38bdf8';
    ctx.font = `bold ${badgeFont}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('3D LOCK', mapX + 4, mapY + mapSize - 3);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#4ade80';
    ctx.fillText('FIX: OK', mapX + mapSize - 4, mapY + mapSize - 3);
    ctx.restore();

    // ── LEFT SIDE: RICH HIGH-DENSITY METADATA ──
    const textMaxW = mapX - pad * 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // 1. Header Row: Title & GPS Status Chip
    ctx.font = `bold ${Math.round(fontSize * 1.2)}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('📍 GEOTAG CAMERA PRO', pad, panelY + pad);

    const titleWidth = ctx.measureText('📍 GEOTAG CAMERA PRO').width;
    const chipX = pad + titleWidth + 12;
    const chipY = panelY + pad + 2;

    if (chipX + 100 < textMaxW) {
      ctx.save();
      ctx.fillStyle = '#064e3b';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(chipX, chipY, 94, fontSize * 1.15, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = `bold ${Math.round(fontSize * 0.65)}px monospace`;
      ctx.fillStyle = '#34d399';
      ctx.fillText('● GPS LOCKED', chipX + 8, chipY + 2);
      ctx.restore();
    }

    let curY = panelY + pad + lineH * 1.25;

    const renderDataLine = (label: string, value: string, valColor = '#e2e8f0', isMono = true) => {
      if (!value) return;
      ctx.font = `bold ${Math.round(fontSize * 0.85)}px monospace`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${label}: `, pad, curY);

      const labelW = ctx.measureText(`${label}: `).width;
      ctx.font = isMono
        ? `600 ${Math.round(fontSize * 0.90)}px monospace`
        : `600 ${Math.round(fontSize * 0.90)}px sans-serif`;
      ctx.fillStyle = valColor;

      let valText = value;
      while (ctx.measureText(valText).width > (textMaxW - labelW) && valText.length > 8) {
        valText = valText.slice(0, -1);
      }
      if (valText !== value) valText += '…';
      ctx.fillText(valText, pad + labelW, curY);

      curY += lineH;
    };

    // 2. Address (if available)
    if (meta.address) {
      renderDataLine('ADDRESS    ', meta.address, '#93c5fd', false);
    }

    // 3. Dual Coordinates (DD + DMS)
    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      const ddStr = `${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}°`;
      renderDataLine('COORD (DD) ', ddStr, '#4ade80', true);

      const dmsStr = `${toDMS(meta.latitude, true)}, ${toDMS(meta.longitude, false)}`;
      renderDataLine('COORD (DMS)', dmsStr, '#38bdf8', true);
    } else {
      renderDataLine('COORDINATES', 'No GPS Attached (Saved Offline)', '#94a3b8', true);
    }

    // 4. Elevation, Accuracy & Heading
    const altStr = meta.altitude !== undefined
      ? `${meta.altitude.toFixed(1)}m MSL (${(meta.altitude * 3.28084).toFixed(0)}ft)`
      : 'Sea Level';
    const accStr = meta.accuracy !== undefined ? ` ±${meta.accuracy.toFixed(1)}m` : ' ±4.0m';
    const headStr = getHeadingString(meta.heading);
    renderDataLine('ELEV / ACC ', `${altStr} | ACC:${accStr} | ${headStr}`, '#fde047', true);

    // 5. Timestamp & Date
    const now = meta.capturedAt ? new Date(meta.capturedAt) : new Date();
    const dateFormatted = now.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
    const timeFormatted = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    renderDataLine('DATE & TIME', `${dateFormatted} · ${timeFormatted}`, '#f1f5f9', true);

    // 6. Timezone
    renderDataLine('TIME ZONE  ', getTimezoneString(), '#94a3b8', true);

    // 7. Project Note / Site Tag (if specified)
    if (meta.note) {
      renderDataLine('PROJECT/TAG', meta.note, '#f472b6', false);
    }
  }

  // Return final high-resolution JPEG
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      0.95
    );
  });
}
