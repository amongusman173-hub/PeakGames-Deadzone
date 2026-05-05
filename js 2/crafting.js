// ── Crafting recipes ──────────────────────────────────────────────────────────
const RECIPES = [
  // Hand
  {result:'campfire',    count:1, station:null,        req:{wood:5,stone:3,flint:1}},
  {result:'torch',       count:4, station:null,        req:{wood:2,coal:1}},
  {result:'torch_placed',count:2, station:null,        req:{wood:2,coal:1}},
  {result:'bandage',     count:2, station:null,        req:{cloth:3}},
  {result:'rope',        count:2, station:null,        req:{cloth:4}},
  {result:'workbench',   count:1, station:null,        req:{wood:12}},
  {result:'wooden_axe',  count:1, station:null,        req:{wood:5,rope:1}},
  {result:'wooden_pick', count:1, station:null,        req:{wood:6,rope:1}},
  {result:'wooden_sword',count:1, station:null,        req:{wood:6,rope:1}},
  {result:'seeds_wheat', count:2, station:null,        req:{wheat:1}},
  {result:'seeds_potato',count:1, station:null,        req:{potato:1}},
  {result:'seeds_carrot',count:2, station:null,        req:{carrot:1}},
  // Boat — faster water travel
  {result:'boat',        count:1, station:'workbench', req:{wood:20,rope:6,cloth:4}},
  // Lockpick
  {result:'lockpick',    count:3, station:'workbench', req:{iron_ingot:1,rope:1}},
  // Hammer — repair/deconstruct buildings
  {result:'hammer',      count:1, station:'workbench', req:{wood:4,iron_ingot:3,rope:1}},
  // Flashlight
  {result:'flashlight',  count:1, station:'workbench', req:{iron_ingot:4,coal:2,rope:1}},
  {result:'battery',     count:2, station:'workbench', req:{iron_ingot:1,coal:3}},
  // Workbench
  {result:'furnace',     count:1, station:'workbench', req:{stone:20,coal:5}},
  {result:'bed',         count:1, station:'workbench', req:{wood:10,cloth:6}},
  {result:'warm_coat',   count:1, station:'workbench', req:{cloth:8,rope:2}},
  {result:'fur_coat',    count:1, station:'workbench', req:{fur:6,rope:3}},
  {result:'wall_wood',   count:2, station:'workbench', req:{wood:6}},
  {result:'wall_stone',  count:2, station:'workbench', req:{stone:8}},
  {result:'door_wood',   count:1, station:'workbench', req:{wood:8,rope:2}},
  {result:'rain_collector',count:1,station:'workbench',req:{wood:8,cloth:4}},
  {result:'water_filter',count:1, station:'workbench', req:{wood:6,stone:4,coal:2}},
  {result:'empty_bottle',count:1, station:'workbench', req:{stone:4}},
  {result:'purified_water',count:1,station:'workbench',req:{dirty_water:1,coal:1}},
  {result:'stone_axe',   count:1, station:'workbench', req:{wood:3,stone:5,rope:1}},
  {result:'iron_axe',    count:1, station:'workbench', req:{wood:3,iron_ingot:4,rope:1}},
  {result:'stone_pick',  count:1, station:'workbench', req:{wood:3,stone:6,rope:1}},
  {result:'iron_pick',   count:1, station:'workbench', req:{wood:3,iron_ingot:5,rope:1}},
  {result:'gold_pick',   count:1, station:'workbench', req:{wood:3,gold_ingot:5,rope:1}},
  {result:'hoe',         count:1, station:'workbench', req:{wood:4,iron_ingot:2}},
  {result:'watering_can',count:1, station:'workbench', req:{iron_ingot:5}},
  {result:'fishing_rod', count:1, station:'workbench', req:{wood:4,rope:3}},
  {result:'stone_sword', count:1, station:'workbench', req:{wood:2,stone:8}},
  {result:'iron_sword',  count:1, station:'workbench', req:{wood:2,iron_ingot:6}},
  {result:'gold_sword',  count:1, station:'workbench', req:{wood:2,gold_ingot:6}},
  {result:'diamond_sword',count:1,station:'workbench', req:{wood:2,diamond:4,iron_ingot:2}},
  {result:'bat',         count:1, station:'workbench', req:{wood:8,rope:2}},
  {result:'machete',     count:1, station:'workbench', req:{iron_ingot:5,rope:1}},
  {result:'spear',       count:1, station:'workbench', req:{wood:6,iron_ingot:2,rope:2}},
  {result:'leather_helmet',count:1,station:'workbench',req:{cloth:5,rope:2}},
  {result:'leather_chest',count:1,station:'workbench', req:{cloth:8,rope:3}},
  {result:'leather_legs',count:1, station:'workbench', req:{cloth:6,rope:2}},
  {result:'iron_helmet', count:1, station:'workbench', req:{iron_ingot:5,cloth:2}},
  {result:'iron_chest',  count:1, station:'workbench', req:{iron_ingot:8,cloth:3}},
  {result:'iron_legs',   count:1, station:'workbench', req:{iron_ingot:6,cloth:2}},
  // ── Ranged weapons ───────────────────────────────────────────────────────────
  {result:'bow',          count:1, station:'workbench', req:{wood:6,rope:3}},
  {result:'arrow',        count:8, station:'workbench', req:{wood:4,flint:2,rope:1}},
  {result:'crossbow',     count:1, station:'workbench', req:{wood:8,iron_ingot:4,rope:2}},
  {result:'ammo_bolt',    count:6, station:'workbench', req:{wood:3,iron_ingot:1}},
  // ── Pistols ──────────────────────────────────────────────────────────────────
  {result:'m1911',        count:1, station:'workbench', req:{iron_ingot:10,gold_ingot:2,rope:1}},
  {result:'revolver',     count:1, station:'workbench', req:{iron_ingot:8,gold_ingot:3,rope:1}},
  {result:'desert_eagle', count:1, station:'workbench', req:{iron_ingot:12,gold_ingot:4,rope:1}},
  // ── SMGs ─────────────────────────────────────────────────────────────────────
  {result:'uzi',          count:1, station:'workbench', req:{iron_ingot:14,gold_ingot:3,rope:2}},
  {result:'mp5',          count:1, station:'workbench', req:{iron_ingot:16,gold_ingot:3,rope:2}},
  // ── Rifles ───────────────────────────────────────────────────────────────────
  {result:'m16',          count:1, station:'workbench', req:{iron_ingot:16,gold_ingot:4,rope:2}},
  {result:'ak47',         count:1, station:'workbench', req:{iron_ingot:18,gold_ingot:4,rope:2}},
  {result:'burst',        count:1, station:'workbench', req:{iron_ingot:16,gold_ingot:5,rope:2}},
  {result:'sniper',       count:1, station:'workbench', req:{iron_ingot:20,gold_ingot:6,diamond:2,rope:3}},
  // ── Shotguns ─────────────────────────────────────────────────────────────────
  {result:'mossberg',     count:1, station:'workbench', req:{iron_ingot:12,gold_ingot:3,rope:2}},
  {result:'double_barrel',count:1, station:'workbench', req:{iron_ingot:10,gold_ingot:2,wood:4,rope:2}},
  // ── Special ──────────────────────────────────────────────────────────────────
  {result:'crossbow',     count:1, station:'workbench', req:{wood:8,iron_ingot:4,rope:2}},
  {result:'railgun',      count:1, station:'workbench', req:{iron_ingot:30,gold_ingot:10,diamond:5,rope:4}},
  {result:'rpg',          count:1, station:'workbench', req:{iron_ingot:25,gold_ingot:8,rope:4}},
  // ── Ammo ─────────────────────────────────────────────────────────────────────
  {result:'ammo_45acp',   count:12, station:'workbench', req:{copper_ingot:2,gunpowder:3}},
  {result:'ammo_9mm',     count:15, station:'workbench', req:{copper_ingot:2,gunpowder:2}},
  {result:'ammo_357',     count:8,  station:'workbench', req:{copper_ingot:2,gunpowder:4}},
  {result:'ammo_556',     count:10, station:'workbench', req:{copper_ingot:3,gunpowder:4}},
  {result:'ammo_762',     count:8,  station:'workbench', req:{copper_ingot:3,gunpowder:5}},
  {result:'ammo_50bmg',   count:5,  station:'workbench', req:{copper_ingot:4,gunpowder:6}},
  {result:'ammo_12ga',    count:6,  station:'workbench', req:{copper_ingot:2,gunpowder:5}},
  {result:'ammo_rail',    count:3,  station:'workbench', req:{iron_ingot:3,gunpowder:8,diamond:1}},
  {result:'ammo_rocket',  count:2,  station:'workbench', req:{iron_ingot:5,gunpowder:10}},
  {result:'gunpowder',    count:4,  station:'workbench', req:{coal:2,sulfur:3}},
  // ── Copper smelting ───────────────────────────────────────────────────────────
  {result:'copper_ingot', count:1,  station:'furnace',   req:{copper_ore:2,coal:1}},
  // Furnace
  {result:'iron_ingot',  count:1, station:'furnace',   req:{iron_ore:2,coal:1}},
  {result:'gold_ingot',  count:1, station:'furnace',   req:{gold_ore:2,coal:1}},
  {result:'cooked_meat', count:1, station:'furnace',   req:{raw_meat:1,coal:1}},
  {result:'cooked_potato',count:1,station:'furnace',   req:{potato:1,coal:1}},
  {result:'bread',       count:1, station:'furnace',   req:{wheat:3,coal:1}},
];

function getCraftable(inv, station){
  return RECIPES.filter(r=>{
    if(r.station!==station) return false;
    return Object.entries(r.req).every(([k,v])=>(inv[k]||0)>=v);
  });
}

function applyCraft(inv, recipe){
  inv = {...inv};
  for(const [k,v] of Object.entries(recipe.req)){
    inv[k]=(inv[k]||0)-v;
    if(inv[k]<=0) delete inv[k];
  }
  inv[recipe.result]=(inv[recipe.result]||0)+recipe.count;
  return inv;
}
