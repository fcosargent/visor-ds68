// Textos normativos de las tarjetas «Efectos normativos potenciales».
// Fuente: DS N.° 68 de 2026 (MINVU), que modifica los artículos 2.1.22, 2.4.1,
// 2.6.4, 2.6.5, 2.6.7, 2.6.9 y 2.6.19 de la OGUC.
// Los componentes visuales no deben contener textos normativos: todo se edita aquí.

import type { ConditionId } from './layers';

/** Únicas etiquetas de sección permitidas en la tarjeta. */
export const CARD_LABELS = {
  territorial: 'Condición territorial',
  benefits: 'Beneficios potenciales',
  requirements: 'Requisitos adicionales',
  fundament: 'Fundamento normativo',
} as const;

export const CARD_UI = {
  cardTitle: 'Efectos normativos potenciales',
  showFundament: 'Ver fundamento',
  hideFundament: 'Ocultar fundamento',
  popupButton: 'Ver efectos normativos',
  predio: 'Predio',
  identified: 'Condición territorial identificada',
  notIdentified: 'No acreditado por esta cobertura',
  benefitsIntro: 'Puede acceder, sujeto a requisitos. Requiere verificación normativa.',
} as const;

export interface Benefit {
  id: 'densidad' | 'estacionamientos' | 'constructibilidad';
  title: string;
  text: string;
}

export interface Requirement {
  /** Beneficio o situación a la que aplica el requisito. */
  label: string;
  text: string;
}

export interface AlertBox {
  title?: string;
  text: string;
}

export interface ConditionBenefits {
  title: string;
  territorial: string;
  /** Texto del bloque «Beneficios potenciales» cuando la condición no tiene beneficios propios. */
  benefitsSummary?: string;
  /** Efectos que esta condición NO acredita (se muestran como tales, nunca como beneficio). */
  notAccredited?: string;
  benefits: Benefit[];
  /** Recuadro breve visible sin desplegar el fundamento. */
  alert: AlertBox;
  /** Contenido desplegable de «Ver fundamento». */
  requirements: Requirement[];
  notes: string[];
  references: string[];
}

const BENEFICIOS_DS68: Benefit[] = [
  {
    id: 'densidad',
    title: 'Densidad',
    text: 'Aplicación del coeficiente de 1,4 habitantes por vivienda para el cálculo de densidad.',
  },
  {
    id: 'estacionamientos',
    title: 'Estacionamientos',
    text: 'Posibilidad de rebajar hasta la mitad la dotación de estacionamientos para proyectos de vivienda y/o equipamiento clase servicio.',
  },
  {
    id: 'constructibilidad',
    title: 'Constructibilidad',
    text: 'Posibilidad de exceder hasta en 75 % el coeficiente de constructibilidad para determinados proyectos de vivienda acogidos a Conjunto Armónico.',
  },
];

const REQ_ESTACIONAMIENTOS: Requirement = {
  label: 'Estacionamientos',
  text: 'No se aplica a condominios de viviendas de interés público, que deben cumplir el artículo 60 de la Ley N.° 21.442.',
};

const REQ_CONSTRUCTIBILIDAD: Requirement = {
  label: 'Constructibilidad',
  text: 'Requiere cumplir los artículos 2.6.5 o 2.6.7, según corresponda, además de tratarse de proyectos de vivienda cuyas unidades no superen los 90 m² y cumplir los demás requisitos aplicables.',
};

const REFERENCIAS_DS68 = [
  'Densidad: artículo 2.1.22.',
  'Estacionamientos: artículo 2.4.1.',
  'Constructibilidad: artículos 2.6.5 y 2.6.7.',
];

export const NORMATIVE_BENEFITS: Record<ConditionId, ConditionBenefits> = {
  base: {
    title: 'Condición base: vía de 20 m',
    territorial:
      'El terreno enfrenta en al menos 20 m una vía existente o proyectada en el instrumento de planificación territorial, de un ancho mínimo de 20 m entre líneas oficiales.',
    benefitsSummary:
      'Esta condición corresponde a uno de los requisitos territoriales considerados por la OGUC para determinados proyectos acogidos a Conjunto Armónico.',
    notAccredited:
      'No acreditado por esta cobertura: incrementos de constructibilidad o de altura, coeficiente de 1,4 habitantes por vivienda ni rebaja de estacionamientos.',
    benefits: [],
    alert: {
      text: 'Esta cobertura acredita únicamente una condición cartográfica preliminar. No demuestra por sí sola que el proyecto pueda acogerse a Conjunto Armónico ni que acceda automáticamente a incrementos de altura o constructibilidad.',
    },
    requirements: [
      {
        label: 'Cambio incorporado por el DS 68',
        text: 'El DS N.° 68 reemplazó la exigencia anterior de vía con calzada no inferior a 14 m por una vía de ancho mínimo de 20 m entre líneas oficiales.',
      },
      {
        label: 'Terrenos de 5.000 m² o más',
        text: 'Cuando el Conjunto Armónico se emplace en uno o más terrenos que, en conjunto, tengan una superficie igual o superior a 5.000 m², la vía deberá contar además con una calzada de al menos 14 m de ancho.',
      },
    ],
    notes: [],
    references: ['Artículo 2.6.4 de la OGUC, modificado por el DS N.° 68 de 2026.'],
  },

  vial: {
    title: 'Condición vial: expresas y troncales',
    territorial:
      'El acceso del proyecto se encuentra dentro de una franja de 200 m medida a cada costado del eje de una vía expresa existente y/o dentro de una franja de 100 m medida a cada costado del eje de una vía troncal existente.',
    benefits: BENEFICIOS_DS68,
    alert: {
      title: 'Altura no acreditada',
      text: 'Estar dentro de las franjas de 200 o 100 m no acredita por sí solo el incremento de altura del artículo 2.6.9.',
    },
    requirements: [REQ_ESTACIONAMIENTOS, REQ_CONSTRUCTIBILIDAD],
    notes: [
      'La cobertura predial se obtuvo mediante intersección espacial con las franjas. La norma exige verificar que el acceso efectivo del proyecto se encuentre dentro de la franja correspondiente.',
      'El incremento de altura de hasta 50 % exige, entre otras condiciones, que el predio enfrente una vía expresa o troncal en al menos 20 m. Este requisito es diferente de encontrarse dentro de las franjas de proximidad.',
    ],
    references: REFERENCIAS_DS68,
  },

  metro: {
    title: 'Condición Metro: recorrido peatonal de 600 m',
    territorial:
      'El proyecto se emplaza a una distancia no superior a 600 m de recorrido peatonal, por vías de tránsito público, respecto de una estación de Metro, tren, teleférico o similar, existente o proyectada habilitante.',
    benefits: BENEFICIOS_DS68,
    alert: {
      title: 'Altura no acreditada',
      text: 'La proximidad peatonal a una estación no habilita por sí sola el incremento de altura de hasta 50 % del artículo 2.6.9.',
    },
    requirements: [
      {
        label: 'Estaciones proyectadas',
        text: 'Debe acreditarse que la estación o el tramo en que se emplaza cuenta con contrato de construcción o de concesión adjudicado.',
      },
      REQ_ESTACIONAMIENTOS,
      REQ_CONSTRUCTIBILIDAD,
    ],
    notes: [],
    references: REFERENCIAS_DS68,
  },
};

/** Sección común dentro de «Ver fundamento»; no es una condición cartográfica. */
export const HEIGHT_RULE = {
  title: 'Incremento potencial de altura',
  text: 'Determinados proyectos acogidos a Conjunto Armónico pueden exceder hasta en 50 % la altura máxima establecida por el Plan Regulador, siempre que cumplan los requisitos del artículo 2.6.9 y las condiciones copulativas incorporadas por el DS N.° 68.',
  conditions: [
    'Cumplir los requisitos previos del artículo 2.6.9.',
    'Corresponder a un proyecto de viviendas.',
    'Las unidades no deben superar los 90 m² cuando se trate de un proyecto que cumpla la condición de dimensión.',
    'El predio debe enfrentar una vía expresa o troncal en al menos 20 m.',
  ],
  warning: 'Las coberturas VIAL_DS68 y METRO_600 no acreditan por sí solas estas condiciones.',
} as const;

/** Se muestra solo cuando el predio intersecta una Zona de Conservación Histórica. */
export const HISTORIC_ZONE_NOTE = {
  title: 'Consideración por Zona de Conservación Histórica',
  text: 'Los incrementos de altura y constructibilidad de los artículos 2.6.5, 2.6.7 y 2.6.9 pueden ser disminuidos hasta en 25 % por el Plan Regulador Comunal cuando el proyecto se ubique en una Zona de Conservación Histórica.',
  reference: 'Artículo 2.6.19 de la OGUC.',
} as const;

/** Texto permanente al pie de todas las tarjetas. */
export const GENERAL_NOTICE =
  'Información referencial. La aplicación de los beneficios depende de las características del proyecto y de la verificación de todos los requisitos establecidos en la OGUC y en el instrumento de planificación territorial correspondiente.';
