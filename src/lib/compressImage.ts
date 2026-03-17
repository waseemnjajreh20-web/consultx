/**
 * Compress a base64 data URL image to a smaller JPEG.
 * Resizes to max dimensions and re-encodes at reduced quality.
 *
 * @param dataUrl - Source data URL (any image format: jpeg, png, webp)
 * @param maxDim  - Max width or height in pixels (default 1280)
 * @param quality - JPEG quality 0–1 (default 0.78)
 * @returns Compressed data:image/jpeg;base64,... string
 */
export function compressImage(
  dataUrl: string,
  maxDim = 1280,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if exceeds maxDim on either axis
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    // On error, return original uncompressed (safe fallback)
    img.onerror = () => {
      console.warn("[compressImage] Failed to load image for compression, using original");
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}
