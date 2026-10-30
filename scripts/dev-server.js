/* Локальный статический сервер для разработки: отдаёт проект с корня репозитория
   и запрещает выход за его пределы. Запуск: npm start */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function resolveFile(url) {
  const pathname = decodeURIComponent(url.split("?")[0]);
  const target = path.normalize(
    path.join(root, pathname === "/" ? "index.html" : pathname),
  );
  return target.startsWith(root) ? target : null;
}

http
  .createServer((req, res) => {
    const file = resolveFile(req.url);

    if (!file) {
      res.writeHead(403).end("forbidden");
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(port, () => {
    console.log(`Караоке: http://localhost:${port}`);
  });
