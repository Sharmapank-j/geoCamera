// src/pages/gallery.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getAllPhotos,
  deletePhotos,
  getStorageStats,
  PhotoRecordLocal,
} from '@/lib/localDB';
import PhotoCard, { GalleryViewMode } from '@/components/PhotoCard';
import NavBar from '@/components/NavBar';
import { exportMetadataJSON, exportZIP, importZIP } from '@/lib/exportImport';
import { triggerHaptic } from '@/lib/feedback';
import { toDMS } from '@/lib/overlay';

type FilterType = 'all' | 'geotagged' | 'today' | 'month';
type SortOrder = 'newest' | 'oldest';

export default function GalleryPage() {
  const [photos, setPhotos] = useState<PhotoRecordLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [viewMode, setViewMode] = useState<GalleryViewMode>('cards');

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lightbox / Full view state
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [viewURL, setViewURL] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Storage stats
  const [stats, setStats] = useState<{ totalPhotos: number; geotaggedPhotos: number; totalBytes: number } | null>(null);

  // Notifications
  const [actionMsg, setActionMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [all, storage] = await Promise.all([getAllPhotos(), getStorageStats()]);
    setPhotos(all);
    setStats(storage);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cleanup lightbox URL
  useEffect(() => {
    return () => {
      if (viewURL) URL.revokeObjectURL(viewURL);
    };
  }, [viewURL]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  // ── FILTERING & SORTING ──────────────────────────────────────────────────────
  const filteredPhotos = useMemo(() => {
    let result = [...photos];

    // Search query
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.capturedAt.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q) ||
          p.latitude?.toFixed(4).includes(q) ||
          p.longitude?.toFixed(4).includes(q) ||
          p.note?.toLowerCase().includes(q)
      );
    }

    // Filter pills
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    if (filter === 'geotagged') {
      result = result.filter((p) => p.latitude !== undefined && p.longitude !== undefined);
    } else if (filter === 'today') {
      result = result.filter((p) => p.capturedAt.startsWith(todayStr));
    } else if (filter === 'month') {
      result = result.filter((p) => p.capturedAt.startsWith(monthStr));
    }

    // Sort order
    result.sort((a, b) => {
      const timeA = new Date(a.capturedAt).getTime();
      const timeB = new Date(b.capturedAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [photos, search, filter, sortOrder]);

  // ── LIGHTBOX NAVIGATION ──────────────────────────────────────────────────────
  const openView = (photo: PhotoRecordLocal) => {
    const idx = filteredPhotos.findIndex((p) => p.id === photo.id);
    if (idx !== -1) {
      if (viewURL) URL.revokeObjectURL(viewURL);
      setViewIndex(idx);
      setViewURL(URL.createObjectURL(filteredPhotos[idx].blob));
      setIsZoomed(false);
    }
  };

  const closeView = () => {
    triggerHaptic('light');
    if (viewURL) URL.revokeObjectURL(viewURL);
    setViewURL(null);
    setViewIndex(null);
    setIsZoomed(false);
  };

  const nextPhoto = () => {
    if (viewIndex === null || viewIndex >= filteredPhotos.length - 1) return;
    triggerHaptic('selection');
    const newIdx = viewIndex + 1;
    if (viewURL) URL.revokeObjectURL(viewURL);
    setViewIndex(newIdx);
    setViewURL(URL.createObjectURL(filteredPhotos[newIdx].blob));
    setIsZoomed(false);
  };

  const prevPhoto = () => {
    if (viewIndex === null || viewIndex <= 0) return;
    triggerHaptic('selection');
    const newIdx = viewIndex - 1;
    if (viewURL) URL.revokeObjectURL(viewURL);
    setViewIndex(newIdx);
    setViewURL(URL.createObjectURL(filteredPhotos[newIdx].blob));
    setIsZoomed(false);
  };

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewIndex === null) return;
      if (e.key === 'Escape') closeView();
      if (e.key === 'ArrowRight') nextPhoto();
      if (e.key === 'ArrowLeft') prevPhoto();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewIndex, filteredPhotos]);

  // ── MULTI-SELECT HANDLERS ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    triggerHaptic('medium');
    setSelectedIds(new Set(filteredPhotos.map((p) => p.id)));
  };

  const deselectAll = () => {
    triggerHaptic('light');
    setSelectedIds(new Set());
  };

  const toggleSelectMode = () => {
    triggerHaptic('medium');
    setIsSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  // ── BATCH ACTIONS ────────────────────────────────────────────────────────────
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    triggerHaptic('warning');
    if (!confirm(`Permanently delete ${selectedIds.size} selected photo(s)? This cannot be undone.`)) {
      return;
    }
    await deletePhotos(Array.from(selectedIds));
    triggerHaptic('medium');
    flash(`✓ Deleted ${selectedIds.size} photo(s)`);
    setSelectedIds(new Set());
    setIsSelectMode(false);
    await loadData();
  };

  const handleBatchExportZIP = async () => {
    if (selectedIds.size === 0) return;
    triggerHaptic('medium');
    try {
      const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
      await exportZIP(selectedPhotos);
      triggerHaptic('success');
      flash(`✓ Exported ${selectedPhotos.length} photo(s) in ZIP`);
    } catch (e: any) {
      flash(`Export failed: ${e.message}`);
    }
  };

  // ── GENERAL EXPORT/IMPORT ────────────────────────────────────────────────────
  const handleExportJSON = async () => {
    triggerHaptic('medium');
    try {
      await exportMetadataJSON();
      triggerHaptic('success');
      flash('✓ Metadata JSON downloaded');
    } catch (e: any) {
      flash(`Error: ${e.message}`);
    }
  };

  const handleExportAllZIP = async () => {
    triggerHaptic('medium');
    try {
      await exportZIP();
      triggerHaptic('success');
      flash('✓ Full ZIP backup downloaded');
    } catch (e: any) {
      flash(`Error: ${e.message}`);
    }
  };

  const handleImportZIP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('medium');
    try {
      const count = await importZIP(file);
      triggerHaptic('success');
      flash(`✓ Successfully restored ${count} photo(s)`);
      await loadData();
    } catch (err: any) {
      triggerHaptic('warning');
      flash(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  };

  const copyCurrentCoords = () => {
    if (viewIndex === null) return;
    const current = filteredPhotos[viewIndex];
    if (!current || current.latitude === undefined) return;
    navigator.clipboard?.writeText(`${current.latitude.toFixed(6)}, ${current.longitude!.toFixed(6)}`);
    triggerHaptic('selection');
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const downloadCurrentViewPhoto = () => {
    if (viewIndex === null) return;
    const current = filteredPhotos[viewIndex];
    if (!current) return;
    triggerHaptic('medium');
    const url = URL.createObjectURL(current.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geocamera-${current.id}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const shareCurrentViewPhoto = async () => {
    if (viewIndex === null) return;
    const current = filteredPhotos[viewIndex];
    if (!current) return;
    triggerHaptic('medium');
    const file = new File([current.blob], 'geocamera-photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'GeoTag Camera Photo',
          text: current.latitude ? `📍 ${current.latitude.toFixed(5)}, ${current.longitude!.toFixed(5)}` : 'Photo from GeoTag Camera',
        });
        triggerHaptic('success');
      } catch (err: any) {
        if (err.name !== 'AbortError') triggerHaptic('warning');
      }
    }
  };

  const deleteCurrentViewPhoto = async () => {
    if (viewIndex === null) return;
    const current = filteredPhotos[viewIndex];
    if (!current) return;
    triggerHaptic('warning');
    if (!confirm('Permanently delete this photo? This cannot be undone.')) return;
    await deletePhotos([current.id]);
    triggerHaptic('medium');
    closeView();
    await loadData();
  };

  const activePhoto = viewIndex !== null ? filteredPhotos[viewIndex] : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-28 select-none">
      {/* ── TOP HEADER & TOOLBAR ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-xs">
        <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Gallery</h1>
            {stats && (
              <p className="text-[11px] text-gray-500 font-medium">
                {stats.totalPhotos} photos · {stats.geotaggedPhotos} geotagged ·{' '}
                {(stats.totalBytes / (1024 * 1024)).toFixed(1)} MB used
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Multi-Select Toggle Button */}
            <button
              onClick={toggleSelectMode}
              className={`btn-press px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isSelectMode
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {isSelectMode ? 'Done' : 'Select'}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-2.5">
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
            <input
              type="search"
              placeholder="Search by date, coordinates, or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-sm p-0.5"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* View Switcher & Filter Pills */}
        <div className="px-4 pb-3 flex items-center justify-between gap-2 overflow-x-auto">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 shrink-0">
            {[
              { id: 'all', label: `All (${photos.length})` },
              { id: 'geotagged', label: `📍 Geotagged (${photos.filter(p => p.latitude !== undefined).length})` },
              { id: 'today', label: '📅 Today' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  triggerHaptic('selection');
                  setFilter(f.id as FilterType);
                }}
                className={`btn-press px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  filter === f.id
                    ? 'bg-gray-900 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* View Mode Segmented Controls */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl shrink-0">
            <button
              onClick={() => {
                triggerHaptic('selection');
                setViewMode('grid');
              }}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Compact Grid view"
            >
              ⊞
            </button>
            <button
              onClick={() => {
                triggerHaptic('selection');
                setViewMode('cards');
              }}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'cards' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Detailed Cards view"
            >
              ▦
            </button>
            <button
              onClick={() => {
                triggerHaptic('selection');
                setViewMode('timeline');
              }}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'timeline' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
              title="Full Width Timeline Feed"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Select Mode Subheader */}
        {isSelectMode && (
          <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between text-xs animate-fade-in">
            <span className="font-semibold text-blue-800">
              {selectedIds.size} of {filteredPhotos.length} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="btn-press font-semibold text-blue-700 hover:underline"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="btn-press font-semibold text-gray-600 hover:underline"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* Action Flash Toast */}
        {actionMsg && (
          <div className="mx-4 my-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <span>✓</span> {actionMsg}
          </div>
        )}
      </div>

      {/* ── PHOTO COLLECTION GRID ── */}
      <div className="p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <div className="w-8 h-8 rounded-full border-3 border-blue-500 border-t-transparent animate-spin" />
            <span className="text-xs font-medium">Loading local gallery…</span>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
            <span className="text-5xl">{search ? '🔍' : '📸'}</span>
            <p className="text-sm font-semibold text-gray-700">
              {search ? 'No photos matching your search' : 'No photos in local gallery'}
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              {search
                ? 'Try searching by a different date, year, or coordinate keyword.'
                : 'Take your first geotagged photo or import an existing picture from your device.'}
            </p>
            <Link
              href="/camera"
              className="btn-press mt-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20"
            >
              Open Camera
            </Link>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5'
                : viewMode === 'timeline'
                ? 'flex flex-col gap-4 max-w-2xl mx-auto'
                : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5'
            }
          >
            {filteredPhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                viewMode={viewMode}
                isSelectMode={isSelectMode}
                isSelected={selectedIds.has(photo.id)}
                onToggleSelect={toggleSelect}
                onDeleted={() => loadData()}
                onView={openView}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── FLOATING BATCH ACTIONS BAR (In select mode) ── */}
      {isSelectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-16 inset-x-4 z-30 max-w-lg mx-auto bg-gray-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-gray-700 flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2 pl-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
              {selectedIds.size}
            </span>
            <span className="text-xs font-medium text-gray-200">Selected</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleBatchExportZIP}
              className="btn-press px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>🗜</span> Export ZIP
            </button>
            <button
              onClick={handleBatchDelete}
              className="btn-press px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <span>🗑</span> Delete
            </button>
          </div>
        </div>
      )}

      {/* ── FULLSCREEN LIGHTBOX MODAL ── */}
      {activePhoto && viewURL && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between"
          onClick={closeView}
        >
          {/* Top Navbar */}
          <div
            className="flex items-center justify-between p-4 z-20 text-white bg-gradient-to-b from-black/80 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium text-gray-300">
                {viewIndex! + 1} / {filteredPhotos.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom Toggle */}
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  setIsZoomed((prev) => !prev);
                }}
                className={`btn-press p-2 rounded-full text-xs font-semibold ${
                  isZoomed ? 'bg-blue-600 text-white' : 'bg-white/15 text-gray-200'
                }`}
                title="Toggle zoom"
              >
                {isZoomed ? '🔍 2x' : '🔍 1x'}
              </button>

              <button
                onClick={closeView}
                className="btn-press p-2 rounded-full bg-white/15 hover:bg-white/25 text-white"
                aria-label="Close viewer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Photo Container with Next/Prev Arrow Buttons */}
          <div
            className="relative flex-1 flex items-center justify-center p-2 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Prev Button */}
            {viewIndex! > 0 && (
              <button
                onClick={prevPhoto}
                className="btn-press absolute left-3 z-30 p-3 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white shadow-lg text-lg"
                aria-label="Previous photo"
              >
                ◀
              </button>
            )}

            {/* Photo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewURL}
              alt="Full view"
              className={`max-w-full max-h-[72vh] object-contain transition-transform duration-200 select-none ${
                isZoomed ? 'scale-150 cursor-grab' : 'scale-100'
              }`}
            />

            {/* Next Button */}
            {viewIndex! < filteredPhotos.length - 1 && (
              <button
                onClick={nextPhoto}
                className="btn-press absolute right-3 z-30 p-3 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white shadow-lg text-lg"
                aria-label="Next photo"
              >
                ▶
              </button>
            )}
          </div>

          {/* Bottom Interactive Metadata Drawer */}
          <div
            className="p-4 bg-gradient-to-t from-black via-black/90 to-transparent text-white z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-xl mx-auto flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">
                    {new Date(activePhoto.capturedAt).toLocaleString()}
                  </p>
                  {activePhoto.latitude !== undefined && (
                    <div className="flex flex-col gap-0.5 mt-1 font-mono text-xs text-blue-400">
                      <div className="flex items-center gap-2">
                        <span>
                          DD:  {activePhoto.latitude.toFixed(6)}°, {activePhoto.longitude!.toFixed(6)}°
                        </span>
                        {activePhoto.accuracy !== undefined && (
                          <span className="text-amber-300 font-sans text-[11px]">
                            (±{activePhoto.accuracy.toFixed(0)}m)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-emerald-400">
                        DMS: {toDMS(activePhoto.latitude, true)}, {toDMS(activePhoto.longitude!, false)}
                      </div>
                    </div>
                  )}
                  {activePhoto.address && (
                    <p className="text-xs text-gray-300 mt-1 line-clamp-1">{activePhoto.address}</p>
                  )}
                  {activePhoto.note && (
                    <p className="text-xs text-yellow-300/90 mt-1 flex items-center gap-1 font-mono">
                      <span>🏷️</span>
                      <span className="italic">{activePhoto.note}</span>
                    </p>
                  )}
                </div>

                {activePhoto.latitude !== undefined && (
                  <button
                    onClick={copyCurrentCoords}
                    className="btn-press shrink-0 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-gray-200 flex items-center gap-1 border border-white/10"
                  >
                    {copiedCoords ? '✓ Copied' : '📋 Copy GPS'}
                  </button>
                )}
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <button
                  onClick={downloadCurrentViewPhoto}
                  className="btn-press flex-1 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
                >
                  <span>⬇</span> Download
                </button>
                <button
                  onClick={shareCurrentViewPhoto}
                  className="btn-press flex-1 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
                >
                  <span>↗</span> Share
                </button>
                {activePhoto.latitude !== undefined && (
                  <Link
                    href="/map"
                    onClick={closeView}
                    className="btn-press flex-1 py-2 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
                  >
                    <span>🗺</span> Map
                  </Link>
                )}
                <button
                  onClick={deleteCurrentViewPhoto}
                  className="btn-press px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-semibold text-xs"
                  aria-label="Delete photo"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for ZIP import */}
      <input ref={importRef} type="file" accept=".zip" className="hidden" onChange={handleImportZIP} />

      <NavBar active="gallery" />
    </div>
  );
}
