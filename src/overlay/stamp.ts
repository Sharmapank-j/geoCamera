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

const getDimensions = (img: DrawableImage) => {
  if ('naturalWidth' in img) {
    return { width: img.naturalWidth, height: img.naturalHeight }
  }

  return { width: img.width, height: img.height }
}

const loadImage = async (url: string): Promise<HTMLImageElement> =>
  await new Promise((resolve, reject) => {
    const img = new Image()
    const timer = window.setTimeout(() => reject(new Error('timeout')), 2200)
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.decoding = 'async'
    img.onload = () => {
      window.clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('failed'))
    }
    img.src = url
  }) as HTMLImageElement

const toTilePoint = (latitude: number, longitude: number, zoom: number) => {
  const latRad = (latitude * Math.PI) / 180
  const n = 2 ** zoom
  const x = ((longitude + 180) / 360) * n
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n

  return { x, y, n }
}

const drawMapTiles = async (
  location: LocationData,
  size: number,
): Promise<HTMLCanvasElement | null> => {
  const zoom = 15
  const tileSize = 256
  const mapCanvas = document.createElement('canvas')
  mapCanvas.width = size
  mapCanvas.height = size
  const mapCtx = mapCanvas.getContext('2d')
  if (!mapCtx) return null

  mapCtx.fillStyle = '#dbeafe'
  mapCtx.fillRect(0, 0, size, size)

  const { x, y, n } = toTilePoint(location.latitude, location.longitude, zoom)
  const worldX = x * tileSize
  const worldY = y * tileSize
  const topLeftX = worldX - size / 2
  const topLeftY = worldY - size / 2

  const minTileX = Math.floor(topLeftX / tileSize)
  const minTileY = Math.floor(topLeftY / tileSize)
  const maxTileX = Math.floor((topLeftX + size) / tileSize)
  const maxTileY = Math.floor((topLeftY + size) / tileSize)

  const draws: Array<Promise<void>> = []
  let loadedTiles = 0

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= n) continue
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = ((tileX % n) + n) % n
      const url = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`
      const drawTask = loadImage(url)
        .then((img) => {
          const dx = tileX * tileSize - topLeftX
          const dy = tileY * tileSize - topLeftY
          mapCtx.drawImage(img, dx, dy, tileSize, tileSize)
          loadedTiles += 1
        })
        .catch(() => {})
      draws.push(drawTask)
    }
  }

  await Promise.all(draws)
  if (loadedTiles === 0) return null

  try {
    mapCtx.getImageData(0, 0, 1, 1)
  } catch {
    return null
  }

  return mapCanvas
}

const drawMarker = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) => {
  const pinX = x + size * 0.5
  const pinY = y + size * 0.52
  const radius = Math.max(6, size * 0.07)

  ctx.fillStyle = 'rgba(220,38,38,0.24)'
  ctx.beginPath()
  ctx.arc(pinX, pinY + radius * 1.2, radius * 1.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.moveTo(pinX, pinY + radius * 1.4)
  ctx.arc(pinX, pinY, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(pinX, pinY, Math.max(2, radius * 0.38), 0, Math.PI * 2)
  ctx.fill()
}

const drawMapFallback = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  location: LocationData,
) => {
  ctx.save()
  const fallback = ctx.createLinearGradient(x, y, x + size, y + size)
  fallback.addColorStop(0, '#12233f')
  fallback.addColorStop(1, '#1d3557')
  ctx.fillStyle = fallback
  ctx.fillRect(x, y, size, size)

  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(x + size * 0.18, y + size * 0.16, size * 0.64, 1)
  ctx.fillRect(x + size * 0.18, y + size * 0.82, size * 0.64, 1)

  ctx.font = `700 ${Math.max(18, size * 0.18)}px Inter, system-ui, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('📍', x + size / 2, y + size * 0.42)

  ctx.font = `600 ${Math.max(10, size * 0.08)}px Inter, system-ui, sans-serif`
  ctx.fillText(
    `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
    x + size / 2,
    y + size * 0.74,
  )

  ctx.restore()
}

const unique = (parts: Array<string | undefined>) => {
  const out: string[] = []
  for (const part of parts) {
    const next = part?.trim()
    if (!next) continue
    const exists = out.some((item) => item.toLowerCase() === next.toLowerCase())
    if (!exists) out.push(next)
  }
  return out
}

const pickLocationText = (location: LocationData) => {
  const fallbackParts = unique([
    location.area,
    location.locality,
    location.city,
    location.district,
    location.state,
    location.country,
  ])

  const title =
    location.placeName?.trim() ||
    location.locality?.trim() ||
    location.city?.trim() ||
    location.district?.trim() ||
    location.state?.trim() ||
    location.country?.trim() ||
    ''

  const remaining = fallbackParts.filter(
    (part) => part.toLowerCase() !== title.toLowerCase(),
  )

  if (remaining.length < 2 && location.address) {
    const fromAddress = location.address
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    for (const part of fromAddress) {
      if (!remaining.some((item) => item.toLowerCase() === part.toLowerCase())) {
        remaining.push(part)
      }
      if (remaining.length >= 4) break
    }
  }

  return {
    title,
    lineOne: remaining.slice(0, 2).join(', '),
    lineTwo: remaining.slice(2, 4).join(', '),
  }
}

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) => {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = words[0]

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
      continue
    }
    lines.push(current)
    current = words[i]
    if (lines.length === maxLines - 1) break
  }

  if (lines.length < maxLines) lines.push(current)
  if (lines.length > maxLines) lines.length = maxLines
  return lines
}

const toCardinal = (heading: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const normalized = ((heading % 360) + 360) % 360
  const index = Math.round(normalized / 45) % dirs.length
  return dirs[index]
}

export const renderStampedPhoto = async ({
  imageBlob,
  location,
  notes,
  overlay,
  appSettings,
  captureTimestamp,
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
    const isPortrait = height >= width
    const panelWidth = Math.min(width * overlay.panelWidth, width - 24)
    const panelX = (width - panelWidth) / 2
    const panelY = height - 12

    const base = Math.max(12, width * 0.016 * (overlay.fontSize / 18))
    const pad = Math.max(10, base * 0.62)
    const titleHeight = Math.max(base * 1.9, 28)
    const mapSizeLimit = isPortrait ? panelWidth * 0.26 : panelWidth * 0.2
    const mapSize = overlay.showMap ? Math.max(86, Math.min(152, mapSizeLimit)) : 0
    const leftColumnWidth = Math.max(140, panelWidth - pad * 3 - mapSize)

    const locationText = pickLocationText(location)
    const captureIso = captureTimestamp ?? location.timestamp

    const details: string[] = []
    if (overlay.showArea && location.area) {
      details.push(`Area: ${location.area}`)
    }
    if (overlay.showLocality && location.locality) {
      details.push(`Locality: ${location.locality}`)
    }
    if (overlay.showCity && location.city) {
      details.push(`City: ${location.city}`)
    }
    if (overlay.showDistrict && location.district) {
      details.push(`District: ${location.district}`)
    }
    if (overlay.showState && location.state) {
      details.push(`State: ${location.state}`)
    }
    if (overlay.showPostalCode && location.postalCode) {
      details.push(`PIN: ${location.postalCode}`)
    }
    if (overlay.showCountry && location.country) {
      details.push(`Country: ${location.country}`)
    }
    if (overlay.showPlusCode && location.plusCode) {
      details.push(`Plus Code: ${location.plusCode}`)
    }
    if (overlay.showLatitude) {
      details.push(`Latitude: ${location.latitude.toFixed(overlay.coordinatePrecision)}`)
    }
    if (overlay.showLongitude) {
      details.push(`Longitude: ${location.longitude.toFixed(overlay.coordinatePrecision)}`)
    }
    if (overlay.showDate) details.push(`Date: ${displayDatePretty(captureIso)}`)
    if (overlay.showTime) {
      details.push(`Time: ${formatTime(captureIso, appSettings.use24Hour)}`)
    }
    if (overlay.showAccuracy && location.accuracy != null) {
      details.push(`Accuracy: ±${Math.round(location.accuracy)} m`)
    }
    if (overlay.showAltitude && location.altitude != null) {
      details.push(`Altitude: ${Math.round(location.altitude)} m`)
    }
    if (overlay.showHeading && location.heading != null) {
      const rounded = Math.round(location.heading)
      details.push(`Heading: ${rounded}° ${toCardinal(rounded)}`)
    }
    if (overlay.showSpeed && location.speed != null) {
      const kmh = location.speed * 3.6
      details.push(`Speed: ${kmh.toFixed(1)} km/h`)
    }
    if (overlay.showNotes && notes?.trim()) details.push(`Notes: ${notes.trim()}`)

    const headingLines: Array<{ text: string; size: number; weight: number; dim?: boolean }> = []

    if (overlay.showLocationName && locationText.title) {
      headingLines.push({ text: locationText.title, size: base * 1.2, weight: 700 })
    }

    if (overlay.showAddress && locationText.lineOne) {
      headingLines.push({ text: locationText.lineOne, size: base * 0.88, weight: 600, dim: true })
    }

    if (overlay.showAddress && locationText.lineTwo) {
      headingLines.push({ text: locationText.lineTwo, size: base * 0.88, weight: 600, dim: true })
    }

    if (!headingLines.length) {
      headingLines.push({ text: 'GPS Coordinates', size: base * 1.02, weight: 700 })
    }

    const lineGap = Math.max(5, base * 0.22)
    const sectionGap = Math.max(6, base * 0.38)

    const measured: Array<{ text: string; size: number; weight: number; dim?: boolean }> = []
    for (const line of headingLines) {
      ctx.font = `${line.weight} ${Math.round(line.size)}px Inter, system-ui, sans-serif`
      const wrapped = wrapText(ctx, line.text, leftColumnWidth, line.size > base ? 2 : 1)
      for (const textLine of wrapped) {
        measured.push({ ...line, text: textLine })
      }
    }

    const detailsToDraw = details.slice(0, isPortrait ? 8 : 6)

    const headingHeight = measured.reduce((sum, line) => sum + line.size + lineGap, 0)
    const detailLineHeight = base * 0.88 + lineGap
    const detailsHeight = detailsToDraw.length * detailLineHeight
    const textHeight = headingHeight + sectionGap + detailsHeight
    const bodyHeight = Math.max(textHeight, mapSize)

    const maxPanelHeight = Math.max(160, Math.min(height * (isPortrait ? 0.33 : 0.4), height - 20))
    let panelHeight = titleHeight + bodyHeight + pad * 1.3

    while (panelHeight > maxPanelHeight && detailsToDraw.length > 3) {
      detailsToDraw.pop()
      panelHeight -= detailLineHeight
    }

    panelHeight = Math.min(panelHeight, maxPanelHeight)
    const finalPanelY = panelY - panelHeight

    ctx.save()
    ctx.globalAlpha = overlay.opacity
    const panelGradient = ctx.createLinearGradient(panelX, finalPanelY, panelX, finalPanelY + panelHeight)
    panelGradient.addColorStop(0, '#0e1f39')
    panelGradient.addColorStop(1, '#101826')
    ctx.fillStyle = panelGradient
    ctx.beginPath()
    ctx.roundRect(panelX, finalPanelY, panelWidth, panelHeight, overlay.cornerRadius)
    ctx.fill()

    ctx.fillStyle = 'rgba(8,16,31,0.94)'
    ctx.beginPath()
    ctx.roundRect(
      panelX,
      finalPanelY,
      panelWidth,
      titleHeight,
      [overlay.cornerRadius, overlay.cornerRadius, 0, 0],
    )
    ctx.fill()

    ctx.globalAlpha = 1
    const textLeft = panelX + pad
    const contentTop = finalPanelY + titleHeight + pad * 0.66

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    if (overlay.showTitle) {
      ctx.font = `700 ${Math.round(base * 0.86)}px Inter, system-ui, sans-serif`
      ctx.fillStyle = '#f8fafc'
      ctx.fillText('GPS MAP CAMERA', textLeft, finalPanelY + titleHeight * 0.68)
    }

    let cursorY = contentTop
    for (const line of measured) {
      ctx.font = `${line.weight} ${Math.round(line.size)}px Inter, system-ui, sans-serif`
      ctx.fillStyle = line.dim ? 'rgba(241,245,249,0.94)' : '#ffffff'
      cursorY += line.size
      ctx.fillText(line.text, textLeft, cursorY)
      cursorY += lineGap
    }

    cursorY += sectionGap * 0.5
    if (detailsToDraw.length > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(textLeft, cursorY)
      ctx.lineTo(textLeft + leftColumnWidth, cursorY)
      ctx.stroke()
      cursorY += sectionGap
    }

    ctx.font = `600 ${Math.round(base * 0.88)}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#f8fafc'
    for (const line of detailsToDraw) {
      cursorY += base * 0.88
      ctx.fillText(line, textLeft, cursorY)
      cursorY += lineGap
    }

    if (overlay.showMap && mapSize > 0) {
      const mapX = panelX + panelWidth - mapSize - pad
      const mapY = finalPanelY + titleHeight + pad * 0.6
      const mapRadius = Math.max(12, overlay.cornerRadius * 0.55)

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius)
      ctx.clip()

      const mapCanvas = await drawMapTiles(location, Math.round(mapSize))
      if (mapCanvas) {
        ctx.drawImage(mapCanvas, mapX, mapY, mapSize, mapSize)
        drawMarker(ctx, mapX, mapY, mapSize)
      } else {
        drawMapFallback(ctx, mapX, mapY, mapSize, location)
      }

      ctx.restore()

      ctx.strokeStyle = 'rgba(255,255,255,0.34)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(mapX, mapY, mapSize, mapSize, mapRadius)
      ctx.stroke()
    }

    ctx.restore()
  }

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? imageBlob), 'image/jpeg', 0.95)
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
