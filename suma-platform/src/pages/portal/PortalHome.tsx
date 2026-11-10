// ============================================================
// SUMA Platform — Portal Home (dashboard)
// ============================================================
import { Link } from 'react-router-dom';
import {
  ArrowRight, Users, Package, Calculator, TrendingUp,
  BookOpen, CheckSquare, AlertCircle, Plus,
} from 'lucide-react';
import { Card, StatCard, Badge } from '@/components/ui';
import { useAppStore, useIsSuperAdmin } from '@/store/AppStore';
import { MODULES_CONFIG, formatCOP, MODULE_STATUS_LABELS, MODULE_STATUS_COLORS } from '@/config/brand';
import type { ModuleId } from '@/types/domain';

const MODULE_ICONS: Record<ModuleId, React.ReactNode> = {
  rrhh: <Users className="w-5 h-5" />,
  productividad: <CheckSquare className="w-5 h-5" />,
  contabilidad: <BookOpen className="w-5 h-5" />,
  inventarios: <Package className="w-5 h-5" />,
  costos: <Calculator className="w-5 h-5" />,
  ventas: <TrendingUp className="w-5 h-5" />,
};

export default function PortalHome() {
  const { state } = useAppStore();
  const isSuperAdmin = useIsSuperAdmin();
  const { user, company, modules } = state;

  // Superadmin: todos los módulos del catálogo cuentan como "accesibles"
  // (revisión/QA). Resto: solo los activos o en prueba de su empresa.
  const activeModules = isSuperAdmin
    ? MODULES_CONFIG.map((mc) => ({
        id: mc.id,
        module_id: mc.id,
        name: mc.name,
        status: 'activo' as const,
      }))
    : modules.filter((m) => m.status === 'activo' || m.status === 'en_prueba');

  const inactiveModules = isSuperAdmin
    ? []
    : MODULES_CONFIG.filter(
        (mc) => !modules.some((m) => m.module_id === mc.id && (m.status === 'activo' || m.status === 'en_prueba'))
      );

  return (
    <div className="page-container">
      {/* Welcome */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ¡Hola, {user?.name?.split(' ')[0] ?? 'Usuario'}! 👋
          </h1>
          {isSuperAdmin && <Badge variant="purple">Superadmin SUMA</Badge>}
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {isSuperAdmin ? (
            <>Modo revisión: tienes acceso a <strong className="text-gray-700 dark:text-gray-300">todos los módulos</strong> para verificar cómo va quedando cada uno.</>
          ) : (
            <>Empresa: <strong className="text-gray-700 dark:text-gray-300">
              {company?.commercial_name ?? company?.name ?? 'Sin empresa asignada'}
            </strong></>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Módulos activos"
          value={activeModules.length}
          icon={<Package className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Usuarios"
          value={company?.users_count ?? 0}
          icon={<Users className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Plan"
          value={company?.plan ?? '—'}
          icon={<TrendingUp className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          title="Almacenamiento"
          value={company ? `${Math.round((company.storage_used / 1024 / 1024))} MB` : '0 MB'}
          icon={<AlertCircle className="w-5 h-5" />}
          color="orange"
        />
      </div>

      {/* Módulos activos */}
      {activeModules.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mis módulos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeModules.map((mod) => {
              const config = MODULES_CONFIG.find((mc) => mc.id === mod.module_id);
              return (
                <Link
                  key={mod.id}
                  to={`/portal/modulos/${mod.module_id}`}
                  className="block"
                >
                  <Card hover className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-suma-600 dark:text-suma-400">
                        {MODULE_ICONS[mod.module_id as ModuleId]}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODULE_STATUS_COLORS[mod.status]}`}>
                        {MODULE_STATUS_LABELS[mod.status]}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{mod.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {config?.description}
                    </p>
                    <div className="flex items-center gap-1 mt-3 text-suma-600 dark:text-suma-400 text-sm font-medium">
                      Abrir módulo <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Sin módulos */}
      {activeModules.length === 0 && (
        <div className="bg-suma-50 dark:bg-suma-950 border border-suma-200 dark:border-suma-800 rounded-xl p-8 text-center mb-8">
          <Package className="w-12 h-12 text-suma-400 mx-auto mb-3" />
          <h3 className="font-semibold text-suma-800 dark:text-suma-300 mb-2">Sin módulos activos</h3>
          <p className="text-sm text-suma-600 dark:text-suma-400 mb-4">
            Contrata los módulos que necesitas para comenzar a gestionar tu empresa.
          </p>
          <Link to="/precios">
            <button className="inline-flex items-center gap-2 bg-suma-600 hover:bg-suma-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />
              Contratar módulos
            </button>
          </Link>
        </div>
      )}

      {/* Módulos disponibles para contratar */}
      {inactiveModules.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Módulos disponibles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveModules.map((mod) => (
              <div key={mod.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-5">
                <div className="text-gray-400 dark:text-gray-500 mb-3">
                  {MODULE_ICONS[mod.id as ModuleId]}
                </div>
                <h3 className="font-medium text-gray-700 dark:text-gray-300">{mod.fullName}</h3>
                <p className="text-xs text-gray-500 mt-1 mb-3">{mod.description}</p>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">
                  Desde {formatCOP(mod.price_monthly)}/mes
                </p>
                <Link to={`/precios`}>
                  <button className="text-xs text-suma-600 dark:text-suma-400 hover:underline font-medium">
                    Contratar módulo →
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
