import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { DocumentoFisico, TipoDocumentoFisico } from '@/types/api';

// sonner se mockea para poder assertar toast.error en los tests D3.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock de los hooks cross-feature
vi.mock('@/features/documentos-fisicos/hooks/use-documentos-fisicos', () => ({
  useDocumentosFisicos: vi.fn(),
}));
vi.mock('@/features/documentos-fisicos/hooks/use-documento-fisico-mutations', () => ({
  useCreateDocumentoFisico: vi.fn(),
}));
vi.mock('@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico', () => ({
  useTiposDocumentoFisico: vi.fn(),
}));
vi.mock('../hooks/use-asociar-documentos', () => ({
  useAsociarDocumentos: vi.fn(),
}));
// Mock del hook de permisos para controlar el gating sin auth store real.
vi.mock('@/lib/use-permissions', () => ({
  usePermissions: vi.fn(),
}));

import { toast } from 'sonner';
import { useDocumentosFisicos } from '@/features/documentos-fisicos/hooks/use-documentos-fisicos';
import { useCreateDocumentoFisico } from '@/features/documentos-fisicos/hooks/use-documento-fisico-mutations';
import { useTiposDocumentoFisico } from '@/features/tipos-documento-fisico/hooks/use-tipos-documento-fisico';
import { useAsociarDocumentos } from '../hooks/use-asociar-documentos';
import { hoyEnLaPaz } from '../lib/hoy-en-la-paz';
import { usePermissions } from '@/lib/use-permissions';
import { DocumentoFisicoCombobox } from './documento-fisico-combobox';

const mockToastError = toast.error as unknown as ReturnType<typeof vi.fn>;

const mockUseDocumentosFisicos = useDocumentosFisicos as unknown as ReturnType<typeof vi.fn>;
const mockUseCreateDocumentoFisico = useCreateDocumentoFisico as unknown as ReturnType<typeof vi.fn>;
const mockUseTiposDocumentoFisico = useTiposDocumentoFisico as unknown as ReturnType<typeof vi.fn>;
const mockUseAsociarDocumentos = useAsociarDocumentos as unknown as ReturnType<typeof vi.fn>;
const mockUsePermissions = usePermissions as unknown as ReturnType<typeof vi.fn>;

// Configura el mock de permisos: por default concede TODO (los tests de
// comportamiento no se ocupan del gating). Los tests de gating overridean.
function setPerms(granted: string[] | 'all'): void {
  const has = (p: string): boolean => granted === 'all' || granted.includes(p);
  mockUsePermissions.mockReturnValue({
    has,
    hasAll: (perms: string[]) => perms.every(has),
    isOwner: granted === 'all',
    permissions: granted === 'all' ? [] : granted,
  } as unknown as ReturnType<typeof usePermissions>);
}

const P_UPDATE = 'contabilidad.documentos-fisicos.update';
const P_CREATE = 'contabilidad.documentos-fisicos.create';
const P_ASIENTOS_UPDATE = 'contabilidad.asientos.update';

// UUIDs de referencia para tipos (el schema Zod exige .uuid() — RFC 4122 estricto).
// Formato requerido: versión [1-8] en nibble 13, variante [89abAB] en nibble 17.
const ID_TIPO_EGRESO = '11111111-1111-4111-8111-111111111111';
const ID_TIPO_INGRESO = '22222222-2222-4222-8222-222222222222';
const ID_TIPO_NO_TRIB = '33333333-3333-4333-8333-333333333333';
const ID_DOC_EGRESO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_DOC_INGRESO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Tipos de documento de referencia
const tipoEgreso: TipoDocumentoFisico = {
  id: ID_TIPO_EGRESO,
  nombre: 'Factura recibida',
  codigo: 'factura-recibida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: ['EGRESO'],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const tipoIngreso: TipoDocumentoFisico = {
  id: ID_TIPO_INGRESO,
  nombre: 'Factura emitida',
  codigo: 'factura-emitida',
  esTributario: true,
  activo: true,
  tiposComprobanteAplicables: ['INGRESO'],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const tipoNoTributario: TipoDocumentoFisico = {
  id: ID_TIPO_NO_TRIB,
  nombre: 'Recibo interno',
  codigo: 'recibo-interno',
  esTributario: false,
  activo: true,
  tiposComprobanteAplicables: ['EGRESO', 'DIARIO'],
  organizationId: 'org-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const docEgreso: DocumentoFisico = {
  id: ID_DOC_EGRESO,
  numero: 'F-001',
  fechaEmision: '2026-05-01',
  monto: '1000.00',
  moneda: 'BOB',
  glosa: null,
  tipoDocumentoFisico: {
    id: ID_TIPO_EGRESO,
    nombre: 'Factura recibida',
    codigo: 'factura-recibida',
    esTributario: true,
  },
  contacto: null,
  organizationId: 'org-1',
  createdAt: '2026-05-01T00:00:00Z',
};

const docIngreso: DocumentoFisico = {
  id: ID_DOC_INGRESO,
  numero: 'INV-001',
  fechaEmision: '2026-05-01',
  monto: '500.00',
  moneda: 'BOB',
  glosa: null,
  tipoDocumentoFisico: {
    id: ID_TIPO_INGRESO,
    nombre: 'Factura emitida',
    codigo: 'factura-emitida',
    esTributario: true,
  },
  contacto: null,
  organizationId: 'org-1',
  createdAt: '2026-05-01T00:00:00Z',
};

const mutateAsociar = vi.fn();
const mutateCreate = vi.fn();

const asociarMockBase = {
  mutate: mutateAsociar,
  isPending: false,
};

const createMockBase = {
  mutate: mutateCreate,
  isPending: false,
};

function makeQc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderCombobox(tipoComprobante: 'EGRESO' | 'INGRESO' | 'DIARIO' = 'EGRESO'): void {
  const qc = makeQc();
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={0}>
        <DocumentoFisicoCombobox comprobanteId="comp-1" tipoComprobante={tipoComprobante} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setPerms('all');
  mockUseTiposDocumentoFisico.mockReturnValue({
    data: { items: [tipoEgreso, tipoIngreso, tipoNoTributario] },
  });
  mockUseDocumentosFisicos.mockReturnValue({ data: { items: [] }, isLoading: false });
  mockUseAsociarDocumentos.mockReturnValue(asociarMockBase);
  mockUseCreateDocumentoFisico.mockReturnValue(createMockBase);
});

describe('DocumentoFisicoCombobox — pre-filtro de compatibilidad (D4/D8)', () => {
  it('combobox EGRESO solo muestra documentos con tipo compatible con EGRESO', async () => {
    // docEgreso tiene tipo 'tipo-egreso' que tiene tiposComprobanteAplicables=['EGRESO']
    // docIngreso tiene tipo 'tipo-ingreso' que tiene tiposComprobanteAplicables=['INGRESO']
    mockUseDocumentosFisicos.mockReturnValue({
      data: { items: [docEgreso, docIngreso] },
      isLoading: false,
    });

    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    // Solo F-001 (EGRESO compatible) debe aparecer; INV-001 (solo INGRESO) no
    expect(screen.getByText('F-001')).toBeInTheDocument();
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
  });

  it('tipo incompatible no aparece en el combobox', async () => {
    mockUseDocumentosFisicos.mockReturnValue({
      data: { items: [docIngreso] }, // solo doc de tipo INGRESO
      isLoading: false,
    });

    renderCombobox('EGRESO'); // buscando en comprobante EGRESO
    await userEvent.click(screen.getByRole('combobox'));

    // INV-001 es de tipo INGRESO, incompatible con EGRESO → no aparece
    expect(screen.queryByText('INV-001')).not.toBeInTheDocument();
  });
});

describe('DocumentoFisicoCombobox — filtro disponibleParaAsociar', () => {
  it('useDocumentosFisicos se invoca siempre con disponibleParaAsociar: true', () => {
    renderCombobox('EGRESO');

    // El hook debe haber sido llamado con disponibleParaAsociar: true
    // independientemente del valor de búsqueda.
    expect(mockUseDocumentosFisicos).toHaveBeenCalledWith(
      expect.objectContaining({ disponibleParaAsociar: true }),
    );
  });
});

describe('DocumentoFisicoCombobox — búsqueda sin resultados', () => {
  it('con cero documentos compatibles y búsqueda vacía, la opción "Crear nuevo documento" está visible', async () => {
    // BUG: antes solo aparecía si search.length > 0 — este test debe FALLAR con el código original.
    mockUseDocumentosFisicos.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });

    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    // SIN tipear nada — el usuario acaba de abrir el picker con cero documentos.
    // El ítem "Crear nuevo documento" debe estar visible de inmediato.
    expect(screen.getByText(/crear nuevo documento/i)).toBeInTheDocument();
  });

  it('sin resultados tras búsqueda → muestra opción "Crear nuevo documento"', async () => {
    mockUseDocumentosFisicos.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });

    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    // Tipar algo para activar la búsqueda — Crear sigue visible
    const input = screen.getByPlaceholderText(/buscar por número/i);
    await userEvent.type(input, 'XYZ-999');

    // Con búsqueda sin resultados el ítem sigue presente (con el sufijo del search)
    expect(screen.getByText(/crear nuevo documento/i)).toBeInTheDocument();
  });
});

describe('DocumentoFisicoCombobox — selección de existente', () => {
  it('seleccionar existente llama useAsociarDocumentos.mutate([id])', async () => {
    mockUseDocumentosFisicos.mockReturnValue({
      data: { items: [docEgreso] },
      isLoading: false,
    });

    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('F-001'));

    expect(mutateAsociar).toHaveBeenCalledWith(
      [ID_DOC_EGRESO],
      expect.any(Object),
    );
  });
});

describe('DocumentoFisicoCombobox — mini-form inline (D2)', () => {
  it('tipo NO tributario → oculta monto y moneda', async () => {
    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    // Tipar para activar la opción "Crear nuevo documento"
    const searchInput = screen.getByPlaceholderText(/buscar por número/i);
    await userEvent.type(searchInput, 'REC-TEST');

    // Abrir mini-form via "Crear nuevo documento"
    const crearItems = screen.getAllByText(/crear nuevo documento/i);
    await userEvent.click(crearItems[0]);

    // Mini-form visible
    expect(screen.getByLabelText(/número/i)).toBeInTheDocument();

    // Seleccionar tipo NO tributario
    const select = screen.getByLabelText(/tipo/i);
    await userEvent.selectOptions(select, ID_TIPO_NO_TRIB);

    // Monto y moneda NO deben aparecer
    expect(screen.queryByLabelText(/monto/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/moneda/i)).not.toBeInTheDocument();
  });

  it('tipo tributario → muestra monto y moneda obligatorios', async () => {
    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText(/buscar por número/i);
    await userEvent.type(searchInput, 'F-TEST');

    const crearItems = screen.getAllByText(/crear nuevo documento/i);
    await userEvent.click(crearItems[0]);

    // Seleccionar tipo tributario
    const select = screen.getByLabelText(/tipo/i);
    await userEvent.selectOptions(select, ID_TIPO_EGRESO);

    // Monto y moneda deben aparecer
    expect(screen.getByLabelText(/monto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/moneda/i)).toBeInTheDocument();
  });

  it('botón Confirmar disabled mientras isPending=true', async () => {
    mockUseCreateDocumentoFisico.mockReturnValue({ ...createMockBase, isPending: true });

    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText(/buscar por número/i);
    await userEvent.type(searchInput, 'NEW-DOC');

    const crearItems = screen.getAllByText(/crear nuevo documento/i);
    await userEvent.click(crearItems[0]);

    const confirmar = screen.getByRole('button', { name: /guardando/i });
    expect(confirmar).toBeDisabled();
  });

  it('la fecha de emisión arranca en hoy (La Paz) al abrir el mini-form', async () => {
    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    const crearItems = screen.getAllByText(/crear nuevo documento/i);
    await userEvent.click(crearItems[0]);

    // hoyEnLaPaz() usa el mismo reloj real → mismo día calendario que el render.
    const inputFecha = screen.getByLabelText(/fecha de emisión/i) as HTMLInputElement;
    expect(inputFecha.value).toBe(hoyEnLaPaz());
  });

  it('mini-form inline aparece tras clic en "Crear nuevo documento" con campos Tipo, Número y Fecha', async () => {
    renderCombobox('EGRESO');
    await userEvent.click(screen.getByRole('combobox'));

    const searchInput = screen.getByPlaceholderText(/buscar por número/i);
    await userEvent.type(searchInput, 'REC-TEST');

    const crearItems = screen.getAllByText(/crear nuevo documento/i);
    await userEvent.click(crearItems[0]);

    // Verificar que el mini-form tiene los campos esperados
    expect(screen.getByLabelText(/tipo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha de emisión/i)).toBeInTheDocument();

    // Botón Confirmar presente
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();

    // Cancelar vuelve a la vista de búsqueda
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.getByPlaceholderText(/buscar por número/i)).toBeInTheDocument();
  });
});

// UUID para el nuevo doc creado inline (RFC 4122 válido).
const ID_NUEVO_DOC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const nuevoDocCreado: DocumentoFisico = {
  id: ID_NUEVO_DOC,
  numero: 'REC-001',
  fechaEmision: '2026-05-29',
  monto: null,
  moneda: null,
  glosa: null,
  tipoDocumentoFisico: {
    id: ID_TIPO_NO_TRIB,
    nombre: 'Recibo interno',
    codigo: 'recibo-interno',
    esTributario: false,
  },
  contacto: null,
  organizationId: 'org-1',
  createdAt: '2026-05-29T00:00:00Z',
};

/**
 * Abre el mini-form y completa los campos con datos válidos de tipo NO tributario,
 * luego hace submit. Usa userEvent para interacciones de usuario y fireEvent.change
 * para inputs donde JSDOM tiene limitaciones (input[type=date]).
 *
 * IMPORTANTE: Los UUIDs de tipos deben ser RFC 4122 válidos para pasar
 * z.string().uuid() de Zod v4 (variante [89abAB] en nibble 17).
 */
async function abrirYSubmitMiniForm(): Promise<void> {
  renderCombobox('EGRESO');
  await userEvent.click(screen.getByRole('combobox'));

  const searchInput = screen.getByPlaceholderText(/buscar por número/i);
  await userEvent.type(searchInput, 'REC');

  const crearItems = screen.getAllByText(/crear nuevo documento/i);
  await userEvent.click(crearItems[0]);

  // Seleccionar tipo NO tributario — ID_TIPO_NO_TRIB es UUID RFC 4122 válido
  // para pasar la validación z.string().uuid() de Zod v4.
  const selectTipo = screen.getByLabelText(/tipo/i);
  await userEvent.selectOptions(selectTipo, ID_TIPO_NO_TRIB);

  // El número arranca con 'REC' (valor de search al abrir el form).
  // Clear y type para establecer el valor final.
  const inputNumero = screen.getByLabelText(/número/i);
  await userEvent.clear(inputNumero);
  await userEvent.type(inputNumero, 'REC-001');

  // Completar fecha de emisión con fireEvent.change — input[type=date] en JSDOM
  // no responde correctamente a userEvent.type para setear el valor de RHF.
  const inputFecha = screen.getByLabelText(/fecha de emisión/i);
  await act(async () => {
    fireEvent.change(inputFecha, { target: { value: '2026-05-29' } });
  });

  // Submit
  await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
}

describe('DocumentoFisicoCombobox — D3: crear inline y asociar encadenado', () => {
  // 5.2f: happy path — create OK → asociar se invoca con el id del nuevo doc
  it('5.2f — create OK encadena asociar con el id del nuevo documento', async () => {
    await abrirYSubmitMiniForm();

    // mutateCreate fue llamado — capturar el segundo argumento (callbacks)
    expect(mutateCreate).toHaveBeenCalled();
    const createCallbacks = mutateCreate.mock.calls[0]?.[1] as {
      onSuccess: (doc: DocumentoFisico) => void;
      onError: (err: unknown) => void;
    };

    // Simular que el create fue exitoso
    createCallbacks.onSuccess(nuevoDocCreado);

    // asociarMutation.mutate debe haberse invocado con [nuevoDoc.id]
    expect(mutateAsociar).toHaveBeenCalledWith(
      [ID_NUEVO_DOC],
      expect.any(Object),
    );
  });

  // 5.2g: error path — create OK pero asociar falla → toast explica doc suelto
  it('5.2g — asociar falla tras create OK → toast explica que el doc quedó suelto', async () => {
    await abrirYSubmitMiniForm();

    expect(mutateCreate).toHaveBeenCalled();
    const createCallbacks = mutateCreate.mock.calls[0]?.[1] as {
      onSuccess: (doc: DocumentoFisico) => void;
      onError: (err: unknown) => void;
    };

    // Simular que el create fue exitoso
    createCallbacks.onSuccess(nuevoDocCreado);

    // asociarMutation fue llamado — capturar callbacks del asociar
    expect(mutateAsociar).toHaveBeenCalled();
    const asociarCallbacks = mutateAsociar.mock.calls[0]?.[1] as {
      onSuccess: () => void;
      onError: (err: unknown) => void;
    };

    // Simular que el asociar falla
    const errorAsociar = new Error('Error de red');
    asociarCallbacks.onError(errorAsociar);

    // Toast debe mencionar que el documento quedó suelto y es recuperable
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('no se pudo asociar'),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Documentos físicos'),
    );
  });
});

describe('DocumentoFisicoCombobox — gating de permisos', () => {
  it('sin permiso de asociar (falta asientos.update) → trigger deshabilitado, no abre', async () => {
    setPerms([P_UPDATE]); // tiene documentos-fisicos.update pero NO asientos.update
    renderCombobox('EGRESO');

    const trigger = screen.getByRole('button', { name: /buscar o crear documento/i });
    expect(trigger).toBeDisabled();

    // No hay rol combobox (no es un combobox abrible), no aparece el input de búsqueda
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.queryByPlaceholderText(/buscar por número/i)).not.toBeInTheDocument();
  });

  it('sin permiso de asociar → muestra tooltip con el motivo al hacer hover', async () => {
    setPerms([P_UPDATE]);
    renderCombobox('EGRESO');

    const trigger = screen.getByRole('button', { name: /buscar o crear documento/i });
    await userEvent.hover(trigger.parentElement!);
    const matches = await screen.findAllByText(/no tenés permiso para asociar documentos/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('con permiso de asociar pero SIN create → "Crear nuevo documento" deshabilitado', async () => {
    setPerms([P_UPDATE, P_ASIENTOS_UPDATE]); // puede asociar, NO puede crear
    renderCombobox('EGRESO');

    await userEvent.click(screen.getByRole('combobox'));

    // El ítem crear sigue visible pero deshabilitado, con la pista "Sin permiso".
    expect(screen.getByText(/crear nuevo documento/i)).toBeInTheDocument();
    expect(screen.getByText(/sin permiso/i)).toBeInTheDocument();

    // Clic no abre el mini-form (sigue en la vista de búsqueda).
    await userEvent.click(screen.getByText(/crear nuevo documento/i));
    expect(screen.queryByLabelText(/fecha de emisión/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/buscar por número/i)).toBeInTheDocument();
  });

  it('con permiso de asociar y create → "Crear nuevo documento" habilitado (abre mini-form)', async () => {
    setPerms([P_UPDATE, P_ASIENTOS_UPDATE, P_CREATE]);
    renderCombobox('EGRESO');

    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByText(/sin permiso/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText(/crear nuevo documento/i));
    expect(screen.getByLabelText(/fecha de emisión/i)).toBeInTheDocument();
  });
});
