import sys
try:
    import pytesseract
    print('pytesseract: installed')
    try:
        print('tesseract_version:', pytesseract.get_tesseract_version())
    except Exception as e:
        print('tesseract not configured or not in PATH:', e)
except Exception as e:
    print('pytesseract not installed:', e)

try:
    import fitz
    print('PyMuPDF: installed')
except Exception as e:
    print('PyMuPDF not installed or import failed:', e)

try:
    from PIL import Image
    print('Pillow: installed')
except Exception as e:
    print('Pillow not installed:', e)

# Check if tesseract binary present
import shutil
t = shutil.which('tesseract')
if t:
    print('tesseract binary found at:', t)
else:
    print('tesseract binary NOT found in PATH')

# Check for camelot/tabula availability
try:
    import camelot
    print('camelot: installed')
except Exception as e:
    print('camelot not installed:', e)

try:
    import tabula
    print('tabula: installed')
except Exception as e:
    print('tabula not installed:', e)
