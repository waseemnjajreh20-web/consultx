import pdfplumber
from PIL import Image
import os
import json
import math

pdf_path = r'd:\ConsultX_Clean\SBC_201_CC_2024\SBC 201 - The Saudi General Building Code-251-500.pdf'
out_dir = r'd:\ConsultX_Clean\table_images'
os.makedirs(out_dir, exist_ok=True)

# target pages (0-indexed)
targets = {
    '504.3': [196, 197],
    '504.4': [198, 199],
    '506.2': [203, 204],
}

results = {}

try:
    import numpy as np
    has_numpy = True
except Exception:
    has_numpy = False

with pdfplumber.open(pdf_path) as pdf:
    for tid, page_indices in targets.items():
        table_cells = []
        for p in page_indices:
            if p < 0 or p >= len(pdf.pages):
                continue
            page = pdf.pages[p]
            page_num_display = p + 1
            printed_page = 251 + p

            # render page image
            page_image = page.to_image(resolution=200)
            img_path = os.path.join(out_dir, f'{tid}_page_{page_num_display}.png')
            page_image.save(img_path)

            img = Image.open(img_path).convert('L')
            w, h = img.size
            if has_numpy:
                arr = np.array(img)
                # binary: dark pixels
                bin_arr = (arr < 220).astype('uint8')
                vert_proj = bin_arr.sum(axis=0)
                hor_proj = bin_arr.sum(axis=1)
            else:
                pix = img.load()
                vert_proj = [0]*w
                hor_proj = [0]*h
                for y in range(h):
                    row_count = 0
                    for x in range(w):
                        if pix[x,y] < 220:
                            vert_proj[x] += 1
                            hor_proj[y] += 1

            # detect candidate vertical lines (peaks in vert_proj)
            vp_max = max(vert_proj) if len(vert_proj)>0 else 0
            hp_max = max(hor_proj) if len(hor_proj)>0 else 0
            v_thresh = max(10, int(vp_max * 0.25))
            h_thresh = max(10, int(hp_max * 0.15))

            def cluster_indices(indices, gap=3):
                if not indices:
                    return []
                clusters = []
                current = [indices[0]]
                for idx in indices[1:]:
                    if idx - current[-1] <= gap:
                        current.append(idx)
                    else:
                        clusters.append(int(round(sum(current)/len(current))))
                        current = [idx]
                clusters.append(int(round(sum(current)/len(current))))
                return clusters

            v_cands = [i for i,v in enumerate(vert_proj) if v >= v_thresh]
            h_cands = [i for i,v in enumerate(hor_proj) if v >= h_thresh]
            v_lines = cluster_indices(v_cands, gap=4)
            h_lines = cluster_indices(h_cands, gap=4)

            # Ensure page edges included
            if not v_lines:
                v_lines = [0, w]
            else:
                if v_lines[0] > 5:
                    v_lines = [0] + v_lines
                if v_lines[-1] < w-5:
                    v_lines = v_lines + [w]
            if not h_lines:
                h_lines = [0, h]
            else:
                if h_lines[0] > 5:
                    h_lines = [0] + h_lines
                if h_lines[-1] < h-5:
                    h_lines = h_lines + [h]

            # Build cell boxes from intersections
            cells = []
            for r in range(len(h_lines)-1):
                top = h_lines[r]
                bottom = h_lines[r+1]
                # skip very small rows
                if bottom - top < 10:
                    continue
                row_cells = []
                for c in range(len(v_lines)-1):
                    left = v_lines[c]
                    right = v_lines[c+1]
                    if right - left < 6:
                        continue
                    # map image px to PDF coords using scale
                    scale_x = w / page.width
                    scale_y = h / page.height
                    # assume uniform scaling
                    x0_pdf = left / scale_x
                    x1_pdf = right / scale_x
                    y0_pdf = top / scale_y
                    y1_pdf = bottom / scale_y
                    # crop in PDF coordinates (pdfplumber uses top-left origin)
                    try:
                        cropped = page.crop((x0_pdf, y0_pdf, x1_pdf, y1_pdf))
                        cell_text = (cropped.extract_text() or '').strip()
                    except Exception as e:
                        cell_text = ''
                    row_cells.append({'img_box': [left, top, right, bottom], 'pdf_box': [x0_pdf, y0_pdf, x1_pdf, y1_pdf], 'text': cell_text})
                if row_cells:
                    cells.append(row_cells)

            table_cells.append({'file_page': page_num_display, 'printed_page': printed_page, 'img_path': img_path, 'cells': cells, 'v_lines': v_lines, 'h_lines': h_lines})

        results[tid] = table_cells

out_path = os.path.join(r'd:\ConsultX_Clean', 'image_extracted_tables.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print('WROTE', out_path)
