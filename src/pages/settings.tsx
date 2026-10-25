// src/pages/settings.tsx
import { useRef, useState } from 'react';
import NavBar from '@/components/NavBar';
import { clearAll } from '@/lib/localDB';
import { exportMetadataJSON, exportZIP, importZIP } from '@/lib/exportImport';

export default function SettingsPage() {
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const flash = (text: string, error = false) => {
    setMsg(text);
    setIsError(error);
    setTimeout(() => setMsg(''), 4000);
  };

  const handleExportJSON = async () => {
    try {
      await exportMetadataJSON();
      flash('✓ Metadata JSON downloaded');
    } catch (e: any) {
      flash(e.message, true);
    }
  };

  const handleExportZIP = async () => {
    try {
      await exportZIP();
      flash('✓ ZIP backup downloaded');
    } catch (e: any) {
      flash(e.message, true);
    }
  };

  const handleImportZIP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importZIP(file);
      flash(`✓ Imported ${count} photo(s) successfully`);
    } catch (e: any) {
      flash(`Import failed: ${e.message}`, true);
    }
    e.target.value = '';
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        'This will permanently delete ALL photos and location data from this device.\n\nThis action cannot be undone. Continue?'
      )
    )
      return;
    await clearAll();
    flash('✓ All local data cleared');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Flash message */}
        {msg && (
          <div
            className={`px-4 py-3 rounded-xl text-sm ${
              isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}
          >
            {msg}
          </div>
        )}

        {/* Privacy notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="font-semibold text-blue-900 text-sm">Your Privacy</p>
              <p className="text-blue-800 text-sm mt-1">
                Your photos and location data stay on this device unless you choose to export them.
                No accounts. No servers. No analytics.
              </p>
            </div>
          </div>
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-800 text-sm">Export</p>
          </div>
          <div className="divide-y divide-gray-100">
            <button
              onClick={handleExportJSON}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition text-left"
            >
              <span className="text-2xl">📄</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Export Metadata as JSON</p>
                <p className="text-xs text-gray-500">Saves coordinates, dates and addresses</p>
              </div>
            </button>
            <button
              onClick={handleExportZIP}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition text-left"
            >
              <span className="text-2xl">🗜</span>
              <div>
                <p className="text-sm font-medium text-gray-800">Export All Photos + Metadata as ZIP</p>
                <p className="text-xs text-gray-500">Full backup of all photos and location data</p>
              </div>
            </button>
          </div>
        </div>

        {/* Import */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-800 text-sm">Import</p>
          </div>
          <button
            onClick={() => importRef.current?.click()}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition text-left"
          >
            <span className="text-2xl">📥</span>
            <div>
              <p className="text-sm font-medium text-gray-800">Import ZIP Backup</p>
              <p className="text-xs text-gray-500">Restore photos from a previously exported backup</p>
            </div>
          </button>
          <input ref={importRef} type="file" accept=".zip" className="hidden" onChange={handleImportZIP} />
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100">
            <p className="font-semibold text-red-700 text-sm">Danger Zone</p>
          </div>
          <button
            onClick={handleClearAll}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-red-50 transition text-left"
          >
            <span className="text-2xl">🗑</span>
            <div>
              <p className="text-sm font-medium text-red-700">Clear All Local Data</p>
              <p className="text-xs text-red-400">Permanently deletes all photos from this device</p>
            </div>
          </button>
        </div>

        {/* App info */}
        <div className="text-center text-xs text-gray-400 py-2">
          <p className="font-semibold text-gray-600">GeoTag Camera</p>
          <p>v1.0.0 · Works offline · No cloud required</p>
          <p className="mt-1">Built with Next.js + IndexedDB + Canvas API</p>
        </div>
      </div>

      <NavBar active="settings" />
    </div>
  );
}
