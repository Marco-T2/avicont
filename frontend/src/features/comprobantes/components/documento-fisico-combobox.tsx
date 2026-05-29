import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { mensajeComprobantes } from '@/lib/error-messages';
import { mensajeDocumentosFisicos } from '@/lib/error-messages';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';
// Cross-feature: hook de búsqueda de documentos físicos existentes (feature B).
import { useDocumentosFisicos } from '@/features/documentos-fisicos/hooks/use-documentos-fisicos';
// Cross-feature: hook de creación de documentos físicos (feature B).
import { useCreateDocumentoFisico } from '@/features/documentos-fisicos/hooks/use-documento-fisico-mutations';
// Cross-feature: hook de tipos de documento para derivar tiposComprobanteAplicables (D4, D8).
import { useTiposDocumentoFisico } from '@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico';
// Cross-feature: buildFormSchema y DEFAULT_CREATE_VALUES de la feature B.
import {
  buildFormSchema,
  DEFAULT_CREATE_VALUES,
  type DocumentoFisicoFormValues,
} from '@/features/documentos-fisicos/schemas/documento-fisico-form-schema';
import type { TipoComprobante } from '@/types/api';

import { useAsociarDocumentos } from '../hooks/use-asociar-documentos';

interface DocumentoFisicoComboboxProps {
  comprobanteId: string;
  tipoComprobante: TipoComprobante;
  disabled?: boolean;
}

/**
 * Combobox "buscar o crear" para documentos físicos en el contexto de un comprobante.
 * D2: Búsqueda server-side; ítem fijo "Crear «{q}»" abre un mini-form inline dentro del Popover.
 * D4/D8: pre-filtro client-side de compatibilidad por tiposComprobanteAplicables.
 * D3: crear+asociar = 2 mutations encadenadas; si create OK pero asociar falla, toast explica doc suelto.
 */
export function DocumentoFisicoCombobox({
  comprobanteId,
  tipoComprobante,
  disabled = false,
}: DocumentoFisicoComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // 'search' | 'create-form' — vista alterna dentro del mismo Popover (D2)
  const [view, setView] = useState<'search' | 'create-form'>('search');
  // Tipo seleccionado en el mini-form
  const [tipoIdEnForm, setTipoIdEnForm] = useState('');

  const debouncedSearch = useDebouncedValue(search, 350);

  // Cross-feature: lista de tipos con sus tiposComprobanteAplicables para el pre-filtro (D8).
  const { data: tiposData } = useTiposDocumentoFisico({ pageSize: 100, activo: true });
  const tiposCompatibles = useMemo(() => {
    const all = tiposData?.items ?? [];
    return all.filter((t) => t.tiposComprobanteAplicables.includes(tipoComprobante));
  }, [tiposData, tipoComprobante]);
  const tiposCompatiblesIds = useMemo(
    () => new Set(tiposCompatibles.map((t) => t.id)),
    [tiposCompatibles],
  );

  // Cross-feature: búsqueda de documentos existentes.
  // disponibleParaAsociar=true excluye los consumidos por otro comprobante CONTABILIZADO;
  // los SUELTOS y los de borradores siguen apareciendo.
  const { data: docsData, isLoading: isLoadingDocs } = useDocumentosFisicos({
    numero: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    pageSize: 20,
    disponibleParaAsociar: true,
  });

  // D4: pre-filtro client-side — solo mostrar docs cuyo tipo es compatible.
  const docsCompatibles = useMemo(() => {
    const all = docsData?.items ?? [];
    return all.filter((d) => tiposCompatiblesIds.has(d.tipoDocumentoFisico.id));
  }, [docsData, tiposCompatiblesIds]);

  const asociarMutation = useAsociarDocumentos(comprobanteId);
  const createMutation = useCreateDocumentoFisico();

  // Mini-form para creación inline (D2).
  const tipoEnFormSeleccionado = useMemo(
    () => tiposCompatibles.find((t) => t.id === tipoIdEnForm),
    [tiposCompatibles, tipoIdEnForm],
  );
  const esTributarioEnForm = tipoEnFormSeleccionado?.esTributario ?? false;
  const miniFormSchema = useMemo(() => buildFormSchema(esTributarioEnForm), [esTributarioEnForm]);

  const miniForm = useForm<DocumentoFisicoFormValues>({
    resolver: zodResolver(miniFormSchema),
    defaultValues: { ...DEFAULT_CREATE_VALUES, numero: search },
  });

  const { register: regMini, handleSubmit: handleMiniSubmit, formState: { errors: miniErrors }, setValue: setMiniValue, reset: resetMini } = miniForm;

  // Capturar el onChange de RHF para el select de tipo, para poder componerlo
  // con el handler propio sin romper la actualización interna de RHF.
  const { onChange: onChangeTipoRhf, ...regTipoRest } = regMini('tipoDocumentoFisicoId');

  function handleSeleccionarExistente(docId: string): void {
    asociarMutation.mutate([docId], {
      onSuccess: () => {
        toast.success('Documento asociado correctamente');
        setOpen(false);
        setSearch('');
        setView('search');
      },
      onError: (err) => {
        toast.error(mensajeComprobantes(err));
      },
    });
  }

  function handleAbrirMiniForm(): void {
    resetMini({ ...DEFAULT_CREATE_VALUES, numero: search, tipoDocumentoFisicoId: '' });
    setTipoIdEnForm('');
    setView('create-form');
  }

  function handleCancelarMiniForm(): void {
    setView('search');
    resetMini(DEFAULT_CREATE_VALUES);
    setTipoIdEnForm('');
  }

  function handleMiniFormSubmit(values: DocumentoFisicoFormValues): void {
    // Validar con schema correcto (esTributario puede haber cambiado).
    const result = miniFormSchema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((e) => {
        const path = e.path[0];
        if (typeof path === 'string') {
          miniForm.setError(path as keyof DocumentoFisicoFormValues, { message: e.message });
        }
      });
      return;
    }
    const payload = esTributarioEnForm
      ? values
      : { ...values, monto: null, moneda: null };

    // D3: crear primero, luego asociar.
    createMutation.mutate(payload, {
      onSuccess: (nuevoDoc) => {
        // Encadenar asociación.
        asociarMutation.mutate([nuevoDoc.id], {
          onSuccess: () => {
            toast.success('Documento creado y asociado correctamente');
            setOpen(false);
            setSearch('');
            setView('search');
            resetMini(DEFAULT_CREATE_VALUES);
          },
          onError: (errAsociar) => {
            // D3: doc quedó SUELTO — toast explica que es recuperable desde el CRUD standalone.
            toast.error(
              `El documento fue creado pero no se pudo asociar: ${mensajeComprobantes(errAsociar)}. Podés buscarlo en "Documentos físicos" y asociarlo manualmente.`,
            );
            setOpen(false);
            setSearch('');
            setView('search');
            resetMini(DEFAULT_CREATE_VALUES);
          },
        });
      },
      onError: (errCreate) => {
        toast.error(mensajeDocumentosFisicos(errCreate));
      },
    });
  }

  const isPending = createMutation.isPending || asociarMutation.isPending;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setView('search');
          setSearch('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal text-muted-foreground"
        >
          <span className="truncate text-left">Buscar o crear documento…</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
        align="start"
      >
        {view === 'search' ? (
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por número…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoadingDocs ? (
                <CommandEmpty>Buscando…</CommandEmpty>
              ) : docsCompatibles.length === 0 && search.length === 0 ? (
                <CommandEmpty>Tipea un número para buscar.</CommandEmpty>
              ) : docsCompatibles.length === 0 ? (
                <>
                  <CommandEmpty>Sin resultados.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__crear__"
                      onSelect={handleAbrirMiniForm}
                      className="gap-2 text-primary"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Crear nuevo documento
                      {search.length > 0 ? (
                        <span className="font-mono font-semibold">«{search}»</span>
                      ) : null}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : (
                <CommandGroup>
                  {docsCompatibles.map((doc) => (
                    <CommandItem
                      key={doc.id}
                      value={doc.id}
                      onSelect={() => handleSeleccionarExistente(doc.id)}
                      disabled={asociarMutation.isPending}
                    >
                      <Check className="mr-2 h-4 w-4 shrink-0 opacity-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {doc.tipoDocumentoFisico.nombre}
                          </span>
                          <span className="font-mono font-semibold text-sm">{doc.numero}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{doc.fechaEmision}</div>
                      </div>
                    </CommandItem>
                  ))}
                  {/* Siempre ofrece crear nuevo al final cuando hay resultados */}
                  <CommandItem
                    value="__crear__"
                    onSelect={handleAbrirMiniForm}
                    className="gap-2 text-primary border-t mt-1 pt-1"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Crear nuevo documento
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        ) : (
          // Vista alterna: mini-form de creación inline (D2)
          <form
            onSubmit={(e) => {
              void handleMiniSubmit(handleMiniFormSubmit)(e);
            }}
            className="p-4 space-y-3"
            noValidate
          >
            <h3 className="text-sm font-semibold">Crear nuevo documento</h3>

            {/* Tipo */}
            <div className="space-y-1">
              <Label htmlFor="mini-tipo">
                Tipo <span className="text-destructive">*</span>
              </Label>
              <select
                {...regTipoRest}
                id="mini-tipo"
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
                  'text-base shadow-xs outline-none md:text-sm',
                  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                aria-invalid={miniErrors.tipoDocumentoFisicoId !== undefined}
                onChange={(e) => {
                  setTipoIdEnForm(e.target.value);
                  // Limpiar monto/moneda al cambiar tipo
                  setMiniValue('monto', null, { shouldValidate: false });
                  setMiniValue('moneda', null, { shouldValidate: false });
                  // Propagar al onChange de RHF capturado en el render para
                  // que _formValues se actualice correctamente.
                  void onChangeTipoRhf(e);
                }}
              >
                <option value="">Seleccioná un tipo…</option>
                {tiposCompatibles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              {miniErrors.tipoDocumentoFisicoId !== undefined ? (
                <p className="text-xs text-destructive">{miniErrors.tipoDocumentoFisicoId.message}</p>
              ) : null}
            </div>

            {/* Número */}
            <div className="space-y-1">
              <Label htmlFor="mini-numero">
                Número <span className="text-destructive">*</span>
              </Label>
              <Input
                {...regMini('numero', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    setMiniValue('numero', e.target.value.toUpperCase(), { shouldValidate: false });
                  },
                })}
                id="mini-numero"
                placeholder="Ej: F-001"
                className="text-base md:text-sm"
                aria-invalid={miniErrors.numero !== undefined}
              />
              {miniErrors.numero !== undefined ? (
                <p className="text-xs text-destructive">{miniErrors.numero.message}</p>
              ) : null}
            </div>

            {/* Fecha */}
            <div className="space-y-1">
              <Label htmlFor="mini-fecha">
                Fecha de emisión <span className="text-destructive">*</span>
              </Label>
              <Input
                {...regMini('fechaEmision')}
                id="mini-fecha"
                type="date"
                className="text-base md:text-sm"
                aria-invalid={miniErrors.fechaEmision !== undefined}
              />
              {miniErrors.fechaEmision !== undefined ? (
                <p className="text-xs text-destructive">{miniErrors.fechaEmision.message}</p>
              ) : null}
            </div>

            {/* Monto + Moneda — solo si esTributario (D1) */}
            {esTributarioEnForm ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="mini-monto">
                    Monto <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...regMini('monto')}
                    id="mini-monto"
                    type="text"
                    placeholder="Ej: 1250.50"
                    className="text-base md:text-sm"
                    aria-invalid={miniErrors.monto !== undefined}
                    aria-label="Monto"
                  />
                  {miniErrors.monto !== undefined ? (
                    <p className="text-xs text-destructive">{miniErrors.monto.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mini-moneda">
                    Moneda <span className="text-destructive">*</span>
                  </Label>
                  <select
                    {...regMini('moneda')}
                    id="mini-moneda"
                    className={cn(
                      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
                      'text-base shadow-xs outline-none md:text-sm',
                      'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                    )}
                    aria-invalid={miniErrors.moneda !== undefined}
                    aria-label="Moneda"
                  >
                    <option value="">Seleccioná…</option>
                    <option value="BOB">BOB</option>
                    <option value="USD">USD</option>
                  </select>
                  {miniErrors.moneda !== undefined ? (
                    <p className="text-xs text-destructive">{miniErrors.moneda.message}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="flex gap-2 justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelarMiniForm}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Confirmar'
                )}
              </Button>
            </div>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
