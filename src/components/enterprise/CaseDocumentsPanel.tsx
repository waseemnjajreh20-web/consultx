import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import DocumentCategoryBadge, { CATEGORY_META } from "./DocumentCategoryBadge";
import DocumentVisibilityBadge from "./DocumentVisibilityBadge";
import UploadCaseDocumentDialog from "./UploadCaseDocumentDialog";

type DocRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  visibility: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  version_number: number;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
};

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />;
  if (mimeType.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-400 shrink-0" />;
  if (mimeType === "application/pdf" || mimeType.includes("pdf")) return <FileText className="w-4 h-4 text-red-400 shrink-0" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.endsWith(".xlsx"))
    return <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />;
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface CaseDocumentsPanelProps {
  caseId: string;
  orgId: string;
  orgRole?: string | null;
  currentUserId?: string;
  ar: boolean;
}

export default function CaseDocumentsPanel({
  caseId,
  orgId,
  orgRole,
  currentUserId,
  ar,
}: CaseDocumentsPanelProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isOwnerOrAdmin = orgRole === "owner" || orgRole === "admin";
  const isFinanceOfficer = orgRole === "finance_officer";
  const canUpload = !!currentUserId && !isFinanceOfficer;

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery<DocRow[]>({
    queryKey: ["case_documents", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_documents")
        .select("id, title, description, category, visibility, file_name, file_size_bytes, mime_type, version_number, storage_path, uploaded_by, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
    staleTime: 30 * 1000,
  });

  async function handleDownload(doc: DocRow) {
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke("get-case-document-url", {
        body: { document_id: doc.id },
      });
      if (error || !data?.url) throw new Error(error?.message ?? "No URL returned");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ في التحميل" : "Download failed", description: msg, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(doc: DocRow) {
    if (!isOwnerOrAdmin) return;
    const confirmed = window.confirm(
      ar ? `هل تريد حذف "${doc.title}"؟` : `Delete "${doc.title}"?`
    );
    if (!confirmed) return;

    setDeletingId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke("delete-case-document", {
        body: { document_id: doc.id },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? "Delete failed");
      await qc.invalidateQueries({ queryKey: ["case_documents", caseId] });
      toast({ title: ar ? "تم الحذف" : "Deleted", description: ar ? `تم حذف "${doc.title}"` : `"${doc.title}" removed` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ في الحذف" : "Delete failed", description: msg, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  // Group documents by category
  const grouped = new Map<string, DocRow[]>();
  for (const doc of docs) {
    const list = grouped.get(doc.category) ?? [];
    list.push(doc);
    grouped.set(doc.category, list);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/20 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {ar ? "مستندات المعاملة" : "Case Documents"}
          <span className="ms-1.5 font-normal">({docs.length})</span>
        </p>
        {canUpload && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => setUploadOpen(true)}
          >
            <Plus className="w-3 h-3" />
            {ar ? "رفع ملف" : "Upload"}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {docs.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Paperclip className="w-7 h-7 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {ar ? "لا توجد مستندات بعد" : "No documents yet"}
          </p>
          {canUpload && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setUploadOpen(true)}>
              <Plus className="w-3 h-3" />
              {ar ? "ارفع أول مستند" : "Upload the first document"}
            </Button>
          )}
        </div>
      )}

      {/* Documents grouped by category */}
      {[...grouped.entries()].map(([cat, catDocs]) => {
        const catMeta = CATEGORY_META[cat];
        return (
          <div key={cat} className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground">
              {catMeta ? (language === "ar" ? catMeta.ar : catMeta.en) : cat}
              <span className="ms-1 font-normal opacity-60">({catDocs.length})</span>
            </p>
            <div className="space-y-1.5">
              {catDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-lg bg-muted/10 border border-border/30 px-3 py-2.5 flex items-center gap-3"
                >
                  {fileIcon(doc.mime_type)}

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      {doc.version_number > 1 && (
                        <span className="text-[10px] text-muted-foreground/70 shrink-0">v{doc.version_number}</span>
                      )}
                    </div>
                    {doc.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{doc.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <DocumentCategoryBadge category={doc.category} />
                      {doc.visibility !== "internal_only" && (
                        <DocumentVisibilityBadge visibility={doc.visibility} />
                      )}
                      {doc.file_size_bytes && (
                        <span className="text-[10px] text-muted-foreground/60">{formatBytes(doc.file_size_bytes)}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/50">
                        {new Date(doc.created_at).toLocaleDateString(ar ? "ar-SA" : "en-US")}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={ar ? "تحميل" : "Download"}
                      disabled={downloadingId === doc.id}
                      onClick={() => handleDownload(doc)}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    {isOwnerOrAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive"
                        title={ar ? "حذف" : "Delete"}
                        disabled={deletingId === doc.id}
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Upload dialog */}
      {canUpload && currentUserId && (
        <UploadCaseDocumentDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          caseId={caseId}
          orgId={orgId}
          userId={currentUserId}
          ar={ar}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["case_documents", caseId] })}
        />
      )}
    </div>
  );
}
