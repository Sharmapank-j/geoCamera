import type { LocationData } from '../types'

const toLocation = (position: GeolocationPosition): LocationData | undefined => {
  const { coords } = position
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return undefined
  if (coords.latitude < -90 || coords.latitude > 90 || coords.longitude < -180 || coords.longitude > 180) return undefined

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Number.isFinite(coords.accuracy) && coords.accuracy >= 0 ? coords.accuracy : undefined,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    heading: coords.heading,
    speed: coords.speed,
    timestamp: new Date(position.timestamp).toISOString(),
  }
}

const toError = (error: unknown) => {
  const code = (error as GeolocationPositionError).code
  if (code === 1) return new Error('LOCATION DENIED')
  if (code === 2) return new Error('LOCATION UNAVAILABLE')
  if (code === 3) return new Error('GPS TIMEOUT')
  return new Error('LOCATION UNAVAILABLE')
}

interface LocationOptions {
  highAccuracy?: boolean
  minimumAccuracy?: number
}

const collectFixes = (timeout: number, highAccuracy: boolean, minimumAccuracy: number) =>
  new Promise<LocationData>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('LOCATION UNAVAILABLE'))
      return
    }

    const fixes: LocationData[] = []
    let settled = false
    let watchId: number | undefined
    const startedAt = Date.now()
    const minimumSamples = 3

    const finish = (result?: LocationData, error?: Error) => {
      if (settled) return
      settled = true
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      window.clearTimeout(timer)
      if (result) resolve(result)
      else reject(error ?? new Error('LOCATION UNAVAILABLE'))
    }

    const chooseBest = () => fixes.reduce((best, fix) => {
      const bestAccuracy = best.accuracy ?? Infinity
      const accuracy = fix.accuracy ?? Infinity
      return accuracy < bestAccuracy ? fix : best
    }, fixes[0])

    const handlePosition = (position: GeolocationPosition) => {
      const fix = toLocation(position)
      if (!fix) return
      fixes.push(fix)

      const best = chooseBest()
      const accuracy = best.accuracy
      const elapsed = Date.now() - startedAt
      if ((fixes.length >= minimumSamples && accuracy != null && accuracy <= minimumAccuracy) || elapsed >= timeout) {
        finish(best)
      }
    }

    const handleError = (error: GeolocationPositionError) => {
      if (error.code === 1) finish(undefined, toError(error))
      else if (Date.now() - startedAt >= timeout) finish(undefined, toError(error))
    }

    const timer = window.setTimeout(() => {
      if (fixes.length) finish(chooseBest())
      else finish(undefined, new Error('GPS TIMEOUT'))
    }, timeout)

    try {
      // Always request fresh, high-accuracy data for a tag. The browser may
      // still fall back to Wi-Fi/cell positioning, so the measured accuracy
      // is retained and shown instead of being presented as precise GPS.
      watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: highAccuracy,
        maximumAge: 0,
        timeout,
      })
    } catch (error) {
      finish(undefined, toError(error))
    }
  })

export const getCurrentLocation = async (
  timeout = 12000,
  options: LocationOptions = {},
): Promise<LocationData> => {
  const safeTimeout = Math.max(15000, timeout)
  const highAccuracy = options.highAccuracy ?? true
  const minimumAccuracy = Math.max(5, options.minimumAccuracy ?? 50)
  try {
    return await collectFixes(safeTimeout, highAccuracy, minimumAccuracy)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('LOCATION ')) throw error
    throw toError(error)
  }
}
