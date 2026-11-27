import test from 'node:test';
import assert from 'node:assert/strict';
import {McpClient,validateConnection} from '../client.mjs';
import {createHttp} from '../http.mjs';
const ddc={id:'openconstructiondesign',url:'http://127.0.0.1:47621/mcp',tokenEnv:'CONSULTX_CONNECTION_DDC_TOKEN',enabled:true,tools:['get_context','query_elements','run_checks']};
test('DDC connection policy: no arbitrary hosts, credentials or preview without opt-in',()=>{
 assert.throws(()=>validateConnection({...ddc,url:'https://evil.test/mcp'}),/loopback/);
 assert.throws(()=>validateConnection({...ddc,tokenEnv:'CONSULTX_ACCESS_TOKEN'}),/token variable/);
 assert.throws(()=>validateConnection({...ddc,tools:['create_elements']}),/opt-in/);
 assert.throws(()=>validateConnection({...ddc,tools:['delete_project']}),/policy/);
 assert.throws(()=>new McpClient({...ddc,enabled:false}),/disabled/);
});
test('outbound client reaches actual loopback MCP bridge, isolates token, filters tools and closes session',async t=>{
 const env={CONSULTX_SUPABASE_URL:'https://test.supabase.co',CONSULTX_SUPABASE_KEY:'public-test'};
 const server=createHttp({env,fetcher:async(u,o)=>{assert.equal(o.headers.Authorization,'Bearer isolated-token');if(u.endsWith('/auth/v1/user'))return new Response('{}');return new Response('data: {"choices":[{"delta":{"content":"consulted"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const client=new McpClient({id:'test',url:'http://127.0.0.1:'+server.address().port+'/mcp',tokenEnv:'CONSULTX_CONNECTION_TEST_TOKEN',enabled:true,tools:['consultx_consult']},{env:{CONSULTX_CONNECTION_TEST_TOKEN:'isolated-token',CONSULTX_ACCESS_TOKEN:'never-send'}});
 assert.deepEqual((await client.tools()).map(t=>t.name),['consultx_consult']);
 await assert.rejects(client.call('consultx_analyze_drawing'),/denied/);
 const r=await client.call('consultx_consult',{question:'test'});assert.equal(JSON.parse(r.content[0].text).answer,'consulted');await client.close();assert.equal(client.token,'');
});
