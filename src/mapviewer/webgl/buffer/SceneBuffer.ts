import { vec3 } from "gl-matrix";

import { Model, computeTextureCoords } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { SceneTile } from "../../../rs/scene/SceneTile";
import { TextureLoader } from "../../../rs/texture/TextureLoader";
import { clamp } from "../../../util/MathUtil";
import { DrawRange, newDrawRange } from "../DrawRange";
import { InteractType } from "../InteractType";
import { LocAnimatedData } from "../loc/LocAnimatedData";
import { LocAnimatedGroup } from "../loc/LocAnimatedGroup";
import { SceneLocEntity } from "../loc/SceneLocEntity";
import { VertexBuffer } from "./VertexBuffer";

export enum ContourGroundType {
    CENTER_TILE = 0,
    VERTEX = 1,
    NONE = 2,
}

export type ModelInfo = {
    sceneX: number;
    sceneZ: number;
    heightOffset: number;
    level: number;
    contourGround: ContourGroundType;
    priority: number;
    interactType: InteractType;
    interactId: number;
};

export type DrawCommand = {
    offset: number;
    elements: number;
    instances: ModelInfo[];
};

export type SceneModel = {
    model: Model;
    sceneHeight: number;
    lowDetail: boolean;
    forceMerge: boolean;
} & ModelInfo;

export type ModelMergeGroup = {
    transparent: boolean;
    lowDetail: boolean;
    level: number;
    priority: number;
    models: SceneModel[];
};

export class SceneBuffer {
    vertexBuf: VertexBuffer;
    indices: Int32Array;
    indexCount: number = 0;

    drawCommands: DrawCommand[] = [];
    drawCommandsAlpha: DrawCommand[] = [];

    drawCommandsLod: DrawCommand[] = [];
    drawCommandsLodAlpha: DrawCommand[] = [];

    drawCommandsInteract: DrawCommand[] = [];
    drawCommandsInteractAlpha: DrawCommand[] = [];

    drawCommandsInteractLod: DrawCommand[] = [];
    drawCommandsInteractLodAlpha: DrawCommand[] = [];

    usedTextureIds = new Set<number>();

    modelFacesCache = new WeakMap<Model, SplitModelFaces>();

    constructor(
        readonly textureLoader: TextureLoader,
        readonly textureIdIndexMap: Map<number, number>,
        initVertexCount: number,
    ) {
        this.vertexBuf = new VertexBuffer(initVertexCount);
        this.indices = new Int32Array(initVertexCount * 3);
    }

    private ensureIndexCapacity(count: number): void {
        if (this.indexCount + count > this.indices.length) {
            const newIndices = new Int32Array(
                Math.max(this.indices.length * 2, this.indexCount + count),
            );
            newIndices.set(this.indices.subarray(0, this.indexCount));
            this.indices = newIndices;
        }
    }

    addIndex(index: number): void {
        this.ensureIndexCapacity(1);
        this.indices[this.indexCount++] = index;
    }

    // Copy of the used indices
    indexArray(): Int32Array {
        return this.indices.slice(0, this.indexCount);
    }

    vertexCount(): number {
        return this.vertexBuf.offset;
    }

    indexByteOffset(): number {
        return this.indexCount * 4;
    }

    addTerrainTile(tile: SceneTile, offsetX: number, offsetY: number): void {
        const tileModel = tile.tileModel;
        if (!tileModel) {
            return;
        }
        for (const face of tileModel.faces) {
            for (const vertex of face.vertices) {
                const textureIndex = this.textureIdIndexMap.get(vertex.textureId) ?? -1;

                if (textureIndex !== -1) {
                    this.usedTextureIds.add(vertex.textureId);
                }

                const index = this.vertexBuf.addVertex(
                    vertex.x + offsetX,
                    vertex.y,
                    vertex.z + offsetY,
                    vertex.hsl,
                    0xff,
                    vertex.u,
                    vertex.v,
                    textureIndex,
                    0,
                );

                this.addIndex(index);
            }
        }
    }

    addTerrain(scene: Scene, borderSize: number, maxLevel: number): number {
        const startX = borderSize;
        const startY = borderSize;
        const endX = borderSize + Scene.MAP_SQUARE_SIZE;
        const endY = borderSize + Scene.MAP_SQUARE_SIZE;

        const vertexOffset = borderSize * -128;

        const terrainStartVertexCount = this.vertexCount();
        for (let level = 0; level < scene.levels; level++) {
            const indexOffset = this.indexByteOffset();
            for (let x = startX; x < endX; x++) {
                for (let y = startY; y < endY; y++) {
                    const tile = scene.tiles[level][x][y];
                    if (!tile || tile.minLevel > maxLevel) {
                        continue;
                    }
                    this.addTerrainTile(tile, vertexOffset, vertexOffset);
                }
            }

            const levelVertexCount = (this.indexByteOffset() - indexOffset) / 4;

            if (levelVertexCount > 0) {
                const command: DrawCommand = {
                    offset: indexOffset,
                    elements: levelVertexCount,
                    instances: [
                        {
                            sceneX: 0,
                            sceneZ: 0,
                            heightOffset: 0,
                            level,
                            contourGround: ContourGroundType.NONE,
                            priority: 0,
                            interactType: InteractType.NONE,
                            interactId: 0xffff,
                        },
                    ],
                };

                this.drawCommands.push(command);
                this.drawCommandsLod.push(command);
                this.drawCommandsInteract.push(command);
                this.drawCommandsInteractLod.push(command);
            }
        }

        return this.vertexCount() - terrainStartVertexCount;
    }

    // Faces only depend on colors, textures, alphas and priorities, so they're cached per model
    getModelFaces(model: Model): SplitModelFaces {
        let faces = this.modelFacesCache.get(model);
        if (!faces) {
            faces = splitModelFaces(this.textureLoader, model);
            this.modelFacesCache.set(model, faces);
        }
        return faces;
    }

    // Returns the opaque and transparent draw ranges of an animation frame
    addModelAnimFrame(model: Model): [DrawRange, DrawRange] {
        const faces = splitModelFaces(this.textureLoader, model);
        return [
            this.addModelFaces(model, faces.opaque),
            this.addModelFaces(model, faces.transparent),
        ];
    }

    private addModelFaces(model: Model, faces: ModelFaces): DrawRange {
        const offset = this.indexByteOffset();
        this.addModel(model, faces);
        const elements = (this.indexByteOffset() - offset) / 4;

        return newDrawRange(offset, elements, 1);
    }

    addLocAnimatedGroups(groups: Iterable<LocAnimatedGroup>): LocAnimatedData[] {
        const locsAnimated: LocAnimatedData[] = [];

        for (const group of groups) {
            for (const loc of group.locs) {
                locsAnimated.push(this.addLocAnimated(group, loc));
            }
        }

        return locsAnimated;
    }

    addLocAnimated(group: LocAnimatedGroup, loc: SceneLocEntity): LocAnimatedData {
        const anim = group.anim;

        // Normal (merged)
        const drawRangeIndex = this.drawCommands.length;
        this.drawCommands.push({
            offset: 0,
            elements: 0,
            instances: [loc],
        });
        const drawRangeAlphaIndex = this.drawCommandsAlpha.length;
        if (anim.framesAlpha) {
            this.drawCommandsAlpha.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
        }
        // Lod (merged)
        let drawRangeLodIndex = -1;
        let drawRangeLodAlphaIndex = -1;
        if (!loc.lowDetail) {
            drawRangeLodIndex = this.drawCommandsLod.length;
            this.drawCommandsLod.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
            if (anim.framesAlpha) {
                drawRangeLodAlphaIndex = this.drawCommandsLodAlpha.length;
                this.drawCommandsLodAlpha.push({
                    offset: 0,
                    elements: 0,
                    instances: [loc],
                });
            }
        }

        // Interact (non merged)
        const drawRangeInteractIndex = this.drawCommandsInteract.length;
        this.drawCommandsInteract.push({
            offset: 0,
            elements: 0,
            instances: [loc],
        });
        const drawRangeInteractAlphaIndex = this.drawCommandsInteractAlpha.length;
        if (anim.framesAlpha) {
            this.drawCommandsInteractAlpha.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
        }

        // Interact Lod (non merged)
        let drawRangeInteractLodIndex = -1;
        let drawRangeInteractLodAlphaIndex = -1;
        if (!loc.lowDetail) {
            drawRangeInteractLodIndex = this.drawCommandsInteractLod.length;
            this.drawCommandsInteractLod.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
            if (anim.framesAlpha) {
                drawRangeInteractLodAlphaIndex = this.drawCommandsInteractLodAlpha.length;
                this.drawCommandsInteractLodAlpha.push({
                    offset: 0,
                    elements: 0,
                    instances: [loc],
                });
            }
        }
        return {
            drawRangeIndex,
            drawRangeAlphaIndex,

            drawRangeLodIndex,
            drawRangeLodAlphaIndex,

            drawRangeInteractIndex,
            drawRangeInteractAlphaIndex,

            drawRangeInteractLodIndex,
            drawRangeInteractLodAlphaIndex,

            anim,
            seqId: loc.entity.seqId,
            randomStart: loc.entity.seqRandomStart,
        };
    }

    addModelGroup(group: ModelMergeGroup): void {
        const groupOffset = this.indexByteOffset();

        for (const sceneModel of group.models) {
            const model = sceneModel.model;

            const modelFaces = this.getModelFaces(model);
            const faces = group.transparent ? modelFaces.transparent : modelFaces.opaque;

            const vertexOffset: vec3 = [
                sceneModel.sceneX,
                sceneModel.sceneHeight,
                sceneModel.sceneZ,
            ];
            if (sceneModel.heightOffset !== 0) {
                vertexOffset[1] = -sceneModel.heightOffset;
            }
            const offset = this.indexByteOffset();
            this.addModel(model, faces, vertexOffset);
            const elements = (this.indexByteOffset() - offset) / 4;

            const drawCommand: DrawCommand = {
                offset: offset,
                elements: elements,
                instances: [
                    {
                        sceneX: 0,
                        sceneZ: 0,
                        heightOffset: 0,
                        level: group.level,
                        contourGround: ContourGroundType.NONE,
                        priority: group.priority,
                        interactType: sceneModel.interactType,
                        interactId: sceneModel.interactId,
                    },
                ],
            };
            if (group.transparent) {
                this.drawCommandsInteractAlpha.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsInteractLodAlpha.push(drawCommand);
                }
            } else {
                this.drawCommandsInteract.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsInteractLod.push(drawCommand);
                }
            }
        }

        const groupElements = (this.indexByteOffset() - groupOffset) / 4;

        if (groupElements > 0) {
            const drawCommand: DrawCommand = {
                offset: groupOffset,
                elements: groupElements,
                instances: [
                    {
                        sceneX: 0,
                        sceneZ: 0,
                        heightOffset: 0,
                        level: group.level,
                        contourGround: ContourGroundType.NONE,
                        priority: group.priority,
                        interactType: InteractType.NONE,
                        interactId: 0xffff,
                    },
                ],
            };

            if (group.transparent) {
                this.drawCommandsAlpha.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsLodAlpha.push(drawCommand);
                }
            } else {
                this.drawCommands.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsLod.push(drawCommand);
                }
            }
        }
    }

    addModel(model: Model, faces: ModelFaces, offset?: vec3, reuseVertices: boolean = true): void {
        if (faces.length === 0) {
            return;
        }

        const verticesX = model.verticesX;
        let verticesY = model.verticesY;
        const verticesZ = model.verticesZ;

        let sceneX = 0;
        let sceneZ = 0;
        let sceneHeight = 0;
        if (offset) {
            sceneX = offset[0];
            sceneHeight = offset[1];
            sceneZ = offset[2];
            if (model.contourVerticesY) {
                verticesY = model.contourVerticesY;
            }
        }

        const facesA = model.indices1;
        const facesB = model.indices2;
        const facesC = model.indices3;

        // const modelTexCoords = computeTextureCoords(model);
        const modelTexCoords = model.uvs;

        if (model.faceTextures && !modelTexCoords) {
            throw new Error("Model has face textures but no texture coordinates");
        }

        const priorities = model.faceRenderPriorities;

        for (let i = 0; i < faces.length; i++) {
            const index = faces[i];
            const textureId = getFaceTextureId(model, index);
            const alpha = getFaceAlpha(model, index, textureId);
            const priority = priorities ? priorities[index] : 0;
            const textureIndex = this.textureIdIndexMap.get(textureId) ?? -1;

            let hslA = model.faceColors1[index];
            let hslB = model.faceColors2[index];
            let hslC = model.faceColors3[index];

            if (hslC === -1) {
                hslC = hslB = hslA;
            }

            let u0: number = 0;
            let v0: number = 0;
            let u1: number = 0;
            let v1: number = 0;
            let u2: number = 0;
            let v2: number = 0;

            if (modelTexCoords) {
                const texCoordIdx = index * 6;
                u0 = modelTexCoords[texCoordIdx];
                v0 = modelTexCoords[texCoordIdx + 1];
                u1 = modelTexCoords[texCoordIdx + 2];
                v1 = modelTexCoords[texCoordIdx + 3];
                u2 = modelTexCoords[texCoordIdx + 4];
                v2 = modelTexCoords[texCoordIdx + 5];

                // emulate wrapS: PicoGL.CLAMP_TO_EDGE
                // u0 = clamp(u0, 0.00390625 * 3, 1 - 0.00390625 * 3);
                // u1 = clamp(u1, 0.00390625 * 3, 1 - 0.00390625 * 3);
                // u2 = clamp(u2, 0.00390625 * 3, 1 - 0.00390625 * 3);
            }

            const fa = facesA[index];
            const fb = facesB[index];
            const fc = facesC[index];

            const vxa = sceneX + verticesX[fa];
            const vxb = sceneX + verticesX[fb];
            const vxc = sceneX + verticesX[fc];

            const vya = sceneHeight + verticesY[fa];
            const vyb = sceneHeight + verticesY[fb];
            const vyc = sceneHeight + verticesY[fc];

            const vza = sceneZ + verticesZ[fa];
            const vzb = sceneZ + verticesZ[fb];
            const vzc = sceneZ + verticesZ[fc];

            if (textureIndex !== -1) {
                this.usedTextureIds.add(textureId);
            }

            const index0 = this.vertexBuf.addVertex(
                vxa,
                vya,
                vza,
                hslA,
                alpha,
                u0,
                v0,
                textureIndex,
                priority + 1,
                reuseVertices,
            );
            const index1 = this.vertexBuf.addVertex(
                vxb,
                vyb,
                vzb,
                hslB,
                alpha,
                u1,
                v1,
                textureIndex,
                priority + 1,
                reuseVertices,
            );
            const index2 = this.vertexBuf.addVertex(
                vxc,
                vyc,
                vzc,
                hslC,
                alpha,
                u2,
                v2,
                textureIndex,
                priority + 1,
                reuseVertices,
            );

            this.ensureIndexCapacity(3);
            this.indices[this.indexCount++] = index0;
            this.indices[this.indexCount++] = index1;
            this.indices[this.indexCount++] = index2;
        }
    }
}

// Indices of a model's visible faces
export type ModelFaces = Int32Array;

export type SplitModelFaces = {
    opaque: ModelFaces;
    transparent: ModelFaces;
};

function getFaceTextureId(model: Model, index: number): number {
    return model.faceTextures ? model.faceTextures[index] : -1;
}

function getFaceAlpha(model: Model, index: number, textureId: number): number {
    const faceTransparencies = model.faceAlphas;
    if (faceTransparencies && textureId === -1) {
        return 0xff - (faceTransparencies[index] & 0xff);
    }
    return 0xff;
}

export function splitModelFaces(textureLoader: TextureLoader, model: Model): SplitModelFaces {
    const faceCount = model.faceCount;
    const opaque = new Int32Array(faceCount);
    const transparent = new Int32Array(faceCount);
    let opaqueCount = 0;
    let transparentCount = 0;

    const faceColors3 = model.faceColors3;
    for (let index = 0; index < faceCount; index++) {
        if (faceColors3[index] === -2) {
            continue;
        }

        const textureId = getFaceTextureId(model, index);
        const alpha = getFaceAlpha(model, index, textureId);
        if (alpha === 0 || alpha === 0x1) {
            continue;
        }

        if (alpha < 0xff || (textureId !== -1 && textureLoader.isTransparent(textureId))) {
            transparent[transparentCount++] = index;
        } else {
            opaque[opaqueCount++] = index;
        }
    }

    return {
        opaque: opaque.subarray(0, opaqueCount),
        transparent: transparent.subarray(0, transparentCount),
    };
}

export function createModelInfoTextureData(drawCommands: DrawCommand[]): Uint16Array {
    const instances: ModelInfo[] = [];
    for (const cmd of drawCommands) {
        instances.push(...cmd.instances);
    }
    const instanceCount = instances.length;

    const dataLength = Math.ceil((drawCommands.length * 4 + instanceCount) / 16) * 16;
    const textureData = new Uint16Array(Math.max(dataLength, 16) * 4);
    let dataOffset = 0;
    drawCommands.forEach((cmd, index) => {
        textureData[index * 4] = drawCommands.length + dataOffset;

        dataOffset += cmd.instances.length;
    });

    instances.forEach((data, index) => {
        let offset = drawCommands.length * 4 + index * 4;

        const contourGround = data.contourGround;

        const height = data.heightOffset;

        textureData[offset++] = data.sceneX | (data.level << 14);
        textureData[offset++] = data.sceneZ | (contourGround << 14);
        textureData[offset++] =
            (data.priority & 0x7) |
            ((data.interactId >> 16) << 3) |
            (data.interactType << 4) |
            (Math.round(height / 8) << 6);
        textureData[offset++] = data.interactId;
    });

    return textureData;
}
