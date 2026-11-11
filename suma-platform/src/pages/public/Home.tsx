// ============================================================
// SUMA Platform — Home (página principal)
// ============================================================
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, Users, Package, Calculator,
  CheckSquare, TrendingUp, Shield, Zap, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { MODULES_CONFIG, formatCOP } from '@/config/brand';

const FEATURES = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Multi-empresa con RLS',
    description: 'Cada empresa ve únicamente sus propios datos. Aislamiento total garantizado por Row Level Security.',
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: 'Módulos independientes',
    description: 'Contrata solo los módulos que necesitas y agrégalos cuando tu empresa crezca.',
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: 'Hecho para Colombia',
    description: 'Moneda COP, NIT, régimen tributario colombiano y soporte en español colombiano.',
  },
];

const MODULE_ICONS_MAP: Record<string, React.ReactNode> = {
  rrhh: <Users className="w-6 h-6" />,
  productividad: <CheckSquare className="w-6 h-6" />,
  inventarios: <Package className="w-6 h-6" />,
  costos: <Calculator className="w-6 h-6" />,
  ventas: <TrendingUp className="w-6 h-6" />,
};

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400',
};

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="hero-gradient text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            SaaS empresarial modular para pymes colombianas
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Gestiona tu empresa<br />con <span className="text-yellow-300">SUMA</span>
          </h1>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Plataforma modular todo-en-uno. Contrata solo lo que necesitas:
            RRHH, Productividad, Inventarios, Costos y Ventas. Desde{' '}
            <strong className="text-white">{formatCOP(69000)}/mes</strong> por módulo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/precios">
              <Button size="lg" className="bg-white text-suma-700 hover:bg-blue-50 shadow-lg">
                Ver planes y precios
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/servicios">
              <Button size="lg" variant="ghost" className="text-white hover:bg-white/20 border border-white/40">
                Conocer módulos
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Una plataforma, todas tus áreas
            </h2>
            <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              SUMA integra todos los módulos de tu empresa en un solo lugar, con datos compartidos y en tiempo real.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-12 h-12 bg-suma-50 dark:bg-suma-950 rounded-xl flex items-center justify-center text-suma-600 dark:text-suma-400 mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Módulos grid */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Módulos disponibles</h2>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              Activa los que necesitas, desactiva los que no. Total flexibilidad.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULES_CONFIG.map((mod) => (
              <div
                key={mod.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-suma-400 hover:shadow-md transition-all shadow-sm"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${COLOR_MAP[mod.color]}`}>
                  {MODULE_ICONS_MAP[mod.id]}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{mod.fullName}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{mod.description}</p>
                <ul className="space-y-1.5 mb-4">
                  {mod.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="text-suma-600 dark:text-suma-400 font-semibold text-sm">
                  Desde {formatCOP(mod.price_monthly)}/mes
                </p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link to="/precios">
              <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Ver todos los precios
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-suma-600 py-20 px-4 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">¿Listo para digitalizar tu pyme?</h2>
          <p className="text-blue-100 mb-8">
            Empieza hoy con el módulo que más necesitas. Sin contratos largos, sin costos ocultos.
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/precios">
              <Button size="lg" className="bg-white text-suma-700 hover:bg-blue-50">
                Contratar ahora
              </Button>
            </Link>
            <Link to="/contacto">
              <Button size="lg" variant="ghost" className="text-white hover:bg-white/20 border border-white/40">
                Hablar con un asesor
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
