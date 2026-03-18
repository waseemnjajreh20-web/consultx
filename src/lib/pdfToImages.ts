import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore — Vite ?url suffix resolves this at build time
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Converts a PDF File into an array of base64 JPEG data URLs (one per page).
 * @param file      The PDF File object
 * @param maxPages  Maximum pages to render (default 20)
 * @param scale     Render scale for quality vs size trade-off (default 1.2)
 */
export async function pdfToBase64Images(
  file: File,
  maxPages = 20,
  scale = 1.2
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, maxPages);
  const results: string[] = [];

  try {
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx as any, viewport }).promise;
      results.push(canvas.toDataURL("image/jpeg", 0.85));
    }
  } finally {
    pdf.destroy();
  }

  return results;
}
