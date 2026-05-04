# ☣ DEADZONE — Browser Zombie Survival Game

A fully browser-based multiplayer zombie survival game. No install, no server required — just open `index.html` or host on GitHub Pages.

---

## Play Online

**GitHub Pages:**
1. Push this repo to GitHub
2. Go to **Settings → Pages → Source: main branch / root**
3. Share `https://yourusername.github.io/yourrepo/`

---

## How to Start

### Solo (Offline)
1. Open `index.html` in any modern browser
2. Click **PLAY** → select a slot → choose **Solo** → **START GAME**

### Multiplayer — Method 1: Free P2P (PeerJS)
- No signup needed
- Works across different networks ~80% of the time
- Host clicks **PLAY** → **Free P2P** → **START GAME** → share the 6-letter Room Code
- Friends click **JOIN GAME** → enter the code

### Multiplayer — Method 2: Ably (100% reliable)
- Free tier at [ably.com](https://ably.com) — no credit card needed
- Get an API key from your Ably dashboard
- Both host and joining players paste the API key + room code

---

## Controls

| Key | Action |
|-----|--------|
| **WASD** | Move |
| **Shift** | Sprint (uses stamina) |
| **C** | Crouch (reduces zombie detection) |
| **Left Click** | Mine tiles / Loot / Interact |
| **Right Click** | Place block / Open workbench/furnace |
| **V** | Melee attack toward mouse |
| **F** | Loot nearby crate / Revive teammate |
| **X** | Whistle (alerts zombies, shows waypoint to teammates) |
| **E** | Inventory |
| **Tab** | Crafting menu |
| **1–9 / Scroll** | Hotbar |
| **T** | Proximity chat |
| **Esc** | Pause menu |

---

## Crafting Progression

```
Wood → Wooden tools/weapons
Stone → Stone tools/weapons
Iron Ore + Coal → Iron Ingot (Small Furnace) → Iron tools/armour/weapons
Gold Ore + Coal → Gold Ingot (Small Furnace)
Copper Ore + Coal → Copper Ingot (Small Furnace) → Ammo
Iron + Gold + Workbench → Pistols, Rifles, Shotguns
Diamond → Diamond Sword (best melee)
Iron + Gunpowder + Workbench → Railgun, RPG (endgame)
```

## Guns & Ammo

| Gun | Ammo | Notes |
|-----|------|-------|
| M1911 | .45 ACP | Reliable sidearm |
| Revolver | .357 | High damage, slow |
| Desert Eagle | .50 BMG | Powerful pistol |
| Uzi / MP5 | 9mm | Fast SMG |
| M16 / AK-47 | 5.56 / 7.62 | Assault rifles |
| Sniper | .50 BMG | Extreme range |
| Mossberg / Double Barrel | 12ga | Close range |
| Crossbow | Bolts | Silent |
| Railgun | Rail Slug | Endgame, 200 dmg |
| RPG | Rockets | Area damage |

**Ammo crafting:** Copper Ingot + Gunpowder → choose calibre at Workbench

---

## Survival Tips

- Build a **Bed** to set your respawn point
- **Night** spawns up to 30 zombies — build walls before dark
- **Cities** (rare) and **Neighbourhoods** (medium) have the best loot
- Enter buildings to reveal their interior (fog of war)
- **Gunshots alert zombies** — use crossbow or melee for stealth
- **Crouch** (C) to reduce zombie detection range by 55%
- **Whistle** (X) to alert zombies and show your position to teammates
- Craft **Lockpicks** to open locked doors silently
- **Hunger + Thirst** drain slowly — farm crops for sustainable food
- **Temperature** — wear fur coat in winter, stay near campfires
- Stamina locks out when below 10% — must fully recharge before sprinting again

## Difficulty Modes

| Mode | On Death |
|------|----------|
| Easy | Keep weapons & armour, drop resources |
| Normal | Drop everything, respawn at bed/spawn |
| Hardcore | World permanently deleted |

## Multiplayer Notes

- Downed players have **120 seconds** to be revived (press **F** near them)
- **PVP** is off by default — enable in new game settings
- Proximity chat — only nearby players see your messages
- State syncs at 20/sec for smooth movement

---

## File Structure

```
zombie_web/
├── index.html          — Main entry point
├── favicon.svg         — Biohazard favicon
├── css/
│   └── menu.css        — All menu/UI styles
├── js/
│   ├── constants.js    — Game constants, item/weapon data
│   ├── noise.js        — Procedural noise + seeded RNG
│   ├── world.js        — Chunk generation, biomes, buildings
│   ├── crafting.js     — All recipes
│   ├── entities.js     — Player, Zombie, Block classes
│   ├── weather.js      — Weather system
│   ├── sound.js        — Sound manager
│   ├── network_peer.js — PeerJS P2P networking
│   ├── network_ably.js — Ably realtime networking
│   ├── game.js         — Core game logic (authoritative)
│   ├── vfx.js          — Particles, rain, snow, effects
│   ├── renderer.js     — Canvas rendering
│   ├── ui.js           — HUD, inventory, crafting UI
│   └── main.js         — Entry point, game loop, input
└── sounds/             — 50+ sound effects
```
