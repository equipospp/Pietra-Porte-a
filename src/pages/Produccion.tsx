import { useCallback, useEffect, useState } from 'react'
import { horaCorta } from '../lib/fecha'
import { supabase } from '../lib/supabase'
import type { Producto } from '../lib/tipos'

type Registro = { id: number; producto_id: number; cantidad: number; created_at: string }

// Gamaliel carga lo que produjo en el día. Se puede cargar en varias tandas: se suman.
export default function Produccion({ fecha }: { fecha: string }) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [registros, setRegistros] = useState<Registro[]>([])
  const [valores, setValores] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('productos').select('*').eq('rubro', 'Terminados (producción)').eq('activo', true).order('orden'),
      supabase.from('produccion').select('id,producto_id,cantidad,created_at').eq('fecha', fecha).order('created_at'),
    ])
    if (p.error || r.error) setError((p.error ?? r.error)!.message)
    setProductos((p.data as Producto[]) ?? [])
    setRegistros((r.data as Registro[]) ?? [])
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setError(null)
    setMensaje(null)
    const filas = productos
      .map((p) => ({ producto_id: p.id, fecha, cantidad: Number((valores[p.id] ?? '').replace(',', '.')) }))
      .filter((f) => f.cantidad > 0)
    if (!filas.length) { setMensaje('No cargaste cantidades.'); return }
    if (filas.some((f) => !Number.isFinite(f.cantidad))) { setError('Revisá los números.'); return }
    setOcupado(true)
    const { error } = await supabase.from('produccion').insert(filas)
    setOcupado(false)
    if (error) { setError(error.message); return }
    setValores({})
    setMensaje('Producción guardada.')
    await cargar()
  }

  const totalDe = (id: number) => registros.filter((r) => r.producto_id === id).reduce((s, r) => s + Number(r.cantidad), 0)

  return (
    <>
      <h2 className="banda">Producción de hoy</h2>
      <p className="ayuda">Cargá lo que produjiste. Si producís en tandas, cargá cada tanda: se suman. Los insumos que te quedan (harina, levadura, sal) van en Stock.</p>
      {error && <div className="aviso-error">{error}</div>}
      {mensaje && <div className="aviso-ok">{mensaje}</div>}
      {productos.map((p) => (
        <div key={p.id} className="prod">
          <div>
            <div className="n">{p.nombre}</div>
            <div className="u">Hoy: {totalDe(p.id)} {p.unidad}</div>
          </div>
          <input
            className="entrada"
            inputMode="numeric"
            placeholder="+ cantidad"
            value={valores[p.id] ?? ''}
            onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
          />
        </div>
      ))}
      <div className="guardar-fijo">
        <button className="btn" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar producción'}</button>
      </div>
      {registros.length > 0 && (
        <>
          <h3 className="sub">Cargado hoy</h3>
          <table className="simple">
            <thead><tr><th>Hora</th><th>Producto</th><th>Cantidad</th></tr></thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td>{horaCorta(r.created_at)}</td>
                  <td>{productos.find((p) => p.id === r.producto_id)?.nombre ?? '—'}</td>
                  <td>{r.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
