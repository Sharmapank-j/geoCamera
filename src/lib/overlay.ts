// src/lib/overlay.ts
// Renders a high-density, professional GPS camera overlay onto photos (Canvas API).
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

  // 1. Draw base photo
  ctx.drawImage(img, 0, 0);
  img.close();

  const style = meta.style || 'pro';
  const fontSize = Math.max(13, Math.round(canvas.width / 58));
  const pad = Math.round(fontSize * 0.9);

  if (style === 'minimal') {
    // ── MINIMAL COMPACT BAR ──
    const barH = Math.round(fontSize * 3.4);
    const barY = canvas.height - barH;

    ctx.fillStyle = 'rgba(7, 11, 20, 0.85)';
    ctx.fillRect(0, barY, canvas.width, barH);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
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

    let coordsStr = 'GeoTag Camera';
    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      coordsStr = `${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}° (±${(meta.accuracy || 5).toFixed(0)}m)`;
    }

    ctx.fillText(`📍 ${coordsStr}`, pad, barY + barH * 0.35);
    ctx.font = `${Math.round(fontSize * 0.9)}px monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(dateStr, pad, barY + barH * 0.72);

  } else if (style === 'badge') {
    // ── CORNER BADGE STYLE ──
    const badgeW = Math.min(canvas.width * 0.85, 520);
    const badgeH = Math.round(fontSize * 7.5);
    const badgeX = pad;
    const badgeY = canvas.height - badgeH - pad;
    const radius = Math.round(fontSize * 0.75);

    ctx.save();
    ctx.fillStyle = 'rgba(7, 12, 24, 0.9)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(fontSize * 1.15)}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('📍 GeoTag Camera Pro', badgeX + pad, badgeY + pad);

    ctx.font = `500 ${Math.round(fontSize * 0.95)}px monospace`;
    let lineY = badgeY + pad + fontSize * 1.6;

    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`DD:  ${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}°`, badgeX + pad, lineY);
      lineY += fontSize * 1.3;

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`DMS: ${toDMS(meta.latitude, true)} | ${toDMS(meta.longitude, false)}`, badgeX + pad, lineY);
      lineY += fontSize * 1.3;
    }

    if (meta.accuracy !== undefined || meta.altitude !== undefined) {
      ctx.fillStyle = '#fde047';
      const altStr = meta.altitude !== undefined ? `ALT: ${meta.altitude.toFixed(1)}m ` : '';
      const accStr = meta.accuracy !== undefined ? `ACC: ±${meta.accuracy.toFixed(1)}m` : '';
      ctx.fillText(`${altStr}${accStr}`, badgeX + pad, lineY);
      lineY += fontSize * 1.3;
    }

    if (meta.capturedAt) {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(new Date(meta.capturedAt).toLocaleString(), badgeX + pad, lineY);
    }
    ctx.restore();

  } else {
    // ── HIGH-DENSITY PROFESSIONAL HUD OVERLAY ──
    const panelH = Math.round(canvas.height * 0.30);
    const panelY = canvas.height - panelH;
    const lineH = Math.round(fontSize * 1.48);

    // Dark solid backdrop with frosted look
    ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
    ctx.fillRect(0, panelY, canvas.width, panelH);

    // Glowing top highlight line
    const gradient = ctx.createLinearGradient(0, panelY, canvas.width, panelY);
    gradient.addColorStop(0, '#38bdf8');
    gradient.addColorStop(0.5, '#3b82f6');
    gradient.addColorStop(1, '#818cf8');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(3, Math.round(canvas.width / 450));
    ctx.beginPath();
    ctx.moveTo(0, panelY);
    ctx.lineTo(canvas.width, panelY);
    ctx.stroke();

    // ── RIGHT SIDE: TACTICAL RADAR HUD & COMPASS WIDGET ──
    const mapSize = panelH - pad * 2;
    const mapX = canvas.width - mapSize - pad;
    const mapY = panelY + pad;

    // Tactical Radar Box
    ctx.fillStyle = '#050914';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapSize, mapSize);

    // Radar concentric range circles
    const cx = mapX + mapSize / 2;
    const cy = mapY + mapSize / 2;
    [0.18, 0.32, 0.44].forEach((scale) => {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, mapSize * scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mapX + mapSize / 2, mapY);
    ctx.lineTo(mapX + mapSize / 2, mapY + mapSize);
    ctx.moveTo(mapX, mapY + mapSize / 2);
    ctx.lineTo(mapX + mapSize, mapY + mapSize / 2);
    ctx.stroke();

    // Compass Cardinal Marks (N, S, E, W)
    ctx.font = `bold ${Math.max(9, Math.round(fontSize * 0.65))}px sans-serif`;
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', cx, mapY + 3);

    ctx.fillStyle = '#64748b';
    ctx.textBaseline = 'bottom';
    ctx.fillText('S', cx, mapY + mapSize - 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', mapX + mapSize - 9, cy);

    ctx.textAlign = 'right';
    ctx.fillText('W', mapX + 9, cy);

    // Heading indicator needle (Pointing to heading angle)
    const headingRad = ((meta.heading || 0) - 90) * (Math.PI / 180);
    const needleLen = mapSize * 0.38;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(headingRad) * needleLen, cy + Math.sin(headingRad) * needleLen);
    ctx.stroke();

    // Center GPS Lock Target Dot
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, mapSize * 0.05), 0, Math.PI * 2);
    ctx.fill();

    // HUD Telemetry bottom bar in radar
    ctx.fillStyle = '#0ea5e9';
    ctx.font = `bold ${Math.max(8, Math.round(fontSize * 0.62))}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('3D LOCK', mapX + 4, mapY + mapSize - 4);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#4ade80';
    ctx.fillText('FIX: OK', mapX + mapSize - 4, mapY + mapSize - 4);

    // ── LEFT SIDE: RICH METADATA PANEL ──
    const textMaxW = mapX - pad * 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Header line: App Title & GPS Status
    ctx.font = `bold ${Math.round(fontSize * 1.25)}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('📍 GEOTAG CAMERA PRO', pad, panelY + pad);

    // Status chip next to title
    ctx.font = `bold ${Math.round(fontSize * 0.72)}px sans-serif`;
    const titleWidth = ctx.measureText('📍 GEOTAG CAMERA PRO').width;
    const badgeX = pad + titleWidth + 14;
    const badgeY = panelY + pad + 2;

    if (badgeX + 110 < textMaxW) {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(badgeX, badgeY, 80, fontSize * 1.15);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('✓ GPS LOCKED', badgeX + 6, badgeY + 2);
    }

    // Detail rows starting under header
    let curY = panelY + pad + lineH * 1.25;

    const printItem = (label: string, value: string, valColor = '#e2e8f0', isMono = true) => {
      if (!value) return;
      ctx.font = `bold ${Math.round(fontSize * 0.88)}px monospace`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${label}: `, pad, curY);

      const labelW = ctx.measureText(`${label}: `).width;
      ctx.font = isMono ? `600 ${Math.round(fontSize * 0.95)}px monospace` : `600 ${Math.round(fontSize * 0.95)}px sans-serif`;
      ctx.fillStyle = valColor;

      let valText = value;
      while (ctx.measureText(valText).width > (textMaxW - labelW) && valText.length > 8) {
        valText = valText.slice(0, -1);
      }
      if (valText !== value) valText += '…';
      ctx.fillText(valText, pad + labelW, curY);

      curY += lineH;
    };

    // 1. Dual Coordinate Formats (DD + DMS)
    if (meta.latitude !== undefined && meta.longitude !== undefined) {
      const ddStr = `${meta.latitude.toFixed(6)}°, ${meta.longitude.toFixed(6)}°`;
      printItem('COORD (DD) ', ddStr, '#4ade80', true);

      const dmsStr = `${toDMS(meta.latitude, true)}, ${toDMS(meta.longitude, false)}`;
      printItem('COORD (DMS)', dmsStr, '#38bdf8', true);
    } else {
      printItem('COORDINATES', 'Not Attached (Save without GPS)', '#cbd5e1', true);
    }

    // 2. Elevation / Altitude & Accuracy
    const altStr = meta.altitude !== undefined
      ? `${meta.altitude.toFixed(1)} m MSL (${(meta.altitude * 3.28084).toFixed(0)} ft)`
      : 'Sea Level';
    const accStr = meta.accuracy !== undefined ? ` ±${meta.accuracy.toFixed(1)} m` : ' ±4.0 m';
    printItem('ELEV / ACC ', `${altStr} | ACC:${accStr}`, '#fde047', true);

    // 3. Heading & Azimuth
    const headingStr = getHeadingString(meta.heading);
    printItem('BEARING/DIR', headingStr, '#a7f3d0', true);

    // 4. Timestamp & Full Date
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
    printItem('DATE & TIME', `${dateFormatted} · ${timeFormatted}`, '#f1f5f9', true);

    // 5. Timezone info
    printItem('TIME ZONE  ', getTimezoneString(), '#94a3b8', true);

    // 6. User Note / Project Tag / Address (if available)
    if (meta.note) {
      printItem('PROJECT/TAG', meta.note, '#f472b6', false);
    } else if (meta.address) {
      printItem('LOCATION   ', meta.address, '#93c5fd', false);
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
