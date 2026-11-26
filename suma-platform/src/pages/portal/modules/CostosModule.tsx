// ============================================================
// SUMA ERP — Costos / CostosModule (Contenedor principal)
// 5 pestañas: Base Madre · Depreciación · Recetas N1 · Recetas N2 · Colecciones
// ============================================================
import { useState } from 'react';
import {
  Calculator, Database, TrendingDown, Layers, Star,
  Download, Upload, TrendingUp,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useIsSuperAdmin } from '@/store/AppStore';
import BaseMadreTab from './costos/BaseMadreTab';
import DepreciacionTab from './costos/DepreciacionTab';
import RecetasN1Tab from './costos/RecetasN1Tab';
import RecetasN2Tab from './costos/RecetasN2Tab';
import ProductosVentaTab from './costos/ProductosVentaTab';
import { ExcelImporterModal } from '@/components/costos/ExcelImporterModal';

type TabId = 'base' | 'depreciacion' | 'n1' | 'n2' | 'precios';

interface TabDef {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  activeColor: string;
  description: string;
}

const TABS: TabDef[] = [
  {
    id: 'base',
    label: 'Base Madre',
    shortLabel: 'Base',
    icon: <Database className="w-4 h-4" />,
    color: 'text-suma-600',
    activeColor: 'bg-suma-600',
    description: 'Inventario inicial de insumos: materias primas, empaques y materiales que compras.',
  },
  {
    id: 'depreciacion',
    label: 'Depreciación',
    shortLabel: 'Dep.',
    icon: <TrendingDown className="w-4 h-4" />,
    color: 'text-purple-600',
    activeColor: 'bg-purple-600',
    description: 'Costo de equipos y moldes distribuido por unidad producida.',
  },
  {
    id: 'n1',
    label: 'Recetas N1',
    shortLabel: 'N1',
    icon: <Layers className="w-4 h-4" />,
    color: 'text-amber-600',
    activeColor: 'bg-amber-600',
    description: 'Subrecetas y componentes intermedios que preparas y reutilizas en N2.',
  },
  {
    id: 'n2',
    label: 'Recetas N2',
    shortLabel: 'N2',
    icon: <Star className="w-4 h-4" />,
    color: 'text-blue-600',
    activeColor: 'bg-blue-600',
    description: 'Productos finales que vendes. Usan insumos, depreciación y subrecetas N1.',
  },
  {
    id: 'precios',
    label: 'Productos en Venta',
    shortLabel: 'Precios / BI',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-emerald-600',
    activeColor: 'bg-emerald-600',
    description: 'Catálogo de venta final. Configura márgenes de ganancia y visualiza precios de venta con tabla tipo BI.',
  },
];

export default function CostosModule() {
  const isSuperAdmin = useIsSuperAdmin();
  const [activeTab, setActiveTab] = useState<TabId>('base');
  const [showExcelImporter, setShowExcelImporter] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const tab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Calculator className="w-7 h-7 text-suma-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Costos</h1>
            {isSuperAdmin && <Badge variant="purple">Super Admin</Badge>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xl">
            Gestiona tu estructura de costos en 4 capas: desde los insumos base hasta los productos finales que vendes.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open('/Plantilla_Costos_SUMA.xlsx', '_blank')}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Descargar plantilla
          </Button>
          <Button
            size="sm"
            onClick={() => setShowExcelImporter(true)}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            Subir plantilla Excel
          </Button>
        </div>
      </div>

      {/* ── Arquitectura visual ── */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex items-stretch gap-0 min-w-max rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
          {TABS.map((t, idx) => {
            const isActive = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`relative flex flex-col items-center gap-2 px-6 py-4 transition-all min-w-[140px] ${
                  isActive
                    ? 'bg-white dark:bg-gray-800 shadow-inner border-b-2 border-suma-500'
                    : 'bg-gray-50 dark:bg-gray-900 hover:bg-white dark:hover:bg-gray-800'
                }`}
              >
                {/* Número de paso */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ${
                  isActive ? t.activeColor : 'bg-gray-300 dark:bg-gray-600'
                }`}>
                  {idx + 1}
                </div>
                <div className={`${isActive ? t.color : 'text-gray-400'}`}>{t.icon}</div>
                <span className={`text-xs font-semibold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
                  {t.label}
                </span>
                {/* Flecha conectora */}
                {idx < TABS.length - 1 && (
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 text-gray-300 dark:text-gray-600">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2l8 6-8 6V2z" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Descripción pestaña activa ── */}
      <div className={`flex items-center gap-3 mb-6 p-4 rounded-xl border ${
        activeTab === 'base' ? 'bg-suma-50 border-suma-200 dark:bg-suma-950 dark:border-suma-800' :
        activeTab === 'depreciacion' ? 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800' :
        activeTab === 'n1' ? 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800' :
        'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
      }`}>
        <div className={tab.color}>{tab.icon}</div>
        <div>
          <span className={`text-sm font-semibold ${tab.color}`}>{tab.label}</span>
          <p className="text-xs text-gray-600 dark:text-gray-400">{tab.description}</p>
        </div>
      </div>

      {/* ── Contenido de la pestaña ── */}
      <div key={refreshKey}>
        {activeTab === 'base' && <BaseMadreTab />}
        {activeTab === 'depreciacion' && <DepreciacionTab />}
        {activeTab === 'n1' && <RecetasN1Tab />}
        {activeTab === 'n2' && <RecetasN2Tab />}
        {activeTab === 'precios' && <ProductosVentaTab />}
      </div>

      {/* Modal: Importador de plantilla Excel */}
      <ExcelImporterModal
        isOpen={showExcelImporter}
        onClose={() => setShowExcelImporter(false)}
        onImportSuccess={() => {
          setActiveTab('base');
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
