// Services page stub
import { MODULES_CONFIG } from '@/config/brand';
import { CheckCircle } from 'lucide-react';

export default function Services() {
  return (
    <div className="page-container">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Nuestros módulos</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
          Cada módulo de SUMA está diseñado para funcionar de forma independiente o en conjunto con los demás.
        </p>
      </div>
      <div className="space-y-8">
        {MODULES_CONFIG.map((mod) => (
          <div key={mod.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{mod.fullName}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{mod.description}</p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mod.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
