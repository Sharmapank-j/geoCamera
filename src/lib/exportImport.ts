// src/lib/exportImport.ts
// ZIP and JSON export/import utilities — 100% client-side, no network calls.
import JSZip from 'jszip';
import { addPhoto, getAllPhotos, PhotoRecordLocal } from './localDB';

// ---------- JSON Metadata Export ----------
export async function exportMetadataJSON(photosSubset?: PhotoRecordLocal[]): Promise<void> {
  const photos = photosSubset || (await getAllPhotos());
  if (photos.length === 0) throw new Error('No photos to export.');

  const meta = photos.map(({ id, latitude, longitude, accuracy, capturedAt, address }) => ({
    id,
    latitude,
    longitude,
    accuracy,
    capturedAt,
    address,
  }));
  const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `geocamera-metadata-${dateTag()}.json`);
}

// ---------- ZIP Export (all or selected photos + metadata) ----------
export async function exportZIP(photosSubset?: PhotoRecordLocal[]): Promise<void> {
  const photos = photosSubset || (await getAllPhotos());
  if (photos.length === 0) throw new Error('No photos to export.');

  const zip = new JSZip();
  const meta: Omit<PhotoRecordLocal, 'blob'>[] = [];

  for (const photo of photos) {
    zip.file(`photos/${photo.id}.jpg`, photo.blob);
    const { blob: _blob, ...rest } = photo;
    meta.push(rest);
  }

  zip.file('metadata.json', JSON.stringify(meta, null, 2));

  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const prefix = photosSubset ? 'geocamera-selected' : 'geocamera-backup';
  triggerDownload(content, `${prefix}-${dateTag()}.zip`);
}

// ---------- ZIP Import ----------
export async function importZIP(file: File): Promise<number> {
  const zip = await JSZip.loadAsync(file);

  const metaFile = zip.file('metadata.json');
  if (!metaFile) throw new Error('Invalid backup: metadata.json not found in archive.');

  const metaText = await metaFile.async('string');
  const records: Omit<PhotoRecordLocal, 'blob'>[] = JSON.parse(metaText);

  let imported = 0;
  for (const record of records) {
    const imgFile = zip.file(`photos/${record.id}.jpg`);
    if (!imgFile) continue;
    const blob = await imgFile.async('blob');
    await addPhoto({ ...record, blob: new Blob([blob], { type: 'image/jpeg' }) });
    imported++;
  }
  return imported;
}

// ---------- Helpers ----------
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dateTag(): string {
  return new Date().toISOString().slice(0, 10);
}
