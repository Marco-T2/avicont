import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformActivityItem } from '@/types/api';

import { ActivityTimeline } from './activity-timeline';

const ITEMS: PlatformActivityItem[] = [
  {
    id: 'audit-1',
    action: 'platform.org.create',
    actorUserId: 'user-sa-1',
    actor: { email: 'admin@example.com', displayName: 'Admin SA' },
    targetOrganizationId: 'org-1',
    targetOrganization: { name: 'Avícola del Valle' },
    createdAt: '2026-06-01T10:30:00Z',
  },
  {
    id: 'audit-2',
    action: 'platform.org.status.update',
    actorUserId: 'user-sa-1',
    actor: { email: 'admin@example.com' },
    targetOrganizationId: null,
    targetOrganization: null,
    createdAt: '2026-06-02T08:00:00Z',
  },
];

describe('ActivityTimeline', () => {
  it('renderiza un item por entrada del timeline', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.getByText('platform.org.create')).toBeInTheDocument();
    expect(screen.getByText('platform.org.status.update')).toBeInTheDocument();
  });

  it('muestra el nombre de la org destino cuando está presente', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.getByText('Avícola del Valle')).toBeInTheDocument();
  });

  it('usa displayName del actor si está disponible', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    // El primer item tiene displayName 'Admin SA'
    expect(screen.getByText('Admin SA')).toBeInTheDocument();
  });

  it('cae al email del actor cuando displayName no está disponible', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    // El segundo item no tiene displayName
    const emailEls = screen.getAllByText('admin@example.com');
    expect(emailEls.length).toBeGreaterThan(0);
  });

  it('muestra el botón "Cargar más" cuando hay más páginas', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={true}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /cargar más/i })).toBeInTheDocument();
  });

  it('no muestra "Cargar más" cuando no hay más páginas', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it('llama a onFetchMore al hacer clic en "Cargar más"', async () => {
    const onFetchMore = vi.fn();
    const user = userEvent.setup();

    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={true}
        isFetchingNextPage={false}
        onFetchMore={onFetchMore}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cargar más/i }));

    expect(onFetchMore).toHaveBeenCalledOnce();
  });

  it('no muestra "Cargar más" mientras se está cargando la siguiente página', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={true}
        isFetchingNextPage={true}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it('muestra el empty state cuando no hay items', () => {
    render(
      <ActivityTimeline
        items={[]}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.getByText('Sin actividad registrada.')).toBeInTheDocument();
  });

  it('muestra "No hay más actividad" cuando se cargaron todos los items', () => {
    render(
      <ActivityTimeline
        items={ITEMS}
        hasNextPage={false}
        isFetchingNextPage={false}
        onFetchMore={vi.fn()}
      />,
    );

    expect(screen.getByText('No hay más actividad.')).toBeInTheDocument();
  });
});
