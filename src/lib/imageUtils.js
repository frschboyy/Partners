function targetDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  if (width > height) {
    return { width: maxDimension, height: Math.round((height * maxDimension) / width) };
  }
  return { width: Math.round((width * maxDimension) / height), height: maxDimension };
}

function canvasToCompressedFile(canvas, file, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob || blob.size === 0) { reject(new Error('Canvas toBlob failed')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      },
      'image/jpeg',
      quality
    );
  });
}

// Large camera photos (12-48MP+, common on Android) decoded via `new Image()`
// hold their full native resolution in memory for the whole compression call —
// a multi-hundred-MB spike that's a known source of silent canvas corruption on
// memory-constrained mobile GPUs, especially with several photos compressed in
// parallel. createImageBitmap lets each decode be released via .close() as soon
// as we're done with it, and the resize decode itself never needs to
// materialize the full-resolution raster the way `new Image()` does.
async function compressViaImageBitmap(file, maxDimension, quality) {
  const probe = await createImageBitmap(file);
  const target = targetDimensions(probe.width, probe.height, maxDimension);
  probe.close();

  const bitmap = await createImageBitmap(file, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();
  return canvasToCompressedFile(canvas, file, quality);
}

function compressViaImageElement(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const target = targetDimensions(img.width, img.height, maxDimension);
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      canvas.getContext('2d').drawImage(img, 0, 0, target.width, target.height);
      canvasToCompressedFile(canvas, file, quality).then(resolve, reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

/**
 * Compresses an image File/Blob client-side before upload.
 * - Enforces maxSizeMB limit
 * - Downscales to maxDimension if needed
 * - Returns a new File at JPEG quality
 */
export async function compressImage(file, { maxSizeMB = 2, maxDimension = 1920, quality = 0.82 } = {}) {
  const maxBytes = maxSizeMB * 1024 * 1024;

  // If already small enough, skip compression entirely
  if (file.size <= maxBytes) {
    return file;
  }

  if (typeof createImageBitmap === 'function') {
    try {
      return await compressViaImageBitmap(file, maxDimension, quality);
    } catch (_) {
      // fall through to the slower but more broadly-compatible path below
    }
  }

  return compressViaImageElement(file, maxDimension, quality);
}
