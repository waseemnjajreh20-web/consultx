import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { pdfToBase64Images } from "@/lib/pdfToImages";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_FILES = 10;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_PDF_TYPE = "application/pdf";
const ALLOWED_TEXT_TYPES = ["text/csv", "text/plain"];
// Excel files: guide user to save as CSV; we accept the mime types browsers report
const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                           // .xls
];

export interface PendingFile {
  id: string;
  file: File;
  type: "image" | "pdf" | "text";
  base64Pages: string[]; // images/PDFs: base64 data URIs; text: empty (content in textContent)
  textContent?: string;  // extracted text for CSV/TXT files
  previewUrl: string;    // first page or placeholder for thumbnail
  name: string;
  rowCount?: number;     // for CSV: number of data rows
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function usePendingFiles() {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const { language } = useLanguage();

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const fileArray = Array.from(incoming);
    if (!fileArray.length) return;

    setIsProcessing(true);
    try {
      const candidates: PendingFile[] = [];

      for (const file of fileArray) {
        if (candidates.length >= MAX_FILES) break;

        const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
        const isPdf = file.type === ALLOWED_PDF_TYPE;
        const isText = ALLOWED_TEXT_TYPES.includes(file.type)
          || file.name.endsWith(".csv")
          || file.name.endsWith(".txt");
        const isExcel = EXCEL_TYPES.includes(file.type)
          || file.name.endsWith(".xlsx")
          || file.name.endsWith(".xls");

        if (!isImage && !isPdf && !isText && !isExcel) {
          toast({
            title: language === "en" ? "Error" : "خطأ",
            description: language === "en" ? "Unsupported file type" : "نوع الملف غير مدعوم",
            variant: "destructive",
          });
          continue;
        }

        // Excel: guide user to CSV
        if (isExcel) {
          toast({
            title: language === "en" ? "Excel file" : "ملف Excel",
            description: language === "en"
              ? `"${file.name}": For best results, save your Excel file as CSV first. CSV files are fully supported.`
              : `"${file.name}": للحصول على أفضل نتيجة، احفظ ملف Excel بصيغة CSV أولاً. ملفات CSV مدعومة بالكامل.`,
            variant: "default",
          });
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: language === "en" ? "Error" : "خطأ",
            description: language === "en" ? "File exceeds 15 MB" : "الملف أكبر من 15 ميجا",
            variant: "destructive",
          });
          continue;
        }

        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        if (isImage) {
          try {
            const base64 = await fileToBase64(file);
            candidates.push({
              id,
              file,
              type: "image",
              base64Pages: [base64],
              previewUrl: base64,
              name: file.name,
            });
          } catch {
            toast({
              title: language === "en" ? "Error" : "خطأ",
              description: language === "en"
                ? `Failed to read image: ${file.name}`
                : `تعذّر قراءة الصورة: ${file.name}`,
              variant: "destructive",
            });
          }
        } else if (isText) {
          // CSV / TXT — read as plain text
          try {
            const text = await file.text();
            if (!text.trim()) continue;
            // Count data rows for CSV (lines minus header)
            const lines = text.split("\n").filter(l => l.trim().length > 0);
            const rowCount = lines.length > 1 ? lines.length - 1 : lines.length;
            candidates.push({
              id,
              file,
              type: "text",
              base64Pages: [],
              textContent: text,
              previewUrl: "",
              name: file.name,
              rowCount,
            });
          } catch {
            toast({
              title: language === "en" ? "Error" : "خطأ",
              description: language === "en"
                ? `Failed to read file: ${file.name}`
                : `تعذّر قراءة الملف: ${file.name}`,
              variant: "destructive",
            });
          }
        } else {
          // PDF
          try {
            const pages = await pdfToBase64Images(file);
            if (!pages.length) continue;
            candidates.push({
              id,
              file,
              type: "pdf",
              base64Pages: pages,
              previewUrl: pages[0],
              name: file.name,
            });
          } catch {
            toast({
              title: language === "en" ? "Error" : "خطأ",
              description: language === "en"
                ? `Failed to read PDF: ${file.name}`
                : `تعذّر قراءة الملف: ${file.name}`,
              variant: "destructive",
            });
          }
        }
      }

      if (candidates.length > 0) {
        setPendingFiles(prev => {
          if (prev.length >= MAX_FILES) return prev;
          const existing = new Set(prev.map(f => `${f.name}-${f.file.size}`));
          const deduped = candidates.filter(f => !existing.has(`${f.name}-${f.file.size}`));
          return [...prev, ...deduped].slice(0, MAX_FILES);
        });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [toast, language]);

  const removeFile = useCallback((id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setPendingFiles([]);
  }, []);

  const allBase64Pages = pendingFiles.flatMap(f => f.base64Pages);
  // Collected text content from CSV/TXT files — passed to backend as structured document context
  const allDocumentTexts = pendingFiles
    .filter(f => f.type === "text" && f.textContent)
    .map(f => ({ name: f.name, content: f.textContent! }));

  return {
    pendingFiles,
    isProcessing,
    addFiles,
    removeFile,
    clearAll,
    hasFiles: pendingFiles.length > 0,
    allBase64Pages,
    allDocumentTexts,
  };
}
