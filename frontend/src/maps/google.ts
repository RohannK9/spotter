import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let configured = false;
export async function loadGoogleMaps(): Promise<void> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      "The live map is not configured. Add a restricted browser Maps JavaScript API key and rebuild the frontend. Route details remain available below.",
    );
  }
  if (!configured) {
    setOptions({ key, v: "quarterly" });
    configured = true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      importLibrary("maps"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Map loading timed out.")),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
