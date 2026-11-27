import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_LINE = 26 * 1024 * 1024;
const MAX_RESPONSE = 8 * 1024 * 1024;
const string = (maxLength, minLength = 1) => ({type:'string',minLength,maxLength});
const documentSchema = {type:'object',additionalProperties:false,required:['name','content'],properties:{name:string(200),content:string(20000)}};
const base = {question:string(12000),language:{type:'string',enum:['ar','en'],default:'ar'}};
const objectSchema = (properties,required=[]) => ({type:'object',additionalProperties:false,properties,required});
export const TOOLS = [
  {name:'consultx_connection_status',description:'Check whether the configured Supabase user session is valid. Does not reveal tokens or personal data.',inputSchema:objectSchema({}),annotations:{readOnlyHint:true}},
  {name:'consultx_consult',description:'Send an engineering consultation to the existing ConsultX backend. Returns advisory text and backend-reported source metadata, not independent compliance certification. Consumes account quota.',inputSchema:objectSchema({...base,mode:{type:'string',enum:['standard','analysis'],default:'standard'}},['question'])},
  {name:'consultx_analyze_drawing',description:'Submit prepared drawing page images (PNG/JPEG/WebP data URLs) and/or extracted drawing text to ConsultX analytical mode. No CAD extraction, geometry measurement, or final approval is implied. Consumes account quota.',inputSchema:objectSchema({...base,images:{type:'array',maxItems:8,items:string(3000000)},documentTexts:{type:'array',maxItems:10,items:documentSchema}},['question'])}
];
function assertSchema(value,schema,path='arguments'){
  const fail=()=>{throw new Error(`Invalid ${path}`)};
  if(schema.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value)) fail();
    for(const k of schema.required??[]) if(!Object.hasOwn(value,k)) fail();
    for(const k of Object.keys(value)){
      if(!Object.hasOwn(schema.properties,k)) fail();
      assertSchema(value[k],schema.properties[k],`${path}.${k}`);
    }
  }else if(schema.type==='string'){
    if(typeof value!=='string'||value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity)||(schema.enum&&!schema.enum.includes(value))) fail();
  }else if(schema.type==='array'){
    if(!Array.isArray(value)||value.length>(schema.maxItems??Infinity)) fail();
    value.forEach((v,i)=>assertSchema(v,schema.items,`${path}[${i}]`));
  }
}
export function loadConfig(env=process.env){
  const url = new URL(env.CONSULTX_SUPABASE_URL??'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/') throw new Error('Configure an HTTPS Supabase project origin.');
  const key=env.CONSULTX_SUPABASE_KEY, token=env.CONSULTX_ACCESS_TOKEN;
  if(!key||!token||/[\r\n]/.test(key+token)) throw new Error('Configure publishable/anon key and user access token.');
  if(key.startsWith('sb_secret_')) throw new Error('Privileged API keys are prohibited.');
  for(const v of [key,token]){
    if(v.split('.').length===3){try{const payload=JSON.parse(Buffer.from(v.split('.')[1],'base64url').toString());if(payload.role==='service_role'||payload.role==='supabase_admin') throw new Error('Privileged credential');}catch(e){if(e.message==='Privileged credential')throw new Error('Privileged API keys are prohibited.');}}
  }
  return {origin:url.origin,key,token};
}
function headers(config){return {apikey:config.key,Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'};}
function safeHttpError(status){return new Error(`ConsultX backend HTTP ${status}${status===401?' (session expired or invalid)':status===429?' (rate or usage limit)':''}.`);}
export async function readSSE(response){
  if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Unexpected backend response type.');
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buf='',answer='',done=false,total=0;
  function line(raw){
    if(!raw.startsWith('data:'))return;
    const data=raw.slice(5).trim();if(!data)return;
    if(data==='[DONE]'){done=true;return;}
    if(done)return;
    const obj=JSON.parse(data);
    if(obj.error)throw new Error('Backend returned a stream error.');
    const chunk=obj.choices?.[0]?.delta?.content;
    if(typeof chunk==='string') answer+=chunk;
  }
  try{
    while(!done){const {value,done:eof}=await reader.read();if(eof)break;total+=value.byteLength;if(total>MAX_RESPONSE)throw new Error('Response limit exceeded.');buf+=decoder.decode(value,{stream:true});let idx;while((idx=buf.indexOf('\n'))!==-1){line(buf.slice(0,idx).replace(/\r$/,''));buf=buf.slice(idx+1);if(done)break;}}
    if(!done){buf+=decoder.decode();if(buf.trim())line(buf.replace(/\r$/,''));}
  }finally{await reader.cancel().catch(()=>{});}
  if(!done||!answer.trim())throw new Error('Incomplete or empty ConsultX response.');
  let metadata=null;try{const raw=response.headers.get('x-sbc-source-meta');if(raw)metadata=JSON.parse(raw);}catch{/* preserve explicit unknown */}
  return {answer,source_files:response.headers.get('x-sbc-sources')??null,source_metadata:metadata,verification:'BACKEND_REPORTED_NOT_INDEPENDENTLY_VERIFIED',approval:'ENGINEER_REVIEW_REQUIRED'};
}
export async function callTool(name,args,{config=loadConfig,fetcher=fetch}={}){
  const tool=TOOLS.find(t=>t.name===name);if(!tool)throw new Error('Unknown tool.');
  assertSchema(args,tool.inputSchema);
  let body;
  if(name!=='consultx_connection_status'){
    if(!args.question.trim())throw new Error('Question is empty.');
    body={messages:[{role:'user',content:args.question}],mode:args.mode??'standard',language:args.language??'ar'};
    if(name==='consultx_analyze_drawing'){
      const images=args.images??[], docs=args.documentTexts??[];
      if(!images.length&&!docs.length)throw new Error('Provide at least one drawing image or extracted text document.');
      if(images.some(v=>!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)))throw new Error('Only PNG/JPEG/WebP base64 data URLs are accepted.');
      body.mode='analysis';body.images=images;body.documentTexts=docs.map(d=>({name:d.name.startsWith('[PDF_TEXT_LAYER]')?d.name:`[PDF_TEXT_LAYER] ${d.name}`,content:d.content}));
    }
  }
  const c=config(), options={headers:headers(c),redirect:'error',signal:AbortSignal.timeout(180000)};
  if(name==='consultx_connection_status'){
    const res=await fetcher(`${c.origin}/auth/v1/user`,options);
    if(!res.ok){await res.body?.cancel().catch(()=>{});throw safeHttpError(res.status);}
    await res.body?.cancel().catch(()=>{});
    return {session:'VALID',engineering_backend:'NOT_TESTED_BY_STATUS_CHECK',transport:'stdio'};
  }
  const res=await fetcher(`${c.origin}/functions/v1/fire-safety-chat`,{...options,method:'POST',body:JSON.stringify(body),headers:{...options.headers,Accept:'text/event-stream'}});
  if(!res.ok){await res.body?.cancel().catch(()=>{});throw safeHttpError(res.status);}
  return readSSE(res);
}
const result=(id,result)=>({jsonrpc:'2.0',id,result});
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
export function createProtocol(handler=callTool){
  let state='new';
  return async function processMessage(req){
    if(!req||Array.isArray(req)||req.jsonrpc!=='2.0'||typeof req.method!=='string')return error(null,-32600,'Invalid Request');
    const hasId=Object.hasOwn(req,'id');
    if(!hasId){if(req.method==='notifications/initialized'&&state==='negotiated')state='ready';return null;}
    const id=req.id;
    if(typeof id!=='number'&&typeof id!=='string')return error(null,-32600,'Invalid request ID');
    if(req.method==='ping')return result(id,{});
    if(req.method==='initialize'){
      if(state!=='new')return error(id,-32600,'Already initialized');
      if(typeof req.params?.protocolVersion!=='string')return error(id,-32602,'Protocol version required');
      state='negotiated';return result(id,{protocolVersion:VERSIONS.includes(req.params.protocolVersion)?req.params.protocolVersion:VERSIONS[0],capabilities:{tools:{}},serverInfo:{name:'consultx-mcp',version:'0.1.0'}});
    }
    if(state!=='ready')return error(id,-32002,'Server not initialized');
    if(req.method==='tools/list')return result(id,{tools:TOOLS});
    if(req.method==='tools/call'){
      if(typeof req.params?.name!=='string')return error(id,-32602,'Tool name required');
      if(!TOOLS.some(t=>t.name===req.params.name))return error(id,-32602,'Unknown tool');
      try{const data=await handler(req.params.name,req.params.arguments??{});return result(id,{content:[{type:'text',text:JSON.stringify(data)}]});}
      catch(e){return result(id,{isError:true,content:[{type:'text',text:e instanceof Error?e.message:'Tool execution failed.'}]});}
    }
    return error(id,-32601,'Method not found');
  };
}
async function main(){
  const processMessage=createProtocol();
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
  for await(const line of lines){if(!line.trim())continue;let response;
    if(Buffer.byteLength(line)>MAX_LINE)response=error(null,-32600,'Request too large');
    else{let req;try{req=JSON.parse(line);}catch{response=error(null,-32700,'Parse error');}if(!response)response=await processMessage(req);}
    if(response)process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('ConsultX MCP terminated.');process.exitCode=1;});
