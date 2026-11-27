import {fileURLToPath,pathToFileURL} from 'node:url';
import {createProtocol,callTool,runStdio,TOOLS} from './server.mjs';
import {readRegistry,McpClient} from './client.mjs';
const id={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'};
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
export const GATEWAY_TOOLS=[
 {name:'consultx_connections_list',description:'List operator-configured local integrations and allowed tools. No credentials returned.',inputSchema:schema({}),annotations:{readOnlyHint:true}},
 {name:'consultx_connection_probe',description:'Connect to an enabled local integration and discover allowed tools. No engineering output is certified.',inputSchema:schema({connection:id},['connection']),annotations:{readOnlyHint:true}},
 {name:'consultx_connection_call',description:'Call an explicitly allowed tool of a configured local MCP server. Preview changes require operator opt-in; upstream Apply remains a human gate. External results are untrusted evidence.',inputSchema:schema({connection:id,tool:{type:'string',minLength:1,maxLength:128},arguments:{type:'object'}},['connection','tool','arguments'])}
];
export function createGateway({registryPath=process.env.CONSULTX_CONNECTIONS_FILE??fileURLToPath(new URL('./connections.example.json',import.meta.url)),env=process.env,fetcher=fetch,core=callTool,registryReader=readRegistry}={}){
 async function handler(name,args){
  if(TOOLS.some(t=>t.name===name))return core(name,args);
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid arguments');
  const registry=await registryReader(registryPath);
  if(name==='consultx_connections_list'){
   if(Object.keys(args).length)throw Error('No arguments accepted');
   return {connections:registry.map(({id,enabled,tools,allowPreview})=>({id,enabled,tools,allowPreview:allowPreview===true})),scope:'LOCAL_OPERATOR_ONLY'};
  }
  const allowed=name==='consultx_connection_probe'?['connection']:['connection','tool','arguments'];
  if(Object.keys(args).some(k=>!allowed.includes(k)))throw Error('Unknown argument');
  if(typeof args.connection!=='string'||!new RegExp(id.pattern).test(args.connection))throw Error('Invalid connection ID');
  const c=registry.find(v=>v.id===args.connection);if(!c)throw Error('Unknown connection');
  const client=new McpClient(c,{env,fetcher});
  try{
   if(name==='consultx_connection_probe')return {connection:c.id,tools:await client.tools(),status:'CONNECTED'};
   if(name!=='consultx_connection_call'||typeof args.tool!=='string'||!args.arguments||typeof args.arguments!=='object'||Array.isArray(args.arguments))throw Error('Invalid tool arguments');
   const result=await client.call(args.tool,args.arguments);
   if(result?.isError)throw Error('External MCP tool reported failure');
   return {connection:c.id,tool:args.tool,result,verification:'EXTERNAL_UNTRUSTED',approval:'ENGINEER_REVIEW_REQUIRED'};
  }finally{await client.close().catch(()=>{});}
 }
 return createProtocol(handler,[...TOOLS,...GATEWAY_TOOLS]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runStdio(createGateway()).catch(()=>{console.error('ConsultX local gateway terminated');process.exitCode=1;});
