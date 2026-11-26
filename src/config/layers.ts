// Configuración centralizada de capas: rutas, estilos y textos.
// Ningún componente debe repetir rutas ni estilos: todo se lee desde aquí.

export type LayerType = 'polygon' | 'line' | 'point' | 'label';
export type LayerCategory = 'predial' | 'referencia';

export interface LayerStyle {
  color: string;
  weight: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  dashArray?: string;
  /** Radio en píxeles, solo para puntos. */
  radius?: number;
}

export interface LayerConfig {
  id: string;
  label: string;
  url: string;
  type: LayerType;
  style: LayerStyle;
  visibleByDefault: boolean;
  category: LayerCategory;
  description: string;
  source: string;
  /** Filtro opcional por atributo (p. ej. estaciones existentes / proyectadas). */
  filter?: { property: string; value: string };
  /** Orden de dibujo: mayor = más arriba. */
  order: number;
  /** Zoom mínimo para mostrar la capa (solo etiquetas). */
  minZoom?: number;
  /** Atributos que se muestran como etiqueta flotante. */
  tooltip?: (props: Record<string, unknown>) => string;
  /** Ventana emergente con todos los campos, en el orden y con los alias indicados. */
  ficha?: FichaConfig;
  /** Grupo de capas al que pertenece (ver GRUPOS_CAPAS). */
  grupo?: string;
  /**
   * Capa externa que solo existe en el Visualizador 3D (no es un archivo de public/data):
   * edificios, árboles, etiquetas de lugares, áreas verdes o agua.
   */
  escena3d?: 'edificios' | 'arboles' | 'etiquetas' | 'verdes' | 'agua';
  /** Texto breve bajo el nombre de la capa en la leyenda. */
  notaLeyenda?: string;
}

export interface FichaConfig {
  titulo: string;
  campos: { campo: string; alias: string; enlace?: boolean }[];
}

/**
 * Grupos de capas de referencia: el grupo se enciende y apaga como un todo, y dentro
 * de él cada capa conserva su propio interruptor. Una capa del grupo se ve solo si el
 * grupo y la capa están encendidos.
 */
export interface GrupoCapas {
  id: string;
  label: string;
  description: string;
  visibleByDefault: boolean;
}

export const GRUPOS_CAPAS: GrupoCapas[] = [
  {
    id: 'incentivos',
    label: 'Incentivos normativos del Plan Regulador',
    description: 'Zonas con incentivo y zonas con incentivos cuestionados.',
    visibleByDefault: false,
  },
  {
    // Solo Visualizador 3D: en el 2D el grupo no aparece porque todas sus capas son de la escena.
    id: 'mapa_base_3d',
    label: 'Mapa base 3D (Esri)',
    description: 'Áreas verdes, agua, árboles y nombres de lugares del mapa base 3D de Esri.',
    visibleByDefault: true,
  },
];

/**
 * Elementos del mapa base 3D de Esri (solo Visualizador 3D). Son servicios públicos, sin API key.
 * Árboles y etiquetas son servicios que Esri describe como «para mapas base, no para uso
 * independiente»; áreas verdes y agua se toman del mapa base vectorial «OpenBasemap» (OSM).
 */
export const MAPA_BASE_3D = {
  arboles: 'https://basemaps3d.arcgis.com/arcgis/rest/services/Open3D_Trees_v1/SceneServer',
  etiquetas: 'https://basemaps3d.arcgis.com/arcgis/rest/services/Open3D_DarkLabels_v1/SceneServer',
  /** Se excluyen los nombres de comunas (TextType 7) y de ciudades (TextType 38). */
  filtroEtiquetas: 'TextType NOT IN (7, 38)',
  estiloVectorial: 'https://basemaps.arcgis.com/arcgis/rest/services/OpenBasemap_v2/VectorTileServer/resources/styles/root.json',
  /** Capas del estilo que forman cada capa (por su `id`); se conservan sus colores. */
  capasVerdes:
    /land use area\/(park|grass|garden|meadow|flowerbed|recreation ground|dog park|plant nursery|cemetery|allotments|village green)|land area\/grassland|pitch area\/grass|wetland/i,
  capasAgua: /^(water area|water line)\//i,
};

/** Alias de la ficha de las Zonas de Conservación Histórica (mismos campos en ambas capas). */
const CAMPOS_FICHA_ZCH: FichaConfig['campos'] = [
  { campo: 'ID_ZCH', alias: 'ID' },
  { campo: 'ZONA_ZCH', alias: 'Zona de Conservación Histórica (código)' },
  { campo: 'NOMBRE_ZCH', alias: 'Nombre Zona de Conservación Histórica' },
  { campo: 'FICHA_ZCH', alias: 'Ver ficha de la Zona de Conservación Histórica', enlace: true },
  { campo: 'FECHA', alias: 'Fecha de la cobertura' },
  { campo: 'FUENTE', alias: 'Fuente' },
];

const DATA = `${import.meta.env.BASE_URL}data/`;

/** Informe generado por scripts/prepare_data.py; indica qué capas existen. */
export const DATA_REPORT_URL = `${DATA}data_report.json`;

/** Predios con las 7 condiciones (un solo archivo; cada condición se filtra en el navegador). */
export const PREDIOS_URL = `${DATA}predios.geojson`;
/** Normas de edificación por zona, convertidas desde el Excel del Plan Regulador. */
export const NORMAS_URL = `${DATA}normas_zonas.json`;
/** Orden de dibujo de la condición activa (entre las capas de referencia). */
export const ORDEN_CONDICION = 50;

/**
 * Edificaciones 3D (solo Visualizador 3D). Se usa «Esri 3D Buildings», la capa de edificios de los
 * mapas base 3D de Esri: es la que muestra el Scene Viewer de ArcGIS junto a «OpenStreetMap 3D
 * Buildings» y la que trae las torres del centro (en Plaza de los Reyes, 45 edificios de más de 40 m
 * contra 5 en la capa OSM). Combina Esri Community Maps, OpenStreetMap, Microsoft y Google, así que
 * no se suma a la capa OSM (habría volúmenes duplicados). Es pública y no requiere API key, pero Esri
 * la describe como servicio de mapas base, no pensado para uso independiente: si dejara de estar
 * disponible, cambiar `url` e `itemId` por los de una de las `alternativas`.
 */
export const EDIFICIOS_3D = {
  itemId: '0009bcad0bc2406b99b8a01efc919fbc',
  url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer',
  alternativas: {
    /** Capa del enlace original (soporte maduro desde diciembre de 2024). */
    openStreetMap3D: {
      itemId: 'ca0470dbbddb4db28bad74ed39949e25',
      url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer',
    },
    open3D: {
      itemId: 'c444b24b184c4523a5dc96248bfea4e1',
      url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/Open3D_Buildings_v1/SceneServer',
    },
  },
  /**
   * El recorte comunal se amplía estos metros, para no perder los edificios que cruzan el límite por
   * diferencias de dibujo, sin traer los de la vereda de enfrente en otra comuna.
   */
  bufferRecorteMetros: 5,
  /** Campos de la ventana emergente, en orden, con alias legibles. */
  campos: [
    { campo: 'height', alias: 'Altura (m)' },
    { campo: 'building_levels', alias: 'Pisos informados por la fuente' },
    { campo: 'name', alias: 'Nombre' },
    { campo: 'building', alias: 'Tipo de edificación' },
    { campo: 'source', alias: 'Fuente del dato' },
    { campo: 'OSMID', alias: 'ID OpenStreetMap' },
  ],
  /**
   * Texto legible para cada valor del campo `source` (en la comuna aparecen estos cuatro). Un valor
   * que no esté aquí se muestra tal cual.
   */
  fuentes: {
    TomTom: 'TomTom (proveedor de cartografía)',
    'Google Open Buildings': 'Google Open Buildings (CC BY 4.0)',
    'Microsoft ML Buildings': 'Microsoft (huellas de edificios)',
    OpenStreetMap: 'OpenStreetMap (mapa colaborativo)',
  } as Record<string, string>,
  /**
   * Altura por defecto: los edificios sin altura informada se dibujan con 3 m (todos los de Google y
   * Microsoft, y muchos de OpenStreetMap). Con 3 m y sin pisos, la ventana dice que no está informada.
   */
  alturaPorDefecto: 3,
  textoAlturaNoInformada: 'No informada (se dibuja con 3 m)',
  nombreCapa: 'Esri 3D Buildings (mapa base 3D de Esri)',
  /** Atribución publicada por Esri en la ficha del ítem. */
  atribucion:
    'Fuentes de la capa según Esri: TomTom, Maxar, Esri Community Maps, © colaboradores de OpenStreetMap (ODbL), Microsoft y Google Open Buildings (CC BY 4.0).',
  /** Altura de piso de referencia para los «pisos aproximados» (definida por el Departamento). */
  alturaPiso: 3,
  nota:
    'Altura y número de pisos referenciales, calculados en el punto pinchado (pisos ≈ altura ÷ 3,0 m). ' +
    'Para medir una altura, usa la herramienta Distancia y mide la vertical. ' +
    'Cuando la fuente no informa la altura, el volumen usa un valor por defecto.',
  /** Nota cuando el objeto agrupa varios volúmenes de distinta altura. */
  notaConjunto:
    'Esta edificación agrupa varios volúmenes adosados: el resaltado marca el conjunto completo y el punto coral, el lugar medido.',
};

const ESTACIONES_URL = `${DATA}estaciones_metro.geojson`;
const FUENTE_ESTACIONES = 'ESTACIONES_DE_METRO_COMUNA_STGO_2.shp (campo Name)';

const tooltipEstacion = (p: Record<string, unknown>) =>
  `${String(p.nombre ?? '')}${p.linea ? ` · ${String(p.linea)}` : ''}`;

export const REFERENCE_LAYERS: LayerConfig[] = [
  {
    id: 'edificaciones_3d',
    label: 'Edificaciones 3D',
    url: EDIFICIOS_3D.url,
    type: 'polygon',
    // Solo para la muestra de la leyenda; en la escena se dibujan como volúmenes grises.
    style: { color: '#8f959b', weight: 0.75, fillColor: '#e4e6e9', fillOpacity: 1 },
    visibleByDefault: true,
    category: 'referencia',
    description: 'Volúmenes de edificios dentro del límite comunal (solo Visualizador 3D). Altura referencial.',
    source:
      'Esri, «Esri 3D Buildings» (Esri Community Maps, © colaboradores de OpenStreetMap, Microsoft y Google Open Buildings)',
    order: 110,
    escena3d: 'edificios',
    notaLeyenda: 'En color, los que tienen su centro en un predio de la condición',
  },
  // Mapa base 3D (grupo «mapa_base_3d»). Verdes y agua van bajo los predios de la condición.
  {
    id: 'mb3d_etiquetas',
    label: 'Nombres de lugares',
    url: MAPA_BASE_3D.etiquetas,
    type: 'label',
    style: { color: '#4a4f55', weight: 0 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Plazas, parques, edificios, ministerios y otros lugares (sin ciudades ni comunas).',
    source: 'Esri, «Open 3D Labels» (© colaboradores de OpenStreetMap)',
    order: 14,
    grupo: 'mapa_base_3d',
    escena3d: 'etiquetas',
  },
  {
    id: 'mb3d_arboles',
    label: 'Árboles 3D',
    url: MAPA_BASE_3D.arboles,
    type: 'point',
    style: { color: '#4f7d3a', weight: 1, fillColor: '#7fae5e', fillOpacity: 1, radius: 5 },
    visibleByDefault: true,
    category: 'referencia',
    description: 'Árboles en 3D según OpenStreetMap.',
    source: 'Esri, «Open 3D Trees» (© colaboradores de OpenStreetMap)',
    order: 13,
    grupo: 'mapa_base_3d',
    escena3d: 'arboles',
  },
  {
    id: 'mb3d_verdes',
    label: 'Áreas verdes',
    url: MAPA_BASE_3D.estiloVectorial,
    type: 'polygon',
    style: { color: '#9fd18b', weight: 0.5, fillColor: '#cdebb0', fillOpacity: 1 },
    visibleByDefault: true,
    category: 'referencia',
    description: 'Parques, plazas, pasto y jardines.',
    source: 'Esri, mapa base «OpenBasemap» (© colaboradores de OpenStreetMap)',
    order: 12,
    grupo: 'mapa_base_3d',
    escena3d: 'verdes',
  },
  {
    id: 'mb3d_agua',
    label: 'Agua',
    url: MAPA_BASE_3D.estiloVectorial,
    type: 'polygon',
    style: { color: '#8fbbd9', weight: 0.5, fillColor: '#aad3df', fillOpacity: 1 },
    visibleByDefault: true,
    category: 'referencia',
    description: 'Ríos, canales y piletas.',
    source: 'Esri, mapa base «OpenBasemap» (© colaboradores de OpenStreetMap)',
    order: 11,
    grupo: 'mapa_base_3d',
    escena3d: 'agua',
  },
  {
    id: 'manzanas',
    label: 'Manzanas',
    url: `${DATA}manzanas.geojson`,
    type: 'polygon',
    style: { color: '#4A4F55', weight: 1, fillOpacity: 0 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Manzanas de la comuna (1.441).',
    source: 'Manzanas.shp',
    order: 55,
  },
  {
    id: 'predios_comuna',
    label: 'Predios de la comuna',
    url: PREDIOS_URL,
    type: 'polygon',
    style: { color: '#1A1A1A', weight: 0.25, fillOpacity: 0 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Todos los predios de la comuna, solo contorno.',
    source: 'predios_zona_oct_2026.shp',
    order: 45,
  },
  {
    id: 'limite_comunal',
    label: 'Límite comunal',
    url: `${DATA}limite_comunal.geojson`,
    type: 'polygon',
    style: { color: '#3D4248', weight: 2, dashArray: '6 4', fillOpacity: 0 },
    visibleByDefault: true,
    category: 'referencia',
    description: 'Límite de la comuna de Santiago.',
    source: 'LIMITE_COMUNA.shp',
    order: 80,
  },
  {
    id: 'nombres_calles',
    label: 'Nombres de calles',
    url: `${DATA}etiquetas_ejes_viales.geojson`,
    type: 'label',
    style: { color: '#3A3F45', weight: 0 },
    visibleByDefault: true,
    category: 'referencia',
    description: 'Nombres de calles sobre los ejes viales (visibles desde zoom 16).',
    source: 'EJES_VIALES.shp (campo NOMBRE)',
    order: 100,
    minZoom: 16,
  },
  {
    id: 'metro_existente',
    label: 'Estaciones de Metro existentes',
    url: ESTACIONES_URL,
    type: 'point',
    style: { color: '#C62828', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1, radius: 5 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Estaciones de Metro en operación.',
    source: FUENTE_ESTACIONES,
    filter: { property: 'estado', value: 'existente' },
    order: 90,
    tooltip: tooltipEstacion,
  },
  {
    id: 'metro_proyectada',
    label: 'Estaciones de Metro proyectadas',
    url: ESTACIONES_URL,
    type: 'point',
    style: { color: '#B85C00', weight: 1.5, fillColor: '#F39C33', fillOpacity: 1, radius: 5 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Estaciones de Metro proyectadas.',
    source: FUENTE_ESTACIONES,
    filter: { property: 'estado', value: 'proyectada' },
    order: 91,
    tooltip: tooltipEstacion,
  },
  {
    id: 'vialidad_20m',
    label: 'Vías de 20 m o más',
    url: `${DATA}vialidad_20m.geojson`,
    type: 'line',
    style: { color: '#1B6F6A', weight: 2.5, opacity: 0.85 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Vialidad comunal de 20 m o más entre líneas oficiales.',
    source: 'vialidad_comunal_20metros.shp',
    order: 69,
    tooltip: (p) => `${String(p.NOM_SIU ?? 'Sin nombre')}${p.CLASIF_VIA ? ` · ${String(p.CLASIF_VIA)}` : ''}`,
  },
  {
    id: 'vias_expresas',
    label: 'Vías expresas',
    url: `${DATA}vias_expresas.geojson`,
    type: 'line',
    style: { color: '#E07B1A', weight: 3, opacity: 0.9 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Vías expresas oficiales.',
    source: 'Vias_Expresas_Oficiales.shp',
    order: 71,
  },
  {
    id: 'vias_troncales',
    label: 'Vías troncales',
    url: `${DATA}vias_troncales.geojson`,
    type: 'line',
    style: { color: '#3FA7D6', weight: 2, opacity: 0.9 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Vías troncales oficiales.',
    source: 'Vias_Troncales_Oficiales.shp',
    order: 70,
  },
  {
    id: 'franjas_viales',
    label: 'Franjas de vías expresas y troncales',
    url: `${DATA}franjas_viales_ds68.geojson`,
    type: 'polygon',
    style: { color: '#E58FB4', weight: 1, opacity: 0.7, fillColor: '#F4A6C6', fillOpacity: 0.3 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Franja de 200 m de vías expresas y de 100 m de vías troncales existentes.',
    source: 'Franjas_Viales_DS68_Troncal_Expresa.shp',
    order: 20,
  },
  {
    id: 'area_metro',
    label: 'Área peatonal de Metro de 600 m',
    url: `${DATA}influencia_metro_600m_consolidada.geojson`,
    type: 'polygon',
    style: { color: '#2BA88E', weight: 1, opacity: 0.7, fillColor: '#5FD3BC', fillOpacity: 0.25 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Área de 600 m de recorrido peatonal desde estaciones de Metro (cobertura consolidada).',
    source: 'AI_600m_Estaciones_DS68_Individual.shp',
    order: 21,
  },
  {
    id: 'zonas_incentivo',
    label: 'Zonas con incentivo',
    url: `${DATA}zonas_incentivo.geojson`,
    type: 'polygon',
    style: { color: '#B8930F', weight: 1.2, fillColor: '#F7DC6F', fillOpacity: 0.35 },
    // Dentro del grupo «incentivos»: parte encendida, pero se ve solo al encender el grupo.
    visibleByDefault: true,
    grupo: 'incentivos',
    category: 'referencia',
    description: 'Predios de las zonas y sectores especiales con incentivo.',
    source: 'zci_prcs_wgs84_predios_2.shp (o ZONAS_DE_INCENTIVO.shp, si existe)',
    order: 22,
    tooltip: (p) => `${String(p.ZONAS_VIGE ?? '')}${p.TIPO ? ` · ${String(p.TIPO)}` : ''}`,
  },
  {
    id: 'incentivos_cuestionados',
    label: 'Zonas con incentivos cuestionados',
    url: `${DATA}zonas_incentivos_cuestionados.geojson`,
    type: 'polygon',
    // Misma gama que «Zonas con incentivo», más oscura, para leerlas como relacionadas.
    style: { color: '#7D5C00', weight: 1.4, fillColor: '#D4A21C', fillOpacity: 0.45 },
    visibleByDefault: true,
    grupo: 'incentivos',
    category: 'referencia',
    description: 'Zonas con incentivos cuestionados. Clic en una para ver su ficha.',
    source: 'Zona_con_incentivos_cuestionados.shp',
    order: 21.5,
    ficha: { titulo: 'Zonas con incentivos cuestionados, comuna de Santiago.', campos: CAMPOS_FICHA_ZCH },
  },
  {
    id: 'zch',
    label: 'Zonas de Conservación Histórica',
    url: `${DATA}zonas_conservacion_historica.geojson`,
    type: 'polygon',
    style: { color: '#7B3FA0', weight: 2, fillOpacity: 0 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Zonas de Conservación Histórica vigentes (marzo de 2025). Clic en su borde para ver su ficha.',
    source: 'ZONAS_DE_CONSERVACION_HISTORICA_MARZO_2025.shp',
    order: 60,
    ficha: { titulo: 'Zonas de Conservación Histórica (ZCH), comuna de Santiago.', campos: CAMPOS_FICHA_ZCH },
  },
  {
    id: 'mh',
    label: 'Monumentos Históricos (MH)',
    url: `${DATA}monumentos_historicos.geojson`,
    type: 'polygon',
    style: { color: '#8E1B3A', weight: 2, fillColor: '#8E1B3A', fillOpacity: 0.08 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Monumentos Históricos de la comuna (marzo de 2025). Clic en uno para ver su ficha.',
    source: 'MONUMENTOS_HISTORICOS_MARZO_2025.shp',
    order: 62,
    ficha: {
      titulo: 'Monumentos Históricos (MH), comuna de Santiago.',
      campos: [
        { campo: 'DECRETO', alias: 'Decreto y fecha de publicación en el Diario Oficial' },
        { campo: 'DIRECCION', alias: 'Dirección' },
        { campo: 'FECHA', alias: 'Fecha de la cobertura' },
        { campo: 'FICHA_MH', alias: 'Ver ficha del Monumento Histórico', enlace: true },
        { campo: 'FUENTE', alias: 'Fuente' },
        { campo: 'ID', alias: 'ID' },
        { campo: 'N°_MH', alias: 'Número de Monumento Histórico (código)' },
        { campo: 'NOMBRE_MH', alias: 'Nombre Monumento Histórico' },
      ],
    },
  },
  {
    id: 'ich',
    label: 'Inmuebles de Conservación Histórica (ICH)',
    url: `${DATA}inmuebles_conservacion_historica.geojson`,
    type: 'polygon',
    style: { color: '#C98A00', weight: 1.2, fillColor: '#C98A00', fillOpacity: 0.06 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Inmuebles de Conservación Histórica de la comuna (marzo de 2025). Clic en uno para ver su ficha.',
    source: 'INMUEBLES_DE_CONSERVACION_HISTORICA_MARZO_2025.shp',
    order: 61,
    ficha: {
      titulo: 'Inmuebles de Conservación Histórica (ICH), comuna de Santiago.',
      campos: [
        { campo: 'DIRECCION', alias: 'Dirección' },
        { campo: 'FECHA', alias: 'Fecha de la cobertura' },
        { campo: 'FICHA_ICH', alias: 'Ver ficha del Inmueble de Conservación Histórica', enlace: true },
        { campo: 'FUENTE', alias: 'Fuente' },
        { campo: 'ID', alias: 'ID' },
        { campo: 'N°_ICH', alias: 'Número de Inmueble de Conservación Histórica (código)' },
        { campo: 'NOMBRE_ICH', alias: 'Nombre Inmueble de Conservación Histórica' },
      ],
    },
  },
];

/** Nombre de archivo de una URL de capa (para cruzar con data_report.json). */
export const fileName = (url: string) => url.substring(url.lastIndexOf('/') + 1);
