// ── Seeded noise ──────────────────────────────────────────────────────────────
function hashNoise(x, y, seed) {
  let n = (x * 1619 + y * 31337 + seed * 1013904223) | 0;
  n = Math.imul(n ^ (n >>> 13), 1664525) + 1013904223 | 0;
  return ((n & 0x7FFFFFFF) / 0x7FFFFFFF);
}
function smooth(t){ return t*t*(3-2*t); }
function smoothNoise(x, y, seed){
  const ix=Math.floor(x), iy=Math.floor(y);
  const fx=smooth(x-ix), fy=smooth(y-iy);
  const a=hashNoise(ix,  iy,  seed), b=hashNoise(ix+1,iy,  seed);
  const c=hashNoise(ix,  iy+1,seed), d=hashNoise(ix+1,iy+1,seed);
  return a+(b-a)*fx+(c-a)*fy+(d-b-c+a)*fx*fy;
}
function octaveNoise(x, y, seed, octaves=4, persistence=0.5, scale=0.05){
  let total=0, amp=1, maxV=0, freq=scale;
  for(let i=0;i<octaves;i++){
    total+=smoothNoise(x*freq,y*freq,seed)*amp;
    maxV+=amp; amp*=persistence; freq*=2;
  }
  return total/maxV;
}

// ── Seeded RNG (mulberry32) ───────────────────────────────────────────────────
function makeRng(seed){
  let s = seed >>> 0;
  return function(){
    s += 0x6D2B79F5; s |= 0;
    let t = Math.imul(s ^ s>>>15, 1 | s);
    t = t + Math.imul(t ^ t>>>7, 61 | t) ^ t;
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
}
function rngInt(rng, min, max){ return Math.floor(rng()*(max-min+1))+min; }
function rngChoice(rng, arr){ return arr[Math.floor(rng()*arr.length)]; }
function rngWeighted(rng, choices, weights){
  const total=weights.reduce((a,b)=>a+b,0);
  let r=rng()*total;
  for(let i=0;i<choices.length;i++){ r-=weights[i]; if(r<=0) return choices[i]; }
  return choices[choices.length-1];
}
