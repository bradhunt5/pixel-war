# Pixel War

A territory-conquest strategy game in the spirit of Roblox's *Pixel Conquest*.
It's built for phones, but it plays in any modern browser. It's plain HTML5,
CSS and JavaScript with no build step. It also ships as an Android APK and a
Windows app, and up to six players can play together on any mix of devices.

## How to play

1. Choose a map (**World**, **Europe** or **Random** islands), the number of
   AI opponents (1–5), any **AI allies** (0–3), your colour and a
   difficulty, then press **Play**. Allies are on your team: they never
   attack you, and your team wins together. Opponents fight each other as
   well as you. The game holds six nations, so opponents are trimmed if
   allies plus opponents won't fit.
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
| 🏙️ City | 250 | +3,000 troop cap, +8 troops/s, +3 gold/s | +6,000 cap, +16 troops/s, +6 gold/s | +10,000 cap, +28 troops/s, +10 gold/s |
| ⛏️ Gold mine | 120 | +4 gold/s | +7 gold/s | +11 gold/s |
| 🛡️ Fort | 180 | Land within 8 cells 6× harder to take; holds a siege 2 s | 11 cells, 10×; 4 s | 14 cells, 15×; 6 s |
| 🎯 Artillery | 350 | Range 22, fires every 3.5 s | Range 28, every 2.4 s | Range 34, every 1.5 s, bigger blast |
| 🌊 Coastal battery | 400 | On the coast only; shells troop boats within 16 cells, one every 1.5 s, killing 20% aboard | 20 cells, every 1.1 s, 25% | 26 cells, every 0.9 s, 30% |
| ⚔️ Barracks | 300 | Your attacks cost 15% fewer troops | 25% | 35% |
| 📡 SAM site | 600 | Shoots down enemy nukes within 16 cells, every 20 s | 22 cells, 14 s | 28 cells, 9 s |
| 🚢 Shipyard | 450 | On the coast only; up to 2 warships | Up to 4 | Up to 6 (8 per nation in total) |
| ✈️ Airfield | 500 | Paradrops up to 80 cells away, every 25 s | 120 cells, 18 s | 170 cells, 12 s |
| ☢️ Nuclear silo | 1,200 | Nuke blast radius 7, 30 s reload | Radius 10, 20 s reload | Radius 13, 12 s reload; unlocks the Tsar Bomba |

**🌊 Coastal batteries** guard your shores against invasion. They fire one
shell at a time; each shell tracks its target and kills a share of the troops
aboard (boats sailing right alongside are caught in the blast too). A boat
that has lost most of its troops sinks, and shells already in the air still
land as a boat reaches the beach. Each battery picks a boat the others
aren't already shooting at, so a line of batteries can stop a whole
invasion fleet, while a single one only thins it out. With no boats about, they
shell enemy warships instead. Troop boats sail a little slower than they
used to, giving batteries and warships time to react.

Gold mines only go on gold deposits (the yellow dots). Forts make an
invasion a slog: inside a fort's range the attack line stalls on most ticks
(2× slower at level 1, 3× at level 2, 5× at level 3), invaders keep losing
troops while they're held up, and the fort itself has to be besieged for 2,
4 or 6 seconds before it falls. Defenders there also lose only half as many
troops when land falls, and forts take 6 artillery hits to destroy (7 at
level 2, 8 at level 3). A level 3 fort usually needs about five times the
defenders' troops, or a nuke, to break.

**🧱 Walls:** tap one of your forts to see your other forts within 40 cells
(scaled to the map) and wall them together (400 gold). The wall runs the
shortest way through your own land, curving with your border rather than
crossing enemy or unclaimed land, so only forts joined by your land can be
walled. Two walled forts act
as one big fort: land along the wall, out to the weaker fort's range, is
defended as if it were inside a fort. Each fort can have two walls, so you
can build a chain along a border. Walls are as tough as forts: to break
through, invaders must besiege the wall line just like a fort (2, 4 or 6
seconds by level), and the siege only progresses while they outnumber the
defenders 1.5×, 2× or 3× (the same goes for the forts themselves). An
overwhelmed wall is breached and comes down. A nuke, bomb or shell landing
on the wall line also destroys it, as does losing either fort or any of
the land under the wall.

**Upgrades:** tap one of your buildings to see what it does now and what the
next level adds, then tap **Upgrade**. Level 2 costs 1.2× the building's
base price and level 3 costs 2.4×. A small badge on the map shows a
building's level. Each upgrade also lets the building take one more
artillery hit.

**Power-ups**
- **☢☢ Tsar Bomba:** with a level 3 silo, a **☢☢** button appears. It costs
  4,000 gold and has a 2-minute reload. The super-nuke flies for 5 seconds,
  blasts about twice the radius of a top nuke and leaves 90 seconds of
  fallout. A SAM needs **two** hits to stop it.
- **📡 SAM sites** shoot down enemy nukes (the Tsar Bomba takes two hits),
  bombers and paratrooper planes that pass within range, one per reload.
  Each shot is a visible interceptor missile that flies up to meet its
  target and blows it up in mid-air. They protect allies too.
- **✈ Air operations:** with an airfield (or a carrier), tap **✈ Air** and
  choose:
  - **🪂 Paradrop:** your Send % of troops fly to any non-allied land in
    range, land and push inland.
  - **💣 Air strike (300g):** a bomber carpet-bombs the area with 6 bombs,
    killing troops, wrecking buildings and knocking out land. Aim at an enemy
    warship or troop boat and the bomber follows it and bombs it at sea:
    each hit costs a warship one hit point, and troop boats sink.
  Dashed circles show each airfield's reach. Both share the base's reload.
  After the drop the plane banks round and flies home; if it makes it back
  without being shot down, its airfield or carrier is ready to fly again
  straight away.
- **⚔️ Barracks:** the best one you own makes every attack (by land, boat
  or air) cheaper.
- **📦 Supply drops:** crates appear on unclaimed land every 30–50 seconds
  (up to four at a time). Whoever captures the cell first gets +600 gold,
  +25% troops or a free building upgrade.

**Navy**
- Build a **🚢 shipyard** on your coast, then tap it to launch warships:
  - **⚓ Battleship (400g):** every 2.5 seconds it fires at the nearest
    enemy target within about 14 cells: warships first, then troop boats
    (it sinks them, troops and all), then coastal buildings and land. It
    takes 5 hits to sink.
  - **🛩️ Aircraft carrier (1,500g):** a mobile airfield. ✈ Drop can launch
    from wherever it is (level 2 airfield range and reload). It has no guns
    and takes 10 hits to sink, so escort it.
- **Moving ships:** tap one of your ships to select it (a ring appears),
  then tap the sea, or near a coast, to send it there. It finds its own
  route, and a dashed line shows where it's heading.
- Artillery fires at enemy ships in range too. AI nations with a coastline
  build shipyards and send fleets against enemy coasts.

**Artillery** shells enemy land and buildings within range. Hits kill troops
and blast land back to neutral.

**Nukes** cost 900 gold. Tap **☢**, then tap an enemy target (you can't nuke
your own land). Each silo reloads separately, so two silos let you
fire twice as often, three silos three times as often, and so on. A nuke
fires from your best ready silo (highest level, then nearest the target),
and its blast size and reload depend on that silo's level. The ☢ button
shows how many silos are ready (for example ×2). The missile takes three seconds to
arrive and everyone can see where it will land. It wipes out troops,
buildings and ownership within its blast radius, and kills at least 10% of
the whole nation's troops (25% for the Tsar Bomba), more the more of its land
is destroyed, up to 85%. The land stays irradiated (green) for about 45
seconds, and while it does it costs 4× as many troops to take.

**Moving in after a strike:** land knocked out by a nuke, bomb or shell
can't be retaken by its old owner for a while (30 s after a nuke, 45 s after
a Tsar Bomba, 15 s after an air strike, 8 s after a shell), so the attacker
has the chance to move in first. Air strikes and shells also kill a share of
the target nation's troops with every hit.

**Sound and music:** the game plays synthesised sound effects and an
adaptive 8-bit chiptune soundtrack, all generated live with no audio files.
The music is calm on the menu and while you expand. A bassline joins when
you go to war, drums when you're under fire, and a lead melody when it's
all-out battle or a nuke is in the air. It ducks under nuclear blasts and
stops at the end of a game. Tap 🔊 at the top of the screen to cycle
**music and sound → sound effects only (🔉) → silent (🔇)**. The setting is
remembered. All sound goes quiet while the app is in the background or the
screen is locked, and comes back when you return.

The HUD shows troops and troop cap, gold, your share of the land, the clock
and a leaderboard showing each nation's share of the land and its troops (the
map labels show just names). The bottom line lists your attacks and boats in progress,
or warns you about incoming attacks. **1× / 2× / 3×** changes the game speed
and **❚❚** pauses the game. On Android the back button cancels a build or
nuke, and otherwise pauses the game instead of leaving it.

### The AI opponents

Each rival gets a personality. Every game includes a **Warlord** (very
aggressive), a **Balanced** rival and a **Turtle** (saves up, expands slowly).
With four or five opponents, a **Raider** and a **Settler** join in.
Difficulty changes how fast rivals earn troops and gold (Easy ×0.54, Normal
×0.68, Hard ×0.82 of a human player's rate), how aggressive they are, and how
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

**Teams:** the host taps a slot's team badge to cycle **No team → Team 1 →
Team 2 → Team 3**, for players and AI slots alike. Allies can't attack,
shell, land boats on or nuke each other, and AI allies leave you alone.
Nukes still hit everything in their blast, so mind where you drop them.
The game ends when only one team (or lone nation) is left, and everyone on
that team wins, including teammates knocked out earlier. With no teams set,
it's every nation for itself.

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
- If a joiner's connection drops (for example their phone suspends the app
  in the background), the game reconnects them automatically for up to 90
  seconds and hands their nation back. An AI runs it meanwhile.
- Multiplayer games never pause. The ❚❚ menu stays open but the war carries
  on, and only the host can change the game speed.
- The host's game keeps running when it is switched to the background, so
  everyone else can carry on. A phone may still suspend an app that stays in
  the background for long, so the host is best keeping the game on screen.
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
| `music.js` | Adaptive chiptune music (also synthesised), with war-room and synthwave styles available in code |
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
- Fully offline LAN play (a QR-code handshake, or a native helper in the APK).
