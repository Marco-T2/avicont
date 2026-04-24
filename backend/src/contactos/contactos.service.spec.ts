import type { Contacto } from '@prisma/client';

import { ContactosService } from './contactos.service';
import {
  ContactoDocumentoDuplicadoError,
  ContactoFlagsInvalidosError,
  ContactoNoEncontradoError,
  ContactoRazonSocialRequeridaError,
  ContactoReferenciadoError,
} from './domain/contacto-errors';
import type { ContactosRepositoryPort } from './ports/contactos.repository.port';

// ============================================================
// Fixtures y mocks
// ============================================================

const TENANT_ID = 'org-1';
const USER_ID = 'user-1';
const CONTACTO_ID = 'contacto-1';
const CONTACTO_B_ID = 'contacto-2';

type MockRepo = { [K in keyof ContactosRepositoryPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    create: jest.fn(),
    update: jest.fn(),
    setActivo: jest.fn(),
    findById: jest.fn(),
    findByDocumento: jest.fn(),
    listar: jest.fn(),
    eliminar: jest.fn(),
    countLineasReferenciadoras: jest.fn(),
  };
}

function makeContacto(overrides: Partial<Contacto> = {}): Contacto {
  const now = new Date('2026-04-22T12:00:00Z');
  return {
    id: CONTACTO_ID,
    organizationId: TENANT_ID,
    razonSocial: 'Granjas El Sol SRL',
    nombreComercial: null,
    documento: null,
    esCliente: true,
    esProveedor: false,
    email: null,
    telefono: null,
    direccion: null,
    activo: true,
    createdAt: now,
    createdByUserId: USER_ID,
    updatedAt: now,
    ...overrides,
  };
}

function buildService(repo: MockRepo): ContactosService {
  return new ContactosService(repo as unknown as ContactosRepositoryPort);
}

// ============================================================
// Tests
// ============================================================

describe('ContactosService', () => {
  let repo: MockRepo;
  let service: ContactosService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = buildService(repo);
  });

  // ==========================================================
  // crear
  // ==========================================================

  describe('crear', () => {
    it('persiste normalizando campos opcionales y setea createdByUserId', async () => {
      const created = makeContacto();
      repo.create.mockResolvedValue(created);

      await service.crear(TENANT_ID, USER_ID, {
        razonSocial: '  Granjas El Sol SRL  ',
        nombreComercial: '  El Sol  ',
        documento: '  1234567019  ',
        esCliente: true,
        esProveedor: false,
        email: '  ventas@elsol.bo  ',
        telefono: '',
        direccion: null,
      });

      expect(repo.create).toHaveBeenCalledWith(TENANT_ID, {
        razonSocial: 'Granjas El Sol SRL',
        nombreComercial: 'El Sol',
        documento: '1234567019',
        esCliente: true,
        esProveedor: false,
        email: 'ventas@elsol.bo',
        telefono: null, // '' → null
        direccion: null,
        createdByUserId: USER_ID,
      });
    });

    it('rechaza razón social vacía sin tocar el repo', async () => {
      await expect(
        service.crear(TENANT_ID, USER_ID, {
          razonSocial: '   ',
          esCliente: true,
          esProveedor: false,
        }),
      ).rejects.toThrow(ContactoRazonSocialRequeridaError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza ambos flags en false sin tocar el repo', async () => {
      await expect(
        service.crear(TENANT_ID, USER_ID, {
          razonSocial: 'X SRL',
          esCliente: false,
          esProveedor: false,
        }),
      ).rejects.toThrow(ContactoFlagsInvalidosError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('sin documento — no consulta findByDocumento', async () => {
      repo.create.mockResolvedValue(makeContacto());
      await service.crear(TENANT_ID, USER_ID, {
        razonSocial: 'X SRL',
        esCliente: true,
        esProveedor: true,
      });
      expect(repo.findByDocumento).not.toHaveBeenCalled();
    });

    it('documento duplicado — lanza ContactoDocumentoDuplicadoError con el id existente', async () => {
      repo.findByDocumento.mockResolvedValue(makeContacto({ id: 'existente-id' }));

      await expect(
        service.crear(TENANT_ID, USER_ID, {
          razonSocial: 'Otro',
          documento: '1234567019',
          esCliente: true,
          esProveedor: false,
        }),
      ).rejects.toMatchObject({
        code: 'CONTACTO_DOCUMENTO_DUPLICADO',
        details: { documento: '1234567019', contactoExistenteId: 'existente-id' },
      });

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('documento con whitespace — normaliza antes de chequear unicidad', async () => {
      repo.findByDocumento.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeContacto());

      await service.crear(TENANT_ID, USER_ID, {
        razonSocial: 'X SRL',
        documento: '  1234567019  ',
        esCliente: true,
        esProveedor: false,
      });

      expect(repo.findByDocumento).toHaveBeenCalledWith(TENANT_ID, '1234567019');
    });
  });

  // ==========================================================
  // actualizar
  // ==========================================================

  describe('actualizar', () => {
    it('rechaza si no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.actualizar(TENANT_ID, CONTACTO_ID, { razonSocial: 'Nuevo' }),
      ).rejects.toThrow(ContactoNoEncontradoError);
    });

    it('PATCH — sólo envía al repo los campos presentes', async () => {
      repo.findById.mockResolvedValue(makeContacto({ razonSocial: 'Viejo', email: 'a@x.com' }));
      repo.update.mockResolvedValue(makeContacto({ razonSocial: 'Nuevo' }));

      await service.actualizar(TENANT_ID, CONTACTO_ID, { razonSocial: 'Nuevo' });

      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, CONTACTO_ID, {
        razonSocial: 'Nuevo',
      });
    });

    it('rechaza razón social vacía si viene', async () => {
      repo.findById.mockResolvedValue(makeContacto());
      await expect(
        service.actualizar(TENANT_ID, CONTACTO_ID, { razonSocial: '   ' }),
      ).rejects.toThrow(ContactoRazonSocialRequeridaError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rechaza si el cambio deja ambos flags en false', async () => {
      repo.findById.mockResolvedValue(makeContacto({ esCliente: true, esProveedor: false }));
      await expect(
        service.actualizar(TENANT_ID, CONTACTO_ID, { esCliente: false }),
      ).rejects.toThrow(ContactoFlagsInvalidosError);
    });

    it('acepta toggle que deja al menos un flag activo', async () => {
      repo.findById.mockResolvedValue(makeContacto({ esCliente: true, esProveedor: false }));
      repo.update.mockResolvedValue(makeContacto());
      await expect(
        service.actualizar(TENANT_ID, CONTACTO_ID, { esCliente: false, esProveedor: true }),
      ).resolves.toBeDefined();
    });

    it('no valida flags si ninguno viene en el PATCH', async () => {
      repo.findById.mockResolvedValue(makeContacto({ esCliente: false, esProveedor: true }));
      repo.update.mockResolvedValue(makeContacto());
      await service.actualizar(TENANT_ID, CONTACTO_ID, { email: 'nuevo@x.com' });
      expect(repo.update).toHaveBeenCalled();
    });

    it('documento sin cambio — no consulta findByDocumento', async () => {
      repo.findById.mockResolvedValue(makeContacto({ documento: '1234567019' }));
      repo.update.mockResolvedValue(makeContacto());
      await service.actualizar(TENANT_ID, CONTACTO_ID, { documento: '  1234567019  ' });
      expect(repo.findByDocumento).not.toHaveBeenCalled();
    });

    it('documento duplicado en otro contacto — lanza duplicado', async () => {
      repo.findById.mockResolvedValue(makeContacto({ documento: '1111111' }));
      repo.findByDocumento.mockResolvedValue(makeContacto({ id: CONTACTO_B_ID, documento: '9999999' }));

      await expect(
        service.actualizar(TENANT_ID, CONTACTO_ID, { documento: '9999999' }),
      ).rejects.toThrow(ContactoDocumentoDuplicadoError);
    });

    it('limpiar documento (null) — no consulta unicidad', async () => {
      repo.findById.mockResolvedValue(makeContacto({ documento: '1111111' }));
      repo.update.mockResolvedValue(makeContacto({ documento: null }));
      await service.actualizar(TENANT_ID, CONTACTO_ID, { documento: null });
      expect(repo.findByDocumento).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, CONTACTO_ID, { documento: null });
    });
  });

  // ==========================================================
  // obtener
  // ==========================================================

  describe('obtener', () => {
    it('devuelve el contacto si existe', async () => {
      const c = makeContacto();
      repo.findById.mockResolvedValue(c);
      await expect(service.obtener(TENANT_ID, CONTACTO_ID)).resolves.toBe(c);
    });

    it('lanza ContactoNoEncontradoError si no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.obtener(TENANT_ID, CONTACTO_ID)).rejects.toThrow(
        ContactoNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // listar
  // ==========================================================

  describe('listar', () => {
    it('aplica defaults de paginación (page=1, limit=50)', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });
      const res = await service.listar(TENANT_ID, {});
      expect(res.page).toBe(1);
      expect(res.limit).toBe(50);
      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, {}, { page: 1, limit: 50 });
    });

    it('clamp limit a 200 máximo', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });
      const res = await service.listar(TENANT_ID, { limit: 9999 });
      expect(res.limit).toBe(200);
      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, {}, { page: 1, limit: 200 });
    });

    it('pasa filtros al repo', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });
      await service.listar(TENANT_ID, {
        q: 'marc',
        esCliente: true,
        activo: 'all',
        orderBy: 'createdAt',
        orderDir: 'desc',
      });
      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        { q: 'marc', esCliente: true, activo: 'all' },
        { page: 1, limit: 50, orderBy: 'createdAt', orderDir: 'desc' },
      );
    });

    it('devuelve items + total + page + limit', async () => {
      const items = [makeContacto()];
      repo.listar.mockResolvedValue({ items, total: 42 });
      const res = await service.listar(TENANT_ID, { page: 2, limit: 10 });
      expect(res).toEqual({ items, total: 42, page: 2, limit: 10 });
    });
  });

  // ==========================================================
  // desactivar / reactivar
  // ==========================================================

  describe('desactivar', () => {
    it('cambia activo a false', async () => {
      repo.findById.mockResolvedValue(makeContacto({ activo: true }));
      repo.setActivo.mockResolvedValue(makeContacto({ activo: false }));
      const res = await service.desactivar(TENANT_ID, CONTACTO_ID);
      expect(res.activo).toBe(false);
      expect(repo.setActivo).toHaveBeenCalledWith(TENANT_ID, CONTACTO_ID, false);
    });

    it('es idempotente si ya está inactivo', async () => {
      const inactivo = makeContacto({ activo: false });
      repo.findById.mockResolvedValue(inactivo);
      const res = await service.desactivar(TENANT_ID, CONTACTO_ID);
      expect(res).toBe(inactivo);
      expect(repo.setActivo).not.toHaveBeenCalled();
    });

    it('lanza NoEncontrado si el id no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.desactivar(TENANT_ID, CONTACTO_ID)).rejects.toThrow(
        ContactoNoEncontradoError,
      );
    });
  });

  describe('reactivar', () => {
    it('cambia activo a true', async () => {
      repo.findById.mockResolvedValue(makeContacto({ activo: false }));
      repo.setActivo.mockResolvedValue(makeContacto({ activo: true }));
      await service.reactivar(TENANT_ID, CONTACTO_ID);
      expect(repo.setActivo).toHaveBeenCalledWith(TENANT_ID, CONTACTO_ID, true);
    });

    it('es idempotente si ya está activo', async () => {
      const activo = makeContacto({ activo: true });
      repo.findById.mockResolvedValue(activo);
      const res = await service.reactivar(TENANT_ID, CONTACTO_ID);
      expect(res).toBe(activo);
      expect(repo.setActivo).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // eliminar
  // ==========================================================

  describe('eliminar', () => {
    it('elimina si no hay líneas referenciadoras', async () => {
      repo.findById.mockResolvedValue(makeContacto());
      repo.countLineasReferenciadoras.mockResolvedValue(0);
      repo.eliminar.mockResolvedValue(1);
      await service.eliminar(TENANT_ID, CONTACTO_ID);
      expect(repo.eliminar).toHaveBeenCalledWith(TENANT_ID, CONTACTO_ID);
    });

    it('lanza ContactoReferenciadoError con count si hay líneas', async () => {
      repo.findById.mockResolvedValue(makeContacto());
      repo.countLineasReferenciadoras.mockResolvedValue(7);
      await expect(service.eliminar(TENANT_ID, CONTACTO_ID)).rejects.toMatchObject({
        code: 'CONTACTO_REFERENCIADO',
        details: { id: CONTACTO_ID, lineasCount: 7 },
      });
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('lanza NoEncontrado si el id no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.eliminar(TENANT_ID, CONTACTO_ID)).rejects.toThrow(
        ContactoNoEncontradoError,
      );
      expect(repo.countLineasReferenciadoras).not.toHaveBeenCalled();
    });

    it('propaga ContactoReferenciadoError del adapter (race condition)', async () => {
      repo.findById.mockResolvedValue(makeContacto());
      repo.countLineasReferenciadoras.mockResolvedValue(0);
      repo.eliminar.mockRejectedValue(new ContactoReferenciadoError(CONTACTO_ID));
      await expect(service.eliminar(TENANT_ID, CONTACTO_ID)).rejects.toThrow(
        ContactoReferenciadoError,
      );
    });
  });
});
