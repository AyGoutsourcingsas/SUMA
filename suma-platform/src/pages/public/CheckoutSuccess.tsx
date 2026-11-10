// Checkout success page
import { CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export default function CheckoutSuccess() {
  return (
    <div className="page-container max-w-lg text-center py-20">
      <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">¡Pago exitoso!</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Recibimos tu solicitud. Nuestro equipo verificará el pago y activará tu cuenta en las próximas horas.
        Te notificaremos al correo registrado.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link to="/login">
          <Button size="lg">Ir al portal</Button>
        </Link>
        <Link to="/">
          <Button size="lg" variant="secondary">Volver al inicio</Button>
        </Link>
      </div>
    </div>
  );
}
