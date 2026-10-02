export type PermissionStateLabel = 'Allowed' | 'Denied' | 'Not granted'
export type StorageStateLabel = 'Persistent' | 'Available' | 'Limited'
export type CameraFacing = 'environment' | 'user'
export type GpsStatus =
  | 'LOCATION OFF'
  | 'LOCATING...'
  | 'GPS READY'
  | `GPS ±${number} m`
  | 'LOW ACCURACY'
  | 'LOCATION DENIED'
  | 'LOCATION UNAVAILABLE'
  | 'GPS TIMEOUT'

export interface LocationData {
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number | null
  altitudeAccuracy?: number | null
  heading?: number | null
  speed?: number | null
  timestamp: string
  placeName?: string
  area?: string
  neighbourhood?: string
  sublocality?: string
  streetNumber?: string
  street?: string
  address?: string
  locality?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  district?: string
  state?: string
  postalCode?: string
  country?: string
  countryCode?: string
  region?: string
  plusCode?: string
  provider?: string
  resolvedAt?: string
}

export type OverlayPreset =
  | 'Classic GPS'
  | 'Minimal'
  | 'Compact'
  | 'Evidence'
  | 'Travel'
  | 'Professional'
  | 'Custom'

export type OverlayPosition = 'bottom' | 'bottom-left' | 'bottom-right' | 'top' | 'top-left' | 'top-right'

export interface OverlaySettings {
  preset: OverlayPreset
  showTitle: boolean
  showLocationName: boolean
  showArea: boolean
  showAddress: boolean
  showLocality: boolean
  showCity: boolean
  showDistrict: boolean
  showState: boolean
  showCountry: boolean
  showPostalCode: boolean
  showLatitude: boolean
  showLongitude: boolean
  showAccuracy: boolean
  showAltitude: boolean
  showHeading: boolean
  showSpeed: boolean
  showDate: boolean
  showTime: boolean
  showPlusCode: boolean
  showNotes: boolean
  showMap: boolean
  position: OverlayPosition
  opacity: number
  fontSize: number
  panelWidth: number
  mapSize: number
  spacing: number
  cornerRadius: number
  textAlign: CanvasTextAlign
  coordinatePrecision: number
}

export interface PhotoRecord extends LocationData {
  id: string
  originalBlob: Blob
  finalBlob: Blob
  thumbnailBlob: Blob
  createdAt: string
  captureDateTime: string
  notes?: string
  hasLocation: boolean
  overlayPreset: OverlayPreset
  overlaySettings: OverlaySettings
  fileName: string
}

export interface AppSettings {
  setupComplete: boolean
  defaultCamera: CameraFacing
  mirrorFrontCamera: boolean
  coordinatePrecision: number
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  use24Hour: boolean
  defaultPreset: OverlayPreset
  addressLookup: boolean
  allowExternalGeocoder: boolean
  locationHighAccuracy: boolean
  locationTimeoutMs: number
  lowAccuracyThresholdM: number
}

export const defaultOverlaySettings: OverlaySettings = {
  preset: 'Classic GPS',
  showTitle: true,
  showLocationName: true,
  showArea: true,
  showAddress: true,
  showLocality: true,
  showCity: true,
  showDistrict: true,
  showState: true,
  showCountry: true,
  showPostalCode: true,
  showLatitude: true,
  showLongitude: true,
  showAccuracy: true,
  showAltitude: false,
  showHeading: false,
  showSpeed: false,
  showDate: true,
  showTime: true,
  showPlusCode: false,
  showNotes: true,
  showMap: true,
  position: 'bottom',
  opacity: 0.9,
  fontSize: 18,
  panelWidth: 0.94,
  mapSize: 0.28,
  spacing: 1,
  cornerRadius: 18,
  textAlign: 'left',
  coordinatePrecision: 6,
}

export const defaultAppSettings: AppSettings = {
  setupComplete: false,
  defaultCamera: 'environment',
  mirrorFrontCamera: true,
  coordinatePrecision: 6,
  dateFormat: 'DD/MM/YYYY',
  use24Hour: false,
  defaultPreset: 'Classic GPS',
  addressLookup: true,
  allowExternalGeocoder: true,
  locationHighAccuracy: true,
  locationTimeoutMs: 12000,
  lowAccuracyThresholdM: 50,
}
