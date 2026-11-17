import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conCache, encolar, escribirLocal, estaPendiente, leerLocal, sincronizar, useConexion } from '../lib/offline'
import { supabase } from '../lib/supabase'
import { NOMBRE_MOMENTO_STOCK } from '../lib/tipos'
import type { Conteo, ItemLista, MomentoStock, Persona } from '../lib/tipos'

// Cada valor se guarda en el teléfono en el momento en que se escribe
// y se sube solo a la base (aunque se bloquee el teléfono o no haya señal).
type Valor = { valor: string; estado: 'hay' | 'poco' | 'no' | null }
const clave = (pid: number, m: MomentoStock) => `${pid}|${m}`
const claveCola = (fecha: string, pid: number, m: MomentoStock) => `stock|${fecha}|${pid}|${m}`
const aNumero = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

export default function Stock({ persona, fecha }: { persona: Persona; fecha: string }) {
  const kLocal = `pietra:stock:${persona.id}:${fecha}`
  const [items, setItems] = useState<ItemLista[]>([])
  const [valores, setValores] = useState<Record<string, Valor>>(() => leerLocal(kLocal, {}))
  const [subidos, setSubidos] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const temporizadores = useRef<Record<string, number>>({})
  const valoresRef = useRef(valores)
  const { pendientes, enLinea } = useConexion()

  const cargar = useCallback(async () => {
    const [l, c] = await Promise.all([
      conCache<ItemLista[]>(`lista:${persona.slug}`, () =>
        supabase.from('conteo_listas').select('*, productos(nombre,unidad,rubro,activo)').eq('persona_slug', persona.slug).order('orden')),
      conCache<Conteo[]>(`conteos:${persona.id}:${fecha}`, () =>
        supabase.from('stock_conteos').select('*').eq('fecha', fecha).eq('persona_id', persona.id)),
    ])
    setError(l.error ?? c.error)
    setItems((l.data ?? []).filter((i) => i.productos?.activo))
    // Lo que está en la base manda, salvo lo que todavía está pendiente de subir desde este teléfono
    const local = leerLocal<Record<string, Valor>>(kLocal, {})
    const enBase = new Set<string>()
    for (const x of c.data ?? []) {
      const k = clave(x.producto_id, x.momento)
      enBase.add(k)
      if (estaPendiente(claveCola(fecha, x.producto_id, x.momento))) continue
      local[k] = { valor: x.valor === null ? '' : String(x.valor).replace('.', ','), estado: x.estado }
    }
    escribirLocal(kLocal, local)
    valoresRef.current = local
    setValores(local)
    setSubidos(enBase)
    // Lo anotado en el teléfono que nunca llegó a subir (por ejemplo, se bloqueó justo): se sube ahora
    for (const i of (l.data ?? [])) {
      const k = clave(i.producto_id, i.momento)
      if (local[k] && !enBase.has(k) && !estaPendiente(claveCola(fecha, i.producto_id, i.momento))) subirYa(i, local[k])
    }
    setListo(true)
  }, [persona, fecha, kLocal])

  useEffect(() => { cargar() }, [cargar])

  // Si se bloquea el teléfono o se cambia de app, se sube ya lo que estaba esperando
  useEffect(() => {
    const f = () => {
      if (document.visibilityState !== 'hidden') return
      for (const [k, t] of Object.entries(temporizadores.current)) {
        window.clearTimeout(t)
        const it = items.find((i) => clave(i.producto_id, i.momento) === k)
        const v = valoresRef.current[k]
        if (it && v) subirYa(it, v)
      }
      temporizadores.current = {}
    }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  })

  // Cuando se vacía la cola (subió todo), refrescamos qué está en la base
  const pendAnterior = useRef(pendientes)
  useEffect(() => {
    if (pendAnterior.current > 0 && pendientes === 0 && enLinea) cargar()
    pendAnterior.current = pendientes
  }, [pendientes, enLinea, cargar])

  // Subir un producto (con una pequeña espera para no mandar cada tecla)
  const programarSubida = (item: ItemLista, v: Valor) => {
    const k = clave(item.producto_id, item.momento)
    window.clearTimeout(temporizadores.current[k])
    temporizadores.current[k] = window.setTimeout(() => subirYa(item, v), 800)
  }

  function subirYa(item: ItemLista, v: Valor) {
      const k = clave(item.producto_id, item.momento)
      let fila: Record<string, unknown> | null = null
      if (item.modo === 'estado') {
        if (v.estado) fila = { producto_id: item.producto_id, fecha, momento: item.momento, valor: null, estado: v.estado }
      } else {
        const n = aNumero(v.valor)
        if (n !== null && !Number.isNaN(n)) fila = { producto_id: item.producto_id, fecha, momento: item.momento, valor: n, estado: null }
      }
      if (!fila) return
      encolar({ clave: claveCola(fecha, item.producto_id, item.momento), tabla: 'stock_conteos', tipo: 'upsert', fila, onConflict: 'producto_id,fecha,momento,persona_id' })
      setSubidos((s) => new Set(s).add(k))
  }

  const cambiar = (item: ItemLista, cambio: Partial<Valor>) => {
    const k = clave(item.producto_id, item.momento)
    const prev = valoresRef.current
    const nuevo = { ...(prev[k] ?? { valor: '', estado: null }), ...cambio }
    const todo = { ...prev, [k]: nuevo }
    valoresRef.current = todo
    escribirLocal(kLocal, todo) // queda en el teléfono al instante
    setValores(todo)
    programarSubida(item, nuevo)
  }

  const momentos = useMemo(() => {
    const orden: MomentoStock[] = ['apertura', 'inicio', 'cierre']
    return orden.filter((m) => items.some((i) => i.momento === m))
  }, [items])

  if (!listo) return <div className="vacio">Cargando…</div>
  if (!items.length) return <div className="vacio">{error ?? 'No tenés productos para contar.'}</div>

  const cargado = (i: ItemLista) => {
    const v = valores[clave(i.producto_id, i.momento)]
    if (!v) return false
    return i.modo === 'estado' ? Boolean(v.estado) : aNumero(v.valor) !== null && !Number.isNaN(aNumero(v.valor))
  }

  return (
    <>
      {error && <div className="aviso-error">{error}</div>}
      <div className={`estado-sync ${pendientes ? 'pendiente' : 'ok'}`}>
        {!enLinea
          ? `Sin señal · ${pendientes} guardado${pendientes === 1 ? '' : 's'} en el teléfono, se sube${pendientes === 1 ? '' : 'n'} solo${pendientes === 1 ? '' : 's'} cuando vuelva`
          : pendientes
            ? `Subiendo ${pendientes}…`
            : 'Todo guardado ✓ · Se guarda solo, no hace falta apretar nada'}
      </div>
      {momentos.map((m) => {
        const lista = items.filter((i) => i.momento === m)
        const nCargados = lista.filter(cargado).length
        const rubros = Array.from(new Set(lista.map((i) => i.productos.rubro)))
        const agrupar = lista.length > 20
        const fila = (i: ItemLista) => {
          const k = clave(i.producto_id, m)
          const pend = estaPendiente(claveCola(fecha, i.producto_id, m))
          return <Fila key={i.id} item={i} v={valores[k]} ok={cargado(i) && subidos.has(k) && !pend} pendiente={cargado(i) && (pend || !subidos.has(k))} onCambio={(c) => cambiar(i, c)} />
        }
        return (
          <section key={m}>
            <h2 className="banda">{NOMBRE_MOMENTO_STOCK[m]}</h2>
            <p className="ayuda">
              {nCargados} de {lista.length} cargados.{' '}
              {lista.some((i) => i.modo === 'pesa') ? 'Pesá en kilos (podés usar coma). ' : ''}
              {lista.some((i) => i.modo === 'estado') ? 'Marcá si hay, si queda poco o si no hay.' : ''}
            </p>
            {agrupar
              ? rubros.map((r) => {
                  const deRubro = lista.filter((i) => i.productos.rubro === r)
                  const hechos = deRubro.filter(cargado).length
                  return (
                    <details key={r} className="rubro" open={hechos < deRubro.length}>
                      <summary>{r} · {hechos}/{deRubro.length}</summary>
                      {deRubro.map(fila)}
                    </details>
                  )
                })
              : lista.map(fila)}
          </section>
        )
      })}
      <div className="guardar-fijo">
        <button className="btn" onClick={() => { void sincronizar(); cargar() }}>
          {pendientes ? `Subir ahora (${pendientes} pendiente${pendientes === 1 ? '' : 's'})` : 'Todo guardado ✓'}
        </button>
      </div>
    </>
  )
}

function Fila({ item, v, ok, pendiente, onCambio }: { item: ItemLista; v?: Valor; ok: boolean; pendiente: boolean; onCambio: (c: Partial<Valor>) => void }) {
  const unidad = item.modo === 'pesa' ? 'kg' : item.productos.unidad
  return (
    <div className={`prod ${ok ? 'cargado' : ''} ${pendiente ? 'en-telefono' : ''}`}>
      <div>
        <div className="n">{item.productos.nombre}</div>
        {item.modo !== 'estado' && <div className="u">{unidad}{pendiente ? ' · en el teléfono, subiendo' : ''}</div>}
        {item.modo === 'estado' && pendiente && <div className="u">en el teléfono, subiendo</div>}
      </div>
      {item.modo === 'estado' ? (
        <div className="seg">
          {(['hay', 'poco', 'no'] as const).map((e) => (
            <button key={e} className={v?.estado === e ? `on-${e}` : ''} onClick={() => onCambio({ estado: e })}>
              {e === 'hay' ? 'Hay' : e === 'poco' ? 'Poco' : 'No'}
            </button>
          ))}
        </div>
      ) : (
        <input
          className="entrada"
          inputMode="decimal"
          placeholder={unidad}
          value={v?.valor ?? ''}
          onChange={(e) => onCambio({ valor: e.target.value })}
        />
      )}
    </div>
  )
}
