const API_KEY = process.argv[2] || "AIzaSyAdlXUrZea2d-e_Wp1RW53WjFoVHQ59HHM";

const MODELS = [
  "text-embedding-004",
  "embedding-001",
  "text-embedding-005",
  "gemini-embedding-exp-03-07",
];

const VERSIONS = ["v1beta", "v1"];

async function testEmbedding(model, version) {
  const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:embedContent?key=${API_KEY}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { role: "user", parts: [{ text: "fire sprinkler requirements" }] },
      }),
    });
    const data = await response.json();
    if (response.ok && data.embedding?.values) {
      const dim = data.embedding.values.length;
      console.log(`  ✅ ${version}/${model} → ${response.status} → dim=${dim}`);
      return { ok: true, dim };
    } else {
      const err = data.error?.message || JSON.stringify(data).slice(0, 120);
      console.log(`  ❌ ${version}/${model} → ${response.status} → ${err}`);
      return { ok: false };
    }
  } catch (err) {
    console.log(`  ❌ ${version}/${model} → ERROR: ${err.message}`);
    return { ok: false };
  }
}

console.log("=== Testing Gemini Embedding Models ===\n");
for (const version of VERSIONS) {
  for (const model of MODELS) {
    await testEmbedding(model, version);
  }
}
