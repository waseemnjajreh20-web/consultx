# ConsultX MCP Bridge v0.2.0

An integration layer for the existing ConsultX engineering platform. Node.js 20+; no npm runtime dependencies. The local bridge and HTTP transports implement the MCP subset used by this project, not the full official SDK. All engineering conclusions remain advisory until independently verified.

## Implemented components

- `gateway.mjs`: local MCP server with six tools, including discovery and calls to registered local MCP engines.
- `server.mjs`: core-only local stdio MCP server.
- `http.mjs`: authenticated loopback HTTP transport, with token-bound sessions and bounded requests.
- `core.mjs` and `edge.mjs`: shared, stateless Supabase HTTP transport. The same files are mirrored into `supabase/functions/consultx-mcp/`.
- `client.mjs`: outbound MCP client with loopback-only connections, separate credentials and per-connection tool allowlists.
- `workflow.mjs`: adapter-based engineering job controller, pinned reference hashes, exception conditions, bounded redesign and reviewed model/export binding. Does not contain the proprietary engineering rules, actual CAD extraction or calculation algorithms.

## MCP tools

| Tool | Scope |
|---|---|
| `consultx_connection_status` | Confirm the configured ConsultX user session, not live engineering endpoint availability. |
| `consultx_consult` | Send Arabic/English questions to the existing `fire-safety-chat` Edge Function. |
| `consultx_analyze_drawing` | Analyze prepared image data URLs or extracted PDF text. Does not itself extract DWG/DXF geometry. |
| `consultx_connections_list` | List registered local connections without credentials. |
| `consultx_connection_probe` | Discover allowlisted tools exposed by an enabled local server. |
| `consultx_connection_call` | Call an allowlisted tool using only that server's separate token. |

The last three tools are exposed only by the local gateway. Remote HTTP endpoints expose the first three and cannot access local CAD tools.

## Local Windows setup

Run `Setup.cmd` with Node.js 20+ installed. Enter the trusted Supabase project origin, publishable/anon key, and an existing ConsultX account. Credentials are sent only to the configured Supabase Auth endpoint. The password is not stored; user-scoped DPAPI protects saved session credentials. The installation writes a credential-free MCP client configuration under `%LOCALAPPDATA%\ConsultX\MCP`. Add its entry to your MCP client configuration without replacing other servers, then restart the client.

`Configure-DDC.cmd` connects an existing, locally running OpenConstructionDesign editor. Enable its MCP server first, then supply its dedicated token. The wizard probes the documented loopback endpoint `127.0.0.1:47621/mcp` and saves the connection only after discovering the requested tools. Reading and checking are the default; preview creation is optional. It never automatically applies changes to a live model. The DDC editor remains responsible for its Apply gate. Windows launchers are not runtime-tested in this Linux environment.

Direct launch: configure `CONSULTX_SUPABASE_URL`, `CONSULTX_SUPABASE_KEY`, and `CONSULTX_ACCESS_TOKEN` in a secure local environment, then run `npm start`. Never use an admin/service-role key or publish tokens. The session uses the caller's existing backend authorization, subscription and usage limits. The gateway is a local operator trust boundary; only trusted clients should launch it.

## HTTP and deployment

`npm run start:http` binds to loopback only (port 8787 by default). It is intended for a trusted local client or controlled HTTPS reverse proxy; do not expose plaintext HTTP to a network. The remote Supabase Edge Function is `consultx-mcp` and authenticates each request using the existing user's bearer access token. Deployment and live authentication are not verified yet. OAuth discovery, authorization UI, OAuth client registration and public agent onboarding require further integration and a production RLS audit before enabling access. No public unauthenticated server is provided.

## Engineering workflow

`runEngineeringJob(job, adapters)` executes trusted extraction, rule resolution, design, preview, validation, reviewer approval, and export adapters. It blocks missing/unresolved rule evidence, insufficient exception conditions, stale model hashes, and incomplete validation coverage. On a failed validation it retries only if the prior preview was confirmed discarded. It binds approval and export to the specific checked model. Adapter outputs are trusted software interfaces: this controller does not independently prove that an adapter's source quotation, validation or artifact hash is genuine. Production adapters must implement and independently verify these facts. Synthetic workflow tests are not evidence of actual code compliance or completed CAD automation.

## Tests and security

Run `npm test`; no dependency installation is required. Tests run real local MCP stdio and HTTP processes with mocked backend responses, plus a synthetic design workflow. No customer data, copyrighted code text, production credentials or engineering decisions are included. Actual Supabase deployment, real engineering responses, Windows setup, external DDC interoperability, OAuth, tenant/RLS and end-to-end engineering validation remain release gates. Keep the proprietary engineering brain, customer models and protected code sources separate from this public integration layer. Review third-party licenses before distributing or bundling any external engine; this project currently only implements protocol-level integration.
