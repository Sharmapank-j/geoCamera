import type { LocationData } from '../types'

interface ReverseResult {
  display_name?: string
  name?: string
  address?: {
    attraction?: string
    building?: string
    city?: string
    city_district?: string
    county?: string
    hamlet?: string
    neighbourhood?: string
    quarter?: string
    state?: string
    state_district?: string
    country?: string
    suburb?: string
    village?: string
    town?: string
    municipality?: string
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
      placeName:
        data.name ??
        address?.attraction ??
        address?.building ??
        address?.road,
      locality:
        address?.suburb ??
        address?.neighbourhood ??
        address?.quarter ??
        address?.hamlet ??
        address?.village,
      city: address?.city ?? address?.town ?? address?.municipality,
      district: address?.county ?? address?.city_district ?? address?.state_district,
      state: address?.state,
      country: address?.country,
    }
  } catch {
    return location
  }
}
