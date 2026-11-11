// ============================================================
// SUMA ERP — Servicio de datos del módulo VENTAS
// Lee recetas del nuevo esquema de Costos (computed_cost /
// final_price). Registra ventas con SNAPSHOT de precio y costo.
// El descuento de inventario lo hace el trigger sale_stock_sync (006).
// ============================================================
import { supabase } from '@/services/supabase';

export interface SaleRecord {
  id: string;
  company_id: string;
  recipe_id: string | null;
  product_name: string;
  qty: number;
  sale_price: number;
  total_revenue: number;
  total_cost: number;
  profit: number;
  margin_actual: number;
  channel: string | null;
  notes: string | null;
  status: 'confirmada' | 'anulada';
  discount: number;
  unit_price_snapshot: number;
  unit_cost_snapshot: number;
  sold_at: string;
  created_at: string;
}

/** Receta en forma ligera para el selector de ventas. */
export interface RecipeForSale {
  id: string;
  product: string;
  code: string | null;
  computed_cost: number;
  final_price: number | null;
  computed_price: number;
}

/** Trae recetas con su costo y precio del nuevo esquema de Costos. */
export async function fetchRecipesForSale(): Promise<RecipeForSale[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, product, code, computed_cost, final_price, computed_price')
    .order('product');
  if (error) throw error;
  return (data ?? []) as RecipeForSale[];
}

export async function fetchSales(filters?: { from?: string; to?: string; channel?: string }): Promise<SaleRecord[]> {
  let q = supabase.from('sales').select('*').order('sold_at', { ascending: false });
  if (filters?.from) q = q.gte('sold_at', filters.from);
  if (filters?.to) q = q.lte('sold_at', filters.to);
  if (filters?.channel) q = q.eq('channel', filters.channel);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return (data ?? []) as SaleRecord[];
}

export interface SaleInput {
  recipe_id?: string | null;
  product_name: string;
  qty: number;
  sale_price: number;       // precio unitario (snapshot)
  unit_cost: number;        // costo unitario (snapshot)
  discount?: number;        // descuento total sobre la línea
  channel?: string | null;
  notes?: string | null;
  location_id?: string | null;
  sold_at?: string;
}

export async function createSale(companyId: string, input: SaleInput): Promise<void> {
  const qty = input.qty;
  const revenue = input.sale_price * qty - (input.discount ?? 0);
  const totalCost = input.unit_cost * qty;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? profit / revenue : 0;

  const { error } = await supabase.from('sales').insert({
    company_id: companyId,
    recipe_id: input.recipe_id ?? null,
    product_name: input.product_name,
    qty,
    sale_price: input.sale_price,
    // total_revenue es GENERATED en la BD (qty*sale_price); guardamos los demás
    total_cost: totalCost,
    profit,
    margin_actual: margin,
    channel: input.channel ?? null,
    notes: input.notes ?? null,
    location_id: input.location_id ?? null,
    unit_price_snapshot: input.sale_price,
    unit_cost_snapshot: input.unit_cost,
    discount: input.discount ?? 0,
    status: 'confirmada',
    sold_at: input.sold_at ?? new Date().toISOString(),
  });
  if (error) throw error;
}

/** Anula una venta (no se borra): revierte stock vía trigger. */
export async function voidSale(id: string): Promise<void> {
  const { error } = await supabase.from('sales').update({ status: 'anulada' }).eq('id', id);
  if (error) throw error;
}
