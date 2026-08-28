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
      const payload = { error: "API server failed to initialize." };
      if (typeof res.status === "function" && typeof res.json === "function") {
        res.status(500).json(payload);
      } else {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      }
    }
  }
}