import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection, LineString, Point as GeoPoint } from "geojson";
import type { Analysis, Risk } from "../types";
import {
  formatTime,
  formatWeather,
  riskColors,
  riskLabel,
  routeColors,
} from "../types";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 uses an external module worker; Vite must bundle its imports too.
maplibregl.setWorkerUrl(workerUrl);

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const riskColorExpression: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "risk"],
  0,
  riskColors[0],
  1,
  riskColors[1],
  2,
  riskColors[2],
  3,
  riskColors[3],
  4,
  riskColors[4],
  "#7c8490",
];

export default function TripMap({
  data,
  selected,
  hour,
  heatVisible,
  checkpointIndex,
  onSelect,
  onCheckpoint,
}: {
  data: Analysis | null;
  selected: string;
  hour: number;
  heatVisible: boolean;
  checkpointIndex: number | null;
  onSelect: (id: string) => void;
  onCheckpoint: (index: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const callbacks = useRef({ onSelect, onCheckpoint });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    callbacks.current = { onSelect, onCheckpoint };
  }, [onSelect, onCheckpoint]);
  useEffect(() => {
    if (!container.current) return;
    setReady(false);
    setError("");
    let map: MapInstance;
    try {
      map = new maplibregl.Map({
        container: container.current,
        center: [-106.3, 39.8],
        zoom: 4.5,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
            },
          },
          layers: [
            {
              id: "base",
              type: "raster",
              source: "basemap",
              paint: { "raster-saturation": -0.8, "raster-opacity": 0.75 },
            },
          ],
        },
        attributionControl: { compact: true },
      });
    } catch {
      setError(
        "The map could not start. Check that WebGL is enabled, then try again.",
      );
      return;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("error", (event) =>
      setError(
        "sourceId" in event && event.sourceId === "basemap"
          ? "Some map tiles could not be loaded. Route and checkpoint details remain available below."
          : "Part of the map could not be displayed. Route and checkpoint details remain available below.",
      ),
    );
    map.on("load", () => {
      for (const id of ["routes", "checkpoints", "heat", "endpoints"])
        map.addSource(id, { type: "geojson", data: empty });
      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "heat",
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "risk"],
            0,
            0.08,
            4,
            1,
          ],
          "heatmap-intensity": 0.7,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 20, 9, 55],
          "heatmap-opacity": 0.45,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(49,131,106,0)",
            0.15,
            "#a5c9a7",
            0.4,
            "#f1cc69",
            0.65,
            "#ee9257",
            0.85,
            "#cf4a55",
            1,
            "#711d43",
          ],
        },
      });
      map.addLayer({
        id: "route-outline",
        type: "line",
        source: "routes",
        paint: {
          "line-color": "#ffffff",
          "line-width": 9,
          "line-opacity": 0.9,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-opacity": 0.65,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "recommended",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "recommended"], true],
        paint: { "line-color": ["get", "color"], "line-width": 6 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "selected-route",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "id"], ""],
        paint: { "line-color": ["get", "color"], "line-width": 7 },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "route-hit-area",
        type: "line",
        source: "routes",
        paint: { "line-width": 22, "line-opacity": 0 },
      });
      map.addLayer({
        id: "checkpoints",
        type: "circle",
        source: "checkpoints",
        paint: {
          "circle-radius": 5,
          "circle-color": riskColorExpression,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.addLayer({
        id: "endpoints",
        type: "circle",
        source: "endpoints",
        paint: {
          "circle-radius": 9,
          "circle-color": [
            "match",
            ["get", "kind"],
            "origin",
            "#173e35",
            "#fff",
          ],
          "circle-stroke-color": "#173e35",
          "circle-stroke-width": 3,
        },
      });
      map.on("click", "route-hit-area", (event) => {
        if (
          map.queryRenderedFeatures(event.point, { layers: ["checkpoints"] })
            .length
        )
          return;
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") callbacks.current.onSelect(id);
      });
      map.on("click", "checkpoints", (event) => {
        const properties = event.features?.[0]?.properties;
        if (properties) {
          callbacks.current.onSelect(String(properties.routeId));
          callbacks.current.onCheckpoint(Number(properties.index));
        }
      });
      map.on("mouseenter", "route-hit-area", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "route-hit-area", () => {
        map.getCanvas().style.cursor = "";
      });
      setReady(true);
    });
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      popup.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [retry]);

  const routes = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features:
        data?.routes.map((route, index) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: route.geometry },
          properties: {
            id: route.id,
            color: routeColors[index],
            recommended: route.id === data.recommendation.route_id,
          },
        })) ?? [],
    }),
    [data],
  );
  const checkpoints = useMemo<FeatureCollection<GeoPoint>>(
    () => ({
      type: "FeatureCollection",
      features:
        data?.routes.flatMap((route) =>
          route.checkpoints.map((cp, index) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: cp.point },
            properties: { routeId: route.id, index, risk: cp.risk ?? -1 },
          })),
        ) ?? [],
    }),
    [data],
  );
  const route = data?.routes.find((r) => r.id === selected);
  const heat = useMemo<FeatureCollection<GeoPoint>>(
    () => ({
      type: "FeatureCollection",
      features:
        route?.heatmap.points
          .filter((p) => p.risks[hour] !== null)
          .map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: p.point },
            properties: { risk: p.risks[hour] },
          })) ?? [],
    }),
    [route, hour],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("routes") as GeoJSONSource).setData(routes);
    (map.getSource("checkpoints") as GeoJSONSource).setData(checkpoints);
    const endpoints: FeatureCollection<GeoPoint> = {
      type: "FeatureCollection",
      features: data
        ? [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: data.routes[0].geometry[0],
              },
              properties: { kind: "origin" },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: data.routes[0].geometry.at(-1)!,
              },
              properties: { kind: "destination" },
            },
          ]
        : [],
    };
    (map.getSource("endpoints") as GeoJSONSource).setData(endpoints);
    if (data) {
      const bounds = new maplibregl.LngLatBounds();
      for (const r of data.routes)
        for (const point of r.geometry) bounds.extend(point);
      map.fitBounds(bounds, { padding: 65, duration: 0, maxZoom: 12 });
    }
  }, [data, routes, checkpoints, ready]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setFilter("selected-route", ["==", ["get", "id"], selected]);
    // All checkpoint markers remain visible; selected route gets stronger outlines.
    mapRef.current.setPaintProperty("checkpoints", "circle-radius", [
      "case",
      ["==", ["get", "routeId"], selected],
      6,
      3,
    ]);
  }, [selected, ready]);
  useEffect(() => {
    if (ready && mapRef.current)
      (mapRef.current.getSource("heat") as GeoJSONSource).setData(heat);
  }, [heat, ready]);
  useEffect(() => {
    if (ready && mapRef.current)
      mapRef.current.setLayoutProperty(
        "heat",
        "visibility",
        heatVisible ? "visible" : "none",
      );
  }, [heatVisible, ready]);
  useEffect(() => {
    popup.current?.remove();
    if (!ready || !mapRef.current || checkpointIndex === null || !route) return;
    const cp = route.checkpoints[checkpointIndex];
    if (!cp) return;
    // DOM textContent prevents provider names or weather messages becoming executable HTML.
    const content = document.createElement("div");
    content.className = "checkpoint-popup";
    const heading = document.createElement("strong");
    heading.textContent = `${route.id} · Mile ${cp.miles.toFixed(1)}`;
    const time = document.createElement("p");
    time.textContent = formatTime(cp.eta);
    const risk = document.createElement("b");
    risk.textContent = riskLabel(cp.risk as Risk | null);
    const weather = document.createElement("p");
    weather.textContent = cp.weather
      ? `Wind ${formatWeather(cp.weather.wind_mph, "wind_mph")} mph · Rain ${formatWeather(cp.weather.rain_in, "rain_in")} in/h · Snow ${formatWeather(cp.weather.snow_in, "snow_in")} in/h`
      : "Weather data is unavailable for this checkpoint.";
    const reason = document.createElement("p");
    reason.textContent = cp.reason;
    content.append(heading, time, risk, weather, reason);
    popup.current = new maplibregl.Popup({
      maxWidth: "290px",
      closeOnClick: false,
    })
      .setLngLat(cp.point)
      .setDOMContent(content)
      .addTo(mapRef.current);
  }, [route, checkpointIndex, ready]);

  return (
    <div className="map-shell">
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Interactive map of route alternatives and weather checkpoints"
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
