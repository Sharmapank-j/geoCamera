import type { LocationData } from '../types'

const toLocation = (position: GeolocationPosition): LocationData => {
  const c = position.coords
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy,
    altitude: c.altitude,
    altitudeAccuracy: c.altitudeAccuracy,
    heading: c.heading,
    speed: c.speed,
    timestamp: new Date(position.timestamp).toISOString(),
  }
}

const request = (timeout: number, highAccuracy: boolean) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('LOCATION UNAVAILABLE'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      maximumAge: 0,
      timeout,
    })
  })

const toError = (error: unknown) => {
  const code = (error as GeolocationPositionError).code
  if (code === 1) return new Error('LOCATION DENIED')
  if (code === 2) return new Error('LOCATION UNAVAILABLE')
  if (code === 3) return new Error('GPS TIMEOUT')
  return new Error('LOCATION UNAVAILABLE')
}

export const getCurrentLocation = async (
  timeout = 12000,
  options: { highAccuracy?: boolean; minimumAccuracy?: number } = {},
): Promise<LocationData> => {
  const highAccuracy = options.highAccuracy ?? true
  const minimumAccuracy = options.minimumAccuracy ?? 50
  try {
    const first = toLocation(await request(Math.min(timeout, 7000), highAccuracy))
    if (first.accuracy == null || first.accuracy <= minimumAccuracy) return first
    try {
      const second = toLocation(await request(timeout, highAccuracy))
      return (second.accuracy ?? Infinity) < (first.accuracy ?? Infinity) ? second : first
    } catch {
      return first
    }
  } catch (error) {
    throw toError(error)
  }
}
