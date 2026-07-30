import { CondicionPago, EstadoComprobante, PeriodoFiscalStatus, Prisma } from '@prisma/client';

import type { AuditedTransactionRunner } from '@/common/audited-transaction.runner';
import { Money } from '@/common/domain/money';
import type { ComprobanteSistemaWriterPort } from '@/comprobantes/ports/comprobante-sistema-writer.port';
import type { ContactosReaderPort } from '@/contactos/ports/contactos-reader.port';
import type { CuentasEfectivoReaderPort } from '@/cuentas/ports/cuentas-efectivo-reader.port';
import type { PeriodosReaderPort } from '@/periodos-fiscales/ports/periodos-reader.port';

import { type CrearCobroInput, CobrosService } from './cobros.service';
import type { CarteraReaderPort, VentaCarteraRow } from './ports/cartera-reader.port';
import type {
  CobroCreateData,
  CobroRepositoryPort,
  SumasAplicadasConLock,
} from './ports/cobro.repository.port';
import type { CobrosConfigReaderPort } from './ports/cobros-config-reader.port';

const TENANT = 'org-a';
const USER = 'user-1';
const CONTACTO = 'contacto-1';
const CONTACTO_2 = 'contacto-2';
const CUENTA_CAJA = 'cuenta-caja';
const CUENTA_CXC = 'cuenta-concepto-cxc';
const PERIODO = 'periodo-2607';
const COBRO_ID = 'cobro-1';
const VENTA_ID = 'venta-1';
const COMPROBANTE_ID = 'comp-cobro-1';
const COMPROBANTE_VENTA_ID = 'comp-venta-1';
const APLICACION_ID = 'app-1';
const RAZON_SOCIAL = 'Avícola Sur';

/** Sentinela: probar que TODO corre dentro del MISMO tx que abre el runner. */
const TX = { __tx: 'auditada' } as unknown as Prisma.TransactionClient;

function cobroRow(over: Record<string, unknown> = {}) {
  return {
    id: COBRO_ID,
    organizationId: TENANT,
    contactoId: CONTACTO,
    fechaContable: new Date(Date.UTC(2026, 6, 15)),
    monto: new Prisma.Decimal('1250.57'),
    cuentaDestinoId: CUENTA_CAJA,
    glosa: 'pago parcial de la factura 12',
    createdAt: new Date(),
    createdByUserId: USER,
    updatedAt: new Date(),
    ...over,
  } as never;
}

function comprobanteDeCobro(
  over: Partial<{ estado: EstadoComprobante; anulado: boolean; numero: string | null }> = {},
) {
  return {
    id: COMPROBANTE_ID,
    numero: over.numero ?? null,
    estado: over.estado ?? EstadoComprobante.BORRADOR,
    anulado: over.anulado ?? false,
  };
}

function comprobanteDeVenta(over: Partial<{ estado: EstadoComprobante; anulado: boolean }> = {}) {
  return {
    id: COMPROBANTE_VENTA_ID,
    numero: 'V2607-000001',
    estado: over.estado ?? EstadoComprobante.CONTABILIZADO,
    anulado: over.anulado ?? false,
  };
}

function ventaCartera(over: Partial<VentaCarteraRow> = {}): VentaCarteraRow {
  return {
    ventaId: VENTA_ID,
    fechaContable: new Date(Date.UTC(2026, 6, 10)),
    fechaVencimiento: new Date(Date.UTC(2026, 7, 10)),
    createdAt: new Date('2026-07-10T10:00:00Z'),
    montoTotal: Money.of('1000.00'),
    totalAplicado: Money.ZERO,
    ...over,
  };
}

function sumasConLock(over: Partial<SumasAplicadasConLock> = {}): SumasAplicadasConLock {
  return {
    cobro: { id: COBRO_ID, contactoId: CONTACTO, monto: new Prisma.Decimal('1250.57') },
    venta: {
      id: VENTA_ID,
      contactoId: CONTACTO,
      montoTotal: new Prisma.Decimal('1000.00'),
      condicionPago: CondicionPago.CREDITO,
    },
    aplicadoAlCobro: new Prisma.Decimal('0'),
    aplicadoALaVenta: new Prisma.Decimal('0'),
    ...over,
  };
}

describe('CobrosService', () => {
  let repo: { [K in keyof CobroRepositoryPort]: jest.Mock };
  let writer: { [K in keyof ComprobanteSistemaWriterPort]: jest.Mock };
  let contactos: { obtenerBatch: jest.Mock };
  let cuentasEfectivo: { esElegibleComoDestino: jest.Mock };
  let periodos: { [K in keyof PeriodosReaderPort]: jest.Mock };
  let config: { obtenerConfig: jest.Mock };
  let cartera: { [K in keyof CarteraReaderPort]: jest.Mock };
  let auditedTx: { run: jest.Mock };
  let service: CobrosService;

  beforeEach(() => {
    repo = {
      crear: jest.fn().mockResolvedValue(cobroRow()),
      actualizar: jest.fn(),
      eliminar: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(cobroRow()),
      listar: jest.fn(),
      obtenerComprobantesDeCobros: jest
        .fn()
        .mockResolvedValue(new Map([[COBRO_ID, comprobanteDeCobro()]])),
      obtenerComprobantesDeVentas: jest
        .fn()
        .mockResolvedValue(new Map([[VENTA_ID, comprobanteDeVenta()]])),
      listarAplicacionesDeCobro: jest.fn().mockResolvedValue([]),
      crearAplicacion: jest.fn().mockResolvedValue({
        id: APLICACION_ID,
        organizationId: TENANT,
        cobroId: COBRO_ID,
        ventaId: VENTA_ID,
        montoAplicado: new Prisma.Decimal('300.00'),
        createdAt: new Date(),
        createdByUserId: USER,
        updatedAt: new Date(),
      }),
      actualizarMontoAplicacion: jest.fn().mockResolvedValue(undefined),
      eliminarAplicaciones: jest.fn().mockResolvedValue(undefined),
      registrarAplicacionesDesvinculadas: jest.fn().mockResolvedValue(undefined),
      obtenerSumasAplicadasConLock: jest.fn().mockResolvedValue(sumasConLock()),
      obtenerCobroConAplicadoConLock: jest.fn().mockResolvedValue({
        id: COBRO_ID,
        contactoId: CONTACTO,
        monto: new Prisma.Decimal('1250.57'),
        aplicadoAlCobro: new Prisma.Decimal('0'),
      }),
    };
    writer = {
      crearBorradorSistema: jest.fn().mockResolvedValue({ id: COMPROBANTE_ID }),
      regenerarLineasSistema: jest.fn().mockResolvedValue(undefined),
      contabilizarSistema: jest.fn().mockResolvedValue({ numero: 'I2607-000001' }),
      anularSistema: jest.fn().mockResolvedValue(undefined),
      eliminarBorradorSistema: jest.fn().mockResolvedValue(undefined),
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
    periodos = {
      obtenerPorFecha: jest
        .fn()
        .mockResolvedValue({ id: PERIODO, status: PeriodoFiscalStatus.ABIERTO }),
      obtenerRangoFechas: jest.fn(),
      obtenerReaperturaActiva: jest.fn(),
      obtenerRangoGestionPorFecha: jest.fn(),
      obtenerRangoGestion: jest.fn(),
    };
    config = { obtenerConfig: jest.fn().mockResolvedValue({ cuentasPorCobrarId: CUENTA_CXC }) };
    cartera = {
      listarVentasDeCartera: jest.fn().mockResolvedValue([ventaCartera()]),
      listarCobrosDeContacto: jest.fn().mockResolvedValue([]),
      obtenerRazonSocialContacto: jest.fn().mockResolvedValue(RAZON_SOCIAL),
    };
    auditedTx = {
      run: jest.fn(async (_opts: unknown, fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        fn(TX),
      ),
    };

    service = new CobrosService(
      repo as unknown as CobroRepositoryPort,
      writer as unknown as ComprobanteSistemaWriterPort,
      contactos as unknown as ContactosReaderPort,
      cuentasEfectivo as unknown as CuentasEfectivoReaderPort,
      periodos as unknown as PeriodosReaderPort,
      config as unknown as CobrosConfigReaderPort,
      cartera as unknown as CarteraReaderPort,
      auditedTx as unknown as AuditedTransactionRunner,
    );
  });

  function inputCobro(over: Partial<CrearCobroInput> = {}): CrearCobroInput {
    return {
      contactoId: CONTACTO,
      fechaContable: '2026-07-15',
      monto: '1250.57',
      cuentaDestinoId: CUENTA_CAJA,
      glosa: 'pago parcial de la factura 12',
      ...over,
    };
  }

  function datosCrearCobro(): CobroCreateData {
    expect(repo.crear).toHaveBeenCalledTimes(1);
    return (repo.crear.mock.calls[0] as unknown[])[1] as CobroCreateData;
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
      }[];
    };
  }

  function conComprobanteCobro(
    over: Partial<{ estado: EstadoComprobante; anulado: boolean; numero: string | null }> = {},
  ) {
    repo.obtenerComprobantesDeCobros.mockResolvedValue(
      new Map([[COBRO_ID, comprobanteDeCobro(over)]]),
    );
  }

  // ============================================================
  // 5.8 — Period lock (REQ-CXC-09, §4.4)
  // ============================================================

  describe('period lock (REQ-CXC-09)', () => {
    it('sin período para la fecha → COBRO_GESTION_NO_ABIERTA (422) y NO escribe nada', async () => {
      periodos.obtenerPorFecha.mockResolvedValue(null);

      await expect(service.crear(TENANT, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_GESTION_NO_ABIERTA',
        httpStatus: 422,
      });
      expect(repo.crear).not.toHaveBeenCalled();
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('período CERRADO → COBRO_PERIODO_NO_ABIERTO (409) indicando la reapertura, sin bypass', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      const rechazo = service.crear(TENANT, USER, inputCobro());
      await expect(rechazo).rejects.toMatchObject({
        code: 'COBRO_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      await rechazo.catch((err: Error) => {
        expect(err.message).toContain('reabrir');
      });
      expect(repo.crear).not.toHaveBeenCalled();
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('el lock corre DENTRO de la transacción auditada, sobre la fechaContable del cobro', async () => {
      await service.crear(TENANT, USER, inputCobro());

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

    it('contabilizar con período CERRADO → COBRO_PERIODO_NO_ABIERTO y no contabiliza', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.contabilizar(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('las APLICACIONES quedan EXENTAS del lock: crear/editar/eliminar nunca consultan el período (REQ-CXC-03)', async () => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });
      repo.listarAplicacionesDeCobro.mockResolvedValue([
        {
          id: APLICACION_ID,
          ventaId: VENTA_ID,
          montoAplicado: new Prisma.Decimal('300.00'),
          createdAt: new Date(),
        },
      ]);

      await service.crearAplicacion(TENANT, USER, {
        cobroId: COBRO_ID,
        ventaId: VENTA_ID,
        montoAplicado: '100.00',
      });
      await service.editarMontoAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER, '200.00');
      await service.eliminarAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER);

      expect(periodos.obtenerPorFecha).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5.3 — Alta del cobro con su asiento (REQ-CXC-02)
  // ============================================================

  describe('crear', () => {
    it('cobro y comprobante INGRESO nacen en la MISMA transacción auditada, con origen (COBRO, cobro.id)', async () => {
      await service.crear(TENANT, USER, inputCobro());

      expect(auditedTx.run).toHaveBeenCalledTimes(1);
      expect(auditedTx.run).toHaveBeenCalledWith({ userId: USER }, expect.any(Function));
      expect(repo.crear).toHaveBeenCalledWith(TENANT, expect.anything(), TX);
      expect(writer.crearBorradorSistema).toHaveBeenCalledWith(expect.anything(), TX);

      const data = datosComprobante();
      expect(data).toMatchObject({
        tenantId: TENANT,
        // D-11: serie I existente, SIN tipo nuevo. El listado distingue el
        // cobro por origenTipo, nunca por el tipo del comprobante.
        tipo: 'INGRESO',
        origenTipo: 'COBRO',
        origenId: COBRO_ID,
        createdByUserId: USER,
        monedaPrincipal: 'BOB',
      });
    });

    it('el asiento es SIEMPRE Debe destino / Haber CxC, ambas líneas con el contacto (B-1)', async () => {
      await service.crear(TENANT, USER, inputCobro());

      const data = datosComprobante();
      expect(data.lineas).toHaveLength(2);
      expect(data.lineas[0]).toMatchObject({ cuentaId: CUENTA_CAJA, contactoId: CONTACTO });
      expect(data.lineas[0]?.debitoBob.toString()).toBe('1250.57');
      expect(data.lineas[1]).toMatchObject({ cuentaId: CUENTA_CXC, contactoId: CONTACTO });
      expect(data.lineas[1]?.creditoBob.toString()).toBe('1250.57');
    });

    it('Q-2: la glosa del comprobante nombra la operación y el cliente, nunca "Cobro #<id>"', async () => {
      await service.crear(TENANT, USER, inputCobro());

      const data = datosComprobante();
      expect(data.glosa).toContain(RAZON_SOCIAL);
      expect(data.glosa).toContain('Cobro a');
      expect(data.glosa).not.toMatch(/^Cobro #\S+$/);
    });

    it('el monto se persiste redondeado a 2 decimales HALF-UP, y el asiento usa el MISMO monto', async () => {
      await service.crear(TENANT, USER, inputCobro({ monto: '10.005' }));

      // Redondeo EXPLÍCITO en dominio (Money.redondearABob), no delegado a
      // Postgres al insertar (Anti-04 en su peor forma).
      expect(datosCrearCobro().monto.toString()).toBe('10.01');
      const data = datosComprobante();
      expect(data.lineas[0]?.debitoBob.toString()).toBe('10.01');
    });

    it('cuenta destino no elegible → COBRO_CUENTA_DESTINO_NO_ELEGIBLE (422) y nada persiste', async () => {
      cuentasEfectivo.esElegibleComoDestino.mockResolvedValue(false);

      await expect(service.crear(TENANT, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
      expect(cuentasEfectivo.esElegibleComoDestino).toHaveBeenCalledWith(TENANT, CUENTA_CAJA, TX);
      expect(repo.crear).not.toHaveBeenCalled();
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('cuentasPorCobrarId sin mapear → COBRO_CONCEPTO_NO_CONFIGURADO (422, B-12)', async () => {
      config.obtenerConfig.mockResolvedValue({ cuentasPorCobrarId: null });

      await expect(service.crear(TENANT, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_CONCEPTO_NO_CONFIGURADO',
        httpStatus: 422,
        details: { concepto: 'cuentasPorCobrarId' },
      });
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('contacto inexistente o de otro tenant → COBRO_CONTACTO_NO_ENCONTRADO (404)', async () => {
      contactos.obtenerBatch.mockResolvedValue(new Map());

      await expect(service.crear(TENANT, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_CONTACTO_NO_ENCONTRADO',
        httpStatus: 404,
      });
      expect(repo.crear).not.toHaveBeenCalled();
    });

    it('contacto inactivo → COBRO_CONTACTO_INACTIVO (422)', async () => {
      contactos.obtenerBatch.mockResolvedValue(
        new Map([[CONTACTO, { id: CONTACTO, activo: false }]]),
      );

      await expect(service.crear(TENANT, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_CONTACTO_INACTIVO',
        httpStatus: 422,
      });
    });

    it('monto 0 → COBRO_ASIENTO_SIN_MONTO (422) y nada persiste (§4.1)', async () => {
      await expect(
        service.crear(TENANT, USER, inputCobro({ monto: '0.00' })),
      ).rejects.toMatchObject({ code: 'COBRO_ASIENTO_SIN_MONTO', httpStatus: 422 });
      expect(repo.crear).not.toHaveBeenCalled();
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
    });

    it('devuelve el cobro creado con el id de su comprobante', async () => {
      const resultado = await service.crear(TENANT, USER, inputCobro());

      expect(resultado.comprobanteId).toBe(COMPROBANTE_ID);
      expect((resultado.cobro as { id: string }).id).toBe(COBRO_ID);
    });
  });

  // ============================================================
  // 5.3 — contabilizar
  // ============================================================

  describe('contabilizar', () => {
    it('delega en contabilizarSistema dentro de la TX auditada y devuelve el número de la serie I', async () => {
      const resultado = await service.contabilizar(TENANT, COBRO_ID, USER);

      expect(writer.contabilizarSistema).toHaveBeenCalledWith(COMPROBANTE_ID, TENANT, TX);
      expect(auditedTx.run).toHaveBeenCalledWith({ userId: USER }, expect.any(Function));
      expect(resultado).toEqual({ comprobanteId: COMPROBANTE_ID, numero: 'I2607-000001' });
    });

    it('cobro inexistente o ajeno → COBRO_NO_ENCONTRADO (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.contabilizar(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('cobro sin comprobante (dato roto) → el mismo 404, no revela nada más (§4.2)', async () => {
      repo.obtenerComprobantesDeCobros.mockResolvedValue(new Map());

      await expect(service.contabilizar(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
    });

    it('cobro anulado → COBRO_ANULADO_NO_EDITABLE (409)', async () => {
      conComprobanteCobro({ anulado: true });

      await expect(service.contabilizar(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_ANULADO_NO_EDITABLE',
        httpStatus: 409,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('cobro ya contabilizado → COBRO_NO_ES_BORRADOR (409)', async () => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });

      await expect(service.contabilizar(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });

    it('RE-VALIDA la elegibilidad de la cuenta destino: configuración almacenada pudo cambiar', async () => {
      cuentasEfectivo.esElegibleComoDestino.mockResolvedValue(false);

      await expect(service.contabilizar(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
      expect(cuentasEfectivo.esElegibleComoDestino).toHaveBeenCalledWith(TENANT, CUENTA_CAJA, TX);
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5.3 — eliminarBorrador
  // ============================================================

  describe('eliminarBorrador', () => {
    it('borra el cobro y su comprobante por el camino de sistema, en la misma TX', async () => {
      await service.eliminarBorrador(TENANT, COBRO_ID, USER);

      expect(repo.eliminar).toHaveBeenCalledWith(TENANT, COBRO_ID, TX);
      expect(writer.eliminarBorradorSistema).toHaveBeenCalledWith(COMPROBANTE_ID, TENANT, TX);
      expect(auditedTx.run).toHaveBeenCalledWith({ userId: USER }, expect.any(Function));
    });

    it('cobro inexistente o ajeno → COBRO_NO_ENCONTRADO (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.eliminarBorrador(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
      expect(repo.eliminar).not.toHaveBeenCalled();
    });

    it('cobro contabilizado → COBRO_NO_ES_BORRADOR (409): no se borra, se anula (§4.7)', async () => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });

      await expect(service.eliminarBorrador(TENANT, COBRO_ID, USER)).rejects.toMatchObject({
        code: 'COBRO_NO_ES_BORRADOR',
        httpStatus: 409,
      });
      expect(repo.eliminar).not.toHaveBeenCalled();
      expect(writer.eliminarBorradorSistema).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5.4 — Aplicaciones (REQ-CXC-03/04/08)
  // ============================================================

  describe('crearAplicacion', () => {
    beforeEach(() => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });
    });

    function inputAplicacion(montoAplicado = '300.00') {
      return { cobroId: COBRO_ID, ventaId: VENTA_ID, montoAplicado };
    }

    it('crea el vínculo SIN tocar ningún comprobante (D-03) y devuelve la fila', async () => {
      const creada = await service.crearAplicacion(TENANT, USER, inputAplicacion());

      expect(creada.id).toBe(APLICACION_ID);
      expect(repo.crearAplicacion).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ cobroId: COBRO_ID, ventaId: VENTA_ID, createdByUserId: USER }),
        TX,
      );
      const monto = (repo.crearAplicacion.mock.calls[0] as unknown[])[1] as {
        montoAplicado: Prisma.Decimal;
      };
      expect(monto.montoAplicado.toString()).toBe('300');
      // Criterio de éxito 4 del change: cero escrituras de comprobantes.
      expect(writer.crearBorradorSistema).not.toHaveBeenCalled();
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
      expect(writer.contabilizarSistema).not.toHaveBeenCalled();
      expect(writer.anularSistema).not.toHaveBeenCalled();
      expect(writer.eliminarBorradorSistema).not.toHaveBeenCalled();
    });

    it('puntas de contactos distintos → APLICACION_CONTACTO_DISTINTO (422) y nada se escribe', async () => {
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(
        sumasConLock({
          venta: {
            id: VENTA_ID,
            contactoId: CONTACTO_2,
            montoTotal: new Prisma.Decimal('1000'),
            condicionPago: CondicionPago.CREDITO,
          },
        }),
      );

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_CONTACTO_DISTINTO',
        httpStatus: 422,
      });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('venta inexistente o ajena → 404 APLICACION_VENTA_NO_ENCONTRADA, nunca 403 ni 422 (REQ-CXC-08)', async () => {
      cartera.listarVentasDeCartera.mockResolvedValue([]);
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(null);

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('cobro inexistente o ajeno → COBRO_NO_ENCONTRADO (404) sin abrir la TX', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
      expect(auditedTx.run).not.toHaveBeenCalled();
    });

    it('monto no positivo → APLICACION_MONTO_NO_POSITIVO (422) sin ningún I/O', async () => {
      await expect(
        service.crearAplicacion(TENANT, USER, inputAplicacion('0.00')),
      ).rejects.toMatchObject({ code: 'APLICACION_MONTO_NO_POSITIVO', httpStatus: 422 });
      expect(repo.findById).not.toHaveBeenCalled();
      expect(auditedTx.run).not.toHaveBeenCalled();
    });

    it('pre-TX (fail fast): el exceso visible sin lock rechaza ANTES de abrir la transacción', async () => {
      // El cobro (1250.57) ya tiene 1200 aplicados según la lectura sin lock.
      repo.listarAplicacionesDeCobro.mockResolvedValue([
        {
          id: 'app-previa',
          ventaId: 'venta-9',
          montoAplicado: new Prisma.Decimal('1200.00'),
          createdAt: new Date(),
        },
      ]);

      await expect(
        service.crearAplicacion(TENANT, USER, inputAplicacion('100.00')),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_COBRO', httpStatus: 422 });
      expect(auditedTx.run).not.toHaveBeenCalled();
      expect(repo.obtenerSumasAplicadasConLock).not.toHaveBeenCalled();
    });

    it('intra-TX (autoritativa): el SUM() bajo lock decide aunque la pre-TX haya pasado (REQ-CXC-04)', async () => {
      // Pre-TX ve el cobro libre; bajo lock, otra TX ya aplicó 1200.
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(
        sumasConLock({ aplicadoAlCobro: new Prisma.Decimal('1200.00') }),
      );

      await expect(
        service.crearAplicacion(TENANT, USER, inputAplicacion('100.00')),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_COBRO', httpStatus: 422 });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('exceder la venta bajo lock → APLICACION_EXCEDE_VENTA (422)', async () => {
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(
        sumasConLock({ aplicadoALaVenta: new Prisma.Decimal('950.00') }),
      );

      await expect(
        service.crearAplicacion(TENANT, USER, inputAplicacion('100.00')),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_VENTA', httpStatus: 422 });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('cobro en BORRADOR → APLICACION_PUNTA_NO_CONTABILIZADA (422): un borrador no movió plata', async () => {
      conComprobanteCobro({ estado: EstadoComprobante.BORRADOR });

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_PUNTA_NO_CONTABILIZADA',
        httpStatus: 422,
        details: expect.objectContaining({ punta: 'cobro', estado: 'BORRADOR' }),
      });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('cobro anulado → APLICACION_PUNTA_NO_CONTABILIZADA (422)', async () => {
      conComprobanteCobro({
        estado: EstadoComprobante.CONTABILIZADO,
        numero: 'I2607-000001',
        anulado: true,
      });

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_PUNTA_NO_CONTABILIZADA',
        details: expect.objectContaining({ punta: 'cobro', anulado: true }),
      });
    });

    it('cobro BLOQUEADO (período cerrado) SÍ es aplicable: reaplicar es mover una fila (REQ-CXC-03)', async () => {
      conComprobanteCobro({ estado: EstadoComprobante.BLOQUEADO, numero: 'I2607-000001' });

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).resolves.toMatchObject(
        { id: APLICACION_ID },
      );
    });

    it('venta en BORRADOR → APLICACION_PUNTA_NO_CONTABILIZADA (422) con punta venta', async () => {
      repo.obtenerComprobantesDeVentas.mockResolvedValue(
        new Map([[VENTA_ID, comprobanteDeVenta({ estado: EstadoComprobante.BORRADOR })]]),
      );

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_PUNTA_NO_CONTABILIZADA',
        details: expect.objectContaining({ punta: 'venta', estado: 'BORRADOR' }),
      });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('venta anulada → APLICACION_PUNTA_NO_CONTABILIZADA (422)', async () => {
      repo.obtenerComprobantesDeVentas.mockResolvedValue(
        new Map([[VENTA_ID, comprobanteDeVenta({ anulado: true })]]),
      );

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_PUNTA_NO_CONTABILIZADA',
        details: expect.objectContaining({ punta: 'venta', anulado: true }),
      });
    });

    it('venta CONTADO contabilizada → APLICACION_VENTA_CONTADO (422): no integra la cartera (task 0)', async () => {
      // El guard viejo (solo estado del comprobante) dejaba pasar este caso:
      // la CONTADO está CONTABILIZADA pero jamás crea partida abierta (D-04).
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(
        sumasConLock({
          venta: {
            id: VENTA_ID,
            contactoId: CONTACTO,
            montoTotal: new Prisma.Decimal('1000.00'),
            condicionPago: CondicionPago.CONTADO,
          },
        }),
      );

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_VENTA_CONTADO',
        httpStatus: 422,
      });
      expect(repo.crearAplicacion).not.toHaveBeenCalled();
    });

    it('el repositorio re-verifica las puntas: null en crearAplicacion → 404 (defense in depth)', async () => {
      repo.crearAplicacion.mockResolvedValue(null);

      await expect(service.crearAplicacion(TENANT, USER, inputAplicacion())).rejects.toMatchObject({
        code: 'APLICACION_VENTA_NO_ENCONTRADA',
        httpStatus: 404,
      });
    });
  });

  describe('editarMontoAplicacion', () => {
    beforeEach(() => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });
      repo.listarAplicacionesDeCobro.mockResolvedValue([
        {
          id: APLICACION_ID,
          ventaId: VENTA_ID,
          montoAplicado: new Prisma.Decimal('300.00'),
          createdAt: new Date(),
        },
      ]);
    });

    it('evalúa el invariante uniforme (suma excluida + montoNuevo) y actualiza sin tocar comprobantes', async () => {
      await service.editarMontoAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER, '450.00');

      expect(repo.obtenerSumasAplicadasConLock).toHaveBeenCalledWith(
        TENANT,
        { cobroId: COBRO_ID, ventaId: VENTA_ID, excluirAplicacionId: APLICACION_ID },
        TX,
      );
      const [, aplicacionId, monto] = repo.actualizarMontoAplicacion.mock.calls[0] as unknown[] as [
        string,
        string,
        Prisma.Decimal,
      ];
      expect(aplicacionId).toBe(APLICACION_ID);
      expect(monto.toString()).toBe('450');
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
      expect(writer.anularSistema).not.toHaveBeenCalled();
    });

    it('aplicación inexistente o ajena → APLICACION_NO_ENCONTRADA (404)', async () => {
      repo.listarAplicacionesDeCobro.mockResolvedValue([]);

      await expect(
        service.editarMontoAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER, '450.00'),
      ).rejects.toMatchObject({ code: 'APLICACION_NO_ENCONTRADA', httpStatus: 404 });
      expect(repo.actualizarMontoAplicacion).not.toHaveBeenCalled();
    });

    it('exceder el cobro al editar → APLICACION_EXCEDE_COBRO evaluado bajo lock con la fila excluida', async () => {
      // Cobro de 1250.57 con 1200 aplicados en OTRAS filas: subir esta a 100 excede.
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(
        sumasConLock({ aplicadoAlCobro: new Prisma.Decimal('1200.00') }),
      );

      await expect(
        service.editarMontoAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER, '100.00'),
      ).rejects.toMatchObject({ code: 'APLICACION_EXCEDE_COBRO', httpStatus: 422 });
      expect(repo.actualizarMontoAplicacion).not.toHaveBeenCalled();
    });

    it('monto 0 → APLICACION_MONTO_NO_POSITIVO: en 0 se elimina, no se edita', async () => {
      await expect(
        service.editarMontoAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER, '0.00'),
      ).rejects.toMatchObject({ code: 'APLICACION_MONTO_NO_POSITIVO', httpStatus: 422 });
      expect(auditedTx.run).not.toHaveBeenCalled();
    });

    it('editar contra una venta CONTADO → APLICACION_VENTA_CONTADO (422): el fix cubre crear Y editar (task 0)', async () => {
      repo.obtenerSumasAplicadasConLock.mockResolvedValue(
        sumasConLock({
          venta: {
            id: VENTA_ID,
            contactoId: CONTACTO,
            montoTotal: new Prisma.Decimal('1000.00'),
            condicionPago: CondicionPago.CONTADO,
          },
        }),
      );

      await expect(
        service.editarMontoAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER, '450.00'),
      ).rejects.toMatchObject({ code: 'APLICACION_VENTA_CONTADO', httpStatus: 422 });
      expect(repo.actualizarMontoAplicacion).not.toHaveBeenCalled();
    });
  });

  describe('eliminarAplicacion', () => {
    beforeEach(() => {
      repo.listarAplicacionesDeCobro.mockResolvedValue([
        {
          id: APLICACION_ID,
          ventaId: VENTA_ID,
          montoAplicado: new Prisma.Decimal('300.00'),
          createdAt: new Date(),
        },
      ]);
    });

    it('elimina bajo el lock del cobro, sin rastro (no es desvinculación forzada) y sin comprobantes', async () => {
      await service.eliminarAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER);

      expect(repo.obtenerCobroConAplicadoConLock).toHaveBeenCalledWith(TENANT, COBRO_ID, TX);
      expect(repo.eliminarAplicaciones).toHaveBeenCalledWith(TENANT, [APLICACION_ID], TX);
      expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
      expect(writer.anularSistema).not.toHaveBeenCalled();
    });

    it('cobro inexistente o ajeno → COBRO_NO_ENCONTRADO (404)', async () => {
      repo.obtenerCobroConAplicadoConLock.mockResolvedValue(null);

      await expect(
        service.eliminarAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER),
      ).rejects.toMatchObject({ code: 'COBRO_NO_ENCONTRADO', httpStatus: 404 });
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });

    it('aplicación inexistente o ajena → APLICACION_NO_ENCONTRADA (404)', async () => {
      repo.listarAplicacionesDeCobro.mockResolvedValue([]);

      await expect(
        service.eliminarAplicacion(TENANT, COBRO_ID, APLICACION_ID, USER),
      ).rejects.toMatchObject({ code: 'APLICACION_NO_ENCONTRADA', httpStatus: 404 });
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5.5 / 5.7 — editar el cobro (REQ-CXC-06, matriz filas 7, 8 y 12)
  // ============================================================

  describe('editar', () => {
    const APLICACION_ID_2 = 'app-2';

    function dosAplicaciones() {
      return [
        {
          id: APLICACION_ID,
          ventaId: VENTA_ID,
          montoAplicado: new Prisma.Decimal('500.00'),
          createdAt: new Date('2026-07-16T10:00:00Z'),
        },
        {
          id: APLICACION_ID_2,
          ventaId: 'venta-2',
          montoAplicado: new Prisma.Decimal('300.00'),
          createdAt: new Date('2026-07-15T10:00:00Z'),
        },
      ];
    }

    function conAplicadoBajoLock(aplicado: string) {
      repo.obtenerCobroConAplicadoConLock.mockResolvedValue({
        id: COBRO_ID,
        contactoId: CONTACTO,
        monto: new Prisma.Decimal('1250.57'),
        aplicadoAlCobro: new Prisma.Decimal(aplicado),
      });
    }

    beforeEach(() => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });
    });

    it('actualiza la cabecera y REGENERA las líneas del comprobante en la MISMA TX (el monto del cobro ES el monto del asiento)', async () => {
      const actualizado = cobroRow({ monto: new Prisma.Decimal('800.00') });
      repo.actualizar.mockResolvedValue(actualizado);

      const resultado = await service.editar(
        TENANT,
        COBRO_ID,
        USER,
        inputCobro({ monto: '800.00' }),
      );

      expect(repo.actualizar).toHaveBeenCalledWith(
        TENANT,
        COBRO_ID,
        expect.objectContaining({ contactoId: CONTACTO, glosa: 'pago parcial de la factura 12' }),
        TX,
      );
      const data = (repo.actualizar.mock.calls[0] as unknown[])[2] as {
        monto: Prisma.Decimal;
      };
      expect(data.monto.toString()).toBe('800');

      expect(writer.regenerarLineasSistema).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT, comprobanteId: COMPROBANTE_ID }),
        TX,
      );
      const regen = (writer.regenerarLineasSistema.mock.calls[0] as unknown[])[0] as {
        glosa: string;
        lineas: { cuentaId: string; contactoId: string | null; debitoBob: Prisma.Decimal }[];
      };
      expect(regen.lineas).toHaveLength(2);
      expect(regen.lineas[0]?.debitoBob.toString()).toBe('800');
      expect(regen.glosa).toContain(RAZON_SOCIAL);
      expect(resultado).toEqual({ cobro: actualizado, comprobanteId: COMPROBANTE_ID });
    });

    it('subir el monto RESUELVE: el excedente colapsa al saldo a favor, sin desaplicar nada (fila 7)', async () => {
      conAplicadoBajoLock('800.00');
      repo.listarAplicacionesDeCobro.mockResolvedValue(dosAplicaciones());

      await service.editar(TENANT, COBRO_ID, USER, inputCobro({ monto: '2000.00' }));

      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
      expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
      expect(repo.actualizar).toHaveBeenCalled();
    });

    it('bajar POR DEBAJO de lo aplicado → COBRO_MONTO_INFERIOR_APLICADO (422) indicando cuánto desaplicar, y NADA se escribe (fila 8)', async () => {
      conAplicadoBajoLock('800.00');

      await expect(
        service.editar(TENANT, COBRO_ID, USER, inputCobro({ monto: '500.00' })),
      ).rejects.toMatchObject({
        code: 'COBRO_MONTO_INFERIOR_APLICADO',
        httpStatus: 422,
        details: {
          montoNuevoBob: '500.00',
          totalAplicadoBob: '800.00',
          montoADesaplicarBob: '300.00',
        },
      });
      expect(repo.actualizar).not.toHaveBeenCalled();
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });

    it('bajar hasta EXACTAMENTE lo aplicado resuelve (borde: ≥, no >)', async () => {
      conAplicadoBajoLock('800.00');

      await service.editar(TENANT, COBRO_ID, USER, inputCobro({ monto: '800.00' }));

      expect(repo.actualizar).toHaveBeenCalled();
    });

    it('la comparación monto-vs-aplicado decide con la Σ BAJO LOCK, no con una lectura suelta', async () => {
      // La lectura sin lock (listar) dice "nada aplicado"; el FOR UPDATE dice
      // 800. Si la implementación comparara fuera del lock, esto pasaría en
      // verde y dos requests concurrentes dejarían el cobro sobre-aplicado.
      conAplicadoBajoLock('800.00');
      repo.listarAplicacionesDeCobro.mockResolvedValue([]);

      await expect(
        service.editar(TENANT, COBRO_ID, USER, inputCobro({ monto: '500.00' })),
      ).rejects.toMatchObject({ code: 'COBRO_MONTO_INFERIOR_APLICADO' });
      expect(repo.obtenerCobroConAplicadoConLock).toHaveBeenCalledWith(TENANT, COBRO_ID, TX);
    });

    it('cambiar el contacto desvincula TODAS las aplicaciones con rastro y regenera con el contacto nuevo (fila 12)', async () => {
      repo.listarAplicacionesDeCobro.mockResolvedValue(dosAplicaciones());

      await service.editar(TENANT, COBRO_ID, USER, inputCobro({ contactoId: CONTACTO_2 }));

      expect(repo.eliminarAplicaciones).toHaveBeenCalledWith(
        TENANT,
        [APLICACION_ID, APLICACION_ID_2],
        TX,
      );
      expect(repo.registrarAplicacionesDesvinculadas).toHaveBeenCalledWith(
        TENANT,
        [
          expect.objectContaining({
            cobroId: COBRO_ID,
            ventaId: VENTA_ID,
            motivo: 'Cambio del cliente del cobro',
            userId: USER,
          }),
          expect.objectContaining({ ventaId: 'venta-2' }),
        ],
        TX,
      );
      // B-1: el contactoId viaja en las líneas del asiento — sin regenerar,
      // el comprobante queda contradiciendo al documento.
      const regen = (writer.regenerarLineasSistema.mock.calls[0] as unknown[])[0] as {
        lineas: { contactoId: string | null }[];
      };
      expect(regen.lineas[0]?.contactoId).toBe(CONTACTO_2);
      expect(regen.lineas[1]?.contactoId).toBe(CONTACTO_2);
    });

    it('cambio de contacto + baja del monto: lo desvinculado ya no cuenta contra el monto nuevo', async () => {
      conAplicadoBajoLock('800.00');
      repo.listarAplicacionesDeCobro.mockResolvedValue(dosAplicaciones());

      await service.editar(
        TENANT,
        COBRO_ID,
        USER,
        inputCobro({ contactoId: CONTACTO_2, monto: '500.00' }),
      );

      expect(repo.eliminarAplicaciones).toHaveBeenCalled();
      expect(repo.actualizar).toHaveBeenCalled();
    });

    it('cobro anulado → COBRO_ANULADO_NO_EDITABLE (409): la anulación es terminal (§4.7)', async () => {
      conComprobanteCobro({ anulado: true, estado: EstadoComprobante.CONTABILIZADO });

      await expect(service.editar(TENANT, COBRO_ID, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_ANULADO_NO_EDITABLE',
        httpStatus: 409,
      });
      expect(repo.actualizar).not.toHaveBeenCalled();
    });

    it('período de ORIGEN cerrado → COBRO_PERIODO_NO_ABIERTO (409) y nada se escribe', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.editar(TENANT, COBRO_ID, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      expect(repo.actualizar).not.toHaveBeenCalled();
      expect(writer.regenerarLineasSistema).not.toHaveBeenCalled();
    });

    it('mover la fechaContable valida TAMBIÉN el período de DESTINO', async () => {
      // Origen (julio) abierto; destino (agosto) cerrado.
      periodos.obtenerPorFecha.mockImplementation((_tenant: string, fecha: { toIso(): string }) =>
        Promise.resolve(
          fecha.toIso().startsWith('2026-07')
            ? { id: PERIODO, status: PeriodoFiscalStatus.ABIERTO }
            : { id: 'periodo-2608', status: PeriodoFiscalStatus.CERRADO },
        ),
      );

      await expect(
        service.editar(TENANT, COBRO_ID, USER, inputCobro({ fechaContable: '2026-08-10' })),
      ).rejects.toMatchObject({ code: 'COBRO_PERIODO_NO_ABIERTO', httpStatus: 409 });
      expect(periodos.obtenerPorFecha).toHaveBeenCalledTimes(2);
    });

    it('cobro inexistente o ajeno → COBRO_NO_ENCONTRADO (404)', async () => {
      repo.obtenerCobroConAplicadoConLock.mockResolvedValue(null);

      await expect(service.editar(TENANT, COBRO_ID, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
      expect(repo.actualizar).not.toHaveBeenCalled();
    });

    it('monto 0 → COBRO_ASIENTO_SIN_MONTO (422) sin tocar aplicaciones ni cabecera (§4.1)', async () => {
      repo.listarAplicacionesDeCobro.mockResolvedValue(dosAplicaciones());

      await expect(
        service.editar(
          TENANT,
          COBRO_ID,
          USER,
          inputCobro({ monto: '0.00', contactoId: CONTACTO_2 }),
        ),
      ).rejects.toMatchObject({ code: 'COBRO_ASIENTO_SIN_MONTO', httpStatus: 422 });
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
      expect(repo.actualizar).not.toHaveBeenCalled();
    });

    it('cuenta destino no elegible al editar → COBRO_CUENTA_DESTINO_NO_ELEGIBLE (422)', async () => {
      cuentasEfectivo.esElegibleComoDestino.mockResolvedValue(false);

      await expect(service.editar(TENANT, COBRO_ID, USER, inputCobro())).rejects.toMatchObject({
        code: 'COBRO_CUENTA_DESTINO_NO_ELEGIBLE',
        httpStatus: 422,
      });
      expect(repo.actualizar).not.toHaveBeenCalled();
    });

    it('contacto nuevo inexistente o de otro tenant → COBRO_CONTACTO_NO_ENCONTRADO (404)', async () => {
      contactos.obtenerBatch.mockResolvedValue(new Map());

      await expect(
        service.editar(TENANT, COBRO_ID, USER, inputCobro({ contactoId: 'contacto-ajeno' })),
      ).rejects.toMatchObject({ code: 'COBRO_CONTACTO_NO_ENCONTRADO', httpStatus: 404 });
      expect(repo.actualizar).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 5.6 — anular el cobro (REQ-CXC-06 fila 9, §4.7, B-14, D-13)
  // ============================================================

  describe('anular', () => {
    const MOTIVO = 'Cobro duplicado por error de carga';
    const APLICACION_ID_2 = 'app-2';

    function dosAplicaciones() {
      return [
        {
          id: APLICACION_ID,
          ventaId: VENTA_ID,
          montoAplicado: new Prisma.Decimal('500.00'),
          createdAt: new Date('2026-07-16T10:00:00Z'),
        },
        {
          id: APLICACION_ID_2,
          ventaId: 'venta-2',
          montoAplicado: new Prisma.Decimal('100.00'),
          createdAt: new Date('2026-07-15T10:00:00Z'),
        },
      ];
    }

    beforeEach(() => {
      conComprobanteCobro({ estado: EstadoComprobante.CONTABILIZADO, numero: 'I2607-000001' });
      repo.listarAplicacionesDeCobro.mockResolvedValue(dosAplicaciones());
    });

    it('anula vía anularSistema (Anti-14: desde este módulo) y desvincula TODAS las aplicaciones con rastro B-14', async () => {
      await service.anular(TENANT, COBRO_ID, USER, MOTIVO);

      expect(writer.anularSistema).toHaveBeenCalledWith(
        { tenantId: TENANT, comprobanteId: COMPROBANTE_ID, motivo: MOTIVO, anuladoPorUserId: USER },
        TX,
      );
      expect(repo.eliminarAplicaciones).toHaveBeenCalledWith(
        TENANT,
        [APLICACION_ID, APLICACION_ID_2],
        TX,
      );
      expect(repo.registrarAplicacionesDesvinculadas).toHaveBeenCalledWith(
        TENANT,
        [
          expect.objectContaining({
            cobroId: COBRO_ID,
            ventaId: VENTA_ID,
            motivo: `Anulación del cobro: ${MOTIVO}`,
            userId: USER,
          }),
          expect.objectContaining({ ventaId: 'venta-2' }),
        ],
        TX,
      );
    });

    it('anularSistema corre ANTES de desvincular: un rechazo tardío no puede dejar aplicaciones ya borradas', async () => {
      await service.anular(TENANT, COBRO_ID, USER, MOTIVO);

      const ordenAnular = writer.anularSistema.mock.invocationCallOrder[0] ?? Infinity;
      const ordenEliminar = repo.eliminarAplicaciones.mock.invocationCallOrder[0] ?? -Infinity;
      expect(ordenAnular).toBeLessThan(ordenEliminar);
    });

    it('si anularSistema rechaza (motivo inválido, estado ilegal), NINGUNA aplicación se toca', async () => {
      writer.anularSistema.mockRejectedValue(new Error('COMPROBANTE_MOTIVO_ANULACION_INVALIDO'));

      await expect(service.anular(TENANT, COBRO_ID, USER, 'corto')).rejects.toThrow();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
      expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
    });

    it('ya anulado → COBRO_ANULADO_NO_EDITABLE (409): la anulación es terminal, sin llamar al writer', async () => {
      conComprobanteCobro({ anulado: true, estado: EstadoComprobante.CONTABILIZADO });

      await expect(service.anular(TENANT, COBRO_ID, USER, MOTIVO)).rejects.toMatchObject({
        code: 'COBRO_ANULADO_NO_EDITABLE',
        httpStatus: 409,
      });
      expect(writer.anularSistema).not.toHaveBeenCalled();
    });

    it('period lock (REQ-CXC-09): período cerrado → COBRO_PERIODO_NO_ABIERTO y nada se anula', async () => {
      periodos.obtenerPorFecha.mockResolvedValue({
        id: PERIODO,
        status: PeriodoFiscalStatus.CERRADO,
      });

      await expect(service.anular(TENANT, COBRO_ID, USER, MOTIVO)).rejects.toMatchObject({
        code: 'COBRO_PERIODO_NO_ABIERTO',
        httpStatus: 409,
      });
      expect(writer.anularSistema).not.toHaveBeenCalled();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
    });

    it('cobro inexistente o ajeno → COBRO_NO_ENCONTRADO (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.anular(TENANT, COBRO_ID, USER, MOTIVO)).rejects.toMatchObject({
        code: 'COBRO_NO_ENCONTRADO',
        httpStatus: 404,
      });
    });

    it('sin aplicaciones: anula igual y no registra un rastro vacío', async () => {
      repo.listarAplicacionesDeCobro.mockResolvedValue([]);

      await service.anular(TENANT, COBRO_ID, USER, MOTIVO);

      expect(writer.anularSistema).toHaveBeenCalled();
      expect(repo.eliminarAplicaciones).not.toHaveBeenCalled();
      expect(repo.registrarAplicacionesDesvinculadas).not.toHaveBeenCalled();
    });

    it('D-13: anular NO consulta ningún saldo de Caja — el desfase del traspaso lo destapa el arqueo', async () => {
      // El guard de saldo NO existe a propósito: el service ni siquiera tiene
      // inyectado un lector de saldos. Este test congela que anular procede
      // sin más lecturas que cobro + comprobante + período + aplicaciones.
      await service.anular(TENANT, COBRO_ID, USER, MOTIVO);

      expect(cuentasEfectivo.esElegibleComoDestino).not.toHaveBeenCalled();
      expect(cartera.listarCobrosDeContacto).not.toHaveBeenCalled();
      expect(cartera.listarVentasDeCartera).not.toHaveBeenCalled();
    });
  });

  describe('lecturas (task 5.10) — superficie read del controller', () => {
    beforeEach(() => {
      repo.listar.mockResolvedValue({ cobros: [cobroRow()], total: 1 });
    });

    describe('listar', () => {
      it('devuelve cada cobro con el comprobante que le da su estado (REQ-CXC-02)', async () => {
        const res = await service.listar(TENANT, {});

        expect(res.total).toBe(1);
        expect(res.page).toBe(1);
        expect(res.limit).toBe(50);
        expect(res.cobros).toHaveLength(1);
        expect(res.cobros[0]?.comprobante.estado).toBe(EstadoComprobante.BORRADOR);
      });

      it('convierte los filtros de fecha ISO a @db.Date sin pasar por UTC (§4.6)', async () => {
        await service.listar(TENANT, { fechaDesde: '2026-07-01', fechaHasta: '2026-07-31' });

        const [tenant, filtros, pagination] = repo.listar.mock.calls[0] as [
          string,
          { fechaDesde?: Date; fechaHasta?: Date },
          { page: number; limit: number },
        ];
        expect(tenant).toBe(TENANT);
        expect(filtros.fechaDesde?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
        expect(filtros.fechaHasta?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
        expect(pagination).toEqual({ page: 1, limit: 50 });
      });

      it('capea el limit al máximo (Anti-28: paginación obligatoria)', async () => {
        await service.listar(TENANT, { page: 3, limit: 9999 });

        const [, , pagination] = repo.listar.mock.calls[0] as [unknown, unknown, unknown];
        expect(pagination).toEqual({ page: 3, limit: 100 });
      });

      it('el cobro sin comprobante es dato roto y queda fuera sin tumbar el listado', async () => {
        repo.obtenerComprobantesDeCobros.mockResolvedValue(new Map());

        const res = await service.listar(TENANT, {});

        expect(res.cobros).toEqual([]);
        expect(res.total).toBe(1);
      });

      it('las lecturas NO abren transacción auditada: no emiten auditoría', async () => {
        await service.listar(TENANT, {});

        expect(auditedTx.run).not.toHaveBeenCalled();
      });
    });

    describe('obtener', () => {
      it('devuelve cobro, comprobante y aplicaciones', async () => {
        const aplicacion = {
          id: APLICACION_ID,
          ventaId: VENTA_ID,
          montoAplicado: new Prisma.Decimal('300.00'),
          createdAt: new Date(),
        };
        repo.listarAplicacionesDeCobro.mockResolvedValue([aplicacion]);

        const res = await service.obtener(TENANT, COBRO_ID);

        expect(res.cobro.id).toBe(COBRO_ID);
        expect(res.comprobante.id).toBe(COMPROBANTE_ID);
        expect(res.aplicaciones).toEqual([aplicacion]);
        expect(auditedTx.run).not.toHaveBeenCalled();
      });

      it('el cobro ajeno o inexistente responde el mismo 404 (§4.2, REQ-CXC-08)', async () => {
        repo.findById.mockResolvedValue(null);

        await expect(service.obtener(TENANT, COBRO_ID)).rejects.toMatchObject({
          code: 'COBRO_NO_ENCONTRADO',
          httpStatus: 404,
        });
      });

      it('el cobro sin comprobante es dato roto: el mismo 404', async () => {
        repo.obtenerComprobantesDeCobros.mockResolvedValue(new Map());

        await expect(service.obtener(TENANT, COBRO_ID)).rejects.toMatchObject({
          code: 'COBRO_NO_ENCONTRADO',
        });
      });
    });
  });
});
