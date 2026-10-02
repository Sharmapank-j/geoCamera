import type { LocationData } from '../types'

export const getCurrentLocation = (
  timeout = 12000,
): Promise<LocationData> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('LOCATION UNAVAILABLE'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const c = position.coords
        resolve({
          latitude: c.latitude,
          longitude: c.longitude,
          accuracy: c.accuracy,
          altitude: c.altitude,
          altitudeAccuracy: c.altitudeAccuracy,
          heading: c.heading,
          speed: c.speed,
          timestamp: new Date(position.timestamp).toISOString(),
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('LOCATION DENIED'))
          return
        }
        if (err.code === err.TIMEOUT) {
          reject(new Error('GPS TIMEOUT'))
          return
        }
        reject(new Error('LOCATION UNAVAILABLE'))
      },
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 0,
      },
    )
  })
