import WasmBzip2 from "@foxglove/wasm-bz2";

export class Bzip2 {
    static bzip2Header = new Uint8Array("BZh1".split("").map((char) => char.charCodeAt(0)));

    static wasmBzip: WasmBzip2 | undefined;

    static async initWasm(): Promise<WasmBzip2> {
        Bzip2.wasmBzip ??= await WasmBzip2.init();
        return Bzip2.wasmBzip;
    }

    static decompress(compressed: Uint8Array, actualSize: number): Int8Array {
        if (!Bzip2.wasmBzip) {
            throw new Error("Bzip2.initWasm() must be awaited before decompressing");
        }

        const compressedBzip = new Uint8Array(compressed.length + 4);
        compressedBzip.set(Bzip2.bzip2Header, 0);
        compressedBzip.set(compressed, 4);

        const decompressed = Bzip2.wasmBzip.decompress(compressedBzip, actualSize, {
            small: false,
        });
        return new Int8Array(decompressed.buffer);
    }
}
