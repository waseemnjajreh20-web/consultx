import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const MAX=8*1024*1024, VERSION='2025-06-18';
const SAFE=new Set(['get_context','query_elements','run_checks']);
const PREVIEW=new Set(['create_elements','request_apply']);
export function validateConnection(c){
 if(!c||typeof c!=='object'||!/^[a-z][a-z0-9_-]{0,63}$/.test(c.id))throw Error('Invalid connection ID');
 const url=new URL(c.url);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.hash||url.search||url.pathname!=='/mcp')throw Error('Only explicitly configured loopback MCP endpoints are supported');
 if(!/^CONSULTX_CONNECTION_[A-Z0-9_]+_TOKEN$/.test(c.tokenEnv))throw Error('Dedicated connection token variable required');
 if(!Array.isArray(c.tools)||c.tools.length>100||c.tools.some(n=>typeof n!=='string'||!/^[a-zA-Z0-9_.-]{1,128}$/.test(n)))throw Error('Tool allowlist required');
 if(c.id==='openconstructiondesign'&&(url.port!=='47621'||c.tools.some(n=>!SAFE.has(n)&&!PREVIEW.has(n))))throw Error('Invalid OpenConstructionDesign policy');
 if(c.id==='openconstructiondesign'&&c.tools.some(n=>PREVIEW.has(n))&&c.allowPreview!==true)throw Error('Preview tools require explicit operator opt-in');
 return {id:c.id,url:url.href,tokenEnv:c.tokenEnv,tools:[...new Set(c.tools)],enabled:c.enabled===true,allowPreview:c.allowPreview===true};
}
export async function readRegistry(path){
 const raw=await readFile(path);if(raw.length>65536)throw Error('Registry too large');const data=JSON.parse(raw);
 if(!Array.isArray(data.connections)||data.connections.length>32)throw Error('Invalid registry');
 const list=data.connections.map(validateConnection);if(new Set(list.map(c=>c.id)).size!==list.length)throw Error('Duplicate connections');return list;
}
async function parseResponse(res){
 if(!res.ok){await res.body?.cancel().catch(()=>{});throw Error('MCP connection HTTP '+res.status);}
 if(res.status===202||res.status===204)return null;
 const ct=res.headers.get('content-type')??'';
 if(!ct.includes('application/json')&&!ct.includes('text/event-stream'))throw Error('Unsupported MCP response type');
 const reader=res.body?.getReader();if(!reader)throw Error('Missing response body');
 const decoder=new TextDecoder();let bytes=0,s='';
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX)throw Error('MCP response too large');s+=decoder.decode(value,{stream:true});if(ct.includes('text/event-stream')){const boundary=s.search(/\r?\n\r?\n/);if(boundary>=0){const frame=s.slice(0,boundary);const data=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data)return JSON.parse(data);s=s.slice(boundary).replace(/^\r?\n\r?\n/,'');}}}s+=decoder.decode();return JSON.parse(s);}finally{await reader.cancel().catch(()=>{});}
}
export class McpClient{
 constructor(connection,{env=process.env,fetcher=fetch}={}){this.c=validateConnection(connection);if(!this.c.enabled)throw Error('Connection disabled');const token=env[this.c.tokenEnv];if(!token||token.length>8192||/\s/.test(token))throw Error('Connection token missing or invalid');this.token=token;this.fetcher=fetcher;this.session=null;this.version=null;this.seq=0;this.ready=false;}
 async send(method,params={},notification=false){
  const id=++this.seq;const headers={'Authorization':'Bearer '+this.token,'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
  if(this.session)headers['Mcp-Session-Id']=this.session;if(this.version)headers['MCP-Protocol-Version']=this.version;
  const res=await this.fetcher(this.c.url,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(120000),body:JSON.stringify({jsonrpc:'2.0',method,params,...(notification?{}:{id})})});
  if(method==='initialize'&&res.ok)this.session=res.headers.get('mcp-session-id');const msg=await parseResponse(res);
  if(notification){if(msg!==null)throw Error('Unexpected notification response');return;}
  if(!msg||msg.jsonrpc!=='2.0'||msg.id!==id)throw Error('Invalid MCP response ID');if(msg.error)throw Error('MCP RPC error '+msg.error.code);return msg.result;
 }
 async connect(){if(this.ready)return;const r=await this.send('initialize',{protocolVersion:VERSION,capabilities:{},clientInfo:{name:'consultx-integration',version:'0.2.0'}});if(!['2025-11-25',VERSION,'2025-03-26','2024-11-05'].includes(r?.protocolVersion))throw Error('Unsupported MCP version');this.version=r.protocolVersion;await this.send('notifications/initialized',{},true);this.ready=true;}
 async tools(){await this.connect();const tools=[];let cursor;for(let i=0;i<20;i++){const r=await this.send('tools/list',cursor?{cursor}:{});if(!Array.isArray(r?.tools))throw Error('Invalid tools response');tools.push(...r.tools.filter(t=>this.c.tools.includes(t.name)));if(!r.nextCursor)return tools;cursor=r.nextCursor;}throw Error('Tool discovery pagination limit');}
 async call(name,args={}){if(!this.c.tools.includes(name))throw Error('Tool denied by connection policy');if(!args||typeof args!=='object'||Array.isArray(args)||Buffer.byteLength(JSON.stringify(args))>MAX)throw Error('Invalid tool arguments');const found=(await this.tools()).find(t=>t.name===name);if(!found)throw Error('Tool unavailable on connected server');return this.send('tools/call',{name,arguments:args});}
 async close(){try{if(this.session){const r=await this.fetcher(this.c.url,{method:'DELETE',headers:{Authorization:'Bearer '+this.token,'Mcp-Session-Id':this.session,'MCP-Protocol-Version':this.version??VERSION},redirect:'error',signal:AbortSignal.timeout(5000)});await r.body?.cancel().catch(()=>{});}}finally{this.token='';this.session=null;this.ready=false;}}
}
async function main(){const [registryPath,action,id,tool,argPath]=process.argv.slice(2);if(!registryPath||!action)throw Error('Usage: node client.mjs <registry.json> list|probe|call [connection] [tool] [args.json]');const registry=await readRegistry(registryPath);if(action==='list'){console.log(JSON.stringify(registry.map(({id,enabled,tools})=>({id,enabled,tools})),null,2));return;}const c=registry.find(v=>v.id===id);if(!c)throw Error('Unknown connection');const client=new McpClient(c);try{if(action==='probe')console.log(JSON.stringify(await client.tools(),null,2));else if(action==='call'){if(!tool||!argPath)throw Error('Tool and arguments file required');const raw=await readFile(argPath);if(raw.length>MAX)throw Error('Arguments too large');console.log(JSON.stringify(await client.call(tool,JSON.parse(raw)),null,2));}else throw Error('Unknown operation');}finally{await client.close().catch(()=>{});}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
