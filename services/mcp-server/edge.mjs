import {createProtocol,callTool,loadConfig,TOOLS,VERSIONS} from './core.mjs';
const LIMIT=8*1024*1024;
const json=(status,body,headers={})=>new Response(body===undefined?null:JSON.stringify(body),{status,headers:{'Cache-Control':'no-store','Content-Type':'application/json',...headers}});
const fail=(status,message,headers)=>json(status,{error:message},headers);
async function parseBody(req){
 const reader=req.body?.getReader();if(!reader)throw Error('Missing request');let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT)throw Error('LIMIT');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const data=new Uint8Array(size);let i=0;for(const chunk of chunks){data.set(chunk,i);i+=chunk.length;}return JSON.parse(new TextDecoder().decode(data));
}
// Private, stateless HTTP MCP transport. Supabase user-token authorization only.
// Does not expose local-engine connections, OAuth discovery, server-initiated messages or persistent sessions.
export function createEdge({env={},fetcher=fetch,allowedOrigins=[]}={}){
 return async function handler(req){
  const origin=req.headers.get('origin');if(origin&&!allowedOrigins.includes(origin))return fail(403,'Origin denied');
  if(req.method!=='POST')return fail(405,'Only POST supported',{Allow:'POST'});
  if(req.headers.has('mcp-session-id'))return fail(400,'Stateless endpoint does not use session IDs');
  const accept=req.headers.get('accept')??'';if(!accept.includes('application/json')||!accept.includes('text/event-stream'))return fail(406,'Accept JSON and event-stream');
  if(!(req.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))return fail(415,'JSON required');
  const bearer=req.headers.get('authorization')?.match(/^Bearer ([^\s,]+)$/i)?.[1];
  if(!bearer||bearer.length>8192)return fail(401,'User session required',{'WWW-Authenticate':'Bearer'});
  let config;try{config=loadConfig({CONSULTX_SUPABASE_URL:env.SUPABASE_URL,CONSULTX_SUPABASE_KEY:env.SUPABASE_ANON_KEY,CONSULTX_ACCESS_TOKEN:bearer});}catch{return fail(401,'Invalid credentials or server configuration');}
  const context={config:()=>config,fetcher,timeoutMs:120000};
  try{await callTool('consultx_connection_status',{},context);}catch(e){const status=/HTTP 401|HTTP 403/.test(e.message)?401:502;return fail(status,'Authentication unavailable or rejected',status===401?{'WWW-Authenticate':'Bearer'}:undefined);}
  if(Number(req.headers.get('content-length'))>LIMIT)return fail(413,'Request too large');
  let msg;try{msg=await parseBody(req);}catch(e){return fail(e.message==='LIMIT'?413:400,e.message==='LIMIT'?'Request too large':'Invalid JSON');}
  if(!msg||Array.isArray(msg)||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return fail(400,'Invalid JSON-RPC message');
  const version=req.headers.get('mcp-protocol-version')??'2025-03-26';if(msg.method!=='initialize'&&!VERSIONS.includes(version))return fail(400,'Unsupported protocol version');
  if(msg.method==='initialize'&&!Object.hasOwn(msg,'id'))return fail(400,'Invalid initialization');
  const protocol=createProtocol(async(name,args)=>{const r=await callTool(name,args,context);return name==='consultx_connection_status'?{...r,transport:'http-stateless'}:r;},TOOLS,{stateless:true});
  try{const result=await protocol(msg);return result===null?json(202):json(200,result);}catch{return fail(502,'Gateway request failed');}
 };
}
