import { useEffect, useState } from 'react'
import { claveDesdePin, correoInterno, supabase } from '../lib/supabase'

type Nombre = { slug: string; nombre: string }

export default function Login() {
  const [nombres, setNombres] = useState<Nombre[]>([])
  const [elegido, setElegido] = useState<Nombre | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    supabase.rpc('nombres_login').then(({ data, error }) => {
      if (error) setError('No se pudo cargar la lista. Revisá la conexión.')
      else setNombres((data as Nombre[]) ?? [])
    })
  }, [])

  useEffect(() => {
    if (pin.length !== 4 || !elegido) return
    setEnviando(true)
    supabase.auth
      .signInWithPassword({ email: correoInterno(elegido.slug), password: claveDesdePin(pin) })
      .then(({ error }) => {
        if (error) {
          setError('PIN incorrecto. Probá de nuevo.')
          setPin('')
        }
        setEnviando(false)
      })
  }, [pin, elegido])

  const tecla = (t: string) => {
    setError(null)
    if (t === '←') setPin((p) => p.slice(0, -1))
    else if (pin.length < 4) setPin((p) => p + t)
  }

  return (
    <div className="login">
      <img className="logo" src="/logo-blanco.png" alt="PIETRA Estilo Porteña" />
      {!elegido ? (
        <>
          <h1>¿Quién sos?</h1>
          <div className="nombres">
            {nombres.map((n) => (
              <button key={n.slug} onClick={() => { setElegido(n); setPin(''); setError(null) }}>
                {n.nombre}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1>Hola, {elegido.nombre}</h1>
          <div className="bebas" style={{ fontSize: 20 }}>Tu PIN</div>
          <div className="puntos">
            {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}
          </div>
          <div className="teclado">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((t, i) =>
              t === '' ? <button key={i} className="vacio-t" disabled /> : (
                <button key={i} disabled={enviando} onClick={() => tecla(t)}>{t}</button>
              ),
            )}
          </div>
          <button className="volver" onClick={() => { setElegido(null); setPin(''); setError(null) }}>
            No soy {elegido.nombre}
          </button>
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
