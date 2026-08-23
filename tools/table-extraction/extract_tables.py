import os
import pdfplumber

folder = r'd:\ConsultX_Clean\SBC_201_CC_2024'
tables = ['504.3', '504.4', '506.2']

for file in os.listdir(folder):
    if file.endswith('.pdf'):
        pdf_path = os.path.join(folder, file)
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                if any(f'Table {t}' in text for t in tables):
                    print(f'Table found in {file} on page {page_num + 1}')
                    # extract tables
                    table_list = page.extract_tables()
                    for table in table_list:
                        if table and len(table) > 0:
                            # check if table has the number in first few rows
                            found = False
                            for row in table[:3]:  # check first 3 rows
                                row_str = ' '.join(str(cell) for cell in row if cell)
                                if any(t in row_str for t in tables):
                                    found = True
                                    break
                            if found:
                                print('Table content:')
                                for row in table:
                                    print(row)
                                print('---')