// ── Method 2: Ably Realtime networking ───────────────────────────────────────
// Uses Ably pub/sub channels. Free tier = 200 concurrent connections, 6M msgs/mo.
// Get free API key at https://ably.com (no credit card needed for free tier).

class AblyNetwork {
  constructor(isHost, onMsg, onPeerJoin, onPeerLeave){
    this.isHost=isHost; this.onMsg=onMsg;
    this.onPeerJoin=onPeerJoin; this.onPeerLeave=onPeerLeave;
    this.ably=null; this.channel=null;
    this.roomCode=null; this.myId=null;
    this.peers=new Set();
  }

  async init(apiKey, roomCode){
    this.roomCode=roomCode.toUpperCase();
    this.myId='p_'+(Math.random()*1e9|0).toString(36);
    // Ably loaded from CDN
    this.ably=new Ably.Realtime({key:apiKey,clientId:this.myId});
    await new Promise((res,rej)=>{
      this.ably.connection.on('connected',res);
      this.ably.connection.on('failed',rej);
    });
    this.channel=this.ably.channels.get('zs_'+this.roomCode);
    // Subscribe to all messages on this channel
    await this.channel.subscribe(msg=>{
      const data=msg.data;
      const from=msg.clientId;
      if(from===this.myId) return; // ignore own messages
      if(data.type==='join'&&this.isHost){
        this.peers.add(from);
        this.onPeerJoin(from);
      }
      if(data.type==='leave'){
        this.peers.delete(from);
        this.onPeerLeave(from);
      }
      this.onMsg(data, from);
    });
    // Announce presence
    await this.channel.publish({type: this.isHost?'host_ready':'join', pid:this.myId});
    return this.myId;
  }

  // Send to specific peer (uses targeted message with peerId field)
  sendTo(peerId, data){
    this.channel.publish({...data, _to:peerId});
  }

  // Broadcast to all
  broadcast(data, exclude=null){
    this.channel.publish({...data, _exclude:exclude});
  }

  // Client sends to host (host listens for _to===hostId or no _to)
  sendToHost(data){
    this.channel.publish({...data, _toHost:true});
  }

  destroy(){
    if(this.channel) this.channel.publish({type:'leave',pid:this.myId}).catch(()=>{});
    if(this.ably) this.ably.close();
  }
}
