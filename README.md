# Condiciones territoriales DS 68 — Comuna de Santiago

Visor cartográfico minimalista de las condiciones territoriales asociadas a la modificación de la OGUC introducida por el Decreto Supremo N.° 68 del MINVU (Diario Oficial, 2 de octubre de 2026).

Usa la cobertura `predios_dic2025.shp` como base predial y muestra una de tres condiciones a la vez:

| Vista | Filtro | GeoJSON | Predios |
|---|---|---|---|
| Condición base: vía de 20 m | `CUMPLE_1 = SI` y `20M_CONDB = SI` | `predios_condicion_base.geojson` | 7.173 |
| Condición vial: expresas y troncales | base y `VIAL_DS68 = SI` | `predios_condicion_vial.geojson` | 5.952 |
| Condición Metro: recorrido peatonal de 600 m | base y `METRO_600 = SI` | `predios_condicion_metro.geojson` | 3.560 |

Los filtros ignoran mayúsculas y minúsculas y limpian espacios al inicio y al final. Un valor nulo nunca cuenta como `SI`. Las cifras corresponden al preprocesamiento del 26 de octubre de 2026.

## Ejecución

```
python -m pip install -r requirements.txt
python scripts/prepare_data.py
npm install
npm run dev
```

- `npm run build` genera la versión publicable en `dist/`. La base es relativa, así que `dist/` funciona en cualquier subruta.
- `prepare_data.py` lee por defecto la carpeta hermana `../3. Coberturas DS68`. Para usar otra carpeta: `python scripts/prepare_data.py --origen "D:\otra\carpeta"`.

**Nota para este equipo:** Python y Node.js no están en el PATH del sistema. Se pueden usar los del proyecto del Censo 2024:

- Python con GeoPandas: `...\193. Datos territoriales censo 2024 IA\app_censo_santiago\.venv\Scripts\python.exe scripts\prepare_data.py`
- Node.js portable: `...\193. Datos territoriales censo 2024 IA\app_censo_santiago\.herramientas\node-v22.11.0-win-x64\`. Agréguelo al PATH de la sesión antes de `npm install`.

## Publicación

- **Sitio público:** https://fcosargent.github.io/visor-ds68/
- **Repositorio:** https://github.com/fcosargent/visor-ds68

Cada cambio que se sube a la rama `main` se compila y se publica solo, mediante el flujo `.github/workflows/deploy.yml`. Tarda uno o dos minutos, y después basta con refrescar el navegador.

Para actualizar:

1. Si cambiaron los shapefiles, ejecutar `python scripts/prepare_data.py`.
2. Comprobar que compila con `npm run build`.
3. Subir los cambios con `git add -A`, `git commit -m "..."` y `git push`.

Notas:
- Git y GitHub CLI se instalaron con winget. En una terminal abierta antes de esa instalación puede hacer falta usar las rutas completas: `C:\Program Files\Git\cmd\git.exe` y `C:\Program Files\GitHub CLI\gh.exe`.
- El sitio es público. `index.html` pide a los buscadores que no lo indexen (`noindex`), pero cualquiera que tenga el link puede verlo.

## Campos utilizados (nombres físicos verificados)

Los alias de ArcMap (`CUMPLE 1`, `20M CONDB`, `VIAL DS68`, `METRO 600`) corresponden a estos nombres físicos en el `.dbf`:

| Cobertura | Campo físico | Uso | Valores encontrados |
|---|---|---|---|
| `predios_dic2025.shp` | `COD_CAT` | Identificador predial (se publica como `id_predio`, texto entero) | 28.860 registros, 36 códigos repetidos |
| `predios_dic2025.shp` | `CUMPLE_1` | Condición territorial sin exclusiones | SI 22.936 · NO 5.916 · DOBLE ZONA 8 |
| `predios_dic2025.shp` | `20M_CONDB` | Frente a vía de 20 m o más | SI 7.178 · NO 21.682 |
| `predios_dic2025.shp` | `VIAL_DS68` | Franja de vías expresas y troncales | SI 5.957 · NO 22.903 |
| `predios_dic2025.shp` | `METRO_600` | Área peatonal de 600 m de Metro | SI 3.564 · NO 25.296 |
| `ESTACIONES_DE_METRO_COMUNA_STGO_2.shp` | `Name` | Estado de la estación | `EXSTENTE` (sic) 39 · `PROYECTADA` 3 |
| `ESTACIONES_DE_METRO_COMUNA_STGO_2.shp` | `ESTACION`, `LINEA` | Etiqueta flotante | — |
| `Vias_Expresas_Oficiales.shp` / `Vias_Troncales_Oficiales.shp` | `NOM_SIU` | Nombre de la vía (se conserva en el GeoJSON) | — |
| `ZONAS_DE_CONSERVACION_HISTORICA_MARZO_2025.shp` | `ZONA_ZCH`, `NOMBRE_ZCH` | Se conservan en el GeoJSON | 21 polígonos |
| `vialidad_comunal_20metros.shp` | `NOM_SIU`, `CLASIF_VIA` | Etiqueta flotante del tramo | 1.168 tramos, todos con `MAYOR_20_C = SI` |
| `EJES_VIALES.shp` | `NOMBRE` | Nombres de calles (solo etiquetas) | 4.476 tramos, 634 nombres, 320 tramos sin nombre |
| `LIMITE_COMUNA.shp` | `NOM_COM` | Se conserva (se excluyen los datos del Censo 2017 que trae la capa) | 1 polígono |
| `zci_prcs_wgs84_predios_2.shp` | `ZONAS_VIGE`, `TIPO` | Etiqueta flotante de la zona de incentivo | 20 polígonos: Sector Especial 18 · Zona 2 |

Los nombres de campo están declarados como constantes al inicio de `scripts/prepare_data.py`. Si una versión nueva de la cobertura los cambia, el script se detiene, lista los campos encontrados e indica qué constante corregir. Tampoco genera vistas vacías en silencio.

Del GeoJSON predial se excluyen `FECHA`, `REV`, `Shape_Leng`, `Shape_Area`, `ID` (vale 1 en todos los registros), `ORIG_FID` y los códigos de sector. Los shapefiles originales no se modifican.

## Datos generados (`public/data/`)

| Archivo | Fuente | Tratamiento |
|---|---|---|
| `predios_condicion_*.geojson` (3) | `predios_dic2025.shp` | Filtrado. Sin simplificar. Coordenadas con 7 decimales (≈1 cm). |
| `estaciones_metro.geojson` | `ESTACIONES_DE_METRO_COMUNA_STGO_2.shp` | Z eliminada. Atributo `estado`: `existente` o `proyectada`. |
| `vias_expresas.geojson`, `vias_troncales.geojson` | Vías oficiales | Simplificación de 1 m |
| `franjas_viales_ds68.geojson` | `Franjas_Viales_DS68_Troncal_Expresa.shp` | Simplificación de 1 m |
| `influencia_metro_600m_individual.geojson` / `_consolidada.geojson` | `AI_600m_Estaciones_DS68_Individual.shp` | Geometría reparada. Versión disuelta. Simplificación de 1 m. |
| `zonas_conservacion_historica.geojson` | ZCH marzo 2025 | Simplificación de 1 m |
| `limite_comunal.geojson` | `LIMITE_COMUNA.shp` | Simplificación de 1 m |
| `etiquetas_ejes_viales.geojson` | `EJES_VIALES.shp` | Puntos de etiqueta, no líneas (ver abajo) |
| `vialidad_20m.geojson` | `vialidad_comunal_20metros.shp` | Simplificación de 1 m |
| `zonas_incentivo.geojson` | `ZONAS_DE_INCENTIVO.shp` si existe; si no, `zci_prcs_wgs84_predios_2.shp` | Sin simplificar, porque sus límites siguen los predios |
| `data_report.json` | — | Registros, CRS, geometrías inválidas, campos, valores, archivos generados y huellas SHA-256 de las fuentes. |

Todas las capas se reproyectan de EPSG:32719 a EPSG:4326.

## Efectos normativos potenciales

Al hacer clic en una de las tres condiciones, o en «Ver efectos normativos» dentro del popup de un predio, se abre una tarjeta bajo el selector. Solo puede haber una tarjeta abierta a la vez.

- **Bloques visibles:** condición territorial, beneficios potenciales y un recuadro de advertencia.
- **«Ver fundamento»:** despliega los requisitos adicionales, las referencias normativas y la sección «Incremento potencial de altura».
- **Condición base:** no muestra beneficios propios. Indica expresamente que no acredita incrementos de constructibilidad o altura, el coeficiente de 1,4 ni la rebaja de estacionamientos.
- **Condiciones vial y Metro:** muestran densidad (artículo 2.1.22), estacionamientos (artículo 2.4.1) y constructibilidad (artículos 2.6.5 y 2.6.7) como beneficios potenciales. Ninguna condición atribuye el incremento de altura del artículo 2.6.9.
- **Tarjeta de un predio:** la condición se evalúa con los campos reales del predio (`CUMPLE_1`, `20M_CONDB`, `VIAL_DS68`, `METRO_600`). Solo cuenta `SI`, sin distinguir mayúsculas ni espacios, y un valor nulo nunca cumple.
- **Zona de Conservación Histórica:** si el predio intersecta una zona, se agrega al final la consideración del artículo 2.6.19. La intersección se calcula en el navegador contra `zonas_conservacion_historica.geojson`. Los predios que solo tocan el borde de una zona pueden quedar fuera: con el corte de octubre de 2026 son 2.209 predios de la condición base en el navegador, frente a 2.200 con superposición real y 2.221 contando los que tocan el borde, según GeoPandas.

Archivos:
- Textos: `src/config/normativeBenefits.ts`. Se verificaron contra el texto del DS N.° 68 publicado en el Diario Oficial el 2 de octubre de 2026.
- Tarjeta: `src/components/NormativeBenefitsCard.tsx`.
- Evaluación de campos: `src/lib/conditions.ts`.
- Intersección geométrica: `src/lib/geometry.ts`.

El panel «Referencia normativa» del encabezado usa los mismos textos de `normativeBenefits.ts` en versión completa, sin contraer. Para cambiar un texto normativo basta con editar ese archivo.

## Nombres de calles

La capa «Nombres de calles» muestra solo el texto del nombre sobre cada eje, sin dibujar la línea. Está encendida al inicio y se ve desde el zoom 16.

- `prepare_data.py` une los tramos con el mismo `NOMBRE` y ubica un punto de etiqueta cada 300 m de calle continua (`ESPACIADO_ETIQUETAS`). Rotula solo los tramos continuos de 40 m o más (`LARGO_MIN_ETIQUETA`). Cada punto guarda el ángulo del eje, para que el texto quede girado y nunca invertido. El resultado son 1.568 puntos.
- En el mapa (`src/lib/streetLabels.ts`) solo se crean las etiquetas del área visible. Si dos etiquetas se superponen, se oculta la de la calle continua más corta.
- Desde el zoom 16 se quitan las etiquetas del mapa base de Esri, para que no se dupliquen los nombres (`zoomMaxEtiquetas` en `metadata.ts`).
- El mapa base de Esri solo tiene teselas hasta el zoom 16. Más cerca se amplían, y algunos rótulos grabados en la base (p. ej. «AGUSTINAS») se ven grandes y difusos.

## Capas faltantes

- Hoy están todas las coberturas. Las zonas de incentivo salen de `zci_prcs_wgs84_predios_2.shp`. Si más adelante se agrega `ZONAS_DE_INCENTIVO.shp`, tendrá prioridad.
- La aplicación lee `data_report.json` para saber qué capas existen. Si falta un GeoJSON, oculta el interruptor correspondiente y registra una advertencia en la consola del navegador. Lo mismo ocurre si una capa no carga.

## Observaciones sobre los datos

- **Geometrías inválidas:** había 1 predio y el polígono de `AI_600m_Estaciones_DS68_Individual` inválidos. Se repararon con `make_valid` y no quedan inválidas.
- **Área peatonal de Metro:** pese a su nombre, `AI_600m_Estaciones_DS68_Individual.shp` contiene un solo polígono (`Name = "EXSTENTE : 0 - 600"`). Por eso las versiones individual y consolidada son iguales. El visor muestra la consolidada.
- **Estaciones:** el `.prj` usa una definición ESRI sin código EPSG explícito. Equivale a WGS 84 / UTM 19S (EPSG:32719). Los puntos traen coordenada Z, que se elimina.
- **Zonas de incentivo:** pese a «wgs84» en el nombre, `zci_prcs_wgs84_predios_2.shp` está en EPSG:32719. Los campos `ETAPA`, `ANALISIS`, `ZONAS_ANT` y `PERIODO` no se publican, porque su significado no está documentado.
- **`CUMPLE_1 = DOBLE ZONA`** (8 predios) no se considera `SI`, así que esos predios quedan fuera de las tres vistas.
- **`COD_CAT`** tiene 36 valores repetidos en la cobertura completa. Puede tratarse de predios con más de un polígono.
- **Codificación:** todos los archivos están en UTF-8 (`.cpg`) y no se detectaron caracteres dañados. Algunos nombres de vías vienen sin «Ñ» en la fuente (p. ej. `VICUNA MACKENNA`), y el estado de estación está escrito `EXSTENTE`.
- **Fuentes intactas:** el script calcula la huella SHA-256 de cada componente antes y después del proceso. El resultado queda en `data_report.json` (`fuentes_intactas: true`).

## Estructura

```
scripts/prepare_data.py      Preprocesamiento (GeoPandas)
src/config/layers.ts         Rutas, estilos y textos de todas las capas
src/config/metadata.ts       Título, fuente, fecha cartográfica y mapa base
src/components/MapView.tsx   Mapa Leaflet (un solo lienzo canvas)
src/components/LayerPanel.tsx, Legend.tsx, NormativePanel.tsx, SourcesPanel.tsx, Dialog.tsx, Swatch.tsx
src/lib/data.ts              Carga bajo demanda con caché
```

Mapa base: Esri World Light Gray (base y etiquetas), sin clave de API.

## Mejoras futuras

- El GeoJSON más pesado (condición base) pesa unos 3,6 MB. Si la base predial crece o se agregan atributos, conviene pasar a PMTiles o teselas vectoriales.
