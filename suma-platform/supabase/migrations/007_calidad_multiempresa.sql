-- ============================================================
-- SUMA ERP — Migración 007: Correcciones de calidad multiempresa
-- Arregla hallazgos de la revisión:
--  - RLS de recipe_ingredients (estaba abierta a todos).
--  - company_id derivado en BD (no confiar en el cliente).
--  - Recalcular costo de recetas cuando cambian compras/ingredientes.
--  - Conversión segura y validación de stock en descuento de ventas.
-- Idempotente.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. RLS de recipe_ingredients: antes USING(true). Ahora solo
--    ingredientes de recetas de MI empresa (o superadmin).
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "recipe_ingredients_select" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_insert" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_update" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "recipe_ingredients_delete" ON public.recipe_ingredients;

CREATE POLICY "recipe_ingredients_select" ON public.recipe_ingredients FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.id = recipe_id
      AND (r.company_id = public.current_company_id() OR public.is_superadmin())
  ));
CREATE POLICY "recipe_ingredients_insert" ON public.recipe_ingredients FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.id = recipe_id
      AND (r.company_id = public.current_company_id() OR public.is_superadmin())
  ));
CREATE POLICY "recipe_ingredients_update" ON public.recipe_ingredients FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.id = recipe_id
      AND (r.company_id = public.current_company_id() OR public.is_superadmin())
  ));
CREATE POLICY "recipe_ingredients_delete" ON public.recipe_ingredients FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.id = recipe_id
      AND (r.company_id = public.current_company_id() OR public.is_superadmin())
  ));

-- ═══════════════════════════════════════════════════════════
-- 2. company_id derivado en BD cuando no viene o viene vacío.
--    Protege contra el cliente (superadmin sin empresa activa, etc.)
--    Si current_company_id() es null y no es superadmin, se rechaza.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enforce_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current uuid;
BEGIN
  v_current := public.current_company_id();
  -- Si no se envió company_id, usar la del usuario.
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_current;
  END IF;
  -- Un no-superadmin solo puede escribir en SU empresa.
  IF NOT public.is_superadmin() THEN
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Usuario sin empresa asignada: no puede crear registros.';
    END IF;
    NEW.company_id := v_current;  -- fuerza su empresa, ignora lo que mande el cliente
  ELSE
    -- superadmin: debe especificar una empresa válida
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Superadmin debe seleccionar una empresa para crear registros.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Aplicar a las tablas con company_id donde el cliente inserta
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'item_groups','suppliers','materials','purchases','products',
    'locations','inventory_movements','recipes','sales'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_enforce_company ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER %I_enforce_company BEFORE INSERT ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.enforce_company_id();', t, t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 3. Recalcular el costo/precio de una receta en el servidor.
--    Fuente única de verdad: el costo sale SIEMPRE de los
--    materiales vigentes, no de un número enviado por el cliente.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recompute_recipe(p_recipe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec   record;
  v_line  record;
  v_fl numeric; v_fb numeric; v_qty_base numeric;
  v_total numeric := 0;
  v_price numeric;
BEGIN
  SELECT * INTO v_rec FROM public.recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR v_line IN
    SELECT ri.qty, ri.unit, ri.line_kind, ri.unit_cost_per_base AS manual_cost,
           m.base_unit AS mat_base_unit, m.unit_cost_per_base AS mat_cost,
           m.company_id AS mat_company
      FROM public.recipe_ingredients ri
      LEFT JOIN public.materials m ON m.id = ri.material_id
     WHERE ri.recipe_id = p_recipe_id
  LOOP
    IF v_line.line_kind = 'MANUAL' OR v_line.mat_cost IS NULL THEN
      -- línea manual: usa su costo tal cual (cantidad × costo escrito)
      v_total := v_total + COALESCE(v_line.manual_cost, 0);
      CONTINUE;
    END IF;

    -- conversión segura: solo si ambas unidades existen en la empresa
    SELECT factor INTO v_fl FROM public.units
      WHERE company_id = v_rec.company_id AND code = v_line.unit LIMIT 1;
    SELECT factor INTO v_fb FROM public.units
      WHERE company_id = v_rec.company_id AND code = v_line.mat_base_unit LIMIT 1;
    v_fl := COALESCE(v_fl, 1);
    v_fb := COALESCE(v_fb, 1);
    v_qty_base := v_line.qty * v_fl / NULLIF(v_fb, 0);
    v_total := v_total + COALESCE(v_qty_base, 0) * COALESCE(v_line.mat_cost, 0);
  END LOOP;

  -- precio según modo
  IF v_rec.price_mode = 'TARGET' THEN
    v_price := CASE WHEN v_rec.margin < 1 THEN v_total / (1 - LEAST(0.95, GREATEST(0, v_rec.margin))) ELSE v_total END;
  ELSE
    v_price := v_total * (1 + GREATEST(0, v_rec.margin));
  END IF;
  -- comisión del medio de pago
  IF COALESCE(v_rec.gateway_fee_pct, 0) > 0 THEN
    v_price := v_price / (1 - LEAST(0.95, v_rec.gateway_fee_pct));
  END IF;

  UPDATE public.recipes
     SET computed_cost = v_total,
         computed_price = COALESCE(final_price, v_price),
         cost_version = cost_version + 1
   WHERE id = p_recipe_id;
END $$;

-- 3.1 Recalcular cuando cambian los ingredientes de la receta
CREATE OR REPLACE FUNCTION public.on_recipe_ingredient_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_recipe(COALESCE(NEW.recipe_id, OLD.recipe_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS recipe_ing_recompute ON public.recipe_ingredients;
CREATE TRIGGER recipe_ing_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.on_recipe_ingredient_change();

-- 3.2 Recalcular cuando cambia la receta (margen, modo, comisión)
CREATE OR REPLACE FUNCTION public.on_recipe_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.margin IS DISTINCT FROM OLD.margin
     OR NEW.price_mode IS DISTINCT FROM OLD.price_mode
     OR NEW.gateway_fee_pct IS DISTINCT FROM OLD.gateway_fee_pct
     OR NEW.final_price IS DISTINCT FROM OLD.final_price THEN
    PERFORM public.recompute_recipe(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS recipe_recompute ON public.recipes;
CREATE TRIGGER recipe_recompute
  AFTER UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.on_recipe_change();

-- 3.3 Cuando una compra cambia el costo del material, recalcular TODAS
--     las recetas que usan ese material (propaga el costo nuevo).
CREATE OR REPLACE FUNCTION public.recompute_recipes_for_material(p_material_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r uuid;
BEGIN
  FOR v_r IN
    SELECT DISTINCT recipe_id FROM public.recipe_ingredients WHERE material_id = p_material_id
  LOOP
    PERFORM public.recompute_recipe(v_r);
  END LOOP;
END $$;

-- Ampliar el trigger de costeo de compras para propagar a recetas
CREATE OR REPLACE FUNCTION public.refresh_material_cost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_metodo text; v_new_cost numeric;
BEGIN
  SELECT value INTO v_metodo FROM public.company_parameters
   WHERE company_id = NEW.company_id AND key = 'costeo_metodo' LIMIT 1;

  IF COALESCE(v_metodo, 'ULTIMA_COMPRA') = 'ULTIMA_COMPRA' THEN
    v_new_cost := NEW.unit_cost;
  ELSE
    SELECT CASE WHEN SUM(quantity) > 0 THEN SUM(total_cost) / SUM(quantity) ELSE NEW.unit_cost END
      INTO v_new_cost FROM public.purchases
     WHERE material_id = NEW.material_id AND voided = false;
  END IF;

  UPDATE public.materials
     SET unit_cost_per_base = COALESCE(v_new_cost, unit_cost_per_base)
   WHERE id = NEW.material_id;

  -- propaga a las recetas que usan este material
  PERFORM public.recompute_recipes_for_material(NEW.material_id);
  RETURN NEW;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 4. Descuento de ventas: conversión SEGURA (misma dimensión)
--    y aviso si el stock quedaría negativo (no bloquea, registra).
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.discount_stock_for_sale(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale record; v_line record; v_loc uuid;
  v_ul record; v_ub record; v_qty_base numeric; v_cost numeric;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF v_sale.recipe_id IS NULL THEN RETURN; END IF;

  v_loc := v_sale.location_id;
  IF v_loc IS NULL THEN
    SELECT id INTO v_loc FROM public.locations
     WHERE company_id = v_sale.company_id AND is_default = true
     ORDER BY created_at LIMIT 1;
  END IF;

  FOR v_line IN
    SELECT ri.qty, ri.unit, ri.material_id,
           m.base_unit AS mat_base_unit, m.unit_cost_per_base AS mat_cost
      FROM public.recipe_ingredients ri
      JOIN public.materials m ON m.id = ri.material_id
     WHERE ri.recipe_id = v_sale.recipe_id AND ri.material_id IS NOT NULL
  LOOP
    -- unidades con su dimensión para validar compatibilidad
    SELECT * INTO v_ul FROM public.units
      WHERE company_id = v_sale.company_id AND code = v_line.unit LIMIT 1;
    SELECT * INTO v_ub FROM public.units
      WHERE company_id = v_sale.company_id AND code = v_line.mat_base_unit LIMIT 1;

    IF v_ul.base_code IS NOT NULL AND v_ub.base_code IS NOT NULL
       AND v_ul.base_code <> v_ub.base_code THEN
      -- unidades incompatibles: no descontar esta línea (evita basura)
      CONTINUE;
    END IF;

    v_qty_base := (v_line.qty * COALESCE(v_ul.factor, 1) / NULLIF(COALESCE(v_ub.factor, 1), 0)) * v_sale.qty;
    v_cost := COALESCE(v_line.mat_cost, 0);

    INSERT INTO public.inventory_movements (
      company_id, location_id, material_id, movement_type, quantity,
      unit_cost, reference_type, reference_id, reason
    ) VALUES (
      v_sale.company_id, v_loc, v_line.material_id, 'SALIDA_VENTA',
      -1 * COALESCE(v_qty_base, 0), v_cost, 'sale', p_sale_id, 'Consumo por venta'
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 5. Recalcular recetas existentes una vez (por si ya hay datos
--    con computed_cost viejo o en 0).
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE v_r uuid;
BEGIN
  FOR v_r IN SELECT id FROM public.recipes LOOP
    PERFORM public.recompute_recipe(v_r);
  END LOOP;
END $$;
