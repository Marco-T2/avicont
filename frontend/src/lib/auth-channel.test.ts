import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { broadcastLogout, onLogoutFromOtherTab } from './auth-channel';

// Fake determinista de BroadcastChannel: registro compartido entre instancias,
// entrega síncrona, respeta la regla del spec "no se entrega al emisor".
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  name: string;
  closed = false;
  private listeners: Array<(e: MessageEvent) => void> = [];

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    for (const inst of FakeBroadcastChannel.instances) {
      if (inst === this || inst.closed || inst.name !== this.name) continue;
      inst.listeners.forEach((l) => l({ data } as MessageEvent));
    }
  }

  addEventListener(_type: 'message', cb: (e: MessageEvent) => void): void {
    this.listeners.push(cb);
  }

  removeEventListener(_type: 'message', cb: (e: MessageEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  close(): void {
    this.closed = true;
  }
}

describe('auth-channel', () => {
  beforeEach(() => {
    FakeBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('onLogoutFromOtherTab dispara el handler cuando otra pestaña emite logout', () => {
    const handler = vi.fn();
    onLogoutFromOtherTab(handler);

    broadcastLogout(); // simula "otra pestaña" (instancia distinta)

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignora mensajes que no sean de logout', () => {
    const handler = vi.fn();
    onLogoutFromOtherTab(handler);

    // Una instancia ajena publica otro tipo de mensaje.
    const otra = new FakeBroadcastChannel('auth');
    otra.postMessage({ type: 'algo-mas' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('la función de desuscripción deja de recibir', () => {
    const handler = vi.fn();
    const unsubscribe = onLogoutFromOtherTab(handler);

    unsubscribe();
    broadcastLogout();

    expect(handler).not.toHaveBeenCalled();
  });

  it('sin soporte de BroadcastChannel: no-op sin throw', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const handler = vi.fn();

    expect(() => {
      const unsubscribe = onLogoutFromOtherTab(handler);
      broadcastLogout();
      unsubscribe();
    }).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
