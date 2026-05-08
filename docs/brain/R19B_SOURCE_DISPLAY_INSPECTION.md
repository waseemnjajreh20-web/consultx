# R19B — Source Display Inspection

**Date:** 2026-05-08
**Sprint:** R19B Mobile UX + Source Display Cleanup

---

## Problem Observed

```
المصادر:
🗂️ SBC 201 — جدول 1004.5 (دليل منظم)
📖 SBC 201
📖 SBC 201
+1 أخرى
```

---

## 1. لماذا يتكرر "SBC 201"؟

**السبب: `formatSourceLabel` تُعيد نفس النص لملفات مختلفة.**

```typescript
// sourceMetadata.ts — formatSourceLabel:
if (meta.pageStart !== null && meta.pageEnd !== null && meta.precision === "page_range") {
  return `📖 ${code} — Pages ${meta.pageStart}–${meta.pageEnd}`;
}
return `📖 ${code}`;  // ← يُعاد لكل source بلا page_range precision
```

للملفات كـ `SBC201_Ch10_v2_chunks.json` و `SBC 201 - ...-1001-1250.json`:
- `precision = "chunk_range_only"` (ليس `"page_range"`)
- `formatSourceLabel` تُعيد `📖 SBC 201` للاثنين
- النتيجة: chip مكرر يبدو متطابقاً

حتى لو كان لهذه الملفات `pageStart` و `pageEnd` من اسم الملف، فإن الشرط `precision === "page_range"` يمنع عرضها.

---

## 2. هل التكرار من backend أم frontend؟

**كلاهما مساهم:**

**Backend:**
- `fetchSBCContext` (بعد R26 لـ occupant_load) تُعيد SBC201 chunk files متعددة لأن Chapter 10 يمتد عبر ملفين (501-1000 و 1001-1250)
- `X-SBC-Sources`: `SBC201_Ch10_v2_chunks.json, SBC 201 - ...-1001-1250.json`
- `X-SBC-Source-Meta`: page metadata per file (precision=chunk_range_only)
- Structured table sentinel: `__sbc_table__::SBC-201::1004.5`

**Frontend:**
- `resolveSourcesWithMeta` تـ deduplicate بـ `pdfPath`. ملفات مختلفة → `pdfPath` مختلف → لا dedup
- `formatSourceLabel` تُعيد `📖 SBC 201` للجميع (precision != page_range)
- `SourceChipsRow` لا تـ deduplicate بـ label

---

## 3. هل sources العامة تمثل broad chunks؟

**نعم.** الملفات مثل:
- `SBC201_Ch10_v2_chunks.json` → SBC201 Chapter 10, no page range in name → `📖 SBC 201`
- `SBC 201 - The Saudi General Building Code-1001-1250.json` → pages 1001-1250 → `pageStart=1001, pageEnd=1250, precision=chunk_range_only` → `📖 SBC 201`

هذه ملفات JSON ضخمة تُغطي chapters أو page ranges، وليست مصادر دقيقة. وجودها في chips يشوش المستخدم.

---

## 4. هل يمكن dedupe بدون إخفاء source مهم؟

**نعم.** الإصلاح المقترح (جراحي):

### Fix A: `formatSourceLabel` — عرض page range حتى لـ chunk_range_only

```typescript
// إضافة: show pages for ALL precision levels (not just page_range)
if (meta.pageStart !== null && meta.pageEnd !== null) {
  return `📖 ${code} · صفحات ${meta.pageStart}–${meta.pageEnd}`;
}
```

هذا يجعل `SBC201-501-1000` و `SBC201-1001-1250` مختلفين بصرياً.

### Fix B: `SourceChipsRow` — dedup بـ label

```typescript
const seenLabels = new Set<string>();
return rawSorted.filter(meta => {
  const lbl = formatSourceLabel(meta, language);
  if (seenLabels.has(lbl)) return false;
  seenLabels.add(lbl);
  return true;
});
```

يمنع chips متطابقة بلا معلومة إضافية.

### Fix C: `SourcePanel` — structured_table panel بدلاً من "PDF غير متوفر"

- عرض معلومات الجدول المنظم بوضوح
- إزالة filename التقنية من الـ fallback

---

## Source Flow Diagram

```
Edge function (fire-safety-chat)
  └─ fetchSBCContext (restrictToSBC201=true for occupant_load)
       └─ downloads: SBC201_Ch10_v2_chunks.json + SBC201-1001-1250.json
  └─ fetchStructuredTables
       └─ finds: sbc_code_tables WHERE table_id='1004.5'
       └─ emits: __sbc_table__::SBC-201::1004.5 sentinel

X-SBC-Sources header:
  "__sbc_table__::SBC-201::1004.5, SBC201_Ch10_v2_chunks.json, SBC201-1001-1250.json"

Frontend resolveSourcesWithMeta:
  1. __sbc_table__::SBC-201::1004.5 → SourceMeta {origin:"structured_table", tableRef:"1004.5"}
  2. SBC201_Ch10_v2_chunks.json → SourceMeta {documentCode:"SBC-201", pageStart:null, precision:"unavailable"}
  3. SBC201-1001-1250.json → SourceMeta {documentCode:"SBC-201", pageStart:1001, pageEnd:1250, precision:"chunk_range_only"}

formatSourceLabel:
  1. → "🗂️ SBC 201 — جدول 1004.5 (دليل منظم)"
  2. → "📖 SBC 201"  ← SAME LABEL
  3. → "📖 SBC 201"  ← SAME LABEL (precision != page_range blocks page display)
```
