import { useRef } from 'react'

type Props = {
  onFoto: (archivo: File) => void
  texto?: string
  disabled?: boolean
  clase?: string
}

// Abre la cámara del celular (o la galería) y devuelve la foto elegida.
export default function FotoBoton({ onFoto, texto = 'Sacar foto', disabled, clase = 'btn sec chico' }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={clase} disabled={disabled} onClick={() => ref.current?.click()}>
        📷 {texto}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFoto(f)
        }}
      />
    </>
  )
}
