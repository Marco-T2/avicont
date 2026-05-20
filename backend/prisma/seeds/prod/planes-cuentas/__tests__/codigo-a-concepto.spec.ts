// Test de coherencia de la plantilla COMERCIAL:
//
// Invariante 1: toda cuenta marcada con `esRequeridaSistema: true` debe
//               tener su codigoInterno presente en MAPEO_CODIGO_A_CONCEPTO.
// Invariante 2: toda entrada de MAPEO_CODIGO_A_CONCEPTO debe estar presente
//               en la plantilla (CUENTAS_HOJA_COMERCIAL) con
//               `esRequeridaSistema: true`.
//
// Si este test falla:
//   - Agregaste una cuenta requerida sin mapear → agregar a MAPEO_CODIGO_A_CONCEPTO.
//   - Agregaste un mapeo sin su cuenta en la plantilla → agregar la cuenta
//     a CUENTAS_HOJA_COMERCIAL con esRequeridaSistema: true.

import { CUENTAS_HOJA_COMERCIAL, MAPEO_CODIGO_A_CONCEPTO } from '../comercial';

describe('plantilla COMERCIAL: coherencia esRequeridaSistema ↔ MAPEO_CODIGO_A_CONCEPTO', () => {
  const requeridas = CUENTAS_HOJA_COMERCIAL.filter((c) => c.esRequeridaSistema === true);
  const codigosRequeridos = new Set(requeridas.map((c) => c.codigo));
  const codigosMapeados = new Set(Object.keys(MAPEO_CODIGO_A_CONCEPTO));

  it('toda cuenta esRequeridaSistema está en MAPEO_CODIGO_A_CONCEPTO', () => {
    const sinMapeo = [...codigosRequeridos].filter((c) => !codigosMapeados.has(c));
    expect(sinMapeo).toEqual([]);
  });

  it('toda entrada de MAPEO_CODIGO_A_CONCEPTO corresponde a una cuenta esRequeridaSistema', () => {
    const sinCuenta = [...codigosMapeados].filter((c) => !codigosRequeridos.has(c));
    expect(sinCuenta).toEqual([]);
  });

  it('tanto plantilla como mapeo tienen la misma cantidad de cuentas requeridas', () => {
    expect(codigosRequeridos.size).toBe(codigosMapeados.size);
  });

  it('no hay conceptos duplicados en MAPEO_CODIGO_A_CONCEPTO (cada concepto a una sola cuenta)', () => {
    const conceptos = Object.values(MAPEO_CODIGO_A_CONCEPTO);
    expect(new Set(conceptos).size).toBe(conceptos.length);
  });
});
