---
name: Vercel API deployment
description: Constraints for deploying the MongoDB Express API alongside the Vite SPA on Vercel.
---

Vercel does not inherit Replit environment secrets. A Vercel deployment of this workspace must define `MONGODB_URI` and `SESSION_SECRET` in its Production environment.

**Why:** The frontend can deploy successfully while `/api/*` fails if the API function is absent or its server-side environment is empty.

**How to apply:** Keep the root-level Vercel function wrapper in JavaScript and generate its Express bundle during the Vercel build. Do not import the workspace TypeScript API source directly into the function because Vercel may apply Node16/NodeNext extension and type rules that differ from the workspace compiler.

The Vercel esbuild entry also needs to resolve relative `.js` imports to matching `.ts` source files. This supports Node-style TypeScript imports such as `./routes.js` during bundling.

Vercel's `functions.<function>.includeFiles` schema expects a single glob string, not an array.

Route all API traffic through one fixed Vercel function and rewrite the original path into a reserved query parameter for Express to restore. Do not rely on route-family `[...path]` files for deeply nested endpoints.

**Why:** Production checks showed route-family catch-alls returned Vercel 404s for deeper profile and admin-login paths even while shallow endpoints worked.

**How to apply:** Keep a single static dispatcher under `api/`, rewrite `/api/:path*` to it, restore `/api/<original path>` before calling Express, and include the generated Express bundle in that function.

User documents stored in MongoDB can contain authentication fields even when legacy client types call the field `password`; every user response must pass through a server-side public projection that removes both `password` and `password_hash`.

Vercel treats these `.js` API route files as CommonJS in this workspace. They must dynamically import the shared ESM handler rather than statically re-exporting an `.mjs` module.

The chat API must disable browser caching and ETags; conditional `304` responses are not usable by the lightweight client because it has no response-body cache, and they make conversations appear empty.

MongoDB chat timestamps may exist as ISO strings as well as native Date values. API expiry queries and cleanup must handle both representations or confirmed messages disappear on the next poll.