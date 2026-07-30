import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { Item } from '@/types/api';

import { useCreateItem, useUpdateItem } from '../hooks/use-item-mutations';
import type { ItemFormValues } from '../schemas/item-form-schema';

import { ItemForm } from './item-form';

interface ItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null/undefined = modo crear; objeto = modo editar.
  item?: Item | null;
}

// Sheet contenedor del ItemForm. Orquesta la mutation correcta según si hay
// un `item` recibido y cierra el drawer post-submit exitoso.
// Los toasts de éxito y error los emiten los hooks (Anti-F-13).
export function ItemFormSheet({
  open,
  onOpenChange,
  item,
}: ItemFormSheetProps): React.JSX.Element {
  const mode = item != null ? 'edit' : 'create';

  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem(item?.id ?? null);

  const isSubmitting =
    mode === 'create' ? createMutation.isPending : updateMutation.isPending;

  function handleSubmit(values: ItemFormValues): void {
    if (mode === 'create') {
      createMutation.mutate(values, {
        onSuccess: () => {
          onOpenChange(false);
        },
      });
      return;
    }
    updateMutation.mutate(values, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 7 campos + autocomplete de cuenta con nombres largos → sm:max-w-3xl (§14.2). */}
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Nuevo ítem' : 'Editar ítem'}</SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? 'Completá los datos del producto o servicio. Solo el nombre es obligatorio.'
              : 'Editá los datos del ítem.'}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <ItemForm
            mode={mode}
            {...(item != null ? { initialData: item } : {})}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
