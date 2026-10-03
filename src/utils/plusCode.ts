import { OpenLocationCode } from 'open-location-code'

const encoder = new OpenLocationCode()

export const encodePlusCode = (latitude: number, longitude: number, hasLocalityContext = false) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
  try {
    const fullCode = encoder.encode(latitude, longitude, 10)
    if (!hasLocalityContext) return fullCode
    return encoder.shorten(fullCode, latitude, longitude)
  } catch {
    return undefined
  }
}
