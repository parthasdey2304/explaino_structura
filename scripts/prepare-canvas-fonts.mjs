import { cp, mkdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const assets = JSON.parse(await readFile(path.join(root, "src/lib/canvasFontAssets.json"), "utf8"));
const source = path.join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
// Fail clearly on an incompatible font package update instead of shipping a
// preload that does not match the drawing font requested by the renderer.
await access(path.join(source, assets.defaultFont));
const destination = path.join(root, "public", assets.basePath.replace(/^\/+|\/+$/g, ""));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
