/**
 * RenderTest — DEV-ONLY visual harness for ChatMarkdownRenderer.
 *
 * Route /rendertest is registered only when import.meta.env.DEV (see App.tsx),
 * so nothing here reaches the production bundle. The fixtures below are
 * REAL pathological snippets captured verbatim from production answers on
 * 2026-09-01 (owner's three graded test questions) — every known formatting
 * defect is represented so a single screenshot proves/loses them all:
 *
 *  1. raw LaTeX ($I_{\Delta n}$, $0.3 \times 30\text{ mA}$)
 *  2. "---" separators swallowed by the table-separator regex → literal text
 *  3. citation-token pipes shattering markdown table cells
 *  4. a prose line with TWO tokens (2+ pipes) misdetected as a table row
 *  5. table cells rendered as plain text (no bold, no citation chips)
 *  6. lone ">" line rendered literally
 *  7. U+FFFD (�) from PDF-quoted text
 *  8. box-drawing ASCII diagram rendered as RTL paragraphs → misaligned
 */
import ChatMarkdownRenderer from "@/components/ChatMarkdownRenderer";

const ADVISORY_FIXTURE = String.raw`Document: SBC 401-CR-2024 | Section: 53-1.6

"In AC installations, an RCD used for additional protection shall have a rated residual operating current not exceeding 30 mA."
>

«في التمديدات التي تعمل بالتيار المتردد (AC)، يجب أن يكون لقاطع التيار المتبقّي (RCD) تيار تشغيل متبقٍّ مقنن لا يتجاوز 30 ملي أمبير» [SBC-401 Section 53-1.6 | conf:high].
---

1.
الحد الأقصى لتيار التشغيل المتبقي ($I_{\Delta n}$):
القيمة المحددة لا تتجاوز $30\text{ mA}$ ($I_{\Delta n} \le 30\text{ mA}$) [SBC-401 Section 53-1.6 | conf:high].

2. تفادي الفصل غير المرغوب: يجب ألا يتجاوز التسريب $0.3 \times 30\text{ mA} = 9\text{ mA}$ [SBC-401 Section 53-1.2.3.2 | conf:high]. كما تنطبق متطلبات [SBC-401 Section 53-1.6 | conf:high] مع [SBC-401 Section 53-5.3 | conf:high] في السطر نفسه.
---

grease ducts shall be designed for the type of cooking appliance and hood served. � Makeup air قد يظهر رمز تالف هنا.`;

const ANALYSIS_FIXTURE = String.raw`### الاشتراطات الحاكمة

| الاشتراط | المرجع المعتمد | القيمة | الحالة |
|---|---|---|---|
| **تغليف مجرى الشحوم** | [SBC-501 Section 506.3.11 | conf:high] | غلاف 1 ساعة بدون خوانق | **مؤكد** |
| **حماية مآخذ التيار** | [SBC-401 Section 53-1.6 | conf:high] | $I_{\Delta n} \le 30\text{ mA}$ | **مؤكد** |

---

┌─────────────────────────────┐
│ الطابق 5 : مكاتب (Group B)  │
├─────────────────────────────┤
│ الأرضي: مطعم (Group A-2)    │
├─────────────────────────────┤
│ القبو: مواقف (Group S-2)    │
└─────────────────────────────┘

- [ ] تزويد جداول المساحات — الأولوية: 🔴 حرجة
- [x] فصل غرفة المضخة بجدران ساعتين

> "Fire pumps shall be located in rooms separated by 2-hour fire barriers." [SBC-201 Section 913.2.1 | conf:high]`;

export default function RenderTest() {
  return (
    <div dir="rtl" style={{ maxWidth: 860, margin: "0 auto", padding: 24, background: "hsl(222 47% 6%)", minHeight: "100vh" }}>
      <h1 style={{ color: "#00D4FF", fontSize: 18, marginBottom: 16 }}>RenderTest — advisory fixture</h1>
      <div style={{ border: "1px solid rgba(0,212,255,.2)", borderRadius: 12, padding: 16, marginBottom: 32 }}>
        <ChatMarkdownRenderer content={ADVISORY_FIXTURE} mode="standard" />
      </div>
      <h1 style={{ color: "#FFC107", fontSize: 18, marginBottom: 16 }}>RenderTest — analysis fixture</h1>
      <div style={{ border: "1px solid rgba(255,193,7,.2)", borderRadius: 12, padding: 16 }}>
        <ChatMarkdownRenderer content={ANALYSIS_FIXTURE} mode="analysis" />
      </div>
    </div>
  );
}
