import {
  PrismaClient,
  NaturalezaCuenta,
  type OrgConfiguracionContable,
  SubClaseCuenta,
} from '@prisma/client';

// Plantilla del Plan de Cuentas inicial para una organización tipo COMERCIAL.
//
// Filosofía: punto de partida MÍNIMO y editable. ~54 cuentas detalle (nivel 4)
// suficientes para operar el día 1, basadas en el PUCT oficial RND-101800000004.
// El admin de la organización puede crear/editar/desactivar libremente, salvo
// las marcadas `esRequeridaSistema = true` (8 cuentas que mapea OrgConfiguracionContable).
//
// La jerarquía completa (nivel 1, 2, 3) se siembra automáticamente como
// agrupadores (esDetalle=false). Total resultante: ~95-100 cuentas.

// Cuentas hoja (nivel 4) que se siembran. Cada una marca:
// - codigo: código PUCT exacto (codigoInterno = codigoPuct en el seed inicial)
// - esRequeridaSistema: si está mapeada por OrgConfiguracionContable y no se puede borrar
// - esContraria: si vive en una clase pero su naturaleza es opuesta (ej: depreciación acumulada)
// - requiereContacto: si los asientos contra esta cuenta deben tener contactoId
interface CuentaHoja {
  codigo: string;
  esRequeridaSistema?: boolean;
  esContraria?: boolean;
  requiereContacto?: boolean;
}

// Lista CORREGIDA tras verificar uno por uno contra el catálogo PUCT real.
// Ver docs/disenos/plan-cuentas-comercial.md para el razonamiento.
// Total: 61 cuentas hoja (todos los códigos verificados al 2026-04-22).
export const CUENTAS_HOJA_COMERCIAL: CuentaHoja[] = [
  // ===== ACTIVO (17) =====
  { codigo: '1.1.1.001' }, // CAJA
  { codigo: '1.1.1.002' }, // BANCOS
  { codigo: '1.1.2.001', requiereContacto: true }, // CUENTAS POR COBRAR
  { codigo: '1.1.2.005', requiereContacto: true }, // CxC AL PERSONAL, SOCIOS Y DIRECTORES
  { codigo: '1.1.2.011', requiereContacto: true }, // ANTICIPOS POR COBRAR
  { codigo: '1.1.2.013' }, // FONDOS A RENDIR
  { codigo: '1.1.3.001' }, // EXISTENCIA DE MERCADERÍAS
  { codigo: '1.1.5.001' }, // GASTOS PAGADOS POR ANTICIPADO
  { codigo: '1.1.6.001', esRequeridaSistema: true }, // IVA CRÉDITO FISCAL
  { codigo: '1.1.6.005' }, // IT PAGADO POR ANTICIPADO
  { codigo: '1.1.6.006' }, // IUE POR COMPENSAR
  { codigo: '1.2.3.001' }, // TERRENOS
  { codigo: '1.2.3.002' }, // EDIFICACIONES
  { codigo: '1.2.3.003' }, // VEHÍCULOS
  { codigo: '1.2.3.004' }, // MUEBLES Y ENSERES DE OFICINA
  { codigo: '1.2.3.006' }, // EQUIPO DE COMPUTACIÓN
  { codigo: '1.2.4.001', esContraria: true }, // DEPRECIACIÓN ACUMULADA BIENES DE USO

  // ===== PASIVO (10) =====
  { codigo: '2.1.2.001', requiereContacto: true }, // CUENTAS POR PAGAR
  { codigo: '2.1.2.005', requiereContacto: true }, // CxP AL PERSONAL, SOCIOS Y DIRECTORES
  { codigo: '2.1.2.016', requiereContacto: true }, // SERVICIOS PROFESIONALES POR PAGAR
  { codigo: '2.1.3.001' }, // SUELDOS Y SALARIOS POR PAGAR
  { codigo: '2.1.3.006' }, // APORTES PATRONALES POR PAGAR
  { codigo: '2.1.4.001', esRequeridaSistema: true }, // IVA DÉBITO FISCAL
  { codigo: '2.1.4.002', esRequeridaSistema: true }, // RC-IVA RETENCIONES A DEPENDIENTES POR PAGAR
  { codigo: '2.1.4.004', esRequeridaSistema: true }, // IMPUESTO A LAS TRANSACCIONES POR PAGAR
  { codigo: '2.1.5.001' }, // PROVISIÓN PARA AGUINALDOS
  { codigo: '2.2.1.001' }, // PRÉSTAMOS FINANCIEROS POR PAGAR

  // ===== PATRIMONIO (5) =====
  { codigo: '3.1.1.001' }, // CAPITAL
  { codigo: '3.1.2.001' }, // RESERVA LEGAL
  { codigo: '3.1.3.001', esRequeridaSistema: true }, // RESULTADOS ACUMULADOS
  { codigo: '3.1.4.001', esRequeridaSistema: true }, // UTILIDAD DE LA GESTIÓN
  { codigo: '3.1.4.002' }, // PÉRDIDA DE LA GESTIÓN

  // ===== INGRESO (5) =====
  { codigo: '4.1.1.001' }, // INGRESOS POR VENTAS DE MERCADERÍAS
  { codigo: '4.2.1.002' }, // INTERESES FINANCIEROS GANADOS
  { codigo: '4.3.1.011' }, // DESCUENTOS OBTENIDOS POR PRONTO PAGO
  { codigo: '4.3.1.012' }, // OTROS INGRESOS
  { codigo: '4.4.1.003', esRequeridaSistema: true }, // DIFERENCIA DE CAMBIO (ganancia)

  // ===== EGRESO (24) =====
  // 5.1 Costos operativos
  { codigo: '5.1.1.001' }, // COSTO DE VENTAS DE MERCADERÍAS

  // 5.2 Administración
  { codigo: '5.2.1.001' }, // SUELDOS Y SALARIOS
  { codigo: '5.2.1.006' }, // APORTES PATRONALES
  { codigo: '5.2.1.009' }, // AGUINALDOS
  { codigo: '5.2.1.010' }, // OTROS BENEFICIOS SOCIALES
  { codigo: '5.2.2.001' }, // SERVICIO DE ENERGÍA ELÉCTRICA
  { codigo: '5.2.2.002' }, // SERVICIO DE AGUA Y ALCANTARILLADO
  { codigo: '5.2.2.003' }, // SERVICIO DE TELEFONÍA Y TELECOMUNICACIÓN
  { codigo: '5.2.2.008' }, // MANTENIMIENTO Y REPARACIONES
  { codigo: '5.2.2.012' }, // ALQUILERES
  { codigo: '5.2.2.018' }, // MATERIAL DE ESCRITORIO
  { codigo: '5.2.2.020' }, // COMBUSTIBLE
  { codigo: '5.2.3.003' }, // SERVICIOS PROFESIONALES
  { codigo: '5.2.4.001' }, // DEPRECIACIONES BIENES DE USO
  { codigo: '5.2.5.002' }, // IMPUESTO A LAS TRANSACCIONES (gasto)
  { codigo: '5.2.5.003' }, // IMPUESTO SOBRE LAS UTILIDADES DE LAS EMPRESAS
  { codigo: '5.2.6.002' }, // OTROS GASTOS

  // 5.3 Comercialización
  { codigo: '5.3.2.032' }, // GASTOS DE DISTRIBUCIÓN O VENTAS
  { codigo: '5.3.3.003' }, // PUBLICIDAD EN MEDIOS TRADICIONALES
  { codigo: '5.3.3.005' }, // PROMOCIONES Y MERCADEO

  // 5.4 Financieros
  { codigo: '5.4.1.002' }, // INTERESES FINANCIEROS PAGADOS
  { codigo: '5.4.1.005' }, // COMISIONES BANCARIAS
  { codigo: '5.4.1.006' }, // OTROS GASTOS FINANCIEROS

  // 5.6 Ajustes y diferencias de cambio
  { codigo: '5.6.1.003', esRequeridaSistema: true }, // DIFERENCIA DE CAMBIO (pérdida)
];

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

// Devuelve el código del padre directo: "1.1.1.001" → "1.1.1"
function padreDirecto(codigo: string): string | null {
  const segmentos = codigo.split('.');
  if (segmentos.length === 1) return null;
  return segmentos.slice(0, -1).join('.');
}

export interface SeedPlanCuentasResult {
  totalCuentas: number;
  porNivel: Record<number, number>;
  // Mapa de codigoPuct → id de Cuenta creada. Útil para que el caller
  // arme OrgConfiguracionContable apuntando a las cuentas correctas.
  porCodigoPuct: Record<string, string>;
}

export async function sembrarPlanCuentasComercial(
  prisma: PrismaClient,
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

  // 2. Cargar info del CatalogoPuct para todos los códigos necesarios.
  const puctEntries = await prisma.catalogoPuct.findMany({
    where: { codigo: { in: [...codigosNecesarios] } },
    select: {
      codigo: true,
      nivel: true,
      nombre: true,
      claseCuenta: true,
      versionPuct: true,
    },
  });

  // Validar que todos los códigos existan en el catálogo. Si falta alguno
  // es un bug del seed (código mal escrito) o un cambio del PUCT.
  const puctMap = new Map(puctEntries.map((p) => [p.codigo, p]));
  for (const codigo of codigosNecesarios) {
    if (!puctMap.has(codigo)) {
      throw new Error(
        `Código PUCT "${codigo}" no encontrado en CatalogoPuct. ` +
          `Verificar prisma/seeds/prod/planes-cuentas/comercial.ts y/o re-correr seed:puct.`,
      );
    }
  }

  // 3. Indice rápido de flags por código (esRequerida, esContraria, requiereContacto).
  const flagsPorCodigo = new Map(CUENTAS_HOJA_COMERCIAL.map((c) => [c.codigo, c]));

  // 4. Crear cuentas en orden ascendente por nivel (padres primero).
  const codigosOrdenados = [...codigosNecesarios].sort((a, b) => {
    const na = puctMap.get(a)!.nivel;
    const nb = puctMap.get(b)!.nivel;
    return na - nb || a.localeCompare(b);
  });

  // Mapa codigoInterno → id (para resolver parentId en hijos).
  const idsCreados = new Map<string, string>();
  const porNivel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const codigo of codigosOrdenados) {
    const puct = puctMap.get(codigo)!;
    const flags = flagsPorCodigo.get(codigo);
    const esHoja = codigosHoja.has(codigo);
    const padreCodigo = padreDirecto(codigo);
    const parentId = padreCodigo ? idsCreados.get(padreCodigo) : null;

    if (padreCodigo && !parentId) {
      throw new Error(`Padre "${padreCodigo}" no encontrado al crear "${codigo}"`);
    }

    const naturalezaBase = getNaturalezaPorClase(puct.claseCuenta);
    const naturaleza = flags?.esContraria
      ? naturalezaBase === NaturalezaCuenta.DEUDORA
        ? NaturalezaCuenta.ACREEDORA
        : NaturalezaCuenta.DEUDORA
      : naturalezaBase;

    const subClase = getSubClase(codigo);

    const cuenta = await prisma.cuenta.upsert({
      where: { organizationId_codigoInterno: { organizationId, codigoInterno: codigo } },
      create: {
        organizationId,
        codigoInterno: codigo,
        codigoPuct: codigo,
        nombrePuctSnapshot: puct.nombre,
        versionPuctMapeado: puct.versionPuct,
        nombre: puct.nombre,
        claseCuenta: puct.claseCuenta,
        ...(subClase !== null ? { subClaseCuenta: subClase } : {}),
        naturaleza,
        ...(parentId ? { parentId } : {}),
        nivel: puct.nivel,
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
    porNivel[puct.nivel] = (porNivel[puct.nivel] ?? 0) + 1;
  }

  return {
    totalCuentas: codigosOrdenados.length,
    porNivel,
    porCodigoPuct: Object.fromEntries(idsCreados.entries()),
  };
}

// ============================================================
// Auto-populate OrgConfiguracionContable
// ============================================================
//
// Las cuentas marcadas `esRequeridaSistema: true` en CUENTAS_HOJA_COMERCIAL
// tienen un concepto contable asociado en OrgConfiguracionContable. Este
// mapeo es determinístico (por codigoPuct, validado contra la plantilla
// en el test puct-a-concepto.spec.ts).
//
// Si alguien agrega una cuenta con esRequeridaSistema: true sin mapearla
// acá, el test de coherencia falla. Si la plantilla omite una cuenta
// requerida, `poblarConfiguracionContableRequerida` tira fail loud.
export const MAPEO_PUCT_A_CONCEPTO = {
  '1.1.6.001': 'ivaCreditoId',
  '2.1.4.001': 'ivaDebitoId',
  '2.1.4.002': 'rcIvaRetenidoId',
  '2.1.4.004': 'itPorPagarId',
  '3.1.3.001': 'resultadosAcumuladosId',
  '3.1.4.001': 'resultadoEjercicioId',
  '4.4.1.003': 'difCambioGananciaId',
  '5.6.1.003': 'difCambioPerdidaId',
} as const;

export type ConceptoMapeado = (typeof MAPEO_PUCT_A_CONCEPTO)[keyof typeof MAPEO_PUCT_A_CONCEPTO];

// Auto-populate de OrgConfiguracionContable a partir del resultado del seed
// (porCodigoPuct). Fail loud si alguna cuenta requerida no se creó — es
// síntoma de bug en la plantilla (código mal escrito, omisión, etc).
//
// Los 4 conceptos restantes (iuePorPagarId, ivaCreditoImportacionesId,
// cajaChicaDefaultId, ajustePorInflacionId) quedan null y se mapean manual
// cuando el tenant los necesita.
export async function poblarConfiguracionContableRequerida(
  prisma: PrismaClient,
  organizationId: string,
  porCodigoPuct: Record<string, string>,
): Promise<OrgConfiguracionContable> {
  const faltantes: string[] = [];
  const data: Record<string, string> = {};

  for (const [codigoPuct, concepto] of Object.entries(MAPEO_PUCT_A_CONCEPTO)) {
    const cuentaId = porCodigoPuct[codigoPuct];
    if (cuentaId === undefined) {
      faltantes.push(`${codigoPuct} → ${concepto}`);
      continue;
    }
    data[concepto] = cuentaId;
  }

  if (faltantes.length > 0) {
    throw new Error(
      `La plantilla COMERCIAL no sembró todas las cuentas requeridas por el sistema. ` +
        `Faltan ${faltantes.length}: ${faltantes.join(', ')}. ` +
        `Revisá CUENTAS_HOJA_COMERCIAL en prisma/seeds/prod/planes-cuentas/comercial.ts.`,
    );
  }

  return prisma.orgConfiguracionContable.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}

// Ejecución standalone — siembra el plan en la organización indicada por argv[2].
// Uso: npx ts-node prisma/seeds/prod/planes-cuentas/comercial.ts <organizationId>
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
      const config = await poblarConfiguracionContableRequerida(prisma, orgId, stats.porCodigoPuct);
      const mapeados = Object.values(MAPEO_PUCT_A_CONCEPTO).filter(
        (c) => (config as unknown as Record<string, unknown>)[c] !== null,
      ).length;
      console.info(
        `  Configuración contable: ${mapeados}/${Object.keys(MAPEO_PUCT_A_CONCEPTO).length} conceptos mapeados.`,
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
