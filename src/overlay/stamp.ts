import type { AppSettings, LocationData, OverlaySettings } from '../types'
import { displayDatePretty, formatTime } from '../utils/date'

interface StampInput {
  imageBlob: Blob
  location?: LocationData
  notes?: string
  overlay: OverlaySettings
  appSettings: AppSettings
  captureTimestamp?: string
}

type DrawableImage = ImageBitmap | HTMLImageElement

const blobToImageBitmap = async (blob: Blob): Promise<DrawableImage> => {
  if ('createImageBitmap' in window) return createImageBitmap(blob)
  const img = new Image()
  img.src = URL.createObjectURL(blob)
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return img
}

const dimensions = (img: DrawableImage) =>
  'naturalWidth' in img ? { width: img.naturalWidth, height: img.naturalHeight } : { width: img.width, height: img.height }

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image()
  const timer = window.setTimeout(() => reject(new Error('timeout')), 2200)
  img.crossOrigin = 'anonymous'
  img.referrerPolicy = 'no-referrer'
  img.decoding = 'async'
  img.onload = () => { window.clearTimeout(timer); resolve(img) }
  img.onerror = () => { window.clearTimeout(timer); reject(new Error('failed')) }
  img.src = url
})

const tilePoint = (lat: number, lon: number, zoom: number) => {
  const r = (lat * Math.PI) / 180
  const n = 2 ** zoom
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n,
    n,
  }
}

const drawMap = async (location: LocationData, size: number): Promise<HTMLCanvasElement | null> => {
  const zoom = 16
  const tile = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#e8edf2'
  ctx.fillRect(0, 0, size, size)

  const p = tilePoint(location.latitude, location.longitude, zoom)
  const worldX = p.x * tile
  const worldY = p.y * tile
  const left = worldX - size / 2
  const top = worldY - size / 2
  const minX = Math.floor(left / tile)
  const minY = Math.floor(top / tile)
  const maxX = Math.floor((left + size) / tile)
  const maxY = Math.floor((top + size) / tile)

  let loaded = 0
  const jobs: Promise<void>[] = []
  for (let ty = minY; ty <= maxY; ty += 1) {
    if (ty < 0 || ty >= p.n) continue
    for (let tx = minX; tx <= maxX; tx += 1) {
      const wrapped = ((tx % p.n) + p.n) % p.n
      jobs.push(loadImage(`https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`).then(img => {
        ctx.drawImage(img, tx * tile - left, ty * tile - top, tile, tile)
        loaded += 1
      }).catch(() => {}))
    }
  }
  await Promise.all(jobs)
  if (!loaded) return null
  try { ctx.getImageData(0, 0, 1, 1) } catch { return null }

  const pinX = size / 2
  const pinY = size / 2
  ctx.fillStyle = '#d32f2f'
  ctx.beginPath()
  ctx.moveTo(pinX, pinY + size * .09)
  ctx.bezierCurveTo(pinX - size * .10, pinY - size * .02, pinX - size * .07, pinY - size * .13, pinX, pinY - size * .13)
  ctx.bezierCurveTo(pinX + size * .07, pinY - size * .13, pinX + size * .10, pinY - size * .02, pinX, pinY + size * .09)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(pinX, pinY - size * .06, Math.max(2, size * .024), 0, Math.PI * 2)
  ctx.fill()
  return canvas
}

const fallbackMap = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, location: LocationData) => {
  ctx.save()
  ctx.fillStyle = '#15263a'
  ctx.fillRect(x, y, size, size)
  ctx.strokeStyle = 'rgba(255,255,255,.14)'
  ctx.lineWidth = 1
  for (let i = 1; i < 5; i += 1) {
    ctx.beginPath(); ctx.moveTo(x + size * i / 5, y); ctx.lineTo(x + size * i / 5, y + size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x, y + size * i / 5); ctx.lineTo(x + size, y + size * i / 5); ctx.stroke()
  }
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${Math.max(11, size * .075)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('GPS FIX', x + size / 2, y + size * .42)
  ctx.font = `500 ${Math.max(8, size * .052)}px Inter, system-ui, sans-serif`
  ctx.fillText(`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`, x + size / 2, y + size * .60)
  ctx.restore()
}

const unique = (items: Array<string | undefined | null>) => {
  const out: string[] = []
  for (const item of items) {
    const value = item?.trim()
    if (value && !out.some(x => x.toLowerCase() === value.toLowerCase())) out.push(value)
  }
  return out
}


const wrap = (ctx: CanvasRenderingContext2D, value: string, width: number, max: number) => {
  const words = value.split(/\\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (current && ctx.measureText(next).width > width) {
      lines.push(current)
      current = word
      if (lines.length === max - 1) break
    } else {
      current = next
    }
  }
  if (current && lines.length < max) lines.push(current)
  return lines
}

const PLUS_CODE_ALPHABET = '23456789CFGHJMPQRVWX'

const makePlusCode = (latitude: number, longitude: number) => {
  const lat = Math.min(89.9999999, Math.max(-90, latitude)) + 90
  const lon = ((longitude + 180) % 360 + 360) % 360
  const resolutions = [20, 1, 0.05, 0.0025, 0.000125]
  let latValue = lat
  let lonValue = lon
  let code = ''
  for (const resolution of resolutions) {
    const latIndex = Math.min(19, Math.floor(latValue / resolution))
    const lonIndex = Math.min(19, Math.floor(lonValue / resolution))
    code += PLUS_CODE_ALPHABET[latIndex] + PLUS_CODE_ALPHABET[lonIndex]
    latValue -= latIndex * resolution
    lonValue -= lonIndex * resolution
  }
  return `${code.slice(0, 8)}+${code.slice(8, 10)}`
}

const locationText = (location: LocationData) => ({
  title: location.placeName?.trim() || 'GPS location',
  area: location.area?.trim() || location.neighbourhood?.trim() || location.sublocality?.trim() || 'N/A',
  locality: location.locality?.trim() || location.sublocality?.trim() || location.neighbourhood?.trim() || 'N/A',
  city: location.city?.trim() || location.town?.trim() || location.village?.trim() || location.municipality?.trim() || 'N/A',
  district: location.district?.trim() || 'N/A',
  state: location.state?.trim() || location.region?.trim() || 'N/A',
  country: location.country?.trim() || location.countryCode?.trim() || 'N/A',
  postalCode: location.postalCode?.trim() || 'N/A',
  address: location.address?.trim() ||
    unique([
      location.streetNumber && location.street ? `${location.streetNumber} ${location.street}` : undefined,
      location.street,
      location.area,
      location.city,
      location.district,
      location.state,
      location.postalCode,
      location.country,
    ]).join(', ') || 'N/A',
})

const valueOrNA = (value: string | number | null | undefined) => value == null || value === '' ? 'N/A' : String(value)

export const renderStampedPhoto = async ({
  imageBlob, location, overlay, appSettings, captureTimestamp,
}: StampInput): Promise<Blob> => {
  const source = await blobToImageBitmap(imageBlob)
  const { width, height } = dimensions(source)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageBlob

  // Draw the camera frame at native resolution first. The evidence panel is
  // then rasterized directly onto that same native-resolution canvas.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

  if (!location) return await new Promise(resolve => canvas.toBlob(b => resolve(b ?? imageBlob), 'image/jpeg', .97))

  const portrait = height >= width
  const pad = Math.max(18, Math.round(width * .024))
  const panelH = Math.round(height * (portrait ? .445 : .40))
  const y = height - panelH
  const mapSize = Math.round(Math.min(width * (portrait ? .25 : .24), 250))
  const gap = Math.max(14, Math.round(width * .018))
  const mapX = width - pad - mapSize
  const mapY = y + pad + 36
  const contentRight = mapX - gap
  const leftWidth = contentRight - pad

  const lt = locationText(location)
  const stampTime = captureTimestamp ?? location.timestamp
  const labelSize = Math.max(10, Math.round(width * .014))
  const valueSize = Math.max(14, Math.round(width * .019))
  const titleSize = Math.max(25, Math.round(width * .042))
  const bodySize = Math.max(13, Math.round(width * .017))
  const headerSize = Math.max(10, Math.round(width * .014))

  ctx.save()
  ctx.fillStyle = 'rgba(3,8,15,.97)'
  ctx.fillRect(0, y, width, panelH)

  // Strong documentary header.
  ctx.fillStyle = '#d6a33a'
  ctx.fillRect(0, y, width, Math.max(3, Math.round(width * .003)))
  ctx.font = `850 ${headerSize}px Inter, Arial, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.fillText('GPS MAP CAMERA', pad, y + pad + headerSize)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#e2b85a'
  ctx.fillText('LOCATION VERIFIED', width - pad, y + pad + headerSize)

  // Place / landmark.
  let top = y + pad + 36
  ctx.textAlign = 'left'
  ctx.font = `850 ${titleSize}px Inter, Arial, sans-serif`
  ctx.fillStyle = '#ffffff'
  const titleLines = wrap(ctx, lt.title, leftWidth, 2)
  titleLines.forEach((line, i) => ctx.fillText(line, pad, top + titleSize * .82 + i * titleSize * .9))
  top += titleLines.length * titleSize * .9 + 7

  // Explicit administrative hierarchy, never collapsed into a single ambiguous line.
  const hierarchy = [
    ['AREA / LOCALITY', `${lt.area}  /  ${lt.locality}`],
    ['CITY / DISTRICT', `${lt.city}  /  ${lt.district}`],
    ['STATE / COUNTRY', `${lt.state}  /  ${lt.country}`],
    ['FULL ADDRESS', lt.address],
  ]
  ctx.strokeStyle = 'rgba(255,255,255,.14)'
  ctx.lineWidth = 1
  hierarchy.forEach(([label, value]) => {
    ctx.beginPath()
    ctx.moveTo(pad, top - 5)
    ctx.lineTo(contentRight, top - 5)
    ctx.stroke()
    ctx.font = `800 ${labelSize}px Inter, Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.43)'
    ctx.textAlign = 'left'
    ctx.fillText(label, pad, top + labelSize)
    ctx.font = `650 ${bodySize}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#ffffff'
    const lines = wrap(ctx, value, leftWidth, label === 'FULL ADDRESS' ? 2 : 1)
    lines.forEach((line, i) => ctx.fillText(line, pad, top + labelSize + bodySize + 1 + i * bodySize * .82))
    top += labelSize + bodySize * (lines.length > 1 ? 1.75 : 1.25) + 7
  })

  // Map inset.
  const map = await drawMap(location, mapSize)
  ctx.save()
  ctx.beginPath()
  const radius = Math.max(9, Math.round(mapSize * .07))
  ctx.moveTo(mapX + radius, mapY)
  ctx.arcTo(mapX + mapSize, mapY, mapX + mapSize, mapY + mapSize, radius)
  ctx.arcTo(mapX + mapSize, mapY + mapSize, mapX, mapY + mapSize, radius)
  ctx.arcTo(mapX, mapY + mapSize, mapX, mapY, radius)
  ctx.arcTo(mapX, mapY, mapX + mapSize, mapY, radius)
  ctx.closePath()
  ctx.clip()
  if (map) ctx.drawImage(map, mapX, mapY, mapSize, mapSize)
  else fallbackMap(ctx, mapX, mapY, mapSize, location)
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,.5)'
  ctx.lineWidth = 1
  ctx.strokeRect(mapX + .5, mapY + .5, mapSize - 1, mapSize - 1)
  ctx.font = `500 ${Math.max(8, Math.round(labelSize * .75))}px Inter, Arial, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.45)'
  ctx.textAlign = 'right'
  ctx.fillText('© OpenStreetMap', mapX + mapSize - 6, mapY + mapSize - 5)

  // Complete capture/evidence metadata. Every requested field is retained;
  // unavailable sensor/address values are explicitly marked N/A rather than omitted.
  const plusCode = location.plusCode?.trim() || makePlusCode(location.latitude, location.longitude)
  const fields: Array<[string, string]> = [
    ['LATITUDE', location.latitude.toFixed(overlay.coordinatePrecision)],
    ['LONGITUDE', location.longitude.toFixed(overlay.coordinatePrecision)],
    ['GPS ACCURACY', location.accuracy != null ? `±${Math.round(location.accuracy)} m` : 'N/A'],
    ['DATE', displayDatePretty(stampTime)],
    ['TIME', formatTime(stampTime, appSettings.use24Hour)],
    ['ALTITUDE', location.altitude != null ? `${location.altitude.toFixed(1)} m` : 'N/A'],
    ['HEADING', location.heading != null && Number.isFinite(location.heading) ? `${Math.round(location.heading)}°` : 'N/A'],
    ['SPEED', location.speed != null && Number.isFinite(location.speed) ? `${Math.max(0, location.speed * 3.6).toFixed(1)} km/h` : 'N/A'],
    ['POSTAL CODE', valueOrNA(location.postalCode)],
    ['PLUS CODE', plusCode],
  ]

  const metaTop = y + panelH - Math.round(labelSize + valueSize + 11) * 3 - pad - 6
  const cols = 3
  const colGap = Math.max(12, Math.round(width * .014))
  const colW = (width - pad * 2 - colGap * 2) / cols
  const rowH = Math.max(39, Math.round(labelSize + valueSize + 12))

  ctx.strokeStyle = 'rgba(255,255,255,.14)'
  ctx.beginPath()
  ctx.moveTo(pad, metaTop - 9)
  ctx.lineTo(width - pad, metaTop - 9)
  ctx.stroke()

  fields.forEach(([label, value], index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const x = pad + col * (colW + colGap)
    const yy = metaTop + row * rowH
    ctx.textAlign = 'left'
    ctx.font = `800 ${labelSize}px Inter, Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.43)'
    ctx.fillText(label, x, yy + labelSize)
    ctx.font = `700 ${valueSize}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(value, x, yy + labelSize + valueSize + 1)
  })

  ctx.restore()
  return await new Promise(resolve => canvas.toBlob(b => resolve(b ?? imageBlob), 'image/jpeg', .97))
}

export const createThumbnail = async (blob: Blob): Promise<Blob> => {
  const img = await blobToImageBitmap(blob)
  const { width, height } = dimensions(img)
  const ratio = Math.min(320 / width, 320 / height, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return await new Promise(resolve => canvas.toBlob(b => resolve(b ?? blob), 'image/jpeg', .9))
}
