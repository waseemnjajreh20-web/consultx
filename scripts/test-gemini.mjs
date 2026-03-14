const API_KEY = "AIzaSyAdlXUrZea2d-e_Wp1RW53WjFoVHQ59HHM";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
];

async function testModel(model) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say hello in one word" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );
    const data = await response.json();
    if (response.ok) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "(empty)";
      console.log(`  ✅ ${model} → ${response.status} → "${text.trim()}"`);
      return true;
    } else {
      const errorMsg = data.error?.message || JSON.stringify(data);
      console.log(`  ❌ ${model} → ${response.status} → ${errorMsg.slice(0, 150)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ ${model} → ERROR: ${err.message}`);
    return false;
  }
}

console.log("=== Testing Stable Gemini Models ===\n");
for (const m of MODELS) await testModel(m);
