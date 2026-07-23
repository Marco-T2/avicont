/**
 * Lookup LENIENTE de `ExtractoParserPort` por `PerfilExtracto`.
 *
 * `ports/extracto-parser.registry.ts` (slice 1) es fail-fast: su constructor
 * exige que TODOS los valores del enum `PerfilExtracto` tengan adapter, o
 * revienta el bootstrap (design §4.5). Desde el slice 4 (`UNION_XLSX`), los 3
 * valores de v1 tienen adapter y `ExtractoParserRegistry` SÍ se provee en
 * `conciliacion-bancaria.module.ts` — su chequeo de bootstrap corre en cada
 * arranque de la app.
 *
 * Esta clase se mantuvo sin cambios como el lookup que consumen
 * `ExtractoImportadorService` y `CuentasBancariasController` (cerrar el TODO
 * histórico del slice 3 sin tocar esos dos archivos ni sus specs — cero
 * blast radius sobre código ya probado). `buscar()` sigue devolviendo
 * `undefined` (no lanza) si un perfil no tiene adapter; con los 3 perfiles
 * registrados esa rama queda inalcanzable en runtime, y el fail-fast de
 * `ExtractoParserRegistry` es la red que lo garantiza en bootstrap.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { PerfilExtracto } from '@prisma/client';

import { EXTRACTO_PARSERS } from './ports/extracto-parser.registry';
import type { DescriptorPerfilExtracto, ExtractoParserPort } from './ports/extracto-parser.port';

@Injectable()
export class ExtractoParserLookupService {
  private readonly porPerfil: ReadonlyMap<PerfilExtracto, ExtractoParserPort>;

  constructor(@Inject(EXTRACTO_PARSERS) parsers: readonly ExtractoParserPort[]) {
    const map = new Map<PerfilExtracto, ExtractoParserPort>();
    for (const parser of parsers) {
      map.set(parser.descriptor.perfil, parser);
    }
    this.porPerfil = map;
  }

  /** Metadata de los perfiles que SÍ tienen adapter hoy — alimenta `GET /perfiles`. */
  descriptores(): DescriptorPerfilExtracto[] {
    return Array.from(this.porPerfil.values(), (p) => p.descriptor);
  }

  /** `undefined` si el perfil todavía no tiene adapter registrado (nunca lanza). */
  buscar(perfil: PerfilExtracto): ExtractoParserPort | undefined {
    return this.porPerfil.get(perfil);
  }
}
