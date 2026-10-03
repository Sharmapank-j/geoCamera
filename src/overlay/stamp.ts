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

const locationText = (location: LocationData) => {
  const title = location.placeName?.trim() || location.area?.trim() || location.locality?.trim() ||
    location.city?.trim() || location.district?.trim() || location.state?.trim() || 'GPS location'
  const regionLine = unique([
    location.area,
    location.locality,
    location.city,
    location.district,
    location.state,
    location.countryCode || location.country,
  ]).filter(x => x.toLowerCase() !== title.toLowerCase()).join(' ')
  const address = location.address?.trim() ||
    unique([
      location.streetNumber && location.street ? `${location.streetNumber} ${location.street}` : undefined,
      location.street,
    ]).join(', ')
  return { title, regionLine, address }
}

const wrap = (ctx: CanvasRenderingContext2D, value: string, width: number, max: number) => {
  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (current && ctx.measureText(next).width > width) {
      lines.push(current)
      current = word
      if (lines.length === max - 1) break
    } else current = next
  }
  if (current && lines.length < max) lines.push(current)
  return lines
}


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
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
  if (!location) return await new Promise(resolve => canvas.toBlob(b => resolve(b ?? imageBlob), 'image/jpeg', .95))

  const portrait = height >= width
  const scale = Math.max(1, width / 1080)
  const pad = Math.max(18, Math.round(width * .022))
  const mapSize = Math.round(Math.min(width * (portrait ? .27 : .22), 300))
  const gap = Math.round(pad * .85)
  const leftWidth = width - pad * 2 - mapSize - gap
  const lt = locationText(location)
  const stampTime = captureTimestamp ?? location.timestamp

  const titleFont = Math.max(24, Math.round(width * .043))
  const bodyFont = Math.max(15, Math.round(width * .023))
  const labelFont = Math.max(10, Math.round(width * .015))
  const valueFont = Math.max(13, Math.round(width * .020))

  ctx.font = `800 ${titleFont}px Inter, system-ui, sans-serif`
  const titleLines = wrap(ctx, lt.title, leftWidth, 2)
  ctx.font = `650 ${bodyFont}px Inter, system-ui, sans-serif`
  const regionLines = wrap(ctx, lt.regionLine, leftWidth, 2)
  const addressLines = lt.address ? wrap(ctx, lt.address, leftWidth, 2) : []

  const metadata: Array<[string, string]> = [
    ['LATITUDE', location.latitude.toFixed(overlay.coordinatePrecision)],
    ['LONGITUDE', location.longitude.toFixed(overlay.coordinatePrecision)],
    ['ACCURACY', location.accuracy != null ? `±${Math.round(location.accuracy)} m` : 'N/A'],
    ['DATE', displayDatePretty(stampTime)],
    ['TIME', formatTime(stampTime, appSettings.use24Hour)],
  ]
  if (location.altitude != null) metadata.push(['ALTITUDE', `${location.altitude.toFixed(1)} m`])
  if (location.heading != null && Number.isFinite(location.heading)) metadata.push(['HEADING', `${Math.round(location.heading)}°`])
  if (location.speed != null && Number.isFinite(location.speed)) metadata.push(['SPEED', `${Math.max(0, location.speed * 3.6).toFixed(1)} km/h`])
  if (location.postalCode) metadata.push(['POSTAL CODE', location.postalCode])
  if (location.plusCode) metadata.push(['PLUS CODE', location.plusCode])

  const columns = 2
  const rows = Math.ceil(metadata.length / columns)
  const metaRowH = labelFont + valueFont + Math.max(8, Math.round(pad * .42))
  const headerH = Math.max(42, Math.round(smallFont * 2.15))
  const titleH = titleLines.length * titleFont * .92
  const regionH = regionLines.length * bodyFont * .90
  const addressH = addressLines.length ? addressLines.length * bodyFont * .84 : 0
  const metaH = rows * metaRowH
  const contentH = headerH + titleH + regionH + addressH + metaH + pad * 1.65
  const panelH = Math.min(height * (portrait ? .38 : .36), Math.max(mapSize + pad * 2, contentH))
  const y = height - panelH
  const mapX = width - pad - mapSize
  const mapY = y + pad

  ctx.save()
  ctx.fillStyle = 'rgba(3,8,15,.95)'
  ctx.fillRect(0, y, width, panelH)

  // Documentary header rule and restrained accent.
  ctx.fillStyle = '#d6a33a'
  ctx.fillRect(0, y, width, Math.max(3, Math.round(width * .0028)))

  const left = pad
  const right = mapX - gap
  let cy = y + pad

  ctx.font = `800 ${labelFont}px Inter, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.72)'
  ctx.textAlign = 'left'
  ctx.fillText('GPS MAP CAMERA', left, cy + labelFont)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,.46)'
  ctx.fillText('LOCATION VERIFIED', right, cy + labelFont)
  cy += headerH

  ctx.textAlign = 'left'
  ctx.font = `800 ${titleFont}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  for (const line of titleLines) {
    ctx.fillText(line, left, cy + titleFont * .82)
    cy += titleFont * .90
  }

  ctx.font = `650 ${bodyFont}px Inter, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.86)'
  for (const line of regionLines) {
    ctx.fillText(line, left, cy + bodyFont * .82)
    cy += bodyFont * .88
  }

  if (addressLines.length) {
    ctx.font = `500 ${Math.max(12, Math.round(bodyFont * .84))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.58)'
    for (const line of addressLines) {
      ctx.fillText(line, left, cy + bodyFont * .72)
      cy += bodyFont * .78
    }
  }

  const ruleY = y + panelH - metaH - pad * .55
  ctx.strokeStyle = 'rgba(255,255,255,.16)'
  ctx.lineWidth = Math.max(1, scale)
  ctx.beginPath()
  ctx.moveTo(left, ruleY)
  ctx.lineTo(right, ruleY)
  ctx.stroke()

  const colWidth = (right - left - gap) / 2
  metadata.forEach(([label, value], index) => {
    const row = Math.floor(index / columns)
    const col = index % columns
    const x = left + col * (colWidth + gap)
    const rowY = ruleY + row * metaRowH

    ctx.textAlign = 'left'
    ctx.font = `800 ${labelFont}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.42)'
    ctx.fillText(label, x, rowY + labelFont)

    ctx.font = `650 ${valueFont}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#fff'
    const valueLines = wrap(ctx, value, colWidth, 1)
    ctx.fillText(valueLines[0] || '—', x, rowY + labelFont + valueFont + 1)
  })

  const map = await drawMap(location, mapSize)
  ctx.save()
  ctx.beginPath()
  const radius = Math.max(10, Math.round(mapSize * .09))
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

  ctx.strokeStyle = 'rgba(255,255,255,.45)'
  ctx.lineWidth = Math.max(1, scale)
  ctx.strokeRect(mapX + .5, mapY + .5, mapSize - 1, mapSize - 1)

  ctx.font = `500 ${Math.max(8, labelFont * .75)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.42)'
  ctx.textAlign = 'right'
  ctx.fillText('© OpenStreetMap', width - pad, y + panelH - 5)
  ctx.restore()

  return await new Promise(resolve => canvas.toBlob(b => resolve(b ?? imageBlob), 'image/jpeg', .95))
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
