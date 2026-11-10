// Contact page stub
import { useState } from 'react';
import { Button, Field } from '@/components/ui';
import { BRAND } from '@/config/brand';

export default function Contact() {
  const [sent, setSent] = useState(false);
  return (
    <div className="page-container max-w-2xl">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Contacto</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        ¿Tienes preguntas sobre SUMA? Escríbenos y te respondemos en menos de 24 horas.
      </p>
      {sent ? (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-8 text-center">
          <p className="text-2xl mb-2">✅</p>
          <h3 className="font-bold text-green-800 dark:text-green-300">¡Mensaje enviado!</h3>
          <p className="text-sm text-green-700 dark:text-green-400 mt-1">Te responderemos pronto a tu correo.</p>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" required placeholder="Tu nombre" />
            <Field label="Empresa" placeholder="Nombre de tu empresa" />
          </div>
          <Field label="Correo electrónico" type="email" required placeholder="tu@empresa.com" />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje <span className="text-red-500">*</span></label>
            <textarea required rows={5} placeholder="¿En qué te podemos ayudar?" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-suma-500 transition-colors" />
          </div>
          <Button type="submit" size="lg" className="w-full">Enviar mensaje</Button>
        </form>
      )}
      <div className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500">También puedes escribirnos a <strong>{BRAND.email}</strong></p>
      </div>
    </div>
  );
}
