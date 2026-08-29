# ConsultX live UX/content audit - 2026-08-29 (visual walkthrough)

Method: real-browser walkthrough of consultx.app (owner's Chrome, logged-in,
+ clean unauthenticated browser pane), plus page-text extraction of every
public page. Engine-side health separately verified the same day via the
live bench (both modes + primary smoke, paid quota, zero 503s).

## CRITICAL - must be fixed before any real launch

1. **Privacy policy names the WRONG payment processor.** Sections 1 and 4
   say payments are processed by "Tap Payments" - Tap is retired (hard
   rule); production uses Moyasar. A legal document misstating the payment
   processor is a compliance and trust defect. Fix: replace both mentions
   with Moyasar.
2. **Marketing + legal copy promise sources the engine deliberately
   refuses.** Landing hero ("Built on SBC 201, SBC 801, and Civil Defense
   standards"), step 2 copy ("SBC, NFPA, or Civil Defense"), FAQ ("access
   to SBC and NFPA codes and Civil Defense regulations"), Terms Section 2
   ("ومعايير NFPA"). The engine's SOURCE_SCOPE honestly refuses NFPA /
   Civil-Defense text requests (verified live: ADV-018/019/020). Users buy
   the promise, then meet the refusal. Fix: unified honest wording -
   "SBC 201 & SBC 801 full text + certified commentary + structured tables".
3. **Footer reference labels are INVERTED/WRONG in both languages:**
   "SBC 201 - Fire Protection / الحماية من الحريق" and "SBC 801 - Life
   Safety / سلامة الحياة". SBC 201 is the General Building Code; SBC 801
   is the Saudi Fire Protection Code. In front of an engineering audience
   this is a credibility wound. Fix labels.
4. **"أنظمة الدفاع المدني" footer link points to nfpa.org** - the US NFPA
   site, unrelated to Saudi Civil Defense. Fix: 998.gov.sa (or remove).
5. **Landing demo answer cites "NFPA 101 Section 7.6"** - a source claim
   the product cannot back. Fix: demo answer citing SBC 201 Section 1017.2
   only.
6. **Testimonials carry specific named engineers** (Khalid Al-Shamari /
   Sara Al-Otaibi / Abdullah Al-Harbi with roles and cities). If these are
   not real consenting people this is a legal/reputation risk in the small
   Saudi fire-safety market. OWNER DECISION: remove, anonymize, or replace
   with real consented quotes.

## HIGH

7. **English locale is riddled with RTL punctuation artifacts** (CSS/RTL
   leakage): "?Hello! ... How can I help you today", ":Or try one of these
   questions", "...Ask about any code article", hero line ".- in seconds,
   not hours", "?What's the difference between SBC 201 and SBC 801".
   Sampled on landing + workspace; sweep ALL EN strings.
8. **Contact page email is hello@consultx.app** - official addresses on
   record are info@ and waseem@consultx.app. Verify hello@ exists (else
   dead letterbox) or change to info@.
9. **Owner's own Chrome cannot reach the Supabase edge function** -
   "Failed to fetch" on even a bare OPTIONS; the stack routes through a
   browser extension (chrome-extension://eppioc...). Platform verified
   healthy from terminal same hour. Action (owner): test in incognito,
   then disable the interfering extension. Product-side improvement: the
   generic red "Connection error" toast deserves a retry button + clearer
   text.
10. **Cold-start 502 on first request** after idle (seen 3x today on the
    bench, first-call pattern). Engineering item, already on record.

## MEDIUM

11. Signup password minimum is 6 characters - raise to 8+.
12. Footer/login boast "مدعوم بمنظومة 12 وكيلاً ذكياً" - unverifiable
    marketing claim; recommend removing.
13. Signup/login/validation flows render correctly (RTL clean, red field
    errors work). Trial wording consistent (7 days, no card; 14-day
    refund window consistent between landing and refund policy).

## What was verified GOOD

- Landing, pricing, FAQ, contact, privacy, terms, refund all render, in
  both languages; SPA routes work.
- Signup client-side validation works (invalid email + short password
  flagged inline in Arabic).
- Terms disclaimer correctly states the service does not replace a
  licensed engineer or Civil Defense decisions.
- Refund policy internally consistent.
- Engine health: live bench same-day - primary smoke PASS, both retrieval
  engines serving, paid quota stable.
