/**
 * Escenario de SMOKE para el informe de conciliación bancaria.
 *
 * Siembra el caso que motivó la corrección del arranque: un cheque girado
 * ANTES del punto de partida y todavía sin cobrar, conviviendo con un asiento
 * de apertura. Los dos son líneas contables anteriores al arranque sin
 * movimiento bancario que las reclame, y sin embargo solo UNO es partida
 * conciliatoria — esa es exactamente la ambigüedad que el sistema no puede
 * resolver solo y que la pantalla pone a decisión de quien concilia.
 *
 * Números (todo en BOB):
 *
 *   Libros           30/06 apertura     +1.000,00
 *                    20/06 cheque 4471    −400,00   ← en circulación, sin cobrar
 *                    10/07 depósito       +200,00   ← conciliado con el banco
 *                    ───────────────────────────
 *                    mayor al 31/07        800,00
 *
 *   Extracto         10/07 depósito       +200,00 → saldo publicado 1.200,00
 *
 *   Al declarar el arranque al 30/06 con extracto 1.000,00 y libros 600,00,
 *   la aritmética pide  Σ partidas = 600 − 1000 + 0 = −400,00.
 *   Confirmar SOLO el cheque cierra el informe en residuo 0,00.
 *   Confirmar además la apertura lo rompe en +1.000,00 — a la vista.
 *
 * Idempotente: borra y recrea su propio escenario en cada corrida.
 *
 * Correr:
 *   cd backend
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
 *     pnpm exec ts-node prisma/scripts/seed-smoke-conciliacion.ts
 */
import {
  ClaseCuenta,
  EstadoComprobante,
  EstadoMovimientoBancario,
  EstadoVerificacionExtracto,
  GestionFiscalStatus,
  LadoBancario,
  LadoContable,
  Moneda,
  NaturalezaCuenta,
  PerfilExtracto,
  PeriodoFiscalStatus,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = 'asociacion-piloto';
const CODIGO_BANCO = '1.1.1.002';
const CODIGO_CONTRAPARTE = '1.1.1.003';
const ALIAS_CUENTA = 'BancoSol corriente — smoke';

async function main(): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (org === null) {
    throw new Error(`No existe la organización "${SLUG}". Corré primero: pnpm run seed`);
  }
  const owner = await prisma.membership.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'asc' },
  });
  if (owner === null) {
    throw new Error(`La organización "${SLUG}" no tiene miembros. Corré primero: pnpm run seed`);
  }
  const orgId = org.id;
  const userId = owner.userId;

  await limpiarEscenario(orgId);

  const cuentaBanco = await crearCuenta(orgId, CODIGO_BANCO, 'Banco cuenta corriente');
  const cuentaContraparte = await crearCuenta(orgId, CODIGO_CONTRAPARTE, 'Caja chica');

  const cuentaBancaria = await prisma.cuentaBancaria.create({
    data: {
      organizationId: orgId,
      cuentaId: cuentaBanco,
      alias: ALIAS_CUENTA,
      perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
      numeroCuenta: '1191959-000-001',
      moneda: Moneda.BOB,
    },
  });

  const gestion = await prisma.gestionFiscal.create({
    data: { organizationId: orgId, year: 2026, mesInicio: 1, status: GestionFiscalStatus.ABIERTA },
  });
  const periodos = new Map<number, string>();
  for (const month of [6, 7]) {
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: orgId,
        gestionId: gestion.id,
        year: 2026,
        month,
        ordenEnGestion: month,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodos.set(month, periodo.id);
  }

  const ctx = { orgId, userId, cuentaBanco, cuentaContraparte, periodos };

  // Los DOS anteriores al arranque, indistinguibles para el sistema.
  await crearComprobante(ctx, {
    fecha: '2026-06-30',
    monto: '1000.00',
    ladoBanco: LadoContable.DEBITO,
    glosa: 'Asiento de apertura — saldo inicial de bancos',
    numero: 'D2606-000001',
  });
  await crearComprobante(ctx, {
    fecha: '2026-06-20',
    monto: '400.00',
    ladoBanco: LadoContable.CREDITO,
    glosa: 'Pago a proveedor con cheque 4471 — no cobrado',
    numero: 'D2606-000012',
  });

  // Julio: un depósito que sí quedó conciliado contra su asiento.
  const importacion = await prisma.importacionExtracto.create({
    data: {
      organizationId: orgId,
      cuentaBancariaId: cuentaBancaria.id,
      nombreArchivo: 'extracto-julio-2026.xlsx',
      sha256Archivo: 'smoke'.padEnd(64, '0'),
      tamanioBytes: 4096,
      perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
      fechaDesde: new Date('2026-07-01T00:00:00.000Z'),
      fechaHasta: new Date('2026-07-31T00:00:00.000Z'),
      coberturaDeclarada: true,
      estadoVerificacion: EstadoVerificacionExtracto.VERIFICADO,
      filasLeidas: 1,
      movimientosNuevos: 1,
      movimientosDuplicados: 0,
      importadoPorUserId: userId,
    },
  });

  const comprobanteDeposito = await crearComprobante(ctx, {
    fecha: '2026-07-10',
    monto: '200.00',
    ladoBanco: LadoContable.DEBITO,
    glosa: 'Depósito de cuota social',
    numero: 'D2607-000003',
  });

  const movimiento = await prisma.movimientoBancario.create({
    data: {
      organizationId: orgId,
      cuentaBancariaId: cuentaBancaria.id,
      importacionId: importacion.id,
      fecha: new Date('2026-07-10T00:00:00.000Z'),
      hora: null,
      monto: '200.00',
      tipo: LadoBancario.CREDITO,
      moneda: Moneda.BOB,
      descripcion: 'DEPOSITO EFECTIVO CUOTA SOCIAL',
      descripcionNormalizada: 'DEPOSITO EFECTIVO CUOTA SOCIAL',
      referencia: null,
      saldo: '1200.00',
      contraparteNombre: null,
      contraparteDocumento: null,
      datosOriginales: {},
      ordinalDia: 0,
      hashDedup: 'smoke-mov-deposito-julio',
      estado: EstadoMovimientoBancario.CONCILIADO,
    },
  });

  await prisma.matchConciliacion.create({
    data: {
      organizationId: orgId,
      movimientoBancarioId: movimiento.id,
      comprobanteId: comprobanteDeposito,
      orden: 1,
      snapshotCuentaId: cuentaBanco,
      snapshotMonto: '200.00',
      snapshotTipo: LadoContable.DEBITO,
      snapshotMoneda: Moneda.BOB,
      snapshotFecha: new Date('2026-07-10T00:00:00.000Z'),
      confianzaSugerida: null,
      conciliadoPorUserId: userId,
    },
  });

  console.log(`
Escenario de smoke sembrado.

  Organización     ${SLUG}
  Cuenta bancaria  ${ALIAS_CUENTA}  (${cuentaBancaria.id})

  Mayor al 31/07     Bs   800,00   (apertura 1.000 − cheque 400 + depósito 200)
  Extracto al 31/07  Bs 1.200,00

  Al declarar el arranque al 30/06:
    Saldo según extracto   1000.00
    Saldo según libros      600.00
    Diferencia residual       0.00
    → la pantalla debe pedir que lo confirmado sume Bs -400,00

  Confirmá SOLO "Pago a proveedor con cheque 4471" → residuo 0,00 y conciliado.
  Confirmá también el asiento de apertura → la verificación avisa antes de declarar.
`);
}

async function limpiarEscenario(orgId: string): Promise<void> {
  // Orden inverso a las FKs. El escenario es del smoke: se borra entero y se
  // recrea, así correrlo dos veces no acumula basura ni choca por unicidad.
  await prisma.matchConciliacion.deleteMany({ where: { organizationId: orgId } });
  await prisma.arranquePartidaAbierta.deleteMany({ where: { organizationId: orgId } });
  await prisma.arranqueConciliado.deleteMany({ where: { organizationId: orgId } });
  await prisma.movimientoBancario.deleteMany({ where: { organizationId: orgId } });
  await prisma.importacionExtracto.deleteMany({ where: { organizationId: orgId } });
  await prisma.cuentaBancaria.deleteMany({ where: { organizationId: orgId } });
  await prisma.lineaComprobante.deleteMany({ where: { organizationId: orgId } });
  await prisma.comprobante.deleteMany({ where: { organizationId: orgId } });
  await prisma.cuenta.deleteMany({
    where: { organizationId: orgId, codigoInterno: { in: [CODIGO_BANCO, CODIGO_CONTRAPARTE] } },
  });
  await prisma.periodoFiscal.deleteMany({ where: { organizationId: orgId } });
  await prisma.gestionFiscal.deleteMany({ where: { organizationId: orgId } });
}

async function crearCuenta(orgId: string, codigoInterno: string, nombre: string): Promise<string> {
  const cuenta = await prisma.cuenta.create({
    data: {
      organizationId: orgId,
      codigoInterno,
      nombre,
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      nivel: 4,
      esDetalle: true,
      requiereContacto: false,
    },
  });
  return cuenta.id;
}

interface Ctx {
  orgId: string;
  userId: string;
  cuentaBanco: string;
  cuentaContraparte: string;
  periodos: Map<number, string>;
}

/** Comprobante CONTABILIZADO de dos líneas, con la pata banco en `ladoBanco`. */
async function crearComprobante(
  ctx: Ctx,
  opts: { fecha: string; monto: string; ladoBanco: LadoContable; glosa: string; numero: string },
): Promise<string> {
  const mes = Number(opts.fecha.slice(5, 7));
  const periodoFiscalId = ctx.periodos.get(mes);
  if (periodoFiscalId === undefined) throw new Error(`Sin período fiscal para el mes ${mes}`);

  const debitoBanco = opts.ladoBanco === LadoContable.DEBITO;
  const monto = opts.monto;
  const cero = '0';

  const comprobante = await prisma.comprobante.create({
    data: {
      organizationId: ctx.orgId,
      tipo: TipoComprobante.DIARIO,
      numero: opts.numero,
      estado: EstadoComprobante.CONTABILIZADO,
      fechaContable: new Date(`${opts.fecha}T00:00:00.000Z`),
      periodoFiscalId,
      glosa: opts.glosa,
      monedaPrincipal: Moneda.BOB,
      totalDebitoBob: monto,
      totalCreditoBob: monto,
      createdByUserId: ctx.userId,
      lineas: {
        create: [
          {
            organizationId: ctx.orgId,
            orden: 1,
            cuentaId: ctx.cuentaBanco,
            moneda: Moneda.BOB,
            debito: debitoBanco ? monto : cero,
            credito: debitoBanco ? cero : monto,
            tipoCambio: '1',
            debitoBob: debitoBanco ? monto : cero,
            creditoBob: debitoBanco ? cero : monto,
          },
          {
            organizationId: ctx.orgId,
            orden: 2,
            cuentaId: ctx.cuentaContraparte,
            moneda: Moneda.BOB,
            debito: debitoBanco ? cero : monto,
            credito: debitoBanco ? monto : cero,
            tipoCambio: '1',
            debitoBob: debitoBanco ? cero : monto,
            creditoBob: debitoBanco ? monto : cero,
          },
        ],
      },
    },
  });
  return comprobante.id;
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
