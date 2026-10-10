import { SdMapDataLoader } from "../webgl/loader/SdMapDataLoader";
import { WorkerState } from "./RenderDataWorker";

export type RenderDataResult<T> = {
    data: T;
    transferables: Transferable[];
};

export interface RenderDataLoader<I, D> {
    // Used by serializer
    __type: keyof RenderDataLoaders;

    init(): void;

    load(state: WorkerState, input: I): Promise<RenderDataResult<D>>;

    reset(): void;
}

const loaders = {
    sdMapDataLoader: new SdMapDataLoader(),
};

export type RenderDataLoaders = typeof loaders;

export type RenderDataLoaderType = keyof RenderDataLoaders;

export function getRenderDataLoader(type: RenderDataLoaderType): RenderDataLoaders[typeof type] {
    const loader = loaders[type];
    if (!loader) {
        throw new Error("Unknown loader type: " + type);
    }
    return loader;
}
