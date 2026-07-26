/**
 * E2E — Integridad de la serie de extractos (REQ-CB-09/23, REQ-CB-13).
 *
 * Complementa `conciliacion-importaciones.e2e-spec.ts`, que solo cubre la
 * serie ÍNTEGRA (empty-check) y el 404 con un uuid inexistente. Acá se
 * ejercita el camino NO vacío del endpoint: huecos y discontinuidades reales
 * atravesando controller → service → repositorio → Postgres, con los montos
 * serializados como string por el DTO (§4.5).
 *
 * Las importaciones se siembran por Prisma (mismo patrón que
 * `informe-conciliacion.e2e-spec.ts`): los fixtures de archivo no permiten
 * fabricar series con huecos/saltos arbitrarios.
 *
 * Requiere Postgres corriendo. Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/conciliacion-integridad.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  Moneda,
  NaturalezaCuenta,
  PerfilExtracto,
  Prisma,
  SystemRole,
  TipoPack,
  VerticalPack,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { cleanupTestData } from './helpers/test-factory';

const PACK_CLAVE = 'contabilidad.conciliacion';
const PASSWORD = 'password123';

describe('Conciliación — Integridad de extractos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  // ==========================================================
  // Fixtures
  // ==========================================================

  interface Escenario {
    token: string;
    orgId: string;
    ownerId: string;
    cuentaBancariaId: string;
  }

  /** Org con pack activo + cuenta del plan + cuenta bancaria. */
  async function seed(slug: string): Promise<Escenario> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@int.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    const packId = await prisma.pack.findUnique({ where: { clave: PACK_CLAVE } }).then(
      async (p) =>
        p?.id ??
        (
          await prisma.pack.create({
            data: {
              clave: PACK_CLAVE,
              nombre: 'Conciliación bancaria',
              descripcion: 'Importa extractos bancarios y concilia movimientos.',
              verticalAplicable: VerticalPack.CONTABILIDAD,
              tipo: TipoPack.DOMINIO,
              otorgadoPorDefecto: true,
            },
          })
        ).id,
    );
    await prisma.orgPackEntitlement.create({
      data: { organizationId: org.id, packId, activo: true, habilitadoPorUserId: owner.id },
    });

    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: org.id,
        codigoInterno: '1.1.1.002',
        nombre: 'Banco cuenta corriente',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    const cuentaBancaria = await prisma.cuentaBancaria.create({
      data: {
        organizationId: org.id,
        cuentaId: cuenta.id,
        alias: 'BancoSol corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: null,
        moneda: Moneda.BOB,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@int.bo`, password: PASSWORD });

    return {
      token: loginRes.body.accessToken as string,
      orgId: org.id,
      ownerId: owner.id,
      cuentaBancariaId: cuentaBancaria.id,
    };
  }

  let shaSeq = 0;
  async function crearImportacion(
    e: Escenario,
    desde: string,
    hasta: string,
    saldoInicial: string,
    saldoFinal: string,
  ): Promise<string> {
    shaSeq += 1;
    const imp = await prisma.importacionExtracto.create({
      data: {
        organizationId: e.orgId,
        cuentaBancariaId: e.cuentaBancariaId,
        nombreArchivo: `extracto-${shaSeq}.xlsx`,
        sha256Archivo: String(shaSeq).padStart(64, 'b'),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date(`${desde}T00:00:00.000Z`),
        fechaHasta: new Date(`${hasta}T00:00:00.000Z`),
        coberturaDeclarada: false,
        saldoInicial: new Prisma.Decimal(saldoInicial),
        saldoFinal: new Prisma.Decimal(saldoFinal),
        estadoVerificacion: 'VERIFICADO',
        filasLeidas: 10,
        movimientosNuevos: 10,
        movimientosDuplicados: 0,
        importadoPorUserId: e.ownerId,
      },
    });
    return imp.id;
  }

  function getIntegridad(e: Escenario, cuentaBancariaId = e.cuentaBancariaId) {
    return request(app.getHttpServer())
      .get(`/api/cuentas-bancarias/${cuentaBancariaId}/integridad`)
      .set('Authorization', `Bearer ${e.token}`);
  }

  // ==========================================================
  // REQ-CB-09 — hueco de cobertura
  // ==========================================================

  it('GET /integridad — hueco entre mayo y julio: reporta junio con fechas exactas y sin discontinuidad entre las separadas', async () => {
    const e = await seed('org-int-hueco');
    // 1500.00 ≠ 4000.00, pero NO son contiguas: reportar discontinuidad acá
    // sería un falso positivo — el hallazgo real es el hueco de junio.
    await crearImportacion(e, '2026-05-01', '2026-05-31', '1000.00', '1500.00');
    await crearImportacion(e, '2026-07-01', '2026-07-31', '4000.00', '4200.00');

    const res = await getIntegridad(e);

    expect(res.status).toBe(200);
    expect(res.body.huecos).toEqual([{ desde: '2026-06-01', hasta: '2026-06-30' }]);
    expect(res.body.discontinuidades).toEqual([]);
    expect(res.body.serieIntegra).toBe(false);
  });

  // ==========================================================
  // REQ-CB-23 — discontinuidad de saldo
  // ==========================================================

  it('GET /integridad — discontinuidad entre contiguas: ids, saldos y diferencia como string (§4.5)', async () => {
    const e = await seed('org-int-disc');
    // Mayo cierra en 1517.25; junio arranca AL DÍA SIGUIENTE en 1717.30:
    // faltan Bs 200.05 de la serie corrida — la firma de un extracto mutilado
    // por los extremos que el checksum DERIVADO no puede ver.
    const mayoId = await crearImportacion(e, '2026-05-01', '2026-05-31', '1000.00', '1517.25');
    const junioId = await crearImportacion(e, '2026-06-01', '2026-06-30', '1717.30', '1900.00');

    const res = await getIntegridad(e);

    expect(res.status).toBe(200);
    expect(res.body.huecos).toEqual([]);
    expect(res.body.discontinuidades).toEqual([
      {
        anteriorId: mayoId,
        siguienteId: junioId,
        saldoFinalAnterior: '1517.25',
        saldoInicialSiguiente: '1717.30',
        diferencia: '200.05',
      },
    ]);
    expect(res.body.serieIntegra).toBe(false);
  });

  // ==========================================================
  // Hueco + discontinuidad conviviendo
  // ==========================================================

  it('GET /integridad — hueco y discontinuidad a la vez, cada hallazgo en su tramo', async () => {
    const e = await seed('org-int-mixto');
    // mayo→junio contiguas con salto de 200.05; junio→agosto separadas por
    // julio sin cubrir (hueco, sin discontinuidad aunque 1900.00 ≠ 5000.00).
    const mayoId = await crearImportacion(e, '2026-05-01', '2026-05-31', '1000.00', '1517.25');
    const junioId = await crearImportacion(e, '2026-06-01', '2026-06-30', '1717.30', '1900.00');
    await crearImportacion(e, '2026-08-01', '2026-08-31', '5000.00', '5100.00');

    const res = await getIntegridad(e);

    expect(res.status).toBe(200);
    expect(res.body.huecos).toEqual([{ desde: '2026-07-01', hasta: '2026-07-31' }]);
    expect(res.body.discontinuidades).toEqual([
      {
        anteriorId: mayoId,
        siguienteId: junioId,
        saldoFinalAnterior: '1517.25',
        saldoInicialSiguiente: '1717.30',
        diferencia: '200.05',
      },
    ]);
    expect(res.body.serieIntegra).toBe(false);
  });

  // ==========================================================
  // REQ-CB-13 — aislamiento por tenant
  // ==========================================================

  it('GET /integridad — 404 contra la cuenta bancaria REAL de otro tenant; la serie ajena no contamina la propia', async () => {
    const a = await seed('org-int-tenant-a');
    const b = await seed('org-int-tenant-b');

    // A tiene serie íntegra; B tiene una serie con salto.
    await crearImportacion(a, '2026-05-01', '2026-05-31', '1000.00', '1500.00');
    await crearImportacion(a, '2026-06-01', '2026-06-30', '1500.00', '1800.00');
    await crearImportacion(b, '2026-05-01', '2026-05-31', '1000.00', '1517.25');
    await crearImportacion(b, '2026-06-01', '2026-06-30', '1717.30', '1900.00');

    // El token de A contra la cuenta de B: 404, no 403 — no se revela que existe.
    const cruzado = await getIntegridad(a, b.cuentaBancariaId);
    expect(cruzado.status).toBe(404);

    // Y el quilombo de B no se filtra al veredicto de A.
    const propio = await getIntegridad(a);
    expect(propio.status).toBe(200);
    expect(propio.body.serieIntegra).toBe(true);
    expect(propio.body.huecos).toEqual([]);
    expect(propio.body.discontinuidades).toEqual([]);
  });
});
