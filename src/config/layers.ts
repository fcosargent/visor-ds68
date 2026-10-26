// Configuración centralizada de capas: rutas, estilos y textos.
// Ningún componente debe repetir rutas ni estilos: todo se lee desde aquí.

export type LayerType = 'polygon' | 'line' | 'point' | 'label';
export type LayerCategory = 'predial' | 'referencia';
export type ConditionId = 'base' | 'vial' | 'metro';

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
}

export interface ConditionConfig extends LayerConfig {
  id: ConditionId;
  /** Texto corto del botón selector. */
  buttonLabel: string;
}

const DATA = `${import.meta.env.BASE_URL}data/`;

/** Informe generado por scripts/prepare_data.py; indica qué capas existen. */
export const DATA_REPORT_URL = `${DATA}data_report.json`;

const FUENTE_PREDIOS = 'predios_dic2025.shp (campos CUMPLE_1, 20M_CONDB, VIAL_DS68, METRO_600)';
const ESTACIONES_URL = `${DATA}estaciones_metro.geojson`;
const FUENTE_ESTACIONES = 'ESTACIONES_DE_METRO_COMUNA_STGO_2.shp (campo Name)';

/** Atributos prediales en los GeoJSON (nombres físicos del shapefile). */
export const PREDIO_FIELDS = {
  id: 'id_predio',
  cumple: 'CUMPLE_1',
  via20: '20M_CONDB',
  vial: 'VIAL_DS68',
  metro: 'METRO_600',
} as const;

export const CONDITIONS: ConditionConfig[] = [
  {
    id: 'base',
    buttonLabel: 'Condición base',
    label: 'Condición base: vía de 20 m',
    url: `${DATA}predios_condicion_base.geojson`,
    type: 'polygon',
    style: { color: '#2F6B3A', weight: 0.8, fillColor: '#A9D6A5', fillOpacity: 0.65 },
    visibleByDefault: true,
    category: 'predial',
    description:
      'Predios que cumplen la condición territorial, sin las exclusiones registradas, y que enfrentan una vía de 20 m o más entre líneas oficiales.',
    source: FUENTE_PREDIOS,
    order: 50,
  },
  {
    id: 'vial',
    buttonLabel: 'Condición vial',
    label: 'Condición vial: expresas y troncales',
    url: `${DATA}predios_condicion_vial.geojson`,
    type: 'polygon',
    style: { color: '#1F5FA8', weight: 0.8, fillColor: '#9DD1EE', fillOpacity: 0.65 },
    visibleByDefault: false,
    category: 'predial',
    description:
      'Predios que cumplen la condición base e intersectan la franja de 200 m de vías expresas existentes y/o la franja de 100 m de vías troncales existentes.',
    source: FUENTE_PREDIOS,
    order: 50,
  },
  {
    id: 'metro',
    buttonLabel: 'Condición Metro',
    label: 'Condición Metro: recorrido peatonal de 600 m',
    url: `${DATA}predios_condicion_metro.geojson`,
    type: 'polygon',
    style: { color: '#5E3488', weight: 0.8, fillColor: '#CDB8E8', fillOpacity: 0.65 },
    visibleByDefault: false,
    category: 'predial',
    description:
      'Predios que cumplen la condición base y se encuentran dentro del área de 600 m de recorrido peatonal respecto de una estación de Metro existente o proyectada habilitante.',
    source: FUENTE_PREDIOS,
    order: 50,
  },
];

const tooltipEstacion = (p: Record<string, unknown>) =>
  `${String(p.nombre ?? '')}${p.linea ? ` · ${String(p.linea)}` : ''}`;

export const REFERENCE_LAYERS: LayerConfig[] = [
  {
    id: 'limite_comunal',
    label: 'Límite comunal',
    url: `${DATA}limite_comunal.geojson`,
    type: 'polygon',
    style: { color: '#3D4248', weight: 2, dashArray: '6 4', fillOpacity: 0 },
    visibleByDefault: false,
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
    visibleByDefault: true,
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
    visibleByDefault: true,
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
    label: 'Zonas de incentivo',
    url: `${DATA}zonas_incentivo.geojson`,
    type: 'polygon',
    style: { color: '#B8930F', weight: 1.2, fillColor: '#F7DC6F', fillOpacity: 0.35 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Predios de las zonas y sectores especiales con incentivo.',
    source: 'zci_prcs_wgs84_predios_2.shp (o ZONAS_DE_INCENTIVO.shp, si existe)',
    order: 22,
    tooltip: (p) => `${String(p.ZONAS_VIGE ?? '')}${p.TIPO ? ` · ${String(p.TIPO)}` : ''}`,
  },
  {
    id: 'zch',
    label: 'Zonas de Conservación Histórica',
    url: `${DATA}zonas_conservacion_historica.geojson`,
    type: 'polygon',
    style: { color: '#7B3FA0', weight: 2, fillOpacity: 0 },
    visibleByDefault: false,
    category: 'referencia',
    description: 'Zonas de Conservación Histórica vigentes (marzo de 2025).',
    source: 'ZONAS_DE_CONSERVACION_HISTORICA_MARZO_2025.shp',
    order: 60,
  },
];

/** Nombre de archivo de una URL de capa (para cruzar con data_report.json). */
export const fileName = (url: string) => url.substring(url.lastIndexOf('/') + 1);
