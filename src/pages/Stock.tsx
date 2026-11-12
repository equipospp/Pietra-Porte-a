import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { NOMBRE_MOMENTO_STOCK } from '../lib/tipos'
import type { Conteo, ItemLista, MomentoStock, Persona } from '../lib/tipos'

type Valor = { valor: string; estado: 'hay' | 'poco' | 'no' | null; guardado: boolean }
const clave = (pid: number, m: MomentoStock) => `${pid}|${m}`
const aNumero = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

export default function Stock({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [items, setItems] = useState<ItemLista[]>([])
  const [valores, setValores] = useState<Record<string, Valor>>({})
  const [guardando, setGuardando] = useState<MomentoStock | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const cargar = useCallback(async () => {
    const [l, c] = await Promise.all([
      supabase.from('conteo_listas').select('*, productos(nombre,unidad,rubro,activo)').eq('persona_slug', persona.slug).order('orden'),
      supabase.from('stock_conteos').select('*').eq('fecha', fecha).eq('persona_id', persona.id),
    ])
    if (l.error || c.error) setError((l.error ?? c.error)!.message)
    const lista = ((l.data as ItemLista[]) ?? []).filter((i) => i.productos?.activo)
    setItems(lista)
    const v: Record<string, Valor> = {}
    for (const x of (c.data as Conteo[]) ?? []) {
      v[clave(x.producto_id, x.momento)] = {
        valor: x.valor === null ? '' : String(x.valor).replace('.', ','),
        estado: x.estado,
        guardado: true,
      }
    }
    setValores(v)
    setListo(true)
  }, [persona, fecha])

  useEffect(() => { cargar() }, [cargar])

  const momentos = useMemo(() => {
    const orden: MomentoStock[] = ['apertura', 'inicio', 'cierre']
    return orden.filter((m) => items.some((i) => i.momento === m))
  }, [items])

  const cambiar = (k: string, cambio: Partial<Valor>) =>
    setValores((v) => ({ ...v, [k]: { ...(v[k] ?? { valor: '', estado: null }), ...cambio, guardado: false } }))

  const guardar = async (m: MomentoStock) => {
    setError(null)
    setMensaje(null)
    const filas: Conteo[] = []
    for (const i of items.filter((x) => x.momento === m)) {
      const v = valores[clave(i.producto_id, m)]
      if (!v || v.guardado) continue
      if (i.modo === 'estado') {
        if (!v.estado) continue
        filas.push({ producto_id: i.producto_id, fecha, momento: m, valor: null, estado: v.estado })
      } else {
        const n = aNumero(v.valor)
        if (n === null) continue
        if (Number.isNaN(n)) { setError(`Revisá el número de ${i.productos.nombre}`); return }
        filas.push({ producto_id: i.producto_id, fecha, momento: m, valor: n, estado: null })
      }
    }
    if (!filas.length) { setMensaje('No hay cambios para guardar.'); return }
    setGuardando(m)
    const { error } = await supabase.from('stock_conteos').upsert(filas, { onConflict: 'producto_id,fecha,momento,persona_id' })
    setGuardando(null)
    if (error) { setError(error.message); return }
    setMensaje(`Guardado: ${filas.length} producto${filas.length === 1 ? '' : 's'}.`)
    await cargar()
  }

  if (!listo) return <div className="vacio">Cargando…</div>
  if (!items.length) return <div className="vacio">No tenés productos para contar.</div>

  return (
    <>
      {error && <div className="aviso-error">{error}</div>}
      {mensaje && <div className="aviso-ok">{mensaje}</div>}
      {momentos.map((m) => {
        const lista = items.filter((i) => i.momento === m)
        const cargados = lista.filter((i) => valores[clave(i.producto_id, m)]?.guardado).length
        const rubros = Array.from(new Set(lista.map((i) => i.productos.rubro)))
        const agrupar = lista.length > 20
        return (
          <section key={m}>
            <h2 className="banda">{NOMBRE_MOMENTO_STOCK[m]}</h2>
            <p className="ayuda">
              {cargados} de {lista.length} cargados.{' '}
              {lista.some((i) => i.modo === 'pesa') ? 'Pesá en kilos (podés usar coma). ' : ''}
              {lista.some((i) => i.modo === 'estado') ? 'Marcá si hay, si queda poco o si no hay.' : ''}
            </p>
            {agrupar
              ? rubros.map((r) => {
                  const deRubro = lista.filter((i) => i.productos.rubro === r)
                  const hechos = deRubro.filter((i) => valores[clave(i.producto_id, m)]?.guardado).length
                  return (
                    <details key={r} className="rubro">
                      <summary>{r} · {hechos}/{deRubro.length}</summary>
                      {deRubro.map((i) => <Fila key={i.id} item={i} v={valores[clave(i.producto_id, m)]} onCambio={(c) => cambiar(clave(i.producto_id, m), c)} />)}
                    </details>
                  )
                })
              : lista.map((i) => <Fila key={i.id} item={i} v={valores[clave(i.producto_id, m)]} onCambio={(c) => cambiar(clave(i.producto_id, m), c)} />)}
            <div className="guardar-fijo">
              <button className="btn" disabled={guardando !== null} onClick={() => guardar(m)}>
                {guardando === m ? 'Guardando…' : `Guardar ${NOMBRE_MOMENTO_STOCK[m].toLowerCase()}`}
              </button>
            </div>
          </section>
        )
      })}
    </>
  )
}

function Fila({ item, v, onCambio }: { item: ItemLista; v?: Valor; onCambio: (c: Partial<Valor>) => void }) {
  const unidad = item.modo === 'pesa' ? 'kg' : item.productos.unidad
  return (
    <div className={`prod ${v?.guardado ? 'cargado' : ''}`}>
      <div>
        <div className="n">{item.productos.nombre}</div>
        {item.modo !== 'estado' && <div className="u">{unidad}</div>}
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
