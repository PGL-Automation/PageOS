"use strict";
const esbuild = require("esbuild");
const path = require("path");
esbuild.build({
  entryPoints: [path.join(__dirname, "..", "web", "src", "app.jsx")],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: "iife",
  target: ["es2018"],
  loader: { ".js": "jsx", ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: path.join(__dirname, "..", "web", "dist", "app.js"),
}).then(() => console.log("web build ok")).catch((e) => { console.error(e); process.exit(1); });
