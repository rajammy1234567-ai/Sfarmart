// utils/maps.js
// Helper functions for location handling in the Farmart tri‑app.
// Uses the Google Maps API key provided via environment variable.
// NOTE: Do NOT commit real API keys; they are accessed through
// process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.

/**
 * Perform reverse geocoding using Google Geocoding API.
 * Returns an object containing a formatted address, city and postal code (pincode).
 *
 * @param {number} lat Latitude in decimal degrees.
 * @param {number} lng Longitude in decimal degrees.
 * @returns {Promise<{address:string, city:string, pincode:string}>}
 */
export async function reverseGeocode(lat, lng) {
  let address = '';
  let city = '';
  let pincode = '';
  let area = '';
  let state = '';

  // 1. Try Google Maps JS Geocoder if running in browser
  if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
    try {
      const geocoder = new window.google.maps.Geocoder();
      const response = await geocoder.geocode({ location: { lat, lng } });
      if (response?.results?.length) {
        const result = response.results[0];
        address = result.formatted_address || '';
        result.address_components?.forEach(comp => {
          if (comp.types.includes('sublocality') || comp.types.includes('neighborhood')) area = comp.long_name;
          if (comp.types.includes('locality')) city = comp.long_name;
          if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
          if (comp.types.includes('postal_code')) pincode = comp.long_name;
        });
        if (address) return { address, area, city, state, pincode, lat, lng };
      }
    } catch (gErr) {
      console.warn('Web Geocoder warning:', gErr.message || gErr);
    }
  }

  // 2. Try Google Maps Geocoding REST API
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=en`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.status === 'OK' && data.results?.length) {
        const result = data.results[0];
        address = result.formatted_address || '';
        result.address_components?.forEach(comp => {
          if (comp.types.includes('sublocality') || comp.types.includes('neighborhood')) area = comp.long_name;
          if (comp.types.includes('locality')) city = comp.long_name;
          if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
          if (comp.types.includes('postal_code')) pincode = comp.long_name;
        });
        if (address) return { address, area, city, state, pincode, lat: Number(lat), lng: Number(lng) };
      }
    } catch (e) {
      console.warn('Google REST geocode error, using fallback:', e.message || e);
    }
  }

  // 3. Fallback: High-precision OpenStreetMap Reverse Geocode
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
    const osmResp = await fetch(osmUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'FarmartUserApp/1.0' }
    });
    if (osmResp.ok) {
      const osmData = await osmResp.json();
      if (osmData && osmData.address) {
        const a = osmData.address;
        area = a.suburb || a.neighbourhood || a.residential || a.road || '';
        city = a.city || a.town || a.village || a.county || '';
        state = a.state || '';
        pincode = a.postcode || '';
        address = [area, city, state].filter(Boolean).join(', ') || osmData.display_name || '';
        return { address, area, city, state, pincode, lat, lng };
      }
    }
  } catch (osmErr) {
    console.warn('OSM fallback geocode error:', osmErr.message || osmErr);
  }

  return {
    address: address || '',
    area: area || '',
    city: city || '',
    state: state || '',
    pincode: pincode || '',
    lat,
    lng
  };
}

/**
 * Compute bearing (heading) from a previous point to a next point.
 * Returns bearing in degrees clockwise from true north.
 *
 * @param {{lat:number,lng:number}} prev
 * @param {{lat:number,lng:number}} next
 * @returns {number} Bearing in degrees (0‑360).
 */
export function computeBearing(prev, next) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;
  const lat1 = toRad(prev.lat);
  const lat2 = toRad(next.lat);
  const dLon = toRad(next.lng - prev.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  brng = (brng + 360) % 360; // normalise
  return brng;
}
