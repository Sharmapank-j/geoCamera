// src/components/PhotoCard.tsx
import { useEffect, useMemo, useState } from 'react';
import { PhotoRecordLocal, deletePhoto } from '@/lib/localDB';

interface Props {
  photo: PhotoRecordLocal;
  onDeleted: (id: string) => void;
  onView: (photo: PhotoRecordLocal) => void;
}

export default function PhotoCard({ photo, onDeleted, onView }: Props) {
  const [thumbURL, setThumbURL] = useState<string | null>(null);

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

  const handleDownload = () => {
    const url = URL.createObjectURL(photo.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geocamera-${photo.id}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleShare = async () => {
    const file = new File([photo.blob], 'geocamera-photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'GeoTag Camera' });
      } catch (e: any) {
        if (e.name !== 'AbortError') alert('Share failed.');
      }
    } else {
      alert('Web Share not supported — use Download.');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this photo permanently? This cannot be undone.')) return;
    await deletePhoto(photo.id);
    onDeleted(photo.id);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
      {/* Thumbnail */}
      <button
        onClick={() => onView(photo)}
        className="w-full aspect-square overflow-hidden bg-gray-100 focus:outline-none"
        aria-label="View photo"
      >
        {thumbURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbURL} alt="Photo" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">
            🖼
          </div>
        )}
      </button>

      {/* Metadata */}
      <div className="p-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-semibold text-sm text-gray-800">{formattedDate}</span>
          <span className="text-xs text-gray-500">{formattedTime}</span>
        </div>

        {photo.latitude !== undefined && photo.longitude !== undefined ? (
          <div className="text-xs text-blue-600 font-mono">
            {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
            {photo.accuracy !== undefined && (
              <span className="text-gray-400 ml-1">(±{photo.accuracy.toFixed(0)}m)</span>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400">No location</div>
        )}

        {photo.address && (
          <p className="text-xs text-gray-600 mt-0.5 truncate">{photo.address}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDownload}
            className="flex-1 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition"
          >
            ⬇ Download
          </button>
          <button
            onClick={handleShare}
            className="flex-1 py-1.5 text-xs rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium transition"
          >
            ↗ Share
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition"
          >
            🗑 Delete
          </button>
        </div>
      </div>
    </div>
  );
}
