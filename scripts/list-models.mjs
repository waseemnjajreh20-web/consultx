const API_KEY = "AIzaSyAdlXUrZea2d-e_Wp1RW53WjFoVHQ59HHM";
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
const data = await res.json();
if (data.models) {
  data.models
    .filter(m => m.name.includes("gemini"))
    .forEach(m => console.log(m.name, "|", (m.supportedGenerationMethods||[]).join(",")));
} else {
  console.log(JSON.stringify(data, null, 2));
}
