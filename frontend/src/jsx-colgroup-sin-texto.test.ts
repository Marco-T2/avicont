import { describe, expect, it } from 'vitest';

//
// `<colgroup>` no admite nodos de texto. En JSX, un rótulo escrito como
// comentario AL FINAL de la línea del `<col … />` deja un text node `" "` entre
// hermanos: el espacio que queda antes de la llave no lleva salto de línea, así
// que JSX lo conserva. React lo reporta en consola como error de hidratación.
//
// La forma correcta es el comentario DENTRO del tag, en posición de atributo:
//
//     <col className="w-[9%]" /* Fecha */ />
//
// Por qué un test estático y no sólo el assert sobre el DOM: el defecto se
// replica copiando un `<colgroup>` a una tabla nueva, y ese archivo nuevo no
// trae un test que lo mire. Este barrido cubre las 5 tablas de hoy y las que
// vengan. La red fuerte del caso concreto vive en `comprobantes-table.test.tsx`,
// que assertea sobre el DOM realmente renderizado.
//
const fuentes = import.meta.glob('./**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('<colgroup> sin nodos de texto', () => {
  it('encuentra los archivos con <col> (si no, el barrido no prueba nada)', () => {
    const conCol = Object.entries(fuentes).filter(([, src]) => /<col[\s/>]/.test(src));
    expect(conCol.length).toBeGreaterThanOrEqual(5);
  });

  it('ningún <col> tiene una expresión JSX pegada en la misma línea', () => {
    const infracciones: string[] = [];

    for (const [archivo, src] of Object.entries(fuentes)) {
      src.split('\n').forEach((linea, i) => {
        if (!/<col[\s/>]/.test(linea)) return;
        // `<col … /> {…}` y `{…} <col … />`: ambos dejan un " " entre hermanos.
        if (/\/>\s+\{/.test(linea) || /\}\s+<col/.test(linea)) {
          infracciones.push(`${archivo}:${i + 1} → ${linea.trim()}`);
        }
      });
    }

    expect(infracciones).toEqual([]);
  });
});
