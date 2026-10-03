import type { LocationData } from '../types'
import { encodePlusCode } from '../utils/plusCode'

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
  short_name?: string
  types: string[]
}

interface GoogleResult {
  formatted_address?: string
  name?: string
  address_components?: GoogleComponent[]
}

interface NearbyPlace {
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
}

interface NearbyResponse { places?: NearbyPlace[] }

interface GoogleResponse {
  status?: string
  results?: GoogleResult[]
  plus_code?: { global_code?: string }
}

const unique = (values: Array<string | undefined>) => [...new Map(
  values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)).map((v) => [v.toLowerCase(), v]),
).values()]

const different = (values: Array<string | undefined>, exclude: Array<string | undefined>) => {
  const excluded = new Set(unique(exclude).map((v) => v.toLowerCase()))
  return unique(values).find((v) => !excluded.has(v.toLowerCase()))
}

const withResolved = (location: LocationData, resolved: Partial<LocationData>): LocationData => {
  const merged: LocationData = { ...location }
  for (const [key, value] of Object.entries(resolved) as Array<[keyof LocationData, LocationData[keyof LocationData]]>) {
    if (value !== undefined && value !== null && value !== '') merged[key] = value as never
  }
  return { ...merged, resolvedAt: new Date().toISOString() }
}

const composeAddress = (parts: Array<string | undefined>) => unique(parts).join(', ')


const distanceMeters = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180
  const dLat = (bLat - aLat) * r
  const dLon = (bLon - aLon) * r
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

const nearbyGooglePlace = async (location: LocationData, key: string): Promise<Partial<LocationData>> => {
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        maxResultCount: 8,
        rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: 250 } },
        languageCode: navigator.language || 'en',
      }),
    })
    if (!response.ok) return {}
    const data = (await response.json()) as NearbyResponse
    const candidate = data.places?.find(place => {
      const lat = place.location?.latitude
      const lon = place.location?.longitude
      return typeof lat === 'number' && typeof lon === 'number' && distanceMeters(location.latitude, location.longitude, lat, lon) <= 120 && Boolean(place.displayName?.text)
    })
    if (!candidate?.displayName?.text) return {}
    return { placeName: candidate.displayName.text }
  } catch {
    return {}
  }
}

const normalizeNominatim = (location: LocationData, result: NominatimResult) => {
  const a = result.address ?? {}
  const city = a.city ?? a.town ?? a.village ?? a.municipality
  const cityDistrict = a.city_district
  // Nominatim can return the actual locality/area as city_district.
  // Keep the administrative district separate when available, but promote
  // city_district into the visible Area/Locality field.
  const district = a.county ?? a.state_district
  const areaCandidates = unique([
    a.neighbourhood,
    a.suburb,
    a.quarter,
    a.residential,
    a.hamlet,
    a.locality,
    a.sublocality,
    cityDistrict,
  ])
  const area = different(areaCandidates, [city, district, a.state, a.country])
  const locality = different(areaCandidates, [area, city, district, a.state, a.country])
  const placeName = result.name ?? a.amenity ?? a.attraction ?? a.tourism ?? a.shop ?? a.building ?? a.office ?? a.house

  return withResolved(location, {
    placeName,
    area,
    neighbourhood: a.neighbourhood ?? a.suburb,
    sublocality: a.sublocality,
    streetNumber: a.house_number,
    street: a.road,
    address: result.display_name ?? composeAddress([a.house_number && a.road ? `${a.house_number} ${a.road}` : undefined, a.road, area, city, district, a.state, a.postcode, a.country]),
    locality,
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
    provider: 'OpenStreetMap Nominatim',
  })
}



const mergeDefined = (base: LocationData, ...parts: Array<Partial<LocationData>>): LocationData => {
  const merged: LocationData = { ...base }
  for (const part of parts) {
    for (const [key, value] of Object.entries(part) as Array<[keyof LocationData, LocationData[keyof LocationData]]>) {
      if (value !== undefined && value !== null && value !== '') merged[key] = value as never
    }
  }
  return merged
}

interface BigDataCloudResult {
  locality?: string
  city?: string
  principalSubdivision?: string
  countryName?: string
  countryCode?: string
  postcode?: string
  localityInfo?: {
    administrative?: Array<{ name?: string; description?: string; order?: number }>
  }
}

const normalizeBigDataCloud = (result: BigDataCloudResult): Partial<LocationData> => {
  const admin = (result.localityInfo?.administrative ?? []).map(item => item.name?.trim()).filter((value): value is string => Boolean(value))
  const city = result.city?.trim() || result.locality?.trim()
  const district = admin.find(value => /district|county/i.test(value))
  const candidates = unique([result.locality, ...admin])
  return {
    area: different(candidates, [city, district, result.principalSubdivision, result.countryName]),
    locality: different(candidates, [different(candidates, [city, district, result.principalSubdivision, result.countryName]), city, district, result.principalSubdivision, result.countryName]),
    city,
    district,
    state: result.principalSubdivision,
    postalCode: result.postcode,
    country: result.countryName,
    countryCode: result.countryCode,
    provider: 'BigDataCloud',
  }
}


const reverseNominatim = async (location: LocationData): Promise<LocationData | undefined> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${location.latitude}&lon=${location.longitude}`, {
      headers: { Accept: 'application/json', 'Accept-Language': navigator.language || 'en' },
    })
    if (!response.ok) return undefined
    return normalizeNominatim(location, (await response.json()) as NominatimResult)
  } catch {
    return undefined
  }
}

const reverseBigDataCloud = async (location: LocationData): Promise<Partial<LocationData>> => {
  try {
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${location.latitude}&longitude=${location.longitude}&localityLanguage=en`)
    if (!response.ok) return {}
    return normalizeBigDataCloud((await response.json()) as BigDataCloudResult)
  } catch {
    return {}
  }
}

const normalizeGoogle = (location: LocationData, result: GoogleResult, plusCode?: string) => {
  const components = result.address_components ?? []
  const pick = (...types: string[]) => components.find((c) => types.some((t) => c.types.includes(t)))?.long_name
  const neighborhood = pick('neighborhood')
  const sublocalities = unique([
    pick('sublocality_level_3'),
    pick('sublocality_level_2'),
    pick('sublocality_level_1'),
    pick('sublocality'),
  ])
  const sublocality = sublocalities[0]
  const city = pick('locality', 'postal_town')
  const district = pick('administrative_area_level_2')
  const state = pick('administrative_area_level_1')
  const countryComponent = components.find((c) => c.types.includes('country'))
  const placeName = result.name ?? pick('establishment', 'premise', 'point_of_interest')
  // Prefer the finest named locality. A second distinct locality is retained
  // separately so the stamp can show multiple fine-grained localities.
  const area = different(
    [neighborhood, ...sublocalities, pick('premise'), pick('establishment')],
    [city, district, state, countryComponent?.long_name],
  )
  const locality = different(
    [neighborhood, ...sublocalities],
    [area, city, district, state, countryComponent?.long_name],
  )

  return withResolved(location, {
    placeName,
    area,
    neighbourhood: neighborhood,
    sublocality,
    streetNumber: pick('street_number'),
    street: pick('route'),
    address: result.formatted_address,
    locality,
    city,
    district,
    state,
    postalCode: pick('postal_code'),
    country: countryComponent?.long_name,
    countryCode: countryComponent?.short_name,
    plusCode,
    provider: 'Google Geocoding',
  })
}

export const reverseGeocode = async (location: LocationData): Promise<LocationData> => {
  const withPlusCode = (resolved: LocationData) => ({
    ...resolved,
    plusCode: encodePlusCode(
      resolved.latitude,
      resolved.longitude,
      Boolean(resolved.city || resolved.town || resolved.village || resolved.locality),
    ) ?? resolved.plusCode,
  })
  if (!navigator.onLine) return withPlusCode(location)

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
      if (data.status === 'OK' && data.results?.[0]) {
        const normalized = normalizeGoogle(location, data.results[0], data.plus_code?.global_code)
        const nearby = await nearbyGooglePlace(location, googleKey)
        const googleResolved = withResolved(location, { ...normalized, ...nearby })

        // Google can return the city but omit fine-grained Indian locality
        // components. Supplement only missing locality fields from Nominatim;
        // never replace Google's more specific values.
        const osm = await reverseNominatim(location)
        const bigDataCloud = await reverseBigDataCloud(location)
        // Fill missing fields from fallback providers without replacing
        // Google's more specific values. Provider order gives Google the
        // highest precedence, then Nominatim, then BigDataCloud.
        return withPlusCode(mergeDefined(location, bigDataCloud, osm ?? {}, googleResolved))
      }
    } catch {
      // fallback below
    }
  }

  const osm = await reverseNominatim(location)
  const bigDataCloud = await reverseBigDataCloud(location)
  // Do not stop just because one provider returned partial address data.
  // Merge all available fields so Area/Locality can be filled by a fallback.
  return withPlusCode(mergeDefined(location, bigDataCloud, osm ?? {}))
}
