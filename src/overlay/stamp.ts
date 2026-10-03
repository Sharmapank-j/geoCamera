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
  const zoom = 15
  const tile = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#d8e1e8'
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
      jobs.push(loadImage(`https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`)
        .then(img => {
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
  ctx.fillStyle = '#d92323'
  ctx.beginPath()
  ctx.arc(pinX, pinY, Math.max(5, size * .045), 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(pinX, pinY, Math.max(2, size * .018), 0, Math.PI * 2)
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
  const areaLine = unique([location.area, location.locality, location.city]).filter(x => x.toLowerCase() !== title.toLowerCase()).join(', ')
  const address = location.address?.trim() ||
    unique([location.streetNumber && location.street ? `${location.streetNumber} ${location.street}` : undefined, location.street]).join(', ')
  const admin = unique([location.district, location.state, location.country]).join(', ')
  return { title, areaLine, address: address || admin }
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

const cardinal = (heading: number) => ['N','NE','E','SE','S','SW','W','NW'][Math.round((((heading % 360) + 360) % 360) / 45) % 8]

export const renderStampedPhoto = async ({
  imageBlob, location, notes, overlay, appSettings, captureTimestamp,
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
  const base = Math.max(12, width * .014 * (overlay.fontSize / 18))
  const pad = Math.max(12, base * .72)
  const panelX = 0
  const panelWidth = width
  const mapSize = overlay.showMap ? Math.round(Math.min(portrait ? width * .22 : width * .18, 150)) : 0
  const mapGap = mapSize ? pad * .9 : 0
  const textWidth = width - pad * 2 - mapSize - mapGap
  const lt = locationText(location)
  const stampTime = captureTimestamp ?? location.timestamp

  const meta: string[] = []
  if (overlay.showLatitude) meta.push(`LAT ${location.latitude.toFixed(overlay.coordinatePrecision)}`)
  if (overlay.showLongitude) meta.push(`LON ${location.longitude.toFixed(overlay.coordinatePrecision)}`)
  if (overlay.showAccuracy && location.accuracy != null) meta.push(`ACC ±${Math.round(location.accuracy)} m`)
  if (overlay.showDate) meta.push(displayDatePretty(stampTime))
  if (overlay.showTime) meta.push(formatTime(stampTime, appSettings.use24Hour))
  if (overlay.showPostalCode && location.postalCode) meta.push(`PIN ${location.postalCode}`)
  if (overlay.showAltitude && location.altitude != null) meta.push(`ALT ${Math.round(location.altitude)} m`)
  if (overlay.showHeading && location.heading != null) meta.push(`HDG ${Math.round(location.heading)}° ${cardinal(location.heading)}`)
  if (overlay.showSpeed && location.speed != null) meta.push(`SPD ${(location.speed * 3.6).toFixed(1)} km/h`)
  if (overlay.showNotes && notes?.trim()) meta.push(notes.trim())

  ctx.font = `700 ${Math.round(base * 1.45)}px Inter, system-ui, sans-serif`
  const titleLines = overlay.showLocationName ? wrap(ctx, lt.title, textWidth, 2) : []
  ctx.font = `600 ${Math.round(base * .84)}px Inter, system-ui, sans-serif`
  const subLines = overlay.showAddress ? [lt.areaLine, lt.address].filter(Boolean).flatMap(x => wrap(ctx, x, textWidth, 2)) : []

  const headerH = Math.max(28, base * 1.8)
  const titleH = Math.max(base * 2.0, titleLines.length * base * 1.45 + base * .45)
  const subH = subLines.length ? subLines.length * base * .9 + base * .45 : 0
  const metaH = meta.length ? base * 1.25 + Math.ceil(meta.length / (portrait ? 1 : 2)) * base * 1.0 : 0
  const panelH = Math.min(height * (portrait ? .285 : .255), Math.max(125, headerH + titleH + subH + metaH + pad * 1.35))
  const y = height - panelH

  ctx.save()
  ctx.globalAlpha = Math.min(1, Math.max(.72, overlay.opacity))
  ctx.fillStyle = 'rgba(5,10,17,.94)'
  ctx.fillRect(panelX, y, panelWidth, panelH)
  ctx.fillStyle = '#e0a93a'
  ctx.fillRect(0, y, width, Math.max(2, base * .10))
  ctx.globalAlpha = 1

  const left = pad
  const top = y + pad
  const mapX = width - pad - mapSize
  const mapY = y + pad
  const contentRight = mapSize ? mapX - mapGap : width - pad

  ctx.font = `700 ${Math.round(base * .64)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.68)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (overlay.showTitle) ctx.fillText('GPS MAP CAMERA', left, top + base * .62)
  ctx.font = `700 ${Math.round(base * .64)}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,.5)'
  ctx.fillText('LOCATION VERIFIED', contentRight, top + base * .62)

  let cy = top + headerH + base * .18
  ctx.textAlign = 'left'
  ctx.font = `700 ${Math.round(base * 1.45)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  for (const line of titleLines) { ctx.fillText(line, left, cy + base * 1.1); cy += base * 1.42 }

  ctx.font = `600 ${Math.round(base * .82)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.78)'
  for (const line of subLines) { if (cy > y + panelH - metaH - pad * 1.1) break; ctx.fillText(line, left, cy + base * .75); cy += base * .88 }

  if (meta.length) {
    const ruleY = y + panelH - metaH
    ctx.strokeStyle = 'rgba(255,255,255,.16)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(left, ruleY); ctx.lineTo(contentRight, ruleY); ctx.stroke()
    ctx.font = `600 ${Math.round(base * .68)}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.82)'
    const cols = portrait ? 1 : 2
    const colW = (contentRight - left) / cols
    const rows = Math.ceil(meta.length / cols)
    const shown = meta.slice(0, rows * cols)
    shown.forEach((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const tx = left + col * colW
      const ty = ruleY + base * .72 + row * base * .92
      const line = wrap(ctx, item, colW - base * .5, 1)[0] || item
      ctx.fillText(line, tx, ty)
    })
  }

  if (mapSize) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(mapX, mapY, mapSize, Math.min(mapSize, panelH - pad * 2))
    ctx.clip()
    const map = await drawMap(location, mapSize)
    if (map) ctx.drawImage(map, mapX, mapY, mapSize, mapSize)
    else fallbackMap(ctx, mapX, mapY, mapSize, location)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,.38)'
    ctx.lineWidth = 1
    ctx.strokeRect(mapX + .5, mapY + .5, mapSize - 1, mapSize - 1)
    ctx.font = `500 ${Math.max(7, base * .43)}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.45)'
    ctx.textAlign = 'right'
    ctx.fillText('© OpenStreetMap', width - pad, y + panelH - 4)
  }

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
