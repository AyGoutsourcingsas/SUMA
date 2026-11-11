// ============================================================
// SUMA ERP — Módulo COSTOS (recetas, carpetas y costeo real)
// Flujo "arroz chino": arma receta con insumos del inventario,
// calcula costo por regla de tres y casilla de margen -> precio.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Calculator, Plus, Search, Edit2, Trash2, Eye, Save,
  RefreshCw, FolderPlus, Folder, FileText, X, LineChart, Download,
} from 'lucide-react';
import {
  Button, Card, Field, SelectField, Modal, Badge,
  EmptyState, Alert, Spinner,
} from '@/components/ui';
import { useAppStore, useCanEdit, useIsSuperAdmin } from '@/store/AppStore';
import { formatCOP, formatPercent } from '@/config/brand';
import {
  fetchUnits, fetchGroups, createGroup, deleteGroup,
  fetchMaterialsWithCost, fetchRecipes, createRecipe, updateRecipe,
  deleteRecipe, computeRecipe,
  type RecipeRecord, type RecipeLineInput, type PriceMode,
} from '@/services/modules/costos';
import { CostSimulatorModal } from './CostSimulatorModal';
import { downloadPlantillaSUMA } from '@/lib/plantillaImportacion';
import type { ItemGroup, Material, Unit } from '@/types/domain';

export default function CostosModule() {
  const { state } = useAppStore();
  const canEdit = useCanEdit();
  const isSuperAdmin = useIsSuperAdmin();
  const companyId = state.company?.id ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);

  const [activeGroup, setActiveGroup] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');

  // Modales
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<RecipeRecord | null>(null);
  const [deletingRecipe, setDeletingRecipe] = useState<RecipeRecord | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, m, g, r] = await Promise.all([
        fetchUnits(),
        fetchMaterialsWithCost(),
        fetchGroups('recipe'),
        fetchRecipes(),
      ]);
      setUnits(u);
      setMaterials(m);
      setGroups(g);
      setRecipes(r);
    } catch (e) {
      setError(
        'No se pudieron cargar los datos. Verifica que aplicaste las migraciones 003 y 004 en Supabase y que tu usuario tiene empresa asignada.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const inGroup = activeGroup === 'all' || r.group_id === activeGroup;
      const matchesSearch =
        r.product.toLowerCase().includes(search.toLowerCase()) ||
        (r.code ?? '').toLowerCase().includes(search.toLowerCase());
      return inGroup && matchesSearch;
    });
  }, [recipes, activeGroup, search]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { setError('Escribe un nombre para la carpeta.'); return; }
    if (!companyId) { setError('Selecciona una empresa activa en la barra superior antes de crear carpetas.'); return; }
    try {
      await createGroup(companyId, newGroupName.trim(), 'recipe');
      setNewGroupName('');
      setShowGroupModal(false);
      const g = await fetchGroups('recipe');
      setGroups(g);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'No se pudo crear la carpeta.');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteGroup(id);
      if (activeGroup === id) setActiveGroup('all');
      setGroups(await fetchGroups('recipe'));
    } catch {
      setError('No se pudo eliminar la carpeta.');
    }
  };

  if (loading) {
    return (
      <div className="page-container flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Calculator className="w-6 h-6 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Costos & Recetas</h1>
            {isSuperAdmin && <Badge variant="purple">Revisión SUMA</Badge>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Arma la ficha de cada producto con insumos del inventario. El costo se calcula
            automáticamente por regla de tres y el precio según el margen que definas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadPlantillaSUMA()} leftIcon={<Download className="w-4 h-4" />}>
            Descargar plantilla
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowSimulator(true)} leftIcon={<LineChart className="w-4 h-4" />}>
            Simulador de costos
          </Button>
          <Button variant="secondary" size="sm" onClick={loadAll} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Actualizar
          </Button>
        </div>
      </div>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar de carpetas */}
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Carpetas</h3>
            {canEdit && (
              <button
                onClick={() => setShowGroupModal(true)}
                className="p-1 text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950 rounded"
                title="Nueva carpeta"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setActiveGroup('all')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeGroup === 'all'
                ? 'bg-suma-50 dark:bg-suma-950 text-suma-700 dark:text-suma-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            <FileText className="w-4 h-4" /> Todas ({recipes.length})
          </button>
          {groups.map((g) => {
            const count = recipes.filter((r) => r.group_id === g.id).length;
            return (
              <div key={g.id} className="group flex items-center">
                <button
                  onClick={() => setActiveGroup(g.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeGroup === g.id
                      ? 'bg-suma-50 dark:bg-suma-950 text-suma-700 dark:text-suma-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <Folder className="w-4 h-4" /> {g.name} ({count})
                </button>
                {canEdit && (
                  <button
                    onClick={() => handleDeleteGroup(g.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500"
                    title="Eliminar carpeta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className="text-xs text-gray-400 px-3">Crea carpetas para organizar tus recetas por grupo.</p>
          )}
        </aside>

        {/* Contenido: recetas */}
        <section>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar receta por nombre o código..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
              />
            </div>
            {canEdit && (
              <Button
                onClick={() => {
                  setEditingRecipe(null);
                  setShowRecipeModal(true);
                }}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Nueva receta
              </Button>
            )}
          </div>

          <Card>
            {filteredRecipes.length === 0 ? (
              <EmptyState
                icon={<Calculator className="w-12 h-12" />}
                title="Sin recetas en esta vista"
                description={
                  canEdit
                    ? 'Crea una receta eligiendo insumos del inventario y sus cantidades.'
                    : 'Aún no hay recetas registradas aquí.'
                }
                action={
                  canEdit ? (
                    <Button onClick={() => { setEditingRecipe(null); setShowRecipeModal(true); }} leftIcon={<Plus className="w-4 h-4" />}>
                      Crear primera receta
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="suma-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Insumos</th>
                      <th>Costo total</th>
                      <th>Margen</th>
                      <th>Precio venta</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecipes.map((r) => (
                      <tr key={r.id}>
                        <td className="font-mono text-xs text-gray-500">{r.code || '—'}</td>
                        <td className="font-semibold text-gray-900 dark:text-white">{r.product}</td>
                        <td><Badge variant="gray">{r.recipe_ingredients?.length ?? 0} insumos</Badge></td>
                        <td className="font-mono text-sm">{formatCOP(r.computed_cost || 0)}</td>
                        <td><Badge variant="blue">{formatPercent(r.margin || 0)}</Badge></td>
                        <td className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                          {formatCOP((r.final_price ?? r.computed_price) || 0)}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setViewingRecipe(r)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Ver">
                              <Eye className="w-4 h-4" />
                            </button>
                            {canEdit && (
                              <>
                                <button onClick={() => { setEditingRecipe(r); setShowRecipeModal(true); }} className="p-1.5 text-gray-400 hover:text-suma-600 rounded" title="Editar">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeletingRecipe(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Eliminar">
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
            )}
          </Card>
        </section>
      </div>

      {/* Modal: nueva carpeta */}
      <Modal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)} title="Nueva carpeta" size="sm">
        <div className="p-6 space-y-4">
          <Field label="Nombre de la carpeta" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Ej. Platos fuertes, Postres..." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowGroupModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateGroup} leftIcon={<FolderPlus className="w-4 h-4" />}>Crear carpeta</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: armar/editar receta */}
      {showRecipeModal && (
        <RecipeEditor
          companyId={companyId}
          units={units}
          materials={materials}
          groups={groups}
          recipe={editingRecipe}
          defaultGroup={activeGroup === 'all' ? null : activeGroup}
          onClose={() => setShowRecipeModal(false)}
          onSaved={async () => {
            setShowRecipeModal(false);
            setRecipes(await fetchRecipes());
          }}
        />
      )}

      {/* Modal: simulador de costos */}
      <CostSimulatorModal
        isOpen={showSimulator}
        onClose={() => setShowSimulator(false)}
        recipes={recipes}
        materials={materials}
        units={units}
        groups={groups}
      />

      {/* Modal: ver ficha */}
      <Modal isOpen={!!viewingRecipe} onClose={() => setViewingRecipe(null)} title={viewingRecipe?.product || 'Ficha'} size="xl">
        {viewingRecipe && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
              <div><p className="text-xs text-gray-500">Costo total</p><p className="font-bold">{formatCOP(viewingRecipe.computed_cost || 0)}</p></div>
              <div><p className="text-xs text-gray-500">Margen</p><p className="font-bold text-suma-600">{formatPercent(viewingRecipe.margin || 0)}</p></div>
              <div><p className="text-xs text-gray-500">Precio venta</p><p className="font-bold text-green-600">{formatCOP((viewingRecipe.final_price ?? viewingRecipe.computed_price) || 0)}</p></div>
            </div>
            <table className="suma-table">
              <thead><tr><th>Insumo</th><th>Cantidad</th><th>Unidad</th></tr></thead>
              <tbody>
                {(viewingRecipe.recipe_ingredients ?? []).map((ing, i) => (
                  <tr key={i}>
                    <td className="font-medium">{ing.name}</td>
                    <td>{ing.qty}</td>
                    <td>{ing.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setViewingRecipe(null)}>Cerrar</Button></div>
          </div>
        )}
      </Modal>

      {/* Modal: eliminar */}
      <Modal isOpen={!!deletingRecipe} onClose={() => setDeletingRecipe(null)} title="Eliminar receta" size="sm">
        <div className="p-6">
          <p className="mb-6">¿Eliminar la receta de <strong>{deletingRecipe?.product}</strong>?</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeletingRecipe(null)}>Cancelar</Button>
            <Button variant="danger" onClick={async () => { if (deletingRecipe) { await deleteRecipe(deletingRecipe.id); setDeletingRecipe(null); setRecipes(await fetchRecipes()); } }} leftIcon={<Trash2 className="w-4 h-4" />}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Editor de receta: el corazón del "arroz chino"
// ============================================================
function RecipeEditor({
  companyId, units, materials, groups, recipe, defaultGroup, onClose, onSaved,
}: {
  companyId: string;
  units: Unit[];
  materials: Material[];
  groups: ItemGroup[];
  recipe: RecipeRecord | null;
  defaultGroup: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [product, setProduct] = useState(recipe?.product ?? '');
  const [code, setCode] = useState(recipe?.code ?? '');
  const [groupId, setGroupId] = useState<string | null>(recipe?.group_id ?? defaultGroup);
  const [margin, setMargin] = useState<number>((recipe?.margin ?? 0.3) * 100); // en %
  const [priceMode, setPriceMode] = useState<PriceMode>(recipe?.price_mode ?? 'MARKUP');
  const [gatewayFee, setGatewayFee] = useState<number>((recipe?.gateway_fee_pct ?? 0) * 100);
  const [finalPriceOverride, setFinalPriceOverride] = useState<string>(
    recipe?.final_price != null ? String(recipe.final_price) : '',
  );
  const [lines, setLines] = useState<RecipeLineInput[]>(
    (recipe?.recipe_ingredients ?? []).map((l) => ({
      material_id: l.material_id ?? null,
      name: l.name,
      qty: l.qty,
      unit: l.unit,
      line_kind: (l.line_kind as 'MATERIAL' | 'MANUAL') ?? 'MATERIAL',
    })),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Cálculo en vivo
  const result = useMemo(
    () =>
      computeRecipe({
        lines,
        margin: margin / 100,
        priceMode,
        gatewayFeePct: gatewayFee / 100,
        finalPrice: finalPriceOverride ? Number(finalPriceOverride) : null,
        units,
        materials,
      }),
    [lines, margin, priceMode, gatewayFee, finalPriceOverride, units, materials],
  );

  const addLine = () =>
    setLines((prev) => [...prev, { material_id: null, name: '', qty: 1, unit: units[0]?.code ?? 'Und', line_kind: 'MATERIAL' }]);

  const updateLine = (i: number, patch: Partial<RecipeLineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const selectMaterial = (i: number, materialId: string) => {
    const mat = materials.find((m) => m.id === materialId);
    if (!mat) { updateLine(i, { material_id: null }); return; }
    updateLine(i, { material_id: mat.id, name: mat.name, unit: mat.base_unit });
  };

  const handleSave = async () => {
    if (!product.trim()) { setErr('El nombre del producto es obligatorio.'); return; }
    if (lines.length === 0) { setErr('Agrega al menos un insumo.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        company_id: companyId,
        product: product.trim(),
        code: code || null,
        group_id: groupId,
        margin: margin / 100,
        price_mode: priceMode,
        gateway_fee_pct: gatewayFee / 100,
        final_price: finalPriceOverride ? Number(finalPriceOverride) : null,
        yield_qty: recipe?.yield_qty ?? 1,
        yield_unit: recipe?.yield_unit ?? 'Und',
        notes: recipe?.notes ?? null,
        lines,
        computed_cost: result.totalCost,
        computed_price: result.finalPrice,
      };
      if (recipe) await updateRecipe(recipe.id, payload);
      else await createRecipe(payload);
      onSaved();
    } catch (e) {
      setErr((e as Error).message || 'No se pudo guardar la receta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={recipe ? 'Editar receta' : 'Nueva receta'} size="2xl">
      <div className="p-6 space-y-5">
        {err && <Alert type="error">{err}</Alert>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label="Producto final" required value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ej. Arroz Chino" />
          </div>
          <Field label="Código / Ref" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ARR-001" />
          <SelectField label="Carpeta / grupo" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value || null)}>
            <option value="">(Sin carpeta)</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </SelectField>
        </div>

        {/* Insumos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Insumos y cantidades</h4>
              <p className="text-xs text-gray-500">El costo de cada insumo se calcula solo: cantidad × costo por unidad (regla de tres desde inventario).</p>
            </div>
            <Button type="button" variant="secondary" size="xs" onClick={addLine} leftIcon={<Plus className="w-3.5 h-3.5" />}>Agregar insumo</Button>
          </div>

          {lines.length === 0 ? (
            <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center text-sm text-gray-500">
              Sin insumos. Haz clic en "Agregar insumo".
            </div>
          ) : (
            <div className="space-y-2">
              {lines.map((ln, i) => {
                const computed = result.lines[i];
                return (
                  <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex-1 min-w-[180px]">
                      <select
                        value={ln.material_id ?? ''}
                        onChange={(e) => selectMaterial(i, e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">-- Insumo del inventario --</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({formatCOP(m.unit_cost_per_base)}/{m.base_unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number" step="any" placeholder="Cant."
                      value={ln.qty}
                      onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs text-center bg-white dark:bg-gray-800"
                    />
                    <select
                      value={ln.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                      className="w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800"
                    >
                      {units.map((u) => <option key={u.id} value={u.code}>{u.code}</option>)}
                    </select>
                    <div className="w-28 text-right font-mono text-xs font-semibold text-gray-900 dark:text-white">
                      {computed && !computed.convertible
                        ? <span className="text-red-500">unidad ✗</span>
                        : formatCOP(computed?.line_cost ?? 0)}
                    </div>
                    <button type="button" onClick={() => removeLine(i)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Margen y precio */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectField label="Modo de precio" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)}>
            <option value="MARKUP">Costo + margen %</option>
            <option value="TARGET">Margen objetivo (costo/(1−m))</option>
          </SelectField>
          <Field
            label={priceMode === 'MARKUP' ? 'Margen de ganancia (%)' : 'Margen objetivo (%)'}
            type="number" value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            hint="Ej. 50 = gana 50% sobre el costo"
          />
          <Field label="Comisión medio de pago (%)" type="number" value={gatewayFee} onChange={(e) => setGatewayFee(Number(e.target.value))} hint="Opcional (Wompi, etc.)" />
        </div>

        {/* Resumen de cálculo en vivo */}
        <div className="bg-suma-50 dark:bg-suma-950 p-4 rounded-xl border border-suma-100 dark:border-suma-900 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-suma-600 dark:text-suma-400 font-semibold">COSTO TOTAL</p>
            <p className="text-2xl font-black text-suma-900 dark:text-suma-100 font-mono">{formatCOP(result.totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold">PRECIO SUGERIDO</p>
            <p className="text-2xl font-black text-gray-700 dark:text-gray-200 font-mono">{formatCOP(Math.round(result.suggestedPrice))}</p>
          </div>
          <div>
            <p className="text-xs text-green-700 dark:text-green-400 font-semibold">PRECIO FINAL</p>
            <input
              type="number"
              value={finalPriceOverride}
              onChange={(e) => setFinalPriceOverride(e.target.value)}
              placeholder={String(Math.round(result.suggestedPrice))}
              className="w-full mt-0.5 px-2 py-1 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 font-mono text-xl font-black"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Vacío = usa el sugerido</p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} leftIcon={<Save className="w-4 h-4" />}>
            {recipe ? 'Guardar cambios' : 'Crear receta'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
