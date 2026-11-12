// Crea (o actualiza) el usuario de cada persona con su PIN de 4 dígitos.
// No necesita instalar nada: usa la API de Supabase directamente.
//
// Uso (en la carpeta del proyecto):
//   1. Copiar scripts/pines.ejemplo.json como scripts/pines.json y poner los PIN.
//   2. En .env.local tener VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//   3. node --env-file=.env.local scripts/crear-usuarios.mjs
//
// Para cambiar un PIN: editar pines.json y volver a correrlo.
// pines.json y la service role key NUNCA se suben a GitHub (están en .gitignore).

import { readFileSync } from 'node:fs'

const URL_SB = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !KEY) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const pines = JSON.parse(readFileSync(new URL('./pines.json', import.meta.url), 'utf8'))
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function api(path, opts = {}) {
  const r = await fetch(`${URL_SB}${path}`, { ...opts, headers: { ...H, ...(opts.headers ?? {}) } })
  const txt = await r.text()
  const data = txt ? JSON.parse(txt) : null
  if (!r.ok) throw new Error(`${r.status} ${path}: ${txt}`)
  return data
}

const existentes = (await api('/auth/v1/admin/users?per_page=200')).users ?? []

for (const [slug, pin] of Object.entries(pines)) {
  if (!/^\d{4}$/.test(String(pin))) {
    console.error(`✗ ${slug}: el PIN tiene que ser de 4 números`)
    continue
  }
  const email = `${slug}@pietra.local`
  const password = `pietra-${pin}`
  const persona = (await api(`/rest/v1/personas?slug=eq.${slug}&select=id,nombre`))[0]
  if (!persona) {
    console.error(`✗ ${slug}: no existe en la tabla personas`)
    continue
  }
  let user = existentes.find((u) => u.email === email)
  if (user) {
    await api(`/auth/v1/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password }) })
  } else {
    user = await api('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })
  }
  await api(`/rest/v1/personas?slug=eq.${slug}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ auth_id: user.id }),
  })
  console.log(`✓ ${persona.nombre} listo`)
}
