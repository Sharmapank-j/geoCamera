import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { captureVideoFrame, stopStream } from './camera/capture'
import { getCurrentLocation } from './location/geolocation'
import { reverseGeocode } from './location/geocode'
import { createThumbnail, renderStampedPhoto } from './overlay/stamp'
import { clearAllData, deletePhoto, getPhotos, getSettings, initDb, savePhoto, saveSettings } from './storage/db'
import type { AppSettings, CameraFacing, GpsStatus, LocationData, OverlayPreset, OverlaySettings, PermissionStateLabel, PhotoRecord, StorageStateLabel } from './types'
import { defaultAppSettings, defaultOverlaySettings } from './types'
import { displayDatePretty } from './utils/date'
import { buildPhotoFilename, downloadBlob } from './utils/file'

type Tab = 'camera' | 'gallery' | 'map' | 'settings'

interface DraftPhoto {
  originalBlob: Blob
  location?: LocationData
  notes: string
  captureDateTime: string
}

const presets: OverlayPreset[] = ['Classic GPS', 'Minimal', 'Compact', 'Evidence', 'Travel', 'Custom']

const App = () => {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings)
  const [overlay, setOverlay] = useState<OverlaySettings>(defaultOverlaySettings)
  const [photos, setPhotos] = useState<PhotoRecord[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('camera')

  const [cameraPermission, setCameraPermission] = useState<PermissionStateLabel>('Not granted')
  const [locationPermission, setLocationPermission] = useState<PermissionStateLabel>('Not granted')
  const [storagePermission, setStoragePermission] = useState<StorageStateLabel>('Available')

  const [cameraError, setCameraError] = useState('')
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('LOCATION OFF')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facing, setFacing] = useState<CameraFacing>('environment')
  const videoRef = useRef<HTMLVideoElement>(null)

  const [draft, setDraft] = useState<DraftPhoto | null>(null)
  const [draftPreviewUrl, setDraftPreviewUrl] = useState('')
  const [stampedBlob, setStampedBlob] = useState<Blob | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'geo' | 'no-geo'>('all')

  const refreshPhotos = async () => setPhotos(await getPhotos())

  const checkPermissionState = async (name: PermissionName): Promise<PermissionStateLabel> => {
    try {
      const status = await navigator.permissions.query({ name } as PermissionDescriptor)
      if (status.state === 'granted') return 'Allowed'
      if (status.state === 'denied') return 'Denied'
      return 'Not granted'
    } catch {
      return 'Not granted'
    }
  }

  const checkStorageState = async () => {
    if (!navigator.storage?.persisted) {
      setStoragePermission('Limited')
      return
    }
    const persisted = await navigator.storage.persisted()
    setStoragePermission(persisted ? 'Persistent' : 'Available')
  }

  const startCamera = async (targetFacing: CameraFacing) => {
    stopStream(stream)
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      setCameraPermission('Allowed')
      setCameraError('')
      setStream(media)
      setFacing(targetFacing)
      if (videoRef.current) videoRef.current.srcObject = media
    } catch {
      setCameraPermission('Denied')
      setCameraError('Camera unavailable or denied. Enable camera in browser settings.')
    }
  }

  const initialize = async () => {
    await initDb()
    const loaded = await getSettings()
    setSettings(loaded)
    setFacing(loaded.defaultCamera)
    await refreshPhotos()
    setCameraPermission(await checkPermissionState('camera'))
    setLocationPermission(await checkPermissionState('geolocation'))
    await checkStorageState()
    setReady(true)
  }

  useEffect(() => {
    initialize()
    return () => stopStream(stream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (ready && settings.setupComplete && activeTab === 'camera') startCamera(facing)
    return () => stopStream(stream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.setupComplete, activeTab, facing])

  useEffect(() => {
    const updatePreview = async () => {
      if (!draft) return
      const stamped = await renderStampedPhoto({
        imageBlob: draft.originalBlob,
        location: draft.location,
        notes: draft.notes,
        overlay,
        appSettings: settings,
      })
      setStampedBlob(stamped)
      const url = URL.createObjectURL(stamped)
      setDraftPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    }
    updatePreview()
  }, [draft, overlay, settings])

  const continueSetup = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      setCameraPermission('Allowed')
    } catch {
      setCameraPermission('Denied')
    }

    try {
      await getCurrentLocation(7000)
      setLocationPermission('Allowed')
    } catch (error) {
      setLocationPermission(String(error).includes('DENIED') ? 'Denied' : 'Not granted')
    }

    if (navigator.storage?.persist) {
      const persisted = await navigator.storage.persist()
      setStoragePermission(persisted ? 'Persistent' : 'Available')
    }

    await initDb()
    const next = { ...settings, setupComplete: true }
    setSettings(next)
    await saveSettings(next)
  }

  const capture = async (withLocation: boolean) => {
    if (!videoRef.current) return
    let location: LocationData | undefined
    if (withLocation) {
      setGpsStatus('LOCATING...')
      try {
        location = await getCurrentLocation()
        if (settings.addressLookup && settings.allowExternalGeocoder && navigator.onLine) {
          location = await reverseGeocode(location)
        }
        setGpsStatus(location.accuracy ? `GPS ±${Math.round(location.accuracy)} m` : 'GPS READY')
      } catch (error) {
        const message = (error as Error).message as GpsStatus
        setGpsStatus(message)
      }
    }

    const originalBlob = await captureVideoFrame(videoRef.current)
    setDraft({
      originalBlob,
      location,
      notes: '',
      captureDateTime: new Date().toISOString(),
    })
    stopStream(stream)
    setStream(null)
  }

  const saveDraft = async () => {
    if (!draft || !stampedBlob) return
    const thumbnailBlob = await createThumbnail(stampedBlob)
    const fileName = buildPhotoFilename(draft.captureDateTime, draft.location?.latitude, draft.location?.longitude)
    const photo: PhotoRecord = {
      id: crypto.randomUUID(),
      originalBlob: draft.originalBlob,
      finalBlob: stampedBlob,
      thumbnailBlob,
      createdAt: new Date().toISOString(),
      captureDateTime: draft.captureDateTime,
      latitude: draft.location?.latitude,
      longitude: draft.location?.longitude,
      accuracy: draft.location?.accuracy,
      altitude: draft.location?.altitude,
      altitudeAccuracy: draft.location?.altitudeAccuracy,
      heading: draft.location?.heading,
      speed: draft.location?.speed,
      gpsTimestamp: draft.location?.timestamp,
      address: draft.location?.address,
      locality: draft.location?.locality,
      city: draft.location?.city,
      district: draft.location?.district,
      state: draft.location?.state,
      country: draft.location?.country,
      notes: draft.notes,
      hasLocation: Boolean(draft.location),
      overlayPreset: overlay.preset,
      overlaySettings: overlay,
      fileName,
    }

    await savePhoto(photo)
    await refreshPhotos()
    setDraft(null)
    if (draftPreviewUrl) URL.revokeObjectURL(draftPreviewUrl)
    setDraftPreviewUrl('')
    setStampedBlob(null)
    setActiveTab('gallery')
  }

  const exportAll = async () => {
    const zip = new JSZip()
    const root = zip.folder('GeoTagCamera-Backup')
    const photosFolder = root?.folder('photos')
    const metadataFolder = root?.folder('metadata')

    const metadata = photos.map((p) => ({
      id: p.id,
      captureDateTime: p.captureDateTime,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy: p.accuracy,
      altitude: p.altitude,
      heading: p.heading,
      speed: p.speed,
      address: p.address,
      notes: p.notes,
      overlayPreset: p.overlayPreset,
      overlaySettings: p.overlaySettings,
      fileName: p.fileName,
    }))

    for (const p of photos) {
      photosFolder?.file(p.fileName, p.finalBlob)
      metadataFolder?.file(`${p.id}.json`, JSON.stringify(metadata.find((m) => m.id === p.id), null, 2))
    }

    root?.file(
      'manifest.json',
      JSON.stringify(
        {
          application: 'GeoTag Camera',
          version: '1.0.0',
          exportDate: new Date().toISOString(),
          photoCount: photos.length,
          schemaVersion: 1,
        },
        null,
        2,
      ),
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `GeoTagCamera-Backup-${new Date().toISOString().slice(0, 10)}.zip`)
  }

  const importBackup = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file)
      const metadataEntries = Object.values(zip.files).filter((f) => f.name.includes('/metadata/') && f.name.endsWith('.json'))
      for (const entry of metadataEntries) {
        const raw = await entry.async('text')
        const meta = JSON.parse(raw) as Partial<PhotoRecord>
        const imageFile = zip.file(`GeoTagCamera-Backup/photos/${meta.fileName}`)
        if (!imageFile || !meta.id || !meta.fileName) continue
        const finalBlob = await imageFile.async('blob')
        const thumbnailBlob = await createThumbnail(finalBlob)
        const record: PhotoRecord = {
          id: `${meta.id}-${crypto.randomUUID().slice(0, 8)}`,
          originalBlob: finalBlob,
          finalBlob,
          thumbnailBlob,
          createdAt: new Date().toISOString(),
          captureDateTime: meta.captureDateTime ?? new Date().toISOString(),
          latitude: meta.latitude,
          longitude: meta.longitude,
          accuracy: meta.accuracy,
          altitude: meta.altitude,
          heading: meta.heading,
          speed: meta.speed,
          address: meta.address,
          notes: meta.notes,
          hasLocation: Boolean(meta.latitude && meta.longitude),
          overlayPreset: (meta.overlayPreset as OverlayPreset) ?? 'Classic GPS',
          overlaySettings: meta.overlaySettings ?? overlay,
          fileName: meta.fileName,
        }
        await savePhoto(record)
      }
      await refreshPhotos()
      alert('Backup imported successfully.')
    } catch {
      alert('Invalid backup archive.')
    }
  }

  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      if (filter === 'geo' && !p.hasLocation) return false
      if (filter === 'no-geo' && p.hasLocation) return false
      if (!search) return true
      return [p.address, p.notes, p.fileName].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
    })
  }, [photos, filter, search])

  const safeDraftPreviewUrl = draftPreviewUrl.startsWith('blob:') ? draftPreviewUrl : ''

  const storageStats = useMemo(() => {
    const totalBytes = photos.reduce((acc, p) => acc + p.finalBlob.size + p.thumbnailBlob.size, 0)
    return { count: photos.length, mb: (totalBytes / (1024 * 1024)).toFixed(2) }
  }, [photos])

  if (!ready) {
    return <div className="min-h-screen bg-slate-950 text-white grid place-items-center">Loading GeoTag Camera…</div>
  }

  if (!settings.setupComplete) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col justify-center gap-6">
        <h1 className="text-4xl font-bold">GeoTag Camera</h1>
        <p className="text-xl text-slate-300">Private GPS Camera</p>
        <p>📷 Camera — To take photographs.</p>
        <p>📍 Location — To add GPS information to photographs.</p>
        <p>💾 Local Storage — To keep photographs and metadata on this device for offline use.</p>
        <p className="text-emerald-300">Your photos and location data stay on this device unless you export them.</p>
        <button className="h-12 rounded-xl bg-emerald-500 text-black font-bold" onClick={continueSetup}>
          Continue
        </button>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20 md:pb-0 md:grid md:grid-cols-[220px_1fr]">
      <nav className="hidden md:flex flex-col p-4 gap-3 bg-white border-r border-slate-200">
        {[
          ['camera', '📷 Camera'],
          ['gallery', '🖼 Gallery'],
          ['map', '🗺 Map'],
          ['settings', '⚙ Settings'],
        ].map(([key, label]) => (
          <button key={key} className={`h-11 rounded-xl ${activeTab === key ? 'bg-slate-900 text-white' : 'bg-slate-100'}`} onClick={() => setActiveTab(key as Tab)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {activeTab === 'camera' && (
          <section className="bg-black text-white min-h-screen md:min-h-full p-3">
            {!draft ? (
              <>
                <div className="relative rounded-2xl overflow-hidden border border-slate-800">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-[3/4] object-cover" />
                  {cameraError && <p className="absolute bottom-2 left-2 right-2 text-sm bg-red-600/80 rounded p-2">{cameraError}</p>}
                </div>
                <div className="mt-3 text-sm text-slate-300">{gpsStatus}</div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button className="h-12 rounded-xl bg-white text-black font-semibold" onClick={() => capture(false)}>Capture</button>
                  <button className="h-12 rounded-xl bg-emerald-500 text-black font-semibold" onClick={() => capture(true)}>Capture with Location</button>
                  <button className="h-11 rounded-xl bg-slate-800" onClick={() => startCamera(facing === 'environment' ? 'user' : 'environment')}>Switch Camera</button>
                  <label className="h-11 rounded-xl bg-slate-800 grid place-items-center cursor-pointer">
                    Import Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setDraft({ originalBlob: file, notes: '', captureDateTime: new Date().toISOString() })
                        stopStream(stream)
                      }}
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                {safeDraftPreviewUrl && <img src={safeDraftPreviewUrl} alt="Stamped preview" className="w-full rounded-2xl border border-slate-700" />}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    className="h-11 rounded-xl bg-slate-700"
                    onClick={() => {
                      setDraft(null)
                      setStampedBlob(null)
                      setDraftPreviewUrl('')
                      startCamera(facing)
                    }}
                  >
                    Retake
                  </button>
                  <button className="h-11 rounded-xl bg-emerald-500 text-black font-semibold" onClick={saveDraft}>Save Photo</button>
                </div>
                <div className="grid gap-2 mt-2">
                  <button className="h-11 rounded-xl bg-slate-800" onClick={async () => {
                    try {
                      const loc = await getCurrentLocation()
                      setDraft((prev) => (prev ? { ...prev, location: loc } : prev))
                    } catch {
                      alert('Location unavailable')
                    }
                  }}>Use Current Location</button>
                  <textarea
                    placeholder="Notes"
                    className="w-full rounded-xl bg-slate-800 p-3"
                    value={draft.notes}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="h-11 rounded-xl bg-slate-800 px-3"
                      value={overlay.preset}
                      onChange={(e) => setOverlay((o) => ({ ...o, preset: e.target.value as OverlayPreset }))}
                    >
                      {presets.map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.02}
                      value={overlay.opacity}
                      onChange={(e) => setOverlay((o) => ({ ...o, opacity: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === 'gallery' && (
          <section className="p-4">
            <div className="grid md:grid-cols-[1fr_auto_auto] gap-2 mb-3">
              <input className="h-11 rounded-xl border px-3" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="h-11 rounded-xl border px-3" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="all">All</option>
                <option value="geo">Geotagged only</option>
                <option value="no-geo">Non-geotagged only</option>
              </select>
              <button className="h-11 rounded-xl bg-slate-900 text-white px-4" onClick={exportAll}>Export All</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {filteredPhotos.map((photo) => {
                const url = URL.createObjectURL(photo.thumbnailBlob)
                return (
                  <article key={photo.id} className="bg-white rounded-xl border overflow-hidden">
                    <img src={url} alt={photo.fileName} className="aspect-square object-cover w-full" />
                    <div className="p-2 text-xs">
                      <p className="font-semibold truncate">{displayDatePretty(photo.captureDateTime)}</p>
                      <p>{photo.hasLocation ? '📍 GPS' : 'No GPS'}</p>
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        <button className="h-8 rounded bg-slate-100" onClick={() => downloadBlob(photo.finalBlob, photo.fileName)}>Download</button>
                        <button className="h-8 rounded bg-slate-100" onClick={async () => {
                          if (navigator.share && navigator.canShare?.({ files: [new File([photo.finalBlob], photo.fileName)] })) {
                            await navigator.share({ files: [new File([photo.finalBlob], photo.fileName)], title: photo.fileName })
                          } else {
                            downloadBlob(photo.finalBlob, photo.fileName)
                          }
                        }}>Share</button>
                        <button className="h-8 rounded bg-slate-100" onClick={() => downloadBlob(new Blob([JSON.stringify(photo, null, 2)], { type: 'application/json' }), `${photo.id}.json`)}>Metadata</button>
                        <button className="h-8 rounded bg-red-100 text-red-700" onClick={async () => {
                          await deletePhoto(photo.id)
                          await refreshPhotos()
                        }}>Delete</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {activeTab === 'map' && (
          <section className="p-4">
            <h2 className="text-xl font-bold mb-3">Map</h2>
            {photos.filter((p) => p.hasLocation).length === 0 ? (
              <p>No geotagged photos yet.</p>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm text-slate-600">Offline-safe fallback map list (camera workflow never depends on remote maps).</p>
                {photos.filter((p) => p.hasLocation).map((p) => (
                  <div key={p.id} className="rounded-xl border bg-white p-3">
                    <p className="font-semibold">{p.address ?? '📍 LOCATION'}</p>
                    <p>{p.latitude?.toFixed(6)}, {p.longitude?.toFixed(6)}</p>
                    <p className="text-sm text-slate-500">{displayDatePretty(p.captureDateTime)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">Settings</h2>
            <section className="rounded-xl bg-white border p-4 space-y-2">
              <h3 className="font-semibold">Permissions</h3>
              <p>Camera: {cameraPermission}</p>
              <p>Location: {locationPermission}</p>
              <p>Local Storage: {storagePermission}</p>
            </section>
            <section className="rounded-xl bg-white border p-4 space-y-2">
              <h3 className="font-semibold">Location</h3>
              <label className="flex items-center justify-between gap-2">
                Allow external reverse geocoder (sends only coordinates)
                <input
                  type="checkbox"
                  checked={settings.allowExternalGeocoder}
                  onChange={async (e) => {
                    const next = { ...settings, allowExternalGeocoder: e.target.checked }
                    setSettings(next)
                    await saveSettings(next)
                  }}
                />
              </label>
            </section>
            <section className="rounded-xl bg-white border p-4 space-y-2">
              <h3 className="font-semibold">Storage</h3>
              <p>Photos: {storageStats.count}</p>
              <p>Storage used: {storageStats.mb} MB</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="h-11 rounded-xl bg-slate-900 text-white grid place-items-center cursor-pointer">
                  Import Backup
                  <input type="file" accept=".zip" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) importBackup(f)
                  }} />
                </label>
                <button className="h-11 rounded-xl bg-red-600 text-white" onClick={async () => {
                  const ok = confirm('This permanently removes all photos and metadata stored by GeoTag Camera on this device.')
                  if (!ok) return
                  await clearAllData()
                  await refreshPhotos()
                }}>Clear All Data</button>
              </div>
            </section>
            <section className="rounded-xl bg-white border p-4 space-y-2">
              <h3 className="font-semibold">Privacy</h3>
              <p>Your photos and location data stay on this device unless you export them.</p>
              <p className="text-sm text-slate-600">No login, no cloud storage, no ads, and no analytics.</p>
            </section>
          </section>
        )}
      </main>

      <nav className="fixed md:hidden bottom-0 inset-x-0 bg-white border-t border-slate-300 h-16 grid grid-cols-4">
        {[
          ['camera', '📷', 'Camera'],
          ['gallery', '🖼', 'Gallery'],
          ['map', '🗺', 'Map'],
          ['settings', '⚙', 'Settings'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            aria-label={label}
            className={`text-sm ${activeTab === key ? 'bg-slate-900 text-white' : ''}`}
            onClick={() => setActiveTab(key as Tab)}
          >
            {icon}<br />{label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
