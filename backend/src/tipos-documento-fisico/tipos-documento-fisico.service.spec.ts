import type { TipoDocumentoFisico } from '@prisma/client';
import { TipoComprobante } from '@prisma/client';

import { TiposDocumentoFisicoService } from './tipos-documento-fisico.service';
import {
  TipoDocumentoFisicoCodigoDuplicadoError,
  TipoDocumentoFisicoConDocumentosError,
  TipoDocumentoFisicoNoEncontradoError,
  TipoDocumentoFisicoNombreDuplicadoError,
  TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError,
  TipoDocumentoFisicoNumeroInicialInmutableError,
} from './domain/tipo-documento-fisico-errors';
import type { TipoDocumentoFisicoRepositoryPort } from './ports/tipo-documento-fisico.repository.port';

// ============================================================
// Fixtures y mocks
// ============================================================

const TENANT_ID = 'org-1';
const USER_ID = 'user-1';
const TIPO_ID = 'tipo-1';

type MockRepo = { [K in keyof TipoDocumentoFisicoRepositoryPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByCodigo: jest.fn(),
    listar: jest.fn(),
    update: jest.fn(),
    setActivo: jest.fn(),
    countDocumentosFisicos: jest.fn(),
    eliminar: jest.fn(),
    upsertSeed: jest.fn(),
  };
}

function makeTipo(overrides: Partial<TipoDocumentoFisico> = {}): TipoDocumentoFisico {
  const now = new Date('2026-05-20T12:00:00Z');
  return {
    id: TIPO_ID,
    organizationId: TENANT_ID,
    nombre: 'Factura Recibida',
    codigo: 'factura-recibida',
    esTributario: true,
    activo: true,
    tiposComprobanteAplicables: [TipoComprobante.INGRESO],
    // Campos de numeración automática (change numeracion-tipo-documento):
    // default manual para retrocompatibilidad de los tests existentes.
    numeracionAutomatica: false,
    numeroInicial: null,
    createdAt: now,
    createdByUserId: USER_ID,
    updatedAt: now,
    ...overrides,
  };
}

function buildService(repo: MockRepo): TiposDocumentoFisicoService {
  return new TiposDocumentoFisicoService(repo as unknown as TipoDocumentoFisicoRepositoryPort);
}

// ============================================================
// Tests
// ============================================================

describe('TiposDocumentoFisicoService', () => {
  let repo: MockRepo;
  let service: TiposDocumentoFisicoService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = buildService(repo);
  });

  // ==========================================================
  // create
  // ==========================================================

  describe('create', () => {
    it('crea el tipo normalizando codigo y nombre mediante VOs y retorna el tipo persistido', async () => {
      const creado = makeTipo();
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockResolvedValue(creado);

      const result = await service.create(TENANT_ID, {
        nombre: '  Factura Recibida  ',
        codigo: '  FACTURA-RECIBIDA  ',
        esTributario: true,
        tiposComprobanteAplicables: [TipoComprobante.INGRESO],
        createdByUserId: USER_ID,
      });

      expect(result).toBe(creado);
      expect(repo.create).toHaveBeenCalledWith(TENANT_ID, {
        nombre: 'Factura Recibida',
        codigo: 'factura-recibida',
        esTributario: true,
        tiposComprobanteAplicables: [TipoComprobante.INGRESO],
        createdByUserId: USER_ID,
        numeracionAutomatica: false,
        numeroInicial: null,
      });
    });

    it('verifica unicidad de codigo antes de crear (pre-check amigable, REQ-T-02)', async () => {
      repo.findByCodigo.mockResolvedValue(makeTipo());

      await expect(
        service.create(TENANT_ID, {
          nombre: 'Otro Nombre',
          codigo: 'factura-recibida',
          esTributario: false,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(TipoDocumentoFisicoCodigoDuplicadoError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza codigo duplicado con el codigo normalizado en los detalles', async () => {
      repo.findByCodigo.mockResolvedValue(makeTipo());

      await expect(
        service.create(TENANT_ID, {
          nombre: 'Otro',
          codigo: '  FACTURA-RECIBIDA  ',
          esTributario: false,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
        }),
      ).rejects.toMatchObject({
        code: 'TIPO_DOCUMENTO_FISICO_CODIGO_DUPLICADO',
        details: { codigo: 'factura-recibida' },
      });
    });

    it('propaga TipoDocumentoFisicoNombreDuplicadoError del adapter (violación UNIQUE nombre)', async () => {
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockRejectedValue(
        new TipoDocumentoFisicoNombreDuplicadoError('Factura Recibida'),
      );

      await expect(
        service.create(TENANT_ID, {
          nombre: 'Factura Recibida',
          codigo: 'factura-recibida-2',
          esTributario: true,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(TipoDocumentoFisicoNombreDuplicadoError);
    });

    it('lanza RangeError si el codigo tiene formato inválido (delegado al VO)', async () => {
      await expect(
        service.create(TENANT_ID, {
          nombre: 'Nombre válido',
          codigo: 'codigo con espacios!',
          esTributario: false,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(RangeError);

      expect(repo.findByCodigo).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza RangeError si el nombre está vacío post-trim (delegado al VO)', async () => {
      await expect(
        service.create(TENANT_ID, {
          nombre: '   ',
          codigo: 'recibo-egreso',
          esTributario: false,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
        }),
      ).rejects.toThrow(RangeError);

      expect(repo.findByCodigo).not.toHaveBeenCalled();
    });

    it('crea tipo no-tributario con array vacío de tiposComprobanteAplicables', async () => {
      const creado = makeTipo({ esTributario: false, tiposComprobanteAplicables: [] });
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockResolvedValue(creado);

      const result = await service.create(TENANT_ID, {
        nombre: 'Vale de Caja',
        codigo: 'vale-caja',
        esTributario: false,
        tiposComprobanteAplicables: [],
        createdByUserId: null,
      });

      expect(result.esTributario).toBe(false);
      expect(result.tiposComprobanteAplicables).toEqual([]);
    });
  });

  // ==========================================================
  // findById
  // ==========================================================

  describe('findById', () => {
    it('devuelve el tipo si existe en el tenant', async () => {
      const tipo = makeTipo();
      repo.findById.mockResolvedValue(tipo);

      const result = await service.findById(TENANT_ID, TIPO_ID);

      expect(result).toBe(tipo);
      expect(repo.findById).toHaveBeenCalledWith(TENANT_ID, TIPO_ID);
    });

    it('lanza TipoDocumentoFisicoNoEncontradoError si no existe o pertenece a otro tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, TIPO_ID)).rejects.toThrow(
        TipoDocumentoFisicoNoEncontradoError,
      );
    });

    it('lanza NoEncontrado con el id en los detalles', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, TIPO_ID)).rejects.toMatchObject({
        code: 'TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO',
        details: { id: TIPO_ID },
      });
    });
  });

  // ==========================================================
  // listar
  // ==========================================================

  describe('listar', () => {
    it('delega al repo con filtros y paginación, devuelve items y total', async () => {
      const items = [makeTipo()];
      repo.listar.mockResolvedValue({ items, total: 1 });

      const result = await service.listar(TENANT_ID, { activo: true }, { page: 1, limit: 20 });

      expect(result).toEqual({ items, total: 1 });
      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, { activo: true }, { page: 1, limit: 20 });
    });

    it('devuelve solo los tipos del tenant (el filtro está en el repo)', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, {}, { page: 1, limit: 50 });

      // El tenant se pasa SIEMPRE como primer argumento — el repo hace la
      // defensa de multi-tenancy internamente (CLAUDE.md §4.2).
      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, expect.any(Object), expect.any(Object));
    });

    it('pasa filtro activo=all correctamente', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, { activo: 'all' }, { page: 2, limit: 10 });

      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        { activo: 'all' },
        { page: 2, limit: 10 },
      );
    });

    it('pasa filtro q correctamente', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.listar(TENANT_ID, { q: 'factura' }, { page: 1, limit: 50 });

      expect(repo.listar).toHaveBeenCalledWith(TENANT_ID, { q: 'factura' }, { page: 1, limit: 50 });
    });
  });

  // ==========================================================
  // update
  // ==========================================================

  describe('update', () => {
    it('actualiza nombre y esTributario cuando el tipo existe', async () => {
      const actualizado = makeTipo({ nombre: 'Factura Recibida Editada', esTributario: false });
      repo.findById.mockResolvedValue(makeTipo());
      repo.update.mockResolvedValue(actualizado);

      const result = await service.update(TENANT_ID, TIPO_ID, {
        nombre: 'Factura Recibida Editada',
        esTributario: false,
      });

      expect(result).toBe(actualizado);
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, TIPO_ID, {
        nombre: 'Factura Recibida Editada',
        esTributario: false,
      });
    });

    it('lanza NoEncontrado si el tipo no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, TIPO_ID, { nombre: 'Nuevo Nombre' })).rejects.toThrow(
        TipoDocumentoFisicoNoEncontradoError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ignora el campo codigo si llega en el input (inmutabilidad, E-T-07)', async () => {
      repo.findById.mockResolvedValue(makeTipo());
      repo.update.mockResolvedValue(makeTipo());

      // `codigo` es inmutable: no figura en el tipo de input pero simulamos
      // que llega como dato extra (ej. del body del controller sin strip).
      const inputConCodigo = { nombre: 'Otro Nombre', codigo: 'nuevo-codigo' } as Parameters<
        typeof service.update
      >[2];

      await service.update(TENANT_ID, TIPO_ID, inputConCodigo);

      // El repo no debe recibir el campo codigo en ningún caso.
      const callArg = repo.update.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('codigo');
    });

    it('actualiza tiposComprobanteAplicables correctamente', async () => {
      repo.findById.mockResolvedValue(makeTipo());
      repo.update.mockResolvedValue(
        makeTipo({ tiposComprobanteAplicables: [TipoComprobante.EGRESO] }),
      );

      await service.update(TENANT_ID, TIPO_ID, {
        tiposComprobanteAplicables: [TipoComprobante.EGRESO],
      });

      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, TIPO_ID, {
        tiposComprobanteAplicables: [TipoComprobante.EGRESO],
      });
    });

    it('PATCH — envía solo los campos presentes (no incluye campos undefined)', async () => {
      repo.findById.mockResolvedValue(makeTipo({ esTributario: true }));
      repo.update.mockResolvedValue(makeTipo());

      await service.update(TENANT_ID, TIPO_ID, { esTributario: false });

      // Solo esTributario debe llegar al repo, no nombre ni tiposComprobanteAplicables.
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, TIPO_ID, { esTributario: false });
    });
  });

  // ==========================================================
  // setActivo
  // ==========================================================

  describe('setActivo', () => {
    it('desactiva un tipo activo correctamente', async () => {
      const inactivo = makeTipo({ activo: false });
      repo.findById.mockResolvedValue(makeTipo({ activo: true }));
      repo.setActivo.mockResolvedValue(inactivo);

      const result = await service.setActivo(TENANT_ID, TIPO_ID, false);

      expect(result.activo).toBe(false);
      expect(repo.setActivo).toHaveBeenCalledWith(TENANT_ID, TIPO_ID, false);
    });

    it('reactiva un tipo inactivo correctamente', async () => {
      const activo = makeTipo({ activo: true });
      repo.findById.mockResolvedValue(makeTipo({ activo: false }));
      repo.setActivo.mockResolvedValue(activo);

      const result = await service.setActivo(TENANT_ID, TIPO_ID, true);

      expect(result.activo).toBe(true);
      expect(repo.setActivo).toHaveBeenCalledWith(TENANT_ID, TIPO_ID, true);
    });

    it('lanza NoEncontrado si el tipo no existe al desactivar', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.setActivo(TENANT_ID, TIPO_ID, false)).rejects.toThrow(
        TipoDocumentoFisicoNoEncontradoError,
      );

      expect(repo.setActivo).not.toHaveBeenCalled();
    });

    it('es idempotente: desactivar tipo ya inactivo no llama setActivo en el repo', async () => {
      const inactivo = makeTipo({ activo: false });
      repo.findById.mockResolvedValue(inactivo);

      const result = await service.setActivo(TENANT_ID, TIPO_ID, false);

      expect(result).toBe(inactivo);
      expect(repo.setActivo).not.toHaveBeenCalled();
    });

    it('es idempotente: activar tipo ya activo no llama setActivo en el repo', async () => {
      const activo = makeTipo({ activo: true });
      repo.findById.mockResolvedValue(activo);

      const result = await service.setActivo(TENANT_ID, TIPO_ID, true);

      expect(result).toBe(activo);
      expect(repo.setActivo).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // eliminar
  // ==========================================================

  describe('eliminar', () => {
    it('elimina el tipo si no tiene documentos físicos asociados (E-T-08)', async () => {
      repo.findById.mockResolvedValue(makeTipo());
      repo.countDocumentosFisicos.mockResolvedValue(0);
      repo.eliminar.mockResolvedValue(1);

      await service.eliminar(TENANT_ID, TIPO_ID);

      expect(repo.eliminar).toHaveBeenCalledWith(TENANT_ID, TIPO_ID);
    });

    it('lanza TipoDocumentoFisicoConDocumentosError si tiene docs asociados (E-T-09, defense in depth)', async () => {
      repo.findById.mockResolvedValue(makeTipo());
      repo.countDocumentosFisicos.mockResolvedValue(3);

      await expect(service.eliminar(TENANT_ID, TIPO_ID)).rejects.toMatchObject({
        code: 'TIPO_DOCUMENTO_FISICO_CON_DOCUMENTOS',
        details: { id: TIPO_ID, documentosCount: 3 },
      });

      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('lanza NoEncontrado si el tipo no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.eliminar(TENANT_ID, TIPO_ID)).rejects.toThrow(
        TipoDocumentoFisicoNoEncontradoError,
      );

      expect(repo.countDocumentosFisicos).not.toHaveBeenCalled();
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('propaga TipoDocumentoFisicoConDocumentosError del adapter (race condition FK Restrict)', async () => {
      repo.findById.mockResolvedValue(makeTipo());
      repo.countDocumentosFisicos.mockResolvedValue(0);
      repo.eliminar.mockRejectedValue(new TipoDocumentoFisicoConDocumentosError(TIPO_ID));

      await expect(service.eliminar(TENANT_ID, TIPO_ID)).rejects.toThrow(
        TipoDocumentoFisicoConDocumentosError,
      );
    });
  });

  // ==========================================================
  // create — numeración automática (E-TN-01..E-TN-05)
  // ==========================================================

  describe('create — numeración automática', () => {
    it('E-TN-01 (+) crea tipo auto no-tributario con numeroInicial explícito y lo persiste', async () => {
      const creado = makeTipo({
        esTributario: false,
        numeracionAutomatica: true,
        numeroInicial: 100,
      });
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockResolvedValue(creado);

      const result = await service.create(TENANT_ID, {
        nombre: 'Recibo de Caja',
        codigo: 'recibo-caja',
        esTributario: false,
        tiposComprobanteAplicables: [],
        createdByUserId: USER_ID,
        numeracionAutomatica: true,
        numeroInicial: 100,
      });

      expect(result.numeracionAutomatica).toBe(true);
      expect(result.numeroInicial).toBe(100);
      expect(repo.create).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ numeracionAutomatica: true, numeroInicial: 100 }),
      );
    });

    it('E-TN-02 (+) omitir numeracionAutomatica → persiste como false (retrocompat)', async () => {
      const creado = makeTipo({ numeracionAutomatica: false, numeroInicial: null });
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockResolvedValue(creado);

      await service.create(TENANT_ID, {
        nombre: 'Vale Caja',
        codigo: 'vale-caja',
        esTributario: false,
        tiposComprobanteAplicables: [],
        createdByUserId: null,
        // numeracionAutomatica ausente → default false
      });

      expect(repo.create).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ numeracionAutomatica: false, numeroInicial: null }),
      );
    });

    it('E-TN-03 (+) auto sin numeroInicial → persiste numeroInicial=1 (default)', async () => {
      const creado = makeTipo({
        esTributario: false,
        numeracionAutomatica: true,
        numeroInicial: 1,
      });
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockResolvedValue(creado);

      await service.create(TENANT_ID, {
        nombre: 'Recibo de Caja 2',
        codigo: 'recibo-caja-2',
        esTributario: false,
        tiposComprobanteAplicables: [],
        createdByUserId: USER_ID,
        numeracionAutomatica: true,
        // numeroInicial ausente → debe usar 1
      });

      expect(repo.create).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ numeracionAutomatica: true, numeroInicial: 1 }),
      );
    });

    it('E-TN-04 (+) numeroInicial ignorado silenciosamente cuando numeracionAutomatica=false', async () => {
      const creado = makeTipo({ numeracionAutomatica: false, numeroInicial: null });
      repo.findByCodigo.mockResolvedValue(null);
      repo.create.mockResolvedValue(creado);

      await service.create(TENANT_ID, {
        nombre: 'Cheque Recibido',
        codigo: 'cheque-recibido',
        esTributario: false,
        tiposComprobanteAplicables: [],
        createdByUserId: USER_ID,
        numeracionAutomatica: false,
        numeroInicial: 50, // debe ignorarse
      });

      // El repo recibe numeroInicial=null, no 50
      expect(repo.create).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ numeracionAutomatica: false, numeroInicial: null }),
      );
    });

    it('E-TN-05 (−) auto+tributario en create → TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError', async () => {
      repo.findByCodigo.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          nombre: 'Factura Recibida Auto',
          codigo: 'factura-auto',
          esTributario: true,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
          numeracionAutomatica: true,
        }),
      ).rejects.toThrow(TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('E-TN-05 (−) error código correcto TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA', async () => {
      repo.findByCodigo.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          nombre: 'Factura Auto',
          codigo: 'factura-auto-2',
          esTributario: true,
          tiposComprobanteAplicables: [],
          createdByUserId: USER_ID,
          numeracionAutomatica: true,
        }),
      ).rejects.toMatchObject({
        code: 'TIPO_DOCUMENTO_FISICO_NUMERACION_AUTO_TRIBUTARIO_INVALIDA',
      });
    });
  });

  // ==========================================================
  // update — set-once + toggle auto (E-TN-06..E-TN-11)
  // ==========================================================

  describe('update — set-once y toggles de numeración', () => {
    it('E-TN-06 (−) patch esTributario=true en tipo ya auto → TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError', async () => {
      // Tipo ya auto no-tributario; se intenta cambiar a tributario
      repo.findById.mockResolvedValue(
        makeTipo({ esTributario: false, numeracionAutomatica: true, numeroInicial: 1 }),
      );

      await expect(service.update(TENANT_ID, TIPO_ID, { esTributario: true })).rejects.toThrow(
        TipoDocumentoFisicoNumeracionAutoTributarioInvalidaError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('E-TN-07 (+) crear tipo manual no-tributario y luego hacerlo auto (toggle false→true) está prohibido (set-once aplica desde el primer create)', async () => {
      // Nota: el spec dice que toggle numeracionAutomatica post-create → 422 siempre.
      // Cambiar de false→true también es set-once: una vez emitido como false, no puede
      // cambiar a true (sería crear una secuencia implícita sin numero inicial confirmado).
      repo.findById.mockResolvedValue(
        makeTipo({ esTributario: false, numeracionAutomatica: false, numeroInicial: null }),
      );

      await expect(
        service.update(TENANT_ID, TIPO_ID, { numeracionAutomatica: true } as Parameters<
          typeof service.update
        >[2]),
      ).rejects.toThrow(TipoDocumentoFisicoNumeroInicialInmutableError);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('E-TN-08 (−) editar numeroInicial → TipoDocumentoFisicoNumeroInicialInmutableError', async () => {
      repo.findById.mockResolvedValue(makeTipo({ numeracionAutomatica: true, numeroInicial: 1 }));

      await expect(
        service.update(TENANT_ID, TIPO_ID, { numeroInicial: 50 } as Parameters<
          typeof service.update
        >[2]),
      ).rejects.toThrow(TipoDocumentoFisicoNumeroInicialInmutableError);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('E-TN-09 (−) editar numeroInicial con mismo valor (set-once sin excepción de idempotencia)', async () => {
      repo.findById.mockResolvedValue(makeTipo({ numeracionAutomatica: true, numeroInicial: 1 }));

      await expect(
        service.update(TENANT_ID, TIPO_ID, { numeroInicial: 1 } as Parameters<
          typeof service.update
        >[2]),
      ).rejects.toThrow(TipoDocumentoFisicoNumeroInicialInmutableError);
    });

    it('E-TN-10 (−) toggle numeracionAutomatica false → TipoDocumentoFisicoNumeroInicialInmutableError', async () => {
      repo.findById.mockResolvedValue(makeTipo({ numeracionAutomatica: true, numeroInicial: 1 }));

      await expect(
        service.update(TENANT_ID, TIPO_ID, { numeracionAutomatica: false } as Parameters<
          typeof service.update
        >[2]),
      ).rejects.toThrow(TipoDocumentoFisicoNumeroInicialInmutableError);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('E-TN-11 (+) editar otros campos (nombre, tiposComprobanteAplicables) en tipo auto es válido', async () => {
      const actualizado = makeTipo({
        nombre: 'Nuevo Nombre',
        numeracionAutomatica: true,
        numeroInicial: 1,
      });
      repo.findById.mockResolvedValue(makeTipo({ numeracionAutomatica: true, numeroInicial: 1 }));
      repo.update.mockResolvedValue(actualizado);

      const result = await service.update(TENANT_ID, TIPO_ID, { nombre: 'Nuevo Nombre' });

      expect(result.nombre).toBe('Nuevo Nombre');
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, TIPO_ID, { nombre: 'Nuevo Nombre' });
    });
  });
});
