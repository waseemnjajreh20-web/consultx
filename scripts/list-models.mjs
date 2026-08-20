const API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.argv[2];

if (!API_KEY) {
  console.error("Missing API key. Set GOOGLE_GEMINI_API_KEY or pass it as the first argument.");
  process.exit(1);
}

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
const data = await res.json();
if (data.models) {
  data.models
    .filter(m => m.name.includes("gemini"))
    .forEach(m => console.log(m.name, "|", (m.supportedGenerationMethods||[]).join(",")));
} else {
  console.log(JSON.stringify(data, null, 2));
}
