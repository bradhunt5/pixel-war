# Pixel War

A territory-conquest strategy game in the spirit of Roblox's *Pixel Conquest*.
It's built for phones, but it plays in any modern browser. It's plain HTML5,
CSS and JavaScript with no build step. It also ships as an Android APK and a
Windows app, and up to six players can play together on any mix of devices.

## How to play

1. Choose a map (**World**, **Europe** or **Random** islands), the number of
   AI opponents (1–5), your colour and a difficulty, then press **Play**.
2. On World or Europe, **tap a country** to lead it. You start with the part
   of it around where you tapped. On Random, tap anywhere to place your
   capital. **Random** picks for you.
3. Troops and gold grow over time. More land means more of both.
4. Use the **Send** slider to choose what share of your troops to commit,
   then **tap** the land you want to attack:
   - Grey land is unclaimed and cheap to take.
   - Enemy land costs more the more troops that nation holds.
   - The attack pushes into the stretch of border nearest the spot you
     tapped, so tap where you want to break through. Tap again somewhere
     else to change direction.
   - If the target is across water, your troops **sail there by boat ⛵**.
     They land on the nearest coast and push inland. You can have up to
     three boats at sea at once.
5. **Drag** to pan the map and **pinch** to zoom (use the mouse wheel on a
   computer). The World map wraps round east to west like a globe. Keep
   panning and the Pacific joins up, so Alaska borders Russia's far east and
   boats take the shortest way across.
6. Troops on the march leave your home weaker. Two attacks between the same
   pair of nations cancel each other out.
7. Wipe out every rival to win. If you lose your last pixel, you lose.

### Buildings

Tap **🏗️ Build**, choose a building, then tap a spot in your own land.
Buildings cost gold, and each extra one of the same type costs a bit more.
They must sit at least two cells apart. Captured buildings change hands.

| Building | Cost | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- | --- |
| 🏙️ City | 250 | +1,500 troop cap, +2 troops/s, +1.5 gold/s | +3,000 cap, +4 troops/s, +3 gold/s | +5,000 cap, +7 troops/s, +5 gold/s |
| ⛏️ Gold mine | 120 | +4 gold/s | +7 gold/s | +11 gold/s |
| 🛡️ Fort | 180 | Land within 6 cells 3× harder to take | 8 cells, 4× | 10 cells, 5× |
| 🎯 Artillery | 350 | Range 22, fires every 3.5 s | Range 28, every 2.4 s | Range 34, every 1.5 s, bigger blast |
| ☢️ Nuclear silo | 1,200 | Nuke blast radius 7, 30 s reload | Radius 10, 20 s reload | Radius 13, 12 s reload |

Gold mines only go on gold deposits (the yellow dots).

**Upgrades:** tap one of your buildings to see what it does now and what the
next level adds, then tap **Upgrade**. Level 2 costs 1.2× the building's
base price and level 3 costs 2.4×. A small badge on the map shows a
building's level. Each upgrade also lets the building take one more
artillery hit.

**Artillery** shells enemy land and buildings within range. Hits kill troops
and blast land back to neutral.

**Nukes** cost 900 gold. Tap **☢**, then tap an enemy target (you can't nuke
your own land). A nuke fires from your best silo, so its blast size and
reload depend on that silo's level. The missile takes three seconds to
arrive and everyone can see where it will land. It wipes out troops,
buildings and ownership within its blast radius. The land stays irradiated
(green) for about 45 seconds, and while it does it costs 4× as many troops
to take.

**Sound:** the game plays synthesised sound effects for attacks, boats,
building, upgrades, artillery, nukes and the end of the game. Tap 🔊 at the
top of the screen to mute them. The setting is remembered.

The HUD shows troops and troop cap, gold, your share of the land, the clock
and a leaderboard. The bottom line lists your attacks and boats in progress,
or warns you about incoming attacks. **1× / 2× / 3×** changes the game speed
and **❚❚** pauses the game. On Android the back button cancels a build or
nuke, and otherwise pauses the game instead of leaving it.

### The AI opponents

Each rival gets a personality. Every game includes a **Warlord** (very
aggressive), a **Balanced** rival and a **Turtle** (saves up, expands slowly).
With four or five opponents, a **Raider** and a **Settler** join in.
Difficulty changes how fast rivals earn troops and gold (Easy ×0.64, Normal
×0.8, Hard ×0.96 of a human player's rate), how aggressive they are, and how
keen they are to target you. AI nations build and upgrade mines, cities, forts and artillery, and send
boats overseas. On Normal the more aggressive ones build nuclear silos. On Hard
most of them do. On Easy, no AI builds a silo.

## Multiplayer

Up to six players can share one war, on any mix of browsers, the Android
app and the Windows app. The lobby shows all six nation slots. Empty slots
are AI nations by default, and the host taps a slot to switch its AI on or
off (switch them all off for humans only). Each new player takes the next
slot. Your menu colour is your first choice, and you can change it in the
lobby.

1. Everyone types a name under **Multiplayer** on the main menu.
2. One person picks the map and difficulty, then taps **Host game**. A
   four-letter room code appears.
3. Everyone else types the code and taps **Join**.
4. In the lobby, each player taps a colour (taken colours are greyed out),
   and joiners tap **Ready**. The host switches AI slots on or off.
5. The host taps **Start game** once everyone is ready. If someone isn't,
   the host taps **Waiting for players** to give everyone 20 seconds (shown
   on every screen). When that runs out, the host can **Start anyway**. Anyone still not ready stays in
   the game with a random starting spot.
6. Everyone picks a country (or a spot on Random maps). The war starts once
   everyone has chosen.

How it works: a free public PeerJS server introduces the devices, so the
host and each joiner need an internet connection when they first connect.
After that the game traffic flows directly between devices over WebRTC, and
on the same Wi-Fi it stays on your LAN. The host's device runs the game:
joiners send their taps and receive the map about ten times a second.

- If a joiner leaves, an AI takes over their nation. If the host leaves, the
  game ends for everyone.
- Multiplayer games never pause. The ❚❚ menu stays open but the war carries
  on, and only the host can change the game speed.
- The host should keep the game on screen. Phones suspend background apps,
  which would freeze the game for everyone.
- To test on one computer, open the game in two tabs with `?localnet` added
  to the address, for example `http://localhost:8765/?localnet`. Those tabs
  talk directly to each other with no network.

## Play it

### In a browser

The game is live at <https://bradhunt5.github.io/pixel-war/>. It works in any
modern browser on a phone, tablet or computer.

### Android app (APK)

Every version tag (for example `v1.1.0`) makes GitHub build an APK
automatically. You can also start a build by hand: open the repository's
**Actions** tab, choose **Build apps** and click **Run workflow**.

1. On the phone, open the repository's **Releases** page and download
   `PixelWar.apk`. For a hand-started build, download it from the build's
   **Artifacts** instead.
2. Open the file. Android asks you to allow installs from your browser or
   file manager: allow it once.
3. Tap **Install**, then open **Pixel War** from the app drawer.

The APK is a debug build signed by GitHub's build machine. That's fine for
sideloading. Publishing to the Play Store would need a release signing key.

### Windows app

The same build produces two Windows files:

- `PixelWar-Setup.exe` installs Pixel War with a Start menu entry.
- `PixelWar-portable.exe` runs without installing.

Windows SmartScreen may warn that the app is from an unknown publisher,
because it isn't code-signed. Click **More info → Run anyway**. **F11**
toggles full screen.

### Install from the browser instead (no download)

In Chrome or Edge, open the site and choose **Install app** (on Android:
menu → **Add to Home screen**). You get the same full-screen game, and it
works offline.

### Run it on this Mac

```bash
cd ~/Claude/pixel-war
python3 -m http.server 8765
```

Then open <http://localhost:8765>. To run the desktop app instead (needs
Node.js):

```bash
npm install
npm run desktop
```

### Updating

After changing any file, bump `CACHE` in `sw.js` (for example
`pixel-war-v6`) and push. GitHub Pages updates the website, and installed web
apps pick up the new version the next time they are opened with a
connection. For new APK and Windows builds, push a new version tag:

```bash
git tag v1.2.0
```

```bash
git push origin v1.2.0
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page layout: HUD, menus, overlays |
| `style.css` | Mobile-first styling, including safe-area insets for notched phones |
| `game.js` | Map generation, simulation, buildings, AI, multiplayer, rendering and touch input |
| `sound.js` | Sound effects, synthesised with the Web Audio API (no audio files) |
| `localnet.js` | Same-device stand-in for PeerJS (`?localnet`), for testing multiplayer in two tabs |
| `vendor/peerjs.min.js` | PeerJS 1.5.4 (MIT licence), bundled so the apps don't need a CDN |
| `maps/world.js`, `maps/europe.js` | Real-world maps: country grids made from Natural Earth data |
| `sw.js` | Service worker that caches the game for offline play |
| `manifest.webmanifest` | PWA metadata: name, icons, full-screen display |
| `icons/` | App icons (192 px, 512 px and a maskable 512 px) |
| `tools/make_icons.py` | Regenerates the icons (`python3 tools/make_icons.py`) |
| `package.json`, `capacitor.config.json` | Android (Capacitor) and Windows (Electron) packaging |
| `electron/main.js` | The Windows app's window |
| `scripts/copy-web.js` | Copies the game into `www/` for packaging |
| `.github/workflows/build-apps.yml` | Builds the APK and Windows installers on GitHub |
| `tools/make_maps.py` | Regenerates the map files from Natural Earth's [world-atlas](https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json) TopoJSON |

## Tuning

The balance constants are at the top of `game.js`: `NEUTRAL_COST`, the
attack rates, `START_TROOPS`, `START_GOLD`, and the fort, artillery, nuke and
boat settings. Building costs and effects are in `BUILDINGS`. The difficulty table is `DIFFICULTY`, and the
AI personalities are `CORE_PERSONAS` and `EXTRA_PERSONAS`. Troop growth is in
`grow()` and the AI's decisions are in `aiThink()`.

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

## Possible next steps

- A Play Store release (needs a signing key and a developer account).
- Alliances and peace treaties with AI nations.
- Warships to intercept enemy boats.
- Background music.
- Fully offline LAN play (a QR-code handshake, or a native helper in the APK).
