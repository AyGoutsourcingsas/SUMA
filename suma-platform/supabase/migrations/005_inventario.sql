-- ============================================================
-- SUMA ERP — Migración 005: INVENTARIO (sedes + kárdex + stock)
-- Arquitectura de calidad: empresa -> sedes -> grupos -> materiales,
-- stock por movimientos (kárdex), no un número suelto.
-- Unifica sobre materials (Núcleo 003); migra inventory_items viejo.
-- Idempotente y segura ante re-ejecución.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. SEDES / BODEGAS (locations)
--    Una empresa puede tener varias sedes; el stock vive por sede.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,              -- 'Sede Principal', 'Bodega Norte'
  code        text,                        -- 'SEDE-01'
  address     text,
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS locations_company_idx ON public.locations (company_id);

-- ─────────────────────────────────────────
-- 2. KÁRDEX: movimientos de inventario
--    El stock es la SUMA de los movimientos de un material en una sede.
--    Nada se borra: las correcciones son nuevos movimientos (reversos).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id     uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  material_id     uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  moved_at        timestamptz NOT NULL DEFAULT now(),
  -- ENTRADA_COMPRA | SALIDA_VENTA | REVERSO_VENTA | AJUSTE | SALIDA_PRODUCCION | TRASLADO
  movement_type   text NOT NULL,
  quantity        numeric NOT NULL,           -- + entra, - sale (en unidad base del material)
  unit_cost       numeric NOT NULL DEFAULT 0, -- costo unitario al momento (snapshot)
  reference_type  text,                       -- 'purchase' | 'sale' | 'adjustment' | 'transfer'
  reference_id    uuid,
  reason          text,                        -- motivo (obligatorio para AJUSTE)
  created_by      uuid,                        -- auth.users.id
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_mov_company_idx  ON public.inventory_movements (company_id);
CREATE INDEX IF NOT EXISTS inv_mov_material_idx ON public.inventory_movements (material_id);
CREATE INDEX IF NOT EXISTS inv_mov_location_idx ON public.inventory_movements (location_id);
CREATE INDEX IF NOT EXISTS inv_mov_date_idx     ON public.inventory_movements (company_id, moved_at);
CREATE INDEX IF NOT EXISTS inv_mov_type_idx     ON public.inventory_movements (company_id, movement_type);

-- ─────────────────────────────────────────
-- 3. La compra genera movimiento de entrada automáticamente
--    (si afecta stock). Mantiene el kárdex sincronizado con purchases.
-- ─────────────────────────────────────────
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.purchase_to_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loc uuid;
BEGIN
  IF NEW.affects_stock = false OR NEW.voided = true THEN
    RETURN NEW;
  END IF;

  -- sede: la de la compra, o la sede por defecto de la empresa
  v_loc := NEW.location_id;
  IF v_loc IS NULL THEN
    SELECT id INTO v_loc FROM public.locations
      WHERE company_id = NEW.company_id AND is_default = true
      ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.inventory_movements (
    company_id, location_id, material_id, moved_at, movement_type,
    quantity, unit_cost, reference_type, reference_id, reason
  ) VALUES (
    NEW.company_id, v_loc, NEW.material_id, NEW.purchased_at, 'ENTRADA_COMPRA',
    NEW.quantity, NEW.unit_cost, 'purchase', NEW.id, NEW.note
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_to_movement ON public.purchases;
CREATE TRIGGER purchases_to_movement
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.purchase_to_movement();

-- ─────────────────────────────────────────
-- 4. VISTA DE STOCK: saldo actual por material y sede
--    stock = suma de movimientos; valor = stock × costo vigente.
-- ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.stock_by_location AS
SELECT
  m.company_id,
  m.id                              AS material_id,
  m.name                            AS material_name,
  m.base_unit,
  m.group_id,
  m.stock_min,
  mv.location_id,
  COALESCE(SUM(mv.quantity), 0)     AS stock,
  m.unit_cost_per_base              AS unit_cost,
  COALESCE(SUM(mv.quantity), 0) * m.unit_cost_per_base AS stock_value
FROM public.materials m
LEFT JOIN public.inventory_movements mv ON mv.material_id = m.id
GROUP BY m.company_id, m.id, m.name, m.base_unit, m.group_id, m.stock_min, mv.location_id, m.unit_cost_per_base;

-- Stock total por material (todas las sedes) + estado OK/REPONER/AGOTADO
CREATE OR REPLACE VIEW public.stock_summary AS
SELECT
  m.company_id,
  m.id            AS material_id,
  m.code,
  m.name          AS material_name,
  m.base_unit,
  m.group_id,
  m.supplier_id,
  m.stock_min,
  m.unit_cost_per_base AS unit_cost,
  COALESCE(SUM(mv.quantity), 0) AS stock,
  COALESCE(SUM(mv.quantity), 0) * m.unit_cost_per_base AS stock_value,
  CASE
    WHEN COALESCE(SUM(mv.quantity), 0) <= 0 THEN 'AGOTADO'
    WHEN COALESCE(SUM(mv.quantity), 0) < m.stock_min THEN 'REPONER'
    ELSE 'OK'
  END AS status
FROM public.materials m
LEFT JOIN public.inventory_movements mv ON mv.material_id = m.id
WHERE m.is_active = true
GROUP BY m.company_id, m.id, m.code, m.name, m.base_unit, m.group_id, m.supplier_id, m.stock_min, m.unit_cost_per_base;

-- ─────────────────────────────────────────
-- 5. RLS en tablas nuevas (su empresa O superadmin)
-- ─────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['locations','inventory_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_select" ON public.%I FOR SELECT
      USING (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_insert" ON public.%I FOR INSERT
      WITH CHECK (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_update" ON public.%I FOR UPDATE
      USING (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_delete" ON public.%I FOR DELETE
      USING (company_id = public.current_company_id() OR public.is_superadmin());$f$, t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────
-- 6. Sede por defecto para empresas que ya existen
--    (y para futuras, se crea en seed_company_defaults abajo)
-- ─────────────────────────────────────────
INSERT INTO public.locations (company_id, name, code, is_default, is_active)
SELECT c.id, 'Sede Principal', 'SEDE-01', true, true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.company_id = c.id
);

-- ─────────────────────────────────────────
-- 7. MIGRACIÓN DE DATOS: inventory_items (viejo) -> materials (núcleo)
--    Idempotente: solo copia los que aún no existen en materials.
--    Crea grupos y proveedores por nombre si no existen.
-- ─────────────────────────────────────────
DO $$
DECLARE r record; v_group uuid; v_supplier uuid; v_material uuid; v_loc uuid;
BEGIN
  -- Solo corre si la tabla vieja existe
  IF to_regclass('public.inventory_items') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM public.inventory_items LOOP
    -- ¿ya existe un material con ese nombre en esa empresa?
    SELECT id INTO v_material FROM public.materials
      WHERE company_id = r.company_id AND name = r.name LIMIT 1;
    IF v_material IS NOT NULL THEN
      CONTINUE; -- ya migrado
    END IF;

    -- grupo por nombre (si el item viejo tenía group_name)
    v_group := NULL;
    IF r.group_name IS NOT NULL AND r.group_name <> '' THEN
      SELECT id INTO v_group FROM public.item_groups
        WHERE company_id = r.company_id AND kind = 'material' AND name = r.group_name LIMIT 1;
      IF v_group IS NULL THEN
        INSERT INTO public.item_groups (company_id, name, kind)
          VALUES (r.company_id, r.group_name, 'material') RETURNING id INTO v_group;
      END IF;
    END IF;

    -- proveedor por nombre
    v_supplier := NULL;
    IF r.supplier IS NOT NULL AND r.supplier <> '' THEN
      SELECT id INTO v_supplier FROM public.suppliers
        WHERE company_id = r.company_id AND name = r.supplier LIMIT 1;
      IF v_supplier IS NULL THEN
        INSERT INTO public.suppliers (company_id, name)
          VALUES (r.company_id, r.supplier) RETURNING id INTO v_supplier;
      END IF;
    END IF;

    -- crear el material
    INSERT INTO public.materials (
      company_id, code, name, group_id, base_unit, unit_cost_per_base,
      supplier_id, stock_min, is_active
    ) VALUES (
      r.company_id, r.sku, r.name, v_group, COALESCE(r.base_unit,'Und'),
      COALESCE(r.unit_cost_per_base,0), v_supplier, COALESCE(r.stock_min,0), true
    ) RETURNING id INTO v_material;

    -- stock inicial como movimiento de AJUSTE (si traía stock)
    IF COALESCE(r.stock,0) <> 0 THEN
      SELECT id INTO v_loc FROM public.locations
        WHERE company_id = r.company_id AND is_default = true LIMIT 1;
      INSERT INTO public.inventory_movements (
        company_id, location_id, material_id, movement_type, quantity, unit_cost, reason
      ) VALUES (
        r.company_id, v_loc, v_material, 'AJUSTE', r.stock,
        COALESCE(r.unit_cost_per_base,0), 'Migración de stock inicial (inventory_items)'
      );
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────
-- 8. Ampliar seed_company_defaults: crear Sede Principal al crear empresa
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_company_defaults(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.units (company_id, code, name, dimension, base_code, factor) VALUES
    (p_company_id, 'Gr', 'Gramos',     'peso',      'Gr', 1),
    (p_company_id, 'Kg', 'Kilogramos', 'peso',      'Gr', 1000),
    (p_company_id, 'Ml', 'Mililitros', 'volumen',   'Ml', 1),
    (p_company_id, 'Lt', 'Litros',     'volumen',   'Ml', 1000),
    (p_company_id, 'Und','Unidades',   'conteo',    'Und',1),
    (p_company_id, 'Mt', 'Metros',     'longitud',  'Mt', 1)
  ON CONFLICT (company_id, code) DO NOTHING;

  INSERT INTO public.company_parameters (company_id, key, value, value_type, label, description) VALUES
    (p_company_id, 'iva_pct',            '0.19',          'percent','IVA (%)','Impuesto que se suma al costo si aplica'),
    (p_company_id, 'margen_default_pct', '0.30',          'percent','Margen de ganancia por defecto (%)','Se aplica a una receta nueva; editable por producto'),
    (p_company_id, 'costeo_metodo',      'ULTIMA_COMPRA', 'text',   'Método de costeo','ULTIMA_COMPRA o PROMEDIO_PONDERADO'),
    (p_company_id, 'comision_pago_pct',  '0',             'percent','Comisión pasarela/medio de pago (%)','Ej. Wompi; opcional en el precio de venta'),
    (p_company_id, 'moneda',             'COP',           'text',   'Moneda','Peso colombiano por defecto')
  ON CONFLICT (company_id, key) DO NOTHING;

  INSERT INTO public.locations (company_id, name, code, is_default, is_active)
  VALUES (p_company_id, 'Sede Principal', 'SEDE-01', true, true)
  ON CONFLICT (company_id, name) DO NOTHING;
END $$;
