// Etiquetas de nombres de calles: solo texto girado según el eje, sin dibujar la línea.
// Los puntos y ángulos vienen precalculados por prepare_data.py, ordenados por prioridad
// (calles continuas más largas primero). Cuando dos etiquetas se superponen, se oculta
// la de menor prioridad.

import L from 'leaflet';
import type { FeatureCollection, Point } from 'geojson';

interface LabelPoint {
  latlng: L.LatLng;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const overlaps = (a: DOMRect, b: DOMRect, m = 3) =>
  a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m;

export class StreetLabelLayer extends L.Layer {
  private points: LabelPoint[];
  private markers = new Map<number, L.Marker>();
  private minZoom: number;
  private color: string;

  constructor(data: FeatureCollection, opts: { minZoom: number; color: string; pane: string }) {
    super({ pane: opts.pane });
    this.minZoom = opts.minZoom;
    this.color = opts.color;
    this.points = data.features.map((f) => {
      const [lng, lat] = (f.geometry as Point).coordinates;
      const nombre = escapeHtml(String(f.properties?.nombre ?? ''));
      const angulo = Number(f.properties?.angulo ?? 0);
      return {
        latlng: L.latLng(lat, lng),
        html: `<span style="transform:translate(-50%,-50%) rotate(${angulo}deg);color:${this.color}">${nombre}</span>`,
      };
    });
  }

  onAdd(map: L.Map) {
    map.on('moveend zoomend', this.update, this);
    this.update();
    return this;
  }

  onRemove(map: L.Map) {
    map.off('moveend zoomend', this.update, this);
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    return this;
  }

  private update() {
    const map = this._map;
    if (!map) return;
    const visible = map.getZoom() >= this.minZoom;
    const bounds = map.getBounds().pad(0.15);

    this.points.forEach((p, i) => {
      const wanted = visible && bounds.contains(p.latlng);
      const marker = this.markers.get(i);
      if (wanted && !marker) {
        const icon = L.divIcon({ className: 'street-label', html: p.html, iconSize: [0, 0] });
        this.markers.set(i, L.marker(p.latlng, { icon, interactive: false, keyboard: false, pane: this.options.pane }).addTo(map));
      } else if (!wanted && marker) {
        marker.remove();
        this.markers.delete(i);
      }
    });

    // Evitar superposiciones: se recorre en orden de prioridad (índice ascendente).
    const placed: DOMRect[] = [];
    const ordered = [...this.markers.entries()].sort((a, b) => a[0] - b[0]);
    const spans = ordered.map(([, m]) => m.getElement()?.firstElementChild as HTMLElement | null);
    const rects = spans.map((s) => s?.getBoundingClientRect());
    spans.forEach((span, k) => {
      const rect = rects[k];
      if (!span || !rect) return;
      const free = !placed.some((r) => overlaps(r, rect));
      span.style.visibility = free ? 'visible' : 'hidden';
      if (free) placed.push(rect);
    });
  }
}
