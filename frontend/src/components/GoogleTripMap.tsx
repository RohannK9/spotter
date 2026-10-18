import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, Risk } from "../types";
import {
  formatTime,
  formatWeather,
  riskColors,
  riskLabel,
  routeColors,
} from "../types";
import { loadGoogleMaps } from "../maps/google";
import {
  createWeatherOverlay,
  type WeatherSample,
} from "../maps/weatherOverlay";

type Props = {
  data: Analysis | null;
  selected: string;
  hour: number;
  heatVisible: boolean;
  checkpointIndex: number | null;
  onSelect: (id: string) => void;
  onCheckpoint: (index: number) => void;
};
type RouteLine = {
  id: string;
  line: google.maps.Polyline;
  recommended: boolean;
};

export default function GoogleTripMap({
  data,
  selected,
  hour,
  heatVisible,
  checkpointIndex,
  onSelect,
  onCheckpoint,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lines = useRef<RouteLine[]>([]);
  const weather = useRef<ReturnType<typeof createWeatherOverlay> | null>(null);
  const popup = useRef<google.maps.InfoWindow | null>(null);
  const callbacks = useRef({ onSelect, onCheckpoint });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    callbacks.current = { onSelect, onCheckpoint };
  }, [onSelect, onCheckpoint]);

  useEffect(() => {
    let disposed = false;
    const element = container.current;
    setReady(false);
    setError("");
    const authFailure = () => {
      if (!disposed)
        setError(
          "Google Maps could not authorize this website. Check the browser key, website restrictions, billing and Maps JavaScript API. Route details remain available below.",
        );
    };
    const target = window as typeof window & { gm_authFailure?: () => void };
    const previousAuthFailure = target.gm_authFailure;
    target.gm_authFailure = authFailure;
    let resize: ResizeObserver | undefined;
    void loadGoogleMaps()
      .then(() => {
        if (disposed || !element) return;
        const map = new google.maps.Map(element, {
          center: { lng: -106.3, lat: 39.8 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
        });
        mapRef.current = map;
        weather.current = createWeatherOverlay(map);
        map.data.addListener("click", (event: google.maps.Data.MouseEvent) => {
          const id = event.feature.getProperty("routeId");
          const index = event.feature.getProperty("index");
          if (typeof id === "string" && typeof index === "number") {
            callbacks.current.onSelect(id);
            callbacks.current.onCheckpoint(index);
          }
        });
        resize = new ResizeObserver(() => {
          google.maps.event.trigger(map, "resize");
          weather.current?.draw();
        });
        resize.observe(element);
        setReady(true);
      })
      .catch((failure: unknown) => {
        if (!disposed)
          setError(
            import.meta.env.VITE_GOOGLE_MAPS_API_KEY
              ? "Google Maps could not load. Check your connection and try again. Route details remain available below."
              : failure instanceof Error
                ? failure.message
                : "The live map is not configured.",
          );
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      if (target.gm_authFailure === authFailure)
        target.gm_authFailure = previousAuthFailure;
      popup.current?.close();
      weather.current?.setMap(null);
      weather.current = null;
      lines.current.forEach(({ line }) => {
        google.maps.event.clearInstanceListeners(line);
        line.setMap(null);
      });
      lines.current = [];
      if (mapRef.current) {
        google.maps.event.clearInstanceListeners(mapRef.current.data);
        google.maps.event.clearInstanceListeners(mapRef.current);
      }
      mapRef.current = null;
      element?.replaceChildren();
    };
  }, [retry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    popup.current?.close();
    lines.current.forEach(({ line }) => {
      google.maps.event.clearInstanceListeners(line);
      line.setMap(null);
    });
    lines.current = [];
    map.data.forEach((feature) => map.data.remove(feature));
    if (!data) return;
    const bounds = new google.maps.LatLngBounds();
    data.routes.forEach((route, routeIndex) => {
      const path = route.geometry.map(([lng, lat]) => ({ lng, lat }));
      path.forEach((point) => bounds.extend(point));
      const line = new google.maps.Polyline({
        map,
        path,
        strokeColor: routeColors[routeIndex],
        strokeOpacity: 0.75,
        strokeWeight: 4,
        zIndex: 5,
      });
      line.addListener("click", () => callbacks.current.onSelect(route.id));
      lines.current.push({
        id: route.id,
        line,
        recommended: route.id === data.recommendation.route_id,
      });
      route.checkpoints.forEach((cp, index) =>
        map.data.add({
          geometry: new google.maps.Data.Point({
            lng: cp.point[0],
            lat: cp.point[1],
          }),
          properties: {
            routeId: route.id,
            index,
            risk: cp.risk,
            kind: "checkpoint",
          },
        }),
      );
    });
    for (const [kind, location] of [
      ["origin", data.origin],
      ["destination", data.destination],
    ] as const) {
      map.data.add({
        geometry: new google.maps.Data.Point({
          lng: location.point[0],
          lat: location.point[1],
        }),
        properties: { kind },
      });
    }
    map.fitBounds(bounds, 65);
  }, [data, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    lines.current.forEach(({ id, line, recommended }) =>
      line.setOptions({
        strokeWeight: id === selected ? 7 : recommended ? 6 : 4,
        strokeOpacity: id === selected ? 1 : 0.65,
        zIndex: id === selected ? 10 : 5,
      }),
    );
    mapRef.current.data.setStyle((feature) => {
      const kind = feature.getProperty("kind");
      const risk = feature.getProperty("risk") as Risk | null;
      const chosen = feature.getProperty("routeId") === selected;
      const endpoint = kind !== "checkpoint";
      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: endpoint
            ? kind === "origin"
              ? "#173e35"
              : "#ffffff"
            : risk === null
              ? "#7c8490"
              : riskColors[risk],
          fillOpacity: 1,
          strokeColor: endpoint ? "#173e35" : "#ffffff",
          strokeWeight: 2,
          scale: endpoint ? 9 : chosen ? 6 : 3,
        },
        zIndex: endpoint ? 30 : chosen ? 25 : 20,
        clickable: !endpoint,
        title: endpoint
          ? String(kind)
          : `${feature.getProperty("routeId")} checkpoint ${Number(feature.getProperty("index")) + 1}: ${riskLabel(risk)}`,
      };
    });
  }, [selected, data, ready]);

  const route = data?.routes.find((r) => r.id === selected);
  const samples = useMemo<WeatherSample[]>(
    () =>
      route?.heatmap.points.flatMap((p) => {
        const risk = p.risks[hour];
        return risk == null ? [] : [{ point: p.point, risk }];
      }) ?? [],
    [route, hour],
  );
  useEffect(() => {
    if (ready) weather.current?.update(samples, heatVisible);
  }, [samples, heatVisible, ready]);
  useEffect(() => {
    popup.current?.close();
    if (!ready || !mapRef.current || !route || checkpointIndex === null) return;
    const cp = route.checkpoints[checkpointIndex];
    if (!cp) return;
    const content = document.createElement("div");
    content.className = "checkpoint-popup";
    const rows = [
      ["strong", `${route.id} · Mile ${cp.miles.toFixed(1)}`],
      ["p", formatTime(cp.eta)],
      ["b", riskLabel(cp.risk)],
      [
        "p",
        cp.weather
          ? `Wind ${formatWeather(cp.weather.wind_mph, "wind_mph")} mph · Rain ${formatWeather(cp.weather.rain_in, "rain_in")} in/h · Snow ${formatWeather(cp.weather.snow_in, "snow_in")} in/h`
          : "Weather data is unavailable for this checkpoint.",
      ],
      ["p", cp.reason],
    ];
    rows.forEach(([tag, text]) => {
      const item = document.createElement(tag);
      item.textContent = text;
      content.append(item);
    });
    popup.current = new google.maps.InfoWindow({
      content,
      position: { lng: cp.point[0], lat: cp.point[1] },
      maxWidth: 290,
      ariaLabel: "Checkpoint weather",
    });
    popup.current.open({ map: mapRef.current, shouldFocus: false });
  }, [route, checkpointIndex, ready]);

  return (
    <div className="map-shell">
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Google map of route alternatives and weather checkpoints"
      />
      {error && (
        <div className="map-error" role="status">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setRetry((v) => v + 1)}
          >
            Retry map
          </button>
        </div>
      )}
      <div className="map-caption">
        <span className="map-status-dot" />
        {data
          ? `${data.routes.length} alternatives · ${selected}`
          : "YOUR ROUTE, WITH A CLEARER OUTLOOK"}
      </div>
      <div className="map-legend" aria-label="Weather risk legend">
        {riskColors.map((color, i) => (
          <span key={color}>
            <i style={{ background: color }} />
            {riskLabel(i as Risk)}
          </span>
        ))}
        <span>
          <i style={{ background: "#7c8490" }} />
          Unknown
        </span>
      </div>
    </div>
  );
}
