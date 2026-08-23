import json
import re
from statistics import mode
from pathlib import Path

IN_OCR = Path(r'd:/ConsultX_Clean/ocr_cell_results.json')
IN_IMAGE = Path(r'd:/ConsultX_Clean/image_extracted_tables.json')
OUT_PAYLOADS = Path(r'd:/ConsultX_Clean/normalized_tables_payloads.json')
OUT_DEBUG = Path(r'd:/ConsultX_Clean/normalized_tables_debug.json')

TARGETS = ['504.3', '504.4', '506.2']

num_re = re.compile(r"[-+]?\d{1,3}(?:[\d,]*)(?:\.\d+)?")

CHAR_FIX = str.maketrans({
    'O': '0', 'o': '0', 'l': '1', 'I': '1', 'Z': '2', 'S': '5'
})


def is_numeric_like(s: str):
    if not s: return False
    s2 = s.strip().lower()
    if 'unlimit' in s2 or s2 in ('ul', 'u.l.', 'u.l', 'unl'):  # some OCR artifacts
        return True
    return bool(num_re.search(s))


def try_parse_numeric(s: str):
    if not s: return None
    s0 = s.strip()
    if not s0:
        return None
    s_low = s0.lower()
    if 'unlimit' in s_low or s_low in ('unlimited', 'ul', 'u.l.', 'u.l'):
        return 'UNLIMITED'
    # quick clean
    s_clean = s0.replace(',', '')
    # fallback fixes for OCR confusions
    if not num_re.search(s_clean):
        s_fixed = s_clean.translate(CHAR_FIX)
        if num_re.search(s_fixed):
            s_clean = s_fixed
    m = re.search(r"[-+]?[0-9]*\.?[0-9]+", s_clean)
    if m:
        try:
            v = float(m.group(0))
            # Conservative acceptance: ensure the original token is mostly numeric
            non_space = re.sub(r"\s+", "", s0)
            if len(non_space) == 0:
                return None
            numeric_chars = sum(1 for ch in non_space if ch.isdigit() or ch in ".-+,")
            if numeric_chars / len(non_space) < 0.6:
                return None
            # If integer-valued, return as int
            if v.is_integer():
                return int(v)
            return v
        except Exception:
            return None
    return None


def merge_fragments_in_row(row_texts, target_cols):
    # If row has more fragments than target_cols, merge left-to-right heuristically
    while len(row_texts) > target_cols:
        merged = False
        for i in range(len(row_texts)-1):
            a = (row_texts[i] or '').strip()
            b = (row_texts[i+1] or '').strip()
            if not a and b:
                # drop empty left
                row_texts.pop(i)
                merged = True
                break
            if a and (not b):
                # absorb empty right
                row_texts.pop(i+1)
                merged = True
                break
            # if both short fragments, merge
            if len(a) < 6 and len(b) < 6:
                row_texts[i] = (a + ' ' + b).strip()
                row_texts.pop(i+1)
                merged = True
                break
            # if left ends with hyphen, join without space
            if a.endswith('-'):
                row_texts[i] = (a[:-1] + b).strip()
                row_texts.pop(i+1)
                merged = True
                break
        if not merged:
            # last resort: merge the last two
            i = len(row_texts) - 2
            row_texts[i] = (row_texts[i] + ' ' + row_texts[i+1]).strip()
            row_texts.pop()
    return row_texts


with open(IN_OCR, 'r', encoding='utf-8') as f:
    ocr = json.load(f)
with open(IN_IMAGE, 'r', encoding='utf-8') as f:
    img = json.load(f)

payloads = {}
debug = {}

for tid in TARGETS:
    pages_img = img.get(tid, [])
    pages_ocr = ocr.get(tid, [])
    if not pages_img or not pages_ocr:
        print('Missing data for', tid)
        continue

    # determine expected column count per page using image extraction (mode of row lengths
    # but only consider the top N rows where header usually sits to avoid body over-segmentation)
    page_col_counts = []
    HEAD_ROWS_TO_CHECK = 15
    for p in pages_img:
        all_rows = [r for r in p.get('cells', []) if isinstance(r, list)]
        row_lens = [len(r) for r in all_rows[:HEAD_ROWS_TO_CHECK]]
        # filter out extreme fragmentation rows (likely OCR over-segmentation)
        row_lens = [l for l in row_lens if l <= 12]
        if not row_lens and all_rows:
            row_lens = [len(r) for r in all_rows]
        if row_lens:
            try:
                mc = mode(row_lens)
            except Exception:
                mc = max(row_lens)
            page_col_counts.append(mc)
    if page_col_counts:
        col_count = max(page_col_counts)
    else:
        col_count = 3
    # Also consider header non-empty cell counts (prefer actual header non-empty columns)
    header_nonempty_counts = []
    for p in pages_img:
        for r in p.get('cells', [])[:HEAD_ROWS_TO_CHECK]:
            non_empty = sum(1 for c in r if (isinstance(c, dict) and (c.get('text') or '').strip()))
            header_nonempty_counts.append(non_empty)
    if header_nonempty_counts:
        # Prefer header-derived non-empty column count when available
        col_count = max(header_nonempty_counts)

    # flatten pages into rows (preserve page boundaries)
    flat_rows = []
    page_indices = []
    for p_img, p_ocr in zip(pages_img, pages_ocr):
        fp = p_img.get('file_page')
        for r_idx, (img_row, ocr_row) in enumerate(zip(p_img.get('cells', []), p_ocr.get('cells', []))):
            # extract texts
            texts = [c.get('text', '').strip() if isinstance(c, dict) else '' for c in ocr_row]
            unreadables = [c.get('unreadable', False) if isinstance(c, dict) else True for c in ocr_row]
            img_boxes = [c.get('img_box') if isinstance(c, dict) else None for c in ocr_row]
            # normalize number of fragments to col_count
            texts = merge_fragments_in_row(texts, col_count)
            unreadables = (unreadables + [False]*len(texts))[:len(texts)]
            img_boxes = (img_boxes + [None]*len(texts))[:len(texts)]
            # pad to col_count
            while len(texts) < col_count:
                texts.append('')
                unreadables.append(True)
                img_boxes.append(None)
            flat_rows.append({'page': fp, 'raw_texts': texts, 'unreadables': unreadables, 'img_boxes': img_boxes})
            page_indices.append(fp)

    # merge continuation lines: if a row has data cols empty but first col non-empty and next row has only first col non-empty, append
    i = 0
    logical_rows = []
    while i < len(flat_rows):
        base = flat_rows[i]
        texts = base['raw_texts'][:]
        unread = base['unreadables'][:]
        j = i + 1
        while j < len(flat_rows):
            next_row = flat_rows[j]
            # data columns considered 1..col_count-1
            data_empty = True
            for c in range(1, col_count):
                nt = (next_row['raw_texts'][c] or '').strip()
                if nt:
                    data_empty = False
                    break
            # if next_row appears as continuation (only first col present), merge into base
            if data_empty and (next_row['raw_texts'][0] or '').strip():
                texts[0] = (texts[0] + ' ' + next_row['raw_texts'][0]).strip()
                # merge unread flags
                unread[0] = unread[0] and next_row['unreadables'][0]
                j += 1
            else:
                break
        # advance i
        i = j
        logical_rows.append({'page': base['page'], 'texts': texts, 'unreadables': unread})

    # identify header region (rows before first with any numeric-like in data columns)
    header_rows = []
    data_rows = []
    found_data = False
    for lr in logical_rows:
        has_data = False
        for c in range(1, col_count):
            if is_numeric_like(lr['texts'][c]):
                has_data = True
                break
        if not found_data and not has_data:
            header_rows.append(lr)
        else:
            found_data = True
            data_rows.append(lr)

    # build column header labels by concatenating header row cells per column
    headers = []
    for c in range(col_count):
        parts = [h['texts'][c] for h in header_rows if h['texts'][c]]
        headers.append(' '.join(parts).strip())

    # row stub label from headers[0] if present
    axis_schema = {'columns': [], 'row_stub_label_en': headers[0] or '', 'row_stub_label_ar': ''}
    for c in range(col_count):
        axis_schema['columns'].append({'index': c, 'label_en': headers[c] or '', 'label_ar': ''})

    # Trim trailing empty columns (no header and no data)
    def column_has_data(cidx):
        if headers[cidx]:
            return True
        for dr in data_rows:
            if (dr['texts'][cidx] or '').strip():
                return True
        return False

    # Reduce col_count by trimming trailing empty columns
    while col_count > 1 and not column_has_data(col_count-1):
        col_count -= 1
        headers.pop()
        axis_schema['columns'].pop()

    # find footnotes by scanning trailing rows in data_rows for patterns like 'a. text' or 'Note'
    footnotes = []
    # footnote candidates: any data_rows after last numeric row where first column starts with letter+punct
    last_numeric_idx = None
    for idx, dr in enumerate(data_rows):
        any_num = any(is_numeric_like(dr['texts'][c]) for c in range(1, col_count))
        if any_num:
            last_numeric_idx = idx
    if last_numeric_idx is None:
        footer_candidates = []
    else:
        footer_candidates = data_rows[last_numeric_idx+1:]
    for fr in footer_candidates:
        t0 = fr['texts'][0].strip()
        m = re.match(r"^([a-zA-Z0-9\*])\s*[\.):-]\s*(.+)$", t0)
        if m:
            marker = m.group(1)
            text = m.group(2) or ' '.join(fr['texts'][1:]).strip()
            footnotes.append({'marker': marker, 'text_en': text})

    # build rows payload: for each data_row up to last_numeric_idx (exclude footer candidates)
    rows_payload = []
    for ridx, dr in enumerate(data_rows[: (last_numeric_idx+1) if last_numeric_idx is not None else len(data_rows)]):
        stub = dr['texts'][0].strip()
        row_cells = []
        for c in range(1, col_count):
            raw = dr['texts'][c].strip()
            unread = dr['unreadables'][c]
            parsed = try_parse_numeric(raw)
            # if expected numeric (column shows many numeric-like values) but parsed None -> mark unreadable
            # determine column numeric tendency
            col_vals = [try_parse_numeric(r['texts'][c]) for r in data_rows]
            numeric_count = sum(1 for v in col_vals if v is not None)
            # if column mostly numeric and this cell failed parse, mark unreadable
            if numeric_count >= max(2, int(0.4*len(col_vals))) and parsed is None and raw:
                unread = True
            if raw == '':
                parsed_val = None
            else:
                parsed_val = parsed if parsed is not None else raw
            cell_obj = {'col_index': c, 'value': parsed_val, 'raw_text': raw if raw else None, 'unreadable': bool(unread)}
            # find footnote markers at end of raw
            fm = re.findall(r"\*|[a-zA-Z](?=\b$)|\d+(?=\b$)|\([a-zA-Z0-9]+\)$", raw)
            if fm:
                cell_obj['footnotes'] = fm
            row_cells.append(cell_obj)
        rows_payload.append({'row_id': ridx, 'stub_en': stub if stub else None, 'stub_ar': None, 'cells': row_cells})

    # gather page start/end
    pages = [p.get('file_page') for p in pages_img]
    page_start = min(pages)
    page_end = max(pages)

    # caption: try to get from top header region entire row concatenated
    caption_en = ' '.join([h['texts'][0] for h in header_rows[:3] if h['texts'][0]]).strip()
    payloads[tid] = {
        'table_id': f'SBC201:Table{tid}',
        'source_id': 'SBC201',
        'section_id': f'SBC201:504',
        'table_number': tid,
        'caption_en': caption_en,
        'caption_ar': None,
        'page_start': page_start,
        'page_end': page_end,
        'normative': True,
        'axis_schema': axis_schema,
        'rows': rows_payload,
        'footnotes': footnotes,
    }
    debug[tid] = {
        'col_count': col_count,
        'header_rows_count': len(header_rows),
        'header_rows': header_rows[:5],
        'sample_rows_raw': [r['texts'] for r in logical_rows[:10]],
        'data_rows_count': len(data_rows),
        'rows_payload_count': len(rows_payload),
        'footnotes': footnotes
    }

with open(OUT_PAYLOADS, 'w', encoding='utf-8') as f:
    json.dump(payloads, f, ensure_ascii=False, indent=2)
with open(OUT_DEBUG, 'w', encoding='utf-8') as f:
    json.dump(debug, f, ensure_ascii=False, indent=2)

print('WROTE', OUT_PAYLOADS, OUT_DEBUG)
