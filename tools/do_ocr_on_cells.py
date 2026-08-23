import json
import os
from PIL import Image
import pytesseract

in_path = r'd:\ConsultX_Clean\image_extracted_tables.json'
out_path = r'd:\ConsultX_Clean\ocr_cell_results.json'

with open(in_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

results = {}

for tid, pages in data.items():
    results[tid] = []
    for page in pages:
        # Ensure pytesseract knows the tesseract binary path (not necessarily in PATH)
        pytesseract.pytesseract.tesseract_cmd = r'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
        img_path = page['img_path']
        if not os.path.exists(img_path):
            print('Missing image:', img_path)
            continue
        img = Image.open(img_path).convert('RGB')
        page_result = {'file_page': page['file_page'], 'printed_page': page['printed_page'], 'cells': []}
        unreadable_count = 0
        total_cells = 0
        for r_idx, row in enumerate(page['cells']):
            ocr_row = []
            for c_idx, cell in enumerate(row):
                total_cells += 1
                left, top, right, bottom = cell['img_box']
                # crop and pad small margin
                pad = 2
                l = max(0, left - pad)
                t = max(0, top - pad)
                r = min(img.width, right + pad)
                b = min(img.height, bottom + pad)
                crop = img.crop((l, t, r, b))
                # primary OCR
                try:
                    text = pytesseract.image_to_string(crop, lang='eng', config='--psm 6')
                    text = text.strip()
                    # if empty, try psm 7
                    if not text:
                        text = pytesseract.image_to_string(crop, lang='eng', config='--psm 7')
                        text = text.strip()
                    # try numeric-friendly configuration if still empty
                    if not text:
                        try:
                            text = pytesseract.image_to_string(crop, lang='eng', config="--psm 7 -c tessedit_char_whitelist=0123456789.,-ULunlimited%")
                            text = text.strip()
                        except Exception:
                            text = ''
                    if not text:
                        unreadable = True
                        unreadable_count += 1
                    else:
                        unreadable = False
                except Exception as e:
                    # on OCR error mark cell unreadable and continue
                    text = ''
                    unreadable = True
                    unreadable_count += 1
                ocr_row.append({'row': r_idx, 'col': c_idx, 'text': text, 'unreadable': unreadable, 'img_box': cell['img_box']})
            page_result['cells'].append(ocr_row)
        page_result['summary'] = {'total_cells': total_cells, 'unreadable': unreadable_count}
        results[tid].append(page_result)

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

# print summary
for tid, pages in results.items():
    tot = 0
    unread = 0
    for p in pages:
        tot += p['summary']['total_cells']
        unread += p['summary']['unreadable']
    print(f'Table {tid}: total cells {tot}, unreadable {unread}')

print('WROTE', out_path)
