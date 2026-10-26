"""
Preprocesamiento de datos para el visor «Condiciones territoriales DS 68».

Lee los shapefiles originales (sin modificarlos), repara geometrías,
reproyecta a EPSG:4326 y exporta GeoJSON livianos a public/data/.

Uso:
    python scripts/prepare_data.py
    python scripts/prepare_data.py --origen "D:\\ruta\\a\\3. Coberturas DS68"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
import shapely
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.validation import make_valid

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

APP_DIR = Path(__file__).resolve().parent.parent
ORIGEN_POR_DEFECTO = APP_DIR.parent / "3. Coberturas DS68"
SALIDA = APP_DIR / "public" / "data"

CRS_ESPERADO = 32719  # WGS 84 / UTM 19S
CRS_SALIDA = 4326

# Campos prediales: nombres físicos verificados en predios_dic2025.dbf.
# Si cambian en una nueva versión de la cobertura, corregir aquí.
CAMPO_ID_PREDIO = "COD_CAT"
CAMPO_CUMPLE = "CUMPLE_1"
CAMPO_20M = "20M_CONDB"
CAMPO_VIAL = "VIAL_DS68"
CAMPO_METRO = "METRO_600"
CAMPOS_PREDIO = [CAMPO_CUMPLE, CAMPO_20M, CAMPO_VIAL, CAMPO_METRO]

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
}
ARCHIVO_PREDIOS = "predios_dic2025.shp"
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


def huellas_fuente(origen: Path) -> dict[str, str]:
    """Huella SHA-256 de cada componente de shapefile, para verificar que no cambien."""
    return {
        p.name: sha256(p)
        for p in sorted(origen.iterdir())
        if p.is_file() and p.suffix.lower() in COMPONENTES
    }


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


def procesar_predios(origen: Path, informe: dict) -> list[dict]:
    ruta = origen / ARCHIVO_PREDIOS
    print(f"\n[predios] {ruta.name}")
    gdf, rep = leer(ruta)

    requeridos = [CAMPO_ID_PREDIO, *CAMPOS_PREDIO]
    faltan = [c for c in requeridos if c not in gdf.columns]
    if faltan:
        raise ErrorCampos(
            f"No se encontraron los campos {faltan} en {ruta.name}.\n"
            f"Campos encontrados: {rep['campos']}\n"
            "Corrija las constantes CAMPO_* al inicio de scripts/prepare_data.py "
            "con los nombres físicos reales del shapefile."
        )

    # Identificador: COD_CAT viene como número decimal; se publica como texto entero.
    ident = gdf[CAMPO_ID_PREDIO]
    ident = ident.where(ident.isna(), ident.round().astype("Int64").astype(str))
    datos = gpd.GeoDataFrame(
        {
            "id_predio": ident,
            **{c: normalizar(gdf[c]) for c in CAMPOS_PREDIO},
        },
        geometry=gdf.geometry,
        crs=gdf.crs,
    )

    base = es_si(gdf[CAMPO_CUMPLE]) & es_si(gdf[CAMPO_20M])
    vial = base & es_si(gdf[CAMPO_VIAL])
    metro = base & es_si(gdf[CAMPO_METRO])

    rep["valores_unicos"] = {
        c: {str(k): int(v) for k, v in normalizar(gdf[c]).value_counts(dropna=False).items()}
        for c in CAMPOS_PREDIO
    }
    rep["identificador"] = {
        "campo": CAMPO_ID_PREDIO,
        "nulos": int(ident.isna().sum()),
        "duplicados": int(ident.dropna().duplicated().sum()),
    }
    rep["vistas"] = {
        "condicion_base": int(base.sum()),
        "condicion_vial": int(vial.sum()),
        "condicion_metro": int(metro.sum()),
    }
    informe["predios"] = rep

    for nombre, mascara in (("condicion_base", base), ("condicion_vial", vial), ("condicion_metro", metro)):
        if mascara.sum() == 0:
            raise ErrorCampos(
                f"La vista «{nombre}» quedó vacía. Revise los valores de {CAMPOS_PREDIO}: "
                f"{rep['valores_unicos']}"
            )

    return [
        exportar(datos[base], "predios_condicion_base.geojson"),
        exportar(datos[vial], "predios_condicion_vial.geojson"),
        exportar(datos[metro], "predios_condicion_metro.geojson"),
    ]


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
                        help="Carpeta con los shapefiles originales.")
    args = parser.parse_args()
    origen: Path = args.origen.resolve()

    if not origen.is_dir():
        print(f"ERROR: no existe la carpeta de origen: {origen}")
        return 1

    SALIDA.mkdir(parents=True, exist_ok=True)
    print(f"Origen: {origen}\nSalida: {SALIDA}")

    huellas_antes = huellas_fuente(origen)
    informe: dict = {
        "generado": datetime.now().isoformat(timespec="seconds"),
        "origen": str(origen),
        "crs_salida": f"EPSG:{CRS_SALIDA}",
        "capas": {},
        "archivos_faltantes": [],
        "archivos_generados": [],
    }

    incentivo = next((a for a in ARCHIVOS_INCENTIVO if (origen / a).exists()), ARCHIVOS_INCENTIVO[0])
    tareas = [
        (ARCHIVO_PREDIOS, procesar_predios, True),
        (ARCHIVO_ESTACIONES, procesar_estaciones, False),
        (ARCHIVO_AI_METRO, procesar_influencia_metro, False),
        *[(a, lambda o, i, a=a: procesar_auxiliar(o, a, i), False) for a in CAPAS_AUXILIARES],
        (incentivo, lambda o, i: procesar_incentivo(o, incentivo, i), False),
        (ARCHIVO_EJES, procesar_etiquetas_ejes, False),
    ]

    try:
        for archivo, funcion, obligatorio in tareas:
            if not (origen / archivo).exists():
                if obligatorio:
                    print(f"ERROR: falta el archivo obligatorio {archivo}.")
                    return 1
                print(f"\n  ! No se encontró {archivo}: la capa se omitirá.")
                informe["archivos_faltantes"].append(archivo)
                continue
            informe["archivos_generados"].extend(funcion(origen, informe))
    except ErrorCampos as e:
        print(f"\nERROR DE CAMPOS:\n{e}")
        return 2

    huellas_despues = huellas_fuente(origen)
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
    print("Vistas prediales:", informe["predios"]["vistas"])
    print("Fuentes intactas:", informe["fuentes_intactas"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
