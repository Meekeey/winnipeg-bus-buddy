// Builds a single HTML file of the app in DEMO mode (made-up arrival times,
// no API key, no server). Handy for showing the app to someone quickly.
//   npm run demo  ->  demo-dist/bus-buddy-demo.html
//
// React and Leaflet load from a CDN; everything else is inlined.

import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

// Map bare imports to the globals that the CDN scripts define.
const globalsPlugin = {
  name: "cdn-globals",
  setup(buildApi) {
    const shims = {
      react: "module.exports = window.React;",
      "react-dom/client": "module.exports = window.ReactDOM;",
      leaflet: "module.exports = window.L;",
      "react/jsx-runtime": `
        const R = window.React;
        function jsx(type, props, key) {
          const { children, ...rest } = props || {};
          if (key !== undefined) rest.key = key;
          if (children === undefined) return R.createElement(type, rest);
          if (Array.isArray(children)) return R.createElement(type, rest, ...children);
          return R.createElement(type, rest, children);
        }
        module.exports = { jsx, jsxs: jsx, Fragment: R.Fragment };`,
    };
    buildApi.onResolve({ filter: /^(react|react-dom\/client|leaflet|react\/jsx-runtime)$/ }, (args) => ({
      path: args.path,
      namespace: "cdn-global",
    }));
    buildApi.onLoad({ filter: /.*/, namespace: "cdn-global" }, (args) => ({
      contents: shims[args.path],
      loader: "js",
    }));
  },
};

const result = await build({
  entryPoints: [path.join(root, "demo/entry.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  define: { "process.env.NEXT_PUBLIC_DEMO": '"1"', "process.env.NODE_ENV": '"production"' },
  plugins: [globalsPlugin],
});
const appScript = result.outputFiles[0].text;

// Styles: Leaflet's CSS (without its image files) plus our own.
let leafletCss = await readFile(path.join(root, "node_modules/leaflet/dist/leaflet.css"), "utf8");
leafletCss = leafletCss.replace(/background-image:\s*url\([^)]*\);?/g, "");
const appCss = await readFile(path.join(root, "app/globals.css"), "utf8");

// Data: all the GTFS JSON in one object.
const dataDir = path.join(root, "public/data");
const readJson = async (file) => JSON.parse(await readFile(path.join(dataDir, file), "utf8"));
const shapes = {};
for (const file of await readdir(path.join(dataDir, "shapes"))) {
  const shape = await readJson(path.join("shapes", file));
  shapes[shape.id] = shape;
}
const data = {
  stops: await readJson("stops.json"),
  routes: await readJson("routes.json"),
  stopRoutes: await readJson("stop-routes.json"),
  shapes,
};

const safe = (text) => text.replace(/<\/script/gi, "<\\/script");
const html = `<title>Bus Buddy</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800&family=Pixelify+Sans:wght@500;700&family=Jersey+15&display=swap">
<style>${leafletCss}</style>
<style>${appCss}</style>
<div id="bus-buddy-root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.__BUS_BUDDY_DATA__ = ${safe(JSON.stringify(data))};</script>
<script>${safe(appScript)}</script>
`;

await mkdir(path.join(root, "demo-dist"), { recursive: true });
const outFile = path.join(root, "demo-dist/bus-buddy-demo.html");
await writeFile(outFile, html);
console.log(`Demo written to ${outFile} (${Math.round(html.length / 1024)} KB)`);
