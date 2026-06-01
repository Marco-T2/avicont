import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClaseCuenta, Moneda, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { CuentasService } from './cuentas.service';
import type { CreateCuentaDto } from './dto/create-cuenta.dto';
import type { Cuenta } from './domain/cuenta';
import { CuentaErrorCode } from './domain/cuenta-errors';
import type { CuentaRepositoryPort } from './ports/cuenta.repository.port';
import type { MovimientosReaderPort } from './ports/movimientos-reader.port';

// Matcher para NestJS HttpException: el payload pasado al constructor queda
// expuesto en `error.response`. Así verificamos el code estable, no el mensaje
// humano (que puede cambiar).
const expectErrorCode = (promise: Promise<unknown>, code: string): Promise<void> =>
  expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });

const TENANT_ID = 'org-1';

type MockRepo = { [K in keyof CuentaRepositoryPort]: jest.Mock };
type MockMovimientos = { [K in keyof MovimientosReaderPort]: jest.Mock };

function makeRepoMock(): MockRepo {
  return {
    findById: jest.fn(),
    findByCodigoInterno: jest.fn(),
    findParent: jest.fn(),
    listar: jest.fn(),
    arbolCompleto: jest.fn(),
    crear: jest.fn(),
    actualizar: jest.fn(),
    desactivar: jest.fn(),
    reactivar: jest.fn(),
    conceptosQueUsanCuenta: jest.fn(),
  };
}

function makeMovimientosMock(): MockMovimientos {
  return { tieneMovimientos: jest.fn() };
}

function cuentaFactory(overrides: Partial<Cuenta> = {}): Cuenta {
  const now = new Date('2026-04-01T00:00:00.000Z');
  return {
    id: 'cuenta-1',
    organizationId: TENANT_ID,
    codigoInterno: '1.1.1.001',
    nombre: 'CAJA',
    descripcion: null,
    claseCuenta: ClaseCuenta.ACTIVO,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    parentId: null,
    nivel: 4,
    esDetalle: true,
    requiereContacto: false,
    esContraria: false,
    activa: true,
    monedaFuncional: Moneda.BOB,
    permiteMultiMoneda: true,
    esSystemSeed: false,
    esRequeridaSistema: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildDto(overrides: Partial<CreateCuentaDto> = {}): CreateCuentaDto {
  const base: CreateCuentaDto = {
    codigoInterno: '1.1.1.001',
    nombre: 'CAJA',
    claseCuenta: ClaseCuenta.ACTIVO,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    esDetalle: true,
  };
  return { ...base, ...overrides };
}

// Variante para cuentas raíz (nivel 1) — sin subClase.
function buildDtoRaiz(overrides: Partial<CreateCuentaDto> = {}): CreateCuentaDto {
  return {
    codigoInterno: '1',
    nombre: 'ACTIVO',
    claseCuenta: ClaseCuenta.ACTIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    esDetalle: false,
    ...overrides,
  };
}

describe('CuentasService', () => {
  let repo: MockRepo;
  let movimientos: MockMovimientos;
  let service: CuentasService;

  beforeEach(() => {
    repo = makeRepoMock();
    movimientos = makeMovimientosMock();
    service = new CuentasService(
      repo as unknown as CuentaRepositoryPort,
      movimientos as unknown as MovimientosReaderPort,
    );
  });

  // -------------------- crear --------------------

  describe('crear', () => {
    it('rechaza codigoInterno con segmento no numérico', async () => {
      const dto = buildDto({ codigoInterno: '1.a.1' });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.CODIGO_INTERNO_INVALIDO);
    });

    it('rechaza codigoInterno duplicado', async () => {
      repo.findByCodigoInterno.mockResolvedValue(cuentaFactory());
      const dto = buildDto();
      await expect(service.crear(TENANT_ID, dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza cuando el parent no existe', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.findParent.mockResolvedValue(null);
      const dto = buildDto({
        codigoInterno: '1.1.1.001',
        parentId: 'parent-ghost',
      });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.PADRE_INVALIDA);
    });

    it('rechaza cuando el parent pertenece a otro tenant', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.findParent.mockResolvedValue(cuentaFactory({ organizationId: 'otro-tenant' }));
      const dto = buildDto({ parentId: 'parent-1' });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.PADRE_INVALIDA);
    });

    it('rechaza cuando el parent está inactivo', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.findParent.mockResolvedValue(
        cuentaFactory({ activa: false, nivel: 3, esDetalle: false }),
      );
      const dto = buildDto({ parentId: 'parent-1' });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.PADRE_INACTIVA);
    });

    it('rechaza cuando el parent es esDetalle=true', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.findParent.mockResolvedValue(cuentaFactory({ esDetalle: true, nivel: 3 }));
      const dto = buildDto({ parentId: 'parent-1' });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.PADRE_ES_DETALLE);
    });

    it('rechaza cuando el nivel derivado no coincide con parent.nivel + 1', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.findParent.mockResolvedValue(
        cuentaFactory({ nivel: 2, esDetalle: false, activa: true }),
      );
      // codigoInterno "1.1.1.001" → nivel 4, parent nivel 2 → esperado 3, mismatch
      const dto = buildDto({ codigoInterno: '1.1.1.001', parentId: 'parent-1' });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.CODIGO_INTERNO_INVALIDO);
    });

    it('rechaza cuenta sin parent que no sea raíz (nivel 1)', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      const dto = buildDto({ codigoInterno: '1.1' });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.CODIGO_INTERNO_INVALIDO);
    });

    it('rechaza subClase inconsistente con la clase', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      const dto = buildDto({
        codigoInterno: '1',
        claseCuenta: ClaseCuenta.ACTIVO,
        subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      });
      await expectErrorCode(service.crear(TENANT_ID, dto), CuentaErrorCode.SUBCLASE_INCONSISTENTE);
    });

    it('rechaza cuenta no contraria con naturaleza opuesta al default', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      const dto = buildDtoRaiz({ naturaleza: NaturalezaCuenta.ACREEDORA });
      await expectErrorCode(
        service.crear(TENANT_ID, dto),
        CuentaErrorCode.CONTRARIA_NATURALEZA_INVALIDA,
      );
    });

    it('crea cuenta raíz (nivel 1) sin parent y sin subClase', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.crear.mockImplementation(async (data) => cuentaFactory({ ...data, id: 'nuevo' }));

      const dto = buildDtoRaiz();
      const resp = await service.crear(TENANT_ID, dto);

      expect(resp.id).toBe('nuevo');
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ nivel: 1, parentId: null, subClaseCuenta: null }),
      );
    });

    it('crea cuenta contraria (Depreciación Acumulada) con naturaleza opuesta', async () => {
      repo.findByCodigoInterno.mockResolvedValue(null);
      repo.findParent.mockResolvedValue(
        cuentaFactory({ nivel: 3, esDetalle: false, activa: true }),
      );
      repo.crear.mockImplementation(async (data) => cuentaFactory(data));

      const dto = buildDto({
        codigoInterno: '1.2.4.001',
        nombre: 'DEPRECIACION ACUMULADA',
        claseCuenta: ClaseCuenta.ACTIVO,
        subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
        naturaleza: NaturalezaCuenta.ACREEDORA,
        parentId: 'p',
        esContraria: true,
        esDetalle: true,
      });

      await expect(service.crear(TENANT_ID, dto)).resolves.toBeDefined();
      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ esContraria: true, naturaleza: NaturalezaCuenta.ACREEDORA }),
      );
    });
  });

  // -------------------- actualizar --------------------

  describe('actualizar', () => {
    it('lanza NotFoundException cuando la cuenta no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.actualizar(TENANT_ID, 'ghost', { nombre: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('actualiza solo los campos mutables del DTO', async () => {
      repo.findById.mockResolvedValue(cuentaFactory());
      repo.actualizar.mockImplementation(async (_id, _t, data) =>
        cuentaFactory({ nombre: data.nombre ?? 'CAJA' }),
      );
      await service.actualizar(TENANT_ID, 'cuenta-1', { nombre: 'CAJA BOB' });
      expect(repo.actualizar).toHaveBeenCalledWith('cuenta-1', TENANT_ID, { nombre: 'CAJA BOB' });
      expect(movimientos.tieneMovimientos).not.toHaveBeenCalled();
    });

    it('bloquea cambio de campo estructural cuando la cuenta tiene movimientos (defense in depth)', async () => {
      repo.findById.mockResolvedValue(cuentaFactory());
      movimientos.tieneMovimientos.mockResolvedValue(true);
      // Simulamos que por alguna vía llega un dto con campo estructural.
      const dtoContaminado = { nombre: 'X', esDetalle: true } as unknown as Parameters<
        typeof service.actualizar
      >[2];
      await expectErrorCode(
        service.actualizar(TENANT_ID, 'cuenta-1', dtoContaminado),
        CuentaErrorCode.CON_MOVIMIENTOS,
      );
    });

    it('permite cambio estructural cuando la cuenta NO tiene movimientos (stub false)', async () => {
      repo.findById.mockResolvedValue(cuentaFactory());
      movimientos.tieneMovimientos.mockResolvedValue(false);
      repo.actualizar.mockImplementation(async (_id, _t, _data) => cuentaFactory());
      const dtoContaminado = { nombre: 'X', esDetalle: true } as unknown as Parameters<
        typeof service.actualizar
      >[2];
      await expect(
        service.actualizar(TENANT_ID, 'cuenta-1', dtoContaminado),
      ).resolves.toBeDefined();
    });
  });

  // -------------------- desactivar --------------------

  describe('desactivar', () => {
    it('rechaza cuando la cuenta es esRequeridaSistema', async () => {
      repo.findById.mockResolvedValue(cuentaFactory({ esRequeridaSistema: true }));
      await expect(service.desactivar(TENANT_ID, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza con lista de conceptos cuando está mapeada como concepto contable', async () => {
      repo.findById.mockResolvedValue(cuentaFactory());
      repo.conceptosQueUsanCuenta.mockResolvedValue(['ivaCreditoId', 'resultadoEjercicioId']);
      await expectErrorCode(
        service.desactivar(TENANT_ID, 'c1'),
        CuentaErrorCode.CONFIGURADA_COMO_CONCEPTO,
      );
    });

    it('desactiva cuando no tiene conceptos ni es requerida', async () => {
      repo.findById.mockResolvedValue(cuentaFactory());
      repo.conceptosQueUsanCuenta.mockResolvedValue([]);
      repo.desactivar.mockResolvedValue(cuentaFactory({ activa: false }));

      const resp = await service.desactivar(TENANT_ID, 'c1');
      expect(resp.activa).toBe(false);
      expect(repo.desactivar).toHaveBeenCalledWith('c1', TENANT_ID);
    });
  });

  // -------------------- reactivar --------------------

  describe('reactivar', () => {
    it('rechaza si el parent está inactivo', async () => {
      repo.findById.mockResolvedValue(cuentaFactory({ parentId: 'p' }));
      repo.findParent.mockResolvedValue(cuentaFactory({ id: 'p', activa: false }));
      await expect(service.reactivar(TENANT_ID, 'c1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('reactiva cuando parent activo (o sin parent)', async () => {
      repo.findById.mockResolvedValue(cuentaFactory({ parentId: null }));
      repo.reactivar.mockResolvedValue(cuentaFactory({ activa: true }));
      const resp = await service.reactivar(TENANT_ID, 'c1');
      expect(resp.activa).toBe(true);
    });
  });

  // -------------------- listar / árbol --------------------

  describe('listar', () => {
    it('aplica defaults page=1, pageSize=25 y calcula skip', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 0 });
      await service.listar(TENANT_ID, {});
      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    });

    it('calcula skip correctamente en página 3 con pageSize 10', async () => {
      repo.listar.mockResolvedValue({ items: [], total: 100 });
      await service.listar(TENANT_ID, { page: 3, pageSize: 10 });
      expect(repo.listar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('arbolCompleto', () => {
    it('agrupa hijas bajo su padre y ordena por codigoInterno', async () => {
      const raiz = cuentaFactory({ id: 'r', codigoInterno: '1', nivel: 1, parentId: null });
      const hija2 = cuentaFactory({ id: 'h2', codigoInterno: '1.2', nivel: 2, parentId: 'r' });
      const hija1 = cuentaFactory({ id: 'h1', codigoInterno: '1.1', nivel: 2, parentId: 'r' });
      repo.arbolCompleto.mockResolvedValue([hija2, raiz, hija1]);

      const arbol = await service.arbolCompleto(TENANT_ID);
      expect(arbol).toHaveLength(1);
      expect(arbol[0]!.id).toBe('r');
      expect(arbol[0]!.hijas.map((h) => h.codigoInterno)).toEqual(['1.1', '1.2']);
    });
  });
});
