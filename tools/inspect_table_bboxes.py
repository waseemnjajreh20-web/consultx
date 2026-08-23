import pdfplumber

pdf_path = r'd:\ConsultX_Clean\SBC_201_CC_2024\SBC 201 - The Saudi General Building Code-251-500.pdf'
pages_to_check = list(range(196, 205))  # file pages 197-205

with pdfplumber.open(pdf_path) as pdf:
    for p in pages_to_check:
        if p < 0 or p >= len(pdf.pages):
            continue
        page = pdf.pages[p]
        actual_page = 251 + p
        print('\n=== FILE PAGE', p+1, f'(printed ~{actual_page}) ===')
        print('Page size:', page.width, 'x', page.height)
        rects = page.rects
        print('Rects:', len(rects))
        try:
            fts = page.find_tables()
        except Exception as e:
            fts = []
        print('find_tables count:', len(fts))
        for idx, ft in enumerate(fts):
            try:
                bbox = ft.bbox
            except Exception:
                bbox = None
            print(f' Table #{idx}: bbox={bbox}')
            try:
                if bbox:
                    cropped = page.crop(bbox)
                    table = cropped.extract_table(table_settings={"vertical_strategy":"lines","horizontal_strategy":"lines"}) or cropped.extract_table()
                else:
                    table = ft.extract() if hasattr(ft, 'extract') else None
            except Exception as e:
                table = None
            if table:
                rows = len(table)
                cols = len(table[0]) if table and table[0] else 0
                print(f'   Extracted table {rows}x{cols}; sample rows:')
                for r in table[:5]:
                    print('    ', r[:8])
            else:
                print('   No extracted table data')
        # Also show first 50 chars of text for context
        text = page.extract_text() or ''
        print('First text lines:')
        for line in text.split('\n')[:10]:
            print('   ', line[:200])
