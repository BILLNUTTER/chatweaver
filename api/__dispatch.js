const routeQueryParam = "__whatschat_api_route";
let handlerPromise;

module.exports = async function handler(req, res) {
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const requestUrl = new URL(req.url || "/", `https://${host || "vercel.invalid"}`);
  const route = requestUrl.searchParams.get(routeQueryParam);

  if (route === null) {
    res.statusCode = 404;
    res.end();
    return;
  }

  const segments = route.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some(segment => segment === "." || segment === "..")
  ) {
    res.statusCode = 400;
    res.end();
    return;
  }

  requestUrl.searchParams.delete(routeQueryParam);
  const originalQuery = requestUrl.searchParams.toString();
  req.url = `/api/${segments.map(segment => encodeURIComponent(segment)).join("/")}${originalQuery ? `?${originalQuery}` : ""}`;

  handlerPromise ??= import("../vercel-handler.mjs").then(({ default: handler }) => handler);
  return handlerPromise.then(handler => handler(req, res));
};
