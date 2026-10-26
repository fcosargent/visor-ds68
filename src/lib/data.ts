// Carga de GeoJSON bajo demanda, con caché en memoria.

import type { FeatureCollection } from 'geojson';
import { DATA_REPORT_URL } from '../config/layers';

const cache = new Map<string, Promise<FeatureCollection>>();

export function loadGeoJSON(url: string): Promise<FeatureCollection> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          throw new Error('el archivo no es un GeoJSON FeatureCollection');
        }
        return data as FeatureCollection;
      })
      .catch((err) => {
        cache.delete(url);
        throw err;
      });
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Lista de archivos generados según data_report.json.
 * Devuelve null si el informe no se puede leer (la app intentará cargar cada capa igual).
 */
export async function loadAvailableFiles(): Promise<Set<string> | null> {
  try {
    const r = await fetch(DATA_REPORT_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const report = await r.json();
    const files: { archivo: string }[] = report?.archivos_generados ?? [];
    return new Set(files.map((f) => f.archivo));
  } catch (err) {
    console.warn(
      `[Visor DS 68] No se pudo leer ${DATA_REPORT_URL} (${String(err)}). ` +
        'Ejecute "python scripts/prepare_data.py" para generar los datos.',
    );
    return null;
  }
}

export const formatNumber = (n: number) => new Intl.NumberFormat('es-CL').format(n);
