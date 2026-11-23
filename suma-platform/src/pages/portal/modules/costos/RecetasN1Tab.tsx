// ============================================================
// SUMA ERP — Costos / Recetas Nivel 1 (Subrecetas y componentes base)
// Componentes intermedios que se reutilizan en Recetas N2.
// Ingredientes: MATERIAL (inventario) + DEPRECIACION
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Edit2, Trash2, Eye, RefreshCw, ChevronDown, ChevronRight,
  Layers, Calculator, AlertTriangle, Package, X,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge, EmptyState, Alert, Spinner,
} from '@/components/ui';
import { useActiveCompanyId, useCanEdit } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import { supabase } from '@/services/supabase';
import type { Unit } from '@/types/domain';

// ── Tipos ──────────────────────────────────────────────────
type LineKind = 'MATERIAL' | 'DEPRECIACION' | 'MANUAL';

interface IngLine {
  id?: string;
  kind: LineKind;
  material_id: string | null;
  depreciation_id: string | null;
  name: string;
  qty: number;
  unit: string;
  unit_cost: number;    // costo unitario de referencia
  line_cost: number;    // calculado: qty * unit_cost
  sort_order: number;
}

interface RecipeN1 {
  id: string;
  company_id: string;
  code: string | null;
  name: string;         // mapeado desde 'product' en DB
  level: 1;
  recipe_type: string | null;
  yield_qty: number;
  yield_unit: string;
  margin: number;
  total_cost: number;
  computed_price: number;
  final_price: number | null;
  notes: string | null;
  group_id: string | null;
  group_name?: string;
  ingredients?: IngLine[];
}

interface MaterialOpt { id: string; name: string; base_unit: string; unit_cost_per_base: number; }
interface DepOpt { id: string; asset_name: string; method: string; cost_per_use: number | null; cost_per_unit: number | null; }
interface GroupOpt { id: string; name: string; }

const RECIPE_TYPES = ['SUBRECETA', 'MOLDE', 'FIGURA', 'ETIQUETA', 'EMPAQUE', 'OTRO'];

const EMPTY_LINE = (): IngLine => ({
  kind: 'MATERIAL',
  material_id: null,
  depreciation_id: null,
  name: '',
  qty: 1,
  unit: 'g',
  unit_cost: 0,
  line_cost: 0,
  sort_order: 0,
});

export default function RecetasN1Tab() {
  const companyId = useActiveCompanyId();
  const canEdit = useCanEdit();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeN1[]>([]);
  const [materials, setMaterials] = useState<MaterialOpt[]>([]);
  const [deps, setDeps] = useState<DepOpt[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<GroupOpt[]>([]);

  const [filterType, setFilterType] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecipeN1 | null>(null);
  const [viewing, setViewing] = useState<RecipeN1 | null>(null);
  const [deleting, setDeleting] = useState<RecipeN1 | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fname, setFname] = useState('');
  const [fcode, setFcode] = useState('');
  const [ftype, setFtype] = useState('SUBRECETA');
  const [fyieldQty, setFyieldQty] = useState(1);
  const [fyieldUnit, setFyieldUnit] = useState('Und');
  const [fmargin, setFmargin] = useState(0);
  const [ffinalPrice, setFfinalPrice] = useState('');
  const [fgroup, setFgroup] = useState('');
  const [fnotes, setFnotes] = useState('');
  const [lines, setLines] = useState<IngLine[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Separamos el query de ingredients para evitar el error de ambigüedad
      // PostgREST no puede elegir entre recipe_id y recipe_ref_id cuando hay 2 FKs
      const [rRes, mRes, dRes, uRes, gRes] = await Promise.all([
        supabase.from('recipes').select(`
          id, company_id, code, product, level, recipe_type,
          yield_qty, yield_unit, margin, total_cost, computed_price, final_price, notes, group_id,
          item_groups(name)
        `).eq('level', 1).order('product'),
        supabase.from('materials').select('id, name, base_unit, unit_cost_per_base').order('name'),
        supabase.from('depreciations').select('id, asset_name, method, estimated_uses, useful_life_months, units_per_month, total_cost, salvage_value').order('asset_name'),
        supabase.from('units').select('*').order('code'),
        supabase.from('item_groups').select('id, name').eq('kind', 'recipe').order('name'),
      ]);
      if (rRes.error) throw rRes.error;

      const recipeIds = (rRes.data ?? []).map((r: any) => r.id);
      let ingredientsMap: Record<string, any[]> = {};
      if (recipeIds.length > 0) {
        const { data: ingData, error: ingErr } = await supabase
          .from('recipe_ingredients')
          .select('id, recipe_id, line_kind, material_id, depreciation_id, name, qty, unit, unit_cost_per_base, sort_order')
          .in('recipe_id', recipeIds)
          .order('sort_order');
        if (ingErr) throw ingErr;
        for (const ing of ingData ?? []) {
          if (!ingredientsMap[ing.recipe_id]) ingredientsMap[ing.recipe_id] = [];
          ingredientsMap[ing.recipe_id].push(ing);
        }
      }

      // Enriquecer depreciaciones con costo por uso/unidad calculado
      const enrichedDeps = (dRes.data ?? []).map((d: any): DepOpt => {
        const base = d.total_cost - (d.salvage_value ?? 0);
        const cost_per_use = d.method === 'USO' && d.estimated_uses ? base / d.estimated_uses : null;
        const cost_per_unit = d.method === 'TIEMPO' && d.useful_life_months && d.units_per_month
          ? (base / d.useful_life_months) / d.units_per_month : null;
        return { id: d.id, asset_name: d.asset_name, method: d.method, cost_per_use, cost_per_unit };
      });

      setMaterials(mRes.data ?? []);
      setDeps(enrichedDeps);
      setUnits(uRes.data ?? []);
      setGroups(gRes.data ?? []);
      setRecipes(
        (rRes.data ?? []).map((r: any) => ({
          ...r,
          name: r.product ?? r.name ?? '',   // DB usa 'product', UI usa 'name'
          level: 1 as const,
          group_name: r.item_groups?.name ?? '',
          ingredients: (ingredientsMap[r.id] ?? []).map((ing: any) => ({
            id: ing.id,
            kind: ing.line_kind || 'MATERIAL',
            material_id: ing.material_id,
            depreciation_id: ing.depreciation_id,
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit,
            unit_cost: ing.unit_cost_per_base,
            line_cost: ing.qty * ing.unit_cost_per_base,
            sort_order: ing.sort_order,
          })),
        }))
      );
    } catch (e: any) {
      setError(e.message || 'Error cargando recetas N1.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Totals en vivo
  const liveLines = useMemo(() => lines.map((l, i) => ({ ...l, sort_order: i, line_cost: l.qty * l.unit_cost })), [lines]);
  const liveTotalCost = useMemo(() => liveLines.reduce((s, l) => s + l.line_cost, 0), [liveLines]);
  const liveSuggestedPrice = useMemo(() =>
    fmargin > 0 ? liveTotalCost / (1 - fmargin / 100) : liveTotalCost,
    [liveTotalCost, fmargin]
  );

  const filtered = useMemo(() => recipes.filter((r) => {
    return (!filterType || r.recipe_type === filterType) && (!filterGroup || r.group_id === filterGroup);
  }), [recipes, filterType, filterGroup]);

  const byType = useMemo(() => {
    const map = new Map<string, RecipeN1[]>();
    for (const r of filtered) {
      const key = r.recipe_type || 'OTRO';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [filtered]);

  const toggleCollapse = (key: string) => {
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFname(''); setFcode(''); setFtype('SUBRECETA');
    setFyieldQty(1); setFyieldUnit('Und');
    setFmargin(0); setFfinalPrice('');
    setFgroup(''); setFnotes('');
    setLines([]);
    setShowForm(true);
  };

  const openEdit = (r: RecipeN1) => {
    setEditing(r);
    setFname(r.name); setFcode(r.code ?? ''); setFtype(r.recipe_type ?? 'SUBRECETA');
    setFyieldQty(r.yield_qty); setFyieldUnit(r.yield_unit);
    setFmargin(r.margin * 100); setFfinalPrice(r.final_price != null ? String(r.final_price) : '');
    setFgroup(r.group_id ?? ''); setFnotes(r.notes ?? '');
    setLines(r.ingredients ?? []);
    setShowForm(true);
  };

  const addLine = (kind: LineKind) => {
    const u = units[0]?.code ?? 'g';
    setLines((prev) => [...prev, { ...EMPTY_LINE(), kind, unit: u, sort_order: prev.length }]);
  };

  const updateLine = (i: number, patch: Partial<IngLine>) => {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, ...patch };
      updated.line_cost = updated.qty * updated.unit_cost;
      return updated;
    }));
  };

  const selectMaterial = (i: number, id: string) => {
    const mat = materials.find((m) => m.id === id);
    if (!mat) return;
    updateLine(i, { material_id: mat.id, depreciation_id: null, name: mat.name, unit: mat.base_unit, unit_cost: mat.unit_cost_per_base });
  };

  const selectDep = (i: number, id: string) => {
    const dep = deps.find((d) => d.id === id);
    if (!dep) return;
    const uc = dep.cost_per_use ?? dep.cost_per_unit ?? 0;
    updateLine(i, { depreciation_id: dep.id, material_id: null, name: dep.asset_name, unit: 'Uso', unit_cost: uc });
  };

  const handleSave = async () => {
    if (!fname.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!companyId) { setError('No hay empresa activa.'); return; }
    setSaving(true); setError(null);
    try {
      const payload: any = {
        company_id: companyId,
        level: 1,
        product: fname.trim(),
        code: fcode || null,
        recipe_type: ftype || null,
        yield_qty: fyieldQty,
        yield_unit: fyieldUnit,
        margin: fmargin / 100,
        total_cost: liveTotalCost,
        computed_price: liveSuggestedPrice,
        final_price: ffinalPrice ? Number(ffinalPrice) : null,
        group_id: fgroup || null,
        notes: fnotes || null,
      };
      let recipeId: string;
      if (editing) {
        const { error: err } = await supabase.from('recipes').update(payload).eq('id', editing.id);
        if (err) throw err;
        recipeId = editing.id;
      } else {
        const { data, error: err } = await supabase.from('recipes').insert(payload).select('id').single();
        if (err) throw err;
        recipeId = data.id;
      }
      // Reemplazar líneas
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      if (liveLines.length > 0) {
        const rows = liveLines.map((l, i) => ({
          recipe_id: recipeId,
          line_kind: l.kind,
          material_id: l.material_id || null,
          depreciation_id: l.depreciation_id || null,
          name: l.name,
          qty: l.qty,
          unit: l.unit,
          unit_cost_per_base: l.unit_cost,
          sort_order: i,
        }));
        const { error: errL } = await supabase.from('recipe_ingredients').insert(rows);
        if (errL) throw errL;
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
      await supabase.from('recipes').delete().eq('id', deleting.id);
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
      {/* Info panel */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <div className="flex gap-2 items-start">
          <Layers className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">Recetas Nivel 1 — Subrecetas y componentes base</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Son los componentes intermedios que preparas y luego reutilizas (mezclas, piezas, empaques, etiquetas…).<br />
              Se construyen con <strong>insumos del inventario</strong> y <strong>costos de depreciación</strong>. Luego se usan como ingrediente en Recetas N2.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Filtrar:</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900">
            <option value="">Todos los tipos</option>
            {RECIPE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900">
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {canEdit && <Button size="sm" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Nueva subreceta N1</Button>}
          <Button variant="ghost" size="sm" onClick={load} leftIcon={<RefreshCw className="w-4 h-4" />}>Actualizar</Button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {byType.size === 0 ? (
        <EmptyState
          icon={<Layers className="w-12 h-12" />}
          title="Sin subrecetas N1"
          description={canEdit ? 'Crea los componentes intermedios que preparas y reutilizas en tus productos finales.' : 'No hay subrecetas N1 registradas.'}
          action={canEdit ? <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Crear subreceta N1</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {Array.from(byType.entries()).map(([type, rows]) => (
            <Card key={type} className="overflow-hidden">
              <button
                onClick={() => toggleCollapse(type)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors text-left"
              >
                {collapsed.has(type) ? <ChevronRight className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
                <Layers className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm text-amber-800 dark:text-amber-300">{type}</span>
                <Badge variant="yellow">{rows.length}</Badge>
              </button>
              {!collapsed.has(type) && (
                <div className="overflow-x-auto">
                  <table className="suma-table">
                    <thead>
                      <tr>
                        <th>Código</th><th>Nombre</th><th>Rinde</th><th>Ingredientes</th>
                        <th>Costo total</th><th>Margen</th><th>Precio</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="font-mono text-xs text-gray-500">{r.code || '—'}</td>
                          <td className="font-semibold">{r.name}</td>
                          <td className="text-sm text-gray-500">{r.yield_qty} {r.yield_unit}</td>
                          <td><Badge variant="gray">{r.ingredients?.length ?? 0} ings</Badge></td>
                          <td className="font-mono text-sm">{formatCOP(r.total_cost)}</td>
                          <td><Badge variant="blue">{(r.margin * 100).toFixed(0)}%</Badge></td>
                          <td className="font-mono font-bold text-green-600 dark:text-green-400">
                            {formatCOP(r.final_price ?? r.computed_price)}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setViewing(r)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Eye className="w-4 h-4" /></button>
                              {canEdit && <>
                                <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-suma-600 rounded"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => setDeleting(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Crear / Editar receta N1 */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? `Editar: ${editing.name}` : 'Nueva subreceta N1'} size="2xl">
        <div className="p-6 space-y-5">
          {error && <Alert type="error">{error}</Alert>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Field label="Nombre *" required value={fname} onChange={(e) => setFname(e.target.value)} placeholder="Nombre de la subreceta o componente..." />
            </div>
            <Field label="Código" value={fcode} onChange={(e) => setFcode(e.target.value)} placeholder="N1-001" />
            <SelectField label="Tipo" value={ftype} onChange={(e) => setFtype(e.target.value)}>
              {RECIPE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </SelectField>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Rinde cantidad" type="number" value={fyieldQty} onChange={(e) => setFyieldQty(Number(e.target.value))} />
            <SelectField label="Unidad de rendimiento" value={fyieldUnit} onChange={(e) => setFyieldUnit(e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.code}>{u.code}</option>)}
            </SelectField>
            <Field label="Margen (%)" type="number" value={fmargin} onChange={(e) => setFmargin(Number(e.target.value))} hint="0 = sin margen" />
            <SelectField label="Grupo" value={fgroup} onChange={(e) => setFgroup(e.target.value)}>
              <option value="">(Sin grupo)</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectField>
          </div>

          {/* Ingredientes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Ingredientes</h4>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('MATERIAL')} leftIcon={<Package className="w-3.5 h-3.5" />}>
                  + Insumo
                </Button>
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('DEPRECIACION')} leftIcon={<Calculator className="w-3.5 h-3.5" />}>
                  + Depreciación
                </Button>
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('MANUAL')} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                  + Manual
                </Button>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center text-sm text-gray-400">
                Agrega insumos del inventario, costos de depreciación o líneas manuales.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((ln, i) => (
                  <div key={i} className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-lg border ${
                    ln.kind === 'MATERIAL' ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' :
                    ln.kind === 'DEPRECIACION' ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800' :
                    'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                  }`}>
                    <Badge variant={ln.kind === 'MATERIAL' ? 'blue' : ln.kind === 'DEPRECIACION' ? 'purple' : 'gray'} className="text-xs flex-shrink-0">
                      {ln.kind === 'MATERIAL' ? 'INS' : ln.kind === 'DEPRECIACION' ? 'DEP' : 'MAN'}
                    </Badge>

                    {ln.kind === 'MATERIAL' ? (
                      <select
                        value={ln.material_id ?? ''}
                        onChange={(e) => selectMaterial(i, e.target.value)}
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded border border-blue-300 dark:border-blue-700 text-xs bg-white dark:bg-gray-800"
                      >
                        <option value="">-- Seleccionar insumo --</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.base_unit} @ {formatCOP(m.unit_cost_per_base)})</option>)}
                      </select>
                    ) : ln.kind === 'DEPRECIACION' ? (
                      <select
                        value={ln.depreciation_id ?? ''}
                        onChange={(e) => selectDep(i, e.target.value)}
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded border border-purple-300 dark:border-purple-700 text-xs bg-white dark:bg-gray-800"
                      >
                        <option value="">-- Seleccionar activo --</option>
                        {deps.map((d) => <option key={d.id} value={d.id}>{d.asset_name} ({d.method} @ {formatCOP(d.cost_per_use ?? d.cost_per_unit ?? 0)}/uso)</option>)}
                      </select>
                    ) : (
                      <input
                        value={ln.name}
                        onChange={(e) => updateLine(i, { name: e.target.value })}
                        placeholder="Nombre del costo"
                        className="flex-1 min-w-[140px] px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs bg-white dark:bg-gray-800"
                      />
                    )}

                    <input
                      type="number" step="any" placeholder="Cant."
                      value={ln.qty}
                      onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs text-center bg-white dark:bg-gray-800"
                    />

                    {ln.kind !== 'DEPRECIACION' && (
                      <select
                        value={ln.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800"
                      >
                        {units.map((u) => <option key={u.id} value={u.code}>{u.code}</option>)}
                      </select>
                    )}

                    {ln.kind === 'MANUAL' && (
                      <input
                        type="number" step="any" placeholder="Costo unit."
                        value={ln.unit_cost}
                        onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })}
                        className="w-28 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 font-mono"
                      />
                    )}

                    <div className="w-28 text-right font-mono text-xs font-semibold text-gray-900 dark:text-white">
                      {formatCOP(ln.qty * ln.unit_cost)}
                    </div>
                    <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="p-1 text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen en vivo */}
          <div className="bg-suma-50 dark:bg-suma-950 p-4 rounded-xl border border-suma-100 dark:border-suma-900 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-suma-600 font-semibold">COSTO TOTAL</p>
              <p className="text-2xl font-black font-mono text-suma-900 dark:text-suma-100">{formatCOP(liveTotalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold">PRECIO SUGERIDO ({fmargin}%)</p>
              <p className="text-2xl font-black font-mono text-gray-700 dark:text-gray-200">{formatCOP(Math.round(liveSuggestedPrice))}</p>
            </div>
            <div>
              <p className="text-xs text-green-700 font-semibold">PRECIO FINAL (editable)</p>
              <input
                type="number"
                value={ffinalPrice}
                onChange={(e) => setFfinalPrice(e.target.value)}
                placeholder={String(Math.round(liveSuggestedPrice))}
                className="w-full mt-0.5 px-2 py-1 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 font-mono text-xl font-black"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Guardar cambios' : 'Crear subreceta N1'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Ver receta */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.name || 'Detalle N1'} size="xl">
        {viewing && (
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <Badge variant="yellow">{viewing.recipe_type}</Badge>
              <Badge variant="gray">Rinde {viewing.yield_qty} {viewing.yield_unit}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
              <div><p className="text-xs text-gray-500">Costo total</p><p className="font-bold font-mono">{formatCOP(viewing.total_cost)}</p></div>
              <div><p className="text-xs text-gray-500">Margen</p><p className="font-bold text-suma-600">{(viewing.margin * 100).toFixed(0)}%</p></div>
              <div><p className="text-xs text-gray-500">Precio</p><p className="font-bold text-green-600 font-mono">{formatCOP(viewing.final_price ?? viewing.computed_price)}</p></div>
            </div>
            <table className="suma-table">
              <thead><tr><th>Tipo</th><th>Ingrediente</th><th>Cant.</th><th>Unidad</th><th>Costo línea</th></tr></thead>
              <tbody>
                {(viewing.ingredients ?? []).map((ing, i) => (
                  <tr key={i}>
                    <td><Badge variant={ing.kind === 'MATERIAL' ? 'blue' : ing.kind === 'DEPRECIACION' ? 'purple' : 'gray'}>{ing.kind}</Badge></td>
                    <td className="font-medium">{ing.name}</td>
                    <td>{ing.qty}</td>
                    <td>{ing.unit}</td>
                    <td className="font-mono text-sm">{formatCOP(ing.line_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button></div>
          </div>
        )}
      </Modal>

      {/* Modal: Eliminar */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Eliminar subreceta N1" size="sm">
        <div className="p-6 space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <p>¿Eliminar <strong>{deleting?.name}</strong>? Las recetas N2 que la usen perderán este componente.</p>
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
