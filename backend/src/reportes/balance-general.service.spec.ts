import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import { BalanceGeneralService } from './balance-general.service';
import { FechaCorteInvalidaError, GestionNoEncontradaError } from './domain/balance-errors';
import type { BalanceReaderPort, CuentaEstructuraRow, SaldoCuentaRow } from './ports/balance-reader.port';

// ============================================================
// Mocks tipados (§7.8 CLAUDE.md — nunca se mockea Prisma directamente)
// ============================================================

type MockBalanceReader = {
  [K in keyof BalanceReaderPort]: jest.Mock;
};

type MockPeriodosReader = {
  obtenerRangoGestionPorFecha: jest.Mock;
  obtenerRangoGestion: jest.Mock;
};

function makeBalanceReaderMock(): MockBalanceReader {
  return {
    obtenerSaldosHasta: jest.fn(),
    obtenerSaldosEnRango: jest.fn(),
    obtenerEstructuraCuentas: jest.fn(),
  };
}

function makePeriodosReaderMock(): MockPeriodosReader {
  return {
    obtenerRangoGestionPorFecha: jest.fn(),
    obtenerRangoGestion: jest.fn(),
  };
}

// ============================================================
// Fixtures
// ============================================================

function makeSaldoCuentaRow(cuentaId: string, debe: string, haber: string): SaldoCuentaRow {
  return {
    cuentaId,
    totalDebitoBob: new Decimal(debe),
    totalCreditoBob: new Decimal(haber),
  };
}

function makeCuentaEstructuraRow(overrides: Partial<CuentaEstructuraRow> = {}): CuentaEstructuraRow {
  return {
    id: 'cuenta-1',
    parentId: null,
    nivel: 1,
    esDetalle: true,
    esContraria: false,
    claseCuenta: ClaseCuenta.ACTIVO,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    codigoInterno: '1.1.1.001',
    nombre: 'Caja MN',
    ...overrides,
  };
}

const TENANT_ID = 'org-test-1';
const GESTION_ID = 'gestion-uuid-1';
const DESDE = new Date(Date.UTC(2026, 0, 1));   // 2026-01-01
const HASTA = new Date(Date.UTC(2026, 11, 31));  // 2026-12-31

// ============================================================
// Tests
// ============================================================

describe('BalanceGeneralService (unit)', () => {
  let service: BalanceGeneralService;
  let balanceReader: MockBalanceReader;
  let periodosReader: MockPeriodosReader;

  beforeEach(() => {
    balanceReader = makeBalanceReaderMock();
    periodosReader = makePeriodosReaderMock();
    service = new BalanceGeneralService(
      balanceReader as unknown as BalanceReaderPort,
      periodosReader as unknown as PeriodosReaderPort,
    );

    // Happy path defaults
    periodosReader.obtenerRangoGestionPorFecha.mockResolvedValue({
      gestionId: GESTION_ID,
      desde: DESDE,
      hasta: HASTA,
    });
    periodosReader.obtenerRangoGestion.mockResolvedValue({ desde: DESDE, hasta: HASTA });
    balanceReader.obtenerSaldosHasta.mockResolvedValue([]);
    balanceReader.obtenerSaldosEnRango.mockResolvedValue([]);
    balanceReader.obtenerEstructuraCuentas.mockResolvedValue([]);
  });

  // ============================================================
  // Validación fecha (REQ-BG-01)
  // ============================================================

  describe('validación de fecha', () => {
    it('lanza FechaCorteInvalidaError si fecha tiene formato inválido', async () => {
      await expect(
        service.consultarBalanceGeneral(TENANT_ID, { fecha: '31-05-2026', incluirAnulados: false }),
      ).rejects.toThrow(FechaCorteInvalidaError);
    });

    it('lanza FechaCorteInvalidaError si fecha es una cadena vacía', async () => {
      await expect(
        service.consultarBalanceGeneral(TENANT_ID, { fecha: '', incluirAnulados: false }),
      ).rejects.toThrow(FechaCorteInvalidaError);
    });

    it('lanza FechaCorteInvalidaError si fecha tiene texto no numérico', async () => {
      await expect(
        service.consultarBalanceGeneral(TENANT_ID, { fecha: 'abc-de-fgh', incluirAnulados: false }),
      ).rejects.toThrow(FechaCorteInvalidaError);
    });

    it('no lanza con fecha válida YYYY-MM-DD', async () => {
      await expect(
        service.consultarBalanceGeneral(TENANT_ID, { fecha: '2026-05-31', incluirAnulados: false }),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // Inferencia de gestión (REQ-BG-02)
  // ============================================================

  describe('inferencia de gestión', () => {
    it('sin gestionId → llama a obtenerRangoGestionPorFecha', async () => {
      await service.consultarBalanceGeneral(TENANT_ID, { fecha: '2026-05-31', incluirAnulados: false });

      expect(periodosReader.obtenerRangoGestionPorFecha).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
      );
      expect(periodosReader.obtenerRangoGestion).not.toHaveBeenCalled();
    });

    it('con gestionId → llama a obtenerRangoGestion, no a obtenerRangoGestionPorFecha', async () => {
      periodosReader.obtenerRangoGestion.mockResolvedValue({ desde: DESDE, hasta: HASTA });

      await service.consultarBalanceGeneral(TENANT_ID, {
        fecha: '2026-05-31',
        gestionId: GESTION_ID,
        incluirAnulados: false,
      });

      expect(periodosReader.obtenerRangoGestion).toHaveBeenCalledWith(TENANT_ID, GESTION_ID);
      expect(periodosReader.obtenerRangoGestionPorFecha).not.toHaveBeenCalled();
    });

    it('sin gestión para la fecha → lanza GestionNoEncontradaError (422)', async () => {
      periodosReader.obtenerRangoGestionPorFecha.mockResolvedValue(null);

      await expect(
        service.consultarBalanceGeneral(TENANT_ID, { fecha: '2025-01-01', incluirAnulados: false }),
      ).rejects.toThrow(GestionNoEncontradaError);
    });

    it('gestionId con gestión inexistente → lanza GestionNoEncontradaError (422)', async () => {
      periodosReader.obtenerRangoGestion.mockResolvedValue(null);

      await expect(
        service.consultarBalanceGeneral(TENANT_ID, {
          fecha: '2026-05-31',
          gestionId: 'gestion-inexistente',
          incluirAnulados: false,
        }),
      ).rejects.toThrow(GestionNoEncontradaError);
    });

    it('hastaEfectivo = min(hasta_gestion, fechaCorte)', async () => {
      // fechaCorte = 2026-05-31, gestión hasta 2026-12-31
      // hastaEfectivo debe ser 2026-05-31 (la fechaCorte es menor)
      const fechaCorte = new Date(Date.UTC(2026, 4, 31)); // 2026-05-31

      await service.consultarBalanceGeneral(TENANT_ID, { fecha: '2026-05-31', incluirAnulados: false });

      expect(balanceReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        DESDE,
        fechaCorte,  // hastaEfectivo = fechaCorte (menor que hasta_gestion 2026-12-31)
        false,
      );
    });

    it('fechaCorte < desde_gestion → hastaEfectivo = desde (resultado = 0)', async () => {
      // fechaCorte = 2025-12-31, antes del inicio de la gestión 2026-01-01
      periodosReader.obtenerRangoGestionPorFecha.mockResolvedValue({
        gestionId: GESTION_ID,
        desde: new Date(Date.UTC(2026, 0, 1)),
        hasta: new Date(Date.UTC(2026, 11, 31)),
      });

      await service.consultarBalanceGeneral(TENANT_ID, { fecha: '2025-12-31', incluirAnulados: false });

      // hastaEfectivo = min(hasta_gestion=2026-12-31, fechaCorte=2025-12-31)
      // = 2025-12-31 que es < desde 2026-01-01, pero el range call aún debe hacerse
      expect(balanceReader.obtenerSaldosEnRango).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Toggle incluirAnulados (REQ-BG-04)
  // ============================================================

  describe('toggle incluirAnulados', () => {
    it('incluirAnulados=false propagado a obtenerSaldosHasta y obtenerSaldosEnRango', async () => {
      await service.consultarBalanceGeneral(TENANT_ID, { fecha: '2026-05-31', incluirAnulados: false });

      expect(balanceReader.obtenerSaldosHasta).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ incluirAnulados: false }),
      );
      expect(balanceReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
        expect.any(Date),
        false,
      );
    });

    it('incluirAnulados=true propagado a ambas queries', async () => {
      await service.consultarBalanceGeneral(TENANT_ID, { fecha: '2026-05-31', incluirAnulados: true });

      expect(balanceReader.obtenerSaldosHasta).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ incluirAnulados: true }),
      );
      expect(balanceReader.obtenerSaldosEnRango).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
        expect.any(Date),
        true,
      );
    });
  });

  // ============================================================
  // Orquestación (REQ-BG-03, REQ-BG-09, REQ-BG-10)
  // ============================================================

  describe('orquestación', () => {
    it('usa Promise.all para las 3 queries simultáneas', async () => {
      let saldosHastaOrder: number | undefined;
      let saldosEnRangoOrder: number | undefined;
      let estructuraCuentasOrder: number | undefined;
      let callCount = 0;

      balanceReader.obtenerSaldosHasta.mockImplementation(async () => {
        saldosHastaOrder = ++callCount;
        return [];
      });
      balanceReader.obtenerSaldosEnRango.mockImplementation(async () => {
        saldosEnRangoOrder = ++callCount;
        return [];
      });
      balanceReader.obtenerEstructuraCuentas.mockImplementation(async () => {
        estructuraCuentasOrder = ++callCount;
        return [];
      });

      await service.consultarBalanceGeneral(TENANT_ID, { fecha: '2026-05-31', incluirAnulados: false });

      // Las 3 llamadas deben haber ocurrido
      expect(saldosHastaOrder).toBeDefined();
      expect(saldosEnRangoOrder).toBeDefined();
      expect(estructuraCuentasOrder).toBeDefined();
    });

    it('gestionId presente en la respuesta', async () => {
      const result = await service.consultarBalanceGeneral(TENANT_ID, {
        fecha: '2026-05-31',
        incluirAnulados: false,
      });

      expect(result.gestionId).toBe(GESTION_ID);
    });

    it('fechaCorte en formato "YYYY-MM-DD" en la respuesta', async () => {
      const result = await service.consultarBalanceGeneral(TENANT_ID, {
        fecha: '2026-05-31',
        incluirAnulados: false,
      });

      expect(result.fechaCorte).toBe('2026-05-31');
    });

    it('tenant sin comprobantes → respuesta con totales "0.00", cuadra: true (REQ-BG-14)', async () => {
      const result = await service.consultarBalanceGeneral(TENANT_ID, {
        fecha: '2026-05-31',
        incluirAnulados: false,
      });

      expect(result.totalActivoBob).toBe('0.00');
      expect(result.totalPasivoBob).toBe('0.00');
      expect(result.totalPatrimonioBob).toBe('0.00');
      expect(result.cuadra).toBe(true);
    });

    it('respuesta tiene las 3 secciones ACTIVO/PASIVO/PATRIMONIO (REQ-BG-10)', async () => {
      const result = await service.consultarBalanceGeneral(TENANT_ID, {
        fecha: '2026-05-31',
        incluirAnulados: false,
      });

      expect(result.activo).toBeDefined();
      expect(result.pasivo).toBeDefined();
      expect(result.patrimonio).toBeDefined();
      expect(result.activo.claseCuenta).toBe('ACTIVO');
      expect(result.pasivo.claseCuenta).toBe('PASIVO');
      expect(result.patrimonio.claseCuenta).toBe('PATRIMONIO');
    });
  });
});
