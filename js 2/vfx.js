// ── VFX System ────────────────────────────────────────────────────────────────
// Particles, screen shake, blood splats, muzzle flash, hit numbers, etc.

class VFX {
  constructor(){
    this.particles = [];
    this.numbers   = [];   // floating damage numbers
    this.shakeX    = 0;
    this.shakeY    = 0;
    this.shakeAmt  = 0;
    this.flashAlpha= 0;
    this.flashCol  = '#fff';
    this._rain     = [];
    this._snow     = [];
    this._worldSmoke = [];
    this._initPrecip();
  }

  _initPrecip(){
    for(let i=0;i<200;i++) this._rain.push({x:Math.random(),y:Math.random(),spd:0.6+Math.random()*0.4});
    for(let i=0;i<150;i++) this._snow.push({x:Math.random(),y:Math.random(),spd:0.1+Math.random()*0.15,dx:(Math.random()-0.5)*0.002,r:1+Math.random()*2});
  }

  // ── Emitters ────────────────────────────────────────────────────────────────
  blood(sx, sy, n=10){
    for(let i=0;i<n;i++) this.particles.push({
      x:sx, y:sy,
      vx:(Math.random()-0.5)*5, vy:-Math.random()*4-1,
      life:1, maxLife:0.6+Math.random()*0.4,
      size:3+Math.random()*5,
      col:`hsl(0,80%,${20+Math.random()*20}%)`,
      type:'circle', gravity:0.18,
    });
  }

  sparks(sx, sy, col='#ffd700', n=8){
    for(let i=0;i<n;i++) this.particles.push({
      x:sx, y:sy,
      vx:(Math.random()-0.5)*6, vy:-Math.random()*5-1,
      life:1, maxLife:0.3+Math.random()*0.3,
      size:2+Math.random()*3,
      col, type:'line', gravity:0.25,
      px:sx, py:sy,
    });
  }

  debris(sx, sy, col='#8b6438', n=6){
    for(let i=0;i<n;i++) this.particles.push({
      x:sx, y:sy,
      vx:(Math.random()-0.5)*4, vy:-Math.random()*3-0.5,
      life:1, maxLife:0.5+Math.random()*0.5,
      size:3+Math.random()*6,
      col, type:'rect', gravity:0.2,
      rot:Math.random()*Math.PI*2, rotSpd:(Math.random()-0.5)*0.3,
    });
  }

  smoke(sx, sy, n=5){
    for(let i=0;i<n;i++) this.particles.push({
      x:sx+(Math.random()-0.5)*10, y:sy,
      vx:(Math.random()-0.5)*0.5, vy:-0.5-Math.random()*0.5,
      life:1, maxLife:1.2+Math.random()*0.8,
      size:8+Math.random()*12,
      col:'rgba(80,80,80,', type:'smoke', gravity:0,
    });
  }

  // World-space smoke — position stored in world coords, converted each frame
  smokeWorld(wx, wy, n=1){
    for(let i=0;i<n;i++) this._worldSmoke.push({
      wx:wx+(Math.random()-0.5)*0.3,
      wy:wy,
      vx:(Math.random()-0.5)*0.02,
      vy:-0.04-Math.random()*0.03,
      life:1, maxLife:1.5+Math.random()*1.0,
      size:0.3+Math.random()*0.4,
    });
  }

  muzzleFlash(sx, sy){
    this.flashAlpha=0.35; this.flashCol='rgba(255,220,100,';
    for(let i=0;i<6;i++) this.sparks(sx,sy,'#ffe080',1);
    this.particles.push({
      x:sx, y:sy, vx:0, vy:0,
      life:1, maxLife:0.08,
      size:18, col:'rgba(255,200,50,', type:'glow', gravity:0,
    });
  }

  hitNumber(sx, sy, dmg, col='#ff4444'){
    this.numbers.push({x:sx, y:sy, vy:-1.2, text:Math.ceil(dmg).toString(), col, life:1, maxLife:1.2});
  }

  explosion(sx, sy){
    this.shake(8);
    this.flashAlpha=0.5; this.flashCol='rgba(255,140,0,';
    this.blood(sx,sy,0);
    for(let i=0;i<20;i++) this.sparks(sx,sy,'#ff8c00',1);
    for(let i=0;i<12;i++) this.debris(sx,sy,'#555',1);
    for(let i=0;i<8;i++)  this.smoke(sx,sy);
  }

  shake(amt){ this.shakeAmt=Math.max(this.shakeAmt,amt); }

  // ── Tick & draw ─────────────────────────────────────────────────────────────
  tick(dt){
    this.shakeAmt=Math.max(0,this.shakeAmt-dt*30);
    this.shakeX=(Math.random()-0.5)*this.shakeAmt;
    this.shakeY=(Math.random()-0.5)*this.shakeAmt;
    this.flashAlpha=Math.max(0,this.flashAlpha-dt*4);
    this.particles=this.particles.filter(p=>{
      p.life-=dt/p.maxLife;
      p.px=p.x; p.py=p.y;
      p.x+=p.vx; p.y+=p.vy;
      p.vy+=p.gravity||0;
      p.vx*=0.95; p.vy*=0.98;
      if(p.rot!==undefined) p.rot+=p.rotSpd;
      return p.life>0;
    });
    this.numbers=this.numbers.filter(n=>{
      n.life-=dt/n.maxLife; n.y+=n.vy; return n.life>0;
    });
    // World-space smoke tick
    this._worldSmoke=this._worldSmoke.filter(s=>{
      s.life-=dt/s.maxLife;
      s.wx+=s.vx; s.wy+=s.vy;
      return s.life>0;
    });
  }

  drawParticles(ctx){
    for(const p of this.particles){
      const a=Math.max(0,p.life);
      ctx.globalAlpha=a;
      if(p.type==='circle'){
        ctx.fillStyle=p.col;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fill();
      } else if(p.type==='line'){
        ctx.strokeStyle=p.col; ctx.lineWidth=p.size*0.5;
        ctx.beginPath(); ctx.moveTo(p.px,p.py); ctx.lineTo(p.x,p.y); ctx.stroke();
      } else if(p.type==='rect'){
        ctx.fillStyle=p.col;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot||0);
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size); ctx.restore();
      } else if(p.type==='smoke'){
        const r=p.size*(2-p.life);
        const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
        grad.addColorStop(0,p.col+(a*0.3)+')');
        grad.addColorStop(1,p.col+'0)');
        ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
      } else if(p.type==='glow'){
        const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
        grad.addColorStop(0,p.col+a+')');
        grad.addColorStop(1,p.col+'0)');
        ctx.fillStyle=grad; ctx.fillRect(p.x-p.size,p.y-p.size,p.size*2,p.size*2);
      }
    }
    ctx.globalAlpha=1; ctx.lineWidth=1;
  }

  // Draw world-space smoke (needs renderer's w2s to convert coords)
  drawWorldSmoke(ctx, w2s){
    for(const s of this._worldSmoke){
      const [sx,sy]=w2s(s.wx,s.wy);
      const r=s.size*TILE_SIZE*(2-s.life);
      const a=s.life*0.25;
      const grad=ctx.createRadialGradient(sx,sy,0,sx,sy,r);
      grad.addColorStop(0,`rgba(90,90,90,${a})`);
      grad.addColorStop(1,'rgba(90,90,90,0)');
      ctx.fillStyle=grad;
      ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.fill();
    }
  }

  drawNumbers(ctx){    ctx.font='bold 16px monospace'; ctx.textAlign='center';
    for(const n of this.numbers){
      ctx.globalAlpha=n.life;
      ctx.fillStyle=n.col;
      ctx.fillText(n.text,n.x,n.y);
    }
    ctx.globalAlpha=1; ctx.textAlign='left';
  }

  drawFlash(ctx, W, H){
    if(this.flashAlpha>0.01){
      ctx.fillStyle=this.flashCol+this.flashAlpha+')';
      ctx.fillRect(0,0,W,H);
    }
  }

  // ── Weather precipitation ────────────────────────────────────────────────────
  drawRain(ctx, W, H, intensity=1){
    const t = Date.now() / 1000;
    const windAngle = 0.3 + Math.sin(t * 0.3) * 0.12;
    const sinA = Math.sin(windAngle), cosA = Math.cos(windAngle);
    const dropLen = 18 * intensity;
    ctx.save();
    ctx.lineWidth = intensity > 1 ? 2 : 1.5;
    for(const r of this._rain){
      r.y += r.spd * intensity * 0.014;
      r.x += sinA * r.spd * intensity * 0.005;
      if(r.y > 1){ r.y = -0.02; r.x = Math.random(); }
      if(r.x > 1) r.x -= 1; if(r.x < 0) r.x += 1;
      const rx = r.x * W, ry = r.y * H;
      // More visible — higher alpha
      const alpha = (0.35 + r.spd * 0.3) * intensity * 0.8;
      ctx.strokeStyle = `rgba(180,210,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - sinA * dropLen, ry - cosA * dropLen);
      ctx.stroke();
      // Splash at bottom
      if(r.y > 0.97){
        ctx.strokeStyle = `rgba(180,210,255,${alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(rx, H * 0.99, 3 * intensity, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Ground mist
    const mist = ctx.createLinearGradient(0, H * 0.82, 0, H);
    mist.addColorStop(0, 'rgba(140,170,220,0)');
    mist.addColorStop(1, `rgba(140,170,220,${0.1 * intensity})`);
    ctx.fillStyle = mist; ctx.fillRect(0, H * 0.82, W, H * 0.18);
    // Overall blue tint for heavy rain
    if(intensity > 1){
      ctx.fillStyle = `rgba(100,130,180,${0.08 * intensity})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  drawSnow(ctx, W, H, intensity=1){
    const t = Date.now() / 1000;
    ctx.save();
    for(const s of this._snow){
      s.y += s.spd * intensity;
      s.x += s.dx + Math.sin(t * 0.5 + s.r) * 0.0003 * intensity;
      if(s.y > 1){ s.y = 0; s.x = Math.random(); }
      if(s.x < 0) s.x = 1; if(s.x > 1) s.x = 0;
      const alpha = (0.5 + s.r * 0.2) * intensity;
      ctx.fillStyle = `rgba(220,235,255,${alpha})`;
      ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  drawFog(ctx, W, H, alpha=0.18){
    // Animated fog patches
    const t=Date.now()/8000;
    for(let i=0;i<4;i++){
      const fx=((Math.sin(t+i*1.3)*0.5+0.5)*1.4-0.2)*W;
      const fy=((Math.cos(t*0.7+i*0.9)*0.5+0.5))*H;
      const grad=ctx.createRadialGradient(fx,fy,0,fx,fy,W*0.5);
      grad.addColorStop(0,`rgba(180,190,200,${alpha})`);
      grad.addColorStop(1,'rgba(180,190,200,0)');
      ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
    }
  }

  // ── Animated menu background ─────────────────────────────────────────────────
  drawMenuBg(ctx, W, H){
    const t = Date.now() / 1000;

    // Deep dark background with subtle gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#03060a');
    bg.addColorStop(0.5, '#050e05');
    bg.addColorStop(1, '#020408');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Animated green hex grid
    ctx.strokeStyle = 'rgba(125,200,50,0.04)'; ctx.lineWidth = 1;
    const gs = 55, off = (t * 8) % gs;
    for(let x = -gs; x < W + gs; x += gs){
      ctx.beginPath(); ctx.moveTo(x + off, 0); ctx.lineTo(x + off, H); ctx.stroke();
    }
    for(let y = -gs; y < H + gs; y += gs){
      ctx.beginPath(); ctx.moveTo(0, y + off * 0.5); ctx.lineTo(W, y + off * 0.5); ctx.stroke();
    }

    // Drifting zombie silhouettes
    if(!this._menuZombies){
      this._menuZombies = Array.from({length:18}, () => ({
        x: Math.random() * W, y: Math.random() * H,
        spd: 0.15 + Math.random() * 0.25,
        dir: Math.random() * Math.PI * 2,
        size: 18 + Math.random() * 28,
        alpha: 0.03 + Math.random() * 0.07,
        wobble: Math.random() * Math.PI * 2,
      }));
    }
    ctx.textAlign = 'center';
    for(const z of this._menuZombies){
      z.x += Math.cos(z.dir) * z.spd;
      z.y += Math.sin(z.dir) * z.spd;
      z.dir += 0.003 * (Math.random() - 0.5);
      z.wobble += 0.02;
      if(z.x < -60) z.x = W + 60; if(z.x > W + 60) z.x = -60;
      if(z.y < -60) z.y = H + 60; if(z.y > H + 60) z.y = -60;
      const pulse = z.alpha * (0.7 + 0.3 * Math.sin(z.wobble));
      ctx.fillStyle = `rgba(125,200,50,${pulse})`;
      ctx.font = `${z.size}px monospace`;
      ctx.fillText('☣', z.x, z.y);
    }
    ctx.textAlign = 'left';

    // Scanlines
    for(let y = 0; y < H; y += 3){
      ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, y, W, 1);
    }

    // Radial vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H * 0.15, W/2, H/2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    // Subtle green glow at center
    const glow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, H * 0.5);
    glow.addColorStop(0, 'rgba(125,200,50,0.04)');
    glow.addColorStop(1, 'rgba(125,200,50,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  }
}

// Global VFX instance
const vfx = new VFX();
