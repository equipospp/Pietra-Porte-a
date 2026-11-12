import { useCallback, useEffect, useState } from 'react'
import FotoBoton from '../components/FotoBoton'
import { diaSemana } from '../lib/fecha'
import { subirFoto } from '../lib/fotos'
import { supabase } from '../lib/supabase'
import type { Persona, Revision, Sector } from '../lib/tipos'

// Revisión de cómo recibís cada sector. Habla de sectores, no de personas.
export default function Llegar({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [sectores, setSectores] = useState<Sector[]>([])
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [abierto, setAbierto] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const cargar = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.from('sectores').select('*').eq('revisa_slug', persona.slug).eq('activo', true).order('orden'),
      supabase.from('revisiones').select('*').eq('fecha', fecha),
    ])
    if (s.error || r.error) setError((s.error ?? r.error)!.message)
    setSectores(((s.data as Sector[]) ?? []).filter((x) => x.dias.includes(diaSemana(fecha))))
    setRevisiones((r.data as Revision[]) ?? [])
    setListo(true)
  }, [persona, fecha])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (sector: Sector, estado: 'ok' | 'pendiente') => {
    setOcupado(true)
    setError(null)
    try {
      let foto_path: string | null = null
      if (estado === 'pendiente') {
        if (!foto || !comentario.trim()) throw new Error('Para marcar pendiente hace falta una foto y una línea de qué quedó.')
        foto_path = await subirFoto(foto, fecha, `sector-${sector.id}`)
      }
      const { error } = await supabase
        .from('revisiones')
        .upsert({ sector_id: sector.id, fecha, estado, comentario: estado === 'ok' ? null : comentario.trim(), foto_path }, { onConflict: 'sector_id,fecha' })
      if (error) throw error
      setAbierto(null)
      setComentario('')
      setFoto(null)
      await cargar()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo guardar')
    } finally {
      setOcupado(false)
    }
  }

  if (!listo) return <div className="vacio">Cargando…</div>

  return (
    <>
      <h2 className="banda">Cómo recibís tu sector</h2>
      <p className="ayuda">Marcá si está bien. Si quedó algo, sacá una foto, escribí una línea y seguí con lo tuyo: queda registrado y lo vemos después.</p>
      {error && <div className="aviso-error">{error}</div>}
      {sectores.length === 0 && <div className="vacio">Hoy no tenés sectores para revisar.</div>}
      {sectores.map((s) => {
        const r = revisiones.find((x) => x.sector_id === s.id)
        return (
          <div key={s.id} className="tarjeta">
            <div className="estado-linea">
              <strong>{s.nombre}</strong>
              {r && <span className={r.estado === 'ok' ? 'okc' : 'pend'}>{r.estado === 'ok' ? 'Está bien' : 'Quedó pendiente'}</span>}
            </div>
            {r?.comentario && <div className="detalle" style={{ fontSize: 13, color: 'var(--gris)' }}>{r.comentario}</div>}
            {abierto === s.id ? (
              <div style={{ marginTop: 10 }}>
                <label className="campo">¿Qué quedó pendiente?</label>
                <textarea className="entrada" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Una línea alcanza" />
                <div className="fila" style={{ marginTop: 8 }}>
                  <FotoBoton texto={foto ? 'Foto lista ✓' : 'Sacar foto'} onFoto={setFoto} />
                  <button className="btn chico" disabled={ocupado} onClick={() => guardar(s, 'pendiente')}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
                </div>
                <button className="btn sec chico" style={{ marginTop: 8 }} onClick={() => { setAbierto(null); setFoto(null); setComentario('') }}>Cancelar</button>
              </div>
            ) : (
              <div className="fila" style={{ marginTop: 10 }}>
                <button className="btn chico" disabled={ocupado} onClick={() => guardar(s, 'ok')}>Está bien</button>
                <button className="btn sec chico" disabled={ocupado} onClick={() => { setAbierto(s.id); setComentario(''); setFoto(null) }}>Quedó algo</button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
