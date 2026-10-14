/** Downscale a chosen photo to a JPEG before it is posted. The blob is not stored. */

const MAX_EDGE = 1024;
const MAX_JPEG_BYTES = 1_200_000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < 1 || img.naturalHeight < 1) {
        reject(new Error('bad_image'));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad_image'));
    };
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Longest side ~1024px, JPEG, small enough for the speak function. */
export async function downscaleToJpeg(file: Blob): Promise<Blob> {
  if (file.size > 15 * 1024 * 1024) throw new Error('too_large');
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  let quality = 0.82;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > MAX_JPEG_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToJpeg(canvas, quality);
  }
  if (blob.size > 1_500_000) throw new Error('too_large');
  return blob;
}
