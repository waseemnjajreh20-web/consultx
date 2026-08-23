import os
import PyPDF2

folder = r'd:\ConsultX_Clean\SBC_201_CC_2024'
tables = ['Table 504.3', 'Table 504.4', 'Table 506.2']

for file in os.listdir(folder):
    if file.endswith('.pdf'):
        pdf_path = os.path.join(folder, file)
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page_num in range(len(reader.pages)):
                page = reader.pages[page_num]
                text = page.extract_text()
                for table in tables:
                    if table in text:
                        print(f'{table} found in {file} on page {page_num + 1}')
                        lines = text.split('\n')
                        for i, line in enumerate(lines):
                            if table in line:
                                start = max(0, i-5)
                                end = min(len(lines), i+20)
                                print('\n'.join(lines[start:end]))
                                print('---')
                                break