import { JSX, KeyboardEvent, useEffect, useMemo, useState } from "react";

import { VarType } from "../rs/config/vartype/VarType";
import { AreaVar, AreaVarOption, findAreaVars } from "./AreaVars";
import "./AreaVarsPanel.css";
import { MapViewer } from "./MapViewer";
import {
    VarNames,
    getVarChiselUrl,
    getVarName,
    getVarWikiUrl,
    loadOsrsVarNames,
} from "./data/var/VarNames";

// Option buttons shown before the rest are collapsed
const COLLAPSED_OPTION_COUNT = 12;

// Consecutive values that transform into the same things
type OptionRange = {
    start: number;
    end: number;
    labels: string[];
};

function getOptionRanges(options: AreaVarOption[]): OptionRange[] {
    const ranges: OptionRange[] = [];
    for (const option of options) {
        const last = ranges[ranges.length - 1];
        if (
            last &&
            last.end === option.value - 1 &&
            last.labels.join("\n") === option.labels.join("\n")
        ) {
            last.end = option.value;
        } else {
            ranges.push({ start: option.value, end: option.value, labels: option.labels });
        }
    }
    return ranges;
}

function getValueLabels(areaVar: AreaVar, value: number): string[] {
    const option = areaVar.options.find((option) => option.value === value);
    return option ? option.labels : areaVar.defaultLabels;
}

function summarizeLabels(labels: string[]): string {
    return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0];
}

function matchesFilter(areaVar: AreaVar, name: string | undefined, filter: string): boolean {
    if (!filter) {
        return true;
    }
    if (areaVar.id.toString() === filter || name?.toLowerCase().includes(filter)) {
        return true;
    }
    return (
        areaVar.targets.some((target) => target.name.toLowerCase().includes(filter)) ||
        areaVar.options.some((option) =>
            option.labels.some((label) => label.toLowerCase().includes(filter)),
        )
    );
}

interface VarValueInputProps {
    value: number;
    maxValue: number;
    disabled: boolean;
    onCommit: (value: number) => void;
}

// Only applies the value on enter or blur, since every change reloads the maps
function VarValueInput({ value, maxValue, disabled, onCommit }: VarValueInputProps): JSX.Element {
    const [draft, setDraft] = useState(value.toString());

    useEffect(() => {
        setDraft(value.toString());
    }, [value]);

    const commit = () => {
        const parsed = parseInt(draft);
        if (isNaN(parsed) || parsed < 0 || parsed > maxValue) {
            setDraft(value.toString());
        } else if (parsed !== value) {
            onCommit(parsed);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            commit();
        } else if (event.key === "Escape") {
            setDraft(value.toString());
        }
    };

    return (
        <input
            className="area-var-input"
            type="number"
            min={0}
            max={maxValue}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
        />
    );
}

interface AreaVarRowProps {
    areaVar: AreaVar;
    name: string | undefined;
    showLinks: boolean;
    settable: boolean;
    onSetValue: (areaVar: AreaVar, value: number) => void;
}

function AreaVarRow({
    areaVar,
    name,
    showLinks,
    settable,
    onSetValue,
}: AreaVarRowProps): JSX.Element {
    const typeName = areaVar.type === VarType.VARBIT ? "varbit" : "varp";
    const [showAllOptions, setShowAllOptions] = useState(false);
    const ranges = getOptionRanges(areaVar.options);
    const shownRanges = showAllOptions ? ranges : ranges.slice(0, COLLAPSED_OPTION_COUNT);
    const currentLabels = getValueLabels(areaVar, areaVar.value);
    const isDefault = !areaVar.options.some((option) => option.value === areaVar.value);

    return (
        <div className="area-var">
            <div className="area-var-header">
                <span className="area-var-id">
                    {typeName} {areaVar.id}
                </span>
                <VarValueInput
                    value={areaVar.value}
                    maxValue={areaVar.maxValue}
                    disabled={!settable}
                    onCommit={(value) => onSetValue(areaVar, value)}
                />
                <span className="area-var-current" title={currentLabels.join("\n")}>
                    → {summarizeLabels(currentLabels)}
                </span>
            </div>
            {(name || showLinks) && (
                <div className="area-var-name-row">
                    {name && <span className="area-var-name">{name}</span>}
                    {showLinks && (
                        <span className="area-var-links">
                            <a
                                href={getVarWikiUrl(areaVar.type, areaVar.id)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                wiki
                            </a>
                            <a
                                href={getVarChiselUrl(areaVar.type, areaVar.id)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                chisel
                            </a>
                        </span>
                    )}
                </div>
            )}
            <div className="area-var-details">
                {areaVar.varbit &&
                    `varp ${areaVar.varbit.baseVar} bits ${areaVar.varbit.startBit}-${areaVar.varbit.endBit} · `}
                {areaVar.targets
                    .map((target) => `${target.name} (${target.kind}) ×${target.count}`)
                    .join(", ")}
                {!settable && " · not settable"}
            </div>
            <div className="area-var-options">
                {shownRanges.map((range) => {
                    const active = areaVar.value >= range.start && areaVar.value <= range.end;
                    const valueText =
                        range.start === range.end ? range.start : `${range.start}-${range.end}`;
                    return (
                        <button
                            key={range.start}
                            className={"area-var-option" + (active ? " active" : "")}
                            title={range.labels.join("\n")}
                            disabled={!settable}
                            onClick={() => onSetValue(areaVar, range.start)}
                        >
                            {valueText}: {summarizeLabels(range.labels)}
                        </button>
                    );
                })}
                {ranges.length > COLLAPSED_OPTION_COUNT && (
                    <button
                        className="area-var-option more"
                        onClick={() => setShowAllOptions(!showAllOptions)}
                    >
                        {showAllOptions
                            ? "show less"
                            : `+${ranges.length - COLLAPSED_OPTION_COUNT} more`}
                    </button>
                )}
                <span
                    className={"area-var-option default" + (isDefault ? " active" : "")}
                    title={areaVar.defaultLabels.join("\n")}
                >
                    other: {summarizeLabels(areaVar.defaultLabels)}
                </span>
            </div>
        </div>
    );
}

interface AreaVarsPanelProps {
    mapViewer: MapViewer;
    onClose: () => void;
}

// Lists the vars that change locs and npcs around the camera, and lets you set them
export function AreaVarsPanel({ mapViewer, onClose }: AreaVarsPanelProps): JSX.Element {
    const [radius, setRadius] = useState(1);
    const [filter, setFilter] = useState("");
    const [mapX, setMapX] = useState(mapViewer.camera.getMapX());
    const [mapY, setMapY] = useState(mapViewer.camera.getMapY());
    const [varsRevision, setVarsRevision] = useState(mapViewer.varManager.revision);
    const [varNames, setVarNames] = useState<VarNames>();

    // The wiki's var names only apply to Old School caches
    const isOsrs = mapViewer.loadedCache.info.game === "oldschool";
    useEffect(() => {
        if (!isOsrs) {
            setVarNames(undefined);
            return;
        }
        let cancelled = false;
        loadOsrsVarNames()
            .then((names) => !cancelled && setVarNames(names))
            .catch((e) => console.warn("Var names unavailable", e));
        return () => {
            cancelled = true;
        };
    }, [isOsrs]);

    // Follow the camera and changes to the vars made elsewhere
    useEffect(() => {
        const interval = setInterval(() => {
            setMapX(mapViewer.camera.getMapX());
            setMapY(mapViewer.camera.getMapY());
            setVarsRevision(mapViewer.varManager.revision);
        }, 500);
        return () => clearInterval(interval);
    }, [mapViewer]);

    const loadedCache = mapViewer.loadedCache;
    const areaVars = useMemo(
        () =>
            findAreaVars(
                {
                    mapFileLoader: mapViewer.loaderFactory.getMapFileLoader(),
                    xteas: loadedCache.xteas,
                    locTypeLoader: mapViewer.locTypeLoader,
                    npcTypeLoader: mapViewer.npcTypeLoader,
                    varbitLoader: mapViewer.varManager.varbitLoader,
                    varManager: mapViewer.varManager,
                },
                mapViewer.npcSpawns,
                mapX,
                mapY,
                radius,
            ),
        [mapViewer, loadedCache, mapX, mapY, radius, varsRevision],
    );

    const lowerCaseFilter = filter.trim().toLowerCase();
    const shownVars = areaVars.filter((areaVar) =>
        matchesFilter(areaVar, getVarName(varNames, areaVar.type, areaVar.id), lowerCaseFilter),
    );

    const onSetValue = (areaVar: AreaVar, value: number) => {
        mapViewer.setVar(areaVar.type, areaVar.id, value);
        setVarsRevision(mapViewer.varManager.revision);
    };

    const varpCount = mapViewer.varManager.values.length;
    const isSettable = (areaVar: AreaVar) =>
        (areaVar.varbit ? areaVar.varbit.baseVar : areaVar.id) < varpCount;

    return (
        <div className="area-vars-panel rs-border content-text">
            <div className="area-vars-header">
                <span>
                    Vars near map square {mapX}, {mapY}
                </span>
                <button className="area-vars-close" onClick={onClose} title="Close">
                    ×
                </button>
            </div>
            <div className="area-vars-toolbar">
                <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
                    <option value={0}>This square</option>
                    <option value={1}>3×3 squares</option>
                    <option value={2}>5×5 squares</option>
                    <option value={3}>7×7 squares</option>
                </select>
                <input
                    type="search"
                    placeholder="Filter by name or id"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                />
            </div>
            <div className="area-vars-list">
                {shownVars.length === 0 && <div className="area-vars-empty">No vars found</div>}
                {shownVars.map((areaVar) => (
                    <AreaVarRow
                        key={areaVar.type + ":" + areaVar.id}
                        areaVar={areaVar}
                        name={getVarName(varNames, areaVar.type, areaVar.id)}
                        showLinks={isOsrs}
                        settable={isSettable(areaVar)}
                        onSetValue={onSetValue}
                    />
                ))}
            </div>
        </div>
    );
}
