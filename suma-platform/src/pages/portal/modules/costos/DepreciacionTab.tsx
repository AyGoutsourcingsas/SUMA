// ============================================================
// SUMA ERP — Costos / Depreciación
// Dos métodos: TIEMPO (vida útil en meses) y USO (usos estimados)
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Edit2, Trash2, Eye, RefreshCw, Upload, Info, AlertTriangle,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge, EmptyState, Alert, Spinner,
} from '@/components/ui';
import { useActiveCompanyId, useCanEdit } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import { supabase } from '@/services/supabase';

// ── Tipos ──────────────────────────────────────────────────
type DepMethod = 'TIEMPO' | 'USO';
type DepCategory = 'EQUIPO' | 'MOLDE' | 'FIGURA' | 'HERRAMIENTA' | 'OTRO';

interface DepRow {
  id: string;
  company_id: string;
  asset_name: string;
  category: DepCategory;
  method: DepMethod;
  total_cost: number;
  useful_life_months: number | null;    // Para método TIEMPO
  estimated_uses: number | null;        // Para método USO
  units_per_month: number | null;       // Unidades vendidas/mes (para distribuir)
  salvage_value: number;
  purchase_date: string | null;
  notes: string | null;
  // calculados en cliente
  monthly_cost?: number;
  cost_per_use?: number;
  cost_per_unit?: number;
}

const CATEGORIES: { value: DepCategory; label: string }[] = [
  { value: 'EQUIPO', label: 'Equipo / Máquina' },
  { value: 'MOLDE', label: 'Molde' },
  { value: 'FIGURA', label: 'Figura / Herramienta artesanal' },
  { value: 'HERRAMIENTA', label: 'Herramienta general' },
  { value: 'OTRO', label: 'Otro' },
];

const EMPTY: Omit<DepRow, 'id' | 'company_id'> = {
  asset_name: '',
  category: 'EQUIPO',
  method: 'TIEMPO',
  total_cost: 0,
  useful_life_months: 24,
  estimated_uses: null,
  units_per_month: 100,
  salvage_value: 0,
  purchase_date: null,
  notes: '',
};

// Cálculo local
function calcDep(row: Omit<DepRow, 'id' | 'company_id'>) {
  const depBase = row.total_cost - (row.salvage_value || 0);
  if (row.method === 'TIEMPO') {
    const monthly = row.useful_life_months ? depBase / row.useful_life_months : 0;
    const perUnit = row.units_per_month ? monthly / row.units_per_month : 0;
    return { monthly_cost: monthly, cost_per_use: null, cost_per_unit: perUnit };
  } else {
    const perUse = row.estimated_uses ? depBase / row.estimated_uses : 0;
    return { monthly_cost: null, cost_per_use: perUse, cost_per_unit: perUse };
  }
}

export default function DepreciacionTab() {
  const companyId = useActiveCompanyId();
  const canEdit = useCanEdit();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DepRow[]>([]);
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [filterCat, setFilterCat] = useState<string>('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DepRow | null>(null);
  const [viewing, setViewing] = useState<DepRow | null>(null);
  const [deleting, setDeleting] = useState<DepRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('depreciations')
        .select('*')
        .order('asset_name');
      if (err) throw err;
      const enriched = (data ?? []).map((r: any) => ({ ...r, ...calcDep(r) }));
      setRows(enriched);
    } catch (e: any) {
      setError(e.message || 'Error cargando depreciaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    return (!filterMethod || r.method === filterMethod) && (!filterCat || r.category === filterCat);
  }), [rows, filterMethod, filterCat]);

  // Cálculo en vivo del formulario
  const liveCalc = useMemo(() => calcDep(form), [form]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  };

  const openEdit = (r: DepRow) => {
    setEditing(r);
    setForm({
      asset_name: r.asset_name,
      category: r.category,
      method: r.method,
      total_cost: r.total_cost,
      useful_life_months: r.useful_life_months,
      estimated_uses: r.estimated_uses,
      units_per_month: r.units_per_month,
      salvage_value: r.salvage_value,
      purchase_date: r.purchase_date,
      notes: r.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.asset_name.trim()) { setError('El nombre del activo es obligatorio.'); return; }
    if (!companyId) { setError('No hay empresa activa.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        company_id: companyId,
        asset_name: form.asset_name.trim(),
        category: form.category,
        method: form.method,
        total_cost: Number(form.total_cost),
        useful_life_months: form.method === 'TIEMPO' ? Number(form.useful_life_months) : null,
        estimated_uses: form.method === 'USO' ? Number(form.estimated_uses) : null,
        units_per_month: Number(form.units_per_month) || null,
        salvage_value: Number(form.salvage_value) || 0,
        purchase_date: form.purchase_date || null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error: err } = await supabase.from('depreciations').update(payload).eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('depreciations').insert(payload);
        if (err) throw err;
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Error guardando.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await supabase.from('depreciations').delete().eq('id', deleting.id);
      setDeleting(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="">Todos los métodos</option>
            <option value="TIEMPO">Método TIEMPO</option>
            <option value="USO">Método USO</option>
          </select>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button size="sm" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
              Nuevo activo
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load} leftIcon={<RefreshCw className="w-4 h-4" />}>Actualizar</Button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Explicación métodos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm text-blue-800 dark:text-blue-300">Método TIEMPO</span>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-400">Para equipos con vida útil en meses.<br />
            <strong>Costo/mes</strong> = (Costo − Valor residual) ÷ Meses<br />
            <strong>Costo/unidad</strong> = Costo mes ÷ Unidades/mes
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-4 h-4 text-purple-600" />
            <span className="font-semibold text-sm text-purple-800 dark:text-purple-300">Método USO</span>
          </div>
          <p className="text-xs text-purple-700 dark:text-purple-400">Para moldes, figuras, papel, tinta.<br />
            <strong>Costo/uso</strong> = (Costo − Valor residual) ÷ Usos estimados<br />
            Este costo se suma directamente a cada receta que use este activo.
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Upload className="w-12 h-12" />}
          title="Sin activos depreciables"
          description={canEdit ? 'Registra equipos y moldes para calcular su costo por unidad producida.' : 'No hay activos depreciables.'}
          action={canEdit ? <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Registrar activo</Button> : undefined}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="suma-table">
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Categoría</th>
                  <th>Método</th>
                  <th>Costo total</th>
                  <th>Parámetro</th>
                  <th>Costo/mes</th>
                  <th>Costo/uso o unidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold text-gray-900 dark:text-white">{r.asset_name}</td>
                    <td>{CATEGORIES.find((c) => c.value === r.category)?.label || r.category}</td>
                    <td>
                      <Badge variant={r.method === 'TIEMPO' ? 'blue' : 'purple'}>
                        {r.method}
                      </Badge>
                    </td>
                    <td className="font-mono text-sm">{formatCOP(r.total_cost)}</td>
                    <td className="text-sm text-gray-500">
                      {r.method === 'TIEMPO'
                        ? `${r.useful_life_months} meses`
                        : `${(r.estimated_uses ?? 0).toLocaleString()} usos`
                      }
                    </td>
                    <td className="font-mono text-sm">
                      {r.monthly_cost != null ? formatCOP(r.monthly_cost) : '—'}
                    </td>
                    <td className="font-mono text-sm font-semibold text-suma-700 dark:text-suma-300">
                      {r.cost_per_use != null ? formatCOP(r.cost_per_use) : (r.cost_per_unit != null ? formatCOP(r.cost_per_unit) : '—')}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewing(r)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Ver">
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-suma-600 rounded" title="Editar">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleting(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: Crear / Editar */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar activo' : 'Registrar activo depreciable'} size="xl">
        <div className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nombre del activo *" required value={form.asset_name} onChange={(e) => setForm((f) => ({ ...f, asset_name: e.target.value }))} placeholder="Ej. Molde de oso Stitch #3, Selladora manual..." />
            </div>
            <SelectField label="Categoría" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as DepCategory }))}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </SelectField>
            <SelectField label="Método de depreciación" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as DepMethod }))}>
              <option value="TIEMPO">TIEMPO — Por vida útil en meses</option>
              <option value="USO">USO — Por número de usos</option>
            </SelectField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field
              label="Costo total de adquisición (COP) *"
              type="number"
              value={form.total_cost}
              onChange={(e) => setForm((f) => ({ ...f, total_cost: Number(e.target.value) }))}
              hint="Precio al que lo compraste"
            />
            <Field
              label="Valor residual (COP)"
              type="number"
              value={form.salvage_value}
              onChange={(e) => setForm((f) => ({ ...f, salvage_value: Number(e.target.value) }))}
              hint="Valor al final de vida útil (puede ser 0)"
            />
            <Field
              label="Fecha de compra"
              type="date"
              value={form.purchase_date ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value || null }))}
            />
          </div>

          {/* Parámetros según método */}
          {form.method === 'TIEMPO' ? (
            <div className="grid grid-cols-2 gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-100 dark:border-blue-900">
              <Field
                label="Vida útil (meses) *"
                type="number"
                value={form.useful_life_months ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, useful_life_months: Number(e.target.value) }))}
                hint="¿Cuántos meses estimas que durará?"
              />
              <Field
                label="Unidades producidas / mes"
                type="number"
                value={form.units_per_month ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, units_per_month: Number(e.target.value) }))}
                hint="Para calcular costo por unidad vendida"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50 dark:bg-purple-950 rounded-xl border border-purple-100 dark:border-purple-900">
              <Field
                label="Usos estimados totales *"
                type="number"
                value={form.estimated_uses ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, estimated_uses: Number(e.target.value) }))}
                hint="¿Cuántas veces podrás usarlo en total?"
              />
              <Field
                label="Unidades / mes (referencia)"
                type="number"
                value={form.units_per_month ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, units_per_month: Number(e.target.value) }))}
                hint="Referencial para proyectar meses de vida"
              />
            </div>
          )}

          {/* Resumen calculado en vivo */}
          <div className="bg-suma-50 dark:bg-suma-950 rounded-xl p-4 border border-suma-100 dark:border-suma-900">
            <p className="text-xs font-semibold text-suma-600 mb-3">RESUMEN DE DEPRECIACIÓN</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Base depreciable</p>
                <p className="font-bold font-mono">{formatCOP(form.total_cost - (form.salvage_value || 0))}</p>
              </div>
              {form.method === 'TIEMPO' ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Costo / mes</p>
                    <p className="font-bold font-mono text-blue-700 dark:text-blue-300">{formatCOP(liveCalc.monthly_cost ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Costo / unidad</p>
                    <p className="font-bold font-mono text-suma-700 dark:text-suma-300">{formatCOP(liveCalc.cost_per_unit ?? 0)}</p>
                    <p className="text-xs text-gray-400">Este valor entra a la receta</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-500">Costo / uso</p>
                    <p className="font-bold font-mono text-purple-700 dark:text-purple-300">{formatCOP(liveCalc.cost_per_use ?? 0)}</p>
                    <p className="text-xs text-gray-400">Este valor entra a la receta</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Vida estimada (meses)</p>
                    <p className="font-bold font-mono">
                      {form.units_per_month && form.estimated_uses
                        ? Math.ceil(form.estimated_uses / form.units_per_month) + ' meses'
                        : '—'
                      }
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <Field
            label="Notas"
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Observaciones adicionales..."
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Guardar cambios' : 'Registrar activo'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Ver detalle */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.asset_name || 'Detalle'} size="md">
        {viewing && (() => {
          const c = calcDep(viewing);
          return (
            <div className="p-6 space-y-4">
              <div className="flex gap-2 mb-2">
                <Badge variant={viewing.method === 'TIEMPO' ? 'blue' : 'purple'}>{viewing.method}</Badge>
                <Badge variant="gray">{CATEGORIES.find((c) => c.value === viewing.category)?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Costo total', value: formatCOP(viewing.total_cost) },
                  { label: 'Valor residual', value: formatCOP(viewing.salvage_value) },
                  { label: 'Base depreciable', value: formatCOP(viewing.total_cost - viewing.salvage_value) },
                  { label: viewing.method === 'TIEMPO' ? 'Vida útil' : 'Usos estimados',
                    value: viewing.method === 'TIEMPO' ? `${viewing.useful_life_months} meses` : `${(viewing.estimated_uses ?? 0).toLocaleString()} usos` },
                  { label: 'Costo/mes', value: c.monthly_cost != null ? formatCOP(c.monthly_cost) : '—' },
                  { label: 'Costo/uso o unidad', value: formatCOP(c.cost_per_use ?? c.cost_per_unit ?? 0) },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-gray-500">{f.label}</p>
                    <p className="font-semibold">{f.value}</p>
                  </div>
                ))}
              </div>
              {viewing.notes && <div><p className="text-xs text-gray-500">Notas</p><p className="text-sm">{viewing.notes}</p></div>}
              <div className="flex justify-end"><Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button></div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal: Eliminar */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Eliminar activo" size="sm">
        <div className="p-6 space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <p>¿Eliminar <strong>{deleting?.asset_name}</strong>? Las recetas que lo usen perderán este costo.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete} loading={saving} leftIcon={<Trash2 className="w-4 h-4" />}>Eliminar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
