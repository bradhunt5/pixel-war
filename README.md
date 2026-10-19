# Pixel War

A territory-conquest strategy game in the spirit of Roblox's *Pixel Conquest*.
It's built for phones, but it plays in any modern browser. It's plain HTML5,
CSS and JavaScript with no build step and no dependencies. You can install it
on Android as a Progressive Web App (PWA). Once installed it runs full-screen
and offline.

## How to play

1. Choose the number of opponents (2–5) and a difficulty, then press **Play**.
2. **Tap the map** to place your capital, or press **Random spot**.
3. Your troops grow over time. More land gives you more income and a higher
   troop cap.
4. Use the **Send** slider to choose what share of your troops to commit.
5. **Tap**, or **drag your finger** from your land, onto any territory that
   borders yours:
   - Grey land is unclaimed and cheap to take.
   - Enemy land costs more the more troops that faction holds.
   - The attack starts nearest the spot you tapped and spreads along the
     shared border.
6. Troops on the march leave your home weaker. Two attacks between the same
   pair of factions cancel each other out.
7. Wipe out every rival to win. If you lose your last pixel, you lose.

The HUD shows your troops and troop cap, your share of the land, the clock and
a leaderboard. The ⚔ line lists your attacks in progress. The ⚠ line warns
you about incoming attacks. **1× / 2× / 3×** changes the game speed and
**❚❚** pauses the game. On Android the back button pauses the game instead of
leaving it.

### The AI opponents

Each rival gets a personality. Every game includes a **Warlord** (very
aggressive), a **Balanced** rival and a **Turtle** (saves up, expands slowly).
With four or five opponents, a **Raider** and a **Settler** join in.
Difficulty changes how fast rivals earn troops (Easy ×0.8, Normal ×1.0,
Hard ×1.2), how aggressive they are, and how keen they are to target you.

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
| `game.js` | Map generation, simulation, AI, rendering and touch input |
| `sw.js` | Service worker that caches the game for offline play |
| `manifest.webmanifest` | PWA metadata: name, icons, full-screen display |
| `icons/` | App icons (192 px, 512 px and a maskable 512 px) |
| `tools/make_icons.py` | Regenerates the icons (`python3 tools/make_icons.py`) |

## Tuning

The balance constants are at the top of `game.js`: `NEUTRAL_COST`, the
attack rates and `START_TROOPS`. The difficulty table is `DIFFICULTY`, and the
AI personalities are `CORE_PERSONAS` and `EXTRA_PERSONAS`. Troop growth is in
`grow()` and the AI's decisions are in `aiThink()`.

## Possible next steps

- A real APK through Capacitor or a Trusted Web Activity (needs Node, a JDK
  and the Android SDK).
- Pinch to zoom on very large maps.
- Sound effects and music.
- Alliances, or local multiplayer on one device.
