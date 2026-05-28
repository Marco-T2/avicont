// Tests de validación del DTO CreateComprobanteDto.
// El DTO valida solo la FORMA (tipos, enum, shape). Las reglas de ALCANCE/NEGOCIO
// — monedaPrincipal solo BOB, tipoCambioReexpresion decimal positivo — viven en
// ComprobantesService con codes estables COMPROBANTE_MONEDA_NO_PERMITIDA /
// COMPROBANTE_CAMPO_INVALIDO (W-2, CLAUDE.md §6.2). Ver comprobantes.service.spec.ts.

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

describe('CreateComprobanteDto — monedaPrincipal (forma)', () => {
  it('acepta monedaPrincipal=BOB', async () => {
    const errores = await validar({ ...dtoBase(), monedaPrincipal: Moneda.BOB });
    expect(errores).toHaveLength(0);
  });

  it('acepta DTO sin monedaPrincipal (default BOB aplica)', async () => {
    const { monedaPrincipal: _, ...sinMoneda } = dtoBase();
    const errores = await validar(sinMoneda);
    expect(errores).toHaveLength(0);
  });

  it('acepta monedaPrincipal=USD a nivel FORMA (la regla BOB-only la valida el servicio)', async () => {
    const errores = await validar({ ...dtoBase(), monedaPrincipal: Moneda.USD });
    expect(errores).toHaveLength(0);
  });

  it('rechaza un valor que no es del enum Moneda', async () => {
    const errores = await validar({ ...dtoBase(), monedaPrincipal: 'EUR' });
    expect(errores.length).toBeGreaterThan(0);
  });
});

describe('CreateComprobanteDto — tipoCambioReexpresion (forma)', () => {
  it('acepta tipoCambioReexpresion="6.96"', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: '6.96' });
    expect(errores).toHaveLength(0);
  });

  it('acepta DTO sin tipoCambioReexpresion (campo opcional)', async () => {
    const errores = await validar(dtoBase());
    expect(errores).toHaveLength(0);
  });

  it('acepta cualquier string a nivel FORMA (el decimal positivo lo valida el servicio)', async () => {
    // "0", "-1.5", "abc" pasan el shape (son strings); el servicio los rechaza
    // con COMPROBANTE_CAMPO_INVALIDO. Ver comprobantes.service.spec.ts.
    for (const valor of ['0', '0.00', '-1.5', 'abc', '+6.96']) {
      const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: valor });
      expect(errores).toHaveLength(0);
    }
  });

  it('rechaza tipoCambioReexpresion que no es string (number)', async () => {
    const errores = await validar({ ...dtoBase(), tipoCambioReexpresion: 6.96 });
    expect(errores.length).toBeGreaterThan(0);
  });
});
