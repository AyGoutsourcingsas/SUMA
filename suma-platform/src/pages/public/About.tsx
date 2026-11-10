// About page stub
export default function About() {
  return (
    <div className="page-container max-w-3xl">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">Nosotros</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
        SUMA es una plataforma SaaS empresarial modular pensada para pymes en Colombia y América Latina.
        Nuestro objetivo es democratizar el acceso a herramientas de gestión empresarial de calidad,
        adaptadas a la realidad de las pequeñas y medianas empresas.
      </p>
      <p className="mt-4 text-gray-600 dark:text-gray-400 leading-relaxed">
        Con SUMA puedes contratar solo los módulos que necesitas y agregar más a medida que tu empresa crece.
        Todo en español colombiano, con moneda COP y soporte local.
      </p>
    </div>
  );
}
