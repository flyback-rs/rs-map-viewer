// Updates the varbit and varplayer names from the OSRS Wiki, var names aren't in the cache.
// Usage: pnpm update-var-names
import fs from "node:fs";

const WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "rs-map-viewer var names (https://github.com/dennisdev/rs-map-viewer)";
const PAGE_SIZE = 5000;
const OUTPUT_PATH = "src/mapviewer/data/var/var-names.json";

async function fetchBucketPage(offset) {
    const params = new URLSearchParams({
        action: "bucket",
        query: `bucket('varbit').select('index','name','page_name').limit(${PAGE_SIZE}).offset(${offset}).run()`,
        format: "json",
    });
    const resp = await fetch(WIKI_API_URL + "?" + params, {
        headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) {
        throw new Error("Failed fetching var names: " + resp.status);
    }
    const json = await resp.json();
    if (json.error) {
        throw new Error("Failed fetching var names: " + JSON.stringify(json.error));
    }
    return json.bucket;
}

async function fetchVarNames() {
    const varbits = {};
    const varps = {};
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const rows = await fetchBucketPage(offset);
        for (const row of rows) {
            if (!row.name) {
                continue;
            }
            // The bucket holds both varbits and varplayers, told apart by their page
            const names = row.page_name.includes("Varplayer/") ? varps : varbits;
            names[row.index] = row.name;
        }
        if (rows.length < PAGE_SIZE) {
            return { varbits, varps };
        }
    }
}

const { varbits, varps } = await fetchVarNames();

fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ varbits, varps }, null, 2) + "\n", "utf8");

console.log(
    `Saved ${Object.keys(varbits).length} varbit and ${Object.keys(varps).length} varplayer names to ${OUTPUT_PATH}`,
);
