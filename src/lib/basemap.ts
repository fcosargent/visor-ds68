// Mapa base sin ningún texto (ni comunas, ni calles, ni parques): los nombres de calles
// oficiales los entrega la capa «Nombres de calles» (EJES_VIALES).
//
// Se usa la versión vectorial de Esri «Light Gray Canvas Base», dibujada con MapLibre,
// quitando todas las capas de tipo «symbol» (textos e íconos). Si el estilo no carga,
// se usa el mapa raster equivalente (que trae algunos nombres grabados desde el zoom 15).

import L from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import type { StyleSpecification } from 'maplibre-gl';
import { METADATA } from '../config/metadata';

/** Nivel máximo con teselas vectoriales en el servicio de Esri (más allá se amplían, sin perder nitidez). */
const ZOOM_MAX_TESELAS = 16;

/** `vigente` permite descartar el resultado si el mapa se desmontó mientras cargaba el estilo. */
export async function agregarMapaBase(map: L.Map, vigente: () => boolean): Promise<void> {
  const { estiloVectorial, rasterRespaldo, atribucion } = METADATA.mapaBase;
  map.attributionControl.addAttribution(atribucion);
  try {
    const r = await fetch(estiloVectorial);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const estilo = (await r.json()) as StyleSpecification;
    if (!vigente()) return;
    estilo.layers = estilo.layers.filter((capa) => capa.type !== 'symbol');
    // La ruta del sprite es relativa al estilo; se resuelve para que funcione desde el visor.
    if (typeof estilo.sprite === 'string') estilo.sprite = new URL(estilo.sprite, estiloVectorial).href;
    // El servicio entrega rutas de teselas relativas, que MapLibre no resuelve: se declaran completas.
    for (const fuente of Object.values(estilo.sources)) {
      if (fuente.type === 'vector' && fuente.url) {
        fuente.tiles = [`${fuente.url}/tile/{z}/{y}/{x}.pbf`];
        fuente.maxzoom = ZOOM_MAX_TESELAS;
        delete fuente.url;
      }
    }
    L.maplibreGL({
      style: estilo,
      attributionControl: false,
      // Necesario para que la imagen exportada incluya el mapa base.
      preserveDrawingBuffer: true,
    }).addTo(map);
  } catch (err) {
    if (!vigente()) return;
    console.warn(`[Visor DS 68] No se pudo cargar el mapa base vectorial (${String(err)}); se usa el raster.`);
    L.tileLayer(rasterRespaldo, {
      maxNativeZoom: 16,
      maxZoom: 20,
      crossOrigin: 'anonymous',
    }).addTo(map);
  }
}
