/**
 * E2E — Catálogo de ítems (`ventas-piloto`, Fase 7).
 *
 * Cubre la task 7.6 / criterio 10: el código del ítem es OPCIONAL (D-24), dos
 * ítems sin código conviven, y dos con el mismo código chocan **por las dos
 * capas**: el guard del servicio (que da el 409 amigable) y el UNIQUE PARCIAL
 * de la base (que es el que aguanta bajo concurrencia — cicatriz F-01, §4.8).
 *
 * Probar sólo el 409 dejaría pasar el día en que alguien borra el índice: el
 * enforcement quedaría en una sola capa y el test seguiría verde. Por eso el
 * constraint se ejercita **salteando el servicio**, escribiendo con Prisma.
 *
 * Correr con:
 *   DATABASE_URL=... JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   NODE_OPTIONS="--experimental-vm-modules" \
 *   pnpm exec jest test/items.e2e-spec.ts --runInBand --forceExit
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TipoItem } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

import { EscenarioComercial, seedComercial } from './helpers/comercial-fixture';
import { cleanupTestData } from './helpers/test-factory';

describe('Ítems — unicidad del código (e2e)', () => {
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

  function crearItem(e: EscenarioComercial, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${e.token}`)
      .send({ nombre: 'Ítem', tipo: TipoItem.PRODUCTO, ...body });
  }

  // ==========================================================
  // Sin código
  // ==========================================================

  it('dos ítems SIN código conviven en la misma organización', async () => {
    const e = await seedComercial(app, prisma, { slug: 'org-item-a' });

    const uno = await crearItem(e, { nombre: 'Pollo vivo' });
    const dos = await crearItem(e, { nombre: 'Pollo faenado' });

    expect(uno.status).toBe(201);
    expect(dos.status).toBe(201);
    expect(uno.body.codigo).toBeNull();
    expect(dos.body.codigo).toBeNull();

    // El string vacío se normaliza a NULL, no se guarda como "" — si no, dos
    // ítems "sin código" chocarían entre sí por el UNIQUE.
    const tres = await crearItem(e, { nombre: 'Menudencias', codigo: '   ' });
    expect(tres.status).toBe(201);
    expect(tres.body.codigo).toBeNull();
  });

  // ==========================================================
  // Con código — capa 1: el guard del servicio
  // ==========================================================

  it('dos ítems con el MISMO código chocan con 409 amigable del servicio', async () => {
    const e = await seedComercial(app, prisma, { slug: 'org-item-b' });

    const primero = await crearItem(e, { nombre: 'Pollo entero', codigo: 'P-01' });
    expect(primero.status).toBe(201);
    expect(primero.body.codigo).toBe('P-01');

    const segundo = await crearItem(e, { nombre: 'Otro pollo', codigo: 'P-01' });
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.code).toBe('ITEM_CODIGO_DUPLICADO');
  });

  it('la colisión se evalúa NORMALIZADA: minúsculas y espacios al borde no esquivan el guard', async () => {
    const e = await seedComercial(app, prisma, { slug: 'org-item-c' });

    expect((await crearItem(e, { nombre: 'Pollo entero', codigo: 'P-01' })).status).toBe(201);

    const disfrazado = await crearItem(e, { nombre: 'Colado', codigo: '  p-01 ' });
    expect(disfrazado.status).toBe(409);
    expect(disfrazado.body.error.code).toBe('ITEM_CODIGO_DUPLICADO');
  });

  it('el código es único POR ORGANIZACIÓN: otro tenant puede usar el mismo', async () => {
    const a = await seedComercial(app, prisma, { slug: 'org-item-d1' });
    const b = await seedComercial(app, prisma, { slug: 'org-item-d2' });

    expect((await crearItem(a, { nombre: 'Pollo', codigo: 'P-01' })).status).toBe(201);
    expect((await crearItem(b, { nombre: 'Pollo', codigo: 'P-01' })).status).toBe(201);
  });

  // ==========================================================
  // Con código — capa 2: el UNIQUE PARCIAL de la base
  // ==========================================================

  it('el UNIQUE parcial rechaza el duplicado aunque se saltee el servicio', async () => {
    const e = await seedComercial(app, prisma, { slug: 'org-item-e' });

    await prisma.item.create({
      data: {
        organizationId: e.orgId,
        nombre: 'Pollo entero',
        tipo: TipoItem.PRODUCTO,
        codigo: 'P-01',
        createdByUserId: e.ownerId,
      },
    });

    // Escritura directa: el guard del servicio no participa. Lo que rechaza acá
    // es `items_organizationId_codigo_partial_key`.
    await expect(
      prisma.item.create({
        data: {
          organizationId: e.orgId,
          nombre: 'Duplicado',
          tipo: TipoItem.PRODUCTO,
          codigo: 'P-01',
          createdByUserId: e.ownerId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('el UNIQUE parcial NO agrupa los NULL: dos ítems sin código pasan por escritura directa', async () => {
    // El gemelo del test anterior. Un UNIQUE común sobre columna nullable en
    // Postgres tampoco agrupa NULLs, así que este caso NO prueba que el índice
    // sea parcial — prueba que la opcionalidad de D-24 no se rompe por el
    // índice, que es lo que rompería el alta de ítems sin código.
    const e = await seedComercial(app, prisma, { slug: 'org-item-f' });

    await prisma.item.create({
      data: {
        organizationId: e.orgId,
        nombre: 'Uno',
        tipo: TipoItem.PRODUCTO,
        codigo: null,
        createdByUserId: e.ownerId,
      },
    });
    await expect(
      prisma.item.create({
        data: {
          organizationId: e.orgId,
          nombre: 'Dos',
          tipo: TipoItem.PRODUCTO,
          codigo: null,
          createdByUserId: e.ownerId,
        },
      }),
    ).resolves.toMatchObject({ codigo: null });
  });

  it('el índice existe y es PARCIAL: su definición lleva el WHERE sobre codigo', async () => {
    // Lo anterior no distingue un índice parcial de uno común. Esto sí, y es lo
    // que detecta que una migration regenerada se llevó puesto el `WHERE`
    // (§11.6: Prisma no expresa índices parciales en el schema).
    const filas = await prisma.$queryRaw<Array<{ indexdef: string }>>(
      Prisma.sql`SELECT indexdef FROM pg_indexes
                 WHERE tablename = 'items'
                   AND indexname = 'items_organizationId_codigo_partial_key'`,
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]?.indexdef).toMatch(/UNIQUE/i);
    expect(filas[0]?.indexdef).toMatch(/WHERE \(codigo IS NOT NULL\)/i);
  });
});
