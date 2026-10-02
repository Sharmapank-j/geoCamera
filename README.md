# GeoTag Camera

GeoTag Camera is a private, ad-free, offline-first GPS camera web app built with React + TypeScript + Vite.

## Highlights

- Camera capture with rear/front switching
- Optional GPS capture (never required)
- Professional GPS stamp rendered directly into the image via Canvas
- Local-first storage using IndexedDB (original, stamped, thumbnail, metadata)
- Import photo, edit metadata, and save locally
- Local gallery with search/filtering and per-photo download/share/metadata export
- ZIP backup export/import in-browser
- Offline-ready PWA with service worker caching
- Privacy-first design: **Your photos and location data stay on this device unless you export them.**

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- IndexedDB (`idb`)
- Service Worker / PWA (`vite-plugin-pwa`)
- MediaDevices API
- Geolocation API
- Canvas API
- Web Share API (fallback to download)

## Architecture

- `src/storage`: IndexedDB access
- `src/camera`: camera capture helpers
- `src/location`: GPS + optional reverse geocode helpers
- `src/overlay`: image stamping engine
- `src/utils`: date/file export helpers
- `src/types.ts`: app/domain types
- `src/App.tsx`: main mobile-first UI workflow

## Local Setup

```bash
npm install
npm run dev
```

## Build & Preview

```bash
npm run build
npm run preview
```

## PWA Installation

- Open the app in a supported browser.
- Use “Install app” / “Add to Home Screen”.
- Launches in standalone mode as **GeoTag Camera**.

## HTTPS Requirement

Camera and geolocation require secure context in browsers.

- Local dev: `http://localhost` is supported by most browsers.
- Production: use HTTPS.

## Browser Compatibility Notes

- Modern Chromium/Edge/Firefox/Safari recommended.
- Persistent storage (`navigator.storage.persist`) is browser-dependent.
- Torch/advanced camera controls depend on hardware/browser support.

## Camera/GPS Limitations

- If camera permission is denied, app shows guidance and continues running.
- If location fails/denied/timeout, photos can still be saved without GPS.
- Reverse geocoding is optional and only sends coordinates when enabled.

## Offline Architecture

Core features continue after first load:

- Camera capture
- GPS where available
- GPS stamping
- Save to IndexedDB
- Gallery, metadata editing, export/import

Map/network enhancements are optional and never required for capture/stamp/save.

## Privacy Model

- No login/signup
- No cloud photo storage
- No analytics/tracking/ads
- No photo upload for geocoding

## Storage

Photo records are stored in IndexedDB with original blob, stamped blob, thumbnail blob, location metadata, notes, and overlay settings.

## Export / Import

- Single photo download
- Single metadata JSON export
- Full backup ZIP export/import:
  - `GeoTagCamera-Backup/manifest.json`
  - `GeoTagCamera-Backup/photos/*`
  - `GeoTagCamera-Backup/metadata/*`

## Deployment

### GitHub Pages

- Build with `npm run build`
- Deploy `dist/`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

### Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`


## GPS/location enrichment

The core app is offline-first. Camera capture, Canvas stamping, IndexedDB storage, gallery, export and backup do not require a network connection.

When online enrichment is enabled, the app sends only the current GPS coordinates to a configured reverse-geocoding provider. A browser-restricted `VITE_GOOGLE_MAPS_API_KEY` can be supplied for Google Geocoding; otherwise the app falls back to OpenStreetMap Nominatim. The UI normalizes place/POI, area/neighbourhood, locality/city, district, state, postal code and country independently. The **Area** field is deliberately preserved and is included in the GPS stamp when available.

Do not scrape Google Maps. Restrict any browser key by origin and API access in Google Cloud.

## Design

GeoTag Camera uses a camera-first dark interface with safe-area support, translucent controls, tactile shutter interaction, compact GPS state, bottom navigation and a full-screen photo viewer. No account, ads, analytics, background GPS or cloud photo storage are required.
