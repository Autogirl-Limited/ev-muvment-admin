import { NextResponse, type NextRequest } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };
const PLACES_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text";

interface GoogleAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
}

interface GooglePlaceDetailsResponse {
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
}

function googleMapsKey() {
  return process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

function errorResponse(status: number, message: string) {
  return NextResponse.json({ message }, { status, headers: NO_STORE });
}

function requestReferer(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) return `${origin}/`;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}/` : undefined;
}

async function autocomplete(input: string, key: string, referer?: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACES_FIELD_MASK,
      ...(referer ? { Referer: referer } : {}),
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["ng"],
      languageCode: "en",
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Google Places autocomplete failed");
  const payload = (await response.json()) as GoogleAutocompleteResponse;
  const results =
    payload.suggestions
      ?.map((suggestion) => suggestion.placePrediction)
      .filter((place): place is NonNullable<typeof place> => Boolean(place?.placeId))
      .map((place) => {
        const main = place.structuredFormat?.mainText?.text;
        const secondary = place.structuredFormat?.secondaryText?.text;
        return {
          place_id: place.placeId!,
          display_name: place.text?.text ?? [main, secondary].filter(Boolean).join(", "),
          main_text: main ?? place.text?.text ?? "Unnamed place",
          secondary_text: secondary ?? "",
        };
      }) ?? [];

  return NextResponse.json({ results }, { headers: NO_STORE });
}

async function details(placeId: string, key: string, referer?: string) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "formattedAddress,location",
        ...(referer ? { Referer: referer } : {}),
      },
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Google Place Details failed");
  const place = (await response.json()) as GooglePlaceDetailsResponse;
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return errorResponse(404, "Google did not return coordinates for this place.");
  }

  return NextResponse.json(
    {
      result: {
        address: place.formattedAddress ?? "",
        latitude,
        longitude,
      },
    },
    { headers: NO_STORE },
  );
}

export async function GET(request: NextRequest) {
  const key = googleMapsKey();
  if (!key || key === "changeme") return errorResponse(500, "Google Maps API key is not configured.");

  const input = request.nextUrl.searchParams.get("input")?.trim();
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim();
  const referer = requestReferer(request);

  try {
    if (placeId) return await details(placeId, key, referer);
    if (input) return await autocomplete(input.slice(0, 200), key, referer);
    return errorResponse(400, "Provide an input or placeId.");
  } catch {
    return errorResponse(502, "Google Maps place search is unavailable right now.");
  }
}
