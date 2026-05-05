// ── Weather system ────────────────────────────────────────────────────────────
const DAY_LENGTH   = 1200; // seconds
const SEASON_DAYS  = 7;
const SEASONS      = ['spring','summer','autumn','winter'];

const SEASON_WEATHER = {
  spring:{clear:30,cloudy:25,rain:30,storm:10,fog:5},
  summer:{clear:45,cloudy:20,rain:15,storm:10,heatwave:10},
  autumn:{clear:20,cloudy:30,rain:30,storm:15,fog:5},
  winter:{clear:20,cloudy:25,snow:35,blizzard:15,fog:5},
};
const SEASON_BASE_TEMP = {spring:15,summer:28,autumn:12,winter:-3};

class WeatherSystem {
  constructor(seed=0){
    this.rng=makeRng(seed^0xBEEF);
    this.timeOfDay=DAY_LENGTH*0.45; this.dayNumber=0; this.seasonIdx=0;
    this.weather=W.CLEAR; this.weatherTimer=0;
    this.ambientTemp=20; this.windSpeed=0; this.windDir=0;
    this._pickNext();
  }
  tick(dt){
    this.timeOfDay+=dt; this.weatherTimer-=dt;
    if(this.timeOfDay>=DAY_LENGTH){
      this.timeOfDay-=DAY_LENGTH; this.dayNumber++;
      this.seasonIdx=Math.floor((this.dayNumber%( SEASON_DAYS*4))/SEASON_DAYS);
    }
    if(this.weatherTimer<=0) this._pickNext();
    this._updateTemp(); this._updateWind(dt);
  }
  _pickNext(){
    const s=SEASONS[this.seasonIdx%4];
    const pool=SEASON_WEATHER[s];
    const keys=Object.keys(pool), wts=Object.values(pool);
    this.weather=rngWeighted(this.rng,keys,wts);
    const [mn,mx]=WEATHER_DURATION[this.weather]||[120,400];
    this.weatherTimer=mn+this.rng()*(mx-mn);
  }
  _updateTemp(){
    const s=SEASONS[this.seasonIdx%4];
    const base=SEASON_BASE_TEMP[s];
    const phase=Math.sin(2*Math.PI*this.timeOfDay/DAY_LENGTH-Math.PI/2);
    this.ambientTemp=base+phase*8+(WEATHER_TEMP_MOD[this.weather]||0);
  }
  _updateWind(dt){
    this.windDir+=( this.rng()-0.5)*0.05*dt;
    const target=[W.STORM,W.BLIZZARD].includes(this.weather)?0.8:
                 [W.RAIN,W.SNOW].includes(this.weather)?0.4:0.15;
    this.windSpeed+=(target-this.windSpeed)*0.01;
  }
  get isDaytime(){ return this.timeOfDay>DAY_LENGTH*0.25&&this.timeOfDay<DAY_LENGTH*0.75; }
  get season(){ return SEASONS[this.seasonIdx%4]; }
  get isRaining(){ return this.weather===W.RAIN||this.weather===W.STORM; }
  get isSnowing(){ return this.weather===W.SNOW||this.weather===W.BLIZZARD; }
  get visibility(){
    if(this.weather===W.BLIZZARD) return 0.25;
    if(this.weather===W.FOG)      return 0.35;
    if(this.weather===W.STORM)    return 0.55;
    if(!this.isDaytime)           return 0.5;
    return 1.0;
  }
  playerTempEffect(player, biome){
    const biomeBase={plains:20,forest:18,desert:38,tundra:-5,swamp:22,city:20,
                     dense_forest:17,jungle:28};
    const biomeTemp = biomeBase[biome] || 20;
    // Effective environment temperature
    let env = this.ambientTemp + (biomeTemp - 20) * 0.2;
    if(player.wet && this.weather !== W.HEATWAVE) env -= 6;

    // Body temp equilibrates toward env, but VERY slowly in comfortable range
    // Human body maintains 37°C — only extreme cold/heat matters
    const diff = env - 37; // how far env is from comfortable body temp

    let rate;
    if(env >= 10 && env <= 35){
      // Comfortable range — body temp slowly returns to 37
      rate = (37 - player.bodyTemp) * 0.015;
    } else if(env < 10){
      // Cold — body temp drops toward env
      const coldFactor = Math.max(0.005, (10 - env) * 0.003);
      rate = (env - player.bodyTemp) * coldFactor;
    } else {
      // Hot — body temp rises slowly
      rate = (env - player.bodyTemp) * 0.008;
    }

    // Warmth from clothing/fire counteracts cold
    const warmth = player.totalWarmth();
    if(env < 10) rate += warmth * 0.04;

    return rate;
  }
  toJSON(){
    return {timeOfDay:this.timeOfDay,dayNumber:this.dayNumber,season:this.season,
      weather:this.weather,ambientTemp:+this.ambientTemp.toFixed(1),
      windSpeed:+this.windSpeed.toFixed(2),isDaytime:this.isDaytime,
      visibility:+this.visibility.toFixed(2)};
  }
  fromJSON(d){
    this.timeOfDay=d.timeOfDay||0; this.dayNumber=d.dayNumber||0;
    this.weather=d.weather||W.CLEAR; this.ambientTemp=d.ambientTemp||20;
    this.windSpeed=d.windSpeed||0;
  }
}
