// Fecha operativa: el día de trabajo en Argentina. Hasta las 5:00 de la mañana
// sigue contando como el día anterior (el cierre de la noche termina ~1:30).
const ZONA = 'America/Argentina/Buenos_Aires'
const CORTE_HORAS = 5

export function fechaOperativa(ahora = new Date()): string {
  const corrida = new Date(ahora.getTime() - CORTE_HORAS * 3600 * 1000)
  return corrida.toLocaleDateString('en-CA', { timeZone: ZONA }) // YYYY-MM-DD
}

// 0 = domingo ... 6 = sábado
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// La semana del local va de martes a domingo
export function inicioSemana(fecha: string): string {
  const dif = (diaSemana(fecha) - 2 + 7) % 7
  return sumarDias(fecha, -dif)
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function nombreDia(fecha: string): string {
  return DIAS[diaSemana(fecha)]
}

export function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `${nombreDia(fecha)} ${d} de ${MESES[m - 1]}`
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' })
}
