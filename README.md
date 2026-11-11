# Condiciones territoriales DS 68 — Comuna de Santiago

Visor cartográfico de los escenarios que genera el Decreto Supremo N.° 68 del MINVU (modificación de la OGUC, Diario Oficial del 2 de octubre de 2026) en la comuna de Santiago. Está pensado para explicarse en lenguaje común.

- **Sitio público:** https://fcosargent.github.io/visor-ds68/
- **Repositorio:** https://github.com/fcosargent/visor-ds68

## Qué muestra

Siete condiciones, organizadas en dos grupos. Se ve una condición a la vez.

| Grupo | Plano | Campo | Nombre visible | Predios | Manzanas | % |
|---|---|---|---|---|---|---|
| Conjunto Armónico | 1 | `P1_CA_BASE` | Situación base (art. 2.6.4) | 7.866 | 880 | 61,1 % |
| Conjunto Armónico | 2 | `P2_CON50` | Más superficie construida: +50% (art. 2.6.7) | 7.866 | 880 | 61,1 % |
| Conjunto Armónico | 2 | `P2_CON75` | Más superficie construida: +75% (art. 2.6.7) | 7.073 | 819 | 56,8 % |
| Conjunto Armónico | 3 | `P3_ALT25` | Más altura: +25% (art. 2.6.9) | 7.866 | 880 | 61,1 % |
| Conjunto Armónico | 3 | `P3_ALT50` | Más altura: +50% (art. 2.6.9) | 5.010 | 703 | 48,8 % |
| Densidad | 4 | `P4_DEN28` | Densidad: factor 2,8 | 13.680 | 615 | 42,7 % |
| Densidad | 4 | `P4_DEN14` | Densidad: factor 1,4 | 10.743 | 547 | 38,0 % |

- **Cifras:** corresponden a `predios_zona_oct_2026_norma` (noviembre de 2026), sobre un total de 1.441 manzanas. Las manzanas se comprobaron contra la tabla oficial y coinciden exactamente.
- **Recuadro de resumen:** está arriba a la izquierda del mapa y muestra el título, el porcentaje, las manzanas y la explicación de la condición activa.
- **Leyenda:** está abajo a la izquierda e incluye solo las capas encendidas, en el mismo orden del panel de capas. En densidad muestra los valores presentes de la densidad máxima (hab/há), de menor a mayor.
- **Simbología de predios:**
  - Conjunto Armónico va en `#FF7F7F`.
  - Densidad se colorea por valor único de `DENSIDAD`, con una rampa azul de alto contraste. El valor 0 o vacío iría en gris, con la etiqueta «Sin densidad máxima definida», pero ningún predio de P4 lo tiene.
  - Todas las condiciones tienen contorno gris de 0,4 px.
- **Mover y cambiar el tamaño:** el resumen y la leyenda se arrastran a cualquier parte del mapa y se agrandan o achican desde su esquina inferior derecha (todo el contenido escala junto). Doble clic los devuelve a su posición y tamaño iniciales. La imagen exportada los incluye tal como están.
- **Capas de referencia:**
  - Al abrir, solo están encendidos el límite comunal y los nombres de calles.
  - Los botones ▲ ▼ suben o bajan cada capa; las de más arriba se dibujan encima. Los predios de la condición seleccionada también se pueden mover. Los nombres de calles siempre quedan sobre todo lo demás.
- **Monumentos Históricos (MH) e Inmuebles de Conservación Histórica (ICH):**
  - MH tiene contorno bordó y la ICH, contorno ámbar.
  - Al hacer clic en uno se abre su ficha con todos los campos y el enlace «Más información».
  - Cuando están encendidas y sobre los predios, un clic dentro de un MH o ICH abre su ficha. Para ver el predio que hay debajo, basta con apagar la capa o bajarla en el orden.
- **Popup del predio:** muestra el código catastral, la zona (`ZONA_TAB` y su nombre), qué permite la condición, las normas de la zona y un ejercicio referencial.
- **«Descargar imagen (JPG)»:** exporta la vista actual con título, cifras, leyenda, escala, norte, fecha y fuente. El archivo se llama `DS68_<campo>.jpg`.
- **Mapa base sin textos:** se usa la versión vectorial de Esri «Light Gray Canvas Base», dibujada con MapLibre, sin ninguna etiqueta (ni comunas, ni calles, ni parques). Los nombres de calles los entrega solo la capa oficial «Nombres de calles». Si el mapa vectorial no carga, se usa el mapa raster equivalente, que trae algunos nombres grabados desde el zoom 15 (`src/lib/basemap.ts`).

## Cómo editar textos y parámetros

### `src/config/condiciones.json`
Contiene todo lo que se ve en el panel y en el recuadro del mapa:

- Por grupo:
  - `titulo` e `introduccion`;
  - `recuadro` (colores del panel);
  - `simbologia`: relleno, contorno, grosor y, en Densidad, la `clasificacion` por valor con la rampa de colores y la unidad.
- Por condición:
  - `nombre`;
  - `variante` (texto del botón);
  - `texto` (explicación completa);
  - `resumen` (frase corta del popup);
  - `manzanas` y `porcentaje` (se muestran tal cual);
  - `ejercicio`: `multiplicador` 1,50 / 1,75 / 1,25 / 1,50 o `factor` 2,8 / 1,4.
- Generales:
  - `ejercicio.metrosPorPiso` (2,5 m) y la nota al pie;
  - `ejercicio.densidad`: factor anterior al DS 68 (4), incremento de superficie bruta (30 %) y el rótulo del bloque;
  - `textos`: «No aplica», el aviso de valor no numérico y otros mensajes.

Tras editar, subir el cambio a GitHub. El sitio se recompila solo.

### Fichas de MH e ICH
El título y los alias de cada campo, en su orden, están en `src/config/layers.ts` (propiedad `ficha` de las capas `mh` e `ich`).

### `public/data/normas_zonas.json`
Se genera desde el Excel `Normas edificacion PRCS 2018 ... .xlsx`, hoja `Zonas`. La zona D11 se toma de la hoja «Zona D», porque no está en `Zonas`. El visor lo usa solo para los valores **con incentivo** (altura, constructibilidad y densidad). Los valores base y los cálculos vienen de cada predio.

- **Clave:** la zona normalizada, por ejemplo `B15A`, `A5R` o `BORIENTE`.
- **Cada norma guarda:**
  - `texto`: el valor original del Excel;
  - `valor`: el primer número, solo si el texto empieza con un número.

### Zona del predio
- **Código:** se toma de `ZONA_TAB`, que ya viene cruzado con la tabla de normas. Debajo se muestra el nombre (`NOM_TABLA`) con la sigla desarrollada: «SE» es Sector Especial y «ZCH» es Zona de Conservación Histórica (`SIGLAS_ZONA` en `prepare_data.py`).
- **Sin zona:** 4.070 predios no tienen `ZONA_TAB`; ninguno participa de las condiciones.

## Ejercicio referencial (popup)

Usa los valores oficiales de cada predio (`COEF_CVIV`, `ALT_MAX_M`, `DENSIDAD`).

- **Constructibilidad (plano 2):** superficie × coeficiente (vivienda), y luego × 1,50 o × 1,75.
- **Altura (plano 3):** altura máxima × 1,25 o × 1,50. La diferencia se expresa en metros y en pisos aproximados (2,5 m por piso). En las zonas «Colindante ICH…» se usa la altura de referencia que trae el shapefile.
- **Densidad (plano 4), antes contra después del DS 68:**
  - Superficie bruta = superficie del predio × 1,30, expresada en hectáreas.
  - Viviendas antes = densidad (hab/há) × superficie bruta ÷ 4.
  - Viviendas con el DS 68 = densidad × superficie bruta ÷ 2,8 (o ÷ 1,4).
  - Las viviendas se redondean hacia abajo. El porcentaje de variación es el de la norma: +42,9 % con 2,8 y +185,7 % con 1,4.
  - Si la densidad es 0 o no existe, se muestra «No aplica».
- **Base del cálculo:** los porcentajes se aplican sobre la norma base. Los valores con incentivo se muestran solo como referencia.

## Datos (`public/data/`)

| Archivo | Fuente | Peso |
|---|---|---|
| `predios.geojson` | `predios_zona_oct_2026_norma.shp` (32.554 polígonos, 6 decimales, sin simplificar) | 14,9 MB (comprimido al descargarlo) |
| `manzanas.geojson` | `Manzanas.shp` (1.441) | 2,4 MB |
| `monumentos_historicos.geojson` | `MONUMENTOS_HISTORICOS_MARZO_2025.shp` (115) | 0,2 MB |
| `inmuebles_conservacion_historica.geojson` | `INMUEBLES_DE_CONSERVACION_HISTORICA_MARZO_2025.shp` (1.498) | 1,3 MB |
| `normas_zonas.json` | Excel de normas (97 zonas) | 45 KB |
| Capas auxiliares | Estaciones, vías, franjas, área Metro, ZCH, límite comunal, vías de 20 m, zonas de incentivo, nombres de calles | < 0,6 MB c/u |

Cada predio guarda solo lo que usa la app:

- `c`: código catastral (`COD_CAT`).
- `z` y `n`: zona (`ZONA_TAB`) y su nombre.
- `k`: columnas del Excel asociadas.
- `s`: superficie en m² (`SUP_HA` × 10.000).
- `cvt`/`cv`: coeficiente de constructibilidad (texto y número).
- `alt`/`al`: altura máxima (texto y número).
- `d`: densidad máxima.
- `cond`: condiciones que cumple.

No se suben al repositorio los shapefiles, el Word ni el Excel: solo los archivos procesados.

## Ejecución

```
python -m pip install -r requirements.txt
python scripts/prepare_data.py
npm install
npm run dev
```

- **Carpetas de origen:** `prepare_data.py` lee `../6. shp pre reg por zona/3. Coberturas DS68`. Si falta un archivo, lo busca en `../3. Coberturas DS68`. El Excel de normas se busca junto a la carpeta de origen. Para usar otras rutas existen las opciones `--origen`, `--respaldo` y `--excel`.
- **Compilación:** `npm run build` genera `dist/`.
- **Python y Node en este equipo:** no están en el PATH del sistema. Se usan los del proyecto del Censo 2024: `app_censo_santiago\.venv\Scripts\python.exe` y el Node portable en `app_censo_santiago\.herramientas\node-v22.11.0-win-x64\`.
- **Caché de Vite:** si el servidor de desarrollo falla con «EPERM … node_modules\.vite», basta con borrar esa carpeta y reiniciarlo.
- **Pruebas:** en desarrollo, el mapa queda disponible en la consola del navegador como `window.__mapa`. No se incluye en la publicación.

## Publicación

Cada cambio en la rama `main` se compila y se publica solo, mediante el flujo `.github/workflows/deploy.yml`. Tarda uno o dos minutos; después se refresca el navegador (Ctrl+F5).

1. Si cambiaron las coberturas o el Excel, ejecutar `python scripts/prepare_data.py`.
2. Comprobar con `npm run build`.
3. Subir con `git add -A`, `git commit -m "..."` y `git push`.

**Si GitHub Pages falla:** a veces responde «Deployment failed, try again later». Basta con volver a ejecutar el despliegue fallido (`gh run rerun <id> --failed`) unos minutos después.

**Respaldos:** las versiones publicadas anteriores quedaron en las etiquetas `v1-antes-actualizacion` (antes de las 7 condiciones) y `v2-antes-nov2026` (antes de `predios_zona_oct_2026_norma`).

El sitio es público. `index.html` pide a los buscadores que no lo indexen (`noindex`).
