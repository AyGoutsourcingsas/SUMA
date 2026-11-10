// ============================================================
// SUMA Platform — Provider de datos con Supabase (real)
// ============================================================
import { supabase } from './supabase';
import type { InventoryItem, Recipe, RecipeIngredient, Sale } from '@/types/domain';
import { calcIngredientCost, calcMinSalePrice } from '@/config/brand';

// ─────────────────────────────────────────
// INVENTARIOS
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
// COSTOS / RECETAS
// ─────────────────────────────────────────
export async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .order('product');
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
  const total_cost = ingredients.reduce(
    (sum: number, ing: RecipeIngredient) => sum + (ing.ingredient_cost ?? 0),
    0
  );
  const min_sale_price = calcMinSalePrice(total_cost, recipe.margin);
  return { ...recipe, recipe_ingredients: ingredients, total_cost, min_sale_price };
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
    const rows = ingredients.map((ing) => ({ ...ing, recipe_id: recipeData.id }));
    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(rows);
    if (ingError) throw ingError;
  }

  return fetchRecipe(recipeData.id) as Promise<Recipe>;
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
      const rows = ingredients.map((ing) => ({ ...ing, recipe_id: id }));
      await supabase.from('recipe_ingredients').insert(rows);
    }
  }

  return fetchRecipe(id) as Promise<Recipe>;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────
// VENTAS
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
