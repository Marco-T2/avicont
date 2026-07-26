/**
 * E2E — Historial de arranques conciliados (REQ-ICB-04, design D8; alcance
 * agregado al PR 3 de `informe-conciliacion-bancaria`: `listarHistorial`
 * existía en el port desde la task 3.2 pero ningún controller lo exponía y la
 * task 3.11 lo necesita para señalar cuál declaración aplica).
 *
 * Cubre:
 *   - REQ-ICB-09: 404 cross-tenant — la cuenta de otra organización "no existe".
 *   - D7: mirar el historial es LECTURA — `read` sin `conciliar` lo ve (200).
 *   - D8: historial COMPLETO, más reciente primero (`fecha DESC, createdAt
 *     DESC`, el mismo desempate que `vigenteA`): una corrección retroactiva no
 *     borra nada y la UI puede señalar la vigente sin re-ordenar.
 *
 * Archivo separado de `informe-conciliacion.e2e-spec.ts` a propósito: la
 * suite preexistente queda intacta.
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/informe-conciliacion-historial.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ClaseCuenta,
  Moneda,
  NaturalezaCuenta,
  PerfilExtracto,
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

describe('Conciliación — Historial de arranques (e2e)', () => {
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
  // Fixtures — org + pack + cuenta bancaria (sin períodos ni
  // importaciones: el historial no los necesita)
  // ==========================================================

  async function crearPack(): Promise<string> {
    const pack = await prisma.pack.create({
      data: {
        clave: PACK_CLAVE,
        nombre: 'Conciliación bancaria',
        descripcion: 'Importa extractos bancarios y concilia movimientos.',
        verticalAplicable: VerticalPack.CONTABILIDAD,
        tipo: TipoPack.DOMINIO,
        otorgadoPorDefecto: true,
      },
    });
    return pack.id;
  }

  interface Escenario {
    token: string;
    orgId: string;
    ownerId: string;
    cuentaBancariaId: string;
  }

  async function seed(slug = 'org-hist'): Promise<Escenario> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: { email: `owner+${slug}@hist.bo`, hashedPassword, isEmailVerified: true },
    });
    const org = await prisma.organization.create({
      data: {
        slug,
        name: `Org ${slug}`,
        memberships: { create: { userId: owner.id, systemRole: SystemRole.OWNER } },
      },
    });

    const packId = await prisma.pack
      .findUnique({ where: { clave: PACK_CLAVE } })
      .then((p) => p?.id ?? crearPack());
    await prisma.orgPackEntitlement.create({
      data: { organizationId: org.id, packId, activo: true, habilitadoPorUserId: owner.id },
    });

    const cuentaBanco = await prisma.cuenta.create({
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
        cuentaId: cuentaBanco.id,
        alias: 'BancoSol corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: '1191959-000-001',
        moneda: Moneda.BOB,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `owner+${slug}@hist.bo`, password: PASSWORD });

    return {
      token: loginRes.body.accessToken as string,
      orgId: org.id,
      ownerId: owner.id,
      cuentaBancariaId: cuentaBancaria.id,
    };
  }

  /** Miembro con CustomRole de permisos acotados (REQ-ICB-09). */
  async function seedMiembro(orgId: string, slug: string, permissions: string[]): Promise<string> {
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: { email: `member+${slug}@hist.bo`, hashedPassword, isEmailVerified: true },
    });
    const role = await prisma.customRole.create({
      data: { organizationId: orgId, slug: `rol-${slug}`, name: `Rol ${slug}`, permissions },
    });
    await prisma.membership.create({
      data: { organizationId: orgId, userId: user.id, customRoleId: role.id },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `member+${slug}@hist.bo`, password: PASSWORD });
    return loginRes.body.accessToken as string;
  }

  function getHistorial(token: string, cuentaBancariaId: string) {
    return request(app.getHttpServer())
      .get('/api/conciliacion/arranques')
      .query({ cuentaBancariaId })
      .set('Authorization', `Bearer ${token}`);
  }

  function postArranque(
    token: string,
    cuentaBancariaId: string,
    opts: { fecha: string; nota?: string } = { fecha: '2026-06-30' },
  ) {
    return request(app.getHttpServer())
      .post('/api/conciliacion/arranques')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cuentaBancariaId,
        fecha: opts.fecha,
        saldoExtracto: '1000.00',
        saldoLibros: '990.00',
        diferenciaResidual: '10.00',
        ...(opts.nota === undefined ? {} : { nota: opts.nota }),
      });
  }

  // ==========================================================
  // REQ-ICB-09 — 404 cross-tenant, nunca 403
  // ==========================================================

  it('404 cross-tenant — el historial de una cuenta bancaria ajena "no existe"', async () => {
    const e1 = await seed('org-hist-a');
    const e2 = await seed('org-hist-b');
    await postArranque(e2.token, e2.cuentaBancariaId).expect(201);

    const res = await getHistorial(e1.token, e2.cuentaBancariaId);

    expect(res.status).toBe(404);
  });

  // ==========================================================
  // D7 — mirar el historial es lectura: `read` alcanza
  // ==========================================================

  it('usuario con read y sin conciliar VE el historial completo (200)', async () => {
    const e = await seed();
    await postArranque(e.token, e.cuentaBancariaId, { fecha: '2026-06-30' }).expect(201);
    const tokenLector = await seedMiembro(e.orgId, 'lector', ['contabilidad.conciliacion.read']);

    const res = await getHistorial(tokenLector, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      fecha: '2026-06-30',
      saldoExtracto: '1000.00',
      saldoLibros: '990.00',
      diferenciaResidual: '10.00',
      declaradoPorUserId: e.ownerId,
    });
  });

  // ==========================================================
  // D8 — historial completo, más reciente primero; la corrección
  // retroactiva no borra nada y la vigente es identificable
  // ==========================================================

  it('D8: tres declaraciones (una retroactiva) → todas visibles, orden fecha DESC + createdAt DESC', async () => {
    const e = await seed();
    // Cronología de declaración: junio, julio, y una CORRECCIÓN retroactiva
    // sobre la misma fecha de junio (D8: se acepta, nada se pisa).
    const r1 = await postArranque(e.token, e.cuentaBancariaId, { fecha: '2026-06-30' }).expect(201);
    const r2 = await postArranque(e.token, e.cuentaBancariaId, { fecha: '2026-07-31' }).expect(201);
    const r3 = await postArranque(e.token, e.cuentaBancariaId, {
      fecha: '2026-06-30',
      nota: 'corrección retroactiva',
    }).expect(201);

    const res = await getHistorial(e.token, e.cuentaBancariaId);

    expect(res.status).toBe(200);
    // fecha DESC y, a igual fecha, createdAt DESC: julio primero, después la
    // corrección de junio (declarada última) y al final la junio original.
    expect(res.body.map((a: { id: string }) => a.id)).toEqual([r2.body.id, r3.body.id, r1.body.id]);
    // El mismo desempate que `vigenteA`: la vigente a un corte es la PRIMERA
    // fila con fecha <= corte. Para un corte de julio: la de julio. Para un
    // corte de junio: la corrección (no la original) — y la original sigue
    // visible, auditable (REQ-ICB-04).
    const vigenteAJunio = res.body.find((a: { fecha: string }) => a.fecha <= '2026-06-30');
    expect(vigenteAJunio.id).toBe(r3.body.id);
    expect(vigenteAJunio.nota).toBe('corrección retroactiva');
  });
});
