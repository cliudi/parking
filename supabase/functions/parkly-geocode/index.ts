import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const ALLOWED_ORIGINS = new Set([
  "https://cliudi.github.io",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
]);
const REQUEST_TIMEOUT_MS = 9_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_PER_IP = 40;
const MAX_REQUEST_BYTES = 1_024;

type RateEntry = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateEntry>();

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
}

function consumeRateLimit(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_PER_IP) return false;
  current.count += 1;
  return true;
}

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function reverseWithYandex(lat: number, lng: number) {
  const apiKey = Deno.env.get("YANDEX_GEOCODER_API_KEY");
  if (!apiKey) return null;
  const params = new URLSearchParams({
    apikey: apiKey,
    geocode: `${lng},${lat}`,
    format: "json",
    lang: "ru_RU",
    results: "1",
  });
  const response = await fetchWithTimeout(`https://geocode-maps.yandex.ru/v1/?${params}`,
    { Accept: "application/json" });
  if (!response.ok) return null;
  const payload = await response.json();
  const object = payload?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  const meta = object?.metaDataProperty?.GeocoderMetaData;
  const address = String(meta?.text || meta?.Address?.formatted || object?.description || object?.name || "").trim();
  return address ? { address, label: String(object?.name || address), provider: "yandex" } : null;
}

async function reverseWithOpenStreetMap(lat: number, lng: number) {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "ru",
  });
  const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    Accept: "application/json",
    "User-Agent": "Parky/1.1 (https://cliudi.github.io/parking/)",
    Referer: "https://cliudi.github.io/parking/",
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const address = String(payload?.display_name || "").trim();
  return address ? { address, label: address.split(",")[0] || address, provider: "openstreetmap" } : null;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return json(request, { error: "request_too_large" }, 413);
  }
  if (!consumeRateLimit(request)) return json(request, { error: "geocode_limit_reached" }, 429);

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(request, { error: "request_too_large" }, 413);
    }
    const input = JSON.parse(rawBody);
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(request, { error: "invalid_coordinates" }, 400);
    }

    let result = null;
    try { result = await reverseWithYandex(lat, lng); } catch { /* fallback below */ }
    if (!result) result = await reverseWithOpenStreetMap(lat, lng);
    return result ? json(request, result) : json(request, { error: "address_not_found" }, 404);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(request, { error: "geocode_timeout" }, 504);
    }
    console.error("parkly_geocode_request_failed");
    return json(request, { error: "invalid_request" }, 400);
    }
  }),
};
