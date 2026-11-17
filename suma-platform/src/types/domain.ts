// ============================================================
// SUMA Platform — Tipos de Dominio (Multinivel & Multi-tenant)
// ============================================================

export type RoleCode = 'super_admin' | 'superadmin' | 'owner' | 'admin' | 'user';
export type UserStatus = 'Activo' | 'Invitado' | 'Suspendido';
export type CompanyModuleStatus = 'activo' | 'en_prueba' | 'suspendido' | 'pendiente' | 'no_contratado';
export type BillingPeriod = 'mensual' | 'trimestral' | 'anual';
export type ApplicationStatus =
  | 'borrador' | 'enviada' | 'pago_pendiente' | 'pago_recibido'
  | 'en_revision' | 'requiere_correccion' | 'aprobada' | 'rechazada'
  | 'cuenta_creada' | 'activa';

export type ModuleId = 'rrhh' | 'productividad' | 'contabilidad' | 'inventarios' | 'costos' | 'ventas';

// ─────────────────────────────────────────
// Entidades Base
// ─────────────────────────────────────────
export interface Company {
  id: string;
  name: string;
  commercial_name?: string;
  nit: string;
  city?: string;
  plan: string;
  billing_cycle_label?: string;
  storage_used: number;
  users_count: number;
  created_at: string;
}

export interface CompanyUser {
  id: string;
  auth_id: string;
  company_id: string;
  name: string;
  email: string;
  role: RoleCode;
  role_label?: string;
  status: UserStatus;
  last_login?: string;
  permissions: string[];
  created_at: string;
}

export interface CompanyModule {
  id: string;
  company_id: string;
  module_id: ModuleId;
  name: string;
  status: CompanyModuleStatus;
  activated_at?: string;
  billing_period?: BillingPeriod;
  metrics: Record<string, unknown>[];
}

export interface Application {
  id: string;
  company_id?: string;
  submitted_at: string;
  company_name: string;
  commercial_name?: string;
  nit: string;
  city?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  modules: string[];
  period?: string;
  total_cop: number;
  payment_status?: string;
  payment_gateway?: string;
  status: ApplicationStatus;
  documents: Record<string, unknown>[];
  history: { timestamp: string; event: string }[];
}

// ─────────────────────────────────────────
// Módulo Costos: 1. Base Madre (Insumos / Inventario Inicial)
// ─────────────────────────────────────────
export interface InventoryItem {
  id: string;
  company_id: string;
  sku?: string;
  name: string;
  base_unit: string;
  unit_cost_per_base: number;
  group_name?: string;
  supplier?: string;
  stock: number;
  stock_min: number;
  purchase_date?: string;
  total_purchased_cost?: number;
  supplier_invoice?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  company_id: string;
  item_id?: string;
  material_name: string;
  purchase_date: string;
  quantity: number;
  cost_total: number;
  cost_tax?: number;
  supplier?: string;
  invoice_ref?: string;
  notes?: string;
  created_at?: string;
}

// ─────────────────────────────────────────
// Módulo Costos: 2. Depreciación (Tiempo & Uso)
// ─────────────────────────────────────────
export type DeprecMethod = 'TIEMPO' | 'USO';
export type DeprecCategory = 'EQUIPO' | 'FIGURA' | 'MOLDE' | 'ETIQUETA' | 'CONSUMIBLE_USO' | 'OTRO';

export interface DepreciationItem {
  id: string;
  company_id: string;
  asset_name: string;
  method: DeprecMethod;
  category: DeprecCategory | string;
  material_ref?: string;
  cost_origin: string;
  quantity: number;
  manual_cost: number;
  useful_life_months: number;
  estimated_uses: number;
  monthly_units_assumption: number;
  calculated_monthly_value: number;
  calculated_cost_per_unit_sold: number;
  calculated_cost_per_use: number;
  calculated_recipe_cost: number;
  notes?: string;
  created_at?: string;
}

// ─────────────────────────────────────────
// Módulo Costos: 3. Recetas (Nivel 1 & Nivel 2)
// ─────────────────────────────────────────
export type RecipeIngredientType = 'MATERIAL' | 'DEPRECIACION' | 'RECETA' | 'SUBRECETA';

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  inventory_item_id?: string;
  source_recipe_id?: string;
  depreciation_id?: string;
  ingredient_type?: RecipeIngredientType;
  name: string;
  qty: number;
  unit: string;
  unit_cost_per_base: number;
  pct_of_line?: number;
  order_index?: number;
  order_ref?: number;
  notes?: string;
  ingredient_cost?: number; // Calculado en frontend
}

export interface Recipe {
  id: string;
  company_id: string;
  level: number; // 1 = Subreceta/Base, 2 = Pieza/Producto intermedio/final
  product: string;
  code?: string;
  recipe_type?: string;
  yield_qty: number;
  yield_unit: string;
  margin: number;
  safety_margin_pct?: number;
  estimated_uses?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  recipe_ingredients?: RecipeIngredient[];
  total_cost?: number;
  cost_per_yield_unit?: number;
  cost_per_use?: number;
  min_sale_price?: number;
  pvp_suggested?: number;
}

// ─────────────────────────────────────────
// Módulo Costos: 4. Productos Finales / Kits / Colecciones
// ─────────────────────────────────────────
export interface ProductCollectionItem {
  id: string;
  product_id: string;
  component_type: 'RECETA_TANDA' | 'RECETA_N1' | 'RECETA_N2' | 'MATERIAL' | 'SIN_COSTEAR';
  recipe_id?: string;
  inventory_item_id?: string;
  component_name: string;
  units: number;
  unit_cost: number;
  total_line_cost: number;
  grams?: number;
  order_index?: number;
  notes?: string;
}

export interface ProductCollection {
  id: string;
  company_id: string;
  code: string;
  name: string;
  product_type: string;
  collection_line?: string;
  target_margin: number;
  final_sale_price: number;
  applies_gateway: boolean;
  gateway_fee: number;
  applies_iva: boolean;
  iva_fee: number;
  subtotal_components: number;
  total_cost: number;
  suggested_pvp: number;
  profit_amount: number;
  profit_margin_pct: number;
  total_grams: number;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  items?: ProductCollectionItem[];
}

// ─────────────────────────────────────────
// Módulo Ventas
// ─────────────────────────────────────────
export interface Sale {
  id: string;
  company_id: string;
  recipe_id?: string;
  product_name: string;
  qty: number;
  sale_price: number;
  total_revenue: number;
  total_cost: number;
  profit: number;
  margin_actual: number;
  channel?: string;
  notes?: string;
  sold_at: string;
  created_at: string;
}

// ─────────────────────────────────────────
// Catálogos e Inventario Núcleo
// ─────────────────────────────────────────
export interface Unit {
  id: string;
  code: string;
  name: string;
  family?: 'Masa' | 'Volumen' | 'Longitud' | 'Unidad' | string;
  to_base_factor?: number;
  base_code?: string;
  factor?: number;
}

export interface ItemGroup {
  id: string;
  company_id: string;
  name: string;
  kind: 'material' | 'recipe';
  parent_id?: string | null;
  description?: string | null;
  sort_order?: number;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  nit?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface Material {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  group_id: string | null;
  base_unit: string;
  unit_cost_per_base: number;
  supplier_id: string | null;
  stock_min: number;
  is_active: boolean;
  note?: string | null;
  custom_fields?: Record<string, unknown>;
  projected_cost?: number;
  frozen_cost?: number;
  created_at?: string;
  updated_at?: string;
}

