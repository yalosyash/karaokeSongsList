const http = require("http");
const fs = require("fs");
const path = require("path");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const root = __dirname;

http
  .createServer((req, res) => {
    let f = decodeURIComponent(req.url.split("?")[0]);
    if (f === "/") f = "/index.html";
    const fp = path.join(root, f);
    if (!fp.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(fp, (e, d) => {
      if (e) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": types[path.extname(fp)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(d);
    });
  })
  .listen(4173, () => console.log("serving on http://localhost:4173"));
