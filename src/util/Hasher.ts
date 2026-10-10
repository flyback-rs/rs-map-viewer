import xxhash, { XXHashAPI } from "xxhash-wasm";

export class Hasher {
    static hashApi: XXHashAPI | undefined;

    static async init(): Promise<XXHashAPI> {
        Hasher.hashApi ??= await xxhash();
        return Hasher.hashApi;
    }

    static hash32(data: Uint8Array): number {
        if (!Hasher.hashApi) {
            throw new Error("Hasher.init() must be awaited before hashing");
        }
        return Hasher.hashApi.h32Raw(data);
    }

    static hash64(data: Uint8Array): bigint {
        if (!Hasher.hashApi) {
            throw new Error("Hasher.init() must be awaited before hashing");
        }
        return Hasher.hashApi.h64Raw(data);
    }
}
