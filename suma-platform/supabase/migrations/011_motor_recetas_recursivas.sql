-- ============================================================
-- SUMA ERP — Migración 011: Motor de recetas recursivas + depreciación
-- - Recetas con código único por empresa.
-- - Recursos depreciables (POR_USO / POR_TIEMPO).
-- - Líneas de receta pueden ser INSUMO / SUBRECETA / DEPRECIACION / MANUAL.
-- - recompute_recipe RECURSIVO: una receta usa otras recetas (cascada).
-- Idempotente.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Código único de receta por empresa
-- ─────────────────────────────────────────
-- (recipes.code ya existe desde 004; aseguramos unicidad por empresa)
DO $$ BEGIN
  ALTER TABLE public.recipes ADD CONSTRAINT recipes_company_code_unique UNIQUE (company_id, code);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────
-- 2. Recursos depreciables (herramientas, moldes)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depreciable_resources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code          text,
  name          text NOT NULL,
  method        text NOT NULL DEFAULT 'POR_USO',  -- POR_USO | POR_TIEMPO
  total_cost    numeric NOT NULL DEFAULT 0,        -- costo de compra del recurso
  uses_estimated numeric,                           -- POR_USO: nº de usos
  life_months   int,                                -- POR_TIEMPO: vida útil en meses
  units_per_month numeric,                           -- POR_TIEMPO: unidades vendidas/mes (reparto)
  note          text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (company_id, code),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS depr_company_idx ON public.depreciable_resources (company_id);

ALTER TABLE public.depreciable_resources ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE op text;
BEGIN
  FOREACH op IN ARRAY ARRAY['select','insert','update','delete'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "depr_%s" ON public.depreciable_resources;', op);
  END LOOP;
END $$;
CREATE POLICY "depr_select" ON public.depreciable_resources FOR SELECT
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "depr_insert" ON public.depreciable_resources FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "depr_update" ON public.depreciable_resources FOR UPDATE
  USING (company_id = public.current_company_id() OR public.is_superadmin());
CREATE POLICY "depr_delete" ON public.depreciable_resources FOR DELETE
  USING (company_id = public.current_company_id() OR public.is_superadmin());

DROP TRIGGER IF EXISTS depr_enforce_company ON public.depreciable_resources;
CREATE TRIGGER depr_enforce_company BEFORE INSERT ON public.depreciable_resources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_id();
DROP TRIGGER IF EXISTS depr_updated_at ON public.depreciable_resources;
CREATE TRIGGER depr_updated_at BEFORE UPDATE ON public.depreciable_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────
-- 3. recipe_ingredients: referencia a recurso depreciable
--    line_kind ahora admite: MATERIAL | SUBRECETA | DEPRECIACION | MANUAL
-- ─────────────────────────────────────────
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.depreciable_resources(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────
-- 4. Costo de un recurso depreciable por unidad de uso.
--    POR_USO   -> total_cost / uses_estimated
--    POR_TIEMPO-> (total_cost / life_months) / units_per_month
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resource_unit_cost(p_resource_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.depreciable_resources WHERE id = p_resource_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF r.method = 'POR_TIEMPO' THEN
    IF COALESCE(r.life_months,0) = 0 OR COALESCE(r.units_per_month,0) = 0 THEN RETURN 0; END IF;
    RETURN (r.total_cost / r.life_months) / r.units_per_month;
  ELSE
    IF COALESCE(r.uses_estimated,0) = 0 THEN RETURN 0; END IF;
    RETURN r.total_cost / r.uses_estimated;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 5. recompute_recipe RECURSIVO.
--    Resuelve líneas: INSUMO (costo efectivo), SUBRECETA (costo por
--    unidad de rendimiento de otra receta, con conversión), DEPRECIACION
--    (costo por uso × cantidad), MANUAL (costo escrito).
--    p_depth evita ciclos infinitos (máx 10 niveles).
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_recipe(p_recipe_id uuid, p_depth int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec record; v_line record;
  v_fl numeric; v_fb numeric; v_qty_base numeric;
  v_total numeric := 0; v_price numeric; v_eff_cost numeric;
  v_sub record; v_sub_cost_per_yield numeric;
BEGIN
  IF p_depth > 10 THEN RETURN; END IF;  -- protección anti-ciclos
  SELECT * INTO v_rec FROM public.recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR v_line IN
    SELECT ri.qty, ri.unit, ri.line_kind, ri.unit_cost_per_base AS manual_cost,
           ri.material_id, ri.sub_recipe_id, ri.resource_id,
           m.base_unit AS mat_base_unit
      FROM public.recipe_ingredients ri
      LEFT JOIN public.materials m ON m.id = ri.material_id
     WHERE ri.recipe_id = p_recipe_id
  LOOP
    IF v_line.line_kind = 'MANUAL' THEN
      v_total := v_total + COALESCE(v_line.manual_cost, 0);

    ELSIF v_line.line_kind = 'DEPRECIACION' AND v_line.resource_id IS NOT NULL THEN
      v_total := v_total + public.resource_unit_cost(v_line.resource_id) * COALESCE(v_line.qty, 1);

    ELSIF v_line.line_kind = 'SUBRECETA' AND v_line.sub_recipe_id IS NOT NULL THEN
      -- asegurar que la sub-receta esté calculada (recursión)
      PERFORM public.recompute_recipe(v_line.sub_recipe_id, p_depth + 1);
      SELECT * INTO v_sub FROM public.recipes WHERE id = v_line.sub_recipe_id;
      -- costo por unidad de rendimiento de la sub-receta
      v_sub_cost_per_yield := CASE WHEN COALESCE(v_sub.yield_qty,0) > 0
        THEN v_sub.computed_cost / v_sub.yield_qty ELSE v_sub.computed_cost END;
      -- convertir la cantidad usada (unidad de la línea) a la unidad de rendimiento de la sub-receta
      SELECT factor INTO v_fl FROM public.units WHERE company_id = v_rec.company_id AND code = v_line.unit LIMIT 1;
      SELECT factor INTO v_fb FROM public.units WHERE company_id = v_rec.company_id AND code = v_sub.yield_unit LIMIT 1;
      v_fl := COALESCE(v_fl, 1); v_fb := COALESCE(v_fb, 1);
      v_qty_base := v_line.qty * v_fl / NULLIF(v_fb, 0);
      v_total := v_total + COALESCE(v_qty_base, 0) * COALESCE(v_sub_cost_per_yield, 0);

    ELSIF v_line.material_id IS NOT NULL THEN
      -- INSUMO: costo efectivo según política
      v_eff_cost := public.material_effective_cost(v_line.material_id, NULL);
      SELECT factor INTO v_fl FROM public.units WHERE company_id = v_rec.company_id AND code = v_line.unit LIMIT 1;
      SELECT factor INTO v_fb FROM public.units WHERE company_id = v_rec.company_id AND code = v_line.mat_base_unit LIMIT 1;
      v_fl := COALESCE(v_fl, 1); v_fb := COALESCE(v_fb, 1);
      v_qty_base := v_line.qty * v_fl / NULLIF(v_fb, 0);
      v_total := v_total + COALESCE(v_qty_base, 0) * COALESCE(v_eff_cost, 0);
    END IF;
  END LOOP;

  -- margen de seguridad (si la receta lo define en notes->margin_seguridad no; usamos margin como ganancia)
  -- precio según modo
  IF v_rec.price_mode = 'TARGET' THEN
    v_price := CASE WHEN v_rec.margin < 1 THEN v_total / (1 - LEAST(0.95, GREATEST(0, v_rec.margin))) ELSE v_total END;
  ELSE
    v_price := v_total * (1 + GREATEST(0, v_rec.margin));
  END IF;
  IF COALESCE(v_rec.gateway_fee_pct, 0) > 0 THEN
    v_price := v_price / (1 - LEAST(0.95, v_rec.gateway_fee_pct));
  END IF;

  UPDATE public.recipes
     SET computed_cost = v_total,
         computed_price = COALESCE(final_price, v_price),
         cost_version = cost_version + 1
   WHERE id = p_recipe_id;
END $$;

-- ─────────────────────────────────────────
-- 6. Cuando cambia una receta, recalcular también las recetas PADRE
--    que la usan como subreceta (propagación hacia arriba).
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_parent_recipes(p_recipe_id uuid, p_depth int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent uuid;
BEGIN
  IF p_depth > 10 THEN RETURN; END IF;
  FOR v_parent IN
    SELECT DISTINCT recipe_id FROM public.recipe_ingredients
     WHERE sub_recipe_id = p_recipe_id
  LOOP
    PERFORM public.recompute_recipe(v_parent, 0);
    PERFORM public.recompute_parent_recipes(v_parent, p_depth + 1);
  END LOOP;
END $$;

-- Al recalcular por cambio de ingredientes, propagar a padres
CREATE OR REPLACE FUNCTION public.on_recipe_ingredient_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rid uuid;
BEGIN
  v_rid := COALESCE(NEW.recipe_id, OLD.recipe_id);
  PERFORM public.recompute_recipe(v_rid, 0);
  PERFORM public.recompute_parent_recipes(v_rid, 0);
  RETURN COALESCE(NEW, OLD);
END $$;

-- recompute_recipes_for_material también debe propagar a padres
CREATE OR REPLACE FUNCTION public.recompute_recipes_for_material(p_material_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r uuid;
BEGIN
  FOR v_r IN SELECT DISTINCT recipe_id FROM public.recipe_ingredients WHERE material_id = p_material_id LOOP
    PERFORM public.recompute_recipe(v_r, 0);
    PERFORM public.recompute_parent_recipes(v_r, 0);
  END LOOP;
END $$;

-- ─────────────────────────────────────────
-- 7. Recalcular todas las recetas existentes una vez.
-- ─────────────────────────────────────────
DO $$
DECLARE v_r uuid;
BEGIN
  FOR v_r IN SELECT id FROM public.recipes LOOP
    PERFORM public.recompute_recipe(v_r, 0);
  END LOOP;
END $$;
