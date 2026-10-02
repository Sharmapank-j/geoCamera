import type { AppSettings, LocationData, OverlaySettings } from '../types'
import { formatDate, formatTime } from '../utils/date'

interface StampInput {
  imageBlob: Blob
  location?: LocationData
  notes?: string
  overlay: OverlaySettings
  appSettings: AppSettings
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

const getDimensions = (img: DrawableImage) => {
  if ('naturalWidth' in img) {
    return { width: img.naturalWidth, height: img.naturalHeight }
  }

  return { width: img.width, height: img.height }
}

const drawMapFallback = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  location?: LocationData,
) => {
  ctx.save()
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size)
  gradient.addColorStop(0, '#eef2ff')
  gradient.addColorStop(1, '#dbeafe')
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, size, size)

  ctx.strokeStyle = 'rgba(30,41,59,0.15)'
  for (let i = 1; i < 8; i += 1) {
    const g = x + (size / 8) * i
    const gy = y + (size / 8) * i
    ctx.beginPath()
    ctx.moveTo(g, y)
    ctx.lineTo(g, y + size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, gy)
    ctx.lineTo(x + size, gy)
    ctx.stroke()
  }

  const pinX = x + size * 0.6
  const pinY = y + size * 0.44
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(pinX, pinY, size * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(pinX, pinY, size * 0.05, 0, Math.PI * 2)
  ctx.fill()

  if (location) {
    ctx.fillStyle = '#0f172a'
    ctx.font = `${Math.max(12, size * 0.08)}px Inter, system-ui, sans-serif`
    ctx.textBaseline = 'bottom'
    ctx.fillText(
      `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
      x + 8,
      y + size - 8,
    )
  }

  ctx.restore()
}

export const renderStampedPhoto = async ({
  imageBlob,
  location,
  notes,
  overlay,
  appSettings,
}: StampInput): Promise<Blob> => {
  const source = await blobToImageBitmap(imageBlob)
  const { width, height } = getDimensions(source)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageBlob

  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

  if (location) {
    const panelHeight = Math.max(height * 0.22, 220)
    const panelWidth = Math.min(width * overlay.panelWidth, width - 24)
    const panelX = (width - panelWidth) / 2
    const panelY = height - panelHeight - 12

    ctx.save()
    ctx.globalAlpha = overlay.opacity
    ctx.fillStyle = '#111827'
    ctx.beginPath()
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, overlay.cornerRadius)
    ctx.fill()

    const titleHeight = Math.max(42, panelHeight * 0.16)
    ctx.fillStyle = 'rgba(31,41,55,0.95)'
    ctx.beginPath()
    ctx.roundRect(panelX, panelY, panelWidth, titleHeight, [overlay.cornerRadius, overlay.cornerRadius, 0, 0])
    ctx.fill()

    ctx.globalAlpha = 1
    const base = Math.max(18, width * 0.024 * (overlay.fontSize / 18))
    const pad = Math.max(18, base)
    const leftX = panelX + pad
    const mapSize = Math.min(panelHeight - titleHeight - pad, panelWidth * overlay.mapSize)
    const mapX = panelX + panelWidth - mapSize - pad
    const mapY = panelY + titleHeight + pad * 0.6

    ctx.textAlign = overlay.textAlign
    ctx.fillStyle = '#ffffff'

    let cursorY = panelY + titleHeight * 0.68
    if (overlay.showTitle) {
      ctx.font = `${Math.round(base * 0.95)}px Inter, system-ui, sans-serif`
      ctx.fillText('GPS MAP CAMERA', leftX, cursorY)
    }

    cursorY = panelY + titleHeight + base * 1.2
    ctx.font = `700 ${Math.round(base * 1.45)}px Inter, system-ui, sans-serif`
    if (overlay.showLocationName) {
      ctx.fillText(location.placeName ?? 'LOCATION', leftX, cursorY)
      cursorY += base * 1.35 * overlay.spacing
    }

    ctx.font = `600 ${Math.round(base * 1.05)}px Inter, system-ui, sans-serif`
    if (overlay.showAddress && location.address) {
      const addressText = location.address.slice(0, 52)
      ctx.fillText(addressText, leftX, cursorY)
      cursorY += base * 1.2 * overlay.spacing
    }

    const details: string[] = []
    if (overlay.showLatitude) details.push(`Latitude: ${location.latitude.toFixed(overlay.coordinatePrecision)}`)
    if (overlay.showLongitude) details.push(`Longitude: ${location.longitude.toFixed(overlay.coordinatePrecision)}`)
    if (overlay.showDate) details.push(`Date: ${formatDate(location.timestamp, appSettings)}`)
    if (overlay.showTime) details.push(`Time: ${formatTime(location.timestamp, appSettings.use24Hour)}`)
    if (overlay.showAccuracy && location.accuracy) details.push(`Accuracy: ±${Math.round(location.accuracy)} m`)
    if (overlay.showAltitude && location.altitude) details.push(`Altitude: ${location.altitude.toFixed(1)} m`)
    if (overlay.showHeading && location.heading) details.push(`Heading: ${Math.round(location.heading)}°`)
    if (overlay.showSpeed && location.speed) details.push(`Speed: ${(location.speed * 3.6).toFixed(1)} km/h`)
    if (overlay.showNotes && notes) details.push(`Notes: ${notes}`)

    ctx.font = `600 ${Math.round(base * 1.1)}px Inter, system-ui, sans-serif`
    for (const line of details.slice(0, 6)) {
      if (cursorY > panelY + panelHeight - base) break
      ctx.fillText(line, leftX, cursorY)
      cursorY += base * 1.25 * overlay.spacing
    }

    if (overlay.showMap) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(mapX, mapY, mapSize, mapSize, Math.max(16, overlay.cornerRadius * 0.8))
      ctx.clip()
      drawMapFallback(ctx, mapX, mapY, mapSize, location)
      ctx.restore()
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(mapX, mapY, mapSize, mapSize, Math.max(16, overlay.cornerRadius * 0.8))
      ctx.stroke()
    }

    ctx.restore()
  }

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? imageBlob), 'image/jpeg', 0.94)
  })
}

export const createThumbnail = async (blob: Blob): Promise<Blob> => {
  const img = await blobToImageBitmap(blob)
  const { width, height } = getDimensions(img)
  const ratio = Math.min(320 / width, 320 / height, 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height)

  return await new Promise((resolve) => {
    canvas.toBlob((thumb) => resolve(thumb ?? blob), 'image/jpeg', 0.9)
  })
}
