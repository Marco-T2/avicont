import { TipoItem } from '@prisma/client';

import type { CuentaParaLinea, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';

import {
  ItemCodigoDuplicadoError,
  ItemCuentaIngresoInvalidaError,
  ItemNoEncontradoError,
} from './domain/item-errors';
import { ItemsService } from './items.service';
import type { ItemsRepositoryPort } from './ports/items.repository.port';

const TENANT = 'org-1';
const USER = 'user-1';

type MockRepo = { [K in keyof ItemsRepositoryPort]: jest.Mock };
type MockCuentas = { [K in keyof CuentasReaderPort]: jest.Mock };

const itemRow = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  organizationId: TENANT,
  codigo: null,
  nombre: 'Pollo entero',
  tipo: TipoItem.PRODUCTO,
  unidadMedida: null,
  precioUnitarioSugerido: null,
  cantidadPorDefecto: '1',
  cuentaIngresoId: null,
  activo: true,
  ...over,
});

const cuentaOk = (over: Partial<CuentaParaLinea> = {}): CuentaParaLinea => ({
  id: 'cuenta-1',
  codigoInterno: '4.1.1.002',
  nombre: 'VENTAS DE POLLO',
  activa: true,
  esDetalle: true,
  requiereContacto: false,
  permiteMultiMoneda: false,
  monedaFuncional: 'BOB',
  ...over,
});

describe('ItemsService', () => {
  let repo: MockRepo;
  let cuentas: MockCuentas;
  let service: ItemsService;

  beforeEach(() => {
    repo = {
      create: jest.fn((_t, data) => Promise.resolve(itemRow(data))),
      update: jest.fn((_t, id, data) => Promise.resolve(itemRow({ id, ...data }))),
      setActivo: jest.fn((_t, id, activo) => Promise.resolve(itemRow({ id, activo }))),
      findById: jest.fn(() => Promise.resolve(itemRow())),
      findByCodigo: jest.fn(() => Promise.resolve(null)),
      listar: jest.fn(() => Promise.resolve({ items: [], total: 0 })),
    } as unknown as MockRepo;
    cuentas = {
      obtenerBatch: jest.fn(() => Promise.resolve(new Map([['cuenta-1', cuentaOk()]]))),
    } as unknown as MockCuentas;
    service = new ItemsService(
      repo as unknown as ItemsRepositoryPort,
      cuentas as unknown as CuentasReaderPort,
    );
  });

  describe('crear', () => {
    it('guarda con sólo nombre y tipo (D-24)', async () => {
      await service.crear(TENANT, USER, { nombre: 'Pollo entero', tipo: TipoItem.PRODUCTO });

      expect(repo.create).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ nombre: 'Pollo entero', codigo: null, createdByUserId: USER }),
      );
    });

    it('normaliza el código antes de persistir', async () => {
      await service.crear(TENANT, USER, {
        nombre: 'X',
        tipo: TipoItem.PRODUCTO,
        codigo: '  ab-9 ',
      });

      expect(repo.create).toHaveBeenCalledWith(TENANT, expect.objectContaining({ codigo: 'AB-9' }));
    });

    it('trimea el nombre', async () => {
      await service.crear(TENANT, USER, { nombre: '  Pollo  ', tipo: TipoItem.PRODUCTO });

      expect(repo.create).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ nombre: 'Pollo' }),
      );
    });

    it('chequea unicidad con el código YA NORMALIZADO', async () => {
      // Si comparara el crudo, "p-01 " no encontraría al ocupante "P-01" y el
      // choque llegaría al constraint como 500 en vez del 409 amigable.
      await service.crear(TENANT, USER, { nombre: 'X', tipo: TipoItem.PRODUCTO, codigo: 'p-01 ' });

      expect(repo.findByCodigo).toHaveBeenCalledWith(TENANT, 'P-01');
    });

    it('rechaza el código ya ocupado con ITEM_CODIGO_DUPLICADO', async () => {
      repo.findByCodigo.mockResolvedValue(itemRow({ id: 'otro', codigo: 'P-01' }));

      await expect(
        service.crear(TENANT, USER, { nombre: 'X', tipo: TipoItem.PRODUCTO, codigo: 'P-01' }),
      ).rejects.toBeInstanceOf(ItemCodigoDuplicadoError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('sin código no consulta unicidad', async () => {
      await service.crear(TENANT, USER, { nombre: 'X', tipo: TipoItem.PRODUCTO });

      expect(repo.findByCodigo).not.toHaveBeenCalled();
    });

    describe('cuenta de ingreso', () => {
      it('acepta una cuenta activa y de detalle del tenant', async () => {
        await service.crear(TENANT, USER, {
          nombre: 'X',
          tipo: TipoItem.PRODUCTO,
          cuentaIngresoId: 'cuenta-1',
        });

        expect(cuentas.obtenerBatch).toHaveBeenCalledWith(TENANT, ['cuenta-1']);
        expect(repo.create).toHaveBeenCalledWith(
          TENANT,
          expect.objectContaining({ cuentaIngresoId: 'cuenta-1' }),
        );
      });

      // La FK no protege de esto: las dos filas viven en `cuentas`. Aceptar un
      // id ajeno sería la violación de §4.2 que la constitución llama bug de
      // seguridad.
      it('rechaza una cuenta de OTRO tenant', async () => {
        cuentas.obtenerBatch.mockResolvedValue(new Map());

        await expect(
          service.crear(TENANT, USER, {
            nombre: 'X',
            tipo: TipoItem.PRODUCTO,
            cuentaIngresoId: 'ajena',
          }),
        ).rejects.toBeInstanceOf(ItemCuentaIngresoInvalidaError);
        expect(repo.create).not.toHaveBeenCalled();
      });

      it('rechaza una cuenta que no es de detalle', async () => {
        cuentas.obtenerBatch.mockResolvedValue(
          new Map([['cuenta-1', cuentaOk({ esDetalle: false })]]),
        );

        await expect(
          service.crear(TENANT, USER, {
            nombre: 'X',
            tipo: TipoItem.PRODUCTO,
            cuentaIngresoId: 'cuenta-1',
          }),
        ).rejects.toBeInstanceOf(ItemCuentaIngresoInvalidaError);
      });

      it('rechaza una cuenta inactiva', async () => {
        cuentas.obtenerBatch.mockResolvedValue(
          new Map([['cuenta-1', cuentaOk({ activa: false })]]),
        );

        await expect(
          service.crear(TENANT, USER, {
            nombre: 'X',
            tipo: TipoItem.PRODUCTO,
            cuentaIngresoId: 'cuenta-1',
          }),
        ).rejects.toBeInstanceOf(ItemCuentaIngresoInvalidaError);
      });

      it('sin cuenta no consulta (cae al concepto ventasId al vender)', async () => {
        await service.crear(TENANT, USER, { nombre: 'X', tipo: TipoItem.PRODUCTO });

        expect(cuentas.obtenerBatch).not.toHaveBeenCalled();
      });
    });
  });

  describe('actualizar', () => {
    it('404 si el ítem no existe o es de otro tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.actualizar(TENANT, 'x', { nombre: 'Y' })).rejects.toBeInstanceOf(
        ItemNoEncontradoError,
      );
    });

    it('no toca los campos ausentes', async () => {
      await service.actualizar(TENANT, 'item-1', { nombre: 'Nuevo' });

      expect(repo.update).toHaveBeenCalledWith(TENANT, 'item-1', { nombre: 'Nuevo' });
    });

    it('normaliza el código nuevo', async () => {
      repo.findById.mockResolvedValue(itemRow({ codigo: 'VIEJO' }));

      await service.actualizar(TENANT, 'item-1', { codigo: ' p-02 ' });

      expect(repo.update).toHaveBeenCalledWith(TENANT, 'item-1', { codigo: 'P-02' });
    });

    it('permite reenviar SU PROPIO código sin chocar consigo mismo', async () => {
      // El bug clásico del guard de unicidad al editar: el ocupante del código
      // es el propio ítem, así que compararlo sin excluir el id propio hace
      // imposible guardar cualquier otro campo.
      repo.findById.mockResolvedValue(itemRow({ id: 'item-1', codigo: 'P-01' }));
      repo.findByCodigo.mockResolvedValue(itemRow({ id: 'item-1', codigo: 'P-01' }));

      await expect(
        service.actualizar(TENANT, 'item-1', { codigo: 'P-01', nombre: 'Otro nombre' }),
      ).resolves.toBeDefined();
    });

    it('rechaza el código de OTRO ítem', async () => {
      repo.findById.mockResolvedValue(itemRow({ id: 'item-1', codigo: 'P-01' }));
      repo.findByCodigo.mockResolvedValue(itemRow({ id: 'item-2', codigo: 'P-02' }));

      await expect(service.actualizar(TENANT, 'item-1', { codigo: 'P-02' })).rejects.toBeInstanceOf(
        ItemCodigoDuplicadoError,
      );
    });

    it('permite limpiar el código', async () => {
      repo.findById.mockResolvedValue(itemRow({ codigo: 'P-01' }));

      await service.actualizar(TENANT, 'item-1', { codigo: null });

      expect(repo.update).toHaveBeenCalledWith(TENANT, 'item-1', { codigo: null });
    });

    it('valida la cuenta de ingreso nueva', async () => {
      cuentas.obtenerBatch.mockResolvedValue(new Map());

      await expect(
        service.actualizar(TENANT, 'item-1', { cuentaIngresoId: 'ajena' }),
      ).rejects.toBeInstanceOf(ItemCuentaIngresoInvalidaError);
    });

    it('permite limpiar la cuenta de ingreso sin validar nada', async () => {
      await service.actualizar(TENANT, 'item-1', { cuentaIngresoId: null });

      expect(cuentas.obtenerBatch).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'item-1', { cuentaIngresoId: null });
    });
  });

  describe('desactivar / reactivar', () => {
    it('desactivar es idempotente y no borra', async () => {
      repo.findById.mockResolvedValue(itemRow({ activo: false }));

      const res = await service.desactivar(TENANT, 'item-1');

      expect(res.activo).toBe(false);
      expect(repo.setActivo).toHaveBeenCalledWith(TENANT, 'item-1', false);
    });

    it('404 si no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.desactivar(TENANT, 'x')).rejects.toBeInstanceOf(ItemNoEncontradoError);
    });

    it('reactivar vuelve a activo', async () => {
      await service.reactivar(TENANT, 'item-1');

      expect(repo.setActivo).toHaveBeenCalledWith(TENANT, 'item-1', true);
    });
  });

  describe('listar', () => {
    it('aplica page y limit por default', async () => {
      await service.listar(TENANT, {});

      expect(repo.listar).toHaveBeenCalledWith(TENANT, {}, { page: 1, limit: 50 });
    });

    it('capea el limit', async () => {
      await service.listar(TENANT, { limit: 9999 });

      expect(repo.listar).toHaveBeenCalledWith(TENANT, {}, { page: 1, limit: 200 });
    });

    it('normaliza page inválida a 1', async () => {
      await service.listar(TENANT, { page: 0 });

      expect(repo.listar).toHaveBeenCalledWith(TENANT, {}, { page: 1, limit: 50 });
    });
  });

  describe('obtener', () => {
    it('404 si no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.obtener(TENANT, 'x')).rejects.toBeInstanceOf(ItemNoEncontradoError);
    });
  });
});
