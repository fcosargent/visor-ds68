// Visualizador 2D o 3D: se elige en la barra superior y se puede abrir por enlace
// directo con «?vista=3d» (o «#3d»).

export type Vista = '2d' | '3d';

/** Centro (latitud, longitud) y zoom aproximado; se comparte al cambiar de vista. */
export interface Encuadre {
  centro: [number, number];
  zoom: number;
}

export function leerVista(): Vista {
  const params = new URLSearchParams(window.location.search);
  const v = (params.get('vista') ?? window.location.hash.replace('#', '')).toLowerCase();
  return v === '3d' ? '3d' : '2d';
}

/** Deja la vista en la dirección (sin recargar), para que el enlace copiado abra la misma vista. */
export function escribirVista(vista: Vista): void {
  const url = new URL(window.location.href);
  if (vista === '3d') url.searchParams.set('vista', '3d');
  else url.searchParams.delete('vista');
  if (/^#(2d|3d)$/i.test(url.hash)) url.hash = '';
  window.history.replaceState(null, '', url);
}
