// ============================================================
// SUMA ERP — Costos / Recetas Nivel 2 (Productos finales)
// Productos terminados listos para la venta.
// Ingredientes: MATERIAL + DEPRECIACION + RECETA_N1
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Edit2, Trash2, Eye, RefreshCw, Star, Calculator,
  AlertTriangle, Package, Layers, X,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge, EmptyState, Alert, Spinner,
} from '@/components/ui';
import { useActiveCompanyId, useCanEdit } from '@/store/AppStore';
import { formatCOP } from '@/config/brand';
import { supabase } from '@/services/supabase';
import type { Unit } from '@/types/domain';

type LineKind = 'MATERIAL' | 'DEPRECIACION' | 'RECETA_N1' | 'MANUAL';

interface IngLine {
  kind: LineKind;
  material_id: string | null;
  depreciation_id: string | null;
  recipe_ref_id: string | null;
  name: string;
  qty: number;
  unit: string;
  unit_cost: number;
  line_cost: number;
  sort_order: number;
}

interface RecipeN2 {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  level: 2;
  recipe_type: string | null;
  yield_qty: number;
  yield_unit: string;
  margin: number;
  gateway_fee_pct: number;
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
interface RecipeN1Opt { id: string; name: string; code: string | null; total_cost: number; yield_qty: number; yield_unit: string; }
interface GroupOpt { id: string; name: string; }

const RECIPE_TYPES_N2 = ['PRODUCTO ESTÁNDAR', 'KIT / COMBO', 'PERSONALIZADO', 'OTRO'];

const EMPTY_LINE = (): IngLine => ({
  kind: 'MATERIAL',
  material_id: null,
  depreciation_id: null,
  recipe_ref_id: null,
  name: '',
  qty: 1,
  unit: 'g',
  unit_cost: 0,
  line_cost: 0,
  sort_order: 0,
});

export default function RecetasN2Tab() {
  const companyId = useActiveCompanyId();
  const canEdit = useCanEdit();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeN2[]>([]);
  const [materials, setMaterials] = useState<MaterialOpt[]>([]);
  const [deps, setDeps] = useState<DepOpt[]>([]);
  const [n1recipes, setN1Recipes] = useState<RecipeN1Opt[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<GroupOpt[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecipeN2 | null>(null);
  const [viewing, setViewing] = useState<RecipeN2 | null>(null);
  const [deleting, setDeleting] = useState<RecipeN2 | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtros de la tabla
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterType, setFilterType] = useState('');

  // Form
  const [fname, setFname] = useState('');
  const [fcode, setFcode] = useState('');
  const [ftype, setFtype] = useState('PRODUCTO');
  const [fyieldQty, setFyieldQty] = useState(1);
  const [fyieldUnit, setFyieldUnit] = useState('Und');
  const [fmargin, setFmargin] = useState(30);
  const [fgateway, setFgateway] = useState(7.19);
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
      const [rRes, mRes, dRes, n1Res, uRes, gRes] = await Promise.all([
        supabase.from('recipes').select(`
          id, company_id, code, product, level, recipe_type,
          yield_qty, yield_unit, margin, gateway_fee_pct, total_cost,
          computed_price, final_price, notes, group_id,
          item_groups(name)
        `).eq('level', 2).order('product'),
        supabase.from('materials').select('id, name, base_unit, unit_cost_per_base').order('name'),
        supabase.from('depreciations').select('id, asset_name, method, estimated_uses, useful_life_months, units_per_month, total_cost, salvage_value').order('asset_name'),
        supabase.from('recipes').select('id, product, code, total_cost, yield_qty, yield_unit').eq('level', 1).order('product'),
        supabase.from('units').select('*').order('code'),
        supabase.from('item_groups').select('id, name').eq('kind', 'recipe').order('name'),
      ]);
      if (rRes.error) throw rRes.error;

      const recipeIds = (rRes.data ?? []).map((r: any) => r.id);
      let ingredientsMap: Record<string, any[]> = {};
      if (recipeIds.length > 0) {
        const { data: ingData, error: ingErr } = await supabase
          .from('recipe_ingredients')
          .select('id, recipe_id, line_kind, material_id, depreciation_id, recipe_ref_id, name, qty, unit, unit_cost_per_base, sort_order')
          .in('recipe_id', recipeIds)
          .order('sort_order');
        if (ingErr) throw ingErr;
        for (const ing of ingData ?? []) {
          if (!ingredientsMap[ing.recipe_id]) ingredientsMap[ing.recipe_id] = [];
          ingredientsMap[ing.recipe_id].push(ing);
        }
      }

      const enrichedDeps = (dRes.data ?? []).map((d: any): DepOpt => {
        const base = d.total_cost - (d.salvage_value ?? 0);
        const cost_per_use = d.method === 'USO' && d.estimated_uses ? base / d.estimated_uses : null;
        const cost_per_unit = d.method === 'TIEMPO' && d.useful_life_months && d.units_per_month
          ? (base / d.useful_life_months) / d.units_per_month : null;
        return { id: d.id, asset_name: d.asset_name, method: d.method, cost_per_use, cost_per_unit };
      });

      setMaterials(mRes.data ?? []);
      setDeps(enrichedDeps);
      setN1Recipes(
        (n1Res.data ?? []).map((r: any) => ({
          ...r,
          name: r.product ?? r.name ?? '',
        }))
      );
      setUnits(uRes.data ?? []);
      setGroups(gRes.data ?? []);
      setRecipes(
        (rRes.data ?? []).map((r: any) => ({
          ...r,
          name: r.product ?? r.name ?? '',
          level: 2 as const,
          group_name: r.item_groups?.name ?? '',
          ingredients: (ingredientsMap[r.id] ?? []).map((ing: any) => ({
            kind: ing.line_kind || 'MATERIAL',
            material_id: ing.material_id,
            depreciation_id: ing.depreciation_id,
            recipe_ref_id: ing.recipe_ref_id,
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
      setError(e.message || 'Error cargando recetas N2.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const liveLines = useMemo(() =>
    lines.map((l, i) => ({ ...l, sort_order: i, line_cost: l.qty * l.unit_cost })),
    [lines]
  );
  const liveTotalCost = useMemo(() => liveLines.reduce((s, l) => s + l.line_cost, 0), [liveLines]);
  const liveSuggestedBase = useMemo(() =>
    fmargin > 0 ? liveTotalCost / (1 - fmargin / 100) : liveTotalCost,
    [liveTotalCost, fmargin]
  );
  const liveSuggestedPrice = useMemo(() =>
    fgateway > 0 ? liveSuggestedBase / (1 - fgateway / 100) : liveSuggestedBase,
    [liveSuggestedBase, fgateway]
  );
  const liveMarginReal = useMemo(() => {
    const fp = ffinalPrice ? Number(ffinalPrice) : liveSuggestedPrice;
    return fp > 0 ? ((fp - liveTotalCost) / fp) * 100 : 0;
  }, [ffinalPrice, liveSuggestedPrice, liveTotalCost]);

  // Lista filtrada para la tabla
  const filteredRecipes = useMemo(
    () => recipes.filter((r) => {
      const matchSearch = !search ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.code ?? '').toLowerCase().includes(search.toLowerCase());
      const matchType = !filterType || r.recipe_type === filterType;
      const matchGroup = !filterGroup || r.group_id === filterGroup;
      return matchSearch && matchType && matchGroup;
    }),
    [recipes, search, filterType, filterGroup],
  );

  const openCreate = () => {
    setEditing(null);
    setFname(''); setFcode(''); setFtype('PRODUCTO');
    setFyieldQty(1); setFyieldUnit('Und');
    setFmargin(30); setFgateway(7.19); setFfinalPrice('');
    setFgroup(''); setFnotes('');
    setLines([]);
    setShowForm(true);
  };

  const openEdit = (r: RecipeN2) => {
    setEditing(r);
    setFname(r.name); setFcode(r.code ?? ''); setFtype(r.recipe_type ?? 'PRODUCTO');
    setFyieldQty(r.yield_qty); setFyieldUnit(r.yield_unit);
    setFmargin(r.margin * 100); setFgateway((r.gateway_fee_pct ?? 0) * 100);
    setFfinalPrice(r.final_price != null ? String(r.final_price) : '');
    setFgroup(r.group_id ?? ''); setFnotes(r.notes ?? '');
    setLines(r.ingredients ?? []);
    setShowForm(true);
  };

  const addLine = (kind: LineKind) => {
    setLines((p) => [...p, { ...EMPTY_LINE(), kind, sort_order: p.length, unit: units[0]?.code ?? 'Und' }]);
  };

  const updateLine = (i: number, patch: Partial<IngLine>) => {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const u = { ...l, ...patch };
      u.line_cost = u.qty * u.unit_cost;
      return u;
    }));
  };

  const selectMaterial = (i: number, id: string) => {
    const mat = materials.find((m) => m.id === id);
    if (mat) updateLine(i, { material_id: mat.id, depreciation_id: null, recipe_ref_id: null, name: mat.name, unit: mat.base_unit, unit_cost: mat.unit_cost_per_base });
  };
  const selectDep = (i: number, id: string) => {
    const dep = deps.find((d) => d.id === id);
    if (dep) {
      const uc = dep.cost_per_use ?? dep.cost_per_unit ?? 0;
      updateLine(i, { depreciation_id: dep.id, material_id: null, recipe_ref_id: null, name: dep.asset_name, unit: 'Uso', unit_cost: uc });
    }
  };
  const selectN1 = (i: number, id: string) => {
    const r = n1recipes.find((r) => r.id === id);
    if (r) {
      const costPerUnit = r.yield_qty > 0 ? r.total_cost / r.yield_qty : r.total_cost;
      updateLine(i, { recipe_ref_id: r.id, material_id: null, depreciation_id: null, name: r.name, unit: r.yield_unit, unit_cost: costPerUnit });
    }
  };

  const handleSave = async () => {
    if (!fname.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!companyId) { setError('No hay empresa activa.'); return; }
    setSaving(true); setError(null);
    try {
      const payload: any = {
        company_id: companyId,
        level: 2,
        product: fname.trim(),
        code: fcode || null,
        recipe_type: ftype || null,
        yield_qty: fyieldQty,
        yield_unit: fyieldUnit,
        margin: fmargin / 100,
        gateway_fee_pct: fgateway / 100,
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
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      if (liveLines.length > 0) {
        const rows = liveLines.map((l, i) => ({
          recipe_id: recipeId,
          line_kind: l.kind,
          material_id: l.material_id || null,
          depreciation_id: l.depreciation_id || null,
          recipe_ref_id: l.recipe_ref_id || null,
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
      <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-4">
        <div className="flex gap-2 items-start">
          <Star className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-green-800 dark:text-green-300">Recetas Nivel 2 — Productos finales</p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
              Son los productos terminados que vendes a tus clientes.<br />
              Pueden usar <strong>insumos del inventario</strong>, <strong>depreciaciones</strong> y <strong>subrecetas N1</strong> como ingrediente.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto, código..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
            />
          </div>
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <option value="">Todos los tipos</option>
            {RECIPE_TYPES_N2.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {canEdit && <Button size="sm" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Nuevo producto N2</Button>}
          <Button variant="ghost" size="sm" onClick={load} leftIcon={<RefreshCw className="w-4 h-4" />}>Actualizar</Button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {filteredRecipes.length === 0 ? (
        <EmptyState
          icon={<Star className="w-12 h-12" />}
          title={filterType ? `Sin productos del tipo ${filterType}` : 'Sin productos N2'}
          description={
            filterType
              ? 'No hay productos de este tipo. Cambia el filtro o crea uno nuevo.'
              : canEdit ? 'Crea los productos finales que vendes, combinando insumos y subrecetas N1.' : 'No hay productos N2 registrados.'
          }
          action={canEdit ? <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>Crear producto N2</Button> : undefined}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="suma-table">
              <thead>
                <tr>
                  <th>Código</th><th>Producto</th><th>Tipo</th><th>Ingredientes</th>
                  <th>Costo total</th><th>Margen</th><th>Pasarela</th><th>Precio final</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipes.map((r) => {
                  const fp = r.final_price ?? r.computed_price;
                  const marginReal = fp > 0 ? ((fp - r.total_cost) / fp) * 100 : 0;
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-gray-500">{r.code || '—'}</td>
                      <td className="font-semibold">{r.name}</td>
                      <td><Badge variant="green">{r.recipe_type}</Badge></td>
                      <td><Badge variant="gray">{r.ingredients?.length ?? 0} ings</Badge></td>
                      <td className="font-mono text-sm">{formatCOP(r.total_cost)}</td>
                      <td><Badge variant="blue">{marginReal.toFixed(1)}%</Badge></td>
                      <td className="text-xs text-gray-500">{((r.gateway_fee_pct ?? 0) * 100).toFixed(2)}%</td>
                      <td className="font-mono font-bold text-green-600 dark:text-green-400">{formatCOP(fp)}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: Crear / Editar */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? `Editar: ${editing.name}` : 'Nuevo producto N2'} size="2xl">
        <div className="p-6 space-y-5">
          {error && <Alert type="error">{error}</Alert>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <Field label="Nombre *" required value={fname} onChange={(e) => setFname(e.target.value)} placeholder="Nombre del producto final..." />
            </div>
            <Field label="Código" value={fcode} onChange={(e) => setFcode(e.target.value)} placeholder="N2-001" />
            <SelectField label="Tipo" value={ftype} onChange={(e) => setFtype(e.target.value)}>
              {RECIPE_TYPES_N2.map((t) => <option key={t} value={t}>{t}</option>)}
            </SelectField>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Field label="Rinde cantidad" type="number" value={fyieldQty} onChange={(e) => setFyieldQty(Number(e.target.value))} />
            <SelectField label="Unidad" value={fyieldUnit} onChange={(e) => setFyieldUnit(e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.code}>{u.code}</option>)}
            </SelectField>
            <Field label="Margen (%)" type="number" value={fmargin} onChange={(e) => setFmargin(Number(e.target.value))} hint="Margen sobre venta" />
            <Field label="Pasarela (%)" type="number" step="0.01" value={fgateway} onChange={(e) => setFgateway(Number(e.target.value))} hint="Ej. 7.19" />
            <SelectField label="Carpeta" value={fgroup} onChange={(e) => setFgroup(e.target.value)}>
              <option value="">(Sin carpeta)</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectField>
          </div>

          {/* Ingredientes N2: material + dep + N1 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Ingredientes del producto</h4>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('MATERIAL')} leftIcon={<Package className="w-3.5 h-3.5" />}>+ Insumo</Button>
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('DEPRECIACION')} leftIcon={<Calculator className="w-3.5 h-3.5" />}>+ Dep.</Button>
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('RECETA_N1')} leftIcon={<Layers className="w-3.5 h-3.5" />}>+ Subreceta N1</Button>
                <Button type="button" variant="secondary" size="xs" onClick={() => addLine('MANUAL')} leftIcon={<Plus className="w-3.5 h-3.5" />}>+ Manual</Button>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center text-sm text-gray-400">
                Agrega ingredientes del inventario, depreciaciones, subrecetas N1 o costos manuales.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {lines.map((ln, i) => (
                  <div key={i} className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-lg border ${
                    ln.kind === 'MATERIAL' ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' :
                    ln.kind === 'DEPRECIACION' ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800' :
                    ln.kind === 'RECETA_N1' ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800' :
                    'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                  }`}>
                    <Badge variant={
                      ln.kind === 'MATERIAL' ? 'blue' :
                      ln.kind === 'DEPRECIACION' ? 'purple' :
                      ln.kind === 'RECETA_N1' ? 'yellow' : 'gray'
                    } className="text-xs flex-shrink-0">
                      {ln.kind === 'MATERIAL' ? 'INS' : ln.kind === 'DEPRECIACION' ? 'DEP' : ln.kind === 'RECETA_N1' ? 'N1' : 'MAN'}
                    </Badge>

                    {ln.kind === 'MATERIAL' && (
                      <select value={ln.material_id ?? ''} onChange={(e) => selectMaterial(i, e.target.value)}
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded border border-blue-300 dark:border-blue-700 text-xs bg-white dark:bg-gray-800">
                        <option value="">-- Seleccionar insumo --</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.base_unit} @ {formatCOP(m.unit_cost_per_base)})</option>)}
                      </select>
                    )}
                    {ln.kind === 'DEPRECIACION' && (
                      <select value={ln.depreciation_id ?? ''} onChange={(e) => selectDep(i, e.target.value)}
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded border border-purple-300 dark:border-purple-700 text-xs bg-white dark:bg-gray-800">
                        <option value="">-- Seleccionar activo --</option>
                        {deps.map((d) => <option key={d.id} value={d.id}>{d.asset_name} @ {formatCOP(d.cost_per_use ?? d.cost_per_unit ?? 0)}/uso</option>)}
                      </select>
                    )}
                    {ln.kind === 'RECETA_N1' && (
                      <select value={ln.recipe_ref_id ?? ''} onChange={(e) => selectN1(i, e.target.value)}
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded border border-amber-300 dark:border-amber-700 text-xs bg-white dark:bg-gray-800">
                        <option value="">-- Seleccionar subreceta N1 --</option>
                        {n1recipes.map((r) => <option key={r.id} value={r.id}>{r.name} → Costo {formatCOP(r.yield_qty > 0 ? r.total_cost / r.yield_qty : r.total_cost)}/{r.yield_unit}</option>)}
                      </select>
                    )}
                    {ln.kind === 'MANUAL' && (
                      <input value={ln.name} onChange={(e) => updateLine(i, { name: e.target.value })}
                        placeholder="Nombre del costo"
                        className="flex-1 min-w-[140px] px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs bg-white dark:bg-gray-800" />
                    )}

                    <input type="number" step="any" placeholder="Cant." value={ln.qty}
                      onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs text-center bg-white dark:bg-gray-800" />

                    {ln.kind !== 'DEPRECIACION' && ln.kind !== 'RECETA_N1' && (
                      <select value={ln.unit} onChange={(e) => updateLine(i, { unit: e.target.value })}
                        className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800">
                        {units.map((u) => <option key={u.id} value={u.code}>{u.code}</option>)}
                      </select>
                    )}

                    {ln.kind === 'MANUAL' && (
                      <input type="number" step="any" placeholder="Costo unit." value={ln.unit_cost}
                        onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })}
                        className="w-28 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 font-mono" />
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
          <div className="bg-suma-50 dark:bg-suma-950 p-4 rounded-xl border border-suma-100 dark:border-suma-900">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <p className="text-xs text-suma-600 font-semibold">COSTO TOTAL</p>
                <p className="text-xl font-black font-mono text-suma-900 dark:text-suma-100">{formatCOP(liveTotalCost)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold">PRECIO BASE (+{fmargin}%)</p>
                <p className="text-xl font-black font-mono text-gray-700 dark:text-gray-200">{formatCOP(Math.round(liveSuggestedBase))}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold">+PASARELA ({fgateway}%)</p>
                <p className="text-xl font-black font-mono text-gray-600 dark:text-gray-300">{formatCOP(Math.round(liveSuggestedPrice))}</p>
              </div>
              <div>
                <p className="text-xs text-green-700 font-semibold">PRECIO FINAL</p>
                <input type="number" value={ffinalPrice}
                  onChange={(e) => setFfinalPrice(e.target.value)}
                  placeholder={String(Math.round(liveSuggestedPrice))}
                  className="w-full mt-0.5 px-2 py-1 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 font-mono text-lg font-black" />
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Margen real: <strong className={liveMarginReal >= fmargin ? 'text-green-600' : 'text-red-500'}>{liveMarginReal.toFixed(1)}%</strong>
              {' '} sobre el precio final
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Guardar cambios' : 'Crear producto N2'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Ver detalle */}
      <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title={viewing?.name || 'Detalle N2'} size="xl">
        {viewing && (
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <Badge variant="green">{viewing.recipe_type}</Badge>
              <Badge variant="gray">Rinde {viewing.yield_qty} {viewing.yield_unit}</Badge>
              <Badge variant="gray">Pasarela {((viewing.gateway_fee_pct ?? 0) * 100).toFixed(2)}%</Badge>
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
                    <td><Badge variant={ing.kind === 'MATERIAL' ? 'blue' : ing.kind === 'DEPRECIACION' ? 'purple' : ing.kind === 'RECETA_N1' ? 'yellow' : 'gray'}>{ing.kind}</Badge></td>
                    <td className="font-medium">{ing.name}</td>
                    <td>{ing.qty}</td><td>{ing.unit}</td>
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
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Eliminar producto N2" size="sm">
        <div className="p-6 space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <p>¿Eliminar <strong>{deleting?.name}</strong>?</p>
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
