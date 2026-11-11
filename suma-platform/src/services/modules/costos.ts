// ============================================================
// SUMA ERP — Servicio de datos del módulo COSTOS
// Conecta la UI con Supabase (Núcleo 003 + recetas 004).
// El cálculo vive en src/lib/costing.ts (lógica pura).
// ============================================================
import { supabase } from '@/services/supabase';
import {
  convertQuantity,
  recipeTotalCost,
  salePriceFromMarkup,
  salePriceFromTargetMargin,
  priceWithGatewayFee,
} from '@/lib/costing';
import type { ItemGroup, Material, Unit } from '@/types/domain';

// ─────────────────────────────────────────
// Tipos específicos de la UI de Costos
// ─────────────────────────────────────────
export type PriceMode = 'MARKUP' | 'TARGET';

export interface RecipeLineInput {
  id?: string;
  material_id?: string | null;
  name: string;          // nombre del insumo (libre o del material)
  qty: number;           // cantidad usada en la receta
  unit: string;          // unidad en que se expresó la cantidad (code de unit)
  line_kind?: 'MATERIAL' | 'MANUAL';
  // costo manual por línea (solo si line_kind === 'MANUAL')
  manual_cost?: number;
}

export interface RecipeRecord {
  id: string;
  company_id: string;
  product: string;
  code?: string | null;
  group_id?: string | null;
  margin: number;            // fracción 0..1
  price_mode: PriceMode;
  gateway_fee_pct: number;   // fracción 0..1
  final_price?: number | null;
  yield_qty: number;
  yield_unit: string;
  notes?: string | null;
  computed_cost: number;
  computed_price: number;
  cost_version: number;
  recipe_ingredients?: RecipeLineComputed[];
}

export interface RecipeLineComputed extends RecipeLineInput {
  line_cost: number;         // costo calculado de la línea (regla de tres)
  convertible: boolean;      // false si la unidad no es convertible al material
}

// ─────────────────────────────────────────
// Catálogos / Núcleo
// ─────────────────────────────────────────
export async function fetchUnits(): Promise<Unit[]> {
  const { data, error } = await supabase.from('units').select('*').order('code');
  if (error) throw error;
  return data ?? [];
}

export async function fetchGroups(kind: 'material' | 'recipe'): Promise<ItemGroup[]> {
  const { data, error } = await supabase
    .from('item_groups')
    .select('*')
    .eq('kind', kind)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createGroup(
  companyId: string,
  name: string,
  kind: 'material' | 'recipe',
  parentId?: string | null,
  description?: string | null,
): Promise<ItemGroup> {
  const { data, error } = await supabase
    .from('item_groups')
    .insert({ company_id: companyId, name, kind, parent_id: parentId ?? null, description: description ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('item_groups').delete().eq('id', id);
  if (error) throw error;
}

/** Materiales con su costo vigente (desde la vista material_current_cost). */
export async function fetchMaterialsWithCost(): Promise<Material[]> {
  const { data, error } = await supabase.from('materials').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────
// Cálculo del costo de una receta (arroz chino)
// ─────────────────────────────────────────
export function computeRecipe(params: {
  lines: RecipeLineInput[];
  margin: number;
  priceMode: PriceMode;
  gatewayFeePct: number;
  finalPrice?: number | null;
  units: Unit[];
  materials: Material[];
}): {
  lines: RecipeLineComputed[];
  totalCost: number;
  suggestedPrice: number;
  finalPrice: number;
} {
  const { lines, margin, priceMode, gatewayFeePct, finalPrice, units, materials } = params;
  const unitByCode = new Map(units.map((u) => [u.code, u]));
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const computedLines: RecipeLineComputed[] = lines.map((ln) => {
    if (ln.line_kind === 'MANUAL') {
      return { ...ln, line_cost: ln.manual_cost ?? 0, convertible: true };
    }
    const mat = ln.material_id ? materialById.get(ln.material_id) : undefined;
    if (!mat) return { ...ln, line_cost: 0, convertible: false };

    const usedUnit = unitByCode.get(ln.unit);
    const baseUnit = unitByCode.get(mat.base_unit);
    if (!usedUnit || !baseUnit) {
      // Sin unidades: asumimos que la cantidad ya está en la unidad base.
      return { ...ln, line_cost: ln.qty * mat.unit_cost_per_base, convertible: true };
    }
    const qtyInBase = convertQuantity(ln.qty, usedUnit, baseUnit);
    if (qtyInBase === null) {
      return { ...ln, line_cost: 0, convertible: false };
    }
    return { ...ln, line_cost: qtyInBase * mat.unit_cost_per_base, convertible: true };
  });

  const totalCost = recipeTotalCost(computedLines.map((l) => l.line_cost));

  const base =
    priceMode === 'TARGET'
      ? salePriceFromTargetMargin(totalCost, margin)
      : salePriceFromMarkup(totalCost, margin);
  const suggestedPrice = priceWithGatewayFee(base, gatewayFeePct);

  return {
    lines: computedLines,
    totalCost,
    suggestedPrice,
    finalPrice: finalPrice != null ? finalPrice : suggestedPrice,
  };
}

// ─────────────────────────────────────────
// Recetas: leer, crear, actualizar, borrar
// ─────────────────────────────────────────
export async function fetchRecipes(): Promise<RecipeRecord[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .order('product');
  if (error) throw error;
  return (data ?? []) as RecipeRecord[];
}

interface SaveRecipeInput {
  company_id: string;
  product: string;
  code?: string | null;
  group_id?: string | null;
  margin: number;
  price_mode: PriceMode;
  gateway_fee_pct: number;
  final_price?: number | null;
  yield_qty: number;
  yield_unit: string;
  notes?: string | null;
  lines: RecipeLineInput[];
  computed_cost: number;
  computed_price: number;
}

export async function createRecipe(input: SaveRecipeInput): Promise<string> {
  const { lines, ...recipe } = input;
  const { data, error } = await supabase
    .from('recipes')
    .insert({ ...recipe, cost_version: 1 })
    .select('id')
    .single();
  if (error) throw error;
  const recipeId = data.id as string;
  await replaceLines(recipeId, lines);
  return recipeId;
}

export async function updateRecipe(id: string, input: SaveRecipeInput): Promise<void> {
  const { lines, ...recipe } = input;
  const { error } = await supabase
    .from('recipes')
    .update({ ...recipe })
    .eq('id', id);
  if (error) throw error;
  await replaceLines(id, lines);
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

async function replaceLines(recipeId: string, lines: RecipeLineInput[]): Promise<void> {
  await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (lines.length === 0) return;
  const rows = lines.map((ln, i) => ({
    recipe_id: recipeId,
    material_id: ln.material_id ?? null,
    name: ln.name,
    qty: ln.qty,
    unit: ln.unit,
    unit_cost_per_base: 0, // informativo; el costo real se recalcula en vivo
    line_kind: ln.line_kind ?? 'MATERIAL',
    sort_order: i,
  }));
  const { error } = await supabase.from('recipe_ingredients').insert(rows);
  if (error) throw error;
}
