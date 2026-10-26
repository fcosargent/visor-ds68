// Metadatos generales del visor. Las fechas y textos institucionales se editan solo aquí.

export const METADATA = {
  titulo: 'Condiciones territoriales DS 68',
  subtitulo: 'Comuna de Santiago',
  /** Fecha de la cartografía procesada (coberturas DS 68). */
  fechaCartografia: '26 de octubre de 2026',
  /** Base predial utilizada. */
  basePredial: 'Predios, diciembre de 2025',
  fuente:
    'Elaboración propia, Subdirección de Asesoría Urbana – SECPLAN, Ilustre Municipalidad de Santiago. ' +
    'Criterios normativos basados en el Decreto Supremo N.° 68 del Ministerio de Vivienda y Urbanismo, ' +
    'publicado en el Diario Oficial el 2 de octubre de 2026.',
  avisoReferencial:
    'Resultado cartográfico referencial. La aplicación normativa debe verificarse con los antecedentes específicos del proyecto.',
  mapaBase: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    /** Nombres de calles, dibujados sobre las coberturas. */
    urlEtiquetas:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Mapa base &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap',
    /** Zoom máximo con teselas propias; más allá se amplían las del nivel 16. */
    zoomNativoMax: 16,
    /**
     * Las etiquetas de Esri se ocultan desde el zoom 16, donde las reemplazan
     * los nombres de calles de EJES_VIALES (capa «Nombres de calles»).
     */
    zoomMaxEtiquetas: 15,
  },
  /** Vista inicial mientras se carga la primera cobertura (centro de la comuna). */
  vistaInicial: { centro: [-33.4569, -70.6483] as [number, number], zoom: 14 },
} as const;
