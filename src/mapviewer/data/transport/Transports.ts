import transportsUrl from "./transports.json?url";

// Where objects like entrances, ladders and stairs lead isn't in the cache, transports.json is a
// snapshot of the Shortest Path plugin's transports (pnpm update-transports)

export type TransportTile = {
    x: number;
    y: number;
    plane: number;
};

export type Transport = {
    origin: TransportTile;
    destination: TransportTile;
    // -1 if unknown
    objectId: number;
    // "Option Target", e.g. "Climb-down Trapdoor"
    menuText: string;
};

type TransportRow = [number, number, number, number, number, number, number, string];

// The origin is where the player stands, usually next to the object
const MAX_ORIGIN_DISTANCE = 10;

export class Transports {
    byObjectId = new Map<number, Transport[]>();
    byMenuText = new Map<string, Transport[]>();

    constructor(transports: Transport[]) {
        for (const transport of transports) {
            addToGroup(this.byObjectId, transport.objectId, transport);
            addToGroup(this.byMenuText, transport.menuText.toLowerCase(), transport);
        }
    }

    // Finds the transport of an object's menu option, closest to where the object was clicked
    find(
        objectId: number,
        option: string,
        objectName: string,
        tile: TransportTile,
    ): Transport | undefined {
        const optionPrefix = option.toLowerCase() + " ";
        const candidates = [
            ...(this.byObjectId.get(objectId) ?? []).filter((transport) =>
                transport.menuText.toLowerCase().startsWith(optionPrefix),
            ),
            // Matches objects whose id differs, like transformed objects, or is unknown
            ...(this.byMenuText.get(optionPrefix + objectName.toLowerCase()) ?? []),
        ];

        let closest: Transport | undefined;
        let closestScore = Infinity;
        for (const transport of candidates) {
            const distance = Math.max(
                Math.abs(transport.origin.x - tile.x),
                Math.abs(transport.origin.y - tile.y),
            );
            if (distance > MAX_ORIGIN_DISTANCE) {
                continue;
            }
            // Prefer the clicked plane, it can differ for objects on bridges
            const score = distance + (transport.origin.plane !== tile.plane ? 100 : 0);
            if (score < closestScore) {
                closest = transport;
                closestScore = score;
            }
        }
        return closest;
    }
}

function addToGroup<K>(groups: Map<K, Transport[]>, key: K, transport: Transport): void {
    const group = groups.get(key);
    if (group) {
        group.push(transport);
    } else {
        groups.set(key, [transport]);
    }
}

let transportsPromise: Promise<Transports> | undefined;

// Loaded once, the first time it's needed
export function loadTransports(): Promise<Transports> {
    if (!transportsPromise) {
        transportsPromise = fetch(transportsUrl)
            .then((resp) => resp.json())
            .then(
                (rows: TransportRow[]) =>
                    new Transports(
                        rows.map(([ox, oy, op, dx, dy, dp, objectId, menuText]) => ({
                            origin: { x: ox, y: oy, plane: op },
                            destination: { x: dx, y: dy, plane: dp },
                            objectId,
                            menuText,
                        })),
                    ),
            )
            .catch((e) => {
                transportsPromise = undefined;
                throw e;
            });
    }
    return transportsPromise;
}
