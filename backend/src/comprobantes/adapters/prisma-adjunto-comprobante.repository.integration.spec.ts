import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  PrismaClient,
  TipoComprobante,
  ClaseCuenta,
} from '@prisma/client';

import { PrismaAdjuntoComprobanteRepository } from './prisma-adjunto-comprobante.repository';

/**
 * Integration spec del PrismaAdjuntoComprobanteRepository.
 * Requiere Postgres corriendo en DATABASE_URL.
 *
 * Cubre:
 *   - crear: persiste adjunto y filtra por organizationId (Anti-31)
 *   - listar: devuelve solo los adjuntos del tenant
 *   - obtenerPorId: devuelve null si es otro tenant (aislamiento cross-tenant, Anti-31)
 *   - eliminar: borra la fila y devuelve false si no existe o es otro tenant
 *   - contarPorComprobante: cuenta solo los del tenant
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/comprobantes/adapters/prisma-adjunto-comprobante.repository.integration
 */
describe('PrismaAdjuntoComprobanteRepository (integration vs Postgres)', () => {
  const SLUG = 'org-test-adjunto-repo';
  const SLUG_B = 'org-test-adjunto-repo-b';

  let prisma: PrismaClient;
  let repo: PrismaAdjuntoComprobanteRepository;
  let tenantId: string;
  let tenantBId: string;
  let comprobanteId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    // Pasamos PrismaClient como `unknown as PrismaService` para tests de integración.
    // El constructor acepta PrismaService para DI de NestJS; PrismaClient es compatible
    // estructuralmente (mismo API) y funciona en este contexto.
    repo = new PrismaAdjuntoComprobanteRepository(prisma as unknown as never);
  });

  afterAll(async () => {
    const orgsABorrar = await prisma.organization.findMany({
      where: { slug: { in: [SLUG, SLUG_B] } },
      select: { id: true },
    });
    if (orgsABorrar.length > 0) {
      const ids = orgsABorrar.map((o) => o.id);
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Limpiar datos previos: borrar comprobantes primero para evitar el FK Restrict
    // de Cuenta←LineaComprobante que bloquea el deleteMany de Organization cuando
    // Postgres intenta cascadear Organization→Cuenta antes de cascadear
    // Organization→Comprobante→LineaComprobante.
    const orgsABorrar = await prisma.organization.findMany({
      where: { slug: { in: [SLUG, SLUG_B] } },
      select: { id: true },
    });
    if (orgsABorrar.length > 0) {
      const ids = orgsABorrar.map((o) => o.id);
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    }

    // Crear org A y comprobante para los tests
    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test Adjunto Repo' },
    });
    tenantId = org.id;

    // Crear org B para tests de aislamiento
    const orgB = await prisma.organization.create({
      data: { slug: SLUG_B, name: 'Org Test Adjunto Repo B' },
    });
    tenantBId = orgB.id;

    // Crear usuario para subidoPorUserId
    const user = await prisma.user.create({
      data: {
        email: `adjunto-test-${Date.now()}@test.com`,
        hashedPassword: 'hashed',
      },
    });
    userId = user.id;

    // Crear gestión fiscal + período fiscal para el comprobante
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
        month: 1,
        ordenEnGestion: 1,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });

    // Crear cuenta para la línea del comprobante
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1.1.01',
        nombre: 'Caja',
        naturaleza: NaturalezaCuenta.DEUDORA,
        claseCuenta: ClaseCuenta.ACTIVO,
        esDetalle: true,
        activa: true,
        nivel: 3,
        monedaFuncional: Moneda.BOB,
        permiteMultiMoneda: false,
        requiereContacto: false,
      },
    });

    // Crear comprobante en BORRADOR
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.BORRADOR,
        fechaContable: new Date('2026-01-15'),
        periodoFiscalId: periodo.id,
        glosa: 'Comprobante test adjuntos',
        createdByUserId: userId,
        lineas: {
          create: [
            {
              organizationId: tenantId,
              orden: 1,
              cuentaId: cuenta.id,
              moneda: Moneda.BOB,
              debito: 100,
              credito: 0,
              tipoCambio: 1,
              debitoBob: 100,
              creditoBob: 0,
            },
          ],
        },
      },
    });
    comprobanteId = comprobante.id;
  });

  describe('crear', () => {
    it('persiste un adjunto y lo devuelve con id generado', async () => {
      const adjunto = await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-test.pdf`,
        nombreOriginal: 'test.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 12345,
        subidoPorUserId: userId,
      });

      expect(adjunto.id).toBeTruthy();
      expect(adjunto.organizationId).toBe(tenantId);
      expect(adjunto.comprobanteId).toBe(comprobanteId);
      expect(adjunto.mimeType).toBe('application/pdf');
    });
  });

  describe('listar', () => {
    it('devuelve solo los adjuntos del tenant y comprobante', async () => {
      await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/file1.pdf`,
        nombreOriginal: 'file1.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 1000,
        subidoPorUserId: userId,
      });

      const lista = await repo.listar(tenantId, comprobanteId);
      expect(lista.length).toBe(1);
      expect(lista[0]?.organizationId).toBe(tenantId);
    });

    it('devuelve array vacío si no hay adjuntos', async () => {
      const lista = await repo.listar(tenantId, comprobanteId);
      expect(lista).toEqual([]);
    });
  });

  describe('obtenerPorId', () => {
    it('devuelve el adjunto si pertenece al tenant', async () => {
      const creado = await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-getbyid.pdf`,
        nombreOriginal: 'test.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 500,
        subidoPorUserId: userId,
      });

      const resultado = await repo.obtenerPorId(tenantId, creado.id);
      expect(resultado).not.toBeNull();
      expect(resultado?.id).toBe(creado.id);
    });

    it('devuelve null si el adjunto es de otro tenant (Anti-31 aislamiento cross-tenant)', async () => {
      const creado = await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-cross.pdf`,
        nombreOriginal: 'test.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 500,
        subidoPorUserId: userId,
      });

      // Intenta obtener el adjunto del tenant A desde el tenant B → null
      const resultado = await repo.obtenerPorId(tenantBId, creado.id);
      expect(resultado).toBeNull();
    });
  });

  describe('eliminar', () => {
    it('borra el adjunto y devuelve true', async () => {
      const creado = await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-delete.pdf`,
        nombreOriginal: 'test.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 500,
        subidoPorUserId: userId,
      });

      const resultado = await repo.eliminar(tenantId, creado.id);
      expect(resultado).toBe(true);

      // Verificar que ya no existe
      const despues = await repo.obtenerPorId(tenantId, creado.id);
      expect(despues).toBeNull();
    });

    it('devuelve false si el adjunto no existe', async () => {
      const resultado = await repo.eliminar(tenantId, 'no-existe-uuid');
      expect(resultado).toBe(false);
    });
  });

  describe('actualizar', () => {
    it('actualiza los campos del adjunto y devuelve el registro actualizado', async () => {
      const creado = await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-update.pdf`,
        nombreOriginal: 'original.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 100,
        subidoPorUserId: userId,
      });

      const actualizado = await repo.actualizar(tenantId, creado.id, {
        storageKey: `${tenantId}/${comprobanteId}/uuid-update-v2.pdf`,
        nombreOriginal: 'actualizado.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 200,
      });

      expect(actualizado.nombreOriginal).toBe('actualizado.pdf');
      expect(actualizado.tamanoBytes).toBe(200);
    });

    it('no modifica nada si el adjunto es de otro tenant (Anti-31 defense in depth)', async () => {
      // Crea adjunto en tenant A
      const creado = await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-cross-update.pdf`,
        nombreOriginal: 'original.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 100,
        subidoPorUserId: userId,
      });

      // Intenta actualizarlo desde tenant B → debe fallar (Anti-31)
      await expect(
        repo.actualizar(tenantBId, creado.id, {
          storageKey: `${tenantBId}/${comprobanteId}/uuid-cross-update-v2.pdf`,
          nombreOriginal: 'hackeado.pdf',
          mimeType: 'application/pdf',
          tamanoBytes: 999,
        }),
      ).rejects.toThrow();

      // Verificar que el adjunto original no fue modificado
      const intacto = await repo.obtenerPorId(tenantId, creado.id);
      expect(intacto?.nombreOriginal).toBe('original.pdf');
      expect(intacto?.tamanoBytes).toBe(100);
    });
  });

  describe('contarPorComprobante', () => {
    it('cuenta correctamente los adjuntos del comprobante', async () => {
      await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-count1.pdf`,
        nombreOriginal: 'f1.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 100,
        subidoPorUserId: userId,
      });
      await repo.crear({
        organizationId: tenantId,
        comprobanteId,
        storageKey: `${tenantId}/${comprobanteId}/uuid-count2.pdf`,
        nombreOriginal: 'f2.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: 200,
        subidoPorUserId: userId,
      });

      const count = await repo.contarPorComprobante(tenantId, comprobanteId);
      expect(count).toBe(2);
    });
  });
});
