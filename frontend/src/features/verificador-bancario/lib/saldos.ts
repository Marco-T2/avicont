import type { SaldoCuentaBancaria } from '@/types/api';

/**
 * REQ-VMB-10: el saldo vigente responde "cuánto tengo hoy para transferir".
 * Si el último movimiento importado es anterior al corte (`hasta`), el saldo
 * puede estar viejo y la UI DEBE marcarlo — un saldo viejo presentado como
 * saldo de hoy es una respuesta incorrecta.
 *
 * Comparación lexicográfica: `YYYY-MM-DD` ordena igual que el calendario (§4.6,
 * sin `new Date` ni timezone). `null` (cuenta sin movimientos) no marca
 * desactualización: tiene su propio indicador "sin movimientos".
 */
export function estaSaldoDesactualizado(
  fechaUltimoMovimiento: string | null,
  hasta: string,
): boolean {
  return fechaUltimoMovimiento !== null && fechaUltimoMovimiento < hasta;
}

/**
 * §4.5: los montos son strings decimales y NUNCA pasan por aritmética float
 * (0.10 + 0.20 en IEEE-754 da 0.30000000000000004). Se suma en centavos
 * enteros y se vuelve a string con 2 decimales.
 */
export function sumarMontos(montos: string[]): string {
  const totalCentavos = montos.reduce((acc, monto) => acc + aCentavos(monto), 0);
  return deCentavos(totalCentavos);
}

function aCentavos(monto: string): number {
  const negativo = monto.startsWith('-');
  const cuerpo = negativo ? monto.slice(1) : monto;
  const [entera = '0', decimal = ''] = cuerpo.split('.');
  const centavos = Number(entera) * 100 + Number(`${decimal}00`.slice(0, 2));
  return negativo ? -centavos : centavos;
}

function deCentavos(centavos: number): string {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface ResumenSaldosMoneda {
  moneda: SaldoCuentaBancaria['moneda'];
  /** `null` cuando NINGUNA cuenta de la moneda publica saldo — nunca "0.00". */
  suma: string | null;
  cuentasSumadas: number;
  /** Cuentas con `saldo=null`: EXCLUIDAS de la suma, jamás contadas como 0 (REQ-VMB-09/10). */
  cuentasSinSaldo: number;
}

/**
 * Subtotales de saldos SOLO entre cuentas de la MISMA moneda (REQ-VMB-10) —
 * no existe conversión ni total combinado. El orden de las monedas respeta la
 * primera aparición en la franja.
 */
export function resumirSaldosPorMoneda(saldos: SaldoCuentaBancaria[]): ResumenSaldosMoneda[] {
  const ordenMonedas: SaldoCuentaBancaria['moneda'][] = [];
  const grupos = new Map<SaldoCuentaBancaria['moneda'], { conSaldo: string[]; sinSaldo: number }>();

  for (const s of saldos) {
    const grupo = grupos.get(s.moneda) ?? { conSaldo: [], sinSaldo: 0 };
    if (!grupos.has(s.moneda)) {
      ordenMonedas.push(s.moneda);
      grupos.set(s.moneda, grupo);
    }
    if (s.saldo !== null) grupo.conSaldo.push(s.saldo);
    else grupo.sinSaldo += 1;
  }

  return ordenMonedas.map((moneda) => {
    const grupo = grupos.get(moneda) as { conSaldo: string[]; sinSaldo: number };
    return {
      moneda,
      suma: grupo.conSaldo.length > 0 ? sumarMontos(grupo.conSaldo) : null,
      cuentasSumadas: grupo.conSaldo.length,
      cuentasSinSaldo: grupo.sinSaldo,
    };
  });
}
