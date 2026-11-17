import { supabase } from './supabase'

// Achica la foto antes de subirla (JPEG chico) para que cargue rápido con datos móviles
// y sin usar mucha memoria del teléfono.
async function achicar(archivo: File, max = 1280): Promise<Blob> {
  // Forma liviana: el navegador decodifica la foto ya achicada
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(archivo, { resizeWidth: 960, resizeQuality: 'medium' })
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width
      canvas.height = bmp.height
      canvas.getContext('2d')!.drawImage(bmp, 0, 0)
      bmp.close()
      const b = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.7))
      canvas.width = canvas.height = 0
      if (b) return b
    } catch { /* sigue con la forma clásica */ }
  }
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = mal
      i.src = url
    })
    const escala = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b ?? archivo), 'image/jpeg', 0.72))
  } catch {
    return archivo
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function subirFoto(archivo: File, fecha: string, tipo: string): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id
  if (!uid) throw new Error('Sesión vencida: volvé a entrar')
  const blob = await achicar(archivo)
  const ruta = `${uid}/${fecha}/${tipo}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(`No se pudo subir la foto (${error.message}). Revisá la señal y probá de nuevo.`)
  return ruta
}

export async function urlFoto(ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from('fotos').createSignedUrl(ruta, 3600)
  return data?.signedUrl ?? null
}

// Varias fotos a la vez (para mostrarlas en pantalla)
export async function urlsFotos(rutas: string[]): Promise<Record<string, string>> {
  if (!rutas.length) return {}
  try {
    const { data } = await supabase.storage.from('fotos').createSignedUrls(rutas, 3600)
    const m: Record<string, string> = {}
    for (const d of data ?? []) if (d.path && d.signedUrl) m[d.path] = d.signedUrl
    return m
  } catch {
    return {}
  }
}
