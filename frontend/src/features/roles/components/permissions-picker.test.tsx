import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// La key completa (`contabilidad.asientos.read`) ya no se pinta como texto bajo
// cada checkbox: es la concatenación literal de módulo + submódulo + acción y
// triplicaba el alto de cada fila. Vive en el `title` del label, así que estos
// tests la buscan ahí — misma aserción, distinta sonda.
describe('PermissionsPicker (espeja el catálogo filtrado del backend)', () => {
  it('renderiza solo los permisos que el backend devolvió', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByTitle('contabilidad.asientos.read')).toBeInTheDocument();
    expect(screen.getByTitle('organizacion.roles.read')).toBeInTheDocument();
  });

  it('NO muestra permisos de otro vertical (granja) porque el backend no los incluyó', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.queryByTitle(/^granja\./)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /granja/i })).not.toBeInTheDocument();
  });

  it('NO muestra permisos de un submódulo de pack inactivo (no vino del backend)', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    // contabilidad.ventas.* fue filtrado por el backend (pack inactivo) → ausente.
    expect(screen.queryByTitle(/^contabilidad\.ventas\./)).not.toBeInTheDocument();
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

    expect(screen.getByTitle('contabilidad.ventas.read')).toBeInTheDocument();
  });
});

// Catálogo de un solo submódulo con varias acciones: alcanza para ejercitar el
// buscador y el "Seleccionar todos" sin ruido de otros grupos.
const catalogoAsientos: CatalogoAgrupado[] = [
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
          {
            key: 'contabilidad.asientos.create',
            modulo: 'contabilidad',
            submodulo: 'asientos',
            accion: 'create',
            descripcion: 'Crear asientos contables',
          },
          {
            key: 'contabilidad.asientos.post',
            modulo: 'contabilidad',
            submodulo: 'asientos',
            accion: 'post',
            descripcion: 'Contabilizar asientos',
          },
        ],
      },
    ],
  },
];

describe('PermissionsPicker — buscador', () => {
  it('filtra por descripción y oculta los que no coinciden', async () => {
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Buscar permiso'), 'Contabilizar');

    expect(screen.getByTitle('contabilidad.asientos.post')).toBeInTheDocument();
    expect(screen.queryByTitle('contabilidad.asientos.read')).not.toBeInTheDocument();
    expect(screen.queryByTitle('contabilidad.asientos.create')).not.toBeInTheDocument();
  });

  it('filtra por la key completa (lo que un usuario técnico va a tipear)', async () => {
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Buscar permiso'), 'asientos.create');

    expect(screen.getByTitle('contabilidad.asientos.create')).toBeInTheDocument();
    expect(screen.queryByTitle('contabilidad.asientos.read')).not.toBeInTheDocument();
  });

  it('avisa cuando la búsqueda no encuentra nada, en vez de mostrar la lista vacía', async () => {
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Buscar permiso'), 'zzz');

    expect(screen.getByText(/Ningún permiso coincide/)).toBeInTheDocument();
  });

  // El efecto invisible que hay que evitar: con una búsqueda activa, un
  // "Seleccionar todos" que opere sobre el grupo COMPLETO agrega permisos que
  // el usuario no tiene a la vista y no va a revisar antes de guardar.
  it('"Seleccionar todos" con búsqueda activa marca SOLO los permisos visibles', async () => {
    const onChange = vi.fn();
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={onChange} />,
    );

    await userEvent.type(screen.getByLabelText('Buscar permiso'), 'Contabilizar');
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar todos' }));

    expect(onChange).toHaveBeenCalledWith(['contabilidad.asientos.post']);
  });

  it('sin búsqueda, "Seleccionar todos" marca el submódulo entero', async () => {
    const onChange = vi.fn();
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar todos' }));

    expect(onChange).toHaveBeenCalledWith([
      'contabilidad.asientos.read',
      'contabilidad.asientos.create',
      'contabilidad.asientos.post',
    ]);
  });
});
