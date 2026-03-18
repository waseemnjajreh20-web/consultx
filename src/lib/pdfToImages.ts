import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Use Vite-bundled worker (guaranteed version match, no CDN dependency)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Convert a PDF file to an array of base64 PNG data URLs (one per page).
 * @param file - The PDF File object
 * @param maxPages - Maximum number of pages to convert (default 10)
 * @param scale - Render scale (1.5 = good quality/size balance)
 * @returns Array of data:image/png;base64,... strings
 */
export async function pdfToBase64Images(
  file: File,
  maxPages = 20,
  scale = 1.2
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, maxPages);
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");

    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/png"));
  }

  return images;
}
