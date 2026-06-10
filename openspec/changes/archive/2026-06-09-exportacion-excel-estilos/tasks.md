# Tasks: Estilos esenciales en exportación a Excel

## Fase 1: Infra — `construir-hoja.ts`

- [x] 1.1 [RED] `construir-hoja.test.ts`: agregar 5 casos — propagación `fontWeight:'bold'`, default `align:'right'` en numérico, retrocompat sin estilo (sin `fontWeight`/`align` en output), override `align:'left'`, §4.5 intacto con estilo (`value`, `format` sin cambio)
- [x] 1.2 [GREEN] `lib/export-excel/construir-hoja.ts`: extraer `CeldaEstilo { fontWeight?, align? }`; `CeldaNumero` y `CeldaTexto` extienden; en el `.map` propagar con spread condicional + default `align:'right'` para numérico

## Fase 2: Infra — `cabecera-fiscal.ts`

- [x] 2.1 [RED] `cabecera-fiscal.test.ts`: 5 casos — razonSocial → `fontWeight:'bold'` sin etiqueta; nit presente → `'NIT: <v>'` sin fontWeight; campo null → sin fila (nunca `'null'`); todos null salvo email → 1 fila sin negrita; orden preservado
- [x] 2.2 [GREEN] `lib/export-excel/cabecera-fiscal.ts`: eliminar `CeldaTextoLocal`; importar `CeldaTexto` de `./construir-hoja`; mapa ordenado `{ valor, etiqueta? }[]`; filtrar null ANTES de componer string; razonSocial (índice 0 del array filtrado) con `fontWeight:'bold'`

## Fase 3: Infra — `aplanar-arbol.ts`

- [x] 3.1 [RED] `aplanar-arbol.test.ts`: filas de sección/subsección → celdas con `fontWeight:'bold'`; filas de detalle → sin `fontWeight`
- [x] 3.2 [GREEN] `lib/export-excel/aplanar-arbol.ts`: marcar `fontWeight:'bold'` en celdas de fila de subtotal de sección/subsección; celdas de detalle sin cambio

## Fase 4: Ensamblador Libro Diario

- [x] 4.1 [RED] `exportar-libro-diario.test.ts`: fila de encabezados de columna → toda celda con `fontWeight:'bold'`; fila TOTAL → celdas con `fontWeight:'bold'`
- [x] 4.2 [GREEN] `features/libro-diario/lib/exportar-libro-diario.ts`: aplicar `fontWeight:'bold'` a todas las `CeldaTexto` de encabezados y a todas las celdas de la fila TOTAL

## Fase 5: Ensamblador Libro Mayor

- [x] 5.1 [RED] `exportar-libro-mayor.test.ts`: encabezados y fila TOTAL → `fontWeight:'bold'`
- [x] 5.2 [GREEN] `features/libro-mayor/lib/exportar-libro-mayor.ts`: aplicar `fontWeight:'bold'` a encabezados y celdas de la fila TOTAL

## Fase 6: Ensamblador Balance General

- [x] 6.1 [RED] `exportar-balance-general.test.ts`: encabezados → negrita; filas `TOTAL ACTIVO`, `TOTAL PASIVO`, `TOTAL PATRIMONIO` y cuadre → negrita; filas de cuenta de detalle → sin negrita
- [x] 6.2 [GREEN] `features/balance-general/lib/exportar-balance-general.ts`: marcar `fontWeight:'bold'` en encabezados y en todas las celdas de las filas de cuadre/total

## Fase 7: Ensamblador Estado de Resultados

- [x] 7.1 [RED] `exportar-estado-resultados.test.ts`: encabezados → negrita; `TOTAL INGRESOS`, `TOTAL EGRESOS`, `Resultado del Ejercicio` → negrita; detalle sin negrita
- [x] 7.2 [GREEN] `features/estado-resultados/lib/exportar-estado-resultados.ts`: marcar `fontWeight:'bold'` en encabezados y celdas de las filas de resultado/total

## Fase 8: Ensamblador Comprobantes

- [x] 8.1 [RED] `exportar-comprobantes.test.ts`: fila de encabezados → negrita; confirmar que no existe fila de totales
- [x] 8.2 [GREEN] `features/comprobantes/lib/exportar-comprobantes.ts`: aplicar `fontWeight:'bold'` únicamente a las celdas de encabezados

## Fase 9: Gate final

- [x] 9.1 Ejecutar `pnpm exec tsc -b` en `frontend/` → 0 errores
- [x] 9.2 Ejecutar `pnpm run lint` completo en `frontend/` → 0 errores
- [x] 9.3 Ejecutar `pnpm exec vitest run` → suite verde (todos los tests nuevos y existentes pasan)
- [ ] 9.4 Smoke manual: exportar cada uno de los 5 informes y abrir el `.xlsx` — verificar negritas en encabezados y totales, montos alineados a la derecha, cabecera fiscal con etiquetas
