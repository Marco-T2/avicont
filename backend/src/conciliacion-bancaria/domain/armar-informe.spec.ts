import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import type { LadoBancario, LadoContable } from '@prisma/client';

import {
  armarInforme,
  type InsumosInforme,
  type LineaParaInforme,
  type MovimientoParaInforme,
} from './armar-informe';

// ============================================================
// Factories — mismos nombres que el vocabulario del puente
// ============================================================

interface MovParams {
  id?: string;
  fecha: string;
  monto: string;
  tipo?: LadoBancario;
}

function base(p: MovParams) {
  return {
    id: p.id ?? `mov-${p.fecha}-${p.monto}`,
    fecha: FechaContable.fromIso(p.fecha),
    monto: Money.of(p.monto),
    tipo: p.tipo ?? ('DEBITO' as const),
  };
}

function pendiente(p: MovParams): MovimientoParaInforme {
  return { ...base(p), estadoEfectivo: 'PENDIENTE' };
}

function ignorado(p: MovParams): MovimientoParaInforme {
  return { ...base(p), estadoEfectivo: 'IGNORADO' };
}

function conciliado(p: MovParams & { asiento: string }): MovimientoParaInforme {
  return {
    ...base(p),
    estadoEfectivo: 'CONCILIADO',
    fechaAsientoVinculado: FechaContable.fromIso(p.asiento),
  };
}

interface LineaParams {
  comprobanteId?: string;
  orden?: number;
  fecha: string;
  monto: string;
  tipo?: LadoContable;
}

function lineaBase(p: LineaParams) {
  return {
    comprobanteId: p.comprobanteId ?? `comp-${p.fecha}-${p.monto}`,
    orden: p.orden ?? 1,
    fecha: FechaContable.fromIso(p.fecha),
    monto: Money.of(p.monto),
    tipo: p.tipo ?? ('CREDITO' as const),
  };
}

function enTransito(p: LineaParams): LineaParaInforme {
  return { ...lineaBase(p), estadoEfectivo: 'EN_TRANSITO' };
}

function conciliada(p: LineaParams & { movimiento: string }): LineaParaInforme {
  return {
    ...lineaBase(p),
    estadoEfectivo: 'CONCILIADO',
    fechaMovimientoVinculado: FechaContable.fromIso(p.movimiento),
  };
}

function insumos(partial: {
  corte?: string;
  arranque?: { fecha: string; residual: string };
  saldoExtracto?: string | null;
  saldoLibros?: string;
  movimientos?: MovimientoParaInforme[];
  lineas?: LineaParaInforme[];
}): InsumosInforme {
  const arranque = partial.arranque ?? { fecha: '2026-06-30', residual: '0' };
  return {
    corte: FechaContable.fromIso(partial.corte ?? '2026-07-31'),
    arranque: {
      fecha: FechaContable.fromIso(arranque.fecha),
      diferenciaResidual: Money.of(arranque.residual),
    },
    saldoExtracto: partial.saldoExtracto === null ? null : Money.of(partial.saldoExtracto ?? '0'),
    saldoLibros: Money.of(partial.saldoLibros ?? '0'),
    movimientos: partial.movimientos ?? [],
    lineas: partial.lineas ?? [],
  };
}

describe('armarInforme (REQ-ICB-01/02/03/04/06/07)', () => {
  // REQ-ICB-02 escenario 1: cada grupo aparece como partida separada y la
  // identidad cierra con residuo cero. Los CONCILIADOS al corte se cancelan
  // contra su contrapartida y NO son partida.
  it('partidas de los tres tipos → cada grupo separado y la identidad cierra en cero', () => {
    // Arranque 30/06 en 1000=1000. Julio del banco: +500 (conciliado),
    // −100 (pendiente), −10 (ignorado) ⇒ extracto 1390. Julio de libros:
    // +500 (conciliada), −200 (en tránsito) ⇒ libros 1300.
    const informe = armarInforme(
      insumos({
        saldoExtracto: '1390',
        saldoLibros: '1300',
        movimientos: [
          conciliado({ fecha: '2026-07-04', monto: '500', tipo: 'CREDITO', asiento: '2026-07-05' }),
          pendiente({ id: 'm-pend', fecha: '2026-07-10', monto: '100' }),
          ignorado({ id: 'm-ign', fecha: '2026-07-12', monto: '10' }),
        ],
        lineas: [
          conciliada({
            fecha: '2026-07-05',
            monto: '500',
            tipo: 'DEBITO',
            movimiento: '2026-07-04',
          }),
          enTransito({ comprobanteId: 'c-trans', fecha: '2026-07-20', monto: '200' }),
        ],
      }),
    );

    expect(informe.partidas.pendientes.importe.toBob()).toBe('100.00');
    expect(informe.partidas.pendientes.detalle).toHaveLength(1);
    expect(informe.partidas.pendientes.detalle[0]?.movimientoId).toBe('m-pend');

    expect(informe.partidas.ignorados.importe.toBob()).toBe('10.00');
    expect(informe.partidas.ignorados.detalle).toHaveLength(1);

    expect(informe.partidas.enTransito.importe.toBob()).toBe('-200.00');
    expect(informe.partidas.enTransito.detalle).toHaveLength(1);
    expect(informe.partidas.enTransito.detalle[0]?.comprobanteId).toBe('c-trans');

    expect(informe.partidas.arranque.importe.toBob()).toBe('0.00');
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // REQ-ICB-02 escenario 2 — la trampa IGNORADO. Es un movimiento REAL del
  // banco, dentro del saldo publicado, sin contrapartida contable POR
  // DECISIÓN. Omitirlo rompería la identidad sobre datos correctos (residuo
  // fantasma); absorberlo la haría cerrar mintiendo.
  it('IGNORADO figura como partida con nombre propio — ni omitido ni absorbido', () => {
    const informe = armarInforme(
      insumos({
        saldoExtracto: '964.50', // 1000 − 35.50 que el banco cobró y libros jamás asentarán
        saldoLibros: '1000',
        movimientos: [ignorado({ id: 'comision', fecha: '2026-07-15', monto: '35.50' })],
      }),
    );

    // Nombre propio: partida IGNORADOS, no un renglón más de pendientes.
    expect(informe.partidas.ignorados.detalle).toHaveLength(1);
    expect(informe.partidas.ignorados.detalle[0]?.movimientoId).toBe('comision');
    expect(informe.partidas.ignorados.importe.toBob()).toBe('35.50');
    expect(informe.partidas.pendientes.detalle).toHaveLength(0);

    // No omitido: la identidad cierra EXACTAMENTE porque la partida existe.
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // REQ-ICB-06 — el residuo es el hallazgo. Se expone con su importe y
  // ninguna partida se estira para forzar el cuadre.
  it('residuo ≠ 0 se expone con su importe y ninguna partida se altera para absorberlo', () => {
    // El banco publica 850: hay 50 que salieron de la cuenta y que ni los
    // movimientos importados ni los libros explican.
    const informe = armarInforme(
      insumos({
        saldoExtracto: '850',
        saldoLibros: '1000',
        movimientos: [pendiente({ fecha: '2026-07-10', monto: '100' })],
      }),
    );

    expect(informe.residuo?.toBob()).toBe('50.00');
    // La partida conserva su importe real: no absorbió los 50.
    expect(informe.partidas.pendientes.importe.toBob()).toBe('100.00');
    expect(informe.partidas.ignorados.importe.isZero()).toBe(true);
    expect(informe.partidas.enTransito.importe.isZero()).toBe(true);
    expect(informe.partidas.arranque.importe.isZero()).toBe(true);
  });

  // REQ-ICB-07 — julio CERRADO, cargo del 31/07 asentado el 15/08. Al corte
  // 31/07 la diferencia existe y NUNCA llegará a cero en ese corte: el
  // asiento ya existe pero cae después. Se representa sin degradarse.
  it('diferencia permanente de período cerrado: conciliado con asiento posterior al corte sigue siendo partida, señalada', () => {
    const informe = armarInforme(
      insumos({
        corte: '2026-07-31',
        saldoExtracto: '900',
        saldoLibros: '1000',
        movimientos: [
          conciliado({
            id: 'cargo-julio',
            fecha: '2026-07-31',
            monto: '100',
            asiento: '2026-08-15',
          }),
        ],
      }),
    );

    // La partida se muestra, con la fecha del asiento que la resolverá en
    // OTRO corte — el informe se emite normalmente, sin tratarla como error.
    expect(informe.partidas.pendientes.detalle).toHaveLength(1);
    expect(informe.partidas.pendientes.detalle[0]?.movimientoId).toBe('cargo-julio');
    expect(informe.partidas.pendientes.detalle[0]?.importe.toBob()).toBe('100.00');
    expect(informe.partidas.pendientes.detalle[0]?.asentadoEl?.toIso()).toBe('2026-08-15');
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // REQ-ICB-01 escenario 1, segunda mitad: al corte siguiente ambos
  // acumulados ya incluyen el cargo y la identidad cierra SIN la partida.
  it('el mismo cargo al corte siguiente: la identidad cierra sin esa partida', () => {
    const informe = armarInforme(
      insumos({
        corte: '2026-08-31',
        saldoExtracto: '900',
        saldoLibros: '900',
        movimientos: [conciliado({ fecha: '2026-07-31', monto: '100', asiento: '2026-08-15' })],
        lineas: [
          conciliada({
            fecha: '2026-08-15',
            monto: '100',
            tipo: 'CREDITO',
            movimiento: '2026-07-31',
          }),
        ],
      }),
    );

    expect(informe.partidas.pendientes.detalle).toHaveLength(0);
    expect(informe.partidas.enTransito.detalle).toHaveLength(0);
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // Simétrico del anterior: cheque emitido el 30/07 (los libros ya lo
  // registraron) cobrado por el banco el 02/08. Al corte 31/07 sigue EN
  // TRÁNSITO aunque globalmente esté conciliado.
  it('línea conciliada con movimiento posterior al corte sigue en tránsito al corte, señalada', () => {
    const informe = armarInforme(
      insumos({
        corte: '2026-07-31',
        saldoExtracto: '1000',
        saldoLibros: '800',
        lineas: [
          conciliada({
            comprobanteId: 'cheque',
            fecha: '2026-07-30',
            monto: '200',
            tipo: 'CREDITO',
            movimiento: '2026-08-02',
          }),
        ],
      }),
    );

    expect(informe.partidas.enTransito.detalle).toHaveLength(1);
    expect(informe.partidas.enTransito.detalle[0]?.comprobanteId).toBe('cheque');
    expect(informe.partidas.enTransito.detalle[0]?.importe.toBob()).toBe('-200.00');
    expect(informe.partidas.enTransito.detalle[0]?.registradoPorBancoEl?.toIso()).toBe(
      '2026-08-02',
    );
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // Los signos del puente (REQ-ICB-02): la partida es la contribución FIRMADA
  // para llegar del extracto a los libros.
  it('signos: CREDITO bancario resta, DEBITO bancario suma; DEBITO contable suma, CREDITO contable resta', () => {
    const informe = armarInforme(
      insumos({
        saldoExtracto: null,
        movimientos: [
          pendiente({ fecha: '2026-07-01', monto: '300', tipo: 'CREDITO' }),
          pendiente({ fecha: '2026-07-02', monto: '100', tipo: 'DEBITO' }),
        ],
        lineas: [
          enTransito({ fecha: '2026-07-03', monto: '500', tipo: 'DEBITO' }),
          enTransito({ fecha: '2026-07-04', monto: '200', tipo: 'CREDITO' }),
        ],
      }),
    );

    expect(informe.partidas.pendientes.detalle[0]?.importe.toBob()).toBe('-300.00');
    expect(informe.partidas.pendientes.detalle[1]?.importe.toBob()).toBe('100.00');
    expect(informe.partidas.pendientes.importe.toBob()).toBe('-200.00');
    expect(informe.partidas.enTransito.detalle[0]?.importe.toBob()).toBe('500.00');
    expect(informe.partidas.enTransito.detalle[1]?.importe.toBob()).toBe('-200.00');
    expect(informe.partidas.enTransito.importe.toBob()).toBe('300.00');
  });

  // D3 — el arranque es la COTA: todo lo anterior está absorbido en el saldo
  // declarado. La ventana es `arranque.fecha < fecha ≤ corte`: abierta abajo,
  // cerrada arriba.
  it('la ventana excluye fecha ≤ arranque y fecha > corte, e incluye el día del corte', () => {
    const informe = armarInforme(
      insumos({
        arranque: { fecha: '2026-06-30', residual: '0' },
        corte: '2026-07-31',
        saldoExtracto: null,
        movimientos: [
          pendiente({ id: 'dia-arranque', fecha: '2026-06-30', monto: '10' }),
          pendiente({ id: 'antes', fecha: '2026-06-15', monto: '10' }),
          pendiente({ id: 'despues', fecha: '2026-08-01', monto: '10' }),
          pendiente({ id: 'adentro', fecha: '2026-07-01', monto: '10' }),
        ],
        lineas: [
          enTransito({ comprobanteId: 'linea-fuera', fecha: '2026-06-30', monto: '10' }),
          enTransito({ comprobanteId: 'dia-corte', fecha: '2026-07-31', monto: '10' }),
        ],
      }),
    );

    expect(informe.partidas.pendientes.detalle).toHaveLength(1);
    expect(informe.partidas.pendientes.detalle[0]?.movimientoId).toBe('adentro');
    expect(informe.partidas.enTransito.detalle).toHaveLength(1);
    expect(informe.partidas.enTransito.detalle[0]?.comprobanteId).toBe('dia-corte');
  });

  // REQ-ICB-04 — el residuo declarado al arranque es partida NOMBRADA, con su
  // fecha. Jamás se reparte entre las otras ni se descuenta en silencio.
  it('la diferencia residual del arranque aparece como partida propia con su fecha', () => {
    // Al declarar: extracto 1500, libros 1000, residuo aceptado +500.
    const informe = armarInforme(
      insumos({
        arranque: { fecha: '2026-06-30', residual: '500' },
        saldoExtracto: '1500',
        saldoLibros: '1000',
      }),
    );

    expect(informe.partidas.arranque.fecha.toIso()).toBe('2026-06-30');
    expect(informe.partidas.arranque.importe.toBob()).toBe('-500.00');
    expect(informe.partidas.pendientes.detalle).toHaveLength(0);
    expect(informe.partidas.ignorados.detalle).toHaveLength(0);
    expect(informe.partidas.enTransito.detalle).toHaveLength(0);
    // La identidad cierra EXACTAMENTE porque el residuo declarado es partida.
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // REQ-ICB-03 — el banco no publica saldo en el rango: sin dato no hay
  // veredicto. Las partidas se muestran igual; lo que no se afirma es el
  // cierre de la identidad.
  it('saldoExtracto nulo → residuo nulo, las partidas se calculan igual', () => {
    const informe = armarInforme(
      insumos({
        saldoExtracto: null,
        saldoLibros: '1000',
        movimientos: [pendiente({ fecha: '2026-07-10', monto: '100' })],
      }),
    );

    expect(informe.saldoExtracto).toBeNull();
    expect(informe.residuo).toBeNull();
    expect(informe.partidas.pendientes.detalle).toHaveLength(1);
  });

  it('sin movimientos, sin líneas y residual cero → todo en cero', () => {
    const informe = armarInforme(insumos({ saldoExtracto: '1000', saldoLibros: '1000' }));

    expect(informe.partidas.pendientes.importe.isZero()).toBe(true);
    expect(informe.partidas.ignorados.importe.isZero()).toBe(true);
    expect(informe.partidas.enTransito.importe.isZero()).toBe(true);
    expect(informe.partidas.arranque.importe.isZero()).toBe(true);
    expect(informe.residuo?.isZero()).toBe(true);
  });

  // `vigenteA` garantiza `fecha ≤ corte`; si el caller rompe ese contrato la
  // identidad no significa nada — error de programación, no de dominio.
  it('corte anterior al arranque → RangeError', () => {
    expect(() =>
      armarInforme(
        insumos({
          arranque: { fecha: '2026-08-01', residual: '0' },
          corte: '2026-07-31',
          saldoExtracto: null,
        }),
      ),
    ).toThrow(RangeError);
  });

  it('el informe ecoa corte y saldos usados (REQ-ICB-08)', () => {
    const informe = armarInforme(
      insumos({ corte: '2026-07-31', saldoExtracto: '1390.25', saldoLibros: '1300.75' }),
    );

    expect(informe.corte.toIso()).toBe('2026-07-31');
    expect(informe.saldoExtracto?.toBob()).toBe('1390.25');
    expect(informe.saldoLibros.toBob()).toBe('1300.75');
  });
});
