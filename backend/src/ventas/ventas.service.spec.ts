import { EstadoComprobante, PeriodoFiscalStatus, Prisma } from '@prisma/client';

import type { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import type { ComprobanteSistemaWriterPort } from '@/comprobantes/ports/comprobante-sistema-writer.port';
import type { ContactosReaderPort } from '@/contactos/ports/contactos-reader.port';
import type { CuentasEfectivoReaderPort } from '@/cuentas/ports/cuentas-efectivo-reader.port';
import type { CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';
import type { ItemsReaderPort } from '@/items/ports/items-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import type { VentaSnapshotsReaderPort } from './ports/venta-snapshots-reader.port';
import type {
  LineaVentaData,
  VentaCreateData,
  VentaRepositoryPort,
} from './ports/venta.repository.port';
import type { VentasConfigReaderPort } from './ports/ventas-config-reader.port';
import { type CrearVentaInput, VentasService } from './ventas.service';

const TENANT = 'org-a';
const USER = 'user-1';
const CONTACTO = 'contacto-1';
const ITEM_CON_CUENTA = 'item-con-cuenta';
const ITEM_SIN_CUENTA = 'item-sin-cuenta';
const CUENTA_ITEM = 'cuenta-ingreso-del-item';
const CUENTA_VENTAS = 'cuenta-concepto-ventas';
const CUENTA_CXC = 'cuenta-concepto-cxc';
const CUENTA_CAJA = 'cuenta-caja';
const PERIODO = 'periodo-2607';
const VENTA_ID = 'venta-1';
const COMPROBANTE_ID = 'comp-1';
const RAZON_SOCIAL = 'Avícola Sur';
const CONTACTO_2 = 'contacto-2';
const CUENTA_SNAPSHOT_VIEJA = 'cuenta-snapshot-vieja';

/** Sentinela: probar que TODO corre dentro del MISMO tx que abre el runner. */
const TX = { __tx: 'auditada' } as unknown as Prisma.TransactionClient;

function lineaVentaRow(over: Record<string, unknown> = {}) {
  return {
    id: 'linea-venta-1',
    organizationId: TENANT,
    ventaId: VENTA_ID,
    orden: 1,
    itemId: ITEM_CON_CUENTA,
    descripcion: 'Pollo entero',
    cantidad: new Prisma.Decimal('5'),
    precioUnitario: new Prisma.Decimal('6.305'),
    cuentaIngresoId: CUENTA_ITEM,
    subtotal: new Prisma.Decimal('31.53'),
    ...over,
  };
}

function ventaRow(over: Record<string, unknown> = {}) {
  return {
    id: VENTA_ID,
    organizationId: TENANT,
    contactoId: CONTACTO,
    fechaContable: new Date(Date.UTC(2026, 6, 15)),
    condicionPago: 'CONTADO',
    fechaVencimiento: null,
    glosa: 'venta de pollo',
    cuentaDestinoId: CUENTA_CAJA,
    montoTotal: new Prisma.Decimal('31.53'),
    createdAt: new Date(),
    createdByUserId: USER,
    updatedAt: new Date(),
    lineas: [lineaVentaRow()],
    ...over,
  } as never;
}

function cuentaActiva(id: string, codigoInterno: string, over: Record<string, unknown> = {}) {
  return {
    id,
    codigoInterno,
    nombre: `Cuenta ${codigoInterno}`,
    activa: true,
    esDetalle: true,
    requiereContacto: false,
    permiteMultiMoneda: false,
    monedaFuncional: 'BOB',
    ...over,
  };
}

describe('VentasService', () => {
  let repo: { [K in keyof VentaRepositoryPort]: jest.Mock };
  let writer: { [K in keyof ComprobanteSistemaWriterPort]: jest.Mock };
  let items: { obtenerBatch: jest.Mock };
  let contactos: { obtenerBatch: jest.Mock };
  let cuentasEfectivo: { esElegibleComoDestino: jest.Mock };
  let cuentas: { obtenerBatch: jest.Mock };
  let periodos: { [K in keyof PeriodosReaderPort]: jest.Mock };
  let config: { obtenerConfig: jest.Mock };
  let snapshots: { [K in keyof VentaSnapshotsReaderPort]: jest.Mock };
  let auditedTx: { run: jest.Mock };
  let service: VentasService;

  beforeEach(() => {
    repo = {
      crear: jest.fn().mockResolvedValue(ventaRow()),
      reemplazar: jest.fn(),
      eliminar: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(ventaRow()),
      listar: jest.fn(),
      obtenerComprobantesDeVentas: jest.fn().mockResolvedValue(
        new Map([
          [
            VENTA_ID,
            {
              id: COMPROBANTE_ID,
              numero: null,
              estado: EstadoComprobante.BORRADOR,
              anulado: false,
            },
          ],
        ]),
      ),
      listarAplicaciones: jest.fn().mockResolvedValue([]),
      listarVentasEnCartera: jest.fn(),
      actualizarMontoAplicacion: jest.fn().mockResolvedValue(undefined),
      eliminarAplicaciones: jest.fn().mockResolvedValue(undefined),
      registrarAplicacionesDesvinculadas: jest.fn().mockResolvedValue(undefined),
    };
    writer = {
      crearBorradorSistema: jest.fn().mockResolvedValue({ id: COMPROBANTE_ID }),
      regenerarLineasSistema: jest.fn().mockResolvedValue(undefined),
      contabilizarSistema: jest.fn().mockResolvedValue({ numero: 'V2607-000001' }),
      anularSistema: jest.fn().mockResolvedValue(undefined),
      eliminarBorradorSistema: jest.fn().mockResolvedValue(undefined),
    };
    items = {
      obtenerBatch: jest.fn().mockResolvedValue(
        new Map([
          [ITEM_CON_CUENTA, { id: ITEM_CON_CUENTA, activo: true }],
          [ITEM_SIN_CUENTA, { id: ITEM_SIN_CUENTA, activo: true }],
        ]),
      ),
    };
    contactos = {
      obtenerBatch: jest.fn().mockResolvedValue(
        new Map([
          [CONTACTO, { id: CONTACTO, activo: true }],
          [CONTACTO_2, { id: CONTACTO_2, activo: true }],
        ]),
      ),
    };
    cuentasEfectivo = { esElegibleComoDestino: jest.fn().mockResolvedValue(true) };
    cuentas = {
      obtenerBatch: jest.fn().mockResolvedValue(
        new Map([
          [CUENTA_ITEM, cuentaActiva(CUENTA_ITEM, '4.1.2.001')],
          [CUENTA_VENTAS, cuentaActiva(CUENTA_VENTAS, '4.1.1.001')],
          [CUENTA_CXC, cuentaActiva(CUENTA_CXC, '1.1.2.001', { requiereContacto: true })],
          [CUENTA_CAJA, cuentaActiva(CUENTA_CAJA, '1.1.1.001')],
        ]),
      ),
    };
    periodos = {
      obtenerPorFecha: jest
        .fn()
        .mockResolvedValue({ id: PERIODO, status: PeriodoFiscalStatus.ABIERTO }),
      obtenerRangoFechas: jest.fn(),
      obtenerReaperturaActiva: jest.fn(),
      obtenerRangoGestionPorFecha: jest.fn(),
      obtenerRangoGestion: jest.fn(),
    };
    config = {
      obtenerConfig: jest
        .fn()
        .mockResolvedValue({ cuentasPorCobrarId: CUENTA_CXC, ventasId: CUENTA_VENTAS }),
    };
    snapshots = {
      obtenerCuentasIngresoDeItems: jest.fn().mockResolvedValue(
        new Map([
          [ITEM_CON_CUENTA, CUENTA_ITEM],
          [ITEM_SIN_CUENTA, null],
        ]),
      ),
      obtenerRazonSocialContacto: jest.fn().mockResolvedValue(RAZON_SOCIAL),
    };
    auditedTx = {
      run: jest.fn(async (_opts: unknown, fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        fn(TX),
      ),
    };

    service = new VentasService(
      repo as unknown as VentaRepositoryPort,
      writer as unknown as ComprobanteSistemaWriterPort,
      items as unknown as ItemsReaderPort,
      contactos as unknown as ContactosReaderPort,
      cuentasEfectivo as unknown as CuentasEfectivoReaderPort,
      cuentas as unknown as CuentasReaderPort,
      periodos as unknown as PeriodosReaderPort,
      config as unknown as VentasConfigReaderPort,
      snapshots as unknown as VentaSnapshotsReaderPort,
      auditedTx as unknown as AuditedTransactionRunner,
    );
  });

  function inputContado(over: Partial<CrearVentaInput> = {}): CrearVentaInput {
    return {
      contactoId: CONTACTO,
      fechaContable: '2026-07-15',
      condicionPago: 'CONTADO',
      glosa: 'venta de pollo',
      cuentaDestinoId: CUENTA_CAJA,
      lineas: [
        {
          itemId: ITEM_CON_CUENTA,
          descripcion: 'Pollo entero',
          cantidad: '5',
          precioUnitario: '6.305',
        },
      ],
      ...over,
    };
  }

  function inputCredito(over: Partial<CrearVentaInput> = {}): CrearVentaInput {
    return inputContado({
      condicionPago: 'CREDITO',
      fechaVencimiento: '2026-08-15',
      ...over,
    });
  }

  function datosCrearVenta(): VentaCreateData {
    expect(repo.crear).toHaveBeenCalledTimes(1);
    return (repo.crear.mock.calls[0] as unknown[])[1] as VentaCreateData;
  }

  function datosComprobante() {
    expect(writer.crearBorradorSistema).toHaveBeenCalledTimes(1);
    return (writer.crearBorradorSistema.mock.calls[0] as unknown[])[0] as {
      tenantId: string;
      tipo: string;
      fechaContable: Date;
      glosa: string;
      monedaPrincipal: string;
      origenTipo: string;
      origenId: string;
      createdByUserId: string;
      lineas: {
        cuentaId: string;
        contactoId: string | null;
        debitoBob: Prisma.Decimal;
        creditoBob: Prisma.Decimal;
        glosaLinea: string | null;
      }[];
    };
  }

  // ============================================================
  // 4.8 — Period lock (REQ-VTA-09), pieza reutilizable
  // ============================================================

  describe('period lock (REQ-VTA-09)', () => {
    it('sin período para la fecha → VENTA_GESTION_NO_ABIERTA (422) y NO escribe nada', async () => {
      periodos.obtenerPorFecha.mockResolvedValue(null);

      await expect(service.crear(TENANT, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_GESTION_NO_ABIERTA',
        httpStatus: 422,
      });
      expect(repo.crear).not.toHaveBeenCalled();
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('período CERRADO → VENTA_PERIODO_NO_ABIERTO (409) indicando la reapertura, sin bypass', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      const rechazo = service.crear(TENANT, USER, inputContado());
      await expect(rechazo).rejects.toMatchObject({
        code: 'VENTA_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      await rechazo.catch((err: Error) => {
        expect(err.message).toContain('reapertura');
      });
      expect(repo.crear).not.toHaveBeenCalled();
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('el lock corre DENTRO de la transacción auditada, sobre la fechaContable de la venta', async () => {
      await service.crear(TENANT, USER, inputContado());

      expect(periodos.obtenerPorFecha).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({}),
        TX,
      );
      const fecha = (periodos.obtenerPorFecha.mock.calls[0] as unknown[])[1] as {
        toIso(): string;
      };
      expect(fecha.toIso()).toBe('2026-07-15');
    });
  });

  // ============================================================
  // 4.4 — Cabecera y cruces de tenant
  // ============================================================

  describe('validación de cabecera', () => {
    it('CREDITO sin fechaVencimiento → VENTA_VENCIMIENTO_REQUERIDO (422)', async () => {
      const { fechaVencimiento: _omitida, ...sinVencimiento } = inputCredito();

      await expect(service.crear(TENANT, USER, sinVencimiento)).rejects.toMatchObject({
        code: 'VENTA_VENCIMIENTO_REQUERIDO',
        httpStatus: 422,
      });
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('CONTADO con fechaVencimiento → VENTA_VENCIMIENTO_REQUERIDO (422)', async () => {
      await expect(
        service.crear(TENANT, USER, inputContado({ fechaVencimiento: '2026-08-15' })),
      ).rejects.toMatchObject({ code: 'VENTA_VENCIMIENTO_REQUERIDO', httpStatus: 422 });
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('contacto inexistente o de otro tenant → VENTA_CONTACTO_NO_ENCONTRADO (404)', async () => {
      contactos.obtenerBatch.mockResolvedValue(new Map());

      await expect(service.crear(TENANT, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_CONTACTO_NO_ENCONTRADO',
        httpStatus: 404,
      });
    });

    it('contacto inactivo → VENTA_CONTACTO_INACTIVO (422)', async () => {
      contactos.obtenerBatch.mockResolvedValue(
        new Map([[CONTACTO, { id: CONTACTO, activo: false }]]),
      );

      await expect(service.crear(TENANT, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_CONTACTO_INACTIVO',
        httpStatus: 422,
      });
    });

    it('ítem inexistente o de otro tenant → VENTA_ITEM_NO_ENCONTRADO (404)', async () => {
      items.obtenerBatch.mockResolvedValue(new Map());

      await expect(service.crear(TENANT, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_ITEM_NO_ENCONTRADO',
        httpStatus: 404,
      });
    });

    it('ítem inactivo → VENTA_ITEM_INACTIVO (422)', async () => {
      items.obtenerBatch.mockResolvedValue(
        new Map([[ITEM_CON_CUENTA, { id: ITEM_CON_CUENTA, activo: false }]]),
      );

      await expect(service.crear(TENANT, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_ITEM_INACTIVO',
        httpStatus: 422,
      });
    });
  });

  // ============================================================
  // 4.4 — Snapshots y cálculo (REQ-VTA-02 / REQ-VTA-03)
  // ============================================================

  describe('snapshots y cálculo', () => {
    it('la línea usa la cuenta de ingreso del ítem cuando la tiene', async () => {
      await service.crear(TENANT, USER, inputContado());

      const data = datosCrearVenta();
      expect((data.lineas[0] as LineaVentaData).cuentaIngresoId).toBe(CUENTA_ITEM);
    });

    it('cae al concepto ventasId cuando el ítem no trae cuenta', async () => {
      await service.crear(
        TENANT,
        USER,
        inputContado({
          lineas: [
            { itemId: ITEM_SIN_CUENTA, descripcion: 'Flete', cantidad: '1', precioUnitario: '50' },
          ],
        }),
      );

      const data = datosCrearVenta();
      expect((data.lineas[0] as LineaVentaData).cuentaIngresoId).toBe(CUENTA_VENTAS);
    });

    it('ítem sin cuenta y ventasId sin mapear → VENTA_CONCEPTO_NO_CONFIGURADO nombrando el concepto', async () => {
      config.obtenerConfig.mockResolvedValue({ cuentasPorCobrarId: CUENTA_CXC, ventasId: null });

      await expect(
        service.crear(
          TENANT,
          USER,
          inputContado({
            lineas: [
              {
                itemId: ITEM_SIN_CUENTA,
                descripcion: 'Flete',
                cantidad: '1',
                precioUnitario: '50',
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({
        code: 'VENTA_CONCEPTO_NO_CONFIGURADO',
        httpStatus: 422,
        details: { concepto: 'ventasId' },
      });
    });

    it('el cliente NO dicta los totales (B-9): 5 × 6.305 persiste 31.53 aunque el payload diga 999.99', async () => {
      await service.crear(
        TENANT,
        USER,
        inputContado({
          montoTotal: '999.99',
          lineas: [
            {
              itemId: ITEM_CON_CUENTA,
              descripcion: 'Pollo entero',
              cantidad: '5',
              precioUnitario: '6.305',
              subtotal: '999.99',
            },
          ],
        }),
      );

      const data = datosCrearVenta();
      // toString() y no formato: 31.525 half-up → 31.53 (half-even daría 31.52).
      expect((data.lineas[0] as LineaVentaData).subtotal.toString()).toBe('31.53');
      expect(data.montoTotal.toString()).toBe('31.53');
    });

    it('montoTotal = Σ de subtotales YA redondeados: 3 × (1 × 10.005) da 30.03, no 30.02', async () => {
      const linea = {
        itemId: ITEM_CON_CUENTA,
        descripcion: 'Pollo entero',
        cantidad: '1',
        precioUnitario: '10.005',
      };
      await service.crear(TENANT, USER, inputContado({ lineas: [linea, linea, linea] }));

      const data = datosCrearVenta();
      expect(data.lineas.map((l) => l.subtotal.toString())).toEqual(['10.01', '10.01', '10.01']);
      expect(data.montoTotal.toString()).toBe('30.03');
    });
  });

  // ============================================================
  // 4.4 — El asiento y su comprobante (REQ-VTA-01 / REQ-VTA-04)
  // ============================================================

  describe('comprobante generado', () => {
    it('CONTADO: debita la cuenta destino ELEGIDA con el contacto, y NO nombra CxC', async () => {
      await service.crear(TENANT, USER, inputContado());

      expect(cuentasEfectivo.esElegibleComoDestino).toHaveBeenCalledWith(TENANT, CUENTA_CAJA, TX);
      const data = datosComprobante();
      expect(data.lineas[0]).toMatchObject({ cuentaId: CUENTA_CAJA, contactoId: CONTACTO });
      expect(data.lineas[0]?.debitoBob.toString()).toBe('31.53');
      expect(data.lineas.map((l) => l.cuentaId)).not.toContain(CUENTA_CXC);
    });

    it('CONTADO sin cuenta destino → VENTA_CUENTA_DESTINO_NO_ELEGIBLE (422)', async () => {
      const { cuentaDestinoId: _omitida, ...sinDestino } = inputContado();

      await expect(service.crear(TENANT, USER, sinDestino)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
    });

    it('CONTADO con cuenta no elegible → VENTA_CUENTA_DESTINO_NO_ELEGIBLE (422) y nada persiste', async () => {
      cuentasEfectivo.esElegibleComoDestino.mockResolvedValue(false);

      await expect(service.crear(TENANT, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('CREDITO: debita el concepto cuentasPorCobrarId con el contacto (B-1)', async () => {
      repo.crear.mockResolvedValue(
        ventaRow({ condicionPago: 'CREDITO', fechaVencimiento: new Date(Date.UTC(2026, 7, 15)) }),
      );

      await service.crear(TENANT, USER, inputCredito());

      const data = datosComprobante();
      expect(data.lineas[0]).toMatchObject({ cuentaId: CUENTA_CXC, contactoId: CONTACTO });
    });

    it('CREDITO sin cuentasPorCobrarId mapeada → VENTA_CONCEPTO_NO_CONFIGURADO (B-12)', async () => {
      config.obtenerConfig.mockResolvedValue({ cuentasPorCobrarId: null, ventasId: CUENTA_VENTAS });

      await expect(service.crear(TENANT, USER, inputCredito())).rejects.toMatchObject({
        code: 'VENTA_CONCEPTO_NO_CONFIGURADO',
        httpStatus: 422,
        details: { concepto: 'cuentasPorCobrarId' },
      });
    });

    it('venta y comprobante nacen en la MISMA transacción auditada, con upsert por origen (VENTA, venta.id)', async () => {
      await service.crear(TENANT, USER, inputContado());

      expect(auditedTx.run).toHaveBeenCalledTimes(1);
      expect(auditedTx.run).toHaveBeenCalledWith({ userId: USER }, expect.any(Function));
      // El MISMO tx sentinela llega al repo y al writer: escribir fuera de la
      // TX auditada perdería el actor de comprobantes_audit en silencio (§4.3).
      expect(repo.crear).toHaveBeenCalledWith(TENANT, expect.anything(), TX);
      expect(writer.crearBorradorSistema).toHaveBeenCalledWith(expect.anything(), TX);

      const data = datosComprobante();
      expect(data).toMatchObject({
        tenantId: TENANT,
        tipo: 'VENTA',
        origenTipo: 'VENTA',
        origenId: VENTA_ID,
        createdByUserId: USER,
        monedaPrincipal: 'BOB',
      });
    });

    it('Q-2: la glosa del comprobante nombra la operación y el cliente, nunca "Venta #<id>"', async () => {
      await service.crear(TENANT, USER, inputContado());

      const data = datosComprobante();
      expect(data.glosa).toContain(RAZON_SOCIAL);
      expect(data.glosa).toContain('Venta al contado');
      expect(data.glosa).not.toMatch(/^Venta #\S+$/);
    });

    it('las líneas de haber llevan la descripción snapshot como glosaLinea', async () => {
      await service.crear(TENANT, USER, inputContado());

      const data = datosComprobante();
      expect(data.lineas[1]).toMatchObject({
        cuentaId: CUENTA_ITEM,
        glosaLinea: 'Pollo entero',
      });
      expect(data.lineas[1]?.creditoBob.toString()).toBe('31.53');
    });

    it('devuelve la venta creada con el id de su comprobante', async () => {
      const resultado = await service.crear(TENANT, USER, inputContado());

      expect(resultado.comprobanteId).toBe(COMPROBANTE_ID);
      expect((resultado.venta as { id: string }).id).toBe(VENTA_ID);
    });
  });

  // ============================================================
  // 4.4 — Eliminar borrador (REQ-VTA-01)
  // ============================================================

  describe('eliminarBorrador', () => {
    it('borra la venta y su comprobante por el camino de sistema, en la misma TX', async () => {
      await service.eliminarBorrador(TENANT, VENTA_ID, USER);

      expect(repo.eliminar).toHaveBeenCalledWith(TENANT, VENTA_ID, TX);
      expect(writer.eliminarBorradorSistema).toHaveBeenCalledWith(COMPROBANTE_ID, TENANT, TX);
      expect(auditedTx.run).toHaveBeenCalledWith({ userId: USER }, expect.any(Function));
    });

    it('venta inexistente o ajena → VENTA_NO_ENCONTRADA (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.eliminarBorrador(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('venta contabilizada → VENTA_NO_ES_BORRADOR (409): no se borra, se anula', async () => {
      repo.obtenerComprobantesDeVentas.mockResolvedValue(
        new Map([
          [
            VENTA_ID,
            {
              id: COMPROBANTE_ID,
              numero: 'V2607-000001',
              estado: EstadoComprobante.CONTABILIZADO,
              anulado: false,
            },
          ],
        ]),
      );

      await expect(service.eliminarBorrador(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      expect(repo.eliminar).not.toHaveBeenCalled();
      expect(writer.eliminarBorradorSistema).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Helpers de estado del comprobante para 4.5–4.7
  // ============================================================

  function conComprobante(
    over: Partial<{ estado: EstadoComprobante; anulado: boolean; numero: string | null }> = {},
  ) {
    repo.obtenerComprobantesDeVentas.mockResolvedValue(
      new Map([
        [
          VENTA_ID,
          {
            id: COMPROBANTE_ID,
            numero: over.numero ?? 'V2607-000001',
            estado: over.estado ?? EstadoComprobante.CONTABILIZADO,
            anulado: over.anulado ?? false,
          },
        ],
      ]),
    );
  }

  function aplicacion(id: string, cobroId: string, monto: string, createdAt: string) {
    return {
      id,
      cobroId,
      montoAplicado: new Prisma.Decimal(monto),
      createdAt: new Date(createdAt),
    };
  }

  function datosReemplazo() {
    expect(repo.reemplazar).toHaveBeenCalledTimes(1);
    return (repo.reemplazar.mock.calls[0] as unknown[])[2] as {
      contactoId: string;
      fechaContable: Date;
      cuentaDestinoId: string | null;
      montoTotal: Prisma.Decimal;
      lineas: { cuentaIngresoId: string; subtotal: Prisma.Decimal }[];
    };
  }

  function datosRegenerar() {
    expect(writer.regenerarLineasSistema).toHaveBeenCalledTimes(1);
    return (writer.regenerarLineasSistema.mock.calls[0] as unknown[])[0] as {
      tenantId: string;
      comprobanteId: string;
      fechaContable: Date;
      glosa: string;
      lineas: {
        cuentaId: string;
        contactoId: string | null;
        debitoBob: Prisma.Decimal;
        creditoBob: Prisma.Decimal;
      }[];
    };
  }

  // ============================================================
  // 4.4 — cableado de cuentaDestinoId (PA-1, commit 6596b19)
  // ============================================================

  describe('crear — persiste cuentaDestinoId', () => {
    it('CONTADO: la cuenta destino ELEGIDA se persiste en la venta', async () => {
      await service.crear(TENANT, USER, inputContado());

      expect(datosCrearVenta().cuentaDestinoId).toBe(CUENTA_CAJA);
    });

    it('CREDITO: cuentaDestinoId persiste null (su contrapartida es CxC)', async () => {
      await service.crear(TENANT, USER, inputCredito());

      expect(datosCrearVenta().cuentaDestinoId).toBeNull();
    });
  });

  // ============================================================
  // 4.5 — contabilizar (REQ-VTA-05)
  // ============================================================

  describe('contabilizar', () => {
    beforeEach(() => conComprobante({ estado: EstadoComprobante.BORRADOR, numero: null }));

    it('delega en contabilizarSistema dentro de la TX auditada y devuelve el número de la serie V', async () => {
      const resultado = await service.contabilizar(TENANT, VENTA_ID, USER);

      expect(writer.contabilizarSistema).toHaveBeenCalledWith(COMPROBANTE_ID, TENANT, TX);
      expect(auditedTx.run).toHaveBeenCalledWith({ userId: USER }, expect.any(Function));
      expect(resultado).toEqual({ comprobanteId: COMPROBANTE_ID, numero: 'V2607-000001' });
    });

    it('period lock sobre la fechaContable de la VENTA, antes de escribir (REQ-VTA-09)', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
      const fecha = (periodos.obtenerPorFecha.mock.calls[0] as unknown[])[1] as {
        toIso(): string;
      };
      expect(fecha.toIso()).toBe('2026-07-15');
    });

    it('venta inexistente o ajena → VENTA_NO_ENCONTRADA (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('venta anulada → VENTA_ANULADA_NO_EDITABLE (409)', async () => {
      conComprobante({ anulado: true });

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_ANULADA_NO_EDITABLE',
        httpStatus: 409,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('venta ya contabilizada → VENTA_NO_ES_BORRADOR (409)', async () => {
      conComprobante({ estado: EstadoComprobante.CONTABILIZADO });

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('RE-VALIDA el snapshot: cuenta hoy inactiva → VENTA_CUENTA_SNAPSHOT_INACTIVA nombrando la cuenta', async () => {
      cuentas.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_ITEM, cuentaActiva(CUENTA_ITEM, '4.1.2.001', { activa: false })]]),
      );

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_SNAPSHOT_INACTIVA',
        httpStatus: 422,
        details: expect.objectContaining({
          cuentaId: CUENTA_ITEM,
          codigoInterno: '4.1.2.001',
        }),
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('RE-VALIDA el snapshot: cuenta que dejó de ser de detalle → mismo rechazo (§4.1)', async () => {
      cuentas.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_ITEM, cuentaActiva(CUENTA_ITEM, '4.1.2.001', { esDetalle: false })]]),
      );

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_SNAPSHOT_INACTIVA',
        httpStatus: 422,
      });
    });

    it('CONTADO: re-valida la elegibilidad de la cuenta destino persistida (escenario cuenta inactiva)', async () => {
      cuentasEfectivo.esElegibleComoDestino.mockResolvedValue(false);

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
      expect(cuentasEfectivo.esElegibleComoDestino).toHaveBeenCalledWith(TENANT, CUENTA_CAJA, TX);
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('CONTADO sin cuenta destino persistida (dato legado) → VENTA_CUENTA_DESTINO_NO_ELEGIBLE', async () => {
      repo.findById.mockResolvedValue(ventaRow({ cuentaDestinoId: null }));

      await expect(service.contabilizar(TENANT, VENTA_ID, USER)).rejects.toMatchObject({
        code: 'VENTA_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
    });

    it('CREDITO: no consulta elegibilidad de destino (no hay cuenta destino que validar)', async () => {
      repo.findById.mockResolvedValue(
        ventaRow({ condicionPago: 'CREDITO', cuentaDestinoId: null }),
      );

      await service.contabilizar(TENANT, VENTA_ID, USER);

      expect(cuentasEfectivo.esElegibleComoDestino).not.toHaveBeenCalled();
      expect(writer.contabilizarSistema).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // 4.5/4.6 — editar (REQ-VTA-06)
  // ============================================================

  describe('editar', () => {
    beforeEach(() => conComprobante({ estado: EstadoComprobante.CONTABILIZADO }));

    it('reemplaza la venta en bloque y regenera el asiento preservando el comprobante (id y número)', async () => {
      repo.reemplazar.mockResolvedValue(ventaRow({ glosa: 'editada' }));

      const resultado = await service.editar(TENANT, VENTA_ID, USER, inputContado());

      const data = datosReemplazo();
      expect(data.montoTotal.toString()).toBe('31.53');
      expect(data.cuentaDestinoId).toBe(CUENTA_CAJA);
      const regen = datosRegenerar();
      expect(regen.comprobanteId).toBe(COMPROBANTE_ID);
      expect(regen.tenantId).toBe(TENANT);
      // Q-2: la glosa regenerada sigue nombrando operación y cliente.
      expect(regen.glosa).toContain(RAZON_SOCIAL);
      expect(regen.lineas[0]).toMatchObject({ cuentaId: CUENTA_CAJA, contactoId: CONTACTO });
      expect(resultado.comprobanteId).toBe(COMPROBANTE_ID);
      // Contabilizar NO se llama: editar no re-numera (§4.9).
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('D-28: la línea de un ítem que YA estaba en la venta conserva su snapshot de cuenta, aunque el catálogo diga otra cosa', async () => {
      repo.findById.mockResolvedValue(
        ventaRow({ lineas: [lineaVentaRow({ cuentaIngresoId: CUENTA_SNAPSHOT_VIEJA })] }),
      );
      cuentas.obtenerBatch.mockResolvedValue(
        new Map([[CUENTA_SNAPSHOT_VIEJA, cuentaActiva(CUENTA_SNAPSHOT_VIEJA, '4.9.9.001')]]),
      );
      repo.reemplazar.mockResolvedValue(ventaRow());

      await service.editar(
        TENANT,
        VENTA_ID,
        USER,
        inputContado({
          lineas: [
            {
              itemId: ITEM_CON_CUENTA,
              descripcion: 'Pollo entero',
              cantidad: '2',
              precioUnitario: '400',
            },
          ],
        }),
      );

      // El catálogo vigente diría CUENTA_ITEM; la regeneración lee el snapshot.
      expect(datosReemplazo().lineas[0]?.cuentaIngresoId).toBe(CUENTA_SNAPSHOT_VIEJA);
      const regen = datosRegenerar();
      expect(regen.lineas.map((l) => l.cuentaId)).toContain(CUENTA_SNAPSHOT_VIEJA);
      expect(regen.lineas.map((l) => l.cuentaId)).not.toContain(CUENTA_ITEM);
    });

    it('una línea de un ítem NUEVO resuelve su cuenta del catálogo vigente (se crea recién ahora)', async () => {
      repo.findById.mockResolvedValue(
        ventaRow({ lineas: [lineaVentaRow({ cuentaIngresoId: CUENTA_SNAPSHOT_VIEJA })] }),
      );
      cuentas.obtenerBatch.mockResolvedValue(
        new Map([
          [CUENTA_SNAPSHOT_VIEJA, cuentaActiva(CUENTA_SNAPSHOT_VIEJA, '4.9.9.001')],
          [CUENTA_VENTAS, cuentaActiva(CUENTA_VENTAS, '4.1.1.001')],
        ]),
      );
      repo.reemplazar.mockResolvedValue(ventaRow());

      await service.editar(
        TENANT,
        VENTA_ID,
        USER,
        inputContado({
          lineas: [
            {
              itemId: ITEM_CON_CUENTA,
              descripcion: 'Pollo entero',
              cantidad: '5',
              precioUnitario: '6.305',
            },
            { itemId: ITEM_SIN_CUENTA, descripcion: 'Flete', cantidad: '1', precioUnitario: '50' },
          ],
        }),
      );

      const lineas = datosReemplazo().lineas;
      expect(lineas[0]?.cuentaIngresoId).toBe(CUENTA_SNAPSHOT_VIEJA);
      expect(lineas[1]?.cuentaIngresoId).toBe(CUENTA_VENTAS);
    });

    it('period lock sobre la fecha de ORIGEN: la venta vive en un período cerrado → rechaza (REQ-VTA-09)', async () => {
      periodos.obtenerPorFecha.mockImplementation((_t: string, fecha: { toIso(): string }) =>
        Promise.resolve(
          fecha.toIso().startsWith('2026-06')
            ? { id: 'periodo-2606', status: PeriodoFiscalStatus.CERRADO }
            : { id: PERIODO, status: PeriodoFiscalStatus.ABIERTO },
        ),
      );
      repo.findById.mockResolvedValue(ventaRow({ fechaContable: new Date(Date.UTC(2026, 5, 15)) }));

      await expect(
        service.editar(TENANT, VENTA_ID, USER, inputContado({ fechaContable: '2026-07-15' })),
      ).rejects.toMatchObject({ code: 'VENTA_PERIODO_NO_ABIERTO', httpStatus: 409 });
      expect(repo.reemplazar).not.toHaveBeenCalled();
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
    });

    it('period lock sobre la fecha DESTINO: mover la venta a un mes cerrado → rechaza (REQ-VTA-09)', async () => {
      periodos.obtenerPorFecha.mockImplementation((_t: string, fecha: { toIso(): string }) =>
        Promise.resolve(
          fecha.toIso().startsWith('2026-06')
            ? { id: 'periodo-2606', status: PeriodoFiscalStatus.CERRADO }
            : { id: PERIODO, status: PeriodoFiscalStatus.ABIERTO },
        ),
      );

      await expect(
        service.editar(TENANT, VENTA_ID, USER, inputContado({ fechaContable: '2026-06-15' })),
      ).rejects.toMatchObject({ code: 'VENTA_PERIODO_NO_ABIERTO', httpStatus: 409 });
      expect(repo.reemplazar).not.toHaveBeenCalled();
    });

    it('venta anulada → VENTA_ANULADA_NO_EDITABLE (409) sin escribir nada (§4.7)', async () => {
      conComprobante({ anulado: true });

      await expect(service.editar(TENANT, VENTA_ID, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_ANULADA_NO_EDITABLE',
        httpStatus: 409,
      });
      expect(repo.reemplazar).not.toHaveBeenCalled();
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });

    it('venta inexistente o ajena → VENTA_NO_ENCONTRADA (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.editar(TENANT, VENTA_ID, USER, inputContado())).rejects.toMatchObject({
        code: 'VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
    });

    describe('matriz del monto (REQ-VTA-06, D-21)', () => {
      beforeEach(() => {
        repo.findById.mockResolvedValue(ventaRow({ montoTotal: new Prisma.Decimal('1000.00') }));
        repo.reemplazar.mockResolvedValue(ventaRow());
      });

      function inputConMonto(cantidad: string, precio: string) {
        return inputContado({
          lineas: [
            {
              itemId: ITEM_CON_CUENTA,
              descripcion: 'Pollo entero',
              cantidad,
              precioUnitario: precio,
            },
          ],
        });
      }

      it('bajar el monto sin perforar lo cobrado NO toca ninguna aplicación', async () => {
        repo.listarAplicaciones.mockResolvedValue([
          aplicacion('app-2', 'cobro-2', '500.00', '2026-07-22T10:00:00Z'),
          aplicacion('app-1', 'cobro-1', '300.00', '2026-07-21T10:00:00Z'),
        ]);

        await service.editar(TENANT, VENTA_ID, USER, inputConMonto('1', '800'));

        expect(repo.actualizarMontoAplicacion).not.toHaveBeenCalled();
        expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
        expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
      });

      it('escenario de la spec: bajar a 800 con dos cobros de 500 recorta SOLO el más reciente a 300', async () => {
        repo.listarAplicaciones.mockResolvedValue([
          aplicacion('app-2', 'cobro-2', '500.00', '2026-07-22T10:00:00Z'),
          aplicacion('app-1', 'cobro-1', '500.00', '2026-07-21T10:00:00Z'),
        ]);

        await service.editar(TENANT, VENTA_ID, USER, inputConMonto('1', '800'));

        expect(repo.actualizarMontoAplicacion).toHaveBeenCalledTimes(1);
        const [, aplicacionId, monto] = repo.actualizarMontoAplicacion.mock
          .calls[0] as unknown[] as [string, string, Prisma.Decimal];
        expect(aplicacionId).toBe('app-2');
        expect(monto.toString()).toBe('300');
        expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
      });

      it('la CASCADA atraviesa aplicaciones: bajar a 300 elimina la más reciente (con rastro) y recorta la anterior', async () => {
        repo.listarAplicaciones.mockResolvedValue([
          aplicacion('app-2', 'cobro-2', '500.00', '2026-07-22T10:00:00Z'),
          aplicacion('app-1', 'cobro-1', '500.00', '2026-07-21T10:00:00Z'),
        ]);

        await service.editar(TENANT, VENTA_ID, USER, inputConMonto('1', '300'));

        // LIFO, no FIFO: cae app-2 (la más reciente) y app-1 queda en 300.
        expect(repo.eliminarAplicaciones).toHaveBeenCalledWith(TENANT, ['app-2'], TX);
        const [, aplicacionId, monto] = repo.actualizarMontoAplicacion.mock
          .calls[0] as unknown[] as [string, string, Prisma.Decimal];
        expect(aplicacionId).toBe('app-1');
        expect(monto.toString()).toBe('300');
        // B-14: la eliminada deja rastro append-only.
        expect(repo.registrarAplicacionesDesvinculadas).toHaveBeenCalledWith(
          TENANT,
          [
            expect.objectContaining({
              cobroId: 'cobro-2',
              ventaId: VENTA_ID,
              userId: USER,
            }),
          ],
          TX,
        );
      });
    });

    describe('cambio de contacto (REQ-VTA-06, matriz fila 6)', () => {
      beforeEach(() => {
        repo.findById.mockResolvedValue(ventaRow({ montoTotal: new Prisma.Decimal('1000.00') }));
        repo.reemplazar.mockResolvedValue(ventaRow({ contactoId: CONTACTO_2 }));
        repo.listarAplicaciones.mockResolvedValue([
          aplicacion('app-2', 'cobro-2', '500.00', '2026-07-22T10:00:00Z'),
          aplicacion('app-1', 'cobro-1', '500.00', '2026-07-21T10:00:00Z'),
        ]);
      });

      it('desvincula TODAS las aplicaciones y registra cada una en el rastro', async () => {
        await service.editar(TENANT, VENTA_ID, USER, inputContado({ contactoId: CONTACTO_2 }));

        // TODAS, no solo la primera: un cobro del cliente A no puede quedar
        // aplicado a una venta que ahora es del cliente B.
        expect(repo.eliminarAplicaciones).toHaveBeenCalledWith(TENANT, ['app-2', 'app-1'], TX);
        expect(repo.registrarAplicacionesDesvinculadas).toHaveBeenCalledTimes(1);
        const filas = (repo.registrarAplicacionesDesvinculadas.mock.calls[0] as unknown[])[1] as {
          cobroId: string;
          ventaId: string;
          montoAplicado: Prisma.Decimal;
          motivo: string;
          userId: string;
        }[];
        expect(filas).toHaveLength(2);
        expect(filas.map((f) => f.cobroId)).toEqual(['cobro-2', 'cobro-1']);
        expect(filas.map((f) => f.montoAplicado.toString())).toEqual(['500', '500']);
        filas.forEach((f) => {
          expect(f.ventaId).toBe(VENTA_ID);
          expect(f.userId).toBe(USER);
          expect(f.motivo.length).toBeGreaterThan(0);
        });
        // No hay recorte además de la desvinculación: ya no queda nada aplicado.
        expect(repo.actualizarMontoAplicacion).not.toHaveBeenCalled();
      });

      it('mantener el contacto NO desvincula nada', async () => {
        await service.editar(TENANT, VENTA_ID, USER, inputConMonto1000());

        expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
        expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
      });

      function inputConMonto1000() {
        return inputContado({
          lineas: [
            {
              itemId: ITEM_CON_CUENTA,
              descripcion: 'Pollo entero',
              cantidad: '1',
              precioUnitario: '1000',
            },
          ],
        });
      }
    });
  });

  // ============================================================
  // 4.7 — anular (REQ-VTA-07, §4.7)
  // ============================================================

  describe('anular', () => {
    const MOTIVO = 'mercadería devuelta por el cliente';

    beforeEach(() => {
      conComprobante({ estado: EstadoComprobante.CONTABILIZADO });
      repo.listarAplicaciones.mockResolvedValue([
        aplicacion('app-2', 'cobro-2', '2500.00', '2026-07-22T10:00:00Z'),
        aplicacion('app-1', 'cobro-1', '2000.00', '2026-07-21T10:00:00Z'),
      ]);
    });

    it('anula por el camino de sistema y desvincula TODAS las aplicaciones con rastro (B-14)', async () => {
      await service.anular(TENANT, VENTA_ID, USER, MOTIVO);

      expect(writer.anularSistema).toHaveBeenCalledWith(
        {
          tenantId: TENANT,
          comprobanteId: COMPROBANTE_ID,
          motivo: MOTIVO,
          anuladoPorUserId: USER,
        },
        TX,
      );
      expect(repo.eliminarAplicaciones).toHaveBeenCalledWith(TENANT, ['app-2', 'app-1'], TX);
      const filas = (repo.registrarAplicacionesDesvinculadas.mock.calls[0] as unknown[])[1] as {
        cobroId: string;
        montoAplicado: Prisma.Decimal;
        motivo: string;
        userId: string;
      }[];
      expect(filas).toHaveLength(2);
      expect(filas.map((f) => f.cobroId)).toEqual(['cobro-2', 'cobro-1']);
      // El rastro nombra la anulación y arrastra su motivo.
      filas.forEach((f) => {
        expect(f.motivo).toContain(MOTIVO);
        expect(f.userId).toBe(USER);
      });
    });

    it('el writer valida el motivo ANTES de que se toque ninguna aplicación (§4.7: ≥10 caracteres)', async () => {
      writer.anularSistema.mockRejectedValue(
        Object.assign(new Error('motivo corto'), {
          code: 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO',
          httpStatus: 422,
        }),
      );

      await expect(service.anular(TENANT, VENTA_ID, USER, 'corto')).rejects.toMatchObject({
        code: 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO',
      });
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
      expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
    });

    it('venta ya anulada → VENTA_ANULADA_NO_EDITABLE (409) y nada se toca', async () => {
      conComprobante({ anulado: true });

      await expect(service.anular(TENANT, VENTA_ID, USER, MOTIVO)).rejects.toMatchObject({
        code: 'VENTA_ANULADA_NO_EDITABLE',
        httpStatus: 409,
      });
      expect(writer.anularSistema).not.toHaveBeenCalled();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });

    it('venta inexistente o ajena → VENTA_NO_ENCONTRADA (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.anular(TENANT, VENTA_ID, USER, MOTIVO)).rejects.toMatchObject({
        code: 'VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
    });

    it('período CERRADO → VENTA_PERIODO_NO_ABIERTO: anular exige reapertura formal (REQ-VTA-09)', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.anular(TENANT, VENTA_ID, USER, MOTIVO)).rejects.toMatchObject({
        code: 'VENTA_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      expect(writer.anularSistema).not.toHaveBeenCalled();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });
  });
});
