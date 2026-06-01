import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from './permissions';

describe('PERMISSIONS.granja', () => {
  it('dashboard.read === granja.dashboard.read', () => {
    expect(PERMISSIONS.granja.dashboard.read).toBe('granja.dashboard.read');
  });

  it('lotes.create === granja.lotes.create', () => {
    expect(PERMISSIONS.granja.lotes.create).toBe('granja.lotes.create');
  });

  it('lotes.read === granja.lotes.read', () => {
    expect(PERMISSIONS.granja.lotes.read).toBe('granja.lotes.read');
  });

  it('lotes.update === granja.lotes.update', () => {
    expect(PERMISSIONS.granja.lotes.update).toBe('granja.lotes.update');
  });

  it('lotes.delete === granja.lotes.delete', () => {
    expect(PERMISSIONS.granja.lotes.delete).toBe('granja.lotes.delete');
  });

  // G-9: asimetría intencional — key camel `tiposRegistro` ↔ string kebab `granja.tipos-registro.*`
  it('tiposRegistro.read === granja.tipos-registro.read (clave camel, string kebab)', () => {
    expect(PERMISSIONS.granja.tiposRegistro.read).toBe('granja.tipos-registro.read');
  });

  it('tiposRegistro.create === granja.tipos-registro.create', () => {
    expect(PERMISSIONS.granja.tiposRegistro.create).toBe('granja.tipos-registro.create');
  });

  it('tiposRegistro.update === granja.tipos-registro.update', () => {
    expect(PERMISSIONS.granja.tiposRegistro.update).toBe('granja.tipos-registro.update');
  });

  it('tiposRegistro.delete === granja.tipos-registro.delete', () => {
    expect(PERMISSIONS.granja.tiposRegistro.delete).toBe('granja.tipos-registro.delete');
  });

  it('movimientos.create === granja.movimientos.create', () => {
    expect(PERMISSIONS.granja.movimientos.create).toBe('granja.movimientos.create');
  });

  it('movimientos.read === granja.movimientos.read', () => {
    expect(PERMISSIONS.granja.movimientos.read).toBe('granja.movimientos.read');
  });

  it('movimientos.update === granja.movimientos.update', () => {
    expect(PERMISSIONS.granja.movimientos.update).toBe('granja.movimientos.update');
  });

  it('movimientos.delete === granja.movimientos.delete', () => {
    expect(PERMISSIONS.granja.movimientos.delete).toBe('granja.movimientos.delete');
  });

  it('chat.interact === granja.chat.interact', () => {
    expect(PERMISSIONS.granja.chat.interact).toBe('granja.chat.interact');
  });
});
