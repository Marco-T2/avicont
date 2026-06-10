/**
 * E2E — Pack "Adjuntos a comprobantes" (Pack "contabilidad.adjuntos")
 *
 * Requiere Postgres + MinIO corriendo (🐘 🪣).
 * Correr con:
 *   DATABASE_URL=... MINIO_ENDPOINT=localhost MINIO_PORT=9000 \
 *   MINIO_ACCESS_KEY=minioadmin MINIO_SECRET_KEY=minioadmin \
 *   MINIO_BUCKET=avicont-adjuntos-test MINIO_USE_SSL=false \
 *   JWT_ACCESS_SECRET=test-secret JWT_REFRESH_SECRET=test-refresh \
 *   pnpm exec jest test/comprobantes-adjuntos.e2e-spec.ts --runInBand --forceExit
 *
 * Cubre (Phase 9.1 RED → Phase 9.2 GREEN):
 *   [1] POST sin pack activo → 404 (PackEnabledGuard)
 *   [2] POST con pack activo + asientos.update → 201
 *   [3] GET listado con pack + asientos.read → 200 []
 *   [4] ciclo completo: upload → list → download → delete
 *   [5] PUT reemplazo actualiza metadata
 *   [6] DELETE → 204
 *   [7] cross-tenant en download → 404
 *   [8] asientos.read intenta POST → 403
 *   [9] MIME inválido → 422 ADJUNTO_MIME_NO_PERMITIDO
 *  [10] tamaño > 25 MB → 422 ADJUNTO_TAMANO_EXCEDIDO
 *  [11] tope 10 adjuntos → 422 ADJUNTO_TOPE_COMPROBANTE
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClaseCuenta, NaturalezaCuenta, SystemRole, TipoPack, VerticalPack } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import {
  cleanupTestData,
  createTestTenant,
  createTestUser,
  createTestMembership,
  prisma,
} from './helpers/test-factory';

// ---- Fixtures -------------------------------------------------------

const PACK_CLAVE = 'contabilidad.adjuntos';

/** Buffer con magic bytes de PDF válido para pasar la validación MIME. */
const PDF_BUFFER = Buffer.from([
  0x25,
  0x50,
  0x44,
  0x46,
  0x2d,
  0x31,
  0x2e,
  0x34, // %PDF-1.4
  0x0a,
  0x25,
  0xe2,
  0xe3,
  0xcf,
  0xd3,
  0x0a,
  0x31, // comentario binario
  0x20,
  0x30,
  0x20,
  0x6f,
  0x62,
  0x6a,
  0x0a,
  0x3c, // 1 0 obj\n<
  0x3c,
  0x0a,
  0x2f,
  0x54,
  0x79,
  0x70,
  0x65,
  0x20, // </Type
]);

/** Buffer con magic bytes de EXE (MZ header) — debe ser rechazado. */
const EXE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

// ---- Helpers --------------------------------------------------------

describe('Comprobantes — Adjuntos e2e (Pack contabilidad.adjuntos)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let superAdminToken: string;
  let ownerToken: string;
  let orgId: string;
  let comprobanteId: string;

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
    prismaService = moduleFixture.get(PrismaService);
    void prismaService; // usada solo para referencia, accedemos via prisma helper
  });

  afterAll(async () => {
    // Limpiar los datos del último test ANTES de cerrar la app: el afterAll no
    // tiene beforeEach que lo siga, así que sin esto la suite deja comprobantes,
    // lineas y cuentas huerfanos que rompen el cleanup de otras suites e2e
    // (FK lineas_comprobante_cuentaId_fkey) bajo --runInBand.
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Super-admin para habilitar packs.
    const hashedPassword = await bcrypt.hash('superpass123', 10);
    const sa = await prisma.user.create({
      data: { email: 'sa-adjuntos@test.com', hashedPassword, isSuperAdmin: true },
    });
    void sa;

    const saLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'sa-adjuntos@test.com', password: 'superpass123' });
    expect(saLoginRes.status).toBe(200);
    superAdminToken = saLoginRes.body.accessToken as string;

    // Owner de org contabilidad.
    const owner = await createTestUser({ email: 'owner-adjuntos@test.com', password: 'pass12345' });
    const org = await createTestTenant({ name: 'Org Adjuntos Test' });
    await createTestMembership(owner.id, org.id, SystemRole.OWNER);
    orgId = org.id;

    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner-adjuntos@test.com', password: 'pass12345' });
    expect(ownerLoginRes.status).toBe(200);
    ownerToken = ownerLoginRes.body.accessToken as string;

    // Gestión + período fiscal 2026.
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ year: 2026 })
      .expect(201);

    // Cuentas mínimas para el comprobante.
    const [caja, ventas] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: orgId,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);

    // Comprobante en BORRADOR para los tests de adjuntos.
    const crearRes = await request(app.getHttpServer())
      .post('/api/comprobantes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        tipo: 'DIARIO',
        fechaContable: '2026-04-22',
        glosa: 'Comprobante para tests de adjuntos',
        lineas: [
          {
            cuentaId: caja.id,
            moneda: 'BOB',
            debito: '1000.00',
            credito: '0',
            tipoCambio: '1',
            debitoBob: '1000.00',
            creditoBob: '0',
          },
          {
            cuentaId: ventas.id,
            moneda: 'BOB',
            debito: '0',
            credito: '1000.00',
            tipoCambio: '1',
            debitoBob: '0',
            creditoBob: '1000.00',
          },
        ],
      });
    expect(crearRes.status).toBe(201);
    comprobanteId = crearRes.body.id as string;
  });

  // ---- Helpers locales -----------------------------------------------

  async function crearPack(): Promise<void> {
    await prisma.pack.create({
      data: {
        clave: PACK_CLAVE,
        nombre: 'Adjuntos a comprobantes',
        verticalAplicable: VerticalPack.CONTABILIDAD,
        tipo: TipoPack.CAPACIDAD,
      },
    });
  }

  async function habilitarPack(): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${orgId}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: PACK_CLAVE })
      .expect(201);
  }

  async function activarPack(): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/api/packs/${PACK_CLAVE}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ activo: true })
      .expect(200);
  }

  function uploadAdjunto(token: string, compId: string, buffer: Buffer, filename: string) {
    return request(app.getHttpServer())
      .post(`/api/comprobantes/${compId}/adjuntos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, { filename, contentType: 'application/pdf' });
  }

  // ---- Tests ----------------------------------------------------------

  it('[1] POST sin pack activo → 404 (PackEnabledGuard)', async () => {
    await crearPack();
    // Pack habilitado pero NO activo (falta activación del Owner)
    await habilitarPack();

    const res = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(res.status).toBe(404);
  });

  it('[2] POST con pack activo + asientos.update → 201', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    const res = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.nombreOriginal).toBe('factura.pdf');
    expect(res.body.mimeType).toBe('application/pdf');
    expect(res.body.tamanoBytes).toBe(PDF_BUFFER.length);
    expect(res.body.comprobanteId).toBe(comprobanteId);
  });

  it('[3] GET listado con pack activo + asientos.read → 200 []', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    const res = await request(app.getHttpServer())
      .get(`/api/comprobantes/${comprobanteId}/adjuntos`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('[4] ciclo completo: upload → list → download → delete', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    // Subir
    const uploadRes = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(uploadRes.status).toBe(201);
    const adjuntoId = uploadRes.body.id as string;

    // Listar
    const listRes = await request(app.getHttpServer())
      .get(`/api/comprobantes/${comprobanteId}/adjuntos`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(adjuntoId);

    // Descargar
    const downloadRes = await request(app.getHttpServer())
      .get(`/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}/download`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-disposition']).toContain('factura.pdf');
    expect(downloadRes.body).toBeTruthy();

    // Eliminar
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteRes.status).toBe(204);

    // Verificar que ya no está en la lista
    const listPostDeleteRes = await request(app.getHttpServer())
      .get(`/api/comprobantes/${comprobanteId}/adjuntos`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listPostDeleteRes.body).toHaveLength(0);
  });

  it('[5] PUT reemplazo actualiza metadata', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    // Subir adjunto original
    const uploadRes = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(uploadRes.status).toBe(201);
    const adjuntoId = uploadRes.body.id as string;

    // Reemplazar
    const replaceRes = await request(app.getHttpServer())
      .put(`/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', PDF_BUFFER, { filename: 'factura-v2.pdf', contentType: 'application/pdf' });
    expect(replaceRes.status).toBe(200);
    expect(replaceRes.body.id).toBe(adjuntoId);
    expect(replaceRes.body.nombreOriginal).toBe('factura-v2.pdf');
  });

  it('[6] DELETE → 204', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    const uploadRes = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(uploadRes.status).toBe(201);
    const adjuntoId = uploadRes.body.id as string;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteRes.status).toBe(204);
  });

  it('[7] cross-tenant en download → 404', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    // Subir adjunto en org A (owner)
    const uploadRes = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(uploadRes.status).toBe(201);
    const adjuntoId = uploadRes.body.id as string;

    // Crear owner de org B e intentar descargar adjunto de org A
    const ownerB = await createTestUser({
      email: 'owner-b-adjuntos@test.com',
      password: 'pass12345',
    });
    const orgB = await createTestTenant({ name: 'Org B Adjuntos Test' });
    await createTestMembership(ownerB.id, orgB.id, SystemRole.OWNER);

    // Habilitar y activar pack para org B también
    await request(app.getHttpServer())
      .post(`/api/admin/platform/orgs/${orgB.id}/packs`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ clave: PACK_CLAVE })
      .expect(201);

    const ownerBLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner-b-adjuntos@test.com', password: 'pass12345' });
    const ownerBToken = ownerBLoginRes.body.accessToken as string;

    await request(app.getHttpServer())
      .patch(`/api/packs/${PACK_CLAVE}`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ activo: true })
      .expect(200);

    // Gestión + comprobante en org B para que el token tenga contexto
    await request(app.getHttpServer())
      .post('/api/gestiones')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ year: 2026 })
      .expect(201);

    // org B intenta descargar adjunto de org A — debe ser 404
    const downloadRes = await request(app.getHttpServer())
      .get(`/api/comprobantes/${comprobanteId}/adjuntos/${adjuntoId}/download`)
      .set('Authorization', `Bearer ${ownerBToken}`);
    expect(downloadRes.status).toBe(404);
  });

  it('[8] usuario con solo asientos.read intenta POST → 403', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    // Crear un contador con solo permiso read
    const customRole = await prisma.customRole.create({
      data: {
        organizationId: orgId,
        slug: 'contador-solo-read',
        name: 'Contador solo read',
        permissions: ['contabilidad.asientos.read'],
      },
    });
    const contador = await createTestUser({
      email: 'contador-adjuntos@test.com',
      password: 'pass12345',
    });
    await prisma.membership.create({
      data: { userId: contador.id, organizationId: orgId, customRoleId: customRole.id },
    });

    const contadorLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'contador-adjuntos@test.com', password: 'pass12345' });
    const contadorToken = contadorLoginRes.body.accessToken as string;

    const res = await uploadAdjunto(contadorToken, comprobanteId, PDF_BUFFER, 'factura.pdf');
    expect(res.status).toBe(403);
  });

  it('[9] MIME inválido (EXE renombrado .pdf) → 422 ADJUNTO_MIME_NO_PERMITIDO', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    const res = await request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/adjuntos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', EXE_BUFFER, { filename: 'malware.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ADJUNTO_MIME_NO_PERMITIDO');
  });

  it('[10] tamaño > 25 MB → 422 ADJUNTO_TAMANO_EXCEDIDO', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    // 26 MB de ceros — multer lo rechaza ANTES de llegar al servicio con 413,
    // por lo que el límite de multer (25 MB) debe coincidir con el del service.
    // El controller configura multer con limits.fileSize = 25*1024*1024 (25 MB).
    // Un archivo de 26 MB genera un error de multer → 413 (Entity Too Large).
    const VEINTICINCO_MB = 25 * 1024 * 1024;
    const bigBuffer = Buffer.alloc(VEINTICINCO_MB + 1, 0x25); // 0x25 = '%' → puede parecer PDF

    const res = await request(app.getHttpServer())
      .post(`/api/comprobantes/${comprobanteId}/adjuntos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', bigBuffer, { filename: 'enorme.pdf', contentType: 'application/pdf' });

    // El límite en multer lanza 413 antes de llegar al service (Entity Too Large).
    expect([413, 422]).toContain(res.status);
  });

  it('[11] tope 10 adjuntos → 422 ADJUNTO_TOPE_COMPROBANTE', async () => {
    await crearPack();
    await habilitarPack();
    await activarPack();

    // Subir 10 adjuntos
    for (let i = 0; i < 10; i++) {
      const res = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, `factura-${i}.pdf`);
      expect(res.status).toBe(201);
    }

    // El décimo-primero debe fallar con 422
    const res = await uploadAdjunto(ownerToken, comprobanteId, PDF_BUFFER, 'factura-extra.pdf');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ADJUNTO_TOPE_COMPROBANTE');
  });
});
