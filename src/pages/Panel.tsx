import { useCallback, useEffect, useMemo, useState } from 'react'
import { diaSemana, fechaLarga, horaCorta, inicioSemana, nombreDia, sumarDias } from '../lib/fecha'
import { supabase } from '../lib/supabase'
import type { Aviso, Persona, Producto, Revision, Sector, Tarea, TareaHecha } from '../lib/tipos'
import { NOMBRE_MOMENTO_STOCK } from '../lib/tipos'
import '../panel.css'

// Panel de Pato: todo lo que cargó el equipo, en detalle y actualizado.

type Conteo = { id: number; producto_id: number; fecha: string; momento: 'apertura' | 'inicio' | 'cierre'; valor: number | null; estado: 'hay' | 'poco' | 'no' | null; persona_id: string; updated_at: string }
type Lista = { persona_slug: string; producto_id: number; momento: 'apertura' | 'inicio' | 'cierre'; modo: string }
type Prod = { id: number; producto_id: number; cantidad: number; persona_id: string; created_at: string }
type CantDia = { persona_slug: string; texto: string; cantidad: number | null; unidad: string }
type Informe = { pizzas: number | null; empanadas: number | null; fugazzetas_desarmadas: number | null; nota: string | null; persona_id: string; updated_at: string }
type Recep = { id: number; producto_id: number; cantidad: number | null; estado: string; nota: string | null; persona_id: string }
type ProductoObj = Producto & { obj_martes: number | null; obj_jueves: number | null; obj_sabado: number | null }

type Vista = 'equipo' | 'stock' | 'pedido' | 'avisos'
const MOMENTO_TAREA: Record<string, string> = { llegar: 'Al llegar', turno: 'En el turno', irse: 'Al irse' }
const ORDEN_MOMENTO: Record<string, number> = { llegar: 1, turno: 2, irse: 3 }

function toca(t: Tarea, fecha: string) {
  if (!t.activa || !t.dias.includes(diaSemana(fecha))) return false
  if (t.frecuencia === 'mensual') return Number(fecha.slice(8, 10)) <= 7
  return true
}
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(Math.round(Number(n) * 100) / 100).replace('.', ','))

// Objetivo diario provisorio: la mitad del objetivo del envío que cubre ese día
// (mar-mié: martes · jue-vie: jueves · sáb-dom: sábado). Lunes cerrado.
function objetivoDia(p: ProductoObj, dow: number): number | null {
  const o = dow === 2 || dow === 3 ? p.obj_martes : dow === 4 || dow === 5 ? p.obj_jueves : dow === 6 || dow === 0 ? p.obj_sabado : null
  return o === null || o === undefined ? null : Number(o) / 2
}
function proximoAbierto(fecha: string) {
  const f = sumarDias(fecha, 1)
  return diaSemana(f) === 1 ? sumarDias(f, 1) : f
}

export default function Panel({ fechaHoy }: { fechaHoy: string }) {
  const [fecha, setFecha] = useState(fechaHoy)
  const [vista, setVista] = useState<Vista>('equipo')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [hechas, setHechas] = useState<TareaHecha[]>([])
  const [sectores, setSectores] = useState<Sector[]>([])
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [conteos, setConteos] = useState<Conteo[]>([])
  const [listas, setListas] = useState<Lista[]>([])
  const [productos, setProductos] = useState<ProductoObj[]>([])
  const [produccion, setProduccion] = useState<Prod[]>([])
  const [cantidades, setCantidades] = useState<CantDia[]>([])
  const [recepciones, setRecepciones] = useState<Recep[]>([])
  const [informe, setInforme] = useState<Informe | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [actualizado, setActualizado] = useState<Date | null>(null)

  const cargar = useCallback(async () => {
    const r = await Promise.all([
      supabase.from('personas').select('*').eq('activo', true).order('orden'),
      supabase.from('tareas').select('*').eq('activa', true).order('orden'),
      supabase.from('tareas_hechas').select('*').gte('fecha', inicioSemana(fecha)).lte('fecha', fecha),
      supabase.from('sectores').select('*'),
      supabase.from('revisiones').select('*').eq('fecha', fecha),
      supabase.from('avisos').select('*').or(`resuelto.eq.false,fecha.eq.${fecha}`).order('created_at', { ascending: false }),
      supabase.from('stock_conteos').select('*').eq('fecha', fecha),
      supabase.from('conteo_listas').select('persona_slug,producto_id,momento,modo'),
      supabase.from('productos').select('*').eq('activo', true).order('orden'),
      supabase.from('produccion').select('*').eq('fecha', fecha).order('created_at'),
      supabase.from('cantidades_dia').select('persona_slug,texto,cantidad,unidad').eq('dia', diaSemana(fecha)).order('id'),
      supabase.from('recepciones').select('*').eq('fecha', fecha).order('created_at'),
      supabase.from('informes_cierre').select('*').eq('fecha', fecha).maybeSingle(),
    ])
    const err = r.find((x) => x.error)?.error
    if (err) { setError(`No se pudo actualizar (${err.message}). Revisá la conexión.`); setListo(true); return }
    setError(null)
    setPersonas((r[0].data as Persona[]) ?? [])
    setTareas((r[1].data as Tarea[]) ?? [])
    setHechas((r[2].data as TareaHecha[]) ?? [])
    setSectores((r[3].data as Sector[]) ?? [])
    setRevisiones((r[4].data as Revision[]) ?? [])
    setAvisos((r[5].data as Aviso[]) ?? [])
    setConteos((r[6].data as Conteo[]) ?? [])
    setListas((r[7].data as Lista[]) ?? [])
    setProductos((r[8].data as ProductoObj[]) ?? [])
    setProduccion((r[9].data as Prod[]) ?? [])
    setCantidades((r[10].data as CantDia[]) ?? [])
    setRecepciones((r[11].data as Recep[]) ?? [])
    setInforme((r[12].data as Informe) ?? null)

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
    setActualizado(new Date())
    setListo(true)
  }, [fecha])

  useEffect(() => { setListo(false); cargar() }, [cargar])
  // Se actualiza solo cada minuto y al volver a la app
  useEffect(() => {
    const t = setInterval(cargar, 60_000)
    const v = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [cargar])

  const empleados = personas.filter((p) => p.rol === 'empleado')
  const nombreDe = (id: string) => personas.find((p) => p.id === id)?.nombre ?? '—'
  const prod = (id: number) => productos.find((p) => p.id === id)
  const avisosPend = avisos.filter((a) => !a.resuelto)

  // Resumen por persona
  const resumen = useMemo(() => empleados.map((p) => {
    const suyas = tareas.filter((t) => t.persona_slug === p.slug && toca(t, fecha))
      .sort((a, b) => ORDEN_MOMENTO[a.momento] - ORDEN_MOMENTO[b.momento] || a.orden - b.orden)
    const hechaDe = (t: Tarea) => t.frecuencia === 'semanal' ? hechas.find((h) => h.tarea_id === t.id) : hechas.find((h) => h.tarea_id === t.id && h.fecha === fecha)
    const filas = suyas.map((t) => ({ t, h: hechaDe(t) }))
    const momentos = Array.from(new Set(listas.filter((l) => l.persona_slug === p.slug).map((l) => l.momento)))
    const stock = momentos.map((m) => {
      const ids = new Set(listas.filter((l) => l.persona_slug === p.slug && l.momento === m && prod(l.producto_id)).map((l) => l.producto_id))
      const cs = conteos.filter((c) => c.persona_id === p.id && c.momento === m && ids.has(c.producto_id))
      const ultima = cs.map((c) => c.updated_at).sort().at(-1)
      return { m, total: ids.size, cargados: cs.length, ultima }
    })
    return { p, filas, hechasN: filas.filter((f) => f.h).length, stock, revs: revisiones.filter((r) => r.persona_id === p.id) }
  }), [empleados, tareas, hechas, listas, conteos, revisiones, productos, fecha])

  const faltantes = conteos.filter((c) => c.valor === 0 || c.estado === 'no' || c.estado === 'poco')

  return (
    <main className="panel">
      <div className="fila" style={{ marginBottom: 8 }}>
        <button className="btn sec chico" style={{ flex: 'none' }} onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior">‹</button>
        <input className="entrada" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button className="btn sec chico" style={{ flex: 'none' }} onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente">›</button>
        {fecha !== fechaHoy && <button className="btn sec chico" style={{ flex: 'none' }} onClick={() => setFecha(fechaHoy)}>Hoy</button>}
      </div>
      <div className="actualizado">
        {fechaLarga(fecha)} · {actualizado ? `actualizado ${horaCorta(actualizado.toISOString())}` : 'cargando…'} ·{' '}
        <button className="link" onClick={cargar}>actualizar</button>
      </div>

      <div className="kpis">
        <button className={`kpi ${vista === 'equipo' ? 'on' : ''}`} onClick={() => setVista('equipo')}>
          <b>{resumen.reduce((s, x) => s + x.hechasN, 0)}/{resumen.reduce((s, x) => s + x.filas.length, 0)}</b><span>tareas</span>
        </button>
        <button className={`kpi ${vista === 'stock' ? 'on' : ''} ${faltantes.length ? 'alerta' : ''}`} onClick={() => setVista('stock')}>
          <b>{faltantes.length}</b><span>faltantes</span>
        </button>
        <button className={`kpi ${vista === 'pedido' ? 'on' : ''}`} onClick={() => setVista('pedido')}>
          <b>🛒</b><span>pedido</span>
        </button>
        <button className={`kpi ${vista === 'avisos' ? 'on' : ''} ${avisosPend.length ? 'alerta' : ''}`} onClick={() => setVista('avisos')}>
          <b>{avisosPend.length}</b><span>avisos</span>
        </button>
      </div>

      {error && <div className="aviso-error">{error}</div>}
      {!listo ? <div className="vacio">Cargando…</div> : (
        <>
          {vista === 'equipo' && (
            <>
              {resumen.map(({ p, filas, hechasN, stock, revs }) => {
                const pct = filas.length ? hechasN / filas.length : 1
                const color = filas.length === 0 ? '' : pct === 1 ? 'verde' : hechasN === 0 ? 'rojo' : 'amarillo'
                return (
                  <details key={p.id} className={`persona ${color}`} open={pct < 1}>
                    <summary>
                      <span className="nom">{p.nombre}</span>
                      <span className="turno-p">{p.turno}</span>
                      <span className="cuenta">{filas.length ? `${hechasN}/${filas.length}` : 'sin tareas'}</span>
                    </summary>
                    {filas.length > 0 && <div className="progreso"><div style={{ width: `${pct * 100}%` }} /></div>}
                    {(['llegar', 'turno', 'irse'] as const).map((m) => {
                      const deM = filas.filter((f) => f.t.momento === m)
                      if (!deM.length) return null
                      return (
                        <div key={m}>
                          <div className="momento">{MOMENTO_TAREA[m]}</div>
                          {deM.map(({ t, h }) => (
                            <div key={t.id} className={`t ${h ? 'si' : 'no'}`}>
                              <span className="ic">{h ? '✓' : '✗'}</span>
                              <span className="tx">{t.texto}{t.frecuencia !== 'diaria' && <span className="chip">{t.frecuencia}</span>}</span>
                              <span className="hr">
                                {h ? (h.fecha !== fecha ? nombreDia(h.fecha).slice(0, 3) : horaCorta(h.created_at)) : ''}
                                {h?.foto_path && urls[h.foto_path] && <a href={urls[h.foto_path]} target="_blank" rel="noreferrer"> 📷</a>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                    {stock.length > 0 && (
                      <>
                        <div className="momento">Stock</div>
                        {stock.map((s) => (
                          <div key={s.m} className={`t ${s.cargados >= s.total ? 'si' : 'no'}`}>
                            <span className="ic">{s.cargados >= s.total ? '✓' : '✗'}</span>
                            <span className="tx">{NOMBRE_MOMENTO_STOCK[s.m]}: {s.cargados} de {s.total}</span>
                            <span className="hr">{s.ultima ? horaCorta(s.ultima) : ''}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {revs.length > 0 && (
                      <>
                        <div className="momento">Revisó al llegar</div>
                        {revs.map((r) => (
                          <div key={r.id} className={`t ${r.estado === 'ok' ? 'si' : 'no'}`}>
                            <span className="ic">{r.estado === 'ok' ? '✓' : '!'}</span>
                            <span className="tx">{sectores.find((s) => s.id === r.sector_id)?.nombre}{r.comentario ? ` — ${r.comentario}` : ''}</span>
                            <span className="hr">{r.foto_path && urls[r.foto_path] && <a href={urls[r.foto_path]} target="_blank" rel="noreferrer">📷</a>}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </details>
                )
              })}

              <h2 className="banda">Producción</h2>
              <div className="tarjeta">
                {produccion.length === 0 ? <div className="ayuda">No se cargó producción.</div> : produccion.map((x) => (
                  <div key={x.id} className="estado-linea"><span>{prod(x.producto_id)?.nombre ?? '—'} <small>({nombreDe(x.persona_id)} {horaCorta(x.created_at)})</small></span><strong>{num(x.cantidad)}</strong></div>
                ))}
                {cantidades.length > 0 && (
                  <>
                    <h3 className="sub">Lo que tenía que quedar hoy</h3>
                    {cantidades.map((c, i) => (
                      <div key={i} className="estado-linea"><span>{c.texto} <small>({personas.find((p) => p.slug === c.persona_slug)?.nombre})</small></span><span>{c.cantidad === null ? 'a definir' : `${num(c.cantidad)} ${c.unidad}`}</span></div>
                    ))}
                  </>
                )}
              </div>

              <h2 className="banda">Recepción y cierre</h2>
              <div className="tarjeta">
                {recepciones.length === 0 ? <div className="ayuda">Sin mercadería recibida cargada.</div> : recepciones.map((r) => (
                  <div key={r.id} className="estado-linea">
                    <span>{prod(r.producto_id)?.nombre}{r.nota ? ` · ${r.nota}` : ''}</span>
                    <span className={r.estado === 'completo' ? 'okc' : 'pend'}>{r.estado === 'no_llego' ? 'No llegó' : `${num(r.cantidad)} ${r.estado === 'parcial' ? '(parcial)' : ''}`}</span>
                  </div>
                ))}
                <h3 className="sub">Cierre de la noche</h3>
                {!informe ? <div className="ayuda">Sin informe de cierre.</div> : (
                  <>
                    <div className="estado-linea"><span>Pizzas vendidas</span><strong>{num(informe.pizzas)}</strong></div>
                    <div className="estado-linea"><span>Empanadas vendidas</span><strong>{num(informe.empanadas)}</strong></div>
                    <div className="estado-linea"><span>Fugazzetas desarmadas</span><strong>{num(informe.fugazzetas_desarmadas)}</strong></div>
                    {informe.nota && <div style={{ fontSize: 14 }}>{informe.nota}</div>}
                    <div className="ayuda">Cargado por {nombreDe(informe.persona_id)} a las {horaCorta(informe.updated_at)}</div>
                  </>
                )}
              </div>
            </>
          )}

          {vista === 'stock' && <VistaStock conteos={conteos} productos={productos} nombreDe={nombreDe} />}
          {vista === 'pedido' && <Pedido fecha={fecha} productos={productos} conteos={conteos} personas={personas} />}
          {vista === 'avisos' && <VistaAvisos avisos={avisos} nombreDe={nombreDe} urls={urls} onCambio={cargar} setError={setError} />}
        </>
      )}
    </main>
  )
}

function VistaStock({ conteos, productos, nombreDe }: { conteos: Conteo[]; productos: ProductoObj[]; nombreDe: (id: string) => string }) {
  const [soloFaltantes, setSoloFaltantes] = useState(false)
  const esFalta = (c: Conteo) => c.valor === 0 || c.estado === 'no' || c.estado === 'poco'
  const conDatos = productos.filter((p) => conteos.some((c) => c.producto_id === p.id && (!soloFaltantes || esFalta(c))))
  const rubros = Array.from(new Set(conDatos.map((p) => p.rubro)))
  const orden = { apertura: 1, inicio: 2, cierre: 3 }
  return (
    <>
      <p className="ayuda">Todo lo que contó el equipo en el día: quién, en qué momento y a qué hora. Rojo = no hay / 0 · naranja = poco.</p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 8 }}>
        <input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} /> Ver solo faltantes y poco
      </label>
      {conDatos.length === 0 && <div className="vacio">{soloFaltantes ? 'Nadie marcó faltantes.' : 'Todavía nadie cargó stock este día.'}</div>}
      {rubros.map((r) => (
        <div key={r}>
          <h3 className="sub">{r}</h3>
          <table className="simple stock">
            <tbody>
              {conDatos.filter((p) => p.rubro === r).map((p) => {
                const cs = conteos.filter((c) => c.producto_id === p.id && (!soloFaltantes || esFalta(c))).sort((a, b) => orden[a.momento] - orden[b.momento])
                return cs.map((c, i) => (
                  <tr key={c.id} className={c.valor === 0 || c.estado === 'no' ? 'falta' : c.estado === 'poco' ? 'poco' : ''}>
                    {i === 0 && <td rowSpan={cs.length}>{p.nombre}<div className="prov">{p.proveedor ?? ''}</div></td>}
                    <td className="val">{c.estado ? (c.estado === 'no' ? 'No hay' : c.estado === 'poco' ? 'Poco' : 'Hay') : `${num(c.valor)} ${p.unidad}`}</td>
                    <td className="quien">{nombreDe(c.persona_id)} · {NOMBRE_MOMENTO_STOCK[c.momento].replace('Conteo de la mañana', 'mañana').toLowerCase()} · {horaCorta(c.updated_at)}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

function VistaAvisos({ avisos, nombreDe, urls, onCambio, setError }: { avisos: Aviso[]; nombreDe: (id: string) => string; urls: Record<string, string>; onCambio: () => void; setError: (e: string | null) => void }) {
  const resolver = async (a: Aviso) => {
    const { error } = await supabase.from('avisos').update({ resuelto: true }).eq('id', a.id)
    if (error) setError(error.message)
    else onCambio()
  }
  const pend = avisos.filter((a) => !a.resuelto)
  const res = avisos.filter((a) => a.resuelto)
  return (
    <>
      {pend.length === 0 && <div className="vacio">Sin avisos pendientes.</div>}
      {pend.map((a) => (
        <div key={a.id} className="tarjeta aviso-p">
          <div className="estado-linea">
            <strong>{nombreDe(a.persona_id)}</strong>
            <span>{nombreDia(a.fecha)} {horaCorta(a.created_at)}{!a.compartido && ' · solo para vos'}</span>
          </div>
          <div style={{ margin: '6px 0' }}>{a.texto}</div>
          {a.foto_path && urls[a.foto_path] && <a href={urls[a.foto_path]} target="_blank" rel="noreferrer"><img className="foto-mini" src={urls[a.foto_path]} alt="" /></a>}
          <button className="btn chico" onClick={() => resolver(a)}>Marcar resuelto</button>
        </div>
      ))}
      {res.length > 0 && <h3 className="sub">Resueltos de este día</h3>}
      {res.map((a) => (
        <div key={a.id} className="tarjeta" style={{ opacity: 0.7 }}>
          <div className="estado-linea"><span>{nombreDe(a.persona_id)} · {horaCorta(a.created_at)}</span><span className="okc">Resuelto</span></div>
          <div>{a.texto}</div>
        </div>
      ))}
    </>
  )
}

function Pedido({ fecha, productos, conteos, personas }: { fecha: string; productos: ProductoObj[]; conteos: Conteo[]; personas: Persona[] }) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const ludmila = personas.find((p) => p.slug === 'ludmila')
  const dow = diaSemana(fecha)
  const prox = proximoAbierto(fecha)
  const filas = useMemo(() => productos
    .filter((p) => p.proveedor && p.proveedor !== 'Elaboración propia')
    .map((p) => {
      const c = conteos.find((x) => x.producto_id === p.id && x.momento === 'apertura' && x.persona_id === ludmila?.id)
      const oh = objetivoDia(p, dow)
      const op = objetivoDia(p, diaSemana(prox))
      const obj = oh === null || op === null ? null : oh + op
      const hay = c?.valor ?? null
      const entero = !['kg'].includes(p.unidad)
      let pedir: number | null = null
      if (obj !== null && hay !== null) {
        const f = Math.max(0, obj - Number(hay))
        pedir = entero ? Math.ceil(f) : Math.ceil(f * 10) / 10
      }
      return { p, c, hay, obj, pedir }
    })
    .filter((f) => f.c), [productos, conteos, ludmila, dow, prox])

  const cargados = conteos.filter((x) => x.momento === 'apertura' && x.persona_id === ludmila?.id).length
  const porProv = new Map<string, string[]>()
  for (const f of filas) if (f.pedir && f.pedir > 0) porProv.set(f.p.proveedor!, [...(porProv.get(f.p.proveedor!) ?? []), `${f.p.nombre}: ${num(f.pedir)} ${f.p.unidad}`])
  const revisar = filas.filter((f) => f.obj === null && (f.hay === 0 || f.c?.estado === 'no' || f.c?.estado === 'poco'))

  if (dow === 1) return <div className="vacio">Lunes: el local está cerrado.</div>
  return (
    <>
      <p className="ayuda">
        Con el conteo de la mañana de Ludmila ({cargados} productos cargados). Pedido para cubrir hoy y el {nombreDia(prox).toLowerCase()}:
        objetivo de los dos días menos lo que hay. Objetivo diario provisorio = mitad del objetivo de envío; se ajusta con tus números.
      </p>
      {cargados === 0 && <div className="aviso-error">Ludmila todavía no cargó el stock de la mañana.</div>}
      {Array.from(porProv.entries()).map(([prov, l]) => {
        const texto = `*${prov}*\n${l.join('\n')}`
        return (
          <div key={prov} className="tarjeta suave">
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 15 }}>{texto}</pre>
            <button className="btn chico" style={{ marginTop: 8 }} onClick={() => navigator.clipboard.writeText(texto).then(() => setCopiado(prov))}>
              {copiado === prov ? 'Copiado ✓' : `Copiar para WhatsApp`}
            </button>
          </div>
        )
      })}
      {cargados > 0 && porProv.size === 0 && <div className="vacio">Con lo contado no hace falta pedir nada con objetivo cargado.</div>}
      {revisar.length > 0 && (
        <>
          <h3 className="sub">Revisar (sin objetivo cargado)</h3>
          {revisar.map((f) => <div key={f.p.id} className="estado-linea"><span>{f.p.nombre} <small>({f.p.proveedor})</small></span><span className="pend">{f.c?.estado === 'poco' ? 'Poco' : f.c?.estado === 'no' ? 'No hay' : `0 ${f.p.unidad}`}</span></div>)}
        </>
      )}
      {filas.length > 0 && (
        <>
          <h3 className="sub">Detalle</h3>
          <table className="simple">
            <thead><tr><th>Producto</th><th>Hay</th><th>Objetivo</th><th>Pedir</th></tr></thead>
            <tbody>
              {filas.map(({ p, hay, obj, pedir, c }) => (
                <tr key={p.id}>
                  <td>{p.nombre}<div className="prov">{p.proveedor}</div></td>
                  <td>{c?.estado ? c.estado : num(hay)}</td>
                  <td>{obj === null ? '—' : num(Math.round(obj * 10) / 10)}</td>
                  <td className={pedir ? 'pend' : ''}>{pedir ? `${num(pedir)} ${p.unidad}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
