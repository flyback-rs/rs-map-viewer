import fs from "fs";
import sharp from "sharp";

import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { Bzip2 } from "../../src/rs/compression/Bzip2";
import { LocModelLoader } from "../../src/rs/config/loctype/LocModelLoader";
import { Scene } from "../../src/rs/scene/Scene";
import { LocLoadType, SceneBuilder } from "../../src/rs/scene/SceneBuilder";
import { loadCache, loadCacheInfos, loadCacheList } from "./load-util";

function saveHeightMapToPng(
    heightMap: Uint8Array,
    width: number,
    height: number,
    outputPath: string,
) {
    const rgbaPixels = new Uint8Array(heightMap.length * 4);
    for (let i = 0; i < heightMap.length; i++) {
        const height = heightMap[i];
        rgbaPixels[i * 4 + 0] = height;
        rgbaPixels[i * 4 + 1] = height;
        rgbaPixels[i * 4 + 2] = height;
        rgbaPixels[i * 4 + 3] = 0xff;
    }

    // Convert to PNG using sharp
    sharp(rgbaPixels, {
        raw: {
            width: width,
            height: height,
            channels: 4,
        },
    })
        .toFile(outputPath)
        .catch((err) => console.error(err));
}

await Bzip2.initWasm();

const caches = loadCacheInfos();
const cacheList = loadCacheList(caches);

const cacheInfo = cacheList.latest;

const loadedCache = loadCache(cacheInfo);

const cacheSystem = CacheSystem.fromFiles(loadedCache.type, loadedCache.files);
const loaderFactory = getCacheLoaderFactory(cacheInfo, cacheSystem);

const underlayTypeLoader = loaderFactory.getUnderlayTypeLoader();
const overlayTypeLoader = loaderFactory.getOverlayTypeLoader();

const locTypeLoader = loaderFactory.getLocTypeLoader();

const modelLoader = loaderFactory.getModelLoader();
const textureLoader = loaderFactory.getTextureLoader();

const seqTypeLoader = loaderFactory.getSeqTypeLoader();
const seqFrameLoader = loaderFactory.getSeqFrameLoader();
const skeletalSeqLoader = loaderFactory.getSkeletalSeqLoader();

const mapFileLoader = loaderFactory.getMapFileLoader();

const locModelLoader = new LocModelLoader(
    locTypeLoader,
    modelLoader,
    textureLoader,
    seqTypeLoader,
    seqFrameLoader,
    skeletalSeqLoader,
);

const sceneBuilder = new SceneBuilder(
    loadedCache.info,
    mapFileLoader,
    underlayTypeLoader,
    overlayTypeLoader,
    locTypeLoader,
    locModelLoader,
    loadedCache.xteas,
);

function loadHeightMap(
    baseX: number,
    baseY: number,
    sizeX: number,
    sizeY: number,
    level: number,
    maxHeight: number,
): Uint8Array {
    const heightMap = new Uint8Array(sizeX * sizeY);

    // A single scene of the whole area needs more than the default heap, so build it one map
    // square at a time. Tile heights only depend on their own map square's terrain.
    const chunkSize = Scene.MAP_SQUARE_SIZE;
    for (let chunkY = 0; chunkY < sizeY; chunkY += chunkSize) {
        for (let chunkX = 0; chunkX < sizeX; chunkX += chunkSize) {
            const chunkSizeX = Math.min(chunkSize, sizeX - chunkX);
            const chunkSizeY = Math.min(chunkSize, sizeY - chunkY);
            const scene = sceneBuilder.buildScene(
                baseX + chunkX,
                baseY + chunkY,
                chunkSizeX,
                chunkSizeY,
                false,
                LocLoadType.NO_MODELS,
            );
            const tileHeights = scene.tileHeights[level];
            for (let y = 0; y < chunkSizeY; y++) {
                for (let x = 0; x < chunkSizeX; x++) {
                    // Flipped vertically, images start at the top
                    const index = (sizeY - 1 - (chunkY + y)) * sizeX + chunkX + x;
                    const height = Math.min((-tileHeights[x][y] / maxHeight) * 0xff, 0xff);
                    heightMap[index] = height;
                }
            }
        }
    }

    return heightMap;
}

function exportHeightMap() {
    const level = 0;
    const baseX = 1024;
    const baseY = 2496;
    const endX = 3967;
    const endY = 4159;
    const sizeX = endX - baseX;
    const sizeY = endY - baseY;

    const maxHeight = 2040;

    const heightMap = loadHeightMap(baseX, baseY, sizeX, sizeY, level, maxHeight);

    saveHeightMapToPng(heightMap, sizeX, sizeY, `./height-map.png`);
}

exportHeightMap();
