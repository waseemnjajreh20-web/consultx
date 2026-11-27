import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import {createProtocol} from './core.mjs';
export * from './core.mjs';
const MAX_LINE = 26 * 1024 * 1024;
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
export async function runStdio(processMessage=createProtocol()){
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
  for await(const line of lines){if(!line.trim())continue;let response;
    if(Buffer.byteLength(line)>MAX_LINE)response=error(null,-32600,'Request too large');
    else{let req;try{req=JSON.parse(line);}catch{response=error(null,-32700,'Parse error');}if(!response)response=await processMessage(req);}
    if(response)process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runStdio().catch(()=>{console.error('ConsultX MCP terminated.');process.exitCode=1;});
