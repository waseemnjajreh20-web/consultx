import json
from PIL import Image, ImageFilter, ImageOps
import pytesseract
import os

p = r'd:\ConsultX_Clean\image_extracted_tables.json'
out = r'd:\ConsultX_Clean\ocr_cell_results.json'

# Ensure pytesseract points to installed tesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

with open(p, 'r', encoding='utf-8') as f:
    data = json.load(f)

results = {}

for tid, pages in data.items():
    results[tid] = []
    for page_info in pages:
        img_path = page_info['img_path']
        cells = page_info['cells']
        page_result = {'file_page': page_info['file_page'], 'printed_page': page_info['printed_page'], 'rows': []}
        if not os.path.exists(img_path):
            page_result['error'] = 'image not found'
            results[tid].append(page_result)
            continue
        img_full = Image.open(img_path).convert('RGB')
        for r_idx, row in enumerate(cells):
            row_texts = []
            for c_idx, cell in enumerate(row):
                left, top, right, bottom = cell['img_box']
                # crop and pad slightly
                pad = 2
                crop = img_full.crop((max(0,left-pad), max(0,top-pad), min(img_full.width, right+pad), min(img_full.height, bottom+pad)))
                # convert to grayscale and increase contrast
                gray = crop.convert('L')
                # resize to improve OCR accuracy
                w,h = gray.size
                if w < 50:
                    scale = max(2, 200//max(1,w))
                else:
                    scale = 2
                gray = gray.resize((w*scale, h*scale), Image.BICUBIC)
                # apply slight sharpen
                gray = gray.filter(ImageFilter.SHARPEN)
                # binarize
                gray = ImageOps.autocontrast(gray)
                try:
                    # use PSM 7 (single text line) which often works well for table cells
                    config = '--psm 7'
                    txt = pytesseract.image_to_string(gray, lang='eng', config=config)
                except Exception as e:
                    txt = ''
                txt = txt.strip()
                # mark unreadable if empty or clearly noise
                unreadable = False
                if not txt:
                    unreadable = True
                page_result['rows'].append({'r': r_idx+1, 'c': c_idx+1, 'img_box': cell['img_box'], 'text': txt, 'unreadable': unreadable})
            # end for cells
        # end for rows
        results[tid].append(page_result)

with open(out, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print('WROTE', out)
