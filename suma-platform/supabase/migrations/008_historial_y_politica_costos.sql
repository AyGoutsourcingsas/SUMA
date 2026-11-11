-- ============================================================
-- SUMA ERP — Migración 008: Historial de costos + política de costeo
-- - Política por empresa (parámetro) y override por sede.
-- - Costo proyectado (manual) por material para simular.
-- - Historial de cambios de costo de cada insumo (descargable).
-- - Recálculo de recetas respeta la política elegida.
-- Idempotente.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Costo proyectado (manual) por material
--    El cliente escribe el precio que proyecta (devaluación, etc.)
-- ─────────────────────────────────────────
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS projected_cost numeric,          -- costo a futuro (manual)
  ADD COLUMN IF NOT EXISTS frozen_cost    numeric;          -- costo congelado (política 'CONGELADO')

-- ─────────────────────────────────────────
-- 2. Política de costeo por SEDE (override opcional de la de empresa)
--    Valores: ULTIMA_COMPRA | PROMEDIO | CONGELADO | PROYECTADO
-- ─────────────────────────────────────────
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS cost_policy text;  -- null = hereda la de la empresa

-- Parámetro de empresa: política general (reutiliza costeo_metodo si existe).
-- Se asegura que exista la clave 'costeo_politica'.
INSERT INTO public.company_parameters (company_id, key, value, value_type, label, description)
SELECT c.id, 'costeo_politica', 'ULTIMA_COMPRA', 'text',
       'Política de costeo',
       'Cómo se costean las recetas: ULTIMA_COMPRA, PROMEDIO, CONGELADO o PROYECTADO'
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_parameters p
  WHERE p.company_id = c.id AND p.key = 'costeo_politica'
);

-- ─────────────────────────────────────────
-- 3. HISTORIAL de costos de insumos
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_cost_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_id    uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  old_cost       numeric,
  new_cost       numeric NOT NULL,
  change_kind    text NOT NULL DEFAULT 'COMPRA',  -- COMPRA | MANUAL | PROYECTADO | POLITICA
  source_type    text,                             -- 'purchase' | 'manual'...
  source_id      uuid,
  changed_by     uuid,
  note           text,
  changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mch_company_idx  ON public.material_cost_history (company_id);
CREATE INDEX IF NOT EXISTS mch_material_idx ON public.material_cost_history (material_id);
CREATE INDEX IF NOT EXISTS mch_date_idx     ON public.material_cost_history (company_id, changed_at);

ALTER TABLE public.material_cost_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mch_select" ON public.material_cost_history;
CREATE POLICY "mch_select" ON public.material_cost_history FOR SELECT
  USING (company_id = public.current_company_id() OR public.is_superadmin());
DROP POLICY IF EXISTS "mch_insert" ON public.material_cost_history;
CREATE POLICY "mch_insert" ON public.material_cost_history FOR INSERT
  WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());

-- ─────────────────────────────────────────
-- 4. Registrar en el historial cuando cambia materials.unit_cost_per_base
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_material_cost_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.unit_cost_per_base IS DISTINCT FROM OLD.unit_cost_per_base THEN
    INSERT INTO public.material_cost_history (
      company_id, material_id, old_cost, new_cost, change_kind
    ) VALUES (
      NEW.company_id, NEW.id, OLD.unit_cost_per_base, NEW.unit_cost_per_base, 'COMPRA'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS materials_log_cost ON public.materials;
CREATE TRIGGER materials_log_cost
  AFTER UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.log_material_cost_change();

-- ─────────────────────────────────────────
-- 5. Costo efectivo de un material según la política vigente.
--    Resuelve: política de la sede (si tiene) > política de empresa.
--    CONGELADO -> frozen_cost (o unit_cost_per_base si null)
--    PROYECTADO -> projected_cost (o unit_cost_per_base si null)
--    ULTIMA_COMPRA/PROMEDIO -> unit_cost_per_base (ya calculado por compras)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.material_effective_cost(
  p_material_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mat record;
  v_policy text;
BEGIN
  SELECT * INTO v_mat FROM public.materials WHERE id = p_material_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- política de la sede, si existe
  IF p_location_id IS NOT NULL THEN
    SELECT cost_policy INTO v_policy FROM public.locations WHERE id = p_location_id;
  END IF;
  -- si la sede no define, usar la de la empresa
  IF v_policy IS NULL THEN
    SELECT value INTO v_policy FROM public.company_parameters
     WHERE company_id = v_mat.company_id AND key = 'costeo_politica' LIMIT 1;
  END IF;
  v_policy := COALESCE(v_policy, 'ULTIMA_COMPRA');

  RETURN CASE v_policy
    WHEN 'CONGELADO'  THEN COALESCE(v_mat.frozen_cost, v_mat.unit_cost_per_base)
    WHEN 'PROYECTADO' THEN COALESCE(v_mat.projected_cost, v_mat.unit_cost_per_base)
    ELSE v_mat.unit_cost_per_base  -- ULTIMA_COMPRA / PROMEDIO
  END;
END $$;

-- ─────────────────────────────────────────
-- 6. recompute_recipe ahora usa el costo EFECTIVO según la política.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_recipe(p_recipe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec record; v_line record;
  v_fl numeric; v_fb numeric; v_qty_base numeric;
  v_total numeric := 0; v_price numeric; v_eff_cost numeric;
BEGIN
  SELECT * INTO v_rec FROM public.recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR v_line IN
    SELECT ri.qty, ri.unit, ri.line_kind, ri.unit_cost_per_base AS manual_cost,
           ri.material_id, m.base_unit AS mat_base_unit
      FROM public.recipe_ingredients ri
      LEFT JOIN public.materials m ON m.id = ri.material_id
     WHERE ri.recipe_id = p_recipe_id
  LOOP
    IF v_line.line_kind = 'MANUAL' OR v_line.material_id IS NULL THEN
      v_total := v_total + COALESCE(v_line.manual_cost, 0);
      CONTINUE;
    END IF;

    -- costo efectivo según política de la empresa
    v_eff_cost := public.material_effective_cost(v_line.material_id, NULL);

    SELECT factor INTO v_fl FROM public.units
      WHERE company_id = v_rec.company_id AND code = v_line.unit LIMIT 1;
    SELECT factor INTO v_fb FROM public.units
      WHERE company_id = v_rec.company_id AND code = v_line.mat_base_unit LIMIT 1;
    v_fl := COALESCE(v_fl, 1); v_fb := COALESCE(v_fb, 1);
    v_qty_base := v_line.qty * v_fl / NULLIF(v_fb, 0);
    v_total := v_total + COALESCE(v_qty_base, 0) * COALESCE(v_eff_cost, 0);
  END LOOP;

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
-- 7. Al cambiar la política de empresa o el costo proyectado/congelado,
--    recalcular todas las recetas afectadas.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_all_recipes(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r uuid;
BEGIN
  FOR v_r IN SELECT id FROM public.recipes WHERE company_id = p_company_id LOOP
    PERFORM public.recompute_recipe(v_r);
  END LOOP;
END $$;

-- cuando cambia projected_cost o frozen_cost de un material, recalcular sus recetas
CREATE OR REPLACE FUNCTION public.on_material_cost_fields_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.projected_cost IS DISTINCT FROM OLD.projected_cost
     OR NEW.frozen_cost IS DISTINCT FROM OLD.frozen_cost THEN
    PERFORM public.recompute_recipes_for_material(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS materials_cost_fields ON public.materials;
CREATE TRIGGER materials_cost_fields
  AFTER UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.on_material_cost_fields_change();

-- ─────────────────────────────────────────
-- 8. Recalcular recetas existentes una vez con la política por defecto.
-- ─────────────────────────────────────────
DO $$
DECLARE v_r uuid;
BEGIN
  FOR v_r IN SELECT id FROM public.recipes LOOP
    PERFORM public.recompute_recipe(v_r);
  END LOOP;
END $$;
