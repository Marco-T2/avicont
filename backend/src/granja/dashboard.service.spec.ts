/**
 * Unit tests del DashboardService.
 * Mocks de LoteRepositoryPort, LoteResumenReaderPort y ClockPort.
 * Sin DB, sin NestJS.
 */

import { EstadoLote } from './domain/enums';
import { DashboardService } from './dashboard.service';
import type { LoteResumenReaderPort, LoteAgregados } from './ports/lote-resumen-reader.port';
import type { LoteRepositoryPort, LoteRow } from './ports/lote.repository.port';
import type { ClockPort } from '@/common/clock/clock.port';

// ============================================================
// Fixtures
// ============================================================

const ORG_ID = 'org-test-1';
const HOY = '2026-06-15';

function makeLoteRow(id: string, overrides: Partial<LoteRow> = {}): LoteRow {
  return {
    id,
    organizationId: ORG_ID,
    nombre: null,
    cantidadInicial: 5000,
    fechaIngreso: new Date('2026-06-01'),
    fechaEstimadaSaca: null,
    fechaCierre: null,
    galpon: null,
    detalle: null,
    estado: EstadoLote.ACTIVO,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAgregados(loteId: string, overrides: Partial<LoteAgregados> = {}): LoteAgregados {
  return {
    loteId,
    totalMuertes: 0,
    totalInversionBob: '0',
    ...overrides,
  };
}

type MockLoteRepo = jest.Mocked<LoteRepositoryPort>;
type MockReader = jest.Mocked<LoteResumenReaderPort>;

function makeLoteRepoMock(): MockLoteRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdForUpdate: jest.fn(),
    listar: jest.fn(),
    update: jest.fn(),
    cerrar: jest.fn(),
  };
}

function makeReaderMock(): MockReader {
  return {
    agregadosPorLotes: jest.fn(),
  };
}

function makeClockMock(): jest.Mocked<ClockPort> {
  return {
    now: jest.fn(),
    currentYearLaPaz: jest.fn(),
    currentDateLaPaz: jest.fn().mockReturnValue(HOY),
  };
}

function buildService(
  loteRepo: MockLoteRepo,
  reader: MockReader,
  clock: jest.Mocked<ClockPort>,
): DashboardService {
  return new DashboardService(
    loteRepo as unknown as LoteRepositoryPort,
    reader as unknown as LoteResumenReaderPort,
    clock,
  );
}

// ============================================================
// Tests
// ============================================================

describe('DashboardService', () => {
  let loteRepo: MockLoteRepo;
  let reader: MockReader;
  let clock: jest.Mocked<ClockPort>;
  let service: DashboardService;

  beforeEach(() => {
    loteRepo = makeLoteRepoMock();
    reader = makeReaderMock();
    clock = makeClockMock();
    service = buildService(loteRepo, reader, clock);
  });

  // ==========================================================
  // lotesActivosConResumen
  // ==========================================================

  describe('lotesActivosConResumen', () => {
    it('sin lotes activos → retorna []', async () => {
      loteRepo.listar.mockResolvedValue({ items: [], total: 0 });

      const result = await service.lotesActivosConResumen(ORG_ID);

      expect(result).toHaveLength(0);
      // No debe llamar al reader si no hay lotes
      expect(reader.agregadosPorLotes).not.toHaveBeenCalled();
    });

    it('3 lotes activos → retorna 3 ítems con ResumenLote calculado', async () => {
      const lote1 = makeLoteRow('lote-1', { cantidadInicial: 5000 });
      const lote2 = makeLoteRow('lote-2', { cantidadInicial: 3000 });
      const lote3 = makeLoteRow('lote-3', { cantidadInicial: 2000 });

      loteRepo.listar.mockResolvedValue({ items: [lote1, lote2, lote3], total: 3 });
      reader.agregadosPorLotes.mockResolvedValue([
        makeAgregados('lote-1', { totalMuertes: 100, totalInversionBob: '75000' }),
        makeAgregados('lote-2', { totalMuertes: 50, totalInversionBob: '30000' }),
        makeAgregados('lote-3', { totalMuertes: 0, totalInversionBob: '0' }),
      ]);

      const result = await service.lotesActivosConResumen(ORG_ID);

      expect(result).toHaveLength(3);

      const r1 = result.find((r) => r.lote.id === 'lote-1')!;
      expect(r1.resumen.avesVivas).toBe(4900); // 5000 - 100
      expect(r1.resumen.costoPorPolloVivo!.toBob()).toBe('15.31'); // 75000 / 4900

      const r3 = result.find((r) => r.lote.id === 'lote-3')!;
      expect(r3.resumen.avesVivas).toBe(2000);
      expect(r3.resumen.costoPorPolloVivo).not.toBeNull();
      expect(r3.resumen.costoPorPolloVivo!.toBob()).toBe('0.00');
    });

    it('solo filtra lotes ACTIVO — verifica que listar recibe { estado: ACTIVO }', async () => {
      loteRepo.listar.mockResolvedValue({ items: [], total: 0 });

      await service.lotesActivosConResumen(ORG_ID);

      expect(loteRepo.listar).toHaveBeenCalledWith(
        ORG_ID,
        { estado: EstadoLote.ACTIVO },
        expect.any(Object), // paginación
      );
    });

    it('usa ClockPort.currentDateLaPaz() para calcular edadDias (no new Date())', async () => {
      // fechaIngreso = 2026-06-01, HOY = 2026-06-15 → edadDias = 14
      const lote = makeLoteRow('lote-1', {
        cantidadInicial: 1000,
        fechaIngreso: new Date('2026-06-01'),
      });

      loteRepo.listar.mockResolvedValue({ items: [lote], total: 1 });
      reader.agregadosPorLotes.mockResolvedValue([makeAgregados('lote-1')]);

      const result = await service.lotesActivosConResumen(ORG_ID);

      expect(clock.currentDateLaPaz).toHaveBeenCalled();
      expect(result[0]!.edadDias).toBe(14);
    });

    it('llama al reader con batch (no N loops) pasando todos los loteIds juntos', async () => {
      const lotes = ['l1', 'l2', 'l3'].map((id) => makeLoteRow(id));
      loteRepo.listar.mockResolvedValue({ items: lotes, total: 3 });
      reader.agregadosPorLotes.mockResolvedValue(lotes.map((l) => makeAgregados(l.id)));

      await service.lotesActivosConResumen(ORG_ID);

      // El reader debe haber sido llamado UNA sola vez con los 3 IDs juntos (batch)
      expect(reader.agregadosPorLotes).toHaveBeenCalledTimes(1);
      expect(reader.agregadosPorLotes).toHaveBeenCalledWith(
        ORG_ID,
        expect.arrayContaining(['l1', 'l2', 'l3']),
      );
    });

    it('mortalidad total → costoPorPolloVivo = null en el resumen', async () => {
      const lote = makeLoteRow('lote-1', { cantidadInicial: 1000 });
      loteRepo.listar.mockResolvedValue({ items: [lote], total: 1 });
      reader.agregadosPorLotes.mockResolvedValue([
        makeAgregados('lote-1', { totalMuertes: 1000, totalInversionBob: '50000' }),
      ]);

      const result = await service.lotesActivosConResumen(ORG_ID);

      expect(result[0]!.resumen.avesVivas).toBe(0);
      expect(result[0]!.resumen.costoPorPolloVivo).toBeNull();
    });
  });
});
