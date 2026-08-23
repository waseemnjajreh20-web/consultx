const fs = require('fs');
const path = require('path');

const outDir = 'D:/ConsultX_Clean/docs/audits/schema-baseline-20260501';
const extractedAt = new Date().toISOString();
const source = 'production project hrnltxmwoaphgejckutk via read-only SQL query';

const inputs = [
  {
    outName: 'columns.json',
    sourceFile: 'C:/Users/TOSHIBA/.verdent/storage/profiles/prod-s1/workspaces/consultx_clean--proj_e1064c861c7021a0/shared/artifacts/tool-results/1c90d51c-6247-4b48-bf1b-74960b823beb/tool_invoke_25_r_model_agent_17cd9aaa-43a0-4c4a-b417-2624130269f2_i_0.txt',
    dataPath: ['data','result'],
  },
  {
    outName: 'indexes.json',
    sourceFile: 'C:/Users/TOSHIBA/.verdent/storage/profiles/prod-s1/workspaces/consultx_clean--proj_e1064c861c7021a0/shared/artifacts/tool-results/1c90d51c-6247-4b48-bf1b-74960b823beb/tool_invoke_27_r_model_agent_17cd9aaa-43a0-4c4a-b417-2624130269f2_i_2.txt',
    dataPath: ['data','result'],
  },
];

for (const { outName, sourceFile, dataPath } of inputs) {
  const raw = fs.readFileSync(sourceFile, 'utf8');
  const payload = JSON.parse(raw);
  let data = payload;
  for (const key of dataPath) data = data[key];
  const doc = {
    extracted_at: extractedAt,
    source,
    object_type: outName.replace('.json',''),
    count: data.length,
    data,
  };
  fs.writeFileSync(path.join(outDir, outName), JSON.stringify(doc, null, 2));
  console.log('wrote', outName, 'count', data.length);
}
