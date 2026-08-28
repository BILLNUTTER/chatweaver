let appPromise;

function loadApp() {
  appPromise ??= import("./artifacts/api-server/dist/vercel/app.mjs").then(
    ({ default: app }) => app,
  );
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await loadApp();
    return await app(req, res);
  } catch (error) {
    console.error("API serverless function failed", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "API server failed to initialize." });
    }
  }
}