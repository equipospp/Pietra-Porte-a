import { useCallback, useEffect, useState } from 'react'
import { conCache, encolar, leerCola, useConexion } from '../lib/offline'
import { supabase } from '../lib/supabase'

// Agustín confirma si llegó lo que Pato pidió para la cocina.
export const RUBROS_COCINA = ['Masa', 'Quesos', 'Fiambres', 'Verdulería', 'Salsas y elaborados', 'Empanadas', 'Almacén']

type Recibido = 'si' | 'parcial' | 'no'
type Item = {
  producto_id: number
  cantidad: number
  recibido: Recibido | null
  nota: string | null
  productos: { nombre: string; unidad: string; rubro: string }
}
const ETIQUETA: Record<Recibido, string> = { si: 'Llegó', parcial: 'Faltó algo', no: 'No llegó' }
const num = (n: number) => String(Math.round(Number(n) * 100) / 100).replace('.', ',')

export default function PedidoCocina({ fecha }: { fecha: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [notas, setNotas] = useState<Record<number, string>>({})
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, refrescar] = useState(0)
  const { pendientes, enLinea } = useConexion()

  const cargar = useCallback(async () => {
    const r = await conCache<Item[]>(`pedido:${fecha}`, () =>
      supabase.from('pedidos').select('producto_id,cantidad,recibido,nota,productos(nombre,unidad,rubro)').eq('fecha', fecha))
    setError(r.error)
    const lista = (r.data ?? []).filter((i) => RUBROS_COCINA.includes(i.productos?.rubro))
    setItems(lista)
    setNotas(Object.fromEntries(lista.map((i) => [i.producto_id, i.nota ?? ''])))
    setListo(true)
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (enLinea && pendientes === 0) cargar() }, [pendientes, enLinea, cargar])

  const clave = (pid: number) => `conf|${fecha}|${pid}`
  // Lo marcado en el teléfono que todavía no subió también se muestra
  const estadoDe = (i: Item): { recibido: Recibido | null; nota: string | null; pendiente: boolean } => {
    const op = leerCola().find((o) => o.clave === clave(i.producto_id))
    if (op?.tipo === 'rpc') return { recibido: op.args.p_recibido as Recibido | null, nota: (op.args.p_nota as string) ?? null, pendiente: true }
    return { recibido: i.recibido, nota: i.nota, pendiente: false }
  }

  const marcar = (i: Item, recibido: Recibido | null) => {
    const nota = recibido === 'si' || recibido === null ? null : (notas[i.producto_id] ?? '').trim() || null
    encolar({ clave: clave(i.producto_id), tabla: 'confirmar_pedido', tipo: 'rpc', args: { p_fecha: fecha, p_producto: i.producto_id, p_recibido: recibido, p_nota: nota } })
    refrescar((x) => x + 1)
  }

  if (!listo) return <div className="vacio">Cargando…</div>

  const rubros = RUBROS_COCINA.filter((r) => items.some((i) => i.productos.rubro === r))
  const confirmados = items.filter((i) => estadoDe(i).recibido).length

  return (
    <>
      <h2 className="banda">Pedido de hoy · cocina</h2>
      <p className="ayuda">Lo que pidió Pato y trae Claudio a la siesta. Marcá cada cosa: si llegó, si faltó algo (escribí qué) o si no llegó. Se guarda solo.</p>
      {error && <div className="aviso-error">{error}</div>}
      {items.length === 0 && <div className="vacio">Pato todavía no cargó el pedido de hoy, o no hay nada de cocina.</div>}
      {items.length > 0 && (
        <div className="tarjeta suave">
          <div className="estado-linea"><strong>Confirmado</strong><span>{confirmados} de {items.length}</span></div>
          <div className="progreso"><div style={{ width: `${(confirmados / items.length) * 100}%` }} /></div>
        </div>
      )}
      {rubros.map((r) => (
        <section key={r}>
          <h3 className="sub">{r}</h3>
          {items.filter((i) => i.productos.rubro === r).map((i) => {
            const e = estadoDe(i)
            return (
              <div key={i.producto_id} className={`tarjeta conf ${e.recibido ?? ''}`}>
                <div className="estado-linea">
                  <strong>{i.productos.nombre}</strong>
                  <span>Pedido: {num(i.cantidad)} {i.productos.unidad}</span>
                </div>
                <div className="seg" style={{ marginTop: 8 }}>
                  {(['si', 'parcial', 'no'] as Recibido[]).map((x) => (
                    <button key={x} className={e.recibido === x ? (x === 'si' ? 'on-hay' : x === 'parcial' ? 'on-poco' : 'on-no') : ''}
                      onClick={() => marcar(i, e.recibido === x ? null : x)}>
                      {ETIQUETA[x]}
                    </button>
                  ))}
                </div>
                {(e.recibido === 'parcial' || e.recibido === 'no') && (
                  <input className="entrada" style={{ marginTop: 8 }} placeholder={e.recibido === 'parcial' ? '¿Qué faltó? Ej.: vino 1 kg menos' : 'Comentario (opcional)'}
                    value={notas[i.producto_id] ?? ''}
                    onChange={(ev) => setNotas((n) => ({ ...n, [i.producto_id]: ev.target.value }))}
                    onBlur={() => marcar(i, e.recibido)} />
                )}
                {e.pendiente && <div className="ayuda" style={{ margin: '6px 0 0' }}>Guardado en el teléfono, subiendo…</div>}
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}
