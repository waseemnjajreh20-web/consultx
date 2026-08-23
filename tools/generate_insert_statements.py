import json
from pathlib import Path

IN = Path(r'd:/ConsultX_Clean/normalized_tables_payloads.json')
OUT = Path(r'd:/ConsultX_Clean/document_tables_inserts.sql')

with open(IN, 'r', encoding='utf-8') as f:
    payloads = json.load(f)

stmts = []
for tid, p in payloads.items():
    table_id = p['table_id']
    source_id = p['source_id']
    section_id = p['section_id']
    table_number = p['table_number']
    caption_en = p.get('caption_en') or ''
    caption_ar = p.get('caption_ar')
    page_start = p.get('page_start')
    page_end = p.get('page_end')
    normative = 'true' if p.get('normative', True) else 'false'
    axis_schema = json.dumps(p.get('axis_schema', {}), ensure_ascii=False)
    rows = json.dumps(p.get('rows', []), ensure_ascii=False)
    footnotes = json.dumps(p.get('footnotes', []), ensure_ascii=False)

    # escape single quotes for SQL
    def esc(s):
        return s.replace("'", "''")

    caption_en_sql = esc(caption_en)
    caption_ar_sql = 'NULL' if caption_ar is None else f"'{esc(caption_ar)}'"
    stmt = (
        "INSERT INTO public.document_tables "
        "(table_id, source_id, section_id, table_number, caption_ar, caption_en, page_start, page_end, normative, axis_schema, rows, footnotes) VALUES (\n"
        f"  '{esc(table_id)}', '{esc(source_id)}', '{esc(section_id)}', '{esc(table_number)}', {caption_ar_sql}, '{caption_en_sql}', {page_start}, {page_end}, {normative},\n"
        f"  '{esc(axis_schema)}'::jsonb, '{esc(rows)}'::jsonb, '{esc(footnotes)}'::jsonb\n);")
    stmts.append(stmt)

OUT.write_text('\n\n'.join(stmts), encoding='utf-8')
print('WROTE', OUT)
