import type { AppSettings, LocationData, OverlaySettings } from '../types'
import { displayDateLong, formatTime, formatTimeZone } from '../utils/date'
import { encodePlusCode } from '../utils/plusCode'

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

const countryFlag = (countryCode?: string) => {
  const code = countryCode?.trim().toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return ''
  return String.fromCodePoint(...[...code].map(char => 127397 + char.charCodeAt(0)))
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

const locationText = (location: LocationData) => ({
  title: location.placeName?.trim() || location.area?.trim() || location.locality?.trim() || location.city?.trim() || 'GPS location',
  area: location.area?.trim() || location.neighbourhood?.trim() || location.sublocality?.trim() || location.street?.trim(),
  road: location.street?.trim(),
  locality: location.locality?.trim() || location.sublocality?.trim() || location.neighbourhood?.trim(),
  city: location.city?.trim() || location.town?.trim() || location.village?.trim() || location.municipality?.trim(),
  district: location.district?.trim(),
  state: location.state?.trim() || location.region?.trim(),
  country: location.country?.trim() || location.countryCode?.trim(),
  countryCode: location.countryCode?.trim(),
  postalCode: location.postalCode?.trim(),
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
    ]).join(', ') || undefined,
})

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
  // Keep the burned-in evidence strip compact: never more than 25% of the photo.
  const panelH = Math.round(height * (portrait ? .245 : .22))
  const y = height - panelH
  const mapSize = Math.max(96, Math.round(Math.min(width * (portrait ? .145 : .16), panelH - pad * 2 - 28, 210)))
  const gap = Math.max(14, Math.round(width * .018))
  const lt = locationText(location)
  const areaLocality = unique([lt.area, lt.locality]).join(' / ')
  const stampTime = captureTimestamp ?? location.timestamp
  const headerSize = Math.max(10, Math.round(width * .014))

  // Compact evidence layout: identity/address at left, map at right, all
  // capture metadata in a dense two-row footer. The panel stays within 25%.
  const map = await drawMap(location, mapSize)
  const radius = Math.max(7, Math.round(mapSize * .07))
  const mapY = y + pad + 26
  const mapX = width - pad - mapSize
  const contentRight = mapX - gap
  const leftWidth = Math.max(100, contentRight - pad)

  ctx.save()
  ctx.fillStyle = 'rgba(3,8,15,.97)'
  ctx.fillRect(0, y, width, panelH)
  ctx.fillStyle = '#d6a33a'
  ctx.fillRect(0, y, width, Math.max(2, Math.round(width * .0022)))

  // Header.
  ctx.font = `850 ${headerSize}px Inter, Arial, sans-serif`
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`GPS MAP CAMERA${countryFlag(lt.countryCode) ? `  ${countryFlag(lt.countryCode)}` : ''}`, pad, y + pad + headerSize)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#e2b85a'
  const gpsQuality = location.accuracy == null
    ? 'GPS FIX'
    : location.accuracy <= appSettings.lowAccuracyThresholdM ? 'GPS VERIFIED' : 'LOW ACCURACY'
  ctx.fillText(gpsQuality, width - pad, y + pad + headerSize)

  // Place / landmark.
  let top = y + pad + 27
  ctx.textAlign = 'left'
  ctx.font = `850 ${Math.max(18, Math.round(width * .029))}px Inter, Arial, sans-serif`
  ctx.fillStyle = '#ffffff'
  const titleLines = wrap(ctx, lt.title, leftWidth, 1)
  ctx.fillText(titleLines[0] || 'GPS location', pad, top + Math.max(18, Math.round(width * .029)) * .82)
  top += Math.max(20, Math.round(width * .029)) + 3

  const plusCode = location.plusCode?.trim() || encodePlusCode(
    location.latitude,
    location.longitude,
    Boolean(location.city || location.town || location.village || location.locality),
  )
  const cityDistrict = unique([lt.city, lt.district]).join(' · ')
  const stateCountryPostal = unique([lt.state, lt.country, lt.postalCode]).join(' · ')
  // Keep each semantic field distinct even when the compact stamp combines
  // related values on one line for readability.
  const compactLines: Array<[string, string]> = [
    [plusCode && areaLocality ? 'PLUS CODE · AREA / LOCALITY' : plusCode ? 'PLUS CODE' : areaLocality ? 'AREA / LOCALITY' : '', unique([plusCode, areaLocality]).join(' · ')],
    [lt.road ? 'ROAD / STREET' : '', lt.road ?? ''],
    [cityDistrict ? 'CITY · DISTRICT' : '', cityDistrict],
    [stateCountryPostal ? 'STATE · COUNTRY · POSTAL' : '', stateCountryPostal],
    [lt.address ? 'FULL ADDRESS' : '', lt.address ?? ''],
  ].filter((line): line is [string, string] => Boolean(line[0] && line[1]))
  const compactLabel = Math.max(7, Math.round(width * .009))
  const compactValue = Math.max(9, Math.round(width * .0115))
  const compactRow = Math.max(20, Math.round(panelH * .075))
  compactLines.forEach(([label, value], i) => {
    const yy = top + i * compactRow
    ctx.font = `800 ${compactLabel}px Inter, Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.42)'
    ctx.textAlign = 'left'
    ctx.fillText(label, pad, yy)
    ctx.font = `650 ${compactValue}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#ffffff'
    const lines = wrap(ctx, value, leftWidth, 1)
    ctx.fillText(lines[0] ?? '', pad, yy + compactValue + 1)
  })

  // Street map inset.
  ctx.save()
  ctx.beginPath()
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

  // Complete metadata in compact rows.
  const fields: Array<[string, string]> = [
    ['LATITUDE', location.latitude.toFixed(overlay.coordinatePrecision)],
    ['LONGITUDE', location.longitude.toFixed(overlay.coordinatePrecision)],
    ...(location.accuracy != null ? [['GPS ACCURACY', `±${Math.round(location.accuracy)} m`] as [string, string]] : []),
    ['DATE', displayDateLong(stampTime)],
    ['TIME', formatTime(stampTime, appSettings.use24Hour)],
    ['TIME ZONE', formatTimeZone(stampTime)],
    ...(location.altitude != null ? [['ALTITUDE', `${location.altitude.toFixed(1)} m`] as [string, string]] : []),
    ...(location.heading != null && Number.isFinite(location.heading) ? [['HEADING', `${Math.round(location.heading)}°`] as [string, string]] : []),
    ...(location.speed != null && Number.isFinite(location.speed) ? [['SPEED', `${Math.max(0, location.speed * 3.6).toFixed(1)} km/h`] as [string, string]] : []),
    ...(location.postalCode ? [['POSTAL CODE', location.postalCode] as [string, string]] : []),
    ...(plusCode ? [['PLUS CODE', plusCode] as [string, string]] : []),
  ]

  const footerTop = y + panelH - Math.max(34, Math.round(panelH * .27))
  const cols = 5
  const colGap = Math.max(8, Math.round(width * .009))
  const colW = (width - pad * 2 - colGap * (cols - 1)) / cols
  const rowH = Math.max(24, Math.round(panelH * .105))
  ctx.strokeStyle = 'rgba(255,255,255,.13)'
  ctx.beginPath()
  ctx.moveTo(pad, footerTop - 6)
  ctx.lineTo(width - pad, footerTop - 6)
  ctx.stroke()

  fields.forEach(([label, value], index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const x = pad + col * (colW + colGap)
    const yy = footerTop + row * rowH
    ctx.textAlign = 'left'
    ctx.font = `800 ${compactLabel}px Inter, Arial, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.42)'
    ctx.fillText(label, x, yy + compactLabel)
    ctx.font = `700 ${Math.max(10, Math.round(width * .0125))}px Inter, Arial, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(value, x, yy + compactLabel + Math.max(10, Math.round(width * .0125)) + 1)
  })

  ctx.restore()
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
