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
- Playwright **no es dependencia del repo** — se instala ad-hoc en el scratchpad
  (`npm install playwright`). Los browsers ya están cacheados en
  `~/.cache/ms-playwright/`. Convertirlo en `devDependency` es una decisión abierta
  (ver §6).
- Lanzar siempre con `args: ['--no-sandbox']`.

**Qué medir.** No mires una captura: leé el DOM.

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

```js
const RUTAS = ['/comprobantes', '/plan-cuentas', '/settings/empresa', '/conciliacion'];
const ANCHOS = [375, 768, 1440];
// por cada combinación: para cada [role="combobox"] (o el selector que aplique)
//   { id, alto, ancho, offsetY del texto respecto del contenedor, display }
```

Un diff que cambia **exactamente lo que quisiste cambiar y nada más** es la prueba
de no-regresión. En el #274 fueron 21 mediciones y el diff fue una palabra por
línea (`flex` → `block`), con alto/ancho/offset idénticos.

**Bonus real**: el barrido del #274 se escribió para descartar regresiones y de
paso encontró un bug preexistente que nadie buscaba (un `h-8` declarado que
renderizaba 36 px). Medir para descartar también descubre.

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
| **`grep` copiado entre dev y prod** | El del bundle devuelve vacío contra el CSS del dev server (atributo con/sin comillas) ⇒ se lee como "no existe" | Probá el `grep` contra algo que **sabés** que está antes de creerle un negativo. |
| **jsdom no tiene layout** | `getBoundingClientRect()` devuelve todo en 0 | Cualquier px se mide en el escalón 5. |
| **Artefacto viejo** | `dist/` de una build anterior; proceso node aferrado al `:3000` (§11.7) | Timestamp del artefacto vs. hora del cambio, siempre. |

El patrón común de las tres primeras: **la herramienta de medición estaba rota y el
número que devolvía era plausible.** Un número no es una medición. Si el resultado
te sorprende, sospechá primero del instrumento.

---

## 6. Estado del entorno y decisión abierta

- Chromium cacheado en `~/.cache/ms-playwright/` (revisión 1234, Playwright 1.62).
- Las 3 librerías del sistema quedaron instaladas el 2026-07-27.
- Frontend en `:5173`, backend en `:3000`.
- **Decisión abierta**: hoy Playwright se instala ad-hoc en el scratchpad, así que
  la medición **no es repetible entre sesiones ni corre en CI**. Convertirlo en
  `devDependency` del frontend + un script versionado (`scripts/medir-ui.mjs`) haría
  repetible el barrido de regresión, al costo de una dependencia pesada y de la
  regla de `minimumReleaseAge` (72 h). **Sin decidir** — no se agregó nada al repo.

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
