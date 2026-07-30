import { componerGlosaComprobanteCobro } from './glosa-cobro';

/**
 * Q-2 (REQ-CXC-02): la glosa del comprobante del cobro DEBE sostenerse sola en
 * el Libro Diario — identifica la operación y el cliente sin abrir el cobro.
 * `"Cobro #<id>"` NO cumple. Estos tests fallan si alguien degrada la glosa a
 * un identificador opaco.
 */
describe('componerGlosaComprobanteCobro (Q-2)', () => {
  it('identifica la operación y nombra al cliente', () => {
    const glosa = componerGlosaComprobanteCobro({
      razonSocialContacto: 'Avícola Sur',
      glosaCobro: '',
    });

    expect(glosa).toContain('Cobro');
    expect(glosa).toContain('Avícola Sur');
  });

  it('anexa la glosa del cobro cuando existe', () => {
    const glosa = componerGlosaComprobanteCobro({
      razonSocialContacto: 'Granja Norte SRL',
      glosaCobro: 'efectivo recibido en planta',
    });

    expect(glosa).toBe('Cobro a Granja Norte SRL — efectivo recibido en planta');
  });

  it('sin glosa del cobro sigue siendo autosuficiente (no queda colgando el separador)', () => {
    const glosa = componerGlosaComprobanteCobro({
      razonSocialContacto: 'Avícola Sur',
      glosaCobro: '   ',
    });

    expect(glosa).toBe('Cobro a Avícola Sur');
  });

  it('NO es un identificador opaco: nunca la forma "Cobro #<id>"', () => {
    const glosa = componerGlosaComprobanteCobro({
      razonSocialContacto: 'Avícola Sur',
      glosaCobro: '',
    });

    expect(glosa).not.toMatch(/^Cobro #\S+$/);
    // La señal positiva: el cliente está nombrado, no referenciado.
    expect(glosa).toContain('Avícola Sur');
  });
});
