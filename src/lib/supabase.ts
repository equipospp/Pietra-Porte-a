import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && key)

export const supabase = createClient(url ?? 'https://falta-configurar.supabase.co', key ?? 'falta-configurar', {
  auth: { persistSession: true, autoRefreshToken: true },
})

// Cada persona entra con su nombre + PIN de 4 dígitos.
// Por dentro es un usuario de Supabase Auth con correo interno y una contraseña derivada del PIN
// (Supabase pide mínimo 6 caracteres).
export const correoInterno = (slug: string) => `${slug}@pietra.local`
export const claveDesdePin = (pin: string) => `pietra-${pin}`
