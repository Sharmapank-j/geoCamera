// src/pages/settings.tsx
import { useEffect, useRef, useState } from 'react';
import NavBar from '@/components/NavBar';
import Toggle from '@/components/Toggle';
import { clearAll, getStorageStats } from '@/lib/localDB';
import { exportMetadataJSON, exportZIP, importZIP } from '@/lib/exportImport';
import {
  triggerHaptic,
  playShutterSound,
  getHapticsEnabled,
  setHapticsEnabled,
  getSoundEnabled,
  setSoundEnabled,
  getAutoGpsEnabled,
  setAutoGpsEnabled,
  getHighAccuracyEnabled,
  setHighAccuracyEnabled,
  isHapticsSupported,
} from '@/lib/feedback';

export default function SettingsPage() {
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // User Preferences
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);
  const [autoGps, setAutoGps] = useState(false);
  const [highAcc, setHighAcc] = useState(true);

  // Storage diagnostics
  const [stats, setStats] = useState<{ totalPhotos: number; geotaggedPhotos: number; totalBytes: number } | null>(null);

  useEffect(() => {
    setHaptics(getHapticsEnabled());
    setSound(getSoundEnabled());
    setAutoGps(getAutoGpsEnabled());
    setHighAcc(getHighAccuracyEnabled());

    getStorageStats().then(setStats).catch(() => {});
  }, []);

  const flash = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(''), 4000);
  };

  const handleToggleHaptics = (val: boolean) => {
    setHaptics(val);
    setHapticsEnabled(val);
    if (val) triggerHaptic('shutter');
  };

  const handleToggleSound = (val: boolean) => {
    setSound(val);
    setSoundEnabled(val);
    if (val) playShutterSound();
  };

  const handleToggleAutoGps = (val: boolean) => {
    setAutoGps(val);
    setAutoGpsEnabled(val);
    triggerHaptic('selection');
  };

  const handleToggleHighAcc = (val: boolean) => {
    setHighAcc(val);
    setHighAccuracyEnabled(val);
    triggerHaptic('selection');
  };

  const testHaptics = () => {
    triggerHaptic('shutter');
    flash('📳 Haptic shutter vibration triggered!');
  };

  const testSound = () => {
    playShutterSound();
    flash('🔊 Camera shutter sound played!');
  };

  const handleExportJSON = async () => {
    triggerHaptic('medium');
    try {
      await exportMetadataJSON();
      triggerHaptic('success');
      flash('✓ Metadata JSON downloaded');
    } catch (e: any) {
      triggerHaptic('warning');
      flash(e.message, true);
    }
  };

  const handleExportZIP = async () => {
    triggerHaptic('medium');
    try {
      await exportZIP();
      triggerHaptic('success');
      flash('✓ ZIP backup downloaded');
    } catch (e: any) {
      triggerHaptic('warning');
      flash(e.message, true);
    }
  };

  const handleImportZIP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic('medium');
    try {
      const count = await importZIP(file);
      triggerHaptic('success');
      flash(`✓ Restored ${count} photo(s) successfully`);
      const updated = await getStorageStats();
      setStats(updated);
    } catch (e: any) {
      triggerHaptic('warning');
      flash(`Import failed: ${e.message}`, true);
    }
    e.target.value = '';
  };

  const handleClearAll = async () => {
    triggerHaptic('warning');
    if (
      !confirm(
        'This will permanently delete ALL photos and location data from this device.\n\nThis action cannot be undone. Continue?'
      )
    ) {
      return;
    }
    await clearAll();
    triggerHaptic('heavy');
    flash('✓ All local data permanently cleared');
    const updated = await getStorageStats();
    setStats(updated);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 select-none">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-xs">
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-xs text-gray-500 mt-0.5">Preferences, device feedback, and local storage</p>
      </div>

      <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">
        {/* Flash message */}
        {msg && (
          <div
            className={`px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in ${
              isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            <span>{isError ? '✕' : '✓'}</span>
            <span>{msg}</span>
          </div>
        )}

        {/* Privacy notice banner */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="font-bold text-blue-950 text-sm">On-Device Privacy Guaranteed</p>
              <p className="text-blue-900 text-xs mt-1 leading-relaxed">
                Your photos, GPS coordinates, and EXIF metadata are processed and stored exclusively inside
                your browser&apos;s IndexedDB. Nothing is ever sent to any remote server or analytics provider.
              </p>
            </div>
          </div>
        </div>

        {/* ── 100% FREE MODE STATUS CARD ── */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🌿</span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-emerald-950 text-sm">100% Free Mode Active</p>
                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Zero Cost
                  </span>
                </div>
                <p className="text-emerald-900 text-xs mt-1 leading-relaxed">
                  GeoTag Camera operates without any paid API keys, paid cloud accounts, or credit card requirements:
                </p>
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-medium text-emerald-900/90">
                  <div className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700">✓</span>
                    <span><strong>Geocoder:</strong> OpenStreetMap Nominatim (Free)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700">✓</span>
                    <span><strong>Map:</strong> Local Vector SVG (Zero Paid Tiles)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700">✓</span>
                    <span><strong>Offline:</strong> Mathematical Geodesics</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700">✓</span>
                    <span><strong>Storage:</strong> Unlimited Browser IndexedDB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── INTERACTION & FEEDBACK TOGGLES ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="font-bold text-gray-800 text-xs uppercase tracking-wider">Haptics & Feedback</p>
            {!isHapticsSupported() && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                Vibration not supported on this browser
              </span>
            )}
          </div>

          <div className="p-4 flex flex-col gap-4 divide-y divide-gray-100">
            <div className="pt-1">
              <Toggle
                checked={haptics}
                onChange={handleToggleHaptics}
                label="Haptic Vibration"
                description="Tactile vibration pulses for shutter, button presses, and switches."
                icon={<span className="text-base">📳</span>}
                disabled={!isHapticsSupported()}
              />
              {haptics && isHapticsSupported() && (
                <button
                  onClick={testHaptics}
                  className="btn-press mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                >
                  <span>⚡</span> Test Haptic Pulse
                </button>
              )}
            </div>

            <div className="pt-3">
              <Toggle
                checked={sound}
                onChange={handleToggleSound}
                label="Camera Shutter Sound"
                description="Simulated offline camera click sound generated via Web Audio API."
                icon={<span className="text-base">🔊</span>}
              />
              {sound && (
                <button
                  onClick={testSound}
                  className="btn-press mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                >
                  <span>▶</span> Test Shutter Sound
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── CAMERA & GPS PREFERENCES ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-bold text-gray-800 text-xs uppercase tracking-wider">Camera & Geolocation</p>
          </div>

          <div className="p-4 flex flex-col gap-4 divide-y divide-gray-100">
            <div className="pt-1">
              <Toggle
                checked={autoGps}
                onChange={handleToggleAutoGps}
                label="Auto-Attach GPS on Capture"
                description="Automatically fetches current GPS coordinates whenever you snap a photo."
                icon={<span className="text-base">🛰</span>}
              />
            </div>

            <div className="pt-3">
              <Toggle
                checked={highAcc}
                onChange={handleToggleHighAcc}
                label="High Accuracy GPS"
                description="Uses hardware GPS sensor for maximum precision (±5m) instead of network towers."
                icon={<span className="text-base">🎯</span>}
                badge="Recommended"
              />
            </div>
          </div>
        </div>

        {/* ── STORAGE USAGE DIAGNOSTICS ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4">
          <p className="font-bold text-gray-800 text-xs uppercase tracking-wider mb-3">Local Storage</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-lg font-extrabold text-gray-900">{stats?.totalPhotos ?? 0}</p>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Total Photos</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-lg font-extrabold text-blue-600">{stats?.geotaggedPhotos ?? 0}</p>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Geotagged</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-lg font-extrabold text-emerald-600">
                {stats ? (stats.totalBytes / (1024 * 1024)).toFixed(1) : 0} MB
              </p>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">IndexedDB</p>
            </div>
          </div>
        </div>

        {/* ── BACKUP & RESTORE ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-bold text-gray-800 text-xs uppercase tracking-wider">Backup & Export</p>
          </div>
          <div className="divide-y divide-gray-100">
            <button
              onClick={handleExportZIP}
              className="btn-press w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 text-left transition"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600 text-base">🗜</span>
                <div>
                  <p className="text-xs font-bold text-gray-800">Export All Photos + Metadata as ZIP</p>
                  <p className="text-[11px] text-gray-500">Complete archive of high-res photos and JSON</p>
                </div>
              </div>
              <span className="text-gray-400 text-xs">⬇</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="btn-press w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 text-left transition"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-purple-50 text-purple-600 text-base">📄</span>
                <div>
                  <p className="text-xs font-bold text-gray-800">Export Metadata Only as JSON</p>
                  <p className="text-[11px] text-gray-500">Lightweight file containing coordinates and timestamps</p>
                </div>
              </div>
              <span className="text-gray-400 text-xs">⬇</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('light');
                importRef.current?.click();
              }}
              className="btn-press w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 text-left transition"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 text-base">📥</span>
                <div>
                  <p className="text-xs font-bold text-gray-800">Import ZIP Backup</p>
                  <p className="text-[11px] text-gray-500">Restore photos from a previously downloaded ZIP</p>
                </div>
              </div>
              <span className="text-gray-400 text-xs">⬆</span>
            </button>
            <input ref={importRef} type="file" accept=".zip" className="hidden" onChange={handleImportZIP} />
          </div>
        </div>

        {/* ── DANGER ZONE ── */}
        <div className="bg-white rounded-2xl border border-red-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50/50">
            <p className="font-bold text-red-700 text-xs uppercase tracking-wider">Danger Zone</p>
          </div>
          <button
            onClick={handleClearAll}
            className="btn-press w-full flex items-center justify-between px-4 py-3.5 hover:bg-red-50/60 text-left transition"
          >
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-red-100 text-red-600 text-base">🗑</span>
              <div>
                <p className="text-xs font-bold text-red-700">Clear All Local Data</p>
                <p className="text-[11px] text-red-500">Wipes all stored photos and GPS coordinates from browser</p>
              </div>
            </div>
            <span className="text-red-400 text-xs font-semibold">Delete</span>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-gray-400 py-3 space-y-0.5">
          <p className="font-bold text-gray-600">GeoTag Camera</p>
          <p>Version 2.0.0 · Progressive Web App (PWA)</p>
          <p>Next.js · Tailwind CSS · IndexedDB · Web Audio API</p>
        </div>
      </div>

      <NavBar active="settings" />
    </div>
  );
}
