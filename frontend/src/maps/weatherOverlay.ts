import type { Coordinates, Risk } from "../types";
import { riskColors } from "../types";

export type WeatherSample = { point: Coordinates; risk: Risk };

// Use the supported OverlayView API; Google's old HeatmapLayer was retired.
export function createWeatherOverlay(map: google.maps.Map) {
  class WeatherOverlay extends google.maps.OverlayView {
    canvas = document.createElement("canvas");
    samples: WeatherSample[] = [];
    visible = true;
    onAdd() {
      this.canvas.className = "google-weather-overlay";
      this.canvas.style.cssText = "position:absolute;pointer-events:none;";
      this.canvas.setAttribute("aria-hidden", "true");
      this.getPanes()?.overlayLayer.append(this.canvas);
    }
    onRemove() {
      this.canvas.remove();
    }
    update(samples: WeatherSample[], visible: boolean) {
      this.samples = samples;
      this.visible = visible;
      this.draw();
    }
    draw() {
      this.canvas.hidden = !this.visible;
      const projection = this.getProjection();
      const center = map.getCenter();
      if (!projection || !center || !this.visible) return;
      const anchor = projection.fromLatLngToDivPixel(center);
      if (!anchor) return;
      const width = map.getDiv().clientWidth;
      const height = map.getDiv().clientHeight;
      if (!width || !height) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const left = anchor.x - width / 2;
      const top = anchor.y - height / 2;
      this.canvas.width = Math.round(width * scale);
      this.canvas.height = Math.round(height * scale);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.canvas.style.left = `${left}px`;
      this.canvas.style.top = `${top}px`;
      const context = this.canvas.getContext("2d");
      if (!context) return;
      context.scale(scale, scale);
      const radius = Math.min(65, Math.max(24, (map.getZoom() ?? 5) * 5));
      for (const sample of this.samples) {
        const p = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(sample.point[1], sample.point[0]),
        );
        if (!p) continue;
        const x = p.x - left,
          y = p.y - top;
        if (
          x < -radius ||
          x > width + radius ||
          y < -radius ||
          y > height + radius
        )
          continue;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `${riskColors[sample.risk]}70`);
        gradient.addColorStop(1, `${riskColors[sample.risk]}00`);
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
  }
  const overlay = new WeatherOverlay();
  overlay.setMap(map);
  return overlay;
}
