// Tests de validación del DTO CreateComprobanteDto.
// Cubren: lock de monedaPrincipal a BOB y validación de tipoCambioReexpresion.
// Spec: Batch 3, paso 3.4.

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Moneda, TipoComprobante } from '@prisma/client';

import { CreateComprobanteDto } from './create-comprobante.dto';

// DTO base válido para re-usar en los tests
function dtoBase(): Record<string, unknown> {
  return {
    tipo: TipoComprobante.DIARIO,
    fechaContable: '2026-04-22',
    glosa: 'Test glosa',
    monedaPrincipal: Moneda.BOB,
    lineas: [
      {
        cuentaId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        moneda: Moneda.BOB,
        debito: '1000.00',
        credito: '0',
        tipoCambio: '1',
        debitoBob: '1000.00',
        creditoBob: '0',
      },
    ],
  };
}

async function validar(plain: Record<string, unknown>): Promise<string[]> {
  const instance = plainToInstance(CreateComprobanteDto, plain);
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateComprobanteDto — monedaPrincipal lock', () => {
  it('acepta monedaPrincipal=BOB', async () => {
    const errores = await validar({ ...dtoBase(), monedaPrincipal: Moneda.BOB });
    expect(errores).toHaveLength(0);
  });

  it('acepta DTO sin monedaPrincipal (default BOB aplica)', async () => {
    const { monedaPrincipal: _, ...sinMoneda } = dtoBase();
    const errores = await validar(sinMoneda);
    expect(errores).toHaveLength(0);
  });

  it('rechaza monedaPrincipal=USD', async () => {
    const errores = await validar({ ...dtoBase(), monedaPrincipal: Moneda.USD });
    expect(errores.some((e) => e.includes('BOB'))).toBe(true);
  });
});

describe('CreateComprobanteDto — tipoCambioReexpresion validation', () => {
  it('acepta tipoCambioReexpresion="6.96"', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: '6.96' });
    expect(errores).toHaveLength(0);
  });

  it('acepta DTO sin tipoCambioReexpresion (campo opcional)', async () => {
    const errores = await validar(dtoBase());
    expect(errores).toHaveLength(0);
  });

  it('acepta valores decimales válidos > 0', async () => {
    for (const valor of ['1', '1.00000000', '6.96', '100', '0.01']) {
      const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: valor });
      expect(errores).toHaveLength(0);
    }
  });

  it('rechaza tipoCambioReexpresion="0" (cero no es T/C válido)', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: '0' });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza tipoCambioReexpresion="0.00" (cero con decimales)', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: '0.00' });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza tipoCambioReexpresion="-1.5" (valor negativo)', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: '-1.5' });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza tipoCambioReexpresion="abc" (no numérico)', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: 'abc' });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza tipoCambioReexpresion con signo positivo explícito "+6.96"', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: '+6.96' });
    expect(errores.length).toBeGreaterThan(0);
  });
});
