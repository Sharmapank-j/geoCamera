// src/pages/map.tsx
// Offline coordinate map — renders photo locations as dots on an SVG grid.
// No external tile services required.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAllPhotos, PhotoRecordLocal } from '@/lib/localDB';
import NavBar from '@/components/NavBar';
import Link from 'next/link';

const MAP_W = 800;
const MAP_H = 500;
const PAD = 40;

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

  const load = useCallback(async () => {
    const all = await getAllPhotos();
    setPhotos(all.filter((p) => p.latitude !== undefined && p.longitude !== undefined));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const dots = useMemo(() =>
    photos.map((p) =>
      project(p.latitude!, p.longitude!, minLat, maxLat, minLng, maxLng)
    ),
  [photos, minLat, maxLat, minLng, maxLng]);

  const handleSelect = (photo: PhotoRecordLocal) => {
    setSelected(photo);
    if (thumbURL) URL.revokeObjectURL(thumbURL);
    setThumbURL(URL.createObjectURL(photo.blob));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Map</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Offline coordinate map — {photos.length} geotagged photo{photos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">Loading…</div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-400">
          <span className="text-5xl">🗺</span>
          <p>No geotagged photos yet.</p>
          <Link href="/camera" className="text-blue-600 underline text-sm">
            Take a photo with GPS →
          </Link>
        </div>
      ) : (
        <div className="p-4">
          {/* SVG map */}
          <div className="w-full overflow-x-auto rounded-2xl border border-gray-200 shadow-sm bg-slate-900">
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="w-full"
              style={{ minWidth: 300 }}
            >
              {/* Background */}
              <rect width={MAP_W} height={MAP_H} fill="#0f172a" />

              {/* Grid lines */}
              {Array.from({ length: 5 }).map((_, i) => {
                const x = PAD + (i / 4) * (MAP_W - PAD * 2);
                const y = PAD + (i / 4) * (MAP_H - PAD * 2);
                return (
                  <g key={i}>
                    <line x1={x} y1={PAD} x2={x} y2={MAP_H - PAD} stroke="#1e293b" strokeWidth={1} />
                    <line x1={PAD} y1={y} x2={MAP_W - PAD} y2={y} stroke="#1e293b" strokeWidth={1} />
                  </g>
                );
              })}

              {/* Axis labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const lng = minLng + t * (maxLng - minLng);
                const lat = maxLat - t * (maxLat - minLat);
                const x = PAD + t * (MAP_W - PAD * 2);
                const y = PAD + t * (MAP_H - PAD * 2);
                return (
                  <g key={t}>
                    <text x={x} y={MAP_H - 5} textAnchor="middle" fill="#475569" fontSize={10}>
                      {lng.toFixed(3)}°
                    </text>
                    <text x={5} y={y} dominantBaseline="middle" fill="#475569" fontSize={10}>
                      {lat.toFixed(3)}°
                    </text>
                  </g>
                );
              })}

              {/* Photo dots */}
              {photos.map((photo, i) => {
                const { x, y } = dots[i];
                const isSelected = selected?.id === photo.id;
                return (
                  <g key={photo.id} onClick={() => handleSelect(photo)} style={{ cursor: 'pointer' }}>
                    {isSelected && (
                      <circle cx={x} cy={y} r={14} fill="rgba(239,68,68,0.25)" />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 8 : 6}
                      fill={isSelected ? '#ef4444' : '#3b82f6'}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected photo info */}
          {selected && thumbURL && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbURL} alt="Selected" className="w-20 h-20 object-cover rounded-xl" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(selected.capturedAt).toLocaleString()}
                </p>
                {selected.latitude !== undefined && (
                  <p className="text-xs text-blue-600 font-mono mt-0.5">
                    {selected.latitude.toFixed(6)}, {selected.longitude!.toFixed(6)}
                  </p>
                )}
                {selected.address && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{selected.address}</p>
                )}
              </div>
              <button
                onClick={() => { setSelected(null); if (thumbURL) URL.revokeObjectURL(thumbURL); setThumbURL(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>
          )}

          {/* Photo list */}
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-3">All Geotagged Photos</h2>
          <div className="flex flex-col gap-2">
            {photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => handleSelect(photo)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                  selected?.id === photo.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <p className="text-sm text-gray-800">{new Date(photo.capturedAt).toLocaleString()}</p>
                <p className="text-xs font-mono text-blue-600 mt-0.5">
                  {photo.latitude!.toFixed(5)}, {photo.longitude!.toFixed(5)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <NavBar active="map" />
    </div>
  );
}
