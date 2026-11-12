import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Informe de cierre de Yimi: ventas de la noche y fugazzetas desarmadas.
export default function Cierre({ fecha }: { fecha: string }) {
  const [pizzas, setPizzas] = useState('')
  const [empanadas, setEmpanadas] = useState('')
  const [fugazzetas, setFugazzetas] = useState('')
  const [nota, setNota] = useState('')
  const [guardado, setGuardado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('informes_cierre').select('*').eq('fecha', fecha).maybeSingle().then(({ data }) => {
      if (!data) return
      setPizzas(data.pizzas?.toString() ?? '')
      setEmpanadas(data.empanadas?.toString() ?? '')
      setFugazzetas(data.fugazzetas_desarmadas?.toString() ?? '')
      setNota(data.nota ?? '')
      setGuardado(true)
    })
  }, [fecha])

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

  const guardar = async () => {
    setError(null)
    const fila = { fecha, pizzas: num(pizzas), empanadas: num(empanadas), fugazzetas_desarmadas: num(fugazzetas), nota: nota.trim() || null }
    if ([fila.pizzas, fila.empanadas, fila.fugazzetas_desarmadas].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) {
      setError('Revisá los números.')
      return
    }
    setOcupado(true)
    const { error } = await supabase.from('informes_cierre').upsert(fila, { onConflict: 'fecha' })
    setOcupado(false)
    if (error) setError(error.message)
    else setGuardado(true)
  }

  return (
    <>
      <h2 className="banda">Informe de cierre</h2>
      <p className="ayuda">Al terminar el servicio. Las porciones se cuentan como pizzas: 8 porciones = 1 pizza.</p>
      {error && <div className="aviso-error">{error}</div>}
      {guardado && <div className="aviso-ok">Informe guardado. Si cambiás algo, guardá de nuevo.</div>}
      <div className="tarjeta">
        <label className="campo">Pizzas vendidas</label>
        <input className="entrada" inputMode="decimal" value={pizzas} onChange={(e) => { setPizzas(e.target.value); setGuardado(false) }} />
        <label className="campo">Empanadas vendidas (unidades)</label>
        <input className="entrada" inputMode="numeric" value={empanadas} onChange={(e) => { setEmpanadas(e.target.value); setGuardado(false) }} />
        <label className="campo">Fugazzetas que se desarmaron</label>
        <input className="entrada" inputMode="numeric" value={fugazzetas} onChange={(e) => { setFugazzetas(e.target.value); setGuardado(false) }} />
        <label className="campo">Nota (opcional)</label>
        <textarea className="entrada" value={nota} onChange={(e) => { setNota(e.target.value); setGuardado(false) }} />
        <button className="btn" style={{ marginTop: 12 }} disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar informe'}</button>
      </div>
    </>
  )
}
