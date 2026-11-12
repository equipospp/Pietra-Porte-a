import { useCallback, useEffect, useState } from 'react'
import FotoBoton from '../components/FotoBoton'
import { diaSemana, horaCorta, inicioSemana, nombreDia } from '../lib/fecha'
import { subirFoto } from '../lib/fotos'
import { supabase } from '../lib/supabase'
import type { CantidadDia, Momento, Persona, Tarea, TareaHecha } from '../lib/tipos'

const TITULOS: Record<Momento, string> = {
  llegar: 'Al llegar',
  turno: 'Durante el turno',
  irse: 'Antes de irte',
}

function toca(t: Tarea, fecha: string): boolean {
  if (!t.activa || !t.dias.includes(diaSemana(fecha))) return false
  if (t.frecuencia === 'mensual') return Number(fecha.slice(8, 10)) <= 7 // primer martes, etc.
  return true
}

export default function Hoy({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [hechas, setHechas] = useState<TareaHecha[]>([])
  const [cantidades, setCantidades] = useState<CantidadDia[]>([])
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const cargar = useCallback(async () => {
    const desde = inicioSemana(fecha)
    const [t, h, c] = await Promise.all([
      supabase.from('tareas').select('*').eq('persona_slug', persona.slug).eq('activa', true).order('orden'),
      supabase.from('tareas_hechas').select('*').eq('persona_id', persona.id).gte('fecha', desde).lte('fecha', fecha),
      supabase.from('cantidades_dia').select('*').eq('persona_slug', persona.slug).eq('dia', diaSemana(fecha)).order('id'),
    ])
    const err = t.error ?? h.error ?? c.error
    if (err) setError(err.message)
    setTareas((t.data as Tarea[]) ?? [])
    setHechas((h.data as TareaHecha[]) ?? [])
    setCantidades((c.data as CantidadDia[]) ?? [])
    setListo(true)
  }, [persona, fecha])

  useEffect(() => { cargar() }, [cargar])

  const hechaDe = (t: Tarea): TareaHecha | undefined =>
    t.frecuencia === 'semanal'
      ? hechas.find((h) => h.tarea_id === t.id)
      : hechas.find((h) => h.tarea_id === t.id && h.fecha === fecha)

  const marcar = async (t: Tarea, foto?: File) => {
    setOcupada(t.id)
    setError(null)
    try {
      const foto_path = foto ? await subirFoto(foto, fecha, `tarea-${t.id}`) : null
      const { error } = await supabase.from('tareas_hechas').insert({ tarea_id: t.id, fecha, foto_path })
      if (error) throw error
      await cargar()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo guardar')
    } finally {
      setOcupada(null)
    }
  }

  const desmarcar = async (h: TareaHecha) => {
    if (h.fecha !== fecha) return // lo de otro día no se toca
    setOcupada(h.tarea_id)
    const { error } = await supabase.from('tareas_hechas').delete().eq('id', h.id)
    if (error) setError(error.message)
    await cargar()
    setOcupada(null)
  }

  if (!listo) return <div className="vacio">Cargando…</div>

  const visibles = tareas.filter((t) => toca(t, fecha))
  const total = visibles.length
  const completas = visibles.filter((t) => hechaDe(t)).length

  return (
    <>
      {error && <div className="aviso-error">{error}</div>}

      {total > 0 && (
        <div className="tarjeta suave">
          <div className="estado-linea">
            <strong>Tu día</strong>
            <span>{completas} de {total} {completas === total ? '· ¡listo!' : ''}</span>
          </div>
          <div className="progreso"><div style={{ width: `${(completas / total) * 100}%` }} /></div>
        </div>
      )}

      {cantidades.length > 0 && (
        <>
          <h2 className="banda">Cantidades de hoy</h2>
          <div className="tarjeta">
            <div className="cantidades">
              {cantidades.map((c) => (
                <FilaCantidad key={c.id} c={c} />
              ))}
            </div>
          </div>
        </>
      )}

      {total === 0 && <div className="vacio">Hoy no tenés tareas cargadas.</div>}

      {(['llegar', 'turno', 'irse'] as Momento[]).map((m) => {
        const lista = visibles.filter((t) => t.momento === m)
        if (!lista.length) return null
        return (
          <section key={m}>
            <h2 className="banda">{TITULOS[m]}</h2>
            {lista.map((t) => {
              const h = hechaDe(t)
              const deOtroDia = h && h.fecha !== fecha
              return (
                <div key={t.id} className={`tarea ${h ? 'hecha' : ''}`}>
                  {t.pide_foto && !h ? (
                    <span className="check" style={{ borderStyle: 'dashed' }} />
                  ) : (
                    <button
                      className="check"
                      aria-label={h ? 'Desmarcar' : 'Marcar como hecha'}
                      disabled={ocupada === t.id || Boolean(deOtroDia)}
                      onClick={() => (h ? desmarcar(h) : marcar(t))}
                    >
                      {h ? '✓' : ''}
                    </button>
                  )}
                  <div className="texto">
                    <div className="titulo">
                      {t.texto}
                      {t.frecuencia === 'semanal' && <span className="chip">semanal</span>}
                      {t.frecuencia === 'mensual' && <span className="chip">mensual</span>}
                      {t.pide_foto && <span className="chip">foto</span>}
                    </div>
                    {t.detalle && <div className="detalle">{t.detalle}</div>}
                    {h && (
                      <div className="meta">
                        Hecha {deOtroDia ? `el ${nombreDia(h.fecha).toLowerCase()}` : `a las ${horaCorta(h.created_at)}`}
                        {h.foto_path ? ' · con foto' : ''}
                      </div>
                    )}
                    {t.pide_foto && !h && (
                      <div style={{ marginTop: 8 }}>
                        <FotoBoton
                          texto={ocupada === t.id ? 'Subiendo…' : 'Foto y listo'}
                          disabled={ocupada === t.id}
                          onFoto={(f) => marcar(t, f)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </>
  )
}

function FilaCantidad({ c }: { c: CantidadDia }) {
  const num = c.cantidad === null ? 'a definir' : `${String(c.cantidad).replace('.', ',')} ${c.unidad}`
  return (
    <>
      <div>{c.texto}</div>
      <div className="num">{num}</div>
    </>
  )
}
