/**
 * Lookup LENIENTE de `ExtractoParserPort` por `PerfilExtracto` — medida
 * INTERINA del slice 3, documentada como deviation en el reporte de apply.
 *
 * `ports/extracto-parser.registry.ts` (slice 1) es fail-fast: su constructor
 * exige que TODOS los valores del enum `PerfilExtracto` (3 en v1) tengan
 * adapter, o revienta el bootstrap (design §4.5). El slice 3 solo trae 2 de 3
 * (`BANCOSOL_XLSX`, `ECONOMICO_XLSX` — `UNION_XLSX` llega en el slice 4), así
 * que wirear `ExtractoParserRegistry` como provider de Nest en este punto
 * haría fallar el arranque de TODA la app.
 *
 * Esta clase NO reemplaza a `ExtractoParserRegistry` — es un lookup parcial,
 * sin fail-fast, para los perfiles que SÍ tienen adapter hoy. `buscar()`
 * devuelve `undefined` (no lanza) cuando el perfil todavía no tiene adapter;
 * el caller (`ExtractoImportadorService`) lo traduce a un 422 normal — un
 * usuario intentando importar contra una `CuentaBancaria` `UNION_XLSX` antes
 * del slice 4 recibe un error de negocio, no un crash de bootstrap.
 *
 * TODO(slice 4, task 4.9): cuando el parser de Unión exista, reemplazar el
 * wiring de `conciliacion-bancaria.module.ts` para usar la
 * `ExtractoParserRegistry` real (fail-fast, cubre los 3 valores del enum) en
 * lugar de esta clase — o mantener esta clase pero alimentada por una
 * `ExtractoParserRegistry` ya validada. Cualquiera de las dos cierra la
 * brecha; queda a criterio de quien implemente el slice 4.
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
