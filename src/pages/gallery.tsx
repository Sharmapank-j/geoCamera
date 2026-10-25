// src/pages/gallery.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAllPhotos, PhotoRecordLocal } from '@/lib/localDB';
import PhotoCard from '@/components/PhotoCard';
import NavBar from '@/components/NavBar';
import { exportMetadataJSON, exportZIP, importZIP } from '@/lib/exportImport';
import { clearAll } from '@/lib/localDB';

export default function GalleryPage() {
  const [photos, setPhotos] = useState<PhotoRecordLocal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewPhoto, setViewPhoto] = useState<PhotoRecordLocal | null>(null);
  const [viewURL, setViewURL] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getAllPhotos();
    setPhotos(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Cleanup view URL
  useEffect(() => {
    return () => {
      if (viewURL) URL.revokeObjectURL(viewURL);
    };
  }, [viewURL]);

  const openView = (photo: PhotoRecordLocal) => {
    if (viewURL) URL.revokeObjectURL(viewURL);
    setViewURL(URL.createObjectURL(photo.blob));
    setViewPhoto(photo);
  };

  const closeView = () => {
    if (viewURL) URL.revokeObjectURL(viewURL);
    setViewURL(null);
    setViewPhoto(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter(
      (p) =>
        p.capturedAt.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.latitude?.toFixed(4).includes(q) ||
        p.longitude?.toFixed(4).includes(q)
    );
  }, [photos, search]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleExportJSON = async () => {
    try {
      await exportMetadataJSON();
      flash('✓ Metadata JSON downloaded');
    } catch (e: any) {
      flash(`Error: ${e.message}`);
    }
  };

  const handleExportZIP = async () => {
    try {
      await exportZIP();
      flash('✓ ZIP backup downloaded');
    } catch (e: any) {
      flash(`Error: ${e.message}`);
    }
  };

  const handleImportZIP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importZIP(file);
      flash(`✓ Imported ${count} photo(s)`);
      await load();
    } catch (err: any) {
      flash(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        'This will permanently delete ALL photos and data from this device. This cannot be undone.\n\nContinue?'
      )
    )
      return;
    await clearAll();
    setPhotos([]);
    flash('All data cleared.');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Gallery</h1>

        {/* Search */}
        <input
          type="search"
          placeholder="Search by date, location, coordinates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        {/* Export/Import toolbar */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={handleExportJSON}
            className="flex-1 min-w-[120px] py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition font-medium"
          >
            📄 Export JSON
          </button>
          <button
            onClick={handleExportZIP}
            className="flex-1 min-w-[120px] py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition font-medium"
          >
            🗜 Export ZIP
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex-1 min-w-[120px] py-1.5 text-xs rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition font-medium"
          >
            📥 Import ZIP
          </button>
          <button
            onClick={handleClearAll}
            className="flex-1 min-w-[120px] py-1.5 text-xs rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition font-medium"
          >
            🗑 Clear All
          </button>
        </div>
        <input ref={importRef} type="file" accept=".zip" className="hidden" onChange={handleImportZIP} />

        {actionMsg && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-xs">
            {actionMsg}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-400">
            <span className="text-5xl">{search ? '🔍' : '📷'}</span>
            <p>{search ? 'No photos match your search.' : 'No photos yet. Take one!'}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">
              {filtered.length} photo{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onDeleted={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
                  onView={openView}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Full-screen view modal */}
      {viewPhoto && viewURL && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
          onClick={closeView}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewURL}
            alt="Full view"
            className="max-w-full max-h-[80vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 text-center text-white text-sm px-4" onClick={(e) => e.stopPropagation()}>
            <p>{new Date(viewPhoto.capturedAt).toLocaleString()}</p>
            {viewPhoto.latitude !== undefined && (
              <p className="font-mono text-xs text-gray-300 mt-1">
                {viewPhoto.latitude.toFixed(6)}, {viewPhoto.longitude!.toFixed(6)}
              </p>
            )}
          </div>
          <button
            onClick={closeView}
            className="mt-6 px-6 py-2 rounded-full bg-white/20 text-white text-sm hover:bg-white/30 transition"
          >
            Close
          </button>
        </div>
      )}

      <NavBar active="gallery" />
    </div>
  );
}
