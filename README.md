# Pixel War

A territory-conquest strategy game in the spirit of Roblox's *Pixel Conquest*.
It's built for phones, but it plays in any modern browser. It's plain HTML5,
CSS and JavaScript with no build step and no dependencies. You can install it
on Android as a Progressive Web App (PWA). Once installed it runs full-screen
and offline.

## How to play

1. Choose a map (**World**, **Europe** or **Random** islands), the number of
   opponents (2–5) and a difficulty, then press **Play**.
2. On World or Europe, **tap a country** to lead it. You start with the part
   of it around where you tapped. On Random, tap anywhere to place your
   capital. **Random** picks for you.
3. Troops and gold grow over time. More land means more of both.
4. Use the **Send** slider to choose what share of your troops to commit,
   then **tap** the land you want to attack:
   - Grey land is unclaimed and cheap to take.
   - Enemy land costs more the more troops that nation holds.
   - The attack starts nearest the spot you tapped and spreads along the
     shared border.
   - If the target is across water, your troops **sail there by boat ⛵**.
     They land on the nearest coast and push inland. You can have up to
     three boats at sea at once.
5. **Drag** to pan the map and **pinch** to zoom (use the mouse wheel on a
   computer).
6. Troops on the march leave your home weaker. Two attacks between the same
   pair of nations cancel each other out.
7. Wipe out every rival to win. If you lose your last pixel, you lose.

### Buildings

Tap **🏗️ Build**, choose a building, then tap a spot in your own land.
Buildings cost gold, and each extra one of the same type costs a bit more.
They must sit at least two cells apart. Captured buildings change hands.

| Building | Cost | Effect |
| --- | --- | --- |
| 🏙️ City | 250 | +1,500 troop cap, faster troop growth, +1.5 gold/s |
| ⛏️ Gold mine | 120 | Only on a gold deposit (the yellow dots); +4 gold/s |
| 🛡️ Fort | 180 | Your land within 6 cells is 3× harder to capture |
| 🎯 Artillery | 350 | Shells enemy land and buildings up to 22 cells away every few seconds. Hits kill troops and blast land back to neutral |
| ☢️ Nuclear silo | 1,200 | Unlocks the **☢ Nuke** button |

**Nukes** cost 900 gold, and each silo owner has a 30-second reload. Tap
**☢**, then tap any target. The missile takes three seconds to arrive and
everyone can see where it will land. It wipes out everything within 7 cells:
troops, buildings and ownership. The land stays irradiated (green) for about
45 seconds, and while it does it costs 4× as many troops to take.

The HUD shows troops and troop cap, gold, your share of the land, the clock
and a leaderboard. The bottom line lists your attacks and boats in progress,
or warns you about incoming attacks. **1× / 2× / 3×** changes the game speed
and **❚❚** pauses the game. On Android the back button cancels a build or
nuke, and otherwise pauses the game instead of leaving it.

### The AI opponents

Each rival gets a personality. Every game includes a **Warlord** (very
aggressive), a **Balanced** rival and a **Turtle** (saves up, expands slowly).
With four or five opponents, a **Raider** and a **Settler** join in.
Difficulty changes how fast rivals earn troops and gold (Easy ×0.8, Normal
×1.0, Hard ×1.2), how aggressive they are, and how keen they are to target
you. AI nations build mines, cities, forts and artillery, and send boats
overseas. On Normal the more aggressive ones build nuclear silos. On Hard
most of them do. On Easy, no AI builds a silo.

## Run it on this Mac

```bash
cd ~/Claude/pixel-war
python3 -m http.server 8765
```

Then open <http://localhost:8765>. Opening `index.html` straight from Finder
also works, but you won't get offline support.

## Put it on your Android phone

### Option A: play now over Wi-Fi (quickest, no install)

1. On the Mac, run the server above. If macOS asks whether Python may accept
   incoming connections, allow it.
2. Make sure the phone is on the **same Wi-Fi** as the Mac.
3. In Chrome on the phone, open `http://<mac-ip>:8765`. To find the Mac's IP
   address, run `ipconfig getifaddr en0`. When this was written it was
   `192.168.68.50`.
4. Optionally, use Chrome's menu → **Add to Home screen** to get a shortcut.
   Over plain `http://` Chrome won't install it as a full app: it opens in a
   browser tab and needs the Mac to be running the server.

### Option B: install it as a proper app (recommended)

Android only installs a PWA (full-screen, own icon, works offline) from an
**HTTPS** address. The simplest free host is **GitHub Pages**:

1. Create a new public repository on GitHub, for example `pixel-war`.
2. Upload the project's contents: `index.html`, `style.css`, `game.js`,
   `sw.js`, `manifest.webmanifest` and the `icons/` folder. You can drag them
   into the repo's web page, or use `git push`.
3. In the repo, open **Settings → Pages**. Set *Source* to *Deploy from a
   branch*, choose `main` and `/ (root)`, then save.
4. After a minute or so the game is live at
   `https://<your-username>.github.io/pixel-war/`.
5. On the phone, open that address in **Chrome**. Then either tap **Install
   app** on the main menu, or use Chrome's menu → **Install app** / **Add to
   Home screen**.
6. Launch **Pixel War** from the home screen. It runs full-screen and keeps
   working with no signal.

Netlify Drop (<https://app.netlify.com/drop>) works the same way. Drag the
folder in and you get an HTTPS address.

### Updating an installed copy

After changing any file, bump `CACHE` in `sw.js` (for example `pixel-war-v2`)
and redeploy. The installed app picks up the new version the next time it is
opened with a connection. You may need to close and reopen it twice.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page layout: HUD, menus, overlays |
| `style.css` | Mobile-first styling, including safe-area insets for notched phones |
| `game.js` | Map generation, simulation, buildings, AI, rendering and touch input |
| `maps/world.js`, `maps/europe.js` | Real-world maps: country grids made from Natural Earth data |
| `sw.js` | Service worker that caches the game for offline play |
| `manifest.webmanifest` | PWA metadata: name, icons, full-screen display |
| `icons/` | App icons (192 px, 512 px and a maskable 512 px) |
| `tools/make_icons.py` | Regenerates the icons (`python3 tools/make_icons.py`) |
| `tools/make_maps.py` | Regenerates the map files from Natural Earth's [world-atlas](https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json) TopoJSON |

## Tuning

The balance constants are at the top of `game.js`: `NEUTRAL_COST`, the
attack rates, `START_TROOPS`, `START_GOLD`, and the fort, artillery, nuke and
boat settings. Building costs and effects are in `BUILDINGS`. The difficulty table is `DIFFICULTY`, and the
AI personalities are `CORE_PERSONAS` and `EXTRA_PERSONAS`. Troop growth is in
`grow()` and the AI's decisions are in `aiThink()`.

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

## Possible next steps

- A real APK through Capacitor or a Trusted Web Activity (needs Node, a JDK
  and the Android SDK).
- Alliances and peace treaties with AI nations.
- Warships to intercept enemy boats.
- Sound effects and music.
- Alliances, or local multiplayer on one device.
