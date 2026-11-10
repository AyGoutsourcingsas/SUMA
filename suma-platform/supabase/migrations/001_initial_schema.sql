-- ============================================================
-- SUMA Platform — Migración inicial
-- ============================================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────
CREATE TYPE role_code AS ENUM ('owner', 'admin', 'user');
CREATE TYPE user_status AS ENUM ('Activo', 'Invitado', 'Suspendido');
CREATE TYPE company_module_status AS ENUM (
  'activo', 'en_prueba', 'suspendido', 'pendiente', 'no_contratado'
);
CREATE TYPE billing_period AS ENUM ('mensual', 'trimestral', 'anual');
CREATE TYPE application_status AS ENUM (
  'borrador', 'enviada', 'pago_pendiente', 'pago_recibido',
  'en_revision', 'requiere_correccion', 'aprobada', 'rechazada',
  'cuenta_creada', 'activa'
);

-- ─────────────────────────────────────────
-- TABLA: companies (tenant raíz)
-- ─────────────────────────────────────────
CREATE TABLE companies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  commercial_name    text,
  nit                text NOT NULL UNIQUE,
  city               text,
  plan               text NOT NULL DEFAULT 'Plan Modular',
  billing_cycle_label text,
  storage_used       bigint DEFAULT 0,
  users_count        int DEFAULT 0,
  created_at         timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- TABLA: company_users
-- ─────────────────────────────────────────
CREATE TABLE company_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  name        text,
  email       text,
  role        role_code DEFAULT 'user',
  role_label  text,
  status      user_status DEFAULT 'Activo',
  last_login  timestamptz,
  permissions text[] DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (auth_id),
  UNIQUE (company_id, email)
);

-- ─────────────────────────────────────────
-- TABLA: company_modules
-- ─────────────────────────────────────────
CREATE TABLE company_modules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid REFERENCES companies(id) ON DELETE CASCADE,
  module_id      text NOT NULL CHECK (module_id IN ('rrhh','productividad','contabilidad','inventarios','costos')),
  name           text,
  status         company_module_status DEFAULT 'no_contratado',
  activated_at   date,
  billing_period billing_period,
  metrics        jsonb DEFAULT '[]',
  UNIQUE (company_id, module_id)
);

-- ─────────────────────────────────────────
-- TABLA: applications
-- ─────────────────────────────────────────
CREATE TABLE applications (
  id               text PRIMARY KEY,
  company_id       uuid REFERENCES companies(id) ON DELETE SET NULL,
  submitted_at     timestamptz DEFAULT now(),
  company_name     text,
  commercial_name  text,
  nit              text,
  city             text,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  modules          text[],
  period           text,
  total_cop        bigint DEFAULT 0,
  payment_status   text,
  payment_gateway  text,
  status           application_status DEFAULT 'enviada',
  documents        jsonb DEFAULT '[]',
  history          jsonb DEFAULT '[]'
);

-- ─────────────────────────────────────────
-- MÓDULO INVENTARIOS: inventory_items
-- ─────────────────────────────────────────
CREATE TABLE inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  sku                 text,
  name                text NOT NULL,
  base_unit           text NOT NULL,
  unit_cost_per_base  numeric NOT NULL DEFAULT 0,
  group_name          text,
  supplier            text,
  stock               numeric DEFAULT 0,
  stock_min           numeric DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (company_id, sku)
);

-- ─────────────────────────────────────────
-- MÓDULO COSTOS: recipes
-- ─────────────────────────────────────────
CREATE TABLE recipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  product     text NOT NULL,
  code        text,
  yield_qty   numeric DEFAULT 1,
  yield_unit  text DEFAULT 'und',
  margin      numeric DEFAULT 0.3 CHECK (margin >= 0 AND margin < 1),
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- MÓDULO COSTOS: recipe_ingredients
-- ─────────────────────────────────────────
CREATE TABLE recipe_ingredients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id            uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  inventory_item_id    uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  qty                  numeric NOT NULL DEFAULT 0,
  unit                 text NOT NULL,
  unit_cost_per_base   numeric NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────
-- MÓDULO VENTAS: sales
-- ─────────────────────────────────────────
CREATE TABLE sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  recipe_id       uuid REFERENCES recipes(id) ON DELETE SET NULL,
  product_name    text NOT NULL,
  qty             numeric NOT NULL DEFAULT 1,
  sale_price      numeric NOT NULL DEFAULT 0,
  total_revenue   numeric GENERATED ALWAYS AS (qty * sale_price) STORED,
  total_cost      numeric DEFAULT 0,
  profit          numeric DEFAULT 0,
  margin_actual   numeric DEFAULT 0,
  channel         text,
  notes           text,
  sold_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────
-- FUNCIONES AUXILIARES (evitan recursión en RLS)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM company_users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_role_code()
RETURNS role_code
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM company_users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_company_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(current_role_code() IN ('owner', 'admin'), false);
$$;

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

-- companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_select" ON companies FOR SELECT
  USING (id = current_company_id());
CREATE POLICY "companies_update" ON companies FOR UPDATE
  USING (id = current_company_id() AND is_company_admin());

-- company_users
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_users_select" ON company_users FOR SELECT
  USING (company_id = current_company_id());
CREATE POLICY "company_users_insert" ON company_users FOR INSERT
  WITH CHECK (company_id = current_company_id() AND is_company_admin());
CREATE POLICY "company_users_update" ON company_users FOR UPDATE
  USING (company_id = current_company_id() AND is_company_admin());
CREATE POLICY "company_users_delete" ON company_users FOR DELETE
  USING (company_id = current_company_id() AND is_company_admin());

-- company_modules
ALTER TABLE company_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_modules_select" ON company_modules FOR SELECT
  USING (company_id = current_company_id());
CREATE POLICY "company_modules_update" ON company_modules FOR UPDATE
  USING (company_id = current_company_id() AND is_company_admin());

-- applications (acceso por company_id o públicamente al insertar)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applications_select" ON applications FOR SELECT
  USING (company_id = current_company_id() OR company_id IS NULL);
CREATE POLICY "applications_insert" ON applications FOR INSERT
  WITH CHECK (true);

-- inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_items_select" ON inventory_items FOR SELECT
  USING (company_id = current_company_id());
CREATE POLICY "inventory_items_insert" ON inventory_items FOR INSERT
  WITH CHECK (company_id = current_company_id() AND is_company_admin());
CREATE POLICY "inventory_items_update" ON inventory_items FOR UPDATE
  USING (company_id = current_company_id() AND is_company_admin());
CREATE POLICY "inventory_items_delete" ON inventory_items FOR DELETE
  USING (company_id = current_company_id() AND is_company_admin());

-- recipes
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes_select" ON recipes FOR SELECT
  USING (company_id = current_company_id());
CREATE POLICY "recipes_insert" ON recipes FOR INSERT
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "recipes_update" ON recipes FOR UPDATE
  USING (company_id = current_company_id());
CREATE POLICY "recipes_delete" ON recipes FOR DELETE
  USING (company_id = current_company_id() AND is_company_admin());

-- recipe_ingredients (hereda seguridad de recipe via JOIN)
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe_ingredients_select" ON recipe_ingredients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_id AND r.company_id = current_company_id()
    )
  );
CREATE POLICY "recipe_ingredients_insert" ON recipe_ingredients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_id AND r.company_id = current_company_id()
    )
  );
CREATE POLICY "recipe_ingredients_update" ON recipe_ingredients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_id AND r.company_id = current_company_id()
    )
  );
CREATE POLICY "recipe_ingredients_delete" ON recipe_ingredients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_id AND r.company_id = current_company_id()
    )
  );

-- sales
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_select" ON sales FOR SELECT
  USING (company_id = current_company_id());
CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (company_id = current_company_id());
CREATE POLICY "sales_delete" ON sales FOR DELETE
  USING (company_id = current_company_id() AND is_company_admin());

-- ─────────────────────────────────────────
-- TRIGGER: crear company_users al registrar auth.users
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO company_users (auth_id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user',
    'Activo'
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ─────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
