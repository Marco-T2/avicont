# Proposal: Estilos esenciales en exportación a Excel

## Intent

Los `.xlsx` exportados (Fases A+B+C) salen completamente PLANOS: sin negritas, sin alineación de montos. Un contador boliviano espera distinguir cabeceras y totales de un vistazo y leer los montos alineados a la derecha. Pulir el formato visual con el mínimo esencial mejora la legibilidad sin tocar el cómputo.

## Scope

### In Scope
- Cabeceras de columna en **negrita** (`fontWeight: 'bold'`).
- Fila(s) de totales en **negrita**.
- Montos **alineados a la derecha** (`align: 'right'`) — solo estilo, no toca el value.
- Razón social (primera línea de la cabecera fiscal) en **negrita** como encabezado del documento.
- Extender el tipo `Celda` (infra compartida) con props de estilo OPCIONALES (`fontWeight?`, `align?`) y propagarlas en `construirHoja`.
- Cobertura de tests del nuevo formato; mantener los existentes verdes.

### Out of Scope
- Títulos con merge de celdas, colores de fondo, bordes (opción "Completo", descartada).
- Etiquetas tipo "NIT:" en los campos fiscales (ver Preguntas abiertas).
- Cualquier cambio en backend, endpoint `/api/comprobantes/export`, migración o lógica de cómputo.
- Lógica de `formato-celda.ts` (`formatearFechaCelda`, `parsearMontoCelda`).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `exportacion-excel`: el builder y los ensambladores DEBEN soportar y aplicar estilos de celda esenciales (negrita en cabeceras/totales/razón social, alineación derecha en montos). Las props de estilo son opcionales y retrocompatibles.

## Approach

Extender `Celda` (`construir-hoja.ts`) con `fontWeight?: 'bold'` y `align?: 'left'|'center'|'right'`, propagados en el `.map` al objeto de `write-excel-file` (la librería ya los soporta, sin instalar nada). `armarCabeceraFiscal` (`cabecera-fiscal.ts`) marca la razón social en negrita. Cada uno de los 5 ensambladores (`exportar-*.ts`) marca su fila de encabezados y su fila de totales en negrita, y alinea las celdas de monto a la derecha. Sin estilo → comportamiento idéntico a hoy.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/lib/export-excel/construir-hoja.ts` | Modified | Extiende `Celda` con `fontWeight?`/`align?`; propaga al builder |
| `frontend/src/lib/export-excel/cabecera-fiscal.ts` | Modified | Razón social en negrita |
| `frontend/src/features/{libro-diario,libro-mayor,balance-general,estado-resultados,comprobantes}/lib/exportar-*.ts` | Modified | Negrita en encabezados/totales; alineación derecha en montos |
| `*.test.ts` (junto a cada archivo anterior) | Modified | Cobertura del nuevo formato |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cambio transversal: extender `Celda` toca infra + 5 exportadores + tests | High | Props de estilo OPCIONALES → retrocompatibilidad por la forma; rollout en un solo PR atómico |
| Romper §4.5 (recálculo de montos) al alinear | Low | `align` es solo presentación; el value sigue saliendo de `parsearMontoCelda` sin tocar |
| Drift entre los 5 ensambladores (uno sin estilo) | Med | Test por ensamblador que verifique negrita/alineación en las celdas esperadas |

## Rollback Plan

Revert del PR. Es frontend-puro, sin estado persistente, sin migración, sin contrato backend: revertir restaura el comportamiento plano actual de inmediato.

## Dependencies

- `write-excel-file@4.0.7` ya instalado (soporta `fontWeight`/`align`). Ninguna dependencia nueva.

## Preguntas abiertas (para spec/design)

- Cabecera fiscal: ¿agregar etiquetas tipo "NIT:" a los campos no-razón-social, o dejarlos como están? Default conservador: solo negrita en razón social, sin cambiar contenido. NO ampliar alcance sin decisión del usuario.

## Success Criteria

- [ ] Cabeceras de columna y filas de totales salen en negrita en los 5 informes.
- [ ] Montos alineados a la derecha en los 5 informes.
- [ ] Razón social en negrita en la cabecera fiscal.
- [ ] `tsc -b` y lint en 0; suite vitest verde con cobertura del nuevo formato.
- [ ] Una celda sin props de estilo se serializa idéntica a hoy (retrocompatibilidad).
