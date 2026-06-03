import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { backendErrorMessage } from '@/lib/error-messages';

import { EmpresaForm } from '../components/empresa-form';
import { useEmpresa, useUpdateEmpresa } from '../hooks/use-empresa';
import type { EmpresaFormValues } from '../schemas/empresa-form-schema';

// /settings/empresa — página contenedora del perfil fiscal de la organización.
// Orquesta la query (precargar valores) y la mutation (guardar).
// Anti-F-13: toast SOLO en los callbacks de la mutation, nunca en el render.
export function EmpresaPage(): React.JSX.Element {
  const empresaQuery = useEmpresa();
  const updateMutation = useUpdateEmpresa();

  function handleSubmit(values: EmpresaFormValues): void {
    updateMutation.mutate(values, {
      onSuccess: () => toast.success('Datos de la empresa actualizados'),
      onError: (err) =>
        toast.error(backendErrorMessage(err, 'No se pudieron guardar los cambios')),
    });
  }

  // Mapea null del backend a '' para que react-hook-form trabaje solo con strings.
  const defaultValues: Partial<EmpresaFormValues> =
    empresaQuery.data !== undefined
      ? {
          razonSocial: empresaQuery.data.razonSocial ?? '',
          nit: empresaQuery.data.nit ?? '',
          direccion: empresaQuery.data.direccion ?? '',
          representanteLegal: empresaQuery.data.representanteLegal ?? '',
          telefono: empresaQuery.data.telefono ?? '',
          email: empresaQuery.data.email ?? '',
        }
      : {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Datos de la empresa</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Perfil fiscal de la organización. Estos datos aparecen en la cabecera de los
          informes contables.
        </p>
      </div>

      {/* Skeleton proporcional al form mientras carga */}
      {empresaQuery.isLoading ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ) : null}

      {/* Banner inline de error al cargar — Anti-F-13: no toast */}
      {empresaQuery.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            No se pudieron cargar los datos de la empresa. Intentá recargar la página.
          </p>
        </div>
      ) : null}

      {/* Formulario una vez que tenemos datos */}
      {empresaQuery.data !== undefined ? (
        <EmpresaForm
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          isPending={updateMutation.isPending}
        />
      ) : null}
    </div>
  );
}
