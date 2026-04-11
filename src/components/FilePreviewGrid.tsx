import { X, Eye, FileText, Loader2, ClipboardList, ShieldCheck, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { PendingFile } from "@/hooks/usePendingFiles";

type ChatMode = "primary" | "standard" | "analysis";

interface FilePreviewGridProps {
  files: PendingFile[];
  onRemove: (id: string) => void;
  isProcessing: boolean;
  mode?: ChatMode;
}

export default function FilePreviewGrid({ files, onRemove, isProcessing, mode }: FilePreviewGridProps) {
  const { t } = useLanguage();

  if (!isProcessing && files.length === 0) return null;

  return (
    <div className="mb-3">
      {isProcessing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t("processingFiles")}</span>
        </div>
      )}

      {files.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {files.map((pf) => (
              <div key={pf.id} className="relative group">
                {/* Thumbnail */}
                <div className="w-20 h-20 rounded-lg border border-primary/50 overflow-hidden bg-secondary/50 flex items-center justify-center">
                  {pf.type === "pdf" ? (
                    <div className="flex flex-col items-center gap-1 p-1">
                      <FileText className="w-7 h-7 text-primary/70" />
                      <span className="text-[9px] text-muted-foreground text-center leading-tight line-clamp-2 px-1">
                        {pf.name}
                      </span>
                    </div>
                  ) : pf.type === "text" ? (
                    <div className="flex flex-col items-center gap-1 p-1">
                      <Table2 className="w-7 h-7 text-green-400/80" />
                      <span className="text-[9px] text-muted-foreground text-center leading-tight line-clamp-2 px-1">
                        {pf.name}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={pf.previewUrl}
                      alt={pf.name}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {/* PDF page count badge */}
                {pf.type === "pdf" && pf.base64Pages.length > 0 && (
                  <div className="absolute bottom-1 start-1 bg-primary/90 text-primary-foreground text-[9px] px-1.5 py-0.5 rounded-full leading-none">
                    {pf.base64Pages.length}{t("pdfPagesSuffix")}
                  </div>
                )}

                {/* CSV row count badge */}
                {pf.type === "text" && pf.rowCount !== undefined && (
                  <div className="absolute bottom-1 start-1 bg-green-700/90 text-white text-[9px] px-1.5 py-0.5 rounded-full leading-none">
                    {pf.rowCount}r
                  </div>
                )}

                {/* PDF label */}
                {pf.type === "pdf" && (
                  <div className={cn(
                    "absolute top-1 end-6 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded"
                  )}>
                    PDF
                  </div>
                )}

                {/* CSV/TXT label */}
                {pf.type === "text" && (
                  <div className="absolute top-1 end-6 bg-green-900/80 text-green-300 text-[9px] px-1 py-0.5 rounded">
                    {pf.name.endsWith(".csv") ? "CSV" : "TXT"}
                  </div>
                )}

                {/* Remove button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-2 -end-2 w-5 h-5 rounded-full bg-destructive/90 hover:bg-destructive text-destructive-foreground p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onRemove(pf.id)}
                  type="button"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* Mode-aware analysis badge */}
          {mode === "standard" ? (
            <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#FF8C00" }}>
              <ClipboardList className="w-3 h-3" />
              <span>{t("visionAdvisoryLabel")}</span>
              <span className="text-muted-foreground">
                · {files.length} {files.length === 1
                  ? (t("fileAttachedSingle") || "file")
                  : (t("filesAttachedMultiple") || "files")}
              </span>
            </div>
          ) : mode === "analysis" ? (
            <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#DC143C" }}>
              <ShieldCheck className="w-3 h-3" />
              <span>{t("visionAnalyticalLabel")}</span>
              <span className="text-muted-foreground">
                · {files.length} {files.length === 1
                  ? (t("fileAttachedSingle") || "file")
                  : (t("filesAttachedMultiple") || "files")}
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1 text-xs text-primary/80">
              <Eye className="w-3 h-3" />
              <span>{t("visionAnalysis")}</span>
              <span className="text-muted-foreground">
                · {files.length} {files.length === 1
                  ? (t("fileAttachedSingle") || "file")
                  : (t("filesAttachedMultiple") || "files")}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
