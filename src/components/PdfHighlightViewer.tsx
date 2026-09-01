import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore — Vite ?url suffix resolves the worker at build time
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const ACCENT = "#00D4FF";

/**
 * PdfHighlightViewer — renders ONE PDF page with pdf.js and highlights the
 * cited passage on it ("live" citation preview).
 *
 * Why pdf.js instead of the plain <iframe>: the native browser PDF viewer can
 * only jump to a page (#page=N) — it cannot highlight the specific clause the
 * answer cited. pdf.js renders the page to a canvas AND exposes the text layer,
 * so we can draw a highlight box over the cited text.
 *
 * Anchor = the actual RETRIEVED TEXT, not the section number. In the SBC corpus
 * sbc_documents.section_number drifts from the true heading, so a section-number
 * highlight would box a stray cross-reference. The chunk's own content lives on
 * its (reliable) page_start, so a phrase from it is the drift-immune anchor.
 *
 * Safety contract: this component NEVER regresses below the old iframe. On ANY
 * failure (network, CORS, a corrupt text layer, an unsupported PDF) it calls
 * `onFallback()` and the caller shows the original iframe instead. The page
 * render is the load-bearing feature; the highlight is strictly best-effort —
 * if the phrase is not found the page still renders, just without a box (never
 * a wrong box).
 *
 * Page numbers are ABSOLUTE 1-based PDF pages (matching sbc_documents.page_start
 * and X-SBC-Source-Meta), so `pageNumber` is used directly with no offset.
 */
export function PdfHighlightViewer({
  url,
  pageNumber,
  highlightText,
  isRtl,
  onFallback,
}: {
  url: string;
  pageNumber: number;
  /** Cited passage (a snippet of the retrieved text) to highlight. Null → page only. */
  highlightText: string | null;
  isRtl: boolean;
  onFallback: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "rendered">("loading");
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc: pdfjsLib.PDFDocumentProxy | null = null;
    setStatus("loading");
    setMatched(false);

    // Browser-compat watchdog (measured in the owner's Firefox-family browser):
    // pdf.js can HANG silently — the module worker never boots, getDocument's
    // promise neither resolves nor rejects, so the catch-based onFallback never
    // fires and the user stares at the spinner forever. If nothing rendered
    // within the window, hand over to the native <iframe> viewer, which the
    // slice endpoint keeps small enough for every browser.
    const watchdog = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        onFallback();
      }
    }, 12_000);

    (async () => {
      try {
        // getDocument with a URL lets pdf.js use HTTP range requests, so a large
        // (whole-code) PDF only transfers the structure + the requested page.
        doc = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled || !doc) return;

        const pageNum = Math.min(Math.max(Math.floor(pageNumber) || 1, 1), doc.numPages);
        const page = await doc.getPage(pageNum);
        if (cancelled) return;

        const containerWidth = scrollRef.current?.clientWidth ?? 800;
        const unscaled = page.getViewport({ scale: 1 });
        // Fit width, clamped so tiny/huge pages stay readable.
        const scale = Math.min(3, Math.max(0.6, (containerWidth - 4) / unscaled.width));
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) { onFallback(); return; }

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        // ── Best-effort highlight of the cited passage on the text layer ──────
        overlay.innerHTML = "";
        overlay.style.width = `${canvas.width}px`;
        overlay.style.height = `${canvas.height}px`;

        if (highlightText) {
          try {
            const tc = await page.getTextContent();
            if (cancelled) return;
            const boxes = findPhraseBoxes(tc.items as TextItemLike[], highlightText, viewport);
            let first: HTMLDivElement | null = null;
            for (const b of boxes) {
              const div = document.createElement("div");
              div.style.cssText =
                `position:absolute;left:${b.left}px;top:${b.top}px;` +
                `width:${b.width}px;height:${b.height}px;` +
                `background:rgba(255,214,10,0.38);border:1px solid rgba(255,193,7,0.85);` +
                `border-radius:2px;pointer-events:none;`;
              overlay.appendChild(div);
              if (!first) first = div;
            }
            if (first) {
              setMatched(true);
              // Scroll the cited box into the middle of the panel.
              const top = parseFloat(first.style.top);
              const sc = scrollRef.current;
              if (sc) sc.scrollTop = Math.max(0, top - sc.clientHeight / 2);
            }
          } catch {
            // Text layer unavailable/corrupt — page still shown, no highlight.
          }
        }

        if (!cancelled) { clearTimeout(watchdog); setStatus("rendered"); }
      } catch {
        if (!cancelled) { clearTimeout(watchdog); onFallback(); }
      } finally {
        if (doc) { try { doc.destroy(); } catch { /* noop */ } }
      }
    })();

    return () => { cancelled = true; clearTimeout(watchdog); };
  }, [url, pageNumber, highlightText, onFallback]);

  return (
    <div
      ref={scrollRef}
      className="relative w-full h-full overflow-auto"
      style={{ background: "#1a1d23" }}
    >
      {status === "loading" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 pointer-events-none"
          style={{ background: "rgba(10,14,20,0.88)" }}
        >
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: ACCENT }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
            {isRtl ? "جاري تجهيز صفحة المصدر… (الفتح الأول قد يستغرق ثوانٍ)" : "Preparing source page… (first open can take a few seconds)"}
          </span>
        </div>
      )}
      <div className="relative mx-auto" style={{ width: "fit-content" }}>
        <canvas ref={canvasRef} className="block" />
        <div ref={overlayRef} className="absolute top-0 left-0 pointer-events-none" />
      </div>
      {status === "rendered" && highlightText && matched && (
        <div
          className="sticky bottom-0 left-0 right-0 px-3 py-1.5 text-center text-xs font-medium"
          style={{ background: "rgba(0,148,179,0.92)", color: "#fff" }}
        >
          {isRtl ? "النص المُستشهَد به مُظلَّل على الصفحة" : "Cited text highlighted on the page"}
        </div>
      )}
    </div>
  );
}

interface TextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface Box { left: number; top: number; width: number; height: number; }

function boxFor(it: TextItemLike, viewport: { transform: number[]; scale: number }): Box | null {
  if (!it.transform) return null;
  const m = pdfjsLib.Util.transform(viewport.transform, it.transform);
  // m = [a, b, c, d, e, f]; (e,f) is the text origin (baseline) in canvas px.
  const fontHeight = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || 10;
  const width = (typeof it.width === "number" ? it.width : 0) * viewport.scale;
  const left = m[4];
  const top = m[5] - fontHeight;
  if (!isFinite(left) || !isFinite(top)) return null;
  return {
    left: Math.max(0, left - 2),
    top: Math.max(0, top - 2),
    width: Math.max(10, width) + 4,
    height: fontHeight + 4,
  };
}

/** Collapse whitespace and lowercase for tolerant matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Find highlight boxes for a cited PHRASE within a page's text items.
 *
 * We anchor on the actual retrieved TEXT (not the section number, whose DB
 * label drifts from the true heading in the SBC corpus). The page's text items
 * are concatenated with tracked offsets; the (normalised) phrase is located in
 * that stream and every item overlapping the match contributes a box. Matching
 * is whitespace-tolerant and case-insensitive, and falls back to a distinctive
 * prefix of the phrase. If nothing matches (glyph corruption, a phrase spanning
 * pages) NO boxes are returned and the page renders without a highlight — never
 * a wrong highlight.
 */
export function findPhraseBoxes(
  items: TextItemLike[],
  phrase: string,
  viewport: { transform: number[]; scale: number },
): Box[] {
  const target = norm(phrase);
  if (target.length < 6) return []; // too short to anchor reliably
  // Build a normalised concat stream, mapping each char back to its item index.
  let stream = "";
  const owner: number[] = []; // owner[charIndex] = item index (-1 for join spaces)
  for (let i = 0; i < items.length; i++) {
    const raw = typeof items[i].str === "string" ? items[i].str! : "";
    const piece = norm(raw);
    if (!piece) continue;
    if (stream) { stream += " "; owner.push(-1); }
    for (let k = 0; k < piece.length; k++) owner.push(i);
    stream += piece;
  }
  // Try the whole phrase; if not found, fall back to distinctive prefixes.
  const candidates = [target];
  if (target.length > 45) candidates.push(target.slice(0, 45));
  if (target.length > 20) candidates.push(target.slice(0, 20));
  let at = -1;
  let len = 0;
  for (const c of candidates) {
    at = stream.indexOf(c);
    if (at >= 0) { len = c.length; break; }
  }
  if (at < 0) return [];
  const hitItems = new Set<number>();
  for (let p = at; p < at + len && p < owner.length; p++) {
    if (owner[p] >= 0) hitItems.add(owner[p]);
  }
  const boxes: Box[] = [];
  for (const idx of hitItems) {
    const b = boxFor(items[idx], viewport);
    if (b) boxes.push(b);
  }
  return boxes;
}
