import { DataBuffer } from "../../buffer/DataBuffer";

function hashVertex(v0: number, v1: number, v2: number): number {
    let h = Math.imul(v0, 0x9e3779b1);
    h = Math.imul(h ^ v1 ^ (h >>> 15), 0x85ebca77);
    h = Math.imul(h ^ v2 ^ (h >>> 13), 0xc2b2ae3d);
    return h ^ (h >>> 16);
}

export class VertexBuffer extends DataBuffer {
    static readonly STRIDE = 12;

    // Packed vertex data, 3 ints per vertex (aliases DataBuffer.bytes)
    ints: Int32Array;

    // Open addressing table of vertex index + 1 (0 = empty) used to reuse identical vertices
    vertexTable: Int32Array;
    vertexTableMask: number;
    vertexTableCount: number = 0;

    constructor(count: number) {
        super(VertexBuffer.STRIDE, count);
        this.ints = new Int32Array(this.bytes.buffer);
        const tableSize = 1 << Math.max(10, Math.ceil(Math.log2(count * 2)));
        this.vertexTable = new Int32Array(tableSize);
        this.vertexTableMask = tableSize - 1;
    }

    override ensureSize(count: number): boolean {
        const resized = super.ensureSize(count);
        if (resized) {
            this.ints = new Int32Array(this.bytes.buffer);
        }
        return resized;
    }

    private growVertexTable(): void {
        const ints = this.ints;
        const tableSize = this.vertexTable.length * 2;
        const table = new Int32Array(tableSize);
        const mask = tableSize - 1;
        for (const entry of this.vertexTable) {
            if (entry === 0) {
                continue;
            }
            const i = (entry - 1) * 3;
            let slot = hashVertex(ints[i], ints[i + 1], ints[i + 2]) & mask;
            while (table[slot] !== 0) {
                slot = (slot + 1) & mask;
            }
            table[slot] = entry;
        }
        this.vertexTable = table;
        this.vertexTableMask = mask;
    }

    addVertex(
        x: number,
        y: number,
        z: number,
        hsl: number,
        alpha: number,
        u: number,
        v: number,
        textureId: number,
        priority: number,
        reuseVertex: boolean = true,
    ) {
        if (textureId >= 1024) {
            textureId = -1;
        }
        const isTextured = textureId !== -1;
        if (isTextured) {
            // textureId = 119;
            // only light
            hsl &= 127;
            hsl |= (textureId & 0x1ff) << 7;
        }

        // Inlined clamp() and FloatUtil.packFloat11(), this is the hottest path of map loading
        const xPos = Math.min(Math.max(x + 0x4000, 0), 0x8000);
        const yPos = Math.min(Math.max(-y + 0x4000, 0), 0x8000);
        const zPos = Math.min(Math.max(z + 0x4000, 0), 0x8000);

        priority &= 0x7;

        const uPacked = Math.min(Math.max(1024 - Math.round(u * 64), 0), 0x7ff);
        const vPacked = Math.min(Math.max(1024 - Math.round(v * 64), 0), 0x7ff);

        const v0 = (xPos << 17) | ((uPacked & 0x3f) << 11) | vPacked;

        const v1 = yPos | (hsl << 15) | (Number(isTextured) << 31);

        const v2 =
            (zPos << 17) |
            (alpha << 9) |
            (priority << 6) |
            (((textureId >> 9) & 0x1) << 5) |
            (uPacked >> 6);

        let slot = -1;
        if (reuseVertex) {
            const table = this.vertexTable;
            const mask = this.vertexTableMask;
            const ints = this.ints;
            slot = hashVertex(v0, v1, v2) & mask;
            let entry: number;
            while ((entry = table[slot]) !== 0) {
                const i = (entry - 1) * 3;
                if (ints[i] === v0 && ints[i + 1] === v1 && ints[i + 2] === v2) {
                    return entry - 1;
                }
                slot = (slot + 1) & mask;
            }
        }

        this.ensureSize(1);
        const index = this.offset;
        const i = index * 3;
        this.ints[i] = v0;
        this.ints[i + 1] = v1;
        this.ints[i + 2] = v2;

        if (reuseVertex) {
            this.vertexTable[slot] = index + 1;
            if (++this.vertexTableCount * 2 > this.vertexTable.length) {
                this.growVertexTable();
            }
        }

        return this.offset++;
    }
}
