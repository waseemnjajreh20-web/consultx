import { createEdge } from "./edge.mjs";
Deno.serve(createEdge({
  env: {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  },
}));
