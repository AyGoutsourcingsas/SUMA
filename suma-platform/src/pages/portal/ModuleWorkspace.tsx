// ============================================================
// SUMA Platform — ModuleWorkspace (router genérico de módulos)
// ============================================================
import { useParams, Navigate } from 'react-router-dom';
import { useHasModule } from '@/store/AppStore';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui';
import { Link } from 'react-router-dom';

// Importar módulos específicos
import CostosModule from './modules/CostosModule';
import InventariosModule from './modules/InventariosModule';
import VentasModule from './modules/VentasModule';

// Módulos stub (placeholder)
function StubModule({ name }: { name: string }) {
  return (
    <div className="page-container">
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-suma-50 dark:bg-suma-950 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-suma-600 font-bold text-xl">{name.charAt(0)}</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Módulo {name}</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Este módulo está en desarrollo. Pronto estará disponible.
        </p>
      </div>
    </div>
  );
}

function ModuleNotFound() {
  return (
    <div className="page-container">
      <div className="text-center py-20">
        <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Módulo no disponible</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          No tienes acceso a este módulo o no existe.
        </p>
        <Link to="/portal">
          <Button>Volver al portal</Button>
        </Link>
      </div>
    </div>
  );
}

export default function ModuleWorkspace() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const hasModule = useHasModule(moduleId ?? '');

  if (!moduleId) return <Navigate to="/portal" />;

  // Guard de acceso: superadmin pasa siempre (useHasModule => true).
  // admin/user solo si la empresa tiene el módulo activo o en prueba.
  if (!hasModule) return <ModuleNotFound />;

  switch (moduleId) {
    case 'costos':
      return <CostosModule />;
    case 'inventarios':
      return <InventariosModule />;
    case 'ventas':
      return <VentasModule />;
    case 'rrhh':
      return <StubModule name="RRHH" />;
    case 'productividad':
      return <StubModule name="Productividad" />;
    case 'contabilidad':
      return <StubModule name="Contabilidad" />;
    default:
      return <ModuleNotFound />;
  }
}
