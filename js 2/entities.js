// ── Entity classes ────────────────────────────────────────────────────────────
let _eid = 1;
function nextId(){ return _eid++; }

class Player {
  constructor(pid, name, x=0, y=0){
    this.pid=pid; this.name=name; this.x=x; this.y=y;
    this.hp=PLAYER_MAX_HP; this.maxHp=PLAYER_MAX_HP;
    this.hunger=PLAYER_MAX_HUNGER; this.thirst=PLAYER_MAX_THIRST;
    this.bodyTemp=37.0; this.stamina=PLAYER_MAX_STAMINA;
    this.inventory={}; this.armour={helmet:null,chest:null,legs:null};
    this.durability={};  // itemId -> current durability (only tracked items)
    this.heldItem=null;
    this.xp=0; this.level=1;
    this.isDown=false; this.downTimer=0; this.isDead=false;
    this.spawnX=x; this.spawnY=y; this.bedX=null; this.bedY=null;
    this.attackCd=0; this.iframeCd=0; this.infected=false; this.wet=false;
    this.crouching=false; this.sprinting=false; this.coldMult=1.0;
    this.spawnProtection=SPAWN_PROTECTION; // set ONCE here, never reset in tick
    // New systems
    this.infection=0;          // 0-100, hidden until >0
    this.infectionRevealed=false;
    this.infectionDeathTimer=0;
    this.blocking=false;
    this.blockTimer=0;         // time since block started (for perfect window)
    this.meleeCd=0;
    this.meleeChargeTimer=0;   // hold V to charge heavy attack
    this.staminaLocked=false;
    this.lastDeathX=null; this.lastDeathY=null; // death waypoint
  }
  totalDefence(){ return ARMOUR_SLOTS.reduce((s,sl)=>s+(ARMOUR_DEFENCE[this.armour[sl]]||0),0); }
  totalWarmth(){
    let w=ARMOUR_SLOTS.reduce((s,sl)=>s+(ARMOUR_WARMTH[this.armour[sl]]||0),0);
    if(this.heldItem==='torch') w+=8;
    return w;
  }

  // Get durability for an item (initialise from max if not set)
  getDurability(itemId){
    if(!itemId) return 100;
    if(this.durability[itemId]===undefined){
      this.durability[itemId]=ITEM_DURABILITY[itemId]||100;
    }
    return this.durability[itemId];
  }

  // Damage an item's durability, returns true if broken
  damageDurability(itemId, amount=1){
    if(!itemId||!ITEM_DURABILITY[itemId]) return false;
    if(this.durability[itemId]===undefined) this.durability[itemId]=ITEM_DURABILITY[itemId];
    this.durability[itemId]=Math.max(0,this.durability[itemId]-amount);
    return this.durability[itemId]<=0;
  }

  repairDurability(itemId, amount=20){
    if(!itemId||!ITEM_DURABILITY[itemId]) return;
    const max=ITEM_DURABILITY[itemId];
    this.durability[itemId]=Math.min(max,(this.durability[itemId]||0)+amount);
  }

  durabilityPct(itemId){
    if(!itemId||!ITEM_DURABILITY[itemId]) return 1;
    return (this.durability[itemId]??ITEM_DURABILITY[itemId]) / ITEM_DURABILITY[itemId];
  }
  takeDamage(dmg){ const a=Math.max(0.5,dmg-this.totalDefence()*0.5); this.hp=Math.max(0,this.hp-a); return a; }
  heal(amt){
    if(amt < 0){
      // Negative heal = damage (e.g. dirty water)
      this.hp = Math.max(0, this.hp + amt);
    } else {
      this.hp = Math.min(this.maxHp, this.hp + amt);
    }
  }
  respawn(difficulty){
    const dropped={};
    this.hp=this.maxHp; this.hunger=PLAYER_MAX_HUNGER;
    this.thirst=PLAYER_MAX_THIRST; this.bodyTemp=37;
    this.isDown=false; this.isDead=false; this.infected=false; this.wet=false;
    this.stamina=PLAYER_MAX_STAMINA;
    this.spawnProtection=SPAWN_PROTECTION; // reset ONLY on actual respawn
    if(this.bedX!==null){ this.x=this.bedX; this.y=this.bedY; }
    else { this.x=this.spawnX; this.y=this.spawnY; }
    if(difficulty===DIFF.NORMAL){
      Object.assign(dropped,this.inventory);
      this.inventory={};
      for(const sl of ARMOUR_SLOTS){ if(this.armour[sl]) dropped[this.armour[sl]]=(dropped[this.armour[sl]]||0)+1; }
      this.armour={helmet:null,chest:null,legs:null};
    } else if(difficulty===DIFF.EASY){
      const keep=new Set([...Object.keys(WEAPON_DAMAGE),'bow','m1911','m16','mossberg']);
      for(const [k,v] of Object.entries(this.inventory)){
        if(!keep.has(k)){ dropped[k]=v; delete this.inventory[k]; }
      }
    }
    return dropped;
  }
  toJSON(){
    return {pid:this.pid,name:this.name,x:this.x,y:this.y,
      hp:this.hp,maxHp:this.maxHp,hunger:this.hunger,thirst:this.thirst,
      bodyTemp:this.bodyTemp,stamina:this.stamina||PLAYER_MAX_STAMINA,
      inventory:this.inventory,armour:this.armour,durability:this.durability||{},
      heldItem:this.heldItem,xp:this.xp,level:this.level,
      isDown:this.isDown,downTimer:this.downTimer,isDead:this.isDead,
      spawnX:this.spawnX,spawnY:this.spawnY,bedX:this.bedX,bedY:this.bedY,
      infected:this.infected,wet:this.wet,
      crouching:this.crouching||false,sprinting:this.sprinting||false,
      spawnProtection:this.spawnProtection||0,
      iframeCd:this.iframeCd||0,coldMult:this.coldMult||1};
  }
  static fromJSON(d){
    const p=new Player(d.pid,d.name,d.x,d.y);
    Object.assign(p,d); return p;
  }
}

class Zombie {
  constructor(ztype, x, y){
    this.zid=nextId(); this.ztype=ztype;
    const s=ZOMBIE_TYPES[ztype];
    this.hp=s.hp; this.maxHp=s.hp; this.speed=s.speed;
    this.damage=s.damage; this.xp=s.xp;
    this.x=x; this.y=y; this.state='wander';
    this.attackCd=0; this.wanderDx=0; this.wanderDy=0; this.wanderTimer=0;
  }
  toJSON(){ return {zid:this.zid,ztype:this.ztype,hp:this.hp,maxHp:this.maxHp,x:this.x,y:this.y,state:this.state}; }
  static fromJSON(d){ const z=new Zombie(d.ztype,d.x,d.y); Object.assign(z,d); return z; }
}

class Projectile {
  constructor(ownerPid, x, y, dx, dy, damage, maxRange){
    this.projId=nextId(); this.ownerPid=ownerPid;
    this.x=x; this.y=y; this.dx=dx; this.dy=dy;
    this.damage=damage; this.maxRange=maxRange; this.dist=0; this.alive=true;
  }
  toJSON(){ return {projId:this.projId,ownerPid:this.ownerPid,x:this.x,y:this.y,dx:this.dx,dy:this.dy,damage:this.damage,alive:this.alive}; }
}

class DroppedItem {
  constructor(x, y, itemId, qty){
    this.dropId=nextId(); this.x=x; this.y=y;
    this.itemId=itemId; this.qty=qty; this.despawn=300;
  }
  toJSON(){ return {dropId:this.dropId,x:this.x,y:this.y,itemId:this.itemId,qty:this.qty}; }
}

class PlacedBlock {
  constructor(x, y, blockType, ownerPid){
    this.blockId=nextId(); this.x=x; this.y=y;
    this.blockType=blockType; this.ownerPid=ownerPid;
    this.hp=BLOCK_HP[blockType]||50; this.maxHp=this.hp;
    this.isOpen=false; this.active=false;
  }
  toJSON(){ return {blockId:this.blockId,x:this.x,y:this.y,blockType:this.blockType,ownerPid:this.ownerPid,hp:this.hp,maxHp:this.maxHp,isOpen:this.isOpen,active:this.active}; }
  static fromJSON(d){ const b=new PlacedBlock(d.x,d.y,d.blockType,d.ownerPid); Object.assign(b,d); return b; }
}
