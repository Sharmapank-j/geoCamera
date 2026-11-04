// src/pages/camera.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { generateOverlay, OverlayMeta, toDMS, getHeadingString } from '@/lib/overlay';
import { addPhoto } from '@/lib/localDB';
import NavBar from '@/components/NavBar';
import {
  triggerHaptic,
  playShutterSound,
  playTickSound,
  primeAudioContext,
  getAutoGpsEnabled,
  setAutoGpsEnabled,
  getHighAccuracyEnabled,
} from '@/lib/feedback';

type Mode = 'camera' | 'preview';
type GridMode = 'none' | '3x3' | 'crosshair';
type TimerDuration = 0 | 3 | 5;
type OverlayStyle = 'pro' | 'badge' | 'minimal';
type AspectRatioMode = '4:3' | '16:9' | '1:1' | 'full';

interface GpsData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  address?: string;
}

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noteDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const [mode, setMode] = useState<Mode>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('4:3');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<'overlay' | 'raw'>('overlay');

  // GPS & Telemetry state
  const [gps, setGps] = useState<GpsData | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | undefined>(undefined);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [autoGps, setAutoGps] = useState(false);

  // User Project/Site Note
  const [noteText, setNoteText] = useState('');

  // Camera controls
  const [gridMode, setGridMode] = useState<GridMode>('3x3');
  const [timerDuration, setTimerDuration] = useState<TimerDuration>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('pro');

  // UI animations & messages
  const [shutterFlashing, setShutterFlashing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Read stored preferences on mount
  useEffect(() => {
    setAutoGps(getAutoGpsEnabled());

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const heading = (e as any).webkitCompassHeading || (e.alpha ? 360 - e.alpha : undefined);
      if (heading !== undefined && !isNaN(heading)) {
        setDeviceHeading(Math.round(heading));
      }
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', handleOrientation, true);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (noteDebounceRef.current) {
        clearTimeout(noteDebounceRef.current);
      }
    };
  }, []);

  // ── Camera stream management ────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
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
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
      }
      setStatus('');
    } catch {
      setStatus('Camera unavailable or permission denied.');
    }
  }, [facingMode]);

  useEffect(() => {
    if (mode === 'camera') startCamera();
  }, [mode, startCamera]);

  useEffect(() => {
    if (mode !== 'camera') {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
    };
  }, [previewURL]);

  // ── GPS & Reverse Geocoding ──────────────────────────────────────────────────
  const fetchGps = useCallback((): Promise<GpsData | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setStatus('Geolocation not supported by this browser.');
        resolve(null);
        return;
      }
      setIsGettingGps(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // Call server-side geocoder API route (Google Maps Platform / Nominatim proxy)
          let resolvedAddress: string | undefined = undefined;
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              if (data.formattedAddress) {
                resolvedAddress = data.formattedAddress;
              }
            }
          } catch {
            // Graceful fallback to coordinate descriptor
          }

          const gpsData: GpsData = {
            latitude: lat,
            longitude: lng,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude ?? undefined,
            heading: pos.coords.heading ?? deviceHeading ?? undefined,
            speed: pos.coords.speed ?? undefined,
            timestamp: pos.timestamp,
            address: resolvedAddress,
          };

          setGps(gpsData);
          setIsGettingGps(false);
          resolve(gpsData);
        },
        (err) => {
          setIsGettingGps(false);
          setStatus(`GPS denied: ${err.message}`);
          resolve(null);
        },
        {
          enableHighAccuracy: getHighAccuracyEnabled(),
          timeout: 12000,
          maximumAge: 5000,
        }
      );
    });
  }, [deviceHeading]);

  const handleManualGpsTrigger = async () => {
    triggerHaptic('medium');
    const data = await fetchGps();
    if (data) {
      triggerHaptic('success');
    }
  };

  // ── Capture with Aspect Ratio Precision & Haptics ────────────────────────────
  const triggerShutter = () => {
    if (countdown !== null) return;
    primeAudioContext();

    if (timerDuration > 0) {
      runCountdown(timerDuration);
    } else {
      executePhotoCapture();
    }
  };

  const runCountdown = (seconds: number) => {
    setCountdown(seconds);
    playTickSound();
    triggerHaptic('light');

    let current = seconds;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCountdown(current);
        playTickSound();
        triggerHaptic('light');
      } else {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdown(null);
        executePhotoCapture();
      }
    }, 1000);
  };

  const executePhotoCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus('Waiting for video stream to initialize…');
      return;
    }

    setShutterFlashing(true);
    playShutterSound();
    triggerHaptic('shutter');
    setTimeout(() => setShutterFlashing(false), 280);

    // Calculate source cropping rectangle according to selected aspect ratio
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    let targetW = videoW;
    let targetH = videoH;
    let srcX = 0;
    let srcY = 0;
    let srcW = videoW;
    let srcH = videoH;

    if (aspectRatio === '4:3') {
      const targetRatio = 4 / 3;
      if (videoW / videoH > targetRatio) {
        srcW = Math.round(videoH * targetRatio);
        srcX = Math.round((videoW - srcW) / 2);
      } else {
        srcH = Math.round(videoW / targetRatio);
        srcY = Math.round((videoH - srcH) / 2);
      }
      targetW = srcW;
      targetH = srcH;
    } else if (aspectRatio === '16:9') {
      const targetRatio = 16 / 9;
      if (videoW / videoH > targetRatio) {
        srcW = Math.round(videoH * targetRatio);
        srcX = Math.round((videoW - srcW) / 2);
      } else {
        srcH = Math.round(videoW / targetRatio);
        srcY = Math.round((videoH - srcH) / 2);
      }
      targetW = srcW;
      targetH = srcH;
    } else if (aspectRatio === '1:1') {
      const minDim = Math.min(videoW, videoH);
      srcW = minDim;
      srcH = minDim;
      srcX = Math.round((videoW - minDim) / 2);
      srcY = Math.round((videoH - minDim) / 2);
      targetW = minDim;
      targetH = minDim;
    }

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
    }

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setFinalBlob(null);

        let currentGps = gps;
        if (autoGps && !currentGps) {
          currentGps = await fetchGps();
        }

        await rebuildOverlay(blob, currentGps, overlayStyle, noteText);

        setMode('preview');
        setActivePreviewTab('overlay');
      },
      'image/jpeg',
      0.95
    );
  };

  // ── Import Existing Photo ────────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('medium');
    const blob = new Blob([file], { type: file.type });
    setCapturedBlob(blob);
    setFinalBlob(null);
    setGps(null);
    rebuildOverlay(blob, null, overlayStyle, noteText);
    setMode('preview');
    e.target.value = '';
  };

  // ── Rebuild Overlay with Adaptive Telemetry ──────────────────────────────────
  const rebuildOverlay = async (
    blob: Blob,
    gpsData?: GpsData | null,
    style: OverlayStyle = 'pro',
    customNote: string = noteText
  ) => {
    setIsProcessing(true);
    try {
      const meta: OverlayMeta = {
        capturedAt: gpsData ? new Date(gpsData.timestamp).toISOString() : new Date().toISOString(),
        style,
        note: customNote.trim() || undefined,
        address: gpsData?.address,
        ...(gpsData && {
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          accuracy: gpsData.accuracy,
          altitude: gpsData.altitude,
          heading: gpsData.heading ?? deviceHeading,
          speed: gpsData.speed,
        }),
      };
      const overlaid = await generateOverlay(blob, meta);
      setFinalBlob(overlaid);
      if (previewURL) URL.revokeObjectURL(previewURL);
      setPreviewURL(URL.createObjectURL(overlaid));
    } catch (err) {
      console.error('Overlay failed:', err);
      setStatus('Overlay generation failed – using raw photo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const changeOverlayStyle = (newStyle: OverlayStyle) => {
    triggerHaptic('selection');
    setOverlayStyle(newStyle);
    if (capturedBlob) {
      rebuildOverlay(capturedBlob, gps, newStyle, noteText);
    }
  };

  const handleNoteChange = (text: string) => {
    setNoteText(text);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    noteDebounceRef.current = setTimeout(() => {
      if (capturedBlob) {
        rebuildOverlay(capturedBlob, gps, overlayStyle, text);
      }
    }, 250);
  };

  // ── Attach/Update GPS from Preview ──────────────────────────────────────────
  const handleAttachGpsInPreview = async () => {
    triggerHaptic('medium');
    const data = await fetchGps();
    if (data && capturedBlob) {
      triggerHaptic('success');
      await rebuildOverlay(capturedBlob, data, overlayStyle, noteText);
    }
  };

  // ── Save to Gallery ──────────────────────────────────────────────────────────
  const savePhoto = async () => {
    triggerHaptic('medium');
    const blobToSave = activePreviewTab === 'overlay' ? (finalBlob ?? capturedBlob) : capturedBlob;
    if (!blobToSave) return;

    setIsProcessing(true);
    try {
      let finalToSave = blobToSave;
      if (activePreviewTab === 'overlay' && !finalBlob) {
        try {
          finalToSave = await generateOverlay(blobToSave, {
            capturedAt: new Date().toISOString(),
            style: overlayStyle,
            note: noteText.trim() || undefined,
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
        altitude: gps?.altitude,
        heading: gps?.heading ?? deviceHeading,
        speed: gps?.speed,
        note: noteText.trim() || undefined,
        address: gps?.address,
        capturedAt: gps ? new Date(gps.timestamp).toISOString() : new Date().toISOString(),
      });

      triggerHaptic('success');
      setSavedMsg('✓ Saved to gallery');
      setTimeout(() => setSavedMsg(''), 2500);
      retake();
    } catch (err) {
      console.error(err);
      triggerHaptic('warning');
      setStatus('Save failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPhoto = () => {
    triggerHaptic('medium');
    const blob = activePreviewTab === 'overlay' ? (finalBlob ?? capturedBlob) : capturedBlob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geocamera-${Date.now()}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const sharePhoto = async () => {
    triggerHaptic('medium');
    const blob = activePreviewTab === 'overlay' ? (finalBlob ?? capturedBlob) : capturedBlob;
    if (!blob) return;
    const file = new File([blob], 'geocamera-photo.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'GeoTag Camera Pro',
          text: gps
            ? `📍 ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)} (${toDMS(gps.latitude, true)}, ${toDMS(gps.longitude, false)})`
            : 'Photo from GeoTag Camera',
        });
        triggerHaptic('success');
      } catch (err: any) {
        if (err.name !== 'AbortError') triggerHaptic('warning');
      }
    } else {
      triggerHaptic('warning');
      setStatus('Web Share not supported on this browser — use Download.');
    }
  };

  const retake = () => {
    triggerHaptic('light');
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    if (previewURL) URL.revokeObjectURL(previewURL);
    setCapturedBlob(null);
    setFinalBlob(null);
    setPreviewURL(null);
    setNoteText('');
    setStatus('');
    setMode('camera');
  };

  const switchCamera = () => {
    triggerHaptic('medium');
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleGrid = () => {
    triggerHaptic('selection');
    setGridMode((prev) => (prev === 'none' ? '3x3' : prev === '3x3' ? 'crosshair' : 'none'));
  };

  const toggleTimer = () => {
    triggerHaptic('selection');
    setTimerDuration((prev) => (prev === 0 ? 3 : prev === 3 ? 5 : 0));
  };

  const toggleAspectRatio = () => {
    triggerHaptic('selection');
    setAspectRatio((prev) => {
      if (prev === '4:3') return '16:9';
      if (prev === '16:9') return '1:1';
      if (prev === '1:1') return 'full';
      return '4:3';
    });
  };

  const toggleAutoGpsSetting = () => {
    triggerHaptic('selection');
    const nextVal = !autoGps;
    setAutoGps(nextVal);
    setAutoGpsEnabled(nextVal);
    if (nextVal && !gps) {
      fetchGps();
    }
  };

  // Viewfinder aspect ratio container classes
  const aspectContainerClass =
    aspectRatio === '4:3'
      ? 'aspect-[4/3] max-h-full max-w-full'
      : aspectRatio === '16:9'
      ? 'aspect-[16/9] max-h-full max-w-full'
      : aspectRatio === '1:1'
      ? 'aspect-square max-h-full max-w-full'
      : 'w-full h-full';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col pb-16 select-none overflow-hidden">
      {/* ── TOP HUD HEADER ── */}
      <header className="flex items-center justify-between px-3.5 pt-3 pb-2.5 z-20">
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
            📍 GeoTag Camera Pro
          </span>
        </div>

        {mode === 'camera' && (
          <div className="flex items-center gap-1.5">
            {/* Aspect Ratio Selector */}
            <button
              onClick={toggleAspectRatio}
              className="btn-press px-2 py-1 rounded-full text-xs font-bold bg-gray-800/80 hover:bg-gray-700 text-blue-400 border border-blue-500/30 transition-all"
              title="Camera Aspect Ratio"
            >
              {aspectRatio}
            </button>

            {/* Auto GPS Toggle */}
            <button
              onClick={toggleAutoGpsSetting}
              className={`btn-press px-2 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 transition-all ${
                autoGps
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/50'
                  : 'bg-gray-800/80 text-gray-400 hover:text-gray-200'
              }`}
              title="Automatically geotag upon capture"
            >
              <span>🛰</span>
              <span className="hidden sm:inline">{autoGps ? 'Auto' : 'Manual'}</span>
            </button>

            {/* Grid Toggle */}
            <button
              onClick={toggleGrid}
              className={`btn-press p-2 rounded-full text-xs font-bold transition-colors ${
                gridMode !== 'none'
                  ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40'
                  : 'bg-gray-800/70 text-gray-400 hover:text-white'
              }`}
              title="Grid overlay"
            >
              {gridMode === 'none' ? '# Off' : gridMode === '3x3' ? '3×3' : '✚'}
            </button>

            {/* Timer Toggle */}
            <button
              onClick={toggleTimer}
              className={`btn-press p-2 rounded-full text-xs font-bold transition-colors ${
                timerDuration > 0
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                  : 'bg-gray-800/70 text-gray-400 hover:text-white'
              }`}
              title="Self timer"
            >
              {timerDuration > 0 ? `⏱ ${timerDuration}s` : '⏱ Off'}
            </button>

            {/* Flip Camera */}
            <button
              onClick={switchCamera}
              className="btn-press p-2 rounded-full bg-gray-800/80 hover:bg-gray-700 text-white transition active:rotate-180"
              title="Switch camera"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        )}
      </header>

      {/* Status banner */}
      {status && (
        <div className="mx-4 mb-2 px-3.5 py-2 rounded-xl bg-red-950/80 border border-red-700 text-red-200 text-xs flex items-center justify-between">
          <span>{status}</span>
          <button onClick={() => setStatus('')} className="p-1 font-bold text-red-400">✕</button>
        </div>
      )}
      {savedMsg && (
        <div className="mx-4 mb-2 px-3.5 py-2 rounded-xl bg-emerald-950/90 border border-emerald-600 text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <span>✓</span>
          <span>{savedMsg}</span>
        </div>
      )}

      {/* ── CAMERA MODE (WYSIWYG FRAMED VIEWFINDER) ── */}
      {mode === 'camera' && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Framed Viewfinder Container matching the exact chosen Aspect Ratio */}
          <div className="relative flex-1 bg-black flex items-center justify-center p-1 overflow-hidden">
            <div className={`relative overflow-hidden flex items-center justify-center rounded-2xl shadow-2xl border border-gray-800 ${aspectContainerClass}`}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Shutter White Flash */}
              {shutterFlashing && (
                <div className="absolute inset-0 bg-white z-30 animate-shutter-flash pointer-events-none" />
              )}

              {/* Timer countdown digits */}
              {countdown !== null && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-xs">
                  <span className="text-8xl font-black text-white drop-shadow-2xl animate-ping scale-110">
                    {countdown}
                  </span>
                </div>
              )}

              {/* Grid Overlay */}
              {gridMode === '3x3' && (
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 z-10">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/20" />
                  ))}
                </div>
              )}

              {gridMode === 'crosshair' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div className="w-16 h-16 border-2 border-dashed border-white/40 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  </div>
                </div>
              )}

              {/* Top Viewfinder Telemetry Pill */}
              <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10 px-2">
                <button
                  onClick={handleManualGpsTrigger}
                  className="pointer-events-auto btn-press glass-dark px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-mono shadow-lg border border-white/10"
                >
                  {isGettingGps ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-radar-ping" />
                      <span className="text-amber-300 font-sans font-medium text-[11px]">
                        Acquiring GPS Fix…
                      </span>
                    </>
                  ) : gps ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-300 font-bold text-[11px]">
                        {gps.latitude.toFixed(5)}°, {gps.longitude.toFixed(5)}°
                      </span>
                      <span className="text-blue-300 text-[10px] font-sans">
                        ±{gps.accuracy.toFixed(0)}m
                      </span>
                      {deviceHeading !== undefined && (
                        <span className="text-amber-300 text-[10px] font-mono">
                          🧭 {getHeadingString(deviceHeading)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-gray-500" />
                      <span className="text-gray-300 font-sans text-[11px]">
                        Tap to acquire GPS Telemetry
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Aspect Ratio Badge in Viewfinder */}
              <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-mono text-gray-300">
                {aspectRatio}
              </div>
            </div>
          </div>

          {/* Bottom Shutter Dock */}
          <div className="flex items-center justify-between px-8 py-4 bg-gray-950/90 z-20">
            <button
              onClick={() => {
                triggerHaptic('light');
                fileInputRef.current?.click();
              }}
              className="btn-press w-13 h-13 rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-700 flex flex-col items-center justify-center text-gray-300 hover:text-white"
              title="Import image from files"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-[9px] mt-0.5 font-medium text-gray-400">Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImport}
            />

            {/* Shutter Button */}
            <button
              onClick={triggerShutter}
              className="shutter-press relative w-20 h-20 rounded-full p-1 bg-white/10 border-2 border-white/60 shadow-2xl flex items-center justify-center"
              aria-label="Capture photo"
            >
              <span className="w-full h-full rounded-full bg-white hover:bg-gray-100 flex items-center justify-center transition-all shadow-inner">
                <span className="w-14 h-14 rounded-full border border-gray-300" />
              </span>
            </button>

            {/* GPS Refresh Button */}
            <button
              onClick={handleManualGpsTrigger}
              className={`btn-press w-13 h-13 rounded-2xl bg-gray-900 border flex flex-col items-center justify-center transition-colors ${
                gps
                  ? 'border-emerald-600/60 text-emerald-400'
                  : 'border-gray-800 text-gray-400 hover:text-gray-200'
              }`}
              title="Acquire / Refresh GPS coordinates"
            >
              <span className="text-base">📍</span>
              <span className="text-[9px] font-medium mt-0.5">{gps ? 'Locked' : 'GPS'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW & REVIEW MODE ── */}
      {mode === 'preview' && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Segmented Tab */}
          <div className="flex justify-center px-4 py-2 bg-gray-900/60 border-b border-gray-800">
            <div className="bg-gray-800/80 p-0.5 rounded-xl flex max-w-xs w-full">
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  setActivePreviewTab('overlay');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activePreviewTab === 'overlay'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                📍 Rich Geotag HUD
              </button>
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  setActivePreviewTab('raw');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activePreviewTab === 'raw'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Clean Photo
              </button>
            </div>
          </div>

          {/* Photo Preview (Preserving True Aspect Ratio) */}
          <div className="relative bg-black flex-1 min-h-[46vh] max-h-[58vh] flex items-center justify-center p-2 overflow-hidden">
            {previewURL && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  activePreviewTab === 'overlay' && finalBlob
                    ? previewURL
                    : capturedBlob
                    ? URL.createObjectURL(capturedBlob)
                    : previewURL
                }
                alt="Captured Preview"
                className="max-h-full max-w-full object-contain rounded-xl shadow-lg border border-gray-800"
              />
            )}

            {isProcessing && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                <span className="text-xs font-bold text-blue-200 tracking-wide">
                  Generating high-density geotag overlay…
                </span>
              </div>
            )}
          </div>

          {/* Editable Project / Site Note Bar */}
          <div className="px-4 py-2 bg-gray-900 border-t border-b border-gray-800 flex items-center gap-2">
            <span className="text-sm">🏷</span>
            <input
              type="text"
              placeholder="Add Project / Site Note (burns onto photo)…"
              value={noteText}
              onChange={(e) => handleNoteChange(e.target.value)}
              className="flex-1 bg-gray-800/90 text-white text-xs px-3 py-1.5 rounded-xl border border-gray-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Style Selector Chips */}
          {activePreviewTab === 'overlay' && (
            <div className="px-4 py-2 bg-gray-925 border-b border-gray-800 flex items-center justify-between gap-2 overflow-x-auto">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">
                Overlay:
              </span>
              <div className="flex gap-1.5">
                {(['pro', 'badge', 'minimal'] as OverlayStyle[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => changeOverlayStyle(st)}
                    className={`btn-press px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                      overlayStyle === st
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {st === 'pro' ? 'Pro Telemetry HUD' : st === 'badge' ? 'Corner Badge' : 'Minimal'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Telemetry Summary Drawer */}
          <div className="px-4 py-2.5 flex items-center justify-between bg-gray-950 border-b border-gray-850">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${gps ? 'bg-emerald-400' : 'bg-gray-500'}`} />
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-gray-200">
                  {gps ? `${gps.latitude.toFixed(6)}°, ${gps.longitude.toFixed(6)}°` : 'No GPS coordinates'}
                </span>
                {gps && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    DMS: {toDMS(gps.latitude, true)}, {toDMS(gps.longitude, false)} · ±{gps.accuracy.toFixed(0)}m
                  </span>
                )}
                {gps?.address && (
                  <span className="text-[10px] text-blue-300 font-sans truncate max-w-[240px]">
                    📍 {gps.address}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleAttachGpsInPreview}
              disabled={isGettingGps || isProcessing}
              className="btn-press px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-blue-300 hover:text-blue-200 text-xs font-semibold flex items-center gap-1.5 border border-gray-700"
            >
              <span>{isGettingGps ? '⌛' : '📍'}</span>
              <span>{isGettingGps ? 'Locating…' : gps ? 'Refresh GPS' : 'Attach GPS'}</span>
            </button>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="p-4 flex flex-col gap-2 bg-gray-950">
            <button
              onClick={savePhoto}
              disabled={isProcessing}
              className="btn-press w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2"
            >
              <span className="text-lg">💾</span>
              <span>Save to Local Gallery</span>
            </button>

            <div className="flex gap-2">
              <button
                onClick={retake}
                className="btn-press flex-1 py-2.5 rounded-xl bg-gray-850 hover:bg-gray-800 text-gray-300 font-semibold text-xs border border-gray-700 flex items-center justify-center gap-1.5"
              >
                <span>↩</span> Retake
              </button>
              <button
                onClick={downloadPhoto}
                disabled={isProcessing}
                className="btn-press flex-1 py-2.5 rounded-xl bg-gray-850 hover:bg-gray-800 text-gray-300 font-semibold text-xs border border-gray-700 flex items-center justify-center gap-1.5"
              >
                <span>⬇</span> Download
              </button>
              <button
                onClick={sharePhoto}
                disabled={isProcessing}
                className="btn-press flex-1 py-2.5 rounded-xl bg-gray-850 hover:bg-gray-800 text-gray-300 font-semibold text-xs border border-gray-700 flex items-center justify-center gap-1.5"
              >
                <span>↗</span> Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} className="hidden" />
      <NavBar active="camera" darkTheme />
    </div>
  );
}
