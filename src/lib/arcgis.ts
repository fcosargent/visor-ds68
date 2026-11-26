// Carga del ArcGIS Maps SDK for JavaScript desde su CDN, solo al entrar al Visualizador 3D.
// El Visualizador 2D no descarga nada de esto. No se usa API key: la escena usa solo
// servicios públicos de Esri (edificios, terreno y mapa base).

export const VERSION_ARCGIS = '4.34';
const BASE = `https://js.arcgis.com/${VERSION_ARCGIS}/`;

// El SDK se usa sin tipos de TypeScript (se carga por CDN, no desde npm).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Esri = any;

let carga: Promise<void> | null = null;

function cargarSdk(): Promise<void> {
  carga ??= new Promise<void>((resolver, rechazar) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${BASE}esri/themes/light/main.css`;
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = BASE;
    script.onload = () => resolver();
    script.onerror = () => {
      carga = null;
      script.remove();
      rechazar(new Error(`No se pudo cargar ArcGIS Maps SDK desde ${BASE}`));
    };
    document.head.appendChild(script);
  });
  return carga;
}

/**
 * Importa módulos del SDK por su ruta corta (por ejemplo «views/SceneView»).
 * Usa `$arcgis.import` si existe; si no, el cargador AMD (`require`) del CDN.
 */
export async function importar(rutas: string[]): Promise<Esri[]> {
  await cargarSdk();
  const w = window as unknown as Esri;
  if (w.$arcgis?.import) {
    const mods = await w.$arcgis.import(rutas.map((r) => `@arcgis/core/${r}.js`));
    return (Array.isArray(mods) ? mods : [mods]).map((m: Esri) => m?.default ?? m);
  }
  return new Promise((resolver, rechazar) =>
    w.require(
      rutas.map((r) => `esri/${r}`),
      (...mods: Esri[]) => resolver(mods),
      rechazar,
    ),
  );
}
