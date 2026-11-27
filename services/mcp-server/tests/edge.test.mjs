import test from 'node:test';
import assert from 'node:assert/strict';
import {createEdge} from '../edge.mjs';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-test'};
const req=(method,params={},headers={},id=1)=>new Request('https://test.supabase.co/functions/v1/consultx-mcp',{method:'POST',headers:{Authorization:'Bearer user-a','Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers},body:JSON.stringify({jsonrpc:'2.0',method,params,...(id===null?{}:{id})})});
test('edge endpoint uses per-request authentication and only core tools',async()=>{
 const calls=[];const handler=createEdge({env,fetcher:async(u,o)=>{calls.push([u,o.headers.Authorization]);if(u.endsWith('/auth/v1/user'))return new Response('{}',{status:o.headers.Authorization==='Bearer invalid'?401:200});return new Response('data: {"choices":[{"delta":{"content":"edge evidence"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 const init=await handler(req('initialize',{protocolVersion:'2025-06-18'}));assert.equal(init.status,200);assert.equal(init.headers.get('mcp-session-id'),null);assert.equal((await init.json()).result.protocolVersion,'2025-06-18');
 assert.equal((await handler(req('notifications/initialized',{}, {},null))).status,202);
 const list=await (await handler(req('tools/list'))).json();assert.equal(list.result.tools.length,3);assert.ok(list.result.tools.every(t=>!t.name.startsWith('consultx_connections')));
 const r=await (await handler(req('tools/call',{name:'consultx_consult',arguments:{question:'check'}},{Authorization:'Bearer user-b'}))).json();assert.equal(JSON.parse(r.result.content[0].text).answer,'edge evidence');assert.equal(calls.at(-1)[1],'Bearer user-b');
 assert.equal((await handler(req('tools/list',{}, {Authorization:'Bearer invalid'}))).status,401);
 assert.equal((await handler(req('tools/list',{}, {Origin:'https://evil.test'}))).status,403);
 assert.equal((await handler(req('tools/list',{}, {'Mcp-Session-Id':'x'}))).status,400);
 assert.equal((await handler(req('tools/list',{}, {'MCP-Protocol-Version':'unsupported'}))).status,400);
 assert.equal((await handler(req('tools/list',{}, {Authorization:'Bearer sb_secret_example'}))).status,401);
});
