// ============================================================
// SUMA Platform — Módulo Costos (Fichas Técnicas & Recetas)
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  Calculator, Plus, Search, Edit2, Trash2, Upload,
  Eye, Save, RefreshCw, FileText, TrendingUp, Package
} from 'lucide-react';
import {
  Button, Card, Field,
  Modal, Badge, EmptyState, Alert, StatCard, Spinner
} from '@/components/ui';
import { useAppStore, useCanEdit, useIsSuperAdmin } from '@/store/AppStore';
import { formatCOP, formatPercent, calcMinSalePrice, calcIngredientCost } from '@/config/brand';
import {
  fetchRecipes, createRecipe, updateRecipe, deleteRecipe,
  fetchInventoryItems
} from '@/services/supabaseDataProvider';
import { MOCK_RECIPES, MOCK_INVENTORY_ITEMS } from '@/data/mocks';
import { ExcelImporterModal } from '@/components/costos/ExcelImporterModal';
import type { Recipe, InventoryItem } from '@/types/domain';

interface IngredientRow {
  inventory_item_id?: string;
  name: string;
  qty: number;
  unit: string;
  unit_cost_per_base: number;
}

export default function CostosModule() {
  const { state } = useAppStore();
  const canEdit = useCanEdit();      // superadmin/admin/owner pueden crear/editar/borrar/importar
  const isSuperAdmin = useIsSuperAdmin();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  // Modales
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showImporterModal, setShowImporterModal] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deletingRecipe, setDeletingRecipe] = useState<Recipe | null>(null);

  // Formulario de Receta
  const [formProduct, setFormProduct] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formYieldQty, setFormYieldQty] = useState<number>(1);
  const [formYieldUnit, setFormYieldUnit] = useState('Und');
  const [formMargin, setFormMargin] = useState<number>(0.35); // 35% de margen por defecto
  const [formNotes, setFormNotes] = useState('');
  const [formIngredients, setFormIngredients] = useState<IngredientRow[]>([]);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recs, items] = await Promise.all([
        fetchRecipes(),
        fetchInventoryItems(),
      ]);

      if (recs.length === 0 && !state.company?.id) {
        setRecipes(MOCK_RECIPES);
        setInventoryItems(MOCK_INVENTORY_ITEMS);
        setIsDemo(true);
      } else {
        setRecipes(recs);
        setInventoryItems(items);
        setIsDemo(false);
      }
    } catch {
      setRecipes(MOCK_RECIPES);
      setInventoryItems(MOCK_INVENTORY_ITEMS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNewRecipeModal = () => {
    setEditingRecipe(null);
    setFormProduct('');
    setFormCode('');
    setFormYieldQty(1);
    setFormYieldUnit('Und');
    setFormMargin(0.35);
    setFormNotes('');
    setFormIngredients([]);
    setFormError(null);
    setShowRecipeModal(true);
  };

  const openEditRecipeModal = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setFormProduct(recipe.product);
    setFormCode(recipe.code || '');
    setFormYieldQty(recipe.yield_qty || 1);
    setFormYieldUnit(recipe.yield_unit || 'Und');
    setFormMargin(recipe.margin ?? 0.35);
    setFormNotes(recipe.notes || '');
    setFormIngredients(
      (recipe.recipe_ingredients || []).map((ing) => ({
        inventory_item_id: ing.inventory_item_id,
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        unit_cost_per_base: ing.unit_cost_per_base,
      }))
    );
    setFormError(null);
    setShowRecipeModal(true);
  };

  const handleAddIngredient = () => {
    setFormIngredients([
      ...formIngredients,
      { name: '', qty: 1, unit: 'Und', unit_cost_per_base: 0 },
    ]);
  };

  const handleRemoveIngredient = (index: number) => {
    setFormIngredients(formIngredients.filter((_, i) => i !== index));
  };

  const handleSelectInventoryItem = (index: number, itemId: string) => {
    const item = inventoryItems.find((i) => i.id === itemId);
    if (!item) return;

    const updated = [...formIngredients];
    updated[index] = {
      ...updated[index],
      inventory_item_id: item.id,
      name: item.name,
      unit: item.base_unit,
      unit_cost_per_base: item.unit_cost_per_base,
    };
    setFormIngredients(updated);
  };

  const handleUpdateIngredient = (index: number, field: keyof IngredientRow, value: any) => {
    const updated = [...formIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setFormIngredients(updated);
  };

  // Cálculos reactivos en el formulario
  const currentTotalCost = formIngredients.reduce(
    (acc, ing) => acc + calcIngredientCost(ing.qty, ing.unit_cost_per_base),
    0
  );
  const currentMinPrice = calcMinSalePrice(currentTotalCost, formMargin);

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProduct.trim()) {
      setFormError('El nombre del producto es obligatorio.');
      return;
    }
    if (formIngredients.length === 0) {
      setFormError('Debes agregar al menos un ingrediente/insumo.');
      return;
    }

    setSavingRecipe(true);
    setFormError(null);

    try {
      const companyId = state.company?.id || 'demo';
      if (editingRecipe) {
        await updateRecipe(
          editingRecipe.id,
          {
            product: formProduct,
            code: formCode || undefined,
            yield_qty: formYieldQty,
            yield_unit: formYieldUnit,
            margin: formMargin,
            notes: formNotes || undefined,
          },
          formIngredients
        );
      } else {
        await createRecipe(
          {
            company_id: companyId,
            product: formProduct,
            code: formCode || undefined,
            yield_qty: formYieldQty,
            yield_unit: formYieldUnit,
            margin: formMargin,
            notes: formNotes || undefined,
          },
          formIngredients,
          companyId
        );
      }
      setShowRecipeModal(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar la receta.');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!deletingRecipe) return;
    try {
      await deleteRecipe(deletingRecipe.id);
      setDeletingRecipe(null);
      loadData();
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  const filteredRecipes = recipes.filter(
    (r) =>
      r.product.toLowerCase().includes(search.toLowerCase()) ||
      (r.code || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Calculator className="w-6 h-6 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Costos & Recetas</h1>
            {isSuperAdmin && <Badge variant="purple">Revisión SUMA</Badge>}
            {isDemo && <Badge variant="yellow">Modo demo</Badge>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Estandariza fichas técnicas, calcula el costo exacto por insumo y define tu precio mínimo de venta según tu margen deseado.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowImporterModal(true)}
              leftIcon={<Upload className="w-4 h-4" />}
            >
              Importar Insumos (Excel/CSV)
            </Button>
            <Button
              size="sm"
              onClick={openNewRecipeModal}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Nueva Receta
            </Button>
          </div>
        ) : (
          <Badge variant="gray">Solo lectura — tu perfil ejecuta tareas</Badge>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Fichas / Recetas"
          value={recipes.length}
          subtitle="Productos costeados"
          icon={<FileText className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Insumos Disponibles"
          value={inventoryItems.length}
          subtitle="Listos para recetas"
          icon={<Package className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Margen Promedio"
          value={
            recipes.length > 0
              ? formatPercent(
                  recipes.reduce((acc, r) => acc + (r.margin || 0), 0) / recipes.length
                )
              : '0%'
          }
          subtitle="Meta de rentabilidad"
          icon={<TrendingUp className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Barra de búsqueda */}
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por producto o código..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500"
          />
        </div>
        <Button variant="secondary" onClick={loadData} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Actualizar
        </Button>
      </div>

      {/* Tabla de Recetas */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : filteredRecipes.length === 0 ? (
          <EmptyState
            icon={<Calculator className="w-12 h-12" />}
            title="Sin fichas técnicas o recetas"
            description={
              canEdit
                ? 'Empieza creando la ficha técnica de un producto o importa tus insumos desde tu Excel.'
                : 'Aún no hay recetas registradas. Tu perfil puede consultarlas cuando el administrador las cree.'
            }
            action={
              canEdit ? (
                <div className="flex gap-2">
                  <Button onClick={() => setShowImporterModal(true)} variant="secondary" leftIcon={<Upload className="w-4 h-4" />}>
                    Importar Excel
                  </Button>
                  <Button onClick={openNewRecipeModal} leftIcon={<Plus className="w-4 h-4" />}>
                    Crear primera receta
                  </Button>
                </div>
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
                  <th>Rendimiento</th>
                  <th>Insumos</th>
                  <th>Costo Total</th>
                  <th>Margen</th>
                  <th>PVP Mínimo Sugerido</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipes.map((r) => {
                  const ingCount = r.recipe_ingredients?.length || 0;
                  return (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-gray-500">{r.code || '—'}</td>
                      <td className="font-semibold text-gray-900 dark:text-white">
                        {r.product}
                      </td>
                      <td>
                        {r.yield_qty} {r.yield_unit}
                      </td>
                      <td>
                        <Badge variant="gray">{ingCount} insumos</Badge>
                      </td>
                      <td className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCOP(r.total_cost || 0)}
                      </td>
                      <td>
                        <Badge variant="blue">{formatPercent(r.margin || 0)}</Badge>
                      </td>
                      <td className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                        {formatCOP(r.min_sale_price || 0)}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            title="Ver Ficha Técnica"
                            onClick={() => setViewingRecipe(r)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                title="Editar Receta"
                                onClick={() => openEditRecipeModal(r)}
                                className="p-1.5 text-gray-400 hover:text-suma-600 hover:bg-suma-50 dark:hover:bg-suma-950 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                title="Eliminar Receta"
                                onClick={() => setDeletingRecipe(r)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Ficha Técnica (Detalle) */}
      <Modal
        isOpen={!!viewingRecipe}
        onClose={() => setViewingRecipe(null)}
        title={viewingRecipe?.product || 'Ficha Técnica'}
        size="2xl"
      >
        {viewingRecipe && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
              <div>
                <p className="text-xs text-gray-500">Rendimiento</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  {viewingRecipe.yield_qty} {viewingRecipe.yield_unit}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Costo Total</p>
                <p className="font-bold text-gray-900 dark:text-white">
                  {formatCOP(viewingRecipe.total_cost || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Margen Esperado</p>
                <p className="font-bold text-suma-600 dark:text-suma-400">
                  {formatPercent(viewingRecipe.margin || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">PVP Mínimo Sugerido</p>
                <p className="font-bold text-green-600 dark:text-green-400">
                  {formatCOP(viewingRecipe.min_sale_price || 0)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Desglose de Insumos y Materias Primas
              </h4>
              <table className="suma-table">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Cantidad</th>
                    <th>Costo Base</th>
                    <th>Costo Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingRecipe.recipe_ingredients || []).map((ing, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-gray-900 dark:text-white">{ing.name}</td>
                      <td>
                        {ing.qty} {ing.unit}
                      </td>
                      <td className="font-mono text-xs text-gray-500">
                        {formatCOP(ing.unit_cost_per_base)}/{ing.unit}
                      </td>
                      <td className="font-mono text-sm font-semibold">
                        {formatCOP(calcIngredientCost(ing.qty, ing.unit_cost_per_base))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {viewingRecipe.notes && (
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 mb-1">Notas del producto:</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{viewingRecipe.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setViewingRecipe(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Crear / Editar Receta */}
      <Modal
        isOpen={showRecipeModal}
        onClose={() => setShowRecipeModal(false)}
        title={editingRecipe ? 'Editar Receta / Ficha' : 'Nueva Receta de Costos'}
        size="2xl"
      >
        <form onSubmit={handleSaveRecipe} className="p-6 space-y-6">
          {formError && <Alert type="error">{formError}</Alert>}

          {/* Información General */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field
                label="Nombre del Producto Final"
                required
                value={formProduct}
                onChange={(e) => setFormProduct(e.target.value)}
                placeholder="Ej. Vela Soya Lavanda, Kit Ohana, etc."
              />
            </div>
            <div>
              <Field
                label="Código / Ref"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="PROD-001"
              />
            </div>
            <div>
              <Field
                label="Rendimiento (Cant.)"
                type="number"
                value={formYieldQty}
                onChange={(e) => setFormYieldQty(parseFloat(e.target.value) || 1)}
              />
            </div>
            <div>
              <Field
                label="Unidad de Rendimiento"
                value={formYieldUnit}
                onChange={(e) => setFormYieldUnit(e.target.value)}
                placeholder="Und, Gr, Ml..."
              />
            </div>
            <div>
              <Field
                label="Margen de Ganancia (0 - 0.95)"
                type="number"
                step="0.01"
                min="0"
                max="0.95"
                value={formMargin}
                onChange={(e) => setFormMargin(parseFloat(e.target.value) || 0)}
                hint={`Ej: 0.35 representa el 35%`}
              />
            </div>
          </div>

          {/* Lista de Insumos */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Insumos & Cantidades Usadas
                </h4>
                <p className="text-xs text-gray-500">
                  El costo se calcula por regla de tres: Cantidad × Costo Unidad Base
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleAddIngredient}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Agregar Insumo
              </Button>
            </div>

            {formIngredients.length === 0 ? (
              <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center text-sm text-gray-500">
                No has agregado insumos a la receta. Haz clic en "Agregar Insumo".
              </div>
            ) : (
              <div className="space-y-3">
                {formIngredients.map((ing, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <select
                        value={ing.inventory_item_id || ''}
                        onChange={(e) => handleSelectInventoryItem(idx, e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">-- Seleccionar de inventario --</option>
                        {inventoryItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({formatCOP(item.unit_cost_per_base)}/{item.base_unit})
                          </option>
                        ))}
                      </select>
                      {!ing.inventory_item_id && (
                        <input
                          type="text"
                          placeholder="O escribe nombre libre..."
                          value={ing.name}
                          onChange={(e) => handleUpdateIngredient(idx, 'name', e.target.value)}
                          className="w-full mt-1 px-2 py-1 rounded border border-gray-200 text-xs"
                        />
                      )}
                    </div>

                    <div className="w-20">
                      <input
                        type="number"
                        step="any"
                        placeholder="Cant."
                        value={ing.qty}
                        onChange={(e) =>
                          handleUpdateIngredient(idx, 'qty', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs text-center bg-white dark:bg-gray-800"
                      />
                    </div>

                    <div className="w-16">
                      <input
                        type="text"
                        placeholder="Unidad"
                        value={ing.unit}
                        onChange={(e) => handleUpdateIngredient(idx, 'unit', e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-xs text-center bg-white dark:bg-gray-800"
                      />
                    </div>

                    <div className="w-28 text-right font-mono text-xs">
                      <span className="text-gray-500 block text-[10px]">Costo Base</span>
                      <input
                        type="number"
                        step="any"
                        value={ing.unit_cost_per_base}
                        onChange={(e) =>
                          handleUpdateIngredient(
                            idx,
                            'unit_cost_per_base',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-1 py-1 rounded border border-gray-300 dark:border-gray-700 text-xs text-right bg-white dark:bg-gray-800"
                      />
                    </div>

                    <div className="w-28 text-right font-mono text-xs font-semibold text-gray-900 dark:text-white">
                      <span className="text-gray-500 block text-[10px]">Subtotal</span>
                      {formatCOP(calcIngredientCost(ing.qty, ing.unit_cost_per_base))}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen de Costo y PVP */}
          <div className="bg-suma-50 dark:bg-suma-950 p-4 rounded-xl border border-suma-100 dark:border-suma-900 flex justify-between items-center">
            <div>
              <p className="text-xs text-suma-600 dark:text-suma-400 font-semibold">COSTO TOTAL</p>
              <p className="text-2xl font-black text-suma-900 dark:text-suma-100 font-mono">
                {formatCOP(currentTotalCost)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-700 dark:text-green-400 font-semibold">
                PRECIO MÍNIMO VENTA ({formatPercent(formMargin)} MARGEN)
              </p>
              <p className="text-2xl font-black text-green-600 dark:text-green-400 font-mono">
                {formatCOP(currentMinPrice)}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowRecipeModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={savingRecipe} leftIcon={<Save className="w-4 h-4" />}>
              {editingRecipe ? 'Guardar Cambios' : 'Crear Receta'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Eliminar */}
      <Modal
        isOpen={!!deletingRecipe}
        onClose={() => setDeletingRecipe(null)}
        title="Eliminar Receta"
        size="sm"
      >
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            ¿Eliminar la receta de <strong>{deletingRecipe?.product}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeletingRecipe(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDeleteRecipe} leftIcon={<Trash2 className="w-4 h-4" />}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Importador Excel */}
      <ExcelImporterModal
        isOpen={showImporterModal}
        onClose={() => setShowImporterModal(false)}
        onImportSuccess={(count) => {
          alert(`¡Se importaron ${count} insumos exitosamente a SUMA!`);
          loadData();
        }}
      />
    </div>
  );
}
