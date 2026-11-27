import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from '../gateway.mjs';
import {createHttp} from '../http.mjs';
async function initialize(p){await p({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}});await p({jsonrpc:'2.0',method:'notifications/initialized'});}
const request=(p,name,args)=>p({jsonrpc:'2.0',id:4,method:'tools/call',params:{name,arguments:args}});
test('local gateway lists six tools; disabled external connection cannot run',async()=>{
 const p=createGateway();await initialize(p);const list=await p({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(list.result.tools.length,6);
 const r=await request(p,'consultx_connections_list',{});const out=JSON.parse(r.result.content[0].text);assert.equal(out.connections[0].enabled,false);assert.equal(out.connections[0].id,'openconstructiondesign');assert.ok(!JSON.stringify(out).includes('TOKEN'));
 const denied=await request(p,'consultx_connection_probe',{connection:'openconstructiondesign'});assert.equal(denied.result.isError,true);
});
test('gateway delegates allowed tools through real HTTP bridge without leaking backend credentials',async t=>{
 const server=createHttp({env:{CONSULTX_SUPABASE_URL:'https://test.supabase.co',CONSULTX_SUPABASE_KEY:'public-test'},fetcher:async(u,o)=>{assert.equal(o.headers.Authorization,'Bearer external-token');if(u.endsWith('/auth/v1/user'))return new Response('{}');return new Response('data: {"choices":[{"delta":{"content":"evidence"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const registryReader=async()=>[{id:'test',url:'http://127.0.0.1:'+server.address().port+'/mcp',tokenEnv:'CONSULTX_CONNECTION_TEST_TOKEN',enabled:true,tools:['consultx_consult']}];
 const p=createGateway({registryReader,env:{CONSULTX_CONNECTION_TEST_TOKEN:'external-token',CONSULTX_ACCESS_TOKEN:'private-token'}});await initialize(p);
 const deny=await request(p,'consultx_connection_call',{connection:'test',tool:'consultx_analyze_drawing',arguments:{}});assert.equal(deny.result.isError,true);
 const call=await request(p,'consultx_connection_call',{connection:'test',tool:'consultx_consult',arguments:{question:'test'}});assert.equal(call.result.isError,undefined);assert.equal(JSON.parse(call.result.content[0].text).verification,'EXTERNAL_UNTRUSTED');
 const malicious=await request(p,'consultx_connection_call',{connection:'test',tool:'consultx_consult',arguments:{question:'test'},url:'https://evil.test'});assert.equal(malicious.result.isError,true);
});
