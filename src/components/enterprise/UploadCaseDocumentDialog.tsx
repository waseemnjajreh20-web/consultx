import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_META } from "./DocumentCategoryBadge";

const CATEGORIES = Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[];

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

interface UploadCaseDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  caseId: string;
  orgId: string;
  userId: string;
  ar: boolean;
  onSuccess: () => void;
}

export default function UploadCaseDocumentDialog({
  open,
  onClose,
  caseId,
  orgId,
  userId,
  ar,
  onSuccess,
}: UploadCaseDocumentDialogProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(1);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  function reset() {
    setFile(null);
    setTitle("");
    setCategory("");
    setDescription("");
    setVersion(1);
    setProgress(0);
    setLoading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    if (loading) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || !category) return;

    setLoading(true);
    setProgress(5);

    const docId = crypto.randomUUID();
    const sanitized = sanitizeFilename(file.name);
    const storagePath = `${orgId}/${caseId}/${category}/${docId}-${sanitized}`;

    try {
      // 1. Upload file
      setProgress(15);
      const { error: uploadError } = await supabase.storage
        .from("enterprise-case-documents")
        .upload(storagePath, file, { upsert: false });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
      setProgress(70);

      // 2. Insert metadata row
      const { error: dbError } = await supabase
        .from("case_documents")
        .insert({
          id: docId,
          case_id: caseId,
          org_id: orgId,
          uploaded_by: userId,
          category,
          visibility: "internal_only",
          title: title.trim(),
          description: description.trim() || null,
          storage_path: storagePath,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          version_number: version,
        });

      if (dbError) {
        // Attempt cleanup of orphaned storage object
        await supabase.storage.from("enterprise-case-documents").remove([storagePath]);
        throw new Error(dbError.message);
      }

      setProgress(100);
      toast({ title: ar ? "تم رفع الملف" : "File uploaded", description: ar ? `تم حفظ "${title.trim()}" بنجاح` : `"${title.trim()}" saved successfully` });
      onSuccess();
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ في الرفع" : "Upload failed", description: msg, variant: "destructive" });
      setProgress(0);
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {ar ? "رفع مستند للمعاملة" : "Upload Case Document"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* File picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "الملف *" : "File *"}</Label>
            <div
              className="border border-dashed border-border/60 rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/10 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-5 h-5 text-muted-foreground" />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-medium truncate max-w-[240px]">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  {ar ? "انقر لاختيار ملف (حد أقصى 50 ميغابايت)" : "Click to choose a file (max 50 MB)"}
                </p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                }
              }}
            />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title" className="text-xs">{ar ? "العنوان *" : "Title *"}</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ar ? "مثال: مخططات الدور الأرضي" : "e.g. Ground floor plans"}
              maxLength={200}
              required
              className="text-sm"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "التصنيف *" : "Category *"}</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={ar ? "اختر التصنيف" : "Select category"} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-sm">
                    {language === "ar" ? CATEGORY_META[cat].ar : CATEGORY_META[cat].en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-desc" className="text-xs">{ar ? "الوصف (اختياري)" : "Description (optional)"}</Label>
            <Textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={ar ? "ملاحظات إضافية..." : "Additional notes..."}
              maxLength={1000}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Version */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-ver" className="text-xs">{ar ? "رقم الإصدار" : "Version"}</Label>
            <Input
              id="doc-ver"
              type="number"
              min={1}
              max={99}
              value={version}
              onChange={(e) => setVersion(Math.max(1, parseInt(e.target.value) || 1))}
              className="text-sm w-24"
            />
          </div>

          {/* Visibility note */}
          <p className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2.5 py-2 border border-border/30">
            {ar
              ? "جميع المستندات داخلية فقط. خيارات ظهور العميل ستُفعَّل مع بوابة العميل لاحقًا."
              : "All documents are internal only. Client-facing visibility options will be enabled with the client portal (E9)."}
          </p>

          {/* Progress */}
          {loading && progress > 0 && (
            <Progress value={progress} className="h-1.5" />
          )}

          {/* Actions */}
          <div className={`flex gap-2 pt-1 ${ar ? "flex-row-reverse" : ""}`}>
            <Button type="submit" size="sm" disabled={loading || !file || !title.trim() || !category} className="flex-1">
              {loading
                ? (ar ? "جارٍ الرفع..." : "Uploading...")
                : (ar ? "رفع الملف" : "Upload")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleClose} disabled={loading}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
