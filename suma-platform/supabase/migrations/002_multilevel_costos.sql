-- ============================================================
-- SUMA Platform — Migración 002: Arquitectura Multinivel Costos
-- ============================================================

-- 1. Ampliar inventory_items
ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS purchase_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS total_purchased_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_invoice text,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2. Tabla de Compras / Historial de Precios
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  material_name text NOT NULL,
  purchase_date date DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL DEFAULT 1,
  cost_total numeric NOT NULL DEFAULT 0,
  cost_tax numeric DEFAULT 0,
  supplier text,
  invoice_ref text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases_all" ON public.purchases;
CREATE POLICY "purchases_all" ON public.purchases FOR ALL
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL)
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL);

-- 3. Tabla de Depreciaciones (Método TIEMPO y Método USO)
CREATE TABLE IF NOT EXISTS public.depreciations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  asset_name text NOT NULL,
  method text NOT NULL DEFAULT 'TIEMPO' CHECK (method IN ('TIEMPO', 'USO')),
  category text DEFAULT 'EQUIPO',
  material_ref text,
  cost_origin text DEFAULT 'MANUAL',
  quantity numeric DEFAULT 1,
  manual_cost numeric DEFAULT 0,
  useful_life_months numeric DEFAULT 36,
  estimated_uses numeric DEFAULT 100,
  monthly_units_assumption numeric DEFAULT 70,
  calculated_monthly_value numeric DEFAULT 0,
  calculated_cost_per_unit_sold numeric DEFAULT 0,
  calculated_cost_per_use numeric DEFAULT 0,
  calculated_recipe_cost numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.depreciations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "depreciations_all" ON public.depreciations;
CREATE POLICY "depreciations_all" ON public.depreciations FOR ALL
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL)
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL);

-- 4. Ampliar tabla recipes con soporte Multinivel (Nivel 1, Nivel 2, Nivel 3, Nivel 4)
ALTER TABLE public.recipes 
  ADD COLUMN IF NOT EXISTS level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recipe_type text DEFAULT 'PIEZA',
  ADD COLUMN IF NOT EXISTS safety_margin_pct numeric DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS estimated_uses numeric,
  ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_yield_unit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_use numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pvp_suggested numeric DEFAULT 0;

-- 5. Ampliar tabla recipe_ingredients para admitir Depreciación y Subrecetas
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS ingredient_type text DEFAULT 'MATERIAL',
  ADD COLUMN IF NOT EXISTS source_recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depreciation_id uuid REFERENCES public.depreciations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pct_of_line numeric,
  ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS order_ref integer,
  ADD COLUMN IF NOT EXISTS notes text;

-- 6. Tabla de Productos Finales / Kits / Colecciones
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  product_type text DEFAULT 'PRODUCTO',
  collection_line text,
  target_margin numeric DEFAULT 0.50,
  final_sale_price numeric DEFAULT 0,
  applies_gateway boolean DEFAULT true,
  gateway_fee numeric DEFAULT 0,
  applies_iva boolean DEFAULT false,
  iva_fee numeric DEFAULT 0,
  subtotal_components numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  suggested_pvp numeric DEFAULT 0,
  profit_amount numeric DEFAULT 0,
  profit_margin_pct numeric DEFAULT 0,
  total_grams numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, code)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all" ON public.products;
CREATE POLICY "products_all" ON public.products FOR ALL
  USING (company_id = public.current_company_id() OR public.current_company_id() IS NULL)
  WITH CHECK (company_id = public.current_company_id() OR public.current_company_id() IS NULL);

-- 7. Tabla de Líneas / Componentes de Producto
CREATE TABLE IF NOT EXISTS public.product_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  component_type text DEFAULT 'RECETA_TANDA',
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  component_name text NOT NULL,
  units numeric DEFAULT 1,
  unit_cost numeric DEFAULT 0,
  total_line_cost numeric DEFAULT 0,
  grams numeric DEFAULT 0,
  order_index integer DEFAULT 1,
  notes text
);

ALTER TABLE public.product_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_items_all" ON public.product_items;
CREATE POLICY "product_items_all" ON public.product_items FOR ALL
  USING (true)
  WITH CHECK (true);
