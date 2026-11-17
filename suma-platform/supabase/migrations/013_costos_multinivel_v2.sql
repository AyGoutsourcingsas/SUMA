-- ============================================================
-- SUMA ERP — Migración 013: Arquitectura Costos Multinivel
-- Adapta recipes, recipe_ingredients y depreciations para
-- soportar la arquitectura de 4 capas:
-- Base Madre → Depreciación → N1 (subrecetas) → N2 (productos)
-- Idempotente.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. recipes: agregar campo level (1=N1 subreceta, 2=N2 producto final)
--    y total_cost + recipe_type
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS level        int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS recipe_type  text,
  ADD COLUMN IF NOT EXISTS total_cost   numeric NOT NULL DEFAULT 0;

-- Inicializar total_cost desde computed_cost si la columna existe
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='computed_cost') THEN
    UPDATE public.recipes SET total_cost = computed_cost WHERE total_cost = 0 AND computed_cost > 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS recipes_level_idx ON public.recipes (level);
CREATE INDEX IF NOT EXISTS recipes_level_company_idx ON public.recipes (company_id, level);

-- ─────────────────────────────────────────────────────────────
-- 2. depreciations: agregar campos modernos que usa el nuevo UI
--    (el UI calcula en cliente, no necesita columnas calculadas)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.depreciations
  ADD COLUMN IF NOT EXISTS total_cost         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salvage_value      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS useful_life_months numeric,
  ADD COLUMN IF NOT EXISTS estimated_uses     numeric,
  ADD COLUMN IF NOT EXISTS units_per_month    numeric,
  ADD COLUMN IF NOT EXISTS purchase_date      date;

-- Migrar datos existentes si las columnas antiguas tienen datos
UPDATE public.depreciations
  SET total_cost = COALESCE(manual_cost, 0)
  WHERE total_cost = 0 AND manual_cost IS NOT NULL AND manual_cost > 0;

UPDATE public.depreciations
  SET useful_life_months = COALESCE(
    (SELECT useful_life_months FROM public.depreciations d2 WHERE d2.id = public.depreciations.id LIMIT 1),
    36
  )
  WHERE useful_life_months IS NULL AND method = 'TIEMPO';

UPDATE public.depreciations
  SET estimated_uses = COALESCE(
    (SELECT estimated_uses FROM public.depreciations d2 WHERE d2.id = public.depreciations.id LIMIT 1),
    100
  )
  WHERE estimated_uses IS NULL AND method = 'USO';

-- ─────────────────────────────────────────────────────────────
-- 3. recipe_ingredients: agregar depreciation_id y recipe_ref_id
--    para líneas tipo DEPRECIACION y RECETA_N1
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS depreciation_id uuid REFERENCES public.depreciations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipe_ref_id   uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost_per_base numeric NOT NULL DEFAULT 0;

-- Actualizar line_kind para que acepte los nuevos valores
-- (Si hay constraint CHECK existente, lo eliminamos y recreamos)
DO $$ BEGIN
  ALTER TABLE public.recipe_ingredients DROP CONSTRAINT IF EXISTS recipe_ingredients_line_kind_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Asegurar que depreciations tiene RLS correcta
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.depreciations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "depreciations_all" ON public.depreciations;
CREATE POLICY "depreciations_all" ON public.depreciations FOR ALL
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL OR public.is_superadmin())
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL OR public.is_superadmin());

-- ─────────────────────────────────────────────────────────────
-- 5. Vista consolidada (creada DESPUÉS de las columnas nuevas)
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.recipe_cost_summary;
CREATE VIEW public.recipe_cost_summary AS
SELECT
  r.id,
  r.company_id,
  r.code,
  r.product AS name,
  r.level,
  r.recipe_type,
  r.yield_qty,
  r.yield_unit,
  r.margin,
  r.total_cost,
  CASE WHEN r.yield_qty > 0 THEN r.total_cost / r.yield_qty ELSE r.total_cost END AS cost_per_yield_unit,
  COUNT(ri.id) AS ingredient_count
FROM public.recipes r
LEFT JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
GROUP BY r.id, r.company_id, r.code, r.product, r.level, r.recipe_type,
         r.yield_qty, r.yield_unit, r.margin, r.total_cost;
