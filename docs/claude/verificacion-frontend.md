<!--
Última edición: 2026-07-27
Última revisión contra core: 2026-07-27
Owner: frontend-lead
-->

# Verificación de cambios de UI — qué prueba cada herramienta

> `frontend/CLAUDE.md` §7 dice **QUÉ** hay que verificar antes de mergear un cambio
> visual (375/768/1440, tap targets, dark mode, tablas, modales). Este doc dice
> **CÓMO**, y sobre todo **qué puede y qué NO puede probar cada herramienta**.
>
> Existe porque el checklist §7 estuvo escrito durante meses sin correrse nunca. La
> razón no era desidia: "mirar la pantalla en tres anchos" suena a algo que se hace
> a ojo, y a ojo no se hace. Cuando por fin se corrió (PRs #273 y #274) destapó una
> familia de bugs donde **el `className` que escribe el llamador no hace nada** —
> y un `className` inerte se lee en code review exactamente igual que uno que
> funciona. No había nada que mirar. Había que medir.

---

## 1. La escalera de verificación

De la más barata a la más cara. **Subí hasta el escalón que responde tu pregunta y
no más** — pero no te quedes abajo si el escalón no alcanza.

| # | Herramienta | Prueba | NO prueba |
|---|---|---|---|
| 1 | `grep` / leer el código | Qué clases se **escriben** | Cuáles **aplican** |
| 2 | Test de `className` (jsdom) | Qué clases **llegan al DOM** | Cuál **gana**: jsdom no aplica Tailwind ni calcula layout |
| 3 | CSS compilado del dev server | La **cascada**: especificidad y orden de fuente | Que la clase esté purgada (dev no purga) |
| 4 | Bundle de producción (`dist/`) | Qué sobrevive al **purge** | Cualquier cosa de layout |
| 5 | Navegador real (Playwright) | **Layout renderizado**: px, `getComputedStyle`, desborde, elipsis | Nada más — es el techo |
| 6 | Captura de pantalla | Lo que **ve una persona** | Es la evidencia más débil para decidir, y la mejor para comunicar |

**El salto que más importa es del 2 al 3.** Un test de `className` verde te dice que
la clase está en el DOM; no te dice que haga algo. Los tres bugs de la familia
vivían justo ahí: las clases estaban, y perdían.

---

## 2. Tabla de decisión

| Tu pregunta | Escalón mínimo |
|---|---|
| ¿La clase llega al elemento? | 2 — test de `className` |
| Dos utilities declaran la misma propiedad, ¿cuál gana? | 3 — CSS compilado |
| ¿Esta clase quedó muerta en el bundle? | 4 — build de producción |
| ¿Cuánto mide realmente? ¿se solapa? ¿desborda? | 5 — navegador |
| ¿El texto recortado muestra `…` o corta en seco? | 5 — navegador |
| ¿Mi cambio movió algo en otra pantalla? | 5 — barrido de regresión (§3.4) |
| ¿Se entiende / se ve bien? | 6 — captura, y ojo humano |

**Regla**: si la pregunta contiene un número (px, ancho, alto, offset) o la palabra
"se ve", el único escalón válido es el 5.

---

## 3. Recetas

### 3.1 Leer el CSS compilado

Para un conflicto de cascada. A **igual especificidad decide el orden de fuente**,
así que alcanza con comparar offsets:

```bash
curl -s http://localhost:5173/src/index.css -o /tmp/css.txt
grep -bo 'select-value\\\\]\\\\:line-clamp-1' /tmp/css.txt   # → offset
grep -bo 'select-value\\\\]\\\\:flex'         /tmp/css.txt   # → offset mayor ⇒ gana
```

Para ver qué emite cada regla:

```bash
grep -o 'select-value[^{]*{[^}]*}' /tmp/css.txt
```

> ⚠️ **Dev y producción NO tienen la misma forma, y un `grep` copiado de uno no
> encuentra nada en el otro** (pasó al escribir este doc). El dev server sirve el
> CSS como **módulo JS**: reglas anidadas, `\n` literales, backslashes duplicados
> (`select-value\\]\\:truncate`) y el atributo **con comillas**
> (`[data-slot="select-value"]`). El bundle sale aplanado y minificado, con el
> atributo **sin comillas** (`[data-slot=select-value]`). Ver §3.2 para la forma de
> producción.
>
> Un `grep` que devuelve vacío se lee igual que "no existe". Antes de concluir un
> negativo, probá el mismo `grep` contra algo que **sabés** que está.

> ⚠️ **El dev server NO purga.** Su build es incremental: agrega las clases nuevas y
> **conserva las viejas**. Una regla presente ahí no prueba que alguien la use.

### 3.2 Verificar el purge (bundle de producción)

```bash
cd frontend && pnpm run build
ls -la --time-style=+%H:%M:%S dist/assets/*.css   # ⚠️ mirá la hora ANTES de concluir
# atributo SIN comillas acá; con el selector completo para ver de qué clase sale
grep -o '[^}]\{0,70\}\[data-slot=select-value\][^}]*}' dist/assets/*.css
```

Salida real del #274 después del fix — tres reglas, ningún `display` en conflicto:

```
:is(.\*\:data-\[slot\=select-value\]\:block>*)[data-slot=select-value]{display:block}
:is(.\*\:data-\[slot\=select-value\]\:min-w-0>*)[data-slot=select-value]{min-width:...}
:is(.\*\:data-\[slot\=select-value\]\:truncate>*)[data-slot=select-value]{text-overflow:ellipsis;...}
```

**El selector completo importa**: dice de qué clase sale la regla. Si aparece una que
ya no está en el componente, alguien más la escribe — y el sospechoso número uno es
un test (§4.1).

> ⚠️ **Chequear el timestamp del `dist/` es obligatorio**, no una precaución. Es el
> mismo error que `CLAUDE.md` §11.7 documenta para el backend: medir un artefacto
> viejo y sacar conclusiones firmes de él.

### 3.3 Medir en el navegador

**Requisitos del entorno** (una sola vez):

```bash
sudo apt-get install -y libnspr4 libnss3 libasound2t64   # Ubuntu 24.04
```

- En 24.04 el paquete es **`libasound2t64`**; el nombre viejo `libasound2` ya no existe.
- El error de Playwright cuando faltan es `Target page, context or browser has been
  closed` — **no menciona librerías** y manda a buscar el problema al lugar
  equivocado. Diagnóstico real: `ldd <binario> | grep "not found"`.
- `sudo` **no funciona con el prefijo `!` del prompt de Claude Code** (no hay TTY):
  el humano lo corre en su propia terminal.
- Playwright **es `devDependency` del frontend** desde 2026-07-27 (ver §6). El
  `pnpm install` NO baja ningún browser: eso es un comando aparte, una sola vez
  por máquina y por versión de Playwright.

  ```bash
  cd frontend && pnpm exec playwright install chromium
  ```

- Lanzar siempre con `args: ['--no-sandbox']` (el script ya lo hace).

**Qué medir: usá el script versionado.** No escribas un archivo nuevo en el
scratchpad — el barrido de regresión sólo sirve si la medición de hoy es
comparable con la de la próxima sesión, y un script que se reescribe cada vez mide
distinto cada vez.

```bash
cd frontend
pnpm run medir:ui -- --ayuda

# Los 6 SelectTrigger del PR #276, en los tres viewports de §7:
pnpm run medir:ui -- \
  --rutas /comprobantes,/eeff/libro-mayor \
  --selector '[data-slot="select-trigger"]' \
  --out /tmp/despues.json
```

Devuelve, **por cada coincidencia** (no la primera: todas), `ancho`/`alto`/`x`/`y`,
`display`, `textOverflow`, `overflowX`, `fontSize` y `desborda`
(`scrollWidth > clientWidth`). El JSON está pensado para `diff`.

- **Un elemento con ancho 0 no es un bug del script**: el selector coincide pero el
  elemento no se renderiza en ese viewport (una tabla desktop oculta en mobile).
  Se informa, no se filtra.
- `--sin-login` para rutas públicas (`/login`). Sin el flag entra con el usuario del
  seed antes de medir.
- **`pnpm run medir:ui -- …` reenvía el `--` literal al script** (pnpm 11.2.2,
  verificado). El script lo descarta; si escribís otra herramienta con `parseArgs`,
  acordate o vas a comerte un `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL` que no dice
  nada sobre la causa.

Si preferís entender qué hace por dentro, o necesitás medir algo que el script no
cubre, ésta es la forma cruda:

```js
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });

  await p.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await p.fill('#email', 'founder@avicont.bo');
  await p.fill('#password', 'password');          // seed: backend/prisma/seed.ts
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.includes('/login'));

  await p.goto('http://localhost:5173/<ruta>', { waitUntil: 'networkidle' });

  for (const ancho of [375, 768, 1440]) {
    await p.setViewportSize({ width: ancho, height: 900 });
    await p.waitForTimeout(350);                  // dejá asentar el reflow
    console.log(ancho, await p.evaluate(() => {
      const el = document.querySelector('<selector>');
      const cs = getComputedStyle(el);
      return {
        px: +el.getBoundingClientRect().width.toFixed(2),
        display: cs.display,
        textOverflow: cs.textOverflow,
        // scrollWidth > clientWidth ⇒ el contenido NO entra ⇒ el navegador
        // recorta. Con text-overflow:ellipsis dibuja "…"; con clip, corta seco.
        desborda: el.scrollWidth > el.clientWidth,
      };
    }));
  }
  await b.close();
})();
```

**Datos de prueba**: el usuario del seed (`founder@avicont.bo`, contraseña en
`backend/prisma/seed.ts`) entra a la org piloto. Si lo que querés medir depende de
datos de smoke (una cuenta bancaria concreta, movimientos importados), esos datos
pueden vivir en **otra organización** — verificalo en la BD y pedile las
credenciales al dueño del entorno en vez de crear datos por tu cuenta:

```bash
docker compose exec -T postgres psql -U postgres -d saas \
  -c 'SELECT cb.alias, o.name FROM cuentas_bancarias cb
      JOIN organizations o ON o.id = cb."organizationId";'
```

> No se documentan credenciales de datos de dev acá: las del seed ya están en el
> repo, las que inventó una persona en su máquina no tienen por qué estarlo.

### 3.4 El protocolo antes/después (lo que hace convincente la evidencia)

Una medición sola dice "mide 246 px". No dice si tu cambio sirvió. El par sí:

1. Medí con el fix aplicado → guardá.
2. **Revertí solo el primitivo** (`sed`, o `git stash` del archivo), esperá el HMR
   (~5 s), medí igual → guardá.
3. `git checkout -- <archivo>` para restaurar, y **verificá que el árbol quedó limpio**.
4. `diff` de las dos salidas.

Aplicado al #274 dio la evidencia decisiva: `text-overflow` pasaba de `clip` a
`ellipsis` **con el desborde idéntico** (326 px de texto en 246 de caja). O sea que
el recorte siempre había ocurrido y lo único que faltaba era la señal de que
faltaba texto — que es exactamente por qué el bug era peligroso y no se veía roto.

> ⚠️ Paso 3 en serio: revertir con `git checkout <archivo>` **borra trabajo sin
> commitear** (vuelve al HEAD, no a "antes de la mutación"). Commiteá antes de mutar.

### 3.5 Barrido de regresión

Cuando tocás un primitivo de `components/ui/`, el cambio llega a pantallas que no
están en el diff. Medí **todas las instancias** en varias rutas y viewports, antes y
después, y diffeá:

Es exactamente para lo que existe `medir:ui`: mide **todas** las coincidencias del
selector en cada ruta y viewport, y escupe un JSON diffeable.

```bash
cd frontend
RUTAS=/comprobantes,/plan-cuentas,/settings/empresa,/conciliacion
SEL='[data-slot="select-trigger"]'

pnpm run medir:ui -- --rutas "$RUTAS" --selector "$SEL" --out /tmp/despues.json
# revertí SOLO el primitivo, esperá el HMR (~5 s)
pnpm run medir:ui -- --rutas "$RUTAS" --selector "$SEL" --out /tmp/antes.json
# restaurá el primitivo y verificá que el árbol quedó limpio
diff /tmp/antes.json /tmp/despues.json
```

> ⚠️ Para revertir el primitivo usá `git stash` o un edit inverso, **no
> `git checkout <archivo>` si tenés trabajo sin commitear en él**: te devuelve al
> HEAD, no a "antes de la mutación", y te comés el cambio entero.

Un diff que cambia **exactamente lo que quisiste cambiar y nada más** es la prueba
de no-regresión. En el #274 fueron 21 mediciones y el diff fue una palabra por
línea (`flex` → `block`), con alto/ancho/offset idénticos.

**Bonus real**: el barrido del #274 se escribió para descartar regresiones y de
paso encontró un bug preexistente que nadie buscaba (un `h-8` declarado que
renderizaba 36 px). Medir para descartar también descubre.

**Y el barrido es el que CUENTA, no el `grep`.** Al arreglar ese `h-8` (#276), el
`grep` de una línea dio 3 sitios afectados y el barrido en navegador dio 6: el que
faltaba era `PeriodoGestionFiltro` —compartido por **9 pantallas de reportes**—,
invisible porque su `className` está en su propia línea del JSX. Si el `grep`
hubiera sido la última palabra, el arreglo dejaba 9 pantallas a 32 px de tap
target sin que nadie lo notara. Regla: el `grep` **enumera candidatos**; el
recuento sale del navegador. Y si vas a grepear JSX, `-A4` mínimo — el atributo
casi nunca está en la línea de la etiqueta.

---

## 4. Tests de `className` — qué valen y cómo no arruinarlos

Viven al lado del primitivo (`src/components/ui/<x>.test.tsx`). Son una **red
débil y hay que decirlo en el propio archivo**: jsdom no aplica Tailwind, así que
prueban qué clases llegan al DOM, no cuál gana. Sirven para exactamente una clase
de bug —"conviven las dos y gana la que no querías"— que es justo la de esta
familia.

### 4.1 Los nombres de clase se ARMAN, no se escriben literales

**Tailwind escanea los tests como código fuente.** Un literal dentro de un
`expect(...).not.toContain(...)` **regenera esa utility en el CSS de producción**:

```tsx
// ❌ el literal resucita la utility en el bundle
expect(clases).not.toContain('*:data-[slot=select-value]:flex');

// ✅ el literal nunca aparece en el archivo
const VALUE = '*:data-[slot=select-value]';
const enValue = (u: string) => `${VALUE}:${u}`;
expect(clases).not.toContain(enValue('flex'));
```

Nunca llega a matchear (ningún elemento lleva ya la clase), pero deja regla muerta
y —peor— **vuelve inverificable en el bundle que la regla en conflicto se purgó**.
Verificado sobre el `dist/`.

### 4.2 Un `not.toContain` de un default necesita su gemelo

Este test pasa **por la razón equivocada**:

```tsx
it('el ancho del llamador gana', () => {
  const clases = renderTrigger('w-full');
  expect(clases).not.toContain('w-fit');   // también pasa si w-fit NUNCA existió
});
```

Hay que pinnear el default en un test aparte:

```tsx
it('trae w-fit cuando el llamador no declara ancho', () => {
  expect(renderTrigger()).toContain('w-fit');
});
```

Lo cazó una mutación que no mataba nada. **Regla: todo `not.toContain` de un
default lleva un gemelo que afirma que el default existe.**

### 4.3 Mutación obligatoria

Ningún test de estos se da por bueno sin romper a propósito lo que dice proteger y
confirmar que falla. En el #274: devolver el `flex`, sacar el `truncate`, sacar el
`min-w-0`, sacar el `w-fit` — 4 de 4 mataron un test. La cuarta fue la que reveló
el problema de §4.2.

Ojo: `renderTrigger()` dos veces en el **mismo** `it` monta dos componentes y
`getByRole` encuentra ambos. Un test por aserción, y el cleanup automático hace su
trabajo.

---

## 5. Trampas medidas (todas pasaron de verdad)

| Trampa | Cómo se ve | Antídoto |
|---|---|---|
| **Truncar tu propia salida y concluir del pedazo** | `grep ... \| head -40` y el método que buscabas está en la línea 112 ⇒ "no existe" | No cortar la salida de la que vas a concluir. Contá lo que hay antes de afirmar que no está. |
| **Regex sobre un string ya recortado** | `className` cortado a 120 caracteres ⇒ "falta `w-full`", y estaba más allá del corte | Evaluar sobre el valor completo; recortar solo para imprimir. |
| **Comparar rangos donde no hay solape posible** | "337 px de solape" a 375 px, donde los campos están apilados en `flex-col` | Antes de medir un solape, confirmá que los elementos comparten fila en ese viewport. |
| **`grep` que busca la forma equivocada** | Buscar `max-w-` y concluir "no declaran ancho" cuando pasan `w-64` | Buscar por concepto, no por una grafía; y verificar el negativo. |
| **`grep` de una línea sobre JSX multilínea** | `grep "<SelectTrigger.*className"` da 3 sitios; el atributo de los otros 3 está en su propia línea ⇒ arreglo aplicado a la mitad | `grep -A4`, y el recuento final sale del barrido en navegador (§3.5), no del `grep`. |
| **`grep` copiado entre dev y prod** | El del bundle devuelve vacío contra el CSS del dev server (atributo con/sin comillas) ⇒ se lee como "no existe" | Probá el `grep` contra algo que **sabés** que está antes de creerle un negativo. |
| **jsdom no tiene layout** | `getBoundingClientRect()` devuelve todo en 0 | Cualquier px se mide en el escalón 5. |
| **Artefacto viejo** | `dist/` de una build anterior; proceso node aferrado al `:3000` (§11.7) | Timestamp del artefacto vs. hora del cambio, siempre. |

El patrón común de las tres primeras: **la herramienta de medición estaba rota y el
número que devolvía era plausible.** Un número no es una medición. Si el resultado
te sorprende, sospechá primero del instrumento.

---

## 6. Estado del entorno y la decisión (cerrada el 2026-07-27)

- Frontend en `:5173`, backend en `:3000`.
- Las 3 librerías del sistema quedaron instaladas el 2026-07-27.
- `playwright` es **`devDependency` del frontend**, pin `^1.61.1`, con
  `scripts/medir-ui.mjs` versionado y expuesto como `pnpm run medir:ui`.
- Chromium en `~/.cache/ms-playwright/`, **revisión 1228** (la que le corresponde a
  Playwright 1.61.1).

**El costo que esta sección declaraba era falso.** Decía "una dependencia pesada":
`playwright` son **4,9 MB**, su única dependencia es `playwright-core`, y
**ninguno de los dos tiene install scripts** (verificado desempaquetando los
tarballs, no con `npm view`, que devuelve vacío tanto si el campo falta como si no
existe el paquete). Dos consecuencias que importan:

- `allowBuilds: {}` del `pnpm-workspace.yaml` **no lo bloquea**: no hay build que
  ignorar, así que no aparece el `ERR_PNPM_IGNORED_BUILDS`.
- Lo pesado es el **binario del browser** (~114 MB), que `pnpm install` **no
  descarga**: se baja con un comando explícito y vive en `~/.cache`, fuera del repo.

**Lo que sí costó: el cooldown de 72 h.** `minimumReleaseAgeStrict` rechazó
Playwright `1.62.0` por 9 horas (publicada 62,9 h antes). Se pinneó `1.61.1`, que
usa **Chromium 1228** en vez del **1234** de la 1.62 — o sea, una descarga de 114 MB
aunque el 1234 ya estuviera cacheado. Al bumpear la versión de Playwright hay que
volver a correr `pnpm exec playwright install chromium`: cada release trae su propia
revisión de browser. **Ojo: `playwright install` PODA las revisiones que ya no
corresponden** (el 1234 desapareció de la cache al instalar el 1228), así que no
cuentes con tener las dos a mano.

### 6.1 Los gates en CI (desborde cerrado el 2026-07-27; tap targets, el mismo día más tarde)

Corren como el job **`ui-gate`** de `.github/workflows/ci.yml`: `pnpm run gate:ui`
(`frontend/scripts/gate-ui.mjs`, desborde horizontal) y `pnpm run gate:tap`
(`frontend/scripts/gate-tap-targets.mjs`, piso táctil) sobre el **build** servido
con `vite preview`, con el stack real detrás porque toda pantalla vive tras el
login.

**El primer invariante se eligió midiendo, no opinando** — y el dato de entonces
mató al candidato obvio. Tap targets ≥ 44 px se descartó como gate porque lo
violaba la mayoría de la app (la cifra que circuló, "118 de 186", estaba además
mal: la medición real daba **141 de 217** controles visibles @375). La firma
dominante era `36×36`, y 36 px es `h-9`, **el default de `button.tsx`**: el mínimo
del checklist §7 nunca lo había cumplido el propio sistema de diseño. Un gate que
nace con 141 excepciones no assertea nada — en ese momento era deuda de rediseño,
no de CI.

**Eso cambió en tres pasos, y hoy tap targets SÍ es gate:**

1. **PR #285** puso el piso `pointer-coarse:min-h-11` en `button.tsx` e
   `input.tsx` — por **dispositivo** (`pointer: coarse`), no por breakpoint — y
   barrió los `h-11 sm:h-8` de los call sites: las violaciones masivas del
   default cayeron de una.
2. **PR #286** aplicó el mismo piso al sidebar — el archivo que más violaba la
   regla y que el #285 había dejado intacto mientras la escribía en el doc. Es la
   prueba de que sin gate la regla vuelve a ser una promesa.
3. El cierre llevó al piso los 4 primitivos restantes (`checkbox`, `switch`,
   `tabs-trigger`, `select-trigger`) con `::after`/`::before` invisibles o
   `min-h-11` según su diseño (frontend/CLAUDE.md §7), medidos con una sonda de
   **hit-testing** (`scripts/lib/tap-targets.mjs`, expuesta como
   `pnpm run medir:tap`) porque `getBoundingClientRect()` no ve pseudo-elementos.
   Con el baseline en **cero**, el invariante se congeló en
   `scripts/gate-tap-targets.mjs` (paso `Tap targets gate` del job `ui-gate`):
   falla si un primitivo mide <44×44 bajo dedo **o** si su box de 44 px le roba
   el click a otro control. Nace con **allowlist vacía**, igual que el de
   desborde.

La sonda del gate aprendió una lección propia: muestrear la **frontera** del box
de 44 px reporta robo justo cuando el layout es perfecto — dos tap targets
contiguos de 44 teselan y comparten la línea, y el hit-testing se la da al
vecino. El borde inferior/derecho del box se muestrea retraído 1 px; el
superior/izquierdo sobre la línea, donde la semántica half-open de los rects CSS
(`[top, bottom)`) hace que solo un invasor real resuelva ahí. El porqué completo
vive en `scripts/lib/tap-targets.mjs`.

Fuera del alcance del gate de tap (declarado en su cabecera, no escondido):
`/platform-admin/*` (pide super-admin; ahí queda un switch en celda de tabla de
`feature-flags-page.tsx:175`, fila ≈34 px, **sin verificar**), `/granja/*` (la
org del seed es vertical CONTABILIDAD) y el contenido de sheets/dialogs que
exigen un click para montarse.

**El invariante del gate de desborde**: en cada pantalla, `main` no desborda
horizontalmente (`scrollWidth <= clientWidth`), a 375 y 768 px. Binario por
pantalla, sin grises, y su baseline es **verde con la allowlist vacía**.

**La trampa que casi lo hunde, y la lección general**: medido sobre `body` daba
cero desborde en toda la app… y el cero era **falso**. `dashboard-shell.tsx`
envuelve el contenido en un `overflow-hidden`, así que el desborde nunca llega al
body. Se destapó **inyectando un `<div style={{width:2000}}>` en una página real**:
`html` y `body` seguían reportando 375 px con `desborda:false`. La sonda correcta
es `main`. **Un invariante nuevo se valida por mutación ANTES de creerle el verde**
— si no, lo que se versiona es un instrumento que no mide.

Lo que el gate protege es contenido **inalcanzable**: recortado y sin scroll que lo
rescate. El primer bug que encontró fue el CTA `Nuevo comprobante` terminando en
x=490 sobre un viewport de 375.

**Cobertura y sus límites** (declarados, no omitidos): 25 rutas × 2 viewports,
compartidas por ambos gates. `scripts/rutas-gate.mjs` lista las cubiertas y las
excluidas **con motivo**; `src/routes/rutas-gate.test.ts` compara esa lista
contra el router de verdad en las dos direcciones, así que una pantalla nueva
sin decisión de cobertura rompe la suite. Quedan fuera las rutas con `:id`, las
públicas, granja (la org del seed es vertical CONTABILIDAD) y platform-admin
(pide super-admin).

Ambos gates **fallan si una ruta redirige** en vez de abrir. No es celo: el barrido
manual previo contaba `/gestiones/cierre` como pantalla y en realidad estaba
midiendo `/periodos-fiscales` dos veces, porque ese path es un redirector y sin
gestiones en la BD rebota. Una medición que no vio la pantalla no puede reportarse
como verde.

---

## 7. Cómo se completa el checklist §7 ahora

`frontend/CLAUDE.md` §7 pide tildar 375 / 768 / 1440, tap targets ≥44 px, dark mode,
navegación en `< md`, tablas y modales.

**Los ítems que no verificaste van sin tildar y nombrados en el PR.** Tildar a ciegas
es peor que dejarlos abiertos: convierte el checklist en un trámite y a la próxima
nadie lo mira. Si no podés medir, decí por qué y pedí el smoke — pero desde el
2026-07-27 las tres mediciones de viewport **sí** son alcanzables, así que un cambio
de UI sin ellas es una casilla pendiente, no una limitación del entorno.

---

**Fin del documento.** Complementa `frontend/CLAUDE.md` §7 (qué verificar) y §12
(antipatrones de frontend). Cualquier cambio se discute en PR.
