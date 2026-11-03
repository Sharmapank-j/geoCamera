// src/components/PhotoCard.tsx
import { useEffect, useMemo, useState } from 'react';
import { PhotoRecordLocal, deletePhoto } from '@/lib/localDB';
import { triggerHaptic } from '@/lib/feedback';

export type GalleryViewMode = 'grid' | 'cards' | 'timeline';

interface Props {
  photo: PhotoRecordLocal;
  viewMode?: GalleryViewMode;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDeleted: (id: string) => void;
  onView: (photo: PhotoRecordLocal) => void;
}

export default function PhotoCard({
  photo,
  viewMode = 'cards',
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onDeleted,
  onView,
}: Props) {
  const [thumbURL, setThumbURL] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    setThumbURL(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);

  const formattedDate = useMemo(() => {
    const d = new Date(photo.capturedAt);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }, [photo.capturedAt]);

  const formattedTime = useMemo(() => {
    return new Date(photo.capturedAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [photo.capturedAt]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const url = URL.createObjectURL(photo.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geocamera-${photo.id}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    const file = new File([photo.blob], 'geocamera-photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'GeoTag Camera Photo',
          text: photo.latitude
            ? `📍 ${photo.latitude.toFixed(5)}, ${photo.longitude?.toFixed(5)} (${formattedDate})`
            : `Photo taken on ${formattedDate}`,
        });
        triggerHaptic('success');
      } catch (err: any) {
        if (err.name !== 'AbortError') triggerHaptic('warning');
      }
    } else {
      triggerHaptic('warning');
      alert('Web Share is not supported on this browser — use Download instead.');
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('warning');
    if (!confirm('Permanently delete this photo? This cannot be undone.')) return;
    await deletePhoto(photo.id);
    triggerHaptic('medium');
    onDeleted(photo.id);
  };

  const handleCopyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (photo.latitude === undefined || photo.longitude === undefined) return;
    const coordsStr = `${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`;
    navigator.clipboard?.writeText(coordsStr);
    triggerHaptic('selection');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardClick = () => {
    if (isSelectMode && onToggleSelect) {
      triggerHaptic('selection');
      onToggleSelect(photo.id);
    } else {
      triggerHaptic('light');
      onView(photo);
    }
  };

  // ── 1. COMPACT GRID VIEW (Instagram / Photos style edge-to-edge tile) ──
  if (viewMode === 'grid') {
    return (
      <div
        onClick={handleCardClick}
        className={`group relative aspect-square overflow-hidden rounded-xl bg-gray-100 cursor-pointer shadow-xs border transition-all duration-150 btn-press ${
          isSelected
            ? 'ring-3 ring-blue-600 border-blue-600 scale-[0.98]'
            : 'border-gray-200/80 hover:border-blue-400'
        }`}
      >
        {thumbURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbURL} alt="Photo" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">
            📷
          </div>
        )}

        {/* Selection badge */}
        {isSelectMode && (
          <div className="absolute top-2 right-2 z-10">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-white'
                  : 'bg-black/40 text-transparent border-2 border-white/80 backdrop-blur-xs'
              }`}
            >
              {isSelected ? '✓' : ''}
            </div>
          </div>
        )}

        {/* Floating location / date indicator */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 pt-6 flex items-end justify-between text-white text-[10px]">
          <span className="font-medium drop-shadow-sm truncate">{formattedDate}</span>
          {photo.latitude !== undefined && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-blue-600/90 font-mono text-[9px] drop-shadow-sm">
              📍 GPS
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── 2. TIMELINE / FULL-WIDTH FEED VIEW ──
  if (viewMode === 'timeline') {
    return (
      <div
        onClick={handleCardClick}
        className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all duration-200 cursor-pointer ${
          isSelected
            ? 'ring-3 ring-blue-600 border-blue-600 bg-blue-50/20'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
        }`}
      >
        <div className="relative aspect-video w-full bg-gray-900 overflow-hidden">
          {thumbURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbURL} alt="Photo" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">
              📷
            </div>
          )}

          {/* Top overlay pills */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-full glass-dark text-white text-xs font-medium flex items-center gap-1.5">
              <span>📅</span> {formattedDate} · {formattedTime}
            </span>

            {isSelectMode ? (
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-lg ring-2 ring-white'
                    : 'bg-black/50 text-transparent border-2 border-white'
                }`}
              >
                {isSelected ? '✓' : ''}
              </div>
            ) : photo.latitude !== undefined ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-600/90 text-white text-xs font-semibold backdrop-blur-xs flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Geotagged
              </span>
            ) : null}
          </div>
        </div>

        {/* Card info */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              {photo.latitude !== undefined && photo.longitude !== undefined ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                    {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                  </span>
                  {photo.accuracy !== undefined && (
                    <span className="text-xs text-gray-500">±{photo.accuracy.toFixed(0)}m</span>
                  )}
                </div>
              ) : (
                <span className="text-xs font-medium text-gray-400">No GPS location</span>
              )}
            </div>

            {photo.latitude !== undefined && (
              <button
                onClick={handleCopyCoords}
                className="btn-press text-xs font-medium px-2 py-1 rounded-md text-gray-600 hover:text-blue-600 hover:bg-gray-100 flex items-center gap-1"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            )}
          </div>

          {photo.address && (
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">{photo.address}</p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleDownload}
              className="btn-press flex-1 py-2 text-xs rounded-xl bg-gray-100 text-gray-800 hover:bg-blue-50 hover:text-blue-700 font-semibold flex items-center justify-center gap-1.5"
            >
              <span>⬇</span> Download
            </button>
            <button
              onClick={handleShare}
              className="btn-press flex-1 py-2 text-xs rounded-xl bg-gray-100 text-gray-800 hover:bg-purple-50 hover:text-purple-700 font-semibold flex items-center justify-center gap-1.5"
            >
              <span>↗</span> Share
            </button>
            <button
              onClick={handleDelete}
              className="btn-press px-3.5 py-2 text-xs rounded-xl bg-red-50 text-red-600 hover:bg-red-100 font-semibold flex items-center justify-center"
              aria-label="Delete photo"
            >
              🗑
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 3. STANDARD CARDS VIEW (Default 2-3 column structured card) ──
  return (
    <div
      onClick={handleCardClick}
      className={`group bg-white rounded-2xl shadow-xs overflow-hidden border transition-all duration-150 cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'ring-3 ring-blue-600 border-blue-600 scale-[0.98]'
          : 'border-gray-200/90 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-square bg-gray-100 overflow-hidden">
        {thumbURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbURL}
            alt="Photo"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">
            📷
          </div>
        )}

        {/* Select mode checkbox */}
        {isSelectMode && (
          <div className="absolute top-2 right-2 z-10">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-white'
                  : 'bg-black/40 text-transparent border-2 border-white backdrop-blur-xs'
              }`}
            >
              {isSelected ? '✓' : ''}
            </div>
          </div>
        )}

        {/* Mini GPS badge on image */}
        {photo.latitude !== undefined && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            GPS
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-2.5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-baseline justify-between mb-0.5">
            <span className="font-bold text-xs text-gray-800">{formattedDate}</span>
            <span className="text-[10px] text-gray-400">{formattedTime}</span>
          </div>

          {photo.latitude !== undefined && photo.longitude !== undefined ? (
            <div className="text-[11px] text-blue-600 font-mono font-medium truncate">
              {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
              {photo.accuracy !== undefined && (
                <span className="text-gray-400 ml-1 text-[9px] font-sans">
                  ±{photo.accuracy.toFixed(0)}m
                </span>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-gray-400 italic">No coordinates</div>
          )}

          {photo.address && (
            <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{photo.address}</p>
          )}
        </div>

        {/* Action icons row */}
        {!isSelectMode && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-gray-100">
            <button
              onClick={handleDownload}
              className="btn-press flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700 flex items-center justify-center gap-1"
              title="Download image"
            >
              <span>⬇</span>
            </button>
            <button
              onClick={handleShare}
              className="btn-press flex-1 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 hover:bg-purple-50 text-gray-700 hover:text-purple-700 flex items-center justify-center gap-1"
              title="Share image"
            >
              <span>↗</span>
            </button>
            <button
              onClick={handleDelete}
              className="btn-press p-1.5 text-[11px] font-semibold rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center"
              title="Delete photo"
            >
              🗑
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
