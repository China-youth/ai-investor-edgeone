// <stdin>
var { pathToFileURL } = require("url");
var path = require("path");
var serverPath = path.join(process.cwd(), ".edgeone/agent-node/index.mjs");
var serverUrl = pathToFileURL(serverPath).href;
exports.startServer = async () => {
  try {
    const { server } = await import(serverUrl + "?update=" + Date.now());
    return server;
  } catch (error) {
    console.error("[agent-runtime] Failed to start dev server:", error);
    throw error;
  }
};
