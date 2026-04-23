# Plan Único de Cuentas Tributarias (PUCT) — Fuente oficial

## Origen normativo

| Campo | Valor |
|---|---|
| Norma | RND No 101800000004 (compilada) |
| Publicación original | 2 de marzo de 2018 |
| Compilación vigente | 10 de febrero de 2022 |
| Emisor | Servicio de Impuestos Nacionales (SIN) — Bolivia |
| URL referencia | https://unumlex.impuestos.gob.bo/2022/02/10/rnd-no-101800000004-compilado-presentacion-de-estados-financieros-y-de-informacion-tributaria-complementaria-en-fisico-y-digital/ |

## Descarga

| Campo | Valor |
|---|---|
| Fecha de descarga | 2026-04-22 |
| Archivo | `puct.xlsx` |
| Versión interna | `2018-03` (formato `YYYY-MM` correspondiente a la publicación original) |

## Estructura del archivo

| Hoja | Filas totales | Columnas relevantes |
|---|---|---|
| `PUCT` | 2219 | A:N (las 14 primeras) |

### Columnas

| Col | Header | Significado |
|---|---|---|
| A | C | Clase (nivel 1, 1 dígito) |
| B | G | Grupo (nivel 2, 1 dígito) |
| C | SG | Subgrupo (nivel 3, 1 dígito) |
| D | CP | Cuenta Principal (nivel 4, 3 dígitos) |
| E | CA | Cuenta Auxiliar (nivel 5, plantilla) |
| F | NOMBRE DE LA CUENTA | Texto descriptivo. `"XXX"` indica plantilla a llenar por el tenant |
| G | COMERCIAL | `"X"` si aplica, vacío si no |
| H | SERVICIOS | idem |
| I | TRANSPORTE | idem |
| J | INDUSTRIAL | idem |
| K | PETROLERA | idem |
| L | CONSTRUCCIÓN | idem |
| M | AGROPECUARIA | idem |
| N | MINERA | idem |

### Distribución por nivel (importable)

| Nivel | Concepto | Registros |
|---|---|---|
| 1 | Clase | 5 |
| 2 | Grupo | 15 |
| 3 | Subgrupo | 54 |
| 4 | Cuenta Principal | 464 |
| **Total** | | **538** |

Las filas con nombre `"XXX"` (1679 registros del nivel 5) son **plantillas** y se ignoran al importar; el tenant define sus propias cuentas auxiliares con `Cuenta.codigoInterno`.

## Reglas operativas del parser

1. Lee únicamente la hoja `PUCT`.
2. Skip de filas donde `nombre === "XXX"`.
3. Construye el código jerárquico concatenando los segmentos no-nulos con punto: `1.1.1.001`.
4. Para cada fila extrae `tiposEmpresa: TipoEmpresa[]` evaluando las 8 columnas (`X` => incluido).
5. Idempotente: usa `upsert` por `codigo`.

## Actualización futura

Cuando el SIN publique una nueva versión:

1. Reemplazar `puct.xlsx` con la nueva descarga.
2. Actualizar este README con la nueva fecha de publicación, fecha de descarga y nueva versión interna.
3. Correr `npm run seed:puct` para upsertear cambios.
4. Si hubo cambios estructurales (renombrados, deprecados), implementar el patrón `AlertaPuctPendiente` documentado en `docs/disenos/puct-versioning.md` (futuro).
5. CI aplica el seed actualizado en producción.

**No editar `puct.xlsx` manualmente.** La fuente debe permanecer fiel al archivo oficial del SIN.
