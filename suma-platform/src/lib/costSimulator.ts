// ============================================================
// SUMA ERP — Simulador de costos (lógica pura, en el navegador)
// Dado un conjunto de precios hipotéticos por material, recalcula
// cada receta y la compara con su costo/precio actual. Instantáneo,
// sin tocar la base de datos.
// ============================================================
import { convertQuantity, recipeTotalCost, salePriceFromMarkup, salePriceFromTargetMargin, priceWithGatewayFee } from '@/lib/costing';
import type { Unit, Material } from '@/types/domain';
import type { RecipeRecord } from '@/services/modules/costos';

export interface SimRecipeResult {
  recipeId: string;
  product: string;
  groupId: string | null;
  // Actual (lo guardado)
  currentCost: number;
  currentPrice: number;
  // Simulado (con precios hipotéticos)
  simCost: number;
  simPrice: number;
  // Diferencias
  costDiff: number;      // simCost - currentCost
  costDiffPct: number;   // %
  priceDiff: number;     // simPrice - currentPrice
  // Margen real que quedaría si se mantiene el precio ACTUAL con el costo simulado
  marginIfKeepPrice: number;  // fracción
  belowTargetMargin: boolean; // true si cae bajo el margen objetivo de la receta
}

/**
 * Calcula el costo de una receta usando un mapa de costos por material.
 * costOverrides: material_id -> costo por unidad base a usar.
 */
function costWithOverrides(
  recipe: RecipeRecord,
  costOverrides: Map<string, number>,
  units: Unit[],
  materials: Material[],
): { cost: number; price: number } {
  const unitByCode = new Map(units.map((u) => [u.code, u]));
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const lineCosts = (recipe.recipe_ingredients ?? []).map((ln) => {
    if (ln.line_kind === 'MANUAL' || !ln.material_id) {
      return (ln as { manual_cost?: number }).manual_cost ?? 0;
    }
    const mat = materialById.get(ln.material_id);
    if (!mat) return 0;
    const cost = costOverrides.get(ln.material_id) ?? mat.unit_cost_per_base;

    const usedUnit = unitByCode.get(ln.unit);
    const baseUnit = unitByCode.get(mat.base_unit);
    if (!usedUnit || !baseUnit) return ln.qty * cost;
    const qtyBase = convertQuantity(ln.qty, usedUnit, baseUnit);
    if (qtyBase === null) return 0;
    return qtyBase * cost;
  });

  const cost = recipeTotalCost(lineCosts);
  const base = recipe.price_mode === 'TARGET'
    ? salePriceFromTargetMargin(cost, recipe.margin)
    : salePriceFromMarkup(cost, recipe.margin);
  const price = priceWithGatewayFee(base, recipe.gateway_fee_pct);
  return { cost, price };
}

/**
 * Simula el impacto de nuevos costos de materiales sobre las recetas.
 * @param simCosts  material_id -> costo hipotético por unidad base
 */
export function simulateRecipes(params: {
  recipes: RecipeRecord[];
  units: Unit[];
  materials: Material[];
  simCosts: Map<string, number>;
}): SimRecipeResult[] {
  const { recipes, units, materials, simCosts } = params;

  return recipes.map((r) => {
    const current = costWithOverrides(r, new Map(), units, materials); // sin overrides = costo actual
    const simulated = costWithOverrides(r, simCosts, units, materials);

    const currentPrice = r.final_price ?? current.price;
    const costDiff = simulated.cost - current.cost;
    const costDiffPct = current.cost > 0 ? (costDiff / current.cost) * 100 : 0;

    // Si mantengo el precio actual pero el costo sube, ¿qué margen me queda?
    const marginIfKeepPrice = currentPrice > 0 ? (currentPrice - simulated.cost) / currentPrice : 0;
    // margen objetivo de la receta (si es MARKUP, el objetivo sobre precio = m/(1+m))
    const targetMargin = r.price_mode === 'TARGET' ? r.margin : r.margin / (1 + r.margin);
    const belowTargetMargin = marginIfKeepPrice < targetMargin;

    return {
      recipeId: r.id,
      product: r.product,
      groupId: r.group_id ?? null,
      currentCost: current.cost,
      currentPrice,
      simCost: simulated.cost,
      simPrice: simulated.price,
      costDiff,
      costDiffPct,
      priceDiff: simulated.price - current.price,
      marginIfKeepPrice,
      belowTargetMargin,
    };
  });
}
