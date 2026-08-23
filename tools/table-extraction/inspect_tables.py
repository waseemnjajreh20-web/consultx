import json
with open('normalized_tables_payloads.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for key in ['504.3', '504.4', '506.2']:
    entry = data.get(key)
    if entry is None:
        print(f'MISSING {key}')
    else:
        print('KEY', key)
        print('table_id:', entry.get('table_id'))
        print('caption_en:', entry.get('caption_en'))
        print('page_start:', entry.get('page_start'))
        print('page_end:', entry.get('page_end'))
        print('row_count:', len(entry.get('rows', [])))
        print('cols:', len(entry.get('axis_schema', {}).get('columns', [])))
        print('first_row_stub:', entry.get('rows', [])[0].get('stub_en') if entry.get('rows') else None)
        print('---')
