// Exporta la vista del mapa (con título, cifras, leyenda, escala, norte, fecha y fuente) como JPG.

import { toJpeg } from 'html-to-image';

/** Elementos con esta clase no se incluyen en la imagen (controles de zoom, carga, etc.). */
export const NO_EXPORTAR = 'no-export';

export async function descargarJpg(nodo: HTMLElement, nombreArchivo: string): Promise<void> {
  nodo.classList.add('is-exporting');
  try {
    const url = await toJpeg(nodo, {
      quality: 0.92,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: false,
      filter: (n) =>
        !(n instanceof HTMLElement && (n.classList.contains(NO_EXPORTAR) || n.classList.contains('leaflet-control-zoom'))),
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
  } finally {
    nodo.classList.remove('is-exporting');
  }
}
