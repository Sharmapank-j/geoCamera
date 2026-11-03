// src/pages/map.tsx
// Offline coordinate map — renders photo locations as interactive pins on an SVG grid.
// Works 100% offline with zero external tile server dependencies.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAllPhotos, PhotoRecordLocal } from '@/lib/localDB';
import NavBar from '@/components/NavBar';
import { triggerHaptic } from '@/lib/feedback';

const MAP_W = 800;
const MAP_H = 500;
const PAD = 50;

function project(
  lat: number,
  lng: number,
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
) {
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;
  const x = PAD + ((lng - minLng) / lngRange) * (MAP_W - PAD * 2);
  const y = MAP_H - PAD - ((lat - minLat) / latRange) * (MAP_H - PAD * 2);
  return { x, y };
}

export default function MapPage() {
  const [photos, setPhotos] = useState<PhotoRecordLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PhotoRecordLocal | null>(null);
  const [thumbURL, setThumbURL] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const all = await getAllPhotos();
    setPhotos(all.filter((p) => p.latitude !== undefined && p.longitude !== undefined));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (thumbURL) URL.revokeObjectURL(thumbURL);
    };
  }, [thumbURL]);

  const { minLat, maxLat, minLng, maxLng } = useMemo(() => {
    if (!photos.length) return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
    const lats = photos.map((p) => p.latitude!);
    const lngs = photos.map((p) => p.longitude!);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [photos]);

  const dots = useMemo(
    () =>
      photos.map((p) =>
        project(p.latitude!, p.longitude!, minLat, maxLat, minLng, maxLng)
      ),
    [photos, minLat, maxLat, minLng, maxLng]
  );

  const handleSelect = (photo: PhotoRecordLocal) => {
    triggerHaptic('light');
    setSelected(photo);
    if (thumbURL) URL.revokeObjectURL(thumbURL);
    setThumbURL(URL.createObjectURL(photo.blob));
    setCopied(false);
  };

  const copyCoords = () => {
    if (!selected || selected.latitude === undefined) return;
    navigator.clipboard?.writeText(
      `${selected.latitude.toFixed(6)}, ${selected.longitude!.toFixed(6)}`
    );
    triggerHaptic('selection');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 select-none">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-xs">
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Offline Map</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Coordinate plot · {photos.length} geotagged photo{photos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <div className="w-8 h-8 rounded-full border-3 border-blue-500 border-t-transparent animate-spin" />
          <span className="text-xs font-medium">Plotting coordinates…</span>
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
          <span className="text-5xl">🗺</span>
          <p className="text-sm font-bold text-gray-700">No geotagged photos found</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Take a photo with GPS enabled in the Camera tab to see it plotted on this offline coordinate map.
          </p>
          <Link
            href="/camera"
            className="btn-press mt-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20"
          >
            Open Camera
          </Link>
        </div>
      ) : (
        <div className="p-3 max-w-2xl mx-auto flex flex-col gap-3">
          {/* SVG coordinate plane */}
          <div className="w-full overflow-hidden rounded-2xl border border-gray-800 shadow-md bg-slate-950">
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="w-full select-none"
              style={{ minWidth: 320 }}
            >
              {/* Background gradient */}
              <rect width={MAP_W} height={MAP_H} fill="#090d16" />

              {/* Grid lines */}
              {Array.from({ length: 6 }).map((_, i) => {
                const x = PAD + (i / 5) * (MAP_W - PAD * 2);
                const y = PAD + (i / 5) * (MAP_H - PAD * 2);
                return (
                  <g key={i}>
                    <line x1={x} y1={PAD} x2={x} y2={MAP_H - PAD} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 3" />
                    <line x1={PAD} y1={y} x2={MAP_W - PAD} y2={y} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 3" />
                  </g>
                );
              })}

              {/* Axis labels */}
              {[0, 0.5, 1].map((t) => {
                const lng = minLng + t * (maxLng - minLng);
                const lat = maxLat - t * (maxLat - minLat);
                const x = PAD + t * (MAP_W - PAD * 2);
                const y = PAD + t * (MAP_H - PAD * 2);
                return (
                  <g key={t}>
                    <text x={x} y={MAP_H - 12} textAnchor="middle" fill="#64748b" fontSize={11} fontFamily="monospace">
                      {lng.toFixed(3)}°
                    </text>
                    <text x={12} y={y} dominantBaseline="middle" fill="#64748b" fontSize={11} fontFamily="monospace">
                      {lat.toFixed(3)}°
                    </text>
                  </g>
                );
              })}

              {/* Photo Pins */}
              {photos.map((photo, i) => {
                const { x, y } = dots[i];
                const isSelected = selected?.id === photo.id;

                return (
                  <g
                    key={photo.id}
                    onClick={() => handleSelect(photo)}
                    style={{ cursor: 'pointer' }}
                    className="transition-transform duration-150"
                  >
                    {isSelected ? (
                      <>
                        <circle cx={x} cy={y} r={22} fill="rgba(59, 130, 246, 0.25)" className="animate-pulse" />
                        <circle cx={x} cy={y} r={12} fill="#3b82f6" stroke="#ffffff" strokeWidth={2.5} />
                        <circle cx={x} cy={y} r={4} fill="#ffffff" />
                      </>
                    ) : (
                      <>
                        <circle cx={x} cy={y} r={8} fill="#ef4444" stroke="#ffffff" strokeWidth={1.8} />
                        <circle cx={x} cy={y} r={2.5} fill="#ffffff" />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected photo card */}
          {selected && thumbURL && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3.5 flex gap-3.5 items-center animate-fade-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbURL}
                alt="Selected"
                className="w-20 h-20 object-cover rounded-xl shrink-0 border border-gray-100"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">
                  {new Date(selected.capturedAt).toLocaleString()}
                </p>
                <p className="text-xs font-mono font-semibold text-blue-600 mt-0.5">
                  {selected.latitude!.toFixed(6)}°, {selected.longitude!.toFixed(6)}°
                </p>
                {selected.accuracy !== undefined && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Accuracy: ±{selected.accuracy.toFixed(0)}m</p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={copyCoords}
                    className="btn-press px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold"
                  >
                    {copied ? '✓ Copied' : '📋 Copy GPS'}
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-press px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold"
                  >
                    ↗ Open External Map
                  </a>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  if (thumbURL) URL.revokeObjectURL(thumbURL);
                  setThumbURL(null);
                }}
                className="btn-press p-1.5 text-gray-400 hover:text-gray-600 self-start"
              >
                ✕
              </button>
            </div>
          )}

          {/* Photo location list */}
          <div className="mt-2">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              All Photo Pins ({photos.length})
            </h2>
            <div className="flex flex-col gap-1.5">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => handleSelect(photo)}
                  className={`btn-press w-full text-left px-3.5 py-2.5 rounded-xl border transition-all flex items-center justify-between ${
                    selected?.id === photo.id
                      ? 'border-blue-500 bg-blue-50/80 shadow-xs ring-1 ring-blue-500'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-gray-800">
                      {new Date(photo.capturedAt).toLocaleString()}
                    </p>
                    <p className="text-[11px] font-mono font-medium text-blue-600 mt-0.5">
                      {photo.latitude!.toFixed(5)}°, {photo.longitude!.toFixed(5)}°
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">📍</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <NavBar active="map" />
    </div>
  );
}
