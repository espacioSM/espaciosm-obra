import { supabase } from './supabase'

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo)
    const imagen = new Image()
    imagen.onload = () => {
      URL.revokeObjectURL(url)
      resolver(imagen)
    }
    imagen.onerror = () => {
      URL.revokeObjectURL(url)
      rechazar(new Error('No se pudo leer la foto.'))
    }
    imagen.src = url
  })
}

function escribirLinea(
  contexto: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  ancho: number,
  altoLinea: number,
) {
  const palabras = texto.split(' ')
  let linea = ''
  let cursor = y

  for (const palabra of palabras) {
    const prueba = linea === '' ? palabra : `${linea} ${palabra}`
    if (contexto.measureText(prueba).width > ancho && linea !== '') {
      contexto.fillText(linea, x, cursor)
      cursor += altoLinea
      linea = palabra
    } else {
      linea = prueba
    }
  }

  if (linea !== '') {
    contexto.fillText(linea, x, cursor)
    cursor += altoLinea
  }

  return cursor
}

export async function prepararEvidencia(
  archivo: File,
  lineas: string[],
): Promise<Blob> {
  const imagen = await cargarImagen(archivo)
  const maxAncho = 1600
  const escala = Math.min(1, maxAncho / imagen.naturalWidth)
  const ancho = Math.round(imagen.naturalWidth * escala)
  const alto = Math.round(imagen.naturalHeight * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const contexto = lienzo.getContext('2d')

  if (!contexto) throw new Error('No se pudo preparar la imagen.')

  contexto.drawImage(imagen, 0, 0, ancho, alto)

  const tamano = Math.max(18, Math.round(ancho * 0.022))
  const altoLinea = Math.round(tamano * 1.35)
  const margen = Math.round(ancho * 0.025)
  const altoTexto = altoLinea * lineas.length + margen * 2

  contexto.fillStyle = 'rgba(0, 0, 0, 0.68)'
  contexto.fillRect(0, alto - altoTexto - 6, ancho, altoTexto + 6)
  contexto.fillStyle = '#f5cf16'
  contexto.fillRect(0, alto - altoTexto - 6, ancho, Math.max(3, Math.round(ancho * 0.003)))

  contexto.fillStyle = '#ffffff'
  contexto.font = `600 ${tamano}px "Helvetica Neue", Arial, sans-serif`
  contexto.textBaseline = 'top'

  let y = alto - altoTexto + margen
  for (const linea of lineas) {
    y = escribirLinea(contexto, linea, margen, y, ancho - margen * 2, altoLinea)
  }

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => {
        if (blob) resolver(blob)
        else rechazar(new Error('No se pudo comprimir la foto.'))
      },
      'image/jpeg',
      0.82,
    )
  })
}

export async function subirEvidencia(
  proyectoId: string,
  generadorId: string,
  archivo: File,
  lineas: string[],
): Promise<string> {
  const blob = await prepararEvidencia(archivo, lineas)
  const ruta = `${proyectoId}/${generadorId}/${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage.from('evidencias').upload(ruta, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })

  if (error) throw error
  return ruta
}

export async function urlEvidencia(ruta: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('evidencias')
    .createSignedUrl(ruta, 3600)

  if (error) return null
  return data?.signedUrl ?? null
}
