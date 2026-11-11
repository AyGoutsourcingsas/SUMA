-- ============================================================
-- SUMA ERP — Migración 006: VENTAS (snapshot + descuento de stock)
-- Vincula ventas a recetas del nuevo esquema, guarda snapshot de
-- precio/costo y descuenta inventario por la receta (explosión
-- de 1 nivel: insumos directos). Idempotente.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. sales: agregar sede y snapshot de unidad (precio/costo del momento)
-- ─────────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS location_id        uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'confirmada', -- confirmada | anulada
  ADD COLUMN IF NOT EXISTS discount            numeric NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────
-- 2. Función: descontar inventario por la receta vendida.
--    Explosión de 1 nivel (insumos directos de la receta).
--    Crea movimientos SALIDA_VENTA por cada insumo con material.
--    Convierte la unidad de la línea a la base del material.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.discount_stock_for_sale(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale   record;
  v_line   record;
  v_loc    uuid;
  v_factor_line numeric;  -- factor de la unidad de la línea
  v_factor_base numeric;  -- factor de la unidad base del material
  v_qty_base    numeric;  -- cantidad consumida en unidad base
  v_cost        numeric;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF v_sale.recipe_id IS NULL THEN
    RETURN; -- venta sin receta: no hay nada que descontar
  END IF;

  -- sede: la de la venta o la sede por defecto
  v_loc := v_sale.location_id;
  IF v_loc IS NULL THEN
    SELECT id INTO v_loc FROM public.locations
     WHERE company_id = v_sale.company_id AND is_default = true
     ORDER BY created_at LIMIT 1;
  END IF;

  FOR v_line IN
    SELECT ri.*, m.base_unit AS mat_base_unit, m.unit_cost_per_base AS mat_cost
      FROM public.recipe_ingredients ri
      JOIN public.materials m ON m.id = ri.material_id
     WHERE ri.recipe_id = v_sale.recipe_id
       AND ri.material_id IS NOT NULL
  LOOP
    -- factor de conversión: unidad de la línea -> unidad base del material
    SELECT factor INTO v_factor_line
      FROM public.units WHERE company_id = v_sale.company_id AND code = v_line.unit LIMIT 1;
    SELECT factor INTO v_factor_base
      FROM public.units WHERE company_id = v_sale.company_id AND code = v_line.mat_base_unit LIMIT 1;

    v_factor_line := COALESCE(v_factor_line, 1);
    v_factor_base := COALESCE(v_factor_base, 1);

    -- cantidad por unidad de producto, en unidad base, × unidades vendidas
    v_qty_base := (v_line.qty * v_factor_line / NULLIF(v_factor_base, 0)) * v_sale.qty;
    v_cost := COALESCE(v_line.mat_cost, 0);

    INSERT INTO public.inventory_movements (
      company_id, location_id, material_id, movement_type, quantity,
      unit_cost, reference_type, reference_id, reason
    ) VALUES (
      v_sale.company_id, v_loc, v_line.material_id, 'SALIDA_VENTA',
      -1 * COALESCE(v_qty_base, 0), v_cost, 'sale', p_sale_id,
      'Consumo por venta'
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────
-- 3. Función: revertir el descuento al anular una venta.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revert_stock_for_sale(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mov record;
BEGIN
  FOR v_mov IN
    SELECT * FROM public.inventory_movements
     WHERE reference_type = 'sale' AND reference_id = p_sale_id
       AND movement_type = 'SALIDA_VENTA'
  LOOP
    INSERT INTO public.inventory_movements (
      company_id, location_id, material_id, movement_type, quantity,
      unit_cost, reference_type, reference_id, reason
    ) VALUES (
      v_mov.company_id, v_mov.location_id, v_mov.material_id, 'REVERSO_VENTA',
      -1 * v_mov.quantity, v_mov.unit_cost, 'sale', p_sale_id,
      'Reverso por anulación de venta'
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────
-- 4. Trigger: al crear una venta confirmada con receta, descontar stock.
--    Al cambiar su estado a 'anulada', revertir.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_stock_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmada' AND NEW.recipe_id IS NOT NULL THEN
      PERFORM public.discount_stock_for_sale(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- pasó a anulada
    IF NEW.status = 'anulada' AND OLD.status <> 'anulada' THEN
      PERFORM public.revert_stock_for_sale(NEW.id);
    -- se reactivó (de anulada a confirmada)
    ELSIF NEW.status = 'confirmada' AND OLD.status = 'anulada' AND NEW.recipe_id IS NOT NULL THEN
      PERFORM public.discount_stock_for_sale(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_stock_sync ON public.sales;
CREATE TRIGGER sales_stock_sync
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sale_stock_sync();

-- ─────────────────────────────────────────
-- 5. Vista: resumen de ventas (excluye anuladas)
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.sales_summary AS
SELECT
  company_id,
  COUNT(*)                                   AS num_ventas,
  COALESCE(SUM(qty), 0)                      AS unidades,
  COALESCE(SUM(total_revenue), 0)            AS ingresos,
  COALESCE(SUM(total_cost), 0)               AS costo_total,
  COALESCE(SUM(profit), 0)                   AS utilidad_bruta
FROM public.sales
WHERE status <> 'anulada'
GROUP BY company_id;
