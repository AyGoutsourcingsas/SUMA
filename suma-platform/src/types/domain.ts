// ============================================================
// SUMA Platform — Tipos de dominio
// ============================================================

// superadmin = perfil SUMA (acceso total a todas las empresas y módulos)
// owner/admin = jefe de la empresa cliente · user = perfil de tareas
export type RoleCode = 'superadmin' | 'owner' | 'admin' | 'user';
export type UserStatus = 'Activo' | 'Invitado' | 'Suspendido';
export type CompanyModuleStatus = 'activo' | 'en_prueba' | 'suspendido' | 'pendiente' | 'no_contratado';
export type BillingPeriod = 'mensual' | 'trimestral' | 'anual';
export type ApplicationStatus =
  | 'borrador' | 'enviada' | 'pago_pendiente' | 'pago_recibido'
  | 'en_revision' | 'requiere_correccion' | 'aprobada' | 'rechazada'
  | 'cuenta_creada' | 'activa';

export type ModuleId = 'rrhh' | 'productividad' | 'inventarios' | 'costos' | 'ventas';

// ─────────────────────────────────────────
// Entidades base
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
// Módulo Inventarios
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
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────
// Módulo Costos
// ─────────────────────────────────────────
export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  inventory_item_id?: string;
  name: string;
  qty: number;
  unit: string;
  unit_cost_per_base: number;
  // Calculados en cliente
  ingredient_cost?: number;
}

export interface Recipe {
  id: string;
  company_id: string;
  product: string;
  code?: string;
  yield_qty: number;
  yield_unit: string;
  margin: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  recipe_ingredients?: RecipeIngredient[];
  // Calculados
  total_cost?: number;
  min_sale_price?: number;
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
// Importador Excel / Mapeador de columnas
// ─────────────────────────────────────────
export interface ExcelColumnMapping {
  sku: string | null;
  name: string | null;
  base_unit: string | null;
  unit_cost_per_base: string | null;
  group_name: string | null;
  supplier: string | null;
}

export interface ExcelPreviewRow {
  [key: string]: string | number | null;
}

// ─────────────────────────────────────────
// Precios / Pricing
// ─────────────────────────────────────────
export interface ModulePricing {
  id: ModuleId;
  name: string;
  description: string;
  price_monthly: number;
  price_quarterly: number;
  price_annual: number;
  features: string[];
  icon: string;
  color: string;
}

// ─────────────────────────────────────────
// Sesión / Auth
// ─────────────────────────────────────────
export interface AppSession {
  user: CompanyUser | null;
  company: Company | null;
  modules: CompanyModule[];
  isLoading: boolean;
}

// ============================================================
// NÚCLEO ERP (migración 003) — datos maestros compartidos
// Base de los módulos Costos, Inventario y Ventas.
// ============================================================

export type UnitDimension = 'peso' | 'volumen' | 'conteo' | 'longitud';

export interface Unit {
  id: string;
  company_id: string;
  code: string;          // 'Gr', 'Kg', 'Ml', 'Und'...
  name?: string;
  dimension: UnitDimension;
  base_code: string;     // unidad base de su dimensión
  factor: number;        // cuántas unidades base = 1 de esta unidad
  created_at: string;
}

export type ItemGroupKind = 'material' | 'recipe';

/** Grupo / carpeta para organizar materiales (inventario) o recetas (costos). */
export interface ItemGroup {
  id: string;
  company_id: string;
  name: string;
  kind: ItemGroupKind;
  parent_id?: string | null;
  sort_order: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact?: string;
  phone?: string;
  created_at: string;
}

export type ParameterValueType = 'number' | 'percent' | 'text' | 'bool';

export interface CompanyParameter {
  id: string;
  company_id: string;
  key: string;
  value?: string;
  value_type: ParameterValueType;
  label?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

/** Material / insumo / empaque. Su costo por unidad base sale de las compras. */
export interface Material {
  id: string;
  company_id: string;
  code?: string;
  name: string;
  group_id?: string | null;
  base_unit: string;
  unit_cost_per_base: number;
  supplier_id?: string | null;
  units_per_purchase?: number | null;
  stock_min: number;
  is_active: boolean;
  note?: string;
  custom_fields: Record<string, unknown>;
  // Overrides de costo (migración 008)
  projected_cost?: number | null;  // precio a futuro (manual)
  frozen_cost?: number | null;     // precio congelado (anterior)
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  company_id: string;
  material_id: string;
  purchased_at: string;
  quantity: number;      // en unidad base
  total_cost: number;    // valor pagado
  unit_cost: number;     // calculado = total_cost / quantity
  supplier_id?: string | null;
  note?: string;
  affects_stock: boolean;
  voided: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  code?: string;
  name: string;
  group_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ModuleSessionMode = 'editor' | 'lector';

export interface ModuleSession {
  id: string;
  company_id: string;
  module_id: string;
  user_auth_id: string;
  mode: ModuleSessionMode;
  last_seen: string;
  created_at: string;
}
