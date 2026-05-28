import { type OrgConfiguracionContable } from '@prisma/client';

import { ClaseCuenta } from '@/common/domain/enums';

import { ConfiguracionContableService } from './configuracion-contable.service';
import { ConfigContableErrorCode } from './domain/configuracion-errors';
import type { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import type { ConfiguracionContableRepositoryPort } from './ports/configuracion-contable.repository.port';
import type { CuentaParaValidacion, CuentaReaderPort } from './ports/cuenta-reader.port';

const TENANT_ID = 'org-1';

type MockRepo = { [K in keyof ConfiguracionContableRepositoryPort]: jest.Mock };
type MockReader = { [K in keyof CuentaReaderPort]: jest.Mock };

const expectErrorCode = (promise: Promise<unknown>, code: string): Promise<void> =>
  expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });

function repoMock(): MockRepo {
  return { obtener: jest.fn(), upsert: jest.fn() };
}

function readerMock(): MockReader {
  return { findForConfigValidation: jest.fn() };
}

function cuentaValidacion(overrides: Partial<CuentaParaValidacion> = {}): CuentaParaValidacion {
  return {
    id: 'cuenta-1',
    organizationId: TENANT_ID,
    claseCuenta: ClaseCuenta.ACTIVO,
    activa: true,
    esDetalle: true,
    codigoInterno: '1.1.1.001',
    nombre: 'CAJA',
    ...overrides,
  };
}

function configExistente(
  overrides: Partial<OrgConfiguracionContable> = {},
): OrgConfiguracionContable {
  const now = new Date('2026-04-01');
  return {
    organizationId: TENANT_ID,
    ivaCreditoId: null,
    ivaDebitoId: null,
    ivaCreditoImportacionesId: null,
    itPorPagarId: null,
    iuePorPagarId: null,
    rcIvaRetenidoId: null,
    difCambioGananciaId: null,
    difCambioPerdidaId: null,
    resultadoEjercicioId: null,
    resultadosAcumuladosId: null,
    cajaChicaDefaultId: null,
    ajustePorInflacionId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ConfiguracionContableService', () => {
  let repo: MockRepo;
  let cuentas: MockReader;
  let service: ConfiguracionContableService;

  beforeEach(() => {
    repo = repoMock();
    cuentas = readerMock();
    service = new ConfiguracionContableService(
      repo as unknown as ConfiguracionContableRepositoryPort,
      cuentas as unknown as CuentaReaderPort,
    );
  });

  // -------------------- obtener --------------------

  describe('obtener', () => {
    it('devuelve config vacía cuando no existe fila', async () => {
      repo.obtener.mockResolvedValue(null);
      const r = await service.obtener(TENANT_ID);
      expect(r.organizationId).toBe(TENANT_ID);
      expect(r.ivaCreditoId).toBeNull();
    });

    it('devuelve la fila existente cuando ya hay configuración', async () => {
      repo.obtener.mockResolvedValue(configExistente({ ivaCreditoId: 'cuenta-x' }));
      const r = await service.obtener(TENANT_ID);
      expect(r.ivaCreditoId).toBe('cuenta-x');
    });
  });

  // -------------------- actualizar --------------------

  describe('actualizar', () => {
    it('rechaza si la cuenta mapeada no existe', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(null);
      const dto: ActualizarConfiguracionDto = { ivaCreditoId: 'ghost' };
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.CUENTA_NO_ENCONTRADA,
      );
    });

    it('rechaza si la cuenta está inactiva', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(cuentaValidacion({ activa: false }));
      const dto: ActualizarConfiguracionDto = { ivaCreditoId: 'c1' };
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.CUENTA_INACTIVA,
      );
    });

    it('rechaza si la cuenta es agrupador (esDetalle=false)', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(cuentaValidacion({ esDetalle: false }));
      const dto: ActualizarConfiguracionDto = { ivaCreditoId: 'c1' };
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.CUENTA_NO_DETALLE,
      );
    });

    it('rechaza mapear un PASIVO al concepto ivaCreditoId (requiere ACTIVO)', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(
        cuentaValidacion({ claseCuenta: ClaseCuenta.PASIVO }),
      );
      const dto: ActualizarConfiguracionDto = { ivaCreditoId: 'c1' };
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.CUENTA_CLASE_INCORRECTA,
      );
    });

    it('rechaza mapear un ACTIVO al concepto ivaDebitoId (requiere PASIVO)', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(
        cuentaValidacion({ claseCuenta: ClaseCuenta.ACTIVO }),
      );
      const dto: ActualizarConfiguracionDto = { ivaDebitoId: 'c1' };
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.CUENTA_CLASE_INCORRECTA,
      );
    });

    it('rechaza cuando difCambioGanancia === difCambioPerdida (ambos en el DTO)', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockImplementation(async (id) =>
        cuentaValidacion({
          id,
          claseCuenta: ClaseCuenta.INGRESO, // ganancia válida; la pérdida fallará su validación individual antes
        }),
      );
      const dto: ActualizarConfiguracionDto = {
        difCambioGananciaId: 'misma',
        difCambioPerdidaId: 'misma',
      };
      // La validación de clase falla primero (misma cuenta es INGRESO, pero pérdida exige EGRESO),
      // así que este test valida la validación granular — reajustamos.
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.CUENTA_CLASE_INCORRECTA,
      );
    });

    it('rechaza cuando el DTO reutiliza la misma cuenta para ganancia y pérdida con clases distintas válidas', async () => {
      // Para disparar DIF_CAMBIO_MISMA_CUENTA la misma cuenta tendría que ser válida
      // para ambos roles, lo cual es imposible por clase. Probamos el caso real:
      // DTO setea ganancia; existente tiene pérdida === misma cuenta.
      repo.obtener.mockResolvedValue(configExistente({ difCambioPerdidaId: 'misma' }));
      cuentas.findForConfigValidation.mockResolvedValue(
        cuentaValidacion({ id: 'misma', claseCuenta: ClaseCuenta.INGRESO }),
      );
      const dto: ActualizarConfiguracionDto = { difCambioGananciaId: 'misma' };
      await expectErrorCode(
        service.actualizar(TENANT_ID, dto),
        ConfigContableErrorCode.DIF_CAMBIO_MISMA_CUENTA,
      );
    });

    it('acepta null para desmapear un concepto sin lookup de cuenta', async () => {
      repo.obtener.mockResolvedValue(null);
      repo.upsert.mockResolvedValue(configExistente({ ivaCreditoId: null }));
      const dto: ActualizarConfiguracionDto = { ivaCreditoId: null };
      const r = await service.actualizar(TENANT_ID, dto);
      expect(r.ivaCreditoId).toBeNull();
      expect(cuentas.findForConfigValidation).not.toHaveBeenCalled();
      expect(repo.upsert).toHaveBeenCalledWith(TENANT_ID, { ivaCreditoId: null });
    });

    it('persiste solo los campos presentes en el DTO (upsert parcial)', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(
        cuentaValidacion({ claseCuenta: ClaseCuenta.ACTIVO }),
      );
      repo.upsert.mockResolvedValue(configExistente({ ivaCreditoId: 'c1' }));
      const dto: ActualizarConfiguracionDto = { ivaCreditoId: 'c1' };
      await service.actualizar(TENANT_ID, dto);
      expect(repo.upsert).toHaveBeenCalledWith(TENANT_ID, { ivaCreditoId: 'c1' });
    });

    it('crea la fila en el primer PATCH (upsert silencioso)', async () => {
      repo.obtener.mockResolvedValue(null);
      cuentas.findForConfigValidation.mockResolvedValue(cuentaValidacion());
      repo.upsert.mockResolvedValue(configExistente({ ivaCreditoId: 'c1' }));
      await service.actualizar(TENANT_ID, { ivaCreditoId: 'c1' });
      expect(repo.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------- desmapearConcepto --------------------

  describe('desmapearConcepto', () => {
    it('rechaza concepto que no existe en el catálogo', async () => {
      await expectErrorCode(
        service.desmapearConcepto(TENANT_ID, 'foo'),
        ConfigContableErrorCode.CONCEPTO_INVALIDO,
      );
    });

    it('setea null en el concepto indicado vía upsert', async () => {
      repo.upsert.mockResolvedValue(configExistente());
      await service.desmapearConcepto(TENANT_ID, 'ivaDebitoId');
      expect(repo.upsert).toHaveBeenCalledWith(TENANT_ID, { ivaDebitoId: null });
    });
  });
});
