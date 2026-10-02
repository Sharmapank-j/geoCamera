import type { LocationData } from '../types'

interface ReverseResult {
  display_name?: string
  name?: string
  address?: {
    city?: string
    county?: string
    state?: string
    country?: string
    suburb?: string
    village?: string
    town?: string
    road?: string
  }
}

export const reverseGeocode = async (
  location: LocationData,
): Promise<LocationData> => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.latitude}&lon=${location.longitude}`

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) return location
    const data = (await res.json()) as ReverseResult
    const address = data.address

    return {
      ...location,
      address: data.display_name,
      placeName: data.name ?? address?.road,
      locality: address?.suburb ?? address?.village ?? address?.town,
      city: address?.city ?? address?.town,
      district: address?.county,
      state: address?.state,
      country: address?.country,
    }
  } catch {
    return location
  }
}
