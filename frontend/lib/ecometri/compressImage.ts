'use client';

const MAX_DIMENSION = 512;
const MAX_DECODED_BYTES = 350 * 1024;
const QUALITY_STEPS = [0.72, 0.6, 0.5, 0.4, 0.3];

export interface CompressedImageResult {
  base64: string;
  previewDataUrl: string;
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Compresses an image File on an offscreen canvas to max 512x512 JPEG
 * and steps down quality until decoded size is <= 350 KB.
 */
export async function compressImageToJpegBase64(
  file: File
): Promise<CompressedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen valido.');
  }

  const img = await loadImageFromFile(file);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  if (!srcWidth || !srcHeight) {
    throw new Error('Imagen vacia o corrupta.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcWidth, srcHeight));
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el compresor de imagen.');
  }

  // White backdrop for transparent PNGs before JPEG encoding
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) continue;
    const pureBase64 = dataUrl.slice(commaIdx + 1);
    if (estimateBase64Bytes(pureBase64) <= MAX_DECODED_BYTES) {
      return { base64: pureBase64, previewDataUrl: dataUrl };
    }
  }

  throw new Error('La imagen es demasiado grande incluso comprimida. Intenta con otra foto.');
}
