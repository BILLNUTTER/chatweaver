---
name: Vercel API deployment
description: Constraints for deploying the MongoDB Express API alongside the Vite SPA on Vercel.
---

Vercel does not inherit Replit environment secrets. A Vercel deployment of this workspace must define `MONGODB_URI` and `SESSION_SECRET` in its Production environment.

**Why:** The frontend can deploy successfully while `/api/*` fails if the API function is absent or its server-side environment is empty.

**How to apply:** Keep the root-level Vercel function wrapper in JavaScript and generate its Express bundle during the Vercel build. Do not import the workspace TypeScript API source directly into the function because Vercel may apply Node16/NodeNext extension and type rules that differ from the workspace compiler.

The Vercel esbuild entry also needs to resolve relative `.js` imports to matching `.ts` source files. This supports Node-style TypeScript imports such as `./routes.js` during bundling.

Vercel's `functions.<function>.includeFiles` schema expects a single glob string, not an array.

Vercel may route a root catch-all only for one API path segment in this workspace. Authentication and resource-ID routes should have explicit dynamic function entrypoints under their route family.

User documents stored in MongoDB can contain authentication fields even when legacy client types call the field `password`; every user response must pass through a server-side public projection that removes both `password` and `password_hash`.