import { LoadedCache } from "../Caches";
import { NpcSpawn } from "../data/npc/NpcSpawn";
import { ObjSpawn } from "../data/obj/ObjSpawn";
import { MinimapData } from "./MinimapData";
import { RenderDataLoader } from "./RenderDataLoader";
import type { RenderDataWorker } from "./RenderDataWorker";
import { WorkerPool } from "./WorkerRpc";

function createWorker(): Worker {
    return new Worker(new URL("./RenderDataWorker.ts", import.meta.url), { type: "module" });
}

export class RenderDataWorkerPool {
    static create(size: number): RenderDataWorkerPool {
        return new RenderDataWorkerPool(new WorkerPool(createWorker, size), size);
    }

    constructor(
        readonly pool: WorkerPool<RenderDataWorker>,
        readonly size: number,
    ) {}

    initCache(cache: LoadedCache, objSpawns: ObjSpawn[], npcSpawns: NpcSpawn[]): void {
        this.pool.broadcast((w) => w.call("initCache", cache, objSpawns, npcSpawns));
    }

    initLoader(loader: RenderDataLoader<any, any>): Promise<void> {
        return this.pool.broadcast((w) => w.call("initDataLoader", loader.__type));
    }

    resetLoader(loader: RenderDataLoader<any, any>): Promise<void> {
        return this.pool.broadcast((w) => w.call("resetDataLoader", loader.__type));
    }

    queueLoad<I, D, Loader extends RenderDataLoader<I, D>>(loader: Loader, input: I): Promise<D> {
        return this.pool.queue((w) => w.call("load", loader.__type, input) as Promise<D>);
    }

    queueLoadTexture(
        id: number,
        size: number,
        flipH: boolean,
        brightness: number,
    ): Promise<Int32Array> {
        return this.pool.queue((w) => w.call("loadTexture", id, size, flipH, brightness));
    }

    queueMapImage(
        mapX: number,
        mapY: number,
        level: number,
        drawMapFunctions: boolean,
    ): Promise<MinimapData | undefined> {
        return this.pool.queue((w) => w.call("loadMapImage", mapX, mapY, level, drawMapFunctions));
    }

    setVars(vars: Int32Array): Promise<void> {
        return this.pool.broadcast((w) => w.call("setVars", vars));
    }

    loadCachedMapImages(): Promise<Map<number, string>> {
        return this.pool.queue((w) => w.call("loadCachedMapImages"));
    }

    exportSprites(): Promise<Blob> {
        return this.pool.queue((w) => w.call("exportSpritesToZip"));
    }

    exportTextures(): Promise<Blob> {
        return this.pool.queue((w) => w.call("exportTexturesToZip"));
    }

    terminate(): void {
        this.pool.terminate();
    }
}
