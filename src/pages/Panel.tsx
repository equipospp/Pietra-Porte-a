import { useCallback, useEffect, useMemo, useState } from 'react'
import { diaSemana, fechaLarga, horaCorta, inicioSemana, nombreDia } from '../lib/fecha'
import { supabase } from '../lib/supabase'
import type { Aviso, Conteo, Persona, Producto, Revision, Sector, Tarea, TareaHecha } from '../lib/tipos'

type Informe = { fecha: string; pizzas: number | null; empanadas: number | null; fugazzetas_desarmadas: number | null; nota: string | null }
type Recep = { id: number; producto_id: number; cantidad: number | null; estado: string; nota: string | null; persona_id: string }
type Prod = { producto_id: number; cantidad: number }

// Envío del día según la regla de 3 envíos: martes, jueves y sábado
const ENVIO: Record<number, 'obj_martes' | 'obj_jueves' | 'obj_sabado' | undefined> = { 2: 'obj_martes', 4: 'obj_jueves', 6: 'obj_sabado' }

function toca(t: Tarea, fecha: string) {
  if (!t.activa || !t.dias.includes(diaSemana(fecha))) return false
  if (t.frecuencia === 'mensual') return Number(fecha.slice(8, 10)) <= 7
  return true
}

export default function Panel({ fechaHoy }: { fechaHoy: string }) {
  const [fecha, setFecha] = useState(fechaHoy)
  const [vista, setVista] = useState<'dia' | 'pedido'>('dia')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [hechas, setHechas] = useState<TareaHecha[]>([])
  const [sectores, setSectores] = useState<Sector[]>([])
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [conteos, setConteos] = useState<Conteo[]>([])
  const [productos, setProductos] = useState<(Producto & Record<string, any>)[]>([])
  const [produccion, setProduccion] = useState<Prod[]>([])
  const [recepciones, setRecepciones] = useState<Recep[]>([])
  const [informe, setInforme] = useState<Informe | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const cargar = useCallback(async () => {
    setListo(false)
    const r = await Promise.all([
      supabase.from('personas').select('*').eq('activo', true).eq('rol', 'empleado').order('orden'),
      supabase.from('tareas').select('*').eq('activa', true).order('orden'),
      supabase.from('tareas_hechas').select('*').gte('fecha', inicioSemana(fecha)).lte('fecha', fecha),
      supabase.from('sectores').select('*'),
      supabase.from('revisiones').select('*').eq('fecha', fecha),
      supabase.from('avisos').select('*').or(`resuelto.eq.false,fecha.eq.${fecha}`).order('created_at', { ascending: false }),
      supabase.from('stock_conteos').select('*').eq('fecha', fecha),
      supabase.from('productos').select('*').eq('activo', true).order('orden'),
      supabase.from('produccion').select('producto_id,cantidad').eq('fecha', fecha),
      supabase.from('recepciones').select('*').eq('fecha', fecha).order('created_at'),
      supabase.from('informes_cierre').select('*').eq('fecha', fecha).maybeSingle(),
    ])
    const err = r.find((x) => x.error)?.error
    setError(err ? err.message : null)
    setPersonas((r[0].data as Persona[]) ?? [])
    setTareas((r[1].data as Tarea[]) ?? [])
    setHechas((r[2].data as TareaHecha[]) ?? [])
    setSectores((r[3].data as Sector[]) ?? [])
    setRevisiones((r[4].data as Revision[]) ?? [])
    setAvisos((r[5].data as Aviso[]) ?? [])
    setConteos((r[6].data as Conteo[]) ?? [])
    setProductos((r[7].data as any[]) ?? [])
    setProduccion((r[8].data as Prod[]) ?? [])
    setRecepciones((r[9].data as Recep[]) ?? [])
    setInforme((r[10].data as Informe) ?? null)

    const rutas = [
      ...((r[2].data as TareaHecha[]) ?? []).filter((h) => h.fecha === fecha).map((h) => h.foto_path),
      ...((r[4].data as Revision[]) ?? []).map((x) => x.foto_path),
      ...((r[5].data as Aviso[]) ?? []).map((a) => a.foto_path),
    ].filter(Boolean) as string[]
    if (rutas.length) {
      const { data } = await supabase.storage.from('fotos').createSignedUrls(rutas, 3600)
      const m: Record<string, string> = {}
      for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl
      setUrls(m)
    } else setUrls({})
    setListo(true)
  }, [fecha])

  useEffect(() => { cargar() }, [cargar])

  const nombreProducto = (id: number) => productos.find((p) => p.id === id)?.nombre ?? '—'
  const nombrePersona = (id: string) => personas.find((p) => p.id === id)?.nombre ?? 'Pato'

  const resolver = async (a: Aviso) => {
    const { error } = await supabase.from('avisos').update({ resuelto: true }).eq('id', a.id)
    if (error) setError(error.message)
    else cargar()
  }

  return (
    <main>
      <div className="fila" style={{ marginBottom: 8 }}>
        <input className="entrada" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button className="btn sec chico" onClick={() => setFecha(fechaHoy)}>Hoy</button>
        <button className="btn sec chico" onClick={cargar}>Actualizar</button>
      </div>
      <div className="seg" style={{ marginBottom: 8 }}>
        <button className={vista === 'dia' ? 'on' : ''} onClick={() => setVista('dia')}>Panel del día</button>
        <button className={vista === 'pedido' ? 'on' : ''} onClick={() => setVista('pedido')}>Stock y pedido</button>
      </div>
      {error && <div className="aviso-error">{error}</div>}
      {!listo ? <div className="vacio">Cargando…</div> : vista === 'dia' ? (
        <>
          <h2 className="banda">{fechaLarga(fecha)}</h2>
          <div className="grid-personas">
            {personas.map((p) => {
              const deP = tareas.filter((t) => t.persona_slug === p.slug && toca(t, fecha))
              const hecha = (t: Tarea) =>
                t.frecuencia === 'semanal' ? hechas.find((h) => h.tarea_id === t.id) : hechas.find((h) => h.tarea_id === t.id && h.fecha === fecha)
              const ok = deP.filter((t) => hecha(t))
              const pend = deP.filter((t) => !hecha(t))
              const fotos = hechas.filter((h) => h.fecha === fecha && h.persona_id === p.id && h.foto_path)
              const nConteos = conteos.filter((c) => c.persona_id === p.id).length
              return (
                <div key={p.id} className="tarjeta">
                  <div className="estado-linea"><strong className="bebas" style={{ fontSize: 20 }}>{p.nombre}</strong><span>{ok.length}/{deP.length} tareas</span></div>
                  <div className="progreso"><div style={{ width: `${deP.length ? (ok.length / deP.length) * 100 : 0}%` }} /></div>
                  <div className="estado-linea"><span>Productos contados</span><span>{nConteos}</span></div>
                  {pend.length > 0 && (
                    <details>
                      <summary className="pend" style={{ fontSize: 14, marginTop: 4 }}>{pend.length} sin marcar</summary>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 14 }}>{pend.map((t) => <li key={t.id}>{t.texto}</li>)}</ul>
                    </details>
                  )}
                  {fotos.length > 0 && (
                    <div className="fotos" style={{ marginTop: 8 }}>
                      {fotos.map((h) => urls[h.foto_path!] && (
                        <a key={h.id} href={urls[h.foto_path!]} target="_blank" rel="noreferrer" title={tareas.find((t) => t.id === h.tarea_id)?.texto}>
                          <img className="foto-mini" src={urls[h.foto_path!]} alt="" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <h2 className="banda">Revisiones al llegar</h2>
          {revisiones.length === 0 ? <div className="vacio">Sin revisiones cargadas.</div> : (
            <table className="simple">
              <thead><tr><th>Sector</th><th>Revisó</th><th>Estado</th></tr></thead>
              <tbody>
                {revisiones.map((r) => (
                  <tr key={r.id}>
                    <td>{sectores.find((s) => s.id === r.sector_id)?.nombre}</td>
                    <td>{nombrePersona(r.persona_id)}</td>
                    <td>
                      {r.estado === 'ok' ? <span className="okc">Bien</span> : <span className="pend">Pendiente</span>}
                      {r.comentario && <div style={{ fontSize: 13 }}>{r.comentario}</div>}
                      {r.foto_path && urls[r.foto_path] && <a href={urls[r.foto_path]} target="_blank" rel="noreferrer"><img className="foto-mini" src={urls[r.foto_path]} alt="" /></a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="banda">Avisos</h2>
          {avisos.length === 0 ? <div className="vacio">Sin avisos pendientes.</div> : avisos.map((a) => (
            <div key={a.id} className="tarjeta">
              <div className="estado-linea">
                <span>{nombrePersona(a.persona_id)} · {nombreDia(a.fecha)} {horaCorta(a.created_at)}</span>
                {a.resuelto ? <span className="okc">Resuelto</span> : <button className="btn sec chico" onClick={() => resolver(a)}>Marcar resuelto</button>}
              </div>
              <div>{a.texto}</div>
              {a.foto_path && urls[a.foto_path] && <a href={urls[a.foto_path]} target="_blank" rel="noreferrer"><img className="foto-mini" src={urls[a.foto_path]} alt="" /></a>}
            </div>
          ))}

          <h2 className="banda">Producción y recepción</h2>
          <div className="tarjeta">
            <h3 className="sub" style={{ marginTop: 0 }}>Producción</h3>
            {produccion.length === 0 ? <div className="ayuda">Sin carga.</div> :
              Array.from(new Set(produccion.map((x) => x.producto_id))).map((id) => (
                <div key={id} className="estado-linea"><span>{nombreProducto(id)}</span><span>{produccion.filter((x) => x.producto_id === id).reduce((s, x) => s + Number(x.cantidad), 0)}</span></div>
              ))}
            <h3 className="sub">Mercadería recibida</h3>
            {recepciones.length === 0 ? <div className="ayuda">Sin carga.</div> : recepciones.map((r) => (
              <div key={r.id} className="estado-linea">
                <span>{nombreProducto(r.producto_id)}{r.nota ? ` · ${r.nota}` : ''}</span>
                <span className={r.estado === 'completo' ? 'okc' : 'pend'}>{r.estado === 'no_llego' ? 'No llegó' : `${r.cantidad ?? ''} ${r.estado === 'parcial' ? '(parcial)' : ''}`}</span>
              </div>
            ))}
          </div>

          <h2 className="banda">Cierre de la noche</h2>
          {!informe ? <div className="vacio">Sin informe de cierre.</div> : (
            <div className="tarjeta">
              <div className="estado-linea"><span>Pizzas vendidas</span><strong>{informe.pizzas ?? '—'}</strong></div>
              <div className="estado-linea"><span>Empanadas vendidas</span><strong>{informe.empanadas ?? '—'}</strong></div>
              <div className="estado-linea"><span>Fugazzetas desarmadas</span><strong>{informe.fugazzetas_desarmadas ?? '—'}</strong></div>
              {informe.nota && <div style={{ fontSize: 14, marginTop: 6 }}>{informe.nota}</div>}
            </div>
          )}
        </>
      ) : (
        <Pedido fecha={fecha} productos={productos} conteos={conteos} personas={personas} />
      )}
    </main>
  )
}

function Pedido({ fecha, productos, conteos, personas }: { fecha: string; productos: (Producto & Record<string, any>)[]; conteos: Conteo[]; personas: Persona[] }) {
  const [copiado, setCopiado] = useState(false)
  const ludmila = personas.find((p) => p.slug === 'ludmila')
  const envio = ENVIO[diaSemana(fecha)]
  const filas = useMemo(() => {
    return productos
      .filter((p) => p.proveedor)
      .map((p) => {
        const c = conteos.find((x) => x.producto_id === p.id && x.momento === 'apertura' && x.persona_id === ludmila?.id)
        const obj = envio ? (p[envio] as number | null) : null
        const hay = c?.valor ?? null
        const pedir = obj !== null && hay !== null ? Math.max(0, Math.ceil((Number(obj) - Number(hay)) * 10) / 10) : null
        return { p, hay, obj, pedir }
      })
  }, [productos, conteos, envio, ludmila])

  const texto = useMemo(() => {
    const porProv = new Map<string, string[]>()
    for (const f of filas) if (f.pedir && f.pedir > 0) {
      const k = f.p.proveedor!
      porProv.set(k, [...(porProv.get(k) ?? []), `${f.p.nombre}: ${String(f.pedir).replace('.', ',')} ${f.p.unidad}`])
    }
    return Array.from(porProv.entries()).map(([prov, l]) => `*${prov}*\n${l.join('\n')}`).join('\n\n')
  }, [filas])

  return (
    <>
      <h2 className="banda">Stock de la mañana</h2>
      <p className="ayuda">
        Conteo de Ludmila del {fechaLarga(fecha).toLowerCase()}.{' '}
        {envio ? `Hoy hay envío: el pedido sugerido es el objetivo del envío menos lo que hay.` : 'Hoy no es día de envío (martes, jueves o sábado): se muestra solo el stock.'}{' '}
        Los objetivos son provisorios y se ajustan con las dos semanas de prueba.
      </p>
      {envio && texto && (
        <div className="tarjeta suave">
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 14 }}>{texto}</pre>
          <button className="btn chico" style={{ marginTop: 8 }} onClick={() => navigator.clipboard.writeText(texto).then(() => setCopiado(true))}>
            {copiado ? 'Copiado ✓' : 'Copiar para WhatsApp'}
          </button>
        </div>
      )}
      <table className="simple">
        <thead><tr><th>Producto</th><th>Hay</th>{envio && <th>Objetivo</th>}{envio && <th>Pedir</th>}</tr></thead>
        <tbody>
          {filas.map(({ p, hay, obj, pedir }) => (
            <tr key={p.id}>
              <td>{p.nombre}<div style={{ fontSize: 12, color: 'var(--gris)' }}>{p.proveedor}</div></td>
              <td>{hay ?? '—'}</td>
              {envio && <td>{obj ?? '—'}</td>}
              {envio && <td className={pedir ? 'pend' : ''}>{pedir ? `${pedir} ${p.unidad}` : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
