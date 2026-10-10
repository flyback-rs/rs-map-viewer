import { VarType } from "../../../rs/config/vartype/VarType";
import varNamesUrl from "./var-names.json?url";

// Var names aren't in the cache, var-names.json is a snapshot of the OSRS Wiki's names
// (pnpm update-var-names)
export type VarNames = {
    varbits: Record<number, string>;
    varps: Record<number, string>;
};

export function getVarName(
    names: VarNames | undefined,
    type: VarType,
    id: number,
): string | undefined {
    return type === VarType.VARBIT ? names?.varbits[id] : names?.varps[id];
}

export function getVarWikiUrl(type: VarType, id: number): string {
    const page = type === VarType.VARBIT ? "Varbit" : "Varplayer";
    return `https://oldschool.runescape.wiki/w/RuneScape:${page}/${id}`;
}

export function getVarChiselUrl(type: VarType, id: number): string {
    const param = type === VarType.VARBIT ? "varbit" : "varplayer";
    return `https://chisel.weirdgloop.org/varbs/display?${param}=${id}`;
}

let varNamesPromise: Promise<VarNames> | undefined;

// Loaded once, the first time it's needed
export function loadOsrsVarNames(): Promise<VarNames> {
    if (!varNamesPromise) {
        varNamesPromise = fetch(varNamesUrl)
            .then((resp) => resp.json())
            .catch((e) => {
                varNamesPromise = undefined;
                throw e;
            });
    }
    return varNamesPromise;
}
