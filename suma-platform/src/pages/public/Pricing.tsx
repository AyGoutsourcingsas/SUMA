// ============================================================
// SUMA Platform — Pricing page
// ============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { MODULES_CONFIG, formatCOP } from '@/config/brand';

type Period = 'mensual' | 'trimestral' | 'anual';

export default function Pricing() {
  const [period, setPeriod] = useState<Period>('mensual');
  const [selected, setSelected] = useState<string[]>([]);

  const getPrice = (mod: (typeof MODULES_CONFIG)[number]) => {
    if (period === 'mensual') return mod.price_monthly;
    if (period === 'trimestral') return Math.round(mod.price_quarterly / 3);
    return Math.round(mod.price_annual / 12);
  };

  const toggleModule = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const totalMonthly = selected.reduce((sum, id) => {
    const mod = MODULES_CONFIG.find((m) => m.id === id);
    return sum + (mod ? getPrice(mod) : 0);
  }, 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Precios simples y transparentes
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto mb-8">
          Paga solo por los módulos que usas. Sin costos ocultos, sin contratos
          de largo plazo.
        </p>

        {/* Period toggle */}
        <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {(['mensual', 'trimestral', 'anual'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
              {p === 'anual' && (
                <span className="ml-1.5 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">
                  -20%
                </span>
              )}
              {p === 'trimestral' && (
                <span className="ml-1.5 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full">
                  -6%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {MODULES_CONFIG.map((mod) => {
          const isSelected = selected.includes(mod.id);
          return (
            <div
              key={mod.id}
              onClick={() => toggleModule(mod.id)}
              className={`bg-white dark:bg-gray-800 rounded-xl border-2 p-6 cursor-pointer transition-all shadow-sm hover:shadow-md ${
                isSelected
                  ? 'border-suma-500 dark:border-suma-500 ring-2 ring-suma-200 dark:ring-suma-900'
                  : 'border-gray-200 dark:border-gray-700 hover:border-suma-300'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">{mod.fullName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{mod.description}</p>
                </div>
                {isSelected && <Badge variant="blue">Seleccionado</Badge>}
              </div>

              <div className="mb-5">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatCOP(getPrice(mod))}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">/mes</span>
                {period !== 'mensual' && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    Cobrado{' '}
                    {period === 'trimestral'
                      ? `${formatCOP(mod.price_quarterly)} c/trimestre`
                      : `${formatCOP(mod.price_annual)} c/año`}
                  </p>
                )}
              </div>

              <ul className="space-y-2">
                {mod.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Resumen */}
      {selected.length > 0 && (
        <div className="sticky bottom-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl p-6 max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selected.length} módulo{selected.length > 1 ? 's' : ''} seleccionado{selected.length > 1 ? 's' : ''}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCOP(totalMonthly)}<span className="text-sm font-normal text-gray-500">/mes</span>
              </p>
            </div>
            <Link
              to={`/checkout?modulos=${selected.join(',')}&periodo=${period}`}
            >
              <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Continuar
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
