// Mandatory, fail-closed CAD source gate. A trusted installed adapter
// must independently verify source bytes, units, geometry and code references.
// Never accept an audit supplied by an untrusted LLM, document or MCP result.
const SHA = /^[a-f0-9]{64}$/;
const isObject = o => o && typeof o === 'object' && !Array.isArray(o);
export const SOURCE_GATES = ['G01_SOURCE','G02_UNITS','G03_SPRINKLER_PROVENANCE','G04_NEIGHBOR_SPACING','G05_WALL_CLASSIFICATION','G06_OPENINGS','G07_SBC_NFPA_REFERENCES'];
export const RELEASE_GATES = ['G08_DRAWING_EXPORT','G09_AUTOCAD_OPEN','G10_ENGINEER_APPROVAL'];
export function assessSourceAudit(audit, job) {
 if (!isObject(audit) || audit.status !== 'VERIFIED' || !SHA.test(audit.sourceHash ?? '') || audit.sourceHash !== job.inputHash) return {ok:false,code:'SOURCE_HASH_NOT_VERIFIED'};
 if (!Array.isArray(audit.checkedSourceIds) || !Array.isArray(job.sources) || job.sources.some(s=>!audit.checkedSourceIds.includes(s.id))) return {ok:false,code:'SOURCE_SET_NOT_VERIFIED'};
 if (!isObject(audit.gates)) return {ok:false,code:'GATE_EVIDENCE_MISSING'};
 for (const key of SOURCE_GATES) if(audit.gates[key]!=='PASS') return {ok:false,code:key+'_NOT_PASSED'};
 return {ok:true};
}
export function assessReleaseAudit(audit, job, preview, reviewHash, output) {
 if (!isObject(audit) || audit.status !== 'VERIFIED' || audit.sourceHash !== job.inputHash || audit.modelHash !== preview.modelHash || audit.reviewHash !== reviewHash) return {ok:false,code:'RELEASE_HASHES_NOT_VERIFIED'};
 if (!isObject(audit.gates)) return {ok:false,code:'RELEASE_GATES_MISSING'};
 for(const key of [...SOURCE_GATES,...RELEASE_GATES])if(audit.gates[key]!=='PASS')return {ok:false,code:key+'_NOT_PASSED'};
 if (!Array.isArray(audit.checkedArtifacts) || !Array.isArray(output.artifacts) || output.artifacts.some(a=>!audit.checkedArtifacts.some(c=>c.name===a.name&&c.sha256===a.sha256)))return {ok:false,code:'EXPORTED_ARTIFACTS_NOT_VERIFIED'};
 return {ok:true};
}
