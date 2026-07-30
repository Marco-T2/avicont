// Puerto del repositorio del módulo `ventas`. El servicio nunca toca Prisma
// directamente (Anti-31). Molde: `items/ports/items.repository.port.ts`.
//
// La venta NO lleva estado propio ni flag `anulado` (REQ-VTA-01): se leen del
// comprobante vinculado por `(organizationId, origenTipo='VENTA', origenId)`.
// Por eso este port expone una proyección de LECTURA sobre la tabla de
// comprobantes (`obtenerComprobantesDeVentas`, `listarVentasEnCartera`) —
// mismo patrón que `cierre-ejercicio/adapters/prisma-cierre-gestion-reader.adapter.ts`
// (§3.7: cada módulo define su read-surface). Toda ESCRITURA de comprobantes
// sigue pasando por `ComprobanteSistemaWriterPort`, nunca por acá.

import type { CondicionPago, EstadoComprobante, Prisma } from '@prisma/client';

export const VENTA_REPOSITORY_PORT = Symbol('VENTA_REPOSITORY_PORT');

/**
 * Línea tal como la persiste el repositorio: FK viva + snapshots ya resueltos
 * (D-28). El caller (service) resuelve `cuentaIngresoId` y calcula `subtotal`
 * con `Money` ANTES de llegar acá — el repo no calcula nada.
 *
 * Sin `orden`: lo asigna el repositorio por posición del array (1-based),
 * espejo de `LineaSistemaData` del writer de comprobantes.
 *
 * Montos como `Prisma.Decimal`, nunca `number` (§4.5): el service los produce
 * con `Money.toPrismaDecimal()`, igual que para el writer.
 */
export interface LineaVentaData {
  itemId: string;
  descripcion: string;
  cantidad: Prisma.Decimal;
  precioUnitario: Prisma.Decimal;
  cuentaIngresoId: string;
  subtotal: Prisma.Decimal;
}

export interface VentaCreateData {
  contactoId: string;
  /** @db.Date construido vía `FechaContable.toDbDate()` (§4.6). */
  fechaContable: Date;
  condicionPago: CondicionPago;
  /** Obligatoria en CREDITO, prohibida en CONTADO — lo valida el service. */
  fechaVencimiento: Date | null;
  glosa: string;
  /** Σ de subtotales YA redondeados, calculada por el service (REQ-VTA-03). */
  montoTotal: Prisma.Decimal;
  createdByUserId: string;
  lineas: LineaVentaData[];
}

/**
 * Estado COMPLETO de la venta para el reemplazo en bloque (D-17): la edición
 * regenera todo, no hay campos parciales. `montoTotal` viene recalculado por
 * el service en la misma pasada que produjo las líneas (REQ-VTA-03).
 */
export interface VentaReemplazoData {
  contactoId: string;
  fechaContable: Date;
  condicionPago: CondicionPago;
  fechaVencimiento: Date | null;
  glosa: string;
  montoTotal: Prisma.Decimal;
  lineas: LineaVentaData[];
}

export type VentaConLineas = Prisma.VentaGetPayload<{ include: { lineas: true } }>;
export type Venta = Prisma.VentaGetPayload<Record<string, never>>;

/** Proyección mínima del comprobante que la venta necesita para operar. */
export interface ComprobanteDeVenta {
  id: string;
  numero: string | null;
  estado: EstadoComprobante;
  anulado: boolean;
}

/**
 * Aplicación de un cobro sobre la venta, en el orden que el recorte LIFO
 * necesita (D-21). `createdAt` se expone porque "la más reciente" se define
 * por él y el service tiene que poder auditarlo/testearlo.
 */
export interface AplicacionDeVenta {
  id: string;
  cobroId: string;
  montoAplicado: Prisma.Decimal;
  createdAt: Date;
}

/**
 * Fila del estado de cuenta (REQ-CXC-07): la venta que "cuenta" con lo ya
 * cobrado. El saldo (`montoTotal − totalAplicado`) es DERIVADO y lo calcula
 * el consumidor — nunca se persiste (REQ-CXC-01).
 */
export interface VentaEnCartera {
  venta: Venta;
  numero: string | null;
  totalAplicado: Prisma.Decimal;
}

export interface VentaListarFiltros {
  contactoId?: string;
  /** @db.Date (§4.6): límites inclusivos sobre `fechaContable`. */
  fechaDesde?: Date;
  fechaHasta?: Date;
}

export interface VentaListarPagination {
  page: number;
  limit: number;
}

export abstract class VentaRepositoryPort {
  /**
   * Crea la venta con sus líneas. `tx` OBLIGATORIO: la venta y su comprobante
   * (vía `ComprobanteSistemaWriterPort`) nacen en la MISMA transacción
   * (REQ-VTA-01) — un `tx` opcional permitiría escribir la venta suelta y
   * dejar un comprobante huérfano ante un fallo posterior.
   *
   * Asume que el service ya validó todo (ítems/contacto del tenant, subtotales,
   * vencimiento). Asigna `orden` 1..N por posición del array.
   */
  abstract crear(
    tenantId: string,
    data: VentaCreateData,
    tx: Prisma.TransactionClient,
  ): Promise<VentaConLineas>;

  /**
   * Reemplaza la venta ENTERA preservando su `id` (§4.3): actualiza la
   * cabecera y borra + re-inserta las líneas en bloque, atómico dentro del
   * `tx` que también regenera el comprobante. Lanza si la venta no existe en
   * el tenant (el service ya hizo `findById` para el 404).
   */
  abstract reemplazar(
    tenantId: string,
    ventaId: string,
    data: VentaReemplazoData,
    tx: Prisma.TransactionClient,
  ): Promise<VentaConLineas>;

  /**
   * Borra físicamente la venta (sólo borradores — lo garantiza el service,
   * REQ-VTA-01) junto con sus líneas (cascade). En la misma TX el service
   * llama `eliminarBorradorSistema` para el comprobante.
   */
  abstract eliminar(tenantId: string, ventaId: string, tx: Prisma.TransactionClient): Promise<void>;

  /**
   * null si no existe o es de otro tenant (§4.2 — venta ajena → 404,
   * REQ-VTA-08). Líneas ordenadas por `orden` asc.
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VentaConLineas | null>;

  /** Paginación obligatoria (Anti-28). Orden: `fechaContable` desc, `createdAt` desc. */
  abstract listar(
    tenantId: string,
    filtros: VentaListarFiltros,
    pagination: VentaListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ ventas: Venta[]; total: number }>;

  /**
   * Comprobantes de un lote de ventas, indexados por `ventaId` (= `origenId`).
   * Las ventas sin comprobante (no debería pasar) o de otro tenant NO aparecen
   * en el Map. Es la ÚNICA fuente del estado/número/anulado de una venta
   * (REQ-VTA-01: la venta no espeja estado).
   */
  abstract obtenerComprobantesDeVentas(
    tenantId: string,
    ventaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ComprobanteDeVenta>>;

  /**
   * Aplicaciones de cobros sobre la venta en orden LIFO (`createdAt` desc,
   * `id` desc como desempate): exactamente el orden en que el recorte de D-21
   * las consume, y la lista que la desvinculación registra en
   * `AplicacionCobroDesvinculada` (REQ-VTA-06/07).
   */
  abstract listarAplicaciones(
    tenantId: string,
    ventaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AplicacionDeVenta[]>;

  /**
   * Ventas del contacto que INTEGRAN la cartera (REQ-VTA-01/REQ-CXC-07):
   * comprobante en `ESTADOS_CONCILIABLES` (`CONTABILIZADO` **o** `BLOQUEADO` —
   * §4.4: cerrar el período no vacía el estado de cuenta) y `anulado = false`,
   * con la Σ de `montoAplicado` de cada una. PROHIBIDO filtrar por
   * `CONTABILIZADO` a secas.
   */
  abstract listarVentasEnCartera(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VentaEnCartera[]>;
}
