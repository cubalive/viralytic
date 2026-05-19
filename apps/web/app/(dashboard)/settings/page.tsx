export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-black mb-8">Ajustes</h1>
      <div className="space-y-6">
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-2">Marca</h2>
          <p className="text-zinc-400 text-sm mb-4">Define tu voz, audiencia y diferenciadores. Esto alimenta al copywriter.</p>
          <button className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">Configurar marca</button>
        </section>
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-2">Voces clonadas</h2>
          <p className="text-zinc-400 text-sm mb-4">Clona tu voz en ElevenLabs (necesitas 1-3 minutos de audio limpio).</p>
          <button className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">+ Clonar voz</button>
        </section>
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-2">Cuentas TikTok</h2>
          <p className="text-zinc-400 text-sm mb-4">Conecta para auto-publicar (requiere app aprobada por TikTok).</p>
          <button className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">+ Conectar TikTok</button>
        </section>
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-2">Plan y facturación</h2>
          <p className="text-zinc-400 text-sm mb-4">Plan actual: Free (3 videos/mes).</p>
          <button className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600">Upgrade a Pro</button>
        </section>
      </div>
    </div>
  );
}
