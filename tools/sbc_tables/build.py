"""Rebuild pipeline: locate -> extract -> render -> CHECK -> emit report + SQL.

    python build.py --rows <production rows json> \
                    --report docs/audits/code-tables-rebuild-20260823.md \
                    --sql    docs/audits/code-tables-rebuild-20260823.sql

<production rows json> is a SELECT-only dump of public.sbc_code_tables with at
least: id, table_id, table_title, source_code, edition, chapter, section,
content_md.

Nothing here writes to the database. The .sql file is for the OWNER to apply.

A table is emitted ONLY when checks (a), (b), (c) and (d) all pass. Everything
else lands in the "not rebuilt - needs human" list with its concrete reason.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from checks import (internal_contradictions, provenance_recheck,  # noqa: E402
                    reextract_diff, sprinkler_inversion, unit_check)
from extract import (close_all, extract_captioned_table, extract_multipage,  # noqa
                     recover_footnotes_from_next_page)
from ledger import adjudicate, counts  # noqa: E402
from render import render_content_md  # noqa: E402
from sbc_common import PDF_DIR  # noqa: E402
from specs import SPECS  # noqa: E402


def resolve_row(rows, spec):
    """Resolve a spec to its production row by the PRIMARY KEY, never by table_id.

    table_id is NOT an identity in this table: it is not unique ('417' has two
    distinct rows) and it MUTATES - the owner's quarantine passes rewrite it to
    'QUARANTINED_<id>' in place. A build keyed on table_id silently stops
    resolving rows the moment a quarantine pass runs. The uuid primary key is
    stable across every quarantine pass, so that is what we key on; the spec's
    table_id is kept only as a human-readable hint and is reported when it has
    drifted from what production now holds.
    """
    hits = [r for r in rows if str(r["id"]) == str(spec["row_id"])]
    if len(hits) != 1:
        return None, "row_id %r matches %d production rows - refusing to guess" \
                     % (spec["row_id"], len(hits))
    return hits[0], None


def build_one(spec, rows):
    """-> result dict for the report, plus content_md when the table is emitted."""
    res = {"spec": spec, "emitted": False, "content_md": None,
           "checks": {}, "reason": None, "row": None, "ex": None}

    row, err = resolve_row(rows, spec)
    if err:
        res["reason"] = err
        return res
    res["row"] = row
    # table_id drift is information, never a failure: the owner may quarantine at
    # any time and the row_id keeps pointing at the same physical row.
    if row["table_id"] != spec["table_id"]:
        res["table_id_drift"] = (spec["table_id"], row["table_id"])

    pdf_path = os.path.join(PDF_DIR, spec["pdf"])
    pages = spec.get("pages") or [spec["page"]]

    # ---- check (a): provenance recorded and re-readable -------------------
    msgs_a, ok_a = [], True
    for k, pg in enumerate(pages):
        ok, msg = provenance_recheck(pdf_path, pg, spec["number"],
                                     spec["occurrence"] if k == 0 else 0)
        ok_a = ok_a and ok
        msgs_a.append(msg)
    res["checks"]["a"] = (ok_a, msgs_a)
    if not ok_a:
        res["reason"] = "check (a) failed: %s" % "; ".join(msgs_a)
        return res

    if len(pages) > 1:
        ex = extract_multipage(pdf_path, pages, spec["number"], spec["occurrence"])
    else:
        ex = extract_captioned_table(pdf_path, pages[0], spec["number"],
                                     spec["occurrence"])
    if "error" in ex:
        res["reason"] = "extraction failed: %s" % ex["error"]
        res["checks"]["b"] = (False, [ex["error"]])
        return res
    if not ex.get("footnotes"):
        ex["footnotes"] = recover_footnotes_from_next_page(pdf_path, pages[-1])
    res["ex"] = ex

    content_md = render_content_md(ex, spec, chapter=row.get("chapter"),
                                   edition=row.get("edition") or "2024")

    # ---- check (b): independent cell-by-cell re-extraction ----------------
    ok_b, diffs = reextract_diff(content_md, ex, pdf_path)
    res["checks"]["b"] = (ok_b, diffs)

    # ---- check (c): sprinkler inversion -----------------------------------
    ok_c, applicable_c, findings_c, comparisons_c = sprinkler_inversion(
        ex, spec["polarity"],
        exemptions=spec.get("inversion_exemptions"),
        target_id=spec["target_id"])
    res["checks"]["c"] = (ok_c, findings_c)
    res["c_applicable"] = applicable_c
    res["c_comparisons"] = comparisons_c

    # ---- check (d): units as printed --------------------------------------
    ok_d, findings_d = unit_check(content_md, ex["page_text"])
    res["checks"]["d"] = (ok_d, findings_d)

    # ---- check (e): the printed page contradicting itself -----------------
    ok_e, findings_e = internal_contradictions(ex, spec.get("ambiguities"))
    res["checks"]["e"] = (ok_e, findings_e)

    if ok_a and ok_b and ok_c and ok_d and ok_e:
        res["emitted"] = True
        res["content_md"] = content_md
    else:
        failed = [k for k in "bcde" if not res["checks"][k][0]]
        res["reason"] = "check(s) %s failed" % ", ".join("(%s)" % f for f in failed)
    return res


# ------------------------------------------------------------------ report
def sql_lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def write_sql(path, results, rows, entries):
    out = []
    w = out.append
    new_ids = sorted({r["spec"]["target_id"] for r in results if r["emitted"]
                      and r["spec"]["target_id"] != r["spec"]["table_id"]
                      .replace("QUARANTINED_", "")})
    w("-- ###############################################################")
    w("-- ##                                                           ##")
    w("-- ##   DEPLOY ORDER - REQUIRED. READ BEFORE RUNNING ANYTHING.  ##")
    w("-- ##                                                           ##")
    w("-- ###############################################################")
    w("--")
    w("--   1. Deploy the updated `fire-safety-chat` Edge Function FIRST.")
    w("--   2. THEN apply this SQL.")
    w("--")
    w("-- WHY. This file gives %d rebuilt tables ids that do not exist in"
      % len(new_ids))
    w("-- production today:")
    for nid in new_ids:
        w("--        %s" % nid)
    w("-- `fire-safety-chat` hard-codes table ids in KNOWN_TABLE_IDS and")
    w("-- PARENT_ALIASES, both built from the ids production carries NOW.")
    w("--")
    w("-- Applying this SQL against the CURRENTLY DEPLOYED function would:")
    w("--   * make rebuilt table 1006.3.4(1) COMPLETELY UNREACHABLE, and")
    w("--   * degrade 1020.2, 705.5 and 509.1 to matching only when the user")
    w("--     literally writes the word \"Table\".")
    w("--")
    w("-- The reverse order is harmless: deploying the code first simply means")
    w("-- the new ids match nothing until this SQL lands.")
    w("--")
    w("-- ###############################################################")
    w("")
    w("-- SBC code-table rebuild - SQL for the OWNER to apply")
    w("-- Generated %s by tools/sbc_tables/build.py" % date.today().isoformat())
    w("-- Companion report: docs/audits/code-tables-rebuild-20260823.md")
    w("--")
    w("-- THIS FILE PERFORMS WRITES. Read it before running it.")
    w("-- It contains no DDL and touches no table other than "
      "public.sbc_code_tables.")
    w("--")
    w("-- REVERSIBILITY")
    w("--   Step 0 below takes a full backup of the table into")
    w("--   public.sbc_code_tables_backup_20260823. Run it FIRST. Every UPDATE")
    w("--   keys on the primary key id, so the whole change set is reversible with:")
    w("--")
    w("--     UPDATE public.sbc_code_tables t")
    w("--        SET content_md = b.content_md, table_id = b.table_id,")
    w("--            table_title = b.table_title, section = b.section,")
    w("--            notes = b.notes")
    w("--       FROM public.sbc_code_tables_backup_20260823 b")
    w("--      WHERE t.id = b.id;")
    w("--")
    w("-- IDEMPOTENCE")
    w("--   Every statement keys on id (table_id is NOT unique in this table -")
    w("--   table_id '417' has two distinct rows) and assigns literal values, so")
    w("--   running the file twice leaves exactly the same state as running it once.")
    w("--   The backup in step 0 is guarded by IF NOT EXISTS for the same reason.")
    w("")
    w("BEGIN;")
    w("")
    w("-- ---------------------------------------------------------------")
    w("-- STEP 0: backup (idempotent - only creates the table the first time)")
    w("-- ---------------------------------------------------------------")
    w("DO $$")
    w("BEGIN")
    w("  IF NOT EXISTS (")
    w("    SELECT 1 FROM information_schema.tables")
    w("     WHERE table_schema = 'public'")
    w("       AND table_name  = 'sbc_code_tables_backup_20260823'")
    w("  ) THEN")
    w("    CREATE TABLE public.sbc_code_tables_backup_20260823 AS")
    w("      SELECT * FROM public.sbc_code_tables;")
    w("  END IF;")
    w("END $$;")
    w("")

    n = 0
    for r in results:
        if not r["emitted"]:
            continue
        n += 1
        s, row, ex = r["spec"], r["row"], r["ex"]
        w("-- ===============================================================")
        w("-- %d. %s  ->  table_id %s   [%s]" % (n, s["table_id"], s["target_id"],
                                                 s["status"].upper()))
        w("--    source   : %s" % ex["pdf"])
        w("--    page     : page_index_0based=%d (printed page %s)"
          % (ex["page_index_0based"], ex["printed_page"]))
        w("--    caption  : %s - %s" % (ex["caption"], ex["title"]))
        w("--    checks   : (a) PASS  (b) PASS  (c) %s  (d) PASS"
          % ("PASS" if r.get("c_applicable") else "N/A"))
        if s["status"] == "renumbered":
            w("--    ** RENUMBERED: table_id changes from %r to %r."
              % (s["table_id"], s["target_id"]))
            w("--       This changes what extractTableIds() in fire-safety-chat "
              "will match.")
        if s["note"]:
            for ln in _wrap(s["note"], 72):
                w("--    note     : %s" % ln)
        w("-- ---------------------------------------------------------------")
        w("-- Owner pre-check - run this SELECT to see the row as it stands now:")
        w("-- SELECT id, table_id, table_title, edition, chapter, section,")
        w("--        length(content_md) AS md_len, left(content_md, 400) AS head")
        w("--   FROM public.sbc_code_tables WHERE id = %s;" % sql_lit(row["id"]))
        w("")
        w("UPDATE public.sbc_code_tables SET")
        w("    table_id    = %s," % sql_lit(s["target_id"]))
        w("    table_title = %s," % sql_lit(ex["title"]))
        w("    edition     = '2024',")
        w("    section     = %s," % sql_lit(_section_of(s["target_id"])))
        w("    notes       = %s," % sql_lit(_notes_for(s, ex)))
        w("    content_md  = %s" % sql_lit(r["content_md"]))
        w("  WHERE id = %s;" % sql_lit(row["id"]))
        w("")

    # ---------------------------------------------------------------- quarantine
    quar = [e for e in entries if e["sql"] == "quarantine"]
    w("-- ===============================================================")
    w("-- PART 2: QUARANTINE - rows whose table number the SBC DOES NOT PRINT")
    w("-- ===============================================================")
    w("-- These %d rows are injected into the AI prompt today under" % len(quar))
    w("-- 'STRUCTURED CODE TABLES (DB-AUTHORITATIVE - CITE THESE VERBATIM)', but")
    w("-- no printed SBC table carries their number, so no cell of them can be")
    w("-- verified against the code. They are renamed - NOT deleted - exactly the")
    w("-- reversible way the safety alert does it, so extractTableIds() stops")
    w("-- matching them and they stop being injected. Content is preserved in")
    w("-- full for later repair.")
    w("--")
    w("-- Evidence of absence is recorded per row in the companion report: the")
    w("-- chapter's own 'TABLES AND FIGURES OF CHAPTER n' block is quoted with")
    w("-- the captions it actually lists.")
    w("")
    for e in quar:
        w("-- %s  (chapter %s, %s) - %s"
          % (e["table_id"], e["chapter"], e["source_code"], e["title"][:60]))
        w("UPDATE public.sbc_code_tables")
        w("   SET table_id = %s" % sql_lit("QUARANTINED_" + e["table_id"]))
        w(" WHERE id = %s" % sql_lit(e["row_id"]))
        w("   AND table_id = %s;" % sql_lit(e["table_id"]))
        w("")

    w("-- ---------------------------------------------------------------")
    w("-- VERIFY (run after COMMIT):")
    w("-- SELECT id, table_id, table_title, length(content_md) AS md_len")
    w("--   FROM public.sbc_code_tables")
    w("--  WHERE id IN (")
    ids = [sql_lit(r["row"]["id"]) for r in results if r["emitted"]]
    ids += [sql_lit(e["row_id"]) for e in quar]
    for i, lit in enumerate(ids):
        w("--        %s%s" % (lit, "," if i < len(ids) - 1 else ""))
    w("--  ) ORDER BY table_id;")
    w("--")
    w("-- Expected after this file: %d rows rebuilt, %d newly quarantined."
      % (sum(1 for r in results if r["emitted"]), len(quar)))
    w("")
    w("COMMIT;")
    w("")
    w("-- ===============================================================")
    w("-- REVERSAL - restores every row this file touched")
    w("-- ===============================================================")
    w("-- Run the whole block to undo BOTH parts. It restores from the step-0")
    w("-- backup, so it also undoes a partially applied run.")
    w("--")
    w("-- BEGIN;")
    w("-- UPDATE public.sbc_code_tables t")
    w("--    SET table_id    = b.table_id,")
    w("--        table_title = b.table_title,")
    w("--        edition     = b.edition,")
    w("--        section     = b.section,")
    w("--        notes       = b.notes,")
    w("--        content_md  = b.content_md")
    w("--   FROM public.sbc_code_tables_backup_20260823 b")
    w("--  WHERE t.id = b.id")
    w("--    AND (t.table_id    IS DISTINCT FROM b.table_id")
    w("--      OR t.table_title IS DISTINCT FROM b.table_title")
    w("--      OR t.edition     IS DISTINCT FROM b.edition")
    w("--      OR t.section     IS DISTINCT FROM b.section")
    w("--      OR t.notes       IS DISTINCT FROM b.notes")
    w("--      OR t.content_md  IS DISTINCT FROM b.content_md);")
    w("-- COMMIT;")
    w("--")
    w("-- To reverse ONLY the quarantine part:")
    w("-- UPDATE public.sbc_code_tables")
    w("--    SET table_id = replace(table_id, 'QUARANTINED_', '')")
    w("--  WHERE id IN (%s);"
      % ", ".join(sql_lit(e["row_id"]) for e in quar) if quar else "--  (none)")
    w("")
    w("-- Rows not touched by this file remain exactly as they are in production.")
    w("-- See the companion report for the per-row reason.")

    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out) + "\n")
    return n


def write_report(path, entries, results, rows):
    """One line per production row, plus the evidence sections."""
    from ledger import counts

    o = []
    w = o.append
    c = counts(entries)
    total = len(entries)

    w("# SBC code-table rebuild - full ledger of all %d production rows" % total)
    w("")
    w("Generated %s by `tools/sbc_tables/build.py`. Companion SQL: "
      "`code-tables-rebuild-20260823.sql` (the OWNER applies it; this toolchain "
      "never writes to the database)." % date.today().isoformat())
    w("")
    w("Every row of `public.sbc_code_tables` appears exactly once below. A row "
      "is only left alone when the reason is written down.")
    w("")
    new_ids = sorted({e["target_id"] for e in entries
                      if e["state"] == "REBUILT" and e.get("target_id")
                      and e["target_id"] != e["base_id"]})
    w("## 0. DEPLOY ORDER - REQUIRED")
    w("")
    w("**Deploy the updated `fire-safety-chat` Edge Function FIRST, then apply "
      "the SQL.**")
    w("")
    w("The rebuild gives %d tables ids that do not exist in production today: %s. "
      "`fire-safety-chat` hard-codes table ids in `KNOWN_TABLE_IDS` and "
      "`PARENT_ALIASES`, both built from the ids production carries now."
      % (len(new_ids), ", ".join("`%s`" % n for n in new_ids)))
    w("")
    w("Applying the SQL against the currently deployed function would make "
      "rebuilt table `1006.3.4(1)` completely unreachable, and would degrade "
      "`1020.2`, `705.5` and `509.1` to matching only when the user literally "
      "writes the word \"Table\". The reverse order is harmless: deploying the "
      "code first simply means the new ids match nothing until the SQL lands.")
    w("")
    w("| state | rows | meaning |")
    w("|---|---|---|")
    w("| REBUILT | %d | transcribed from the printed page; checks (a)(b)(c)(d)(e) "
      "all passed |" % c.get("REBUILT", 0))
    w("| NOT-BUILT | %d | a spec exists but a check failed; nothing is emitted |"
      % c.get("NOT-BUILT", 0))
    w("| QUARANTINE | %d | the SBC prints no table with this number; this file "
      "renames the row so it stops being injected |" % c.get("QUARANTINE", 0))
    w("| QUARANTINE (already) | %d | same finding, but the owner's earlier pass "
      "already renamed it; no SQL |" % c.get("QUARANTINE (already)", 0))
    w("| NOT-ATTEMPTED | %d | a printed table with this number DOES exist, but no "
      "spec was written in this pass |" % c.get("NOT-ATTEMPTED", 0))
    w("")

    # ------------------------------------------------------------ main ledger
    w("## 1. Per-row ledger")
    w("")
    w("`page` is a 0-BASED index into the named split PDF; `printed` is the page "
      "number the SBC prints in its footer. Re-read any row with "
      "`pdfplumber.open(pdf).pages[page]`.")
    w("")
    w("Check (a) provenance re-read - (b) independent cell-by-cell re-extraction "
      "- (c) sprinkler inversion - (d) units as printed - (e) the printed page "
      "contradicting itself.")
    w("")
    w("| # | production table_id | row id | target | state | PDF | page | printed "
      "| caption as printed | (a) | (b) | (c) | (d) | (e) |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i, e in enumerate(entries, 1):
        r = e.get("result")
        p = e.get("provenance")
        def ck(k):
            if not r or k not in r["checks"]:
                return "-"
            ok = r["checks"][k][0]
            if k == "c" and r.get("c_applicable") is False:
                return "N/A"
            return "PASS" if ok else "FAIL"
        w("| %d | `%s` | `%s` | %s | **%s** | %s | %s | %s | %s | %s | %s | %s | %s "
          "| %s |"
          % (i, e["table_id"], e["row_id"],
             ("`%s`" % e["target_id"]) if e.get("target_id") else "-",
             e["state"],
             ("`%s`" % p["pdf"]) if p else "-",
             ("%s" % (p["pages"] if len(p["pages"]) > 1 else p["page"]))
             if p else "-",
             p["printed_page"] if p else "-",
             ("`%s - %s`" % (p["caption"], p["title"][:60])) if p else "-",
             ck("a"), ck("b"), ck("c"), ck("d"), ck("e")))
    w("")

    # ------------------------------------------------- not built / not attempted
    bad = [e for e in entries if e["state"] in ("NOT-BUILT", "NOT-ATTEMPTED")]
    w("## 2. Rows not rebuilt, with the concrete reason")
    w("")
    if not bad:
        w("None. Every row is either REBUILT or QUARANTINE.")
    for e in bad:
        w("- **`%s`** (row `%s`) - %s: %s"
          % (e["table_id"], e["row_id"], e["state"], e.get("reason")))
    w("")

    # ------------------------------------------------------------ 1006.2.1
    w("## 3. The 1006.2.1 verdict")
    w("")
    r = next((x for x in results
              if x["spec"]["target_id"] == "1006.2.1"), None)
    if r and r["ex"]:
        ex = r["ex"]
        w("Read directly from the printed page: `%s`, page_index_0based=%d, "
          "**printed page %s**, caption `%s`, title `%s`."
          % (ex["pdf"], ex["page_index_0based"], ex["printed_page"],
             ex["caption"], ex["title"]))
        w("")
        w("Columns exactly as printed:")
        w("")
        for h in ex["flat_header"]:
            w("- `%s`" % h)
        w("")
        w("Every printed row, verbatim:")
        w("")
        w("| " + " | ".join(_md(h) for h in ex["flat_header"]) + " |")
        w("|" + "---|" * ex["ncols"])
        for rowc in ex["data_rows"]:
            w("| " + " | ".join(_md(rowc[j] if j < len(rowc) else "")
                                for j in range(ex["ncols"])) + " |")
        w("")
        w("Footnotes as printed:")
        w("")
        for f in ex["footnotes"]:
            w("- %s" % f)
        w("")
        w("**Verdict.** The inversion is REAL AND PRINTED, not an extraction "
          "fault. For Group U the code prints an unsprinklered OL<=30 allowance "
          "of 30 m against a sprinklered allowance of 23 m. It is corroborated "
          "in a second printed volume: SBC 801 printed page 835 "
          "(`SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf`, "
          "page_index_0based=64) prints the identical Group U row "
          "`U | 49 | 30 | 23 | 23 a`. No footnote on either page explains the "
          "reduction - footnote `a` only defines what \"sprinklered\" means.")
        w("")
        w("The row is therefore emitted verbatim under a **per-row, "
          "evidence-backed exemption** recorded in `specs.py` and consumed by "
          "check (c). The exemption is keyed on (target_id, row label) AND "
          "interlocked against the exact printed cells "
          "`[\"U\",\"49\",\"30\",\"23\",\"23a\"]`: if re-extraction ever yields "
          "anything else the exemption self-voids and the table fails the check. "
          "The inversion RULE itself is untouched and no other row is exempt.")
        w("")
        w("Check (c) comparison log for this table - every pair it judged, with "
          "the two column headers as printed:")
        w("")
        w("| row | without-sprinkler cell | with-sprinkler cell | verdict |")
        w("|---|---|---|---|")
        for cmpr in r.get("c_comparisons") or []:
            if cmpr["verdict"] in ("both NP", "unsprinklered NP - correct direction"):
                continue
            w("| %s | %s | %s | %s |" % (_md(cmpr["row"]), _md(cmpr["without_cell"]),
                                         _md(cmpr["with_cell"]), cmpr["verdict"]))
        w("")
        w("A NOTE ON BANDING, because it is the obvious objection: this table "
          "bands its without-sprinkler side by occupant load and leaves its "
          "with-sprinkler side unbanded. That does NOT make the comparison "
          "invalid. An unbanded column governs every band, so 23 m is the "
          "sprinklered limit for an OL<=30 Group U space just as much as for an "
          "OL>30 one. Skipping banded-against-unbanded comparisons would have "
          "suppressed this real finding, so check (c) keeps making them and "
          "records the headers instead.")
    else:
        w("NOT AVAILABLE - the 1006.2.1 spec did not produce an extraction.")
    w("")

    # -------------------------------------------- check (e) class-closing sweep
    w("## 3b. Internal-contradiction sweep across every rebuilt table")
    w("")
    w("Check (e) asks a question the other four cannot: does the printed page "
      "contradict ITSELF? A row label that appears twice with different values "
      "means there is no reading under which both are true. This is a GATE - a "
      "detected contradiction blocks emission unless `specs.py` carries an "
      "explicit ambiguity note, which `render.py` then ships inside "
      "`content_md` so the conflict travels with the table into the prompt.")
    w("")
    w("Two rows count as the same case only when they are identical in every "
      "CATEGORICAL column (a column that names the case - occupancy list, "
      "sprinkler condition `NS`/`S1`/`SM`, protection condition, construction "
      "type) and differ only in what they assert. That is what stops Table "
      "506.2 - which prints each occupancy three times, once per sprinkler "
      "condition - from being reported as 83 contradictions.")
    w("")
    w("Sweep result over all %d rebuilt tables:"
      % sum(1 for e in entries if e["state"] == "REBUILT"))
    w("")
    w("| target | contradictions found | covered by an ambiguity note? |")
    w("|---|---|---|")
    for e in entries:
        if e["state"] != "REBUILT":
            continue
        msgs = (e["result"]["checks"].get("e") or (True, []))[1]
        hits = [m for m in msgs if m.startswith("CONTRADICTION")]
        if not hits:
            w("| `%s` | none | - |" % e["target_id"])
        else:
            for m in hits:
                lab = m.split("[", 1)[1].split("]", 1)[0]
                w("| `%s` | row label `%s` printed twice with differing values | "
                  "yes |" % (e["target_id"], _md(lab)))
    w("")
    w("**Three contradictions across the 16 tables, all three covered by an "
      "ambiguity note that ships inside `content_md`:**")
    w("")
    w("| table | duplicated label | conflict | how it surfaced |")
    w("|---|---|---|---|")
    w("| `1006.2.1` | Group `U` | 23 m vs 30 m unsprinklered | found while "
      "adjudicating the check (c) inversion |")
    w("| `1017.2` | Group `I-1` | 60 m vs `Not permitted` unsprinklered | **found "
      "by this sweep** |")
    w("| `601` | `Floor construction and associated secondary structural members` "
      "| two different rating rows | **found by this sweep** |")
    w("")
    w("The `1017.2` and `601` hits are the reason the sweep exists: both were "
      "invisible to checks (a) through (d), and a one-off fix to either without "
      "sweeping the rest would have left the class open. No table has a "
      "duplicated column header.")
    w("")
    w("TABLE 601 is printed ONCE only, at SBC 201 printed page 505 "
      "(`SBC 201 - The Saudi General Building Code-501-1000.pdf`, "
      "page_index_0based=32). SBC 801 does NOT print a TABLE 601 - it only "
      "cross-references \"Table 601 of SBC 201\" at its printed page 981. So "
      "unlike TABLE 1006.2.1 (corroborated by SBC 801 page 835) and the TABLE "
      "1020.2 collision (resolved by SBC 801 page 839), **no second printing "
      "exists that could settle this one**. It needs the authority having "
      "jurisdiction.")
    w("")
    w("What the duplicated row prints:")
    w("")
    w("| row | as printed |")
    w("|---|---|")
    w("| first (y-top 262.7) | `2 \\| 2 \\| 1 \\| 0 \\| 1 \\| 0 \\| 2 \\| 2 \\| 2 "
      "\\| HT \\| 1 \\| 0` |")
    w("| second (y-top 297.5) | `b \\| 1b, c \\| 1b, c \\| 0c \\| 1b, c \\| 0 \\| "
      "1 \\| 1 \\| 1 \\| HT \\| 1b, c \\| 0` |")
    w("")
    w("The word \"Roof\" does not appear as a row label anywhere in TABLE 601 - "
      "it occurs only in the footnotes - so the table as printed states no "
      "roof-construction requirement at all. Whether the second row was meant "
      "to read \"Roof construction\" is **UNKNOWN** and is deliberately not "
      "inferred. The shipped ambiguity note states that the HIGHER rating in "
      "each column governs pending clarification, a rating being a requirement.")
    w("")

    # ------------------------------------------------------- imperial census
    w("## 4. Imperial-unit census (measured, not inherited)")
    w("")
    w("The SBC prints in metric. Any imperial token in `content_md` that is not "
      "printed on the cited source page is a defect. Measured over the "
      "production dump with the same token list check (d) uses "
      "(`ft`, `feet`, `foot`, `inch`, `inches`, `in.`, `psi`, `gpm`, "
      "`degrees F`).")
    w("")
    act = [e for e in entries if not e["already_quarantined"] and e["imperial"]]
    alli = [e for e in entries if e["imperial"]]
    w("- rows carrying at least one imperial token: **%d of %d**"
      % (len(alli), total))
    w("- of those, still ACTIVE (not quarantined, i.e. still injected today): "
      "**%d**" % len(act))
    w("")
    if act:
        w("| production table_id | row id | chapter | tokens | title |")
        w("|---|---|---|---|---|")
        for e in act:
            w("| `%s` | `%s` | %s | %s | %s |"
              % (e["table_id"], e["row_id"], e["chapter"],
                 ", ".join("`%s`" % t for t in e["imperial"]), _md(e["title"][:60])))
        w("")
    w("Full list including already-quarantined rows:")
    w("")
    w("| production table_id | quarantined? | tokens |")
    w("|---|---|---|")
    for e in alli:
        w("| `%s` | %s | %s |" % (e["table_id"],
                                  "yes" if e["already_quarantined"] else "**NO**",
                                  ", ".join("`%s`" % t for t in e["imperial"])))
    w("")

    # -------------------------------------------------------- absence evidence
    w("## 5. Evidence of absence for the quarantined rows")
    w("")
    w("A row is only quarantined for \"no printed table\" when the chapter's own "
      "collection block has been read and does not list the number. The blocks "
      "below are what the SBC actually prints.")
    w("")
    seen = set()
    for e in entries:
        if not e["state"].startswith("QUARANTINE"):
            continue
        key = (e["source_code"], e["chapter"])
        if key in seen:
            continue
        seen.add(key)
        nums = sorted({x["base_id"] for x in entries
                       if x["state"].startswith("QUARANTINE")
                       and x["source_code"] == e["source_code"]
                       and x["chapter"] == e["chapter"]})
        w("### %s, chapter %s" % (e["source_code"], e["chapter"]))
        w("")
        w("Rows with no printed table: %s" % ", ".join("`%s`" % n for n in nums))
        w("")
        for blk in (e.get("absence") or []):
            spans = "; ".join("`%s` idx %d..%d" % (s["pdf"], s["start"], s["end"])
                              for s in blk["spans"])
            w("- block in %s" % (spans or ("`%s`" % blk["pdf"])))
            w("  - captions it actually lists: %s"
              % (", ".join("`%s`" % n for n in blk["numbers"]) or "(none)"))
        w("")

    # --------------------------------------------------------- owner decisions
    w("## 6. What the owner must decide")
    w("")
    w("### 6.1 Two different tables are both printed as TABLE 1020.2 (SBC 201)")
    w("")
    w("CONFIRMED against the PDF: pdfplumber finds a caption `TABLE 1020.2` at "
      "y=525.15 on page_index_0based 215 (printed page 1188, CORRIDOR "
      "FIRE-RESISTANCE RATING) and again at y=75.29 on page_index_0based 216 "
      "(printed page 1189, MINIMUM CORRIDOR WIDTH). The collision is in the "
      "printed SBC 201 itself.")
    w("")
    w("**SBC 801 resolves it.** Printed page 839 "
      "(`SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf`, "
      "page_index_0based=68) prints `TABLE 1020.2 CORRIDOR FIRE-RESISTANCE "
      "RATING` and `TABLE 1020.3 MINIMUM CORRIDOR WIDTH` as two separately "
      "numbered tables.")
    w("")
    w("Recommendation: give the corridor-width row the number **1020.3**, per "
      "SBC 801. Until that is approved it carries the synthetic id "
      "`1020.2-width`, which `extractTableIds()` will not match - the content is "
      "repaired but the row stays un-injected rather than colliding.")
    w("")
    w("Note the safety-alert claim is confirmed by this rebuild: the printed "
      "minimum corridor width for facilities not otherwise listed is "
      "**1100 mm**, not the 914 mm production carried.")
    w("")
    w("### 6.2 TABLE 508.4 subject mismatch")
    w("")
    w("The printed `TABLE 508.4` is REQUIRED SEPARATION OF OCCUPANCIES (HOURS); "
      "the production row titled `508.4` is \"Nonseparated Occupancies - "
      "Most-Restrictive Occupancy Rule\". The rebuild replaces the row with the "
      "printed separation table, so the row's SUBJECT changes. Confirm that is "
      "wanted, or split it into two rows.")
    w("")
    w("### 6.3 The two printed volumes disagree with each other on TABLE 1006.2.1")
    w("")
    w("CONFIRMED by reading both pages. SBC 201 printed page 1186 versus SBC 801 "
      "printed page 835:")
    w("")
    w("| | SBC 201 p.1186 | SBC 801 p.835 |")
    w("|---|---|---|")
    w("| first row occupancies | `Ac, M, U` | `Ac, E, M` |")
    w("| R-2 / R-3 / R-4 max occupant load | 20 | 10 |")
    w("| R-4e without sprinkler | `NP` / `NP` | `23` / `23` |")
    w("")
    w("SBC 201 lists Group U twice and never lists Group E, which looks like a "
      "misprint in SBC 201 - but that is an inference, NOT a finding, and the "
      "rebuild transcribes SBC 201 as printed because the row is tagged "
      "`SBC 201`. The owner should decide which volume governs.")
    w("")
    w("### 6.4 `table_id` is not an identity")
    w("")
    w("`table_id` is neither unique (`417` is two distinct rows) nor stable (the "
      "owner's quarantine passes rewrite it in place). Everything in this "
      "toolchain keys on the uuid primary key instead. Any future script that "
      "keys on `table_id` will silently stop matching rows after a quarantine "
      "pass.")
    w("")
    w("### 6.5 Most production rows are not tables at all")
    w("")
    w("Only 13 of the %d production numbers are printed as a table caption "
      "anywhere in either code. The rest are numbered after code SECTIONS "
      "(for example `1014.1` \"Handrails: Where Required\", `907.5`, `903.4.3`) "
      "and are editorial summaries, not transcriptions. They cannot be verified "
      "cell by cell against the code, yet they are injected under a header that "
      "tells the model to cite them verbatim as authoritative. That mismatch - "
      "not any single wrong number - is the systemic defect." % total)
    w("")

    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(o) + "\n")
    return c


def _md(s):
    if s is None:
        return ""
    return str(s).replace("|", "\\|").replace("\n", " ").strip()


def _section_of(target_id):
    base = target_id.split("(")[0]
    return base


def _notes_for(spec, ex):
    bits = ["Transcribed verbatim from the printed SBC table.",
            "Provenance: %s, page_index_0based=%d, printed page %s, caption %r."
            % (ex["pdf"], ex["page_index_0based"], ex["printed_page"], ex["caption"]),
            "Units exactly as printed (the SBC prints this table in metric)."]
    if spec["status"] == "renumbered":
        bits.append("RENUMBERED from %s to %s: the SBC does not print the former "
                    "number." % (spec["table_id"].replace("QUARANTINED_", ""),
                                 spec["target_id"]))
    if spec["note"]:
        bits.append(spec["note"])
    return " ".join(bits)


def _wrap(text, width):
    words, line, out = text.split(), "", []
    for word in words:
        if len(line) + len(word) + 1 > width:
            out.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    if line:
        out.append(line)
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", required=True)
    ap.add_argument("--report")
    ap.add_argument("--sql")
    ap.add_argument("--json-out")
    ap.add_argument("--only", nargs="*", default=None,
                    help="limit to these production table_id values (debugging)")
    args = ap.parse_args()

    # utf-8-sig: a dump taken through PowerShell redirection carries a UTF-8 BOM,
    # which plain utf-8 rejects with "Unexpected UTF-8 BOM".
    rows = json.load(open(args.rows, encoding="utf-8-sig"))
    if args.only:
        want = set(args.only)
        specs = [s for s in SPECS
                 if s["table_id"] in want
                 or s["table_id"].replace("QUARANTINED_", "") in want
                 or s["target_id"] in want
                 or s["row_id"] in want]
    else:
        specs = SPECS
    results = []
    for s in specs:
        results.append(build_one(s, rows))
        print("... built %s" % s["table_id"], flush=True)

    for r in results:
        s = r["spec"]
        flags = " ".join("%s=%s" % (k, "PASS" if v[0] else "FAIL")
                         for k, v in sorted(r["checks"].items()))
        print("%-24s -> %-14s %-11s %s %s"
              % (s["table_id"], s["target_id"], s["status"],
                 "REBUILT " if r["emitted"] else "NOT-BUILT", flags))
        if not r["emitted"] and r["reason"]:
            print("      reason: %s" % r["reason"])
        for k in "bcde":
            ok, msgs = r["checks"].get(k, (True, []))
            if not ok:
                for m in msgs[:20]:
                    print("      (%s) %s" % (k, m))

    # ---- adjudicate EVERY production row, not just the specced ones -------
    entries = adjudicate(rows, results)
    c = counts(entries)
    print("\n%s" % ("=" * 72))
    print("LEDGER over all %d production rows" % len(entries))
    print("=" * 72)
    for k in ("REBUILT", "NOT-BUILT", "QUARANTINE", "QUARANTINE (already)",
              "NOT-ATTEMPTED"):
        print("  %-22s %d" % (k, c.get(k, 0)))
    missing = len(rows) - sum(c.values())
    print("  %-22s %d   (must be 0)" % ("UNACCOUNTED", missing))

    if args.report:
        write_report(args.report, entries, results, rows)
        print("\nwrote %s" % args.report)

    if args.sql:
        n = write_sql(args.sql, results, rows, entries)
        nq = sum(1 for e in entries if e["sql"] == "quarantine")
        print("wrote %s (%d UPDATE statements, %d quarantine statements)"
              % (args.sql, n, nq))

    if args.json_out:
        dump = []
        for r in results:
            dump.append({
                "table_id": r["spec"]["table_id"],
                "target_id": r["spec"]["target_id"],
                "status": r["spec"]["status"],
                "note": r["spec"]["note"],
                "emitted": r["emitted"],
                "reason": r["reason"],
                "row_id": (r["row"] or {}).get("id"),
                "old_title": (r["row"] or {}).get("table_title"),
                "old_md_len": len((r["row"] or {}).get("content_md") or ""),
                "checks": {k: {"ok": v[0], "messages": v[1]}
                           for k, v in r["checks"].items()},
                "c_applicable": r.get("c_applicable"),
                "provenance": None if not r["ex"] else {
                    "pdf": r["ex"]["pdf"],
                    "page_index_0based": r["ex"]["page_index_0based"],
                    "printed_page": r["ex"]["printed_page"],
                    "caption": r["ex"]["caption"],
                    "title": r["ex"]["title"],
                    "n_data_rows": len(r["ex"]["data_rows"]),
                },
                "content_md": r["content_md"],
            })
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(dump, fh, ensure_ascii=False, indent=1)
        print("wrote %s" % args.json_out)

    close_all()


if __name__ == "__main__":
    main()
