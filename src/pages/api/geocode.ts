// src/pages/api/geocode.ts
// Server-side Geocoding & Reverse Geocoding API route.
// Compliant with Google Maps Platform standards and avoids client-side CORS trap (CF1).
import type { NextApiRequest, NextApiResponse } from 'next';

interface GeocodeResponseData {
  success: boolean;
  formattedAddress?: string;
  plusCode?: string;
  source?: 'google' | 'nominatim' | 'coordinates';
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeocodeResponseData>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { lat, lng } = req.query;

  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
    return res.status(400).json({ success: false, error: 'Missing or invalid latitude/longitude' });
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  // 1. Google Maps Platform Geocoding API (Preferred modern v4 REST endpoint)
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (googleApiKey) {
    try {
      const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
      url.searchParams.append('location.latitude', latitude.toString());
      url.searchParams.append('location.longitude', longitude.toString());
      url.searchParams.append('languageCode', 'en');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': 'results.placeId,results.formattedAddress,results.addressComponents,plusCode',
          'X-Goog-Maps-Solution-ID': 'gmp_git_agentskills_v1',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const primaryResult = data.results?.[0];
        if (primaryResult?.formattedAddress) {
          return res.status(200).json({
            success: true,
            formattedAddress: primaryResult.formattedAddress,
            plusCode: data.plusCode?.globalCode || primaryResult.plusCode?.globalCode,
            source: 'google',
          });
        }
      }
    } catch {
      // Fall through to fallback resolver
    }
  }

  // 2. Server-side Reverse Geocoder fallback (with proper custom User-Agent to avoid 403)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18&addressdetails=1`;
    const response = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoTagCamera-PWA/2.1 (contact: geocamera-app@local.internal)',
        'Accept-Language': 'en',
      },
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.display_name) {
        // Build concise, clean address components (Road, Suburb/City, State, Country)
        const parts: string[] = [];
        const addr = data.address || {};
        const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood;
        const city = addr.city || addr.town || addr.village || addr.county;
        const state = addr.state;
        const country = addr.country;

        if (road) parts.push(road);
        if (city && city !== road) parts.push(city);
        if (state && state !== city) parts.push(state);
        if (country) parts.push(country);

        const cleanAddress = parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(', ');

        return res.status(200).json({
          success: true,
          formattedAddress: cleanAddress,
          source: 'nominatim',
        });
      }
    }
  } catch {
    // Fall through to coordinate descriptor
  }

  // 3. Offline / Fallback Geographic Coordinate Descriptor
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lngDir = longitude >= 0 ? 'E' : 'W';
  const fallbackDescriptor = `Location (${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lngDir})`;

  return res.status(200).json({
    success: true,
    formattedAddress: fallbackDescriptor,
    source: 'coordinates',
  });
}
