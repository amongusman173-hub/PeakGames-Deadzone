// ── Core game state & logic ───────────────────────────────────────────────────
// MELEE_RANGE and INTERACT_RANGE are defined in constants.js

class Game {
  constructor(seed, difficulty, isHost){
    this.seed=seed; this.difficulty=difficulty; this.isHost=isHost;
    this.rng=makeRng(seed);
    this.players={}; this.zombies={}; this.projectiles={};
    this.drops={}; this.blocks={}; this.chunks={};
    this.lootCrates={}; this.crops={};
    this.weather=new WeatherSystem(seed);
    this.spawnX=0.5; this.spawnY=0.5;
    this._zombieSpawnTimer=ZOMBIE_SPAWN_INTERVAL;
    this.paused=false;
    this.pauseVotes=new Set();
    // Dead zombie fade-out list: [{zid, x, y, ztype, timer}]
    this.deadZombies=[];
  }

  // ── Chunk access ─────────────────────────────────────────────────────────────
  getChunk(cx,cy){
    const k=`${cx},${cy}`;
    if(!this.chunks[k]){
      const c=generateChunk(cx,cy,this.seed);
      for(const lc of c.loots){
        const wx=cx*CHUNK_SIZE+lc.x, wy=cy*CHUNK_SIZE+lc.y;
        const wk=`${wx},${wy}`;
        if(!(wk in this.lootCrates)) this.lootCrates[wk]=lc.items;
      }
      this.chunks[k]=c;
    }
    return this.chunks[k];
  }
  getTile(wx,wy){
    const cx=Math.floor(wx/CHUNK_SIZE), cy=Math.floor(wy/CHUNK_SIZE);
    const lx=((wx%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
    const ly=((wy%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
    return this.getChunk(cx,cy).tiles[ly][lx];
  }
  setTile(wx,wy,tid){
    const cx=Math.floor(wx/CHUNK_SIZE), cy=Math.floor(wy/CHUNK_SIZE);
    const lx=((wx%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
    const ly=((wy%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
    this.getChunk(cx,cy).tiles[ly][lx]=tid;
  }

  // ── Collision — uses player center (px+0.5, py+0.5) with a small radius ──────
  isSolid(wx,wy){
    const t=this.getTile(wx,wy);
    if(SOLID_TILES.has(t)) return true;
    for(const b of Object.values(this.blocks)){
      if(b.x===wx&&b.y===wy){
        if(b.blockType==='wall_wood'||b.blockType==='wall_stone') return true;
        if(b.blockType==='door_wood'&&!b.isOpen) return true;
      }
    }
    return false;
  }

  // Smooth AABB movement — player is 0.6 wide, centered on (x+0.5, y+0.5)
  _tryMove(p, dx, dy){
    const R=0.3; // half-width
    const nx=p.x+dx, ny=p.y+dy;
    // Check 4 corners of the player rect
    const canX = !this._rectSolid(nx,p.y,R) ;
    const canY = !this._rectSolid(p.x,ny,R);
    if(canX) p.x=nx;
    if(canY) p.y=ny;
  }
  _rectSolid(px,py,R){
    // Check all 4 corners
    const x0=Math.floor(px+0.5-R), x1=Math.floor(px+0.5+R);
    const y0=Math.floor(py+0.5-R), y1=Math.floor(py+0.5+R);
    for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++)
      if(this.isSolid(tx,ty)) return true;
    return false;
  }

  // ── Pause ─────────────────────────────────────────────────────────────────────
  votePause(pid){
    this.pauseVotes.add(pid);
    const alive=Object.keys(this.players).filter(id=>!this.players[id].isDead);
    if(this.pauseVotes.size>=alive.length) this.paused=true;
  }
  voteUnpause(pid){ this.pauseVotes.delete(pid); this.paused=false; }

  // ── Tick ──────────────────────────────────────────────────────────────────────
  tick(dt){
    if(!this.isHost||this.paused) return;
    this.weather.tick(dt);
    this._tickPlayers(dt);
    this._tickZombies(dt);
    this._tickProjectiles(dt);
    this._tickDrops(dt);
    this._tickCrops(dt);
    this._tickDeadZombies(dt);
    this._zombieSpawnTimer-=dt;
    if(this._zombieSpawnTimer<=0){
      this._spawnZombie();
      this._zombieSpawnTimer=ZOMBIE_SPAWN_INTERVAL+(this.rng()*3-1.5);
    }
    // Tick whistle markers
    if(this._whistleMarkers){
      for(const pid of Object.keys(this._whistleMarkers)){
        this._whistleMarkers[pid].timer-=dt;
        if(this._whistleMarkers[pid].timer<=0) delete this._whistleMarkers[pid];
      }
    }
  }

  _tickPlayers(dt){
    for(const p of Object.values(this.players)){
      if(p.isDead) continue;
      if(p.isDown){ p.downTimer-=dt; if(p.downTimer<=0) this._killPlayer(p.pid); continue; }
      p.attackCd=Math.max(0,p.attackCd-dt);
      p.iframeCd=Math.max(0,(p.iframeCd||0)-dt);

      // Spawn protection — only count down, never reset
      if(p.spawnProtection===undefined) p.spawnProtection=0;
      if(p.spawnProtection>0){
        p.spawnProtection=Math.max(0,p.spawnProtection-dt);
      }
      const protected_=p.spawnProtection>0;

      if(!protected_){
        p.hunger=Math.max(0,p.hunger-PLAYER_HUNGER_RATE*dt);
        p.thirst=Math.max(0,p.thirst-PLAYER_THIRST_RATE*dt);
        if(p.hunger===0) p.takeDamage(0.3*dt);
        if(p.thirst===0) p.takeDamage(0.5*dt);

        const biome=getBiome(p.x|0,p.y|0,this.seed);
        const rate=this.weather.playerTempEffect(p,biome);

        // Water rapidly cools body temp toward ambient
        const onWater=WATER_TILES.has(this.getTile(p.x|0,p.y|0));
        if(onWater){
          p.bodyTemp=Math.max(15,p.bodyTemp-3*dt); // water cools fast
        } else {
          p.bodyTemp=Math.max(15,Math.min(45,p.bodyTemp+rate*dt));
        }

        // Temperature damage — with cooldown so it doesn't kill instantly
        p._tempDmgCd=Math.max(0,(p._tempDmgCd||0)-dt);
        if(p.bodyTemp<=TEMP_COLD_THRESHOLD){
          p.coldMult=2.0;
          if(p._tempDmgCd<=0){
            p.takeDamage(TEMP_FREEZE_DMG);
            p._tempDmgCd=2.0; // damage every 2 seconds
          }
        } else { p.coldMult=1.0; }
        if(p.bodyTemp>=TEMP_HOT_THRESHOLD){
          p.thirst=Math.max(0,p.thirst-TEMP_HEAT_THIRST*dt);
          if(p._tempDmgCd<=0){
            p.takeDamage(1.5); // 1.5 hp every 2 seconds when overheating
            p._tempDmgCd=2.0;
          }
        }
        if(p.infected) p.takeDamage(0.3*dt);

        // Infection system
        if((p.infection||0)>0){
          p.infection=Math.min(INFECTION_MAX,(p.infection||0)+0.5*dt); // slowly worsens
          // 50%+ = 2x hunger drain
          if(p.infection>=50){
            p.hunger=Math.max(0,p.hunger-PLAYER_HUNGER_RATE*dt); // extra drain
          }
          // 75%+ = chance to lunge at nearby friends (multiplayer)
          if(p.infection>=75&&Math.random()<0.001*dt){
            for(const [opid,op] of Object.entries(this.players)){
              if(opid===p.pid||op.isDead) continue;
              if(Math.hypot(p.x-op.x,p.y-op.y)<2.5){
                op.takeDamage(8);
                // 25% chance to infect them
                if(Math.random()<INFECTION_LUNGE_CHANCE){
                  op.infection=(op.infection||0)+20;
                  op.infectionRevealed=true;
                }
              }
            }
          }
          // 100% = death timer
          if(p.infection>=INFECTION_MAX){
            p.infectionDeathTimer=(p.infectionDeathTimer||INFECTION_DEATH_TIME)-dt;
            if(p.infectionDeathTimer<=0){
              // Die and become a zombie
              p.lastDeathX=p.x; p.lastDeathY=p.y;
              this.deadZombies.push({zid:-(Math.random()*9999|0),x:p.x,y:p.y,ztype:'brute',timer:30,isCorpse:true,name:p.name});
              this._killPlayer(p.pid);
            }
          }
        }
      }

      // Stamina regen when not sprinting
      if(!p.sprinting)
        p.stamina=Math.min(PLAYER_MAX_STAMINA,(p.stamina||PLAYER_MAX_STAMINA)+PLAYER_STAMINA_REGEN*dt);

      if(this.weather.isRaining) p.wet=true;
      else if(!WATER_TILES.has(this.getTile(p.x|0,p.y|0))) p.wet=false;

      if(p.hp<=0) this._downOrKill(p.pid);
    }
  }

  _downOrKill(pid){
    const p=this.players[pid]; if(!p||p.isDown||p.isDead) return;
    const alive=Object.values(this.players).filter(x=>!x.isDead&&!x.isDown&&x.pid!==pid);
    if(alive.length>0){ p.isDown=true; p.hp=1; p.downTimer=REVIVE_TIME; }
    else this._killPlayer(pid);
  }

  _killPlayer(pid){
    const p=this.players[pid]; if(!p) return;
    if(this.difficulty===DIFF.HARDCORE){ p.isDead=true; return; }
    const dropped=p.respawn(this.difficulty);
    for(const [id,qty] of Object.entries(dropped)){
      const d=new DroppedItem(p.x,p.y,id,qty); this.drops[d.dropId]=d;
    }
  }

  _tickZombies(dt){
    for(const z of Object.values(this.zombies)){
      z.attackCd=Math.max(0,z.attackCd-dt);
      const stats=ZOMBIE_TYPES[z.ztype]||ZOMBIE_TYPES.walker;
      let nearest=null, ndist=99999;
      for(const p of Object.values(this.players)){
        if(p.isDead||p.isDown) continue;
        const detRange=p.crouching?stats.aggro*0.45:stats.aggro;
        const d=Math.hypot(p.x-z.x,p.y-z.y);
        if(d<ndist&&d<detRange){ nearest=p; ndist=d; }
      }
      if(nearest){
        z.state='chase';
        const dx=nearest.x-z.x, dy=nearest.y-z.y;
        const dist=Math.hypot(dx,dy)||1;
        const spd=z.speed*dt;
        // Zombies avoid water — check if next step is water
        const nx=z.x+dx/dist*spd, ny=z.y+dy/dist*spd;
        const nextTile=this.getTile(Math.floor(nx),Math.floor(ny));
        const inWater=WATER_TILES.has(this.getTile(z.x|0,z.y|0));
        if(inWater){
          // Drowning — take damage
          z.hp-=5*dt;
          if(z.hp<=0){
            this.deadZombies.push({zid:z.zid,x:z.x,y:z.y,ztype:z.ztype,timer:1.2});
            delete this.zombies[z.zid]; continue;
          }
          // Try to move out of water
          const escDx=z.x>0?-1:1, escDy=z.y>0?-1:1;
          this._tryMove(z,escDx*spd,escDy*spd);
        } else if(WATER_TILES.has(nextTile)){
          // Count zombies already in water nearby — stacking mechanic
          const inWaterCount=Object.values(this.zombies).filter(oz=>oz.zid!==z.zid&&WATER_TILES.has(this.getTile(oz.x|0,oz.y|0))&&Math.hypot(oz.x-z.x,oz.y-z.y)<3).length;
          if(inWaterCount>=2){
            // Enough zombies stacked — can cross
            this._tryMove(z,dx/dist*spd,dy/dist*spd);
          } else {
            // Avoid water — try to go around
            const perpDx=-dy/dist, perpDy=dx/dist;
            const alt1x=z.x+perpDx*spd, alt1y=z.y+perpDy*spd;
            const alt2x=z.x-perpDx*spd, alt2y=z.y-perpDy*spd;
            if(!WATER_TILES.has(this.getTile(alt1x|0,alt1y|0))){
              this._tryMove(z,perpDx*spd,perpDy*spd);
            } else if(!WATER_TILES.has(this.getTile(alt2x|0,alt2y|0))){
              this._tryMove(z,-perpDx*spd,-perpDy*spd);
            }
            // else stuck — just wait
          }
        } else {
          this._tryMove(z,dx/dist*spd,dy/dist*spd);
        }
        if(ndist<1.0&&z.attackCd<=0){
          if(nearest.iframeCd<=0){
            const stats2=ZOMBIE_TYPES[z.ztype]||ZOMBIE_TYPES.walker;
            let dmg=stats2.damage*(nearest.coldMult||1);
            if(nearest.blocking){
              nearest.blockTimer=(nearest.blockTimer||0)+z.attackCd;
              const isPerfect=(nearest.blockTimer||0)<=BLOCK_PERFECT_WINDOW;
              if(isPerfect){
                dmg=0; z.attackCd+=BLOCK_STUN_PERFECT; // stun zombie
                events.push({type:'perfect_block',pid:nearest.pid});
              } else {
                dmg*=0.1; z.attackCd+=BLOCK_STUN_NORMAL;
                events.push({type:'block_hit',pid:nearest.pid});
              }
            }
            if(dmg>0){
              nearest.takeDamage(dmg);
              nearest.iframeCd=0.6;
              if(Math.random()<INFECTION_BITE_CHANCE){
                nearest.infection=(nearest.infection||0)+15;
                nearest.infectionRevealed=true;
              }
            }
          }
          z.attackCd=1.5;
          if(nearest.hp<=0) this._downOrKill(nearest.pid);
        }
      } else {
        z.state='wander';
        z.wanderTimer=(z.wanderTimer||0)-dt;
        if(z.wanderTimer<=0){
          z.wanderDx=this.rng()*2-1; z.wanderDy=this.rng()*2-1;
          z.wanderTimer=2+this.rng()*4;
        }
        const wx2=z.x+z.wanderDx*z.speed*dt*0.4;
        const wy2=z.y+z.wanderDy*z.speed*dt*0.4;
        // Don't wander into water
        if(!WATER_TILES.has(this.getTile(wx2|0,wy2|0))){
          this._tryMove(z, z.wanderDx*z.speed*dt*0.4, z.wanderDy*z.speed*dt*0.4);
        } else {
          // Pick new direction
          z.wanderDx=this.rng()*2-1; z.wanderDy=this.rng()*2-1;
          z.wanderTimer=1;
        }
      }
    }
  }

  _tickDeadZombies(dt){
    this.deadZombies=this.deadZombies.filter(d=>{ d.timer-=dt; return d.timer>0; });
  }

  _tickProjectiles(dt){
    for(const [id,pr] of Object.entries(this.projectiles)){
      if(!pr.alive){ delete this.projectiles[id]; continue; }
      pr.x+=pr.dx*15*dt; pr.y+=pr.dy*15*dt; pr.dist+=15*dt;
      if(pr.dist>=pr.maxRange||this.isSolid(pr.x|0,pr.y|0)){
        pr.alive=false; delete this.projectiles[id]; continue;
      }
      for(const [zid,z] of Object.entries(this.zombies)){
        if(Math.hypot(pr.x-z.x,pr.y-z.y)<0.7){
          z.hp-=pr.damage; pr.alive=false;
          if(z.hp<=0){
            const owner=this.players[pr.ownerPid];
            if(owner){ owner.xp+=ZOMBIE_TYPES[z.ztype]?.xp||10; this._checkLevel(pr.ownerPid); }
            this.deadZombies.push({zid:+zid,x:z.x,y:z.y,ztype:z.ztype,timer:1.2});
            delete this.zombies[zid];
          }
          delete this.projectiles[id]; break;
        }
      }
    }
  }

  _tickDrops(dt){
    for(const [id,d] of Object.entries(this.drops)){
      d.despawn-=dt;
      if(d.despawn<=0){ delete this.drops[id]; continue; }
      for(const p of Object.values(this.players)){
        if(p.isDead||p.isDown) continue;
        if(Math.hypot(p.x-d.x,p.y-d.y)<0.9){
          p.inventory[d.itemId]=(p.inventory[d.itemId]||0)+d.qty;
          delete this.drops[id];
          // Emit pickup event for notifier
          this._pendingPickups=this._pendingPickups||[];
          this._pendingPickups.push({pid:p.pid,itemId:d.itemId,qty:d.qty,x:d.x,y:d.y});
          break;
        }
      }
    }
  }

  _tickCrops(dt){
    for(const crop of Object.values(this.crops))
      if(crop.growth<crop.max) crop.growth=Math.min(crop.max,crop.growth+(crop.watered?1.5:1));
  }

  _spawnZombie(){
    const isNight=!this.weather.isDaytime;
    const maxZ=isNight?ZOMBIE_MAX_NIGHT:ZOMBIE_MAX_DAY;
    if(Object.keys(this.zombies).length>=maxZ) return;
    const plist=Object.values(this.players).filter(p=>!p.isDead);
    if(!plist.length) return;
    const p=plist[Math.floor(this.rng()*plist.length)];
    const angle=this.rng()*Math.PI*2;
    const dist=22+this.rng()*8;
    const sx=p.x+Math.cos(angle)*dist, sy=p.y+Math.sin(angle)*dist;
    if(this._rectSolid(sx,sy,0.3)) return;
    // Never spawn in water
    if(WATER_TILES.has(this.getTile(sx|0,sy|0))) return;
    const cx=Math.floor(sx/CHUNK_SIZE), cy=Math.floor(sy/CHUNK_SIZE);
    const stype=getSettlement(cx,cy,this.seed);
    if(!isNight&&stype==='none') return;
    const ztype=isNight
      ? rngWeighted(this.rng,['walker','runner','brute','spitter','frozen','speedy','crawler','tank'],[30,20,8,15,8,10,6,3])
      : rngWeighted(this.rng,['walker','runner','spitter'],[60,25,15]);
    const z=new Zombie(ztype,sx,sy);
    this.zombies[z.zid]=z;
  }

  _checkLevel(pid){
    const p=this.players[pid]; if(!p) return;
    if(p.xp>=p.level*100){ p.level++; p.maxHp=Math.min(200,p.maxHp+10); p.hp=p.maxHp; }
  }

  _alertZombies(x, y, range){
    for(const z of Object.values(this.zombies)){
      if(Math.hypot(z.x-x, z.y-y) <= range){
        z.state='chase';
        z.wanderTimer=0;
        // Point zombie toward the sound source
        z.wanderDx = x-z.x;
        z.wanderDy = y-z.y;
      }
    }
  }

  // ── Player actions ────────────────────────────────────────────────────────────
  handleAction(pid, action){
    const p=this.players[pid]; if(!p||p.isDead) return null;
    const {type}=action;
    const events=[];

    if(type==='move'){
      if(p.isDown) return null;
      p.crouching=!!action.crouching;

      // Sprint lock: locks when stamina hits 0, only unlocks at FULL (100%)
      if((p.stamina||0) <= 0) p.staminaLocked=true;
      if(p.staminaLocked && (p.stamina||0) >= PLAYER_MAX_STAMINA) p.staminaLocked=false;

      const canSprint = !p.staminaLocked && !p.crouching;
      p.sprinting = !!action.sprinting && canSprint;

      if(p.sprinting){
        p.stamina=Math.max(0,(p.stamina||PLAYER_MAX_STAMINA)-PLAYER_STAMINA_DRAIN/TICK_RATE);
      } else {
        // Regen — but NOT while staminaLocked (must wait for full recharge)
        if(!p.staminaLocked){
          p.stamina=Math.min(PLAYER_MAX_STAMINA,(p.stamina||0)+PLAYER_STAMINA_REGEN/TICK_RATE);
        } else {
          // Still regen while locked, just can't sprint yet
          p.stamina=Math.min(PLAYER_MAX_STAMINA,(p.stamina||0)+PLAYER_STAMINA_REGEN/TICK_RATE);
        }
      }

      let spd = p.crouching ? PLAYER_CROUCH_SPEED/TICK_RATE
              : p.sprinting  ? PLAYER_SPRINT_SPEED/TICK_RATE
              : PLAYER_SPEED/TICK_RATE;

      if(WATER_TILES.has(this.getTile(p.x|0,p.y|0))){
        spd *= p.heldItem==='boat' ? 0.9 : 0.45;
      }
      // Trees slow you down but don't block
      if(this.getTile(p.x|0,p.y|0)===T.TREE) spd *= 0.6;

      this._tryMove(p, action.dx*spd, action.dy*spd);
      p.heldItem=action.heldItem!==undefined?action.heldItem:p.heldItem;
      p.wet=WATER_TILES.has(this.getTile(p.x|0,p.y|0));
      p.isMoving = !!(action.dx||action.dy);
      const cx=Math.floor(p.x/CHUNK_SIZE), cy=Math.floor(p.y/CHUNK_SIZE);
      for(let dy2=-2;dy2<=2;dy2++) for(let dx2=-2;dx2<=2;dx2++) this.getChunk(cx+dx2,cy+dy2);
    }

    else if(type==='attack'){
      // V key — melee/ranged combat only (no mining here)
      if(p.isDown||p.attackCd>0) return null;
      const {tx,ty}=action;
      const weapon=p.heldItem;
      const range=WEAPON_RANGE[weapon]||MELEE_RANGE;
      const distToTarget=Math.hypot(tx-(p.x+0.5), ty-(p.y+0.5));
      if(distToTarget>range+0.5) return null;
      const fireRate=(typeof WEAPON_FIRERATE!=='undefined'&&WEAPON_FIRERATE[weapon])||2;
      p.attackCd=1/fireRate;

      if(RANGED.has(weapon)){
        const ammoId=WEAPON_AMMO[weapon];
        if(ammoId&&!(p.inventory[ammoId]>0)) return null;
        // Gun jam check at low durability
        const durPct=p.durabilityPct(weapon);
        if(durPct<0.2&&Math.random()<GUN_JAM_CHANCE){
          events.push({type:'gun_jammed',pid,weapon});
          return events.length?events:null;
        }
        if(ammoId){ p.inventory[ammoId]--; if(p.inventory[ammoId]<=0) delete p.inventory[ammoId]; }
        const dx=tx-p.x, dy=ty-p.y, mag=Math.hypot(dx,dy)||1;
        const pr=new Projectile(pid,p.x+0.5,p.y+0.5,dx/mag,dy/mag,WEAPON_DAMAGE[weapon]||20,WEAPON_RANGE[weapon]||10);
        this.projectiles[pr.projId]=pr;
        events.push({type:'projectile',proj:pr.toJSON()});
        // Durability drain on fire
        p.damageDurability(weapon,1);
        const alertRange=weapon==='sniper'?30:weapon==='rpg'?35:weapon==='mossberg'||weapon==='double_barrel'?18:22;
        this._alertZombies(p.x,p.y,alertRange);
        events.push({type:'sound_event',sound:'gunshot',weapon,x:p.x,y:p.y,range:alertRange});
      } else {
        // Melee — hit zombies
        const dmg=WEAPON_DAMAGE[weapon]||8;
        for(const [zid,z] of Object.entries(this.zombies)){
          if(Math.hypot(tx-z.x,ty-z.y)<range){
            z.hp-=dmg;
            events.push({type:'sound_event',sound:'melee_hit'});
            p.damageDurability(weapon,2); // melee drains durability faster
            if(z.hp<=0){
              p.xp+=ZOMBIE_TYPES[z.ztype]?.xp||10; this._checkLevel(pid);
              this.deadZombies.push({zid:+zid,x:z.x,y:z.y,ztype:z.ztype,timer:1.2});
              delete this.zombies[zid];
              events.push({type:'zombie_dead',zid:+zid});
            }
          }
        }
        // PVP
        if(this.pvp){
          for(const [opid,op] of Object.entries(this.players)){
            if(opid===pid||op.isDead||op.isDown) continue;
            if(Math.hypot(tx-op.x,ty-op.y)<range&&op.iframeCd<=0){
              op.takeDamage(dmg*(p.coldMult||1));
              op.iframeCd=0.5;
              if(op.hp<=0) this._downOrKill(opid);
            }
          }
        }
      }
    }

    else if(type==='mine'){
      // Left click — mine tiles only
      if(p.isDown) return null;
      const {tx,ty}=action;
      // Use Math.floor so negative coords work correctly
      const twx=Math.floor(Number(tx)), twy=Math.floor(Number(ty));
      const MINE_REACH=3.5;
      const distToTile=Math.hypot(twx+0.5-(p.x+0.5), twy+0.5-(p.y+0.5));
      if(distToTile>MINE_REACH) return null;
      const tile=this.getTile(twx,twy);
      if(MINE_TILES.has(tile)){
        const cx=Math.floor(twx/CHUNK_SIZE), cy=Math.floor(twy/CHUNK_SIZE);
        const lx=((twx%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
        const ly=((twy%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
        const chunk=this.getChunk(cx,cy);
        const hk=`${lx},${ly}`;
        const maxHp=tile===T.TREE?40:tile===T.ORE_DIAMOND?120:tile===T.ORE_GOLD?100:tile===T.ORE_IRON?80:tile===T.ORE_COAL?60:50;
        if(chunk.oreHp[hk]===undefined) chunk.oreHp[hk]=maxHp;
        chunk.oreHp[hk]-=this._toolDmg(p.heldItem,tile);
        events.push({type:'mine_progress',wx:twx,wy:twy,hp:Math.max(0,chunk.oreHp[hk]),maxHp});
        if(chunk.oreHp[hk]<=0){
          const drops=getTileDrops(tile,this.rng);
          for(const [id,qty] of Object.entries(drops)) p.inventory[id]=(p.inventory[id]||0)+qty;
          this.setTile(twx,twy,T.DIRT); delete chunk.oreHp[hk];
          events.push({type:'tile_update',wx:twx,wy:twy,tile:T.DIRT});
        }
      }
    }

    else if(type==='place'){
      const {itemId,wx,wy}=action;
      const pwx=Math.floor(Number(wx)), pwy=Math.floor(Number(wy));
      if(!(p.inventory[itemId]>0)) return null;
      if(this.isSolid(pwx,pwy)) return null;
      // Prevent placing on player's own tile or overlapping player
      const playerTileX=Math.floor(p.x), playerTileY=Math.floor(p.y);
      if(pwx===playerTileX&&pwy===playerTileY) return null;
      // Also check adjacent tiles the player might be straddling
      const px2=p.x+0.5, py2=p.y+0.5;
      if(Math.abs(px2-(pwx+0.5))<0.7&&Math.abs(py2-(pwy+0.5))<0.7) return null;
      const distToPlace=Math.hypot(pwx+0.5-(p.x+0.5), pwy+0.5-(p.y+0.5));
      if(distToPlace>3.5) return null;
      const b=new PlacedBlock(pwx,pwy,itemId,pid);
      this.blocks[b.blockId]=b;
      p.inventory[itemId]--; if(p.inventory[itemId]<=0) delete p.inventory[itemId];
      if(itemId==='bed'){ p.bedX=pwx+0.5; p.bedY=pwy+0.5; }
      events.push({type:'block_placed',block:b.toJSON()});
    }

    else if(type==='interact'){
      const {wx,wy}=action;
      const wk=`${wx},${wy}`;
      const distToTile=Math.hypot(wx+0.5-(p.x+0.5), wy+0.5-(p.y+0.5));
      if(distToTile>INTERACT_RANGE+1.0) return null;

      // Loot
      if(this.lootCrates[wk]&&Object.keys(this.lootCrates[wk]).length){
        // Only block if there's a wall strictly between player and crate (not at endpoints)
        const steps=Math.max(2,Math.ceil(distToTile*2));
        let blocked=false;
        for(let i=1;i<steps-1;i++){
          const lx=p.x+0.5+(wx+0.5-p.x-0.5)*i/steps;
          const ly=p.y+0.5+(wy+0.5-p.y-0.5)*i/steps;
          const lt=this.getTile(Math.floor(lx),Math.floor(ly));
          if(lt===T.WALL){ blocked=true; break; }
        }
        if(!blocked){
          for(const [id,qty] of Object.entries(this.lootCrates[wk]))
            p.inventory[id]=(p.inventory[id]||0)+qty;
          this.lootCrates[wk]={};
          this.setTile(wx,wy,T.FLOOR);
          events.push({type:'tile_update',wx,wy,tile:T.FLOOR});
          events.push({type:'loot_collected',wx,wy});
        }
      }
      // Revive
      // Door toggle — open/close
      for(const b of Object.values(this.blocks)){
        if(b.x===wx&&b.y===wy&&b.blockType==='door_wood'){
          if(!b.locked){
            b.isOpen=!b.isOpen;
            events.push({type:'block_update',block:b.toJSON()});
          } else {
            events.push({type:'notify',pid,text:'Door is locked!',col:'#ff8c00'});
          }
        }
      }
      // Revive
      if(action.revivePid){
        const t=this.players[action.revivePid];
        if(t&&t.isDown&&Math.hypot(p.x-t.x,p.y-t.y)<2.5){
          t.isDown=false; t.hp=t.maxHp*0.3; t.downTimer=0;
          events.push({type:'revived',pid:action.revivePid});
        }
      }
      if(action.action==='hoe'&&p.inventory['hoe']>0){
        const tile=this.getTile(wx,wy);
        if(FARM_TILES.has(tile)){ this.setTile(wx,wy,T.FARMLAND); events.push({type:'tile_update',wx,wy,tile:T.FARMLAND}); }
      }
      if(action.action==='plant'&&action.seedId){
        const cg=CROP_GROWTH[action.seedId];
        if(cg&&this.getTile(wx,wy)===T.FARMLAND&&p.inventory[action.seedId]>0){
          this.crops[wk]={type:action.seedId,growth:0,max:cg.ticks,watered:false};
          p.inventory[action.seedId]--; if(p.inventory[action.seedId]<=0) delete p.inventory[action.seedId];
          this.setTile(wx,wy,cg.tile); events.push({type:'tile_update',wx,wy,tile:cg.tile});
        }
      }
      if(action.action==='harvest'){
        const crop=this.crops[wk];
        if(crop&&crop.growth>=crop.max){
          const cg=CROP_GROWTH[crop.type];
          const [id,mn,mx]=cg.yield;
          const qty=mn+Math.floor(this.rng()*(mx-mn+1));
          p.inventory[id]=(p.inventory[id]||0)+qty;
          if(this.rng()<0.5) p.inventory[crop.type]=(p.inventory[crop.type]||0)+1;
          delete this.crops[wk]; this.setTile(wx,wy,T.FARMLAND);
          events.push({type:'tile_update',wx,wy,tile:T.FARMLAND});
        }
      }
    }

    else if(type==='craft'){
      const recipe=RECIPES[action.recipeIdx];
      if(!recipe||recipe.station!==action.station) return null;
      if(Object.entries(recipe.req).every(([k,v])=>(p.inventory[k]||0)>=v))
        p.inventory=applyCraft(p.inventory,recipe);
    }

    else if(type==='consume'){
      const {itemId}=action;
      if(!(p.inventory[itemId]>0)) return null;
      if(FOOD_VALUES[itemId]){
        const [h,th,hp]=FOOD_VALUES[itemId];
        p.hunger=Math.min(PLAYER_MAX_HUNGER,p.hunger+h);
        p.thirst=Math.min(PLAYER_MAX_THIRST,p.thirst+th);
        p.heal(hp);
      } else if(DRINK_VALUES[itemId]){
        const [h,th,hp]=DRINK_VALUES[itemId];
        p.hunger=Math.min(PLAYER_MAX_HUNGER,p.hunger+h);
        p.thirst=Math.min(PLAYER_MAX_THIRST,p.thirst+th);
        p.heal(hp);
      } else if(itemId==='medkit'){ p.heal(60); p.infected=false; p.infection=0; }
        else if(itemId==='bandage'){ p.heal(20); if((p.infection||0)>0) p.infection=Math.max(0,p.infection-10); }
        else if(itemId==='antibiotics'){ p.infected=false; p.infection=Math.max(0,(p.infection||0)-30); p.heal(10); }
        else if(itemId==='vitamins'){ if((p.infection||0)>0) p.infection=Math.max(0,p.infection-15); p.heal(5); }
      p.inventory[itemId]--; if(p.inventory[itemId]<=0) delete p.inventory[itemId];
    }

    else if(type==='equip'){
      const {slot,itemId}=action;
      if(!ARMOUR_SLOTS.includes(slot)) return null;
      const old=p.armour[slot];
      if(old) p.inventory[old]=(p.inventory[old]||0)+1;
      if(itemId&&p.inventory[itemId]>0){
        p.armour[slot]=itemId; p.inventory[itemId]--;
        if(p.inventory[itemId]<=0) delete p.inventory[itemId];
      } else p.armour[slot]=null;
    }

    else if(type==='drop'){
      const {itemId,qty}=action;
      if((p.inventory[itemId]||0)>=qty){
        p.inventory[itemId]-=qty; if(p.inventory[itemId]<=0) delete p.inventory[itemId];
        const d=new DroppedItem(p.x,p.y,itemId,qty);
        this.drops[d.dropId]=d; events.push({type:'item_dropped',drop:d.toJSON()});
      }
    }

    else if(type==='hammer'){
      const {wx,wy,mode}=action; // mode: 'repair' or 'destroy'
      if(!(p.inventory['hammer']>0)) return null;
      for(const [bid,b] of Object.entries(this.blocks)){
        if(b.x===wx&&b.y===wy){
          if(mode==='repair'){
            b.hp=Math.min(b.maxHp,b.hp+30);
            events.push({type:'block_repaired',block:b.toJSON()});
          } else {
            // Deconstruct — return some materials
            const mat=b.blockType.includes('wood')?'wood':b.blockType.includes('stone')?'stone':'iron_ingot';
            p.inventory[mat]=(p.inventory[mat]||0)+2;
            delete this.blocks[bid];
            events.push({type:'block_removed',blockId:+bid});
          }
          p.damageDurability('hammer',3);
          break;
        }
      }
    }
    else if(type==='block_start'){
      if(p.isDown||p.isDead) return null;
      p.blocking=true; p.blockTimer=0;
      events.push({type:'player_blocking',pid,blocking:true});
    }
    else if(type==='block_end'){
      p.blocking=false; p.blockTimer=0;
      events.push({type:'player_blocking',pid,blocking:false});
    }
    else if(type==='whistle'){
      // X key — alerts nearby zombies, shows waypoint to other players
      this._alertZombies(p.x, p.y, 20);
      // Store whistle position for other players to see
      this._whistleMarkers=this._whistleMarkers||{};
      this._whistleMarkers[pid]={x:p.x,y:p.y,name:p.name,timer:8.0};
      events.push({type:'whistle',pid,x:p.x,y:p.y,name:p.name});
    }

    else if(type==='lockpick'){
      const {wx,wy}=action;
      // Find a locked door block nearby
      for(const b of Object.values(this.blocks)){
        if(b.x===wx&&b.y===wy&&b.blockType==='door_wood'&&b.locked){
          if(p.inventory['lockpick']>0){
            p.inventory['lockpick']--;
            if(p.inventory['lockpick']<=0) delete p.inventory['lockpick'];
            b.locked=false; b.isOpen=true;
            events.push({type:'block_update',block:b.toJSON()});
          }
        }
      }
    }

    else if(type==='pause'){ this.votePause(pid); events.push({type:'paused'}); }
    else if(type==='unpause'){ this.voteUnpause(pid); events.push({type:'unpaused'}); }

    return events.length?events:null;
  }

  _toolDmg(tool,tile){
    if(tile===T.TREE){
      if(tool==='iron_axe') return 30;
      if(tool==='stone_axe') return 22;
      if(tool==='wooden_axe') return 14;
      return 5; // bare hands — very slow
    }
    if(tile===T.STONE||tile===T.ORE_IRON||tile===T.ORE_COAL||tile===T.ORE_GOLD||tile===T.ORE_DIAMOND){
      if(tool==='gold_pick') return 35; if(tool==='iron_pick') return 28;
      if(tool==='stone_pick') return 18; if(tool==='wooden_pick') return 10;
      return 2; // bare hands — almost impossible
    }
    return 5;
  }

  getState(){
    const state={
      players:Object.values(this.players).map(p=>p.toJSON()),
      zombies:Object.values(this.zombies).map(z=>z.toJSON()),
      deadZombies:this.deadZombies,
      projectiles:Object.values(this.projectiles).map(p=>p.toJSON()),
      drops:Object.values(this.drops).map(d=>d.toJSON()),
      blocks:Object.values(this.blocks).map(b=>b.toJSON()),
      weather:this.weather.toJSON(),
      paused:this.paused,
    };
    // Include pending pickups and clear them
    if(this._pendingPickups&&this._pendingPickups.length){
      state.pickups=this._pendingPickups;
      this._pendingPickups=[];
    }
    if(this._whistleMarkers&&Object.keys(this._whistleMarkers).length){
      state.whistleMarkers=this._whistleMarkers;
    }
    return state;
  }
}
