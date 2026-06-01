import { EstadoLote } from './domain/enums';
import {
  LoteCantidadInicialInmutableError,
  LoteCantidadInicialInvalidaError,
  LoteCerradoError,
  LoteNoEncontradoError,
  LoteYaCerradoError,
} from './domain/granja-errors';
import { LoteService } from './lote.service';
import type { LoteRepositoryPort, LoteRow } from './ports/lote.repository.port';
import type { ClockPort } from '@/common/clock/clock.port';

// ============================================================
// Helpers y fixtures
// ============================================================

const ORG_ID = 'org-test-1';
const LOTE_ID = 'lote-id-1';
const FECHA_HOY = '2026-06-01';

function makeLoteRow(overrides: Partial<LoteRow> = {}): LoteRow {
  return {
    id: LOTE_ID,
    organizationId: ORG_ID,
    nombre: null,
    cantidadInicial: 500,
    fechaIngreso: new Date('2026-05-01'),
    fechaEstimadaSaca: null,
    fechaCierre: null,
    galpon: 'Galpón A',
    detalle: null,
    estado: EstadoLote.ACTIVO,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

type MockRepo = { [K in keyof LoteRepositoryPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdForUpdate: jest.fn(),
    listar: jest.fn(),
    update: jest.fn(),
    cerrar: jest.fn(),
  };
}

function makeClockMock(): jest.Mocked<ClockPort> {
  return {
    now: jest.fn(),
    currentYearLaPaz: jest.fn(),
    currentDateLaPaz: jest.fn().mockReturnValue(FECHA_HOY),
  };
}

function buildService(repo: MockRepo, clock: jest.Mocked<ClockPort>): LoteService {
  return new LoteService(repo as unknown as LoteRepositoryPort, clock as unknown as ClockPort);
}

// ============================================================
// Tests
// ============================================================

describe('LoteService', () => {
  let repo: MockRepo;
  let clock: jest.Mocked<ClockPort>;
  let service: LoteService;

  beforeEach(() => {
    repo = makeRepoMock();
    clock = makeClockMock();
    service = buildService(repo, clock);
  });

  // ==========================================================
  // create
  // ==========================================================

  describe('create', () => {
    it('crea el lote delegando al repo con los datos provistos', async () => {
      const row = makeLoteRow();
      repo.create.mockResolvedValue(row);

      const result = await service.create(ORG_ID, {
        cantidadInicial: 500,
        fechaIngreso: new Date('2026-05-01'),
        galpon: 'Galpón A',
      });

      expect(repo.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ cantidadInicial: 500 }),
      );
      expect(result.id).toBe(LOTE_ID);
      expect(result.cantidadInicial).toBe(500);
    });

    it('lanza LoteCantidadInicialInvalidaError si cantidadInicial = 0', async () => {
      await expect(
        service.create(ORG_ID, { cantidadInicial: 0, fechaIngreso: new Date() }),
      ).rejects.toBeInstanceOf(LoteCantidadInicialInvalidaError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza LoteCantidadInicialInvalidaError si cantidadInicial es negativa', async () => {
      await expect(
        service.create(ORG_ID, { cantidadInicial: -1, fechaIngreso: new Date() }),
      ).rejects.toBeInstanceOf(LoteCantidadInicialInvalidaError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza LoteCantidadInicialInvalidaError si cantidadInicial no es entero', async () => {
      await expect(
        service.create(ORG_ID, { cantidadInicial: 1.5, fechaIngreso: new Date() }),
      ).rejects.toBeInstanceOf(LoteCantidadInicialInvalidaError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // findById
  // ==========================================================

  describe('findById', () => {
    it('retorna el lote si existe en la org', async () => {
      repo.findById.mockResolvedValue(makeLoteRow());
      const result = await service.findById(ORG_ID, LOTE_ID);
      expect(result.id).toBe(LOTE_ID);
    });

    it('lanza LoteNoEncontradoError si el lote no existe o es de otra org', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(ORG_ID, 'no-existe')).rejects.toBeInstanceOf(
        LoteNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // update
  // ==========================================================

  describe('update', () => {
    it('actualiza campos mutables delegando al repo', async () => {
      repo.findById.mockResolvedValue(makeLoteRow());
      repo.update.mockResolvedValue(makeLoteRow({ galpon: 'Galpón Nuevo' }));

      const result = await service.update(ORG_ID, LOTE_ID, { galpon: 'Galpón Nuevo' });
      expect(result.galpon).toBe('Galpón Nuevo');
    });

    it('lanza LoteCantidadInicialInmutableError si se intenta cambiar cantidadInicial', async () => {
      repo.findById.mockResolvedValue(makeLoteRow());

      await expect(
        service.update(ORG_ID, LOTE_ID, { cantidadInicial: 999 } as unknown as Parameters<
          typeof service.update
        >[2]),
      ).rejects.toBeInstanceOf(LoteCantidadInicialInmutableError);
    });

    it('lanza LoteCerradoError si el lote está CERRADO', async () => {
      repo.findById.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));
      await expect(service.update(ORG_ID, LOTE_ID, { galpon: 'Nuevo' })).rejects.toBeInstanceOf(
        LoteCerradoError,
      );
    });

    it('lanza LoteNoEncontradoError si el lote no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update(ORG_ID, 'no-existe', { galpon: 'Nuevo' })).rejects.toBeInstanceOf(
        LoteNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // cerrar
  // ==========================================================

  describe('cerrar', () => {
    it('cierra un lote activo usando la fecha de hoy del ClockPort', async () => {
      repo.findById.mockResolvedValue(makeLoteRow());
      repo.cerrar.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));

      await service.cerrar(ORG_ID, LOTE_ID);

      // Verifica que usó el ClockPort y no new Date()
      expect(clock.currentDateLaPaz).toHaveBeenCalled();
      expect(repo.cerrar).toHaveBeenCalledWith(ORG_ID, LOTE_ID, expect.any(Date));
    });

    it('lanza LoteYaCerradoError si el lote ya estaba cerrado', async () => {
      repo.findById.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));
      await expect(service.cerrar(ORG_ID, LOTE_ID)).rejects.toBeInstanceOf(LoteYaCerradoError);
    });

    it('lanza LoteNoEncontradoError si el lote es de otra org o no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.cerrar(ORG_ID, 'otro-lote')).rejects.toBeInstanceOf(
        LoteNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // listar
  // ==========================================================

  describe('listar', () => {
    it('delega al repo con organizationId y filtros', async () => {
      repo.listar.mockResolvedValue({ items: [makeLoteRow()], total: 1 });

      const result = await service.listar(
        ORG_ID,
        { estado: EstadoLote.ACTIVO },
        { page: 1, limit: 10 },
      );
      expect(repo.listar).toHaveBeenCalledWith(
        ORG_ID,
        { estado: EstadoLote.ACTIVO },
        { page: 1, limit: 10 },
      );
      expect(result.total).toBe(1);
    });
  });
});
