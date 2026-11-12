"""
Preprocesamiento de datos para el visor «Condiciones territoriales DS 68».

Lee los shapefiles originales (sin modificarlos), repara geometrías,
reproyecta a EPSG:4326 y exporta GeoJSON livianos a public/data/.
Convierte además el Excel de normas por zona a public/data/normas_zonas.json.

Uso:
    python scripts/prepare_data.py
    python scripts/prepare_data.py --origen "D:\\ruta\\a\\coberturas" --excel "D:\\ruta\\normas.xlsx"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import numpy as np
import openpyxl
import pandas as pd
import pyogrio
import shapely
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.validation import make_valid

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

APP_DIR = Path(__file__).resolve().parent.parent
CARPETA_ACTUALIZADA = APP_DIR.parent / "6. shp pre reg por zona"
ORIGEN_POR_DEFECTO = CARPETA_ACTUALIZADA / "3. Coberturas DS68"
# Si un archivo no está en la carpeta actualizada, se busca en la carpeta anterior.
ORIGEN_RESPALDO = APP_DIR.parent / "3. Coberturas DS68"
# Excel de normas de edificación por zona (se busca por patrón, ignorando archivos temporales «~$»).
PATRON_EXCEL_NORMAS = "Normas edificacion PRCS*.xlsx"
SALIDA = APP_DIR / "public" / "data"

CRS_ESPERADO = 32719  # WGS 84 / UTM 19S
CRS_SALIDA = 4326

# Predios con las 7 condiciones y las normas ya cruzadas con la tabla del Plan Regulador
# (nombres físicos verificados en predios_zona_oct_2026_norma.dbf). Es el dato oficial
# para los cálculos del visor.
ARCHIVO_PREDIOS = "predios_zona_oct_2026_norma.shp"
CAMPO_ID_PREDIO = "COD_CAT"  # código catastral; no hay campo de rol ni manzana-predio
CAMPO_ZONA = "ZONA_TAB"  # código de zona de la tabla de normas (ej. «B oriente», «A5R»)
CAMPO_NOMBRE_ZONA = "NOM_TABLA"  # encabezado del Excel (ej. «SE B2a»)
# Normas por predio: campo -> clave en el GeoJSON.
CAMPOS_NORMA = {
    "CCV_TXT": "cvt",  # coeficiente de constructibilidad (vivienda), texto original
    "COEF_CVIV": "cv",  # idem, valor numérico
    "ALT_TXT": "alt",  # altura máxima, texto original
    "ALT_MAX_M": "al",  # idem, valor numérico en metros
    "DENSIDAD": "d",  # densidad máxima (hab/há)
}
CAMPOS_CONDICION = ["P1_CA_BASE", "P2_CON50", "P2_CON75", "P3_ALT25", "P3_ALT50", "P5_C75A50", "P4_DEN28", "P4_DEN14"]
DECIMALES_PREDIOS = 6  # ~10 cm; no se simplifican los límites prediales

# Siglas del Plan Regulador que se desarrollan en el nombre de la zona.
SIGLAS_ZONA = {
    "ZONA": "Zona",
    "SUBZONA": "Subzona",
    "ZCH": "Zona de Conservación Histórica",
    "SE": "Sector Especial",
}

# Monumentos Históricos e Inmuebles de Conservación Histórica: se conservan todos los campos.
CAPAS_PATRIMONIO = {
    "MONUMENTOS_HISTORICOS_MARZO_2025.shp": "monumentos_historicos.geojson",
    "INMUEBLES_DE_CONSERVACION_HISTORICA_MARZO_2025.shp": "inmuebles_conservacion_historica.geojson",
}

# Equivalencias entre ZONA (normalizada) y las columnas del Excel (normalizadas).
# Además de estas, «Xi» se asigna a «SUBZONA XR» cuando existe en el Excel.
EQUIVALENCIAS_ZONA = {
    "B": ["BORIENTE", "BPONIENTE"],
    "BI": ["BRO", "BRP"],
    "D": ["DPONIENTE"],
    "A3A": ["A3AB"],
    "A3B": ["A3AB"],
    "B7A": ["B7AB"],
    "B7B": ["B7AB"],
    "A7A": ["A7"],
    "B2AI": ["B2R"],
    "B2BI": ["B2R"],
    "B15AI": ["B15R"],
    "E10AI": ["E10R"],
    "E10BI": ["E10R"],
    "E10CI": ["E10R"],
    "E10C1I": ["E10R"],
}

# Filas del Excel que usa el visor: clave -> (texto de la norma, subcategoría o None).
# Se buscan por texto (sin tildes ni mayúsculas), no por número de fila.
NORMAS_EXCEL = {
    "constr_viv": ("coeficiente maximo de constructibilidad", "vivienda"),
    "densidad": ("densidad", None),
    "altura": ("altura maxima", None),
    "constr_inc_viv": ("tructibilidad con incentivo", "vivienda"),
    "dens_inc": ("densidad con incentivo", None),
    "alt_inc": ("altura con incentivo", None),
}

# Estaciones: el estado viene en el campo «Name» (valores «EXSTENTE» y «PROYECTADA»).
CAMPO_ESTADO_ESTACION = "Name"
CAMPO_NOMBRE_ESTACION = "ESTACION"
CAMPO_LINEA_ESTACION = "LINEA"

# Tolerancia de simplificación (metros, en UTM) solo para capas auxiliares complejas.
TOLERANCIA_AUX = 1.0

# Capas auxiliares: archivo fuente -> (salida, campos a conservar, simplificar)
CAPAS_AUXILIARES = {
    "Franjas_Viales_DS68_Troncal_Expresa.shp": ("franjas_viales_ds68.geojson", [], True),
    "Vias_Expresas_Oficiales.shp": ("vias_expresas.geojson", ["NOM_SIU"], True),
    "Vias_Troncales_Oficiales.shp": ("vias_troncales.geojson", ["NOM_SIU"], True),
    "ZONAS_DE_CONSERVACION_HISTORICA_MARZO_2025.shp": (
        "zonas_conservacion_historica.geojson",
        ["ZONA_ZCH", "NOMBRE_ZCH"],
        True,
    ),
    "LIMITE_COMUNA.shp": ("limite_comunal.geojson", ["NOM_COM"], True),
    "vialidad_comunal_20metros.shp": ("vialidad_20m.geojson", ["NOM_SIU", "CLASIF_VIA"], True),
    "Manzanas.shp": ("manzanas.geojson", [], False),
}
ARCHIVO_ESTACIONES = "ESTACIONES_DE_METRO_COMUNA_STGO_2.shp"
ARCHIVO_AI_METRO = "AI_600m_Estaciones_DS68_Individual.shp"
# Zonas de incentivo: se usa el primer archivo que exista. Sus límites siguen los
# predios, por lo que no se simplifican.
ARCHIVOS_INCENTIVO = ("ZONAS_DE_INCENTIVO.shp", "zci_prcs_wgs84_predios_2.shp")
CAMPOS_INCENTIVO = ["ZONAS_VIGE", "TIPO"]

# Ejes viales: solo se publican puntos de etiqueta con el nombre de la calle.
ARCHIVO_EJES = "EJES_VIALES.shp"
CAMPO_NOMBRE_EJE = "NOMBRE"
ESPACIADO_ETIQUETAS = 300.0  # metros entre etiquetas de una misma calle
LARGO_MIN_ETIQUETA = 40.0  # tramos continuos más cortos no se rotulan

COMPONENTES = (".shp", ".shx", ".dbf", ".prj", ".cpg")


class ErrorCampos(Exception):
    """Los campos requeridos no se encuentran en la cobertura."""


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def huellas_fuente(carpetas: list[Path]) -> dict[str, str]:
    """Huella SHA-256 de cada componente de shapefile, para verificar que no cambien."""
    return {
        f"{c.parent.name}/{c.name}/{p.name}": sha256(p)
        for c in carpetas
        for p in sorted(c.iterdir())
        if p.is_file() and p.suffix.lower() in COMPONENTES
    }


def sin_tildes(texto: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", texto) if unicodedata.category(ch) != "Mn")


def normalizar_zona(texto) -> str | None:
    """«SUBZONA A5R» -> «A5R»; «ZCH B7a_b» -> «B7AB»; «D3i» -> «D3I»."""
    if texto is None or (isinstance(texto, float) and math.isnan(texto)):
        return None
    s = str(texto).strip().upper()
    if not s:
        return None
    s = re.sub(r"^(ZONA|SUBZONA|ZCH|SE)\s+", "", s)
    return re.sub(r"[\s_\-]", "", s)


def normalizar(serie: pd.Series) -> pd.Series:
    """Mayúsculas y sin espacios en los extremos. Los nulos siguen siendo nulos."""
    return serie.where(serie.isna(), serie.astype(str).str.strip().str.upper())


def es_si(serie: pd.Series) -> pd.Series:
    """True solo cuando el valor normalizado es exactamente «SI». Nulo -> False."""
    return normalizar(serie).eq("SI").fillna(False).astype(bool)


def solo_poligonos(geom):
    """Extrae la parte poligonal de una geometría reparada."""
    if geom is None or geom.is_empty:
        return geom
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    if isinstance(geom, GeometryCollection):
        partes = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon))]
        polys = []
        for p in partes:
            polys.extend(p.geoms if isinstance(p, MultiPolygon) else [p])
        return MultiPolygon(polys) if len(polys) > 1 else (polys[0] if polys else Polygon())
    return geom


def leer(ruta: Path) -> tuple[gpd.GeoDataFrame, dict]:
    """Lee un shapefile, verifica el CRS y repara geometrías. Devuelve (gdf, informe)."""
    faltantes = [ext for ext in COMPONENTES if not ruta.with_suffix(ext).exists()]
    info = pyogrio.read_info(ruta)
    gdf = gpd.read_file(ruta)

    crs_txt = gdf.crs.name if gdf.crs else None
    epsg = gdf.crs.to_epsg(min_confidence=20) if gdf.crs else None
    if gdf.crs is None:
        raise ValueError(f"{ruta.name}: no tiene sistema de coordenadas (.prj).")
    if epsg != CRS_ESPERADO:
        print(f"  ! {ruta.name}: CRS {epsg} ({crs_txt}); se esperaba EPSG:{CRS_ESPERADO}.")

    # Quitar coordenada Z si existe (los puntos de estaciones son Point Z).
    if gdf.geometry.has_z.any():
        gdf.geometry = gdf.geometry.force_2d()

    vacias = int((gdf.geometry.isna() | gdf.geometry.is_empty).sum())
    invalidas_mask = gdf.geometry.notna() & ~gdf.geometry.is_valid
    invalidas = int(invalidas_mask.sum())
    if invalidas:
        reparadas = gdf.loc[invalidas_mask, "geometry"].apply(make_valid)
        if gdf.geom_type.isin(["Polygon", "MultiPolygon"]).all():
            reparadas = reparadas.apply(solo_poligonos)
        gdf.loc[invalidas_mask, "geometry"] = reparadas
    persisten = int((gdf.geometry.notna() & ~gdf.geometry.is_valid).sum())
    if vacias:
        gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()

    informe = {
        "archivo": ruta.name,
        "tipo_geometria": info["geometry_type"],
        "registros": int(info["features"]),
        "crs_original": f"EPSG:{epsg}" if epsg else crs_txt,
        "crs_nombre": crs_txt,
        "codificacion": info.get("encoding"),
        "componentes_faltantes": faltantes,
        "campos": [c for c in gdf.columns if c != "geometry"],
        "geometrias_vacias": vacias,
        "geometrias_invalidas": invalidas,
        "geometrias_invalidas_tras_reparar": persisten,
    }
    return gdf, informe


def exportar(gdf: gpd.GeoDataFrame, nombre: str) -> dict:
    """Reproyecta a EPSG:4326 y escribe GeoJSON (RFC 7946, 7 decimales ~1 cm)."""
    destino = SALIDA / nombre
    if destino.exists():
        destino.unlink()
    salida = gdf.to_crs(CRS_SALIDA)
    salida.to_file(destino, driver="GeoJSON", engine="pyogrio", layer_options={"RFC7946": "YES"})
    tam = destino.stat().st_size
    n_txt = f"{len(salida):,}".replace(",", ".")
    kb_txt = f"{tam / 1024:,.0f}".replace(",", ".")
    print(f"  -> {nombre}: {n_txt} entidades; {kb_txt} KB")
    return {"archivo": nombre, "entidades": int(len(salida)), "bytes": int(tam)}


def simplificar(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(TOLERANCIA_AUX, preserve_topology=True)
    return gdf


# ---------------------------------------------------------------------------
# Procesos
# ---------------------------------------------------------------------------


def _texto_celda(v) -> str | None:
    """Texto original de una celda, con decimales chilenos y espacios repetidos colapsados."""
    if v is None:
        return None
    if isinstance(v, float):
        v = f"{v:g}".replace(".", ",")
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def _valor_numerico(texto: str | None) -> float | None:
    """Primer número del texto, solo si el texto empieza con un número (coma decimal -> punto)."""
    if not texto:
        return None
    m = re.match(r"^(\d+(?:[.,]\d+)?)", texto)
    return float(m.group(1).replace(",", ".")) if m else None


def _leer_hoja_normas(ws) -> dict[str, dict]:
    """Hoja transpuesta: cada columna (desde la C) es una zona; cada fila, una norma."""
    combinadas = {}
    for rango in ws.merged_cells.ranges:
        v = ws.cell(rango.min_row, rango.min_col).value
        for r in range(rango.min_row, rango.max_row + 1):
            for c in range(rango.min_col, rango.max_col + 1):
                combinadas[(r, c)] = v

    def celda(r, c):
        return combinadas.get((r, c), ws.cell(r, c).value)

    # Ubicar filas por texto: la norma (col. A) se arrastra a sus filas de continuación.
    filas = {}
    norma_actual = ""
    for r in range(2, ws.max_row + 1):
        a = celda(r, 1)
        if a:
            norma_actual = sin_tildes(re.sub(r"\s+", " ", str(a))).lower().strip()
        sub = sin_tildes(str(celda(r, 2) or "")).lower().strip()
        for clave, (texto, subcat) in NORMAS_EXCEL.items():
            if clave in filas:
                continue
            coincide = norma_actual.startswith(texto) if clave in ("densidad",) else texto in norma_actual
            if clave == "densidad" and "incentivo" in norma_actual:
                coincide = False
            if coincide and (subcat is None or sub.startswith(subcat)):
                filas[clave] = r

    faltan = [k for k in NORMAS_EXCEL if k not in filas]
    if faltan:
        raise ErrorCampos(f"Hoja «{ws.title}»: no se encontraron las filas {faltan}.")

    zonas = {}
    for c in range(3, ws.max_column + 1):
        nombre = _texto_celda(ws.cell(1, c).value)
        clave = normalizar_zona(nombre)
        if not clave:
            continue
        datos = {"nombre": nombre}
        for k, r in filas.items():
            texto = _texto_celda(celda(r, c))
            datos[k] = {"texto": texto, "valor": _valor_numerico(texto)}
        zonas[clave] = datos
    return zonas


def procesar_normas(excel: Path, informe: dict) -> tuple[dict, list[dict]]:
    """Convierte el Excel de normas a normas_zonas.json (hoja «Zonas» + zonas solo presentes en detalle)."""
    print(f"\n[normas por zona] {excel.name}")
    wb = openpyxl.load_workbook(excel, data_only=True)
    zonas = _leer_hoja_normas(wb["Zonas"])
    agregadas = {}
    for ws in wb.worksheets:
        if ws.title == "Zonas":
            continue
        for clave, datos in _leer_hoja_normas(ws).items():
            if clave not in zonas:
                zonas[clave] = datos
                agregadas[clave] = ws.title
    destino = SALIDA / "normas_zonas.json"
    contenido = {
        "fuente": f"{excel.name}, hoja «Zonas»" + (f" (más {', '.join(sorted(set(agregadas.values())))} para {', '.join(agregadas)})" if agregadas else ""),
        "nota": "texto = valor original del Excel; valor = primer número, solo si el texto empieza con un número.",
        "zonas": zonas,
    }
    destino.write_text(json.dumps(contenido, ensure_ascii=False, indent=1), encoding="utf-8")
    tam = destino.stat().st_size
    print(f"  -> normas_zonas.json: {len(zonas)} zonas; {tam / 1024:,.0f} KB".replace(",", "."))
    informe["normas"] = {"excel": excel.name, "zonas": len(zonas), "zonas_desde_hojas_de_detalle": agregadas}
    return zonas, [{"archivo": "normas_zonas.json", "entidades": len(zonas), "bytes": int(tam)}]


def claves_normas(zona: str | None, zonas_excel: dict) -> list[str]:
    """Columnas del Excel que corresponden a una ZONA del shapefile."""
    k = normalizar_zona(zona)
    if not k:
        return []
    if k in zonas_excel:
        return [k]
    if k in EQUIVALENCIAS_ZONA:
        return [c for c in EQUIVALENCIAS_ZONA[k] if c in zonas_excel]
    if k.endswith("I") and f"{k[:-1]}R" in zonas_excel:
        return [f"{k[:-1]}R"]
    return []


def desarrollar_nombre_zona(nombre) -> str | None:
    """«SE B2a» -> «Sector Especial B2a»; «ZCH D7» -> «Zona de Conservación Histórica D7»."""
    if nombre is None or (isinstance(nombre, float) and math.isnan(nombre)):
        return None
    s = re.sub(r"\s+", " ", str(nombre)).strip()
    sigla, _, resto = s.partition(" ")
    return f"{SIGLAS_ZONA[sigla.upper()]} {resto}" if sigla.upper() in SIGLAS_ZONA and resto else s


def procesar_patrimonio(origen: Path, archivo: str, informe: dict) -> list[dict]:
    """MH e ICH: se conservan todos los campos (el visor les asigna alias legibles)."""
    ruta = origen / archivo
    print(f"\n[patrimonio] {ruta.name}")
    gdf, rep = leer(ruta)
    informe["capas"][ruta.name] = rep
    for col in gdf.columns:
        if col == "geometry":
            continue
        serie = gdf[col]
        # Códigos guardados como decimales (ID, N°_ICH) se publican como enteros.
        if pd.api.types.is_float_dtype(serie) and serie.dropna().apply(float.is_integer).all():
            gdf[col] = serie.astype("Int64")
        elif serie.dtype == object or pd.api.types.is_string_dtype(serie):
            gdf[col] = serie.map(lambda v: re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else v)
    return [exportar(gdf, CAPAS_PATRIMONIO[archivo])]


def _redondear(geoms: np.ndarray, decimales: int) -> np.ndarray:
    return shapely.transform(geoms, lambda xy: np.round(xy, decimales))


def procesar_predios(origen: Path, informe: dict, zonas_excel: dict) -> list[dict]:
    ruta = origen / ARCHIVO_PREDIOS
    print(f"\n[predios] {ruta.name}")
    gdf, rep = leer(ruta)

    requeridos = [CAMPO_ID_PREDIO, CAMPO_ZONA, CAMPO_NOMBRE_ZONA, *CAMPOS_NORMA, *CAMPOS_CONDICION]
    faltan = [c for c in requeridos if c not in gdf.columns]
    if faltan:
        raise ErrorCampos(
            f"No se encontraron los campos {faltan} en {ruta.name}.\n"
            f"Campos encontrados: {rep['campos']}\n"
            "Corrija las constantes CAMPO_* / CAMPOS_NORMA / CAMPOS_CONDICION al inicio de scripts/prepare_data.py."
        )

    zona = gdf[CAMPO_ZONA].astype("string").str.strip()
    zona = zona.where(zona.notna() & (zona != ""), None)
    nombre_zona = [desarrollar_nombre_zona(v) for v in gdf[CAMPO_NOMBRE_ZONA]]
    claves = zona.map(lambda z: "|".join(claves_normas(z, zonas_excel)) if isinstance(z, str) else "")

    sin_cruce = zona[zona.notna() & (claves == "")].value_counts()
    rep["zona"] = {
        "campo": CAMPO_ZONA,
        "sin_zona": int(zona.isna().sum()),
        "sin_cruce_con_excel": {str(k): int(v) for k, v in sin_cruce.items()},
    }
    rep["densidad_valores"] = {
        str(k): int(v) for k, v in gdf["DENSIDAD"].value_counts(dropna=False).sort_index().items()
    }

    condiciones = {c: es_si(gdf[c]) for c in CAMPOS_CONDICION}
    rep["condiciones"] = {c: int(m.sum()) for c, m in condiciones.items()}
    for c, n in rep["condiciones"].items():
        if n == 0:
            raise ErrorCampos(f"La condición {c} quedó sin predios. Revise los valores del campo.")

    ident = gdf[CAMPO_ID_PREDIO].round().astype("Int64").astype("string")
    rep["identificador"] = {
        "campo": CAMPO_ID_PREDIO,
        "nulos": int(ident.isna().sum()),
        "codigos_repetidos": int(ident.dropna().duplicated().sum()),
        "nota": "Los códigos repetidos corresponden a predios divididos por límites de zona.",
    }
    informe["predios"] = rep

    # GeoJSON compacto: c = código catastral, z = zona (ZONA_TAB), n = nombre de la zona,
    # k = columnas del Excel, s = superficie del predio en m² (SUP_HA × 10.000),
    # cvt/cv, alt/al, d = normas del predio (ver CAMPOS_NORMA), cond = condiciones que cumple.
    geoms = _redondear(gdf.to_crs(CRS_SALIDA).geometry.values, DECIMALES_PREDIOS)
    area = (gdf["SUP_HA"] * 10000).round(1) if "SUP_HA" in gdf.columns else gdf.geometry.area.round(1)
    # Listas de Python (no Series): así los vacíos quedan como null y no como NaN, que no es JSON válido.
    normas = {
        clave: [
            None if pd.isna(v) else (re.sub(r"\s+", " ", v).strip() if isinstance(v, str) else float(v))
            for v in gdf[campo]
        ]
        for campo, clave in CAMPOS_NORMA.items()
    }
    features = []
    for i, geom in enumerate(geoms):
        props = {
            "c": None if pd.isna(ident.iat[i]) else ident.iat[i],
            "z": None if pd.isna(zona.iat[i]) else zona.iat[i],
            "n": nombre_zona[i],
            "k": claves.iat[i],
            "s": float(area.iat[i]),
            **{clave: valores[i] for clave, valores in normas.items()},
            "cond": [c for c in CAMPOS_CONDICION if condiciones[c].iat[i]],
        }
        features.append({"type": "Feature", "properties": props, "geometry": shapely.geometry.mapping(geom)})

    destino = SALIDA / "predios.geojson"
    with destino.open("w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"),
                  allow_nan=False)
    tam = destino.stat().st_size
    print(f"  -> predios.geojson: {len(features):,} entidades; {tam / 1e6:,.1f} MB".replace(",", "."))
    return [{"archivo": "predios.geojson", "entidades": len(features), "bytes": int(tam)}]


def procesar_estaciones(origen: Path, informe: dict) -> list[dict]:
    ruta = origen / ARCHIVO_ESTACIONES
    print(f"\n[estaciones] {ruta.name}")
    gdf, rep = leer(ruta)
    faltan = [c for c in (CAMPO_ESTADO_ESTACION, CAMPO_NOMBRE_ESTACION) if c not in gdf.columns]
    if faltan:
        raise ErrorCampos(f"{ruta.name}: faltan {faltan}. Campos encontrados: {rep['campos']}")

    estado_txt = normalizar(gdf[CAMPO_ESTADO_ESTACION])
    # «EXSTENTE» (sic) en la fuente; se reconoce también «EXISTENTE».
    estado = pd.Series(pd.NA, index=gdf.index, dtype="object")
    estado[estado_txt.str.startswith("EX", na=False)] = "existente"
    estado[estado_txt.str.startswith("PROY", na=False)] = "proyectada"
    sin_clasificar = int(estado.isna().sum())
    if sin_clasificar:
        print(f"  ! {sin_clasificar} estaciones con estado no reconocido: "
              f"{estado_txt[estado.isna()].unique().tolist()} (se excluyen)")

    rep["valores_unicos"] = {
        CAMPO_ESTADO_ESTACION: {str(k): int(v) for k, v in estado_txt.value_counts(dropna=False).items()},
        CAMPO_LINEA_ESTACION: {str(k): int(v) for k, v in gdf[CAMPO_LINEA_ESTACION].value_counts(dropna=False).items()},
    }
    rep["clasificacion"] = {str(k): int(v) for k, v in estado.value_counts(dropna=False).items()}
    informe["capas"][ruta.name] = rep

    salida = gpd.GeoDataFrame(
        {
            "nombre": gdf[CAMPO_NOMBRE_ESTACION].astype(str).str.strip(),
            "linea": gdf[CAMPO_LINEA_ESTACION].astype(str).str.strip(),
            "estado": estado,
        },
        geometry=gdf.geometry,
        crs=gdf.crs,
    )
    return [exportar(salida[salida["estado"].notna()], "estaciones_metro.geojson")]


def procesar_influencia_metro(origen: Path, informe: dict) -> list[dict]:
    ruta = origen / ARCHIVO_AI_METRO
    print(f"\n[área peatonal Metro] {ruta.name}")
    gdf, rep = leer(ruta)
    informe["capas"][ruta.name] = rep
    individual = simplificar(gdf[["geometry"]])
    consolidada = gpd.GeoDataFrame(geometry=[gdf.geometry.union_all()], crs=gdf.crs)
    consolidada = simplificar(consolidada)
    rep["nota"] = (
        f"La fuente contiene {len(gdf)} registro(s). La versión consolidada disuelve "
        "las superficies superpuestas en una sola cobertura."
    )
    return [
        exportar(individual, "influencia_metro_600m_individual.geojson"),
        exportar(consolidada, "influencia_metro_600m_consolidada.geojson"),
    ]


def procesar_auxiliar(origen: Path, archivo: str, informe: dict) -> list[dict]:
    salida, campos, simp = CAPAS_AUXILIARES[archivo]
    ruta = origen / archivo
    print(f"\n[auxiliar] {ruta.name}")
    gdf, rep = leer(ruta)
    informe["capas"][ruta.name] = rep
    conservar = [c for c in campos if c in gdf.columns]
    gdf = gdf[conservar + ["geometry"]]
    if simp:
        gdf = simplificar(gdf)
    return [exportar(gdf, salida)]


def procesar_etiquetas_ejes(origen: Path, informe: dict) -> list[dict]:
    """Puntos de etiqueta a lo largo de cada calle, con el ángulo de giro del texto."""
    ruta = origen / ARCHIVO_EJES
    print(f"\n[etiquetas de calles] {ruta.name}")
    gdf, rep = leer(ruta)
    if CAMPO_NOMBRE_EJE not in gdf.columns:
        raise ErrorCampos(f"{ruta.name}: falta {CAMPO_NOMBRE_EJE}. Campos encontrados: {rep['campos']}")

    nombres = gdf[CAMPO_NOMBRE_EJE].astype("string").str.strip()
    con_nombre = nombres.notna() & (nombres != "")
    rep["tramos_sin_nombre"] = int((~con_nombre).sum())
    gdf = gdf.assign(nombre=nombres)[con_nombre]

    filas = []
    for nombre, grupo in gdf.groupby("nombre"):
        unida = shapely.line_merge(shapely.union_all(grupo.geometry.values))
        partes = list(unida.geoms) if hasattr(unida, "geoms") else [unida]
        for parte in partes:
            if parte.geom_type != "LineString" or parte.length < LARGO_MIN_ETIQUETA:
                continue
            largo = parte.length
            n = max(1, int(largo // ESPACIADO_ETIQUETAS))
            paso = largo / n
            for k in range(n):
                d = paso * (k + 0.5)
                a = parte.interpolate(max(d - 8, 0))
                b = parte.interpolate(min(d + 8, largo))
                # Giro CSS (horario) a partir del ángulo matemático; el texto nunca queda invertido.
                giro = -math.degrees(math.atan2(b.y - a.y, b.x - a.x))
                if giro > 90:
                    giro -= 180
                elif giro <= -90:
                    giro += 180
                filas.append({"nombre": nombre, "angulo": round(giro, 1),
                              "prioridad": round(largo), "geometry": parte.interpolate(d)})

    etiquetas = gpd.GeoDataFrame(filas, geometry="geometry", crs=gdf.crs)
    etiquetas = etiquetas.sort_values("prioridad", ascending=False, kind="stable")
    rep["calles_con_nombre"] = int(gdf["nombre"].nunique())
    rep["puntos_etiqueta"] = int(len(etiquetas))
    informe["capas"][ruta.name] = rep
    return [exportar(etiquetas, "etiquetas_ejes_viales.geojson")]


def procesar_incentivo(origen: Path, archivo: str, informe: dict) -> list[dict]:
    ruta = origen / archivo
    print(f"\n[auxiliar opcional] {ruta.name}")
    gdf, rep = leer(ruta)
    conservar = [c for c in CAMPOS_INCENTIVO if c in gdf.columns]
    rep["valores_unicos"] = {
        c: {str(k): int(v) for k, v in gdf[c].value_counts(dropna=False).items()} for c in conservar
    }
    informe["capas"][ruta.name] = rep
    return [exportar(gdf[conservar + ["geometry"]], "zonas_incentivo.geojson")]


# ---------------------------------------------------------------------------
# Principal
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--origen", type=Path, default=ORIGEN_POR_DEFECTO,
                        help="Carpeta con los shapefiles actualizados.")
    parser.add_argument("--respaldo", type=Path, default=ORIGEN_RESPALDO,
                        help="Carpeta donde buscar los shapefiles que falten en --origen.")
    parser.add_argument("--excel", type=Path, default=None,
                        help="Excel de normas por zona (por defecto se busca junto a la carpeta de origen).")
    args = parser.parse_args()
    origen: Path = args.origen.resolve()
    carpetas = [c for c in (origen, args.respaldo.resolve()) if c.is_dir()]

    if not origen.is_dir():
        print(f"ERROR: no existe la carpeta de origen: {origen}")
        return 1
    excel = args.excel or next(
        (p for p in sorted(origen.parent.glob(PATRON_EXCEL_NORMAS)) if not p.name.startswith("~$")), None)
    if excel is None or not excel.exists():
        print(f"ERROR: no se encontró el Excel de normas ({PATRON_EXCEL_NORMAS}) en {origen.parent}")
        return 1

    SALIDA.mkdir(parents=True, exist_ok=True)
    print(f"Origen: {origen}\nRespaldo: {carpetas[1:] or '-'}\nExcel: {excel}\nSalida: {SALIDA}")

    def ubicar(archivo: str) -> Path | None:
        return next((c for c in carpetas if (c / archivo).exists()), None)

    huellas_antes = huellas_fuente(carpetas)
    informe: dict = {
        "generado": datetime.now().isoformat(timespec="seconds"),
        "origen": [c.name if c == origen else f"{c.name} (respaldo)" for c in carpetas],
        "crs_salida": f"EPSG:{CRS_SALIDA}",
        "capas": {},
        "archivos_faltantes": [],
        "archivos_generados": [],
        "carpeta_por_archivo": {},
    }

    try:
        zonas_excel, generados = procesar_normas(excel, informe)
        informe["archivos_generados"].extend(generados)
    except ErrorCampos as e:
        print(f"\nERROR EN EL EXCEL:\n{e}")
        return 2

    incentivo = next((a for a in ARCHIVOS_INCENTIVO if ubicar(a)), ARCHIVOS_INCENTIVO[0])
    tareas = [
        (ARCHIVO_PREDIOS, lambda o, i: procesar_predios(o, i, zonas_excel), True),
        (ARCHIVO_ESTACIONES, procesar_estaciones, False),
        (ARCHIVO_AI_METRO, procesar_influencia_metro, False),
        *[(a, lambda o, i, a=a: procesar_auxiliar(o, a, i), False) for a in CAPAS_AUXILIARES],
        (incentivo, lambda o, i: procesar_incentivo(o, incentivo, i), False),
        *[(a, lambda o, i, a=a: procesar_patrimonio(o, a, i), False) for a in CAPAS_PATRIMONIO],
        (ARCHIVO_EJES, procesar_etiquetas_ejes, False),
    ]

    try:
        for archivo, funcion, obligatorio in tareas:
            carpeta = ubicar(archivo)
            if carpeta is None:
                if obligatorio:
                    print(f"ERROR: falta el archivo obligatorio {archivo}.")
                    return 1
                print(f"\n  ! No se encontró {archivo}: la capa se omitirá.")
                informe["archivos_faltantes"].append(archivo)
                continue
            informe["carpeta_por_archivo"][archivo] = "actualizada" if carpeta == origen else "respaldo"
            informe["archivos_generados"].extend(funcion(carpeta, informe))
    except ErrorCampos as e:
        print(f"\nERROR DE CAMPOS:\n{e}")
        return 2

    huellas_despues = huellas_fuente(carpetas)
    cambiados = [n for n in huellas_antes if huellas_antes[n] != huellas_despues.get(n)]
    informe["fuentes_intactas"] = not cambiados and huellas_antes.keys() == huellas_despues.keys()
    informe["huellas_sha256_fuente"] = huellas_antes
    if cambiados:
        print(f"\n! ADVERTENCIA: cambiaron archivos fuente: {cambiados}")

    # Quitar GeoJSON que ya no corresponden a ninguna fuente presente (p. ej. zonas_incentivo).
    vigentes = {a["archivo"] for a in informe["archivos_generados"]}
    for viejo in SALIDA.glob("*.geojson"):
        if viejo.name not in vigentes:
            viejo.unlink()
            print(f"  (eliminado GeoJSON obsoleto {viejo.name})")

    destino = SALIDA / "data_report.json"
    destino.write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nInforme: {destino}")
    print("Predios por condición:", informe["predios"]["condiciones"])
    print("Zonas sin cruce con el Excel:", informe["predios"]["zona"]["sin_cruce_con_excel"] or "ninguna")
    print("Fuentes intactas:", informe["fuentes_intactas"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
