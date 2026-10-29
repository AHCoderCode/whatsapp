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
  let incomingPollTimer=null,incomingPollBusy=false,incomingPollUser="",incomingPollVisibilityHandler=null,incomingPollLastErrorAt=0;
  let callTimer=null, ringTimer=null, callSetupTimer=null, callPushReminderTimer=null, callStart=0, elapsed=0, muted=false, cameraOff=false, speakerOn=true, busy=false;
  let pendingNotificationAction=null, acceptRequested=false;
const RINGTONE_DB_NAME="whatsapp-local-ringtones",RINGTONE_STORE_NAME="media";
  let ringtoneAudio=null,ringtoneObjectUrl="",ringtoneRequestId=0,ringtoneWanted=false,ringtoneStartPromise=null,previewRingtoneTimer=null,builtInRingtoneBlob=null;
  let ringtoneAudioContext=null,ringtoneGain=null,ringtoneCompressor=null,ringtoneSource=null;
  function openRingtoneDatabase(){return new Promise((resolve,reject)=>{if(!("indexedDB" in window)){reject(new Error("This browser cannot save a custom ringtone."));return;}const request=indexedDB.open(RINGTONE_DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(RINGTONE_STORE_NAME))request.result.createObjectStore(RINGTONE_STORE_NAME);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("Could not open local ringtone storage."));request.onblocked=()=>reject(new Error("Ringtone storage is busy. Close other WhatsApp tabs and retry."));});}
  async function getSavedRingtone(){const database=await openRingtoneDatabase();return new Promise((resolve,reject)=>{const request=database.transaction(RINGTONE_STORE_NAME,"readonly").objectStore(RINGTONE_STORE_NAME).get("custom");request.onsuccess=()=>{const result=request.result||null;database.close();resolve(result);};request.onerror=()=>{const error=request.error||new Error("Could not load the saved ringtone.");database.close();reject(error);};});}
  async function setCustomRingtone(file){if(!file||typeof file.size!=="number")throw new Error("Choose an MP3 audio file first.");if(!/\.mp3$/i.test(String(file.name||"")))throw new Error("Select an .mp3 file for your ringtone.");if(file.size<1024||file.size>10*1024*1024)throw new Error("Choose an MP3 between 1 KB and 10 MB.");stopIncomingRingtone();const database=await openRingtoneDatabase();await new Promise((resolve,reject)=>{const transaction=database.transaction(RINGTONE_STORE_NAME,"readwrite");transaction.objectStore(RINGTONE_STORE_NAME).put({blob:file,name:String(file.name),type:file.type||"audio/mpeg",savedAt:Date.now()},"custom");transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error||new Error("Could not save this ringtone on the device."));transaction.onabort=()=>reject(transaction.error||new Error("Saving the ringtone was cancelled."));}).finally(()=>database.close());try{localStorage.setItem("wa_call_ringtone_name",String(file.name));}catch(_){}return getRingtoneInfo();}
  async function resetRingtone(){stopIncomingRingtone();const database=await openRingtoneDatabase();await new Promise((resolve,reject)=>{const transaction=database.transaction(RINGTONE_STORE_NAME,"readwrite");transaction.objectStore(RINGTONE_STORE_NAME).delete("custom");transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error||new Error("Could not reset the ringtone."));transaction.onabort=()=>reject(transaction.error||new Error("Resetting the ringtone was cancelled."));}).finally(()=>database.close());try{localStorage.removeItem("wa_call_ringtone_name");}catch(_){}return getRingtoneInfo();}
  function getRingtoneInfo(){let name="Built-in loud ringtone";try{name=localStorage.getItem("wa_call_ringtone_name")||name;}catch(_){}return{name,custom:name!=="Built-in loud ringtone",volume:getRingtoneVolume()};}
  function getRingtoneVolume(){try{const value=Number(localStorage.getItem("wa_call_ringtone_volume"));return Number.isFinite(value)&&value>=25&&value<=300?value:300;}catch(_){return 300;}}
  function setRingtoneVolume(value){const volume=Math.max(25,Math.min(300,Number(value)||300));try{localStorage.setItem("wa_call_ringtone_volume",String(volume));}catch(_){}if(ringtoneGain)ringtoneGain.gain.value=volume/100;else if(ringtoneAudio)ringtoneAudio.volume=1;return volume;}
  function closeRingtoneAudioGraph(){
    // Disconnect the ringtone graph but keep the AudioContext alive. A browser
    // unlock obtained from an ordinary user tap should remain available for the
    // next incoming call instead of being discarded after every ring.
    try{if(ringtoneSource)ringtoneSource.disconnect();if(ringtoneGain)ringtoneGain.disconnect();if(ringtoneCompressor)ringtoneCompressor.disconnect();}catch(_){}
    ringtoneGain=null;ringtoneCompressor=null;ringtoneSource=null;
  }
  function createBuiltInRingtone(){if(builtInRingtoneBlob)return builtInRingtoneBlob;const sampleRate=22050,duration=3.2,sampleCount=Math.floor(sampleRate*duration),dataLength=sampleCount*2,buffer=new ArrayBuffer(44+dataLength),view=new DataView(buffer);const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};write(0,"RIFF");view.setUint32(4,36+dataLength,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,dataLength,true);for(let i=0;i<sampleCount;i++){const t=i/sampleRate,phase=t%duration,pulseStart=phase<0.46?0:phase>=0.66&&phase<1.12?0.66:-1;let sample=0;if(pulseStart>=0){const edge=phase-pulseStart,envelope=Math.max(0,Math.min(1,edge/0.018,(0.46-edge)/0.018));sample=(Math.sin(2*Math.PI*440*t)*0.46+Math.sin(2*Math.PI*480*t)*0.46)*envelope*0.94;}view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);}builtInRingtoneBlob=new Blob([buffer],{type:"audio/wav"});return builtInRingtoneBlob;}
  async function attemptRingtonePlayback(blob,token){
    const url=URL.createObjectURL(blob),audio=new Audio(url);
    audio.loop=true;audio.preload="auto";audio.volume=1;ringtoneAudio=audio;ringtoneObjectUrl=url;
    try{
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(AudioContextClass){
        let context=ringtoneAudioContext;
        if(!context||context.state==="closed"){context=new AudioContextClass();ringtoneAudioContext=context;}
        const source=context.createMediaElementSource(audio),gain=context.createGain(),compressor=context.createDynamicsCompressor();
        gain.gain.value=getRingtoneVolume()/100;compressor.threshold.value=-6;compressor.knee.value=6;compressor.ratio.value=12;compressor.attack.value=0.003;compressor.release.value=0.22;
        source.connect(gain);gain.connect(compressor);compressor.connect(context.destination);
        ringtoneSource=source;ringtoneGain=gain;ringtoneCompressor=compressor;
        if(context.state!=="running")await context.resume();
      }
      await audio.play();
      if(token!==ringtoneRequestId)return false;
      return true;
    }catch(_){
      closeRingtoneAudioGraph();
      if(ringtoneAudio===audio)ringtoneAudio=null;
      if(ringtoneObjectUrl===url)ringtoneObjectUrl="";
      try{audio.pause();audio.removeAttribute("src");audio.load();}catch(_){}
      URL.revokeObjectURL(url);
      return false;
    }
  }
  async function startIncomingRingtone(options={}){if(ringtoneAudio&&!ringtoneAudio.paused)return true;if(ringtoneStartPromise)return ringtoneStartPromise;const token=++ringtoneRequestId;ringtoneWanted=true;ringtoneStartPromise=(async()=>{let saved=null;try{saved=await getSavedRingtone();}catch(error){console.warn("Could not read custom ringtone:",error&&error.message||error);}if(token!==ringtoneRequestId||(!options.preview&&(!activeCall||phase!=="incoming")))return false;if(saved&&saved.blob){if(await attemptRingtonePlayback(saved.blob,token)){ringtoneWanted=false;return true;}if(token!==ringtoneRequestId)return false;}const played=await attemptRingtonePlayback(createBuiltInRingtone(),token);if(token===ringtoneRequestId)ringtoneWanted=!played;return played;})().finally(()=>{if(token===ringtoneRequestId)ringtoneStartPromise=null;});return ringtoneStartPromise;}
  function stopIncomingRingtone(){ringtoneRequestId++;ringtoneWanted=false;ringtoneStartPromise=null;if(previewRingtoneTimer!==null)clearTimeout(previewRingtoneTimer);previewRingtoneTimer=null;const audio=ringtoneAudio,url=ringtoneObjectUrl;ringtoneAudio=null;ringtoneObjectUrl="";closeRingtoneAudioGraph();if(audio){try{audio.pause();audio.removeAttribute("src");audio.load();}catch(_){}}if(url){try{URL.revokeObjectURL(url);}catch(_){}}}
  async function previewRingtone(){if(phase==="incoming")return startIncomingRingtone();stopIncomingRingtone();const played=await startIncomingRingtone({preview:true});if(played)previewRingtoneTimer=setTimeout(()=>{previewRingtoneTimer=null;if(phase==="idle")stopIncomingRingtone();},7000);return played;}
  function primeCallAudio(){
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    try{
      if(!ringtoneAudioContext||ringtoneAudioContext.state==="closed")ringtoneAudioContext=new AudioContextClass();
      if(ringtoneAudioContext.state!=="running")void ringtoneAudioContext.resume().catch(()=>{});
    }catch(_){}
  }
  document.addEventListener("pointerdown",()=>{primeCallAudio();if(phase==="incoming"&&ringtoneWanted)void startIncomingRingtone();},true);
  document.addEventListener("keydown",primeCallAudio,true);
  try{
    const params=new URLSearchParams(window.location.search);
    if(params.get("waPushKind")==="call"&&params.get("waCallId")){
      pendingNotificationAction={kind:"call",callId:String(params.get("waCallId")),action:params.get("waPushAction")||"open"};
      params.delete("waPushKind");params.delete("waCallId");params.delete("waPushAction");
      history.replaceState(history.state,"",location.pathname+(params.toString()?"?"+params.toString():"")+location.hash);
    }
  }catch(_){}
  async function notifyIncomingCall(call,peer){
    const settings=bridge.getSettings?.()||{};
    if(!call||!peer||settings.callNotifications===false||typeof Notification==="undefined"||Notification.permission!=="granted")return;
    if(document.visibilityState==="visible"&&document.hasFocus())return;
    const tag="wa-call-"+String(call.id);
    const video=call.media_type==="video";
    const title="Incoming call · "+(peer.name||peer.username||"Contact");
    const options={body:(video?"Incoming video call":"Incoming voice call")+" · Answer or decline to respond",icon:"/icon-192.svg",badge:"/icon-192.svg",tag,renotify:false,requireInteraction:true,silent:false,vibrate:[1200,350,1200,350,1600],data:{kind:"call",callId:String(call.id),chatId:String(call.caller_id),url:"/?waCallId="+encodeURIComponent(String(call.id))},actions:[{action:"accept",title:"Accept"},{action:"decline",title:"Decline"}]};
    // A Web Push subscription does not prove that the push has already reached
    // this device. When Realtime delivers the call while this page is hidden,
    // show a same-tag fallback unless the service worker already displayed it.
    // This closes the gap where an existing subscription suppressed the only
    // in-page fallback even though the OS notification had not appeared yet.
    if("serviceWorker" in navigator){
      void navigator.serviceWorker.ready.then(async registration=>{
        try{
          if(typeof registration.getNotifications==="function"){
            const existing=await registration.getNotifications({tag});
            if(existing.length)return;
          }
        }catch(_){}
        await registration.showNotification(title,options);
      }).catch(error=>console.warn("[calls] Local background call-alert fallback failed:",error&&error.message||error));
    }else try{new Notification(title,options);}catch(_){}
  }
  function runPendingNotificationAction(){
    const pending=pendingNotificationAction;
    if(!pending||pending.kind!=="call"||!activeCall||activeCall.direction!=="incoming")return;
    if(pending.callId&&String(pending.callId)!==String(activeCall.id))return;
    if(pending.action==="accept"){
      if(phase!=="incoming")return;
      // A native Accept tap may arrive before the caller's offer has reached
      // Supabase/WebView. Keep the real call screen visible while we recover it.
      if(!incomingOffer){
        acceptRequested=true;
        renderCallOverlay("Waiting for the caller to connect…");
        return;
      }
      pendingNotificationAction=null;
      void acceptCall();
      return;
    }
    if(pending.action==="decline"){
      pendingNotificationAction=null;void declineCall(false);return;
    }
    if(pending.action==="open")pendingNotificationAction=null;
  }
  function handleNotificationAction(data){
    if(!data)return;
    if(data.kind==="call-ended"){
      if(activeCall&&(!data.callId||String(activeCall.id)===String(data.callId))){
        const wasOutgoing=activeCall.direction==="outgoing";
        cleanupLocal();
        if(wasOutgoing&&data.callStatus==="rejected")say("The other person declined the call.");
        else if(wasOutgoing)say("The call has ended.");
      }
      return;
    }
    if(data.kind!=="call")return;
    pendingNotificationAction={kind:"call",callId:String(data.callId||""),action:data.action||"open"};
    runPendingNotificationAction();
  }
  async function showIncomingCallRecord(row){
    const current=me(),client=db();
    if(!current||!client||!row||row.callee_id!==current.id||row.status!=="ringing"||row.group_call_id||activeCall)return;
    let peer=(appState()?.chats||[]).find(person=>String(person.id)===String(row.caller_id));
    if(!peer){
      try{const result=await client.from("aeroshell_profiles").select("id,username,display_name,avatar_data").eq("id",row.caller_id).maybeSingle();const p=result.data;if(p)peer={id:p.id,username:p.username,name:p.display_name||p.username,avatarData:p.avatar_data||""};}catch(_){}
    }
    if(activeCall)return;
    peer=peer||{id:row.caller_id,username:"contact",name:"Contact"};
    activeCall=Object.assign({},row,{direction:"incoming",peer});
    incomingOffer=null;phase="incoming";void startIncomingRingtone();renderCallOverlay();runPendingNotificationAction();
    try{if(navigator.vibrate)navigator.vibrate([180,80,180]);}catch(_){}
    ringTimer=null; // Wait for accept/decline or a caller-ended event.
  }
  function mediaPermissionError(error,video){
    const name=String(error&&error.name||"");
    if(name==="NotReadableError"||name==="AbortError"){
      return new Error("Could not start the microphone audio source. Another app may be using the microphone, or Android could not open the audio input. Close other calling/recording apps, allow WhatsApp microphone access in system settings, and try again.");
    }
    if(name==="NotAllowedError"||name==="SecurityError"){
      return new Error("Microphone"+(video?" / camera":"")+" access was denied. Allow the permission for WhatsApp in browser or Android app settings, then try the call again.");
    }
    if(name==="NotFoundError"){
      return new Error("No available "+(video?"microphone or camera":"microphone")+" was found. Check the device and try again.");
    }
    if(name==="OverconstrainedError"){
      return new Error("This device rejected the requested microphone or camera settings. Try closing other media apps and start the call again.");
    }
    if(name==="NotSupportedError"){
      return new Error("Secure calling requires a current browser or the WhatsApp Android app, with microphone permission over HTTPS.");
    }
    return new Error(String(error&&error.message||"Could not start the microphone or camera."));
  }
  const userMedia = async video => {
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==="undefined")throw new Error("This browser cannot make secure calls. Use an up-to-date browser over HTTPS.");
    const videoConstraints=video?{facingMode:"user",width:{ideal:1280},height:{ideal:720}}:false;
    try{
      return await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
        video:videoConstraints
      });
    }catch(error){
      const name=String(error&&error.name||"");
      if(!["NotReadableError","AbortError","OverconstrainedError"].includes(name))throw mediaPermissionError(error,video);
      // Some Android/WebView audio stacks reject enhancement constraints even
      // when the microphone is available. Retry once with browser defaults.
      try{
        return await navigator.mediaDevices.getUserMedia({audio:true,video:video?{facingMode:"user"}:false});
      }catch(fallbackError){
        throw mediaPermissionError(fallbackError&&fallbackError.name?fallbackError:error,video);
      }
    }
  };
  function beginNativeCallAudioSession(){try{if(window.WhatsAppNativeAndroid&&window.WhatsAppNativeAndroid.beginCallAudio)window.WhatsAppNativeAndroid.beginCallAudio();}catch(error){console.warn("[calls] Native audio setup failed:",error&&error.message||error);}}
  function setNativeCallSpeaker(enabled){try{if(window.WhatsAppNativeAndroid&&window.WhatsAppNativeAndroid.setCallSpeaker)window.WhatsAppNativeAndroid.setCallSpeaker(!!enabled);}catch(_){}}
  function endNativeCallAudioSession(){try{if(window.WhatsAppNativeAndroid&&window.WhatsAppNativeAndroid.endCallAudio)window.WhatsAppNativeAndroid.endCallAudio();}catch(_){}}
  async function userMediaWithTimeout(video,ms=20000){
    let timedOut=false,timer=null;
    const request=userMedia(video).then(stream=>{if(timedOut){stream.getTracks().forEach(track=>track.stop());return null;}return stream;});
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error("Microphone or camera permission took too long. Allow it in browser settings, then start the call again."));},ms);});
    try{const stream=await Promise.race([request,timeout]);if(!stream)throw new Error("The media permission request expired. Start the call again.");return stream;}
    finally{if(timer!==null)clearTimeout(timer);}
  }
  function withCallTimeout(promise,ms,message){
    let timer=null;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);});
    return Promise.race([Promise.resolve(promise),timeout]).finally(()=>{if(timer!==null)clearTimeout(timer);});
  }
  const callPeer = call => call&&call.peer?call.peer:call;
  function clearTimers(){
    if(ringTimer!==null)clearTimeout(ringTimer);
    if(callTimer!==null)clearInterval(callTimer);
    if(callSetupTimer!==null)clearTimeout(callSetupTimer);
    if(callPushReminderTimer!==null)clearInterval(callPushReminderTimer);
    ringTimer=null;callTimer=null;callSetupTimer=null;callPushReminderTimer=null;
  }
  function startCallPushReminders(callId,client){
    if(callPushReminderTimer!==null)clearInterval(callPushReminderTimer);
    const expectedId=String(callId);
    let requestRunning=false;
    callPushReminderTimer=setInterval(async()=>{
      const call=activeCall;
      if(!call||call.direction!=="outgoing"||String(call.id)!==expectedId||call.status!=="ringing"||phase==="connected"||phase==="connecting"||phase==="idle"){
        if(callPushReminderTimer!==null)clearInterval(callPushReminderTimer);
        callPushReminderTimer=null;
        return;
      }
      if(requestRunning)return;
      requestRunning=true;
      try{
        const {data,error}=await client.functions.invoke("whatsapp-push",{body:{action:"notify-call",callId:expectedId}});
        if(error)console.warn("Repeated call alert could not be sent:",error.message||error);
        if(data&&(data.reason==="call-not-active"||(Number(data.sent||0)===0&&Number(data.failed||0)===0&&Number(data.stale||0)===0&&!data.reason))){
          if(callPushReminderTimer!==null)clearInterval(callPushReminderTimer);
          callPushReminderTimer=null;
        }
      }catch(error){console.warn("Repeated call alert request failed:",error&&error.message||error);}
      finally{requestRunning=false;}
    },12000);
  }
  function cleanupLocal() {
    clearTimers();
    acceptRequested=false;
    pendingNotificationAction=null;
    stopIncomingRingtone();
    if(pc){try{pc.ontrack=null;pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close();}catch(_){}}
    pc=null;
    endNativeCallAudioSession();
    if(localStream)localStream.getTracks().forEach(t=>{try{t.stop();}catch(_){}});
    localStream=null;
    if(remoteStream)remoteStream.getTracks().forEach(t=>{try{t.stop();}catch(_){}});
    remoteStream=null;
    activeCall=null;incomingOffer=null;phase="idle";busy=false;muted=false;cameraOff=false;speakerOn=true;elapsed=0;callStart=0;
    pendingSignals.clear();seenSignals.clear();
    root().innerHTML="";
    try{if(window.WhatsAppNativeAndroid&&typeof window.WhatsAppNativeAndroid.finishIncomingCallUi==="function")window.WhatsAppNativeAndroid.finishIncomingCallUi();}catch(_){}
  }
  function formatTime(total){const seconds=Math.max(0,Math.floor(total));return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");}
  function renderCallOverlay(notice) {
    const host=root();
    if(!activeCall){host.innerHTML="";return;}
    const peer=callPeer(activeCall)||{};
    const waitingForOffer=phase==="incoming"&&acceptRequested;
    const incoming=phase==="incoming"&&!acceptRequested, video=activeCall.media_type==="video";
    const status=notice||(waitingForOffer?"Waiting for the caller to connect…":incoming?"Incoming "+(video?"video":"voice")+" call":phase==="outgoing"?"Calling @"+(peer.username||peer.name||"contact")+"…":phase==="connecting"?"Connecting through the secure relay…":phase==="connected"?formatTime(elapsed):"Preparing call…");
    if(incoming){
      const waiting=!incomingOffer;
      if(!activeCall.notificationShown){activeCall.notificationShown=true;void notifyIncomingCall(activeCall,peer);}
      host.innerHTML="<section class='wa-incoming-call-banner' role='alert' aria-label='Incoming "+(video?"video":"voice")+" call'><span class='wa-incoming-call-avatar'>"+esc(peer.avatar||String(peer.name||peer.username||"U").slice(0,2).toUpperCase())+"</span><span class='wa-incoming-call-copy'><strong>"+esc(peer.name||peer.username||"Contact")+"</strong><small>"+(video?"Incoming video call":"Incoming voice call")+(waiting?" · waiting for caller connection":"")+"</small></span><button class='wa-incoming-decline' type='button' data-wa-call='decline' aria-label='Decline call'>Decline</button><button class='wa-incoming-accept' type='button' data-wa-call='accept' aria-label='Accept call'>Accept</button></section>";
      return;
    }
    host.innerHTML="<div class='wa-call-backdrop wa-call-fullscreen'><section class='wa-call-window "+(video?"video-call":"audio-call")+"' role='dialog' aria-modal='true' aria-label='"+(video?"Video call":"Voice call")+"'>"+
      "<header class='wa-call-header'><div class='wa-call-title'><span class='wa-call-status-dot'></span><div><strong>"+esc(peer.name||peer.username||"Contact")+"</strong><small>"+esc(status)+"</small></div></div><button class='wa-call-close' type='button' data-wa-call='end' aria-label='End call'>" + bridge.icon("x") + "</button></header>"+
      (video?"<div class='wa-call-stage'><video class='wa-call-remote-video' id='wa-call-remote-video' autoplay playsinline></video><div class='wa-call-video-placeholder' id='wa-call-video-placeholder'><div class='wa-call-avatar'>"+esc(peer.avatar||String(peer.name||peer.username||"U").slice(0,2).toUpperCase())+"</div><strong>"+esc(peer.name||peer.username||"Contact")+"</strong><span>"+esc(phase==="incoming"?"Incoming video call":phase==="connected"?"Waiting for video…":"Waiting for video…")+"</span></div><video class='wa-call-local-video' id='wa-call-local-video' autoplay muted playsinline></video></div>":
      "<div class='wa-call-audio-stage'><div class='wa-call-avatar'>"+esc(peer.avatar||String(peer.name||peer.username||"U").slice(0,2).toUpperCase())+"</div><h2>"+esc(peer.name||peer.username||"Contact")+"</h2><p>"+esc(status)+"</p><audio id='wa-call-remote-audio' autoplay playsinline></audio></div>")+
      "<div class='wa-call-security'><span>" + bridge.icon("lock") + "</span> WebRTC media · Relay-only connection</div>"+
      "<div class='wa-call-controls'>"+
      (waitingForOffer?"<button class='wa-call-control decline' type='button' data-wa-call='decline' aria-label='Cancel call acceptance'>" + bridge.icon("phone") + "<span>Cancel</span></button>":
      incoming?"<button class='wa-call-control decline' type='button' data-wa-call='decline' aria-label='Decline call'>" + bridge.icon("phone") + "<span>Decline</span></button><button class='wa-call-control accept' type='button' data-wa-call='accept' aria-label='Accept call'>"+(video?bridge.icon("video"):bridge.icon("phone"))+"<span>Accept</span></button>":
      (phase==="connected"||phase==="connecting"||phase==="outgoing"||phase==="preparing"?
      "<button class='wa-call-control "+(muted?"active":"")+"' type='button' data-wa-call='mute' aria-label='Toggle microphone'>"+bridge.icon("mic")+"<span>"+(muted?"Unmute":"Mute")+"</span></button>"+
      (video?"<button class='wa-call-control "+(cameraOff?"active":"")+"' type='button' data-wa-call='camera' aria-label='Toggle camera'>"+bridge.icon("video")+"<span>"+(cameraOff?"Camera on":"Camera off")+"</span></button>":"<button class='wa-call-control "+(speakerOn?"active":"")+"' type='button' data-wa-call='speaker' aria-label='Toggle speaker volume'>"+bridge.icon("volume")+"<span>"+(speakerOn?"Speaker":"Lower volume")+"</span></button>")+
      "<button class='wa-call-control decline' type='button' data-wa-call='end' aria-label='End call'>" + bridge.icon("phone") + "<span>End call</span></button>":""))+
      "</div><p class='wa-call-footnote'>Calls connect only when both people are online and have allowed microphone/camera access.</p></section></div>";
    const remoteVideo=$("#wa-call-remote-video"),localVideo=$("#wa-call-local-video"),remoteAudio=$("#wa-call-remote-audio");
    if(remoteStream){
      if(remoteVideo){remoteVideo.srcObject=remoteStream;void remoteVideo.play().catch(()=>{});}
      if(remoteAudio){remoteAudio.srcObject=remoteStream;remoteAudio.volume=speakerOn?1:.45;void remoteAudio.play().catch(()=>{});}
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
    button.innerHTML=(muted?bridge.icon("mute"):bridge.icon("mic"))+"<span>"+(muted?"Unmute":"Mute")+"</span>";
  }
  function updateCameraButton(){
    const button=root().querySelector("[data-wa-call='camera']");
    if(!button)return;
    button.classList.toggle("active",cameraOff);
    button.innerHTML=(cameraOff?bridge.icon("camera"):bridge.icon("video"))+"<span>"+(cameraOff?"Camera on":"Camera off")+"</span>";
  }
  function toggleSpeaker(){
    speakerOn=!speakerOn;
    setNativeCallSpeaker(speakerOn);
    const audio=$("#wa-call-remote-audio");
    if(audio)audio.volume=speakerOn?1:.45;
    const button=root().querySelector("[data-wa-call='speaker']");
    if(button){button.classList.toggle("active",speakerOn);button.innerHTML=bridge.icon("volume")+"<span>"+(speakerOn?"Speaker":"Lower volume")+"</span>";}
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
        if(callSetupTimer!==null)clearTimeout(callSetupTimer);callSetupTimer=null;
        if(ringTimer!==null)clearTimeout(ringTimer);ringTimer=null;
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
      const {data,error}=await client.from("aeroshell_calls").insert({caller_id:current.id,callee_id:person.id,media_type:mediaType}).select("id,caller_id,callee_id,status,created_at,updated_at,media_type,group_call_id").single();
      if(error||!data)throw error||new Error("Could not create the call.");
      newId=data.id;
      if(!activeCall||activeCall.id!==pendingId){
        try{await client.from("aeroshell_calls").update({status:"ended"}).eq("id",newId);}catch(_){}
        return;
      }
      activeCall=Object.assign({},data,{direction:"outgoing",peer:person});
      renderCallOverlay("Calling @"+(person.username||person.name)+"…");
      ringTimer=null; // Keep the call active until either side ends it.
      // Complete the server-side push before media permission can fail and
      // end the call row. This is the alert path used while the recipient is
      // using another app, where page audio is not reliable.
      try{
        const pushResult=await withCallTimeout(
          client.functions.invoke("whatsapp-push",{body:{action:"notify-call",callId:newId}}),
          6000,
          "Background call alert dispatch timed out."
        );
        if(pushResult.error)throw pushResult.error;
        const delivery=pushResult.data||{};
        const subscriptions=Number(delivery.subscriptions||0);
        const sent=Number(delivery.sent||0);
        const failed=Number(delivery.failed||0);
        if(sent<1){
          const reason=subscriptions<1
            ?"no enabled call-alert subscription"
            :"the push provider did not confirm delivery";
          // A background-alert delivery warning is not a call/media failure.
          // Keep call setup running and avoid showing a misleading error toast.
          console.warn("Background call alert was not confirmed; continuing call setup:",reason,delivery);
        }else if(failed>0){
          console.warn("Some background call alerts failed:",delivery);
        }
      }catch(pushError){
        console.warn("Initial background call alert dispatch failed:",pushError&&pushError.message||pushError);
        // Push delivery can be delayed while a screen is off; keep trying without converting it into a call error.
      }
      if(!activeCall||activeCall.id!==newId)return;
      startCallPushReminders(newId,client);
      beginNativeCallAudioSession();
      const grantedStream=await userMediaWithTimeout(mediaType==="video",20000);
      if(!activeCall||activeCall.id!==newId){grantedStream.getTracks().forEach(track=>track.stop());return;}
      localStream=grantedStream;
      setPhase("preparing","Preparing the secure relay…");
      const servers=await withCallTimeout(relayServers(data.id),12000,"Secure relay setup timed out. Check the TURN configuration and connection, then try again.");
      if(!activeCall||activeCall.id!==newId)return;
      setPhase("preparing","Starting the audio connection…");
      makePeer(activeCall,servers);
      const offer=await withCallTimeout(pc.createOffer(),8000,"The call offer could not be created. Try again.");
      await withCallTimeout(pc.setLocalDescription(offer),8000,"The local call description timed out. Try again.");
      if(!activeCall||activeCall.id!==newId)return;
      await withCallTimeout(sendSignal(activeCall,"offer",{type:"offer",sdp:pc.localDescription.sdp}),8000,"The call offer could not be delivered. Check the connection and try again.");
      if(activeCall&&activeCall.id===newId)setPhase("outgoing","Calling @"+(person.username||person.name)+"…");
    }catch(error){
      const wasCancelled=!activeCall||(newId?activeCall.id!==newId:activeCall.id!==pendingId);
      if(newId)try{
        const {error:endedError}=await client.from("aeroshell_calls").update({status:"ended"}).eq("id",newId);
        if(!endedError)void notifyCallEnded({id:newId},client);
      }catch(_){}
      cleanupLocal();
      if(!wasCancelled)say(error instanceof Error?error.message:"Call could not start.");
    }finally{busy=false;}
  }
  async function receiveSignal(signal){
    const current=me(),client=db();
    if(!current||!current.isSupabase||!signal||!client||signal.to_user_id!==current.id||seenSignals.has(signal.id))return;
    seenSignals.add(signal.id);
    if(activeCall&&activeCall.id===signal.call_id&&activeCall.direction==="incoming"&&signal.kind==="offer"){
      incomingOffer=signal;void startIncomingRingtone();renderCallOverlay();runPendingNotificationAction();return;
    }
    if(!activeCall||activeCall.id!==signal.call_id){
      if(signal.kind==="offer"){
        const {data,error}=await client.from("aeroshell_calls").select("id,caller_id,callee_id,status,created_at,media_type,group_call_id").eq("id",signal.call_id).eq("callee_id",current.id).eq("status","ringing").maybeSingle();
        if(error||!data||data.group_call_id)return;
        if(activeCall)return;
        const profileResult=await client.from("aeroshell_profiles").select("id,username,display_name,avatar_data").eq("id",data.caller_id).maybeSingle();
        const peer=profileResult.data||{id:data.caller_id,username:"contact"};
        activeCall=Object.assign({},data,{direction:"incoming",peer:{id:peer.id,username:peer.username,name:peer.display_name||peer.username,avatarData:peer.avatar_data||""}});
        incomingOffer=signal;phase="incoming";void startIncomingRingtone();renderCallOverlay();runPendingNotificationAction();
        ringTimer=null; // Keep incoming audio looping until answered or ended.
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
    if(!incomingOffer){
      pendingNotificationAction={kind:"call",callId:String(activeCall.id),action:"accept"};
      acceptRequested=true;
      renderCallOverlay("Waiting for the caller to connect…");
      return;
    }
    acceptRequested=false;
    stopIncomingRingtone();
    const current=me(),client=db(),call=activeCall;busy=true;
    if(ringTimer!==null)clearTimeout(ringTimer);ringTimer=null;
    callSetupTimer=setTimeout(()=>{if(activeCall&&activeCall.id===call.id&&phase!=="connected")void endCall("Call setup timed out. Check microphone permission, relay and internet, then try again.");},40000);
    try{
      setPhase("preparing","Requesting microphone permission…");
      beginNativeCallAudioSession();
      const grantedStream=await userMediaWithTimeout(call.media_type==="video",20000);
      if(!activeCall||activeCall.id!==call.id){grantedStream.getTracks().forEach(track=>track.stop());return;}
      localStream=grantedStream;
      setPhase("preparing","Preparing the secure relay…");
      const servers=await withCallTimeout(relayServers(call.id),12000,"Secure relay setup timed out. Check TURN configuration and connection, then try again.");
      if(!activeCall||activeCall.id!==call.id){localStream.getTracks().forEach(track=>track.stop());localStream=null;return;}
      setPhase("preparing","Joining the audio connection…");
      makePeer(call,servers);
      const offer=incomingOffer&&incomingOffer.payload&&incomingOffer.payload.sdp;
      if(!offer)throw new Error("The caller's offer is missing. Decline and ask them to call again.");
      await withCallTimeout(pc.setRemoteDescription({type:"offer",sdp:offer}),8000,"The caller's connection offer timed out. Ask them to call again.");
      if(!activeCall||activeCall.id!==call.id)return;
      await withCallTimeout(flushCandidates(),8000,"The relay candidates could not be prepared in time.");
      const {data,error}=await withCallTimeout(client.from("aeroshell_calls").update({status:"accepted"}).eq("id",call.id).eq("callee_id",current.id).eq("status","ringing").select("id,status").maybeSingle(),8000,"The server did not accept the call in time.");
      if(error||!data)throw new Error("This call is no longer available.");
      if(!activeCall||activeCall.id!==call.id)return;
      const answer=await withCallTimeout(pc.createAnswer(),8000,"The call answer could not be created.");
      await withCallTimeout(pc.setLocalDescription(answer),8000,"The local call description timed out.");
      if(!activeCall||activeCall.id!==call.id)return;
      await withCallTimeout(sendSignal(call,"answer",{type:"answer",sdp:pc.localDescription.sdp}),8000,"The call answer could not be delivered. Check the connection and try again.");
      setPhase("connecting","Connecting through the secure relay…");
    }catch(error){
      try{
        const {error:endedError}=await client.from("aeroshell_calls").update({status:activeCall&&activeCall.status==="accepted"?"ended":"rejected"}).eq("id",call.id).in("status",["ringing","accepted"]);
        if(!endedError)void notifyCallEnded(call,client);
      }catch(_){}
      cleanupLocal();say(error instanceof Error?error.message:"Could not accept this call.");
    }
    finally{busy=false;}
  }
  async function notifyCallEnded(call,client=db()){
    if(!call||!call.id||!client||String(call.id).startsWith("pending-"))return;
    try{
      const {error}=await client.functions.invoke("whatsapp-push",{body:{action:"notify-call-ended",callId:String(call.id)}});
      if(error)console.warn("[calls] End-of-call push could not be sent:",error.message||error);
    }catch(error){console.warn("[calls] End-of-call push request failed:",error&&error.message||error);}
  }
  async function declineCall(expired){
    const call=activeCall,client=db();let changed=false;
    if(call&&client)try{
      const {error}=await client.from("aeroshell_calls").update({status:"rejected"}).eq("id",call.id).eq("status","ringing");
      changed=!error;
    }catch(_){}
    if(changed)void notifyCallEnded(call,client);
    cleanupLocal();if(!expired)say("Call declined.");
  }
  async function endCall(message){
    const call=activeCall,client=db(),current=me();busy=true;let changed=false;
    if(call&&client&&current)try{
      const {error}=await client.from("aeroshell_calls").update({status:"ended"}).eq("id",call.id).in("status",["ringing","accepted"]);
      changed=!error;
    }catch(_){}
    if(changed)void notifyCallEnded(call,client);
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

  async function recoverIncomingOffer(callId,userId,client){
    const {data,error}=await client.from("aeroshell_call_signals")
      .select("id,call_id,from_user_id,to_user_id,kind,payload,created_at")
      .eq("call_id",callId).eq("to_user_id",userId).eq("kind","offer")
      .order("created_at",{ascending:true}).limit(1);
    if(!error&&data&&data[0])await receiveSignal(data[0]);
  }
  async function pollIncomingCallState(){
    const current=me(),client=db();
    if(!current||!current.isSupabase||!client||document.visibilityState==="hidden"||incomingPollBusy)return;
    incomingPollBusy=true;
    try{
      if(activeCall&&String(activeCall.id).startsWith("pending-"))return;
      if(activeCall){
        const tracked=activeCall;
        const {data:row,error}=await client.from("aeroshell_calls")
          .select("id,caller_id,callee_id,status,created_at,media_type,group_call_id")
          .eq("id",tracked.id).maybeSingle();
        if(error){
          if(Date.now()-incomingPollLastErrorAt>15000){console.warn("[calls] Could not reconcile call status:",error.message||error);incomingPollLastErrorAt=Date.now();}
          return;
        }
        if(!row)return;
        if(row.status==="rejected"||row.status==="ended"){
          const direction=tracked.direction;
          cleanupLocal();
          if(direction==="outgoing"&&row.status==="rejected")say("The other person declined the call.");
          else if(row.status==="ended")say("The call has ended.");
          return;
        }
        tracked.status=row.status;
        if(row.status==="accepted"&&tracked.direction==="outgoing"&&phase==="outgoing")setPhase("connecting","Connecting through the secure relay…");
        if(tracked.direction==="incoming"&&phase==="incoming"&&!incomingOffer)await recoverIncomingOffer(tracked.id,current.id,client);
        return;
      }
      const {data:rows,error}=await client.from("aeroshell_calls")
        .select("id,caller_id,callee_id,status,created_at,media_type,group_call_id")
        .eq("callee_id",current.id).eq("status","ringing").is("group_call_id",null)
        .order("created_at",{ascending:false}).limit(1);
      if(error){
        if(Date.now()-incomingPollLastErrorAt>15000){console.warn("[calls] Could not check incoming calls:",error.message||error);incomingPollLastErrorAt=Date.now();}
        return;
      }
      const row=rows&&rows[0];
      if(!row)return;
      await showIncomingCallRecord(row);
      if(activeCall&&activeCall.direction==="incoming"&&String(activeCall.id)===String(row.id)&&phase==="incoming"&&!incomingOffer){
        await recoverIncomingOffer(row.id,current.id,client);
      }
    }catch(error){
      if(Date.now()-incomingPollLastErrorAt>15000){console.warn("[calls] Incoming-call recovery failed:",error&&error.message||error);incomingPollLastErrorAt=Date.now();}
    }finally{incomingPollBusy=false;}
  }
  function ensureIncomingCallPolling(userId){
    const next=String(userId||"");
    if(!next)return;
    if(incomingPollTimer!==null&&incomingPollUser===next)return;
    if(incomingPollTimer!==null)clearInterval(incomingPollTimer);
    incomingPollUser=next;
    void pollIncomingCallState();
    // Realtime is the low-latency path; this foreground poll is the recovery
    // path for missed inserts or reconnect windows, not the only call transport.
    incomingPollTimer=setInterval(()=>void pollIncomingCallState(),2000);
    if(!incomingPollVisibilityHandler){
      incomingPollVisibilityHandler=()=>{if(document.visibilityState==="visible")void pollIncomingCallState();};
      document.addEventListener("visibilitychange",incomingPollVisibilityHandler);
      window.addEventListener("online",incomingPollVisibilityHandler);
    }
  }
  function stopIncomingCallPolling(){
    if(incomingPollTimer!==null)clearInterval(incomingPollTimer);
    incomingPollTimer=null;incomingPollUser="";
    if(incomingPollVisibilityHandler){
      document.removeEventListener("visibilitychange",incomingPollVisibilityHandler);
      window.removeEventListener("online",incomingPollVisibilityHandler);
      incomingPollVisibilityHandler=null;
    }
  }
  function subscribe(){
    const current=me(),client=db();if(!current||!current.isSupabase||!client)return;
    ensureIncomingCallPolling(current.id);
    if(callChannel&&channelUser===current.id)return;
    if(callChannel)void client.removeChannel(callChannel);
    channelUser=current.id;
    callChannel=client.channel("wa-calls-"+current.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_calls",filter:"callee_id=eq."+current.id},event=>void showIncomingCallRecord(event.new))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_call_signals",filter:"to_user_id=eq."+current.id},event=>void receiveSignal(event.new).catch(error=>say(error instanceof Error?error.message:"Call signaling failed.")))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"aeroshell_calls"},event=>{
        const row=event.new;if(!activeCall||row.id!==activeCall.id)return;
        activeCall.status=row.status;
        if(row.status==="rejected"||row.status==="ended"){const who=activeCall.direction;cleanupLocal();if(who==="outgoing"&&row.status==="rejected")say("The other person declined the call.");else if(row.status==="ended")say("The call has ended.");}
        else if(row.status==="accepted"&&activeCall.direction==="outgoing"&&phase==="outgoing")setPhase("connecting","Connecting through the secure relay…");
      }).subscribe((status,error)=>{
        if(status==="SUBSCRIBED")console.info("[calls] Live call events connected.");
        else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED")console.warn("[calls] Realtime call events unavailable; foreground recovery remains active.",status,error&&error.message||"");
      });
    // First recover the exact call selected by the native Accept/Decline action.
    // Do not rely only on the newest five ringing calls: the target may be older
    // if another incoming call was created at almost the same time.
    void (async()=>{
      const pending=pendingNotificationAction;
      if(pending&&pending.kind==="call"&&pending.callId){
        const {data:target,error:targetError}=await client.from("aeroshell_calls")
          .select("id,caller_id,callee_id,status,created_at,media_type,group_call_id")
          .eq("id",pending.callId).eq("callee_id",current.id).maybeSingle();
        if(!targetError&&target&&!target.group_call_id&&target.status==="ringing"){
          if(!activeCall)await showIncomingCallRecord(target);
          const {data:targetOffers}=await client.from("aeroshell_call_signals")
            .select("id,call_id,from_user_id,to_user_id,kind,payload,created_at")
            .eq("call_id",target.id).eq("to_user_id",current.id).eq("kind","offer")
            .order("created_at",{ascending:true}).limit(1);
          if(targetOffers&&targetOffers[0])await receiveSignal(targetOffers[0]);
          if(activeCall&&String(activeCall.id)===String(target.id))runPendingNotificationAction();
          return;
        }
        if(!targetError&&target&&target.status!=="ringing"){
          pendingNotificationAction=null;
          acceptRequested=false;
          say("This call is no longer available.");
        }
      }
      // Also recover offers that arrived while this device was offline.
      const {data,error}=await client.from("aeroshell_calls").select("id,caller_id,callee_id,status,created_at,media_type,group_call_id").eq("callee_id",current.id).eq("status","ringing").order("created_at",{ascending:false}).limit(5);
      if(error||!data)return;
      for(const call of data){
        if(call.group_call_id)continue;
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
      else if(callAction==="speaker")toggleSpeaker();
    }
  },true);
  window.WhatsAppCalls={
    subscribe,
    setCustomRingtone,
    resetRingtone,
    previewRingtone,
    getRingtoneInfo,
    setRingtoneVolume,
    start:(person,type)=>startCall(person,type==="video"?"video":"audio"),
    openPicker,
    accept:()=>acceptCall(),
    decline:()=>declineCall(false),
    handleNotificationAction,
    cleanup:()=>{cleanupLocal();stopIncomingCallPolling();if(callChannel&&db())void db().removeChannel(callChannel);callChannel=null;channelUser="";},
    getPhase:()=>phase
  };
})();