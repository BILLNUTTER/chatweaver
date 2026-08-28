let handlerPromise;

module.exports = async function handler(req, res) {
  handlerPromise ??= import("../../vercel-handler.mjs").then(({ default: handler }) => handler);
  return handlerPromise.then((handler) => handler(req, res));
};