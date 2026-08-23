import json
p='d:/ConsultX_Clean/image_extracted_tables.json'
j=json.load(open(p,encoding='utf-8'))
for tid in ['504.3','504.4','506.2']:
    pages=j.get(tid,[])
    print('TID',tid,'pages',len(pages))
    for pi,p in enumerate(pages):
        cells=p.get('cells',[])
        print(' page',pi,'file_page',p.get('file_page'),'rows',len(cells))
        for r in range(min(15,len(cells))):
            row=cells[r]
            texts=[c.get('text','') for c in row]
            non_empty=sum(1 for t in texts if t.strip())
            print('  row',r,'len',len(row),'non_empty',non_empty,'texts_sample',texts[:8])
        print()
