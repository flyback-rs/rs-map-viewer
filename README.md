# RuneScape Map Viewer

[Website](https://osrs.world) | [Discord](https://discord.gg/WfEWPE5wUd)

A webapp for exploring current and historical versions of RuneScape.

<img src="screenshots/lumbridge.png" alt="Lumbridge">

## Running locally

Requires [Node.js](https://nodejs.org/) 22.22 or newer and [pnpm](https://pnpm.io/).

```
$ git clone https://github.com/dennisdev/rs-map-viewer.git
$ cd rs-map-viewer
$ pnpm install
$ pnpm download-caches
$ pnpm start
```

`pnpm build` type checks and creates a production build in `build/`, which `pnpm preview` serves locally.

## Credits

- Jagex
- [RuneLite](https://github.com/runelite/runelite)
- [OpenRS2 Archive](https://archive.openrs2.org/) - Caches
- [RuneScape Archive](https://rs-archive.github.io/) - Caches
- [OSRS Wiki](https://oldschool.runescape.wiki/) - Item spawns, var names
- [2004scape](https://github.com/2004scape/Server) - Npc spawns
- [2009scape](https://gitlab.com/2009scape/2009scape) - Npc spawns
- [RuneStar](https://github.com/RuneStar/fonts) - Fonts
- [Blurite](https://github.com/blurite/pathfinder) - Some pathfinding stuff
- [RuneApps Model Viewer](https://github.com/skillbert/rsmv) - Some procedural texture stuff
