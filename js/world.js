// ── World / chunk generation ──────────────────────────────────────────────────

function getBiome(wx, wy, seed){
  // Use larger scale so biomes are bigger and more varied
  const temp  = octaveNoise(wx,wy,seed^0xABCD,3,0.5,0.005);
  const moist = octaveNoise(wx,wy,seed^0x1234,3,0.5,0.005);
  const weird = octaveNoise(wx,wy,seed^0x5678,2,0.5,0.004);
  // Tundra: cold (low temp)
  if(temp<0.22) return 'tundra';
  // Desert: hot and dry
  if(temp>0.78&&moist<0.28) return 'desert';
  // Swamp: very wet
  if(moist>0.75) return 'swamp';
  // Dense forest: moderate temp, very wet + weird
  if(temp>0.45&&moist>0.60&&weird>0.55) return 'dense_forest';
  // Jungle: hot and wet
  if(temp>0.68&&moist>0.55) return 'jungle';
  // Forest: moderate temp and moisture
  if(temp>0.42&&moist>0.48&&temp<0.68) return 'forest';
  // Plains: everything else (most common)
  return 'plains';
}

function getSettlement(cx, cy, seed){
  const v = octaveNoise(cx*CHUNK_SIZE,cy*CHUNK_SIZE,seed^0xC1C1,2,0.5,0.04);
  if(v > SETTLEMENT_CITY_THRESHOLD) return 'city';
  if(v > SETTLEMENT_HOOD_THRESHOLD) return 'neighbourhood';
  return 'none';
}

function generateChunk(cx, cy, seed){
  const rng   = makeRng(seed ^ (cx*73856093) ^ (cy*19349663));
  const tiles = Array.from({length:CHUNK_SIZE},()=>new Uint8Array(CHUNK_SIZE));
  const oreHp = {};
  const loots = [];

  for(let ly=0;ly<CHUNK_SIZE;ly++){
    for(let lx=0;lx<CHUNK_SIZE;lx++){
      const wx=cx*CHUNK_SIZE+lx, wy=cy*CHUNK_SIZE+ly;
      const biome=getBiome(wx,wy,seed);
      const elev =octaveNoise(wx,wy,seed,5,0.5,0.012);
      const moist=octaveNoise(wx,wy,seed^0x1234,3,0.5,0.008);
      let tile;
      if(elev<0.20)      tile=T.DEEP_WATER;
      else if(elev<0.28) tile=T.WATER;
      else if(elev<0.33) tile=T.SAND;  // beach
      else {
        if(biome==='tundra')        tile=elev<0.72?T.SNOW:T.ICE;
        else if(biome==='desert')   tile=T.SAND;
        else if(biome==='swamp')    tile=moist>0.55?T.SWAMP:T.GRASS;
        else if(biome==='jungle')   tile=T.GRASS;
        else                        tile=T.GRASS;
      }
      // Stone only at very high elevation — no more dark patches
      if(elev>0.82&&!WATER_TILES.has(tile)&&tile!==T.SAND) tile=T.STONE;
      else if(elev>0.75&&tile===T.GRASS) tile=T.DIRT; // rocky transition
      tiles[ly][lx]=tile;

      if(tile===T.STONE){
        const r=rng();
        if(r<0.08){      tiles[ly][lx]=T.ORE_COAL;    oreHp[`${lx},${ly}`]=60; }
        else if(r<0.14){ tiles[ly][lx]=T.ORE_IRON;    oreHp[`${lx},${ly}`]=80; }
        else if(r<0.19){ tiles[ly][lx]=T.ORE_COAL;    oreHp[`${lx},${ly}`]=60; } // copper uses coal slot for now
        else if(r<0.22){ tiles[ly][lx]=T.ORE_GOLD;    oreHp[`${lx},${ly}`]=100;}
        else if(r<0.225){tiles[ly][lx]=T.ORE_DIAMOND; oreHp[`${lx},${ly}`]=120;}
        else             oreHp[`${lx},${ly}`]=50;
      }
      if(tiles[ly][lx]===T.GRASS&&(biome==='forest'||biome==='dense_forest'||biome==='jungle'||biome==='plains'||biome==='swamp')){
        const d = biome==='dense_forest'?0.22 : biome==='jungle'?0.18 : biome==='forest'?0.14 : biome==='swamp'?0.08 : 0.05;
        if(rng()<d){ tiles[ly][lx]=T.TREE; oreHp[`${lx},${ly}`]=40; }
      }
      // Plains: add scattered rocks and bushes for visual variety
      if(tiles[ly][lx]===T.GRASS&&biome==='plains'){
        const v=rng();
        if(v<0.015){ tiles[ly][lx]=T.STONE; oreHp[`${lx},${ly}`]=30; } // small rock
        else if(v<0.025){ tiles[ly][lx]=T.DIRT; } // dirt patch
      }
      // Desert: occasional stone outcrops
      if(tiles[ly][lx]===T.SAND&&biome==='desert'&&rng()<0.02){
        tiles[ly][lx]=T.STONE; oreHp[`${lx},${ly}`]=30;
      }
    }
  }

  const stype=getSettlement(cx,cy,seed);
  // Never place settlements in water-dominated chunks
  const landCount = Array.from({length:CHUNK_SIZE},(_,y)=>Array.from({length:CHUNK_SIZE},(_,x)=>tiles[y][x]))
    .flat().filter(t=>!WATER_TILES.has(t)&&t!==T.DEEP_WATER&&t!==T.WATER).length;
  const isLandChunk = landCount > CHUNK_SIZE*CHUNK_SIZE*0.6;

  if(isLandChunk){
    if(stype==='city')              genCity(tiles,loots,oreHp,rng);
    else if(stype==='neighbourhood') genNeighbourhood(tiles,loots,oreHp,rng);
  }

  // ── Caves — spawn in stone/mountain areas ─────────────────────────────────
  const stoneCount=Array.from({length:CHUNK_SIZE},(_,y)=>Array.from({length:CHUNK_SIZE},(_,x)=>tiles[y][x])).flat().filter(t=>t===T.STONE).length;
  if(stoneCount>15&&rng()<0.3){
    for(let attempt=0;attempt<12;attempt++){
      const lx=rngInt(rng,2,CHUNK_SIZE-3), ly=rngInt(rng,2,CHUNK_SIZE-3);
      if(tiles[ly][lx]===T.STONE){
        tiles[ly][lx]=T.CAVE_ENTRANCE;
        oreHp[`${lx},${ly}`]=999;
        const caveR=rngInt(rng,3,6);
        for(let dy2=-caveR;dy2<=caveR;dy2++) for(let dx2=-caveR;dx2<=caveR;dx2++){
          const cx2=lx+dx2, cy2=ly+dy2;
          if(cx2<0||cy2<0||cx2>=CHUNK_SIZE||cy2>=CHUNK_SIZE) continue;
          if(Math.hypot(dx2,dy2)<=caveR&&tiles[cy2][cx2]===T.STONE){
            const r2=rng();
            if(r2<0.12)       { tiles[cy2][cx2]=T.ORE_COAL;    oreHp[`${cx2},${cy2}`]=60; }
            else if(r2<0.20)  { tiles[cy2][cx2]=T.ORE_IRON;    oreHp[`${cx2},${cy2}`]=80; }
            else if(r2<0.24)  { tiles[cy2][cx2]=T.ORE_GOLD;    oreHp[`${cx2},${cy2}`]=100; }
            else if(r2<0.245) { tiles[cy2][cx2]=T.ORE_DIAMOND; oreHp[`${cx2},${cy2}`]=120; }
            else               tiles[cy2][cx2]=T.CAVE_FLOOR;
          }
        }
        if(rng()<0.6){
          const llx=lx+rngInt(rng,-2,2), lly=ly+rngInt(rng,-2,2);
          if(llx>=0&&lly>=0&&llx<CHUNK_SIZE&&lly<CHUNK_SIZE&&(tiles[lly][llx]===T.CAVE_FLOOR)){
            tiles[lly][llx]=T.LOOT;
            loots.push({x:llx,y:lly,items:rollLoot(rng,'city')});
          }
        }
        break;
      }
    }
  }

  // ── Radio towers — rare, open areas ──────────────────────────────────────
  if(stype==='none'&&isLandChunk&&rng()<0.04){
    for(let attempt=0;attempt<10;attempt++){
      const lx=rngInt(rng,2,CHUNK_SIZE-3), ly=rngInt(rng,2,CHUNK_SIZE-3);
      if(tiles[ly][lx]===T.GRASS||tiles[ly][lx]===T.DIRT){
        tiles[ly][lx]=T.RADIO_TOWER;
        oreHp[`${lx},${ly}`]=300;
        for(let dy2=-1;dy2<=1;dy2++) for(let dx2=-1;dx2<=1;dx2++){
          const tx2=lx+dx2, ty2=ly+dy2;
          if(tx2>=0&&ty2>=0&&tx2<CHUNK_SIZE&&ty2<CHUNK_SIZE&&tiles[ty2][tx2]===T.TREE)
            tiles[ty2][tx2]=T.DIRT;
        }
        const llx=lx+rngInt(rng,-2,2), lly=ly+rngInt(rng,-2,2);
        if(llx>=0&&lly>=0&&llx<CHUNK_SIZE&&lly<CHUNK_SIZE&&tiles[lly][llx]===T.GRASS){
          tiles[lly][llx]=T.LOOT;
          loots.push({x:llx,y:lly,items:{electronic_parts:rngInt(rng,1,3),wire:rngInt(rng,1,2),battery:rngInt(rng,0,1)}});
        }
        break;
      }
    }
  }

  // Convert tiles to plain arrays for JSON
  const tilesArr=Array.from({length:CHUNK_SIZE},(_,i)=>Array.from(tiles[i]));
  return {cx,cy,tiles:tilesArr,oreHp,loots,crops:{},settlement:stype};
}

// ── Building helpers ──────────────────────────────────────────────────────────
function placeRect(tiles,oreHp,bx,by,bw,bh){
  for(let ry=0;ry<bh;ry++) for(let rx=0;rx<bw;rx++){
    const tx=bx+rx,ty=by+ry;
    if(tx<0||ty<0||tx>=CHUNK_SIZE||ty>=CHUNK_SIZE) continue;
    if(ry===0||ry===bh-1||rx===0||rx===bw-1){ tiles[ty][tx]=T.WALL; oreHp[`${tx},${ty}`]=80; }
    else tiles[ty][tx]=T.FLOOR;
  }
}
function addDoor(tiles,bx,by,bw,bh,rng){
  const side=rngInt(rng,0,3);
  if(side===0&&bw>2)      tiles[by][bx+Math.floor(bw/2)]=T.FLOOR;
  else if(side===1&&bw>2) tiles[by+bh-1][bx+Math.floor(bw/2)]=T.FLOOR;
  else if(side===2&&bh>2) tiles[by+Math.floor(bh/2)][bx]=T.FLOOR;
  else if(bh>2)           tiles[by+Math.floor(bh/2)][bx+bw-1]=T.FLOOR;
}

const LOOT_TABLES={
  house_kitchen:[
    ['food_can',1,3],['bread',0,2],['empty_bottle',1,2],['dirty_water',0,2],['cloth',0,2]
  ],
  house_bedroom:[
    ['cloth',2,4],['bandage',0,2],['vitamins',0,1],['warm_coat',0,1],['rope',0,2]
  ],
  house_garage:[
    ['wood',2,6],['stone',1,4],['iron_ore',0,3],['coal',1,3],['rope',1,2],['flint',1,3]
  ],
  city_store:[
    ['food_can',2,5],['bread',1,3],['water_bottle',1,3],['bandage',1,3],
    ['cloth',2,5],['empty_bottle',1,3],['antibiotics',0,1]
  ],
  city_hardware:[
    ['iron_ore',2,6],['coal',2,5],['wood',3,8],['rope',2,4],
    ['flint',2,4],['stone',2,6],['iron_ingot',0,2],['gunpowder',0,2],['sulfur',0,2],
    ['copper_ore',1,4],['copper_ingot',0,2]
  ],
  city_police:[
    ['ammo_45acp',4,12],['ammo_9mm',4,10],['ammo_556',2,8],['ammo_12ga',2,6],
    ['ammo_357',0,4],['bandage',2,4],['medkit',0,2],['iron_ingot',1,3],['cloth',1,3],
    ['m1911',0,1],['mossberg',0,1],['revolver',0,1]
  ],
  city_hospital:[
    ['medkit',1,3],['bandage',3,6],['antibiotics',1,3],
    ['vitamins',1,3],['cloth',2,5],['food_can',1,3]
  ],
  wild:[
    ['food_can',0,2],['cloth',0,3],['wood',1,4],['stone',0,3],['coal',0,2],['rope',0,2]
  ],
};
function rollLoot(rng,table='wild',n=null){
  const pool=LOOT_TABLES[table]||LOOT_TABLES.wild;
  const num=n||rngInt(rng,2,5);
  const chosen=pool.slice().sort(()=>rng()-0.5).slice(0,Math.min(num,pool.length));
  const loot={};
  for(const [id,mn,mx] of chosen){ const q=rngInt(rng,mn,mx); if(q>0) loot[id]=q; }
  return loot;
}
function wildLoot(rng){ return rollLoot(rng,'wild'); }

function genNeighbourhood(tiles,loots,oreHp,rng){
  const placed=[];
  // Bigger houses: 8-12 wide, 7-10 tall
  for(let i=0;i<rngInt(rng,2,4);i++){
    const bw=rngInt(rng,8,12), bh=rngInt(rng,7,10);
    for(let a=0;a<25;a++){
      const bx=rngInt(rng,0,CHUNK_SIZE-bw-1), by=rngInt(rng,0,CHUNK_SIZE-bh-1);
      if(placed.every(([ox,oy,ow,oh])=>bx>=ox+ow+2||bx+bw+2<=ox||by>=oy+oh+2||by+bh+2<=oy)){
        placed.push([bx,by,bw,bh]);
        placeRect(tiles,oreHp,bx,by,bw,bh);
        addDoor(tiles,bx,by,bw,bh,rng);
        // Interior dividing wall — only if building is large enough, never block door
        if(bw>=10&&bh>=8){
          const divX=bx+Math.floor(bw/2);
          const doorRow=by+Math.floor(bh/2); // keep this row clear for passage
          for(let ry=by+1;ry<by+bh-1;ry++){
            if(ry===doorRow) continue; // leave passage
            if(divX>=0&&divX<CHUNK_SIZE&&ry>=0&&ry<CHUNK_SIZE){
              tiles[ry][divX]=T.WALL; oreHp[`${divX},${ry}`]=80;
            }
          }
        }
        // Room-specific loot
        const rooms=['house_kitchen','house_bedroom','house_garage'];
        for(let r=0;r<rngInt(rng,1,3);r++){
          const lx=bx+rngInt(rng,1,bw-2), ly=by+rngInt(rng,1,bh-2);
          if(lx>=0&&ly>=0&&lx<CHUNK_SIZE&&ly<CHUNK_SIZE&&tiles[ly][lx]===T.FLOOR){
            const table=rngChoice(rng,rooms);
            tiles[ly][lx]=T.LOOT;
            loots.push({x:lx,y:ly,items:rollLoot(rng,table)});
          }
        }
        break;
      }
    }
  }
  // Roads
  for(const [bx,by,bw,bh] of placed){
    const ry=by+bh;
    if(ry<CHUNK_SIZE) for(let rx=0;rx<CHUNK_SIZE;rx++)
      if(tiles[ry][rx]!==T.WALL&&tiles[ry][rx]!==T.FLOOR&&tiles[ry][rx]!==T.LOOT)
        tiles[ry][rx]=T.ROAD;
  }
}

function genCity(tiles,loots,oreHp,rng){
  // Road grid
  for(let i=0;i<CHUNK_SIZE;i+=8){
    for(let j=0;j<CHUNK_SIZE;j++){
      if(tiles[j][i]!==T.WALL&&tiles[j][i]!==T.FLOOR) tiles[j][i]=T.ROAD;
      if(tiles[i]&&tiles[i][j]!==T.WALL&&tiles[i][j]!==T.FLOOR) tiles[i][j]=T.ROAD;
    }
  }
  const cityTables=['city_store','city_hardware','city_police','city_hospital'];
  for(let by=0;by<CHUNK_SIZE-8;by+=8) for(let bx=0;bx<CHUNK_SIZE-8;bx+=8){
    if(rng()<0.75){
      const w=rngInt(rng,5,7), h=rngInt(rng,5,7);
      placeRect(tiles,oreHp,bx+1,by+1,w,h);
      addDoor(tiles,bx+1,by+1,w,h,rng);
      const table=rngChoice(rng,cityTables);
      for(let c=0;c<rngInt(rng,1,3);c++){
        const lx=bx+1+rngInt(rng,1,w-2), ly=by+1+rngInt(rng,1,h-2);
        if(lx>=0&&ly>=0&&lx<CHUNK_SIZE&&ly<CHUNK_SIZE&&tiles[ly][lx]===T.FLOOR){
          tiles[ly][lx]=T.LOOT;
          loots.push({x:lx,y:ly,items:rollLoot(rng,table)});
        }
      }
    }
  }
}

function getTileDrops(tileId, rng){
  const drops={};
  for(const [id,mn,mx] of (TILE_DROPS[tileId]||[])){
    const q=rngInt(rng,mn,mx); if(q>0) drops[id]=(drops[id]||0)+q;
  }
  return drops;
}
