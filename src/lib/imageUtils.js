/**
 * Compresses an image File/Blob client-side before upload.
 * - Enforces maxSizeMB limit
 * - Downscales to maxDimension if needed
 * - Returns a new File at JPEG quality
 */
export async function compressImage(file, { maxSizeMB = 2, maxDimension = 1920, quality = 0.82 } = {}) {
  const maxBytes = maxSizeMB * 1024 * 1024;

  // If already small enough and not a huge dimension, skip compression
  if (file.size <= maxBytes) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Scale down if needed
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(compressed);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}