import {
  PrismaClient,
  Prisma,
  NaturalezaCuenta,
  type ClaseCuenta,
  type OrgConfiguracionContable,
  SubClaseCuenta,
} from '@prisma/client';

// Plantilla del Plan de Cuentas inicial para una organización tipo COMERCIAL.
//
// Filosofía: punto de partida MÍNIMO y editable. 61 cuentas detalle (nivel 4)
// suficientes para operar el día 1, con numeración estilo PUCT oficial
// RND-101800000004 usada como código interno puro. El admin de la organización
// puede crear/editar/desactivar libremente, salvo las marcadas
// `esRequeridaSistema = true` (8 cuentas que mapea OrgConfiguracionContable).
//
// La jerarquía completa (nivel 1, 2, 3) se siembra automáticamente como
// agrupadores (esDetalle=false). Total resultante: 110 cuentas.
//
// Datos AUTOCONTENIDOS: el seed ya NO consulta `CatalogoPuct`. `nombre` se
// inlinea por hoja y por ancestro (NOMBRES_ANCESTRO); `nivel` y `claseCuenta`
// se derivan del código (son funciones puras del mismo).

// Cuentas hoja (nivel 4) que se siembran. Cada una marca:
// - codigo: numeración jerárquica que pasa a ser codigoInterno de la cuenta
// - nombre: nombre de la cuenta (inlineado; antes venía de CatalogoPuct.nombre)
// - esRequeridaSistema: si está mapeada por OrgConfiguracionContable y no se puede borrar
// - esContraria: si vive en una clase pero su naturaleza es opuesta (ej: depreciación acumulada)
// - requiereContacto: si los asientos contra esta cuenta deben tener contactoId
interface CuentaHoja {
  codigo: string;
  nombre: string;
  esRequeridaSistema?: boolean;
  esContraria?: boolean;
  requiereContacto?: boolean;
}

// Lista CORREGIDA tras verificar uno por uno contra el catálogo oficial.
// Ver docs/disenos/plan-cuentas-comercial.md para el razonamiento.
// Total: 61 cuentas hoja (todos los códigos verificados al 2026-04-22).
export const CUENTAS_HOJA_COMERCIAL: CuentaHoja[] = [
  // ===== ACTIVO (17) =====
  { codigo: '1.1.1.001', nombre: 'CAJA' },
  { codigo: '1.1.1.002', nombre: 'BANCOS' },
  { codigo: '1.1.2.001', nombre: 'CUENTAS POR COBRAR', requiereContacto: true },
  {
    codigo: '1.1.2.005',
    nombre: 'CUENTAS POR COBRAR AL PERSONAL, SOCIOS Y DIRECTORES',
    requiereContacto: true,
  },
  { codigo: '1.1.2.011', nombre: 'ANTICIPOS POR COBRAR', requiereContacto: true },
  { codigo: '1.1.2.013', nombre: 'FONDOS A RENDIR' },
  { codigo: '1.1.3.001', nombre: 'EXISTENCIA DE MERCADERÍAS' },
  { codigo: '1.1.5.001', nombre: 'GASTOS PAGADOS POR ANTICIPADO' },
  { codigo: '1.1.6.001', nombre: 'IVA CRÉDITO FISCAL', esRequeridaSistema: true },
  { codigo: '1.1.6.005', nombre: 'IT PAGADO POR ANTICIPADO' },
  { codigo: '1.1.6.006', nombre: 'IUE POR COMPENSAR' },
  { codigo: '1.2.3.001', nombre: 'TERRENOS' },
  { codigo: '1.2.3.002', nombre: 'EDIFICACIONES' },
  { codigo: '1.2.3.003', nombre: 'VEHÍCULOS' },
  { codigo: '1.2.3.004', nombre: 'MUEBLES Y ENSERES DE OFICINA' },
  { codigo: '1.2.3.006', nombre: 'EQUIPO DE COMPUTACIÓN' },
  { codigo: '1.2.4.001', nombre: 'DEPRECIACIÓN ACUMULADA BIENES DE USO', esContraria: true },

  // ===== PASIVO (10) =====
  { codigo: '2.1.2.001', nombre: 'CUENTAS POR PAGAR', requiereContacto: true },
  {
    codigo: '2.1.2.005',
    nombre: 'CUENTAS POR PAGAR AL PERSONAL, SOCIOS Y DIRECTORES',
    requiereContacto: true,
  },
  { codigo: '2.1.2.016', nombre: 'SERVICIOS PROFESIONALES POR PAGAR', requiereContacto: true },
  { codigo: '2.1.3.001', nombre: 'SUELDOS Y SALARIOS POR PAGAR' },
  { codigo: '2.1.3.006', nombre: 'APORTES PATRONALES POR PAGAR' },
  { codigo: '2.1.4.001', nombre: 'IVA DÉBITO FISCAL', esRequeridaSistema: true },
  {
    codigo: '2.1.4.002',
    nombre: 'RC-IVA RETENCIONES A DEPENDIENTES POR PAGAR',
    esRequeridaSistema: true,
  },
  {
    codigo: '2.1.4.004',
    nombre: 'IMPUESTO A LAS TRANSACCIONES POR PAGAR',
    esRequeridaSistema: true,
  },
  { codigo: '2.1.5.001', nombre: 'PROVISIÓN PARA AGUINALDOS' },
  { codigo: '2.2.1.001', nombre: 'PRÉSTAMOS FINANCIEROS POR PAGAR' },

  // ===== PATRIMONIO (5) =====
  { codigo: '3.1.1.001', nombre: 'CAPITAL' },
  { codigo: '3.1.2.001', nombre: 'RESERVA LEGAL' },
  { codigo: '3.1.3.001', nombre: 'RESULTADOS ACUMULADOS', esRequeridaSistema: true },
  // Cuenta transitoria DUAL del cierre (REQ-CTA-CIERRE-01, Ley 843 art. 46):
  // utilidad → saldo acreedor, pérdida → saldo deudor. Mapeada a resultadoEjercicioId.
  { codigo: '3.1.4.001', nombre: 'RESULTADO DE LA GESTIÓN', esRequeridaSistema: true },

  // ===== INGRESO (5) =====
  { codigo: '4.1.1.001', nombre: 'INGRESOS POR VENTAS DE MERCADERÍAS' },
  { codigo: '4.2.1.002', nombre: 'INTERESES FINANCIEROS GANADOS' },
  { codigo: '4.3.1.011', nombre: 'DESCUENTOS OBTENIDOS POR PRONTO PAGO' },
  { codigo: '4.3.1.012', nombre: 'OTROS INGRESOS' },
  { codigo: '4.4.1.003', nombre: 'DIFERENCIA DE CAMBIO', esRequeridaSistema: true }, // ganancia

  // ===== EGRESO (24) =====
  // 5.1 Costos operativos
  { codigo: '5.1.1.001', nombre: 'COSTO DE VENTAS DE MERCADERÍAS' },

  // 5.2 Administración
  { codigo: '5.2.1.001', nombre: 'SUELDOS Y SALARIOS' },
  { codigo: '5.2.1.006', nombre: 'APORTES PATRONALES' },
  { codigo: '5.2.1.009', nombre: 'AGUINALDOS' },
  { codigo: '5.2.1.010', nombre: 'OTROS BENEFICIOS SOCIALES' },
  { codigo: '5.2.2.001', nombre: 'SERVICIO DE ENERGÍA ELÉCTRICA' },
  { codigo: '5.2.2.002', nombre: 'SERVICIO DE AGUA Y ALCANTARILLADO' },
  { codigo: '5.2.2.003', nombre: 'SERVICIO DE TELEFONÍA Y TELECOMUNICACIÓN' },
  { codigo: '5.2.2.008', nombre: 'MANTENIMIENTO Y REPARACIONES' },
  { codigo: '5.2.2.012', nombre: 'ALQUILERES' },
  { codigo: '5.2.2.018', nombre: 'MATERIAL DE ESCRITORIO' },
  { codigo: '5.2.2.020', nombre: 'COMBUSTIBLE' },
  { codigo: '5.2.3.003', nombre: 'SERVICIOS PROFESIONALES' },
  { codigo: '5.2.4.001', nombre: 'DEPRECIACIONES BIENES DE USO' },
  { codigo: '5.2.5.002', nombre: 'IMPUESTO A LAS TRANSACCIONES' }, // gasto
  { codigo: '5.2.5.003', nombre: 'IMPUESTO SOBRE LAS UTILIDADES DE LAS EMPRESAS' },
  { codigo: '5.2.6.002', nombre: 'OTROS GASTOS' },

  // 5.3 Comercialización
  { codigo: '5.3.2.032', nombre: 'GASTOS DE DISTRIBUCIÓN O VENTAS' },
  { codigo: '5.3.3.003', nombre: 'PUBLICIDAD EN MEDIOS TRADICIONALES' },
  { codigo: '5.3.3.005', nombre: 'PROMOCIONES Y MERCADEO' },

  // 5.4 Financieros
  { codigo: '5.4.1.002', nombre: 'INTERESES FINANCIEROS PAGADOS' },
  { codigo: '5.4.1.005', nombre: 'COMISIONES BANCARIAS' },
  { codigo: '5.4.1.006', nombre: 'OTROS GASTOS FINANCIEROS' },

  // 5.6 Ajustes y diferencias de cambio
  { codigo: '5.6.1.003', nombre: 'DIFERENCIA DE CAMBIO', esRequeridaSistema: true }, // pérdida
];

// Nombres de los agrupadores (niveles 1-3). Antes venían de CatalogoPuct.nombre;
// ahora se inlinean porque no son derivables del código. Cubre todos los
// ancestros únicos de las 61 hojas.
const NOMBRES_ANCESTRO: Record<string, string> = {
  // Nivel 1 (clases)
  '1': 'ACTIVO',
  '2': 'PASIVO',
  '3': 'PATRIMONIO',
  '4': 'INGRESOS',
  '5': 'EGRESOS',
  // Nivel 2 (grupos)
  '1.1': 'ACTIVO CORRIENTE',
  '1.2': 'ACTIVO NO CORRIENTE',
  '2.1': 'PASIVO CORRIENTE',
  '2.2': 'PASIVO NO CORRIENTE',
  '3.1': 'PATRIMONIO',
  '4.1': 'INGRESOS OPERATIVOS',
  '4.2': 'INGRESOS FINANCIEROS',
  '4.3': 'OTROS INGRESOS',
  '4.4': 'AJUSTES Y DIFERENCIAS DE CAMBIO',
  '5.1': 'COSTOS OPERATIVOS',
  '5.2': 'GASTOS DE ADMINISTRACIÓN',
  '5.3': 'GASTOS DE COMERCIALIZACIÓN',
  '5.4': 'GASTOS FINANCIEROS',
  '5.6': 'AJUSTES Y DIFERENCIAS DE CAMBIO',
  // Nivel 3 (subgrupos)
  '1.1.1': 'EFECTIVO Y EQUIVALENTES DE EFECTIVO',
  '1.1.2': 'EXIGIBLE DE CORTO PLAZO',
  '1.1.3': 'REALIZABLE DE CORTO PLAZO',
  '1.1.5': 'ACTIVOS DIFERIDOS A CORTO PLAZO',
  '1.1.6': 'CUENTAS FISCALES',
  '1.2.3': 'PROPIEDADES, PLANTA y EQUIPO',
  '1.2.4': 'DEPRECIACIÓN ACUMULADA',
  '2.1.2': 'CUENTAS POR PAGAR A CORTO PLAZO',
  '2.1.3': 'OBLIGACIONES SOCIALES',
  '2.1.4': 'OBLIGACIONES FISCALES',
  '2.1.5': 'PROVISIONES',
  '2.2.1': 'OBLIGACIONES FINANCIERAS A LARGO PLAZO',
  '3.1.1': 'CAPITAL',
  '3.1.2': 'RESERVAS',
  '3.1.3': 'RESULTADOS ACUMULADOS',
  '3.1.4': 'RESULTADOS DEL EJERCICIO',
  '4.1.1': 'INGRESOS POR VENTAS',
  '4.2.1': 'INGRESOS FINANCIEROS',
  '4.3.1': 'OTROS INGRESOS',
  '4.4.1': 'AJUSTES Y DIFERENCIAS DE CAMBIO',
  '5.1.1': 'COSTO DE VENTAS',
  '5.2.1': 'REMUNERACIONES',
  '5.2.2': 'GASTOS GENERALES DE OFICINA',
  '5.2.3': 'SERVICIOS ESPECIALIZADOS',
  '5.2.4': 'DEPRECIACIONES BIENES DE USO Y AMORTIZACIONES',
  '5.2.5': 'IMPUESTOS, TASAS Y PATENTES',
  '5.2.6': 'OTROS GASTOS DE ADMINISTRACIÓN',
  '5.3.2': 'GASTOS OPERACIONALES',
  '5.3.3': 'PUBLICIDAD, MARKETING Y PROPAGANDA',
  '5.4.1': 'GASTOS BANCARIOS',
  '5.6.1': 'AJUSTES Y DIFERENCIAS DE CAMBIO',
};

// El primer dígito del código determina la ClaseCuenta (RND-101800000004).
// Re-homed desde el parser PUCT (borrado): es la única copia viva del mapeo.
const CLASE_POR_DIGITO: Record<string, ClaseCuenta> = {
  '1': 'ACTIVO',
  '2': 'PASIVO',
  '3': 'PATRIMONIO',
  '4': 'INGRESO',
  '5': 'EGRESO',
};

// Deriva la clase de cuenta del primer segmento del código jerárquico.
function claseCuentaDe(codigo: string): ClaseCuenta {
  const primerSegmento = codigo.split('.')[0];
  const clase = primerSegmento ? CLASE_POR_DIGITO[primerSegmento] : undefined;
  if (!clase) {
    throw new Error(`Dígito de clase desconocido en código "${codigo}" (esperado 1..5)`);
  }
  return clase;
}

// Devuelve el nombre de una cuenta: para hojas sale del registro de
// CUENTAS_HOJA_COMERCIAL; para ancestros, de NOMBRES_ANCESTRO.
function nombreDe(codigo: string, esHoja: boolean): string {
  if (esHoja) {
    const hoja = CUENTAS_HOJA_COMERCIAL.find((c) => c.codigo === codigo);
    if (!hoja) throw new Error(`Cuenta hoja "${codigo}" sin nombre en la plantilla`);
    return hoja.nombre;
  }
  const nombre = NOMBRES_ANCESTRO[codigo];
  if (!nombre) {
    throw new Error(`Ancestro "${codigo}" sin nombre en NOMBRES_ANCESTRO`);
  }
  return nombre;
}

// Mapping del código de grupo (nivel 2) a la SubClaseCuenta NIIF/PCGA.
// Refleja la estructura real del PUCT (RND-101800000004), no NIIF puro.
// Las cuentas hoja heredan el subClaseCuenta del grupo donde viven.
const SUB_CLASE_POR_GRUPO: Record<string, SubClaseCuenta> = {
  '1.1': SubClaseCuenta.ACTIVO_CORRIENTE,
  '1.2': SubClaseCuenta.ACTIVO_NO_CORRIENTE,
  '2.1': SubClaseCuenta.PASIVO_CORRIENTE,
  '2.2': SubClaseCuenta.PASIVO_NO_CORRIENTE,
  '3.1': SubClaseCuenta.PATRIMONIO_CAPITAL, // afinado por subgrupo en getSubClase()
  '4.1': SubClaseCuenta.INGRESO_OPERATIVO,
  '4.2': SubClaseCuenta.INGRESO_NO_OPERATIVO, // 4.2 INGRESOS FINANCIEROS
  '4.3': SubClaseCuenta.INGRESO_NO_OPERATIVO, // 4.3 OTROS INGRESOS
  '4.4': SubClaseCuenta.INGRESO_NO_OPERATIVO, // 4.4 AJUSTES Y DIFERENCIAS DE CAMBIO
  '5.1': SubClaseCuenta.EGRESO_OPERATIVO, // 5.1 COSTOS OPERATIVOS
  '5.2': SubClaseCuenta.EGRESO_ADMINISTRATIVO, // 5.2 GASTOS DE ADMINISTRACIÓN
  '5.3': SubClaseCuenta.EGRESO_COMERCIALIZACION, // 5.3 GASTOS DE COMERCIALIZACIÓN
  '5.4': SubClaseCuenta.EGRESO_FINANCIERO, // 5.4 GASTOS FINANCIEROS
  '5.5': SubClaseCuenta.EGRESO_NO_OPERATIVO, // 5.5 OTROS GASTOS
  '5.6': SubClaseCuenta.EGRESO_NO_OPERATIVO, // 5.6 AJUSTES Y DIFERENCIAS DE CAMBIO
};

// Patrimonio se afina por subgrupo (nivel 3): 3.1.1 y 3.1.2 son CAPITAL, 3.1.3 y 3.1.4 son RESULTADOS.
function getSubClase(codigo: string): SubClaseCuenta | null {
  const segmentos = codigo.split('.');
  if (segmentos.length === 1) return null; // nivel 1: agrupador raíz, sin subClase
  const grupo = `${segmentos[0]}.${segmentos[1]}`;

  // Caso especial Patrimonio: depende del subgrupo.
  if (grupo === '3.1' && segmentos.length >= 3) {
    const subgrupo = segmentos[2];
    if (subgrupo === '3' || subgrupo === '4') {
      return SubClaseCuenta.PATRIMONIO_RESULTADOS;
    }
    return SubClaseCuenta.PATRIMONIO_CAPITAL;
  }

  return SUB_CLASE_POR_GRUPO[grupo] ?? null;
}

// Devuelve la naturaleza estándar de una clase de cuenta. Las contrarias
// invierten esta naturaleza (ej: Depreciación Acumulada vive en ACTIVO
// pero es ACREEDORA).
function getNaturalezaPorClase(claseCuenta: string): NaturalezaCuenta {
  switch (claseCuenta) {
    case 'ACTIVO':
    case 'EGRESO':
      return NaturalezaCuenta.DEUDORA;
    case 'PASIVO':
    case 'PATRIMONIO':
    case 'INGRESO':
      return NaturalezaCuenta.ACREEDORA;
    default:
      throw new Error(`Clase de cuenta desconocida: ${claseCuenta}`);
  }
}

// Calcula todos los ancestros únicos de un código jerárquico.
// "1.1.1.001" → ["1", "1.1", "1.1.1"]
function ancestrosDe(codigo: string): string[] {
  const segmentos = codigo.split('.');
  const ancestros: string[] = [];
  for (let i = 1; i < segmentos.length; i++) {
    ancestros.push(segmentos.slice(0, i).join('.'));
  }
  return ancestros;
}

// Nivel = cantidad de segmentos del código. "1" → 1, "1.1.1.001" → 4.
function nivelDe(codigo: string): number {
  return codigo.split('.').length;
}

// Devuelve el código del padre directo: "1.1.1.001" → "1.1.1"
function padreDirecto(codigo: string): string | null {
  const segmentos = codigo.split('.');
  if (segmentos.length === 1) return null;
  return segmentos.slice(0, -1).join('.');
}

export interface SeedPlanCuentasResult {
  totalCuentas: number;
  porNivel: Record<number, number>;
  // Mapa de codigoInterno → id de Cuenta creada. Útil para que el caller
  // arme OrgConfiguracionContable apuntando a las cuentas correctas.
  porCodigoInterno: Record<string, string>;
}

export async function sembrarPlanCuentasComercial(
  prisma: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<SeedPlanCuentasResult> {
  // 1. Recolectar TODOS los códigos necesarios (hojas + ancestros únicos).
  const codigosHoja = new Set(CUENTAS_HOJA_COMERCIAL.map((c) => c.codigo));
  const codigosAncestro = new Set<string>();
  for (const hoja of CUENTAS_HOJA_COMERCIAL) {
    for (const ancestro of ancestrosDe(hoja.codigo)) {
      codigosAncestro.add(ancestro);
    }
  }
  const codigosNecesarios = new Set([...codigosHoja, ...codigosAncestro]);

  // 2. Indice rápido de flags por código (esRequerida, esContraria, requiereContacto).
  const flagsPorCodigo = new Map(CUENTAS_HOJA_COMERCIAL.map((c) => [c.codigo, c]));

  // 3. Crear cuentas en orden ascendente por nivel (padres primero).
  const codigosOrdenados = [...codigosNecesarios].sort((a, b) => {
    const na = nivelDe(a);
    const nb = nivelDe(b);
    return na - nb || a.localeCompare(b);
  });

  // Mapa codigoInterno → id (para resolver parentId en hijos).
  const idsCreados = new Map<string, string>();
  const porNivel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const codigo of codigosOrdenados) {
    const flags = flagsPorCodigo.get(codigo);
    const esHoja = codigosHoja.has(codigo);
    const padreCodigo = padreDirecto(codigo);
    const parentId = padreCodigo ? idsCreados.get(padreCodigo) : null;

    if (padreCodigo && !parentId) {
      throw new Error(`Padre "${padreCodigo}" no encontrado al crear "${codigo}"`);
    }

    const claseCuenta = claseCuentaDe(codigo);
    const naturalezaBase = getNaturalezaPorClase(claseCuenta);
    const naturaleza = flags?.esContraria
      ? naturalezaBase === NaturalezaCuenta.DEUDORA
        ? NaturalezaCuenta.ACREEDORA
        : NaturalezaCuenta.DEUDORA
      : naturalezaBase;

    const subClase = getSubClase(codigo);
    const nivel = nivelDe(codigo);

    const cuenta = await prisma.cuenta.upsert({
      where: { organizationId_codigoInterno: { organizationId, codigoInterno: codigo } },
      create: {
        organizationId,
        codigoInterno: codigo,
        nombre: nombreDe(codigo, esHoja),
        claseCuenta,
        ...(subClase !== null ? { subClaseCuenta: subClase } : {}),
        naturaleza,
        ...(parentId ? { parentId } : {}),
        nivel,
        esDetalle: esHoja,
        requiereContacto: flags?.requiereContacto ?? false,
        esContraria: flags?.esContraria ?? false,
        activa: true,
        esSystemSeed: true,
        esRequeridaSistema: flags?.esRequeridaSistema ?? false,
      },
      update: {}, // idempotente: si la cuenta ya existe, no la tocamos
    });

    idsCreados.set(codigo, cuenta.id);
    porNivel[nivel] = (porNivel[nivel] ?? 0) + 1;
  }

  return {
    totalCuentas: codigosOrdenados.length,
    porNivel,
    porCodigoInterno: Object.fromEntries(idsCreados.entries()),
  };
}

// ============================================================
// Auto-populate OrgConfiguracionContable
// ============================================================
//
// Las cuentas marcadas `esRequeridaSistema: true` en CUENTAS_HOJA_COMERCIAL
// tienen un concepto contable asociado en OrgConfiguracionContable. Este
// mapeo es determinístico (por codigoInterno, validado contra la plantilla
// en el test codigo-a-concepto.spec.ts).
//
// Si alguien agrega una cuenta con esRequeridaSistema: true sin mapearla
// acá, el test de coherencia falla. Si la plantilla omite una cuenta
// requerida, `poblarConfiguracionContableRequerida` tira fail loud.
export const MAPEO_CODIGO_A_CONCEPTO = {
  '1.1.6.001': 'ivaCreditoId',
  '2.1.4.001': 'ivaDebitoId',
  '2.1.4.002': 'rcIvaRetenidoId',
  '2.1.4.004': 'itPorPagarId',
  '3.1.3.001': 'resultadosAcumuladosId',
  '3.1.4.001': 'resultadoEjercicioId',
  '4.4.1.003': 'difCambioGananciaId',
  '5.6.1.003': 'difCambioPerdidaId',
} as const;

export type ConceptoMapeado =
  (typeof MAPEO_CODIGO_A_CONCEPTO)[keyof typeof MAPEO_CODIGO_A_CONCEPTO];

// Auto-populate de OrgConfiguracionContable a partir del resultado del seed
// (porCodigoInterno). Fail loud si alguna cuenta requerida no se creó — es
// síntoma de bug en la plantilla (código mal escrito, omisión, etc).
//
// Los 4 conceptos restantes (iuePorPagarId, ivaCreditoImportacionesId,
// cajaChicaDefaultId, ajustePorInflacionId) quedan null y se mapean manual
// cuando el tenant los necesita.
export async function poblarConfiguracionContableRequerida(
  prisma: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  porCodigoInterno: Record<string, string>,
): Promise<OrgConfiguracionContable> {
  const faltantes: string[] = [];
  const data: Record<string, string> = {};

  for (const [codigo, concepto] of Object.entries(MAPEO_CODIGO_A_CONCEPTO)) {
    const cuentaId = porCodigoInterno[codigo];
    if (cuentaId === undefined) {
      faltantes.push(`${codigo} → ${concepto}`);
      continue;
    }
    data[concepto] = cuentaId;
  }

  if (faltantes.length > 0) {
    throw new Error(
      `La plantilla COMERCIAL no sembró todas las cuentas requeridas por el sistema. ` +
        `Faltan ${faltantes.length}: ${faltantes.join(', ')}. ` +
        `Revisá CUENTAS_HOJA_COMERCIAL en src/cuentas/adapters/seed/comercial.ts.`,
    );
  }

  return prisma.orgConfiguracionContable.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}

// Ejecución standalone — siembra el plan en la organización indicada por argv[2].
// Uso: npx ts-node src/cuentas/adapters/seed/comercial.ts <organizationId>
if (require.main === module) {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error('Uso: ts-node comercial.ts <organizationId>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  sembrarPlanCuentasComercial(prisma, orgId)
    .then(async (stats) => {
      console.info(`Plan de cuentas COMERCIAL sembrado en org ${orgId}:`);
      console.info(`  Total cuentas: ${stats.totalCuentas}`);
      console.info(`  Distribución por nivel:`, stats.porNivel);
      const config = await poblarConfiguracionContableRequerida(
        prisma,
        orgId,
        stats.porCodigoInterno,
      );
      const mapeados = Object.values(MAPEO_CODIGO_A_CONCEPTO).filter(
        (c) => (config as unknown as Record<string, unknown>)[c] !== null,
      ).length;
      console.info(
        `  Configuración contable: ${mapeados}/${Object.keys(MAPEO_CODIGO_A_CONCEPTO).length} conceptos mapeados.`,
      );
    })
    .catch((err) => {
      console.error('Seed falló:', err);
      process.exit(1);
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
