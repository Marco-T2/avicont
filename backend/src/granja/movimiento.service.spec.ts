/**
 * Unit tests del MovimientoService.
 * Mocks de todos los ports. Sin DB, sin NestJS.
 */

import { Prisma } from '@prisma/client';

import { NaturalezaRegistro, EstadoLote } from './domain/enums';
import {
  LoteCerradoError,
  LoteNoEncontradoError,
  MovimientoCantidadExcedeVivasError,
  MovimientoCantidadInvalidaError,
  MovimientoInversionMontoInvalidoError,
  MovimientoNoEncontradoError,
  TipoRegistroInactivoError,
  TipoRegistroNaturalezaInvalidaError,
  TipoRegistroNoEncontradoError,
} from './domain/granja-errors';
import { MovimientoService } from './movimiento.service';
import type { LoteRepositoryPort, LoteRow } from './ports/lote.repository.port';
import type {
  MovimientoCantidadRow,
  MovimientoInversionRow,
  MovimientoRepositoryPort,
} from './ports/movimiento.repository.port';
import type {
  TipoRegistroRepositoryPort,
  TipoRegistroRow,
} from './ports/tipo-registro.repository.port';

// ============================================================
// Fixtures
// ============================================================

const ORG_ID = 'org-test-1';
const LOTE_ID = 'lote-id-1';
const TIPO_INV_ID = 'tipo-inv-1';
const TIPO_CANT_ID = 'tipo-cant-1';
const MOV_ID = 'mov-id-1';

function makeLoteRow(overrides: Partial<LoteRow> = {}): LoteRow {
  return {
    id: LOTE_ID,
    organizationId: ORG_ID,
    cantidadInicial: 5000,
    fechaIngreso: new Date('2026-06-01'),
    fechaEstimadaSaca: null,
    fechaCierre: null,
    galpon: null,
    estado: EstadoLote.ACTIVO,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTipoInversionRow(overrides: Partial<TipoRegistroRow> = {}): TipoRegistroRow {
  return {
    id: TIPO_INV_ID,
    organizationId: ORG_ID,
    nombre: 'Alimento',
    naturaleza: NaturalezaRegistro.INVERSION,
    esSistema: true,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTipoCantidadRow(overrides: Partial<TipoRegistroRow> = {}): TipoRegistroRow {
  return {
    id: TIPO_CANT_ID,
    organizationId: ORG_ID,
    nombre: 'Mortalidad',
    naturaleza: NaturalezaRegistro.CANTIDAD,
    esSistema: true,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMovimientoInversionRow(): MovimientoInversionRow {
  return {
    id: MOV_ID,
    organizationId: ORG_ID,
    loteId: LOTE_ID,
    tipoRegistroId: TIPO_INV_ID,
    monto: new Prisma.Decimal('1250.50'),
    detalle: null,
    fecha: new Date('2026-06-05'),
    createdAt: new Date(),
  };
}

function makeMovimientoCantidadRow(): MovimientoCantidadRow {
  return {
    id: MOV_ID,
    organizationId: ORG_ID,
    loteId: LOTE_ID,
    tipoRegistroId: TIPO_CANT_ID,
    cantidad: 30,
    detalle: null,
    fecha: new Date('2026-06-10'),
    createdAt: new Date(),
  };
}

// Mock de PrismaService con $transaction
function makePrismaServiceMock() {
  return {
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
}

type MockLoteRepo = jest.Mocked<LoteRepositoryPort>;
type MockTipoRepo = jest.Mocked<TipoRegistroRepositoryPort>;
type MockMovimientoRepo = jest.Mocked<MovimientoRepositoryPort>;

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

function makeTipoRepoMock(): MockTipoRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByNombre: jest.fn(),
    listar: jest.fn(),
    update: jest.fn(),
    eliminar: jest.fn(),
    countMovimientos: jest.fn(),
    upsertSeed: jest.fn(),
  };
}

function makeMovimientoRepoMock(): MockMovimientoRepo {
  return {
    createInversion: jest.fn(),
    findInversionById: jest.fn(),
    listarInversiones: jest.fn(),
    eliminarInversion: jest.fn(),
    createCantidad: jest.fn(),
    findCantidadById: jest.fn(),
    listarCantidades: jest.fn(),
    eliminarCantidad: jest.fn(),
    sumCantidadByLote: jest.fn(),
  };
}

function buildService(
  loteRepo: MockLoteRepo,
  tipoRepo: MockTipoRepo,
  movimientoRepo: MockMovimientoRepo,
): MovimientoService {
  const prismaService = makePrismaServiceMock();
  return new MovimientoService(
    loteRepo as unknown as LoteRepositoryPort,
    tipoRepo as unknown as TipoRegistroRepositoryPort,
    movimientoRepo as unknown as MovimientoRepositoryPort,

    prismaService as unknown as any,
  );
}

// ============================================================
// Tests
// ============================================================

describe('MovimientoService', () => {
  let loteRepo: MockLoteRepo;
  let tipoRepo: MockTipoRepo;
  let movimientoRepo: MockMovimientoRepo;
  let service: MovimientoService;

  beforeEach(() => {
    loteRepo = makeLoteRepoMock();
    tipoRepo = makeTipoRepoMock();
    movimientoRepo = makeMovimientoRepoMock();
    service = buildService(loteRepo, tipoRepo, movimientoRepo);
  });

  // ==========================================================
  // registrarInversion
  // ==========================================================

  describe('registrarInversion', () => {
    it('caso feliz — registra la inversión correctamente', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(makeTipoInversionRow());
      movimientoRepo.createInversion.mockResolvedValue(makeMovimientoInversionRow());

      const result = await service.registrarInversion(ORG_ID, LOTE_ID, {
        tipoRegistroId: TIPO_INV_ID,
        monto: '1250.50',
        fecha: new Date('2026-06-05'),
        detalle: null,
      });

      expect(movimientoRepo.createInversion).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ loteId: LOTE_ID, tipoRegistroId: TIPO_INV_ID }),
      );
      expect(result.id).toBe(MOV_ID);
    });

    it('lanza LoteNoEncontradoError si el lote no existe o es de otra org', async () => {
      loteRepo.findById.mockResolvedValue(null);

      await expect(
        service.registrarInversion(ORG_ID, 'no-existe', {
          tipoRegistroId: TIPO_INV_ID,
          monto: '100',
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(LoteNoEncontradoError);
      expect(movimientoRepo.createInversion).not.toHaveBeenCalled();
    });

    it('lanza LoteCerradoError si el lote está CERRADO', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));

      await expect(
        service.registrarInversion(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_INV_ID,
          monto: '100',
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(LoteCerradoError);
    });

    it('lanza TipoRegistroNoEncontradoError si el tipo no existe', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(null);

      await expect(
        service.registrarInversion(ORG_ID, LOTE_ID, {
          tipoRegistroId: 'no-existe',
          monto: '100',
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(TipoRegistroNoEncontradoError);
    });

    it('lanza TipoRegistroInactivoError si el tipo está inactivo', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(makeTipoInversionRow({ activo: false }));

      await expect(
        service.registrarInversion(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_INV_ID,
          monto: '100',
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(TipoRegistroInactivoError);
    });

    it('lanza TipoRegistroNaturalezaInvalidaError si tipo es CANTIDAD', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(makeTipoCantidadRow());

      await expect(
        service.registrarInversion(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_CANT_ID,
          monto: '100',
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(TipoRegistroNaturalezaInvalidaError);
    });

    it('lanza MontoInvalidoError si monto es "0"', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(makeTipoInversionRow());

      await expect(
        service.registrarInversion(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_INV_ID,
          monto: '0',
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(MovimientoInversionMontoInvalidoError);
    });
  });

  // ==========================================================
  // registrarCantidad
  // ==========================================================

  describe('registrarCantidad', () => {
    it('caso feliz — cantidad dentro del límite (avesVivas >= cantidad)', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow({ cantidadInicial: 5000 }));
      tipoRepo.findById.mockResolvedValue(makeTipoCantidadRow());
      movimientoRepo.sumCantidadByLote.mockResolvedValue(0);
      movimientoRepo.createCantidad.mockResolvedValue(makeMovimientoCantidadRow());

      const result = await service.registrarCantidad(ORG_ID, LOTE_ID, {
        tipoRegistroId: TIPO_CANT_ID,
        cantidad: 30,
        fecha: new Date('2026-06-10'),
        detalle: null,
      });

      expect(movimientoRepo.createCantidad).toHaveBeenCalled();
      expect(result.cantidad).toBe(30);
    });

    it('cantidad exactamente igual a avesVivas (avesVivas = 0 tras el movimiento) — válido', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow({ cantidadInicial: 5000 }));
      tipoRepo.findById.mockResolvedValue(makeTipoCantidadRow());
      movimientoRepo.sumCantidadByLote.mockResolvedValue(4990);
      movimientoRepo.createCantidad.mockResolvedValue(makeMovimientoCantidadRow());

      // avesVivas = 5000 - 4990 = 10; cantidad = 10 → avesVivas final = 0 (válido)
      await expect(
        service.registrarCantidad(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_CANT_ID,
          cantidad: 10,
          fecha: new Date(),
          detalle: null,
        }),
      ).resolves.toBeDefined();
    });

    it('lanza MovimientoCantidadExcedeVivasError si cantidad > avesVivas', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow({ cantidadInicial: 5000 }));
      tipoRepo.findById.mockResolvedValue(makeTipoCantidadRow());
      movimientoRepo.sumCantidadByLote.mockResolvedValue(4990);

      // avesVivas = 5000 - 4990 = 10; cantidad = 20 → excede
      await expect(
        service.registrarCantidad(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_CANT_ID,
          cantidad: 20,
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(MovimientoCantidadExcedeVivasError);
      expect(movimientoRepo.createCantidad).not.toHaveBeenCalled();
    });

    it('lanza LoteNoEncontradoError si el lote no existe bajo FOR UPDATE', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(null);

      await expect(
        service.registrarCantidad(ORG_ID, 'no-existe', {
          tipoRegistroId: TIPO_CANT_ID,
          cantidad: 5,
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(LoteNoEncontradoError);
    });

    it('lanza LoteCerradoError si el lote está CERRADO (under lock)', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));

      await expect(
        service.registrarCantidad(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_CANT_ID,
          cantidad: 5,
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(LoteCerradoError);
    });

    it('lanza TipoRegistroNaturalezaInvalidaError si tipo es INVERSION', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(makeTipoInversionRow());

      await expect(
        service.registrarCantidad(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_INV_ID,
          cantidad: 5,
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(TipoRegistroNaturalezaInvalidaError);
    });

    it('lanza CantidadInvalidaError si cantidad = 0', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(makeTipoCantidadRow());

      await expect(
        service.registrarCantidad(ORG_ID, LOTE_ID, {
          tipoRegistroId: TIPO_CANT_ID,
          cantidad: 0,
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(MovimientoCantidadInvalidaError);
    });

    it('lanza TipoRegistroNoEncontradoError si tipo de otra org (no encontrado)', async () => {
      loteRepo.findByIdForUpdate.mockResolvedValue(makeLoteRow());
      tipoRepo.findById.mockResolvedValue(null); // tipo de otra org → null

      await expect(
        service.registrarCantidad(ORG_ID, LOTE_ID, {
          tipoRegistroId: 'tipo-org-b',
          cantidad: 5,
          fecha: new Date(),
          detalle: null,
        }),
      ).rejects.toBeInstanceOf(TipoRegistroNoEncontradoError);
    });
  });

  // ==========================================================
  // eliminarInversion
  // ==========================================================

  describe('eliminarInversion', () => {
    it('elimina la inversión si el lote está ACTIVO', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      movimientoRepo.findInversionById.mockResolvedValue(makeMovimientoInversionRow());
      movimientoRepo.eliminarInversion.mockResolvedValue(1);

      await service.eliminarInversion(ORG_ID, LOTE_ID, MOV_ID);

      expect(movimientoRepo.eliminarInversion).toHaveBeenCalledWith(ORG_ID, MOV_ID);
    });

    it('lanza LoteCerradoError si el lote está CERRADO (spec: no borrar en lote cerrado)', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));

      await expect(service.eliminarInversion(ORG_ID, LOTE_ID, MOV_ID)).rejects.toBeInstanceOf(
        LoteCerradoError,
      );
    });

    it('lanza MovimientoNoEncontradoError si el movimiento no existe o es de otra org', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      movimientoRepo.findInversionById.mockResolvedValue(null);

      await expect(service.eliminarInversion(ORG_ID, LOTE_ID, 'no-existe')).rejects.toBeInstanceOf(
        MovimientoNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // eliminarCantidad
  // ==========================================================

  describe('eliminarCantidad', () => {
    it('elimina la cantidad si el lote está ACTIVO', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow());
      movimientoRepo.findCantidadById.mockResolvedValue(makeMovimientoCantidadRow());
      movimientoRepo.eliminarCantidad.mockResolvedValue(1);

      await service.eliminarCantidad(ORG_ID, LOTE_ID, MOV_ID);

      expect(movimientoRepo.eliminarCantidad).toHaveBeenCalledWith(ORG_ID, MOV_ID);
    });

    it('lanza LoteCerradoError si el lote está CERRADO', async () => {
      loteRepo.findById.mockResolvedValue(makeLoteRow({ estado: EstadoLote.CERRADO }));

      await expect(service.eliminarCantidad(ORG_ID, LOTE_ID, MOV_ID)).rejects.toBeInstanceOf(
        LoteCerradoError,
      );
    });
  });
});
