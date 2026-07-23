import type { CuentaBancaria } from '@prisma/client';

import type { CuentaParaLinea, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';

import {
  CuentaBancariaMonedaIncompatibleError,
  CuentaBancariaNoEncontradaError,
  CuentaBancariaNumeroDuplicadoError,
  CuentaBancariaYaVinculadaError,
  CuentaPlanInvalidaError,
  CuentaPlanNoEncontradaError,
} from './domain/cuenta-bancaria-errors';
import type { CuentaBancariaRepositoryPort } from './ports/cuenta-bancaria.repository.port';
import { CuentasBancariasService } from './cuentas-bancarias.service';

const TENANT = 'tenant-1';
const CUENTA_ID = 'cuenta-caja-bob';

function makeCuentaParaLinea(overrides: Partial<CuentaParaLinea> = {}): CuentaParaLinea {
  return {
    id: CUENTA_ID,
    codigoInterno: '1.1.1.001',
    nombre: 'Caja Moneda Nacional',
    activa: true,
    esDetalle: true,
    requiereContacto: false,
    permiteMultiMoneda: true,
    monedaFuncional: 'BOB',
    ...overrides,
  };
}

function makeCuentaBancaria(overrides: Partial<CuentaBancaria> = {}): CuentaBancaria {
  return {
    id: 'cb-1',
    organizationId: TENANT,
    cuentaId: CUENTA_ID,
    alias: 'Cuenta corriente BancoSol',
    perfilExtracto: 'BANCOSOL_XLSX',
    numeroCuenta: null,
    moneda: 'BOB',
    activa: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as CuentaBancaria;
}

type MockRepo = { [K in keyof CuentaBancariaRepositoryPort]: jest.Mock };
type MockCuentasReader = { [K in keyof CuentasReaderPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByCuentaId: jest.fn(),
    findByPerfilYNumero: jest.fn(),
    listar: jest.fn(),
    update: jest.fn(),
    eliminar: jest.fn(),
  };
}

function makeCuentasReaderMock(): MockCuentasReader {
  return { obtenerBatch: jest.fn() };
}

describe('CuentasBancariasService', () => {
  let repo: MockRepo;
  let cuentasReader: MockCuentasReader;
  let service: CuentasBancariasService;

  beforeEach(() => {
    repo = makeRepoMock();
    cuentasReader = makeCuentasReaderMock();
    service = new CuentasBancariasService(
      repo as unknown as CuentaBancariaRepositoryPort,
      cuentasReader as unknown as CuentasReaderPort,
    );
  });

  describe('create — REQ-CB-01: vínculo a una Cuenta del plan', () => {
    it('crea la cuenta bancaria cuando la cuenta del plan es válida y no está vinculada', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(new Map([[CUENTA_ID, makeCuentaParaLinea()]]));
      repo.findByCuentaId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeCuentaBancaria());

      const result = await service.create(TENANT, {
        cuentaId: CUENTA_ID,
        alias: 'Cuenta corriente BancoSol',
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'BOB',
      });

      expect(result.id).toBe('cb-1');
      expect(repo.create).toHaveBeenCalledWith(TENANT, {
        cuentaId: CUENTA_ID,
        alias: 'Cuenta corriente BancoSol',
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'BOB',
      });
    });

    it('rechaza con CONCILIACION_CUENTA_BANCARIA_YA_VINCULADA (409) si la cuenta ya está vinculada', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(new Map([[CUENTA_ID, makeCuentaParaLinea()]]));
      repo.findByCuentaId.mockResolvedValue(makeCuentaBancaria());

      await expect(
        service.create(TENANT, {
          cuentaId: CUENTA_ID,
          alias: 'Segunda cuenta',
          perfilExtracto: 'ECONOMICO_XLSX',
          numeroCuenta: null,
          moneda: 'BOB',
        }),
      ).rejects.toThrow(CuentaBancariaYaVinculadaError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza con CONCILIACION_CUENTA_PLAN_NO_ENCONTRADA (404) si cuentaId no resuelve en el tenant', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(new Map());

      await expect(
        service.create(TENANT, {
          cuentaId: 'cuenta-inexistente',
          alias: 'Cuenta',
          perfilExtracto: 'BANCOSOL_XLSX',
          numeroCuenta: null,
          moneda: 'BOB',
        }),
      ).rejects.toThrow(CuentaPlanNoEncontradaError);
    });

    it('rechaza con CONCILIACION_CUENTA_PLAN_INVALIDA (422) si la cuenta no es de detalle', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_ID, makeCuentaParaLinea({ esDetalle: false })]]),
      );

      await expect(
        service.create(TENANT, {
          cuentaId: CUENTA_ID,
          alias: 'Cuenta',
          perfilExtracto: 'BANCOSOL_XLSX',
          numeroCuenta: null,
          moneda: 'BOB',
        }),
      ).rejects.toThrow(CuentaPlanInvalidaError);
    });

    it('rechaza con CONCILIACION_CUENTA_PLAN_INVALIDA (422) si la cuenta está inactiva', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_ID, makeCuentaParaLinea({ activa: false })]]),
      );

      await expect(
        service.create(TENANT, {
          cuentaId: CUENTA_ID,
          alias: 'Cuenta',
          perfilExtracto: 'BANCOSOL_XLSX',
          numeroCuenta: null,
          moneda: 'BOB',
        }),
      ).rejects.toThrow(CuentaPlanInvalidaError);
    });
  });

  describe('create — REQ-CB-02: moneda validada contra la cuenta del plan', () => {
    it('rechaza con CONCILIACION_MONEDA_INCOMPATIBLE (422) si permiteMultiMoneda=false y la moneda difiere', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(
        new Map([
          [CUENTA_ID, makeCuentaParaLinea({ permiteMultiMoneda: false, monedaFuncional: 'BOB' })],
        ]),
      );
      repo.findByCuentaId.mockResolvedValue(null);

      await expect(
        service.create(TENANT, {
          cuentaId: CUENTA_ID,
          alias: 'Cuenta USD',
          perfilExtracto: 'BANCOSOL_XLSX',
          numeroCuenta: null,
          moneda: 'USD',
        }),
      ).rejects.toThrow(CuentaBancariaMonedaIncompatibleError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('acepta cualquier moneda cuando permiteMultiMoneda=true', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(
        new Map([
          [CUENTA_ID, makeCuentaParaLinea({ permiteMultiMoneda: true, monedaFuncional: 'BOB' })],
        ]),
      );
      repo.findByCuentaId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeCuentaBancaria({ moneda: 'USD' }));

      const result = await service.create(TENANT, {
        cuentaId: CUENTA_ID,
        alias: 'Cuenta USD',
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'USD',
      });

      expect(result.moneda).toBe('USD');
    });

    it('acepta cuando permiteMultiMoneda=false y la moneda coincide con la funcional', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(
        new Map([
          [CUENTA_ID, makeCuentaParaLinea({ permiteMultiMoneda: false, monedaFuncional: 'BOB' })],
        ]),
      );
      repo.findByCuentaId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeCuentaBancaria({ moneda: 'BOB' }));

      const result = await service.create(TENANT, {
        cuentaId: CUENTA_ID,
        alias: 'Cuenta BOB',
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'BOB',
      });

      expect(result.moneda).toBe('BOB');
    });
  });

  describe('create — numeroCuenta duplicado (CRITICAL-5, defense in depth de @@unique)', () => {
    it('rechaza con CONCILIACION_CUENTA_BANCARIA_NUMERO_DUPLICADO (409) si (perfil, numeroCuenta) ya existe', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(new Map([[CUENTA_ID, makeCuentaParaLinea()]]));
      repo.findByCuentaId.mockResolvedValue(null);
      repo.findByPerfilYNumero.mockResolvedValue(makeCuentaBancaria({ id: 'otra-cb' }));

      await expect(
        service.create(TENANT, {
          cuentaId: CUENTA_ID,
          alias: 'Cuenta duplicada',
          perfilExtracto: 'BANCOSOL_XLSX',
          numeroCuenta: '1191959-000-001',
          moneda: 'BOB',
        }),
      ).rejects.toThrow(CuentaBancariaNumeroDuplicadoError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('no consulta unicidad de número cuando numeroCuenta es null', async () => {
      cuentasReader.obtenerBatch.mockResolvedValue(new Map([[CUENTA_ID, makeCuentaParaLinea()]]));
      repo.findByCuentaId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeCuentaBancaria({ numeroCuenta: null }));

      await service.create(TENANT, {
        cuentaId: CUENTA_ID,
        alias: 'Cuenta sin número',
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'BOB',
      });

      expect(repo.findByPerfilYNumero).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('devuelve la cuenta bancaria si existe en el tenant', async () => {
      repo.findById.mockResolvedValue(makeCuentaBancaria());

      const result = await service.findById(TENANT, 'cb-1');

      expect(result.id).toBe('cb-1');
    });

    it('rechaza con CONCILIACION_CUENTA_BANCARIA_NO_ENCONTRADA (404) si no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT, 'inexistente')).rejects.toThrow(
        CuentaBancariaNoEncontradaError,
      );
    });
  });

  describe('update', () => {
    it('actualiza alias sin re-validar moneda cuando moneda no cambia', async () => {
      repo.findById.mockResolvedValue(makeCuentaBancaria());
      repo.update.mockResolvedValue(makeCuentaBancaria({ alias: 'Nuevo alias' }));

      const result = await service.update(TENANT, 'cb-1', { alias: 'Nuevo alias' });

      expect(result.alias).toBe('Nuevo alias');
      expect(cuentasReader.obtenerBatch).not.toHaveBeenCalled();
    });

    it('re-valida REQ-CB-02 cuando se actualiza la moneda', async () => {
      repo.findById.mockResolvedValue(makeCuentaBancaria());
      cuentasReader.obtenerBatch.mockResolvedValue(
        new Map([
          [CUENTA_ID, makeCuentaParaLinea({ permiteMultiMoneda: false, monedaFuncional: 'BOB' })],
        ]),
      );

      await expect(service.update(TENANT, 'cb-1', { moneda: 'USD' })).rejects.toThrow(
        CuentaBancariaMonedaIncompatibleError,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rechaza con 404 si la cuenta bancaria no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update(TENANT, 'inexistente', { alias: 'x' })).rejects.toThrow(
        CuentaBancariaNoEncontradaError,
      );
    });
  });

  describe('eliminar', () => {
    it('elimina la cuenta bancaria si existe', async () => {
      repo.findById.mockResolvedValue(makeCuentaBancaria());
      repo.eliminar.mockResolvedValue(1);

      await service.eliminar(TENANT, 'cb-1');

      expect(repo.eliminar).toHaveBeenCalledWith(TENANT, 'cb-1');
    });

    it('rechaza con 404 si la cuenta bancaria no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.eliminar(TENANT, 'inexistente')).rejects.toThrow(
        CuentaBancariaNoEncontradaError,
      );
      expect(repo.eliminar).not.toHaveBeenCalled();
    });
  });
});
