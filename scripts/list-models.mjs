// Security: read from env. The previously hardcoded key is removed; rotate it
// from the Google Cloud Console before relying on this script again.
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("ERROR: GEMINI_API_KEY environment variable is required.");
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
