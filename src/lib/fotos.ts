import { supabase } from './supabase'

// Achica la foto antes de subirla (1280 px, JPEG) para que cargue rápido con datos móviles.
async function achicar(archivo: File, max = 1280): Promise<Blob> {
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
  if (error) throw error
  return ruta
}

export async function urlFoto(ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from('fotos').createSignedUrl(ruta, 3600)
  return data?.signedUrl ?? null
}
