// src/pages/api/geocode.ts
// 100% Free Mode Reverse Geocoding API route.
// Uses OpenStreetMap Nominatim (Free & Open Data) with offline coordinate fallback.
// Requires NO paid API keys, NO credit cards, and NO billing accounts.
import type { NextApiRequest, NextApiResponse } from 'next';

interface GeocodeResponseData {
  success: boolean;
  formattedAddress?: string;
  plusCode?: string;
  source: 'free-nominatim' | 'free-offline' | 'google-optional';
  mode: 'free';
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeocodeResponseData>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed', mode: 'free', source: 'free-offline' });
  }

  const { lat, lng } = req.query;

  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
    return res.status(400).json({ success: false, error: 'Missing or invalid latitude/longitude', mode: 'free', source: 'free-offline' });
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  // 1. FREE MODE: OpenStreetMap Nominatim Reverse Geocoder (Zero Cost / No API Key required)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18&addressdetails=1`;
    const response = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoTagCamera-PWA/2.1 (Free-Mode-Client; contact: geocamera-app@local.internal)',
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
          source: 'free-nominatim',
          mode: 'free',
        });
      }
    }
  } catch {
    // Offline or network error — smoothly fall back to mathematical coordinates below
  }

  // 2. OFFLINE FREE FALLBACK: Instant Client Mathematical Geodesic Descriptor (100% Free & Offline)
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lngDir = longitude >= 0 ? 'E' : 'W';
  const fallbackDescriptor = `Location (${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lngDir})`;

  return res.status(200).json({
    success: true,
    formattedAddress: fallbackDescriptor,
    source: 'free-offline',
    mode: 'free',
  });
}

