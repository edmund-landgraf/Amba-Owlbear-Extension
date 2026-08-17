import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";

const tokenDir = join(process.cwd(), ".amba-generated-tokens");
mkdirSync(tokenDir, { recursive: true });

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = new Set(["https://www.owlbear.rodeo", "https://owlbear.rodeo"]);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
}

export default defineConfig({
  plugins: [
    {
      name: "owlbear-local-private-network",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          corsHeaders(req, res);
          if (req.method === "OPTIONS" && req.headers["access-control-request-private-network"]) {
            res.statusCode = 204;
            res.end();
            return;
          }
          next();
        });
      },
    },
    {
      name: "amba-generated-tokens",
      configureServer(server) {
        server.middlewares.use("/amba-generated-tokens", (req, res) => {
          corsHeaders(req, res);

          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method === "POST") {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => {
              const id = randomUUID();
              const contentType = String(req.headers["content-type"] ?? "image/png").toLowerCase();
              const extension = contentType.includes("svg") ? "svg" : "png";
              writeFileSync(join(tokenDir, `${id}.${extension}`), Buffer.concat(chunks));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ id, url: `/amba-generated-tokens/${id}.${extension}` }));
            });
            return;
          }

          if (req.method === "GET" || req.method === "HEAD") {
            const match = String(req.url ?? "").match(/^\/([a-f0-9-]+)\.(png|svg)(?:\?.*)?$/i);
            if (!match) {
              res.statusCode = 404;
              res.end();
              return;
            }
            const [, id, extension] = match;
            const path = join(tokenDir, `${id}.${extension.toLowerCase()}`);
            try {
              const file = readFileSync(path);
              res.setHeader("Content-Type", extension.toLowerCase() === "svg" ? "image/svg+xml" : "image/png");
              res.setHeader("Cache-Control", "no-store");
              res.statusCode = 200;
              if (req.method === "HEAD") {
                res.setHeader("Content-Length", String(file.length));
                res.end();
                return;
              }
              res.end(file);
            } catch {
              res.statusCode = 404;
              res.end();
            }
            return;
          }

          res.statusCode = 405;
          res.end();
        });
      },
    },
  ],
  server: {
    port: 5196,
    allowedHosts: true,
    headers: {
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "/api": {
        target: "http://localhost:5190",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:5190",
        changeOrigin: true,
      },
    },
    cors: false,
  },
});
