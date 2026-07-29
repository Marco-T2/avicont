// Coherencia de CONCEPTO_FIELDS contra el schema.
//
// `conceptosQueUsanCuenta` recorre CONCEPTO_FIELDS para responder "¿qué
// conceptos apuntan a esta cuenta?", y de esa respuesta depende el guard
// CUENTA_CONFIGURADA_COMO_CONCEPTO (Anti-41) que impide desactivar una cuenta
// enchufada a la configuración contable.
//
// El problema que resuelve este test: la lista era MANUAL y nada la ataba al
// schema. Agregar un concepto a OrgConfiguracionContable y olvidarse de
// sumarlo acá no rompía nada — el guard simplemente dejaba de ver ese
// concepto y la cuenta se podía desactivar, rompiendo el asiento automático
// que dependía de ella. Verificado por mutación (2026-07-29): sacar un campo
// de CONCEPTO_FIELDS pasaba las 10 suites de `cuentas` en verde, porque el
// spec del service mockea `conceptosQueUsanCuenta` y nunca ejercita la lista.
//
// La lista esperada se DERIVA del DMMF de Prisma, así que este test no hay
// que mantenerlo: sumar un concepto al schema lo actualiza solo.

import { Prisma } from '@prisma/client';

import { CONCEPTO_FIELDS } from './prisma-cuenta.repository';

describe('CONCEPTO_FIELDS ↔ OrgConfiguracionContable', () => {
  // Campos escalares de OrgConfiguracionContable que son FK hacia Cuenta.
  const fksHaciaCuenta = (): string[] => {
    const modelo = Prisma.dmmf.datamodel.models.find((m) => m.name === 'OrgConfiguracionContable');
    if (!modelo) throw new Error('OrgConfiguracionContable no está en el DMMF');

    return modelo.fields
      .filter((f) => f.kind === 'object' && f.type === 'Cuenta')
      .flatMap((f) => f.relationFromFields ?? [])
      .sort();
  };

  it('cubre TODOS los campos que apuntan a Cuenta', () => {
    const faltantes = fksHaciaCuenta().filter(
      (campo) => !(CONCEPTO_FIELDS as readonly string[]).includes(campo),
    );
    expect(faltantes).toEqual([]);
  });

  it('no declara campos que el schema no tiene', () => {
    const esperados = new Set(fksHaciaCuenta());
    const sobrantes = CONCEPTO_FIELDS.filter((campo) => !esperados.has(campo));
    expect(sobrantes).toEqual([]);
  });

  it('el DMMF encuentra conceptos (guarda contra un test que pasa por vacío)', () => {
    // Sin esto, un DMMF que devolviera [] haría pasar los dos tests de arriba
    // por la razón equivocada.
    expect(fksHaciaCuenta().length).toBeGreaterThan(10);
  });
});
