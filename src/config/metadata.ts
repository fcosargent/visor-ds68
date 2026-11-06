// Metadatos generales del visor. Las fechas y textos institucionales se editan solo aquí.

export const METADATA = {
  titulo: 'Condiciones territoriales DS 68',
  subtitulo: 'Comuna de Santiago',
  /** Fecha de la cartografía procesada (coberturas DS 68). */
  fechaCartografia: '6 de noviembre de 2026',
  /** Base predial utilizada. */
  basePredial: 'Predios por zona del Plan Regulador, octubre de 2026',
  /** Fuente breve que se imprime en la imagen exportada. */
  fuenteImagen: 'Municipalidad de Santiago – DS 68/2026',
  fuente:
    'Elaboración propia, Subdirección de Asesoría Urbana – SECPLAN, Ilustre Municipalidad de Santiago. ' +
    'Criterios normativos basados en el Decreto Supremo N.° 68 del Ministerio de Vivienda y Urbanismo, ' +
    'publicado en el Diario Oficial el 2 de octubre de 2026.',
  avisoReferencial:
    'Resultado cartográfico referencial. La aplicación normativa debe verificarse con los antecedentes específicos del proyecto.',
  mapaBase: {
    /** Estilo vectorial Esri «Light Gray Canvas Base»; se le quitan todos los textos. */
    estiloVectorial:
      'https://www.arcgis.com/sharing/rest/content/items/291da5eab3a0412593b66d384379f89f/resources/styles/root.json',
    /** Respaldo raster si el estilo vectorial no carga. */
    rasterRespaldo:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Mapa base &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap',
  },
  /** Vista inicial mientras se carga la primera cobertura (centro de la comuna). */
  vistaInicial: { centro: [-33.4569, -70.6483] as [number, number], zoom: 14 },
} as const;
