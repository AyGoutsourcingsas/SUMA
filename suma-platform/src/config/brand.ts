// ============================================================
// SUMA Platform — Configuración de marca y utilidades
// ============================================================

export const BRAND = {
  name: 'SUMA',
  tagline: 'La plataforma empresarial para pymes colombianas',
  description: 'Gestiona tu empresa con módulos independientes: RRHH, Productividad, Inventarios, Costos, Ventas y más.',
  email: 'hola@sumaplataforma.co',
  phone: '+57 (1) 000-0000',
  website: 'https://sumaplataforma.co',
  colors: {
    primary: '#4f56e5',
    primaryDark: '#3538a3',
    accent: '#6272f1',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
} as const;

export const MODULES_CONFIG = [
  {
    id: 'rrhh' as const,
    name: 'RRHH',
    fullName: 'Recursos Humanos',
    description: 'Gestión de personal, nómina, contratos y ausencias.',
    icon: 'Users',
    color: 'blue',
    price_monthly: 89000,
    price_quarterly: 249000,
    price_annual: 890000,
    features: [
      'Gestión de empleados',
      'Control de asistencia',
      'Liquidación de nómina',
      'Contratos laborales',
      'Gestión de vacaciones',
    ],
  },
  {
    id: 'productividad' as const,
    name: 'Productividad',
    fullName: 'Productividad',
    description: 'Tareas, proyectos y seguimiento de rendimiento.',
    icon: 'CheckSquare',
    color: 'green',
    price_monthly: 69000,
    price_quarterly: 189000,
    price_annual: 690000,
    features: [
      'Gestión de tareas',
      'Tableros Kanban',
      'Seguimiento de proyectos',
      'Reportes de productividad',
      'Metas y OKRs',
    ],
  },
  {
    id: 'inventarios' as const,
    name: 'Inventarios',
    fullName: 'Inventarios',
    description: 'Control de stock, compras y costo por unidad base.',
    icon: 'Package',
    color: 'orange',
    price_monthly: 79000,
    price_quarterly: 219000,
    price_annual: 790000,
    features: [
      'Control de stock',
      'Gestión de proveedores',
      'Órdenes de compra',
      'Costo por unidad base',
      'Alertas de stock mínimo',
    ],
  },
  {
    id: 'costos' as const,
    name: 'Costos',
    fullName: 'Costos y Recetas',
    description: 'Fichas de producto, recetas y precio mínimo de venta.',
    icon: 'Calculator',
    color: 'red',
    price_monthly: 79000,
    price_quarterly: 219000,
    price_annual: 790000,
    features: [
      'Recetas y fichas de producto',
      'Costo total por producto',
      'Precio mínimo de venta',
      'Integración con Inventarios',
      'Importador Excel/CSV',
    ],
  },
  {
    id: 'ventas' as const,
    name: 'Ventas',
    fullName: 'Ventas',
    description: 'Registro de ventas y control de márgenes.',
    icon: 'TrendingUp',
    color: 'teal',
    price_monthly: 69000,
    price_quarterly: 189000,
    price_annual: 690000,
    features: [
      'Registro de ventas',
      'Cálculo de margen',
      'Canales de venta',
      'Descuento de stock automático',
      'Dashboard de ingresos',
    ],
  },
] as const;

// ─────────────────────────────────────────
// Utilidades de formato
// ─────────────────────────────────────────

/**
 * Formatea un número como moneda COP colombiana
 * Ej: 1500000 → "$1.500.000"
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un número como COP sin símbolo
 * Ej: 1500000 → "1.500.000"
 */
export function formatCOPPlain(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un porcentaje
 * Ej: 0.35 → "35%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Calcula precio mínimo de venta dado costo total y margen
 * precio = costo / (1 - margen)
 */
export function calcMinSalePrice(totalCost: number, margin: number): number {
  if (margin >= 1 || margin < 0) return totalCost;
  return totalCost / (1 - margin);
}

/**
 * Calcula costo de un ingrediente
 * costo = qty × unit_cost_per_base
 */
export function calcIngredientCost(qty: number, unitCostPerBase: number): number {
  return qty * unitCostPerBase;
}

export const MODULE_STATUS_LABELS: Record<string, string> = {
  activo: 'Activo',
  en_prueba: 'En prueba',
  suspendido: 'Suspendido',
  pendiente: 'Pendiente',
  no_contratado: 'No contratado',
};

export const MODULE_STATUS_COLORS: Record<string, string> = {
  activo: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  en_prueba: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  suspendido: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pendiente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  no_contratado: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export const APP_STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  pago_pendiente: 'Pago pendiente',
  pago_recibido: 'Pago recibido',
  en_revision: 'En revisión',
  requiere_correccion: 'Requiere corrección',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cuenta_creada: 'Cuenta creada',
  activa: 'Activa',
};
