// ── Method 1: PeerJS P2P networking ──────────────────────────────────────────
// Uses PeerJS (loaded from CDN). Host gets a room code, clients connect to it.
// No signup, no server needed. Uses PeerJS free cloud signaling.

class PeerNetwork {
  constructor(isHost, onMsg, onPeerJoin, onPeerLeave){
    this.isHost=isHost; this.onMsg=onMsg;
    this.onPeerJoin=onPeerJoin; this.onPeerLeave=onPeerLeave;
    this.peer=null; this.connections={}; // peerId -> DataConnection
    this.myId=null; this.hostConn=null;
  }

  // Host: create peer with a short room code
  host(roomCode){
    return new Promise((resolve,reject)=>{
      this.peer=new Peer(roomCode.toUpperCase(),{
        host:'0.peerjs.com',port:443,path:'/',secure:true,
        config:{iceServers:[
          {urls:'stun:stun.l.google.com:19302'},
          {urls:'stun:stun1.l.google.com:19302'},
        ]}
      });
      this.peer.on('open',id=>{ this.myId=id; resolve(id); });
      this.peer.on('error',e=>reject(e));
      this.peer.on('connection',conn=>this._onIncoming(conn));
    });
  }

  // Client: connect to host room code
  join(roomCode){
    return new Promise((resolve,reject)=>{
      this.peer=new Peer({
        host:'0.peerjs.com',port:443,path:'/',secure:true,
        config:{iceServers:[
          {urls:'stun:stun.l.google.com:19302'},
          {urls:'stun:stun1.l.google.com:19302'},
        ]}
      });
      this.peer.on('open',id=>{
        this.myId=id;
        const conn=this.peer.connect(roomCode.toUpperCase(),{reliable:true,serialization:'json'});
        conn.on('open',()=>{ this.hostConn=conn; resolve(conn); });
        conn.on('data',d=>this.onMsg(d,'host'));
        conn.on('close',()=>this.onPeerLeave('host'));
        conn.on('error',e=>reject(e));
      });
      this.peer.on('error',e=>reject(e));
    });
  }

  _onIncoming(conn){
    conn.on('open',()=>{
      this.connections[conn.peer]=conn;
      this.onPeerJoin(conn.peer);
      conn.on('data',d=>this.onMsg(d,conn.peer));
      conn.on('close',()=>{ delete this.connections[conn.peer]; this.onPeerLeave(conn.peer); });
    });
  }

  // Send to one peer (host use)
  sendTo(peerId, data){
    const c=this.connections[peerId];
    if(c&&c.open) try{ c.send(data); }catch(e){}
  }

  // Broadcast to all connected peers (host use)
  broadcast(data, exclude=null){
    for(const [id,c] of Object.entries(this.connections)){
      if(id===exclude) continue;
      if(c.open) try{ c.send(data); }catch(e){}
    }
  }

  // Client: send to host
  sendToHost(data){
    if(this.hostConn&&this.hostConn.open) try{ this.hostConn.send(data); }catch(e){}
  }

  destroy(){ if(this.peer) this.peer.destroy(); }
}
