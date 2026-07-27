import { CATALOGO_PERMISOS } from './catalogo';
import {
  ContextoAsignable,
  filtrarCatalogoAsignable,
  filtrarCatalogoAgrupadoAsignable,
  submoduloEsAsignable,
} from './catalogo-asignable';

// Filtra el catálogo de permisos por el vertical activo + packs activos de la
// org. Convención: un submódulo `{modulo}.{submodulo}` que sea CLAVE de un pack
// solo es asignable si ese pack está activo; submódulos cross-vertical
// (`organizacion`, `sistema`) y los del vertical activo no asociados a pack
// entran siempre; submódulos de otro vertical se excluyen.
describe('filtrarCatalogoAsignable', () => {
  // Catálogo simulado de claves de packs (lo que existe en la tabla Pack).
  const PACKS_CATALOGO = ['contabilidad.adjuntos', 'contabilidad.rag', 'granja.rag'];

  const ctx = (over: Partial<ContextoAsignable> = {}): ContextoAsignable => ({
    vertical: 'CONTABILIDAD',
    packsCatalogo: PACKS_CATALOGO,
    packsActivos: [],
    ...over,
  });

  describe('vertical', () => {
    it('incluye permisos del vertical CONTABILIDAD y excluye los de granja', () => {
      const keys = filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctx()).map((p) => p.key);

      expect(keys).toContain('contabilidad.asientos.read');
      expect(keys.some((k) => k.startsWith('granja.'))).toBe(false);
    });

    it('incluye permisos del vertical GRANJA y excluye los de contabilidad', () => {
      const keys = filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctx({ vertical: 'GRANJA' })).map(
        (p) => p.key,
      );

      expect(keys).toContain('granja.lotes.read');
      expect(keys.some((k) => k.startsWith('contabilidad.'))).toBe(false);
    });

    it('sin vertical activo (null) solo deja los permisos cross-vertical', () => {
      const keys = filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctx({ vertical: null })).map(
        (p) => p.key,
      );

      expect(keys.some((k) => k.startsWith('contabilidad.'))).toBe(false);
      expect(keys.some((k) => k.startsWith('granja.'))).toBe(false);
      expect(keys).toContain('organizacion.miembros.read');
    });
  });

  describe('cross-vertical (organizacion / sistema) siempre asignable', () => {
    // El módulo `sistema` quedó SIN permisos en el catálogo real: su único
    // entrada (`sistema.feature-flags.admin`) era un permiso muerto y se borró.
    // La regla cross-vertical sigue viva en `submoduloEsAsignable`, así que se
    // la ejercita con un catálogo sintético — atarla al catálogo real haría que
    // el día que alguien sume un permiso de `sistema` nadie sepa si la regla
    // seguía funcionando.
    const CATALOGO_CON_SISTEMA = [
      ...CATALOGO_PERMISOS,
      {
        key: 'sistema.mantenimiento.execute',
        modulo: 'sistema',
        submodulo: 'mantenimiento',
        accion: 'execute',
        descripcion: 'Permiso sintético, solo para este test',
      },
    ];

    it('incluye organizacion.* y sistema.* en una org de contabilidad', () => {
      const keys = filtrarCatalogoAsignable(CATALOGO_CON_SISTEMA, ctx()).map((p) => p.key);
      expect(keys).toContain('organizacion.roles.read');
      expect(keys).toContain('sistema.mantenimiento.execute');
    });

    it('incluye organizacion.* y sistema.* en una org de granja', () => {
      const keys = filtrarCatalogoAsignable(CATALOGO_CON_SISTEMA, ctx({ vertical: 'GRANJA' })).map(
        (p) => p.key,
      );
      expect(keys).toContain('organizacion.roles.read');
      expect(keys).toContain('sistema.mantenimiento.execute');
    });

    it('sistema es cross-vertical incluso sin vertical activo', () => {
      expect(submoduloEsAsignable('sistema', 'mantenimiento', ctx({ vertical: null }))).toBe(true);
    });
  });

  describe('packs', () => {
    it('NO incluye permisos de un submódulo de pack cuando el pack está inactivo', () => {
      // contabilidad.adjuntos es clave de pack y no está activo.
      const keys = filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctx({ packsActivos: [] })).map(
        (p) => p.key,
      );

      expect(keys.some((k) => k.startsWith('contabilidad.adjuntos.'))).toBe(false);
    });

    it('incluye permisos de un submódulo de pack cuando el pack está activo', () => {
      const keys = filtrarCatalogoAsignable(
        CATALOGO_PERMISOS,
        ctx({ packsActivos: ['contabilidad.adjuntos'] }),
      ).map((p) => p.key);

      // El catálogo de permisos hoy no define contabilidad.adjuntos.* todavía
      // (el pack es placeholder). El submódulo central (asientos) sí entra.
      expect(keys).toContain('contabilidad.asientos.read');
      // Y el predicado de asignabilidad acepta el submódulo del pack activo.
      expect(
        submoduloEsAsignable(
          'contabilidad',
          'adjuntos',
          ctx({ packsActivos: ['contabilidad.adjuntos'] }),
        ),
      ).toBe(true);
    });

    it('un submódulo del vertical que NO es clave de pack entra siempre (core del vertical)', () => {
      // contabilidad.asientos no es clave de ningún pack → es core, siempre asignable.
      const keys = filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctx({ packsActivos: [] })).map(
        (p) => p.key,
      );
      expect(keys).toContain('contabilidad.asientos.read');
      expect(keys).toContain('contabilidad.plan-cuentas.read');
    });

    // Task 0.18 (conciliacion-bancaria): primer pack con permisos PROPIOS en
    // el catálogo (adjuntos reusó asientos.read/update, es placeholder). Cierra
    // el loop con datos reales: confirma que el mecanismo genérico alcanza sin
    // tocar catalogo-asignable.ts.
    it('contabilidad.conciliacion (primer pack con permisos propios): filtrado real por pack activo/inactivo', () => {
      const PACKS_CON_CONCILIACION = [...PACKS_CATALOGO, 'contabilidad.conciliacion'];
      const ctxConPacks = (over: Partial<ContextoAsignable> = {}): ContextoAsignable => ({
        vertical: 'CONTABILIDAD',
        packsCatalogo: PACKS_CON_CONCILIACION,
        packsActivos: [],
        ...over,
      });

      const inactivo = filtrarCatalogoAsignable(CATALOGO_PERMISOS, ctxConPacks()).map((p) => p.key);
      expect(inactivo).not.toContain('contabilidad.conciliacion.read');
      expect(inactivo).not.toContain('contabilidad.conciliacion.importar');

      const activo = filtrarCatalogoAsignable(
        CATALOGO_PERMISOS,
        ctxConPacks({ packsActivos: ['contabilidad.conciliacion'] }),
      ).map((p) => p.key);
      expect(activo).toContain('contabilidad.conciliacion.read');
      expect(activo).toContain('contabilidad.conciliacion.importar');
      expect(activo).toContain('contabilidad.conciliacion.conciliar');
    });
  });
});

describe('submoduloEsAsignable', () => {
  const PACKS_CATALOGO = ['contabilidad.adjuntos', 'granja.rag'];
  const ctx = (over: Partial<ContextoAsignable> = {}): ContextoAsignable => ({
    vertical: 'CONTABILIDAD',
    packsCatalogo: PACKS_CATALOGO,
    packsActivos: [],
    ...over,
  });

  it('organizacion siempre asignable, sin importar el vertical', () => {
    expect(submoduloEsAsignable('organizacion', 'miembros', ctx({ vertical: null }))).toBe(true);
    expect(submoduloEsAsignable('organizacion', 'roles', ctx({ vertical: 'GRANJA' }))).toBe(true);
  });

  it('sistema siempre asignable', () => {
    expect(submoduloEsAsignable('sistema', 'feature-flags', ctx({ vertical: null }))).toBe(true);
  });

  it('submódulo de otro vertical NO asignable', () => {
    expect(submoduloEsAsignable('granja', 'lotes', ctx({ vertical: 'CONTABILIDAD' }))).toBe(false);
    expect(submoduloEsAsignable('contabilidad', 'asientos', ctx({ vertical: 'GRANJA' }))).toBe(
      false,
    );
  });

  it('submódulo core del vertical (no es pack) asignable', () => {
    expect(submoduloEsAsignable('contabilidad', 'asientos', ctx())).toBe(true);
  });

  it('submódulo que es clave de pack solo asignable si el pack está activo', () => {
    expect(submoduloEsAsignable('contabilidad', 'adjuntos', ctx({ packsActivos: [] }))).toBe(false);
    expect(
      submoduloEsAsignable(
        'contabilidad',
        'adjuntos',
        ctx({ packsActivos: ['contabilidad.adjuntos'] }),
      ),
    ).toBe(true);
  });
});

describe('filtrarCatalogoAgrupadoAsignable', () => {
  const PACKS_CATALOGO = ['contabilidad.adjuntos'];
  const ctx = (over: Partial<ContextoAsignable> = {}): ContextoAsignable => ({
    vertical: 'CONTABILIDAD',
    packsCatalogo: PACKS_CATALOGO,
    packsActivos: [],
    ...over,
  });

  it('agrupa solo los módulos/submódulos asignables', () => {
    const grupos = filtrarCatalogoAgrupadoAsignable(ctx());
    const modulos = grupos.map((g) => g.modulo);

    expect(modulos).toContain('contabilidad');
    expect(modulos).toContain('organizacion');
    expect(modulos).not.toContain('granja');
    // `sistema` no aparece porque quedó sin permisos en el catálogo, no porque
    // el filtro lo excluya: la función descarta los grupos vacíos.
    expect(modulos).not.toContain('sistema');
  });

  it('no deja módulos vacíos en el agrupado', () => {
    const grupos = filtrarCatalogoAgrupadoAsignable(ctx());
    for (const g of grupos) {
      expect(g.submodulos.length).toBeGreaterThan(0);
      for (const s of g.submodulos) {
        expect(s.permisos.length).toBeGreaterThan(0);
      }
    }
  });
});
