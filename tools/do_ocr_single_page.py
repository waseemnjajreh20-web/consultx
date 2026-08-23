import json
import os
from PIL import Image
import pytesseract

in_path = r'd:\ConsultX_Clean\image_extracted_tables.json'
out_path = r'd:\ConsultX_Clean\ocr_single_page.json'

with open(in_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# process only first page of table 504.3
tid = '504.3'
pages = data.get(tid, [])
if not pages:
    print('No pages found for', tid)
    raise SystemExit(1)
page = pages[0]
img_path = page['img_path']
print('Processing', img_path)
img = Image.open(img_path).convert('RGB')
# set tesseract cmd
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
rows_out = []
for r_idx, row in enumerate(page['cells']):
    ocr_row = []
    for c_idx, cell in enumerate(row):
        left, top, right, bottom = cell['img_box']
        pad = 2
        l = max(0, left - pad)
        t = max(0, top - pad)
        r = min(img.width, right + pad)
        b = min(img.height, bottom + pad)
        crop = img.crop((l, t, r, b))
        try:
            text = pytesseract.image_to_string(crop, lang='eng', config='--psm 6').strip()
        except Exception as e:
            text = ''
        if not text:
            try:
                text = pytesseract.image_to_string(crop, lang='eng', config='--psm 7').strip()
            except Exception:
                text = ''
        unreadable = (text == '')
        ocr_row.append({'row': r_idx, 'col': c_idx, 'text': text, 'unreadable': unreadable})
    rows_out.append(ocr_row)

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({'tid': tid, 'file_page': page['file_page'], 'printed_page': page['printed_page'], 'rows': rows_out}, f, ensure_ascii=False, indent=2)

print('WROTE', out_path)
