import { componerGlosaComprobanteVenta } from './glosa-venta';

/**
 * Q-2 (REQ-VTA-04): la glosa del comprobante DEBE sostenerse sola en el Libro
 * Diario — identifica la operación y el cliente sin abrir la venta.
 * `"Venta #42"` NO cumple. Estos tests fallan si alguien degrada la glosa a un
 * identificador opaco.
 */
describe('componerGlosaComprobanteVenta (Q-2)', () => {
  it('identifica operación y cliente en una venta al contado', () => {
    const glosa = componerGlosaComprobanteVenta({
      condicionPago: 'CONTADO',
      razonSocialContacto: 'Avícola Sur',
      glosaVenta: '',
    });

    expect(glosa).toContain('Venta al contado');
    expect(glosa).toContain('Avícola Sur');
  });

  it('identifica operación y cliente en una venta a crédito', () => {
    const glosa = componerGlosaComprobanteVenta({
      condicionPago: 'CREDITO',
      razonSocialContacto: 'Granja Norte SRL',
      glosaVenta: '',
    });

    expect(glosa).toContain('Venta a crédito');
    expect(glosa).toContain('Granja Norte SRL');
  });

  it('anexa la glosa de la venta cuando existe', () => {
    const glosa = componerGlosaComprobanteVenta({
      condicionPago: 'CONTADO',
      razonSocialContacto: 'Avícola Sur',
      glosaVenta: 'entrega en planta Quillacollo',
    });

    expect(glosa).toBe('Venta al contado a Avícola Sur — entrega en planta Quillacollo');
  });

  it('sin glosa de venta sigue siendo autosuficiente (no queda colgando el separador)', () => {
    const glosa = componerGlosaComprobanteVenta({
      condicionPago: 'CONTADO',
      razonSocialContacto: 'Avícola Sur',
      glosaVenta: '   ',
    });

    expect(glosa).toBe('Venta al contado a Avícola Sur');
  });

  it('NO es un identificador opaco: nunca la forma "Venta #<id>"', () => {
    const glosa = componerGlosaComprobanteVenta({
      condicionPago: 'CREDITO',
      razonSocialContacto: 'Avícola Sur',
      glosaVenta: '',
    });

    expect(glosa).not.toMatch(/^Venta #\S+$/);
    // La señal positiva: el cliente está nombrado, no referenciado.
    expect(glosa).toContain('Avícola Sur');
  });
});
