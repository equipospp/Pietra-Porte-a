import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configurado, supabase } from './lib/supabase'
import { fechaLarga, fechaOperativa } from './lib/fecha'
import type { Persona } from './lib/tipos'
import Login from './pages/Login'
import Hoy from './pages/Hoy'
import Llegar from './pages/Llegar'
import Stock from './pages/Stock'
import Avisos from './pages/Avisos'
import Produccion from './pages/Produccion'
import Recepcion from './pages/Recepcion'
import Cierre from './pages/Cierre'
import Panel from './pages/Panel'

type Pestana = { clave: string; nombre: string }

// Pestañas propias de cada persona, además de Hoy / Al llegar / Stock / Avisos
const EXTRAS: Record<string, Pestana[]> = {
  gamaliel: [{ clave: 'produccion', nombre: 'Producción' }],
  pablo: [{ clave: 'recepcion', nombre: 'Recepción' }],
  yimi: [{ clave: 'cierre', nombre: 'Cierre' }],
}

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pestana, setPestana] = useState('hoy')
  const [fecha, setFecha] = useState(fechaOperativa())

  // La fecha operativa cambia sola (por ejemplo, a las 5:00)
  useEffect(() => {
    const t = setInterval(() => setFecha(fechaOperativa()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setPersona(null)
    setError(null)
    if (!sesion) return
    supabase
      .from('personas')
      .select('*')
      .eq('auth_id', sesion.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (!data) setError('Tu usuario no está asociado a ninguna persona activa. Avisale a Pato.')
        else setPersona(data as Persona)
      })
  }, [sesion])

  const pestanas = useMemo<Pestana[]>(() => {
    if (!persona) return []
    return [
      { clave: 'hoy', nombre: 'Hoy' },
      ...(persona.slug === 'yimi' ? [] : [{ clave: 'llegar', nombre: 'Al llegar' }]),
      { clave: 'stock', nombre: 'Stock' },
      ...(EXTRAS[persona.slug] ?? []),
      { clave: 'avisos', nombre: 'Avisos' },
    ]
  }, [persona])

  if (!configurado) {
    return (
      <main>
        <h2 className="banda">Falta configurar</h2>
        <p>Cargá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver README).</p>
      </main>
    )
  }
  if (cargando) return <div className="vacio">Cargando…</div>
  if (!sesion) return <Login />

  const salir = async () => {
    await supabase.auth.signOut()
    setPestana('hoy')
  }

  if (error) {
    return (
      <main>
        <div className="aviso-error">{error}</div>
        <button className="btn sec" onClick={salir}>Salir</button>
      </main>
    )
  }
  if (!persona) return <div className="vacio">Cargando…</div>

  return (
    <>
      <header className="barra">
        <img src="/logo-blanco.png" alt="PIETRA" />
        <div className="quien">
          <div className="nombre">{persona.nombre}</div>
          <div className="turno">{persona.turno}</div>
        </div>
        <button className="salir" onClick={salir}>Salir</button>
      </header>
      <div className="fecha-band">{fechaLarga(fecha)}</div>

      {persona.rol === 'admin' ? (
        <Panel fechaHoy={fecha} />
      ) : (
        <>
          <main>
            {pestana === 'hoy' && <Hoy persona={persona} fecha={fecha} />}
            {pestana === 'llegar' && <Llegar persona={persona} fecha={fecha} />}
            {pestana === 'stock' && <Stock persona={persona} fecha={fecha} />}
            {pestana === 'produccion' && <Produccion fecha={fecha} />}
            {pestana === 'recepcion' && <Recepcion fecha={fecha} />}
            {pestana === 'cierre' && <Cierre fecha={fecha} />}
            {pestana === 'avisos' && <Avisos persona={persona} fecha={fecha} />}
          </main>
          <nav className="tabs">
            {pestanas.map((p) => (
              <button key={p.clave} className={pestana === p.clave ? 'activa' : ''} onClick={() => setPestana(p.clave)}>
                {p.nombre}
              </button>
            ))}
          </nav>
        </>
      )}
    </>
  )
}
