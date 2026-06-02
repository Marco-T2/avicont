import { MoreHorizontal, Plus, ToggleRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FeatureFlag } from '@/types/api';

import { FeatureFlagDeleteDialog } from '../components/feature-flag-delete-dialog';
import { FeatureFlagSheet } from '../components/feature-flag-sheet';
import { useFeatureFlags } from '../hooks/use-feature-flags';
import { useToggleFeatureFlag } from '../hooks/use-toggle-feature-flag';

/**
 * Catálogo GLOBAL de feature flags de la plataforma (super-admin, PR-4).
 * Container: orquesta useFeatureFlags + useToggleFeatureFlag y maneja
 * loading/empty/error. Cada fila tiene un Switch para alternar el estado
 * (on-success refresh) y un menú de acciones (editar / eliminar). El alta y la
 * edición usan FeatureFlagSheet; la baja, FeatureFlagDeleteDialog.
 */
export function FeatureFlagsPage(): React.JSX.Element {
  const { data, isLoading, isError } = useFeatureFlags();
  const toggleMutation = useToggleFeatureFlag();

  // null + open → crear; flag presente → editar.
  const [sheetFlag, setSheetFlag] = useState<FeatureFlag | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteFlag, setDeleteFlag] = useState<FeatureFlag | null>(null);

  function abrirCrear(): void {
    setSheetFlag(null);
    setSheetOpen(true);
  }

  function abrirEditar(flag: FeatureFlag): void {
    setSheetFlag(flag);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Feature flags</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Catálogo global de feature flags del sistema.
          </p>
        </div>
        <Button onClick={abrirCrear} className="self-start">
          <Plus className="h-4 w-4 mr-2" />
          Nueva feature flag
        </Button>
      </div>

      <FeatureFlagsContent
        data={data}
        isLoading={isLoading}
        isError={isError}
        onToggle={(flag) => toggleMutation.mutate(flag.key)}
        toggleDisabled={toggleMutation.isPending}
        onEdit={abrirEditar}
        onDelete={setDeleteFlag}
      />

      <FeatureFlagSheet
        flag={sheetOpen ? sheetFlag : null}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSheetFlag(null);
        }}
      />

      <FeatureFlagDeleteDialog
        flag={deleteFlag}
        open={deleteFlag !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteFlag(null);
        }}
      />
    </div>
  );
}

interface FeatureFlagsContentProps {
  data: FeatureFlag[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onToggle: (flag: FeatureFlag) => void;
  toggleDisabled: boolean;
  onEdit: (flag: FeatureFlag) => void;
  onDelete: (flag: FeatureFlag) => void;
}

function FeatureFlagsContent({
  data,
  isLoading,
  isError,
  onToggle,
  toggleDisabled,
  onEdit,
  onDelete,
}: FeatureFlagsContentProps): React.JSX.Element {
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">No se pudieron cargar las feature flags.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const flags = data ?? [];

  if (flags.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <ToggleRight className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No hay feature flags</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todavía no se creó ningún feature flag global en el sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-md border">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background min-w-[200px]">
              Clave
            </TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <TableRow key={flag.id}>
              <TableCell className="sticky left-0 z-10 bg-background">
                <code className="text-xs font-medium">{flag.key}</code>
              </TableCell>
              <TableCell className="font-medium">{flag.name}</TableCell>
              <TableCell className="max-w-[280px] truncate text-muted-foreground text-xs">
                {flag.description ?? '—'}
              </TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={flag.enabled}
                  disabled={toggleDisabled}
                  onCheckedChange={() => onToggle(flag)}
                  aria-label={`Habilitar ${flag.key}`}
                />
              </TableCell>
              <TableCell className="text-right">
                <FeatureFlagRowActions flag={flag} onEdit={onEdit} onDelete={onDelete} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface FeatureFlagRowActionsProps {
  flag: FeatureFlag;
  onEdit: (flag: FeatureFlag) => void;
  onDelete: (flag: FeatureFlag) => void;
}

function FeatureFlagRowActions({
  flag,
  onEdit,
  onDelete,
}: FeatureFlagRowActionsProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:h-9 md:w-9"
          aria-label={`Acciones para ${flag.key}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onEdit(flag)}>Editar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(flag)}
        >
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
