import pdfplumber
import json
import re
import os

pdf_path = r'd:\ConsultX_Clean\SBC_201_CC_2024\SBC 201 - The Saudi General Building Code-251-500.pdf'
targets = {
    '504.3': [196, 197],
    '504.4': [198, 199],
    '506.2': [203, 204],
}

output = {}

with pdfplumber.open(pdf_path) as pdf:
    for tid, page_indices in targets.items():
        candidates = []
        for p in page_indices:
            if p < 0 or p >= len(pdf.pages):
                continue
            page = pdf.pages[p]
            # find table bboxes
            try:
                fts = page.find_tables()
            except Exception:
                fts = []
            if not fts:
                # fallback to whole page bbox
                fts = []
            for ft in fts:
                bbox = ft.bbox
                cropped = page.crop(bbox)
                chunk_text = (cropped.extract_text() or '').strip()
                candidates.append({'page_index': p, 'actual_page': 251 + p, 'bbox': bbox, 'text': chunk_text, 'ft': ft})

            # if no find_tables results, include whole page as candidate
            if not fts:
                full_bbox = page.bbox
                cropped = page.crop(full_bbox)
                chunk_text = (cropped.extract_text() or '').strip()
                candidates.append({'page_index': p, 'actual_page': 251 + p, 'bbox': full_bbox, 'text': chunk_text, 'ft': None})

        # choose candidates that mention the table number or header keywords
        selected = []
        for c in candidates:
            if f'Table {tid}' in c['text'] or 'Height' in c['text'] or 'Stories' in c['text'] or '506.2' in c['text'] or 'Allowable' in c['text']:
                selected.append(c)
        if not selected:
            selected = candidates

        # reconstruct table per selected bbox
        recon_bboxes = []
        recon_rows_all = []
        headers = None
        footnotes = []

        for c in selected:
            p = c['page_index']
            page = pdf.pages[p]
            bbox = c['bbox']
            cropped = page.crop(bbox)
            # If a Table object exists, attempt its extractor first
            words = []
            if c.get('ft') is not None:
                try:
                    # try using the Table.extract API
                    table_obj = c['ft'].extract()
                    # table_obj may be a 2D list
                    if table_obj and isinstance(table_obj, list) and any(isinstance(r, list) for r in table_obj):
                        # convert table_obj rows into words-like structure
                        # flatten cells into words by positions not available, so fallback to using cropped.extract_table
                        pass
                except Exception:
                    pass

            # Fallback to word extraction within bbox
            words = cropped.extract_words(x_tolerance=3, y_tolerance=3) or []
            if not words:
                continue
            # group words into lines by rounded top
            lines = []
            # collect tops
            tops = []
            for w in words:
                tops.append(w['top'])
            # cluster tops
            tops_sorted = sorted(set([int(round(t)) for t in tops]))
            line_groups = {}
            for w in words:
                top = int(round(w['top']))
                # find existing key within tol 3
                key = None
                for k in line_groups.keys():
                    if abs(k - top) <= 3:
                        key = k
                        break
                if key is None:
                    key = top
                    line_groups[key] = []
                line_groups[key].append(w)
            sorted_lines = sorted(line_groups.items(), key=lambda kv: kv[0])
            # collect x0 values
            x0s = []
            for top, wlist in sorted_lines:
                for w in wlist:
                    x0s.append(w['x0'])
            if not x0s:
                continue
            x0s_sorted = sorted(set([int(round(x)) for x in x0s]))
            # cluster x0s into columns
            clusters = []
            tol = 22
            for x in x0s_sorted:
                if not clusters:
                    clusters.append([x])
                else:
                    mean_last = sum(clusters[-1]) / len(clusters[-1])
                    if abs(x - mean_last) <= tol:
                        clusters[-1].append(x)
                    else:
                        clusters.append([x])
            col_positions = [sum(c) / len(c) for c in clusters]
            # build rows
            rows = []
            for top, wlist in sorted_lines:
                # sort words by x0
                wlist_sorted = sorted(wlist, key=lambda x: x['x0'])
                row_cells = [''] * len(col_positions)
                for w in wlist_sorted:
                    # find nearest column
                    distances = [abs(w['x0'] - cp) for cp in col_positions]
                    ci = distances.index(min(distances))
                    if row_cells[ci]:
                        row_cells[ci] += ' ' + w['text']
                    else:
                        row_cells[ci] = w['text']
                # normalize empty strings to None
                row_cells = [rc.strip() if rc and rc.strip()!='' else None for rc in row_cells]
                if any(cell for cell in row_cells):
                    rows.append(row_cells)
            # try to detect header row
            header_keywords = ['Type', 'Construction', 'Height', 'Metre', 'Meter', 'Stories', 'Sprinkler', 'Allowable', 'Area', 'Occupancy', 'Group']
            hdr = None
            if rows:
                first = rows[0]
                match_count = sum(1 for cell in first if cell and any(hk.lower() in cell.lower() for hk in header_keywords))
                if match_count >= 1:
                    hdr = first
                    body = rows[1:]
                else:
                    if len(rows) > 1:
                        combined = [((rows[0][i] or '') + ' ' + (rows[1][i] or '')).strip() for i in range(len(rows[0]))]
                        match_count2 = sum(1 for cell in combined if cell and any(hk.lower() in cell.lower() for hk in header_keywords))
                        if match_count2 >= 1:
                            hdr = combined
                            body = rows[2:]
                        else:
                            hdr = None
                            body = rows
                    else:
                        hdr = None
                        body = rows
            else:
                body = []
            if hdr and headers is None:
                headers = hdr
            recon_bboxes.append({'page_index': p+1, 'actual_page': 251+p, 'bbox': bbox, 'rows': body})
            recon_rows_all.extend(body)
            # collect footnote-looking lines from page text after bbox bottom
            page_text_lines = (page.extract_text() or '').split('\n')
            # find lines that start with Note or digits with parenthesis
            for line in page_text_lines:
                ln = line.strip()
                if ln.lower().startswith('note') or ln.startswith('a)') or ln.startswith('b)') or re.match(r'^\d+\)', ln) or re.match(r'^[a-z]\)', ln):
                    footnotes.append(ln)

        # finalize
        output[tid] = {
            'caption_detected': None,
            'file_page_range': f"{page_indices[0]+1}-{page_indices[-1]+1}",
            'printed_page_range': f"{251 + page_indices[0]}-{251 + page_indices[-1]}",
            'headers': headers,
            'rows': recon_rows_all,
            'bboxes': recon_bboxes,
            'footnotes': footnotes
        }

out_path = os.path.join(r'd:\ConsultX_Clean', 'reconstructed_tables.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print('WROTE', out_path)

# summary
for tid, info in output.items():
    print('\nTABLE', tid)
    print(' pages:', info['file_page_range'], '(printed', info['printed_page_range'] + ')')
    print(' headers:', info['headers'])
    print(' rows extracted:', len(info['rows']))
    print(' footnotes:', len(info['footnotes']))
