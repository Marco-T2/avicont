import { EstadoComprobante, GestionFiscalStatus } from '@prisma/client';

import type { CierreEjercicioService } from '@/cierre-ejercicio/cierre-ejercicio.service';
import { CierreYaParcialmenteContabilizadoError } from '@/cierre-ejercicio/domain/cierre-errors';

import {
  GestionConPeriodosAbiertosError,
  GestionNoEncontradaError,
  GestionYaCerradaError,
} from './domain/errors';
import { GestionesFiscalesService } from './gestiones-fiscales.service';
import type { GestionFiscalRepositoryPort } from './ports/gestion-fiscal.repository.port';

/**
 * Unit spec del gate de `cerrar()` (REQ-GF-CIERRE-01): si la gestión tiene
 * comprobantes de cierre generados, todos deben estar CONTABILIZADO. El resto
 * del flujo de `cerrar()` (períodos abiertos, ya cerrada) se cubre en el e2e de
 * períodos; acá aislamos el gate con mocks (§7.8 — nunca Prisma).
 */
describe('GestionesFiscalesService — gate de cerrar() (REQ-GF-CIERRE-01)', () => {
  const TENANT = 'tenant-1';
  const GESTION = 'gestion-1';
  const USER = 'user-1';

  let repo: jest.Mocked<GestionFiscalRepositoryPort>;
  let cierreService: jest.Mocked<Pick<CierreEjercicioService, 'obtenerEstadoCierre'>>;
  let prisma: { $transaction: jest.Mock };
  let service: GestionesFiscalesService;

  function gestionConTodosLosPeriodosCerrados() {
    return {
      id: GESTION,
      organizationId: TENANT,
      status: GestionFiscalStatus.ABIERTA as GestionFiscalStatus,
      periodos: Array.from({ length: 12 }, (_, i) => ({
        id: `p-${i + 1}`,
        status: 'CERRADO',
        year: 2026,
        month: i + 1,
        ordenEnGestion: i + 1,
      })),
    };
  }

  beforeEach(() => {
    repo = {
      findByYear: jest.fn(),
      findByIdWithPeriodos: jest.fn().mockResolvedValue(gestionConTodosLosPeriodosCerrados()),
      listByOrganization: jest.fn(),
      existsForOrganization: jest.fn(),
      crearGestionConPeriodos: jest.fn(),
      cerrarGestion: jest.fn().mockResolvedValue({ id: GESTION, status: 'CERRADA' }),
    } as unknown as jest.Mocked<GestionFiscalRepositoryPort>;

    cierreService = { obtenerEstadoCierre: jest.fn() };

    // $transaction ejecuta el callback con un tx fake (los mocks del repo ignoran el tx).
    prisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb({})),
    };

    service = new GestionesFiscalesService(
      repo,
      { currentYearLaPaz: jest.fn().mockReturnValue(2026) } as never,
      prisma as never,
      cierreService as unknown as CierreEjercicioService,
    );
  });

  it('(−) con los 3 cierres en BORRADOR lanza CierreYaParcialmenteContabilizadoError', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({
      gestionId: GESTION,
      cierres: [
        { id: 'c1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.BORRADOR },
        { id: 'c2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.BORRADOR },
        { id: 'c3', origenTipo: 'CIERRE_RESULTADO', estado: EstadoComprobante.BORRADOR },
      ],
    });

    await expect(service.cerrar(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
      CierreYaParcialmenteContabilizadoError,
    );
    expect(repo.cerrarGestion).not.toHaveBeenCalled();
  });

  it('(−) con #1 CONTABILIZADO y #2/#3 en BORRADOR lanza el mismo error', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({
      gestionId: GESTION,
      cierres: [
        { id: 'c1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.CONTABILIZADO },
        { id: 'c2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.BORRADOR },
        { id: 'c3', origenTipo: 'CIERRE_RESULTADO', estado: EstadoComprobante.BORRADOR },
      ],
    });

    await expect(service.cerrar(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
      CierreYaParcialmenteContabilizadoError,
    );
    expect(repo.cerrarGestion).not.toHaveBeenCalled();
  });

  it('(+) con los 3 cierres CONTABILIZADO cierra la gestión', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({
      gestionId: GESTION,
      cierres: [
        { id: 'c1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.CONTABILIZADO },
        { id: 'c2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.CONTABILIZADO },
        { id: 'c3', origenTipo: 'CIERRE_RESULTADO', estado: EstadoComprobante.CONTABILIZADO },
      ],
    });

    await service.cerrar(GESTION, TENANT, USER);
    expect(repo.cerrarGestion).toHaveBeenCalledTimes(1);
  });

  // Flujo real: tras contabilizar los cierres, cerrar el período (vía servicio)
  // los transiciona CONTABILIZADO → BLOQUEADO. Como cerrar() exige los 12 períodos
  // cerrados, el mesCierre que contiene los asientos SIEMPRE termina BLOQUEADO.
  // BLOQUEADO es un estado posteado (no pendiente): la gestión debe poder cerrarse.
  it('(+) con los 3 cierres BLOQUEADO (período ya cerrado) cierra la gestión', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({
      gestionId: GESTION,
      cierres: [
        { id: 'c1', origenTipo: 'CIERRE_GASTOS', estado: EstadoComprobante.BLOQUEADO },
        { id: 'c2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.BLOQUEADO },
        { id: 'c3', origenTipo: 'CIERRE_RESULTADO', estado: EstadoComprobante.BLOQUEADO },
      ],
    });

    await service.cerrar(GESTION, TENANT, USER);
    expect(repo.cerrarGestion).toHaveBeenCalledTimes(1);
  });

  it('(+) con SKIP-on-zero (solo #2 y #3 generados, ambos CONTABILIZADO) cierra OK', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({
      gestionId: GESTION,
      cierres: [
        { id: 'c2', origenTipo: 'CIERRE_INGRESOS', estado: EstadoComprobante.CONTABILIZADO },
        { id: 'c3', origenTipo: 'CIERRE_RESULTADO', estado: EstadoComprobante.CONTABILIZADO },
      ],
    });

    await service.cerrar(GESTION, TENANT, USER);
    expect(repo.cerrarGestion).toHaveBeenCalledTimes(1);
  });

  it('(+) sin ningún cierre generado cierra OK (no se exige cierre)', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({ gestionId: GESTION, cierres: [] });

    await service.cerrar(GESTION, TENANT, USER);
    expect(repo.cerrarGestion).toHaveBeenCalledTimes(1);
  });

  it('mantiene el chequeo de períodos abiertos (gate previo intacto)', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({ gestionId: GESTION, cierres: [] });
    const conAbierto = gestionConTodosLosPeriodosCerrados();
    conAbierto.periodos[0]!.status = 'ABIERTO';
    repo.findByIdWithPeriodos.mockResolvedValue(conAbierto as never);

    await expect(service.cerrar(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
      GestionConPeriodosAbiertosError,
    );
  });

  it('gestión inexistente → GestionNoEncontradaError', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({ gestionId: GESTION, cierres: [] });
    repo.findByIdWithPeriodos.mockResolvedValue(null);

    await expect(service.cerrar(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
      GestionNoEncontradaError,
    );
  });

  it('gestión ya CERRADA → GestionYaCerradaError', async () => {
    cierreService.obtenerEstadoCierre.mockResolvedValue({ gestionId: GESTION, cierres: [] });
    const cerrada = gestionConTodosLosPeriodosCerrados();
    cerrada.status = GestionFiscalStatus.CERRADA;
    repo.findByIdWithPeriodos.mockResolvedValue(cerrada as never);

    await expect(service.cerrar(GESTION, TENANT, USER)).rejects.toBeInstanceOf(
      GestionYaCerradaError,
    );
  });
});
