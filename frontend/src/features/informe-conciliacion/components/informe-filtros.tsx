import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Cross-feature: catálogo de cuentas bancarias del tenant para el selector.
// Solo las activas: emitir el informe de una cuenta dada de baja no tiene
// sentido. pageSize 100 = límite del backend (ListarCuentasBancariasQueryDto).
import { useCuentasBancarias } from '@/features/cuentas-bancarias/hooks/use-cuentas-bancarias';
import { hoyEnLaPazISO } from '@/lib/fecha-actual';
import type { InformeConciliacionParams } from '@/types/api';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface InformeFiltrosProps {
  onEmitir: (params: InformeConciliacionParams) => void;
  isFetching: boolean;
}

/**
 * Filtros del informe: cuenta bancaria + fecha de corte, ambos OBLIGATORIOS
 * (el backend exige los dos parámetros). El corte arranca en el hoy contable
 * de La Paz (§4.6) — el caso típico es "¿cómo estamos hoy?".
 */
export function InformeFiltros({ onEmitir, isFetching }: InformeFiltrosProps): React.JSX.Element {
  const { data } = useCuentasBancarias({ activa: true, pageSize: 100 });
  const cuentas = data?.items ?? [];

  const [cuentaBancariaId, setCuentaBancariaId] = useState<string | null>(null);
  const [corte, setCorte] = useState<string>(hoyEnLaPazISO());
  const [error, setError] = useState<string | null>(null);

  function handleEmitir(): void {
    if (cuentaBancariaId === null) {
      setError('Seleccioná una cuenta bancaria');
      return;
    }
    if (!FECHA_REGEX.test(corte)) {
      setError('Seleccioná una fecha de corte');
      return;
    }

    setError(null);
    onEmitir({ cuentaBancariaId, corte });
  }

  if (cuentas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay cuentas bancarias configuradas. Creá una en Configuración → Cuentas bancarias
        antes de emitir el informe.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-72">
          <Label htmlFor="cuenta-bancaria-informe">Cuenta bancaria</Label>
          <Select
            value={cuentaBancariaId ?? undefined}
            onValueChange={(v) => {
              setCuentaBancariaId(v);
              setError(null);
            }}
          >
            {/* `w-full` VA EN EL TRIGGER: el primitivo es `w-fit`, así que se
                estira al contenido e ignora el `sm:w-72` del div de arriba.
                Con la etiqueta `alias · numeroCuenta` crecía a 368px y se
                comía 64px del campo de fecha de al lado. Acotado, el
                `line-clamp-1` que el primitivo ya trae recorta solo. */}
            <SelectTrigger
              id="cuenta-bancaria-informe"
              aria-label="Cuenta bancaria"
              className="w-full"
            >
              <SelectValue placeholder="Elegí una cuenta" />
            </SelectTrigger>
            <SelectContent>
              {cuentas.map((cb) => (
                <SelectItem key={cb.id} value={cb.id}>
                  {cb.alias}
                  {cb.numeroCuenta !== null ? ` · ${cb.numeroCuenta}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="corte-informe">Fecha de corte</Label>
          <Input
            id="corte-informe"
            type="date"
            className="w-44 text-base md:text-sm"
            value={corte}
            onChange={(e) => {
              setCorte(e.target.value);
              setError(null);
            }}
          />
        </div>

        {/* §7 pide 44px de tap target en mobile y `size="sm"` da 32: el CTA
            principal era el objetivo más chico de la pantalla. Se sube solo
            por debajo de `sm`; en escritorio, donde se apunta con mouse, la
            densidad queda igual. */}
        <Button
          type="button"
          size="sm"
          className="h-11 self-start sm:h-8 sm:self-end"
          onClick={handleEmitir}
          disabled={isFetching}
        >
          {isFetching ? 'Emitiendo…' : 'Emitir informe'}
        </Button>
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
