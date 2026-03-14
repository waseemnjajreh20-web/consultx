import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { Twitter, Linkedin, Mail, Link as LinkIcon, BookMarked, ExternalLink } from "lucide-react";
import consultxIcon from "@/assets/consultx-icon.png";

export default function LandingFooter() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";

  return (
    <footer
      className="relative w-full mt-0 overflow-hidden"
      style={{ background: "#060a12" }}
    >
      {/* Watermark */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        aria-hidden
      >
        <img
          src={consultxIcon}
          alt=""
          className="w-96 h-96 object-contain"
          style={{ opacity: 0.03 }}
        />
      </div>

      {/* Top cyan glow line */}
      <div
        className="w-full h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)",
          boxShadow: "0 0 12px rgba(0,212,255,0.4)",
        }}
      />

      {/* 3-column grid */}
      <div className="footer-grid relative z-10 max-w-5xl mx-auto px-6 py-10 md:py-12 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 text-sm">

        {/* Column 1 — Brand */}
        <div className="flex flex-col gap-3 items-center md:items-start text-center md:text-start">
          <div className="flex items-center gap-3 mb-1">
            <img src={consultxIcon} alt="ConsultX" className="w-9 h-9 object-contain" />
            <span
              className="text-xl font-bold text-gradient"
              style={{ textShadow: "0 0 12px rgba(0,212,255,0.4)" }}
            >
              ConsultX
            </span>
          </div>
          <p className="text-muted-foreground leading-relaxed text-xs max-w-xs">
            {isAr
              ? "مستشارك الهندسي الذكي للحماية من الحرائق — دقة مرجعية بأعلى معايير الكود السعودي وNFPA."
              : "Your AI-powered fire safety engineering consultant — reference accuracy aligned with SBC and NFPA standards."}
          </p>
          {/* Social links */}
          <div className="footer-social-row flex items-center gap-3 mt-1">
            {[
              { Icon: Twitter,  label: "Twitter"  },
              { Icon: Linkedin, label: "LinkedIn" },
              { Icon: Mail,     label: "Email"    },
            ].map(({ Icon, label }) => (
              <button
                key={label}
                aria-label={label}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                  background: "rgba(0,212,255,0.06)",
                  border: "1px solid rgba(0,212,255,0.15)",
                  color: "rgba(0,212,255,0.6)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.12)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.4)";
                  (e.currentTarget as HTMLElement).style.color = "#00D4FF";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.06)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.15)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(0,212,255,0.6)";
                }}
              >
                <Icon size={14} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>

        {/* Column 2 — Quick Links */}
        <div className="flex flex-col gap-3 items-center md:items-start text-center md:text-start">
          <h4 className="font-bold text-foreground mb-1 flex items-center gap-2" style={{ color: "hsl(var(--primary))" }}>
            <LinkIcon size={14} strokeWidth={1.5} />
            {isAr ? "روابط سريعة" : "Quick Links"}
          </h4>
          <ul className="space-y-2 text-muted-foreground">
            {[
              { labelAr: "تسجيل الدخول", labelEn: "Sign In",            path: "/auth"    },
              { labelAr: "بدء الاستشارة", labelEn: "Start Consultation", path: "/"        },
              { labelAr: "حسابي",         labelEn: "My Account",         path: "/account" },
            ].map((link) => (
              <li key={link.path}>
                <button
                  onClick={() => navigate(link.path)}
                  className="hover:text-primary transition-colors duration-200 text-right w-full text-start"
                  style={{ minHeight: "36px" }}
                >
                  {isAr ? link.labelAr : link.labelEn}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3 — References */}
        <div className="flex flex-col gap-3 items-center md:items-start text-center md:text-start">
          <h4 className="font-bold mb-1 flex items-center gap-2" style={{ color: "hsl(var(--primary))" }}>
            <BookMarked size={14} strokeWidth={1.5} />
            {isAr ? "المراجع المعتمدة" : "Approved References"}
          </h4>
          <ul className="space-y-2 text-xs leading-relaxed">
            {[
              { label: isAr ? "SBC 201 — كود البناء العام" : "SBC 201 — General Building Code", href: "https://www.sbc.gov.sa" },
              { label: isAr ? "SBC 801 — كود الحماية من الحرائق" : "SBC 801 — Fire Protection Code", href: "https://www.sbc.gov.sa" },
              { label: "NFPA 13 / 14 / 20 / 72 / 101", href: "https://www.nfpa.org" },
              { label: isAr ? "معايير SFPE" : "SFPE Standards", href: "https://www.sfpe.org" },
              { label: isAr ? "تعاميم الدفاع المدني العامة والخاصة" : "Civil Defense General & Special Circulars", href: "https://www.998.gov.sa" },
            ].map(({ label, href }) => (
              <li key={href + label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-all duration-200 group"
                  style={{ color: "rgba(200,220,240,0.55)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.color = "#00D4FF";
                    (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.color = "rgba(200,220,240,0.55)";
                    (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
                  }}
                >
                  <ExternalLink size={11} strokeWidth={1.5} className="shrink-0 opacity-60 group-hover:opacity-100" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="relative z-10 w-full px-6 py-4 flex items-center justify-center"
        style={{ borderTop: "1px solid rgba(0,212,255,0.12)" }}
      >
        <p className="text-xs text-muted-foreground/60 text-center">
          {isAr
            ? "© ConsultX 2026 — جميع الحقوق محفوظة — Eng.WaseemNjajreh"
            : "© ConsultX 2026 — All Rights Reserved — Eng.WaseemNjajreh"}
        </p>
      </div>
    </footer>
  );
}
