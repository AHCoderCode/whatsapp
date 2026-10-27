(() => {
  "use strict";
  const bridge = window.waAppBridge;
  if (!bridge) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const db = () => bridge.supabase;
  const me = () => bridge.getCurrentUser();
  const say = message => bridge.toast(message);
  const esc = value => bridge.escapeHTML(String(value == null ? "" : value));
  const root = () => {
    let element=$("#call-overlay-root");
    if(!element){element=document.createElement("div");element.id="call-overlay-root";document.body.appendChild(element);}
    return element;
  };
  let activeCall=null, phase="idle", pc=null, localStream=null, remoteStream=null;
  let incomingOffer=null, callChannel=null, channelUser="", pendingSignals=new Map(), seenSignals=new Set();
  let callTimer=null, ringTimer=null, callStart=0, elapsed=0, muted=false, cameraOff=false, busy=false;
  const userMedia = async video => {
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==="undefined")throw new Error("This browser cannot make secure calls. Use an up-to-date browser over HTTPS.");
    return navigator.mediaDevices.getUserMedia({audio:true,video:video?{facingMode:"user",width:{ideal:1280},height:{ideal:720}}:false});
  };
  const callPeer = call => call&&call.peer?call.peer:call;
  function clearTimers(){if(ringTimer!==null)clearTimeout(ringTimer);if(callTimer!==null)clearInterval(callTimer);ringTimer=null;callTimer=null;}
  function cleanupLocal() {
    clearTimers();
    if(pc){try{pc.ontrack=null;pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close();}catch(_){}}
    pc=null;
    if(localStream)localStream.getTracks().forEach(t=>{try{t.stop();}catch(_){}});
    localStream=null;
    if(remoteStream)remoteStream.getTracks().forEach(t=>{try{t.stop();}catch(_){}});
    remoteStream=null;
    activeCall=null;incomingOffer=null;phase="idle";busy=false;muted=false;cameraOff=false;elapsed=0;callStart=0;
    pendingSignals.clear();seenSignals.clear();
    root().innerHTML="";
  }
  function formatTime(total){const seconds=Math.max(0,Math.floor(total));return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");}
  function renderCallOverlay(notice) {
    const host=root();
    if(!activeCall){host.innerHTML="";return;}
    const peer=callPeer(activeCall)||{};
    const incoming=phase==="incoming", video=activeCall.media_type==="video";
    const status=notice||(incoming?"Incoming "+(video?"video":"voice")+" call":phase==="outgoing"?"Calling @"+(peer.username||peer.name||"contact")+"…":phase==="connecting"?"Connecting through the secure relay…":phase==="connected"?formatTime(elapsed):"Preparing call…");
    host.innerHTML="<div class='wa-call-backdrop wa-call-fullscreen'><section class='wa-call-window "+(video?"video-call":"audio-call")+"' role='dialog' aria-modal='true' aria-label='"+(video?"Video call":"Voice call")+"'>"+
      "<header class='wa-call-header'><div class='wa-call-title'><span class='wa-call-status-dot'></span><div><strong>"+esc(peer.name||peer.username||"Contact")+"</strong><small>"+esc(status)+"</small></div></div><button class='wa-call-close' type='button' data-wa-call='end' aria-label='End call'>" + bridge.icon("x") + "</button></header>"+
      (video?"<div class='wa-call-stage'><video class='wa-call-remote-video' id='wa-call-remote-video' autoplay playsinline></video><div class='wa-call-video-placeholder' id='wa-call-video-placeholder'><div class='wa-call-avatar'>"+esc(peer.avatar||String(peer.name||peer.username||"U").slice(0,2).toUpperCase())+"</div><strong>"+esc(peer.name||peer.username||"Contact")+"</strong><span>"+esc(phase==="incoming"?"Incoming video call":phase==="connected"?"Waiting for video…":"Waiting for video…")+"</span></div><video class='wa-call-local-video' id='wa-call-local-video' autoplay muted playsinline></video></div>":
      "<div class='wa-call-audio-stage'><div class='wa-call-avatar'>"+esc(peer.avatar||String(peer.name||peer.username||"U").slice(0,2).toUpperCase())+"</div><h2>"+esc(peer.name||peer.username||"Contact")+"</h2><p>"+esc(status)+"</p><audio id='wa-call-remote-audio' autoplay playsinline></audio></div>")+
      "<div class='wa-call-security'><span>" + bridge.icon("lock") + "</span> WebRTC media · Relay-only connection</div>"+
      "<div class='wa-call-controls'>"+
      (incoming?"<button class='wa-call-control decline' type='button' data-wa-call='decline' aria-label='Decline call'>" + bridge.icon("phone") + "<span>Decline</span></button><button class='wa-call-control accept' type='button' data-wa-call='accept' aria-label='Accept call'>"+(video?bridge.icon("video"):bridge.icon("phone"))+"<span>Accept</span></button>":
      (phase==="connected"||phase==="connecting"||phase==="outgoing"||phase==="preparing"?
      "<button class='wa-call-control "+(muted?"active":"")+"' type='button' data-wa-call='mute' aria-label='Toggle microphone'>"+bridge.icon("mic")+"<span>"+(muted?"Unmute":"Mute")+"</span></button>"+
      (video?"<button class='wa-call-control "+(cameraOff?"active":"")+"' type='button' data-wa-call='camera' aria-label='Toggle camera'>"+bridge.icon("video")+"<span>"+(cameraOff?"Camera on":"Camera off")+"</span></button>":"")+
      "<button class='wa-call-control decline' type='button' data-wa-call='end' aria-label='End call'>" + bridge.icon("phone") + "<span>End call</span></button>":""))+
      "</div><p class='wa-call-footnote'>Calls connect only when both people are online and have allowed microphone/camera access.</p></section></div>";
    const remoteVideo=$("#wa-call-remote-video"),localVideo=$("#wa-call-local-video"),remoteAudio=$("#wa-call-remote-audio");
    if(remoteStream){
      if(remoteVideo){remoteVideo.srcObject=remoteStream;void remoteVideo.play().catch(()=>{});}
      if(remoteAudio){remoteAudio.srcObject=remoteStream;remoteAudio.volume=.95;void remoteAudio.play().catch(()=>{});}
    }
    if(localVideo&&localStream){localVideo.srcObject=localStream;void localVideo.play().catch(()=>{});}
    const placeholder=$("#wa-call-video-placeholder");
    if(placeholder&&remoteStream&&remoteStream.getVideoTracks().some(t=>t.readyState==="live"))placeholder.style.display="none";
  }
  function setPhase(next,notice){phase=next;renderCallOverlay(notice);}
  function updateConnectedDuration(){
    const text=formatTime(elapsed),host=root();
    const header=host.querySelector(".wa-call-title small");
    if(header&&phase==="connected")header.textContent=text;
    const stage=host.querySelector(".wa-call-audio-stage p");
    if(stage&&phase==="connected")stage.textContent=text;
  }
  function updateMuteButton(){
    const button=root().querySelector("[data-wa-call='mute']");
    if(!button)return;
    button.classList.toggle("active",muted);
    button.innerHTML=bridge.icon("mic")+"<span>"+(muted?"Unmute":"Mute")+"</span>";
  }
  function updateCameraButton(){
    const button=root().querySelector("[data-wa-call='camera']");
    if(!button)return;
    button.classList.toggle("active",cameraOff);
    button.innerHTML=bridge.icon("video")+"<span>"+(cameraOff?"Camera on":"Camera off")+"</span>";
  }
  async function relayServers(callId){
    const client=db();if(!client)throw new Error("Supabase is not connected.");
    const {data,error}=await client.functions.invoke("master-chat-turn-credentials",{body:{callId}});
    if(error){
      const context=error.context;let body={};
      if(context instanceof Response){try{body=await context.clone().json();}catch(_){}}
      if(body.error==="private_relay_not_configured")throw new Error("Secure calling is not configured yet. Complete the TURN relay steps in README.md.");
      if(body.error==="rate_limited")throw new Error("Too many relay requests. Wait one minute and try again.");
      if(body.error==="call_expired"||body.error==="call_not_active"||body.error==="call_not_found_or_forbidden")throw new Error("This call expired. Start a new call.");
      throw new Error("The secure calling relay did not respond. Check the Metered TURN secrets in Supabase.");
    }
    const servers=Array.isArray(data?.iceServers)?data.iceServers:[];
    const allowed=servers.flatMap(server=>{
      const values=Array.isArray(server.urls)?server.urls:[server.urls];
      const urls=values.filter(url=>typeof url==="string"&&/^turns?:[a-z0-9.-]+\.relay\.metered\.ca:\d+(?:\?transport=(?:tcp|udp))?$/i.test(url.trim()));
      if(!urls.length||typeof server.username!=="string"||!server.username||typeof server.credential!=="string"||!server.credential)return[];
      return[{urls:urls.length===1?urls[0]:urls,username:server.username,credential:server.credential}];
    });
    if(!allowed.length)throw new Error("The relay returned no valid TURN credentials. Check METERED_TURN_DOMAIN and METERED_TURN_API_KEY.");
    return allowed;
  }
  async function sendSignal(call,kind,payload) {
    const client=db(),current=me();if(!client||!current)throw new Error("Sign in before calling.");
    const peer=call.caller_id===current.id?call.callee_id:call.caller_id;
    const {error}=await client.from("aeroshell_call_signals").insert({call_id:call.id,from_user_id:current.id,to_user_id:peer,kind,payload});
    if(error)throw new Error("Call setup signal was rejected by the server.");
  }
  async function flushCandidates() {
    if(!pc||!pc.remoteDescription)return;
    const queue=pendingSignals.get(activeCall.id)||[];
    for(const item of queue.filter(s=>s.kind==="ice")){
      const candidate=item.payload&&item.payload.candidate;
      if(candidate&&typeof candidate.candidate==="string")try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(_){}
    }
    pendingSignals.delete(activeCall.id);
  }
  function makePeer(call,servers) {
    const client=db(),current=me(),peer=call.caller_id===current.id?call.callee_id:call.caller_id;
    pc=new RTCPeerConnection({iceServers:servers,iceTransportPolicy:"relay",iceCandidatePoolSize:0});
    remoteStream=new MediaStream();
    pc.ontrack=event=>{
      const streams=event.streams&&event.streams[0];
      if(streams){remoteStream=streams;renderCallOverlay();}
      else {remoteStream.addTrack(event.track);renderCallOverlay();}
    };
    pc.onicecandidate=event=>{
      if(!event.candidate||!activeCall||!client)return;
      void client.from("aeroshell_call_signals").insert({call_id:call.id,from_user_id:current.id,to_user_id:peer,kind:"ice",payload:{candidate:event.candidate.toJSON()}})
        .then(({error})=>{if(error&&activeCall&&activeCall.id===call.id)say("A network candidate could not be delivered. Check the internet connection.");});
    };
    pc.onconnectionstatechange=()=>{
      if(!pc||!activeCall)return;
      if(pc.connectionState==="connected"){
        callStart=Date.now();setPhase("connected");
        if(callTimer!==null)clearInterval(callTimer);
        callTimer=setInterval(()=>{if(phase==="connected"){elapsed=Math.floor((Date.now()-callStart)/1000);updateConnectedDuration();}},1000);
      }else if(pc.connectionState==="failed"||pc.connectionState==="disconnected"){
        setPhase("connecting","The call relay is reconnecting…");
        if(pc.connectionState==="failed")void endCall("The secure relay connection failed. No direct-connection fallback was attempted.");
      }
    };
    if(localStream)localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
    return pc;
  }
  async function startCall(person,mediaType) {
    const current=me(),client=db();
    if(!current||!current.isSupabase)return say("Sign in with a Supabase account before calling.");
    if(!client)return say("Supabase is not connected.");
    if(busy||activeCall)return say("Finish the current call before starting another.");
    if(!person||!person.id||person.id===current.id)return say("Choose a valid contact.");
    if(person.type==="group"||person.groupId)return say("Group calls are not included in this one-to-one calling build yet.");
    busy=true;activeCall={id:"pending-"+Date.now(),caller_id:current.id,callee_id:person.id,media_type:mediaType,direction:"outgoing",peer:person};setPhase("preparing","Requesting "+(mediaType==="video"?"camera and microphone":"microphone")+" permission…");
    const pendingId=activeCall.id;
    let newId="";
    try{
      const grantedStream=await userMedia(mediaType==="video");
      if(!activeCall||activeCall.id!==pendingId){grantedStream.getTracks().forEach(track=>track.stop());return;}
      localStream=grantedStream;
      const {data,error}=await client.from("aeroshell_calls").insert({caller_id:current.id,callee_id:person.id,media_type:mediaType}).select("id,caller_id,callee_id,status,created_at,updated_at,media_type,group_call_id").single();
      if(error||!data)throw error||new Error("Could not create the call.");
      newId=data.id;
      if(!activeCall||activeCall.id!==pendingId){
        try{await client.from("aeroshell_calls").update({status:"ended"}).eq("id",newId);}catch(_){}
        if(localStream){localStream.getTracks().forEach(track=>track.stop());localStream=null;}
        return;
      }
      activeCall=Object.assign({},data,{direction:"outgoing",peer:person});
      renderCallOverlay("Calling @"+(person.username||person.name)+"…");
      ringTimer=setTimeout(()=>{if(activeCall&&activeCall.id===newId&&phase!=="connected")void endCall("No answer. Call ended after 45 seconds.");},45000);
      const servers=await relayServers(data.id);
      if(!activeCall||activeCall.id!==newId)return;
      makePeer(activeCall,servers);
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      if(!activeCall||activeCall.id!==newId)return;
      await sendSignal(activeCall,"offer",{type:"offer",sdp:pc.localDescription.sdp});
      if(activeCall&&activeCall.id===newId)setPhase("outgoing","Calling @"+(person.username||person.name)+"…");
    }catch(error){
      const wasCancelled=!activeCall||activeCall.id!==pendingId||(newId&&activeCall.id!==newId);
      if(newId)try{await client.from("aeroshell_calls").update({status:"ended"}).eq("id",newId);}catch(_){}
      cleanupLocal();
      if(!wasCancelled)say(error instanceof Error?error.message:"Call could not start.");
    }finally{busy=false;}
  }
  async function receiveSignal(signal){
    const current=me(),client=db();
    if(!current||!current.isSupabase||!signal||!client||signal.to_user_id!==current.id||seenSignals.has(signal.id))return;
    seenSignals.add(signal.id);
    if(!activeCall||activeCall.id!==signal.call_id){
      if(signal.kind==="offer"){
        const {data,error}=await client.from("aeroshell_calls").select("id,caller_id,callee_id,status,created_at,media_type,group_call_id").eq("id",signal.call_id).eq("callee_id",current.id).eq("status","ringing").maybeSingle();
        if(error||!data||data.group_call_id)return;
        if(Date.now()-Date.parse(data.created_at)>45000){await client.from("aeroshell_calls").update({status:"rejected"}).eq("id",data.id).eq("status","ringing");return;}
        if(activeCall)return;
        const profileResult=await client.from("aeroshell_profiles").select("id,username,display_name,avatar_data").eq("id",data.caller_id).maybeSingle();
        const peer=profileResult.data||{id:data.caller_id,username:"contact"};
        activeCall=Object.assign({},data,{direction:"incoming",peer:{id:peer.id,username:peer.username,name:peer.display_name||peer.username,avatarData:peer.avatar_data||""}});
        incomingOffer=signal;phase="incoming";renderCallOverlay();
        ringTimer=setTimeout(()=>{if(activeCall&&activeCall.id===data.id&&phase==="incoming")void declineCall(true);},45000);
      }else{
        const list=pendingSignals.get(signal.call_id)||[];list.push(signal);pendingSignals.set(signal.call_id,list);
      }
      return;
    }
    if(signal.kind==="answer"&&activeCall.direction==="outgoing"&&pc){
      const sdp=signal.payload&&signal.payload.sdp;
      if(typeof sdp==="string"&&!pc.remoteDescription&&pc.signalingState==="have-local-offer"){
        await pc.setRemoteDescription({type:"answer",sdp});await flushCandidates();setPhase("connecting");
      }
    }else if(signal.kind==="ice"){
      const candidate=signal.payload&&signal.payload.candidate;
      if(!candidate||typeof candidate.candidate!=="string")return;
      if(pc&&pc.remoteDescription){try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(_){}}
      else{const list=pendingSignals.get(signal.call_id)||[];list.push(signal);pendingSignals.set(signal.call_id,list);}
    }
  }
  async function acceptCall(){
    if(!activeCall||phase!=="incoming"||busy)return;
    const current=me(),client=db(),call=activeCall;busy=true;
    try{
      setPhase("preparing","Requesting permissions…");
      const grantedStream=await userMedia(call.media_type==="video");
      if(!activeCall||activeCall.id!==call.id){grantedStream.getTracks().forEach(track=>track.stop());return;}
      localStream=grantedStream;
      const servers=await relayServers(call.id);
      if(!activeCall||activeCall.id!==call.id){localStream.getTracks().forEach(track=>track.stop());localStream=null;return;}
      makePeer(call,servers);
      const offer=incomingOffer&&incomingOffer.payload&&incomingOffer.payload.sdp;
      if(!offer)throw new Error("The caller's offer is missing. Decline and ask them to call again.");
      await pc.setRemoteDescription({type:"offer",sdp:offer});await flushCandidates();
      const {data,error}=await client.from("aeroshell_calls").update({status:"accepted"}).eq("id",call.id).eq("callee_id",current.id).eq("status","ringing").select("id,status").maybeSingle();
      if(error||!data)throw new Error("This call is no longer available.");
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      await sendSignal(call,"answer",{type:"answer",sdp:pc.localDescription.sdp});
      setPhase("connecting","Connecting through the secure relay…");
    }catch(error){try{await client.from("aeroshell_calls").update({status:activeCall&&activeCall.status==="accepted"?"ended":"rejected"}).eq("id",call.id).in("status",["ringing","accepted"]);}catch(_){}cleanupLocal();say(error instanceof Error?error.message:"Could not accept this call.");}
    finally{busy=false;}
  }
  async function declineCall(expired){
    const call=activeCall,client=db();
    if(call&&client)try{await client.from("aeroshell_calls").update({status:"rejected"}).eq("id",call.id).eq("status","ringing");}catch(_){}
    cleanupLocal();if(!expired)say("Call declined.");
  }
  async function endCall(message){
    const call=activeCall,client=db(),current=me();busy=true;
    if(call&&client&&current)try{await client.from("aeroshell_calls").update({status:"ended"}).eq("id",call.id).in("status",["ringing","accepted"]);}catch(_){}
    cleanupLocal();if(message)say(message);
  }
  function toggleMute(){
    muted=!muted;if(localStream)localStream.getAudioTracks().forEach(t=>t.enabled=!muted);updateMuteButton();
  }
  function toggleCamera(){
    cameraOff=!cameraOff;if(localStream)localStream.getVideoTracks().forEach(t=>t.enabled=!cameraOff);updateCameraButton();
  }
  function openPicker(mediaType){
    const s=appState(),options=(s&&s.chats||[]).filter(p=>p.type==="person").map(person=>"<button class='wa-call-picker-row' type='button' data-wa-call-person='"+esc(person.id)+"'><span class='wa-call-picker-avatar'>"+esc(person.avatar||String(person.name||"U").slice(0,2))+"</span><span><strong>"+esc(person.name||person.username)+"</strong><small>@"+esc(person.username||"")+"</small></span><span>Call</span></button>").join("");
    bridge.openDialog("Start "+(mediaType==="video"?"video":"voice")+" call",options||"<div class='empty-state'>Add a contact first. Call requests only work with accepted contacts.</div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button>");
    const backdrop=$("#dialog-backdrop");if(backdrop)backdrop.dataset.callMediaType=mediaType;
  }
  function subscribe(){
    const current=me(),client=db();if(!current||!current.isSupabase||!client||(callChannel&&channelUser===current.id))return;
    if(callChannel)void client.removeChannel(callChannel);
    channelUser=current.id;
    callChannel=client.channel("wa-calls-"+current.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_call_signals",filter:"to_user_id=eq."+current.id},event=>void receiveSignal(event.new).catch(error=>say(error instanceof Error?error.message:"Call signaling failed.")))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"aeroshell_calls"},event=>{
        const row=event.new;if(!activeCall||row.id!==activeCall.id)return;
        activeCall.status=row.status;
        if(row.status==="rejected"||row.status==="ended"){const who=activeCall.direction;cleanupLocal();if(who==="outgoing"&&row.status==="rejected")say("The other person declined the call.");else if(row.status==="ended")say("The call has ended.");}
        else if(row.status==="accepted"&&activeCall.direction==="outgoing"&&phase==="outgoing")setPhase("connecting","Connecting through the secure relay…");
      }).subscribe();
    // Recover offers that arrived while this device was offline; only a real offer opens the dialog.
    void (async()=>{
      const {data,error}=await client.from("aeroshell_calls").select("id,caller_id,callee_id,status,created_at,media_type,group_call_id").eq("callee_id",current.id).eq("status","ringing").order("created_at",{ascending:false}).limit(5);
      if(error||!data)return;
      for(const call of data){
        if(Date.now()-Date.parse(call.created_at)>45000||call.group_call_id)continue;
        const {data:offerRows}=await client.from("aeroshell_call_signals").select("id,call_id,from_user_id,to_user_id,kind,payload,created_at").eq("call_id",call.id).eq("to_user_id",current.id).eq("kind","offer").limit(1);
        if(offerRows&&offerRows[0])await receiveSignal(offerRows[0]);
      }
    })();
  }
  document.addEventListener("click",event=>{
    const actionEl=event.target.closest("[data-action],[data-menu-action],[data-dialog-action],[data-wa-call],[data-wa-call-person]");
    if(!actionEl)return;
    const action=actionEl.dataset.action||actionEl.dataset.menuAction||"",dialogAction=actionEl.dataset.dialogAction||"",callAction=actionEl.dataset.waCall||"";
    if(["voice-call","video-call","new-voice-call","new-video-call","call-entry"].includes(action)){
      event.preventDefault();event.stopImmediatePropagation();
      const current=me();if(!current||!current.isSupabase){say("Sign in with your Supabase account to call.");return;}
      if(action==="voice-call"||action==="video-call"){
        const person=bridge.getCurrentChat();if(!person||person.type!=="person"){say("Open a person's chat before starting a call.");return;}
        void startCall(person,action==="video-call"?"video":"audio");
      }else if(action==="call-entry"){
        const id=actionEl.dataset.chatId,s=(appState()&&appState().chats)||[],person=s.find(c=>String(c.id)===String(id)&&c.type==="person"),media=actionEl.dataset.mediaType==="video"?"video":"audio";
        if(person)void startCall(person,media);else openPicker(media);
      }else openPicker(action==="new-video-call"?"video":"audio");
      return;
    }
    if(actionEl.dataset.waCallPerson){
      event.preventDefault();event.stopImmediatePropagation();
      const id=actionEl.dataset.waCallPerson,s=appState(),person=(s&&s.chats||[]).find(c=>String(c.id)===String(id)),media=$("#dialog-backdrop")?.dataset.callMediaType==="video"?"video":"audio";
      bridge.closeDialog();if(person)void startCall(person,media);
      return;
    }
    if(dialogAction==="wa-start-call"){
      event.preventDefault();event.stopImmediatePropagation();const media=actionEl.dataset.mediaType==="video"?"video":"audio";openPicker(media);return;
    }
    if(callAction){
      event.preventDefault();event.stopImmediatePropagation();
      if(callAction==="accept")void acceptCall();
      else if(callAction==="decline")void declineCall(false);
      else if(callAction==="end")void endCall();
      else if(callAction==="mute")toggleMute();
      else if(callAction==="camera")toggleCamera();
    }
  },true);
  window.WhatsAppCalls={
    subscribe,
    start:(person,type)=>startCall(person,type==="video"?"video":"audio"),
    openPicker,
    cleanup:()=>{cleanupLocal();if(callChannel&&db())void db().removeChannel(callChannel);callChannel=null;channelUser="";},
    getPhase:()=>phase
  };
})();