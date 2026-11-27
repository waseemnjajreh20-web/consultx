import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createProtocol,callTool,loadConfig} from './server.mjs';
const LIMIT=26*1024*1024, TTL=30*60*1000, MAX_SESSIONS=100, MAX_ACTIVE=8;
const hash=s=>createHash('sha256').update(s).digest('hex');
export function createHttp({env=process.env,fetcher=fetch,allowedHosts=['localhost','127.0.0.1'],allowedOrigins=[]}={}){
 const sessions=new Map(); let active=0;
 const respond=(res,status,data,headers={})=>{res.writeHead(status,{'Cache-Control':'no-store','Content-Type':'application/json',...headers});res.end(data===undefined?undefined:JSON.stringify(data));};
 const error=(res,status,message)=>respond(res,status,{error:message});
 return createServer({requestTimeout:200000,headersTimeout:15000,maxHeaderSize:16384},async(req,res)=>{
  const host=req.headers.host?.replace(/:\d+$/,'');
  if(!allowedHosts.includes(host)|| (req.headers.origin&&!allowedOrigins.includes(req.headers.origin)))return error(res,403,'Host or Origin denied');
  if(req.url==='/health'&&req.method==='GET')return respond(res,200,{status:'alive',backend:'not_checked'});
  if(req.url!=='/mcp')return error(res,404,'Not found');
  if(!['POST','DELETE'].includes(req.method))return respond(res,405,{error:'Method not supported'},{Allow:'POST, DELETE'});
  const token=req.headers.authorization?.match(/^Bearer ([^\s,]+)$/i)?.[1];
  if(!token||token.length>8192)return respond(res,401,{error:'User session required'},{'WWW-Authenticate':'Bearer'});
  let config;try{config=loadConfig({...env,CONSULTX_ACCESS_TOKEN:token});}catch{return error(res,401,'Invalid credentials or server configuration');}
  if(active>=MAX_ACTIVE)return error(res,503,'Gateway busy');active++;
  try{
   const context={config:()=>config,fetcher};
   try{await callTool('consultx_connection_status',{},context);}catch(e){return error(res,/HTTP 401|HTTP 403/.test(e.message)?401:502,'Authentication unavailable or rejected');}
   const now=Date.now();for(const [id,s] of sessions)if(now-s.time>TTL&&!s.busy)sessions.delete(id);
   const id=req.headers['mcp-session-id'], existing=typeof id==='string'?sessions.get(id):undefined;
   if(id&&(!existing||existing.owner!==hash(token)))return error(res,404,'Unknown session');
   if(req.method==='DELETE'){if(!existing)return error(res,400,'Session required');if(existing.busy)return error(res,409,'Session busy');sessions.delete(id);return respond(res,204);}
   if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))return error(res,415,'JSON required');
   const accept=req.headers.accept??'';if(!accept.includes('application/json')||!accept.includes('text/event-stream'))return error(res,406,'Accept JSON and event-stream');
   let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>LIMIT){req.destroy();return;}chunks.push(c);}
   let msg;try{msg=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return error(res,400,'Invalid JSON');}
   if(!msg||Array.isArray(msg)||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return error(res,400,'Invalid JSON-RPC message');
   if(msg.method==='initialize'){
    if(id||!Object.hasOwn(msg,'id'))return error(res,400,'Invalid initialization');
    if(sessions.size>=MAX_SESSIONS)return error(res,503,'Session capacity reached');
    const protocol=createProtocol((name,args)=>callTool(name,args,context));const result=await protocol(msg);
    if(!result?.result)return respond(res,200,result);
    const sessionId=randomUUID();sessions.set(sessionId,{protocol,owner:hash(token),time:now,version:result.result.protocolVersion,busy:false});
    return respond(res,200,result,{'Mcp-Session-Id':sessionId});
   }
   if(!existing)return error(res,400,'Session required');
   if(req.headers['mcp-protocol-version']!==existing.version)return error(res,400,'Protocol version required or mismatched');
   if(existing.busy)return error(res,409,'Session busy');existing.busy=true;
   try{const result=await existing.protocol(msg);existing.time=Date.now();return result===null?respond(res,202):respond(res,200,result);}finally{existing.busy=false;}
  }catch{if(!res.headersSent&&!res.destroyed)error(res,502,'Gateway request failed');}finally{active--;}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 const hosts=['localhost','127.0.0.1',...(process.env.CONSULTX_ALLOWED_HOSTS??'').split(',').filter(Boolean)];
 createHttp({allowedHosts:hosts}).listen(port,'127.0.0.1',()=>console.error('ConsultX MCP HTTP listening on loopback:'+port));
}
