// ── Constants ─────────────────────────────────────────────────────────────────
const TILE_SIZE   = 40;
const CHUNK_SIZE  = 16;
const TICK_RATE   = 20;

// Tile IDs
const T = {
  GRASS:0, DIRT:1, STONE:2, SAND:3, WATER:4, TREE:5,
  ORE_IRON:6, ORE_COAL:7, ORE_GOLD:8, ORE_DIAMOND:9,
  FLOOR:10, WALL:11, ROAD:12, LOOT:13,
  FARMLAND:14, CROP_WHEAT:15, CROP_POTATO:16, CROP_CARROT:17,
  SNOW:18, ICE:19, SWAMP:20, DEEP_WATER:21,
  CAVE_ENTRANCE:22, CAVE_FLOOR:23, RADIO_TOWER:24,
};

const SOLID_TILES  = new Set([T.STONE,T.WALL,T.ORE_IRON,T.ORE_COAL,T.ORE_GOLD,T.ORE_DIAMOND]);
// Trees are walkable — slow you down but don't block
const SLOW_TILES   = new Set([T.TREE]);
const WATER_TILES  = new Set([T.WATER,T.DEEP_WATER]);
const MINE_TILES   = new Set([T.STONE,T.TREE,T.ORE_IRON,T.ORE_COAL,T.ORE_GOLD,T.ORE_DIAMOND,T.CAVE_FLOOR]);
const FARM_TILES   = new Set([T.GRASS,T.DIRT]);

// Richer tile colours — no more flat pixel art look
const TILE_COLOR = {
  [T.GRASS]:      '#3d8c2e',
  [T.DIRT]:       '#7a5230',
  [T.STONE]:      '#6e6e6e',
  [T.SAND]:       '#c8b464',
  [T.WATER]:      '#2a6ab4',
  [T.DEEP_WATER]: '#1a4a8c',
  [T.TREE]:       '#1a5c18',
  [T.ORE_IRON]:   '#9c6840',
  [T.ORE_COAL]:   '#2a2a2a',
  [T.ORE_GOLD]:   '#c8a820',
  [T.ORE_DIAMOND]:'#40c8c8',
  [T.FLOOR]:      '#9c8870',
  [T.WALL]:       '#585048',
  [T.ROAD]:       '#404040',
  [T.LOOT]:       '#b08820',
  [T.FARMLAND]:   '#5c3818',
  [T.CROP_WHEAT]: '#c8b430',
  [T.CROP_POTATO]:'#8c6420',
  [T.CROP_CARROT]:'#c86420',
  [T.SNOW]:       '#d0dce8',
  [T.ICE]:        '#98b8d0',
  [T.SWAMP]:      '#2e4e28',
  [T.CAVE_ENTRANCE]:'#1a1a1a',
  [T.CAVE_FLOOR]: '#2a2020',
  [T.RADIO_TOWER]:'#707070',
};

// Biome ground colour overrides (used by renderer for variety)
const BIOME_GRASS_COL = {
  plains:       '#3d8c2e',
  forest:       '#2e7a22',
  dense_forest: '#1e6018',
  jungle:       '#2a8a18',
  swamp:        '#2a4a20',
  tundra:       '#8a9a88',
  desert:       '#c8b464',
};

// Tile detail colours (secondary shading drawn on top)
const TILE_DETAIL = {
  [T.GRASS]:      '#2e6e20',
  [T.STONE]:      '#585858',
  [T.TREE]:       '#0e4010',
  [T.WATER]:      '#3a7ac8',
  [T.DEEP_WATER]: '#1e3a78',
  [T.SNOW]:       '#e8f0f8',
  [T.SAND]:       '#d8c070',
};

const DIFF = { EASY:'easy', NORMAL:'normal', HARDCORE:'hardcore' };

// Player — speeds
const PLAYER_MAX_HP       = 100;
const PLAYER_SPEED        = 3.5;   // tiles/sec walk — was 2.0, too slow
const PLAYER_CROUCH_SPEED = 1.6;
const PLAYER_SPRINT_SPEED = 5.5;   // tiles/sec sprint
const PLAYER_MAX_HUNGER   = 100;
const PLAYER_MAX_THIRST   = 100;
const PLAYER_HUNGER_RATE  = 0.06;
const PLAYER_THIRST_RATE  = 0.09;
const PLAYER_MAX_STAMINA  = 100;
const PLAYER_STAMINA_DRAIN= 6;
const PLAYER_STAMINA_REGEN= 7;     // slow regen — takes ~14s to fully recharge
const PLAYER_SPRINT_MULT  = 1.6;
const STAMINA_LOCK_THRESHOLD = 0;  // lock ONLY at 0, unlock at 100%

// Infection system
const INFECTION_BITE_CHANCE  = 0.15;  // 15% chance per zombie bite
const INFECTION_MAX          = 100;
const INFECTION_HUNGER_MULT  = 2.0;   // 2x hunger drain at 50%+
const INFECTION_LUNGE_CHANCE = 0.25;  // 25% chance to lunge at friend at 75%+
const INFECTION_DEATH_TIME   = 60;    // seconds at 100% before death

// Blocking
const BLOCK_PERFECT_WINDOW   = 0.25;  // seconds for perfect block
const BLOCK_STUN_NORMAL      = 0.8;   // seconds stun on normal block
const BLOCK_STUN_PERFECT     = 2.0;   // seconds stun on perfect block

// Melee
const MELEE_COOLDOWN         = 0.5;   // seconds between swings
const MELEE_HEAVY_CHARGE     = 1.2;   // seconds hold for heavy attack
const MELEE_HEAVY_MULT       = 2.5;   // damage multiplier for heavy
const REVIVE_TIME         = 120;
const SPAWN_PROTECTION    = 30;

// Temperature thresholds — damage only below 20°C or above 43°C
const TEMP_COLD_THRESHOLD = 20.0;
const TEMP_HOT_THRESHOLD  = 43.0;
const TEMP_FREEZE_DMG     = 0.8;   // hp/sec
const TEMP_HEAT_THIRST    = 0.3;   // extra thirst/sec when hot

// Weather
const W = {
  CLEAR:'clear',CLOUDY:'cloudy',RAIN:'rain',STORM:'storm',
  SNOW:'snow',BLIZZARD:'blizzard',HEATWAVE:'heatwave',FOG:'fog'
};
const WEATHER_TEMP_MOD = {
  clear:0,cloudy:-2,rain:-5,storm:-8,snow:-15,blizzard:-25,heatwave:15,fog:-3
};
// Weather duration ranges [min, max] seconds — was infinite, now bounded
const WEATHER_DURATION = {
  clear:[180,500], cloudy:[90,280], rain:[80,200], storm:[50,130],
  snow:[90,220], blizzard:[40,100], heatwave:[70,160], fog:[70,220]
};
const WEATHER_COOLDOWN = {
  clear:60, cloudy:40, rain:60, storm:40,
  snow:60, blizzard:30, heatwave:60, fog:50
};

// Items
const ITEMS = {
  wood:'Wood',stone:'Stone',iron_ore:'Iron Ore',coal:'Coal',
  gold_ore:'Gold Ore',diamond:'Diamond',iron_ingot:'Iron Ingot',
  gold_ingot:'Gold Ingot',cloth:'Cloth',rope:'Rope',
  gunpowder:'Gunpowder',sulfur:'Sulfur',flint:'Flint',
  copper_ore:'Copper Ore',copper_ingot:'Copper Ingot',
  gun_parts:'Gun Parts',blueprint_pistol:'Blueprint: M1911',
  blueprint_rifle:'Blueprint: M16',blueprint_shotgun:'Blueprint: Mossberg',
  food_can:'Canned Food',raw_meat:'Raw Meat',cooked_meat:'Cooked Meat',
  wheat:'Wheat',potato:'Potato',carrot:'Carrot',bread:'Bread',
  cooked_potato:'Cooked Potato',water_bottle:'Water Bottle',
  dirty_water:'Dirty Water',purified_water:'Purified Water',
  empty_bottle:'Empty Bottle',seeds_wheat:'Wheat Seeds',
  seeds_potato:'Potato Seeds',seeds_carrot:'Carrot Seeds',
  medkit:'Medkit',bandage:'Bandage',antibiotics:'Antibiotics',
  vitamins:'Vitamins',fur:'Animal Fur',warm_coat:'Warm Coat',
  campfire:'Campfire',torch:'Torch',
  wooden_axe:'Wooden Axe',stone_axe:'Stone Axe',iron_axe:'Iron Axe',
  wooden_pick:'Wooden Pickaxe',stone_pick:'Stone Pickaxe',
  iron_pick:'Iron Pickaxe',gold_pick:'Gold Pickaxe',
  hoe:'Hoe',watering_can:'Watering Can',fishing_rod:'Fishing Rod',
  wooden_sword:'Wooden Sword',stone_sword:'Stone Sword',
  iron_sword:'Iron Sword',gold_sword:'Gold Sword',
  diamond_sword:'Diamond Sword',bat:'Baseball Bat',
  machete:'Machete',spear:'Spear',
  leather_helmet:'Leather Helmet',leather_chest:'Leather Chestplate',
  leather_legs:'Leather Leggings',iron_helmet:'Iron Helmet',
  iron_chest:'Iron Chestplate',iron_legs:'Iron Leggings',fur_coat:'Fur Coat',
  bow:'Bow',arrow:'Arrow',
  // Pistols
  m1911:'M1911 Pistol',revolver:'Revolver',desert_eagle:'Desert Eagle',
  // SMGs
  uzi:'Uzi',mp5:'MP5',
  // Rifles
  m16:'M16 Rifle',ak47:'AK-47',sniper:'Sniper Rifle',burst:'M16 Burst',
  // Shotguns
  mossberg:'Mossberg 500',double_barrel:'Double Barrel',
  // Special
  crossbow:'Crossbow',railgun:'Railgun',rpg:'RPG',
  // Ammo
  ammo_45acp:'Ammo .45 ACP',ammo_9mm:'Ammo 9mm',ammo_357:'Ammo .357',
  ammo_556:'Ammo 5.56mm',ammo_762:'Ammo 7.62mm',ammo_50bmg:'Ammo .50 BMG',
  ammo_12ga:'Ammo 12ga',ammo_bolt:'Crossbow Bolt',ammo_rail:'Rail Slug',
  ammo_rocket:'Rocket',
  workbench:'Workbench',workbench_t2:'Workbench T2',
  furnace_small:'Small Furnace',furnace_medium:'Medium Furnace',furnace_large:'Large Furnace',
  stove:'Stove',bed:'Bed',
  wall_wood:'Wooden Wall',wall_stone:'Stone Wall',door_wood:'Wooden Door',
  rain_collector:'Rain Collector',water_filter:'Water Filter',
  flashlight:'Flashlight',battery:'Battery',
  paper:'Paper',map_item:'Hand-drawn Map',atlas:'Atlas',
  backpack_small:'Small Backpack',backpack_medium:'Medium Backpack',backpack_large:'Large Backpack',
  walkie_talkie:'Walkie-Talkie',electronic_parts:'Electronic Parts',
  wire:'Wire',cpu:'CPU',
  boat:'Boat',
  lockpick:'Lockpick',whistle:'Whistle',
  door_locked:'Locked Door',
  hammer:'Hammer',
  radio_tower:'Radio Tower',
  cave_entrance:'Cave Entrance',
};

const WEAPON_DAMAGE = {
  // Melee
  wooden_sword:12, stone_sword:18, iron_sword:28, gold_sword:22,
  diamond_sword:45, bat:15, machete:20, spear:22,
  // Bows
  bow:25, crossbow:40,
  // Pistols
  m1911:35, revolver:55, desert_eagle:65,
  // SMGs
  uzi:18, mp5:22,
  // Rifles
  m16:60, ak47:55, sniper:120, burst:45,
  // Shotguns (per pellet × 6)
  mossberg:80, double_barrel:100,
  // Special
  railgun:200, rpg:300,
};
const WEAPON_RANGE = {
  wooden_sword:1.4, stone_sword:1.4, iron_sword:1.5, gold_sword:1.5,
  diamond_sword:1.6, bat:1.4, machete:1.5, spear:2.0,
  bow:9, crossbow:12,
  m1911:11, revolver:10, desert_eagle:12,
  uzi:8, mp5:9,
  m16:22, ak47:20, sniper:35, burst:18,
  mossberg:4.5, double_barrel:4.0,
  railgun:40, rpg:15,
};
const WEAPON_AMMO = {
  bow:'arrow', crossbow:'ammo_bolt',
  m1911:'ammo_45acp', revolver:'ammo_357', desert_eagle:'ammo_50bmg',
  uzi:'ammo_9mm', mp5:'ammo_9mm',
  m16:'ammo_556', ak47:'ammo_762', sniper:'ammo_50bmg', burst:'ammo_556',
  mossberg:'ammo_12ga', double_barrel:'ammo_12ga',
  railgun:'ammo_rail', rpg:'ammo_rocket',
};
// Fire rate (attacks per second)
const WEAPON_FIRERATE = {
  m1911:2.5, revolver:1.2, desert_eagle:1.5,
  uzi:8, mp5:7,
  m16:3, ak47:4, sniper:0.5, burst:1.5,
  mossberg:1, double_barrel:0.8,
  crossbow:0.6, bow:0.8,
  railgun:0.3, rpg:0.4,
};
const RANGED = new Set(['bow','crossbow','m1911','revolver','desert_eagle','uzi','mp5','m16','ak47','sniper','burst','mossberg','double_barrel','railgun','rpg']);

const ARMOUR_DEFENCE = {
  leather_helmet:2,leather_chest:4,leather_legs:3,
  iron_helmet:5,iron_chest:10,iron_legs:7,
  fur_coat:3,warm_coat:1,  // coats give small defence + warmth
};
const ARMOUR_WARMTH = {
  leather_helmet:2,leather_chest:3,leather_legs:2,
  iron_helmet:0,iron_chest:0,iron_legs:0,fur_coat:15,warm_coat:12
};
const ARMOUR_SLOTS = ['helmet','chest','legs'];

const FOOD_VALUES = {
  food_can:[40,10,5],raw_meat:[20,0,-5],cooked_meat:[45,5,10],
  wheat:[10,0,0],potato:[15,5,0],carrot:[12,8,2],
  bread:[35,0,5],cooked_potato:[30,5,5]
};
const DRINK_VALUES = {
  water_bottle:[0,50,0],dirty_water:[0,30,-10],purified_water:[0,60,5]
};

const BLOCK_HP = {
  wall_wood:80,wall_stone:200,door_wood:60,
  workbench:100,workbench_t2:150,
  furnace_small:120,furnace_medium:180,furnace_large:250,stove:140,
  bed:50,campfire:40,rain_collector:60,water_filter:80,
  torch_placed:20,  // placeable torch
  radio_tower:300,
};
const PLACEABLE = new Set(Object.keys(BLOCK_HP));

const CROP_GROWTH = {
  seeds_wheat: {tile:T.CROP_WHEAT,  ticks:1200,yield:['wheat',2,4],  seed:'seeds_wheat'},
  seeds_potato:{tile:T.CROP_POTATO, ticks:1800,yield:['potato',1,3], seed:'seeds_potato'},
  seeds_carrot:{tile:T.CROP_CARROT, ticks:1500,yield:['carrot',2,5], seed:'seeds_carrot'},
};

// Zombie types — new variants added
const ZOMBIE_TYPES = {
  walker:  {hp:50,  speed:1.0, damage:8,  xp:10, aggro:12, col1:'#2a6e1a', col2:'#1a4e0a', eyeCol:'#ff2020'},
  runner:  {hp:30,  speed:2.6, damage:5,  xp:15, aggro:16, col1:'#1a8e30', col2:'#0a6e20', eyeCol:'#ff6020'},
  brute:   {hp:220, speed:0.6, damage:28, xp:40, aggro:10, col1:'#1a4a0a', col2:'#0a2a04', eyeCol:'#ff0000'},
  spitter: {hp:40,  speed:1.4, damage:12, xp:20, aggro:14, col1:'#4a8a10', col2:'#2a6a08', eyeCol:'#80ff00'},
  frozen:  {hp:70,  speed:0.8, damage:10, xp:18, aggro:10, col1:'#6090b0', col2:'#4070a0', eyeCol:'#a0d0ff'},
  speedy:  {hp:20,  speed:3.8, damage:4,  xp:18, aggro:20, col1:'#20a040', col2:'#108030', eyeCol:'#ffff00'},
  crawler: {hp:60,  speed:0.5, damage:15, xp:22, aggro:8,  col1:'#3a5a10', col2:'#1a3a08', eyeCol:'#ff4040'},
  tank:    {hp:500, speed:0.4, damage:35, xp:80, aggro:8,  col1:'#0a2a04', col2:'#061802', eyeCol:'#ff0000'},
};

// Item icons — ASCII/Unicode clipart for hotbar and inventory
const ITEM_ICONS = {
  // Resources
  wood:'[=]', stone:'[o]', iron_ore:'[Fe]', coal:'[C]', gold_ore:'[Au]',
  diamond:'[*]', iron_ingot:'[I]', gold_ingot:'[G]', cloth:'[~]', rope:'[8]',
  gunpowder:'[!]', sulfur:'[S]', flint:'[/]', copper_ore:'[Cu]', copper_ingot:'[cu]',
  // Food/drink
  food_can:'[F]', raw_meat:'[m]', cooked_meat:'[M]', wheat:'[w]', potato:'[p]',
  carrot:'[c]', bread:'[B]', cooked_potato:'[P]', water_bottle:'[H]',
  dirty_water:'[d]', purified_water:'[W]', empty_bottle:'[b]',
  seeds_wheat:'[sw]', seeds_potato:'[sp]', seeds_carrot:'[sc]',
  // Medicine
  medkit:'[+]', bandage:'[+]', antibiotics:'[Rx]', vitamins:'[V]',
  // Warmth
  fur:'[f]', warm_coat:'[wc]', fur_coat:'[fc]',
  // Light
  campfire:'[^]', torch:'[|]', torch_placed:'[|]', flashlight:'[>]', battery:'[Ba]',
  // Tools
  wooden_axe:'[xa]', stone_axe:'[xs]', iron_axe:'[xi]',
  wooden_pick:'[pa]', stone_pick:'[ps]', iron_pick:'[pi]', gold_pick:'[pg]',
  hoe:'[h]', watering_can:'[wc]', fishing_rod:'[fr]', hammer:'[H]',
  // Melee weapons
  wooden_sword:'[/]', stone_sword:'[/]', iron_sword:'[/]',
  gold_sword:'[/]', diamond_sword:'[/]', bat:'[)]', machete:'[L]', spear:'[>>]',
  // Armour
  leather_helmet:'[lh]', leather_chest:'[lc]', leather_legs:'[ll]',
  iron_helmet:'[ih]', iron_chest:'[ic]', iron_legs:'[il]',
  // Ranged
  bow:'[)]', arrow:'[->]', crossbow:'[X]',
  m1911:'[M1]', revolver:'[Rv]', desert_eagle:'[DE]',
  uzi:'[Uz]', mp5:'[M5]', m16:'[M6]', ak47:'[AK]',
  sniper:'[Sn]', burst:'[Bu]', mossberg:'[Mo]', double_barrel:'[DB]',
  crossbow_bolt:'[Bt]', railgun:'[Rg]', rpg:'[RP]',
  // Ammo
  ammo_45acp:'[45]', ammo_9mm:'[9m]', ammo_357:'[37]',
  ammo_556:'[56]', ammo_762:'[76]', ammo_50bmg:'[50]',
  ammo_12ga:'[12]', ammo_bolt:'[Bt]', ammo_rail:'[Rl]', ammo_rocket:'[Rk]',
  // Buildables
  workbench:'[WB]', workbench_t2:'[W2]',
  furnace_small:'[Fs]', furnace_medium:'[Fm]', furnace_large:'[FL]', stove:'[St]',
  bed:'[Bd]', wall_wood:'[##]', wall_stone:'[##]', door_wood:'[|]',
  rain_collector:'[RC]', water_filter:'[WF]',
  // Special
  boat:'[~~]', lockpick:'[lp]', whistle:'[wh]', hammer:'[Hm]',
  paper:'[Pp]', map_item:'[Mp]', atlas:'[At]',
  backpack_small:'[bs]', backpack_medium:'[bm]', backpack_large:'[bL]',
  walkie_talkie:'[WT]', electronic_parts:'[EP]', wire:'[~~]', cpu:'[CP]',
};

const TILE_DROPS = {
  [T.TREE]:       [['wood',2,5],['rope',0,1]],
  [T.STONE]:      [['stone',2,4],['flint',0,1]],
  [T.ORE_COAL]:   [['coal',2,4],['copper_ore',0,2]],  // coal veins also have copper
  [T.ORE_IRON]:   [['iron_ore',1,3]],
  [T.ORE_GOLD]:   [['gold_ore',1,2]],
  [T.ORE_DIAMOND]:[['diamond',1,2]],
};

const SETTLEMENT_CITY_THRESHOLD  = 0.86;  // was 0.80 — rarer cities
const SETTLEMENT_HOOD_THRESHOLD  = 0.76;  // was 0.65 — fewer neighbourhoods

// Weapon/armour durability (max durability per item)
const ITEM_DURABILITY = {
  // Melee
  wooden_sword:80, stone_sword:120, iron_sword:200, gold_sword:150,
  diamond_sword:400, bat:100, machete:180, spear:150,
  // Ranged
  bow:120, crossbow:150,
  m1911:200, revolver:180, desert_eagle:160,
  uzi:180, mp5:200,
  m16:220, ak47:250, sniper:180, burst:200,
  mossberg:200, double_barrel:160,
  railgun:100, rpg:80,
  // Armour
  leather_helmet:80, leather_chest:120, leather_legs:100,
  iron_helmet:200, iron_chest:300, iron_legs:250, fur_coat:100,
  // Tools
  wooden_axe:60, stone_axe:100, iron_axe:180,
  wooden_pick:60, stone_pick:100, iron_pick:180, gold_pick:150,
  hoe:120, hammer:200,
};

// Gun jam chance at low durability (below 20%)
const GUN_JAM_CHANCE = 0.15; // 15% chance per shot when durability < 20%
const ZOMBIE_MAX_NIGHT = 30;
const ZOMBIE_MAX_DAY   = 8;
const ZOMBIE_SPAWN_INTERVAL = 4.0;

// Interaction ranges (must match game.js)
const MELEE_RANGE    = 2.2;
const INTERACT_RANGE = 2.5;  // increased — was 1.8
const MINE_REACH     = 3.5;
