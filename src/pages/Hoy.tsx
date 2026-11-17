import { useCallback, useEffect, useState } from 'react'
import FotoBoton from '../components/FotoBoton'
import { diaSemana, horaCorta, inicioSemana, nombreDia } from '../lib/fecha'
import { subirFoto, urlsFotos } from '../lib/fotos'
import { supabase } from '../lib/supabase'
import { conCache, encolar, leerCola, quitarDeCola, useConexion } from '../lib/offline'
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
  const [fotos, setFotos] = useState<Record<string, string>>({})

  const { pendientes, enLinea } = useConexion()

  const cargar = useCallback(async () => {
    const desde = inicioSemana(fecha)
    const [t, h, c] = await Promise.all([
      conCache<Tarea[]>(`tareas:${persona.slug}`, () => supabase.from('tareas').select('*').eq('persona_slug', persona.slug).eq('activa', true).order('orden')),
      conCache<TareaHecha[]>(`hechas:${persona.id}:${fecha}`, () => supabase.from('tareas_hechas').select('*').eq('persona_id', persona.id).gte('fecha', desde).lte('fecha', fecha)),
      conCache<CantidadDia[]>(`cantidades:${persona.slug}:${diaSemana(fecha)}`, () => supabase.from('cantidades_dia').select('*').eq('persona_slug', persona.slug).eq('dia', diaSemana(fecha)).order('id')),
    ])
    setError(t.error ?? h.error ?? c.error)
    setTareas(t.data ?? [])
    setHechas(h.data ?? [])
    setCantidades(c.data ?? [])
    setListo(true)
    if (!h.deCache) setFotos(await urlsFotos((h.data ?? []).map((x) => x.foto_path).filter(Boolean) as string[]))
  }, [persona, fecha])

  useEffect(() => { cargar() }, [cargar])
  // Cuando termina de subir lo pendiente, refresca
  useEffect(() => { if (enLinea && pendientes === 0) cargar() }, [pendientes, enLinea, cargar])

  const claveT = (id: number) => `tarea|${fecha}|${id}`

  // Lo marcado en el teléfono que todavía no subió también cuenta
  const hechaDe = (t: Tarea): TareaHecha | undefined => {
    const op = leerCola().find((o) => o.clave === claveT(t.id))
    if (op?.tipo === 'delete') return undefined
    if (op?.tipo === 'upsert') return { id: -t.id, tarea_id: t.id, fecha, persona_id: persona.id, foto_path: null, created_at: new Date(op.creado).toISOString() }
    return t.frecuencia === 'semanal'
      ? hechas.find((h) => h.tarea_id === t.id)
      : hechas.find((h) => h.tarea_id === t.id && h.fecha === fecha)
  }

  const marcar = async (t: Tarea, foto?: File) => {
    setError(null)
    if (!foto) {
      // Sin foto: se marca al instante en el teléfono y se sube solo
      encolar({ clave: claveT(t.id), tabla: 'tareas_hechas', tipo: 'upsert', fila: { tarea_id: t.id, fecha, created_at: new Date().toISOString() }, onConflict: 'tarea_id,fecha', ignorarDuplicados: true })
      setHechas((x) => [...x])
      return
    }
    if (!navigator.onLine) { setError('Para las tareas con foto hace falta señal. Probá de nuevo cuando vuelva.'); return }
    setOcupada(t.id)
    try {
      const foto_path = await subirFoto(foto, fecha, `tarea-${t.id}`)
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
    // Si todavía no había subido, alcanza con sacarlo de lo pendiente
    if (!quitarDeCola(claveT(h.tarea_id))) {
      encolar({ clave: claveT(h.tarea_id), tabla: 'tareas_hechas', tipo: 'delete', filtro: { tarea_id: h.tarea_id, fecha } })
    }
    setHechas((x) => x.filter((y) => !(y.tarea_id === h.tarea_id && y.fecha === fecha)))
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
                        {h.foto_path ? ' · foto guardada ✓' : ''}
                      </div>
                    )}
                    {h?.foto_path && fotos[h.foto_path] && (
                      <a href={fotos[h.foto_path]} target="_blank" rel="noreferrer"><img className="foto-mini" style={{ marginTop: 6 }} src={fotos[h.foto_path]} alt="Foto de la tarea" /></a>
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
