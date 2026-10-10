import { BIT_MASKS } from "../rs/MathConstants";
import { LocTypeLoader } from "../rs/config/loctype/LocTypeLoader";
import { NpcTypeLoader } from "../rs/config/npctype/NpcTypeLoader";
import { VarManager } from "../rs/config/vartype/VarManager";
import { VarType } from "../rs/config/vartype/VarType";
import { VarBitTypeLoader } from "../rs/config/vartype/bit/VarBitTypeLoader";
import { ByteBuffer } from "../rs/io/ByteBuffer";
import { MapFileLoader } from "../rs/map/MapFileLoader";
import { XteaMap } from "./Caches";
import { NpcSpawn } from "./data/npc/NpcSpawn";

// A loc or npc type that changes depending on a var
export type AreaVarTarget = {
    kind: "loc" | "npc";
    id: number;
    name: string;
    count: number;
};

// What a var value transforms its targets into
export type AreaVarOption = {
    value: number;
    labels: string[];
};

export type AreaVar = {
    type: VarType;
    id: number;
    value: number;
    maxValue: number;
    varbit?: { baseVar: number; startBit: number; endBit: number };
    targets: AreaVarTarget[];
    options: AreaVarOption[];
    // Used for every value without an option
    defaultLabels: string[];
};

export type AreaVarsLoaders = {
    mapFileLoader: MapFileLoader;
    xteas: XteaMap;
    locTypeLoader: LocTypeLoader;
    npcTypeLoader: NpcTypeLoader;
    varbitLoader: VarBitTypeLoader;
    varManager: VarManager;
};

type TransformableType = {
    id: number;
    name: string;
    transforms?: number[];
    transformVarbit: number;
    transformVarp: number;
};

type TypeLoader = { load(id: number): TransformableType };

// Counts the loc ids in a map square's loc file, same format as SceneBuilder.decodeLocs
function countLocs(data: Int8Array, counts: Map<number, number>): void {
    const buffer = new ByteBuffer(data);

    let id = -1;
    let idDelta: number;
    while ((idDelta = buffer.readSmart3()) !== 0) {
        id += idDelta;

        while (buffer.readUnsignedSmart() !== 0) {
            // attributes
            buffer.readUnsignedByte();
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
    }
}

function getTransformLabel(loader: TypeLoader, id: number): string {
    if (id === -1) {
        return "(hidden)";
    }
    const name = loader.load(id).name;
    return `${name === "null" ? "(unnamed)" : name} #${id}`;
}

function getTargetName(loader: TypeLoader, type: TransformableType): string {
    if (type.name !== "null") {
        return type.name;
    }
    // Multilocs are usually unnamed, use the first named transform instead
    for (const id of type.transforms ?? []) {
        if (id !== -1) {
            const name = loader.load(id).name;
            if (name !== "null") {
                return name;
            }
        }
    }
    return "(unnamed)";
}

type AreaVarBuilder = {
    targets: AreaVarTarget[];
    options: Map<number, Set<string>>;
    defaultLabels: Set<string>;
};

function addTarget(
    builders: Map<string, AreaVarBuilder>,
    kind: "loc" | "npc",
    loader: TypeLoader,
    type: TransformableType,
    count: number,
): void {
    const transforms = type.transforms;
    if (!transforms) {
        return;
    }
    let key: string;
    if (type.transformVarbit !== -1) {
        key = VarType.VARBIT + ":" + type.transformVarbit;
    } else if (type.transformVarp !== -1) {
        key = VarType.VARP + ":" + type.transformVarp;
    } else {
        return;
    }

    let builder = builders.get(key);
    if (!builder) {
        builder = { targets: [], options: new Map(), defaultLabels: new Set() };
        builders.set(key, builder);
    }

    builder.targets.push({
        kind,
        id: type.id,
        name: getTargetName(loader, type),
        count,
    });

    // See LocType.transform: the last entry is used for values out of range or set to -1
    const defaultId = transforms[transforms.length - 1];
    const defaultLabel = getTransformLabel(loader, defaultId);
    builder.defaultLabels.add(defaultLabel);
    for (let value = 0; value < transforms.length - 1; value++) {
        const id = transforms[value];
        const label = id === -1 ? defaultLabel : getTransformLabel(loader, id);
        let labels = builder.options.get(value);
        if (!labels) {
            labels = new Set();
            builder.options.set(value, labels);
        }
        labels.add(label);
    }
}

// Named transforms first, they're more useful when summarizing
function sortLabels(labels: Set<string>): string[] {
    const isUnnamed = (label: string) => label.startsWith("(");
    return Array.from(labels).sort((a, b) => Number(isUnnamed(a)) - Number(isUnnamed(b)));
}

// Finds the vars that transform locs and npcs within `radius` map squares of the given one
export function findAreaVars(
    loaders: AreaVarsLoaders,
    npcSpawns: NpcSpawn[],
    centerMapX: number,
    centerMapY: number,
    radius: number,
): AreaVar[] {
    const { mapFileLoader, xteas, locTypeLoader, npcTypeLoader, varbitLoader, varManager } =
        loaders;

    const locCounts = new Map<number, number>();
    for (let mapX = centerMapX - radius; mapX <= centerMapX + radius; mapX++) {
        for (let mapY = centerMapY - radius; mapY <= centerMapY + radius; mapY++) {
            try {
                const data = mapFileLoader.getLocData(mapX, mapY, xteas);
                if (data) {
                    countLocs(data, locCounts);
                }
            } catch (e) {
                // Missing or encrypted map square
            }
        }
    }

    const npcCounts = new Map<number, number>();
    for (const spawn of npcSpawns) {
        const mapX = spawn.x >> 6;
        const mapY = spawn.y >> 6;
        if (Math.abs(mapX - centerMapX) <= radius && Math.abs(mapY - centerMapY) <= radius) {
            npcCounts.set(spawn.id, (npcCounts.get(spawn.id) ?? 0) + 1);
        }
    }

    const builders = new Map<string, AreaVarBuilder>();
    for (const [id, count] of locCounts) {
        addTarget(builders, "loc", locTypeLoader, locTypeLoader.load(id), count);
    }
    for (const [id, count] of npcCounts) {
        addTarget(builders, "npc", npcTypeLoader, npcTypeLoader.load(id), count);
    }

    const vars: AreaVar[] = [];
    for (const [key, builder] of builders) {
        const [type, id] = key.split(":").map(Number) as [VarType, number];

        let value: number;
        let maxValue: number;
        let varbit: AreaVar["varbit"];
        if (type === VarType.VARBIT) {
            const { baseVar, startBit, endBit } = varbitLoader.load(id);
            varbit = { baseVar, startBit, endBit };
            value = varManager.getVarbit(id);
            maxValue = BIT_MASKS[endBit - startBit];
        } else {
            value = varManager.getVarp(id);
            maxValue = 0x7fffffff;
        }

        builder.targets.sort((a, b) => b.count - a.count);
        vars.push({
            type,
            id,
            value,
            maxValue,
            varbit,
            targets: builder.targets,
            options: Array.from(builder.options, ([value, labels]) => ({
                value,
                labels: sortLabels(labels),
            })).sort((a, b) => a.value - b.value),
            defaultLabels: sortLabels(builder.defaultLabels),
        });
    }

    const spawnCount = (v: AreaVar) => v.targets.reduce((sum, target) => sum + target.count, 0);
    return vars.sort((a, b) => spawnCount(b) - spawnCount(a) || a.type - b.type || a.id - b.id);
}
