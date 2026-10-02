import type { LocationData } from '../types'

type RawAddress = Record<string, string | undefined>

interface NominatimResult {
  name?: string
  display_name?: string
  address?: RawAddress
  lat?: string
  lon?: string
}

interface GoogleComponent {
  long_name: string
  types: string[]
}

interface GoogleResult {
  formatted_address?: string
  name?: string
  address_components?: GoogleComponent[]
}

interface GoogleResponse {
  status?: string
  results?: GoogleResult[]
}

const unique = (values: Array<string | undefined>) => [...new Map(
  values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)).map((v) => [v.toLowerCase(), v]),
).values()]

const different = (values: Array<string | undefined>, exclude: Array<string | undefined>) => {
  const excluded = new Set(unique(exclude).map((v) => v.toLowerCase()))
  return unique(values).find((v) => !excluded.has(v.toLowerCase()))
}

const withResolved = (location: LocationData, resolved: Partial<LocationData>): LocationData => ({
  ...location,
  ...resolved,
  resolvedAt: new Date().toISOString(),
})

const composeAddress = (parts: Array<string | undefined>) => unique(parts).join(', ')

const normalizeNominatim = (location: LocationData, result: NominatimResult) => {
  const a = result.address ?? {}
  const city = a.city ?? a.town ?? a.village ?? a.municipality
  const district = a.county ?? a.city_district ?? a.state_district
  const area = different(
    [a.neighbourhood, a.suburb, a.quarter, a.residential, a.hamlet, a.locality, a.sublocality],
    [city, district, a.state, a.country],
  )
  const placeName = result.name ?? a.amenity ?? a.attraction ?? a.tourism ?? a.shop ?? a.building ?? a.office ?? a.house

  return withResolved(location, {
    placeName,
    area,
    neighbourhood: a.neighbourhood ?? a.suburb,
    sublocality: a.sublocality,
    streetNumber: a.house_number,
    street: a.road,
    address: result.display_name ?? composeAddress([a.house_number && a.road ? `${a.house_number} ${a.road}` : undefined, a.road, area, city, district, a.state, a.postcode, a.country]),
    locality: a.locality,
    city,
    town: a.town,
    village: a.village,
    municipality: a.municipality,
    district,
    state: a.state,
    postalCode: a.postcode,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
    region: a.region,
    plusCode: (result as NominatimResult & { extratags?: { 'addr:postcode'?: string } }).extratags?.['addr:postcode'],
    provider: 'OpenStreetMap Nominatim',
  })
}

const normalizeGoogle = (location: LocationData, result: GoogleResult) => {
  const components = result.address_components ?? []
  const pick = (...types: string[]) => components.find((c) => types.some((t) => c.types.includes(t)))?.long_name
  const neighborhood = pick('neighborhood')
  const sublocality = pick('sublocality_level_3', 'sublocality_level_2', 'sublocality_level_1', 'sublocality')
  const city = pick('locality', 'postal_town')
  const district = pick('administrative_area_level_2')
  const state = pick('administrative_area_level_1')
  const countryComponent = components.find((c) => c.types.includes('country'))
  const placeName = result.name ?? pick('establishment', 'premise', 'point_of_interest')
  const area = different(
    [pick('establishment'), pick('premise'), neighborhood, sublocality, pick('route'), pick('sublocality')],
    [city, district, state, countryComponent?.long_name],
  )

  return withResolved(location, {
    placeName,
    area,
    neighbourhood: neighborhood,
    sublocality,
    streetNumber: pick('street_number'),
    street: pick('route'),
    address: result.formatted_address,
    locality: pick('sublocality', 'locality'),
    city,
    district,
    state,
    postalCode: pick('postal_code'),
    country: countryComponent?.long_name,
    countryCode: countryComponent?.short_name,
    provider: 'Google Geocoding',
  })
}

export const reverseGeocode = async (location: LocationData): Promise<LocationData> => {
  if (!navigator.onLine) return location

  const googleKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim()
  if (googleKey) {
    try {
      const params = new URLSearchParams({
        latlng: `${location.latitude},${location.longitude}`,
        key: googleKey,
        language: navigator.language || 'en',
      })
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`)
      const data = (await response.json()) as GoogleResponse
      if (data.status === 'OK' && data.results?.[0]) return normalizeGoogle(location, data.results[0])
    } catch {
      // fallback below
    }
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${location.latitude}&lon=${location.longitude}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return location
    return normalizeNominatim(location, (await response.json()) as NominatimResult)
  } catch {
    return location
  }
}
