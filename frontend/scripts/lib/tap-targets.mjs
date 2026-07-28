// Sonda de tap targets por HIT-TESTING (`document.elementFromPoint`), no por
// `getBoundingClientRect`. La diferencia no es académica: el plan para llevar
// checkbox/switch/tabs/select al piso de 44×44 es extender el área táctil con
// un pseudo-elemento invisible (`::after`), y getBoundingClientRect NO ve
// pseudo-elementos — mediría el control chico y reportaría una violación que
// ya no existe. elementFromPoint sí los ve, porque el pseudo-elemento participa
// del hit-testing real del navegador, igual que el dedo.
//
// La sonda mide DOS invariantes, no uno:
//   1. `cumple` — el área táctil efectiva alcanza el mínimo (44×44, Apple HIG).
//   2. `robos`  — ningún punto del box de 44×44 centrado en el control resuelve
//      a OTRO control interactivo. Un ::after de 44px sobre un switch de 18px
//      sobresale ~13px por lado; si pisa texto inerte es inofensivo, si pisa
//      otro control fabricamos un bug peor que el que arreglamos: tocás un
//      switch y activás el de al lado. Esta es la señal antirregresión que
//      tiene que estar en verde ANTES de agrandar ningún hit-area.

/** Piso táctil de Apple HIG; el mismo que aplican button.tsx e input.tsx. */
export const MINIMO_TAP_PX = 44;

// Paso del barrido de extensión: 1px. Con pasos mayores el error sistemático
// (hasta 2×paso, uno por lado) es del mismo orden que la diferencia que decide
// cumple/no-cumple (40 vs 44), y un box real de 44 se reportaría como 40. A
// 1px el costo sigue siendo despreciable: elementFromPoint corre en micro-
// segundos y el peor caso son 4×60 sondas por elemento.
export const PASO_BARRIDO_PX = 1;

// Paso de la grilla de robo: 4px. Un control vecino relevante mide ≥16px por
// lado, así que una grilla de 4px no puede saltearlo (le caen ≥4 puntos
// encima); son 12×12 = 144 sondas por elemento, que mantienen el barrido de
// 25 rutas × 2 viewports en segundos.
export const PASO_ROBO_PX = 4;

// Tope del barrido de extensión desde el centro. 60px de radio cubre holgado
// cualquier ::after razonable (44/2 = 22) y corta un falso positivo donde un
// contenedor gigante "pertenece" al control por un label envolvente enorme.
export const ALCANCE_MAX_PX = 60;

/**
 * Los 4 primitivos de `components/ui/` que siguen fuera del piso táctil
 * (frontend/CLAUDE.md §7). El slot identifica al PRIMITIVO interactivo real:
 * `data-slot="select"` va sobre el Root de Radix, que no renderiza DOM — lo
 * que se toca es el trigger. Es un dato, no lógica: agregar un primitivo a la
 * sonda es agregar una fila acá.
 */
export const SELECTORES_TAP = [
  { slot: 'checkbox', selector: '[data-slot="checkbox"]' },
  { slot: 'switch', selector: '[data-slot="switch"]' },
  { slot: 'tabs-trigger', selector: '[data-slot="tabs-trigger"]' },
  { slot: 'select-trigger', selector: '[data-slot="select-trigger"]' },
];

/**
 * Corre DENTRO de la página (via page.evaluate), así que es autocontenida: no
 * puede cerrar sobre nada del módulo. Recibe toda su configuración por arg.
 *
 * Por cada elemento que matchea un selector devuelve:
 *  - rect visual (getBoundingClientRect)
 *  - área táctil efectiva por barrido de elementFromPoint en los 4 sentidos
 *  - `cumple` (área ≥ minimo×minimo) y `robos` (grilla del box de minimo)
 *  - identidad estable para ubicarlo en el código (label, aria, id, texto)
 */
export function sondearTapTargets(config) {
  const { selectores, minimo, pasoBarrido, pasoRobo, alcanceMax } = config;

  // Qué cuenta como "otro control interactivo" en la detección de robo. Los
  // roles cubren los primitivos Radix (que son <button> igual, pero un ladrón
  // podría ser un div con role). tabindex=-1 se excluye: focuseable por código
  // no es tocable a propósito.
  const SELECTOR_INTERACTIVO =
    'button, a[href], input, select, textarea, summary, [role="button"], ' +
    '[role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], ' +
    '[role="option"], [role="link"], [tabindex]:not([tabindex="-1"])';

  // clientWidth/Height y no innerWidth/Height: excluyen la scrollbar, donde
  // elementFromPoint devuelve null y el barrido reportaría un tope falso.
  const anchoViewport = document.documentElement.clientWidth;
  const altoViewport = document.documentElement.clientHeight;

  const recortar = (t) => {
    const limpio = (t ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return limpio === '' ? null : limpio;
  };

  const labelAsociado = (el) => {
    const ancestro = el.closest('label');
    if (ancestro !== null) return ancestro;
    if (el.id === '') return null;
    return document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  };

  // Un punto "pertenece" al control si resuelve al control, a un descendiente,
  // o a su <label> asociado: clickear el label SÍ activa el control (semántica
  // nativa que Radix respeta), así que es área táctil efectiva de verdad. Se
  // marca aparte con `viaLabel` para que el número sea interpretable: el fix
  // por ::after no cambia lo que aporta el label.
  const perteneceA = (hit, el, label) => {
    if (hit === null) return false;
    if (hit === el || el.contains(hit)) return true;
    return label !== null && (hit === label || label.contains(hit));
  };

  const resultados = [];

  for (const { slot, selector } of selectores) {
    let indice = -1;
    for (const el of document.querySelectorAll(selector)) {
      indice += 1;

      const label = labelAsociado(el);
      const identidad = {
        id: el.id === '' ? null : el.id,
        name: el.getAttribute('name'),
        ariaLabel: recortar(el.getAttribute('aria-label')),
        labelTexto: label === null ? null : recortar(label.textContent),
        testId: el.getAttribute('data-testid'),
        texto: recortar(el.textContent),
        dataState: el.getAttribute('data-state'),
        // Un control deshabilitado no es tocable a propósito: se informa pero
        // no cuenta como violación (con pointer-events-none además "desaparece"
        // del hit-testing y se leería como cubierto, que sería otro falso).
        deshabilitado:
          el.matches(':disabled') ||
          el.getAttribute('data-disabled') !== null ||
          el.getAttribute('aria-disabled') === 'true',
      };

      const rectInicial = el.getBoundingClientRect();
      if (rectInicial.width === 0 || rectInicial.height === 0) {
        // Coincide el selector pero no se renderiza en este viewport (variante
        // desktop oculta en mobile, por ejemplo). Se informa, no se filtra:
        // "no medí" jamás debe leerse como "está bien".
        resultados.push({ slot, indice, identidad, visible: false });
        continue;
      }

      // elementFromPoint solo ve el viewport: hay que traer el elemento antes
      // de sondear. block+inline center también desplaza los contenedores con
      // overflow (tablas anchas), que es justo donde viven los sospechosos.
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const centro = document.elementFromPoint(cx, cy);
      const cubierto = !perteneceA(centro, el, label);

      // Barrido desde el centro hacia afuera hasta el primer punto que ya no
      // resuelve al control. Asume hit-area contigua — cierto para el control
      // solo y para el control + ::after de insets negativos, que es el caso
      // que esta sonda existe para medir.
      const barrer = (dx, dy) => {
        let alcance = 0;
        let viaLabel = false;
        let topeViewport = false;
        for (let d = pasoBarrido; d <= alcanceMax; d += pasoBarrido) {
          const x = cx + dx * d;
          const y = cy + dy * d;
          if (x < 0 || y < 0 || x >= anchoViewport || y >= altoViewport) {
            // El barrido se quedó sin viewport ANTES de encontrar el borde del
            // hit-area: el ancho/alto táctil reportado es una cota inferior.
            topeViewport = true;
            break;
          }
          const hit = document.elementFromPoint(x, y);
          if (!perteneceA(hit, el, label)) break;
          if (!(hit === el || el.contains(hit))) viaLabel = true;
          alcance = d;
        }
        // Si el barrido agotó alcanceMax sin encontrar el borde, el número es
        // una cota inferior (pasa en elementos anchos: un select de 144px capea
        // en 60+60+1 = 121). Para el veredicto ≥44 no cambia nada, pero quien
        // lea el ancho crudo tiene que saber que no es el borde real.
        return { alcance, viaLabel, topeViewport, topeAlcance: alcance >= alcanceMax };
      };

      const izq = barrer(-1, 0);
      const der = barrer(1, 0);
      const arr = barrer(0, -1);
      const aba = barrer(0, 1);

      // El +1 es el pixel del propio centro: sin él un box real de 44px mediría
      // 43 (los alcances cuentan pixeles A CADA LADO del centro, no lo incluyen)
      // y el veredicto cumple/no-cumple quedaría corrido por error del método.
      const anchoTactil = cubierto ? 0 : izq.alcance + der.alcance + 1;
      const altoTactil = cubierto ? 0 : arr.alcance + aba.alcance + 1;

      // Grilla de robo sobre el box de minimo×minimo centrado en el control:
      // es el área que un futuro ::after de 44px reclamaría. Todo punto que HOY
      // resuelve a otro control interactivo es un conflicto: hoy, porque ese
      // vecino está a <22px del centro; mañana, porque el ::after le robaría
      // el click a él.
      const ladrones = new Map();
      const mitad = minimo / 2;
      for (let ox = -mitad; ox <= mitad; ox += pasoRobo) {
        for (let oy = -mitad; oy <= mitad; oy += pasoRobo) {
          const x = cx + ox;
          const y = cy + oy;
          if (x < 0 || y < 0 || x >= anchoViewport || y >= altoViewport) continue;

          const hit = document.elementFromPoint(x, y);
          if (hit === null || perteneceA(hit, el, label)) continue;

          // El punto puede caer en un <span> inerte DENTRO de un botón: el
          // ladrón real es el ancestro interactivo, no el span.
          const interactivo = hit.closest(SELECTOR_INTERACTIVO);
          if (interactivo === null || perteneceA(interactivo, el, label)) continue;

          const clave =
            (interactivo.getAttribute('data-slot') ?? interactivo.tagName.toLowerCase()) +
            '|' +
            (recortar(interactivo.getAttribute('aria-label')) ?? recortar(interactivo.textContent) ?? '');

          const previo = ladrones.get(clave) ?? {
            slot: interactivo.getAttribute('data-slot'),
            tag: interactivo.tagName.toLowerCase(),
            ariaLabel: recortar(interactivo.getAttribute('aria-label')),
            texto: recortar(interactivo.textContent),
            // Un ancestro interactivo (fila clickeable que envuelve al control)
            // es un conflicto distinto al vecino: el fix no es mover nada, es
            // decidir quién gana el click dentro del mismo contenedor.
            esAncestroDelControl: interactivo.contains(el),
            puntos: 0,
            lados: [],
          };
          previo.puntos += 1;
          const lado =
            Math.abs(ox) >= Math.abs(oy) ? (ox < 0 ? 'izquierda' : 'derecha') : oy < 0 ? 'arriba' : 'abajo';
          if (!previo.lados.includes(lado)) previo.lados.push(lado);
          ladrones.set(clave, previo);
        }
      }

      resultados.push({
        slot,
        indice,
        identidad,
        visible: true,
        cubierto,
        quienCubre: !cubierto
          ? null
          : centro === null
            ? null
            : {
                tag: centro.tagName.toLowerCase(),
                slot: centro.getAttribute('data-slot'),
                texto: recortar(centro.textContent),
              },
        rect: {
          x: Number(rect.x.toFixed(1)),
          y: Number(rect.y.toFixed(1)),
          ancho: Number(rect.width.toFixed(1)),
          alto: Number(rect.height.toFixed(1)),
        },
        tactil: {
          ancho: anchoTactil,
          alto: altoTactil,
          extIzquierda: izq.alcance,
          extDerecha: der.alcance,
          extArriba: arr.alcance,
          extAbajo: aba.alcance,
          viaLabel: izq.viaLabel || der.viaLabel || arr.viaLabel || aba.viaLabel,
          topeViewport: izq.topeViewport || der.topeViewport || arr.topeViewport || aba.topeViewport,
          topeAlcance: izq.topeAlcance || der.topeAlcance || arr.topeAlcance || aba.topeAlcance,
        },
        cumple: !cubierto && anchoTactil >= minimo && altoTactil >= minimo,
        robos: [...ladrones.values()],
      });
    }
  }

  return resultados;
}

/**
 * Clave de deduplicación de un elemento medido, o null si es anónimo.
 *
 * TODO conteo de un barrido multi-ruta viene inflado por los elementos que se
 * repiten entre pantallas (shell, filtros clonados): N rutas × el mismo control
 * = N mediciones de UN elemento. La clave junta slot + la identidad más estable
 * disponible. Un elemento sin ninguna identidad NO se puede fusionar sin
 * riesgo de pegar controles distintos, así que devuelve null y el llamador lo
 * cuenta por (ruta, índice) — mejor sobrecontar declarado que subcontar mudo.
 */
export function claveIdentidad(elemento) {
  const id = elemento.identidad;
  const etiqueta = id.ariaLabel ?? id.labelTexto ?? id.name ?? id.id ?? id.testId ?? id.texto;
  return etiqueta === null || etiqueta === undefined ? null : `${elemento.slot}|${etiqueta}`;
}

/**
 * Agrega las mediciones planas ({ruta, ancho, ...elemento}) en un resumen por
 * (viewport, slot) con los DOS números que la trampa de los barridos multi-ruta
 * exige reportar siempre: bruto y deduplicado.
 */
export function resumir(planas) {
  const porViewport = new Map();

  for (const m of planas) {
    if (!porViewport.has(m.ancho)) porViewport.set(m.ancho, new Map());
    const porSlot = porViewport.get(m.ancho);
    if (!porSlot.has(m.slot)) {
      porSlot.set(m.slot, {
        brutos: 0,
        noVisibles: 0,
        cubiertos: 0,
        deshabilitados: 0,
        violacionesBrutas: 0,
        conRoboBruto: 0,
        unicos: new Set(),
        violacionesUnicas: new Set(),
        conRoboUnico: new Set(),
        detalleViolaciones: new Map(),
        detalleRobos: new Map(),
      });
    }
    const s = porSlot.get(m.slot);
    s.brutos += 1;

    const clave = claveIdentidad(m) ?? `${m.slot}|anonimo:${m.ruta}#${m.indice}`;
    s.unicos.add(clave);

    if (m.visible === false) {
      s.noVisibles += 1;
      continue;
    }
    if (m.identidad.deshabilitado) {
      s.deshabilitados += 1;
      continue;
    }
    if (m.cubierto) {
      s.cubiertos += 1;
      continue;
    }

    if (!m.cumple) {
      s.violacionesBrutas += 1;
      s.violacionesUnicas.add(clave);
      const detalle = s.detalleViolaciones.get(clave) ?? {
        clave,
        tactil: `${m.tactil.ancho}×${m.tactil.alto}`,
        rutas: new Set(),
      };
      detalle.rutas.add(m.ruta);
      s.detalleViolaciones.set(clave, detalle);
    }

    if (m.robos.length > 0) {
      s.conRoboBruto += 1;
      s.conRoboUnico.add(clave);
      const detalle = s.detalleRobos.get(clave) ?? { clave, ladrones: new Set(), rutas: new Set() };
      for (const l of m.robos) {
        detalle.ladrones.add(`${l.slot ?? l.tag}: ${l.ariaLabel ?? l.texto ?? '(sin texto)'}`);
      }
      detalle.rutas.add(m.ruta);
      s.detalleRobos.set(clave, detalle);
    }
  }

  // Sets y Maps no sobreviven JSON.stringify: se materializan acá y no en el
  // consumidor, para que el JSON de salida sea autocontenido.
  const salida = {};
  for (const [ancho, porSlot] of porViewport) {
    salida[ancho] = {};
    for (const [slot, s] of porSlot) {
      salida[ancho][slot] = {
        brutos: s.brutos,
        unicos: s.unicos.size,
        noVisibles: s.noVisibles,
        deshabilitados: s.deshabilitados,
        cubiertos: s.cubiertos,
        violacionesBrutas: s.violacionesBrutas,
        violacionesUnicas: s.violacionesUnicas.size,
        conRoboBruto: s.conRoboBruto,
        conRoboUnico: s.conRoboUnico.size,
        detalleViolaciones: [...s.detalleViolaciones.values()].map((d) => ({
          ...d,
          rutas: [...d.rutas],
        })),
        detalleRobos: [...s.detalleRobos.values()].map((d) => ({
          ...d,
          ladrones: [...d.ladrones],
          rutas: [...d.rutas],
        })),
      };
    }
  }
  return salida;
}
