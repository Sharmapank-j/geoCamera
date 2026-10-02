export type PermissionStateLabel = 'Allowed' | 'Denied' | 'Not granted'

export type StorageStateLabel = 'Persistent' | 'Available' | 'Limited'

export type CameraFacing = 'environment' | 'user'

export type GpsStatus =
  | 'LOCATION OFF'
  | 'LOCATING...'
  | 'GPS READY'
  | `GPS ±${number} m`
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
  address?: string
  locality?: string
  city?: string
  district?: string
  state?: string
  country?: string
  placeName?: string
}

export type OverlayPreset =
  | 'Classic GPS'
  | 'Minimal'
  | 'Compact'
  | 'Evidence'
  | 'Travel'
  | 'Custom'

export type OverlayPosition =
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'top'
  | 'top-left'
  | 'top-right'

export interface OverlaySettings {
  preset: OverlayPreset
  showTitle: boolean
  showLocationName: boolean
  showAddress: boolean
  showLocality: boolean
  showCity: boolean
  showDistrict: boolean
  showState: boolean
  showCountry: boolean
  showLatitude: boolean
  showLongitude: boolean
  showAccuracy: boolean
  showAltitude: boolean
  showHeading: boolean
  showSpeed: boolean
  showDate: boolean
  showTime: boolean
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

export interface PhotoRecord {
  id: string
  originalBlob: Blob
  finalBlob: Blob
  thumbnailBlob: Blob
  createdAt: string
  captureDateTime: string
  latitude?: number
  longitude?: number
  accuracy?: number
  altitude?: number | null
  altitudeAccuracy?: number | null
  heading?: number | null
  speed?: number | null
  gpsTimestamp?: string
  address?: string
  locality?: string
  city?: string
  district?: string
  state?: string
  country?: string
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
}

export const defaultOverlaySettings: OverlaySettings = {
  preset: 'Classic GPS',
  showTitle: true,
  showLocationName: true,
  showAddress: true,
  showLocality: true,
  showCity: true,
  showDistrict: true,
  showState: true,
  showCountry: true,
  showLatitude: true,
  showLongitude: true,
  showAccuracy: true,
  showAltitude: true,
  showHeading: true,
  showSpeed: true,
  showDate: true,
  showTime: true,
  showNotes: true,
  showMap: true,
  position: 'bottom',
  opacity: 0.84,
  fontSize: 18,
  panelWidth: 0.98,
  mapSize: 0.34,
  spacing: 1,
  cornerRadius: 20,
  textAlign: 'left',
  coordinatePrecision: 7,
}

export const defaultAppSettings: AppSettings = {
  setupComplete: false,
  defaultCamera: 'environment',
  mirrorFrontCamera: true,
  coordinatePrecision: 7,
  dateFormat: 'DD/MM/YYYY',
  use24Hour: false,
  defaultPreset: 'Classic GPS',
  addressLookup: true,
  allowExternalGeocoder: false,
}
