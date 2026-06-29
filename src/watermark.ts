import axios from "axios";
import sharp from "sharp";

// Logo SVG de Lorenzo Propiedades (azul marino sobre blanco semitransparente)
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">
  <!-- Círculo de fondo blanco semitransparente -->
  <circle cx="130" cy="130" r="125" fill="white" fill-opacity="0.92" stroke="#1a2a4a" stroke-width="3"/>

  <!-- Techo / chevron -->
  <polyline
    points="60,118 130,58 200,118"
    fill="none"
    stroke="#1a2a4a"
    stroke-width="14"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- Texto LORENZO -->
  <text
    x="130" y="158"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="36"
    font-weight="bold"
    letter-spacing="5"
    fill="#1a2a4a"
    text-anchor="middle"
  >LORENZO</text>

  <!-- Línea separadora -->
  <line x1="72" y1="167" x2="188" y2="167" stroke="#1a2a4a" stroke-width="1.5"/>

  <!-- Texto PROPIEDADES -->
  <text
    x="130" y="188"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="16"
    letter-spacing="4"
    fill="#1a2a4a"
    text-anchor="middle"
  >PROPIEDADES</text>
</svg>`;

const LOGO_BUFFER = Buffer.from(LOGO_SVG);

/**
 * Descarga una foto de propiedad, le aplica la marca de agua de Lorenzo Propiedades
 * en la esquina inferior derecha, y devuelve el buffer JPEG resultante.
 */
export async function applyWatermark(imageUrl: string): Promise<Buffer> {
  // 1. Descargar la foto original
  const { data } = await axios.get<ArrayBuffer>(imageUrl, {
    responseType: "arraybuffer",
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const originalBuffer = Buffer.from(data);

  // 2. Obtener dimensiones de la imagen original
  const meta = await sharp(originalBuffer).metadata();
  const imgWidth = meta.width ?? 1024;
  const imgHeight = meta.height ?? 576;

  // 3. Redimensionar el logo: 22% del ancho de la foto, mínimo 140px
  const logoSize = Math.max(140, Math.round(imgWidth * 0.22));

  const logoResized = await sharp(LOGO_BUFFER)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 4. Posición: esquina inferior derecha con margen del 2.5%
  const margin = Math.round(imgWidth * 0.025);
  const left = imgWidth - logoSize - margin;
  const top = imgHeight - logoSize - margin;

  // 5. Compositar logo sobre la foto original
  const result = await sharp(originalBuffer)
    .composite([{ input: logoResized, left, top, blend: "over" }])
    .jpeg({ quality: 88 })
    .toBuffer();

  return result;
}
