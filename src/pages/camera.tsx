// src/pages/camera.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { generateOverlay, OverlayMeta } from '@/lib/overlay';
import { addPhoto } from '@/lib/localDB';
import NavBar from '@/components/NavBar';

type Mode = 'camera' | 'preview';

interface GpsData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsData | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // ── Camera stream management ────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    // Stop any existing stream first
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus('');
    } catch {
      setStatus('Camera unavailable or permission denied.');
    }
  }, [facingMode]);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    return () => {
      // Keep stream alive while on camera screen
    };
  }, [mode, startCamera]);

  // Stop stream when leaving camera mode
  useEffect(() => {
    if (mode !== 'camera') {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [mode]);

  // Revoke object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
    };
  }, [previewURL]);

  // ── Capture ─────────────────────────────────────────────────────────────────
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (facingMode === 'user') ctx.setTransform(1, 0, 0, 1, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setFinalBlob(null);
        setGps(null);
        const url = URL.createObjectURL(blob);
        setPreviewURL(url);
        setMode('preview');
      },
      'image/jpeg',
      0.95
    );
  };

  // ── Import existing photo ────────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = new Blob([file], { type: file.type });
    setCapturedBlob(blob);
    setFinalBlob(null);
    setGps(null);
    if (previewURL) URL.revokeObjectURL(previewURL);
    setPreviewURL(URL.createObjectURL(blob));
    setMode('preview');
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  // ── GPS ──────────────────────────────────────────────────────────────────────
  const attachLocation = async () => {
    if (!navigator.geolocation) {
      setStatus('Geolocation not supported by this browser.');
      return;
    }
    setIsGettingGps(true);
    setStatus('Getting GPS…');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const gpsData: GpsData = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        setGps(gpsData);
        setStatus('');
        setIsGettingGps(false);

        // Generate overlay with GPS data
        if (capturedBlob) {
          await rebuildOverlay(capturedBlob, gpsData);
        }
      },
      (err) => {
        setIsGettingGps(false);
        setStatus(`GPS denied: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const rebuildOverlay = async (blob: Blob, gpsData?: GpsData | null) => {
    setIsProcessing(true);
    try {
      const meta: OverlayMeta = {
        capturedAt: gpsData ? new Date(gpsData.timestamp).toISOString() : new Date().toISOString(),
        ...(gpsData && {
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          accuracy: gpsData.accuracy,
        }),
      };
      const overlaid = await generateOverlay(blob, meta);
      setFinalBlob(overlaid);
      if (previewURL) URL.revokeObjectURL(previewURL);
      setPreviewURL(URL.createObjectURL(overlaid));
    } catch (err) {
      console.error('Overlay failed:', err);
      setStatus('Overlay generation failed – saving original.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const savePhoto = async (withOverlay: boolean) => {
    const blobToSave = withOverlay
      ? (finalBlob ?? capturedBlob)
      : capturedBlob;
    if (!blobToSave) return;

    setIsProcessing(true);
    try {
      // If saving without location and no overlay yet, still burn in a timestamp overlay
      let finalToSave = blobToSave;
      if (!finalBlob) {
        try {
          finalToSave = await generateOverlay(blobToSave, {
            capturedAt: new Date().toISOString(),
          });
        } catch {
          finalToSave = blobToSave;
        }
      }

      const id = crypto.randomUUID();
      await addPhoto({
        id,
        blob: finalToSave,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        accuracy: gps?.accuracy,
        capturedAt: gps ? new Date(gps.timestamp).toISOString() : new Date().toISOString(),
      });

      setSavedMsg('✓ Saved to gallery');
      setTimeout(() => setSavedMsg(''), 2500);
      retake();
    } catch (err) {
      console.error(err);
      setStatus('Save failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const downloadPhoto = () => {
    const blob = finalBlob ?? capturedBlob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geocamera-${Date.now()}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // ── Share ─────────────────────────────────────────────────────────────────────
  const sharePhoto = async () => {
    const blob = finalBlob ?? capturedBlob;
    if (!blob) return;
    const file = new File([blob], 'geocamera-photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'GeoTag Camera',
          text: gps
            ? `📍 ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
            : 'Photo from GeoTag Camera',
        });
      } catch (e: any) {
        if (e.name !== 'AbortError') setStatus('Share failed.');
      }
    } else {
      setStatus('Web Share not supported — use Download instead.');
    }
  };

  // ── Retake ────────────────────────────────────────────────────────────────────
  const retake = () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    setCapturedBlob(null);
    setFinalBlob(null);
    setPreviewURL(null);
    setGps(null);
    setStatus('');
    setMode('camera');
  };

  // ── Switch camera ─────────────────────────────────────────────────────────────
  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col pb-16">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold tracking-wide">📍 GeoTag Camera</h1>
        {mode === 'camera' && (
          <button
            onClick={switchCamera}
            className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 active:bg-gray-600 transition"
            aria-label="Switch camera"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        )}
      </header>

      {/* Status bar */}
      {status && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-900/60 text-red-200 text-sm">
          {status}
        </div>
      )}
      {savedMsg && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-green-900/60 text-green-200 text-sm">
          {savedMsg}
        </div>
      )}

      {/* ── CAMERA MODE ── */}
      {mode === 'camera' && (
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 bg-black overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
            {/* Grid overlay (aesthetic) */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/10" />
                ))}
              </div>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="flex items-center justify-between px-8 py-6">
            {/* Import */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center active:scale-95 transition"
              aria-label="Import photo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImport} />

            {/* Shutter */}
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full bg-white border-4 border-gray-400 shadow-lg active:scale-95 transition hover:border-blue-400"
              aria-label="Take photo"
            >
              <span className="block w-full h-full rounded-full bg-white hover:bg-gray-100" />
            </button>

            {/* Placeholder to center shutter */}
            <div className="w-14 h-14" />
          </div>
        </div>
      )}

      {/* ── PREVIEW MODE ── */}
      {mode === 'preview' && (
        <div className="flex-1 flex flex-col">
          {/* Preview image */}
          <div className="relative bg-black flex items-center justify-center">
            {previewURL && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewURL}
                alt="Preview"
                className="w-full max-h-[60vh] object-contain"
              />
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
                <span className="text-sm text-blue-200">Rendering overlay…</span>
              </div>
            )}
          </div>

          {/* GPS status badge */}
          <div className="px-4 py-3 flex items-center gap-2">
            {gps ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <span className="text-lg">✓</span>
                <span>
                  GPS attached — {gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}{' '}
                  <span className="text-gray-400">(±{gps.accuracy.toFixed(0)}m)</span>
                </span>
              </div>
            ) : (
              <div className="text-gray-400 text-sm">No location attached</div>
            )}
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* Row 1 */}
            <div className="flex gap-3">
              <button
                onClick={retake}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-medium text-sm active:scale-95 transition"
              >
                ↩ Retake
              </button>
              <button
                onClick={attachLocation}
                disabled={isGettingGps || isProcessing}
                className="flex-1 py-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 font-medium text-sm active:scale-95 transition"
              >
                {isGettingGps ? '⌛ Getting GPS…' : gps ? '🔄 Update GPS' : '📍 Attach GPS'}
              </button>
            </div>

            {/* Row 2 */}
            <div className="flex gap-3">
              <button
                onClick={() => savePhoto(true)}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl bg-green-700 hover:bg-green-600 disabled:opacity-60 font-bold text-sm active:scale-95 transition"
              >
                💾 Save to Gallery
              </button>
            </div>

            {/* Row 3 */}
            <div className="flex gap-3">
              <button
                onClick={downloadPhoto}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-sm active:scale-95 transition"
              >
                ⬇ Download
              </button>
              <button
                onClick={sharePhoto}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-sm active:scale-95 transition"
              >
                ↗ Share
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Your photos stay on this device unless you export them.
            </p>
          </div>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
      <NavBar active="camera" />
    </div>
  );
}
