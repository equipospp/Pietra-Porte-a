import { useCallback, useEffect, useState } from 'react'
import FotoBoton from '../components/FotoBoton'
import { horaCorta, nombreDia } from '../lib/fecha'
import { subirFoto } from '../lib/fotos'
import { supabase } from '../lib/supabase'
import type { Persona } from '../lib/tipos'

type AvisoEquipo = {
  id: number
  nombre: string
  fecha: string
  texto: string
  resuelto: boolean
  created_at: string
  mio: boolean
}

export default function Avisos({ persona: _persona, fecha }: { persona: Persona; fecha: string }) {
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [soloPato, setSoloPato] = useState(false)
  const [equipo, setEquipo] = useState<AvisoEquipo[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('avisos_equipo')
    if (error) setError(error.message)
    setEquipo((data as AvisoEquipo[]) ?? [])
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const enviar = async () => {
    if (!texto.trim()) { setError('Escribí qué pasa.'); return }
    setOcupado(true)
    setError(null)
    setMensaje(null)
    try {
      const foto_path = foto ? await subirFoto(foto, fecha, 'aviso') : null
      const { error } = await supabase.from('avisos').insert({ fecha, texto: texto.trim(), foto_path, compartido: !soloPato })
      if (error) throw error
      setTexto('')
      setFoto(null)
      setSoloPato(false)
      setMensaje(soloPato ? 'Aviso enviado solo a Pato.' : 'Aviso enviado. Lo ve todo el equipo.')
      await cargar()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo enviar')
    } finally {
      setOcupado(false)
    }
  }

  const pendientes = equipo.filter((a) => !a.resuelto)
  const resueltos = equipo.filter((a) => a.resuelto)

  return (
    <>
      <h2 className="banda">Falta o hay que pedir</h2>
      <p className="ayuda">Lo que avisó el equipo. Antes de avisar, fijate si ya está en la lista.</p>
      {pendientes.length === 0
        ? <div className="vacio">No hay faltantes avisados.</div>
        : pendientes.map((a) => <Tarjeta key={a.id} a={a} />)}

      <h2 className="banda">Avisar algo</h2>
      <p className="ayuda">Si falta un producto, algo no funciona o necesitás algo (por ejemplo, de limpieza), avisalo acá apenas lo ves.</p>
      {error && <div className="aviso-error">{error}</div>}
      {mensaje && <div className="aviso-ok">{mensaje}</div>}
      <textarea className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: queda poca muzzarella" />
      <label className="fila" style={{ marginTop: 8, gap: 8, justifyContent: 'flex-start', fontSize: 14 }}>
        <input type="checkbox" checked={soloPato} onChange={(e) => setSoloPato(e.target.checked)} />
        Que lo vea solo Pato (tema personal)
      </label>
      <div className="fila" style={{ marginTop: 8 }}>
        <FotoBoton texto={foto ? 'Foto lista ✓' : 'Agregar foto'} onFoto={setFoto} />
        <button className="btn chico" disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviar'}</button>
      </div>

      {resueltos.length > 0 && (
        <>
          <h3 className="sub">Ya resuelto</h3>
          {resueltos.map((a) => <Tarjeta key={a.id} a={a} />)}
        </>
      )}
    </>
  )
}

function Tarjeta({ a }: { a: AvisoEquipo }) {
  return (
    <div className="tarjeta">
      <div className="estado-linea">
        <span>{a.mio ? 'Vos' : a.nombre} · {nombreDia(a.fecha)} {horaCorta(a.created_at)}</span>
        <span className={a.resuelto ? 'okc' : 'pend'}>{a.resuelto ? 'Resuelto' : 'Pendiente'}</span>
      </div>
      <div>{a.texto}</div>
    </div>
  )
}
