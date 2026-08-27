// READ-ONLY citation checker: verifies that claimed SBC section citations
// actually exist in the production corpus, and shows what each section says.
//
//   node scripts/verify-sbc-citations.mjs SBC201:903.3.1.1 SBC801:5704.2.7 903.2
//
// A bare section (no code prefix) is checked against BOTH codes. Auth: the
// service key is read from the Windows user registry (HKCU\Environment,
// CONSULTX_SERVICE_KEY — set once by the owner via `setx`); it is never
// printed. Queries go through supabase-js (PostgREST) — SELECTs only.
//
// Exit code: 0 when every citation resolved, 1 when any citation is missing.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

function readUserEnv(name) {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8' });
    const line = out.split(/\r?\n/).find((l) => l.trim().startsWith(name));
    const m = line && line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/);
    return m ? m[1] : null;
  } catch { return null; }
}
const serviceKey = process.env.CONSULTX_SERVICE_KEY || readUserEnv('CONSULTX_SERVICE_KEY');
if (!serviceKey) { console.error('CONSULTX_SERVICE_KEY missing (setx CONSULTX_SERVICE_KEY "..." first)'); process.exit(2); }

const supabase = createClient('https://hrnltxmwoaphgejckutk.supabase.co', serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/verify-sbc-citations.mjs [SBC201:|SBC801:]<section> ...');
  process.exit(2);
}

let missing = 0;
for (const raw of args) {
  const m = raw.match(/^(?:(SBC201|SBC801):)?([0-9]{1,4}(?:\.[0-9]+)*)$/i);
  if (!m) { console.log(`INVALID ARG: "${raw}" — expected e.g. SBC201:903.3.1.1`); missing++; continue; }
  const codes = m[1] ? [m[1].toUpperCase()] : ['SBC201', 'SBC801'];
  const section = m[2];

  for (const code of codes) {
    const { data, error } = await supabase
      .from('sbc_section_defs')
      .select('doc_id, section, sbc_documents!inner(code_type, content)')
      .eq('section', section)
      .eq('sbc_documents.code_type', code)
      .limit(3);
    if (error) { console.error(`QUERY ERROR for ${code} ${section}: ${error.message}`); process.exit(2); }

    if (!data || data.length === 0) {
      console.log(`NOT FOUND  ${code} Section ${section} — no defining chunk in sbc_section_defs`);
      if (m[1]) missing++; // only count as missing when the code was claimed explicitly
      continue;
    }
    for (const row of data) {
      const content = row.sbc_documents?.content ?? '';
      const idx = content.indexOf(section);
      const snippet = (idx >= 0 ? content.slice(Math.max(0, idx - 40), idx + 200) : content.slice(0, 200))
        .replace(/\s+/g, ' ').trim();
      console.log(`FOUND      ${code} Section ${section} (doc ${row.doc_id}): ...${snippet}...`);
    }
  }
}
process.exit(missing > 0 ? 1 : 0);
