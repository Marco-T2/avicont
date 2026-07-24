import { leerMontoCelda } from './dinero';
import type { DialectoMonto } from './dinero';

// Dialecto boliviano/US estándar: miles ',', decimal '.' — el usado por
// BCP/Fortaleza/Unión/FIE en los casos reales de design §8.1.
const DIALECTO_US: DialectoMonto = { separadorMiles: ',', separadorDecimal: '.' };
const DIALECTO_EU: DialectoMonto = { separadorMiles: '.', separadorDecimal: ',' };

// Boundary de parsing — testeable sin DB (design §8.1). El string crudo
// NUNCA se convierte a `number` para el monto; toda coerción vive acá.
describe('leerMontoCelda (design §8.1, caso #953)', () => {
  it('caso real BCP: precisión de float residual — 4.6500000000000004 → 4.65 exacto, nunca Number()', () => {
    const resultado = leerMontoCelda('4.6500000000000004', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('4.65');
  });

  it('caso real Fortaleza: prefijo de moneda "Bs.  16,000.00" se quita, miles se quita', () => {
    const resultado = leerMontoCelda('Bs.  16,000.00', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('16000.00');
  });

  it('caso real Unión XLSX: padding + miles + signo positivo → CREDITO', () => {
    const resultado = leerMontoCelda('             12,600.00', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('12600.00');
    expect(resultado.tipo).toBe('CREDITO');
  });

  it('caso real Unión XLSX: padding + signo negativo → DEBITO, monto siempre positivo', () => {
    const resultado = leerMontoCelda('               -900.00', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('900.00');
    expect(resultado.tipo).toBe('DEBITO');
  });

  it('caso real FIE: signo "+" explícito → CREDITO', () => {
    const resultado = leerMontoCelda('+50,450.00', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('50450.00');
    expect(resultado.tipo).toBe('CREDITO');
  });

  it('caso real FIE: signo "-" → DEBITO', () => {
    const resultado = leerMontoCelda('-31,000.00', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('31000.00');
    expect(resultado.tipo).toBe('DEBITO');
  });

  it('sin signo explícito y sin prefijo → CREDITO por default (columna ya no ambigua para el caller)', () => {
    const resultado = leerMontoCelda('100.00', DIALECTO_US);
    expect(resultado.tipo).toBe('CREDITO');
  });

  it('prefijo USD reconocido y quitado', () => {
    const resultado = leerMontoCelda('USD 250.50', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('250.50');
  });

  it('prefijo $us. reconocido y quitado', () => {
    const resultado = leerMontoCelda('$us. 100.00', DIALECTO_US);
    expect(resultado.monto.toBob()).toBe('100.00');
  });

  it('dialecto europeo (miles ".", decimal ",") — flag explícito, nunca inferido por sniffing', () => {
    const resultado = leerMontoCelda('1.234,56', DIALECTO_EU);
    expect(resultado.monto.toBob()).toBe('1234.56');
  });

  it('rechaza celda vacía', () => {
    expect(() => leerMontoCelda('', DIALECTO_US)).toThrow();
  });

  it('rechaza contenido no numérico', () => {
    expect(() => leerMontoCelda('N/A', DIALECTO_US)).toThrow();
  });
});
