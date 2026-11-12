import { useCallback, useEffect, useState } from 'react'
import FotoBoton from '../components/FotoBoton'
import { horaCorta, nombreDia } from '../lib/fecha'
import { subirFoto } from '../lib/fotos'
import { supabase } from '../lib/supabase'
import type { Aviso, Persona } from '../lib/tipos'

export default function Avisos({ persona, fecha }: { persona: Persona; fecha: string }) {
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [mios, setMios] = useState<Aviso[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*').eq('persona_id', persona.id).order('created_at', { ascending: false }).limit(10)
    setMios((data as Aviso[]) ?? [])
  }, [persona])

  useEffect(() => { cargar() }, [cargar])

  const enviar = async () => {
    if (!texto.trim()) { setError('Escribí qué pasa.'); return }
    setOcupado(true)
    setError(null)
    setMensaje(null)
    try {
      const foto_path = foto ? await subirFoto(foto, fecha, 'aviso') : null
      const { error } = await supabase.from('avisos').insert({ fecha, texto: texto.trim(), foto_path })
      if (error) throw error
      setTexto('')
      setFoto(null)
      setMensaje('Aviso enviado. Gracias por avisar.')
      await cargar()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo enviar')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <h2 className="banda">Avisar algo</h2>
      <p className="ayuda">Si falta un producto, algo no funciona o necesitás algo (por ejemplo, de limpieza), avisalo acá apenas lo ves.</p>
      {error && <div className="aviso-error">{error}</div>}
      {mensaje && <div className="aviso-ok">{mensaje}</div>}
      <textarea className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: se terminó el detergente" />
      <div className="fila" style={{ marginTop: 8 }}>
        <FotoBoton texto={foto ? 'Foto lista ✓' : 'Agregar foto'} onFoto={setFoto} />
        <button className="btn chico" disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviar'}</button>
      </div>

      {mios.length > 0 && (
        <>
          <h3 className="sub">Tus últimos avisos</h3>
          {mios.map((a) => (
            <div key={a.id} className="tarjeta">
              <div className="estado-linea">
                <span>{nombreDia(a.fecha)} · {horaCorta(a.created_at)}</span>
                <span className={a.resuelto ? 'okc' : 'pend'}>{a.resuelto ? 'Resuelto' : 'Pendiente'}</span>
              </div>
              <div>{a.texto}</div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
