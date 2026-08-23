import pdfplumber
import os

# Search ALL PDF files in the SBC folder
base_path = r'd:\ConsultX_Clean\SBC_201_CC_2024'
pdf_files = sorted([f for f in os.listdir(base_path) if f.endswith('.pdf')])

target_tables = {'504.3': None, '504.4': None, '506.2': None}

print("Searching all SBC PDFs for Tables 504.3, 504.4, 506.2...\n")
print("="*80)

for pdf_name in pdf_files:
    pdf_path = os.path.join(base_path, pdf_name)
    
    # Extract page range from filename
    if '251-500' in pdf_name:
        page_offset = 251
    elif '501-1000' in pdf_name:
        page_offset = 501
    elif '1-250' in pdf_name:
        page_offset = 1
    elif '1001-1250' in pdf_name:
        page_offset = 1001
    else:
        page_offset = 0
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num in range(len(pdf.pages)):
            page = pdf.pages[page_num]
            text = page.extract_text() or ""
            actual_page = page_offset + page_num
            
            # Look for exact table headers with parentheses or metadata
            if ('Height' in text and 'Meter' in text) or \
               ('Height (m)' in text) or \
               ('Stories' in text and 'Height' in text and 'Sprinkler' in text):
                
                # Check which table
                table_match = ''
                if 'Table 504.3' in text:
                    table_match = '504.3'
                elif 'Table 504.4' in text:
                    table_match = '504.4'
                elif 'Table 506.2' in text:
                    table_match = '506.2'
                
                if table_match and target_tables[table_match] is None:
                    print(f"\nPOTENTIAL MATCH: {pdf_name}")
                    print(f"  Page {page_num+1} (actual ~{actual_page})")
                    print(f"  Table reference: {table_match}")
                    
                    # Extract tables from this page
                    tables = page.extract_tables(table_settings={
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines"
                    })
                    
                    print(f"  Found {len(tables)} table structure(s)")
                    
                    # Show first table with 3+ columns
                    for t_idx, table in enumerate(tables):
                        if table and len(table[0]) >= 3:
                            rows, cols = len(table), len(table[0])
                            print(f"\n  TABLE {t_idx}: {rows} rows × {cols} cols")
                            print(f"    HEADERS: {table[0][:5]}\n")
                            
                            target_tables[table_match] = {
                                'pdf': pdf_name,
                                'page': page_num + 1,
                                'actual_page': actual_page,
                                'table_idx': t_idx
                            }
                            break

print("\n" + "="*80)
print("\nFINAL RESULTS:")
for table_num, info in target_tables.items():
    if info:
        print(f"Table {table_num}: {info['pdf']}, page {info['page']} (actual ~{info['actual_page']})")
    else:
        print(f"Table {table_num}: NOT FOUND")
