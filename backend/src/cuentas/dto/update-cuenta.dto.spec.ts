// Tests de validación del DTO UpdateCuentaDto — campo actividadFlujo.
// Cubre el invariante del spec cuenta-actividad-flujo-ui (W1 del verify SDD):
// el campo es nullable-opcional y solo acepta valores del enum ActividadFlujo.

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ActividadFlujo } from '@/common/domain/enums';

import { UpdateCuentaDto } from './update-cuenta.dto';

async function validar(plain: Record<string, unknown>): Promise<string[]> {
  const instance = plainToInstance(UpdateCuentaDto, plain);
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('UpdateCuentaDto — actividadFlujo', () => {
  it('acepta actividadFlujo=EFECTIVO', async () => {
    const errores = await validar({ actividadFlujo: ActividadFlujo.EFECTIVO });
    expect(errores).toHaveLength(0);
  });

  it('acepta actividadFlujo=OPERACION', async () => {
    const errores = await validar({ actividadFlujo: ActividadFlujo.OPERACION });
    expect(errores).toHaveLength(0);
  });

  it('acepta actividadFlujo=INVERSION', async () => {
    const errores = await validar({ actividadFlujo: ActividadFlujo.INVERSION });
    expect(errores).toHaveLength(0);
  });

  it('acepta actividadFlujo=FINANCIACION', async () => {
    const errores = await validar({ actividadFlujo: ActividadFlujo.FINANCIACION });
    expect(errores).toHaveLength(0);
  });

  it('acepta actividadFlujo=null (limpiar clasificación — volver a heurística automática)', async () => {
    const errores = await validar({ actividadFlujo: null });
    expect(errores).toHaveLength(0);
  });

  it('acepta DTO sin actividadFlujo (campo omitido — sin error)', async () => {
    const errores = await validar({});
    expect(errores).toHaveLength(0);
  });

  it('rechaza un valor fuera del enum (ej. "CAJA")', async () => {
    const instance = plainToInstance(UpdateCuentaDto, { actividadFlujo: 'CAJA' });
    const erroresCompletos = await validate(instance);
    const errorCampo = erroresCompletos.find((e) => e.property === 'actividadFlujo');
    expect(errorCampo).toBeDefined();
    expect(Object.keys(errorCampo?.constraints ?? {})).toContain('isEnum');
  });

  it('rechaza otro valor fuera del enum (ej. "BASURA")', async () => {
    const instance = plainToInstance(UpdateCuentaDto, { actividadFlujo: 'BASURA' });
    const erroresCompletos = await validate(instance);
    const errorCampo = erroresCompletos.find((e) => e.property === 'actividadFlujo');
    expect(errorCampo).toBeDefined();
    expect(Object.keys(errorCampo?.constraints ?? {})).toContain('isEnum');
  });
});
