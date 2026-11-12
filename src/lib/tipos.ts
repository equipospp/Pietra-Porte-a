export type Persona = {
  id: string
  slug: string
  nombre: string
  rol: 'empleado' | 'admin'
  turno: string | null
  auth_id: string | null
  activo: boolean
  orden: number
}

export type Momento = 'llegar' | 'turno' | 'irse'

export type Tarea = {
  id: number
  persona_slug: string
  momento: Momento
  texto: string
  detalle: string | null
  dias: number[]
  frecuencia: 'diaria' | 'semanal' | 'mensual'
  pide_foto: boolean
  activa: boolean
  orden: number
}

export type TareaHecha = {
  id: number
  tarea_id: number
  fecha: string
  persona_id: string
  foto_path: string | null
  created_at: string
}

export type Sector = { id: number; nombre: string; revisa_slug: string; dias: number[]; orden: number; activo: boolean }

export type Revision = {
  id: number
  sector_id: number
  fecha: string
  estado: 'ok' | 'pendiente'
  comentario: string | null
  foto_path: string | null
  persona_id: string
  created_at: string
}

export type Producto = {
  id: number
  nombre: string
  rubro: string
  unidad: string
  proveedor: string | null
  activo: boolean
  orden: number
}

export type MomentoStock = 'apertura' | 'inicio' | 'cierre'
export type ModoConteo = 'pesa' | 'cuenta' | 'estado'

export type ItemLista = {
  id: number
  persona_slug: string
  producto_id: number
  momento: MomentoStock
  modo: ModoConteo
  orden: number
  productos: Pick<Producto, 'nombre' | 'unidad' | 'rubro' | 'activo'>
}

export type Conteo = {
  producto_id: number
  fecha: string
  momento: MomentoStock
  valor: number | null
  estado: 'hay' | 'poco' | 'no' | null
  persona_id?: string
}

export type CantidadDia = {
  id: number
  persona_slug: string
  clave: string
  texto: string
  dia: number
  cantidad: number | null
  unidad: string
}

export type Aviso = {
  id: number
  persona_id: string
  fecha: string
  texto: string
  foto_path: string | null
  resuelto: boolean
  compartido: boolean
  created_at: string
}

export const NOMBRE_MOMENTO_STOCK: Record<MomentoStock, string> = {
  apertura: 'Conteo de la mañana',
  inicio: 'Al llegar',
  cierre: 'Al cierre',
}
