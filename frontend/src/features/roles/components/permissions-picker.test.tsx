import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogoAgrupado } from '@/types/api';

import { PermissionsPicker } from './permissions-picker';

// El picker es PRESENTACIONAL: renderiza EXACTAMENTE el catálogo que recibe del
// backend (ya filtrado server-authoritative por vertical + packs activos, cierre
// deuda RBAC §7). NO re-filtra en cliente — espeja el backend, igual que
// usePermissions. Estos tests verifican que no muestra nada que el backend no
// haya devuelto.

// Catálogo como lo devolvería el backend para una org de CONTABILIDAD sin el
// pack contabilidad.ventas activo: contabilidad core + organizacion, SIN granja
// ni el submódulo del pack inactivo.
const catalogoFiltrado: CatalogoAgrupado[] = [
  {
    modulo: 'contabilidad',
    submodulos: [
      {
        submodulo: 'asientos',
        permisos: [
          {
            key: 'contabilidad.asientos.read',
            modulo: 'contabilidad',
            submodulo: 'asientos',
            accion: 'read',
            descripcion: 'Listar y ver asientos contables',
          },
        ],
      },
    ],
  },
  {
    modulo: 'organizacion',
    submodulos: [
      {
        submodulo: 'roles',
        permisos: [
          {
            key: 'organizacion.roles.read',
            modulo: 'organizacion',
            submodulo: 'roles',
            accion: 'read',
            descripcion: 'Listar y ver roles personalizados',
          },
        ],
      },
    ],
  },
];

describe('PermissionsPicker (espeja el catálogo filtrado del backend)', () => {
  it('renderiza solo los permisos que el backend devolvió', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText('contabilidad.asientos.read')).toBeInTheDocument();
    expect(screen.getByText('organizacion.roles.read')).toBeInTheDocument();
  });

  it('NO muestra permisos de otro vertical (granja) porque el backend no los incluyó', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.queryByText(/granja\./)).not.toBeInTheDocument();
    expect(screen.queryByText('granja')).not.toBeInTheDocument();
  });

  it('NO muestra permisos de un submódulo de pack inactivo (no vino del backend)', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    // contabilidad.ventas.* fue filtrado por el backend (pack inactivo) → ausente.
    expect(screen.queryByText(/contabilidad\.ventas\./)).not.toBeInTheDocument();
  });

  it('muestra el submódulo de pack cuando el backend SÍ lo devuelve (pack activo)', () => {
    const conPack: CatalogoAgrupado[] = [
      {
        modulo: 'contabilidad',
        submodulos: [
          {
            submodulo: 'ventas',
            permisos: [
              {
                key: 'contabilidad.ventas.read',
                modulo: 'contabilidad',
                submodulo: 'ventas',
                accion: 'read',
                descripcion: 'Listar y ver ventas',
              },
            ],
          },
        ],
      },
    ];

    render(<PermissionsPicker catalogo={conPack} selected={[]} onChange={vi.fn()} />);

    expect(screen.getByText('contabilidad.ventas.read')).toBeInTheDocument();
  });
});
