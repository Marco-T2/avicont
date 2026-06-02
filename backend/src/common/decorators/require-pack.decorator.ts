import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PACK_KEY = 'require-pack';

/**
 * Marca que un endpoint pertenece a un PACK opcional (eje 2 de la plataforma).
 * El `PackEnabledGuard` rechaza con 404 si ese pack no está ACTIVO para la
 * organización del request (la cadena entitlement → activación, ver
 * `docs/disenos/packs-eje2.md` §5.1/§5.2).
 *
 * Espejo de `@RequireModule` (eje 1 / vertical), pero ortogonal: un pack vive
 * DENTRO de un vertical. Usar 404 (y no 403) es deliberado: si el pack está
 * apagado, el endpoint no existe a efectos prácticos y no debe revelar que
 * existe-pero-apagado.
 *
 * La clave es la del catálogo, namespaced por vertical. Ej: "contabilidad.adjuntos".
 */
export const RequirePack = (clave: string) => SetMetadata(REQUIRE_PACK_KEY, clave);
