import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "owlbear-local-private-network",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const origin = req.headers.origin;
          const allowedOrigins = new Set([
            "https://www.owlbear.rodeo",
            "https://owlbear.rodeo",
          ]);

          if (origin && allowedOrigins.has(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
          }
          res.setHeader("Access-Control-Allow-Private-Network", "true");

          if (
            req.method === "OPTIONS" &&
            req.headers["access-control-request-private-network"]
          ) {
            res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
            res.statusCode = 204;
            res.end();
            return;
          }

          next();
        });
      },
    },
  ],
  server: {
    headers: {
      "Access-Control-Allow-Private-Network": "true",
    },
    proxy: {
      "/api": {
        target: "http://localhost:5190",
        changeOrigin: true,
      },
    },
    cors: false,
  },
});
