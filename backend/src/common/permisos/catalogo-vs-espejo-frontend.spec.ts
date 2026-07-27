// Confronta el espejo de permisos del frontend contra el catálogo del backend.
//
// `frontend/src/lib/permissions.ts` declara en su propia cabecera que sus
// strings "DEBEN espejar EXACTAMENTE el catálogo del backend". Nadie lo
// verificaba: el espejo declaraba `organizacion.features.read`, que no existe
// en el catálogo (el backend lo llama `organizacion.feature-flags.read`). Ese
// string gateaba el ítem de menú "Módulos activos" y la ruta /settings/features,
// así que la pantalla era invisible para todo rol personalizado — sólo entraban
// OWNER/ADMIN por el wildcard '*' del resolver. El checkbox existía en el editor
// de roles y no hacía nada.
//
// El test vive en el backend, que es el dueño del catálogo, y lee el archivo del
// frontend como TEXTO. Alternativa descartada: importar el catálogo desde vitest
// —el frontend tendría que resolver un módulo fuera de su root y eso se paga en
// el `tsc -b` del build, no en la suite.
//
// Dirección de la invariante: el espejo ⊆ catálogo. La inversa NO es un error —
// el frontend sólo declara constantes para los permisos que usa, y no tiene por
// qué enumerar los 12 de Ventas/Compras que todavía no existen.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { permisoExisteEnCatalogo } from './catalogo';

const ESPEJO = resolve(__dirname, '../../../../frontend/src/lib/permissions.ts');

describe('espejo de permisos del frontend vs catálogo del backend', () => {
  it('encuentra el archivo del espejo', () => {
    // Si el frontend se mueve de lugar, este test tiene que gritar en vez de
    // pasar en verde sobre cero permisos.
    expect(existsSync(ESPEJO)).toBe(true);
  });

  it('todo permiso declarado en el frontend existe en el catálogo', () => {
    const contenido = readFileSync(ESPEJO, 'utf8');

    // Sólo literales con forma de permiso fino `{modulo}.{submodulo}.{accion}`.
    // Los comentarios del archivo pueden mencionar permisos viejos a modo de
    // explicación, así que se los saca antes de escanear.
    const sinComentarios = contenido.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const declarados = [
      ...new Set(
        [...sinComentarios.matchAll(/'([a-z][a-z0-9-]*\.[a-z0-9-]+\.[a-z0-9-]+)'/g)].map(
          (m) => m[1]!,
        ),
      ),
    ];

    expect(declarados.length).toBeGreaterThan(40);

    const inexistentes = declarados.filter((key) => !permisoExisteEnCatalogo(key));
    expect(inexistentes).toEqual([]);
  });
});
