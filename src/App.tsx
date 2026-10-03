import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
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
import './App.css'

type Tab = 'camera' | 'gallery' | 'map' | 'settings'
type IconName = 'camera' | 'image' | 'map' | 'settings' | 'refresh' | 'switch' | 'flash' | 'location' | 'download' | 'share' | 'trash' | 'edit' | 'x' | 'check' | 'search' | 'info' | 'upload'

const Icon = ({ name, size = 20 }: { name: IconName; size?: number }) => {
  const paths: Record<IconName, string> = {
    camera: 'M4 7h3l1.5-2h7L17 7h3v11H4V7Zm8 3.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z',
    image: 'M4 5h16v14H4V5Zm2 11 3.2-3.4 2.6 2.5 2.2-2.3L18 17H6Zm3-6.8a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z',
    map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6 0v12m6-9v12',
    settings: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm0-5 1 2.1 2.2.5 1.8-1.4 1.8 1.8-1.4 1.8.5 2.2 2.1 1v2.6l-2.1 1-.5 2.2 1.4 1.8-1.8 1.8-1.8-1.4-2.2.5-1 2.1h-2.6l-1-2.1-2.2-.5-1.8 1.4-1.8-1.8 1.4-1.8-.5-2.2-2.1-1V11l2.1-1 .5-2.2-1.4-1.8L6.1 4.2l1.8 1.4 2.2-.5 1-2.1H12Z',
    refresh: 'M20 11a8 8 0 0 0-14.9-3L3 10m0 0V5m0 5h5M4 13a8 8 0 0 0 14.9 3L21 14m0 0v5m0-5h-5',
    switch: 'M8 7h11m0 0-3-3m3 3-3 3M16 17H5m0 0 3 3m-3-3 3-3',
    flash: 'm13 2-8 11h6l-1 9 8-13h-6l1-7Z',
    location: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
    share: 'M14 5h5v5M19 5l-9 9M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
    trash: 'M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 14h10l1-14',
    edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
    x: 'M5 5l14 14M19 5 5 19',
    check: 'm5 12 4 4L19 6',
    search: 'm20 20-4.5-4.5M9.5 17a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z',
    info: 'M12 17v-5m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    upload: 'M12 16V4m0 0L8 8m4-4 4 4M5 20h14',
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

const presets: OverlayPreset[] = ['Classic GPS', 'Modern', 'Minimal', 'Compact', 'Evidence', 'Travel', 'Professional', 'Custom']

const presetProfiles: Record<string, Partial<OverlaySettings>> = {
  'Classic GPS': { showTitle: true, showLocationName: true, showArea: true, showAddress: true, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: true, showMap: true, opacity: .94, panelWidth: .97, cornerRadius: 6 },
  Modern: { showTitle: true, showLocationName: true, showArea: true, showAddress: false, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: true, showMap: true, opacity: .86, panelWidth: .9, cornerRadius: 24 },
  Minimal: { showTitle: false, showLocationName: true, showArea: true, showAddress: false, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: false, showMap: false, opacity: .78, panelWidth: .88 },
  Compact: { showTitle: false, showLocationName: true, showArea: true, showAddress: false, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: true, showMap: false, opacity: .82, panelWidth: .9 },
  Evidence: { showTitle: true, showLocationName: true, showArea: true, showAddress: true, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: true, showAltitude: false, showHeading: false, showSpeed: false, showMap: true, opacity: .95, panelWidth: .97, mapSize: .24, cornerRadius: 4 },
  Travel: { showTitle: true, showLocationName: true, showArea: true, showAddress: true, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: true, showMap: true, opacity: .84, panelWidth: .94, cornerRadius: 22 },
  Professional: { showTitle: true, showLocationName: true, showArea: true, showAddress: true, showLatitude: true, showLongitude: true, showDate: true, showTime: true, showAccuracy: true, showAltitude: true, showMap: true, opacity: .94, panelWidth: .96, cornerRadius: 12 },
}

const accuracyLabel = (location?: LocationData): GpsStatus => location?.accuracy == null ? 'GPS READY' : `GPS ±${Math.round(location.accuracy)} m`

const placeSummary = (p: Pick<LocationData, 'placeName' | 'area' | 'locality' | 'city'>) => {
  const title = p.placeName || p.area || p.locality || p.city || 'Pinned location'
  const line = [p.area, p.city].filter(Boolean).filter((v, i, a) => a.findIndex(x => x?.toLowerCase() === v?.toLowerCase()) === i && v?.toLowerCase() !== title.toLowerCase()).join(' · ')
  return { title, line }
}

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
  const [gpsCaptureEnabled, setGpsCaptureEnabled] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facing, setFacing] = useState<CameraFacing>('environment')
  const [torch, setTorch] = useState(false)
  const [draft, setDraft] = useState<{ originalBlob: Blob; location?: LocationData; notes: string; captureDateTime: string } | null>(null)
  const [stampedBlob, setStampedBlob] = useState<Blob | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'geo' | 'no-geo'>('all')
  const [busy, setBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const refreshPhotos = async () => setPhotos(await getPhotos())

  const setSavedSettings = async (next: AppSettings) => { setSettings(next); await saveSettings(next) }

  const checkPermission = async (name: PermissionName): Promise<PermissionStateLabel> => {
    try {
      const status = await navigator.permissions.query({ name } as PermissionDescriptor)
      return status.state === 'granted' ? 'Allowed' : status.state === 'denied' ? 'Denied' : 'Not granted'
    } catch { return 'Not granted' }
  }

  const refreshStorageStatus = async () => {
    if (!navigator.storage?.persisted) return setStoragePermission('Limited')
    setStoragePermission((await navigator.storage.persisted()) ? 'Persistent' : 'Available')
  }

  const startCamera = async (target: CameraFacing = facing) => {
    stopStream(stream)
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: target }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      setStream(media)
      setFacing(target)
      setCameraPermission('Allowed')
      setCameraError('')
      if (videoRef.current) videoRef.current.srcObject = media
    } catch {
      setCameraPermission('Denied')
      setCameraError('Camera unavailable. Check browser permission and use HTTPS.')
    }
  }

  const initialize = async () => {
    await initDb()
    const loaded = await getSettings()
    setSettings(loaded)
    setFacing(loaded.defaultCamera)
    setOverlay({ ...defaultOverlaySettings, preset: loaded.defaultPreset, coordinatePrecision: loaded.coordinatePrecision })
    await refreshPhotos()
    setCameraPermission(await checkPermission('camera'))
    setLocationPermission(await checkPermission('geolocation'))
    await refreshStorageStatus()
    setReady(true)
  }

  useEffect(() => {
    initialize()
    return () => stopStream(stream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (ready && settings.setupComplete && activeTab === 'camera' && !draft) startCamera(facing)
    return () => stopStream(stream)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.setupComplete, activeTab, draft])

  useEffect(() => {
    let cancelled = false
    const update = async () => {
      if (!draft) { setStampedBlob(null); return }
      const blob = await renderStampedPhoto({ imageBlob: draft.originalBlob, location: draft.location, notes: draft.notes, overlay, appSettings: settings, captureTimestamp: draft.captureDateTime })
      if (!cancelled) setStampedBlob(blob)
    }
    update()
    return () => { cancelled = true }
  }, [draft, overlay, settings])

  useEffect(() => {
    if (!stampedBlob || !previewCanvasRef.current) return
    createImageBitmap(stampedBlob).then(bitmap => {
      const canvas = previewCanvasRef.current!
      const max = canvas.parentElement?.clientWidth || bitmap.width
      const ratio = Math.min(1, max / bitmap.width)
      canvas.width = Math.round(bitmap.width * ratio)
      canvas.height = Math.round(bitmap.height * ratio)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
    })
  }, [stampedBlob])

  const continueSetup = async () => {
    setBusy(true)
    try {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        media.getTracks().forEach(t => t.stop())
        setCameraPermission('Allowed')
      } catch { setCameraPermission('Denied') }
      try {
        await getCurrentLocation(7000)
        setLocationPermission('Allowed')
      } catch (e) {
        setLocationPermission(String(e).includes('DENIED') ? 'Denied' : 'Not granted')
      }
      if (navigator.storage?.persist) setStoragePermission(await navigator.storage.persist() ? 'Persistent' : 'Available')
      const next = { ...settings, setupComplete: true }
      await setSavedSettings(next)
    } finally { setBusy(false) }
  }

  const resolveLocation = async (): Promise<LocationData | undefined> => {
    setGpsStatus('LOCATING...')
    try {
      const location = await getCurrentLocation(settings.locationTimeoutMs, { highAccuracy: settings.locationHighAccuracy, minimumAccuracy: settings.lowAccuracyThresholdM })
      let enriched = location
      if (settings.addressLookup && settings.allowExternalGeocoder && navigator.onLine) enriched = await reverseGeocode(location)
      setLocationPermission('Allowed')
      setGpsStatus(location.accuracy != null && location.accuracy > settings.lowAccuracyThresholdM ? 'LOW ACCURACY' : accuracyLabel(location))
      setGpsCaptureEnabled(true)
      return enriched
    } catch (e) {
      const status = String(e)
      setGpsStatus(status as GpsStatus)
      if (status === 'LOCATION DENIED') setLocationPermission('Denied')
      return undefined
    }
  }

  const capture = async (withLocation: boolean) => {
    if (!videoRef.current || busy) return
    setBusy(true)
    let location: LocationData | undefined
    try {
      if (withLocation) location = await resolveLocation()
      const originalBlob = await captureVideoFrame(videoRef.current)
      setDraft({ originalBlob, location, notes: '', captureDateTime: new Date().toISOString() })
      stopStream(stream)
      setStream(null)
    } catch (e) {
      setCameraError((e as Error).message || 'Capture failed')
    } finally { setBusy(false) }
  }

  const refreshLocation = async () => {
    const loc = await resolveLocation()
    if (draft && loc) setDraft({ ...draft, location: loc })
  }

  const toggleTorch = async () => {
    const track = stream?.getVideoTracks()[0]
    if (!track) return
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
    if (!capabilities.torch) { setCameraError('Torch is not supported by this camera.'); return }
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] } as unknown as MediaTrackConstraints)
      setTorch(!torch)
    } catch { setCameraError('Torch could not be enabled on this device.') }
  }

  const saveDraft = async () => {
    if (!draft || !stampedBlob || busy) return
    setBusy(true)
    try {
      const thumbnailBlob = await createThumbnail(stampedBlob)
      const fileName = buildPhotoFilename(draft.captureDateTime, draft.location?.latitude, draft.location?.longitude)
      await savePhoto({
        id: crypto.randomUUID(),
        originalBlob: draft.originalBlob,
        finalBlob: stampedBlob,
        thumbnailBlob,
        createdAt: new Date().toISOString(),
        captureDateTime: draft.captureDateTime,
        ...(draft.location || { timestamp: draft.captureDateTime }),
        notes: draft.notes,
        hasLocation: Boolean(draft.location),
        overlayPreset: overlay.preset,
        overlaySettings: overlay,
        fileName,
      })
      await refreshPhotos()
      setDraft(null)
      setStampedBlob(null)
      setActiveTab('gallery')
    } finally { setBusy(false) }
  }

  const exportAll = async () => {
    const zip = new JSZip()
    const root = zip.folder('GeoTagCamera-Backup')!
    const photosFolder = root.folder('photos')!
    const metadataFolder = root.folder('metadata')!
    for (const p of photos) {
      photosFolder.file(p.fileName, p.finalBlob)
      metadataFolder.file(`${p.id}.json`, JSON.stringify(p, null, 2))
    }
    root.file('manifest.json', JSON.stringify({ application: 'GeoTag Camera', version: '2.0', exportDate: new Date().toISOString(), photoCount: photos.length, schemaVersion: 2 }, null, 2))
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `GeoTagCamera-Backup-${new Date().toISOString().slice(0,10)}.zip`)
  }

  const importBackup = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file)
      const manifest = zip.file('GeoTagCamera-Backup/manifest.json')
      const entries = Object.values(zip.files).filter(f => f.name.includes('/metadata/') && f.name.endsWith('.json'))
      let imported = 0
      for (const entry of entries) {
        const meta = JSON.parse(await entry.async('text')) as Partial<PhotoRecord>
        if (!meta.id || !meta.fileName) continue
        const image = zip.file(`GeoTagCamera-Backup/photos/${meta.fileName}`)
        if (!image) continue
        const blob = await image.async('blob')
        await savePhoto({
          ...(meta as PhotoRecord),
          id: `${meta.id}-${crypto.randomUUID().slice(0,8)}`,
          originalBlob: blob,
          finalBlob: blob,
          thumbnailBlob: await createThumbnail(blob),
          createdAt: new Date().toISOString(),
          hasLocation: Boolean(meta.latitude != null && meta.longitude != null),
        })
        imported++
      }
      await refreshPhotos()
      setCameraError(manifest ? `Imported ${imported} photo(s).` : 'Backup imported.')
    } catch { setCameraError('Backup is invalid or could not be read.') }
  }

  const filteredPhotos = useMemo(() => photos.filter(p => {
    if (filter === 'geo' && !p.hasLocation) return false
    if (filter === 'no-geo' && p.hasLocation) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [p.placeName, p.area, p.address, p.city, p.district, p.state, p.notes, p.fileName].some(v => v?.toLowerCase().includes(q))
  }), [photos, filter, search])

  const storageMb = useMemo(() => (photos.reduce((n,p) => n + p.finalBlob.size + p.thumbnailBlob.size, 0) / 1048576).toFixed(1), [photos])

  if (!ready) return <div className="app-loading"><div className="loader-dot" /><span>Starting camera...</span></div>

  if (!settings.setupComplete) return (
    <main className="setup-screen safe-top safe-bottom">
      <div className="setup-mark"><Icon name="camera" size={28} /></div>
      <p className="eyebrow">PRIVATE · OFFLINE-FIRST</p>
      <h1>GeoTag Camera</h1>
      <p className="setup-copy">A camera that puts the place, area and GPS directly onto your photograph. Photos remain on this device.</p>
      <div className="permission-list">
        <div><Icon name="camera" /><span><b>Camera</b><small>Take photographs. No microphone access.</small></span></div>
        <div><Icon name="location" /><span><b>Location</b><small>Resolve GPS coordinates and nearby place details when you request them.</small></span></div>
        <div><Icon name="download" /><span><b>Local storage</b><small>IndexedDB keeps your gallery offline. Persistent storage is requested where supported.</small></span></div>
      </div>
      <button className="primary-button setup-button" onClick={continueSetup} disabled={busy}>{busy ? 'Preparing…' : 'Enable camera'}</button>
      <p className="fine-print">Location failure never blocks camera capture. Online place enrichment is optional.</p>
    </main>
  )

  const gpsTone = gpsStatus === 'LOCATION DENIED' || gpsStatus === 'LOCATION UNAVAILABLE' || gpsStatus === 'GPS TIMEOUT' ? 'danger' : gpsStatus === 'LOW ACCURACY' ? 'warn' : gpsStatus === 'LOCATION OFF' ? 'muted' : 'good'

  return (
    <div className="app-shell">
      <main className={activeTab === 'camera' ? 'camera-shell' : 'content-shell'}>
        {activeTab === 'camera' && !draft && (
          <section className="camera-screen">
            <div className="camera-preview">
              <video ref={videoRef} autoPlay muted playsInline className={facing === 'user' && settings.mirrorFrontCamera ? 'mirrored' : ''} />
              <div className="camera-vignette" />
              <div className="camera-top safe-top">
                <button className={`location-card ${gpsTone}`} onClick={resolveLocation} title="Enable or refresh GPS">
                  <span className="location-card-icon"><Icon name="location" size={22} /></span>
                  <span className="location-card-copy"><b>{gpsStatus === 'LOCATION OFF' ? 'Location Off' : gpsStatus === 'LOCATING...' ? 'Locating…' : gpsStatus}</b><small>{gpsStatus === 'LOCATION OFF' ? 'Tap to enable GPS' : gpsStatus === 'LOW ACCURACY' ? 'Accuracy can be improved' : 'Tap to refresh location'}</small></span>
                  <span className="location-chevron">›</span>
                </button>
                <div className="camera-actions">
                  <button className={`icon-button camera-circle ${torch ? 'active' : ''}`} onClick={toggleTorch} aria-label="Torch"><Icon name="flash" /></button>
                  <button className="icon-button camera-circle" onClick={() => startCamera(facing === 'environment' ? 'user' : 'environment')} aria-label="Switch camera"><Icon name="switch" /></button>
                  <button className="icon-button camera-circle" onClick={() => setActiveTab('settings')} aria-label="Settings"><Icon name="settings" /></button>
                </div>
              </div>
              {cameraError && <div className="camera-error glass">{cameraError}<button onClick={() => setCameraError('')}><Icon name="x" size={16} /></button></div>}
              <div className="camera-focus-grid" aria-hidden="true">
                <span className="focus-corner tl" /><span className="focus-corner tr" /><span className="focus-corner bl" /><span className="focus-corner br" /><span className="focus-cross" />
              </div>
              <div className="camera-zoom" aria-hidden="true"><span>3×</span><b>1×</b><span>0.5</span></div>
              <div className="camera-bottom safe-bottom">
                <button className="round-action camera-tool" onClick={() => setActiveTab('gallery')} aria-label="Gallery"><Icon name="image" /></button>
                <button className="shutter-ring" onClick={() => capture(gpsCaptureEnabled)} disabled={busy} aria-label={gpsCaptureEnabled ? 'Capture with GPS' : 'Capture without GPS'}><span className="shutter-core" /></button>
                <label className="round-action camera-tool" aria-label="Import photo"><Icon name="upload" /><input type="file" accept="image/*" hidden onChange={e => { const f=e.target.files?.[0]; if(f){setDraft({originalBlob:f,notes:'',captureDateTime:new Date().toISOString()}); stopStream(stream)}}} /></label>
              </div>
              <button className={`gps-capture-switch ${gpsCaptureEnabled ? 'enabled' : ''}`} onClick={() => { if (!gpsCaptureEnabled) resolveLocation(); else setGpsCaptureEnabled(false) }} disabled={busy}>
                <span className="gps-switch-icon"><Icon name="location" size={21} /></span>
                <span><b>Capture with GPS</b><small>{gpsCaptureEnabled ? 'Location will be added to photo' : 'Adds location info to photo'}</small></span>
                <span className="switch-track"><i /></span>
              </button>
            </div>
          </section>
        )}

        {activeTab === 'camera' && draft && (
          <section className="editor-screen">
            <header className="editor-header">
              <button className="icon-button glass" onClick={() => { setDraft(null); setStampedBlob(null); startCamera(facing) }} aria-label="Retake"><Icon name="x" /></button>
              <div><p className="eyebrow">CAPTURE PREVIEW</p><b>{draft.location ? placeSummary(draft.location).title : 'No location attached'}</b></div>
              <button className="preview-save-button" onClick={saveDraft} disabled={busy}><Icon name="check" size={20} /> Save</button>
            </header>
            <div className="preview-wrap"><canvas ref={previewCanvasRef} aria-label="Stamped photograph preview" /></div>
            <div className="editor-sheet">
              <div className="location-preview location-preview-reference">
                <Icon name="location" size={27} />
                <div><b>{draft.location ? placeSummary(draft.location).title : 'Location not attached'}</b><small>{draft.location ? 'Using current GPS location' : 'You can capture without GPS.'}</small></div>
                <button className="secondary-button refresh-inline" onClick={refreshLocation}><Icon name="refresh" size={17} /> Refresh location</button>
              </div>
              <div className="editor-actions editor-actions-reference">
                <button className="secondary-button" onClick={() => { setDraft(null); setStampedBlob(null); startCamera(facing) }}><Icon name="refresh" size={19} /> Retake</button>
                <button className="primary-button" onClick={saveDraft} disabled={busy}><Icon name="check" size={19} /> {busy ? 'Saving…' : 'Save photo'}</button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'gallery' && (
          <section className="library-view">
            <header className="page-header"><div><p className="eyebrow">PRIVATE LIBRARY</p><h1>Gallery</h1></div><button className="primary-button compact" onClick={exportAll}><Icon name="download" size={17} /> Backup</button></header>
            <div className="searchbar"><Icon name="search" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search place, area, city or note" /></div>
            <div className="filter-row">{(['all','geo','no-geo'] as const).map(f=><button key={f} className={filter===f?'filter active':'filter'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='geo'?'GPS':'No GPS'}</button>)}<span className="library-count">{filteredPhotos.length} photos</span></div>
            {filteredPhotos.length === 0 ? <div className="empty-state"><Icon name="image" size={30}/><b>No photos yet</b><span>Captured photographs will appear here.</span></div> : <div className="photo-grid">{filteredPhotos.map(photo => <button className="photo-tile" key={photo.id} onClick={()=>setSelectedPhoto(photo)}><img src={URL.createObjectURL(photo.thumbnailBlob)} alt={photo.fileName}/><span className="photo-meta">{photo.hasLocation ? <><Icon name="location" size={12}/> {photo.area || photo.city || 'GPS'}</> : 'No GPS'}</span></button>)}</div>}
            {selectedPhoto && <PhotoViewer photo={selectedPhoto} onClose={()=>setSelectedPhoto(null)} onDelete={async()=>{await deletePhoto(selectedPhoto.id);setSelectedPhoto(null);await refreshPhotos()}} onShare={async()=>shareFile(selectedPhoto)} />}
          </section>
        )}

        {activeTab === 'map' && (
          <section className="library-view">
            <header className="page-header"><div><p className="eyebrow">LOCATION INDEX</p><h1>Map</h1></div><span className="online-badge">{navigator.onLine ? 'Online' : 'Offline'}</span></header>
            {photos.filter(p=>p.hasLocation).length === 0 ? <div className="empty-state"><Icon name="map" size={30}/><b>No geotagged photographs</b><span>Capture with GPS to build your location index.</span></div> : <div className="location-list">{photos.filter(p=>p.hasLocation).map(p=>{const s=placeSummary(p);return <article className="location-row" key={p.id}><div className="map-pin"><Icon name="location" size={18}/></div><div className="location-copy"><b>{s.title}</b><span>{[p.area,p.city,p.district,p.state].filter(Boolean).join(' · ')}</span><small>{p.latitude?.toFixed(6)}, {p.longitude?.toFixed(6)} · {displayDatePretty(p.captureDateTime)}</small></div><a className="external-map" href={`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer">Open</a></article>})}</div>}
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="library-view">
            <header className="page-header"><div><p className="eyebrow">CONTROL CENTER</p><h1>Settings</h1></div></header>
            <SettingGroup title="Permissions">
              <StatusLine label="Camera" value={cameraPermission}/><StatusLine label="Location" value={locationPermission}/><StatusLine label="Storage" value={storagePermission}/>
            </SettingGroup>
            <SettingGroup title="Location">
              <Toggle label="High accuracy GPS" checked={settings.locationHighAccuracy} onChange={v=>setSavedSettings({...settings,locationHighAccuracy:v})}/>
              <Toggle label="Online place enrichment" checked={settings.allowExternalGeocoder} onChange={v=>setSavedSettings({...settings,allowExternalGeocoder:v})}/>
              <Toggle label="Address lookup" checked={settings.addressLookup} onChange={v=>setSavedSettings({...settings,addressLookup:v})}/>
              <div className="setting-line"><span>Accuracy warning</span><select value={settings.lowAccuracyThresholdM} onChange={e=>setSavedSettings({...settings,lowAccuracyThresholdM:Number(e.target.value)})}><option value="25">±25 m</option><option value="50">±50 m</option><option value="100">±100 m</option></select></div>
            </SettingGroup>
            <SettingGroup title="Stamp">
              <div className="setting-line"><span>Default style</span><select value={settings.defaultPreset} onChange={e=>setSavedSettings({...settings,defaultPreset:e.target.value as OverlayPreset})}>{presets.map(p=><option key={p}>{p}</option>)}</select></div>
              <div className="setting-line"><span>Coordinate precision</span><select value={settings.coordinatePrecision} onChange={e=>setSavedSettings({...settings,coordinatePrecision:Number(e.target.value)})}><option value="5">5 decimals</option><option value="6">6 decimals</option><option value="7">7 decimals</option></select></div>
              <Toggle label="Mirror front camera" checked={settings.mirrorFrontCamera} onChange={v=>setSavedSettings({...settings,mirrorFrontCamera:v})}/>
            </SettingGroup>
            <SettingGroup title="Storage">
              <StatusLine label="Photos" value={String(photos.length)}/><StatusLine label="Estimated used" value={`${storageMb} MB`}/>
              <div className="setting-actions"><label className="secondary-button"><Icon name="upload" size={17}/> Import backup<input type="file" accept=".zip" hidden onChange={e=>{const f=e.target.files?.[0];if(f)importBackup(f)}}/></label><button className="danger-button" onClick={async()=>{if(confirm('Delete all locally stored photographs and metadata?')){await clearAllData();await refreshPhotos()}}}><Icon name="trash" size={17}/> Clear all</button></div>
            </SettingGroup>
            <SettingGroup title="Privacy">
              <p className="privacy-copy">No account, profile, cloud photo storage, advertising, analytics or background GPS. Reverse geocoding sends only the coordinates required by the selected provider. Camera capture, stamping and gallery work offline.</p>
            </SettingGroup>
          </section>
        )}
      </main>

      <nav className="bottom-nav safe-bottom">{([['camera','camera','Camera'],['gallery','image','Gallery'],['map','map','Map'],['settings','settings','Settings']] as [Tab,IconName,string][]).map(([tab,icon,label])=><button key={tab} className={activeTab===tab?'active':''} onClick={()=>setActiveTab(tab)}><Icon name={icon} size={19}/><span>{label}</span></button>)}</nav>
    </div>
  )
}

const SettingGroup = ({ title, children }: { title:string; children:ReactNode }) => <section className="setting-group"><p className="eyebrow">{title}</p><div className="setting-body">{children}</div></section>
const StatusLine = ({ label, value }: {label:string;value:string}) => <div className="setting-line"><span>{label}</span><b>{value}</b></div>
const Toggle = ({ label, checked, onChange }: {label:string;checked:boolean;onChange:(v:boolean)=>void}) => <label className="setting-line"><span>{label}</span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>

const PhotoViewer = ({ photo, onClose, onDelete, onShare }: {photo:PhotoRecord;onClose:()=>void;onDelete:()=>void;onShare:()=>void}) => (
  <div className="viewer-backdrop" role="dialog" aria-modal="true">
    <div className="viewer">
      <header><button className="icon-button glass" onClick={onClose} aria-label="Close"><Icon name="x"/></button><span>{displayDatePretty(photo.captureDateTime)}</span><button className="icon-button glass" onClick={onShare} aria-label="Share"><Icon name="share"/></button></header>
      <img src={URL.createObjectURL(photo.finalBlob)} alt={photo.fileName}/>
      <div className="viewer-details">
        <b>{photo.placeName || photo.area || photo.city || 'No location'}</b>
        <span>{[photo.area,photo.city,photo.district,photo.state].filter(Boolean).join(' · ')}</span>
        <small>{photo.latitude != null && photo.longitude != null ? `${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)} · Accuracy ±${Math.round(photo.accuracy || 0)} m` : 'No GPS data'}</small>
        <div className="viewer-actions"><button className="secondary-button" onClick={()=>downloadBlob(photo.finalBlob,photo.fileName)}><Icon name="download" size={17}/> Download</button><button className="danger-button" onClick={onDelete}><Icon name="trash" size={17}/> Delete</button></div>
      </div>
    </div>
  </div>
)

const shareFile = async (photo:PhotoRecord) => {
  const file = new File([photo.finalBlob],photo.fileName,{type:photo.finalBlob.type||'image/jpeg',lastModified:new Date(photo.captureDateTime).getTime()||Date.now()})
  try { if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:photo.fileName});return} } catch(e){if(e instanceof DOMException&&e.name==='AbortError')return}
  downloadBlob(photo.finalBlob,photo.fileName)
}

export default App
