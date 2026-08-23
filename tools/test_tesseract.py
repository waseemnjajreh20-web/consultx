import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
try:
    v = pytesseract.get_tesseract_version()
    print('TESSERACT_VERSION:', v)
except Exception as e:
    print('ERROR:', e)
