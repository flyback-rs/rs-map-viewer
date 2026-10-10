import react from "@vitejs/plugin-react";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Connect, Plugin, defineConfig } from "vite";

const INCLUDE_PATTERN = /#include "([./\w_-]+)";/g;

async function resolveIncludes(file: string, deps: Set<string>): Promise<string> {
    const source = await fsp.readFile(file, "utf8");
    const includes = new Map<string, string>();
    for (const [, includePath] of source.matchAll(INCLUDE_PATTERN)) {
        const resolved = path.resolve(path.dirname(file), includePath);
        deps.add(resolved);
        includes.set(includePath, await resolveIncludes(resolved, deps));
    }
    return source.replace(INCLUDE_PATTERN, (_, includePath) => includes.get(includePath)!);
}

// Imports .glsl files as strings, inlining `#include "path";` directives
function glsl(): Plugin {
    return {
        name: "glsl",
        enforce: "pre",
        async load(id) {
            if (!id.endsWith(".glsl")) {
                return null;
            }
            const deps = new Set<string>();
            const source = await resolveIncludes(id, deps);
            for (const dep of deps) {
                this.addWatchFile(dep);
            }
            return `export default ${JSON.stringify(source)};`;
        },
    };
}

// Minifies JSON files emitted as assets (imported with ?url)
function minifyJsonAssets(): Plugin {
    return {
        name: "minify-json-assets",
        apply: "build",
        generateBundle(_, bundle) {
            for (const asset of Object.values(bundle)) {
                if (asset.type === "asset" && asset.fileName.endsWith(".json")) {
                    const source =
                        typeof asset.source === "string"
                            ? asset.source
                            : new TextDecoder().decode(asset.source);
                    asset.source = JSON.stringify(JSON.parse(source));
                }
            }
        },
    };
}

// @foxglove/wasm-bz2 locates its .wasm with a webpack-style require() of the asset URL
const WASM_BZ2_MODULE = /@foxglove[\\/]wasm-bz2[\\/]wasm[\\/]module\.js$/;

function rewriteWasmBz2Require(code: string, id: string): string | null {
    if (!WASM_BZ2_MODULE.test(id)) {
        return null;
    }
    return code.replace(
        'require("./module.wasm")',
        'new URL("./module.wasm", import.meta.url).href',
    );
}

function wasmBz2(): Plugin {
    return {
        name: "wasm-bz2",
        enforce: "pre",
        transform: rewriteWasmBz2Require,
    };
}

// Serves the locally downloaded caches (yarn download-caches) at /caches in dev and preview
function serveCaches(): Plugin {
    const cachesDir = path.resolve("caches");
    const handler: Connect.NextHandleFunction = (
        req: IncomingMessage,
        res: ServerResponse,
        next: Connect.NextFunction,
    ) => {
        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const filePath = path.join(cachesDir, urlPath);
        if (!filePath.startsWith(cachesDir + path.sep)) {
            return next();
        }
        fs.stat(filePath, (err, stat) => {
            if (err || !stat.isFile()) {
                return next();
            }
            res.setHeader(
                "Content-Type",
                filePath.endsWith(".json") ? "application/json" : "application/octet-stream",
            );
            res.setHeader("Content-Length", stat.size);
            fs.createReadStream(filePath).pipe(res);
        });
    };
    return {
        name: "serve-caches",
        configureServer(server) {
            server.middlewares.use("/caches", handler);
        },
        configurePreviewServer(server) {
            server.middlewares.use("/caches", handler);
        },
    };
}

const crossOriginIsolationHeaders = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
    plugins: [react(), glsl(), minifyJsonAssets(), wasmBz2(), serveCaches()],
    optimizeDeps: {
        rolldownOptions: {
            plugins: [{ name: "wasm-bz2", transform: rewriteWasmBz2Require }],
        },
    },
    server: {
        port: 3000,
        headers: crossOriginIsolationHeaders,
    },
    preview: {
        port: 3000,
        headers: crossOriginIsolationHeaders,
    },
    worker: {
        format: "es",
        plugins: () => [glsl(), wasmBz2()],
    },
    build: {
        outDir: "build",
        assetsInlineLimit: (file) => (file.endsWith(".json") ? false : undefined),
    },
});
