/**
 * Production server for Snow Connects.
 *
 * Serves the React Native Web build at /, and keeps Expo Go manifest
 * endpoints alive for mobile clients that scan the QR code at /expo-go.
 *
 * Routes:
 *   GET / (or any web route) → web SPA (static-build/web/index.html)
 *   GET /expo-go              → Expo Go QR landing page
 *   GET /manifest with expo-platform header → ios/android manifest JSON
 *   Static assets fall through to static-build/web/ then static-build/<platform>/
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const WEB_ROOT = path.join(STATIC_ROOT, "web");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "Snow Connects";
  } catch {
    return "Snow Connects";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    res.writeHead(404);
    res.end("Expo Go landing page template not found");
    return;
  }
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;

  const html = template
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, host)
    .replace(/APP_NAME_PLACEHOLDER/g, getAppName());

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function tryServeFile(absPath, res) {
  if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
    return false;
  }
  const ext = path.extname(absPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(absPath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
  return true;
}

function serveWebStaticOrIndex(pathname, res) {
  const safe = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const target = path.join(WEB_ROOT, safe === "/" ? "" : safe);
  if (target.startsWith(WEB_ROOT) && tryServeFile(target, res)) {
    return;
  }
  const indexPath = path.join(WEB_ROOT, "index.html");
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  const platform = req.headers["expo-platform"];
  if ((pathname === "/" || pathname === "/manifest") && (platform === "ios" || platform === "android")) {
    return serveManifest(platform, res);
  }

  if (pathname === "/expo-go" || pathname === "/expo-go/") {
    return serveLandingPage(req, res);
  }

  return serveWebStaticOrIndex(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Snow Connects on port ${port}`);
});
