// Updates the object transports (entrances, ladders, stairs, ...) from the Shortest Path plugin,
// where objects lead isn't in the cache. https://github.com/Skretzo/shortest-path (BSD-2-Clause)
// Usage: pnpm update-transports
import fs from "node:fs";

const TRANSPORTS_URL =
    "https://raw.githubusercontent.com/Skretzo/shortest-path/master/src/main/resources/transports/transports.tsv";
const OUTPUT_PATH = "src/mapviewer/data/transport/transports.json";

function parseTile(value) {
    const [x, y, plane] = value.trim().split(" ").map(Number);
    return [x, y, plane];
}

const resp = await fetch(TRANSPORTS_URL);
if (!resp.ok) {
    throw new Error("Failed fetching transports: " + resp.status);
}
const tsv = await resp.text();

// Rows: [originX, originY, originPlane, destX, destY, destPlane, objectId (-1 if unknown), menu text]
const rows = [];
for (const line of tsv.split("\n")) {
    if (line.startsWith("#") || !line.trim()) {
        continue;
    }
    const [origin, destination, objectInfo] = line.split("\t");
    if (!origin?.trim() || !destination?.trim() || !objectInfo?.trim()) {
        continue;
    }
    // "menuOption menuTarget objectID", the id is missing for a few rows
    const match = /^(.*?)(?: (\d+))?$/.exec(objectInfo.trim());
    const menuText = match[1];
    const objectId = match[2] !== undefined ? Number(match[2]) : -1;
    rows.push([...parseTile(origin), ...parseTile(destination), objectId, menuText]);
}

fs.mkdirSync("src/mapviewer/data/transport", { recursive: true });
fs.writeFileSync(OUTPUT_PATH, "[\n" + rows.map((row) => JSON.stringify(row)).join(",\n") + "\n]\n");

console.log(`Saved ${rows.length} transports to ${OUTPUT_PATH}`);
