import type { ResumenConciliacion } from '@/types/api';

interface ResumenConciliacionProps {
  resumen: ResumenConciliacion;
}

/**
 * Contadores del encabezado. Los tres primeros cuentan movimientos por
 * `estadoEfectivo`; el último, líneas contables sin contraparte bancaria.
 */
export function ResumenConciliacionBar({
  resumen,
}: ResumenConciliacionProps): React.JSX.Element {
  const items = [
    { label: 'pendientes', valor: resumen.movimientosPendientes },
    { label: 'conciliados', valor: resumen.movimientosConciliados },
    { label: 'ignorados', valor: resumen.movimientosIgnorados },
    { label: 'en tránsito', valor: resumen.lineasEnTransito },
  ];

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border bg-card px-4 py-3">
      {items.map((i) => (
        <span key={i.label} className="text-sm">
          <span className="font-semibold tabular-nums">{i.valor}</span>{' '}
          <span className="text-muted-foreground">{i.label}</span>
        </span>
      ))}
    </div>
  );
}
