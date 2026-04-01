import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

const GEMINI_MODEL = "google/gemini-2.5-flash";
const BATCH_SIZE = 1; // 1 chunk per LLM call — prevents JSON truncation
const MAX_CHUNKS_PER_CALL = 6; // max chunks to process per invocation

// ==================== ENTITY EXTRACTION PROMPT ====================
const EXTRACTION_PROMPT = `You are a Knowledge Graph builder for Saudi Building Codes (SBC 201 and SBC 801).

Analyze the following text chunks from Saudi building/fire codes and extract:

1. **ENTITIES** (nodes): Named concepts, sections, requirements, components
   - Types: "section", "requirement", "component", "concept", "standard"
   - Examples: "Fire Door", "Section 903.2", "Sprinkler System", "Exit Width"

2. **RELATIONSHIPS** (edges): How entities relate to each other
   - Types: "references", "requires", "conflicts", "enables", "modifies", "exempts"
   - Examples: Section A "requires" Component B, Standard X "references" Section Y

Return ONLY valid JSON in this exact format:
{
  "entities": [
    {
      "name": "string (concise, 1-5 words)",
      "type": "section|requirement|component|concept|standard",
      "description": "string (1-2 sentences max)",
      "chapter": number or null,
      "page_ref": "string or null",
      "keywords": ["keyword1", "keyword2"]
    }
  ],
  "relationships": [
    {
      "source": "entity name",
      "target": "entity name",
      "type": "references|requires|conflicts|enables|modifies|exempts",
      "description": "string (brief)"
    }
  ]
}

Rules:
- Extract 3-8 entities per batch (keep output small to prevent JSON truncation)
- Only extract entities explicitly mentioned in the text
- relationships must reference entity names from the entities list above
- Be precise with section numbers (e.g., "Section 903.2.1.1")`;

// ==================== COMMUNITY DETECTION PROMPT ====================
function getCommunityPrompt(nodes: any[], level: number): string {
  const nodeList = nodes.map(n => `- ${n.name} (${n.type}): ${n.description || ""}`).join("\n");
  const levelLabel = level === 0 ? "micro (specific topic)" : level === 1 ? "mid-level (chapter topic)" : "macro (major theme)";
  
  return `You are summarizing a community of related Saudi Building Code concepts at the ${levelLabel} level.

These nodes are interconnected:
${nodeList}

Write a comprehensive summary (3-5 sentences) that:
1. Identifies the central theme of this community
2. Explains how the concepts relate to each other
3. Notes which SBC documents (SBC 201 / SBC 801) are involved
4. Highlights any key requirements or cross-references

Also provide an Arabic translation of the summary.

Return ONLY valid JSON:
{
  "summary": "English summary here",
  "summary_ar": "Arabic summary here",
  "topic_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;
}

// ==================== LLM CALL (with retry + exponential backoff for 503) ====================
async function callGemini(prompt: string, content: string, retries = 3): Promise<any> {
  const apiKey = Deno.env.get("Gemini_API_Key1");
  if (!apiKey) throw new Error("Gemini_API_Key1 not configured");

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(300_000), // 300s — prevents Supabase gateway killing mid-generation
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\n\n--- TEXT CHUNKS ---\n${content}` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 65536, // Increased to prevent JSON truncation
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (response.status === 503 || response.status === 429) {
      const backoff = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
      console.warn(`⚠️ Gemini ${response.status} (attempt ${attempt + 1}/${retries}), retrying in ${backoff}ms...`);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    try {
      return JSON.parse(text);
    } catch {
      // Attempt 1: extract full JSON object
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch { /* continue */ }
      }
      // Attempt 2: Partial JSON recovery — extract entities array even if relationships are truncated
      const partialEntities = text.match(/"entities"\s*:\s*\[[\s\S]*?\]/);
      if (partialEntities) {
        try {
          const partial = JSON.parse(`{${partialEntities[0]},"relationships":[]}`);
          console.warn("⚠️ Partial JSON recovered: entities only (relationships truncated)");
          return partial;
        } catch { /* continue */ }
      }
      console.error("❌ Could not recover JSON from truncated response. Raw text:", text.slice(0, 500));
      throw new Error("Failed to parse LLM response as JSON after recovery attempts");
    }
  }

  throw new Error(`Gemini API unavailable after ${retries} retries`);
}

// ==================== PROCESS ONE FILE ====================
async function processFile(
  supabase: any,
  fileName: string,
  sbcSource: string,
  pageRange: string,
  startChunk: number = 0
): Promise<{ nodesCount: number; edgesCount: number; partial: boolean; nextChunk: number }> {
  console.log(`📄 Processing: ${fileName} (startChunk=${startChunk})`);
  
  // Mark as processing
  await supabase.from("graph_indexing_status").upsert({
    file_name: fileName,
    sbc_source: sbcSource,
    page_range: pageRange,
    status: "processing",
    last_processed_chunk: startChunk,
  });

  // Download file from bucket
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("ssss")
    .download(fileName);

  if (downloadError || !fileData) {
    await supabase.from("graph_indexing_status").update({
      status: "failed",
      error_message: downloadError?.message || "Download failed",
    }).eq("file_name", fileName);
    return { nodesCount: 0, edgesCount: 0 };
  }

  const fileText = await fileData.text();
  let chunks: any[] = [];
  
  try {
    chunks = JSON.parse(fileText);
    if (!Array.isArray(chunks)) chunks = [chunks];
  } catch {
    await supabase.from("graph_indexing_status").update({
      status: "failed",
      error_message: "Invalid JSON format",
    }).eq("file_name", fileName);
    return { nodesCount: 0, edgesCount: 0 };
  }

  console.log(`  📊 ${chunks.length} chunks found, starting from chunk ${startChunk}`);

  // Process in batches with checkpoint support
  let totalNodes = 0;
  let totalEdges = 0;
  const nodeNameToId: Map<string, string> = new Map();
  let processedChunks = 0;

  const chunksToProcess = chunks.slice(startChunk, startChunk + MAX_CHUNKS_PER_CALL);

  for (let i = 0; i < chunksToProcess.length; i += BATCH_SIZE) {
    const batch = chunksToProcess.slice(i, i + BATCH_SIZE);
    const batchText = batch.map((c: any) => {
      if (typeof c === "string") return c;
      return c.text || c.content || c.chunk || JSON.stringify(c);
    }).join("\n\n---\n\n");

    try {
      const extracted = await callGemini(EXTRACTION_PROMPT, batchText.slice(0, 6000)); // 6000 chars keeps output well under 65536 tokens
      
      // Insert entities (nodes)
      if (extracted.entities?.length > 0) {
        const nodesToInsert = extracted.entities.map((e: any) => ({
          name: e.name?.slice(0, 200) || "Unknown",
          type: e.type || "concept",
          description: e.description?.slice(0, 1000),
          sbc_source: sbcSource,
          page_range: pageRange,
          chapter: e.chapter || null,
          keywords: Array.isArray(e.keywords) ? e.keywords.slice(0, 20) : [],
        }));

        const { data: insertedNodes } = await supabase
          .from("graph_nodes")
          .insert(nodesToInsert)
          .select("id, name");

        if (insertedNodes) {
          for (const node of insertedNodes) {
            nodeNameToId.set(node.name.toLowerCase(), node.id);
          }
          totalNodes += insertedNodes.length;
        }
      }

      // Insert relationships (edges)
      if (extracted.relationships?.length > 0) {
        const edgesToInsert = [];
        
        for (const rel of extracted.relationships) {
          const sourceId = nodeNameToId.get(rel.source?.toLowerCase());
          const targetId = nodeNameToId.get(rel.target?.toLowerCase());
          
          if (sourceId && targetId && sourceId !== targetId) {
            edgesToInsert.push({
              source_id: sourceId,
              target_id: targetId,
              relationship_type: rel.type || "references",
              description: rel.description?.slice(0, 500),
              weight: 1.0,
            });
          }
        }

        if (edgesToInsert.length > 0) {
          const { data: insertedEdges } = await supabase
            .from("graph_edges")
            .insert(edgesToInsert)
            .select("id");
          
          totalEdges += insertedEdges?.length || 0;
        }
      }

      processedChunks += batch.length;
      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: +${extracted.entities?.length || 0} nodes, +${extracted.relationships?.length || 0} edges`);

      // 3s delay between extraction calls — prevents ECONNRESET and DB throttling
      await new Promise(r => setTimeout(r, 3_000));
      
    } catch (batchError) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchError);
      // Continue with next batch
    }
  }

  const nextChunk = startChunk + processedChunks;
  const isComplete = nextChunk >= chunks.length;

  // Update status with checkpoint
  await supabase.from("graph_indexing_status").update({
    status: isComplete ? "done" : "partial",
    last_processed_chunk: nextChunk,
    nodes_extracted: totalNodes,
    edges_extracted: totalEdges,
    processed_at: isComplete ? new Date().toISOString() : null,
  }).eq("file_name", fileName);

  console.log(`  ${isComplete ? "✅ Done" : "⏸️ Partial"}: ${totalNodes} nodes, ${totalEdges} edges | chunk ${nextChunk}/${chunks.length}`);
  return { nodesCount: totalNodes, edgesCount: totalEdges, partial: !isComplete, nextChunk };
}

// ==================== COMMUNITY DETECTION (batched, paginated) ====================
// Processes `limit` groups starting from `offset`.
// offset === 0 → wipes existing summaries first (full rebuild).
// offset  > 0 → appends (resume mid-run without re-wiping earlier groups).
// Returns { done, total_groups, next_offset, communities_built } for orchestrator loop.
async function buildCommunitiesBatched(
  supabase: any,
  offset: number,
  limit: number,
): Promise<{ done: boolean; total_groups: number; next_offset: number; communities_built: number }> {
  console.log(`🔗 Building communities (offset=${offset}, limit=${limit})...`);

  // Fetch all nodes — deterministic sort so flat index is stable across calls
  const { data: allNodes } = await supabase
    .from("graph_nodes")
    .select("id, name, type, description, sbc_source, chapter, keywords")
    .order("sbc_source", { ascending: true })
    .order("chapter",    { ascending: true });

  if (!allNodes?.length) {
    console.log("No nodes found for community detection");
    return { done: true, total_groups: 0, next_offset: 0, communities_built: 0 };
  }

  // Build deterministically ordered flat group list
  type GroupEntry = { level: number; key: string; nodes: any[] };

  const chapterMap = new Map<string, any[]>();
  const sourceMap  = new Map<string, any[]>();
  for (const node of allNodes) {
    const ck = `${node.sbc_source}_ch${node.chapter ?? 0}`;
    if (!chapterMap.has(ck)) chapterMap.set(ck, []);
    chapterMap.get(ck)!.push(node);
    if (!sourceMap.has(node.sbc_source)) sourceMap.set(node.sbc_source, []);
    sourceMap.get(node.sbc_source)!.push(node);
  }

  const allGroups: GroupEntry[] = [];
  for (const [k, v] of [...chapterMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (v.length >= 2) allGroups.push({ level: 0, key: k, nodes: v });
  }
  for (const [k, v] of [...sourceMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (v.length >= 2) allGroups.push({ level: 1, key: k, nodes: v });
  }
  if (allNodes.length >= 2) allGroups.push({ level: 2, key: "all", nodes: allNodes });

  const total_groups = allGroups.length;

  // Full rebuild: wipe existing summaries only on offset === 0
  if (offset === 0) {
    await supabase.from("community_summaries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    console.log("  🗑️  Cleared existing community_summaries");
  }

  const batchSlice = allGroups.slice(offset, offset + limit);
  let built = 0;

  for (const { level, key, nodes } of batchSlice) {
    const sample = nodes.slice(0, 30);
    try {
      const summary = await callGemini(getCommunityPrompt(sample, level), "");
      const sbcSources = [...new Set(nodes.map((n: any) => n.sbc_source))];

      await supabase.from("community_summaries").insert({
        level,
        community_id: offset + built,
        summary:        summary.summary || `Community ${key}`,
        summary_ar:     summary.summary_ar,
        node_ids:       nodes.map((n: any) => n.id),
        sbc_sources:    sbcSources,
        topic_keywords: summary.topic_keywords || [],
      });

      built++;
      console.log(`  ✅ Community L${level} [${key}]: ${nodes.length} nodes`);
    } catch (err) {
      console.error(`  ❌ Community ${key} failed:`, err);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const next_offset = offset + batchSlice.length;
  const done = next_offset >= total_groups;
  console.log(`✅ Built ${built} communities (${next_offset}/${total_groups})${done ? " — DONE" : ""}`);
  return { done, total_groups, next_offset, communities_built: built };
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ===== AUTH GUARD: Admin-only endpoint =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: adminUser }, error: adminAuthError } = await userClient.auth.getUser();
    if (adminAuthError || !adminUser || !adminUser.email || !ADMIN_EMAILS.includes(adminUser.email)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { action = "index", file_filter } = body;

    // ---- ACTION: status ----
    if (action === "status") {
      const { data: status } = await supabase
        .from("graph_indexing_status")
        .select("*")
        .order("created_at", { ascending: false });
      
      const { count: nodeCount } = await supabase
        .from("graph_nodes")
        .select("*", { count: "exact", head: true });
      
      const { count: edgeCount } = await supabase
        .from("graph_edges")
        .select("*", { count: "exact", head: true });
      
      const { count: communityCount } = await supabase
        .from("community_summaries")
        .select("*", { count: "exact", head: true });

      return new Response(JSON.stringify({
        files: status,
        stats: { nodes: nodeCount, edges: edgeCount, communities: communityCount },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- ACTION: communities (batched, paginated) ----
    if (action === "communities") {
      const offset = typeof body.offset === "number" ? body.offset : 0;
      const limit  = typeof body.limit  === "number" ? body.limit  : 5;
      const result = await buildCommunitiesBatched(supabase, offset, limit);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ACTION: reset ----
    if (action === "reset") {
      await supabase.from("community_summaries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("graph_edges").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("graph_nodes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("graph_indexing_status").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(JSON.stringify({ success: true, message: "All graph data cleared" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ACTION: index (default) ----
    // List files from bucket
    const { data: files, error: listError } = await supabase.storage
      .from("ssss")
      .list("", { limit: 100 });

    if (listError || !files?.length) {
      return new Response(JSON.stringify({ error: "Could not list files", details: listError?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter only chunks files
    let chunkFiles = files.filter((f: any) => f.name.endsWith("_chunks.json"));
    
    if (file_filter) {
      chunkFiles = chunkFiles.filter((f: any) => f.name.includes(file_filter));
    }

    console.log(`📁 Found ${chunkFiles.length} chunk files to process`);

    // Get already-done files AND partial files (with checkpoint)
    const { data: indexedFiles } = await supabase
      .from("graph_indexing_status")
      .select("file_name, status, last_processed_chunk")
      .in("status", ["done", "partial"]);
    
    const doneSet = new Set((indexedFiles || []).filter((f: any) => f.status === "done").map((f: any) => f.file_name));
    const partialMap = new Map((indexedFiles || []).filter((f: any) => f.status === "partial").map((f: any) => [f.file_name, f.last_processed_chunk || 0]));
    
    // Pending = not done (partial files resume from checkpoint)
    const pendingFiles = chunkFiles.filter((f: any) => !doneSet.has(f.name));

    console.log(`⏳ ${pendingFiles.length} files pending (${doneSet.size} done, ${partialMap.size} partial)`);

    if (pendingFiles.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "All files already indexed",
        total: chunkFiles.length,
        done: doneSet.size,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Process 1 file per call (with checkpoint resume)
    const fileToProcess = pendingFiles[0];
    const sbcSource = fileToProcess.name.toLowerCase().includes("801") ? "SBC801" : "SBC201";
    const pageRangeMatch = fileToProcess.name.match(/(\d+-\d+)/);
    const pageRange = pageRangeMatch ? pageRangeMatch[1] : "unknown";
    const startChunk = partialMap.get(fileToProcess.name) || 0;

    const result = await processFile(supabase, fileToProcess.name, sbcSource, pageRange, startChunk);

    const remaining = pendingFiles.length - (result.partial ? 0 : 1); // if partial, same file still pending

    return new Response(JSON.stringify({
      success: true,
      processed: fileToProcess.name,
      totalNodes: result.nodesCount,
      totalEdges: result.edgesCount,
      partial: result.partial,
      nextChunk: result.nextChunk,
      remaining,
      message: result.partial
        ? `Partial: processed up to chunk ${result.nextChunk} of ${fileToProcess.name}. Call again to continue.`
        : remaining > 0
          ? `Done: ${fileToProcess.name}. Call again to process ${remaining} more files.`
          : "All files processed! Call with action='communities' to build community summaries.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fatal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
