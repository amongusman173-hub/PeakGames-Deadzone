// ── Sound Manager ─────────────────────────────────────────────────────────────
const SFX = {
  // Weapons — shoot
  pistol_shoot:    'sounds/PistolShot.mp3',
  rifle_shoot:     'sounds/M4A1_shot.mp3',
  shotgun_shoot:   'sounds/shotgunshoot.wav',
  ak47_shoot:      'sounds/ak47shot.wav',
  revolver_shoot:  'sounds/revolver-shoot.ogg',
  sniper_shoot:    'sounds/sniper-shoot.wav',
  uzi_shoot:       'sounds/UziShot.mp3',
  burst_shoot:     'sounds/BurstShotX3.mp3',
  crossbow_shoot:  'sounds/crossbowshoot.ogg',
  railgun_shoot:   'sounds/railgun-shoot.ogg',
  rpg_shoot:       'sounds/rpg-shoot.ogg',
  bow_shoot:       'sounds/crossbowshoot.ogg',
  // Weapons — reload
  pistol_reload:   'sounds/pistolreload:uziandotherstuff.wav',
  rifle_reload:    'sounds/rifle-reload.ogg',
  shotgun_reload:  'sounds/shotgunreload.wav',
  ak47_reload:     'sounds/ak47reload.wav',
  revolver_reload: 'sounds/revolver-reload.ogg',
  railgun_reload:  'sounds/rail-gun-reload.wav',
  rpg_reload:      'sounds/rpg-reload.ogg',
  crossbow_reload: 'sounds/crossbow-reload-part1.ogg',
  // Melee
  melee_swing:     'sounds/melee.wav',
  melee_hit:       'sounds/melee-hit.ogg',
  // Player
  take_damage:     'sounds/take_damage.wav',
  walk_grass:      'sounds/grass-step.ogg',
  walk_stone:      'sounds/concrete-step.ogg',
  walk_water:      'sounds/walk_in_water.mp3',
  throw_item:      'sounds/throw-item.ogg',
  // UI
  button_click:    'sounds/buttonclick.mp3',
  button_hover:    'sounds/buttonhover.mp3',
  pause:           'sounds/pause_game.mp3',
  unpause:         'sounds/unpause_game.mp3',
  flashlight_on:   'sounds/flashlight-on.ogg',
  flashlight_off:  'sounds/flashlight-off.ogg',
  // Ambience (looped)
  ambience_day:    'sounds/day_ambience.mp3',
  ambience_night:  'sounds/night_ambience.mp3',
  ambience_rain:   'sounds/rain.mp3',
  ambience_blizzard:'sounds/blizzard-ambience.mp3',
  ambience_river:  'sounds/river_ambience.mp3',
  ambience_campfire:'sounds/campfire_ambience.mp3',
  menu_music:      'sounds/Main-menu-music-onlymainmenu.mp3',
  // Other
  explosion:       'sounds/explosion.ogg',
  lightning:       'sounds/lightningsound.mp3',
  zombie:          'sounds/zombiesounds.mp3',
};

class SoundManager {
  constructor(){
    this._cache   = {};
    this._ambient = null;
    this._ambientKey = null;
    this.masterVol = 0.8;
    this.sfxVol    = 0.8;
    this._enabled  = true;
    this._walkTimer= 0;
    this._lastTile = null;
  }

  _get(key){
    if(!SFX[key]) return null;
    if(!this._cache[key]){
      const a = new Audio(SFX[key]);
      a.preload = 'auto';
      this._cache[key] = a;
    }
    return this._cache[key];
  }

  play(key, vol=1.0){
    if(!this._enabled) return;
    try{
      const base = this._get(key);
      if(!base) return;
      // Clone so overlapping sounds work
      const a = base.cloneNode();
      a.volume = Math.min(1, vol * this.sfxVol * this.masterVol);
      a.play().catch(()=>{});
    } catch(e){}
  }

  setAmbience(key){
    if(this._ambientKey === key) return;
    if(this._ambient){
      this._ambient.pause();
      this._ambient.currentTime = 0;
    }
    this._ambientKey = key;
    if(!key){ this._ambient = null; return; }
    try{
      const a = this._get(key);
      if(!a) return;
      this._ambient = a.cloneNode();
      this._ambient.loop = true;
      this._ambient.volume = 0.25 * this.masterVol;
      this._ambient.play().catch(()=>{});
    } catch(e){}
  }

  setVolume(master, sfx){
    this.masterVol = master/100;
    this.sfxVol    = sfx/100;
    if(this._ambient) this._ambient.volume = 0.25 * this.masterVol;
  }

  // Call every frame from game loop
  tick(dt, game, myPid, wdata){
    if(!this._enabled||!game||!myPid) return;
    const p = game.players[myPid]; if(!p) return;

    // Ambience based on time/weather
    const w = wdata?.weather;
    let ambiKey = wdata?.isDaytime ? 'ambience_day' : 'ambience_night';
    if(w==='rain'||w==='storm') ambiKey = 'ambience_rain';
    if(w==='blizzard') ambiKey = 'ambience_blizzard';
    this.setAmbience(ambiKey);

    // Footstep sounds — only when sprinting (not walking)
    if(p.sprinting && p.isMoving){
      this._walkTimer -= dt;
      if(this._walkTimer <= 0){
        const tile = game.getTile(p.x|0, p.y|0);
        let stepKey = 'walk_grass';
        if(WATER_TILES.has(tile)) stepKey = 'walk_water';
        else if(tile===T.STONE||tile===T.FLOOR||tile===T.ROAD||tile===T.WALL) stepKey = 'walk_stone';
        this.play(stepKey, 0.35);
        this._walkTimer = 0.22; // faster cadence when sprinting
      }
    } else {
      this._walkTimer = 0;
    }
  }

  // Weapon fire sound
  onFire(weapon){
    const map = {
      m1911:'pistol_shoot', m16:'rifle_shoot', mossberg:'shotgun_shoot',
      ak47:'ak47_shoot', revolver:'revolver_shoot', sniper:'sniper_shoot',
      uzi:'uzi_shoot', mp5:'uzi_shoot', burst:'burst_shoot',
      crossbow:'crossbow_shoot', railgun:'railgun_shoot', rpg:'rpg_shoot',
      bow:'bow_shoot',
    };
    this.play(map[weapon]||'pistol_shoot', 0.7);
  }

  onMeleeSwing(){ this.play('melee_swing', 0.5); }
  onMeleeHit(){   this.play('melee_hit',   0.6); }
  onDamage(){     this.play('take_damage', 0.8); }
  onPause(){      this.play('pause',       0.6); }
  onUnpause(){    this.play('unpause',     0.6); }
  onFlashlight(on){ this.play(on?'flashlight_on':'flashlight_off', 0.5); }
  onExplosion(){  this.play('explosion',   0.9); }
  onZombie(){     this.play('zombie',      0.3); }

  startMenuMusic(){
    if(this._menuMusic) return;
    try{
      const a=this._get('menu_music');
      if(!a) return;
      this._menuMusic=a.cloneNode();
      this._menuMusic.loop=true;
      this._menuMusic.volume=0.4*this.masterVol;
      this._menuMusic.play().catch(()=>{});
    } catch(e){}
  }
  stopMenuMusic(){
    if(this._menuMusic){ this._menuMusic.pause(); this._menuMusic=null; }
  }
}

const sound = new SoundManager();

// Hook UI buttons
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.mbtn').forEach(btn=>{
    btn.addEventListener('mouseenter', ()=> sound.play('button_hover', 0.3));
    btn.addEventListener('click',      ()=> sound.play('button_click', 0.5));
  });
  // Start menu music on first user interaction (browser autoplay policy)
  const startMusic = ()=>{ sound.startMenuMusic(); document.removeEventListener('click',startMusic); };
  document.addEventListener('click', startMusic);
});
