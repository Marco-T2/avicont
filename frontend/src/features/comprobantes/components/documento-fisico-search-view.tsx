import { Check, Plus } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { DocumentoFisico } from '@/types/api';

interface DocumentoFisicoSearchViewProps {
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  /** Documentos ya pre-filtrados por compatibilidad (D4) y disponibilidad. */
  docsCompatibles: DocumentoFisico[];
  /** Asociación en curso — deshabilita los ítems de selección. */
  isAsociando: boolean;
  onSeleccionar: (docId: string) => void;
  onCrearNuevo: () => void;
}

/**
 * Vista de búsqueda del DocumentoFisicoCombobox: lista los documentos
 * existentes compatibles y ofrece siempre la opción "crear nuevo" (el combobox
 * es "buscar O crear"). Presentacional puro — el padre orquesta estado y datos.
 */
export function DocumentoFisicoSearchView({
  search,
  onSearchChange,
  isLoading,
  docsCompatibles,
  isAsociando,
  onSeleccionar,
  onCrearNuevo,
}: DocumentoFisicoSearchViewProps): React.JSX.Element {
  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Buscar por número…"
        value={search}
        onValueChange={onSearchChange}
      />
      <CommandList>
        {isLoading ? (
          <CommandEmpty>Buscando…</CommandEmpty>
        ) : (
          <>
            {docsCompatibles.length === 0 ? (
              <CommandEmpty>
                {search.length === 0
                  ? 'No hay documentos disponibles.'
                  : 'Sin resultados.'}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {docsCompatibles.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    value={doc.id}
                    onSelect={() => onSeleccionar(doc.id)}
                    disabled={isAsociando}
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
              </CommandGroup>
            )}
            {/* "Crear nuevo documento" siempre disponible — el combobox es "buscar O crear". */}
            <CommandGroup>
              <CommandItem
                value="__crear__"
                onSelect={onCrearNuevo}
                className={cn(
                  'gap-2 text-primary',
                  docsCompatibles.length > 0 && 'border-t mt-1 pt-1',
                )}
              >
                <Plus className="h-4 w-4 shrink-0" />
                Crear nuevo documento
                {search.length > 0 ? (
                  <span className="font-mono font-semibold">«{search}»</span>
                ) : null}
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
