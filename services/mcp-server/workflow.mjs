import {createHash} from 'node:crypto';
// The orchestrator trusts only operator-installed adapters, never instructions or
// approval flags embedded in project documents, agent output or MCP responses.
const required=['extract','resolve','design','renderPreview','validate','review','export'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const populated=s=>typeof s==='string'&&s.trim().length>0;
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const checked=(value,label)=>{if(!plain(value))throw Error('Invalid '+label+' output');return clone(value);};
function evidenceComplete(r){
 return plain(r)&&populated(r.id)&&populated(r.sourceId)&&populated(r.edition)&&populated(r.locator)&&sha(r.sourceHash)&&sha(r.quoteHash);
}
function block(code,stage,events){return {status:'BLOCKED',code,stage,events,finalDelivery:false};}
export async function runEngineeringJob(job,adapters,{maxAttempts=3}={}){
 if(!plain(job)||!populated(job.id)||!sha(job.inputHash)||!Array.isArray(job.sources)||!job.sources.length||job.sources.some(s=>!plain(s)||!populated(s.id)||!sha(s.sha256)))throw Error('Job requires an ID, input SHA-256 and pinned source hashes');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('Invalid attempt limit');
 if(required.some(s=>typeof adapters?.[s]!=='function'))throw Error('Missing trusted engineering adapter');
 const snapshot=clone(job),events=[];let stage='extract';
 const record=(stage,value,attempt)=>{events.push({stage,attempt,sha256:digest(value)});return value;};
 try{
  const facts=record(stage,checked(await adapters.extract(clone(snapshot)),'extraction'),0);
  if(facts.status!=='COMPLETE'||!Array.isArray(facts.elements)||!facts.elements.length)return block('EXTRACTION_INCOMPLETE',stage,events);
  stage='resolve';const decisions=record(stage,checked(await adapters.resolve(clone({job:snapshot,facts})),'rules'),0);
  if(decisions.status!=='VERIFIED'||!Array.isArray(decisions.requirements)||!decisions.requirements.length||!Array.isArray(decisions.exceptions)||!Array.isArray(decisions.unresolved)||decisions.unresolved.length)return block('RULES_UNVERIFIED_OR_UNRESOLVED',stage,events);
  const pinned=new Map(snapshot.sources.map(s=>[s.id,s.sha256]));
  const all=[...decisions.requirements,...decisions.exceptions];
  if(all.some(d=>!evidenceComplete(d)||pinned.get(d.sourceId)!==d.sourceHash)||new Set(all.map(d=>d.id)).size!==all.length)return block('EVIDENCE_MISSING_OR_SOURCE_MISMATCH',stage,events);
  if(decisions.exceptions.some(d=>!['APPLIES','DOES_NOT_APPLY'].includes(d.outcome)||!Array.isArray(d.conditions)||!d.conditions.length||d.conditions.some(c=>!plain(c)||!populated(c.id)||!['PASS','FAIL'].includes(c.status))||(d.outcome==='APPLIES'&&d.conditions.some(c=>c.status!=='PASS'))))return block('EXCEPTION_CONDITIONS_UNRESOLVED',stage,events);
  let previous=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   stage='design';const design=record(stage,checked(await adapters.design(clone({job:snapshot,facts,decisions,previous,attempt})),'design'),attempt);
   if(design.status!=='DRAFT'||!Array.isArray(design.operations)||!design.operations.length||design.operations.some(o=>!plain(o)||!Array.isArray(o.requirementIds)||!o.requirementIds.length||o.requirementIds.some(id=>!all.some(d=>d.id===id))))return block('DESIGN_NOT_TRACEABLE',stage,events);
   const designHash=digest(design);
   stage='renderPreview';const preview=record(stage,checked(await adapters.renderPreview(clone({job:snapshot,design,designHash,attempt})),'preview'),attempt);
   if(preview.status!=='PREVIEW_ONLY'||preview.designHash!==designHash||!sha(preview.modelHash))return block('PREVIEW_NOT_VERIFIABLE',stage,events);
   stage='validate';const check=record(stage,checked(await adapters.validate(clone({job:snapshot,facts,decisions,design,preview,attempt})),'validation'),attempt);
   if(check.modelHash!==preview.modelHash||!Array.isArray(check.findings)||!['PASS','FAIL','UNKNOWN'].includes(check.status))return block('VALIDATION_INVALID',stage,events);
   if(check.status==='UNKNOWN')return block('VALIDATION_UNKNOWN',stage,events);
   if(check.status==='FAIL'){
    if(!check.findings.length||attempt===maxAttempts)return block('VALIDATION_FAILED',stage,events);
    if(typeof adapters.discardPreview!=='function')return block('PREVIEW_RESET_REQUIRED',stage,events);
    stage='discardPreview';const reset=record(stage,checked(await adapters.discardPreview(clone({job:snapshot,preview,attempt})),'reset'),attempt);
    if(reset.status!=='DISCARDED'||reset.modelHash!==preview.modelHash)return block('PREVIEW_RESET_UNCONFIRMED',stage,events);
    previous=check;continue;
   }
   if(check.findings.length||!Array.isArray(check.checkedRequirementIds)||decisions.requirements.some(r=>!check.checkedRequirementIds.includes(r.id)))return block('VALIDATION_COVERAGE_INCOMPLETE',stage,events);
   stage='review';const reviewHash=digest({job:snapshot,designHash,modelHash:preview.modelHash,check});const review=record(stage,checked(await adapters.review(clone({job:snapshot,design,preview,check,reviewHash})),'review'),attempt);
   if(review.status!=='APPROVED'||review.reviewHash!==reviewHash||!populated(review.reviewerId))return {status:'AWAITING_ENGINEER_REVIEW',stage,reviewHash,events,finalDelivery:false};
   stage='export';const output=record(stage,checked(await adapters.export(clone({job:snapshot,design,preview,check,review,reviewHash})),'export'),attempt);
   if(output.status!=='EXPORTED'||output.reviewHash!==reviewHash||output.modelHash!==preview.modelHash||!Array.isArray(output.artifacts)||!output.artifacts.length||output.artifacts.some(a=>!plain(a)||!populated(a.name)||!sha(a.sha256)))return block('EXPORT_NOT_VERIFIED',stage,events);
   return {status:'DELIVERED_BY_CONFIGURED_ADAPTERS',stage,reviewHash,events,artifacts:output.artifacts,finalDelivery:true};
  }
  return block('ATTEMPT_LIMIT',stage,events);
 }catch{return block('ADAPTER_ERROR',stage,events);}
}
