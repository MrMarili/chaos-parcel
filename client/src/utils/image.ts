import { MAX_AVATAR_LENGTH } from '@chaos-parcel/shared';

const TARGET_SIZE = 128;

/**
 * Reads an image File, crops it to a centered square, resizes to a small
 * thumbnail, and returns a compressed JPEG data URL that fits within the
 * protocol's avatar size limit.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await loadImage(file);

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('לא ניתן לעבד את התמונה');

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }

  // Reduce quality until the encoded data URL fits under the limit.
  for (const quality of [0.7, 0.55, 0.4, 0.3]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_AVATAR_LENGTH) {
      return dataUrl;
    }
  }

  throw new Error('התמונה גדולה מדי — נסה תמונה אחרת');
}

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('לא ניתן לטעון את התמונה'));
    };
    img.src = url;
  });
}
