# Condiciones territoriales DS 68 — Comuna de Santiago

Visor cartográfico de los escenarios que genera el Decreto Supremo N.° 68 del MINVU (modificación de la OGUC, Diario Oficial del 2 de octubre de 2026) en la comuna de Santiago. Está pensado para explicarse en lenguaje común.

- **Sitio público:** https://fcosargent.github.io/visor-ds68/
- **Repositorio:** https://github.com/fcosargent/visor-ds68

## Qué muestra

Siete condiciones, organizadas en dos grupos. Se ve una condición a la vez.

| Grupo | Plano | Campo | Nombre visible | Manzanas | % |
|---|---|---|---|---|---|
| Conjunto Armónico | 1 | `P1_CA_BASE` | Situación base (art. 2.6.4) | 887 | 61,6 % |
| Conjunto Armónico | 2 | `P2_CON50` | Más superficie construida: +50% (art. 2.6.7) | 887 | 61,6 % |
| Conjunto Armónico | 2 | `P2_CON75` | Más superficie construida: +75% (art. 2.6.7) | 826 | 57,3 % |
| Conjunto Armónico | 3 | `P3_ALT25` | Más altura: +25% (art. 2.6.9) | 887 | 61,6 % |
| Conjunto Armónico | 3 | `P3_ALT50` | Más altura: +50% (art. 2.6.9) | 713 | 49,5 % |
| Densidad | 4 | `P4_DEN28` | Densidad: factor 2,8 | 615 | 42,7 % |
| Densidad | 4 | `P4_DEN14` | Densidad: factor 1,4 | 547 | 38,0 % |

- **Cifras de manzanas:** son las oficiales, sobre un total de 1.441. Se comprobaron contra los datos: coinciden exactamente.
- **Recuadro sobre el mapa:** muestra el título, el porcentaje, las manzanas y la explicación de la condición activa.
- **Leyenda:** está en la esquina inferior izquierda e incluye solo las capas encendidas.
- **Popup del predio:** muestra el código catastral, la zona, qué permite la condición, las normas de la zona y un ejercicio referencial.
- **«Descargar imagen (JPG)»:** exporta la vista actual con título, cifras, leyenda, escala, norte, fecha y fuente. El archivo se llama `DS68_<campo>.jpg`.

## Cómo editar textos y parámetros

### `src/config/condiciones.json`
Contiene todo lo que se ve en el panel y en el recuadro del mapa:

- Por grupo:
  - `titulo` e `introduccion`;
  - `recuadro` (colores del panel);
  - `simbologia` (relleno y contorno de los predios: Conjunto Armónico `#FF7F7F`, Densidad `#6EC6F0`, contorno `#6E6E6E`).
- Por condición:
  - `nombre`;
  - `variante` (texto del botón);
  - `texto` (explicación completa);
  - `resumen` (frase corta del popup);
  - `manzanas` y `porcentaje` (se muestran tal cual);
  - `ejercicio`: `multiplicador` 1,50 / 1,75 / 1,25 / 1,50 o `factor` 2,8 / 1,4.
- Generales:
  - `ejercicio.metrosPorPiso` (2,5 m) y la nota al pie;
  - `textos`: «No aplica», el aviso de valor no numérico y otros mensajes.

Tras editar, subir el cambio a GitHub. El sitio se recompila solo.

### `public/data/normas_zonas.json`
Se genera desde el Excel `Normas edificacion PRCS 2018 ... .xlsx`, hoja `Zonas`. La zona D11 se toma de la hoja «Zona D», porque no está en `Zonas`.

- **Clave:** la zona normalizada, por ejemplo `B15A`, `A5R` o `BORIENTE`.
- **Contenido de cada zona:** `nombre` y seis normas:
  - `constr_viv` (coeficiente de constructibilidad, vivienda);
  - `densidad`;
  - `altura`;
  - `constr_inc_viv`, `dens_inc` y `alt_inc` (con incentivo).
- **Cada norma guarda:**
  - `texto`: el valor original del Excel, que se muestra en el popup;
  - `valor`: el primer número, solo si el texto empieza con un número; si no, `null`.

Se puede editar a mano, pero lo recomendable es corregir el Excel y volver a ejecutar `prepare_data.py`, porque ese script sobrescribe el archivo.

### Cruce de `ZONA` con el Excel
Está definido en `scripts/prepare_data.py` (`EQUIVALENCIAS_ZONA`):

- **Zona «0» o vacía:** se usa `ZONA_2`. Los 493 predios que quedan sin zona se muestran como «Zona no informada».
- **Sufijo «i»:** la zona «Xi» se asocia a «SUBZONA XR» (por ejemplo, A5i a A5R). Además: Bi a Bro/Brp; E10ai, E10bi, E10ci y E10c1i a E10R; B2ai y B2bi a B2R; B15ai a B15R.
- **B:** se asocia a «B oriente» y «B poniente». Tienen la misma norma base; en el incentivo se muestran ambos valores rotulados.
- **D:** se asocia a «D poniente».
- **Zonas compuestas:** A3a y A3b a «ZCH A3a_b»; B7a y B7b a «ZCH B7a_b»; A7a a «ZCH A7».

El informe `data_report.json` lista las zonas que no encuentren norma. Hoy no hay ninguna.

## Ejercicio referencial (popup)

- **Superficie:** la del predio dentro de la zona (m² en EPSG:32719). Los predios divididos por un límite de zona se muestran por trozo.
- **Constructibilidad (plano 2):** superficie × coeficiente (vivienda) del Plan Regulador, y luego × 1,50 o × 1,75.
- **Altura (plano 3):** altura máxima × 1,25 o × 1,50. La diferencia se expresa en metros y en pisos aproximados (2,5 m por piso).
- **Densidad (plano 4):** densidad (hab/ha) × superficie (ha) ÷ factor. Con el factor 1,4 se compara además con el factor general 2,8.
- **Base del cálculo:** los porcentajes se aplican sobre la norma base. Los valores con incentivo se muestran solo como referencia.
- **Sin valor numérico** (por ejemplo, «Colindante ICH…»): no se calcula y se indica «revisar caso a caso».

## Datos (`public/data/`)

| Archivo | Fuente | Peso |
|---|---|---|
| `predios.geojson` | `predios_zona_oct_2026.shp` (32.554 polígonos, 6 decimales, sin simplificar) | 12,0 MB (≈1,4 MB comprimido al descargarlo) |
| `manzanas.geojson` | `Manzanas.shp` (1.441) | 2,4 MB |
| `normas_zonas.json` | Excel de normas (97 zonas) | 45 KB |
| Capas auxiliares | Estaciones, vías, franjas, área Metro, ZCH, límite comunal, vías de 20 m, zonas de incentivo, nombres de calles | < 0,6 MB c/u |

Cada predio guarda solo lo que usa la app:

- `c`: código catastral (`COD_CAT`). No hay campo de rol ni de manzana-predio.
- `z`: zona.
- `k`: columnas del Excel asociadas.
- `s`: superficie en m².
- `cond`: condiciones que cumple.

Los campos `C_TRANSP`, `F_EXP_TRO`, `C_METRO600`, `C_EXPR200` y `C_TRONC100` vienen vacíos en el shapefile. El visor usa directamente los campos P*.

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

## Publicación

Cada cambio en la rama `main` se compila y se publica solo, mediante el flujo `.github/workflows/deploy.yml`. Tarda uno o dos minutos; después se refresca el navegador (Ctrl+F5).

1. Si cambiaron las coberturas o el Excel, ejecutar `python scripts/prepare_data.py`.
2. Comprobar con `npm run build`.
3. Subir con `git add -A`, `git commit -m "..."` y `git push`.

**Respaldo:** la versión publicada antes de la actualización de noviembre de 2026 quedó en la etiqueta `v1-antes-actualizacion`.

El sitio es público. `index.html` pide a los buscadores que no lo indexen (`noindex`).
