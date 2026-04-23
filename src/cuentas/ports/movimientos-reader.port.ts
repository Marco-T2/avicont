// Puerto para saber si una cuenta tiene movimientos contables asociados.
// Consumido por CuentasService para bloquear cambios en campos estructurales
// (codigoInterno, claseCuenta, subClaseCuenta, esDetalle) de cuentas que
// ya participan de asientos contabilizados o bloqueados.
//
// Fase 1.0.7: StubMovimientosReader devuelve siempre false porque el módulo
// de asientos no existe todavía. La validación estructural en el servicio
// YA ESTÁ activa y se cablea automáticamente cuando Fase 1.1 agregue el
// PrismaMovimientosReader real.
//
// Ver CLAUDE.md §4.1 ("cuenta con movimientos no se puede eliminar, solo
// desactivar" y "no se puede cambiar el tipo de una cuenta con movimientos").

export const MOVIMIENTOS_READER_PORT = Symbol('MOVIMIENTOS_READER_PORT');

export interface MovimientosReaderPort {
  tieneMovimientos(cuentaId: string, tenantId: string): Promise<boolean>;
}
