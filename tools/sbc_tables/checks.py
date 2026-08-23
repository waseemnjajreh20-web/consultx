"""The four MANDATORY checks. A table failing any of them is NOT emitted.

(a) provenance_recheck   - re-open the recorded (pdf, page_index_0based) in a
                           separate pass and confirm the caption is on that page.
(b) reextract_diff       - parse the content_md that is about to be emitted, and
                           compare it CELL BY CELL against a fresh, independently
                           selected pdfplumber extraction of the recorded page.
                           The full diff is printed on mismatch.
(c) sprinkler_inversion  - for a table with a with-sprinkler and a
                           without-sprinkler column, reject any row whose
                           WITHOUT-sprinkler requirement is LESS strict than its
                           WITH-sprinkler requirement. NOT PERMITTED is treated
                           as infinitely strict.
(d) unit_check           - reject any ft / feet / foot / inch / in. / psi / gpm /
                           degrees-Fahrenheit token that the source PDF page does
                           not itself print.

Independence of (b): extract.py selects the table by CAPTION GEOMETRY (bbox top
between this caption and the next) and expands merged cells from cell bboxes.
The verifier below re-opens the file with a separate handle, finds the caption's
ORDINAL POSITION in the page's plain text layer, and takes the table at that same
ordinal position from pdfplumber's plain page.extract_tables(). Different handle,
different location method, different selection rule, no span expansion. Positions
that extract.py filled by span expansion must come back as None here - proving
they were printed merges and not invented values.
"""
from __future__ import annotations

import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import parse_content_md, sig  # noqa: E402
from sbc_common import norm  # noqa: E402

CAPTION_RE = re.compile(
    r"^\s*TABLE\s+([0-9]+(?:\.[0-9]+)*(?:\([0-9A-Za-z]+\))?)(?![0-9.])", re.IGNORECASE
)


# --------------------------------------------------------------- check (a)
def provenance_recheck(pdf_path, page_index, table_number, occurrence=0):
    """Independent second read of the recorded page: is the caption really there?"""
    with pdfplumber.open(pdf_path) as pdf:
        if page_index < 0 or page_index >= len(pdf.pages):
            return False, "page index %d out of range (%d pages)" % (
                page_index, len(pdf.pages))
        text = pdf.pages[page_index].extract_text() or ""
    found = [m.group(1) for m in
             (CAPTION_RE.match(ln) for ln in text.splitlines()) if m]
    n = found.count(table_number)
    if n > occurrence:
        return True, ("caption 'TABLE %s' occurrence %d confirmed on %s "
                      "page_index_0based=%d" % (table_number, occurrence,
                                                os.path.basename(pdf_path), page_index))
    return False, ("caption 'TABLE %s' occurrence %d NOT on %s page_index_0based=%d; "
                   "captions present: %s" % (table_number, occurrence,
                                             os.path.basename(pdf_path),
                                             page_index, found))


# --------------------------------------------------------------- check (b)
def independent_extract(pdf_path, page_index, table_number, occurrence=0):
    """Fresh handle, text-layer caption ordinal, plain page.extract_tables()."""
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_index]
        text = page.extract_text() or ""
        ordinal = None
        seen = 0
        k = 0
        for ln in text.splitlines():
            m = CAPTION_RE.match(ln)
            if not m:
                continue
            if m.group(1) == table_number:
                if seen == occurrence:
                    ordinal = k
                    break
                seen += 1
            k += 1
        if ordinal is None:
            return None, "caption not located in the text layer"
        tables = page.extract_tables()
        if ordinal >= len(tables):
            return None, ("caption ordinal %d but only %d tables found by "
                          "page.extract_tables()" % (ordinal, len(tables)))
        return tables[ordinal], None


def reextract_diff(content_md, ex, pdf_path):
    """Compare the emitted markdown to a fresh independent extraction, cell by cell.

    For a table the SBC prints across several pages, each page is re-extracted
    independently and the data rows are concatenated in the same page order the
    emitter used.
    """
    parts = ex.get("parts") or [ex]
    ref_data, nheader = [], len(ex["header_rows"])
    for k, part in enumerate(parts):
        ref, err = independent_extract(pdf_path, part["page_index_0based"],
                                       part["table_number"], part["occurrence"])
        if ref is None:
            return False, ["independent re-extraction of page index %d failed: %s"
                           % (part["page_index_0based"], err)]
        ref_data.extend(ref[len(part["header_rows"]):])
        if k == 0:
            ref_header = ref[:nheader]

    md_header, md_rows = parse_content_md(content_md)
    diffs = []
    ref = ref_header + ref_data

    if len(md_rows) != len(ref_data):
        diffs.append("ROW COUNT: content_md has %d data rows, independent "
                     "re-extraction has %d" % (len(md_rows), len(ref_data)))

    spanned = ex["spanned"]
    for i in range(min(len(md_rows), len(ref_data))):
        gi = nheader + i          # index into the span-expanded grid
        for j in range(ex["ncols"]):
            mine = md_rows[i][j] if j < len(md_rows[i]) else ""
            theirs = ref_data[i][j] if j < len(ref_data[i]) else None
            is_span = spanned[gi][j] if gi < len(spanned) and j < len(spanned[gi]) \
                else False
            if is_span:
                # a span-expanded position must be EMPTY in the plain extraction
                if theirs is not None and norm(theirs) != "":
                    diffs.append(
                        "row %d col %d: marked as a printed merge but the plain "
                        "extraction has its own value %r" % (i, j, theirs))
                continue
            if sig(mine) != sig(theirs):
                diffs.append("row %d col %d: content_md=%r  independent=%r"
                             % (i, j, mine, theirs))

    # headers: compare the concatenation of every printed header cell, since the
    # two paths flatten multi-level headers differently by construction.
    mine_h = " ".join(sorted(sig(h) for h in md_header if sig(h)))
    theirs_h = " ".join(sorted({sig(c) for row in ref[:nheader] for c in row
                                if sig(c)}))
    for tok in theirs_h.split():
        if tok not in mine_h:
            diffs.append("header token %r present in the independent extraction "
                         "but missing from content_md" % tok)
            break

    return (not diffs), diffs


# --------------------------------------------------------------- check (c)
NP_RE = re.compile(r"^(NOT\s*PERMITTED|NP)\b", re.IGNORECASE)
NUM_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)")


def _strictness(cell, polarity):
    """(kind, value). kind: 'np' | 'num' | 'other'.

    'np' is infinitely strict. For an ALLOWANCE a larger number is LESS strict;
    for a REQUIREMENT a larger number is MORE strict.
    """
    s = norm(cell)
    if not s:
        return ("other", None)
    if NP_RE.match(s):
        return ("np", None)
    m = NUM_RE.match(s)
    if m:
        return ("num", float(m.group(1)))
    return ("other", None)


_BAND_RE = re.compile(r"OL\s*[<>≤≥]|OCCUPANT\s+LOAD\s*[<>≤≥]|GREATER\s+THAN|"
                      r"LESS\s+THAN", re.IGNORECASE)


def _banding(without_header, with_header):
    """Is this comparison banded-against-unbanded?

    Recorded as EVIDENCE, never used to skip a comparison. Table 1006.2.1 bands
    its without-sprinkler side by occupant load and leaves the with-sprinkler
    side unbanded; skipping such pairs would make check (c) perform ZERO
    comparisons on that table and silently pass the most safety-critical
    common-path table in the code. An unbanded column governs EVERY band, so the
    comparison is sound - the reader just deserves to be told the shape.
    """
    a = bool(_BAND_RE.search(without_header or ""))
    b = bool(_BAND_RE.search(with_header or ""))
    if a and b:
        return "banded vs banded"
    if a != b:
        return "banded vs unbanded (unbanded column governs every band)"
    return "unbanded vs unbanded"


def _exemption_for(exemptions, target_id, label, row):
    """The exemption covering this row, or None.

    An exemption is keyed on (target_id, row label) AND is INTERLOCKED against
    the printed cells it quotes: if the extracted row is not character-for-
    character (after normalisation) the row the exemption was written about, the
    exemption does NOT apply and the inversion stands. That interlock is the
    whole point - it makes an exemption a statement about specific printed
    values rather than a permanent hole in the check. Re-extract the page with
    different numbers and the exemption stops covering it.
    """
    for ex_rec in exemptions or []:
        if ex_rec.get("target_id") != target_id:
            continue
        if sig(ex_rec.get("row")) != sig(label):
            continue
        quoted = [sig(c) for c in ex_rec.get("cells", [])]
        actual = [sig(c) for c in row]
        if quoted != actual:
            return {"__stale__": True, "rec": ex_rec, "quoted": quoted,
                    "actual": actual}
        return {"__stale__": False, "rec": ex_rec}
    return None


def sprinkler_inversion(ex, polarity, exemptions=None, target_id=None):
    """Reject any row that is LESS strict without sprinklers than with them.

    Returns (ok, applicable, findings, comparisons).

    'comparisons' records EVERY pair the check actually looked at, with the two
    column headers exactly as printed and the two cell values. A bare PASS is
    not evidence; the comparison log is.

    ON OCCUPANT-LOAD BANDING (deliberate design decision, do not "fix"):
    Table 1006.2.1 bands its WITHOUT-sprinkler side by occupant load
    ("OL<= 30" / "OL > 30") while its WITH-sprinkler side is UNBANDED. It is
    tempting to call a banded-vs-unbanded comparison "not like with like" and
    skip it. That would be wrong and would suppress real findings: an unbanded
    column applies to EVERY band, so its value is the governing sprinklered
    limit for the OL<=30 case just as much as for the OL>30 case. A Group U
    space with an occupant load of 20 is squarely inside the OL<=30 band, and
    for that one building the printed code allows 30 m unsprinklered and 23 m
    sprinklered. The comparison is like with like. What the check owes the
    reader is not silence but the two column headers, which 'comparisons' now
    carries.
    """
    hdr = [h.upper() for h in ex["flat_header"]]
    without = [j for j, h in enumerate(hdr) if "WITHOUT SPRINKLER" in h]
    with_ = [j for j, h in enumerate(hdr)
             if "SPRINKLER" in h and "WITHOUT SPRINKLER" not in h]
    if not without or not with_:
        return True, False, ["no with/without-sprinkler column pair -> check (c) "
                             "not applicable"], []
    if polarity not in ("allowance", "requirement"):
        return False, True, ["column pair present but specs.py declares no "
                             "polarity; refusing to judge strictness"], []

    findings, comparisons = [], []
    ok = True
    n_pairs = 0
    for i, row in enumerate(ex["data_rows"]):
        label = norm(row[0]) if row else "row %d" % i
        for jw in without:
            for js in with_:
                cw = row[jw] if jw < len(row) else None
                cs = row[js] if js < len(row) else None
                kw, vw = _strictness(cw, polarity)
                ks, vs = _strictness(cs, polarity)
                n_pairs += 1
                verdict = "ok"
                if kw == "np" and ks == "np":
                    verdict = "both NP"
                elif kw == "np":
                    verdict = "unsprinklered NP - correct direction"
                elif ks == "np":
                    verdict = "INVERTED"
                elif kw != "num" or ks != "num":
                    verdict = "non-numeric - not judged"
                elif polarity == "allowance" and vw > vs:
                    verdict = "INVERTED"
                elif polarity == "requirement" and vw < vs:
                    verdict = "INVERTED"
                comparisons.append({
                    "row": label,
                    "without_header": ex["flat_header"][jw],
                    "with_header": ex["flat_header"][js],
                    "without_cell": cw, "with_cell": cs,
                    "polarity": polarity, "verdict": verdict,
                    "banding": _banding(ex["flat_header"][jw],
                                        ex["flat_header"][js]),
                })
                if verdict != "INVERTED":
                    continue

                exm = _exemption_for(exemptions, target_id, label, row)
                if exm and exm["__stale__"]:
                    ok = False
                    findings.append(
                        "INVERTED [%s]: an exemption exists for this row but it "
                        "quotes DIFFERENT printed cells (%r) than the extraction "
                        "produced (%r). The exemption does NOT apply; re-read the "
                        "page." % (label, exm["quoted"], exm["actual"]))
                    comparisons[-1]["verdict"] = "INVERTED (stale exemption)"
                    continue
                if exm:
                    rec = exm["rec"]
                    comparisons[-1]["verdict"] = "INVERTED but EXEMPT (printed)"
                    findings.append(
                        "EXEMPT [%s]: printed inversion, verified against the "
                        "page. %r vs %r under %r / %r. Printed page %s. Why: %s"
                        % (label, cw, cs, ex["flat_header"][jw],
                           ex["flat_header"][js], rec.get("printed_page"),
                           rec.get("why")))
                    continue

                ok = False
                if ks == "np":
                    findings.append(
                        "INVERTED [%s]: WITH sprinkler is NOT PERMITTED while "
                        "WITHOUT sprinkler is %r - sprinklers can only relax a "
                        "requirement" % (label, cw))
                elif polarity == "allowance":
                    findings.append(
                        "INVERTED [%s]: without-sprinkler allows %g but with-"
                        "sprinkler allows only %g  [%r vs %r]"
                        % (label, vw, vs, ex["flat_header"][jw],
                           ex["flat_header"][js]))
                else:
                    findings.append(
                        "INVERTED [%s]: without-sprinkler requires %g but with-"
                        "sprinkler requires a stricter %g  [%r vs %r]"
                        % (label, vw, vs, ex["flat_header"][jw],
                           ex["flat_header"][js]))

    if ok and not [f for f in findings if f.startswith("INVERTED")]:
        findings.insert(0, "%d rows / %d column pairs checked, no unexempted row "
                           "is less strict without sprinklers"
                        % (len(ex["data_rows"]), n_pairs))
    return ok, True, findings, comparisons


# --------------------------------------------------------------- check (e)
def _labels_in(cell):
    """Occupancy labels in a row stub: 'A, E, F-1, I-1, M, R, S-1' -> the set."""
    s = norm(cell)
    if not s:
        return set()
    out = set()
    for part in re.split(r"[,/]", s):
        p = part.strip()
        # strip a trailing superscript footnote letter: 'I-2d' -> 'I-2', 'R-3e'
        p = re.sub(r"(?<=[0-9])[a-z](?:,[a-z])*$", "", p)
        p = re.sub(r"^(?<![A-Z])$", "", p)
        if re.fullmatch(r"[A-Z](?:-[0-9A-Z]+)?", p):
            out.add(p)
    return out


# A MEASUREMENT cell is a value the table is asserting: a number, a percentage,
# or one of the code's value words. Everything else is CATEGORICAL - it names
# which case the row is about.
#
# This distinction is what separates a real contradiction from ordinary table
# structure. Table 506.2 prints A-1 three times and Table 705.8 prints each
# distance band three times, but those rows differ in a CATEGORICAL column
# ('NS' / 'S1' / 'SM'; 'Protected (P)' / 'Unprotected, Nonsprinklered'), so they
# describe different cases and do not conflict. Table 601 prints the same floor
# construction stub twice with different ratings and NO categorical column
# separating them - there is no reading under which both are true.
_VALUE_WORDS = {"UL", "NP", "NA", "HT", "NOLIMIT", "NOTPERMITTED", "NONE", "",
                "ALL", "-"}


def _is_measurement(cell):
    s = norm(cell)
    # strip trailing footnote markers: '1b, c' -> '1', '19.5a' -> '19.5'
    s = re.sub(r"(?<=[0-9%])\s*[a-z](\s*,\s*[a-z])*\s*$", "", s)
    s = re.sub(r"(?<=[A-Za-z])\s*[0-9]$", "", s)
    key = re.sub(r"[^A-Za-z]", "", s).upper()
    if key in _VALUE_WORDS:
        return True
    return bool(re.fullmatch(r"[0-9][0-9,.]*\s*%?", s.strip()))


def _categorical_columns(ex):
    """Indices (>=1) of columns that name the CASE rather than assert a value.

    MAJORITY, not unanimity. Requiring every value in a column to be a
    measurement is too brittle: in TABLE 601 a detached superscript leaves one
    cell reading just 'b' in an otherwise all-numeric column of ratings. Under
    an all-or-nothing rule that single stray token reclassifies the whole column
    as categorical, which in turn makes the two conflicting floor-construction
    rows look like two different cases - and the real contradiction disappears.
    A column is categorical when MOST of its values name a case.
    """
    out = []
    for j in range(1, ex["ncols"]):
        vals = [row[j] if j < len(row) else None for row in ex["data_rows"]]
        nonempty = [v for v in vals if norm(v)]
        if not nonempty:
            continue
        cat = sum(1 for v in nonempty if not _is_measurement(v))
        if cat * 2 > len(nonempty):
            out.append(j)
    return out


def internal_contradictions(ex, ambiguities=None):
    """Rows that cover the SAME occupancy but print DIFFERENT values.

    The SBC prints stub cells like 'A, E, F-1, I-1, M, R, S-1' as well as bare
    'I-1'. When the same occupancy appears in two rows with different limits the
    printed page contradicts itself about a life-safety number. That is not a
    parsing bug and must never be silently reconciled - so this is a GATE: a
    detected contradiction blocks emission unless specs.py carries an explicit
    ambiguity note for it, which render.py then ships inside content_md.

    Returns (ok, findings).
    """
    covered = " ".join((a.get("what") or "") for a in (ambiguities or []))
    cond = _categorical_columns(ex)
    where: dict = {}
    for i, row in enumerate(ex["data_rows"]):
        if not row:
            continue
        # Two rows only contradict when they describe the SAME case: identical
        # in every categorical column, differing only in what they assert.
        cond_key = tuple(sig(row[j]) if j < len(row) else "" for j in cond)
        # Occupancy CODES ('A', 'I-1', ...) and, separately, the WHOLE printed
        # stub. The stub matters because a repeated PROSE label is the same
        # defect: TABLE 601 prints "Floor construction and associated secondary
        # structural members" twice with different ratings, and an
        # occupancy-code-only detector walks straight past it.
        keys = set(_labels_in(row[0]))
        stub = norm(row[0])
        if stub:
            keys.add("stub:" + stub)
        for lab in keys:
            where.setdefault((lab, cond_key), []).append((i, row))

    findings, ok = [], True
    for (lab, ckey) in sorted(where, key=lambda k: (k[0], k[1])):
        occ = where[(lab, ckey)]
        if len(occ) < 2:
            continue
        value_cols = [j for j in range(1, ex["ncols"]) if j not in cond]
        sigs = {tuple(sig(r[j]) if j < len(r) else "" for j in value_cols)
                for _, r in occ}
        if len(sigs) < 2:
            continue                      # duplicated but identical: harmless
        detail = " / ".join(
            "row %d %r -> %s" % (i, norm(r[0]),
                                 " | ".join(norm(c) for c in r[1:]))
            for i, r in occ)
        shown = lab[5:] if lab.startswith("stub:") else lab
        if _covered(covered, shown):
            findings.append("CONTRADICTION [%s] covered by an ambiguity note: %s"
                            % (shown, detail))
        else:
            ok = False
            findings.append(
                "CONTRADICTION [%s] NOT covered by any ambiguity note in "
                "specs.py: %s. Add one naming the conflict and the conservative "
                "value, or the table is not emitted." % (shown, detail))

    # duplicated column headers - the same defect on the other axis
    seen_h: dict = {}
    for j, h in enumerate(ex["flat_header"]):
        s = sig(h)
        if s:
            seen_h.setdefault(s, []).append(j)
    for s, cols in seen_h.items():
        if len(cols) > 1:
            findings.append(
                "NOTE: column header %r appears in columns %s. Not treated as a "
                "contradiction (repeated headers are normal in span-expanded "
                "multi-level headers), recorded for the reader." % (s, cols))

    if not findings:
        findings.append("no row label appears twice with differing values, and no "
                        "duplicated column header")
    return ok, findings


def _covered(covered_text, label):
    """Does some ambiguity note in specs.py actually name this label?"""
    if not covered_text or not label:
        return False
    c = covered_text.upper()
    lab = label.upper()
    if lab in c:
        return True
    # prose stubs are long; require a distinctive leading fragment to match
    frag = " ".join(lab.split()[:5])
    return len(frag) >= 12 and frag in c


# --------------------------------------------------------------- check (d)
IMPERIAL = [
    (r"\bft\b", "ft"),
    (r"\bfeet\b", "feet"),
    (r"\bfoot\b", "foot"),
    (r"\binches\b", "inches"),
    (r"\binch\b", "inch"),
    (r"\bin\.", "in."),
    (r"\bpsi\b", "psi"),
    (r"\bgpm\b", "gpm"),
    (r"(?:°|\bdegrees?\s*)F\b", "degrees F"),
]


def unit_check(content_md, page_text):
    """Every imperial token in content_md must be printed on the source page."""
    findings, ok = [], True
    for pat, label in IMPERIAL:
        rx = re.compile(pat, re.IGNORECASE)
        in_md = rx.search(content_md)
        if not in_md:
            continue
        if rx.search(page_text or ""):
            findings.append("token %r appears in content_md AND is printed on the "
                            "source page - allowed 'as printed'" % label)
        else:
            ok = False
            findings.append("token %r appears in content_md but is NOT printed on "
                            "the source page - REJECTED" % label)
    if not findings:
        findings.append("no imperial unit token in content_md")
    return ok, findings
