import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// ---------------------------------------------------------------
// Guardado en el teléfono + cola de envíos pendientes.
// Todo lo que se carga queda primero en el teléfono (localStorage)
// y se sube solo cuando hay señal. Si el teléfono se bloquea, se
// cierra la app o no hay internet, no se pierde nada.
// ---------------------------------------------------------------

export function leerLocal<T>(clave: string, porDefecto: T): T {
  try {
    const t = localStorage.getItem(clave)
    return t ? (JSON.parse(t) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

export function escribirLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin espacio o bloqueado: seguimos igual */
  }
}

// Lee de Supabase y guarda copia; si no hay señal, devuelve la última copia.
export async function conCache<T>(clave: string, consulta: () => PromiseLike<{ data: unknown; error: any }>): Promise<{ data: T | null; deCache: boolean; error: string | null }> {
  try {
    const { data, error } = await consulta()
    if (error) throw error
    escribirLocal(`pietra:cache:${clave}`, data)
    return { data: data as T, deCache: false, error: null }
  } catch (e: any) {
    const copia = leerLocal<T | null>(`pietra:cache:${clave}`, null)
    if (copia !== null) return { data: copia, deCache: true, error: null }
    return { data: null, deCache: true, error: esDeRed(e) ? 'Sin conexión y sin datos guardados en este teléfono todavía.' : e?.message ?? 'Error' }
  }
}

// ---------- Cola ----------
export type Operacion =
  | { id: string; clave: string; tabla: string; tipo: 'upsert'; fila: Record<string, unknown>; onConflict: string; ignorarDuplicados?: boolean; creado: number }
  | { id: string; clave: string; tabla: string; tipo: 'delete'; filtro: Record<string, unknown>; creado: number }
  | { id: string; clave: string; tabla: string; tipo: 'insert'; fila: Record<string, unknown>; creado: number }

const K_COLA = 'pietra:cola'
const K_ERRORES = 'pietra:errores'
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

export const leerCola = () => leerLocal<Operacion[]>(K_COLA, [])
const escribirCola = (c: Operacion[]) => { escribirLocal(K_COLA, c); avisar() }

// Encola una operación. Si ya había una pendiente con la misma clave
// (mismo producto/tarea), la reemplaza: se sube solo el último valor.
type SinId<T> = T extends unknown ? Omit<T, 'id' | 'creado'> : never
export function encolar(op: SinId<Operacion>) {
  const cola = leerCola().filter((o) => o.clave !== op.clave)
  cola.push({ ...(op as Operacion), id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, creado: Date.now() })
  escribirCola(cola)
  void sincronizar()
}

// Saca de la cola una operación pendiente (por ejemplo, desmarcar algo que todavía no subió)
export function quitarDeCola(clave: string): boolean {
  const cola = leerCola()
  const nueva = cola.filter((o) => o.clave !== clave)
  if (nueva.length === cola.length) return false
  escribirCola(nueva)
  return true
}

export const estaPendiente = (clave: string) => leerCola().some((o) => o.clave === clave)

function esDeRed(e: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const m = String(e?.message ?? e ?? '')
  return /fetch|network|load failed|timeout|abort|offline|jwt|token|401/i.test(m) || e?.code === 'PGRST301'
}

// Error definitivo de la base (dato inválido, permiso): no tiene sentido reintentar.
const esDefinitivo = (e: any) => typeof e?.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && !esDeRed(e)

let corriendo = false
export async function sincronizar(): Promise<void> {
  if (corriendo) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  corriendo = true
  try {
    for (;;) {
      const op = leerCola()[0]
      if (!op) break
      let error: any = null
      try {
        if (op.tipo === 'upsert') {
          const r = await supabase.from(op.tabla).upsert(op.fila, { onConflict: op.onConflict, ignoreDuplicates: op.ignorarDuplicados ?? false })
          error = r.error
        } else if (op.tipo === 'insert') {
          const r = await supabase.from(op.tabla).insert(op.fila)
          error = r.error
        } else {
          let q = supabase.from(op.tabla).delete()
          for (const [k, v] of Object.entries(op.filtro)) q = q.eq(k, v as any)
          const r = await q
          error = r.error
        }
      } catch (e) {
        error = e
      }
      if (error && !esDefinitivo(error)) break // sin señal: se reintenta más tarde
      if (error) {
        // Puede ser la sesión recién renovada: se reintenta unas veces antes de descartar
        const intentos = ((op as any).intentos ?? 0) + 1
        if (intentos < 5) {
          escribirCola(leerCola().map((o) => (o.id === op.id ? { ...o, intentos } : o)))
          break
        }
        const errs = leerLocal<string[]>(K_ERRORES, [])
        escribirLocal(K_ERRORES, [...errs.slice(-19), `${new Date().toISOString()} ${op.tabla}: ${error.message}`])
      }
      // Sacamos solo esta operación (pudo haberse encolado otra mientras tanto)
      escribirCola(leerCola().filter((o) => o.id !== op.id))
    }
  } finally {
    corriendo = false
    avisar()
  }
}

// Reintentos automáticos
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void sincronizar(); avisar() })
  window.addEventListener('offline', avisar)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sincronizar() })
  setInterval(() => { if (leerCola().length) void sincronizar() }, 15_000)
}

// Hook: cantidad pendiente y si hay señal
export function useConexion() {
  const calc = () => ({ pendientes: leerCola().length, enLinea: typeof navigator === 'undefined' ? true : navigator.onLine })
  const [estado, setEstado] = useState(calc)
  useEffect(() => {
    const f = () => setEstado(calc())
    oyentes.add(f)
    f()
    return () => { oyentes.delete(f) }
  }, [])
  return estado
}
