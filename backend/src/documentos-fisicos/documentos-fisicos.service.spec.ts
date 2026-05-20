import { Moneda } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { DocumentosFisicosService } from './documentos-fisicos.service';
import {
  DocumentoFisicoNoEncontradoError,
  DocumentoFisicoNumeroDuplicadoError,
  DocumentoFisicoNumeroFormatoInvalidoError,
  DocumentoFisicoInmutablePorComprobanteContabilizadoError,
  DocumentoFisicoReferenciadoPorComprobanteError,
} from './domain/documento-fisico-errors';
import type {
  DocumentoFisicoRepositoryPort,
  DocumentoFisicoCreateData,
  DocumentoFisicoListarFiltros,
  DocumentoFisicoListarPagination,
} from './ports/documento-fisico.repository.port';
import type { TiposDocumentoFisicoReaderPort } from '@/tipos-documento-fisico/ports/tipos-documento-fisico-reader.port';
import {
  TipoDocumentoFisicoNoEncontradoError,
  TipoDocumentoFisicoInactivoError,
} from '@/tipos-documento-fisico/domain/tipo-documento-fisico-errors';
import type { ContactosReaderPort } from '@/contactos/ports/contactos-reader.port';
import { ContactoNoEncontradoError } from '@/contactos/domain/contacto-errors';

// ============================================================
// Fixtures y mocks
// ============================================================

const TENANT_ID = 'org-1';
const USER_ID = 'user-1';
const DOC_ID = 'doc-1';
const TIPO_ID = 'tipo-1';
const CONTACTO_ID = 'contacto-1';

type MockRepo = { [K in keyof DocumentoFisicoRepositoryPort]: jest.Mock };
type MockTiposReader = { [K in keyof TiposDocumentoFisicoReaderPort]: jest.Mock };
type MockContactosReader = { [K in keyof ContactosReaderPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByNumero: jest.fn(),
    listar: jest.fn(),
    findByIdConRelaciones: jest.fn(),
    findDetalleById: jest.fn(),
    listarConRelaciones: jest.fn(),
    update: jest.fn(),
    eliminar: jest.fn(),
    countAsociaciones: jest.fn(),
    countAsociacionesContabilizadas: jest.fn(),
  };
}

function makeTiposReaderMock(): MockTiposReader {
  return {
    findById: jest.fn(),
  };
}

function makeContactosReaderMock(): MockContactosReader {
  return {
    obtenerBatch: jest.fn(),
  };
}

const FECHA_EMISION = new Date('2026-05-20');

function makeDocumento(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    organizationId: TENANT_ID,
    tipoDocumentoFisicoId: TIPO_ID,
    numero: 'FC-0001',
    fechaEmision: FECHA_EMISION,
    monto: new Prisma.Decimal('1250.00'),
    moneda: Moneda.BOB,
    glosa: 'Compra de insumos',
    contactoId: CONTACTO_ID,
    createdAt: new Date('2026-05-20T12:00:00Z'),
    updatedAt: new Date('2026-05-20T12:00:00Z'),
    createdByUserId: USER_ID,
    ...overrides,
  };
}

function makeTipoParaValidacion(overrides: Record<string, unknown> = {}) {
  return {
    id: TIPO_ID,
    codigo: 'factura-recibida',
    esTributario: true,
    activo: true,
    tiposComprobanteAplicables: [],
    ...overrides,
  };
}

function buildService(
  repo: MockRepo,
  tiposReader: MockTiposReader,
  contactosReader: MockContactosReader,
): DocumentosFisicosService {
  return new DocumentosFisicosService(
    repo as unknown as DocumentoFisicoRepositoryPort,
    tiposReader as unknown as TiposDocumentoFisicoReaderPort,
    contactosReader as unknown as ContactosReaderPort,
  );
}

// ============================================================
// Tests
// ============================================================

describe('DocumentosFisicosService', () => {
  let repo: MockRepo;
  let tiposReader: MockTiposReader;
  let contactosReader: MockContactosReader;
  let service: DocumentosFisicosService;

  beforeEach(() => {
    repo = makeRepoMock();
    tiposReader = makeTiposReaderMock();
    contactosReader = makeContactosReaderMock();
    service = buildService(repo, tiposReader, contactosReader);
  });

  // ==========================================================
  // create
  // ==========================================================

  describe('create', () => {
    it('crea el documento normalizando el número y retorna el documento persistido', async () => {
      const tipo = makeTipoParaValidacion();
      tiposReader.findById.mockResolvedValue(tipo);
      contactosReader.obtenerBatch.mockResolvedValue(
        new Map([[CONTACTO_ID, { id: CONTACTO_ID, activo: true }]]),
      );
      repo.findByNumero.mockResolvedValue(null);
      const creado = makeDocumento({ numero: 'FC-0001' });
      repo.create.mockResolvedValue(creado);

      const result = await service.create(TENANT_ID, {
        tipoDocumentoFisicoId: TIPO_ID,
        numero: '  fc-0001  ',
        fechaEmision: FECHA_EMISION,
        monto: '1250.00',
        moneda: Moneda.BOB,
        glosa: 'Compra de insumos',
        contactoId: CONTACTO_ID,
        createdByUserId: USER_ID,
      });

      expect(result).toBe(creado);
      // El número se normaliza: trim + uppercase
      const createCall = repo.create.mock.calls[0] as [string, DocumentoFisicoCreateData];
      expect(createCall[1].numero).toBe('FC-0001');
    });

    it('lanza TipoDocumentoFisicoNoEncontradoError si el tipo no existe en el tenant', async () => {
      tiposReader.findById.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          tipoDocumentoFisicoId: 'tipo-otro-tenant',
          numero: 'FC-0001',
          fechaEmision: FECHA_EMISION,
          monto: '1250.00',
          moneda: Moneda.BOB,
          glosa: null,
          contactoId: null,
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(TipoDocumentoFisicoNoEncontradoError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza TipoDocumentoFisicoInactivoError si el tipo está inactivo', async () => {
      tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ activo: false }));

      await expect(
        service.create(TENANT_ID, {
          tipoDocumentoFisicoId: TIPO_ID,
          numero: 'FC-0001',
          fechaEmision: FECHA_EMISION,
          monto: '1250.00',
          moneda: Moneda.BOB,
          glosa: null,
          contactoId: null,
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(TipoDocumentoFisicoInactivoError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('permite crear con contacto inactivo — E-D-09 (validación de activo es al contabilizar)', async () => {
      tiposReader.findById.mockResolvedValue(makeTipoParaValidacion());
      contactosReader.obtenerBatch.mockResolvedValue(
        new Map([[CONTACTO_ID, { id: CONTACTO_ID, activo: false }]]),
      );
      repo.findByNumero.mockResolvedValue(null);
      const creado = makeDocumento();
      repo.create.mockResolvedValue(creado);

      const result = await service.create(TENANT_ID, {
        tipoDocumentoFisicoId: TIPO_ID,
        numero: 'FC-0001',
        fechaEmision: FECHA_EMISION,
        monto: '1250.00',
        moneda: Moneda.BOB,
        glosa: null,
        contactoId: CONTACTO_ID,
        createdByUserId: USER_ID,
      });

      expect(result).toBe(creado);
    });

    it('lanza ContactoNoEncontradoError si el contacto no existe en el tenant', async () => {
      tiposReader.findById.mockResolvedValue(makeTipoParaValidacion());
      // Contacto de otro tenant: no aparece en el Map
      contactosReader.obtenerBatch.mockResolvedValue(new Map());

      await expect(
        service.create(TENANT_ID, {
          tipoDocumentoFisicoId: TIPO_ID,
          numero: 'FC-0001',
          fechaEmision: FECHA_EMISION,
          monto: '1250.00',
          moneda: Moneda.BOB,
          glosa: null,
          contactoId: 'contacto-otro-tenant',
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(ContactoNoEncontradoError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    // ----------------------------------------------------------
    // Validación monto condicional (REQ-D-13/14) — el corazón
    // ----------------------------------------------------------

    describe('validación monto condicional', () => {
      it('tipo tributario + monto null → DocumentoFisicoMontoRequeridoParaTributarioError con campo monto (E-D-14)', async () => {
        tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ esTributario: true }));

        await expect(
          service.create(TENANT_ID, {
            tipoDocumentoFisicoId: TIPO_ID,
            numero: 'FC-0001',
            fechaEmision: FECHA_EMISION,
            monto: null,
            moneda: Moneda.BOB,
            glosa: null,
            contactoId: null,
            createdByUserId: USER_ID,
          }),
        ).rejects.toMatchObject({
          code: 'DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO',
          details: { campo: 'monto' },
        });

        expect(repo.create).not.toHaveBeenCalled();
      });

      it('tipo tributario + moneda null → DocumentoFisicoMontoRequeridoParaTributarioError con campo moneda', async () => {
        tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ esTributario: true }));

        await expect(
          service.create(TENANT_ID, {
            tipoDocumentoFisicoId: TIPO_ID,
            numero: 'FC-0001',
            fechaEmision: FECHA_EMISION,
            monto: '1250.00',
            moneda: null,
            glosa: null,
            contactoId: null,
            createdByUserId: USER_ID,
          }),
        ).rejects.toMatchObject({
          code: 'DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO',
          details: { campo: 'moneda' },
        });

        expect(repo.create).not.toHaveBeenCalled();
      });

      it('tipo tributario + monto + moneda → crea el documento exitosamente (E-D-13)', async () => {
        tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ esTributario: true }));
        contactosReader.obtenerBatch.mockResolvedValue(new Map());
        repo.findByNumero.mockResolvedValue(null);
        const creado = makeDocumento();
        repo.create.mockResolvedValue(creado);

        const result = await service.create(TENANT_ID, {
          tipoDocumentoFisicoId: TIPO_ID,
          numero: 'FC-0001',
          fechaEmision: FECHA_EMISION,
          monto: '1250.00',
          moneda: Moneda.BOB,
          glosa: null,
          contactoId: null,
          createdByUserId: USER_ID,
        });

        expect(result).toBe(creado);
      });

      it('tipo no-tributario + monto null → crea el documento sin monto (E-D-15)', async () => {
        tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ esTributario: false }));
        contactosReader.obtenerBatch.mockResolvedValue(new Map());
        repo.findByNumero.mockResolvedValue(null);
        const creado = makeDocumento({ monto: null, moneda: null });
        repo.create.mockResolvedValue(creado);

        const result = await service.create(TENANT_ID, {
          tipoDocumentoFisicoId: TIPO_ID,
          numero: 'REC-001',
          fechaEmision: FECHA_EMISION,
          monto: null,
          moneda: null,
          glosa: null,
          contactoId: null,
          createdByUserId: USER_ID,
        });

        expect(result).toBe(creado);
        // El repo debe recibir monto=null y moneda=null
        const createCall = repo.create.mock.calls[0] as [string, DocumentoFisicoCreateData];
        expect(createCall[1].monto).toBeNull();
        expect(createCall[1].moneda).toBeNull();
      });

      it('tipo no-tributario + monto no-null → DocumentoFisicoMontoNoPermitidoParaNoTributarioError con campo monto (E-D-16)', async () => {
        tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ esTributario: false }));

        await expect(
          service.create(TENANT_ID, {
            tipoDocumentoFisicoId: TIPO_ID,
            numero: 'REC-001',
            fechaEmision: FECHA_EMISION,
            monto: '500.00',
            moneda: null,
            glosa: null,
            contactoId: null,
            createdByUserId: USER_ID,
          }),
        ).rejects.toMatchObject({
          code: 'DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO',
          details: { campo: 'monto' },
        });

        expect(repo.create).not.toHaveBeenCalled();
      });

      it('tipo no-tributario + moneda no-null → DocumentoFisicoMontoNoPermitidoParaNoTributarioError con campo moneda', async () => {
        tiposReader.findById.mockResolvedValue(makeTipoParaValidacion({ esTributario: false }));

        await expect(
          service.create(TENANT_ID, {
            tipoDocumentoFisicoId: TIPO_ID,
            numero: 'REC-001',
            fechaEmision: FECHA_EMISION,
            monto: null,
            moneda: Moneda.USD,
            glosa: null,
            contactoId: null,
            createdByUserId: USER_ID,
          }),
        ).rejects.toMatchObject({
          code: 'DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO',
          details: { campo: 'moneda' },
        });

        expect(repo.create).not.toHaveBeenCalled();
      });
    });

    it('lanza DocumentoFisicoNumeroDuplicadoError si ya existe un documento con ese número y tipo', async () => {
      tiposReader.findById.mockResolvedValue(makeTipoParaValidacion());
      contactosReader.obtenerBatch.mockResolvedValue(new Map());
      repo.findByNumero.mockResolvedValue(makeDocumento());

      await expect(
        service.create(TENANT_ID, {
          tipoDocumentoFisicoId: TIPO_ID,
          numero: 'FC-0001',
          fechaEmision: FECHA_EMISION,
          monto: '1250.00',
          moneda: Moneda.BOB,
          glosa: null,
          contactoId: null,
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(DocumentoFisicoNumeroDuplicadoError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza DocumentoFisicoNumeroFormatoInvalidoError si el número tiene formato inválido', async () => {
      tiposReader.findById.mockResolvedValue(makeTipoParaValidacion());

      await expect(
        service.create(TENANT_ID, {
          tipoDocumentoFisicoId: TIPO_ID,
          numero: 'número con espacios',
          fechaEmision: FECHA_EMISION,
          monto: '1250.00',
          moneda: Moneda.BOB,
          glosa: null,
          contactoId: null,
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(DocumentoFisicoNumeroFormatoInvalidoError);

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // findById
  // ==========================================================

  describe('findById', () => {
    it('devuelve el documento si existe en el tenant', async () => {
      const doc = makeDocumento();
      repo.findById.mockResolvedValue(doc);

      const result = await service.findById(TENANT_ID, DOC_ID);

      expect(result).toBe(doc);
      expect(repo.findById).toHaveBeenCalledWith(TENANT_ID, DOC_ID);
    });

    it('lanza DocumentoFisicoNoEncontradoError si no existe o pertenece a otro tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, DOC_ID)).rejects.toThrow(
        DocumentoFisicoNoEncontradoError,
      );
    });

    it('lanza NoEncontrado con el id en los detalles', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, DOC_ID)).rejects.toMatchObject({
        code: 'DOCUMENTO_FISICO_NO_ENCONTRADO',
        details: { id: DOC_ID },
      });
    });
  });

  // ==========================================================
  // listar
  // ==========================================================

  describe('listar', () => {
    it('delega al repo con filtros y paginación, devuelve items y total', async () => {
      const items = [makeDocumento()];
      repo.listar.mockResolvedValue({ items, total: 1 });

      const filtros: DocumentoFisicoListarFiltros = { tipoDocumentoFisicoId: TIPO_ID };
      const pagination: DocumentoFisicoListarPagination = { page: 1, limit: 20 };

      const result = await service.listar(TENANT_ID, filtros, pagination);

      expect(result).toEqual({ items, total: 1 });
      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, filtros, pagination);
    });

    it('pasa el tenantId siempre como primer argumento (multi-tenancy defense in depth)', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, {}, { page: 1, limit: 50 });

      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, expect.any(Object), expect.any(Object));
    });

    it('pasa filtro estado libre correctamente', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, { estado: 'libre' }, { page: 1, limit: 20 });

      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        { estado: 'libre' },
        { page: 1, limit: 20 },
      );
    });

    it('pasa filtro contactoId correctamente', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, { contactoId: CONTACTO_ID }, { page: 2, limit: 10 });

      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        { contactoId: CONTACTO_ID },
        { page: 2, limit: 10 },
      );
    });
  });

  // ==========================================================
  // obtenerConRelaciones / obtenerDetalle / listarConRelaciones
  // ==========================================================

  describe('obtenerConRelaciones', () => {
    it('devuelve el documento enriquecido cuando existe', async () => {
      const enriquecido = makeDocumento();
      repo.findByIdConRelaciones.mockResolvedValue(enriquecido);

      const result = await service.obtenerConRelaciones(TENANT_ID, DOC_ID);

      expect(result).toBe(enriquecido);
      expect(repo.findByIdConRelaciones).toHaveBeenCalledWith(TENANT_ID, DOC_ID);
    });

    it('lanza DocumentoFisicoNoEncontradoError cuando el repo devuelve null', async () => {
      repo.findByIdConRelaciones.mockResolvedValue(null);

      await expect(service.obtenerConRelaciones(TENANT_ID, DOC_ID)).rejects.toThrow(
        DocumentoFisicoNoEncontradoError,
      );
    });
  });

  describe('obtenerDetalle', () => {
    it('devuelve el detalle con comprobantes asociados cuando existe', async () => {
      const detalle = { ...makeDocumento(), comprobantesAsociados: [] };
      repo.findDetalleById.mockResolvedValue(detalle);

      const result = await service.obtenerDetalle(TENANT_ID, DOC_ID);

      expect(result).toBe(detalle);
      expect(repo.findDetalleById).toHaveBeenCalledWith(TENANT_ID, DOC_ID);
    });

    it('lanza DocumentoFisicoNoEncontradoError cuando el repo devuelve null', async () => {
      repo.findDetalleById.mockResolvedValue(null);

      await expect(service.obtenerDetalle(TENANT_ID, DOC_ID)).rejects.toThrow(
        DocumentoFisicoNoEncontradoError,
      );
    });
  });

  describe('listarConRelaciones', () => {
    it('delega al repo con filtros y paginación', async () => {
      const items = [makeDocumento()];
      repo.listarConRelaciones.mockResolvedValue({ items, total: 1 });

      const filtros: DocumentoFisicoListarFiltros = { tipoDocumentoFisicoId: TIPO_ID };
      const pagination: DocumentoFisicoListarPagination = { page: 1, limit: 20 };

      const result = await service.listarConRelaciones(TENANT_ID, filtros, pagination);

      expect(result).toEqual({ items, total: 1 });
      expect(repo.listarConRelaciones).toHaveBeenCalledWith(TENANT_ID, filtros, pagination);
    });
  });

  // ==========================================================
  // update (PATCH)
  // ==========================================================

  describe('update', () => {
    it('actualiza el documento cuando está suelto (sin asociaciones)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      repo.countAsociacionesContabilizadas.mockResolvedValue(0);
      const actualizado = makeDocumento({ glosa: 'Editado' });
      repo.update.mockResolvedValue(actualizado);

      const result = await service.update(TENANT_ID, DOC_ID, { glosa: 'Editado' });

      expect(result).toBe(actualizado);
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, DOC_ID, { glosa: 'Editado' });
    });

    it('permite editar documento en borrador (E-E-02)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      // countAsociacionesContabilizadas = 0 → hay borradores pero no contabilizados
      repo.countAsociacionesContabilizadas.mockResolvedValue(0);
      const actualizado = makeDocumento({ glosa: 'Editado en borrador' });
      repo.update.mockResolvedValue(actualizado);

      const result = await service.update(TENANT_ID, DOC_ID, { glosa: 'Editado en borrador' });

      expect(result).toBe(actualizado);
    });

    it('lanza DocumentoFisicoInmutablePorComprobanteContabilizadoError si hay comprobante contabilizado (E-E-03)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      repo.countAsociacionesContabilizadas.mockResolvedValue(1);

      await expect(
        service.update(TENANT_ID, DOC_ID, { glosa: 'Intento de edición' }),
      ).rejects.toThrow(DocumentoFisicoInmutablePorComprobanteContabilizadoError);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('lanza inmutable también cuando hay mezcla de borradores + contabilizados (E-E-04)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      // Mixto: al menos uno contabilizado
      repo.countAsociacionesContabilizadas.mockResolvedValue(1);

      await expect(service.update(TENANT_ID, DOC_ID, { glosa: 'Intento' })).rejects.toThrow(
        DocumentoFisicoInmutablePorComprobanteContabilizadoError,
      );
    });

    it('normaliza el número en edición también (E-E-05)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      repo.countAsociacionesContabilizadas.mockResolvedValue(0);
      repo.update.mockResolvedValue(makeDocumento({ numero: 'FC-0002' }));

      await service.update(TENANT_ID, DOC_ID, { numero: '  fc-0002  ' });

      const updateCall = repo.update.mock.calls[0] as [string, string, { numero?: string }];
      expect(updateCall[2].numero).toBe('FC-0002');
    });

    it('lanza DocumentoFisicoNoEncontradoError si el documento no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, DOC_ID, { glosa: 'Test' })).rejects.toThrow(
        DocumentoFisicoNoEncontradoError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // eliminar
  // ==========================================================

  describe('eliminar', () => {
    it('elimina el documento cuando nunca fue asociado (E-EL-01)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      repo.countAsociaciones.mockResolvedValue(0);
      repo.eliminar.mockResolvedValue(1);

      await service.eliminar(TENANT_ID, DOC_ID);

      expect(repo.eliminar).toHaveBeenCalledWith(TENANT_ID, DOC_ID);
    });

    it('lanza DocumentoFisicoReferenciadoPorComprobanteError si tiene asociaciones activas (E-EL-03)', async () => {
      repo.findById.mockResolvedValue(makeDocumento());
      repo.countAsociaciones.mockResolvedValue(1);

      await expect(service.eliminar(TENANT_ID, DOC_ID)).rejects.toThrow(
        DocumentoFisicoReferenciadoPorComprobanteError,
      );

      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('lanza DocumentoFisicoNoEncontradoError si el documento no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.eliminar(TENANT_ID, DOC_ID)).rejects.toThrow(
        DocumentoFisicoNoEncontradoError,
      );

      expect(repo.countAsociaciones).not.toHaveBeenCalled();
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    // E-EL-02: per design D7, después de que un comprobante se anula las
    // asociaciones se borran en la TX del anular. Por lo tanto,
    // countAsociaciones = 0 y el documento SÍ es eliminable post-anulación.
    // El flag `tuvoAsociacion` para retener historial es deuda documentada
    // (task 9.4) — se marca como todo hasta que se implemente la tabla de auditoría.
    it.todo(
      'E-EL-02: documento que tuvo asociación con comprobante anulado queda bloqueado si se implementa flag tuvoAsociacion (deuda task 9.4)',
    );
  });
});
