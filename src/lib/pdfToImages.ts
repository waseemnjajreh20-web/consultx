import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore — Vite ?url suffix resolves this at build time
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Converts a PDF File into an array of base64 JPEG data URLs (one per page).
 *
 * Higher fidelity defaults (scale 2.0, quality 0.95) are required for
 * engineering drawings — fine line work, dimension text, room labels, and
 * device symbols need to remain legible after JPEG compression for downstream
 * Gemini Vision analysis.
 */
export async function pdfToBase64Images(
  file: File,
  maxPages = 20,
  scale = 2.0,
  quality = 0.95,
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
      results.push(canvas.toDataURL("image/jpeg", quality));
    }
  } finally {
    pdf.destroy();
  }

  return results;
}

export type PdfTextExtractionQuality = "empty" | "low" | "medium" | "high";

export interface PdfTextLayer {
  fileName: string;
  totalPages: number;
  pages: { pageNumber: number; text: string }[];
  combinedText: string;
  extractionQuality: PdfTextExtractionQuality;
}

/**
 * Extracts the native PDF text layer using pdfjs `getTextContent()`.
 *
 * CAD-exported PDFs typically embed a real text layer (room labels, sheet
 * titles, dimensions, schedules, notes). Reading that layer directly is
 * lossless and instantaneous — far better than OCR on a rendered image.
 *
 * Scanned PDFs and image-only PDFs return an "empty" extraction quality;
 * callers should fall back to image-based vision analysis in that case.
 *
 * No OCR, no new dependencies.
 */
export async function extractPdfTextLayer(
  file: File,
  maxPages = 20,
  perPageCharLimit = 4_000,
  totalCharLimit = 18_000,
): Promise<PdfTextLayer> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, maxPages);

  const pages: { pageNumber: number; text: string }[] = [];
  let combined = "";
  let totalChars = 0;

  try {
    for (let i = 1; i <= totalPages; i++) {
      if (totalChars >= totalCharLimit) break;
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const items = (tc.items as any[]) ?? [];
      const rawPageText = items
        .map((it) => {
          const str = typeof it.str === "string" ? it.str : "";
          const eol = it.hasEOL ? "\n" : "";
          return str + eol;
        })
        .join(" ")
        .replace(/\s+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      if (!rawPageText) continue;
      const remaining = totalCharLimit - totalChars;
      const capped = rawPageText.slice(0, Math.min(perPageCharLimit, remaining));
      if (!capped) continue;
      pages.push({ pageNumber: i, text: capped });
      combined += `\n--- Page ${i} ---\n${capped}`;
      totalChars += capped.length;
    }
  } finally {
    pdf.destroy();
  }

  combined = combined.trim();

  let extractionQuality: PdfTextExtractionQuality;
  if (combined.length === 0) extractionQuality = "empty";
  else if (combined.length < 200) extractionQuality = "low";
  else if (combined.length < 2_000) extractionQuality = "medium";
  else extractionQuality = "high";

  return {
    fileName: file.name,
    totalPages,
    pages,
    combinedText: combined,
    extractionQuality,
  };
}
