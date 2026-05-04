// ── HUD & UI ──────────────────────────────────────────────────────────────────
class UI {
  constructor(){
    this.showInv      = false;
    this.showCraft    = false;
    this.showPause    = false;
    this.craftStation = null;
    this.hotbarSel    = 0;
    this.hotbar       = new Array(9).fill(null);
    this.chatMsgs     = [];
    this.notifications= [];
    this.craftRects   = [];
    this.invRects     = [];
    this.armourRects  = [];
    this._pauseRects  = [];
    this.chatting     = false;
    this._fps         = 0;
    this._fpsTimer    = 0;
    this._fpsFrames   = 0;
    this._showFps     = false;
    this._invScroll   = 0;
    this._craftScroll = 0;
    this._craftFilter = null; // station filter
    this._hoveredInv  = null;
    this._hoveredCraft= null;
    // Open/close animations (0=closed, 1=open)
    this._invAnim   = 0;
    this._craftAnim = 0;
    this._pauseAnim = 0;
    // Floating loot/save animations
    this._lootAnims = [];
    this._saveAnim  = 0;
    this._hammerMode= 'repair';
    // Drag and drop
    this._drag      = null; // {id, qty, fromSlot, fromHotbar, sx, sy}
    this._dragX     = 0;
    this._dragY     = 0;
  }

  notify(text, col='#ffffff', dur=4){
    // Deduplicate
    if(this.notifications.find(n=>n.text===text)) return;
    this.notifications.push({text, col, timer:dur});
  }

  tickNotifications(dt){
    this._fpsTimer+=dt; this._fpsFrames++;
    if(this._fpsTimer>=1){ this._fps=this._fpsFrames; this._fpsTimer=0; this._fpsFrames=0; }
    this.notifications=this.notifications.filter(n=>{ n.timer-=dt; return n.timer>0; });
    // Animate panels
    const spd = dt * 10;
    this._invAnim   = this.showInv   ? Math.min(1,this._invAnim+spd)   : Math.max(0,this._invAnim-spd);
    this._craftAnim = this.showCraft ? Math.min(1,this._craftAnim+spd) : Math.max(0,this._craftAnim-spd);
    this._pauseAnim = this.showPause ? Math.min(1,this._pauseAnim+spd) : Math.max(0,this._pauseAnim-spd);
    // Loot animations
    this._lootAnims=this._lootAnims.filter(a=>{ a.timer-=dt; a.y-=30*dt; return a.timer>0; });
    // Save animation
    if(this._saveAnim>0) this._saveAnim=Math.max(0,this._saveAnim-dt);
  }

  syncHotbar(inv){
    // Only fill empty hotbar slots — don't overwrite manually placed items
    // Also remove slots where item no longer exists in inventory
    for(let i=0;i<9;i++){
      if(this.hotbar[i]&&!(inv[this.hotbar[i]]>0)){
        this.hotbar[i]=null; // item gone, clear slot
      }
    }
    // Fill empty slots with new inventory items not already in hotbar
    const inHotbar=new Set(this.hotbar.filter(Boolean));
    const newItems=Object.keys(inv).filter(k=>!inHotbar.has(k));
    let ni=0;
    for(let i=0;i<9;i++){
      if(!this.hotbar[i]&&ni<newItems.length){
        this.hotbar[i]=newItems[ni++];
      }
    }
  }

  // ── Master draw ───────────────────────────────────────────────────────────────
  draw(ctx, game, myPid, wdata, renderer){
    const p=game.players[myPid]; if(!p) return;
    const W=renderer.W, H=renderer.H;
    this._renderer=renderer; // store for icon drawing
    this._drawStatBars(ctx,p,wdata,W,H);
    this._drawHotbar(ctx,p,W,H);
    this._drawArmourHUD(ctx,p,W,H);
    this._drawCompass(ctx,wdata,W,H);
    this._drawNotifications(ctx,W,H);
    this._drawChatLog(ctx,W,H);
    if(this._showFps){
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(W-80,H-20,76,16);
      ctx.fillStyle='#7dc832'; ctx.font='11px monospace';
      ctx.fillText(`FPS: ${this._fps}`,W-76,H-7);
    }
    if(this._invAnim>0.01)   this._drawInventory(ctx,p,W,H,this._invAnim);
    if(this._craftAnim>0.01) this._drawCrafting(ctx,p,W,H,this._craftAnim);
    if(this._pauseAnim>0.01) this._drawPauseMenu(ctx,game,myPid,W,H,this._pauseAnim);
    if(p.isDown)       this._drawDownScreen(ctx,p,W,H);
    if(p.isDead)       this._drawDeadScreen(ctx,W,H);
    this._drawInteractHint(ctx,game,myPid,renderer,W,H);
    // Death waypoint
    if(p.lastDeathX!==null&&p.lastDeathY!==null){
      this._drawDeathWaypoint(ctx,p,renderer,W,H);
    }
    // Drag item rendering (always on top)
    if(this._drag) this._drawDragItem(ctx, W, H);
    // Save animation
    if(this._saveAnim>0) this._drawSaveAnim(ctx,W,H,this._saveAnim);
    // Infection meter (hidden until infected)
    if((p.infectionRevealed||p.infection>0)&&p.infection>0) this._drawInfectionMeter(ctx,p,W,H);
    // Blocking indicator
    if(p.blocking){
      ctx.fillStyle='rgba(80,160,255,0.25)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(80,160,255,0.9)'; ctx.font='bold 13px monospace'; ctx.textAlign='center';
      ctx.fillText('BLOCKING',W/2,H/2+80); ctx.textAlign='left';
    }
    // Hammer mode indicator
    if(p.heldItem==='hammer'){
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(W/2-60,H-100,120,20);
      ctx.fillStyle=this._hammerMode==='repair'?'#7dc832':'#c83232';
      ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText(`HAMMER: ${this._hammerMode.toUpperCase()} [R]`,W/2,H-86);
      ctx.textAlign='left';
    }
    // Spawn protection
    if((p.spawnProtection||0)>0){
      ctx.fillStyle='rgba(60,120,255,0.12)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='rgba(100,160,255,0.9)'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText(`SPAWN PROTECTION  ${Math.ceil(p.spawnProtection)}s`,W/2,H-88);
      ctx.textAlign='left';
    }
    // Water tint
    if(p.wet&&game.getTile){
      const tile=game.getTile(p.x|0,p.y|0);
      if(WATER_TILES.has(tile)){
        ctx.fillStyle='rgba(30,80,180,0.14)'; ctx.fillRect(0,0,W,H);
      }
    }
  }

  // ── Stat bars ─────────────────────────────────────────────────────────────────
  _drawStatBars(ctx,p,wdata,W,H){
    const bw=186, bh=13, ox=8, gap=3;
    const bars=[
      {label:'HP',     val:p.hp,           max:p.maxHp, col:'#c03030'},
      {label:'Hunger', val:p.hunger,        max:100,     col:'#b87020'},
      {label:'Thirst', val:p.thirst,        max:100,     col:'#2870b8'},
      {label:'Stamina',val:p.stamina||100,  max:100,     col:'#28b870'},
    ];
    ctx.font='10px monospace';
    for(let i=0;i<bars.length;i++){
      const {label,val,max,col}=bars[i];
      const y=8+i*(bh+gap);
      const ratio=Math.max(0,val/max);
      // bg
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(ox,y,bw,bh);
      // fill
      ctx.fillStyle=col; ctx.fillRect(ox,y,bw*ratio,bh);
      // low pulse
      if(ratio<0.25&&ratio>0){
        const pulse=0.2+0.2*Math.sin(Date.now()/160);
        ctx.fillStyle=`rgba(255,255,255,${pulse})`; ctx.fillRect(ox,y,bw*ratio,bh);
      }
      // border
      ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.strokeRect(ox,y,bw,bh);
      // label
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.fillText(`${label}  ${Math.ceil(val)}/${max}`,ox+4,y+bh-2);
    }
    // Temperature bar
    const temp=p.bodyTemp||37;
    const isCold=temp<=TEMP_COLD_THRESHOLD, isHot=temp>=TEMP_HOT_THRESHOLD;
    const tcol=isCold?'#4090e0':isHot?'#e04040':'#40b840';
    const ty=8+bars.length*(bh+gap);
    const tempRatio=Math.max(0,Math.min(1,(temp-15)/30));
    ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(ox,ty,bw,bh);
    ctx.fillStyle=tcol; ctx.fillRect(ox,ty,bw*tempRatio,bh);
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.strokeRect(ox,ty,bw,bh);
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.fillText(`Temp  ${temp.toFixed(1)}C${isCold?' [COLD]':isHot?' [HOT]':''}`,ox+4,ty+bh-2);
    // Info strip
    const iy=ty+bh+gap+2;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(ox,iy,220,12);
    ctx.fillStyle='#6a8a60'; ctx.font='9px monospace';
    const w=wdata;
    const dayStr=w.isDaytime?'DAY':'NIGHT';
    ctx.fillText(`${dayStr}  Day ${w.dayNumber||0}  ${(w.season||'').toUpperCase()}  ${(w.weather||'').toUpperCase()}`,ox+3,iy+9);
    // XP bar
    const xpy=iy+16;
    const xpRatio=(p.xp%(p.level*100))/(p.level*100);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(ox,xpy,bw,9);
    ctx.fillStyle='#b89020'; ctx.fillRect(ox,xpy,bw*xpRatio,9);
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.strokeRect(ox,xpy,bw,9);
    ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.font='8px monospace';
    ctx.fillText(`Lv${p.level}   ${p.xp%(p.level*100)}/${p.level*100} XP`,ox+3,xpy+7);
    // Status icons
    let sx2=ox;
    const sy2=xpy+14;
    if(p.infected){ ctx.fillStyle='#40e040'; ctx.font='bold 9px monospace'; ctx.fillText('INFECTED',sx2,sy2); sx2+=62; }
    if(p.crouching){ ctx.fillStyle='#e0e040'; ctx.font='bold 9px monospace'; ctx.fillText('CROUCH',sx2,sy2); sx2+=50; }
    if(p.wet){ ctx.fillStyle='#4080e0'; ctx.font='bold 9px monospace'; ctx.fillText('WET',sx2,sy2); }
  }

  // ── Hotbar ────────────────────────────────────────────────────────────────────
  _drawHotbar(ctx,p,W,H){
    const sw=54, sh=54, n=9, total=sw*n;
    const ox=W/2-total/2, oy=H-66;
    const inv=p.inventory||{};
    for(let i=0;i<n;i++){
      const sx=ox+i*sw, sel=i===this.hotbarSel;
      // bg
      ctx.fillStyle=sel?'rgba(60,100,40,0.9)':'rgba(8,12,8,0.82)';
      ctx.fillRect(sx,oy,sw-2,sh);
      // border
      ctx.strokeStyle=sel?'#7dc832':'rgba(255,255,255,0.08)';
      ctx.lineWidth=sel?2:1; ctx.strokeRect(sx,oy,sw-2,sh); ctx.lineWidth=1;
      // left accent bar on selected
      if(sel){ ctx.fillStyle='#7dc832'; ctx.fillRect(sx,oy,2,sh); }
      const item=this.hotbar[i];
      if(item&&inv[item]){
        // Colour by type
        let col='#c0d8a0';
        if(RANGED.has(item))          col='#e0b060';
        else if(WEAPON_DAMAGE[item])  col='#e08060';
        else if(ARMOUR_DEFENCE[item]) col='#6080e0';
        else if(FOOD_VALUES[item]||DRINK_VALUES[item]) col='#60c060';
        else if(['medkit','bandage','antibiotics'].includes(item)) col='#e06060';
        // Drawn icon (no text symbols)
        if(this._renderer&&this._renderer.drawItemIcon){
          this._renderer.drawItemIcon(ctx,item,sx+4,oy+4,sw-8);
        }
        // Name
        ctx.fillStyle=col; ctx.font='bold 8px monospace'; ctx.textAlign='center';
        ctx.fillText((ITEMS[item]||item).slice(0,6),sx+sw/2,oy+sh-14);
        // Qty / ammo
        const ammoId=(typeof WEAPON_AMMO!=='undefined')&&WEAPON_AMMO[item];
        ctx.fillStyle='#ffd700'; ctx.font='9px monospace';
        if(ammoId&&inv[ammoId]!==undefined){
          ctx.fillText(`${inv[ammoId]}`,sx+sw/2,oy+sh-4);
        } else {
          ctx.fillText(inv[item],sx+sw/2,oy+sh-4);
        }
        ctx.textAlign='left';
        if(WEAPON_DAMAGE[item]){
          ctx.fillStyle='rgba(220,100,50,0.85)'; ctx.font='8px monospace';
          ctx.fillText(`${WEAPON_DAMAGE[item]}`,sx+sw-20,oy+12);
        }
      }
      ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.font='9px monospace';
      ctx.fillText(i+1,sx+sw-14,oy+11);
    }
    // Held item name
    const held=this.hotbar[this.hotbarSel];
    if(held){
      const name=ITEMS[held]||held;
      const tw=ctx.measureText(name).width+20;
      ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(W/2-tw/2,oy-20,tw,16);
      ctx.strokeStyle='rgba(125,200,50,0.3)'; ctx.strokeRect(W/2-tw/2,oy-20,tw,16);
      ctx.fillStyle='#7dc832'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText(name,W/2,oy-8); ctx.textAlign='left';
    }
  }

  // ── Armour HUD ────────────────────────────────────────────────────────────────
  _drawArmourHUD(ctx,p,W,H){
    const armour=p.armour||{};
    const ox=W-148, oy=8;
    ctx.font='10px monospace';
    const icons={helmet:'[H]',chest:'[C]',legs:'[L]'};
    for(let i=0;i<3;i++){
      const slot=ARMOUR_SLOTS[i], item=armour[slot];
      const y=oy+i*22;
      ctx.fillStyle=item?'rgba(15,35,10,0.85)':'rgba(8,8,8,0.6)';
      ctx.fillRect(ox,y,140,18);
      ctx.strokeStyle=item?'rgba(125,200,50,0.25)':'rgba(255,255,255,0.06)';
      ctx.strokeRect(ox,y,140,18);
      ctx.fillStyle=item?'#7dc832':'#334433';
      ctx.fillText(icons[slot],ox+4,y+13);
      ctx.fillStyle=item?'#a0c890':'#334433';
      ctx.fillText(item?(ITEMS[item]||item).slice(0,12):'empty',ox+26,y+13);
    }
  }

  // ── Compass / time bar ────────────────────────────────────────────────────────
  _drawCompass(ctx,wdata,W,H){
    const tod=wdata.timeOfDay||0, dayLen=1200;
    const ratio=tod/dayLen;
    const bw=180, bh=8, ox=W/2-bw/2, oy=6;
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(ox,oy,bw,bh);
    // Day band
    ctx.fillStyle='rgba(255,210,40,0.22)'; ctx.fillRect(ox+0.25*bw,oy,0.5*bw,bh);
    // Marker
    ctx.fillStyle=wdata.isDaytime?'#ffe060':'#a0b8e0';
    ctx.fillRect(ox+ratio*bw-2,oy-2,4,bh+4);
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.strokeRect(ox,oy,bw,bh);
    const h=(ratio*24)|0, m=((ratio*24*60)%60)|0;
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='9px monospace'; ctx.textAlign='center';
    ctx.fillText(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,W/2,oy+bh+10);
    ctx.textAlign='left';
  }

  // ── Notifications ─────────────────────────────────────────────────────────────
  _drawNotifications(ctx,W,H){
    ctx.textAlign='center';
    for(let i=0;i<Math.min(this.notifications.length,5);i++){
      const n=this.notifications[i];
      const alpha=Math.min(1,n.timer*1.5);
      ctx.globalAlpha=alpha;
      ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(W/2-210,160+i*26,420,20);
      ctx.fillStyle=n.col; ctx.font='bold 13px monospace';
      ctx.fillText(n.text,W/2,175+i*26);
    }
    ctx.globalAlpha=1; ctx.textAlign='left';
  }

  // ── Chat log ──────────────────────────────────────────────────────────────────
  _drawChatLog(ctx,W,H){
    const msgs=this.chatMsgs.slice(-8);
    ctx.font='11px monospace';
    for(let i=0;i<msgs.length;i++){
      const m=msgs[i];
      const text=typeof m==='string'?m:(m.text||'');
      const age=m.time?(Date.now()-m.time)/1000:0;
      const alpha=Math.max(0.15,1-age/14);
      const y=H-195+i*15;
      ctx.fillStyle=`rgba(0,0,0,${0.45*alpha})`; ctx.fillRect(8,y-11,320,13);
      ctx.fillStyle=`rgba(220,230,210,${alpha})`; ctx.fillText(text.slice(0,52),10,y);
    }
  }

  // ── Inventory (grid layout) ───────────────────────────────────────────────────
  _drawInventory(ctx,p,W,H,anim=1){
    const SLOT=46, COLS=8, PAD=12;
    const inv=p.inventory||{};
    const items=Object.entries(inv);
    const rows=Math.max(6,Math.ceil(items.length/COLS));
    const pw=COLS*SLOT+PAD*2+160; // extra 160 for armour panel
    const ph=Math.min(rows*SLOT+80, H-60);
    const px=W/2-pw/2, py=H/2-ph/2;

    // Scale + fade open animation
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(0.88+0.12*anim, 0.88+0.12*anim);
    ctx.globalAlpha=anim;
    ctx.translate(-W/2,-H/2);

    // Panel bg
    ctx.fillStyle='rgba(4,8,4,0.97)'; ctx.fillRect(px,py,pw,ph);
    ctx.strokeStyle='rgba(125,200,50,0.25)'; ctx.strokeRect(px,py,pw,ph);
    // Title bar
    ctx.fillStyle='rgba(10,30,8,0.95)'; ctx.fillRect(px,py,pw,28);
    ctx.strokeStyle='rgba(125,200,50,0.15)'; ctx.beginPath(); ctx.moveTo(px,py+28); ctx.lineTo(px+pw,py+28); ctx.stroke();
    ctx.fillStyle='#7dc832'; ctx.font='bold 12px monospace';
    ctx.fillText('INVENTORY',px+10,py+19);
    ctx.fillStyle='#3a5a30'; ctx.font='10px monospace';
    ctx.fillText('E close  |  click = use/equip  |  right-click = drop',px+110,py+19);

    // Grid area
    const gx=px+PAD, gy=py+36;
    const gridW=COLS*SLOT;
    this.invRects=[];

    for(let i=0;i<items.length;i++){
      const [id,qty]=items[i];
      const col=i%COLS, row=Math.floor(i/COLS);
      const sx=gx+col*SLOT, sy=gy+row*SLOT;
      if(sy+SLOT>py+ph-8) break;

      // Slot bg
      let slotCol='rgba(10,18,8,0.9)';
      if(WEAPON_DAMAGE[id])  slotCol='rgba(30,12,8,0.9)';
      else if(ARMOUR_DEFENCE[id]) slotCol='rgba(8,12,30,0.9)';
      else if(FOOD_VALUES[id]||DRINK_VALUES[id]) slotCol='rgba(8,25,8,0.9)';
      else if(['medkit','bandage','antibiotics'].includes(id)) slotCol='rgba(28,8,8,0.9)';
      ctx.fillStyle=slotCol; ctx.fillRect(sx+1,sy+1,SLOT-2,SLOT-2);
      ctx.strokeStyle='rgba(125,200,50,0.12)'; ctx.strokeRect(sx+1,sy+1,SLOT-2,SLOT-2);

      // Drawn icon centered in slot
      if(this._renderer&&this._renderer.drawItemIcon){
        this._renderer.drawItemIcon(ctx,id,sx+2,sy+2,SLOT-4);
      } else {
        const icon=(typeof ITEM_ICONS!=='undefined'&&ITEM_ICONS[id])||'[?]';
        ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='bold 10px monospace';
        ctx.textAlign='center'; ctx.fillText(icon,sx+SLOT/2,sy+14); ctx.textAlign='left';
      }

      // Item name below icon
      let textCol='#a0b890';
      if(WEAPON_DAMAGE[id]) textCol='#e09060';
      else if(ARMOUR_DEFENCE[id]) textCol='#6090e0';
      else if(FOOD_VALUES[id]||DRINK_VALUES[id]) textCol='#60c060';
      else if(['medkit','bandage','antibiotics'].includes(id)) textCol='#e06060';
      const abbr=(ITEMS[id]||id).slice(0,7);
      ctx.fillStyle=textCol; ctx.font='bold 8px monospace';
      ctx.fillText(abbr, sx+3, sy+26);

      // Qty (bottom-left)
      ctx.fillStyle='#c8a820'; ctx.font='10px monospace';
      ctx.fillText(qty, sx+3, sy+SLOT-5);

      // Stat (top-right)
      if(WEAPON_DAMAGE[id]){
        ctx.fillStyle='rgba(220,100,50,0.9)'; ctx.font='8px monospace';
        ctx.fillText(`${WEAPON_DAMAGE[id]}`, sx+SLOT-22, sy+10);
      } else if(ARMOUR_DEFENCE[id]){
        ctx.fillStyle='rgba(80,120,220,0.9)'; ctx.font='8px monospace';
        ctx.fillText(`+${ARMOUR_DEFENCE[id]}`, sx+SLOT-24, sy+10);
      }

      this.invRects.push({x:sx+1,y:sy+1,w:SLOT-2,h:SLOT-2,id,qty});
    }

    // Empty slots
    const filledSlots=items.length;
    const totalSlots=COLS*rows;
    for(let i=filledSlots;i<Math.min(totalSlots,COLS*6);i++){
      const col=i%COLS, row=Math.floor(i/COLS);
      const sx=gx+col*SLOT, sy=gy+row*SLOT;
      if(sy+SLOT>py+ph-8) break;
      ctx.fillStyle='rgba(6,10,6,0.7)'; ctx.fillRect(sx+1,sy+1,SLOT-2,SLOT-2);
      ctx.strokeStyle='rgba(125,200,50,0.05)'; ctx.strokeRect(sx+1,sy+1,SLOT-2,SLOT-2);
    }

    // ── Armour panel (right side) ─────────────────────────────────────────────
    const ax=gx+gridW+10, ay=gy;
    ctx.fillStyle='#7dc832'; ctx.font='bold 10px monospace';
    ctx.fillText('ARMOUR',ax,ay-4);
    this.armourRects=[];
    const armour=p.armour||{};
    const slotLabels={helmet:'HEAD',chest:'BODY',legs:'LEGS'};
    for(let i=0;i<3;i++){
      const slot=ARMOUR_SLOTS[i], item=armour[slot];
      const sy2=ay+i*56;
      ctx.fillStyle=item?'rgba(15,35,10,0.9)':'rgba(8,12,8,0.7)';
      ctx.fillRect(ax,sy2,140,50);
      ctx.strokeStyle=item?'rgba(125,200,50,0.3)':'rgba(125,200,50,0.08)';
      ctx.strokeRect(ax,sy2,140,50);
      ctx.fillStyle='rgba(125,200,50,0.4)'; ctx.font='8px monospace';
      ctx.fillText(slotLabels[slot],ax+4,sy2+11);
      if(item){
        ctx.fillStyle='#a0c890'; ctx.font='bold 10px monospace';
        ctx.fillText((ITEMS[item]||item).slice(0,14),ax+4,sy2+26);
        ctx.fillStyle='#6090e0'; ctx.font='9px monospace';
        ctx.fillText(`DEF +${ARMOUR_DEFENCE[item]||0}`,ax+4,sy2+40);
      } else {
        ctx.fillStyle='#2a4020'; ctx.font='10px monospace';
        ctx.fillText('empty',ax+4,sy2+30);
      }
      this.armourRects.push({x:ax,y:sy2,w:140,h:50,slot,item});
    }

    // Tooltip on hover
    if(this._hoveredInv){
      const {id,x,y}=this._hoveredInv;
      this._drawTooltip(ctx,id,x,y,W,H);
    }
  }

  _drawTooltip(ctx,id,mx,my,W,H){
    const name=ITEMS[id]||id;
    const lines=[name];
    if(WEAPON_DAMAGE[id]) lines.push(`Damage: ${WEAPON_DAMAGE[id]}`, `Range: ${WEAPON_RANGE[id]||'?'}`);
    if(ARMOUR_DEFENCE[id]) lines.push(`Defence: +${ARMOUR_DEFENCE[id]}`);
    if(FOOD_VALUES[id]){ const [h,t,hp]=FOOD_VALUES[id]; lines.push(`Hunger +${h}  Thirst +${t}  HP +${hp}`); }
    if(DRINK_VALUES[id]){ const [h,t,hp]=DRINK_VALUES[id]; lines.push(`Thirst +${t}${hp?`  HP +${hp}`:''}`); }
    const tw=Math.max(...lines.map(l=>l.length))*7+16;
    const th=lines.length*16+10;
    let tx=mx+12, ty=my-th-4;
    if(tx+tw>W) tx=mx-tw-4;
    if(ty<0) ty=my+16;
    ctx.fillStyle='rgba(4,10,4,0.97)'; ctx.fillRect(tx,ty,tw,th);
    ctx.strokeStyle='rgba(125,200,50,0.4)'; ctx.strokeRect(tx,ty,tw,th);
    ctx.font='bold 11px monospace'; ctx.fillStyle='#7dc832';
    ctx.fillText(lines[0],tx+6,ty+14);
    ctx.font='10px monospace'; ctx.fillStyle='#8aaa80';
    for(let i=1;i<lines.length;i++) ctx.fillText(lines[i],tx+6,ty+14+i*15);
  }
  // End inventory animation
  // (ctx.restore called at end of _drawInventory)

  // ── Crafting menu ─────────────────────────────────────────────────────────────
  _drawCrafting(ctx,p,W,H,anim=1){
    const pw=580, ph=Math.min(560,H-60);
    const px=W/2-pw/2, py=H/2-ph/2;

    // Scale + fade animation
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(0.88+0.12*anim, 0.88+0.12*anim);
    ctx.globalAlpha=anim;
    ctx.translate(-W/2,-H/2);

    ctx.fillStyle='rgba(3,8,3,0.97)'; ctx.fillRect(px,py,pw,ph);
    ctx.strokeStyle='rgba(125,200,50,0.22)'; ctx.strokeRect(px,py,pw,ph);

    // Title bar
    ctx.fillStyle='rgba(8,25,6,0.95)'; ctx.fillRect(px,py,pw,30);
    ctx.strokeStyle='rgba(125,200,50,0.12)'; ctx.beginPath(); ctx.moveTo(px,py+30); ctx.lineTo(px+pw,py+30); ctx.stroke();
    const stLabel=this.craftStation?this.craftStation.toUpperCase():'BY HAND';
    ctx.fillStyle='#7dc832'; ctx.font='bold 12px monospace';
    ctx.fillText(`CRAFTING  [${stLabel}]`,px+10,py+20);
    ctx.fillStyle='#3a5a30'; ctx.font='10px monospace';
    ctx.fillText('Tab close  |  click to craft',px+pw-200,py+20);

    // Station filter tabs
    const stations=[null,'workbench','furnace'];
    const stNames=['Hand','Workbench','Furnace'];
    const tabW=90;
    for(let i=0;i<stations.length;i++){
      const tx2=px+10+i*(tabW+4), ty2=py+34;
      const active=this.craftStation===stations[i];
      ctx.fillStyle=active?'rgba(20,50,10,0.95)':'rgba(8,14,6,0.8)';
      ctx.fillRect(tx2,ty2,tabW,20);
      ctx.strokeStyle=active?'rgba(125,200,50,0.5)':'rgba(125,200,50,0.1)';
      ctx.strokeRect(tx2,ty2,tabW,20);
      ctx.fillStyle=active?'#7dc832':'#3a5a30'; ctx.font='10px monospace'; ctx.textAlign='center';
      ctx.fillText(stNames[i],tx2+tabW/2,ty2+14);
    }
    ctx.textAlign='left';

    const craftable=getCraftable(p.inventory||{},this.craftStation);
    this.craftRects=[];
    const listY=py+60, listH=ph-68;

    if(craftable.length===0){
      ctx.fillStyle='#2a4020'; ctx.font='12px monospace';
      ctx.fillText('Nothing craftable here.',px+16,listY+30);
      ctx.fillStyle='#1a3010'; ctx.font='10px monospace';
      ctx.fillText('Gather resources or open a workbench/furnace.',px+16,listY+50);
      return;
    }

    // Two-column recipe list
    const colW=(pw-20)/2, rowH=52;
    for(let i=0;i<craftable.length;i++){
      const r=craftable[i];
      const col=i%2, row=Math.floor(i/2);
      const rx=px+10+col*colW, ry=listY+row*rowH;
      if(ry+rowH>py+ph-4) break;

      const rect={x:rx,y:ry,w:colW-6,h:rowH-4,recipe:r,idx:RECIPES.indexOf(r)};
      this.craftRects.push(rect);

      // Hover highlight
      const hov=this._hoveredCraft===i;
      ctx.fillStyle=hov?'rgba(25,55,15,0.95)':'rgba(10,22,8,0.9)';
      ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      ctx.strokeStyle=hov?'rgba(125,200,50,0.5)':'rgba(125,200,50,0.1)';
      ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);

      // Result name + count
      const name=ITEMS[r.result]||r.result;
      ctx.fillStyle='#c8e0a0'; ctx.font='bold 11px monospace';
      ctx.fillText(`${name}  x${r.count}`,rect.x+6,rect.y+16);

      // Requirements
      const req=Object.entries(r.req).map(([k,v])=>{
        const have=(p.inventory||{})[k]||0;
        return `${ITEMS[k]||k}:${have}/${v}`;
      }).join('  ');
      ctx.fillStyle='#4a6a40'; ctx.font='9px monospace';
      ctx.fillText(req.slice(0,42),rect.x+6,rect.y+30);

      // Craft button
      ctx.fillStyle='rgba(20,50,10,0.9)'; ctx.fillRect(rect.x+rect.w-52,rect.y+6,48,rowH-16);
      ctx.strokeStyle='rgba(125,200,50,0.35)'; ctx.strokeRect(rect.x+rect.w-52,rect.y+6,48,rowH-16);
      ctx.fillStyle='#7dc832'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
      ctx.fillText('CRAFT',rect.x+rect.w-28,rect.y+rowH/2+4);
      ctx.textAlign='left';
    }
  }

  // ── Pause menu ────────────────────────────────────────────────────────────────
  _drawPauseMenu(ctx,game,myPid,W,H,anim=1){
    const a=Math.min(1,anim);
    ctx.save();
    ctx.globalAlpha=a*0.75;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=1;

    const pw=340, ph=330, px=W/2-pw/2, py=H/2-ph/2;
    ctx.save();
    ctx.translate(W/2,H/2);
    ctx.scale(0.88+0.12*a,0.88+0.12*a);
    ctx.globalAlpha=a;
    ctx.translate(-W/2,-H/2);

    // Panel bg
    ctx.fillStyle='rgba(3,8,3,0.98)'; ctx.fillRect(px,py,pw,ph);
    // Gradient top bar
    const g2=ctx.createLinearGradient(px,py,px+pw,py);
    g2.addColorStop(0,'rgba(125,200,50,0)');
    g2.addColorStop(0.5,'rgba(125,200,50,0.9)');
    g2.addColorStop(1,'rgba(125,200,50,0)');
    ctx.fillStyle=g2; ctx.fillRect(px,py,pw,3);
    ctx.fillStyle=g2; ctx.fillRect(px,py+ph-3,pw,3);
    ctx.strokeStyle='rgba(125,200,50,0.18)'; ctx.lineWidth=1; ctx.strokeRect(px,py,pw,ph);

    // Title with glow
    ctx.fillStyle='#7dc832'; ctx.font='bold 22px monospace'; ctx.textAlign='center';
    ctx.shadowColor='#7dc832'; ctx.shadowBlur=12;
    ctx.fillText('PAUSED',W/2,py+38);
    ctx.shadowBlur=0;

    ctx.strokeStyle='rgba(125,200,50,0.12)';
    ctx.beginPath(); ctx.moveTo(px+24,py+52); ctx.lineTo(px+pw-24,py+52); ctx.stroke();

    const total=Object.keys(game.players).length;
    const votes=game.pauseVotes?.size||0;
    let infoY=py+70;
    if(total>1){
      ctx.fillStyle='#4a6a40'; ctx.font='11px monospace';
      ctx.fillText(`${votes}/${total} players paused`,W/2,infoY); infoY+=18;
    }
    ctx.fillStyle=game.pvp?'#e06060':'#4a8a40'; ctx.font='10px monospace';
    ctx.fillText(`PVP ${game.pvp?'ON':'OFF'}  |  Day ${game.weather?.dayNumber||0}`,W/2,infoY);

    this._pauseRects=[];
    const btns=[
      {label:'▶  RESUME',     col:'#7dc832', bg:'rgba(12,35,6,0.95)',  action:'resume'},
      {label:'💾  SAVE GAME',  col:'#c8a820', bg:'rgba(28,22,4,0.95)', action:'save'},
      {label:'✕  QUIT',       col:'#c83232', bg:'rgba(28,4,4,0.95)',   action:'quit'},
    ];
    const bh=44, bw=pw-56, bx=px+28;
    const startY=infoY+16;
    for(let i=0;i<btns.length;i++){
      const b=btns[i], by=startY+i*(bh+8);
      const br={x:bx,y:by,w:bw,h:bh,action:b.action};
      this._pauseRects.push(br);
      ctx.fillStyle=b.bg; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle=b.col; ctx.fillRect(bx,by,4,bh);
      ctx.strokeStyle=b.col+'33'; ctx.strokeRect(bx,by,bw,bh);
      ctx.fillStyle=b.col; ctx.font='bold 13px monospace';
      ctx.fillText(b.label,W/2,by+bh/2+5);
    }
    ctx.textAlign='left'; ctx.restore(); ctx.restore();
  }

  // ── Interaction hint ──────────────────────────────────────────────────────────
  _drawInteractHint(ctx,game,myPid,renderer,W,H){
    const me=game.players[myPid]; if(!me) return;
    const [wx,wy]=renderer.s2w(_mouseX,_mouseY);
    const twx=wx|0, twy=wy|0;
    const tile=game.getTile(twx,twy);
    let hint=null;
    if(tile===T.LOOT) hint='Left click — LOOT';
    else if(tile===T.FARMLAND) hint='Left click — PLANT seed';
    else if([T.CROP_WHEAT,T.CROP_POTATO,T.CROP_CARROT].includes(tile)) hint='Left click — HARVEST';
    for(const b of Object.values(game.blocks)){
      if(b.x===twx&&b.y===twy){
        if(b.blockType==='workbench'||b.blockType==='workbench_t2') hint='Right click — CRAFT';
        else if(b.blockType.startsWith('furnace')||b.blockType==='stove') hint='Right click — SMELT / COOK';
        else if(b.blockType==='bed') hint='Respawn point';
      }
    }
    for(const p of Object.values(game.players)){
      if(p.isDown&&p.pid!==myPid&&Math.hypot(p.x-me.x,p.y-me.y)<2.5)
        hint=`F — REVIVE ${p.name}`;
    }
    if(hint){
      const tw=ctx.measureText(hint).width+24;
      ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(W/2-tw/2,H/2+38,tw,18);
      ctx.strokeStyle='rgba(125,200,50,0.3)'; ctx.strokeRect(W/2-tw/2,H/2+38,tw,18);
      ctx.fillStyle='#7dc832'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText(hint,W/2,H/2+52); ctx.textAlign='left';
    }
  }

  // ── Down / dead screens ───────────────────────────────────────────────────────
  _drawDownScreen(ctx,p,W,H){
    ctx.fillStyle='rgba(160,40,0,0.45)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';
    ctx.fillStyle='#ff4444'; ctx.font='bold 34px monospace';
    ctx.fillText('YOU ARE DOWN',W/2,H/2-28);
    ctx.fillStyle='#ffaa44'; ctx.font='20px monospace';
    ctx.fillText(`${Math.ceil(p.downTimer)}s to death`,W/2,H/2+8);
    ctx.fillStyle='#ccc'; ctx.font='13px monospace';
    ctx.fillText('Teammate must walk up and press F',W/2,H/2+38);
    const ratio=p.downTimer/REVIVE_TIME;
    ctx.strokeStyle='#ff4444'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.arc(W/2,H/2-80,36,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio);
    ctx.stroke(); ctx.lineWidth=1; ctx.textAlign='left';
  }

  _drawDeadScreen(ctx,W,H){
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';
    ctx.fillStyle='#c03030'; ctx.font='bold 44px monospace';
    ctx.fillText('YOU DIED',W/2,H/2-16);
    ctx.fillStyle='#666'; ctx.font='14px monospace';
    ctx.fillText('Respawning...',W/2,H/2+18);
    ctx.textAlign='left';
  }

  // ── Click / hover handlers ────────────────────────────────────────────────────
  handleClick(ex,ey,game,myPid,sendAction,isRightClick=false){
    if(this._drag) return false;
    if(this.showPause){
      for(const r of this._pauseRects){
        if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){
          if(r.action==='resume'){ this.showPause=false; sendAction({type:'unpause'}); }
          else if(r.action==='save'){ sendAction({type:'save'}); this.notify('Game saved!','#7dc832'); this.showSaveAnim(); }
          else if(r.action==='quit'){ window.location.reload(); }
          return true;
        }
      }
      return true;
    }
    // Crafting station tabs
    if(this.showCraft){
      const stations=[null,'workbench','furnace'];
      const tabW=90;
      // Find panel position
      const pw=580, px=window.innerWidth/2-pw/2, py=window.innerHeight/2-Math.min(560,window.innerHeight-60)/2;
      for(let i=0;i<stations.length;i++){
        const tx2=px+10+i*(tabW+4), ty2=py+34;
        if(ex>=tx2&&ex<=tx2+tabW&&ey>=ty2&&ey<=ty2+20){
          this.craftStation=stations[i]; return true;
        }
      }
      for(const r of this.craftRects){
        if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){
          sendAction({type:'craft',recipeIdx:r.idx,station:this.craftStation});
          return true;
        }
      }
    }
    if(this.showInv){
      for(const r of this.invRects){
        if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){
          if(isRightClick){
            // Right-click = use/equip
            if(FOOD_VALUES[r.id]||DRINK_VALUES[r.id]||['medkit','bandage','antibiotics','vitamins'].includes(r.id))
              sendAction({type:'consume',itemId:r.id});
            else if(ARMOUR_DEFENCE[r.id]||r.id==='warm_coat'||r.id==='fur_coat')
              sendAction({type:'equip',slot:this._guessSlot(r.id),itemId:r.id});
          }
          // Left-click is handled by drag (mousedown)
          return true;
        }
      }
    }
    return false;
  }

  handleMouseMove(ex,ey){
    this._hoveredInv=null; this._hoveredCraft=null;
    if(this.showInv){
      for(const r of this.invRects){
        if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){
          this._hoveredInv={id:r.id,x:ex,y:ey}; break;
        }
      }
    }
    if(this.showCraft){
      for(let i=0;i<this.craftRects.length;i++){
        const r=this.craftRects[i];
        if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){ this._hoveredCraft=i; break; }
      }
    }
  }

  _drawDragItem(ctx, W, H){
    if(!this._drag) return;
    const {id, qty} = this._drag;
    const x=this._dragX-23, y=this._dragY-23;
    ctx.globalAlpha=0.85;
    ctx.fillStyle='rgba(20,40,15,0.95)'; ctx.fillRect(x,y,46,46);
    ctx.strokeStyle='#7dc832'; ctx.lineWidth=2; ctx.strokeRect(x,y,46,46); ctx.lineWidth=1;
    const icon=(typeof ITEM_ICONS!=='undefined'&&ITEM_ICONS[id])||'';
    ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='bold 9px monospace';
    ctx.fillText(icon,x+3,y+12);
    let col='#c0d8a0';
    if(WEAPON_DAMAGE[id]) col='#e08060';
    else if(ARMOUR_DEFENCE[id]) col='#6080e0';
    ctx.fillStyle=col; ctx.font='bold 9px monospace';
    ctx.fillText((ITEMS[id]||id).slice(0,7),x+3,y+24);
    ctx.fillStyle='#ffd700'; ctx.font='10px monospace';
    ctx.fillText(qty,x+3,y+40);
    ctx.globalAlpha=1;
  }

  startDrag(id, qty, fromSlot, fromHotbar, sx, sy){
    this._drag={id,qty,fromSlot,fromHotbar};
    this._dragX=sx; this._dragY=sy;
  }

  updateDrag(x, y){ this._dragX=x; this._dragY=y; }

  endDrag(ex, ey, p, sendAction){
    if(!this._drag) return;
    const {id, qty, fromSlot, fromHotbar} = this._drag;
    this._drag=null;

    // Check if dropped on armour slot
    for(const r of (this.armourRects||[])){
      if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){
        if(ARMOUR_DEFENCE[id]){
          sendAction({type:'equip',slot:r.slot,itemId:id});
          return;
        }
      }
    }
    // Check if dropped on hotbar slot
    const sw=54, n=9, total=sw*n;
    const ox=window.innerWidth/2-total/2, oy=window.innerHeight-66;
    for(let i=0;i<n;i++){
      const sx2=ox+i*sw;
      if(ex>=sx2&&ex<=sx2+sw&&ey>=oy&&ey<=oy+54){
        // Swap hotbar slot
        const oldItem=this.hotbar[i];
        this.hotbar[i]=id;
        if(fromHotbar!==undefined) this.hotbar[fromHotbar]=oldItem;
        return;
      }
    }
    // Check if dropped on inventory slot (swap)
    for(const r of this.invRects){
      if(ex>=r.x&&ex<=r.x+r.w&&ey>=r.y&&ey<=r.y+r.h){
        // Items are in inventory — just reorder visually (server handles actual inventory)
        return;
      }
    }
    // Dropped outside — drop item on ground
    sendAction({type:'drop',itemId:id,qty:1});
  }

  _drawDeathWaypoint(ctx,p,renderer,W,H){
    const [sx,sy]=renderer.w2s(p.lastDeathX+0.5,p.lastDeathY+0.5);
    // If on screen, draw skull marker
    if(sx>0&&sx<W&&sy>0&&sy<H){
      ctx.fillStyle='rgba(200,50,50,0.9)'; ctx.font='bold 16px monospace'; ctx.textAlign='center';
      ctx.fillText('☠',sx,sy);
      ctx.fillStyle='rgba(200,50,50,0.7)'; ctx.font='9px monospace';
      ctx.fillText('DEATH',sx,sy+14);
      ctx.textAlign='left';
    } else {
      // Off screen — draw arrow pointing toward it
      const dx=sx-W/2, dy=sy-H/2;
      const angle=Math.atan2(dy,dx);
      const margin=40;
      const ax=W/2+Math.cos(angle)*(W/2-margin);
      const ay=H/2+Math.sin(angle)*(H/2-margin);
      ctx.save();
      ctx.translate(ax,ay); ctx.rotate(angle);
      ctx.fillStyle='rgba(200,50,50,0.8)';
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-8,-7); ctx.lineTo(-8,7); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle='rgba(200,50,50,0.8)'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
      const dist=Math.hypot(p.lastDeathX-p.x,p.lastDeathY-p.y);
      ctx.fillText(`☠ ${dist.toFixed(0)}m`,ax,ay-14);
      ctx.textAlign='left';
    }
  }

  _guessSlot(id){
    if(id.includes('helmet')) return 'helmet';
    if(id.includes('chest')||id.includes('coat')||id==='warm_coat'||id==='fur_coat') return 'chest';
    if(id.includes('legs')) return 'legs';
    // Check armour warmth for coats
    if(ARMOUR_WARMTH&&ARMOUR_WARMTH[id]) return 'chest';
    return 'legs';
  }

  // ── Loot animation ────────────────────────────────────────────────────────────
  showLootAnim(wx, wy, renderer){
    if(!renderer) return;
    const [sx,sy]=renderer.w2s(wx+0.5,wy+0.5);
    this._lootAnims.push({x:sx,y:sy,timer:1.5,text:'LOOTED!'});
  }

  showSaveAnim(){
    this._saveAnim=2.5;
  }

  _drawLootAnims(ctx,W,H,renderer){
    ctx.font='bold 13px monospace'; ctx.textAlign='center';
    for(const a of this._lootAnims){
      const alpha=Math.min(1,a.timer*2);
      ctx.globalAlpha=alpha;
      // Chest opening effect
      ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(a.x-40,a.y-16,80,18);
      ctx.fillStyle='#ffd700';
      ctx.fillText(a.text,a.x,a.y);
      // Sparkle particles
      const t=Date.now()/200;
      for(let i=0;i<4;i++){
        const px2=a.x+Math.cos(t+i*1.57)*20*alpha;
        const py2=a.y+Math.sin(t+i*1.57)*12*alpha-10;
        ctx.fillStyle='#ffd700';
        ctx.beginPath(); ctx.arc(px2,py2,2,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha=1; ctx.textAlign='left';
  }

  _drawSaveAnim(ctx,W,H,timer){
    const alpha=Math.min(1,timer*1.5);
    ctx.globalAlpha=alpha;
    // Top-right save indicator
    const tw=160, th=36, tx=W-tw-12, ty=12;
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(tx,ty,tw,th);
    ctx.strokeStyle='rgba(125,200,50,0.6)'; ctx.strokeRect(tx,ty,tw,th);
    ctx.fillStyle='#7dc832'; ctx.font='bold 12px monospace'; ctx.textAlign='center';
    ctx.fillText('💾 GAME SAVED',tx+tw/2,ty+th/2+5);
    ctx.textAlign='left'; ctx.globalAlpha=1;
  }

  _drawInfectionMeter(ctx,p,W,H){
    const pct=(p.infection||0)/INFECTION_MAX;
    const bw=160, bh=12, ox=8;
    const iy=H-90;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(ox,iy,bw,bh);
    // Colour: green→yellow→red
    const col=pct<0.5?`rgb(${(pct*2*200)|0},200,0)`:`rgb(200,${((1-pct)*2*200)|0},0)`;
    ctx.fillStyle=col; ctx.fillRect(ox,iy,bw*pct,bh);
    ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.lineWidth=1.5; ctx.strokeRect(ox,iy,bw,bh); ctx.lineWidth=1;
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.font='9px monospace';
    ctx.fillText(`INFECTION ${Math.ceil(p.infection||0)}%`,ox+3,iy+bh-2);
    // Warning at high levels
    if(pct>=0.75){
      const pulse=0.5+0.5*Math.sin(Date.now()/200);
      ctx.fillStyle=`rgba(255,50,50,${pulse*0.3})`; ctx.fillRect(0,0,W,H);
      ctx.fillStyle=`rgba(255,50,50,${pulse})`; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText('INFECTION CRITICAL',W/2,H/2-100); ctx.textAlign='left';
    }
    if(pct>=1.0&&(p.infectionDeathTimer||0)>0){
      ctx.fillStyle='#ff0000'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
      ctx.fillText(`TURNING IN ${Math.ceil(p.infectionDeathTimer)}s`,W/2,H/2-80);
      ctx.textAlign='left';
    }
  }
}
