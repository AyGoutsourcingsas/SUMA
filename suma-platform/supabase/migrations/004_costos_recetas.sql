-- ============================================================
-- SUMA ERP — Migración 004: COSTOS (recetas conectadas al Núcleo)
-- Conecta las recetas con materials/item_groups del Núcleo (003)
-- e implementa el flujo "arroz chino": costo por regla de tres +
-- casilla de margen -> precio de venta. Idempotente.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. recipes: vincular a carpeta (item_groups) y a product,
--    guardar margen por receta y el modo de precio.
-- ─────────────────────────────────────────
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS group_id        uuid REFERENCES public.item_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  -- modo de cálculo del precio: 'MARKUP' (costo + margen%) o 'TARGET' (costo/(1-margen))
  ADD COLUMN IF NOT EXISTS price_mode      text NOT NULL DEFAULT 'MARKUP',
  -- comisión del medio de pago a absorber en el precio (ej. Wompi), fracción 0..1
  ADD COLUMN IF NOT EXISTS gateway_fee_pct numeric NOT NULL DEFAULT 0,
  -- precio final: si es null se usa el sugerido; si se escribe, manda el digitado
  ADD COLUMN IF NOT EXISTS final_price     numeric,
  -- snapshot del último costo calculado (para históricos y para Ventas)
  ADD COLUMN IF NOT EXISTS computed_cost   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS computed_price  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_version    int NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS recipes_group_idx ON public.recipes (group_id);

-- ─────────────────────────────────────────
-- 2. recipe_ingredients: vincular al material del Núcleo y guardar
--    la unidad en que se expresó la cantidad usada (para la conversión).
-- ─────────────────────────────────────────
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  -- 'MATERIAL' (insumo del inventario) | 'SUBRECETA' (otra receta) | 'MANUAL' (costo escrito)
  ADD COLUMN IF NOT EXISTS line_kind   text NOT NULL DEFAULT 'MATERIAL',
  ADD COLUMN IF NOT EXISTS sub_recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order  int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS recipe_ingredients_material_idx ON public.recipe_ingredients (material_id);

-- ─────────────────────────────────────────
-- 3. Vista: costo actual de cada material desde su última compra.
--    (método ULTIMA_COMPRA; el PROMEDIO_PONDERADO se calcula en app)
--    Facilita que la app lea el costo vigente sin recalcular.
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.material_current_cost AS
SELECT
  m.id            AS material_id,
  m.company_id,
  m.name,
  m.base_unit,
  COALESCE(
    (SELECT p.unit_cost
       FROM public.purchases p
      WHERE p.material_id = m.id AND p.voided = false
      ORDER BY p.purchased_at DESC, p.created_at DESC
      LIMIT 1),
    m.unit_cost_per_base
  ) AS current_unit_cost
FROM public.materials m;

-- ─────────────────────────────────────────
-- 4. Trigger: al registrar/actualizar una compra, refrescar el
--    costo unitario del material (método ULTIMA_COMPRA por defecto).
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_material_cost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_metodo text;
  v_new_cost numeric;
BEGIN
  SELECT value INTO v_metodo
    FROM public.company_parameters
   WHERE company_id = NEW.company_id AND key = 'costeo_metodo'
   LIMIT 1;

  IF COALESCE(v_metodo, 'ULTIMA_COMPRA') = 'ULTIMA_COMPRA' THEN
    v_new_cost := NEW.unit_cost;
  ELSE
    -- PROMEDIO_PONDERADO simple sobre compras no anuladas del material
    SELECT CASE WHEN SUM(quantity) > 0 THEN SUM(total_cost) / SUM(quantity) ELSE NEW.unit_cost END
      INTO v_new_cost
      FROM public.purchases
     WHERE material_id = NEW.material_id AND voided = false;
  END IF;

  UPDATE public.materials
     SET unit_cost_per_base = COALESCE(v_new_cost, unit_cost_per_base)
   WHERE id = NEW.material_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_refresh_cost ON public.purchases;
CREATE TRIGGER purchases_refresh_cost
  AFTER INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.refresh_material_cost();
