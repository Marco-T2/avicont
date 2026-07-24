import { PerfilExtracto } from '@/types/api';

/**
 * Catálogo ESTÁTICO de perfiles v1, con labels user-facing.
 *
 * Deuda documentada (slice 1 → slice 3): el backend expone
 * `GET /api/cuentas-bancarias/perfiles` (`registry.descriptores()`) recién
 * cuando `ExtractoParserRegistry` tenga adapters reales wireados (slices 3-4
 * de `conciliacion-bancaria` — el registry es fail-fast en bootstrap y
 * wirearlo hoy con 0 parsers rompería el arranque de toda la app, ver
 * `backend/src/conciliacion-bancaria/ports/extracto-parser.registry.ts`).
 * Hasta entonces, el selector usa este catálogo estático — mismos 3 valores
 * del enum `PerfilExtracto`, sin `banco`/`formato`/instructivo de descarga.
 * Cuando el endpoint exista, reemplazar este archivo por un hook
 * `usePerfilesExtracto()` que lo consuma.
 */
export const PERFIL_EXTRACTO_OPTIONS: ReadonlyArray<{ value: PerfilExtracto; label: string }> = [
  { value: PerfilExtracto.BANCOSOL_XLSX, label: 'Banco Sol — Excel (.xlsx)' },
  { value: PerfilExtracto.ECONOMICO_XLSX, label: 'Banco Económico — Excel (.xlsx)' },
  { value: PerfilExtracto.UNION_XLSX, label: 'Banco Unión — Excel (.xlsx)' },
];
