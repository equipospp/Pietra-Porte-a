import { useCallback, useEffect, useMemo, useState } from 'react'
import { horaCorta } from '../lib/fecha'
import { supabase } from '../lib/supabase'
import type { Producto } from '../lib/tipos'

type Estado = 'completo' | 'parcial' | 'no_llego'
type Registro = { id: number; producto_id: number; cantidad: number | null; estado: Estado; nota: string | null; created_at: string }
const NOMBRE_ESTADO: Record<Estado, string> = { completo: 'Llegó', parcial: 'Parcial', no_llego: 'No llegó' }

// Pablo registra lo que dejó Claudio a la siesta.
// Etapa 2: en vez de elegir producto por producto, se controla contra el pedido del día.
export default function Recepcion({ fecha }: { fecha: string }) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [registros, setRegistros] = useState<Registro[]>([])
  const [productoId, setProductoId] = useState<number | ''>('')
  const [cantidad, setCantidad] = useState('')
  const [estado, setEstado] = useState<Estado>('completo')
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('productos').select('*').eq('activo', true).not('proveedor', 'is', null).order('proveedor').order('orden'),
      supabase.from('recepciones').select('*').eq('fecha', fecha).order('created_at', { ascending: false }),
    ])
    if (p.error || r.error) setError((p.error ?? r.error)!.message)
    setProductos((p.data as Producto[]) ?? [])
    setRegistros((r.data as Registro[]) ?? [])
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])

  const porProveedor = useMemo(() => {
    const m = new Map<string, Producto[]>()
    for (const p of productos) {
      const k = p.proveedor ?? 'Otros'
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return Array.from(m.entries())
  }, [productos])

  const elegido = productos.find((p) => p.id === productoId)

  const guardar = async () => {
    setError(null)
    if (!productoId) { setError('Elegí el producto.'); return }
    const n = cantidad.trim() ? Number(cantidad.replace(',', '.')) : null
    if (estado !== 'no_llego' && (n === null || !Number.isFinite(n) || n < 0)) { setError('Poné la cantidad que llegó.'); return }
    setOcupado(true)
    const { error } = await supabase.from('recepciones').insert({
      fecha, producto_id: productoId, cantidad: estado === 'no_llego' ? null : n, estado, nota: nota.trim() || null,
    })
    setOcupado(false)
    if (error) { setError(error.message); return }
    setProductoId('')
    setCantidad('')
    setEstado('completo')
    setNota('')
    await cargar()
  }

  return (
    <>
      <h2 className="banda">Mercadería que llegó</h2>
      <p className="ayuda">Cargá cada producto que dejó Claudio, con la cantidad del remito o de la lista de pedido.</p>
      {error && <div className="aviso-error">{error}</div>}
      <div className="tarjeta">
        <label className="campo">Producto</label>
        <select className="entrada" value={productoId} onChange={(e) => setProductoId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Elegí…</option>
          {porProveedor.map(([prov, lista]) => (
            <optgroup key={prov} label={prov}>
              {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="campo">¿Cómo llegó?</label>
        <div className="seg">
          {(['completo', 'parcial', 'no_llego'] as Estado[]).map((e) => (
            <button key={e} className={estado === e ? 'on' : ''} onClick={() => setEstado(e)}>{NOMBRE_ESTADO[e]}</button>
          ))}
        </div>
        {estado !== 'no_llego' && (
          <>
            <label className="campo">Cantidad{elegido ? ` (${elegido.unidad})` : ''}</label>
            <input className="entrada" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </>
        )}
        <label className="campo">Nota (opcional)</label>
        <input className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: vino otra marca" />
        <button className="btn" style={{ marginTop: 12 }} disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Registrar'}</button>
      </div>

      {registros.length > 0 && (
        <>
          <h3 className="sub">Registrado hoy</h3>
          <table className="simple">
            <thead><tr><th>Hora</th><th>Producto</th><th>Cant.</th><th>Estado</th></tr></thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td>{horaCorta(r.created_at)}</td>
                  <td>{productos.find((p) => p.id === r.producto_id)?.nombre ?? '—'}{r.nota ? <div className="u" style={{ fontSize: 12, color: 'var(--gris)' }}>{r.nota}</div> : null}</td>
                  <td>{r.cantidad ?? '—'}</td>
                  <td>{NOMBRE_ESTADO[r.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
