import {
  ClaseCuenta,
  EstadoComprobante,
  EstadoMovimientoBancario,
  GestionFiscalStatus,
  LadoContable,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  PerfilExtracto,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { PrismaLineasCuentaReaderAdapter } from '@/comprobantes/adapters/prisma-lineas-cuenta-reader.adapter';
import type { PrismaService } from '@/common/prisma.service';
import { CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';

import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaMatchConciliacionRepository } from './adapters/prisma-match-conciliacion.repository';
import { PrismaMovimientoBancarioRepository } from './adapters/prisma-movimiento-bancario.repository';
import { ConciliacionService } from './conciliacion.service';
import { CuentasBancariasService } from './cuentas-bancarias.service';

/**
 * Integration spec del WORKSPACE de conciliación (tasks 5.7-5.11 del change
 * `conciliacion-bancaria`) contra Postgres real.
 *
 * Cubre REQ-CB-10 (verificación del ancla en CADA lectura, sin escribir) y
 * REQ-CB-11 (`EN_TRANSITO` derivado, nunca persistido).
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/conciliacion-bancaria/conciliacion.service
 */
describe('ConciliacionService.obtenerWorkspace (integration, REQ-CB-10/11/12)', () => {
  const SLUG = 'org-test-workspace-conc';

  let prisma: PrismaClient;
  let service: ConciliacionService;
  let matchRepo: PrismaMatchConciliacionRepository;
  let tenantId: string;
  let cuentaBancoId: string;
  let cuentaOtraId: string;
  let cuentaBancariaId: string;
  let periodoId: string;
  let importacionId: string;

  const RANGO = {
    desde: new Date(Date.UTC(2026, 5, 1)),
    hasta: new Date(Date.UTC(2026, 5, 30)),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const p = prisma as unknown as PrismaService;
    const cuentaBancariaRepo = new PrismaCuentaBancariaRepository(p);
    const movimientoRepo = new PrismaMovimientoBancarioRepository(p);
    matchRepo = new PrismaMatchConciliacionRepository(p);
    const lineasReader = new PrismaLineasCuentaReaderAdapter(p);

    // El workspace solo usa `findById` de CuentasBancariasService; el reader de
    // cuentas del plan no interviene en esta ruta.
    const cuentasBancariasService = new CuentasBancariasService(
      cuentaBancariaRepo,
      {} as CuentasReaderPort,
    );

    service = new ConciliacionService(
      cuentasBancariasService,
      movimientoRepo,
      matchRepo,
      lineasReader,
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const org = await prisma.organization.create({ data: { slug: SLUG, name: 'Org Workspace' } });
    tenantId = org.id;

    cuentaBancoId = await crearCuenta('1.1.1.002', 'Banco cuenta corriente');
    cuentaOtraId = await crearCuenta('1.1.1.003', 'Caja chica');

    const cuentaBancaria = await prisma.cuentaBancaria.create({
      data: {
        organizationId: tenantId,
        cuentaId: cuentaBancoId,
        alias: 'BancoSol corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: '1191959-000-001',
        moneda: Moneda.BOB,
      },
    });
    cuentaBancariaId = cuentaBancaria.id;

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: 2026,
        mesInicio: 1,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 6,
        ordenEnGestion: 6,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoId = periodo.id;

    const importacion = await prisma.importacionExtracto.create({
      data: {
        organizationId: tenantId,
        cuentaBancariaId,
        nombreArchivo: 'extracto.xlsx',
        sha256Archivo: 'a'.repeat(64),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: RANGO.desde,
        fechaHasta: RANGO.hasta,
        coberturaDeclarada: false,
        estadoVerificacion: 'SIN_VERIFICAR',
        filasLeidas: 0,
        movimientosNuevos: 0,
        movimientosDuplicados: 0,
        importadoPorUserId: 'user-test',
      },
    });
    importacionId = importacion.id;
  });

  async function crearCuenta(codigoInterno: string, nombre: string): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
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

  interface LineaInput {
    cuentaId?: string;
    orden: number;
    debito?: string;
    credito?: string;
  }

  async function crearComprobante(opts: {
    dia: number;
    numero: string | null;
    estado?: EstadoComprobante;
    anulado?: boolean;
    lineas: LineaInput[];
  }): Promise<string> {
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero: opts.numero,
        estado: opts.estado ?? EstadoComprobante.CONTABILIZADO,
        anulado: opts.anulado ?? false,
        fechaContable: new Date(Date.UTC(2026, 5, opts.dia)),
        periodoFiscalId: periodoId,
        glosa: 'Depósito de clientes',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('0.00'),
        totalCreditoBob: new Prisma.Decimal('0.00'),
        createdByUserId: 'user-test',
        lineas: {
          create: opts.lineas.map((l) => ({
            organizationId: tenantId,
            orden: l.orden,
            cuentaId: l.cuentaId ?? cuentaBancoId,
            moneda: Moneda.BOB,
            debito: new Prisma.Decimal(l.debito ?? '0'),
            credito: new Prisma.Decimal(l.credito ?? '0'),
            tipoCambio: new Prisma.Decimal('1'),
            debitoBob: new Prisma.Decimal(l.debito ?? '0'),
            creditoBob: new Prisma.Decimal(l.credito ?? '0'),
          })),
        },
      },
    });
    return comprobante.id;
  }

  let hashSeq = 0;
  async function crearMovimiento(opts: {
    dia: number;
    monto: string;
    tipo?: 'DEBITO' | 'CREDITO';
    estado?: EstadoMovimientoBancario;
  }): Promise<string> {
    hashSeq += 1;
    const mov = await prisma.movimientoBancario.create({
      data: {
        organizationId: tenantId,
        cuentaBancariaId,
        importacionId,
        fecha: new Date(Date.UTC(2026, 5, opts.dia)),
        hora: null,
        monto: new Prisma.Decimal(opts.monto),
        tipo: opts.tipo ?? 'CREDITO',
        moneda: Moneda.BOB,
        descripcion: 'DEPOSITO EN EFECTIVO',
        descripcionNormalizada: 'DEPOSITO EN EFECTIVO',
        referencia: null,
        saldo: null,
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales: {},
        ordinalDia: 0,
        hashDedup: `hash-${hashSeq}`,
        estado: opts.estado ?? EstadoMovimientoBancario.PENDIENTE,
      },
    });
    return mov.id;
  }

  async function crearMatchDirecto(opts: {
    movimientoBancarioId: string;
    comprobanteId: string;
    orden: number;
    snapshotCuentaId?: string;
    snapshotMonto: string;
    snapshotTipo?: LadoContable;
    snapshotDia: number;
  }): Promise<string> {
    const match = await prisma.matchConciliacion.create({
      data: {
        organizationId: tenantId,
        movimientoBancarioId: opts.movimientoBancarioId,
        comprobanteId: opts.comprobanteId,
        orden: opts.orden,
        snapshotCuentaId: opts.snapshotCuentaId ?? cuentaBancoId,
        snapshotMonto: new Prisma.Decimal(opts.snapshotMonto),
        snapshotTipo: opts.snapshotTipo ?? LadoContable.DEBITO,
        snapshotMoneda: Moneda.BOB,
        snapshotFecha: new Date(Date.UTC(2026, 5, opts.snapshotDia)),
        confianzaSugerida: 'ALTA',
        conciliadoPorUserId: 'user-test',
      },
    });
    // La columna `estado` es proyección cacheada mantenida por los caminos de
    // escritura (design §2.3) — al crear el match a mano hay que sostenerla.
    await prisma.movimientoBancario.update({
      where: { id: opts.movimientoBancarioId },
      data: { estado: EstadoMovimientoBancario.CONCILIADO },
    });
    return match.id;
  }

  function consultar() {
    return service.obtenerWorkspace(tenantId, {
      cuentaBancariaId,
      desde: RANGO.desde,
      hasta: RANGO.hasta,
    });
  }

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: SLUG },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.matchConciliacion.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.movimientoBancario.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.importacionExtracto.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.lineaComprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.periodoFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.gestionFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
  }

  // ==========================================================
  // 5.7 — REQ-CB-11: `EN_TRANSITO` es DERIVADO, nunca persistido
  // ==========================================================

  it('5.7 — línea contable sin match aparece EN_TRANSITO, sin persistir ninguna fila para ese estado', async () => {
    await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [
        { orden: 1, debito: '1500.00' },
        { orden: 2, cuentaId: cuentaOtraId, credito: '1500.00' },
      ],
    });

    const movimientosAntes = await prisma.movimientoBancario.count({
      where: { organizationId: tenantId },
    });
    const matchesAntes = await prisma.matchConciliacion.count({
      where: { organizationId: tenantId },
    });

    const ws = await consultar();

    expect(ws.lineas).toHaveLength(1);
    expect(ws.lineas[0]!.orden).toBe(1);
    expect(ws.lineas[0]!.estadoEfectivo).toBe('EN_TRANSITO');
    expect(ws.lineas[0]!.monto).toBe('1500.00');
    expect(ws.lineas[0]!.tipo).toBe(LadoContable.DEBITO);
    expect(ws.resumen.lineasEnTransito).toBe(1);

    // El enum Prisma `EstadoMovimientoBancario` ni siquiera admite `EN_TRANSITO`,
    // y la consulta no creó ni tocó ninguna fila.
    expect(Object.values(EstadoMovimientoBancario)).not.toContain('EN_TRANSITO');
    expect(await prisma.movimientoBancario.count({ where: { organizationId: tenantId } })).toBe(
      movimientosAntes,
    );
    expect(await prisma.matchConciliacion.count({ where: { organizationId: tenantId } })).toBe(
      matchesAntes,
    );
  });

  it('5.7bis — línea con match VÁLIDO no está EN_TRANSITO; el movimiento se muestra CONCILIADO', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    const ws = await consultar();

    expect(ws.movimientos).toHaveLength(1);
    expect(ws.movimientos[0]!.estadoEfectivo).toBe('CONCILIADO');
    expect(ws.movimientos[0]!.vinculo).toEqual({
      matchId: expect.any(String),
      comprobanteId,
      orden: 1,
      roto: null,
    });
    expect(ws.lineas[0]!.estadoEfectivo).toBe('CONCILIADO');
    expect(ws.resumen.lineasEnTransito).toBe(0);
    expect(ws.resumen.movimientosConciliados).toBe(1);
  });

  it('5.7ter — movimiento sin match se muestra PENDIENTE; IGNORADO se respeta', async () => {
    await crearMovimiento({ dia: 10, monto: '100.00' });
    await crearMovimiento({ dia: 11, monto: '200.00', estado: EstadoMovimientoBancario.IGNORADO });

    const ws = await consultar();

    const porMonto = new Map(ws.movimientos.map((m) => [m.monto, m]));
    expect(porMonto.get('100.00')!.estadoEfectivo).toBe('PENDIENTE');
    expect(porMonto.get('100.00')!.vinculo).toBeNull();
    expect(porMonto.get('200.00')!.estadoEfectivo).toBe('IGNORADO');
    expect(ws.resumen.movimientosPendientes).toBe(1);
    expect(ws.resumen.movimientosIgnorados).toBe(1);
  });

  // ==========================================================
  // 5.8 — REQ-CB-10/11: match roto ⇒ columna CONCILIADO, respuesta PENDIENTE, CERO escrituras
  // ==========================================================

  it('5.8 — match roto: columna estado=CONCILIADO, estadoEfectivo=PENDIENTE con motivo, cero UPDATE en la lectura', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    const matchId = await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotMonto: '999.00', // el snapshot NO coincide con la línea (1500.00)
      snapshotDia: 10,
    });

    const movAntes = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimientoId },
    });
    const matchAntes = await prisma.matchConciliacion.findUniqueOrThrow({ where: { id: matchId } });

    const ws = await consultar();

    expect(ws.movimientos[0]!.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
    expect(ws.movimientos[0]!.estadoEfectivo).toBe('PENDIENTE');
    expect(ws.movimientos[0]!.vinculo).toEqual({
      matchId,
      comprobanteId,
      orden: 1,
      roto: 'MONTO_CAMBIADO',
    });

    // La línea vuelve al pool: sin vínculo VÁLIDO que la reclame, está EN_TRANSITO.
    expect(ws.lineas[0]!.estadoEfectivo).toBe('EN_TRANSITO');

    // Una LECTURA NUNCA ESCRIBE (design §2.3): ni el movimiento ni el match se tocaron.
    const movDespues = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimientoId },
    });
    const matchDespues = await prisma.matchConciliacion.findUniqueOrThrow({
      where: { id: matchId },
    });
    expect(movDespues.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
    expect(movDespues.updatedAt.getTime()).toBe(movAntes.updatedAt.getTime());
    expect(matchDespues).toEqual(matchAntes);
  });

  // ==========================================================
  // 5.9 — caso BENIGNO: `orden` corrido pero el snapshot sigue coincidiendo
  // ==========================================================

  it('5.9 — orden corrido pero la línea que lo ocupa coincide en los 5 campos ⇒ vínculo VÁLIDO', async () => {
    // El comprobante registra DOS depósitos idénticos contra la cuenta banco.
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [
        { orden: 1, debito: '1500.00' },
        { orden: 2, debito: '1500.00' },
        { orden: 3, cuentaId: cuentaOtraId, credito: '3000.00' },
      ],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    // El match apunta a orden=2; tras un reordenamiento la línea que ocupa esa
    // posición es "otra fila" pero económicamente equivalente.
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 2,
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    const ws = await consultar();

    expect(ws.movimientos[0]!.estadoEfectivo).toBe('CONCILIADO');
    expect(ws.movimientos[0]!.vinculo!.roto).toBeNull();
    // La otra línea de la cuenta banco (orden 1) sigue disponible.
    const enTransito = ws.lineas.filter((l) => l.estadoEfectivo === 'EN_TRANSITO');
    expect(enTransito).toHaveLength(1);
    expect(enTransito[0]!.orden).toBe(1);
  });

  // ==========================================================
  // 5.10 — riesgo C-1: se inserta una línea al principio y corre los `orden`
  // ==========================================================

  it('5.10 — insertar una línea al principio corre los orden: el ancla apunta a otro contenido ⇒ MONTO_CAMBIADO', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [
        { orden: 1, debito: '1500.00' },
        { orden: 2, cuentaId: cuentaOtraId, credito: '1500.00' },
      ],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    const matchId = await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    // Edición real del CONJUNTO de líneas: se borran y re-insertan con `orden`
    // reasignado por posición — exactamente lo que hace `comprobantes.service`.
    await prisma.lineaComprobante.deleteMany({ where: { comprobanteId } });
    await prisma.lineaComprobante.createMany({
      data: [
        {
          organizationId: tenantId,
          comprobanteId,
          orden: 1,
          cuentaId: cuentaBancoId,
          moneda: Moneda.BOB,
          debito: new Prisma.Decimal('80.00'), // línea NUEVA insertada al principio
          credito: new Prisma.Decimal('0'),
          tipoCambio: new Prisma.Decimal('1'),
          debitoBob: new Prisma.Decimal('80.00'),
          creditoBob: new Prisma.Decimal('0'),
        },
        {
          organizationId: tenantId,
          comprobanteId,
          orden: 2,
          cuentaId: cuentaBancoId,
          moneda: Moneda.BOB,
          debito: new Prisma.Decimal('1500.00'), // la conciliada, corrida a orden=2
          credito: new Prisma.Decimal('0'),
          tipoCambio: new Prisma.Decimal('1'),
          debitoBob: new Prisma.Decimal('1500.00'),
          creditoBob: new Prisma.Decimal('0'),
        },
      ],
    });

    const ws = await consultar();

    expect(ws.movimientos[0]!.estadoEfectivo).toBe('PENDIENTE');
    expect(ws.movimientos[0]!.vinculo).toEqual({
      matchId,
      comprobanteId,
      orden: 1,
      roto: 'MONTO_CAMBIADO',
    });
    // Las DOS líneas quedan disponibles: ninguna tiene un vínculo válido.
    expect(ws.lineas.every((l) => l.estadoEfectivo === 'EN_TRANSITO')).toBe(true);
    expect(ws.lineas).toHaveLength(2);
  });

  it('5.10bis — la línea del ancla se reasignó a OTRA cuenta ⇒ CUENTA_CAMBIADA', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, cuentaId: cuentaOtraId, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotCuentaId: cuentaBancoId, // el snapshot dice cuenta banco; la línea ya no lo es
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    const ws = await consultar();

    // La línea no está en `B` (es de otra cuenta) → se resuelve vía listarPorAnclas
    // y el diagnóstico distingue CUENTA_CAMBIADA de LINEA_INEXISTENTE.
    expect(ws.movimientos[0]!.estadoEfectivo).toBe('PENDIENTE');
    expect(ws.movimientos[0]!.vinculo!.roto).toBe('CUENTA_CAMBIADA');
  });

  it('5.10ter — la línea del ancla ya no existe ⇒ LINEA_INEXISTENTE', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 7, // ancla a una posición que nunca existió
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    const ws = await consultar();

    expect(ws.movimientos[0]!.estadoEfectivo).toBe('PENDIENTE');
    expect(ws.movimientos[0]!.vinculo!.roto).toBe('LINEA_INEXISTENTE');
  });

  // ==========================================================
  // 5.11 — anulación y movimiento de `fechaContable` fuera del rango
  // ==========================================================

  it('5.11 — comprobante anulado ⇒ COMPROBANTE_ANULADO (ancla huérfana resuelta por listarPorAnclas)', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    await prisma.comprobante.update({
      where: { id: comprobanteId },
      data: {
        anulado: true,
        fechaAnulacion: new Date(),
        anuladoPorUserId: 'user-test',
        motivoAnulacion: 'Error de registro detectado en revisión',
      },
    });

    const ws = await consultar();

    // El anulado desaparece del panel de líneas (`B` lo excluye)...
    expect(ws.lineas).toHaveLength(0);
    // ...pero el diagnóstico lo alcanza y da el motivo exacto.
    expect(ws.movimientos[0]!.estadoEfectivo).toBe('PENDIENTE');
    expect(ws.movimientos[0]!.vinculo!.roto).toBe('COMPROBANTE_ANULADO');
  });

  it('5.11bis — fechaContable movida fuera del rango: la línea sale de B y el ancla se resuelve por listarPorAnclas', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    // Se mueve la fecha contable a julio — fuera del rango consultado (junio).
    await prisma.comprobante.update({
      where: { id: comprobanteId },
      data: { fechaContable: new Date(Date.UTC(2026, 6, 5)) },
    });

    const ws = await consultar();

    expect(ws.lineas).toHaveLength(0);
    expect(ws.movimientos[0]!.estadoEfectivo).toBe('PENDIENTE');
    // La línea SIGUE existiendo y sigue siendo de la cuenta banco: lo que cambió
    // es la fecha, y el snapshot lo detecta como tal (no como LINEA_INEXISTENTE).
    expect(ws.movimientos[0]!.vinculo!.roto).toBe('FECHA_CAMBIADA');
  });

  // ==========================================================
  // REQ-CB-12 — sugerencias calculadas sobre el workspace, sin auto-match
  // ==========================================================

  it('sugerencias: ALTA para par único con misma fecha; ninguna crea un MatchConciliacion', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00', tipo: 'CREDITO' });

    const ws = await consultar();

    expect(ws.sugerencias).toHaveLength(1);
    expect(ws.sugerencias[0]).toEqual({
      movimientoId,
      comprobanteId,
      orden: 1,
      confianza: 'ALTA',
      diferenciaDias: 0,
    });
    expect(await prisma.matchConciliacion.count({ where: { organizationId: tenantId } })).toBe(0);
  });

  it('sugerencias: MEDIA con fecha a 2 días dentro de la ventana', async () => {
    await crearComprobante({
      dia: 12,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    await crearMovimiento({ dia: 10, monto: '1500.00', tipo: 'CREDITO' });

    const ws = await consultar();

    expect(ws.sugerencias).toHaveLength(1);
    expect(ws.sugerencias[0]!.confianza).toBe('MEDIA');
    expect(ws.sugerencias[0]!.diferenciaDias).toBe(2);
  });

  it('un movimiento con vínculo VÁLIDO no genera sugerencias', async () => {
    const comprobanteId = await crearComprobante({
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento({ dia: 10, monto: '1500.00' });
    await crearMatchDirecto({
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      snapshotMonto: '1500.00',
      snapshotDia: 10,
    });

    const ws = await consultar();
    expect(ws.sugerencias).toEqual([]);
  });

  // ==========================================================
  // REQ-CB-13 — aislamiento por tenant
  // ==========================================================

  it('REQ-CB-13 — consultar el workspace de una cuenta bancaria de otro tenant ⇒ 404', async () => {
    const otra = await prisma.organization.create({
      data: { slug: `${SLUG}-b`, name: 'Org B' },
    });
    try {
      await expect(
        service.obtenerWorkspace(otra.id, {
          cuentaBancariaId,
          desde: RANGO.desde,
          hasta: RANGO.hasta,
        }),
      ).rejects.toMatchObject({ code: 'CONCILIACION_CUENTA_BANCARIA_NO_ENCONTRADA' });
    } finally {
      await prisma.organization.deleteMany({ where: { slug: `${SLUG}-b` } });
    }
  });

  it('rango invertido ⇒ CONCILIACION_RANGO_INVALIDO', async () => {
    await expect(
      service.obtenerWorkspace(tenantId, {
        cuentaBancariaId,
        desde: RANGO.hasta,
        hasta: RANGO.desde,
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_RANGO_INVALIDO' });
  });
});
