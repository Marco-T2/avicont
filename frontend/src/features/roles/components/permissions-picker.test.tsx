import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogoAgrupado } from '@/types/api';

import { PermissionsPicker } from './permissions-picker';

// El picker es PRESENTACIONAL: renderiza EXACTAMENTE el catálogo que recibe del
// backend (ya filtrado server-authoritative por vertical + packs activos, cierre
// deuda RBAC §7). NO re-filtra en cliente — espeja el backend, igual que
// usePermissions.
//
// Los permisos ya no muestran su key como texto (el hijo es sólo el verbo), así
// que se los ubica por el `title` del label, que la trae completa.

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

// Un módulo con varias acciones en un submódulo: alcanza para tri-state,
// cascada y buscador sin ruido de otros grupos.
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

const buscar = (): HTMLElement => screen.getByLabelText('Buscar permiso');

describe('PermissionsPicker — espeja el catálogo filtrado del backend', () => {
  it('renderiza solo los permisos que el backend devolvió', async () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    // El primer módulo viene desplegado; el segundo hay que abrirlo.
    expect(screen.getByTitle(/contabilidad\.asientos\.read/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Organización/ }));
    expect(screen.getByTitle(/organizacion\.roles\.read/)).toBeInTheDocument();
  });

  it('NO muestra permisos de otro vertical (granja) porque el backend no los incluyó', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.queryByTitle(/granja\./)).not.toBeInTheDocument();
    expect(screen.queryByText('Granja')).not.toBeInTheDocument();
  });

  it('NO muestra permisos de un submódulo de pack inactivo (no vino del backend)', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.queryByTitle(/contabilidad\.ventas\./)).not.toBeInTheDocument();
  });
});

describe('PermissionsPicker — acordeón', () => {
  it('al entrar sólo el primer módulo viene desplegado (evita el muro de checkboxes)', () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /Contabilidad/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: /Organización/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // Y lo que está plegado no está en el DOM.
    expect(screen.queryByTitle(/organizacion\.roles\.read/)).not.toBeInTheDocument();
  });

  it('el primer click sobre el módulo ya desplegado lo pliega', async () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Contabilidad/ }));

    expect(screen.getByRole('button', { name: /Contabilidad/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTitle(/contabilidad\.asientos\.read/)).not.toBeInTheDocument();
  });
});

describe('PermissionsPicker — tri-state y cascada', () => {
  it('sin nada seleccionado, la cabecera del módulo está vacía', () => {
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole('checkbox', { name: /Seleccionar todo Contabilidad/ }),
    ).toHaveAttribute('data-state', 'unchecked');
  });

  it('con una parte seleccionada, la cabecera queda INDETERMINADA (no marcada)', () => {
    render(
      <PermissionsPicker
        catalogo={catalogoAsientos}
        selected={['contabilidad.asientos.read']}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: /Seleccionar todo Contabilidad/ }),
    ).toHaveAttribute('data-state', 'indeterminate');
  });

  it('con todo seleccionado, la cabecera queda marcada', () => {
    render(
      <PermissionsPicker
        catalogo={catalogoAsientos}
        selected={[
          'contabilidad.asientos.read',
          'contabilidad.asientos.create',
          'contabilidad.asientos.post',
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: /Seleccionar todo Contabilidad/ }),
    ).toHaveAttribute('data-state', 'checked');
  });

  it('la cabecera en cascada marca todos los hijos', async () => {
    const onChange = vi.fn();
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={onChange} />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Seleccionar todo Contabilidad/ }),
    );

    expect(onChange).toHaveBeenCalledWith([
      'contabilidad.asientos.read',
      'contabilidad.asientos.create',
      'contabilidad.asientos.post',
    ]);
  });

  it('la cabecera con todo marcado desmarca todos los hijos', async () => {
    const onChange = vi.fn();
    render(
      <PermissionsPicker
        catalogo={catalogoAsientos}
        selected={[
          'contabilidad.asientos.read',
          'contabilidad.asientos.create',
          'contabilidad.asientos.post',
        ]}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Seleccionar todo Contabilidad/ }),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('PermissionsPicker — buscador', () => {
  it('filtra y expande los grupos con coincidencias', async () => {
    render(
      <PermissionsPicker catalogo={catalogoFiltrado} selected={[]} onChange={vi.fn()} />,
    );

    // 'roles' vive en el segundo módulo, que arranca plegado.
    await userEvent.type(buscar(), 'roles');

    expect(screen.getByTitle(/organizacion\.roles\.read/)).toBeInTheDocument();
    expect(screen.queryByTitle(/contabilidad\.asientos\.read/)).not.toBeInTheDocument();
  });

  it('encuentra por el verbo visible, no sólo por la clave técnica', async () => {
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={vi.fn()} />,
    );

    await userEvent.type(buscar(), 'Contabilizar');

    expect(screen.getByTitle(/contabilidad\.asientos\.post/)).toBeInTheDocument();
    expect(screen.queryByTitle(/contabilidad\.asientos\.read/)).not.toBeInTheDocument();
  });

  it('avisa cuando no hay coincidencias, en vez de mostrar la lista vacía', async () => {
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={vi.fn()} />,
    );

    await userEvent.type(buscar(), 'zzz');

    expect(screen.getByText(/Ningún permiso coincide/)).toBeInTheDocument();
  });

  // El efecto invisible que hay que evitar: con una búsqueda activa, una
  // cascada que opere sobre el grupo COMPLETO marca permisos que el usuario no
  // tiene a la vista y no va a revisar antes de guardar.
  it('la cascada con búsqueda activa marca SOLO los permisos visibles', async () => {
    const onChange = vi.fn();
    render(
      <PermissionsPicker catalogo={catalogoAsientos} selected={[]} onChange={onChange} />,
    );

    await userEvent.type(buscar(), 'Contabilizar');
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Seleccionar todo Contabilidad/ }),
    );

    expect(onChange).toHaveBeenCalledWith(['contabilidad.asientos.post']);
  });
});

describe('PermissionsPicker — sólo lectura', () => {
  it('con disabled, ningún checkbox es operable', () => {
    render(
      <PermissionsPicker
        catalogo={catalogoAsientos}
        selected={[]}
        onChange={vi.fn()}
        disabled
      />,
    );

    for (const cb of screen.getAllByRole('checkbox')) {
      expect(cb).toBeDisabled();
    }
  });
});
