import pytesseract
from PIL import Image

print('pytesseract version:', pytesseract.__version__)
try:
    # ensure pytesseract points to the installed tesseract binary
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    print('tesseract version:', pytesseract.get_tesseract_version())
except Exception as e:
    print('tesseract version error:', e)

img_path = r'd:\ConsultX_Clean\table_images\504.3_page_197.png'
print('testing image:', img_path)
img = Image.open(img_path)
text = pytesseract.image_to_string(img, lang='eng')
print('OCR text (first 500 chars):')
print(text[:500])
