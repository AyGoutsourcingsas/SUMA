// ============================================================
// SUMA Platform — Data Provider Supabase (Costos, Inventarios, Ventas)
// ============================================================
import { supabase } from './supabase';
import type {
  InventoryItem, PurchaseItem, DepreciationItem,
  Recipe, RecipeIngredient, ProductCollection, ProductCollectionItem, Sale
} from '@/types/domain';
import { calcIngredientCost, calcMinSalePrice } from '@/config/brand';

// ─────────────────────────────────────────
// 1. INVENTARIO INICIAL / BASE MADRE
// ─────────────────────────────────────────
export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function upsertInventoryItems(
  items: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>[],
  companyId: string
): Promise<void> {
  const rows = items.map((item) => ({ ...item, company_id: companyId }));
  const { error } = await supabase
    .from('inventory_items')
    .upsert(rows, { onConflict: 'company_id,sku', ignoreDuplicates: false });
  if (error) throw error;
}

export async function createInventoryItem(
  item: Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>,
  companyId: string
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({ ...item, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<InventoryItem>
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// 2. COMPRAS / HISTORIAL
// ─────────────────────────────────────────
export async function fetchPurchases(): Promise<PurchaseItem[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .order('purchase_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPurchase(
  purchase: Omit<PurchaseItem, 'id' | 'created_at'>,
  companyId: string
): Promise<PurchaseItem> {
  const { data, error } = await supabase
    .from('purchases')
    .insert({ ...purchase, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────
// 3. DEPRECIACIÓN (Tiempo & Uso)
// ─────────────────────────────────────────
export async function fetchDepreciations(): Promise<DepreciationItem[]> {
  const { data, error } = await supabase
    .from('depreciations')
    .select('*')
    .order('asset_name');
  if (error) throw error;
  return data ?? [];
}

export async function upsertDepreciations(
  items: Omit<DepreciationItem, 'id' | 'created_at'>[],
  companyId: string
): Promise<void> {
  const rows = items.map((item) => ({ ...item, company_id: companyId }));
  const { error } = await supabase
    .from('depreciations')
    .upsert(rows);
  if (error) throw error;
}

export async function createDepreciation(
  item: Omit<DepreciationItem, 'id' | 'created_at'>,
  companyId: string
): Promise<DepreciationItem> {
  const { data, error } = await supabase
    .from('depreciations')
    .insert({ ...item, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDepreciation(
  id: string,
  updates: Partial<DepreciationItem>
): Promise<DepreciationItem> {
  const { data, error } = await supabase
    .from('depreciations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDepreciation(id: string): Promise<void> {
  const { error } = await supabase
    .from('depreciations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// 4. RECETAS MULTINIVEL (Nivel 1 y Nivel 2)
// ─────────────────────────────────────────
export async function fetchRecipes(level?: number): Promise<Recipe[]> {
  let query = supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .order('product');

  if (level !== undefined) {
    query = query.eq('level', level);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(enrichRecipe);
}

export async function fetchRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .eq('id', id)
    .single();
  if (error) return null;
  return enrichRecipe(data);
}

function enrichRecipe(recipe: Recipe): Recipe {
  const ingredients = (recipe.recipe_ingredients ?? []).map((ing: RecipeIngredient) => ({
    ...ing,
    ingredient_cost: calcIngredientCost(ing.qty, ing.unit_cost_per_base),
  }));
  const subtotal = ingredients.reduce(
    (sum: number, ing: RecipeIngredient) => sum + (ing.ingredient_cost ?? 0),
    0
  );
  const safetyMargin = subtotal * (recipe.safety_margin_pct ?? 0.10);
  const total_cost = subtotal + safetyMargin;
  const yieldQty = recipe.yield_qty || 1;
  const cost_per_yield_unit = yieldQty > 0 ? total_cost / yieldQty : total_cost;
  const cost_per_use = recipe.estimated_uses && recipe.estimated_uses > 0
    ? total_cost / recipe.estimated_uses
    : total_cost;
  const min_sale_price = calcMinSalePrice(total_cost, recipe.margin);

  return {
    ...recipe,
    recipe_ingredients: ingredients,
    total_cost,
    cost_per_yield_unit,
    cost_per_use,
    min_sale_price,
  };
}

export async function createRecipe(
  recipe: Omit<Recipe, 'id' | 'created_at' | 'updated_at' | 'recipe_ingredients' | 'total_cost' | 'min_sale_price'>,
  ingredients: Omit<RecipeIngredient, 'id' | 'recipe_id'>[],
  companyId: string
): Promise<Recipe> {
  const { data: recipeData, error: recipeError } = await supabase
    .from('recipes')
    .insert({ ...recipe, company_id: companyId })
    .select()
    .single();
  if (recipeError) throw recipeError;

  if (ingredients.length > 0) {
    const rows = ingredients.map((ing, idx) => ({
      ...ing,
      recipe_id: recipeData.id,
      order_index: idx + 1,
    }));
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(rows);
    if (ingError) throw ingError;
  }

  return (await fetchRecipe(recipeData.id)) as Recipe;
}

export async function updateRecipe(
  id: string,
  recipe: Partial<Recipe>,
  ingredients?: Omit<RecipeIngredient, 'id' | 'recipe_id'>[]
): Promise<Recipe> {
  const { error } = await supabase
    .from('recipes')
    .update(recipe)
    .eq('id', id);
  if (error) throw error;

  if (ingredients !== undefined) {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    if (ingredients.length > 0) {
      const rows = ingredients.map((ing, idx) => ({
        ...ing,
        recipe_id: id,
        order_index: idx + 1,
      }));
      await supabase.from('recipe_ingredients').insert(rows);
    }
  }

  return (await fetchRecipe(id)) as Recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// 5. PRODUCTOS / COLECCIONES Y KITS
// ─────────────────────────────────────────
export async function fetchProducts(): Promise<ProductCollection[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_items(*)')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createProduct(
  product: Omit<ProductCollection, 'id' | 'created_at' | 'updated_at' | 'items'>,
  items: Omit<ProductCollectionItem, 'id' | 'product_id'>[],
  companyId: string
): Promise<ProductCollection> {
  const { data: prodData, error: prodError } = await supabase
    .from('products')
    .insert({ ...product, company_id: companyId })
    .select()
    .single();
  if (prodError) throw prodError;

  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      ...it,
      product_id: prodData.id,
      order_index: idx + 1,
    }));
    const { error: itemsError } = await supabase
      .from('product_items')
      .insert(rows);
    if (itemsError) throw itemsError;
  }

  const { data } = await supabase
    .from('products')
    .select('*, product_items(*)')
    .eq('id', prodData.id)
    .single();

  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// 6. VENTAS
// ─────────────────────────────────────────
export async function fetchSales(filters?: { from?: string; to?: string }): Promise<Sale[]> {
  let query = supabase
    .from('sales')
    .select('*')
    .order('sold_at', { ascending: false });

  if (filters?.from) query = query.gte('sold_at', filters.from);
  if (filters?.to) query = query.lte('sold_at', filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createSale(
  sale: Omit<Sale, 'id' | 'total_revenue' | 'created_at'>,
  companyId: string
): Promise<Sale> {
  const { data, error } = await supabase
    .from('sales')
    .insert({ ...sale, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await supabase.from('sales').delete().eq('id', id);
  if (error) throw error;
}
