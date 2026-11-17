// Si falta algún archivo (por ejemplo, en un deploy hecho sin pasar por GitHub), lo baja del repositorio.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
const BASE = 'https://raw.githubusercontent.com/equipospp/Pietra-Porte-a/main/'
const ARCHIVOS = ['public/fonts/BebasNeue-Bold.otf', 'public/fonts/BebasNeue-Regular.ttf', 'public/logo-blanco.png', 'public/logo-rojo.png',
  'public/icons/apple-touch-icon.png', 'public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/icon-maskable-512.png',
  'index.html', 'tsconfig.json', 'vite.config.ts', 'vercel.json', 'public/manifest.webmanifest',
  'src/main.tsx', 'src/styles.css', 'src/components/FotoBoton.tsx', 'src/lib/fecha.ts', 'src/lib/fotos.ts', 'src/lib/supabase.ts', 'src/lib/tipos.ts',
  'src/pages/Cierre.tsx', 'src/pages/Hoy.tsx', 'src/pages/Avisos.tsx', 'src/pages/Llegar.tsx', 'src/pages/Login.tsx', 'src/pages/Panel.tsx', 'src/pages/Produccion.tsx', 'src/pages/Recepcion.tsx']
for (const a of ARCHIVOS) {
  if (existsSync(a)) continue
  try {
    const r = await fetch(BASE + a)
    if (!r.ok) throw new Error(String(r.status))
    mkdirSync(dirname(a), { recursive: true })
    writeFileSync(a, Buffer.from(await r.arrayBuffer()))
    console.log('bajado', a)
  } catch (e) { console.warn('no se pudo bajar', a, e.message) }
}
