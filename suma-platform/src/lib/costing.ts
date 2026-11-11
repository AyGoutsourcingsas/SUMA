// ============================================================
// SUMA ERP — Motor de costeo y conversión de unidades
// Lógica pura y reutilizable por Costos, Inventario y Ventas.
// No depende de React ni de Supabase: fácil de testear.
// ============================================================
import type { Unit } from '@/types/domain';

/**
 * Convierte una cantidad de una unidad a otra, siempre que compartan
 * dimensión (peso, volumen, conteo, longitud). Usa el factor a la
 * unidad base. Ej: 5 Kg -> 5000 Gr; 15 Gr -> 0.015 Kg.
 *
 * Devuelve null si las unidades no son convertibles entre sí.
 */
export function convertQuantity(
  qty: number,
  fromUnit: Unit,
  toUnit: Unit,
): number | null {
  if (fromUnit.base_code !== toUnit.base_code) return null;
  const inBase = qty * fromUnit.factor; // a unidad base
  if (toUnit.factor === 0) return null;
  return inBase / toUnit.factor;
}

/**
 * Costo por UNIDAD BASE de un material a partir de una compra.
 * Ej: compra de 5 Kg (= 5000 Gr base) por $20.000 -> $4 por Gr.
 *
 * @param totalCost  valor pagado por la compra
 * @param quantityInBase  cantidad comprada expresada en unidad base
 */
export function costPerBaseUnit(totalCost: number, quantityInBase: number): number {
  if (quantityInBase <= 0) return 0;
  return totalCost / quantityInBase;
}

/**
 * Costo de un ingrediente dentro de una receta (regla de tres).
 * Ej: arroz a $4/Gr, receta usa 15 Gr -> $60.
 *
 * @param qtyUsed  cantidad usada en la receta (en la unidad indicada)
 * @param usedUnit unidad en la que se expresó la cantidad usada
 * @param material { base_unit, unit_cost_per_base } y las unidades de la empresa
 */
export function ingredientCost(params: {
  qtyUsed: number;
  usedUnit: Unit;
  materialBaseUnit: Unit;
  costPerBase: number;
}): number {
  const { qtyUsed, usedUnit, materialBaseUnit, costPerBase } = params;
  const qtyInBase = convertQuantity(qtyUsed, usedUnit, materialBaseUnit);
  if (qtyInBase === null) {
    // Unidades incompatibles: no se puede costear esta línea.
    return NaN;
  }
  return qtyInBase * costPerBase;
}

/** Suma de costos de todas las líneas de una receta (costo total a costo). */
export function recipeTotalCost(lineCosts: number[]): number {
  return lineCosts.reduce((acc, c) => acc + (Number.isFinite(c) ? c : 0), 0);
}

/**
 * Precio de venta a partir del costo y un margen de ganancia sobre el COSTO.
 * El usuario escribe el margen (ej. 30 => 0.30) y el precio = costo * (1 + margen).
 * Este es el modelo que pidió el usuario ("costo + 30%").
 *
 * @param totalCost costo total del producto
 * @param marginPct margen como fracción (0.30 = 30%)
 */
export function salePriceFromMarkup(totalCost: number, marginPct: number): number {
  return totalCost * (1 + Math.max(0, marginPct));
}

/**
 * Variante: precio por MARGEN OBJETIVO sobre el precio (estilo MELTÉ):
 * precio = costo / (1 - margen). Se ofrece como opción configurable.
 */
export function salePriceFromTargetMargin(totalCost: number, marginPct: number): number {
  const m = Math.min(0.95, Math.max(0, marginPct));
  return m < 1 ? totalCost / (1 - m) : totalCost;
}

/**
 * Ajusta un precio para absorber la comisión del medio de pago.
 * Ej: si la pasarela cobra 3%, para recibir `netPrice` neto se cobra
 * netPrice / (1 - 0.03). Devuelve el precio con comisión incluida.
 */
export function priceWithGatewayFee(netPrice: number, feePct: number): number {
  const f = Math.min(0.95, Math.max(0, feePct));
  return f > 0 ? netPrice / (1 - f) : netPrice;
}

/** Formato de porcentaje legible: 0.3 -> "30%". */
export function formatMargin(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}
