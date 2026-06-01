import { NaturalezaRegistro } from './domain/enums';
import {
  TipoRegistroNombreDuplicadoError,
  TipoRegistroNoEncontradoError,
  TipoRegistroNaturalezaInmutableError,
  TipoRegistroSistemaNoEditableError,
  TipoRegistroSistemaNoEliminableError,
  TipoRegistroEnUsoError,
} from './domain/granja-errors';
import { TipoRegistroService } from './tipo-registro.service';
import type {
  TipoRegistroRepositoryPort,
  TipoRegistroRow,
} from './ports/tipo-registro.repository.port';

// ============================================================
// Fixtures y mocks
// ============================================================

const ORG_ID = 'org-test-1';
const TIPO_ID = 'tipo-id-1';

function makeTipoRow(overrides: Partial<TipoRegistroRow> = {}): TipoRegistroRow {
  return {
    id: TIPO_ID,
    organizationId: ORG_ID,
    nombre: 'Alimento',
    naturaleza: NaturalezaRegistro.INVERSION,
    esSistema: false,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface MockRepo {
  create: jest.Mock;
  findById: jest.Mock;
  findByNombre: jest.Mock;
  listar: jest.Mock;
  update: jest.Mock;
  countMovimientos: jest.Mock;
  eliminar: jest.Mock;
  upsertSeed: jest.Mock;
}

function makeRepoMock(): MockRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByNombre: jest.fn(),
    listar: jest.fn(),
    update: jest.fn(),
    countMovimientos: jest.fn(),
    eliminar: jest.fn(),
    upsertSeed: jest.fn(),
  };
}

function buildService(repo: MockRepo): TipoRegistroService {
  return new TipoRegistroService(repo as unknown as TipoRegistroRepositoryPort);
}

// ============================================================
// Tests
// ============================================================

describe('TipoRegistroService', () => {
  let repo: MockRepo;
  let service: TipoRegistroService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = buildService(repo);
  });

  // ==========================================================
  // create
  // ==========================================================

  describe('create', () => {
    it('pre-check: lanza TipoRegistroNombreDuplicadoError si ya existe un tipo con ese nombre', async () => {
      repo.findByNombre.mockResolvedValue(makeTipoRow());
      await expect(
        service.create(ORG_ID, { nombre: 'Alimento', naturaleza: NaturalezaRegistro.INVERSION }),
      ).rejects.toBeInstanceOf(TipoRegistroNombreDuplicadoError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('crea el tipo con esSistema=false si no existe nombre duplicado', async () => {
      repo.findByNombre.mockResolvedValue(null);
      const row = makeTipoRow({ esSistema: false });
      repo.create.mockResolvedValue(row);

      const result = await service.create(ORG_ID, {
        nombre: 'Vacunas',
        naturaleza: NaturalezaRegistro.INVERSION,
      });

      expect(repo.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ esSistema: false }),
      );
      expect(result.esSistema).toBe(false);
    });
  });

  // ==========================================================
  // findById
  // ==========================================================

  describe('findById', () => {
    it('retorna el tipo si existe', async () => {
      repo.findById.mockResolvedValue(makeTipoRow());
      const result = await service.findById(ORG_ID, TIPO_ID);
      expect(result.id).toBe(TIPO_ID);
    });

    it('lanza TipoRegistroNoEncontradoError si no existe o es de otra org', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(ORG_ID, 'no-existe')).rejects.toBeInstanceOf(
        TipoRegistroNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // update
  // ==========================================================

  describe('update', () => {
    it('lanza TipoRegistroSistemaNoEditableError al intentar cambiar nombre de tipo sistema', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: true }));
      await expect(
        service.update(ORG_ID, TIPO_ID, { nombre: 'Nuevo nombre' }),
      ).rejects.toBeInstanceOf(TipoRegistroSistemaNoEditableError);
    });

    it('lanza TipoRegistroNaturalezaInmutableError al intentar cambiar naturaleza', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: false }));
      await expect(
        service.update(ORG_ID, TIPO_ID, {
          naturaleza: NaturalezaRegistro.CANTIDAD,
        } as unknown as Parameters<typeof service.update>[2]),
      ).rejects.toBeInstanceOf(TipoRegistroNaturalezaInmutableError);
    });

    it('permite cambiar activo en tipo sistema', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: true, activo: true }));
      repo.update.mockResolvedValue(makeTipoRow({ esSistema: true, activo: false }));

      const result = await service.update(ORG_ID, TIPO_ID, { activo: false });
      expect(repo.update).toHaveBeenCalledWith(
        ORG_ID,
        TIPO_ID,
        expect.objectContaining({ activo: false }),
      );
      expect(result.activo).toBe(false);
    });

    it('actualiza nombre de tipo propio (esSistema=false)', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: false }));
      repo.update.mockResolvedValue(makeTipoRow({ nombre: 'Alimento Premium' }));

      const result = await service.update(ORG_ID, TIPO_ID, { nombre: 'Alimento Premium' });
      expect(repo.update).toHaveBeenCalledWith(
        ORG_ID,
        TIPO_ID,
        expect.objectContaining({ nombre: 'Alimento Premium' }),
      );
      expect(result.nombre).toBe('Alimento Premium');
    });

    it('lanza TipoRegistroNoEncontradoError si no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update(ORG_ID, 'no-existe', { activo: false })).rejects.toBeInstanceOf(
        TipoRegistroNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // eliminar
  // ==========================================================

  describe('eliminar', () => {
    it('lanza TipoRegistroSistemaNoEliminableError si esSistema=true', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: true }));
      await expect(service.eliminar(ORG_ID, TIPO_ID)).rejects.toBeInstanceOf(
        TipoRegistroSistemaNoEliminableError,
      );
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('lanza TipoRegistroEnUsoError si tiene movimientos asociados', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: false }));
      repo.countMovimientos.mockResolvedValue(3);

      await expect(service.eliminar(ORG_ID, TIPO_ID)).rejects.toBeInstanceOf(
        TipoRegistroEnUsoError,
      );
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('elimina el tipo si es propio y no tiene movimientos', async () => {
      repo.findById.mockResolvedValue(makeTipoRow({ esSistema: false }));
      repo.countMovimientos.mockResolvedValue(0);
      repo.eliminar.mockResolvedValue(1);

      await service.eliminar(ORG_ID, TIPO_ID);
      expect(repo.eliminar).toHaveBeenCalledWith(ORG_ID, TIPO_ID);
    });

    it('lanza TipoRegistroNoEncontradoError si no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.eliminar(ORG_ID, 'no-existe')).rejects.toBeInstanceOf(
        TipoRegistroNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // listar
  // ==========================================================

  describe('listar', () => {
    it('delega al repo con organizationId y filtros', async () => {
      repo.listar.mockResolvedValue([makeTipoRow()]);

      const result = await service.listar(ORG_ID, { naturaleza: NaturalezaRegistro.INVERSION });
      expect(repo.listar).toHaveBeenCalledWith(ORG_ID, {
        naturaleza: NaturalezaRegistro.INVERSION,
      });
      expect(result).toHaveLength(1);
    });
  });
});
