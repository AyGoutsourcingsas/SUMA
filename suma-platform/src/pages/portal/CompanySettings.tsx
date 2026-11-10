// ============================================================
// SUMA Platform — Company Settings
// ============================================================
import { useState } from 'react';
import { Building2, Users, Settings2, Save } from 'lucide-react';
import { Card, CardHeader, CardBody, Field, Button, Badge, Alert } from '@/components/ui';
import { useAppStore } from '@/store/AppStore';
import { MODULE_STATUS_LABELS, MODULE_STATUS_COLORS } from '@/config/brand';

export default function CompanySettings() {
  const { state } = useAppStore();
  const { company, user, modules } = state;
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Configuración</h1>

      {saved && <Alert type="success" className="mb-6">Cambios guardados correctamente.</Alert>}

      {/* Empresa */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-suma-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Datos de la empresa</h2>
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Razón social" defaultValue={company?.name ?? ''} />
            <Field label="Nombre comercial" defaultValue={company?.commercial_name ?? ''} />
            <Field label="NIT" defaultValue={company?.nit ?? ''} disabled />
            <Field label="Ciudad" defaultValue={company?.city ?? ''} />
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" leftIcon={<Save className="w-4 h-4" />}>
                Guardar cambios
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Usuario actual */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-suma-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Mi perfil</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" defaultValue={user?.name ?? ''} />
            <Field label="Correo electrónico" defaultValue={user?.email ?? ''} disabled />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
              <div className="mt-1">
                <Badge variant={user?.role === 'owner' ? 'purple' : user?.role === 'admin' ? 'blue' : 'gray'}>
                  {user?.role === 'owner' ? 'Propietario' : user?.role === 'admin' ? 'Administrador' : 'Usuario'}
                </Badge>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Módulos */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-suma-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Módulos contratados</h2>
          </div>
        </CardHeader>
        <CardBody>
          {modules.length === 0 ? (
            <p className="text-sm text-gray-500">No hay módulos registrados.</p>
          ) : (
            <div className="space-y-3">
              {modules.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{mod.name}</p>
                    <p className="text-xs text-gray-500">{mod.billing_period ?? '—'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODULE_STATUS_COLORS[mod.status]}`}>
                    {MODULE_STATUS_LABELS[mod.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
