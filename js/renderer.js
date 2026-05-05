// ── Renderer ──────────────────────────────────────────────────────────────────
class Renderer {
  constructor(canvas){
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.W       = canvas.width;
    this.H       = canvas.height;
    this.camX    = 0;
    this.camY    = 0;
    // Off-screen light buffer for fog-of-war
    this._lightCanvas  = document.createElement('canvas');
    this._lightCtx     = this._lightCanvas.getContext('2d');
    // Off-screen sky gradient buffer
    this._skyCanvas    = document.createElement('canvas');
    this._skyCtx       = this._skyCanvas.getContext('2d');
    this._mineProgress = {};
    this._visitedTiles = new Set();
    this._swingAngles  = {};
    this._torchGlow    = null;
    this._resize();
  }

  _resize(){
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    this._lightCanvas.width  = this.W;
    this._lightCanvas.height = this.H;
    this._skyCanvas.width    = this.W;
    this._skyCanvas.height   = this.H;
  }

  resize(w, h){
    this.canvas.width = w; this.canvas.height = h;
    this._resize();
  }

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  w2s(wx, wy){
    return [
      (wx - this.camX) * TILE_SIZE + this.W / 2 + vfx.shakeX,
      (wy - this.camY) * TILE_SIZE + this.H / 2 + vfx.shakeY,
    ];
  }
  s2w(sx, sy){
    return [
      (sx - this.W / 2) / TILE_SIZE + this.camX,
      (sy - this.H / 2) / TILE_SIZE + this.camY,
    ];
  }

  smoothCam(tx, ty, dt){
    this.camX += (tx - this.camX) * Math.min(1, 8 * dt);
    this.camY += (ty - this.camY) * Math.min(1, 8 * dt);
  }

  // ── Master render ────────────────────────────────────────────────────────────
  render(game, myPid, ui, dt){
    const ctx  = this.ctx;
    const wdata= game.weather.toJSON();
    const tod  = game.weather.timeOfDay;   // 0..DAY_LENGTH
    const dayLen = 1200;

    // Sky colour fills the background
    this._drawSky(ctx, tod, dayLen, wdata);

    // World tiles
    this._drawTiles(ctx, game, wdata, tod, dayLen);
    this._drawBlocks(ctx, game, wdata, tod, dayLen);
    this._drawMineProgress(ctx, tod, dayLen);
    this._drawDrops(ctx, game);
    this._drawProjectiles(ctx, game);
    this._drawRangeCursor(ctx, game, myPid);

    // VFX particles (world-space)
    vfx.drawParticles(ctx);

    // Whistle waypoints
    this._drawWhistleMarkers(ctx, game, myPid);

    // Dead zombie fades + corpses
    this._drawDeadZombies(ctx, game);

    // Entities
    this._drawZombies(ctx, game, wdata);
    this._drawPlayers(ctx, game, myPid, wdata);

    // Fog of war / night lighting (drawn OVER everything)
    this._drawFogOfWar(ctx, game, myPid, tod, dayLen, wdata);

    // Weather precipitation (drawn on top of fog so it's visible)
    const w = wdata.weather;
    if(w === W.RAIN)     vfx.drawRain(ctx, this.W, this.H, 0.7);
    if(w === W.STORM)    vfx.drawRain(ctx, this.W, this.H, 1.4);
    if(w === W.SNOW)     vfx.drawSnow(ctx, this.W, this.H, 0.7);
    if(w === W.BLIZZARD) vfx.drawSnow(ctx, this.W, this.H, 1.6);
    if(w === W.FOG)      vfx.drawFog(ctx, this.W, this.H, 0.22);

    // World-space smoke (campfire etc) — drawn after fog
    vfx.drawWorldSmoke(ctx, (wx,wy)=>this.w2s(wx,wy));

    // Screen-space VFX
    vfx.drawNumbers(ctx);
    vfx.drawFlash(ctx, this.W, this.H);

    // HUD (always on top)
    ui.draw(ctx, game, myPid, wdata, this);
  }

  // ── Sky / background ─────────────────────────────────────────────────────────
  _drawSky(ctx, tod, dayLen, wdata){
    // Normalised time 0..1
    const t = tod / dayLen;
    // Key times
    const DAWN    = 0.20;
    const SUNRISE = 0.25;
    const NOON    = 0.50;
    const SUNSET  = 0.72;
    const DUSK    = 0.78;
    const NIGHT   = 0.85;

    let top, bot;

    if(t < DAWN){
      // Deep night
      top = '#020408'; bot = '#050a10';
    } else if(t < SUNRISE){
      // Pre-dawn → sunrise glow
      const p = (t - DAWN) / (SUNRISE - DAWN);
      top = lerpColor('#020408','#1a0a1e', p);
      bot = lerpColor('#050a10','#c84820', p);
    } else if(t < NOON){
      // Sunrise → midday
      const p = (t - SUNRISE) / (NOON - SUNRISE);
      top = lerpColor('#1a0a1e','#1a3a6e', p);
      bot = lerpColor('#c84820','#4a8ad4', p);
    } else if(t < SUNSET){
      // Midday → pre-sunset
      const p = (t - NOON) / (SUNSET - NOON);
      top = lerpColor('#1a3a6e','#1a2a5e', p);
      bot = lerpColor('#4a8ad4','#3a7ac4', p);
    } else if(t < DUSK){
      // Sunset — golden/orange/red
      const p = (t - SUNSET) / (DUSK - SUNSET);
      top = lerpColor('#1a2a5e','#0a0818', p);
      bot = lerpColor('#3a7ac4','#e05010', p);
    } else if(t < NIGHT){
      // Dusk → night
      const p = (t - DUSK) / (NIGHT - DUSK);
      top = lerpColor('#0a0818','#020408', p);
      bot = lerpColor('#e05010','#050a10', p);
    } else {
      top = '#020408'; bot = '#050a10';
    }

    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Sun / moon
    this._drawCelestial(ctx, tod, dayLen, wdata);

    // Sunset horizon glow
    if(t >= SUNSET - 0.05 && t <= DUSK + 0.05){
      const p = Math.sin(Math.PI * (t - (SUNSET - 0.05)) / (DUSK - SUNSET + 0.1));
      const grd = ctx.createLinearGradient(0, this.H * 0.4, 0, this.H);
      grd.addColorStop(0, `rgba(220,80,10,0)`);
      grd.addColorStop(0.5, `rgba(220,80,10,${0.45 * p})`);
      grd.addColorStop(1, `rgba(255,140,20,${0.3 * p})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.W, this.H);
      // Lens flare streaks
      if(p > 0.3){
        ctx.save();
        ctx.globalAlpha = 0.12 * p;
        for(let i = 0; i < 5; i++){
          const lx = this.W * 0.5 + (i - 2) * this.W * 0.08;
          const lg = ctx.createLinearGradient(lx, this.H * 0.3, lx, this.H);
          lg.addColorStop(0, 'rgba(255,180,50,0)');
          lg.addColorStop(0.5, 'rgba(255,180,50,1)');
          lg.addColorStop(1, 'rgba(255,180,50,0)');
          ctx.fillStyle = lg;
          ctx.fillRect(lx - 2, 0, 4, this.H);
        }
        ctx.restore();
      }
    }

    // Stars at night
    if(t < SUNRISE || t > DUSK){
      const starAlpha = t < DAWN ? 0.9 :
                        t < SUNRISE ? 1 - (t - DAWN) / (SUNRISE - DAWN) :
                        t > NIGHT ? 0.9 :
                        (t - DUSK) / (NIGHT - DUSK);
      this._drawStars(ctx, starAlpha);
    }
  }

  _drawCelestial(ctx, tod, dayLen, wdata){
    const t = tod / dayLen;
    // Sun arc: rises at t=0.25, sets at t=0.75
    const sunT = (t - 0.25) / 0.5;   // 0..1 during day
    if(sunT >= 0 && sunT <= 1){
      const angle = Math.PI * sunT;   // 0=east horizon, PI=west horizon
      const sx = this.W * 0.5 + Math.cos(Math.PI - angle) * this.W * 0.45;
      const sy = this.H * 0.85 - Math.sin(angle) * this.H * 0.75;
      // Glow
      const isSunset = sunT > 0.85 || sunT < 0.15;
      const sunCol   = isSunset ? '#ff8c20' : '#ffe060';
      const glowR    = isSunset ? 80 : 50;
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      grd.addColorStop(0, isSunset ? 'rgba(255,140,30,0.6)' : 'rgba(255,240,100,0.4)');
      grd.addColorStop(1, 'rgba(255,200,50,0)');
      ctx.fillStyle = grd; ctx.fillRect(sx - glowR, sy - glowR, glowR * 2, glowR * 2);
      // Sun disc
      ctx.fillStyle = sunCol;
      ctx.beginPath(); ctx.arc(sx, sy, isSunset ? 18 : 14, 0, Math.PI * 2); ctx.fill();
    }
    // Moon arc: rises at t=0.75, sets at t=0.25
    const moonT = t < 0.25 ? t + 0.25 : t > 0.75 ? t - 0.75 : -1;
    if(moonT >= 0 && moonT <= 0.5){
      const angle = Math.PI * (moonT / 0.5);
      const mx = this.W * 0.5 + Math.cos(Math.PI - angle) * this.W * 0.4;
      const my = this.H * 0.85 - Math.sin(angle) * this.H * 0.65;
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 40);
      grd.addColorStop(0, 'rgba(200,220,255,0.2)');
      grd.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = grd; ctx.fillRect(mx - 40, my - 40, 80, 80);
      ctx.fillStyle = '#d0deff';
      ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill();
      // Crescent shadow
      ctx.fillStyle = 'rgba(5,8,20,0.7)';
      ctx.beginPath(); ctx.arc(mx + 4, my - 2, 9, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawStars(ctx, alpha){
    if(!this._stars){
      this._stars = Array.from({length:200}, () => ({
        x: Math.random(), y: Math.random() * 0.7,
        r: 0.5 + Math.random() * 1.2,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      }));
    }
    const t = Date.now() / 1000;
    ctx.fillStyle = '#fff';
    for(const s of this._stars){
      const a = alpha * (0.5 + 0.5 * Math.sin(t * s.speed + s.twinkle));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x * this.W, s.y * this.H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Tiles ────────────────────────────────────────────────────────────────────
  _drawTiles(ctx, game, wdata, tod, dayLen){
    const ts = TILE_SIZE;
    const tilesX = Math.ceil(this.W / ts) + 3;
    const tilesY = Math.ceil(this.H / ts) + 3;
    const startX = Math.floor(this.camX) - Math.floor(tilesX / 2);
    const startY = Math.floor(this.camY) - Math.floor(tilesY / 2);
    const bright = this._dayBrightness(tod, dayLen);
    const t = Date.now();

    for(let ty = 0; ty < tilesY; ty++){
      for(let tx = 0; tx < tilesX; tx++){
        const wx = startX + tx, wy = startY + ty;
        const tile = game.getTile(wx, wy);
        const [sx, sy] = this.w2s(wx, wy);

        // Base colour
        let col = TILE_COLOR[tile] || '#505050';
        col = this._tintColor(col, bright);
        ctx.fillStyle = col;
        ctx.fillRect(sx, sy, ts + 1, ts + 1);

        // Building fog of war — interior tiles only revealed when player is INSIDE
        const isInterior = tile===T.FLOOR||tile===T.LOOT||tile===T.CAVE_FLOOR;
        const tileKey = `${wx},${wy}`;
        if(isInterior){
          const camTile = game.getTile(Math.floor(this.camX), Math.floor(this.camY));
          const playerInsideBuilding = camTile===T.FLOOR||camTile===T.CAVE_FLOOR||camTile===T.CAVE_ENTRANCE;
          if(playerInsideBuilding){
            const distToCam = Math.hypot(wx+0.5-this.camX, wy+0.5-this.camY);
            if(distToCam < 5) this._visitedTiles.add(tileKey);
          }
          if(!this._visitedTiles.has(tileKey)){
            ctx.fillStyle = 'rgba(0,0,0,0.82)';
            ctx.fillRect(sx, sy, ts+1, ts+1);
          }
        }

        // ── Tile details (drawn on top of base) ──────────────────────────────
        if(tile === T.GRASS){
          // Grass texture — small darker patches
          ctx.fillStyle = this._tintColor(TILE_DETAIL[T.GRASS]||'#2e6e20', bright);
          const seed = (wx*7+wy*13)&0xff;
          if(seed<60)  ctx.fillRect(sx+2,  sy+ts-8, 4, 4);
          if(seed<100) ctx.fillRect(sx+ts-8,sy+4,   4, 4);
          if(seed<40)  ctx.fillRect(sx+ts/2,sy+ts/2,3, 3);
          // Occasional flower dots
          if(seed>240){ ctx.fillStyle=this._tintColor('#e8d040',bright); ctx.fillRect(sx+seed%ts,sy+(seed*3)%ts,2,2); }
        }
        else if(tile === T.STONE){
          // Stone cracks
          ctx.strokeStyle = this._tintColor('#505050', bright);
          ctx.lineWidth = 1;
          const s2 = (wx*11+wy*7)&0xff;
          if(s2<80){ ctx.beginPath(); ctx.moveTo(sx+4,sy+8); ctx.lineTo(sx+12,sy+16); ctx.stroke(); }
          if(s2<50){ ctx.beginPath(); ctx.moveTo(sx+ts-6,sy+4); ctx.lineTo(sx+ts-14,sy+14); ctx.stroke(); }
          ctx.lineWidth = 1;
        }
        else if(tile === T.TREE){
          // Draw grass underneath first, then tree on top
          ctx.fillStyle = this._tintColor('#3d8c2e', bright);
          ctx.fillRect(sx, sy, ts+1, ts+1);
          // Tree trunk
          const cx2 = sx + ts/2, cy2 = sy + ts/2;
          ctx.fillStyle = this._tintColor('#5a3010', bright);
          ctx.fillRect(cx2-4, cy2+2, 8, ts/2-2);
          // Canopy layers (no dark background — just circles)
          const canopyCol = this._tintColor('#2a7020', bright);
          const canopyDark = this._tintColor('#1a5010', bright);
          ctx.fillStyle = canopyCol;
          ctx.beginPath(); ctx.arc(cx2, cy2-2, ts*0.36, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = canopyDark;
          ctx.beginPath(); ctx.arc(cx2-5, cy2-6, ts*0.22, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx2+6, cy2-4, ts*0.20, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = this._tintColor('#3a8828', bright);
          ctx.beginPath(); ctx.arc(cx2+2, cy2-10, ts*0.18, 0, Math.PI*2); ctx.fill();
        }
        else if(tile === T.WATER || tile === T.DEEP_WATER){
          // Animated water ripples
          const wave = Math.sin(t/900 + wx*0.4 + wy*0.3) * 0.06 + 0.06;
          ctx.fillStyle = `rgba(255,255,255,${wave * bright})`;
          ctx.fillRect(sx, sy, ts, ts/3);
          ctx.fillRect(sx+ts/3, sy+ts*0.55, ts*0.5, ts/4);
        }
        else if(tile === T.SAND){
          // Sand ripple lines
          ctx.strokeStyle = this._tintColor('#b8a050', bright);
          ctx.lineWidth = 1;
          for(let i=4;i<ts;i+=8){
            ctx.beginPath(); ctx.moveTo(sx,sy+i); ctx.lineTo(sx+ts,sy+i+2); ctx.stroke();
          }
          ctx.lineWidth = 1;
        }
        else if(tile === T.SNOW){
          // Snow sparkle
          const sp = (wx*17+wy*5)&0xff;
          if(sp<30){ ctx.fillStyle=`rgba(255,255,255,${0.6*bright})`; ctx.fillRect(sx+sp%ts,sy+(sp*3)%ts,2,2); }
        }
        else if(tile === T.LOOT){
          const shimmer = 0.25 + 0.2 * Math.sin(t / 350 + wx + wy);
          ctx.fillStyle = `rgba(255,200,40,${shimmer * bright})`;
          ctx.fillRect(sx+4, sy+4, ts-8, ts-8);
          // Chest outline
          ctx.strokeStyle = this._tintColor('#d0a030', bright);
          ctx.strokeRect(sx+4, sy+4, ts-8, ts-8);
          ctx.beginPath(); ctx.moveTo(sx+4,sy+ts/2); ctx.lineTo(sx+ts-4,sy+ts/2); ctx.stroke();
        }
        else if(tile === T.FARMLAND){
          ctx.strokeStyle = this._tintColor('#3a2010', bright);
          ctx.lineWidth = 1;
          for(let i=6;i<ts;i+=7){ ctx.beginPath(); ctx.moveTo(sx,sy+i); ctx.lineTo(sx+ts,sy+i); ctx.stroke(); }
          ctx.lineWidth = 1;
        }
        else if(tile === T.WALL){
          // Brick pattern
          ctx.strokeStyle = this._tintColor('#3a3028', bright);
          ctx.lineWidth = 1;
          for(let row=0;row<3;row++){
            const off = row%2===0?0:ts/4;
            for(let col=0;col<3;col++){
              ctx.strokeRect(sx+col*ts/2-off, sy+row*ts/3, ts/2, ts/3);
            }
          }
          ctx.lineWidth = 1;
        }
        else if(tile === T.ROAD){
          // Road markings
          const rm = (wx+wy)%4;
          if(rm===0){ ctx.fillStyle=this._tintColor('#606060',bright); ctx.fillRect(sx+ts/2-1,sy,2,ts); }
        }
        else if(tile === T.FLOOR){
          // Floorboard lines
          ctx.strokeStyle = this._tintColor('#7a6850', bright);
          ctx.lineWidth = 1;
          for(let i=8;i<ts;i+=8){ ctx.beginPath(); ctx.moveTo(sx,sy+i); ctx.lineTo(sx+ts,sy+i); ctx.stroke(); }
          ctx.lineWidth = 1;
        }
        else if(tile===T.CAVE_ENTRANCE){
          // Dark entrance with a glow
          ctx.fillStyle=this._tintColor('#1a1a1a',bright);
          ctx.fillRect(sx,sy,ts+1,ts+1);
          const grd=ctx.createRadialGradient(sx+ts/2,sy+ts/2,0,sx+ts/2,sy+ts/2,ts*0.7);
          grd.addColorStop(0,'rgba(0,0,0,0.9)');
          grd.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=grd; ctx.fillRect(sx,sy,ts+1,ts+1);
          ctx.fillStyle=this._tintColor('#555',bright); ctx.font='bold 14px monospace'; ctx.textAlign='center';
          ctx.fillText('▼',sx+ts/2,sy+ts/2+5); ctx.textAlign='left';
        }
        else if(tile===T.CAVE_FLOOR){
          // Cave floor — dark stone
          ctx.fillStyle=this._tintColor('#2a2020',bright);
          ctx.fillRect(sx,sy,ts+1,ts+1);
          // Rock texture
          const seed4=(wx*13+wy*7)&0xff;
          ctx.fillStyle=this._tintColor('#3a3030',bright);
          if(seed4<80) ctx.fillRect(sx+4,sy+4,6,6);
          if(seed4<50) ctx.fillRect(sx+ts-10,sy+ts-10,6,6);
        }
        else if(tile===T.RADIO_TOWER){
          // Base
          ctx.fillStyle=this._tintColor('#505050',bright);
          ctx.fillRect(sx,sy,ts+1,ts+1);
          // Tower structure
          const cx3=sx+ts/2, cy3=sy+ts/2;
          ctx.strokeStyle=this._tintColor('#888',bright); ctx.lineWidth=2;
          // Legs
          ctx.beginPath(); ctx.moveTo(cx3-ts*0.3,sy+ts); ctx.lineTo(cx3,sy+4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx3+ts*0.3,sy+ts); ctx.lineTo(cx3,sy+4); ctx.stroke();
          // Cross braces
          ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(cx3-ts*0.2,sy+ts*0.7); ctx.lineTo(cx3+ts*0.2,sy+ts*0.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx3+ts*0.2,sy+ts*0.7); ctx.lineTo(cx3-ts*0.2,sy+ts*0.5); ctx.stroke();
          // Antenna tip with blinking light
          const blink=Math.sin(Date.now()/500)>0;
          ctx.fillStyle=blink?'#ff4444':'#882222';
          ctx.beginPath(); ctx.arc(cx3,sy+4,3,0,Math.PI*2); ctx.fill();
          ctx.lineWidth=1;
        }
        // Ore veins
        else if(tile===T.ORE_IRON||tile===T.ORE_COAL||tile===T.ORE_GOLD||tile===T.ORE_DIAMOND){
          ctx.fillStyle = this._tintColor('#6e6e6e', bright);
          ctx.fillRect(sx, sy, ts, ts);
          const oreCol = {[T.ORE_IRON]:'#9c6840',[T.ORE_COAL]:'#1a1a1a',[T.ORE_GOLD]:'#c8a820',[T.ORE_DIAMOND]:'#40c8c8'}[tile];
          ctx.fillStyle = this._tintColor(oreCol, bright);
          const seed3 = (wx*5+wy*9)&0xff;
          for(let i=0;i<4;i++){
            const ox2=(seed3*i*7)%ts, oy2=(seed3*i*11)%ts;
            ctx.beginPath(); ctx.arc(sx+ox2,sy+oy2,3+i%2,0,Math.PI*2); ctx.fill();
          }
        }
      }
    }
  }

  _dayBrightness(tod, dayLen){
    const t = tod / dayLen;
    if(t < 0.20) return 0.15;
    if(t < 0.28) return 0.15 + (t - 0.20) / 0.08 * 0.85;
    if(t < 0.72) return 1.0;
    if(t < 0.80) return 1.0 - (t - 0.72) / 0.08 * 0.85;
    return 0.15;
  }

  _tintColor(hex, brightness){
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${r*brightness|0},${g*brightness|0},${b*brightness|0})`;
  }

  // ── Blocks ───────────────────────────────────────────────────────────────────
  _drawBlocks(ctx, game, wdata, tod, dayLen){
    const ts = TILE_SIZE;
    const bright = this._dayBrightness(tod, dayLen);
    const t = Date.now();

    for(const b of Object.values(game.blocks)){
      const [sx, sy] = this.w2s(b.x, b.y);
      if(sx < -ts || sx > this.W + ts || sy < -ts || sy > this.H + ts) continue;
      const cx = sx+ts/2, cy = sy+ts/2;

      // Draw each block type with unique visual
      if(b.blockType==='wall_wood'){
        // Wooden wall — brown planks with grain lines
        ctx.fillStyle=this._tintColor('#7a4a20',bright); ctx.fillRect(sx,sy,ts,ts);
        ctx.strokeStyle=this._tintColor('#5a3010',bright); ctx.lineWidth=2;
        for(let i=0;i<ts;i+=8){ ctx.beginPath(); ctx.moveTo(sx,sy+i); ctx.lineTo(sx+ts,sy+i); ctx.stroke(); }
        ctx.strokeStyle=this._tintColor('#9a6030',bright); ctx.lineWidth=1;
        ctx.strokeRect(sx+1,sy+1,ts-2,ts-2);
      }
      else if(b.blockType==='wall_stone'){
        // Stone wall — grey with brick pattern
        ctx.fillStyle=this._tintColor('#606060',bright); ctx.fillRect(sx,sy,ts,ts);
        ctx.strokeStyle=this._tintColor('#404040',bright); ctx.lineWidth=1;
        // Brick rows
        for(let row=0;row<3;row++){
          const off=row%2===0?0:ts/4;
          for(let col=-1;col<3;col++){
            ctx.strokeRect(sx+col*ts/2-off+1,sy+row*ts/3+1,ts/2-2,ts/3-2);
          }
        }
      }
      else if(b.blockType==='door_wood'){
        if(b.isOpen){
          // Open door — thin strip on left
          ctx.fillStyle=this._tintColor('#8b5a2b',bright); ctx.fillRect(sx,sy,8,ts);
          ctx.strokeStyle=this._tintColor('#5a3010',bright); ctx.strokeRect(sx,sy,8,ts);
          ctx.fillStyle='rgba(255,200,80,0.9)'; ctx.fillRect(sx+3,sy+ts/2-4,3,8);
        } else {
          // Closed door — frame + panels
          ctx.fillStyle=this._tintColor('#8b5a2b',bright); ctx.fillRect(sx+2,sy+2,ts-4,ts-4);
          ctx.strokeStyle=this._tintColor('#5a3010',bright); ctx.lineWidth=2;
          ctx.strokeRect(sx+2,sy+2,ts-4,ts-4);
          ctx.lineWidth=1;
          // Panels
          ctx.strokeStyle=this._tintColor('#6a4020',bright);
          ctx.strokeRect(sx+6,sy+5,ts-12,ts/2-6);
          ctx.strokeRect(sx+6,sy+ts/2+2,ts-12,ts/2-8);
          // Handle
          ctx.fillStyle='rgba(255,200,50,0.9)'; ctx.beginPath(); ctx.arc(sx+ts-10,cy,4,0,Math.PI*2); ctx.fill();
          if(b.locked){ ctx.fillStyle='#ff4444'; ctx.fillRect(sx+ts-13,cy-6,6,12); }
        }
      }
      else if(b.blockType==='campfire'){
        // Ground stones
        ctx.fillStyle=this._tintColor('#606060',bright);
        for(let i=0;i<6;i++){
          const a=i/6*Math.PI*2, r=ts*0.3;
          ctx.beginPath(); ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,4,0,Math.PI*2); ctx.fill();
        }
        // Logs
        ctx.strokeStyle=this._tintColor('#5a3010',bright); ctx.lineWidth=4;
        ctx.beginPath(); ctx.moveTo(cx-ts*0.25,cy+ts*0.1); ctx.lineTo(cx+ts*0.25,cy-ts*0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+ts*0.25,cy+ts*0.1); ctx.lineTo(cx-ts*0.25,cy-ts*0.1); ctx.stroke();
        ctx.lineWidth=1;
        // Animated flames
        const ft=t/200;
        for(let i=0;i<4;i++){
          const fx=cx+Math.sin(ft+i*1.5)*5, fy=cy-8+Math.cos(ft*1.3+i)*3;
          const fr=5+Math.sin(ft*2+i)*2;
          const fg=ctx.createRadialGradient(fx,fy,0,fx,fy,fr*2.5);
          fg.addColorStop(0,'rgba(255,240,80,1)');
          fg.addColorStop(0.4,'rgba(255,120,10,0.8)');
          fg.addColorStop(1,'rgba(255,40,0,0)');
          ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx,fy,fr*2.5,0,Math.PI*2); ctx.fill();
        }
        if(Math.random()<0.04) vfx.smokeWorld(b.x+0.5,b.y+0.2);
      }
      else if(b.blockType==='workbench'||b.blockType==='workbench_t2'){
        // Workbench — table with tools on top
        const col=b.blockType==='workbench_t2'?'#c8a020':'#8b6438';
        ctx.fillStyle=this._tintColor(col,bright); ctx.fillRect(sx+2,sy+ts*0.4,ts-4,ts*0.55);
        // Table legs
        ctx.fillStyle=this._tintColor('#5a3010',bright);
        ctx.fillRect(sx+4,sy+ts*0.7,5,ts*0.25);
        ctx.fillRect(sx+ts-9,sy+ts*0.7,5,ts*0.25);
        // Table top surface
        ctx.fillStyle=this._tintColor('#a07840',bright); ctx.fillRect(sx+1,sy+ts*0.35,ts-2,8);
        // Tools on top (hammer, saw shapes)
        ctx.strokeStyle=this._tintColor('#c0c0c0',bright); ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(sx+8,sy+ts*0.3); ctx.lineTo(sx+16,sy+ts*0.15); ctx.stroke();
        ctx.fillStyle=this._tintColor('#808080',bright); ctx.fillRect(sx+14,sy+ts*0.1,6,5);
        // Saw
        ctx.strokeStyle=this._tintColor('#c0c0c0',bright); ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(sx+ts-18,sy+ts*0.2); ctx.lineTo(sx+ts-6,sy+ts*0.2); ctx.stroke();
        ctx.lineWidth=1;
        if(b.blockType==='workbench_t2'){
          ctx.fillStyle='rgba(255,200,50,0.6)'; ctx.font='8px monospace'; ctx.textAlign='center';
          ctx.fillText('T2',cx,sy+ts*0.32); ctx.textAlign='left';
        }
      }
      else if(b.blockType==='furnace'||b.blockType.startsWith('furnace')||b.blockType==='stove'){
        // Furnace — stone box with glowing opening
        ctx.fillStyle=this._tintColor('#505050',bright); ctx.fillRect(sx+2,sy+2,ts-4,ts-4);
        ctx.strokeStyle=this._tintColor('#303030',bright); ctx.lineWidth=2; ctx.strokeRect(sx+2,sy+2,ts-4,ts-4); ctx.lineWidth=1;
        // Brick texture
        ctx.strokeStyle=this._tintColor('#404040',bright);
        ctx.strokeRect(sx+5,sy+5,ts/2-4,ts/2-4);
        ctx.strokeRect(sx+ts/2+2,sy+5,ts/2-7,ts/2-4);
        ctx.strokeRect(sx+5,sy+ts/2+2,ts-10,ts/2-7);
        // Glowing door opening
        const glow=ctx.createRadialGradient(cx,cy+4,0,cx,cy+4,ts*0.3);
        glow.addColorStop(0,'rgba(255,140,20,0.9)');
        glow.addColorStop(1,'rgba(255,60,0,0)');
        ctx.fillStyle=glow; ctx.fillRect(sx+8,sy+ts*0.45,ts-16,ts*0.4);
        ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(sx+10,sy+ts*0.48,ts-20,ts*0.35);
        const fireGlow=ctx.createRadialGradient(cx,cy+6,0,cx,cy+6,8);
        fireGlow.addColorStop(0,'rgba(255,200,50,0.8)');
        fireGlow.addColorStop(1,'rgba(255,80,0,0)');
        ctx.fillStyle=fireGlow; ctx.fillRect(cx-8,cy-2,16,16);
      }
      else if(b.blockType==='bed'){
        // Bed — frame + pillow + blanket
        ctx.fillStyle=this._tintColor('#5a3010',bright); ctx.fillRect(sx+2,sy+2,ts-4,ts-4);
        ctx.fillStyle=this._tintColor('#c060c0',bright); ctx.fillRect(sx+4,sy+ts*0.35,ts-8,ts*0.55);
        // Pillow
        ctx.fillStyle=this._tintColor('#e0e0e0',bright); ctx.fillRect(sx+6,sy+4,ts-12,ts*0.3);
        ctx.strokeStyle=this._tintColor('#c0c0c0',bright); ctx.strokeRect(sx+6,sy+4,ts-12,ts*0.3);
        // Blanket lines
        ctx.strokeStyle=this._tintColor('#a040a0',bright); ctx.lineWidth=1;
        for(let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(sx+4,sy+ts*0.45+i*6); ctx.lineTo(sx+ts-4,sy+ts*0.45+i*6); ctx.stroke(); }
        ctx.lineWidth=1;
      }
      else if(b.blockType==='torch_placed'){
        // Torch — stick with flame
        ctx.fillStyle=this._tintColor('#5a3010',bright); ctx.fillRect(cx-3,sy+ts*0.3,6,ts*0.6);
        const tf=t/150;
        const tg=ctx.createRadialGradient(cx,sy+ts*0.25,0,cx,sy+ts*0.25,10);
        tg.addColorStop(0,'rgba(255,220,80,1)');
        tg.addColorStop(0.5,'rgba(255,120,20,0.7)');
        tg.addColorStop(1,'rgba(255,60,0,0)');
        ctx.fillStyle=tg; ctx.beginPath(); ctx.arc(cx+Math.sin(tf)*2,sy+ts*0.22,8,0,Math.PI*2); ctx.fill();
      }
      else if(b.blockType==='rain_collector'){
        // Funnel shape
        ctx.fillStyle=this._tintColor('#3c78c8',bright);
        ctx.beginPath(); ctx.moveTo(sx+4,sy+4); ctx.lineTo(sx+ts-4,sy+4); ctx.lineTo(cx+6,cy+8); ctx.lineTo(cx-6,cy+8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle=this._tintColor('#2a5a9a',bright); ctx.stroke();
        // Barrel
        ctx.fillStyle=this._tintColor('#5a3010',bright); ctx.fillRect(cx-6,cy+8,12,ts*0.35);
        ctx.strokeStyle=this._tintColor('#3a2010',bright); ctx.strokeRect(cx-6,cy+8,12,ts*0.35);
      }
      else if(b.blockType==='water_filter'){
        ctx.fillStyle=this._tintColor('#50a0b4',bright); ctx.fillRect(sx+4,sy+4,ts-8,ts-8);
        ctx.strokeStyle=this._tintColor('#3080a0',bright); ctx.strokeRect(sx+4,sy+4,ts-8,ts-8);
        // Filter layers
        for(let i=0;i<3;i++){
          ctx.fillStyle=i%2===0?this._tintColor('#808080',bright):this._tintColor('#c8a820',bright);
          ctx.fillRect(sx+6,sy+8+i*8,ts-12,6);
        }
      }
      else {
        // Generic block fallback
        const rawCol = {workbench:'#b48c3c',furnace_small:'#a05028',furnace_medium:'#b06030',furnace_large:'#c07040',stove:'#808080'}[b.blockType]||'#969696';
        ctx.fillStyle=this._tintColor(rawCol,bright); ctx.fillRect(sx+2,sy+2,ts-4,ts-4);
        ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.strokeRect(sx+2,sy+2,ts-4,ts-4);
      }

      // HP bar for all blocks
      if(b.hp < b.maxHp){
        ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(sx,sy+ts-6,ts,5);
        ctx.fillStyle='#c83232'; ctx.fillRect(sx,sy+ts-6,ts,5);
        ctx.fillStyle='#32c832'; ctx.fillRect(sx,sy+ts-6,ts*(b.hp/b.maxHp)|0,5);
        ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.strokeRect(sx,sy+ts-6,ts,5);
      }
    }
  }

  // ── Item icon drawing — drawn shapes, no text symbols ────────────────────────
  drawItemIcon(ctx, id, x, y, size, bright=1){
    const s=size, cx=x+s/2, cy=y+s/2;
    ctx.save();
    ctx.translate(cx,cy);

    if(WEAPON_DAMAGE[id]&&!RANGED.has(id)){
      // Melee weapon — sword/bat shape
      const col=id.includes('wood')?'#8b6438':id.includes('stone')?'#909090':id.includes('iron')?'#c0c0c0':id.includes('gold')?'#ffd700':id.includes('diamond')?'#40e0e0':id==='bat'?'#8b6438':'#c0c0c0';
      ctx.fillStyle=col;
      ctx.fillRect(-s*0.12,-s*0.45,s*0.24,s*0.7);
      ctx.fillStyle='#5a3010'; ctx.fillRect(-s*0.15,-s*0.05,s*0.3,s*0.18);
      if(id==='bat'){ ctx.fillStyle='#8b6438'; ctx.fillRect(-s*0.18,-s*0.45,s*0.36,s*0.25); }
    } else if(RANGED.has(id)){
      // Gun shape
      ctx.fillStyle='#404040';
      ctx.fillRect(-s*0.35,-s*0.12,s*0.55,s*0.24);
      ctx.fillRect(-s*0.05,-s*0.3,s*0.12,s*0.2);
      ctx.fillStyle='#5a3010'; ctx.fillRect(-s*0.35,-s*0.12,s*0.15,s*0.24);
      if(id==='sniper'||id==='rifle'||id==='m16'||id==='ak47'){
        ctx.fillStyle='#303030'; ctx.fillRect(s*0.18,-s*0.08,s*0.25,s*0.12);
      }
    } else if(ARMOUR_DEFENCE[id]){
      // Shield/armour shape
      ctx.fillStyle=id.includes('iron')?'#909090':'#8b6438';
      if(id.includes('helmet')){
        ctx.beginPath(); ctx.arc(0,-s*0.05,s*0.35,Math.PI,0); ctx.fill();
        ctx.fillRect(-s*0.35,-s*0.05,s*0.7,s*0.2);
      } else if(id.includes('chest')||id.includes('coat')){
        ctx.fillRect(-s*0.35,-s*0.3,s*0.7,s*0.55);
        ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(-s*0.1,-s*0.3,s*0.2,s*0.55);
      } else {
        ctx.fillRect(-s*0.3,-s*0.35,s*0.25,s*0.6);
        ctx.fillRect(s*0.05,-s*0.35,s*0.25,s*0.6);
      }
    } else if(FOOD_VALUES[id]||DRINK_VALUES[id]){
      if(id.includes('water')||id.includes('bottle')){
        ctx.fillStyle='#3c78c8'; ctx.fillRect(-s*0.15,-s*0.35,s*0.3,s*0.55);
        ctx.fillStyle='#c0c0c0'; ctx.fillRect(-s*0.1,-s*0.42,s*0.2,s*0.1);
      } else if(id==='food_can'){
        ctx.fillStyle='#808080'; ctx.fillRect(-s*0.2,-s*0.3,s*0.4,s*0.5);
        ctx.fillStyle='#c0c0c0'; ctx.fillRect(-s*0.2,-s*0.3,s*0.4,s*0.1);
        ctx.fillStyle='#e03030'; ctx.fillRect(-s*0.18,-s*0.18,s*0.36,s*0.25);
      } else {
        ctx.fillStyle='#c8a820'; ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
      }
    } else if(['medkit','bandage'].includes(id)){
      ctx.fillStyle='#e03030'; ctx.fillRect(-s*0.3,-s*0.12,s*0.6,s*0.24);
      ctx.fillRect(-s*0.12,-s*0.3,s*0.24,s*0.6);
    } else if(id==='wood'){
      ctx.fillStyle='#8b6438'; ctx.fillRect(-s*0.35,-s*0.15,s*0.7,s*0.3);
      ctx.fillStyle='#6a4820'; ctx.fillRect(-s*0.35,-s*0.05,s*0.7,s*0.1);
    } else if(id==='stone'||id==='iron_ore'||id==='coal'||id==='gold_ore'||id==='diamond'){
      const oc={stone:'#909090',iron_ore:'#9c6840',coal:'#2a2a2a',gold_ore:'#c8a820',diamond:'#40c8c8'}[id]||'#808080';
      ctx.fillStyle=oc;
      ctx.beginPath(); ctx.moveTo(0,-s*0.35); ctx.lineTo(s*0.3,0); ctx.lineTo(0,s*0.35); ctx.lineTo(-s*0.3,0); ctx.closePath(); ctx.fill();
    } else if(id==='campfire'){
      ctx.fillStyle='#606060'; ctx.beginPath(); ctx.arc(0,s*0.1,s*0.3,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#dc7820'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-s*0.2,s*0.1); ctx.lineTo(0,-s*0.3); ctx.lineTo(s*0.2,s*0.1); ctx.stroke();
      ctx.fillStyle='rgba(255,150,20,0.8)'; ctx.beginPath(); ctx.arc(0,-s*0.15,s*0.15,0,Math.PI*2); ctx.fill();
    } else if(id==='torch'||id==='torch_placed'){
      ctx.fillStyle='#5a3010'; ctx.fillRect(-s*0.1,-s*0.35,s*0.2,s*0.55);
      ctx.fillStyle='rgba(255,200,50,0.9)'; ctx.beginPath(); ctx.arc(0,-s*0.3,s*0.18,0,Math.PI*2); ctx.fill();
    } else if(id==='workbench'||id==='workbench_t2'){
      ctx.fillStyle='#8b6438'; ctx.fillRect(-s*0.35,-s*0.05,s*0.7,s*0.35);
      ctx.fillStyle='#a07840'; ctx.fillRect(-s*0.35,-s*0.15,s*0.7,s*0.12);
      ctx.strokeStyle='#c0c0c0'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-s*0.2,-s*0.25); ctx.lineTo(-s*0.05,-s*0.4); ctx.stroke();
      ctx.fillStyle='#808080'; ctx.fillRect(-s*0.08,-s*0.42,s*0.16,s*0.08);
    } else if(id==='wall_wood'){
      ctx.fillStyle='#7a4a20'; ctx.fillRect(-s*0.35,-s*0.35,s*0.7,s*0.7);
      ctx.strokeStyle='#5a3010'; ctx.lineWidth=1;
      for(let i=-2;i<=2;i++) { ctx.beginPath(); ctx.moveTo(-s*0.35,i*s*0.15); ctx.lineTo(s*0.35,i*s*0.15); ctx.stroke(); }
    } else if(id==='wall_stone'){
      ctx.fillStyle='#606060'; ctx.fillRect(-s*0.35,-s*0.35,s*0.7,s*0.7);
      ctx.strokeStyle='#404040'; ctx.lineWidth=1;
      ctx.strokeRect(-s*0.3,-s*0.3,s*0.3,s*0.3);
      ctx.strokeRect(s*0.02,-s*0.3,s*0.3,s*0.3);
      ctx.strokeRect(-s*0.15,s*0.02,s*0.3,s*0.3);
    } else if(id==='bed'){
      ctx.fillStyle='#5a3010'; ctx.fillRect(-s*0.35,-s*0.3,s*0.7,s*0.55);
      ctx.fillStyle='#c060c0'; ctx.fillRect(-s*0.3,-s*0.1,s*0.6,s*0.3);
      ctx.fillStyle='#e0e0e0'; ctx.fillRect(-s*0.3,-s*0.3,s*0.6,s*0.22);
    } else if(id==='rope'||id==='cloth'){
      ctx.strokeStyle=id==='rope'?'#c8a820':'#c0c0c0'; ctx.lineWidth=2;
      for(let i=0;i<3;i++){
        ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.2+i*s*0.2); ctx.lineTo(s*0.3,-s*0.1+i*s*0.2); ctx.stroke();
      }
    } else if(id==='coal'||id==='flint'||id==='sulfur'){
      const cc={coal:'#2a2a2a',flint:'#606060',sulfur:'#c8c820'}[id];
      ctx.fillStyle=cc;
      ctx.beginPath(); ctx.moveTo(0,-s*0.3); ctx.lineTo(s*0.25,s*0.15); ctx.lineTo(-s*0.25,s*0.15); ctx.closePath(); ctx.fill();
    } else if(id==='iron_ingot'||id==='gold_ingot'||id==='copper_ingot'){
      const ic={iron_ingot:'#c0c0c0',gold_ingot:'#ffd700',copper_ingot:'#c87820'}[id];
      ctx.fillStyle=ic; ctx.fillRect(-s*0.35,-s*0.2,s*0.7,s*0.4);
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.strokeRect(-s*0.35,-s*0.2,s*0.7,s*0.4);
    } else if(id==='gunpowder'||id==='ammo_45acp'||id==='ammo_9mm'||id==='ammo_556'||id==='ammo_762'||id==='ammo_50bmg'||id==='ammo_12ga'||id==='ammo_357'||id==='ammo_bolt'||id==='ammo_rail'||id==='ammo_rocket'){
      ctx.fillStyle='#c8a820'; ctx.fillRect(-s*0.15,-s*0.35,s*0.3,s*0.5);
      ctx.fillStyle='#909090'; ctx.fillRect(-s*0.12,-s*0.42,s*0.24,s*0.1);
    } else if(id==='arrow'){
      ctx.strokeStyle='#8b6438'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-s*0.35,0); ctx.lineTo(s*0.35,0); ctx.stroke();
      ctx.fillStyle='#c0c0c0';
      ctx.beginPath(); ctx.moveTo(s*0.35,0); ctx.lineTo(s*0.15,-s*0.15); ctx.lineTo(s*0.15,s*0.15); ctx.closePath(); ctx.fill();
    } else if(id==='medkit'){
      ctx.fillStyle='#e03030'; ctx.fillRect(-s*0.3,-s*0.3,s*0.6,s*0.6);
      ctx.fillStyle='#fff'; ctx.fillRect(-s*0.08,-s*0.25,s*0.16,s*0.5);
      ctx.fillRect(-s*0.25,-s*0.08,s*0.5,s*0.16);
    } else if(id==='bandage'){
      ctx.fillStyle='#e0e0e0'; ctx.fillRect(-s*0.3,-s*0.15,s*0.6,s*0.3);
      ctx.strokeStyle='#e03030'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-s*0.2,-s*0.05); ctx.lineTo(s*0.2,-s*0.05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s*0.2,s*0.05); ctx.lineTo(s*0.2,s*0.05); ctx.stroke();
    } else if(id==='antibiotics'||id==='vitamins'){
      ctx.fillStyle=id==='antibiotics'?'#4080ff':'#ffcc00';
      ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font=`bold ${s*0.3}px monospace`; ctx.textAlign='center';
      ctx.fillText(id==='antibiotics'?'Rx':'V',0,s*0.1); ctx.textAlign='left';
    } else if(id==='fishing_rod'){
      ctx.strokeStyle='#8b6438'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-s*0.3,s*0.35); ctx.lineTo(s*0.3,-s*0.35); ctx.stroke();
      ctx.strokeStyle='#c0c0c0'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(s*0.3,-s*0.35); ctx.lineTo(s*0.35,s*0.1); ctx.stroke();
      ctx.fillStyle='#c0c0c0'; ctx.beginPath(); ctx.arc(s*0.35,s*0.15,3,0,Math.PI*2); ctx.fill();
    } else if(id==='hoe'){
      ctx.strokeStyle='#8b6438'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-s*0.2,s*0.35); ctx.lineTo(s*0.2,-s*0.35); ctx.stroke();
      ctx.fillStyle='#909090'; ctx.fillRect(s*0.1,-s*0.42,s*0.25,s*0.12);
    } else if(id==='watering_can'){
      ctx.fillStyle='#3c78c8'; ctx.fillRect(-s*0.25,-s*0.2,s*0.4,s*0.35);
      ctx.strokeStyle='#2a5a9a'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(s*0.15,-s*0.05); ctx.lineTo(s*0.4,-s*0.25); ctx.stroke();
    } else if(id==='flashlight'){
      ctx.fillStyle='#404040'; ctx.fillRect(-s*0.35,-s*0.12,s*0.55,s*0.24);
      ctx.fillStyle='rgba(255,240,100,0.8)';
      ctx.beginPath(); ctx.moveTo(s*0.2,-s*0.2); ctx.lineTo(s*0.45,0); ctx.lineTo(s*0.2,s*0.2); ctx.closePath(); ctx.fill();
    } else if(id==='battery'){
      ctx.fillStyle='#404040'; ctx.fillRect(-s*0.2,-s*0.3,s*0.4,s*0.55);
      ctx.fillStyle='#c0c0c0'; ctx.fillRect(-s*0.1,-s*0.38,s*0.2,s*0.1);
      ctx.fillStyle='#32c832'; ctx.fillRect(-s*0.15,-s*0.22,s*0.3,s*0.35);
    } else if(id==='fur'||id==='warm_coat'||id==='fur_coat'){
      ctx.fillStyle='#8b6438'; ctx.fillRect(-s*0.3,-s*0.3,s*0.6,s*0.55);
      ctx.fillStyle='#c8a060';
      for(let i=0;i<4;i++) ctx.fillRect(-s*0.25+i*s*0.15,-s*0.25,s*0.1,s*0.45);
    } else if(id==='door_wood'){
      ctx.fillStyle='#8b5a2b'; ctx.fillRect(-s*0.25,-s*0.4,s*0.5,s*0.75);
      ctx.strokeStyle='#5a3010'; ctx.lineWidth=1;
      ctx.strokeRect(-s*0.2,-s*0.35,s*0.4,s*0.3);
      ctx.strokeRect(-s*0.2,s*0.0,s*0.4,s*0.28);
      ctx.fillStyle='rgba(255,200,50,0.9)'; ctx.beginPath(); ctx.arc(s*0.15,s*0.14,3,0,Math.PI*2); ctx.fill();
    } else if(id==='lockpick'){
      ctx.strokeStyle='#c0c0c0'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-s*0.3,s*0.3); ctx.lineTo(s*0.2,-s*0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(s*0.2,-s*0.3,s*0.1,0,Math.PI*2); ctx.stroke();
    } else if(id==='hammer'){
      ctx.strokeStyle='#8b6438'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-s*0.3,s*0.3); ctx.lineTo(s*0.15,-s*0.15); ctx.stroke();
      ctx.fillStyle='#909090'; ctx.fillRect(s*0.1,-s*0.35,s*0.25,s*0.22);
    } else if(id==='boat'){
      ctx.fillStyle='#8b6438';
      ctx.beginPath(); ctx.moveTo(-s*0.4,s*0.1); ctx.lineTo(s*0.4,s*0.1); ctx.lineTo(s*0.3,s*0.35); ctx.lineTo(-s*0.3,s*0.35); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#5a3010'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,s*0.1); ctx.lineTo(0,-s*0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s*0.3); ctx.lineTo(s*0.3,-s*0.05); ctx.stroke();
    } else if(id==='paper'||id==='map_item'||id==='atlas'){
      ctx.fillStyle='#e8d8a0'; ctx.fillRect(-s*0.3,-s*0.35,s*0.6,s*0.65);
      ctx.strokeStyle='#c0a060'; ctx.lineWidth=1;
      if(id==='map_item'||id==='atlas'){
        ctx.strokeRect(-s*0.25,-s*0.3,s*0.5,s*0.55);
        ctx.beginPath(); ctx.moveTo(-s*0.2,-s*0.1); ctx.lineTo(s*0.2,-s*0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s*0.2,s*0.05); ctx.lineTo(s*0.2,s*0.05); ctx.stroke();
      }
    } else if(id==='walkie_talkie'){
      ctx.fillStyle='#404040'; ctx.fillRect(-s*0.2,-s*0.35,s*0.4,s*0.6);
      ctx.fillStyle='#32c832'; ctx.fillRect(-s*0.15,-s*0.3,s*0.3,s*0.12);
      ctx.strokeStyle='#c0c0c0'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(0,-s*0.35); ctx.lineTo(0,-s*0.5); ctx.stroke();
    } else if(id==='electronic_parts'||id==='wire'||id==='cpu'){
      ctx.fillStyle='#2a4a2a'; ctx.fillRect(-s*0.3,-s*0.3,s*0.6,s*0.6);
      ctx.strokeStyle='#32c832'; ctx.lineWidth=1;
      ctx.strokeRect(-s*0.25,-s*0.25,s*0.5,s*0.5);
      if(id==='wire'){ ctx.beginPath(); ctx.moveTo(-s*0.3,0); ctx.lineTo(s*0.3,0); ctx.stroke(); }
      if(id==='cpu'){ ctx.fillStyle='#32c832'; ctx.fillRect(-s*0.15,-s*0.15,s*0.3,s*0.3); }
    } else if(id==='backpack_small'||id==='backpack_medium'||id==='backpack_large'){
      const bc=id==='backpack_large'?'#4a6a4a':id==='backpack_medium'?'#6a4a2a':'#8b6438';
      ctx.fillStyle=bc; ctx.fillRect(-s*0.3,-s*0.3,s*0.6,s*0.55);
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.strokeRect(-s*0.3,-s*0.3,s*0.6,s*0.55);
      ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-s*0.15,-s*0.3); ctx.lineTo(-s*0.15,-s*0.45); ctx.lineTo(s*0.15,-s*0.45); ctx.lineTo(s*0.15,-s*0.3); ctx.stroke();
    } else {
      // Generic — coloured square with first letter
      ctx.fillStyle='rgba(125,200,50,0.3)'; ctx.fillRect(-s*0.3,-s*0.3,s*0.6,s*0.6);
      ctx.strokeStyle='rgba(125,200,50,0.6)'; ctx.strokeRect(-s*0.3,-s*0.3,s*0.6,s*0.6);
      ctx.fillStyle='#fff'; ctx.font=`bold ${s*0.35}px monospace`; ctx.textAlign='center';
      ctx.fillText((ITEMS[id]||id).slice(0,1).toUpperCase(),0,s*0.12);
      ctx.textAlign='left';
    }
    ctx.restore();
  }

  // ── Drops ────────────────────────────────────────────────────────────────────
  _drawDrops(ctx, game){
    const ts = TILE_SIZE;
    const t  = Date.now() / 600;
    for(const d of Object.values(game.drops)){
      const [sx, sy] = this.w2s(d.x, d.y);
      if(sx < -ts || sx > this.W + ts) continue;
      const bob = Math.sin(t + (d.dropId||0)) * 3;
      const cx2 = sx+ts/2, cy2 = sy+ts/2+bob;

      // Glow based on item type
      let glowCol='rgba(255,215,0,';
      if(WEAPON_DAMAGE[d.itemId]) glowCol='rgba(255,120,50,';
      else if(ARMOUR_DEFENCE[d.itemId]) glowCol='rgba(80,120,255,';
      else if(FOOD_VALUES[d.itemId]||DRINK_VALUES[d.itemId]) glowCol='rgba(80,220,80,';
      else if(['medkit','bandage','antibiotics'].includes(d.itemId)) glowCol='rgba(255,80,80,';

      const grd = ctx.createRadialGradient(cx2,cy2,0,cx2,cy2,16);
      grd.addColorStop(0,glowCol+'0.5)');
      grd.addColorStop(1,glowCol+'0)');
      ctx.fillStyle=grd; ctx.fillRect(cx2-16,cy2-16,32,32);

      // Item shadow
      ctx.fillStyle='rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(cx2,cy2+10,8,3,0,0,Math.PI*2); ctx.fill();

      // Draw item shape based on type
      const icon=(typeof ITEM_ICONS!=='undefined'&&ITEM_ICONS[d.itemId])||'[?]';
      // Background circle
      let bgCol='#2a2a10';
      if(WEAPON_DAMAGE[d.itemId]) bgCol='#2a1008';
      else if(ARMOUR_DEFENCE[d.itemId]) bgCol='#08102a';
      else if(FOOD_VALUES[d.itemId]||DRINK_VALUES[d.itemId]) bgCol='#082a08';
      ctx.fillStyle=bgCol;
      ctx.beginPath(); ctx.arc(cx2,cy2,10,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=glowCol+'0.8)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(cx2,cy2,10,0,Math.PI*2); ctx.stroke();
      ctx.lineWidth=1;

      // Draw item shape using drawItemIcon
      this.drawItemIcon(ctx, d.itemId, cx2-10, cy2-10, 20);

      // Qty badge
      if((game.drops[d.dropId]?.qty||d.qty)>1){
        ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(cx2+5,cy2-14,14,10);
        ctx.fillStyle='#ffd700'; ctx.font='8px monospace'; ctx.textAlign='center';
        ctx.fillText(d.qty,cx2+12,cy2-6); ctx.textAlign='left';
      }
    }
  }

  // ── Projectiles ──────────────────────────────────────────────────────────────
  _drawProjectiles(ctx, game){
    for(const pr of Object.values(game.projectiles)){
      const [sx, sy] = this.w2s(pr.x, pr.y);
      // Trail
      const tx2 = sx - pr.dx * 20, ty2 = sy - pr.dy * 20;
      const trail = ctx.createLinearGradient(tx2, ty2, sx, sy);
      trail.addColorStop(0, 'rgba(255,220,50,0)');
      trail.addColorStop(1, 'rgba(255,220,50,0.8)');
      ctx.strokeStyle = trail; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.lineWidth = 1;
      // Head
      ctx.fillStyle = '#ffe050';
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Whistle waypoints ─────────────────────────────────────────────────────────
  _drawWhistleMarkers(ctx, game, myPid){
    const markers=game._whistleMarkers||{};
    for(const [pid,m] of Object.entries(markers)){
      if(pid===myPid) continue; // don't show your own whistle to yourself
      const [sx,sy]=this.w2s(m.x+0.5,m.y+0.5);
      const alpha=Math.min(1,m.timer/2);
      ctx.globalAlpha=alpha;
      // Pulsing ring at location
      const pulse=0.7+0.3*Math.sin(Date.now()/200);
      ctx.strokeStyle='#ffd700'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,20*pulse,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#ffd700'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
      ctx.fillText(m.name||'?',sx,sy-26);
      ctx.fillText('WHISTLE',sx,sy-14);
      // If off-screen, draw arrow
      if(sx<0||sx>this.W||sy<0||sy>this.H){
        const angle=Math.atan2(sy-this.H/2,sx-this.W/2);
        const ax=this.W/2+Math.cos(angle)*(this.W/2-50);
        const ay=this.H/2+Math.sin(angle)*(this.H/2-50);
        ctx.save(); ctx.translate(ax,ay); ctx.rotate(angle);
        ctx.fillStyle='#ffd700';
        ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(-8,-7); ctx.lineTo(-8,7); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle='#ffd700'; ctx.font='9px monospace';
        ctx.fillText(m.name||'?',ax,ay-14);
      }
      ctx.globalAlpha=1; ctx.lineWidth=1; ctx.textAlign='left';
    }
  }

  // ── Dead zombies (fade + corpses) ────────────────────────────────────────────
  _drawDeadZombies(ctx, game){
    const ts=TILE_SIZE;
    for(const dz of (game.deadZombies||[])){
      const [sx,sy]=this.w2s(dz.x,dz.y);
      if(sx<-ts||sx>this.W+ts) continue;
      const alpha=Math.max(0,dz.timer/1.2);
      ctx.globalAlpha=alpha;
      if(dz.isCorpse){
        // Player corpse — draw fallen human with name
        ctx.save(); ctx.translate(sx+ts/2,sy+ts/2); ctx.rotate(Math.PI/2);
        this._drawHumanFigure(ctx,0,0,ts*0.18,'#404040','#303030','#888',false,true,false);
        ctx.restore();
        ctx.fillStyle='rgba(200,50,50,0.9)'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
        ctx.fillText(`☠ ${dz.name||''}`,sx+ts/2,sy-8);
        ctx.textAlign='left';
      } else {
        this._drawZombieBody(ctx,sx,sy,ts,dz.ztype,false,true);
      }
      ctx.globalAlpha=1;
    }
  }

  // ── Zombies ──────────────────────────────────────────────────────────────────
  _drawZombies(ctx, game, wdata){
    const ts = TILE_SIZE;
    // Draw dead zombie fades first (behind living)
    for(const dz of (game.deadZombies||[])){
      const [sx,sy] = this.w2s(dz.x, dz.y);
      if(sx < -ts || sx > this.W+ts) continue;
      const alpha = Math.max(0, dz.timer/1.2);
      ctx.globalAlpha = alpha;
      this._drawZombieBody(ctx, sx, sy, ts, dz.ztype, false, true);
      ctx.globalAlpha = 1;
    }
    // Living zombies
    for(const z of Object.values(game.zombies)){
      const [sx,sy] = this.w2s(z.x, z.y);
      if(sx < -ts || sx > this.W+ts || sy < -ts || sy > this.H+ts) continue;
      this._drawZombieBody(ctx, sx, sy, ts, z.ztype, z.state==='chase', false);
      // HP bar
      const hpR = Math.max(0, z.hp/z.maxHp);
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(sx, sy-8, ts, 4);
      ctx.fillStyle='#c03030'; ctx.fillRect(sx, sy-8, ts, 4);
      ctx.fillStyle='#30c030'; ctx.fillRect(sx, sy-8, ts*hpR, 4);
    }
  }

  _drawZombieBody(ctx, sx, sy, ts, ztype, chasing, dead){
    const stats = ZOMBIE_TYPES[ztype] || ZOMBIE_TYPES.walker;
    const cx = sx+ts/2, cy = sy+ts/2;
    const scale = ztype==='tank'?1.4 : ztype==='brute'?1.2 : ztype==='crawler'?0.7 : ztype==='speedy'?0.85 : 1.0;
    const s = ts * 0.18 * scale;

    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy+s*2.2, s*1.4, s*0.4, 0, 0, Math.PI*2); ctx.fill();

    if(dead){
      // Fallen — draw rotated
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.PI/2);
      this._drawHumanFigure(ctx, 0, 0, s, stats.col1, stats.col2, stats.eyeCol, false, true, false);
      ctx.restore();
      return;
    }

    // Crawler is low to ground
    if(ztype==='crawler'){
      ctx.save(); ctx.translate(cx, cy+s*0.8); ctx.scale(1, 0.5);
      this._drawHumanFigure(ctx, 0, 0, s, stats.col1, stats.col2, stats.eyeCol, chasing, false, chasing);
      ctx.restore();
    } else {
      this._drawHumanFigure(ctx, cx, cy, s, stats.col1, stats.col2, stats.eyeCol, chasing, false, chasing);
    }

    // Type label for brute/tank
    if(ztype==='tank'||ztype==='brute'){
      ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
      ctx.fillText(ztype.toUpperCase(), cx, sy-10); ctx.textAlign='left';
    }
    // Chase indicator
    if(chasing){
      ctx.strokeStyle='rgba(255,40,40,0.35)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(cx, cy, ts*0.55, 0, Math.PI*2); ctx.stroke();
      ctx.lineWidth=1;
    }
  }

  // Draws a stick-figure human at (cx,cy) with given scale s
  _drawHumanFigure(ctx, cx, cy, s, bodyCol, darkCol, eyeCol, alert, dead, isMoving=false, heldItem=null, swingAngle=null){
    const t = isMoving ? Date.now()/300 : 0; // only animate when moving
    // Legs (animated walk bob)
    const legSwing = dead ? 0 : Math.sin(t)*s*0.5;
    ctx.strokeStyle = darkCol; ctx.lineWidth = Math.max(2, s*0.7);
    ctx.lineCap='round';
    // Left leg
    ctx.beginPath(); ctx.moveTo(cx-s*0.3, cy+s*0.8);
    ctx.lineTo(cx-s*0.3+legSwing, cy+s*1.8); ctx.stroke();
    // Right leg
    ctx.beginPath(); ctx.moveTo(cx+s*0.3, cy+s*0.8);
    ctx.lineTo(cx+s*0.3-legSwing, cy+s*1.8); ctx.stroke();
    // Arms
    const armSwing = dead ? 0 : Math.sin(t+Math.PI)*s*0.4;
    ctx.beginPath(); ctx.moveTo(cx-s*0.5, cy-s*0.2);
    ctx.lineTo(cx-s*1.0+armSwing, cy+s*0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+s*0.5, cy-s*0.2);
    ctx.lineTo(cx+s*1.0-armSwing, cy+s*0.6); ctx.stroke();
    // Torso
    ctx.fillStyle = bodyCol;
    ctx.fillRect(cx-s*0.55, cy-s*0.8, s*1.1, s*1.7);
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.strokeRect(cx-s*0.55, cy-s*0.8, s*1.1, s*1.7);
    // Head
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.arc(cx, cy-s*1.3, s*0.7, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(cx, cy-s*1.3, s*0.7, 0, Math.PI*2); ctx.stroke();
    // Eyes
    ctx.fillStyle = alert ? eyeCol : 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(cx-s*0.28, cy-s*1.4, s*0.18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+s*0.28, cy-s*1.4, s*0.18, 0, Math.PI*2); ctx.fill();
    if(alert){
      // Pupils
      ctx.fillStyle='#000';
      ctx.beginPath(); ctx.arc(cx-s*0.28, cy-s*1.4, s*0.08, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+s*0.28, cy-s*1.4, s*0.08, 0, Math.PI*2); ctx.fill();
    }
    ctx.lineWidth=1; ctx.lineCap='butt';

    // Draw held item extending from right hand
    if(heldItem && !dead){
      this._drawHeldItem(ctx, cx, cy, s, heldItem, swingAngle);
    }
  }

  _drawHeldItem(ctx, cx, cy, s, itemId, swingAngle){
    // Position: right side of player, at arm height
    const handX = cx + s*1.0;
    const handY = cy + s*0.4;
    const angle = swingAngle !== null ? swingAngle : -Math.PI/4;

    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle);

    if(WEAPON_DAMAGE[itemId] && !RANGED.has(itemId)){
      // Melee weapon — draw as a stick/blade
      const len = s * (itemId==='spear'?4.5 : itemId==='bat'||itemId==='machete'?3.2 : 2.8);
      const w   = s * (itemId==='bat'?0.7 : itemId==='machete'?0.5 : 0.35);
      let col = '#c8a820'; // default gold
      if(itemId==='wooden_sword'||itemId==='bat') col='#8b6438';
      else if(itemId==='stone_sword') col='#909090';
      else if(itemId==='iron_sword'||itemId==='machete'||itemId==='spear') col='#c0c0c0';
      else if(itemId==='gold_sword') col='#ffd700';
      else if(itemId==='diamond_sword') col='#40e0e0';
      ctx.fillStyle=col;
      ctx.fillRect(-w/2, -len, w, len);
      // Blade edge highlight
      ctx.fillStyle='rgba(255,255,255,0.4)';
      ctx.fillRect(-w/4, -len, w/4, len);
      // Handle
      ctx.fillStyle='#5a3010';
      ctx.fillRect(-w/2-1, -s*0.5, w+2, s*0.6);
    } else if(RANGED.has(itemId)){
      // Gun — draw as a rectangle
      const len = s * 2.5, h = s * 0.5;
      let col = '#404040';
      if(itemId==='revolver') col='#606060';
      else if(itemId==='sniper') col='#303030';
      ctx.fillStyle=col;
      ctx.fillRect(0, -h/2, len, h);
      // Barrel
      ctx.fillStyle='#202020';
      ctx.fillRect(len*0.6, -h/4, len*0.5, h/2);
      // Stock
      ctx.fillStyle='#5a3010';
      ctx.fillRect(-s*0.3, -h/2, s*0.4, h);
    } else if(itemId==='torch'||itemId==='flashlight'){
      ctx.fillStyle=itemId==='torch'?'#8b6438':'#404040';
      ctx.fillRect(-s*0.2, -s*2, s*0.4, s*2);
      if(itemId==='torch'){
        const fg=ctx.createRadialGradient(0,-s*2,0,0,-s*2,s*1.5);
        fg.addColorStop(0,'rgba(255,200,50,0.9)');
        fg.addColorStop(1,'rgba(255,100,0,0)');
        ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(0,-s*2,s*1.5,0,Math.PI*2); ctx.fill();
      }
    } else if(itemId==='hoe'||itemId==='wooden_axe'||itemId==='stone_axe'||itemId==='iron_axe'){
      ctx.fillStyle='#8b6438';
      ctx.fillRect(-s*0.15,-s*3,s*0.3,s*3);
      ctx.fillStyle=itemId.includes('wooden')?'#8b6438':itemId.includes('stone')?'#909090':'#c0c0c0';
      ctx.fillRect(-s*0.6,-s*3,s*1.2,s*0.6);
    }

    ctx.restore();
  }

  // ── Players ──────────────────────────────────────────────────────────────────
  _drawPlayers(ctx, game, myPid, wdata){
    const ts = TILE_SIZE;
    const pidColor = (pid) => {
      let h=0; for(let i=0;i<pid.length;i++) h=(h*31+pid.charCodeAt(i))&0xffff;
      return `hsl(${(h%300)+30},65%,52%)`;
    };

    for(const p of Object.values(game.players)){
      const [sx,sy] = this.w2s(p.x, p.y);
      if(sx < -ts*2 || sx > this.W+ts*2) continue;
      const cx = sx+ts/2, cy = sy+ts/2;
      const s = ts*0.18;
      const isMe = p.pid===myPid;
      const isMoving = !!(p.isMoving);

      // Swing animation — track per player
      if(!this._swingAngles) this._swingAngles={};
      if(!this._swingAngles[p.pid]) this._swingAngles[p.pid]={angle:-Math.PI/4,swinging:false,timer:0};
      const sw=this._swingAngles[p.pid];
      // Detect attack (attackCd just reset = swing started)
      if((p.attackCd||0)>0.3&&!sw.swinging){
        sw.swinging=true; sw.timer=0;
      }
      if(sw.swinging){
        sw.timer+=0.016;
        // Swing arc: -PI/4 → PI/2 → -PI/4
        const progress=Math.min(1,sw.timer/0.4);
        sw.angle=-Math.PI/4+Math.sin(progress*Math.PI)*Math.PI*0.75;
        if(progress>=1){ sw.swinging=false; sw.angle=-Math.PI/4; }
        // Swing trail VFX
        if(sw.timer<0.2&&p.heldItem&&WEAPON_DAMAGE[p.heldItem]&&!RANGED.has(p.heldItem)){
          const trailX=cx+Math.cos(sw.angle)*ts*0.6;
          const trailY=cy+Math.sin(sw.angle)*ts*0.6;
          vfx.sparks(trailX,trailY,'rgba(255,255,200,0.6)',2);
        }
      }

      // Shadow
      ctx.fillStyle='rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(cx, cy+s*2.2, s*1.4, s*0.4, 0, 0, Math.PI*2); ctx.fill();

      if(p.isDead){
        ctx.globalAlpha=0.35;
        this._drawHumanFigure(ctx, cx, cy, s, '#404040','#303030','#888', false, true, false, null, null);
        ctx.globalAlpha=1;
      } else if(p.isDown){
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.PI/2);
        this._drawHumanFigure(ctx, 0, 0, s, '#ff8c00','#c06000','#fff', false, true, false, null, null);
        ctx.restore();
      } else {
        const bodyCol = isMe ? '#2858d0' : pidColor(p.pid);
        const darkCol = isMe ? '#1038a0' : bodyCol;
        this._drawHumanFigure(ctx, cx, cy, s, bodyCol, darkCol, '#fff', false, false, isMoving, p.heldItem, sw.angle);
      }

      // Name tag
      ctx.font='bold 10px monospace'; ctx.textAlign='center';
      const nw = ctx.measureText(p.name).width+8;
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(cx-nw/2, sy-20, nw, 13);
      ctx.fillStyle = isMe?'#80b8ff':'#fff';
      ctx.fillText(p.name, cx, sy-10);
      // HP bar
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(sx, sy-5, ts, 3);
      ctx.fillStyle='#c03030'; ctx.fillRect(sx, sy-5, ts, 3);
      ctx.fillStyle='#30c030'; ctx.fillRect(sx, sy-5, ts*Math.max(0,p.hp/p.maxHp), 3);
      if(p.isDown){
        ctx.fillStyle='#ff4444'; ctx.font='bold 11px monospace';
        ctx.fillText(`DOWN ${Math.ceil(p.downTimer)}s`, cx, sy+ts+14);
      }
      ctx.textAlign='left';
    }
  }

  // ── Range cursor & loot highlights ───────────────────────────────────────────
  _drawRangeCursor(ctx, game, myPid){
    const me = game.players[myPid]; if(!me||me.isDead||me.isDown) return;
    const [pcx,pcy] = this.w2s(me.x+0.5, me.y+0.5);
    const ts = TILE_SIZE;

    // Highlight loot crates within interact range
    const tilesX = Math.ceil(this.W/ts)+3, tilesY = Math.ceil(this.H/ts)+3;
    const startX = Math.floor(this.camX)-Math.floor(tilesX/2);
    const startY = Math.floor(this.camY)-Math.floor(tilesY/2);
    for(let ty=0;ty<tilesY;ty++){
      for(let tx=0;tx<tilesX;tx++){
        const wx=startX+tx, wy=startY+ty;
        const tile=game.getTile(wx,wy);
        if(tile===T.LOOT){
          const dist=Math.hypot(wx+0.5-(me.x+0.5), wy+0.5-(me.y+0.5));
          const [sx,sy]=this.w2s(wx,wy);
          if(dist<=INTERACT_RANGE+0.5){
            // In range — bright highlight
            ctx.strokeStyle='rgba(255,220,50,0.8)'; ctx.lineWidth=2;
            ctx.strokeRect(sx+2,sy+2,ts-4,ts-4);
            ctx.fillStyle='rgba(255,220,50,0.12)'; ctx.fillRect(sx+2,sy+2,ts-4,ts-4);
            ctx.fillStyle='rgba(255,220,50,0.9)'; ctx.font='bold 9px monospace'; ctx.textAlign='center';
            ctx.fillText('F / CLICK',sx+ts/2,sy+ts/2+4); ctx.textAlign='left';
          } else if(dist<=INTERACT_RANGE+3){
            // Nearby — dim pulse
            const pulse=0.3+0.2*Math.sin(Date.now()/400);
            ctx.strokeStyle=`rgba(200,180,40,${pulse})`; ctx.lineWidth=1.5;
            ctx.strokeRect(sx+3,sy+3,ts-6,ts-6);
          }
          ctx.lineWidth=1;
        }
      }
    }

    // Mouse cursor — show what action will happen
    const [mwx,mwy] = this.s2w(_mouseX,_mouseY);
    const distToMouse = Math.hypot(mwx+0.5-(me.x+0.5), mwy+0.5-(me.y+0.5));
    const held = me.heldItem;
    const isRanged = held && (typeof RANGED!=='undefined') && RANGED.has(held);
    const range = (held && WEAPON_RANGE[held]) || MELEE_RANGE;

    // Draw range circle around player (subtle)
    if(!isRanged){
      ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
      ctx.setLineDash([4,6]);
      ctx.beginPath(); ctx.arc(pcx,pcy, range*ts, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth=1;
    }

    // Cursor dot at mouse
    const [msx,msy] = this.w2s(mwx,mwy);
    const inRange = distToMouse<=range+0.5;
    ctx.fillStyle = inRange ? 'rgba(255,255,255,0.6)' : 'rgba(255,80,80,0.4)';
    ctx.beginPath(); ctx.arc(msx,msy,3,0,Math.PI*2); ctx.fill();
  }

  // ── Mining progress bars ──────────────────────────────────────────────────────
  updateMineProgress(wx, wy, hp, maxHp){
    const k=`${wx},${wy}`;
    this._mineProgress[k]={hp,maxHp,timer:2.0};
  }

  _drawMineProgress(ctx, tod, dayLen){
    const ts=TILE_SIZE;
    const bright=this._dayBrightness(tod,dayLen);
    const now=Date.now();
    for(const [k,m] of Object.entries(this._mineProgress)){
      m.timer-=0.016;
      if(m.timer<=0){ delete this._mineProgress[k]; continue; }
      const [wx,wy]=k.split(',').map(Number);
      const [sx,sy]=this.w2s(wx,wy);
      if(sx<-ts||sx>this.W+ts) continue;
      const ratio=Math.max(0,m.hp/m.maxHp);
      const alpha=Math.min(1,m.timer*2);
      // Crack overlay on tile
      const cracks=Math.floor((1-ratio)*4);
      ctx.globalAlpha=alpha*0.6;
      ctx.fillStyle='rgba(0,0,0,0.4)';
      for(let i=0;i<cracks;i++){
        const cx2=sx+8+i*6, cy2=sy+8+i*5;
        ctx.beginPath(); ctx.moveTo(cx2,cy2); ctx.lineTo(cx2+8,cy2+10); ctx.stroke();
      }
      ctx.globalAlpha=alpha;
      // Progress bar below tile with black outline
      ctx.fillStyle='#000'; ctx.fillRect(sx-1,sy+ts+1,ts+2,8);
      ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(sx,sy+ts+2,ts,6);
      ctx.fillStyle=ratio>0.5?'#7dc832':ratio>0.25?'#dc8c28':'#c83232';
      ctx.fillRect(sx,sy+ts+2,ts*ratio,6);
      ctx.strokeStyle='rgba(0,0,0,0.9)'; ctx.lineWidth=1.5;
      ctx.strokeRect(sx,sy+ts+2,ts,6);
      ctx.lineWidth=1;
      ctx.globalAlpha=1;
    }
  }

  // ── FOG OF WAR / NIGHT LIGHTING ──────────────────────────────────────────────
  // Full darkness at night. Player needs a flashlight/torch/campfire to see.
  // Uses a compositing trick: fill black, then "cut out" light sources with
  // destination-out blending, then restore.

  _drawFogOfWar(ctx, game, myPid, tod, dayLen, wdata){
    const t = tod / dayLen;
    let darkness;
    if(t < 0.20)      darkness = 1.0;
    else if(t < 0.28) darkness = 1.0 - (t - 0.20) / 0.08;
    else if(t < 0.72) darkness = 0.0;
    else if(t < 0.80) darkness = (t - 0.72) / 0.08;
    else               darkness = 1.0;

    // Sunset/sunrise orange hue overlay
    const isSunrise = t >= 0.22 && t <= 0.30;
    const isSunset  = t >= 0.70 && t <= 0.78;
    if(isSunrise || isSunset){
      const p2 = isSunrise ? (t-0.22)/0.08 : 1-(t-0.70)/0.08;
      const hueAlpha = Math.sin(p2*Math.PI) * 0.22;
      ctx.fillStyle = `rgba(220,100,20,${hueAlpha})`;
      ctx.fillRect(0,0,this.W,this.H);
    }

    const vis = wdata.visibility;
    // Night is darker — max 0.88 alpha
    const fogAlpha = Math.min(0.88, Math.max(darkness * 0.88, (1 - vis) * 0.55));

    if(fogAlpha < 0.05) return;

    const lc  = this._lightCanvas;
    const lctx= this._lightCtx;
    // Only resize when canvas dimensions actually changed
    if(lc.width !== this.W || lc.height !== this.H){
      lc.width = this.W; lc.height = this.H;
    }

    // Clear and fill with darkness
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, this.W, this.H);
    lctx.fillStyle = `rgba(0,0,10,${fogAlpha})`;
    lctx.fillRect(0, 0, this.W, this.H);

    // Cut out light sources using destination-out
    lctx.globalCompositeOperation = 'destination-out';

    const me = game.players[myPid];

    // ── Player light sources ──────────────────────────────────────────────────
    if(me && !me.isDead){
      const [px, py] = this.w2s(me.x + 0.5, me.y + 0.5);

      if(me.heldItem === 'flashlight'){
        // Flashlight = directional cone toward mouse
        this._torchGlow = null;
        this._drawFlashlight(lctx, px, py, darkness);
        this._drawLightCircle(lctx, px, py, 80, 0.8);
      } else if(me.heldItem === 'torch'){
        // Torch = omnidirectional warm orange glow
        const torchDur = me.durability?.torch ?? 100;
        const torchPct = torchDur / (ITEM_DURABILITY?.torch || 100);
        if(torchPct > 0){
          const flicker = 1 + 0.1 * Math.sin(Date.now() / 80);
          const r = 260 * torchPct * flicker;
          const grd = lctx.createRadialGradient(px,py,0,px,py,r);
          grd.addColorStop(0,   'rgba(0,0,0,1)');
          grd.addColorStop(0.5, 'rgba(0,0,0,0.85)');
          grd.addColorStop(1,   'rgba(0,0,0,0)');
          lctx.fillStyle = grd;
          lctx.beginPath(); lctx.arc(px,py,r,0,Math.PI*2); lctx.fill();
          this._torchGlow = {px, py, r: r*0.6, alpha: torchPct*0.18};
        } else {
          this._torchGlow = null;
          this._drawLightCircle(lctx, px, py, 60, 0.7);
        }
      } else {
        // No light source — ambient glow
        this._torchGlow = null;
        const ambR = darkness > 0.7 ? 160 : 220;
        this._drawLightCircle(lctx, px, py, ambR, 0.95);
      }
    }

    // ── Campfires, placed torches & other light sources ──────────────────────
    for(const b of Object.values(game.blocks)){
      if(b.blockType === 'campfire' || b.blockType === 'torch_placed'){
        const [bsx, bsy] = this.w2s(b.x + 0.5, b.y + 0.5);
        if(bsx < -300 || bsx > this.W + 300) continue;
        const r = b.blockType === 'campfire' ? 280 : 160;
        const flicker = 1 + 0.08 * Math.sin(Date.now() / 120 + b.blockId);
        this._drawLightCircle(lctx, bsx, bsy, r * flicker, 1.0);
      }
    }

    // ── Other players' lights ─────────────────────────────────────────────────
    for(const p of Object.values(game.players)){
      if(p.pid === myPid || p.isDead) continue;
      const [ppx, ppy] = this.w2s(p.x + 0.5, p.y + 0.5);
      if(p.heldItem === 'torch'){
        this._drawLightCircle(lctx, ppx, ppy, 100, 0.8);
      }
    }

    lctx.globalCompositeOperation = 'source-over';

    // Blit light canvas onto main canvas
    ctx.drawImage(lc, 0, 0);

    // Orange torch glow overlay (drawn after fog so it tints the visible area)
    if(this._torchGlow){
      const tg=this._torchGlow;
      const og=ctx.createRadialGradient(tg.px,tg.py,0,tg.px,tg.py,tg.r);
      og.addColorStop(0,`rgba(255,140,20,${tg.alpha})`);
      og.addColorStop(1,'rgba(255,140,20,0)');
      ctx.fillStyle=og; ctx.fillRect(tg.px-tg.r,tg.py-tg.r,tg.r*2,tg.r*2);
    }

    // Extra: deep night vignette around edges
    if(darkness > 0.3){
      const vig = ctx.createRadialGradient(
        this.W/2, this.H/2, this.H * 0.2,
        this.W/2, this.H/2, this.H * 0.85
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,10,${darkness * 0.6})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  _drawLightCircle(lctx, cx, cy, radius, strength){
    const grd = lctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grd.addColorStop(0,   `rgba(0,0,0,${strength})`);
    grd.addColorStop(0.5, `rgba(0,0,0,${strength * 0.7})`);
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    lctx.fillStyle = grd;
    lctx.beginPath();
    lctx.arc(cx, cy, radius, 0, Math.PI * 2);
    lctx.fill();
  }

  _drawFlashlight(lctx, cx, cy, darkness){
    // Get mouse position relative to canvas
    const mx = _mouseX || this.W / 2;
    const my = _mouseY || this.H / 2;
    const angle = Math.atan2(my - cy, mx - cx);
    const coneAngle = Math.PI / 4;   // 45° half-angle
    const coneLen   = 320;

    // Cone gradient
    const grd = lctx.createRadialGradient(cx, cy, 0, cx, cy, coneLen);
    grd.addColorStop(0,   'rgba(0,0,0,1)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.85)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    lctx.fillStyle = grd;
    lctx.beginPath();
    lctx.moveTo(cx, cy);
    lctx.arc(cx, cy, coneLen, angle - coneAngle, angle + coneAngle);
    lctx.closePath();
    lctx.fill();

    // Small ambient circle so player can see their feet
    this._drawLightCircle(lctx, cx, cy, 55, 0.7);
  }
}

// ── Color lerp helper ─────────────────────────────────────────────────────────
function lerpColor(a, b, t){
  const ah = a.replace('#',''), bh = b.replace('#','');
  const ar = parseInt(ah.slice(0,2),16), ag = parseInt(ah.slice(2,4),16), ab = parseInt(ah.slice(4,6),16);
  const br = parseInt(bh.slice(0,2),16), bg = parseInt(bh.slice(2,4),16), bb = parseInt(bh.slice(4,6),16);
  const rr = (ar + (br-ar)*t)|0, rg = (ag + (bg-ag)*t)|0, rb = (ab + (bb-ab)*t)|0;
  return `#${rr.toString(16).padStart(2,'0')}${rg.toString(16).padStart(2,'0')}${rb.toString(16).padStart(2,'0')}`;
}

// Global mouse tracking for flashlight direction
let _mouseX = 0, _mouseY = 0;
window.addEventListener('mousemove', e => { _mouseX = e.clientX; _mouseY = e.clientY; });
