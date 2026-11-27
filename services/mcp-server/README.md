# ConsultX MCP Bridge v0.1.0

Local stdio MCP bridge for Node.js 20+. No runtime dependencies. Minimal wire implementation, not the official SDK. This is not a deployed remote MCP endpoint.

## Implemented tools

- `consultx_connection_status`: checks Supabase Auth user session (not the engineering endpoint).
- `consultx_consult`: sends a question in Arabic or English, standard or analysis mode.
- `consultx_analyze_drawing`: submits prepared PNG/JPEG/WebP data URLs or extracted drawing text in analysis mode. Does not parse CAD/PDF files, certify compliance, or generate geometry.

The bridge invokes the existing `fire-safety-chat` Edge Function with the user's session and publishable/anon key. It preserves existing backend authorization, entitlements, and quotas. Returned citations and source metadata are backend-reported; engineer review is required.

## Run

Requires a trusted HTTPS Supabase project origin, a publishable/anon key and a valid short-lived user access token. Set these through your MCP client's secure environment mechanism:

- CONSULTX_SUPABASE_URL
- CONSULTX_SUPABASE_KEY
- CONSULTX_ACCESS_TOKEN

Set the client command to `node` and its args to the absolute path to `server.mjs`. Never use service-role keys, commit tokens, or paste credentials into chat. Windows setup scripts in this directory use user-scoped DPAPI to encrypt the local session. The scripts have not been tested on Windows; if password authentication is disabled or MFA is required, use the approved login flow and the direct environment configuration. Restart the client to refresh an expired session.

## Tests

Run `npm test` in this directory. Tests exercise the actual stdio process and mocked backend requests; no live credentials or project data are needed. A valid session check does not establish live engineering endpoint availability.

## Scope and next steps

The current implementation supports initialization, ping, tool discovery and tool calls over local stdio. It is sequential and does not support in-flight cancellation, remote Streamable HTTP/OAuth, resources or prompts. Production remote integration requires authenticated per-user and per-tenant authorization, token lifecycle, bounded job orchestration, auditing and end-to-end tests. An outbound MCP connection registry, client and licensed CAD/BIM adapters are planned separately; they are not implemented here.

Keep engineering intellectual property, copyrighted standards, customer projects and secrets outside this public integration layer. Repository visibility is independent of MCP transport and authentication.
