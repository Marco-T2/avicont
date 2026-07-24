// Registro de adaptadores de extracto (decisión 11 / design §4.5). Agrega
// todas las instancias de `ExtractoParserPort` inyectadas bajo el token
// `EXTRACTO_PARSERS` y valida, al construirse, que:
//   (a) ningún perfil está duplicado entre dos adapters, y
//   (b) TODOS los valores del enum `PerfilExtracto` tienen un adapter.
//
// Fail-fast en bootstrap: agregar un valor a `PerfilExtracto` sin su adapter
// correspondiente rompe el arranque de la app, no producción.
//
// v1: NO se wirea todavía como provider de `conciliacion-bancaria.module.ts`
// — los 3 adapters concretos llegan en slices 3-4 (ver tasks.md 1.12/3.33/4.9).
// Wirearlo hoy con una lista incompleta haría fallar el bootstrap de TODA la
// app. Esta clase se valida de forma standalone (este spec) hasta que el
// primer adapter real exista.

import { Inject, Injectable } from '@nestjs/common';
import { PerfilExtracto } from '@prisma/client';

import type { DescriptorPerfilExtracto, ExtractoParserPort } from './extracto-parser.port';

export const EXTRACTO_PARSERS = Symbol('EXTRACTO_PARSERS');

@Injectable()
export class ExtractoParserRegistry {
  private readonly porPerfil: ReadonlyMap<PerfilExtracto, ExtractoParserPort>;

  constructor(@Inject(EXTRACTO_PARSERS) parsers: readonly ExtractoParserPort[]) {
    const map = new Map<PerfilExtracto, ExtractoParserPort>();

    for (const parser of parsers) {
      const { perfil } = parser.descriptor;
      if (map.has(perfil)) {
        throw new Error(
          `ExtractoParserRegistry: perfil duplicado '${perfil}' — dos adapters registran el mismo perfil de extracto.`,
        );
      }
      map.set(perfil, parser);
    }

    const faltantes = Object.values(PerfilExtracto).filter((perfil) => !map.has(perfil));
    if (faltantes.length > 0) {
      throw new Error(
        `ExtractoParserRegistry: falta adapter para el/los perfil(es): ${faltantes.join(', ')}.`,
      );
    }

    this.porPerfil = map;
  }

  /** Metadata de todos los perfiles registrados — única fuente de verdad para la UI. */
  descriptores(): DescriptorPerfilExtracto[] {
    return Array.from(this.porPerfil.values(), (p) => p.descriptor);
  }

  /** Devuelve el adapter del perfil. Lanza si no está registrado (no debería ocurrir tras el fail-fast del constructor). */
  para(perfil: PerfilExtracto): ExtractoParserPort {
    const parser = this.porPerfil.get(perfil);
    if (!parser) {
      throw new Error(
        `ExtractoParserRegistry: no hay adapter registrado para el perfil '${perfil}'.`,
      );
    }
    return parser;
  }
}
