import { Injectable } from '@nestjs/common';

import type { MovimientosReaderPort } from '../ports/movimientos-reader.port';

// Stub activo durante Fase 1.0.x mientras no exista el módulo de asientos.
// Devolver siempre `false` es una MENTIRA CONVENIENTE — quiere decir "no
// hay forma de tener movimientos aún porque no existe la tabla de asientos".
//
// El guardrail que previene usarlo después de Fase 1.1 está en
// cuentas.module.ts: si FASE_ASIENTOS_ACTIVO=true la factory lanza error.
// Así cuando se implemente PrismaMovimientosReader se reemplaza este stub
// sin cambiar el servicio, y cualquier olvido hace fallar el bootstrap.
@Injectable()
export class StubMovimientosReader implements MovimientosReaderPort {
  tieneMovimientos(_cuentaId: string, _tenantId: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}
