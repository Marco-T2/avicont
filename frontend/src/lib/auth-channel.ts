// Canal de sincronización de sesión entre pestañas del MISMO navegador
// (CLAUDE.md §10.10). Todas las pestañas comparten la cookie httpOnly del
// refresh token, así que al cerrar sesión en una, las demás quedarían con un
// accessToken en memoria que ya no se puede refrescar. BroadcastChannel les
// avisa de inmediato en vez de esperar a su próximo 401.

const CHANNEL_NAME = 'auth';
const LOGOUT_MESSAGE = 'logout';

// BroadcastChannel no existe en navegadores viejos ni en algunos entornos de
// test/SSR. Sin soporte, las funciones degradan a no-op (la sesión sigue
// funcionando, solo se pierde la sincronización inmediata entre pestañas).
function supported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/** Notifica a las demás pestañas que la sesión se cerró en esta. */
export function broadcastLogout(): void {
  if (!supported()) return;
  // NO cerrar el canal acá: close() síncrono justo después de postMessage()
  // puede descartar el mensaje en algunos navegadores (el dispatch a las otras
  // pestañas se encola como tarea). Sin listeners ni referencias, el canal
  // queda elegible para GC al salir de la función.
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(LOGOUT_MESSAGE);
}

/**
 * Suscribe un handler al logout emitido por OTRAS pestañas. Por el spec de
 * BroadcastChannel, la pestaña que emite NO recibe su propio mensaje, así que
 * la que cierra sesión no se auto-notifica.
 *
 * @returns función de desuscripción (idempotente, segura sin soporte).
 */
export function onLogoutFromOtherTab(handler: () => void): () => void {
  if (!supported()) return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const listener = (event: MessageEvent): void => {
    if (event.data === LOGOUT_MESSAGE) handler();
  };
  channel.addEventListener('message', listener);
  return () => {
    channel.removeEventListener('message', listener);
    channel.close();
  };
}
