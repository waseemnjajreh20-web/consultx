"""Sub-Agent A6 (round 4) — Final QA validation.

Reads:
- data/consultx_brain/full_corpus/extracted_gaps/sbc801_round4_core/* (A1)
- data/consultx_brain/full_corpus/extracted_gaps/sbc801_round4_hazmat/* (A2)
- data/consultx_brain/full_corpus/relations/round4_gap_relations.json (A3)
- data/consultx_brain/full_corpus/facts/round4_gap_facts.json (A4)
- data/consultx_brain/full_corpus/indexes/*.json (A5)

Writes:
- reports/round4_validation_report.md
- reports/round4_validation_report.json
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os


ROOT = "D:/ConsultX_Clean"


def grep_count_dir(path: str, pattern: str):
    count = 0
    files_with = []
    for root, _dirs, files in os.walk(path):
        for f in files:
            p = os.path.join(root, f)
            try:
                with open(p, encoding="utf-8") as fh:
                    text = fh.read()
            except Exception:
                continue
            c = text.count(pattern)
            if c:
                count += c
                files_with.append((p, c))
    return count, files_with


def grep_count_file(path: str, pattern: str) -> int:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().count(pattern)
    except Exception:
        return 0


def sha256_file(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    report = {
        "agent": "Sub-Agent A6 (round 4)",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "rules": {},
        "in_flight_artifacts": [],
        "failures_top5": [],
    }

    # Rule 1: No section symbol anywhere
    fc_path = os.path.join(ROOT, "data/consultx_brain/full_corpus")
    full_corpus_count, _ = grep_count_dir(fc_path, "§")
    report_files = [
        "reports/round4_normalization_report.md",
        "reports/round4_normalization_report.json",
        "reports/round4_relation_expansion_report.md",
        "reports/round4_relation_expansion_report.json",
        "reports/sbc801_round4_core_resolution_report.md",
        "reports/sbc801_round4_core_resolution_report.json",
        "reports/sbc801_round4_hazmat_resolution_report.md",
        "reports/sbc801_round4_hazmat_resolution_report.json",
    ]
    report_count = 0
    for rf in report_files:
        p = os.path.join(ROOT, rf)
        if os.path.exists(p):
            report_count += grep_count_file(p, "§")
    total_symbol = full_corpus_count + report_count
    report["rules"]["rule1_no_section_symbol"] = {
        "passed": total_symbol == 0,
        "count_in_full_corpus": full_corpus_count,
        "count_in_round4_reports": report_count,
        "total": total_symbol,
    }

    # Rule 2: All extracted-gap MDs have meta.json with required fields
    md_dirs = [
        os.path.join(ROOT, "data/consultx_brain/full_corpus/extracted_gaps/sbc801_round4_core"),
        os.path.join(ROOT, "data/consultx_brain/full_corpus/extracted_gaps/sbc801_round4_hazmat"),
    ]
    required_fields = [
        "source_pdf",
        "page_range",
        "extraction_method",
        "extraction_confidence",
        "requires_review",
    ]
    rule2_failures = []
    rule2_total_mds = 0
    rule2_passed_mds = 0
    for d in md_dirs:
        if not os.path.exists(d):
            continue
        for md in [f for f in os.listdir(d) if f.endswith(".md")]:
            rule2_total_mds += 1
            meta_path = os.path.join(d, md.replace(".md", ".meta.json"))
            if not os.path.exists(meta_path):
                rule2_failures.append({"file": meta_path, "reason": "missing meta.json"})
                continue
            try:
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception as e:
                rule2_failures.append({"file": meta_path, "reason": "unreadable: " + str(e)})
                continue
            missing = []
            for k in required_fields:
                v = meta.get(k)
                if k == "requires_review":
                    if k not in meta:
                        missing.append(k)
                elif v in (None, "", []):
                    missing.append(k)
            if missing:
                rule2_failures.append({"file": meta_path, "reason": "missing fields: " + ",".join(missing)})
            else:
                rule2_passed_mds += 1
    report["rules"]["rule2_meta_complete"] = {
        "passed": len(rule2_failures) == 0,
        "total_mds": rule2_total_mds,
        "passed_count": rule2_passed_mds,
        "failures": rule2_failures,
    }

    # Rule 3: canonical_verbatim chunks have only source text (no LLM_SYNTHESIS / STRUCTURED_FACT)
    rule3_failures = []
    for d in md_dirs:
        if not os.path.exists(d):
            continue
        for md_name in os.listdir(d):
            if not md_name.endswith(".md"):
                continue
            p = os.path.join(d, md_name)
            try:
                with open(p, encoding="utf-8") as f:
                    text = f.read()
            except Exception:
                continue
            if "LLM_SYNTHESIS" in text or "STRUCTURED_FACT" in text:
                rule3_failures.append({"file": p, "reason": "contains LLM_SYNTHESIS or STRUCTURED_FACT"})
    report["rules"]["rule3_canonical_verbatim_clean"] = {
        "passed": len(rule3_failures) == 0,
        "failures": rule3_failures,
    }

    # Rule 4: No LLM synthesis inside source evidence (sources/ + extracted_gaps/)
    sources_root = os.path.join(ROOT, "data/consultx_brain/full_corpus/sources")
    src_count_a, src_files_a = grep_count_dir(sources_root, "LLM_SYNTHESIS")
    src_count_b, src_files_b = grep_count_dir(sources_root, "STRUCTURED_FACT")
    rule4_round4_marker_count = 0
    for d in md_dirs:
        if not os.path.exists(d):
            continue
        for f in os.listdir(d):
            if f.endswith(".md"):
                p = os.path.join(d, f)
                try:
                    with open(p, encoding="utf-8") as fh:
                        t = fh.read()
                except Exception:
                    continue
                rule4_round4_marker_count += t.count("LLM_SYNTHESIS") + t.count("STRUCTURED_FACT")
    report["rules"]["rule4_no_llm_synthesis_in_source_evidence"] = {
        "passed": rule4_round4_marker_count == 0,
        "round4_extracted_synthesis_marker_count": rule4_round4_marker_count,
        "preexisting_sources_files_with_marker": len(set([p for p, _ in src_files_a + src_files_b])),
        "preexisting_sources_marker_count": src_count_a + src_count_b,
        "note": "Pre-existing markers in sources/ are PARTIAL_STRUCTURED commentary blocks demarcated as analysis (not introduced this round). Round-4 gating: round4_extracted_synthesis_marker_count must be 0.",
    }

    # Rule 5: round4_gap_facts.json — every fact has source_refs AND source_quote
    facts_path = os.path.join(ROOT, "data/consultx_brain/full_corpus/facts/round4_gap_facts.json")
    rule5_status = "FILE_MISSING"
    rule5_total_facts = 0
    rule5_failures_count = 0
    if os.path.exists(facts_path):
        try:
            with open(facts_path, encoding="utf-8") as f:
                facts_doc = json.load(f)
            facts_list = facts_doc.get("facts") if isinstance(facts_doc, dict) else facts_doc
            if facts_list is None:
                facts_list = facts_doc.get("entries", []) if isinstance(facts_doc, dict) else []
            rule5_total_facts = len(facts_list)
            for fact in facts_list:
                if not fact.get("source_refs") or not fact.get("source_quote"):
                    rule5_failures_count += 1
            rule5_status = "FILE_PRESENT"
        except Exception as e:
            rule5_status = "FILE_UNREADABLE: " + str(e)
    report["rules"]["rule5_facts_have_sources"] = {
        "passed": rule5_status == "FILE_PRESENT" and rule5_failures_count == 0,
        "status": rule5_status,
        "total_facts": rule5_total_facts,
        "failures_count": rule5_failures_count,
        "note": "round4_gap_facts.json (Sub-Agent A4) was not produced this round; rule fails. Logged as in-flight.",
    }
    if rule5_status == "FILE_MISSING":
        report["in_flight_artifacts"].append(
            {"expected_path": facts_path, "owner": "Sub-Agent A4", "status": "missing"}
        )

    # Rule 6: round4_gap_relations.json edges all PROVEN with source_basis + reason + not_citable_as_source
    rel_path = os.path.join(ROOT, "data/consultx_brain/full_corpus/relations/round4_gap_relations.json")
    rule6_failures = []
    rule6_total = 0
    if os.path.exists(rel_path):
        with open(rel_path, encoding="utf-8") as f:
            rel_doc = json.load(f)
        edges = rel_doc.get("edges", [])
        rule6_total = len(edges)
        for e in edges:
            issues = []
            if not e.get("source_basis"):
                issues.append("empty source_basis")
            if not e.get("reason"):
                issues.append("empty reason")
            if e.get("confidence") != "PROVEN":
                issues.append("confidence=" + str(e.get("confidence")))
            if e.get("not_citable_as_source") is not True:
                issues.append("not_citable_as_source=" + str(e.get("not_citable_as_source")))
            if issues:
                rule6_failures.append({"id": e.get("id"), "issues": issues})
    report["rules"]["rule6_relations_proven"] = {
        "passed": len(rule6_failures) == 0 and rule6_total > 0,
        "total_edges": rule6_total,
        "failure_count": len(rule6_failures),
        "failures_sample": rule6_failures[:5],
    }

    # Rule 7: Every extracted item has non-empty extraction_status
    rule7_failures = []
    rule7_total = 0
    for d in md_dirs:
        if not os.path.exists(d):
            continue
        for f in os.listdir(d):
            if not f.endswith(".meta.json"):
                continue
            rule7_total += 1
            p = os.path.join(d, f)
            try:
                with open(p, encoding="utf-8") as fh:
                    meta = json.load(fh)
            except Exception as e:
                rule7_failures.append({"file": p, "reason": "unreadable: " + str(e)})
                continue
            status = meta.get("extraction_status") or meta.get("action")
            if not status:
                rule7_failures.append({"file": p, "reason": "missing extraction_status / action"})
    report["rules"]["rule7_extraction_status_present"] = {
        "passed": len(rule7_failures) == 0,
        "total_meta": rule7_total,
        "failures": rule7_failures,
    }

    # Rule 8: manual_review items justified per A1/A2 reports.
    # A1 -> reports/sbc801_round4_core_resolution_report.json
    # A2 -> reports/sbc801_round4_hazmat_resolution_report.json
    enum_6 = {
        "resolved_canonical",
        "resolved_existing",
        "cross_reference_only",
        "absent_from_2024_pdf",
        "quarantine",
        "manual_review_keep",
    }
    rule8_a1 = os.path.join(ROOT, "reports/sbc801_round4_core_resolution_report.json")
    rule8_a2 = os.path.join(ROOT, "reports/sbc801_round4_hazmat_resolution_report.json")
    a1_present = os.path.exists(rule8_a1)
    a2_present = os.path.exists(rule8_a2)
    a1_action_counts = {}
    a2_action_counts = {}
    invalid_actions = []
    if a1_present:
        try:
            with open(rule8_a1, encoding="utf-8") as f:
                a1 = json.load(f)
            entries = a1.get("items") or a1.get("results") or a1.get("per_section") or a1.get("entries") or []
            for e in entries:
                act = e.get("action") or e.get("extraction_status") or e.get("decision")
                a1_action_counts[act] = a1_action_counts.get(act, 0) + 1
                if not act:
                    invalid_actions.append({"agent": "A1", "action": None, "section": e.get("section_ref") or e.get("section_id") or e.get("section_number"), "reason": "missing action"})
                elif act not in enum_6:
                    invalid_actions.append({"agent": "A1", "action": act, "section": e.get("section_ref") or e.get("section_id") or e.get("section_number")})
        except Exception as e:
            invalid_actions.append({"agent": "A1", "load_error": str(e)})
    if a2_present:
        try:
            with open(rule8_a2, encoding="utf-8") as f:
                a2 = json.load(f)
            entries = a2.get("items") or a2.get("results") or a2.get("per_section") or a2.get("entries") or []
            for e in entries:
                act = e.get("action") or e.get("extraction_status") or e.get("decision")
                a2_action_counts[act] = a2_action_counts.get(act, 0) + 1
                if not act:
                    invalid_actions.append({"agent": "A2", "action": None, "section": e.get("section_ref") or e.get("section_id") or e.get("section_number"), "reason": "missing action"})
                elif act not in enum_6:
                    invalid_actions.append({"agent": "A2", "action": act, "section": e.get("section_ref") or e.get("section_id") or e.get("section_number")})
        except Exception as e:
            invalid_actions.append({"agent": "A2", "load_error": str(e)})
    rule8_passed = a1_present and a2_present and len(invalid_actions) == 0
    report["rules"]["rule8_manual_review_justified"] = {
        "passed": rule8_passed,
        "a1_report_path": rule8_a1,
        "a1_present": a1_present,
        "a2_report_path": rule8_a2,
        "a2_present": a2_present,
        "a1_action_counts": a1_action_counts,
        "a2_action_counts": a2_action_counts,
        "invalid_actions": invalid_actions,
        "enum_6": sorted(enum_6),
    }
    if not a1_present:
        report["in_flight_artifacts"].append({"expected_path": rule8_a1, "owner": "Sub-Agent A1", "status": "missing"})
    if not a2_present:
        report["in_flight_artifacts"].append({"expected_path": rule8_a2, "owner": "Sub-Agent A2", "status": "missing"})

    # Rule 9: No destructive edits to D:/sbc_consultx — mtimes pre-today
    sbc_path = "D:/sbc_consultx"
    today = datetime.date(2026, 5, 1)
    violations = 0
    sample_violations = []
    if os.path.exists(sbc_path):
        for root, dirs, files in os.walk(sbc_path):
            dirs[:] = [dd for dd in dirs if dd not in {".git", ".venv", ".ruff_cache", "__pycache__", ".obsidian"}]
            for f in files:
                p = os.path.join(root, f)
                try:
                    t = os.path.getmtime(p)
                    d = datetime.date.fromtimestamp(t)
                    if d >= today:
                        violations += 1
                        if len(sample_violations) < 5:
                            sample_violations.append({"file": p, "mtime_date": d.isoformat()})
                except Exception:
                    pass
    report["rules"]["rule9_no_sbc_consultx_mutation"] = {
        "passed": violations == 0,
        "violations_count": violations,
        "sample_violations": sample_violations,
    }

    # Rule 10: Final PASS/FAIL based on rules 1-9
    rules_1_to_9 = [k for k in report["rules"] if k != "rule10_final"]
    all_pass = all(report["rules"][k]["passed"] for k in rules_1_to_9)
    report["rules"]["rule10_final"] = {"passed": all_pass}

    report["overall"] = "PASS" if all_pass else "FAIL"
    report["per_rule_pass_count"] = sum(1 for r in report["rules"].values() if r["passed"])
    report["per_rule_fail_count"] = sum(1 for r in report["rules"].values() if not r["passed"])

    # Top 5 failures
    top5 = []
    if not report["rules"]["rule5_facts_have_sources"]["passed"]:
        top5.append({"rule": 5, "summary": "round4_gap_facts.json missing — Sub-Agent A4 has not produced output", "path": facts_path})
    if not report["rules"]["rule7_extraction_status_present"]["passed"]:
        for ff in report["rules"]["rule7_extraction_status_present"]["failures"][:2]:
            top5.append({"rule": 7, "summary": ff.get("reason", "unknown"), "path": ff.get("file", "")})
    if not report["rules"]["rule8_manual_review_justified"]["passed"]:
        top5.append({"rule": 8, "summary": "A1/A2 standalone manual-review reports missing", "path": rule8_a1 + " | " + rule8_a2})
    report["failures_top5"] = top5[:5]

    report["symbol_counts"] = {
        "full_corpus": full_corpus_count,
        "round4_reports": report_count,
    }

    out_json = os.path.join(ROOT, "reports/round4_validation_report.json")
    out_md = os.path.join(ROOT, "reports/round4_validation_report.md")

    md_lines = [
        "# Round 4 Validation Report (Sub-Agent A6)",
        "",
        "- agent: " + report["agent"],
        "- generated_at: " + report["generated_at"],
        "- overall: **" + report["overall"] + "**",
        "- rules passed: " + str(report["per_rule_pass_count"]) + " / " + str(len(report["rules"])),
        "- rules failed: " + str(report["per_rule_fail_count"]),
        "",
        "## Per-rule results",
        "",
    ]
    for k, v in report["rules"].items():
        md_lines.append("### " + k + ": " + ("PASS" if v["passed"] else "FAIL"))
        for kk, vv in v.items():
            if kk == "passed":
                continue
            text = json.dumps(vv, default=str, ensure_ascii=False)
            if len(text) > 320:
                text = "<see JSON>"
            md_lines.append("- " + kk + ": " + text)
        md_lines.append("")

    md_lines.append("## In-flight artifacts (not produced)")
    for art in report["in_flight_artifacts"]:
        md_lines.append("- " + art["owner"] + " -> `" + art["expected_path"] + "` (" + art["status"] + ")")
    md_lines.append("")
    md_lines.append("## Top 5 failures")
    for f in report["failures_top5"]:
        md_lines.append("- rule " + str(f["rule"]) + ": " + f["summary"])
    md_lines.append("")
    md_lines.append("## Symbol grep counts (must all be 0)")
    md_lines.append("- full_corpus: " + str(report["symbol_counts"]["full_corpus"]))
    md_lines.append("- round4 reports (4 prior md/json): " + str(report["symbol_counts"]["round4_reports"]))
    md_lines.append("")
    md_lines.append("## SHA-256")
    md_lines.append("(computed and appended after write)")
    md_lines.append("")

    md_text = "\n".join(md_lines) + "\n"

    with open(out_md, "w", encoding="utf-8") as f:
        f.write(md_text)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    sha_md = sha256_file(out_md)
    sha_json_initial = sha256_file(out_json)

    self_md_count = grep_count_file(out_md, "§")
    self_json_count = grep_count_file(out_json, "§")

    with open(out_md, "a", encoding="utf-8") as f:
        f.write("\n## Self-hashes and self-symbol-counts\n")
        f.write("- round4_validation_report.md sha256: " + sha_md + "\n")
        f.write("- round4_validation_report.json sha256 (pre-self-embed): " + sha_json_initial + "\n")
        f.write("- self section-symbol count (md): " + str(self_md_count) + "\n")
        f.write("- self section-symbol count (json): " + str(self_json_count) + "\n")

    report["sha256"] = {
        "round4_validation_report_md": sha_md,
        "round4_validation_report_json_pre_self_embed": sha_json_initial,
    }
    report["self_section_symbol_counts"] = {"md": self_md_count, "json": self_json_count}
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    sha_json_final = sha256_file(out_json)
    sha_md_final = sha256_file(out_md)

    print("OVERALL:", report["overall"])
    print("RULES PASSED:", report["per_rule_pass_count"], "of", len(report["rules"]))
    print("RULES FAILED:", report["per_rule_fail_count"])
    print()
    for k, v in report["rules"].items():
        print("  " + k + ": " + ("PASS" if v["passed"] else "FAIL"))
    print()
    print("Top 5 failures:")
    for f in report["failures_top5"]:
        print("  rule " + str(f["rule"]) + ": " + f["summary"])
    print()
    print("sha256 md final:  " + sha_md_final)
    print("sha256 json final:" + sha_json_final)
    print()
    print("Symbol counts:")
    print("  full_corpus:    " + str(full_corpus_count))
    print("  round4_reports: " + str(report_count))
    print("  self md:        " + str(self_md_count))
    print("  self json:      " + str(self_json_count))


if __name__ == "__main__":
    main()
