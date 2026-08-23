import pdfplumber
import json
import re

pdf_path = r'd:\ConsultX_Clean\SBC_201_CC_2024\SBC 201 - The Saudi General Building Code-251-500.pdf'
# page indices (0-based) for confirmed file pages
targets = {
    '504.3': [196, 197],  # file pages 197-198
    '504.4': [198, 199],  # file pages 199-200
    '506.2': [203, 204],  # file pages 204-205
}

output = {}


def clean_cell(c):
    if c is None:
        return None
    s = str(c).strip()
    if s == '' or s.lower() in ['nan']:
        return None
    return s


def extract_best_table_on_page(page):
    # Try line-based extraction first
    settings = {"vertical_strategy": "lines", "horizontal_strategy": "lines"}
    tables = page.extract_tables(table_settings=settings) or []

    # Prefer tables with multiple columns
    best = None
    best_score = -1
    for t in tables:
        if not t:
            continue
        rows = len(t)
        cols = len(t[0]) if t and t[0] else 0
        score = rows * (cols if cols > 0 else 1)
        if cols >= 2 and score > best_score:
            best = t
            best_score = score

    # If no multi-column table found, try page.find_tables() (explicit grid detection)
    if best is None:
        try:
            fts = page.find_tables()
        except Exception:
            fts = []

        for ft in fts:
            try:
                bbox = ft.bbox
                cropped = page.crop(bbox)
                table = cropped.extract_table(table_settings=settings) or cropped.extract_table()
                if table and len(table[0]) >= 2:
                    rows = len(table)
                    cols = len(table[0])
                    score = rows * cols
                    if score > best_score:
                        best = table
                        best_score = score
            except Exception:
                continue

    # Final fallback: accept any table found
    if best is None and tables:
        best = tables[0]

    return best


with pdfplumber.open(pdf_path) as pdf:
    for tid, page_indices in targets.items():
        pages_found = []
        caption = None
        footnotes = []
        all_tables = []
        unreadable = []

        for p in page_indices:
            if p < 0 or p >= len(pdf.pages):
                continue
            page = pdf.pages[p]
            text = page.extract_text() or ''

            # find caption line (exact or near-exact)
            for line in text.split('\n')[:40]:
                if re.search(rf'\bTable\s+{re.escape(tid)}\b', line, flags=re.IGNORECASE):
                    caption = line.strip()
                    break

            # attempt to find structured table
            best = extract_best_table_on_page(page)
            if best:
                # clean cells
                cleaned = [[clean_cell(c) for c in row] for row in best]
                all_tables.append({'page': p+1, 'actual_page': 251 + p, 'table': cleaned})

            # collect footnote-like lines on page
            for line in text.split('\n'):
                l = line.strip()
                if not l:
                    continue
                if re.match(r'^(Note\b|Notes\b|Note [a-zA-Z0-9]:|\d+\))', l, flags=re.IGNORECASE) or re.search(r'\bNote\b', l, flags=re.IGNORECASE):
                    if l not in footnotes:
                        footnotes.append(l)

        # Combine multi-page tables if found
        combined_rows = []
        headers = None
        if all_tables:
            # choose header from first table with >=2 cols
            for tinfo in all_tables:
                t = tinfo['table']
                if t and len(t[0]) >= 2:
                    headers = t[0]
                    # extend body rows
                    combined_rows.extend(t[1:])
                    break
            # if header not found, use first table's first row as header
            if headers is None and all_tables:
                headers = all_tables[0]['table'][0]
                combined_rows.extend(all_tables[0]['table'][1:])
                for tinfo in all_tables[1:]:
                    combined_rows.extend(tinfo['table'][1:] if len(tinfo['table'])>1 else [])
            else:
                # append remaining tables' body rows (skip header if matches)
                for tinfo in all_tables[1:]:
                    t = tinfo['table']
                    if not t:
                        continue
                    # if first row equals header, skip it
                    if t[0] == headers:
                        combined_rows.extend(t[1:])
                    else:
                        combined_rows.extend(t)

            # detect unreadable cells
            for pi, tinfo in enumerate(all_tables):
                t = tinfo['table']
                for ri, row in enumerate(t):
                    for ci, cell in enumerate(row):
                        if cell is None:
                            unreadable.append({'file_page': tinfo['page'], 'actual_page': tinfo['actual_page'], 'row_in_table': ri, 'col_in_table': ci})

        output[tid] = {
            'caption': caption,
            'file_page_range': f"{page_indices[0]+1}-{page_indices[-1]+1}",
            'printed_page_range': f"{251 + page_indices[0]}-{251 + page_indices[-1]}",
            'headers': headers,
            'rows': combined_rows,
            'footnotes': footnotes,
            'unreadable_cells': unreadable,
            'raw_tables': all_tables
        }

# Write results
out_path = r'd:\ConsultX_Clean\extracted_tables_confirmed.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

# Print concise summary
for tid, info in output.items():
    print(f"TABLE {tid}: caption={info['caption']}")
    print(f"  file pages: {info['file_page_range']} (printed {info['printed_page_range']})")
    hdrs = info['headers']
    if hdrs:
        print(f"  headers: {hdrs}")
    else:
        print("  headers: NOT FOUND")
    print(f"  rows extracted: {len(info['rows'])}")
    print(f"  footnotes found: {len(info['footnotes'])}")
    print(f"  unreadable cells: {len(info['unreadable_cells'])}\n")

print('WROTE:', out_path)
