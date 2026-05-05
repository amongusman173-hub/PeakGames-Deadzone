// ── Global state ──────────────────────────────────────────────────────────────
let hostMethod = 'solo', joinMethod = 'peer';
let selectedSlot = 0;
let selectedDiff = 'normal';   // default = normal
let isLoadingExisting = false; // true when continuing a saved world
let clientGame = null, clientUi = null, clientRenderer = null;
const MAX_SLOTS = 6;
const PROX_CHAT_RANGE_DEFAULT = 15;
let proxChatRange = PROX_CHAT_RANGE_DEFAULT;

// ── Persist player name across sessions ───────────────────────────────────────
function getSavedName(){ return localStorage.getItem('dz_player_name') || ''; }
function savePlayerName(n){ localStorage.setItem('dz_player_name', n); }

// ── Menu background animation ─────────────────────────────────────────────────
(function menuBgLoop(){
  const bg = document.getElementById('menu-bg');
  if(!bg) return;
  bg.width = window.innerWidth; bg.height = window.innerHeight;
  const ctx = bg.getContext('2d');
  function frame(){ vfx.drawMenuBg(ctx, bg.width, bg.height); requestAnimationFrame(frame); }
  frame();
  window.addEventListener('resize', ()=>{ bg.width=window.innerWidth; bg.height=window.innerHeight; });
})();

// ── Screen navigation ─────────────────────────────────────────────────────────
function showScreen(id){
  document.querySelectorAll('.menu-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  if(id === 'screen-slots') renderSlots();
}

// ── Difficulty picker ─────────────────────────────────────────────────────────
function pickDiff(el){
  if(isLoadingExisting) return; // locked when continuing
  document.querySelectorAll('.diff-opt').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  selectedDiff = el.dataset.diff;
}

// ── Host method toggle ────────────────────────────────────────────────────────
function setHostMethod(m, tabEl){
  hostMethod = m;
  document.querySelectorAll('#host-tabs .tab').forEach(t => t.classList.remove('active'));
  if(tabEl) tabEl.classList.add('active');
  document.getElementById('host-solo-info')?.classList.toggle('hidden', m !== 'solo');
  document.getElementById('host-peer-info').classList.toggle('hidden', m !== 'peer');
  document.getElementById('host-ably-info').classList.toggle('hidden', m !== 'ably');
}
function setJoinMethod(m, tabEl){
  joinMethod = m;
  document.querySelectorAll('#join-tabs .tab').forEach(t => t.classList.remove('active'));
  if(tabEl) tabEl.classList.add('active');
  document.getElementById('join-peer-fields').classList.toggle('hidden', m !== 'peer');
  document.getElementById('join-ably-fields').classList.toggle('hidden', m !== 'ably');
}

// ── Save slot helpers ─────────────────────────────────────────────────────────
function getSaveKey(slot){ return `dz_save_slot${slot}`; }
function loadSave(slot){
  try{ return JSON.parse(localStorage.getItem(getSaveKey(slot))); } catch(e){ return null; }
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────
function confirmDelete(slot, worldName){
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-body').innerHTML =
    `This will permanently delete <b style="color:#e08080">${worldName || 'this world'}</b>.<br>This cannot be undone.`;
  overlay.classList.remove('hidden');
  document.getElementById('confirm-yes').onclick = ()=>{
    overlay.classList.add('hidden');
    localStorage.removeItem(getSaveKey(slot));
    renderSlots();
  };
  document.getElementById('confirm-no').onclick = ()=> overlay.classList.add('hidden');
  // Click outside to cancel
  overlay.onclick = (e)=>{ if(e.target === overlay) overlay.classList.add('hidden'); };
}

function renderSlots(){
  const grid = document.getElementById('slots-grid');
  grid.innerHTML = '';
  for(let i = 0; i < MAX_SLOTS; i++){
    const data = loadSave(i);
    const card = document.createElement('div');
    card.className = 'slot-card' + (data ? '' : ' empty');
    if(data){
      const date = new Date(data.savedAt || 0).toLocaleDateString();
      const diff = data.difficulty || 'normal';
      const playerName = data.players?.[0]?.name || '?';
      card.innerHTML = `
        <div class="slot-num">SLOT ${i+1}</div>
        <div class="slot-name">${escHtml(data.worldName || 'World')}</div>
        <div class="slot-info">👤 ${escHtml(playerName)}</div>
        <div class="slot-info">Day ${data.weather?.dayNumber||0} · ${data.weather?.season||'spring'}</div>
        <div class="slot-info">Saved: ${date}</div>
        <span class="slot-diff ${diff}">${diff.toUpperCase()}</span>
        <button class="slot-del" onclick="event.stopPropagation();confirmDelete(${i},'${escHtml(data.worldName||'World')}')" title="Delete world">🗑</button>`;
      card.onclick = () => openSlot(i, data);
    } else {
      card.innerHTML = `
        <div class="slot-num">SLOT ${i+1}</div>
        <div class="slot-name" style="color:#2a4020;margin-top:8px">— Empty —</div>
        <div class="slot-info" style="margin-top:8px;color:#2a4020">Click to create new world</div>`;
      card.onclick = () => openSlot(i, null);
    }
    grid.appendChild(card);
  }
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function openSlot(slot, data){
  selectedSlot = slot;
  isLoadingExisting = !!data;

  // Restore saved player name
  const savedName = getSavedName();

  if(data){
    // CONTINUE — lock seed, difficulty, world name; restore player name
    document.getElementById('ng-title').textContent = `CONTINUE — SLOT ${slot+1}`;
    document.getElementById('ng-world').value = data.worldName || 'My World';
    document.getElementById('ng-world').disabled = true;
    document.getElementById('ng-seed').value = data.seed || '';
    document.getElementById('ng-seed').disabled = true;
    document.getElementById('ng-name').value = data.players?.[0]?.name || savedName || '';
    document.getElementById('ng-name').disabled = false;
    // Lock difficulty — show but not clickable
    selectedDiff = data.difficulty || 'normal';
    document.querySelectorAll('.diff-opt').forEach(d => {
      d.classList.toggle('active', d.dataset.diff === selectedDiff);
      d.style.opacity = d.dataset.diff === selectedDiff ? '1' : '0.3';
      d.style.cursor = 'default';
    });
    document.getElementById('diff-field').style.opacity = '0.6';
  } else {
    // NEW GAME
    document.getElementById('ng-title').textContent = `NEW WORLD — SLOT ${slot+1}`;
    document.getElementById('ng-world').value = 'My World';
    document.getElementById('ng-world').disabled = false;
    document.getElementById('ng-seed').value = '';
    document.getElementById('ng-seed').disabled = false;
    document.getElementById('ng-name').value = savedName || '';
    document.getElementById('ng-name').disabled = false;
    selectedDiff = 'normal';
    document.querySelectorAll('.diff-opt').forEach(d => {
      d.classList.toggle('active', d.dataset.diff === 'normal');
      d.style.opacity = '1';
      d.style.cursor = 'pointer';
    });
    document.getElementById('diff-field').style.opacity = '1';
  }

  updateSeedPreview();
  showScreen('screen-newgame');
}

// ── Seed preview minimap ──────────────────────────────────────────────────────
function updateSeedPreview(){
  const seedStr = document.getElementById('ng-seed').value.trim();
  const seed = seedStr ? parseSeed(seedStr) : null;
  const canvas = document.getElementById('seed-preview');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const info = document.getElementById('wp-info');

  if(!seed){ ctx.fillStyle='#020602'; ctx.fillRect(0,0,W,H); info.textContent='Enter a seed to preview'; return; }

  const scale = 4; // pixels per tile in preview
  const tilesW = W/scale, tilesH = H/scale;
  for(let ty=0;ty<tilesH;ty++){
    for(let tx=0;tx<tilesW;tx++){
      const wx=tx-tilesW/2, wy=ty-tilesH/2;
      const biome = getBiome(wx,wy,seed);
      const elev  = octaveNoise(wx,wy,seed,5,0.5,0.012);
      let col;
      if(elev<0.22)      col='#1e3a6e';
      else if(elev<0.30) col='#2a5090';
      else if(elev<0.35) col='#c8b464';
      else if(biome==='tundra') col=elev<0.75?'#c8d8e8':'#a0b8d0';
      else if(biome==='desert') col='#c8b464';
      else if(biome==='swamp')  col='#3a5a30';
      else if(elev>0.72)        col='#787878';
      else                      col='#3a7830';
      ctx.fillStyle=col; ctx.fillRect(tx*scale,ty*scale,scale,scale);
    }
  }
  // Settlement dots
  for(let cy=-tilesH/2/CHUNK_SIZE;cy<tilesH/2/CHUNK_SIZE;cy++){
    for(let cx=-tilesW/2/CHUNK_SIZE;cx<tilesW/2/CHUNK_SIZE;cx++){
      const s=getSettlement(cx,cy,seed);
      if(s==='city'){ ctx.fillStyle='#ff8c00'; ctx.fillRect((cx*CHUNK_SIZE+tilesW/2)*scale,(cy*CHUNK_SIZE+tilesH/2)*scale,CHUNK_SIZE*scale,CHUNK_SIZE*scale); }
      else if(s==='neighbourhood'){ ctx.fillStyle='rgba(255,200,50,0.4)'; ctx.fillRect((cx*CHUNK_SIZE+tilesW/2)*scale,(cy*CHUNK_SIZE+tilesH/2)*scale,CHUNK_SIZE*scale,CHUNK_SIZE*scale); }
    }
  }
  // Spawn marker
  ctx.fillStyle='#5080ff'; ctx.beginPath(); ctx.arc(W/2,H/2,4,0,Math.PI*2); ctx.fill();
  info.textContent=`Seed: ${seed}`;
}

// Hook seed input to preview
document.addEventListener('DOMContentLoaded', ()=>{
  const si = document.getElementById('ng-seed');
  if(si) si.addEventListener('input', updateSeedPreview);
  // Restore saved name in join screen too
  const jn = document.getElementById('j-name');
  if(jn){ const n=getSavedName(); if(n) jn.value=n; }
});

// ── Seed parsing — supports up to 15-digit seeds ──────────────────────────────
function parseSeed(str){
  str = str.trim();
  if(!str) return Math.floor(Math.random() * 999999999999999);
  // Named seeds → hash
  if(!/^\d+$/.test(str)){
    let h = 0;
    for(let i=0;i<str.length;i++) h = Math.imul(31,h)+str.charCodeAt(i)|0;
    return Math.abs(h) % 999999999999999;
  }
  return Math.min(parseInt(str), 999999999999999);
}

// ── Yield to browser (allows repaint between heavy operations) ────────────────
function yieldFrame(){ return new Promise(r=>setTimeout(r,16)); }

// ── Solo net — no-op network for single player ────────────────────────────────
class SoloNet {
  sendTo(){}
  broadcast(){}
  sendToHost(){}
  destroy(){}
  connections={}
}

// ── Room code generator ───────────────────────────────────────────────────────
function genRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, ()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}

function copyRoomCode(){
  const code = document.getElementById('room-code-val').textContent;
  navigator.clipboard?.writeText(code).catch(()=>{});
}

// ── Loading helpers ───────────────────────────────────────────────────────────
const LOADING_TIPS = [
  'Build a bed to set your respawn point.',
  'Craft a flashlight — you\'ll need it at night.',
  'Cities have the best loot but the most zombies.',
  'Campfires keep you warm and light up the dark.',
  'Farm crops for a sustainable food supply.',
  'Iron + Gun Parts + Blueprint = Firearms.',
  'Downed teammates have 120 seconds — revive them!',
  'Blizzards drain body temperature fast. Stay inside.',
  'Purify dirty water at a Water Filter.',
  'Stone walls are much stronger than wooden ones.',
  'Crouch (Shift) to reduce zombie detection range.',
  'Find a Radio Tower to unlock long-range chat.',
  'Backpacks expand your inventory grid space.',
  'Raiders are hostile survivors — approach with caution.',
  'Copper + Gunpowder = bullets. Choose your calibre.',
];
function showLoading(text, pct){
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-bar').style.width = pct + '%';
  if(pct <= 15) document.getElementById('loading-tip').textContent =
    LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  dbg(text + ' (' + pct + '%)');
}
function hideLoading(){ document.getElementById('loading').classList.add('hidden'); }

function toggleDebug(){
  const d = document.getElementById('loading-debug');
  const b = document.getElementById('loading-debug-btn');
  const show = d.style.display==='none';
  d.style.display = show?'block':'none';
  b.textContent = show?'hide debug':'show debug';
}

// Debug logger — appends to the debug panel and console
function dbg(msg, isErr=false){
  console[isErr?'error':'log']('[DZ]', msg);
  const el = document.getElementById('loading-debug');
  if(!el) return;
  const line = document.createElement('div');
  line.style.color = isErr ? '#e06060' : '#4a8a4a';
  line.textContent = (new Date().toLocaleTimeString()) + '  ' + msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// Global error catcher — shows errors in debug panel
window.addEventListener('error', e=>{
  dbg('ERROR: ' + e.message + ' (' + (e.filename||'').split('/').pop() + ':' + e.lineno + ')', true);
  const el = document.getElementById('loading-debug');
  if(el){ el.parentElement.style.display='block'; document.getElementById('loading-debug-btn').textContent='hide debug'; el.style.display='block'; }
});
window.addEventListener('unhandledrejection', e=>{
  dbg('PROMISE ERROR: ' + (e.reason?.message||e.reason), true);
  const el = document.getElementById('loading-debug');
  if(el){ el.parentElement.style.display='block'; document.getElementById('loading-debug-btn').textContent='hide debug'; el.style.display='block'; }
});

// ── Find safe spawn point ─────────────────────────────────────────────────────
// Only checks already-generated tiles — no chunk generation here
function findSafeSpawn(game){
  const safe = new Set([T.GRASS, T.DIRT, T.SAND, T.FLOOR, T.ROAD, T.SNOW, T.SWAMP]);
  // Search all tiles in loaded area — find closest safe tile to origin
  let bestX=null, bestY=null, bestDist=99999;
  for(let y=-32;y<=32;y++){
    for(let x=-32;x<=32;x++){
      const tile=game.getTile(x,y);
      if(safe.has(tile)){
        const dist=Math.hypot(x,y);
        if(dist<bestDist){ bestDist=dist; bestX=x; bestY=y; }
      }
    }
  }
  if(bestX!==null) return [bestX+0.5, bestY+0.5];
  // Fallback — any non-water, non-solid tile in wider area
  for(let y=-50;y<=50;y++) for(let x=-50;x<=50;x++){
    const t=game.getTile(x,y);
    if(!WATER_TILES.has(t)&&!SOLID_TILES.has(t)) return [x+0.5,y+0.5];
  }
  return [0.5, 0.5];
}

// ── Start new / continue game ─────────────────────────────────────────────────
async function startNewGame(){
  const nameInput = document.getElementById('ng-name').value.trim();
  const name      = nameInput || 'Survivor';
  const worldName = document.getElementById('ng-world').value.trim() || 'My World';
  const seedStr   = document.getElementById('ng-seed').value.trim();
  const diff      = selectedDiff;
  const slot      = selectedSlot;

  savePlayerName(name);

  const savedData = loadSave(slot);
  const seed = savedData?.seed || parseSeed(seedStr);
  const pvp  = savedData?.pvp ?? (document.getElementById('ng-pvp')?.checked||false);
  const roomCode = genRoomCode();

  // Step 1 — show loading, yield to browser so it can repaint
  showLoading('Initialising world...', 10);
  await yieldFrame();

  let game;
  try{
    dbg('Creating Game object seed='+seed+' diff='+(savedData?.difficulty||diff));
    game = new Game(seed, savedData?.difficulty || diff, true);
    game.worldName = worldName;
    game.pvp = pvp;
    dbg('Game object created OK');
  } catch(e){
    dbg('FAILED creating Game: '+e.message, true);
    hideLoading(); alert('Game init failed: '+e.message); return;
  }

  if(savedData){
    try{
      game.weather.fromJSON(savedData.weather || {});
      for(const bd of savedData.blocks || []){ const b = PlacedBlock.fromJSON(bd); game.blocks[b.blockId] = b; }
      game.lootCrates = savedData.lootCrates || {};
      game.crops      = savedData.crops || {};
      dbg('Save data loaded OK');
    } catch(e){ dbg('WARN loading save: '+e.message, true); }
  }

  // Step 2 — generate spawn chunks (5×5 to ensure we find land)
  showLoading('Generating world...', 25);
  await yieldFrame();
  try{
    for(let dy=-2;dy<=2;dy++){
      dbg('Generating chunk row dy='+dy);
      for(let dx=-2;dx<=2;dx++) game.getChunk(dx,dy);
      await yieldFrame();
    }
    dbg('Chunks generated OK');
  } catch(e){
    dbg('FAILED generating chunks: '+e.message, true);
    hideLoading(); alert('World gen failed: '+e.message); return;
  }

  // Step 3 — find safe spawn (search wider area)
  showLoading('Finding spawn point...', 55);
  await yieldFrame();
  try{
    const [spx, spy] = findSafeSpawn(game);
    game.spawnX = spx; game.spawnY = spy;
    dbg('Spawn found at '+spx.toFixed(1)+','+spy.toFixed(1));
  } catch(e){ dbg('WARN spawn: '+e.message, true); game.spawnX=0.5; game.spawnY=0.5; }

  const hostPid = 'host_' + Math.random().toString(36).slice(2,8);
  const hp = new Player(hostPid, name, game.spawnX, game.spawnY);
  if(savedData){
    const sp = savedData.players?.find(p => p.name === name);
    if(sp){ Object.assign(hp, sp); hp.pid = hostPid; }
  } else {
    // First time joining — give starting bat
    hp.inventory['bat'] = 1;
    hp.inventory['bandage'] = 2;
    hp.inventory['food_can'] = 1;
    hp.durability['bat'] = ITEM_DURABILITY['bat'] || 100;
    dbg('New player — gave starting items');
  }
  game.players[hostPid] = hp;
  dbg('Host player created: '+hostPid);

  // Step 4 — network (skip if solo)
  showLoading('Starting network...', 70);
  await yieldFrame();
  dbg('Network method: '+hostMethod);

  let net = null;
  if(hostMethod === 'solo'){
    net = new SoloNet();
    dbg('Solo mode — no network');
  } else if(hostMethod === 'peer'){
    net = new PeerNetwork(true,
      (msg,fromId) => handleClientMsg(game,net,msg,fromId,_ui,_renderer,hostPid),
      (peerId)     => onPeerJoin(game,net,peerId,_ui),
      (peerId)     => onPeerLeave(game,peerId,_ui)
    );
    try{
      await Promise.race([
        net.host(roomCode),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),8000))
      ]);
      dbg('PeerJS connected, room='+roomCode);
    } catch(e){
      dbg('PeerJS failed: '+e.message, true);
      hideLoading();
      alert('PeerJS failed: '+e.message+'\nTip: Use "Solo" mode to play offline, or Method 2 (Ably) for online.');
      return;
    }
  } else {
    const ablyKey = document.getElementById('h-ably-key').value.trim();
    if(!ablyKey){ alert('Enter your Ably API key.'); hideLoading(); return; }
    net = new AblyNetwork(true,
      (msg,fromId) => handleClientMsg(game,net,msg,fromId,_ui,_renderer,hostPid),
      (peerId)     => onPeerJoin(game,net,peerId,_ui),
      (peerId)     => onPeerLeave(game,peerId,_ui)
    );
    try{ await net.init(ablyKey, roomCode); dbg('Ably connected'); }
    catch(e){ dbg('Ably failed: '+e.message,true); hideLoading(); alert('Ably failed: '+e.message); return; }
  }

  showLoading('Ready!', 100);
  await yieldFrame();
  dbg('Starting game loop...');
  hideLoading();
  if(hostMethod !== 'solo') showRoomCode(roomCode);
  startGame(game, net, hostPid, slot, true);
}

function showRoomCode(code){
  document.getElementById('room-code-val').textContent = code;
  document.getElementById('room-toast').classList.remove('hidden');
}

// ── Join game ─────────────────────────────────────────────────────────────────
async function joinGame(){
  const name  = document.getElementById('j-name').value.trim() || 'Player';
  savePlayerName(name);
  const myPid = 'p_' + Math.random().toString(36).slice(2,8);

  // Pre-create clientGame so startGame gets a stable reference
  clientGame = new Game(0, 'normal', false);

  showLoading('Connecting to host...', 20);

  let net = null, roomCode = '';
  if(joinMethod === 'peer'){
    roomCode = document.getElementById('j-code').value.trim().toUpperCase();
    if(!roomCode){ alert('Enter a room code.'); hideLoading(); return; }
    net = new PeerNetwork(false,
      (msg) => handleServerMsg(msg, myPid),
      ()=>{}, ()=>{ _ui?.notify('Disconnected from host.','#ff4444'); }
    );
    try{ await net.join(roomCode); }
    catch(e){ hideLoading(); alert('Could not connect: '+e.message); return; }
  } else {
    const ablyKey = document.getElementById('j-ably-key').value.trim();
    roomCode = document.getElementById('j-ably-code').value.trim().toUpperCase();
    if(!ablyKey||!roomCode){ alert('Enter Ably key and room code.'); hideLoading(); return; }
    net = new AblyNetwork(false,
      (msg) => handleServerMsg(msg, myPid),
      ()=>{}, ()=>{ _ui?.notify('Disconnected from host.','#ff4444'); }
    );
    try{ await net.init(ablyKey, roomCode); }
    catch(e){ hideLoading(); alert('Ably failed: '+e.message); return; }
  }

  showLoading('Waiting for world data...', 60);
  net.sendToHost({type:'join', pid:myPid, name});

  const ok = await new Promise(res=>{
    const check = setInterval(()=>{
      if(clientGame && clientGame.players[myPid]){ clearInterval(check); res(true); }
    }, 200);
    setTimeout(()=>{ clearInterval(check); res(false); }, 12000);
  });

  hideLoading();
  if(!ok){ alert('Timed out. Check the room code and try again.'); return; }
  startGame(clientGame, net, myPid, null, false);
}

// ── Server message handler (client side) ──────────────────────────────────────
function handleServerMsg(msg, myPid){
  if(!msg) return;
  if(msg.type==='welcome'){
    if(!clientGame){
      clientGame = new Game(msg.seed, msg.difficulty, false);
    } else {
      // Update existing game in place so startGame's reference stays valid
      clientGame.seed = msg.seed;
      clientGame.difficulty = msg.difficulty;
    }
    const p = Player.fromJSON(msg.player);
    clientGame.players[p.pid] = p;
    clientGame.weather.fromJSON(msg.weather||{});
  }
  if(!clientGame) return;
  const g = clientGame;
  if(msg.type==='chunk'){
    const c=msg.chunk; g.chunks[`${c.cx},${c.cy}`]=c;
    for(const lc of c.loots||[]){
      const wx=c.cx*CHUNK_SIZE+lc.x, wy=c.cy*CHUNK_SIZE+lc.y;
      const wk=`${wx},${wy}`; if(!(wk in g.lootCrates)) g.lootCrates[wk]=lc.items;
    }
  }
  if(msg.type==='state'){
    for(const pd of msg.players||[]){
      if(g.players[pd.pid]){
        const existing = g.players[pd.pid];
        // Smooth interpolation for remote players
        if(pd.pid !== myPid){
          existing._targetX = pd.x;
          existing._targetY = pd.y;
          // Copy all non-position fields immediately
          const {x,y,...rest} = pd;
          Object.assign(existing, rest);
        } else {
          Object.assign(existing, pd);
        }
      } else {
        g.players[pd.pid]=Player.fromJSON(pd);
      }
    }
    for(const zd of msg.zombies||[]){
      if(g.zombies[zd.zid]){
        const ez=g.zombies[zd.zid];
        ez._targetX=zd.x; ez._targetY=zd.y;
        const {x,y,...rest}=zd; Object.assign(ez,rest);
      } else {
        const nz=Zombie.fromJSON(zd);
        nz._targetX=nz.x; nz._targetY=nz.y;
        g.zombies[zd.zid]=nz;
      }
    }
    const zids=new Set((msg.zombies||[]).map(z=>z.zid));
    for(const zid of Object.keys(g.zombies)) if(!zids.has(+zid)) delete g.zombies[zid];
    for(const dd of msg.drops||[]) g.drops[dd.dropId]=dd;
    const dids=new Set((msg.drops||[]).map(d=>d.dropId));
    for(const did of Object.keys(g.drops)) if(!dids.has(+did)) delete g.drops[did];
    for(const bd of msg.blocks||[]){ g.blocks[bd.blockId]=PlacedBlock.fromJSON(bd); }
    const bids=new Set((msg.blocks||[]).map(b=>b.blockId));
    for(const bid of Object.keys(g.blocks)) if(!bids.has(+bid)) delete g.blocks[bid];
    if(msg.weather) g.weather.fromJSON(msg.weather);
    if(msg.deadZombies) g.deadZombies=msg.deadZombies;
    if(msg.paused!==undefined) g.paused=msg.paused;
    if(msg.whistleMarkers) g._whistleMarkers=msg.whistleMarkers;
    // Pickup notifiers
    if(msg.pickups&&_ui&&_renderer){
      for(const pk of msg.pickups){
        if(pk.pid===myPid){
          const [sx,sy]=_renderer.w2s(pk.x,pk.y);
          const name=(ITEMS[pk.itemId]||pk.itemId).slice(0,12);
          _ui._lootAnims.push({x:sx,y:sy-20,timer:2.0,text:`+${pk.qty} ${name}`});
        }
      }
    }
  }
  if(msg.type==='tile_update') g.setTile(msg.wx,msg.wy,msg.tile);
  if(msg.type==='player_pos'){
    // Instant position update for smooth remote player movement
    const ep=g.players[msg.pid];
    if(ep&&msg.pid!==myPid){
      ep._targetX=msg.x; ep._targetY=msg.y;
      ep.isMoving=msg.isMoving; ep.sprinting=msg.sprinting;
      ep.crouching=msg.crouching; ep.heldItem=msg.heldItem;
    }
  }
  if(msg.type==='mine_progress'&&_renderer) _renderer.updateMineProgress(msg.wx,msg.wy,msg.hp,msg.maxHp);
  if(msg.type==='loot_collected'&&_ui&&_renderer) _ui.showLootAnim(msg.wx,msg.wy,_renderer);
  if(msg.type==='whistle'&&_ui){
    const whistler=g.players[msg.pid];
    if(whistler&&msg.pid!==myPid) _ui.notify(`${whistler.name} whistled!`,'#ffd700',3);
  }
  if(msg.type==='whistle'&&_ui){
    const whistler=g.players[msg.pid];
    if(whistler&&msg.pid!==myPid) _ui.notify(`${whistler.name} whistled!`,'#ffd700',3);
  }
  if(msg.type==='block_placed'){ const b=PlacedBlock.fromJSON(msg.block); g.blocks[b.blockId]=b; }
  if(msg.type==='block_removed') delete g.blocks[msg.blockId];
  if(msg.type==='block_update'){ const b=PlacedBlock.fromJSON(msg.block); g.blocks[b.blockId]=b; }
  if(msg.type==='notify'&&msg.pid===myPid&&_ui) _ui.notify(msg.text,msg.col||'#fff',2);
  if(msg.type==='item_dropped') g.drops[msg.drop.dropId]=msg.drop;
  if(msg.type==='drop_picked') delete g.drops[msg.dropId];
  if(msg.type==='zombie_dead'){
    delete g.zombies[msg.zid];
    if(typeof sound!=='undefined') sound.onMeleeHit();
  }
  if(msg.type==='gun_jammed'&&_ui) _ui.notify('GUN JAMMED! Repair it.','#ff8c00',3);
  if(msg.type==='fish_caught'&&msg.pid===myPid&&_ui){
    if(msg.item) _ui.notify(`Caught: ${ITEMS[msg.item]||msg.item}!`,'#3c78c8',3);
    else _ui.notify('Nothing on the line...','#888',2);
  }
  if(msg.type==='perfect_block'&&msg.pid===myPid&&_ui) _ui.notify('PERFECT BLOCK!','#7dc832',2);
  if(msg.type==='block_hit'&&msg.pid===myPid&&_ui) _ui.notify('Blocked!','#c8a820',1);
  if(msg.type==='player_blocking'){
    const bp=g.players[msg.pid]; if(bp) bp.blocking=msg.blocking;
  }
  if(msg.type==='sound_event'&&typeof sound!=='undefined'){
    if(msg.sound==='melee_hit') sound.onMeleeHit();
    if(msg.sound==='gunshot') sound.onFire(msg.weapon||'m1911');
  }
  if(msg.type==='death'&&_ui) _ui.notify('You died and respawned.','#ff4444');
  if(msg.type==='hardcore_death'&&_ui) _ui.notify('HARDCORE — World deleted!','#ff0000');
  if(msg.type==='player_down'&&_ui){
    if(msg.pid===myPid) _ui.notify('You are DOWN! Get revived!','#ff8c00');
    else _ui.notify(`${g.players[msg.pid]?.name||'Player'} is down!`,'#ff8c00');
  }
  if(msg.type==='revived'&&_ui) _ui.notify(`${g.players[msg.pid]?.name||'Player'} revived!`,'#50c850');
  if(msg.type==='levelup'&&msg.pid===myPid&&_ui) _ui.notify(`Level up! Lv${msg.level}!`,'#ffd700');
  if(msg.type==='chat'&&_ui){
    // Proximity chat — only show if within range
    const me = clientGame?.players[myPid];
    const sender = clientGame?.players[msg.pid];
    if(me && sender){
      const dist = Math.hypot(me.x-sender.x, me.y-sender.y);
      if(dist <= proxChatRange || msg.global)
        _ui.chatMsgs.push({text:`[${msg.name}] ${msg.text}`, time:Date.now()});
    } else {
      _ui.chatMsgs.push({text:`[${msg.name}] ${msg.text}`, time:Date.now()});
    }
  }
}

// ── Host message handler ──────────────────────────────────────────────────────
function handleClientMsg(game, net, msg, fromId, ui, renderer, hostPid){
  if(!msg) return;
  if(msg.type==='join'){
    const [spx,spy] = findSafeSpawn(game);
    const p = new Player(msg.pid, msg.name, spx, spy);
    p._netId = fromId;
    p._lastChunkCx = Math.floor(spx/CHUNK_SIZE);
    p._lastChunkCy = Math.floor(spy/CHUNK_SIZE);
    game.players[msg.pid] = p;
    net.sendTo(fromId,{type:'welcome',seed:game.seed,difficulty:game.difficulty,
      player:p.toJSON(),weather:game.weather.toJSON()});
    // Send spawn chunks
    const cx=Math.floor(spx/CHUNK_SIZE), cy=Math.floor(spy/CHUNK_SIZE);
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++)
      net.sendTo(fromId,{type:'chunk',chunk:game.getChunk(cx+dx,cy+dy)});
    if(ui) ui.notify(`${msg.name} joined!`,'#50c850');
    net.broadcast({type:'chat',pid:msg.pid,name:'Server',text:`${msg.name} joined the game`,global:true},fromId);
    return;
  }
  // When client moves, check if they need new chunks
  if(msg.type==='move'&&msg.pid){
    const p=game.players[msg.pid];
    if(p){
      const cx=Math.floor(p.x/CHUNK_SIZE), cy=Math.floor(p.y/CHUNK_SIZE);
      if(cx!==p._lastChunkCx||cy!==p._lastChunkCy){
        p._lastChunkCx=cx; p._lastChunkCy=cy;
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
          const k=`${cx+dx},${cy+dy}`;
          if(!game.chunks[k]) game.getChunk(cx+dx,cy+dy);
          net.sendTo(fromId,{type:'chunk',chunk:game.chunks[k]});
        }
      }
    }
  }
  // Proximity chat relay — only send to players within range
  if(msg.type==='chat'){
    const sender = game.players[msg.pid];
    if(sender){
      for(const [pid,p] of Object.entries(game.players)){
        if(pid===msg.pid) continue;
        const dist = Math.hypot(p.x-sender.x, p.y-sender.y);
        if(dist<=proxChatRange || msg.global){
          const conn = net.connections?.[p._netId];
          if(conn) net.sendTo(p._netId, msg);
        }
      }
      // Also show on host
      if(ui) ui.chatMsgs.push({text:`[${msg.name}] ${msg.text}`, time:Date.now()});
    }
    return;
  }
  const pid = msg.pid;
  if(!pid||!game.players[pid]) return;
  const events = game.handleAction(pid, msg);
  if(events) for(const ev of events) net.broadcast(ev);
  // For move actions, immediately broadcast the updated player position
  // so other clients see smooth movement without waiting for state tick
  if(msg.type==='move'){
    const p=game.players[pid];
    if(p) net.broadcast({type:'player_pos',pid,x:p.x,y:p.y,isMoving:p.isMoving,sprinting:p.sprinting,crouching:p.crouching,heldItem:p.heldItem});
  }
}

function onPeerJoin(game, net, peerId, ui){}
function onPeerLeave(game, peerId, ui){
  const p = Object.values(game.players).find(p=>p._netId===peerId);
  if(p){ ui?.notify(`${p.name} left`,'#aaa'); delete game.players[p.pid]; }
}

// ── Game loop ─────────────────────────────────────────────────────────────────
let _ui, _renderer;
let _currentGame = null; // reference to active game for _handleLocalEvent

// Handle events locally (sounds, renderer updates) for the host player
function _handleLocalEvent(ev, myPid){
  if(!ev) return;
  if(typeof sound!=='undefined'){
    if(ev.type==='sound_event'){
      if(ev.sound==='melee_hit') sound.onMeleeHit();
      if(ev.sound==='gunshot') sound.onFire(ev.weapon||'m1911');
    }
    if(ev.type==='zombie_dead') sound.onMeleeHit();
  }
  if(ev.type==='mine_progress'&&_renderer) _renderer.updateMineProgress(ev.wx,ev.wy,ev.hp,ev.maxHp);
  if(ev.type==='loot_collected'&&_ui&&_renderer) _ui.showLootAnim(ev.wx,ev.wy,_renderer);
  if(ev.type==='block_update'){ const g=clientGame||_currentGame; if(g){ const b=PlacedBlock.fromJSON(ev.block); g.blocks[b.blockId]=b; } }
  if(ev.type==='notify'&&ev.pid===myPid&&_ui) _ui.notify(ev.text,ev.col||'#fff',2);
  if(ev.type==='fish_caught'&&_ui){
    if(ev.item) _ui.notify(`Caught: ${ITEMS[ev.item]||ev.item}!`,'#3c78c8',3);
    else _ui.notify('Nothing on the line...','#888',2);
  }
}

function startGame(game, net, myPid, slot, isHost){
  _currentGame = game; // store reference for _handleLocalEvent
  document.getElementById('menu').classList.add('hidden');
  if(typeof sound!=='undefined') sound.stopMenuMusic();
  const canvas = document.getElementById('canvas');
  canvas.classList.remove('hidden');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;

  _ui = new UI(); _renderer = new Renderer(canvas);
  if(!isHost){ clientUi=_ui; clientRenderer=_renderer; }

  const keys = {};
  const chatInputEl = document.getElementById('chat-input');
  const chatWrap    = document.getElementById('chat-input-wrap');

  window.addEventListener('keydown', e=>{
    keys[e.code] = true;
    if(_ui.chatting){
      if(e.key==='Enter'){
        const txt = chatInputEl.value.trim();
        if(txt){
          const p = game.players[myPid];
          const chatMsg = {type:'chat',pid:myPid,name:p?.name||'?',text:txt};
          if(isHost){
            // Host: relay to nearby players
            handleClientMsg(game,net,chatMsg,'host',_ui,_renderer,myPid);
          } else {
            net.sendToHost(chatMsg);
          }
        }
        chatInputEl.value=''; chatWrap.classList.add('hidden'); _ui.chatting=false;
      }
      if(e.key==='Escape'){ chatWrap.classList.add('hidden'); _ui.chatting=false; }
      return;
    }
    if(e.code==='KeyE'){ _ui.showInv=!_ui.showInv; _ui.showCraft=false; }
    if(e.code==='Tab'){ e.preventDefault(); _ui.showCraft=!_ui.showCraft; _ui.craftStation=null; _ui.showInv=false; }
    if(e.code==='KeyT'){ _ui.chatting=true; chatWrap.classList.remove('hidden'); chatInputEl.focus(); }
    // V = melee attack toward mouse
    if(e.code==='KeyV'){
      const me2=game.players[myPid]; if(!me2||me2.isDead||me2.isDown) return;
      const [mwx,mwy]=_renderer.s2w(_mouseX,_mouseY);
      const action={type:'attack',tx:mwx,ty:mwy,pid:myPid};
      if(isHost){
        const evs=game.handleAction(myPid,action);
        if(evs) for(const ev of evs){
          net.broadcast(ev);
          _handleLocalEvent(ev, myPid);
        }
      }
      else net.sendToHost(action);
      if(typeof sound!=='undefined'){
        const held=_ui.hotbar[_ui.hotbarSel];
        if(RANGED.has(held)) sound.onFire(held);
        else sound.onMeleeSwing();
      }
      const dist=Math.hypot(mwx-(me2.x+0.5),mwy-(me2.y+0.5));
      if(dist<=(WEAPON_RANGE[me2.heldItem]||MELEE_RANGE)+0.5){
        const [sx,sy]=_renderer.w2s(mwx,mwy);
        vfx.sparks(sx,sy,'#e08060',5);
      }
    }
    // R = toggle hammer mode
    if(e.code==='KeyR'&&_ui){
      _ui._hammerMode=_ui._hammerMode==='repair'?'destroy':'repair';
      _ui.notify(`Hammer: ${_ui._hammerMode.toUpperCase()}`,'#c8a820',1.5);
    }
    // X = whistle
    if(e.code==='KeyX'){
      const me2=game.players[myPid]; if(!me2||me2.isDead) return;
      const action={type:'whistle',pid:myPid};
      if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
      else net.sendToHost(action);
      _ui.notify('Whistle! Zombies alerted.','#ffd700',2);
      if(typeof sound!=='undefined') sound.play('zombie',0.4);
      // Show whistle VFX
      const [me2sx,me2sy]=_renderer.w2s(me2.x+0.5,me2.y+0.5);
      vfx.sparks(me2sx,me2sy,'#ffd700',8);
    }
    if(e.code==='Escape'){
      if(_ui.showInv||_ui.showCraft){ _ui.showInv=false; _ui.showCraft=false; }
      else {
        _ui.showPause=!_ui.showPause;
        if(typeof sound!=='undefined') sound[_ui.showPause?'onPause':'onUnpause']();
        const paction={type:_ui.showPause?'pause':'unpause',pid:myPid};
        if(isHost){ game.handleAction(myPid,paction); }
        else net.sendToHost(paction);
      }
    }
    if(e.code==='Escape'){ _ui.showInv=false; _ui.showCraft=false; }
    if(e.code==='KeyF'){
      const me=game.players[myPid]; if(!me) return;
      // Revive downed teammates
      for(const p of Object.values(game.players)){
        if(p.isDown&&p.pid!==myPid&&Math.hypot(p.x-me.x,p.y-me.y)<2.5){
          const action={type:'interact',wx:p.x|0,wy:p.y|0,revivePid:p.pid,pid:myPid};
          if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
          else net.sendToHost(action);
        }
      }
      // Loot nearby crates (F key alternative to clicking)
      const searchR=INTERACT_RANGE+0.5;
      for(let dy2=-3;dy2<=3;dy2++) for(let dx2=-3;dx2<=3;dx2++){
        const wx=Math.floor(me.x)+dx2, wy=Math.floor(me.y)+dy2;
        if(Math.hypot(wx+0.5-(me.x+0.5),wy+0.5-(me.y+0.5))<=searchR){
          const tile=game.getTile(wx,wy);
          if(tile===T.LOOT){
            const action={type:'interact',wx,wy,pid:myPid};
            if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
            else net.sendToHost(action);
          }
        }
      }
      // Open nearby doors
      for(const b of Object.values(game.blocks)){
        if(b.blockType==='door_wood'&&Math.hypot(b.x+0.5-(me.x+0.5),b.y+0.5-(me.y+0.5))<=INTERACT_RANGE+0.5){
          const action={type:'interact',wx:b.x,wy:b.y,pid:myPid};
          if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
          else net.sendToHost(action);
        }
      }
      // Fishing rod — use near water
      if(me.inventory?.fishing_rod>0||_ui.hotbar[_ui.hotbarSel]==='fishing_rod'){
        for(let dy2=-3;dy2<=3;dy2++) for(let dx2=-3;dx2<=3;dx2++){
          const wx=Math.floor(me.x)+dx2, wy=Math.floor(me.y)+dy2;
          if(WATER_TILES.has(game.getTile(wx,wy))&&Math.hypot(wx+0.5-(me.x+0.5),wy+0.5-(me.y+0.5))<=3){
            const action={type:'fish',wx,wy,pid:myPid};
            if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs){ net.broadcast(ev); _handleLocalEvent(ev,myPid); } }
            else net.sendToHost(action);
            break;
          }
        }
      }
    }
    for(let i=1;i<=9;i++) if(e.code===`Digit${i}`) _ui.hotbarSel=i-1;
  });
  window.addEventListener('keyup', e=>{ keys[e.code]=false; });
  window.addEventListener('wheel', e=>{ _ui.hotbarSel=(_ui.hotbarSel+Math.sign(e.deltaY)+9)%9; });
  window.addEventListener('mousemove', e=>{
    if(_ui) _ui.handleMouseMove(e.clientX,e.clientY);
    if(_ui?._drag) _ui.updateDrag(e.clientX,e.clientY);
  });

  canvas.addEventListener('mousedown', e=>{
    _mouseHeld=true; _mouseHeldBtn=e.button;
    // Start drag if clicking on inventory item
    if(e.button===0&&_ui?.showInv){
      for(const r of (_ui.invRects||[])){
        if(e.clientX>=r.x&&e.clientX<=r.x+r.w&&e.clientY>=r.y&&e.clientY<=r.y+r.h){
          _ui.startDrag(r.id,r.qty,null,false,e.clientX,e.clientY);
          return; // don't process as normal click
        }
      }
    }
    // Start drag from hotbar
    if(e.button===0&&_ui){
      const sw=54,n=9,total=sw*n;
      const ox=window.innerWidth/2-total/2, oy=window.innerHeight-66;
      for(let i=0;i<n;i++){
        const sx2=ox+i*sw;
        if(e.clientX>=sx2&&e.clientX<=sx2+sw&&e.clientY>=oy&&e.clientY<=oy+54){
          const item=_ui.hotbar[i];
          const me2=game.players[myPid];
          if(item&&me2?.inventory[item]){
            _ui.startDrag(item,me2.inventory[item],null,i,e.clientX,e.clientY);
            return;
          }
        }
      }
    }
    if(_ui.handleClick(e.clientX,e.clientY,game,myPid,action=>{
      action.pid=myPid;
      if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
      else net.sendToHost(action);
    }, e.button===2)) return;

    const me=game.players[myPid]; if(!me||me.isDead||me.isDown) return;
    const [wx,wy]=_renderer.s2w(e.clientX,e.clientY);

    if(e.button===0){
      // Left click = mine tiles + interact with world objects
      const twx=wx|0, twy=wy|0;
      const tile=game.getTile(twx,twy);
      const distToClick=Math.hypot(twx+0.5-(me.x+0.5), twy+0.5-(me.y+0.5));
      const MINE_REACH=3.5;
      let action=null;

      if(tile===T.LOOT && distToClick<=INTERACT_RANGE+1.0)
        action={type:'interact',wx:twx,wy:twy,pid:myPid};
      else if(tile===T.FARMLAND&&CROP_GROWTH[_ui.hotbar[_ui.hotbarSel]]&&distToClick<=INTERACT_RANGE+1.0)
        action={type:'interact',wx:twx,wy:twy,action:'plant',seedId:_ui.hotbar[_ui.hotbarSel],pid:myPid};
      else if([T.CROP_WHEAT,T.CROP_POTATO,T.CROP_CARROT].includes(tile)&&distToClick<=INTERACT_RANGE+1.0)
        action={type:'interact',wx:twx,wy:twy,action:'harvest',pid:myPid};
      else if(_ui.hotbar[_ui.hotbarSel]==='hoe'&&FARM_TILES.has(tile)&&distToClick<=INTERACT_RANGE+1.0)
        action={type:'interact',wx:twx,wy:twy,action:'hoe',pid:myPid};
      else if(MINE_TILES.has(tile)&&distToClick<=MINE_REACH)
        action={type:'mine',tx:twx,ty:twy,pid:myPid};
      else {
        // Check for door block at click position
        for(const b of Object.values(game.blocks)){
          if(b.x===twx&&b.y===twy&&b.blockType==='door_wood'&&distToClick<=INTERACT_RANGE+1.0){
            action={type:'interact',wx:twx,wy:twy,pid:myPid};
            break;
          }
        }
      }

      if(action){
        if(isHost){
          const evs=game.handleAction(myPid,action);
          if(evs) for(const ev of evs){
            net.broadcast(ev);
            if(ev.type==='mine_progress'&&_renderer) _renderer.updateMineProgress(ev.wx,ev.wy,ev.hp,ev.maxHp);
          }
        }
        else net.sendToHost(action);
        // VFX only when in range
        if(distToClick<=MINE_REACH){
          const [sx,sy]=_renderer.w2s(twx+0.5,twy+0.5);
          vfx.sparks(sx,sy,'#c8a820',3);
        }
      }
    } else if(e.button===2){
      const held=_ui.hotbar[_ui.hotbarSel];
      const me2=game.players[myPid]; if(!me2) return;
      // Check workbench/furnace — use Math.floor for correct negative coords
      for(const b of Object.values(game.blocks)){
        if(b.x===Math.floor(wx)&&b.y===Math.floor(wy)){
          if(b.blockType==='workbench'||b.blockType==='workbench_t2'){ _ui.craftStation='workbench'; _ui.showCraft=true; return; }
          if(b.blockType==='furnace'||b.blockType==='furnace_small'||b.blockType==='furnace_medium'||b.blockType==='furnace_large'||b.blockType==='stove'){ _ui.craftStation='furnace'; _ui.showCraft=true; return; }
        }
      }
      // Hammer — repair/deconstruct
      if(held==='hammer'){
        for(const b of Object.values(game.blocks)){
          if(b.x===Math.floor(wx)&&b.y===Math.floor(wy)){
            const mode=_ui._hammerMode||'repair';
            const action={type:'hammer',wx:Math.floor(wx),wy:Math.floor(wy),mode,pid:myPid};
            if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
            else net.sendToHost(action);
            return;
          }
        }
      }
      // Place block
      if(held&&PLACEABLE.has(held)){
        // Use Math.floor for correct negative coord handling
        const pwx=Math.floor(wx), pwy=Math.floor(wy);
        const me3=game.players[myPid];
        // Prevent placing on player's own tile
        if(me3&&Math.floor(me3.x)===pwx&&Math.floor(me3.y)===pwy) return;
        const action={type:'place',itemId:held,wx:pwx,wy:pwy,pid:myPid};
        if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
        else net.sendToHost(action);
      } else if(!held){
        // No item — start blocking
        const baction={type:'block_start',pid:myPid};
        if(isHost) game.handleAction(myPid,baction);
        else net.sendToHost(baction);
      }
    }
  });
  canvas.addEventListener('contextmenu', e=>e.preventDefault());
  canvas.addEventListener('mouseup', e=>{
    _mouseHeld=false; _mouseHeldBtn=-1; _mineTimer=0;
    // End drag
    if(_ui?._drag){
      const me2=game.players[myPid];
      _ui.endDrag(e.clientX,e.clientY,me2,(action)=>{
        action.pid=myPid;
        if(isHost){ const evs=game.handleAction(myPid,action); if(evs) for(const ev of evs) net.broadcast(ev); }
        else net.sendToHost(action);
      });
      return;
    }
    if(e.button===2){
      const baction={type:'block_end',pid:myPid};
      if(isHost) game.handleAction(myPid,baction);
      else net.sendToHost(baction);
    }
  });
  window.addEventListener('resize',()=>{
    canvas.width=window.innerWidth; canvas.height=window.innerHeight;
    _renderer.resize(window.innerWidth,window.innerHeight);
  });

  let lastTime=performance.now(), tickAcc=0, stateAcc=0;
  let lastLogicTime=performance.now();
  let _lastSprinting=false;
  let _zombieSoundTimer=5;
  let _mouseHeld=false, _mouseHeldBtn=-1;
  let _mineTimer=0; // cooldown between mine hits
  const TICK_DT=1/TICK_RATE;

  // ── LOGIC LOOP — runs via setInterval so it works even when tab is hidden ────
  // This handles: game tick, state broadcast, movement input, interpolation
  const LOGIC_HZ = 30; // 30 logic updates/sec
  const logicInterval = setInterval(()=>{
    const now = performance.now();
    const dt  = Math.min((now - lastLogicTime) / 1000, 0.1);
    lastLogicTime = now;

    const me = game.players[myPid];
    const isCrouching = keys['KeyC'];
    const staminaOk = !(me?.staminaLocked) && (me?.stamina||0) > 0;
    const isSprinting = (keys['ShiftLeft']||keys['ShiftRight']) && !isCrouching && staminaOk;

    if(isSprinting && !_lastSprinting && typeof sound!=='undefined') sound.play('walk_grass',0.3);
    _lastSprinting = isSprinting;

    if(me&&!me.isDead&&!me.isDown&&!_ui.chatting&&!_ui.showPause){
      let dx=0,dy=0;
      if(keys['KeyW']||keys['ArrowUp'])    dy=-1;
      if(keys['KeyS']||keys['ArrowDown'])  dy= 1;
      if(keys['KeyA']||keys['ArrowLeft'])  dx=-1;
      if(keys['KeyD']||keys['ArrowRight']) dx= 1;
      if(dx||dy){
        const mag=Math.hypot(dx,dy)||1;
        const action={type:'move',dx:dx/mag,dy:dy/mag,heldItem:_ui.hotbar[_ui.hotbarSel],crouching:isCrouching,sprinting:isSprinting,pid:myPid};
        if(isHost){
          game.handleAction(myPid,action);
        } else {
          // Client-side prediction — apply movement locally immediately
          // so it feels responsive without waiting for server
          const p=game.players[myPid];
          if(p&&!p.isDown&&!p.isDead){
            const staminaOk=!(p.staminaLocked)&&(p.stamina||0)>0;
            const canSprint=staminaOk&&!isCrouching;
            const spd=(isCrouching?PLAYER_CROUCH_SPEED:canSprint&&isSprinting?PLAYER_SPRINT_SPEED:PLAYER_SPEED)/TICK_RATE;
            const nx=p.x+(dx/mag)*spd, ny=p.y+(dy/mag)*spd;
            if(!game.isSolid(Math.floor(nx),Math.floor(p.y))) p.x=nx;
            if(!game.isSolid(Math.floor(p.x),Math.floor(ny))) p.y=ny;
            p.isMoving=true;
          }
          net.sendToHost(action);
        }
      } else if(me.isMoving){
        const action={type:'move',dx:0,dy:0,heldItem:_ui.hotbar[_ui.hotbarSel],crouching:false,sprinting:false,pid:myPid};
        if(isHost) game.handleAction(myPid,action);
        else { me.isMoving=false; net.sendToHost(action); }
      }
    }

    if(isHost){
      tickAcc+=dt;
      while(tickAcc>=TICK_DT){ game.tick(TICK_DT); tickAcc-=TICK_DT; }
      stateAcc+=dt;
      if(stateAcc>=1/20){
        net.broadcast({type:'state',...game.getState()});
        stateAcc=0;
      }
    }

    // Interpolate remote entities (runs even when tab hidden for smooth catch-up)
    const g = isHost ? game : (clientGame||game);
    for(const p of Object.values(g.players)){
      if(p.pid===myPid) continue;
      if(p._targetX!==undefined){
        p.x += (p._targetX - p.x) * Math.min(1, dt*20);
        p.y += (p._targetY - p.y) * Math.min(1, dt*20);
      }
    }
    for(const z of Object.values(g.zombies)){
      if(z._targetX!==undefined){
        z.x += (z._targetX - z.x) * Math.min(1, dt*16);
        z.y += (z._targetY - z.y) * Math.min(1, dt*16);
      }
    }

    // Zombie ambient sound
    _zombieSoundTimer-=dt;
    if(_zombieSoundTimer<=0&&typeof sound!=='undefined'){
      const me3=game.players[myPid];
      if(me3&&Object.values(game.zombies).some(z=>Math.hypot(z.x-me3.x,z.y-me3.y)<15))
        sound.onZombie();
      _zombieSoundTimer=8+Math.random()*12;
    }

    // Continuous mining — hold left mouse button
    _mineTimer=Math.max(0,_mineTimer-dt);
    if(_mouseHeld && _mouseHeldBtn===0 && _mineTimer<=0 && me&&!me.isDead&&!me.isDown&&!_ui.showInv&&!_ui.showCraft&&!_ui.showPause){
      const [mwx2,mwy2]=_renderer.s2w(_mouseX,_mouseY);
      const twx2=Math.floor(mwx2), twy2=Math.floor(mwy2);
      const tile2=game.getTile(twx2,twy2);
      const dist2=Math.hypot(twx2+0.5-(me.x+0.5),twy2+0.5-(me.y+0.5));
      if(MINE_TILES.has(tile2)&&dist2<=MINE_REACH){
        const mineAction={type:'mine',tx:twx2,ty:twy2,pid:myPid};
        if(isHost){
          const evs=game.handleAction(myPid,mineAction);
          if(evs) for(const ev of evs){ net.broadcast(ev); _handleLocalEvent(ev,myPid); }
        } else net.sendToHost(mineAction);
        _mineTimer=0.25; // hit every 0.25s while held
      }
    }
    _ui.tickNotifications(dt);
    vfx.tick(dt);
    // Sync hotbar with current inventory
    const me2=game.players[myPid];
    if(me2) _ui.syncHotbar(me2.inventory||{});
    // Pickup notifiers for host player
    if(isHost&&_ui&&_renderer&&game._pendingPickups&&game._pendingPickups.length){
      for(const pk of game._pendingPickups){
        if(pk.pid===myPid){
          const me2=game.players[myPid];
          if(me2){
            const [sx,sy]=_renderer.w2s(pk.x,pk.y);
            const name=(ITEMS[pk.itemId]||pk.itemId).slice(0,12);
            _ui._lootAnims.push({x:sx,y:sy-20,timer:2.0,text:`+${pk.qty} ${name}`});
          }
        }
      }
      game._pendingPickups=[];
    }
    if(typeof sound!=='undefined') sound.tick(dt, game, myPid, game.weather.toJSON());

  }, 1000/LOGIC_HZ);

  // ── RENDER LOOP — requestAnimationFrame, only draws ──────────────────────────
  function renderLoop(now){
    const me = game.players[myPid];
    if(me) _renderer.smoothCam(me.x+0.5, me.y+0.5, 1/60);
    _renderer.render(game, myPid, _ui, 1/60);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  // Handle tab visibility — when tab becomes visible again, reset timing
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden){
      lastLogicTime = performance.now();
      tickAcc = 0;
      dbg('Tab refocused — timing reset');
    }
  });

  if(isHost&&slot!==null){
    setInterval(()=>{ game.save(slot); dbg('Autosaved'); }, 120000);
    window.addEventListener('beforeunload',()=>game.save(slot));
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload',()=>clearInterval(logicInterval));
}

// ── Settings ──────────────────────────────────────────────────────────────────
const SETTINGS_DEFAULTS = {
  volume: 80, sfx: 80, renderDist: 3, showFps: false, particles: true
};

function updateSlider(el, labelId){
  const v = parseInt(el.value);
  const label = document.getElementById(labelId);
  if(!label) return;
  // Show % for audio, raw number for others
  label.textContent = labelId.includes('dist') ? v : v + '%';
}

function saveSettings(){
  const s = {
    volume:     parseInt(document.getElementById('vol-master').value),
    sfx:        parseInt(document.getElementById('vol-sfx').value),
    renderDist: parseInt(document.getElementById('render-dist').value),
    showFps:    document.getElementById('show-fps').checked,
    particles:  document.getElementById('particles-on').checked,
  };
  if(_ui){ _ui._showFps = s.showFps; }
  if(typeof sound!=='undefined') sound.setVolume(s.volume, s.sfx);
  localStorage.setItem('dz_settings', JSON.stringify(s));
  showScreen('menu-main');
}

function resetSettings(){
  const s = SETTINGS_DEFAULTS;
  document.getElementById('vol-master').value  = s.volume;
  document.getElementById('vol-sfx').value     = s.sfx;
  document.getElementById('render-dist').value = s.renderDist;
  document.getElementById('show-fps').checked  = s.showFps;
  document.getElementById('particles-on').checked = s.particles;
  updateSlider(document.getElementById('vol-master'),  'vol-label');
  updateSlider(document.getElementById('vol-sfx'),     'vol-sfx-label');
  updateSlider(document.getElementById('render-dist'), 'render-dist-label');
  localStorage.removeItem('dz_settings');
}

(function loadSettings(){
  try{
    const raw = localStorage.getItem('dz_settings');
    const s = raw ? JSON.parse(raw) : SETTINGS_DEFAULTS;
    const vol  = document.getElementById('vol-master');
    const sfx  = document.getElementById('vol-sfx');
    const rd   = document.getElementById('render-dist');
    const fps  = document.getElementById('show-fps');
    const part = document.getElementById('particles-on');
    if(vol)  { vol.value  = s.volume     ?? 80;    updateSlider(vol,  'vol-label'); }
    if(sfx)  { sfx.value  = s.sfx        ?? 80;    updateSlider(sfx,  'vol-sfx-label'); }
    if(rd)   { rd.value   = s.renderDist ?? 3;     updateSlider(rd,   'render-dist-label'); }
    if(fps)    fps.checked  = s.showFps   ?? false;
    if(part)   part.checked = s.particles ?? true;
  } catch(e){ console.warn('Settings load failed', e); }
})();

// ── Save patch ────────────────────────────────────────────────────────────────
Game.prototype.save = function(slot){
  const data={
    seed:this.seed, difficulty:this.difficulty,
    worldName:this.worldName||'World',
    pvp:this.pvp||false,
    weather:this.weather.toJSON(),
    blocks:Object.values(this.blocks).map(b=>b.toJSON()),
    lootCrates:this.lootCrates, crops:this.crops,
    players:Object.values(this.players).map(p=>p.toJSON()),
    savedAt:Date.now(),
  };
  localStorage.setItem(getSaveKey(slot), JSON.stringify(data));
};
