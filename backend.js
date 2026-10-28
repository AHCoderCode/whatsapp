(() => {
  "use strict";
  const bridge = window.waAppBridge;
  if (!bridge) return;
  const SUPABASE_URL = "https://qoyqfmovzvtyvxutakym.supabase.co";
  const SUPABASE_KEY = "sb_publishable_w59xgI2zOLJe2Hmx_PC4MQ_zDQ8g9hp";
  const db = window.supabase && window.supabase.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } }
  }) : null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  // Keep attachment rendering independent of global legacy aliases.
  const esc = value => bridge.escapeHTML(String(value == null ? "" : value));
  const usernamePattern = /^[a-z0-9_]{3,20}$/;
  let signedProfile = null, liveChannel = null, liveUserId = "", people = new Map(), activeChannelId = "";
  let presenceChannel = null, presenceUserId = "";
  let busy = false, loading = false, refreshQueued = false, searchTimer = null, searchCounter = 0;
  let deviceHeartbeatTimer = null, deviceSyncIdentity = "";

  const getUser = () => bridge.getCurrentUser();
  const appState = () => bridge.getState();
  const say = message => bridge.toast(message);
  const safeError = (error, fallback) => {
    const m = String(error && error.message || "");
    if (/invalid login credentials/i.test(m)) return "Username or in-app number or password is incorrect.";
    if (/duplicate key|unique constraint|aeroshell_profiles_username_key|custom_number_uidx/i.test(m)) return "That username or custom app ID is already taken. Choose another.";
    if (/email not confirmed/i.test(m)) return "Email confirmation is enabled. In Supabase Auth, switch OFF Confirm email, then sign up again with a new username.";
    if (/too many username searches|rate_limited|too many requests|429/i.test(m)) return "Too many searches in a short time. Wait a minute, then try again.";
    if (/row-level security|permission denied|not allowed/i.test(m)) return "Supabase rejected that request under its security rules. Check the README backend checklist; do not disable row-level security.";
    return m || fallback || "Something went wrong. Check your connection and try again.";
  };
  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  const canonicalNumber = value => {
    const digits = String(value || "").replace(/\D/g, "");
    const tail = digits.startsWith("990") ? digits.slice(3) : digits;
    return tail.length === 9 ? "+990" + tail : "";
  };
  const formatNumber = value => {
    const canonical = canonicalNumber(value);
    return canonical ? "+990 " + canonical.slice(4,7) + " " + canonical.slice(7,10) + " " + canonical.slice(10,13) : String(value || "");
  };
  const initials = value => String(value || "U").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase() || "U";
  const colorFor = value => (Array.from(String(value || "user")).reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%12)+1;
  function mapProfile(row) {
    if (!row || !row.id) return null;
    const name = String(row.display_name || row.username || "User");
    const person = { id:row.id, backendId:row.id, username:String(row.username||"").toLowerCase(), name,
      phone:formatNumber(row.custom_number||""), about:row.about||"Available", avatarData:row.avatar_data||"",
      avatar:initials(name), initials:initials(name), avatarColor:colorFor(row.username),
      type:"person", messages:[], attachments:[], unread:0, preview:"", time:"", online:false, participants:[] };
    people.set(person.id,person); people.set(person.username,person);
    return person;
  }
  function showError(mode, message) {
    const box = $(mode === "signup" ? "#signup-error" : "#login-error") || $("#auth-error");
    if (box) { box.textContent = message; box.classList.add("show"); }
    else say(message);
  }
  async function usernameFromNumber(value) {
    const number = canonicalNumber(value);
    if (!db || !number) return "";
    const {data,error} = await db.functions.invoke("whatsapp-lookup-identity",{body:{customNumber:number}});
    if (error) throw new Error(error.message || "Custom ID lookup is temporarily unavailable.");
    return data && typeof data.username === "string" ? data.username.toLowerCase() : "";
  }
  async function searchPeople(value) {
    const me=getUser();
    if(!db)throw new Error("The account directory connection did not load. Refresh the app and try again.");
    if(!me||!me.isSupabase)throw new Error("Sign in to a shared WhatsApp account to find people.");
    const query=String(value||"").trim().replace(/^@+/,"").replace(/\s+/g," ").trim().toLowerCase();
    if(query.length<2)return [];
    if(query.length>80)throw new Error("Search text must be 80 characters or fewer.");
    const {data,error}=await db.rpc("whatsapp_find_people",{search_query:query});
    if(error)throw error;
    if(!Array.isArray(data))throw new Error("The account directory returned an unexpected response. Refresh and try again.");
    return data.filter(row=>row&&row.id&&String(row.id)!==String(me.id)).map(row=>mapProfile(row)).filter(Boolean).slice(0,20);
  }

  function localMessage(row, me, chat) {
    const stamp=new Date(row.created_at);
    const body=row.message_type==="voice"?"🎤 Voice message":(row.body||(row.attachment_name?"📎 "+row.attachment_name:""));
    return {id:row.id,from:row.sender_id===me.id?"me":"them",text:body,
      time:stamp.toLocaleTimeString([],{hour:"numeric",minute:"2-digit",hour12:true}),
      date:stamp.toDateString()===new Date().toDateString()?"TODAY":stamp.toDateString()===new Date(Date.now()-86400000).toDateString()?"YESTERDAY":stamp.toLocaleDateString([],{month:"short",day:"numeric",...(stamp.getFullYear()!==new Date().getFullYear()?{year:"numeric"}:{})}),
      createdAt:row.created_at,editedAt:row.edited_at||"",status:"sent",reactions:[],sender:row.sender_id===me.id?"You":(chat&&chat.name)||"Member",
      attachmentType:row.message_type==="voice"?"voice":row.message_type==="file"?"file":null,
      attachmentName:row.attachment_name||"",attachmentPath:row.attachment_path||"",
      attachmentMime:row.attachment_mime||"",attachmentSize:Number(row.attachment_size||0),
      messageType:row.message_type||"text",voiceDurationMs:Number(row.voice_duration_ms||0),
      replyToId:row.reply_to_message_id||null,forwardedFromId:row.forwarded_from_message_id||null,forwarded:!!row.forwarded_from_message_id};
  }
  function normalizePushSettings(settings=appState()?.settings||{}){
    return {
      messageNotifications:!!settings.messageNotifications,
      groupNotifications:!!settings.groupNotifications,
      callNotifications:!!settings.callNotifications
    };
  }
  function vapidKeyToBytes(value){
    const base64=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
    const raw=atob(base64+"=".repeat((4-base64.length%4)%4));
    return Uint8Array.from(raw,character=>character.charCodeAt(0));
  }
  async function enableDevicePush(settings=appState()?.settings||{}){
    const me=getUser();
    if(!db||!me||!me.isSupabase)throw new Error("Sign in with your account before enabling background notifications.");
    if(!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("This browser does not support background push. Browser notifications can still work while the app is connected.");
    const registration=await navigator.serviceWorker.ready;
    const {data:keyData,error:keyError}=await db.functions.invoke("whatsapp-push",{body:{action:"public-key"}});
    if(keyError||!keyData?.publicKey)throw keyError||new Error("The background notification service did not return a public key.");
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidKeyToBytes(keyData.publicKey)});
    const {error}=await db.functions.invoke("whatsapp-push",{
      body:{action:"subscribe",subscription:subscription.toJSON(),settings:normalizePushSettings(settings)}
    });
    if(error)throw error;
    return true;
  }
  async function updateDevicePushPreferences(settings=appState()?.settings||{}){
    if(!db||!("serviceWorker" in navigator)||!("PushManager" in window))return false;
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription)return false;
    const {error}=await db.functions.invoke("whatsapp-push",{
      body:{action:"preferences",endpoint:subscription.endpoint,settings:normalizePushSettings(settings)}
    });
    if(error)throw error;
    return true;
  }
  function dispatchServerPush(action,payload){
    if(!db||!getUser()?.isSupabase)return;
    void db.functions.invoke("whatsapp-push",{body:Object.assign({action},payload||{})})
      .then(({error})=>{if(error)console.warn("Background push request failed:",error.message||error);})
      .catch(error=>console.warn("Background push request failed:",error));
  }
  async function testCallPush(delaySeconds=0){
    const me=getUser();
    if(!db||!me||!me.isSupabase)throw new Error("Sign in before testing background call alerts.");
    const delay=Math.max(0,Math.min(10,Math.floor(Number(delaySeconds)||0)));
    const {data,error}=await db.functions.invoke("whatsapp-push",{body:{action:"test-call-push",delaySeconds:delay}});
    if(error)throw new Error(error.message||"The background call alert test failed.");
    return data||{sent:0,stale:0,failed:0,subscriptions:0};
  }
  async function notifyIncomingMessage(chat,message){
    const settings=appState()?.settings||{};
    if(!chat||!message||chat.muted||typeof Notification==="undefined"||Notification.permission!=="granted")return;
    const key=chat.type==="group"?"groupNotifications":"messageNotifications";
    if(settings[key]===false)return;
    const appIsFocused=document.visibilityState==="visible"&&document.hasFocus();
    if(appIsFocused&&String(bridge.getSelectedChatId?.()||"")===String(chat.id))return;
    // Avoid duplicate background notifications, but preserve alerts for a different foreground chat.
    if(!appIsFocused&&"serviceWorker" in navigator&&"PushManager" in window){
      try{const registration=await navigator.serviceWorker.ready;if(await registration.pushManager.getSubscription())return;}catch(_){}
    }
    const title=chat.type==="group"?(chat.name+" · "+(message.sender||"New message")):(chat.name||"New message");
    const body=String(message.text||(message.attachmentType==="voice"?"🎤 Voice message":message.attachmentName?"📎 "+message.attachmentName:"New attachment")).slice(0,180);
    const options={body,icon:"/icon-192.svg",badge:"/icon-192.svg",tag:"wa-message-"+String(message.id||chat.id),renotify:true,data:{kind:"message",messageId:String(message.id||""),chatId:String(chat.id),url:"/?waChatId="+encodeURIComponent(String(chat.id))}};
    if("serviceWorker" in navigator)void navigator.serviceWorker.ready.then(registration=>registration.showNotification(title,options)).catch(()=>{try{new Notification(title,options);}catch(_){}});
    else try{new Notification(title,options);}catch(_){}
  }
  function insertMessageIntoUI(row) {
    const me=getUser(), s=appState();
    if(!me||!me.isSupabase||!s||!row)return;
    const id=row.group_id||(row.sender_id===me.id?row.recipient_id:row.sender_id);
    let chat=s.chats.find(c=>String(c.id)===String(id));
    if(!chat){void loadData(true);return;}
    if(chat.messages.some(m=>String(m.id)===String(row.id)))return;
    const msg=localMessage(row,me,chat);
    if(msg.from==="them")void notifyIncomingMessage(chat,msg);
    if(msg.replyToId){
      const quoted=chat.messages.find(m=>String(m.id)===String(msg.replyToId));
      if(quoted)msg.replyTo={id:quoted.id,text:quoted.text||quoted.attachmentName||"Attachment",sender:quoted.from==="me"?"You":(quoted.sender||chat.name)};
    }
    chat.messages.push(msg);chat.preview=msg.text;chat.time=msg.time;
    chat.lastOutgoing=msg.from==="me";chat.lastMessageType=row.message_type||"text";
    if(msg.from==="them"&&String(bridge.getSelectedChatId?bridge.getSelectedChatId():"")!==String(chat.id))chat.unread=(chat.unread||0)+1;
    bridge.renderSidebar();
    if(String(bridge.getSelectedChatId?bridge.getSelectedChatId():"")===String(chat.id)){
      bridge.renderMain();requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;});
      if(msg.from==="them")void markReadForChat(chat);
    }
  }
  function refreshPresenceUI(){
    const s=appState();
    if(!s||!Array.isArray(s.chats))return;
    let payloads=[];
    try{payloads=presenceChannel?Object.values(presenceChannel.presenceState()||{}).flat():[];}catch(_){}
    const onlineIds=new Set(payloads.filter(item=>item&&item.user_id&&item.online!==false).map(item=>String(item.user_id)));
    let changed=false;
    for(const chat of s.chats){
      if(chat.type!=="person")continue;
      const next=onlineIds.has(String(chat.id));
      if(!!chat.online!==next){chat.online=next;changed=true;}
    }
    if(changed){
      bridge.renderSidebar();
      const selected=(s.chats||[]).find(chat=>String(chat.id)===String(bridge.getSelectedChatId?.()));
      if(selected&&selected.type==="person")bridge.renderMain();
    }
  }
  function subscribePresence(userId){
    if(!db||!userId)return;
    if(presenceChannel&&presenceUserId===String(userId)){refreshPresenceUI();return;}
    if(presenceChannel)void db.removeChannel(presenceChannel);
    presenceUserId=String(userId);
    const channel=db.channel("whatsapp-online-status",{config:{presence:{key:String(userId)}}});
    presenceChannel=channel;
    const reconcile=()=>refreshPresenceUI();
    channel.on("presence",{event:"sync"},reconcile)
      .on("presence",{event:"join"},reconcile)
      .on("presence",{event:"leave"},reconcile)
      .subscribe(async status=>{
        if(status!=="SUBSCRIBED"||presenceChannel!==channel)return;
        try{await channel.track({user_id:String(userId),online:true,online_at:new Date().toISOString()});refreshPresenceUI();}
        catch(error){console.warn("Could not publish online status:",error&&error.message||error);}
      });
  }
  function subscribe(userId) {
    if(!db||!userId||(liveChannel&&liveUserId===userId))return;
    if(liveChannel)void db.removeChannel(liveChannel);
    liveUserId=userId;
    liveChannel=db.channel("whatsapp-main-"+userId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_messages"},e=>insertMessageIntoUI(e.new))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"aeroshell_messages"},()=>void loadData(true))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"aeroshell_messages"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"aeroshell_friend_requests"},()=>void loadData(true))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_message_reads"},event=>{
        const row=event&&event.new,me=getUser(),s=appState();
        if(row&&me&&row.user_id&&row.user_id!==me.id&&s&&Array.isArray(s.chats)){
          for(const chat of s.chats){
            const message=(chat.messages||[]).find(item=>String(item.id)===String(row.message_id)&&item.from==="me");
            if(message)message.status="read";
          }
          bridge.renderSidebar();bridge.renderMain();
        }
        void loadData(true);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"aeroshell_message_reactions"},()=>void loadData(true))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"whatsapp_polls"},()=>void loadData(true))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"whatsapp_events"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_poll_votes"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_event_rsvps"},()=>void loadData(true))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"aeroshell_profiles"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_statuses"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_channels"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_channel_posts"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_channel_follows"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_communities"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_community_members"},()=>void loadData(true))
      .subscribe();
  }
  async function loadData(quiet) {
    const me=getUser(),s=appState();
    if(!db||!me||!me.isSupabase||!s)return;
    if(loading){refreshQueued=true;return;}
    loading=true;
    try{
      const [profileResult,requestResult,membershipResult,messageResult,callResult,statusResult,channelResult,channelPostResult,followResult,communityResult,communityMembershipResult]=await Promise.all([
        db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").eq("id",me.id).maybeSingle(),
        db.from("aeroshell_friend_requests").select("id,requester_id,recipient_id,status,created_at,responded_at").or("requester_id.eq."+me.id+",recipient_id.eq."+me.id).order("created_at",{ascending:false}).limit(300),
        db.from("aeroshell_group_members").select("group_id,role").eq("user_id",me.id),
        db.from("aeroshell_messages").select("id,sender_id,recipient_id,group_id,body,message_type,created_at,edited_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms,reply_to_message_id,forwarded_from_message_id").or("sender_id.eq."+me.id+",recipient_id.eq."+me.id).order("created_at",{ascending:true}).limit(800),
        db.from("aeroshell_calls").select("id,caller_id,callee_id,status,created_at,media_type").or("caller_id.eq."+me.id+",callee_id.eq."+me.id).order("created_at",{ascending:false}).limit(100),
        db.from("whatsapp_statuses").select("id,user_id,text,created_at,expires_at").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(200),
        db.from("whatsapp_channels").select("id,name,description,created_by,created_at").order("created_at",{ascending:false}).limit(100),
        db.from("whatsapp_channel_posts").select("id,channel_id,author_id,body,created_at").order("created_at",{ascending:false}).limit(500),
        db.from("whatsapp_channel_follows").select("channel_id,user_id").eq("user_id",me.id),
        db.from("whatsapp_communities").select("id,name,description,created_by,created_at").order("created_at",{ascending:false}).limit(100),
        db.from("whatsapp_community_members").select("community_id,user_id,role").eq("user_id",me.id)
      ]);
      if(profileResult.error)throw profileResult.error;
      if(!profileResult.data)throw new Error("Your profile is missing. Sign out and create a new account after applying the Supabase profile migration.");
      // Failures in optional feeds should not hide the user's direct-message list.
      for(const [label,result] of [
        ["contact requests",requestResult],["group memberships",membershipResult],["messages",messageResult],
        ["statuses",statusResult],["channels",channelResult],["channel posts",channelPostResult],
        ["channel follows",followResult],["communities",communityResult],["community memberships",communityMembershipResult]
      ])if(result&&result.error)console.warn("Optional WhatsApp data could not load ("+label+"):",result.error.message||result.error);
      signedProfile=profileResult.data;
      const self=mapProfile(profileResult.data);
      me.name=self.name;me.phone=self.phone;me.about=self.about;me.avatarData=self.avatarData;
      const relations=requestResult.error?[]:(requestResult.data||[]);
      const directMessageRows=messageResult.error?[]:(messageResult.data||[]);
      const directMessagePeers=directMessageRows.filter(row=>!row.group_id).map(row=>row.sender_id===me.id?row.recipient_id:row.sender_id).filter(id=>id&&id!==me.id);
      const friends=Array.from(new Set(relations.filter(r=>r.status==="accepted").map(r=>r.requester_id===me.id?r.recipient_id:r.requester_id).concat(directMessagePeers)));
      const memberships=membershipResult.error?[]:(membershipResult.data||[]), groupIds=Array.from(new Set(memberships.map(r=>r.group_id)));
      const relatedIds=Array.from(new Set(friends.concat(directMessagePeers,relations.flatMap(r=>[r.requester_id,r.recipient_id]).filter(id=>id!==me.id))));
      let groups=[],roster=[],groupMessages=[];
      if(groupIds.length){
        const [g,m,gm]=await Promise.all([
          db.from("aeroshell_groups").select("id,name,avatar_data,created_by,updated_at,description").in("id",groupIds).order("updated_at",{ascending:false}),
          db.from("aeroshell_group_members").select("group_id,user_id,role").in("group_id",groupIds),
          db.from("aeroshell_messages").select("id,sender_id,recipient_id,group_id,body,message_type,created_at,edited_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms,reply_to_message_id,forwarded_from_message_id").in("group_id",groupIds).order("created_at",{ascending:true}).limit(800)
        ]);
        if(g.error)console.warn("Group list could not be loaded:",g.error.message||g.error);
        if(m.error)console.warn("Group members could not be loaded:",m.error.message||m.error);
        if(gm.error)console.warn("Group messages could not be loaded:",gm.error.message||gm.error);
        groups=g.error?[]:(g.data||[]);roster=m.error?[]:(m.data||[]);groupMessages=gm.error?[]:(gm.data||[]);
        relatedIds.push(...roster.map(r=>r.user_id).filter(id=>id!==me.id));
      }
      const uniqueIds=Array.from(new Set(relatedIds)).filter(id=>id!==me.id);
      let profileRows=[];
      if(uniqueIds.length){
        const pr=await db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").in("id",uniqueIds);
        if(pr.error)console.warn("Some contact profiles could not be loaded:",pr.error.message||pr.error);
        profileRows=pr.error?[]:(pr.data||[]);
      }
      const mapped=[self].concat(profileRows.map(mapProfile).filter(Boolean));
      const profileById=new Map(mapped.map(p=>[p.id,p]));
      const chats=friends.map(id=>{
        const p=profileById.get(id);
        return p
          ? Object.assign({},p,{id:p.id,backendId:p.id,type:"person",messages:[],attachments:[],unread:0,time:"",preview:"",lastMessageType:"text",archived:false,locked:false,participants:[]})
          : {id,backendId:id,type:"person",name:"Contact",username:"",phone:"",about:"Available",avatar:"C",avatarColor:colorFor(id),avatarData:"",messages:[],attachments:[],unread:0,time:"",preview:"",lastMessageType:"text",archived:false,locked:false,participants:[]};
      });
      const roleByGroup=new Map(memberships.map(x=>[x.group_id,x.role])),counts=new Map();
      roster.forEach(r=>counts.set(r.group_id,(counts.get(r.group_id)||0)+1));
      for(const g of groups)chats.push({id:g.id,backendId:g.id,groupId:g.id,type:"group",name:g.name,username:"",phone:"",about:"",avatar:initials(g.name),avatarColor:colorFor(g.name),avatarData:g.avatar_data||"",messages:[],attachments:[],unread:0,time:"",preview:"Group conversation",lastMessageType:"text",archived:false,locked:false,participants:roster.filter(m=>m.group_id===g.id).map(m=>profileById.get(m.user_id)).filter(Boolean),memberCount:counts.get(g.id)||1,groupRole:roleByGroup.get(g.id)||"member",createdBy:g.created_by});
      const all=Array.from(new Map((messageResult.data||[]).concat(groupMessages).map(m=>[m.id,m])).values()).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
      const messageById=new Map(all.map(row=>[row.id,row]));
      const chatMap=new Map(chats.map(c=>[c.id,c]));
      const readSet=new Set();
      const ownMessageIds=all.filter(row=>row.sender_id===me.id).map(row=>row.id);
      if(ownMessageIds.length){
        const readResult=await db.from("aeroshell_message_reads").select("message_id,user_id").in("message_id",ownMessageIds).neq("user_id",me.id);
        if(!readResult.error)(readResult.data||[]).forEach(row=>readSet.add(row.message_id));
      }
      const messageIds=all.map(row=>row.id);
      let pollRows=[],eventRows=[],voteRows=[],rsvpRows=[],reactionRows=[];
      if(messageIds.length){
        const [pollResult,eventResult,reactionResult]=await Promise.all([
          db.from("whatsapp_polls").select("id,message_id,created_by,question,options,created_at").in("message_id",messageIds),
          db.from("whatsapp_events").select("id,message_id,created_by,title,starts_at,created_at").in("message_id",messageIds),
          db.from("aeroshell_message_reactions").select("message_id,user_id,emoji,created_at").in("message_id",messageIds)
        ]);
        if(pollResult.error)throw pollResult.error;
        if(eventResult.error)throw eventResult.error;
        if(reactionResult.error)throw reactionResult.error;
        pollRows=pollResult.data||[];eventRows=eventResult.data||[];reactionRows=reactionResult.data||[];
        const pollIds=pollRows.map(row=>row.id),eventIds=eventRows.map(row=>row.id);
        const [voteResult,rsvpResult]=await Promise.all([
          pollIds.length?db.from("whatsapp_poll_votes").select("poll_id,voter_id,option_index").in("poll_id",pollIds):Promise.resolve({data:[],error:null}),
          eventIds.length?db.from("whatsapp_event_rsvps").select("event_id,user_id,response").in("event_id",eventIds):Promise.resolve({data:[],error:null})
        ]);
        if(voteResult.error)throw voteResult.error;
        if(rsvpResult.error)throw rsvpResult.error;
        voteRows=voteResult.data||[];rsvpRows=rsvpResult.data||[];
      }
      const pollByMessage=new Map(pollRows.map(row=>[row.message_id,row]));
      const eventByMessage=new Map(eventRows.map(row=>[row.message_id,row]));
      const reactionsByMessage=new Map();
      reactionRows.forEach(row=>{const list=reactionsByMessage.get(row.message_id)||[];list.push(row);reactionsByMessage.set(row.message_id,list);});
      const votesByPoll=new Map(),rsvpsByEvent=new Map();
      voteRows.forEach(row=>{const list=votesByPoll.get(row.poll_id)||[];list.push(row);votesByPoll.set(row.poll_id,list);});
      rsvpRows.forEach(row=>{const list=rsvpsByEvent.get(row.event_id)||[];list.push(row);rsvpsByEvent.set(row.event_id,list);});
      for(const row of all){
        const cid=row.group_id||(row.sender_id===me.id?row.recipient_id:row.sender_id),chat=chatMap.get(cid);
        if(!chat)continue;
        const msg=localMessage(row,me,chat);
        if(row.sender_id===me.id&&readSet.has(row.id))msg.status="read";
        const ownReactionRows=reactionsByMessage.get(row.id)||[];
        const reactionCounts=new Map();
        ownReactionRows.forEach(reaction=>reactionCounts.set(reaction.emoji,(reactionCounts.get(reaction.emoji)||0)+1));
        msg.reactions=Array.from(reactionCounts.entries()).map(([emoji,count])=>count>1?emoji+" "+count:emoji);
        msg.myReaction=(ownReactionRows.find(reaction=>reaction.user_id===me.id)||{}).emoji||"";
        const replyTarget=row.reply_to_message_id?messageById.get(row.reply_to_message_id):null;
        if(replyTarget){
          const replyAuthor=profileById.get(replyTarget.sender_id);
          msg.replyTo={id:replyTarget.id,text:replyTarget.body||replyTarget.attachment_name||"Attachment",sender:replyTarget.sender_id===me.id?"You":(replyAuthor&&replyAuthor.name)||chat.name};
        }
        msg.forwarded=!!row.forwarded_from_message_id;
        const poll=pollByMessage.get(row.id);
        if(poll){
          const options=Array.isArray(poll.options)?poll.options:[];
          const votes=votesByPoll.get(poll.id)||[];
          msg.poll={id:poll.id,question:poll.question,options,counts:options.map((_,index)=>votes.filter(v=>Number(v.option_index)===index).length),totalVotes:votes.length,myVote:(votes.find(v=>v.voter_id===me.id)||{}).option_index};
        }
        const ev=eventByMessage.get(row.id);
        if(ev){
          const rsvps=rsvpsByEvent.get(ev.id)||[];
          msg.event={id:ev.id,title:ev.title,startsAt:ev.starts_at,total:rsvps.filter(v=>v.response==="going").length,myResponse:(rsvps.find(v=>v.user_id===me.id)||{}).response||"",interested:rsvps.filter(v=>v.response==="interested").length};
        }
        chat.messages.push(msg);chat.preview=msg.poll?"📊 Poll: "+msg.poll.question:msg.event?"📅 Event: "+msg.event.title:msg.text;chat.time=msg.time;chat.lastOutgoing=msg.from==="me";chat.lastMessageType=row.message_type||"text";
      }
      chats.sort((a,b)=>(Date.parse(b.messages.at(-1)?.createdAt||0)-Date.parse(a.messages.at(-1)?.createdAt||0))||String(a.name).localeCompare(String(b.name)));
      const received=relations.filter(r=>r.status==="pending"&&r.recipient_id===me.id).map(r=>Object.assign({},profileById.get(r.requester_id)||{id:r.requester_id,username:"user",name:"User",phone:"",avatar:"U",avatarColor:1},{id:r.id,requestUserId:r.requester_id,recipientId:r.recipient_id,status:"received",note:"Would like to connect",time:new Date(r.created_at).toLocaleString()}));
      const sent=relations.filter(r=>r.status==="pending"&&r.requester_id===me.id).map(r=>Object.assign({},profileById.get(r.recipient_id)||{id:r.recipient_id,username:"user",name:"User",phone:"",avatar:"U",avatarColor:1},{id:r.id,requestUserId:r.recipient_id,recipientId:r.recipient_id,status:"sent",time:new Date(r.created_at).toLocaleString()}));
      const calls=(callResult.data||[]).map(r=>{const peer=profileById.get(r.caller_id===me.id?r.callee_id:r.caller_id);return{id:r.id,contactId:peer?peer.id:"",name:peer?peer.name:"Contact",username:peer?peer.username:"",time:new Date(r.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}),type:r.caller_id===me.id?"outgoing":"incoming",avatar:peer?peer.avatar:1,mediaType:r.media_type,status:r.status};});
      const statuses=(statusResult.data||[]).map(row=>{const author=profileById.get(row.user_id)||self;return{id:row.id,userId:row.user_id,username:author.username,name:author.name,text:row.text,createdAt:row.created_at,expiresAt:row.expires_at,avatar:author.avatar,avatarColor:author.avatarColor,avatarData:author.avatarData||""};});
      const followed=new Set((followResult.data||[]).map(row=>row.channel_id));
      const channels=(channelResult.data||[]).map(row=>({id:row.id,name:row.name,description:row.description||"",createdBy:row.created_by,following:followed.has(row.id),createdAt:row.created_at}));
      const channelIds=new Set(channels.map(row=>row.id));
      const channelPosts=(channelPostResult.data||[]).filter(row=>channelIds.has(row.channel_id)).map(row=>({
        id:row.id,channelId:row.channel_id,authorId:row.author_id,body:row.body,createdAt:row.created_at,
        channelName:(channels.find(c=>c.id===row.channel_id)||{}).name||"Channel",
        isMine:row.author_id===me.id
      }));
      const joined=new Map((communityMembershipResult.data||[]).map(row=>[row.community_id,row.role]));
      const communities=(communityResult.data||[]).map(row=>({id:row.id,name:row.name,description:row.description||"",createdBy:row.created_by,createdAt:row.created_at,joined:joined.has(row.id),role:joined.get(row.id)||"",groups:[]}));
      bridge.setBackendData({profile:{username:self.username,name:self.name,phone:self.phone,about:self.about,avatar:self.avatar,avatarColor:self.avatarColor,avatarData:self.avatarData},chats,requests:received,sentRequests:sent,calls,statuses,channels,channelPosts,communities});
      // Mark incoming messages read only after the new messages have been placed in the UI state.
      void markReadForChat(bridge.getCurrentChat());
      subscribe(me.id);
      subscribePresence(me.id);
      refreshPresenceUI();
      if(window.WhatsAppCalls)window.WhatsAppCalls.subscribe();
    }catch(error){if(!quiet)say(safeError(error,"Could not load messaging data from Supabase."));}
    finally{loading=false;if(refreshQueued){refreshQueued=false;queueMicrotask(()=>void loadData(true));}}
  }
  async function hydrate(authUser){
    const {data,error}=await db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").eq("id",authUser.id).maybeSingle();
    if(error)throw error;if(!data)throw new Error("No messaging profile exists for this account. Sign out and create a messaging account.");
    const sessionUser=Object.assign({},authUser,{isSupabase:true});
    bridge.setBackendUser(sessionUser,data);
    await loadData(false);
    try{if(!(await registerCurrentDevice()))return;}catch(deviceError){console.warn("Could not register linked device:",deviceError&&deviceError.message||deviceError);}
    // Notification clicks can open a fresh tab; wait for authenticated chat data before routing.
    try{
      const params=new URLSearchParams(location.search);
      const targetId=params.get("waChatId");
      if(targetId){
        params.delete("waChatId");
        history.replaceState(history.state,"",location.pathname+(params.toString()?"?"+params.toString():"")+location.hash);
        const target=(appState()?.chats||[]).find(chat=>String(chat.id)===String(targetId));
        if(target)bridge.selectChat(target.id);
      }
    }catch(_){}
    setTimeout(()=>{if(bridge.promptNotificationSetup)void bridge.promptNotificationSetup();},650);
  }
  async function signUp(form){
    if(!db)return showError("signup","The secure backend did not load. Refresh the page and check your internet connection.");
    if(busy)return;
    const name=String($("#signup-name")?.value||"").trim().replace(/\s+/g," ");
    const username=String($("#signup-username")?.value||"").trim().replace(/^@+/,"").toLowerCase();
    const number=canonicalNumber($("#signup-phone")?.value);
    const password=$("#signup-password")?.value||"",confirm=$("#signup-confirm")?.value||"";
    if(!name)return showError("signup","Enter a display name.");
    if(!usernamePattern.test(username))return showError("signup","Username must be 3–20 letters, numbers or underscores.");
    if(!number)return showError("signup","Enter exactly nine digits after the +990 app-only ID prefix.");
    if(password.length<8)return showError("signup","Use a password with at least 8 characters.");
    if(password!==confirm)return showError("signup","The passwords do not match.");
    busy=true;const btn=form.querySelector("button[type=submit]");if(btn){btn.disabled=true;btn.textContent="Creating account…";}
    try{
      const {data,error}=await db.auth.signUp({email:username+"@aeroshell.invalid",password,options:{data:{aeroshell_chat:"true",username,display_name:name,custom_number:number,about:"Available"}}});
      if(error)throw error;if(!data||!data.user)throw new Error("Supabase did not return the new account.");
      if(!data.session){showError("signup","Account created, but email confirmation is enabled. Turn OFF Confirm email in Supabase Auth settings, then create a fresh account with another username.");return;}
      await hydrate(data.user);say("Account created. Contact requests and messages now sync with Supabase.");
    }catch(error){showError("signup",safeError(error,"Account creation failed."));}
    finally{busy=false;const b=$("#signup-form button[type=submit]");if(b){b.disabled=false;b.innerHTML="Create account "+bridge.icon("chevron");}}
  }
  async function signIn(form){
    if(!db)return showError("login","The secure backend did not load. Refresh the page and check your internet connection.");
    if(busy)return;
    const identity=String($("#login-identity")?.value||"").trim(),password=$("#login-password")?.value||"";
    if(!identity||!password)return showError("login","Enter your username or custom in-app ID and password.");
    busy=true;const btn=form.querySelector("button[type=submit]");if(btn){btn.disabled=true;btn.textContent="Signing in…";}
    try{
      let username=identity.replace(/^@+/,"").toLowerCase();
      if(canonicalNumber(identity))username=await usernameFromNumber(identity);
      if(!username)throw new Error("No account matched this app ID. Try your username instead.");
      if(!usernamePattern.test(username))throw new Error("Use a 3–20 character username.");
      const {data,error}=await db.auth.signInWithPassword({email:username+"@aeroshell.invalid",password});
      if(error)throw error;await hydrate(data.user);say("Signed in. Your messages are syncing.");
    }catch(error){showError("login",safeError(error,"Sign-in failed."));}
    finally{busy=false;const b=$("#login-form button[type=submit]");if(b){b.disabled=false;b.innerHTML="Log in "+bridge.icon("chevron");}}
  }
  async function sendMessage(value, replyToMessageId){
    const me=getUser(),chat=bridge.getCurrentChat(),body=String(value||"").trim();
    if(!me||!me.isSupabase){say("Sign in with a Supabase account to send real messages.");return;}
    if(!chat||!body)return;if(body.length>2000)return say("Messages are limited to 2,000 characters.");
    const quote=replyToMessageId?chat.messages.find(m=>String(m.id)===String(replyToMessageId)):null;
    if(replyToMessageId&&!quote)return say("That message is no longer in this conversation. Select it again to reply.");
    const button=$(".send-button");if(button)button.disabled=true;
    try{
      const payload={sender_id:me.id,recipient_id:chat.type==="group"?null:chat.id,group_id:chat.type==="group"?chat.id:null,body,message_type:"text",reply_to_message_id:quote?quote.id:null,forwarded_from_message_id:null};
      const {data,error}=await db.from("aeroshell_messages").insert(payload).select("id,sender_id,recipient_id,group_id,body,message_type,created_at,edited_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms,reply_to_message_id,forwarded_from_message_id").single();
      if(error)throw error;if(data){insertMessageIntoUI(data);void dispatchServerPush("notify-message",{messageId:data.id});}
      if(quote&&bridge.clearReplyToMessage)bridge.clearReplyToMessage(quote.id);
      const input=$("#message-input");if(input){input.value="";input.style.height="";input.dispatchEvent(new Event("input",{bubbles:true}));}
      return true;
    }catch(error){say(safeError(error,"Message was not delivered."));return false;}
    finally{if(button)button.disabled=false;}
  }

  async function toggleMessageReaction(messageId,emoji){
    const me=getUser();
    const allowed=["👍","❤️","😂","😮","🙏"];
    if(!me||!me.isSupabase)throw new Error("Sign in to sync message reactions.");
    if(!allowed.includes(emoji))throw new Error("That reaction is not supported.");
    if(!/^[0-9a-f-]{36}$/i.test(String(messageId||"")))throw new Error("This message is not synced to the account backend.");
    const {data:existing,error:readError}=await db.from("aeroshell_message_reactions")
      .select("emoji").eq("message_id",messageId).eq("user_id",me.id).maybeSingle();
    if(readError)throw readError;
    if(existing&&existing.emoji===emoji){
      const {error}=await db.from("aeroshell_message_reactions").delete().eq("message_id",messageId).eq("user_id",me.id);
      if(error)throw error;
    }else{
      const {error}=await db.from("aeroshell_message_reactions")
        .upsert({message_id:messageId,user_id:me.id,emoji},{onConflict:"message_id,user_id"});
      if(error)throw error;
    }
    await loadData(true);
    return true;
  }

  async function hideMessageForMe(messageId){
    const me=getUser();
    if(!me||!me.isSupabase)throw new Error("Sign in to remove a synced message.");
    if(!/^[0-9a-f-]{36}$/i.test(String(messageId||"")))throw new Error("This message is only in the local preview.");
    const {error}=await db.from("aeroshell_message_hides").insert({message_id:messageId,user_id:me.id});
    if(error&&error.code!=="23505")throw error;
    await loadData(true);
  }
  async function deleteMessageForEveryone(messageId){
    const me=getUser();
    if(!me||!me.isSupabase)throw new Error("Sign in to delete a synced message.");
    const {data,error}=await db.from("aeroshell_messages").delete().eq("id",messageId).eq("sender_id",me.id).select("id").maybeSingle();
    if(error)throw error;
    if(!data)throw new Error("Only the person who sent a message can delete it for everyone.");
    await loadData(true);
  }
  async function editMessage(messageId,value){
    const me=getUser(),body=String(value||"").trim();
    if(!me||!me.isSupabase)throw new Error("Sign in to edit a synced message.");
    if(!body)throw new Error("A message cannot be empty.");
    if(body.length>2000)throw new Error("Messages are limited to 2,000 characters.");
    if(!/^[0-9a-f-]{36}$/i.test(String(messageId||"")))throw new Error("This message is not synced to the account backend.");
    const {data,error}=await db.from("aeroshell_messages").update({body,edited_at:new Date().toISOString()})
      .eq("id",messageId).eq("sender_id",me.id).eq("message_type","text").select("id").maybeSingle();
    if(error)throw error;
    if(!data)throw new Error("Only your own text messages can be edited.");
    await loadData(true);
    return true;
  }
  async function forwardMessage(targetChatId,sourceMessageId,sourceText){
    const me=getUser(),s=appState(),body=String(sourceText||"").trim();
    if(!me||!me.isSupabase)throw new Error("Sign in to forward synced messages.");
    if(!s||!body)throw new Error("This message has no text content to forward.");
    const target=(s.chats||[]).find(chat=>String(chat.id)===String(targetChatId)&&!chat.archived);
    if(!target)throw new Error("The selected conversation is not available.");
    if(body.length>2000)throw new Error("This message is too long to forward.");
    const sourceId=/^[0-9a-f-]{36}$/i.test(String(sourceMessageId||""))?sourceMessageId:null;
    if(!sourceId)throw new Error("Only messages synced to your account can be forwarded across devices.");
    const payload={sender_id:me.id,recipient_id:target.type==="group"?null:target.id,group_id:target.type==="group"?target.id:null,body,message_type:"text",reply_to_message_id:null,forwarded_from_message_id:sourceId};
    const {data,error}=await db.from("aeroshell_messages").insert(payload).select("id,sender_id,recipient_id,group_id,body,message_type,created_at,edited_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms,reply_to_message_id,forwarded_from_message_id").single();
    if(error)throw error;
    if(data){insertMessageIntoUI(data);void dispatchServerPush("notify-message",{messageId:data.id});}
    return data;
  }

  const ATTACHMENT_BUCKET = "master-chat-attachments";
  let recorder = null, recorderStream = null, recorderChunks = [], recorderStartedAt = 0, recorderChatId = null, recorderStopReason = "";
  let recorderAudioContext=null,recorderAnalyser=null,recorderAnimationFrame=0,recorderUiTimer=null;
  function currentSelectedChat() {
    const selected = bridge.getCurrentChat();
    return selected && selected.id ? selected : null;
  }
  function stopRecordingVisualizer(){
    if(recorderAnimationFrame)cancelAnimationFrame(recorderAnimationFrame);
    recorderAnimationFrame=0;recorderAnalyser=null;
    if(recorderUiTimer!==null)clearInterval(recorderUiTimer);
    recorderUiTimer=null;
    const context=recorderAudioContext;recorderAudioContext=null;
    if(context&&context.state!=="closed")void context.close().catch(()=>{});
  }
  function resetRecordingUI(){
    stopRecordingVisualizer();
    const bar=$("#wa-recording-bar");if(bar)bar.remove();
    const button=$(".send-button"),input=$("#message-input");
    if(button){
      button.classList.remove("recording");button.hidden=false;
      const hasText=!!(input&&input.value.trim());
      button.innerHTML=bridge.icon(hasText?"send":"mic");
      button.title=hasText?"Send message":"Record voice message";
      button.setAttribute("aria-label",hasText?"Send message":"Record voice message");
    }
    if(input){input.disabled=false;input.placeholder="Type a message";}
  }
  function showRecordingBar(){
    const form=$("#message-form");if(!form)return;
    const bars=Array.from({length:28},(_,i)=>"<i style='height:"+(5+((i*7+3)%17))+"px'></i>").join("");
    form.insertAdjacentHTML("beforebegin",
      "<div class='wa-recording-bar' id='wa-recording-bar' role='status' aria-live='polite'>"+
      "<button type='button' class='wa-recording-cancel' data-wa-recording-action='cancel' aria-label='Discard voice message' title='Delete recording'>"+bridge.icon("trash")+"</button>"+
      "<span class='wa-recording-time' id='wa-recording-time'>00:00</span>"+
      "<div class='wa-recording-waveform' id='wa-recording-waveform' aria-label='Live recording audio levels'>"+bars+"</div>"+
      "<button type='button' class='wa-recording-send' data-wa-recording-action='send' aria-label='Send voice message' title='Send voice message'>"+bridge.icon("send")+"</button>"+
      "</div>");
    recorderUiTimer=setInterval(()=>{
      const timer=$("#wa-recording-time");if(!timer)return;
      const seconds=Math.max(0,Math.floor((Date.now()-recorderStartedAt)/1000));
      timer.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
    },200);
    try{
      const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextCtor||!recorderStream)return;
      recorderAudioContext=new AudioContextCtor();
      recorderAnalyser=recorderAudioContext.createAnalyser();recorderAnalyser.fftSize=64;
      recorderAudioContext.createMediaStreamSource(recorderStream).connect(recorderAnalyser);
      const samples=new Uint8Array(recorderAnalyser.frequencyBinCount);
      const tick=()=>{
        const active=$("#wa-recording-waveform");
        if(!active||!recorderAnalyser)return;
        recorderAnalyser.getByteFrequencyData(samples);
        Array.from(active.children).forEach((bar,index)=>{
          const level=samples[index%samples.length]||0;
          bar.style.height=Math.max(4,Math.round(4+(level/255)*27))+"px";
          bar.classList.toggle("active",level>28);
        });
        recorderAnimationFrame=requestAnimationFrame(tick);
      };
      if(recorderAudioContext.state==="suspended")void recorderAudioContext.resume().catch(()=>{});
      tick();
    }catch(error){console.warn("Live recording waveform is unavailable:",error&&error.message||error);}
  }
  async function markAllRead() {
    const me=getUser(),s=appState();
    if(!db||!me||!me.isSupabase||!s)throw new Error("Sign in to your shared account before marking messages as read.");
    const messages=(s.chats||[]).flatMap(chat=>(chat.messages||[]).filter(m=>m.from==="them"&&!m.read&&m.id&&/^[0-9a-f-]{36}$/i.test(String(m.id))));
    const list=Array.from(new Map(messages.map(message=>[String(message.id),message])).values());
    for(let start=0;start<list.length;start+=100){
      const chunk=list.slice(start,start+100).map(message=>({message_id:message.id,user_id:me.id}));
      const {error}=await db.from("aeroshell_message_reads").upsert(chunk,{onConflict:"message_id,user_id",ignoreDuplicates:true});
      if(error)throw error;
    }
    list.forEach(message=>{message.read=true;});
    (s.chats||[]).forEach(chat=>{chat.unread=0;});
    bridge.renderSidebar();
    if(bridge.getSelectedChatId&&bridge.getSelectedChatId()!==null)bridge.renderMain();
    return list.length;
  }
  async function markReadForChat(chat) {
    const me=getUser(),settings=appState()?.settings||{};
    if(!me||!me.isSupabase||!chat||!Array.isArray(chat.messages))return;
    if(settings.readReceipts===false)return;
    const pending=chat.messages.filter(m=>m.from==="them"&&!m.read&&m.id&&/^[0-9a-f-]{36}$/i.test(String(m.id)));
    if(!pending.length)return;
    try{
      const rows=pending.map(m=>({message_id:m.id,user_id:me.id}));
      const {error}=await db.from("aeroshell_message_reads").upsert(rows,{onConflict:"message_id,user_id",ignoreDuplicates:true});
      if(error)return;
      pending.forEach(m=>{m.read=true;});
      chat.unread=0;
      bridge.renderSidebar();
      if(String(bridge.getSelectedChatId?bridge.getSelectedChatId():"")===String(chat.id))bridge.renderMain();
    }catch(_){}
  }
  function safeFileName(name) {
    const clean = String(name || "attachment").normalize("NFKC").replace(/[\/\\:*?"<>|\u0000-\u001f]/g,"_").replace(/\s+/g," ").trim().slice(0,120);
    return clean || "attachment";
  }
  function attachmentPath(me, chat, fileName) {
    const nonce = (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2));
    if (chat.type === "group") return "groups/"+chat.id+"/"+me.id+"/"+nonce+"-"+fileName;
    return "direct/"+me.id+"/"+chat.id+"/"+nonce+"-"+fileName;
  }
  async function uploadStoredAttachment(blobOrFile, options) {
    const me=getUser(), chat=currentSelectedChat();
    const isVoice=options.type==="voice";
    if(!me||!me.isSupabase)return say("Sign in to send an attachment.");
    if(!chat)return say("Open a conversation first.");
    if(!blobOrFile||!blobOrFile.size)return say("This attachment is empty.");
    if(blobOrFile.size>15*1024*1024)return say("Attachments must be 15 MB or smaller.");
    const mime=String(options.mime||blobOrFile.type||"application/octet-stream").split(";")[0].trim().toLowerCase();
    if(isVoice&&!mime.startsWith("audio/"))return say("The browser returned an unsupported audio format. Try a different browser.");
    const filename=safeFileName(options.name||blobOrFile.name||(isVoice?"voice-note.webm":"attachment"));
    const path=attachmentPath(me,chat,filename);
    const uploadFile=blobOrFile instanceof File?blobOrFile:new File([blobOrFile],filename,{type:mime,lastModified:Date.now()});
    try{
      const {error:uploadError}=await db.storage.from(ATTACHMENT_BUCKET).upload(path,uploadFile,{contentType:mime,upsert:false,cacheControl:"3600"});
      if(uploadError)throw uploadError;
      const row={
        sender_id:me.id,
        recipient_id:chat.type==="group"?null:chat.id,
        group_id:chat.type==="group"?chat.id:null,
        body:isVoice?"":filename,
        message_type:isVoice?"voice":"file",
        attachment_path:path,
        attachment_name:isVoice?"Voice message":filename,
        attachment_mime:mime,
        attachment_size:uploadFile.size
      };
      if(isVoice)row.voice_duration_ms=Math.max(1,Math.min(120000,Math.round(options.durationMs||1000)));
      const {data,error}=await db.from("aeroshell_messages").insert(row)
        .select("id,sender_id,recipient_id,group_id,body,message_type,created_at,edited_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms,reply_to_message_id,forwarded_from_message_id").single();
      if(error)throw error;
      if(data){insertMessageIntoUI(data);void dispatchServerPush("notify-message",{messageId:data.id});}
      if(!isVoice)say("Attachment sent.");
      else say("Voice message sent.");
    }catch(error){
      try{await db.storage.from(ATTACHMENT_BUCKET).remove([path]);}catch(_){}
      say(safeError(error,"Attachment upload failed. Check your connection and try again."));
    }
  }
  async function openAttachment(messageId) {
    const me=getUser(),s=appState();
    if(!me||!me.isSupabase||!s)return;
    const chat=(s.chats||[]).find(c=>(c.messages||[]).some(m=>String(m.id)===String(messageId)));
    const message=chat&&(chat.messages||[]).find(m=>String(m.id)===String(messageId));
    if(!message||!message.attachmentPath)return say("The attachment is not available in this chat.");
    const isVoice=message.attachmentType==="voice"||message.messageType==="voice";
    const button=Array.from(document.querySelectorAll("[data-action='open-attachment']")).find(el=>String(el.dataset.messageId)===String(messageId));
    if(isVoice&&button){
      const existing=button.parentElement?.querySelector("audio.wa-inline-voice-audio");
      if(existing){if(existing.paused)void existing.play().catch(()=>say("Tap the audio play control to start playback."));else existing.pause();return;}
    }
    try{
      const {data,error}=await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(message.attachmentPath,120);
      if(error||!data||!data.signedUrl)throw error||new Error("Could not create a private attachment link.");
      const url=String(data.signedUrl),name=esc(message.attachmentName||"Attachment"),mime=String(message.attachmentMime||"");
      if(isVoice&&button){
        const audio=document.createElement("audio");audio.className="wa-inline-voice-audio";audio.controls=true;audio.preload="none";audio.src=url;audio.setAttribute("aria-label","Voice message playback");
        button.insertAdjacentElement("afterend",audio);
        try{await audio.play();}catch(_){}
        return;
      }
      const safeUrl=esc(url);let preview="";
      if(mime.startsWith("image/"))preview="<img class='wa-attachment-preview' src='"+safeUrl+"' alt='"+name+"'>";
      else if(mime.startsWith("video/"))preview="<video class='wa-attachment-video' controls playsinline preload='metadata' src='"+safeUrl+"'></video>";
      else if(mime.startsWith("audio/"))preview="<audio class='wa-attachment-audio' controls preload='none' src='"+safeUrl+"'></audio>";
      bridge.openDialog("Shared attachment","<div class='wa-attachment-dialog'>"+preview+"<p>"+name+"</p><a class='primary-button' href='"+safeUrl+"' target='_blank' rel='noopener noreferrer'>Open / download attachment</a><small>This private link expires in about two minutes.</small></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");
    }catch(error){say(safeError(error,"This private attachment could not be opened."));}
  }
  async function startVoiceRecording() {
    const me=getUser(),chat=currentSelectedChat();
    if(!me||!me.isSupabase)return say("Sign in to record and send a voice note.");
    if(!chat)return say("Open a conversation first.");
    if(recorder)return stopVoiceRecording("send");
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")return say("Voice notes are not supported by this browser. Try the latest Chrome, Edge or Safari over HTTPS.");
    try{
      recorderStream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!currentSelectedChat()||String(currentSelectedChat().id)!==String(chat.id)){
        recorderStream.getTracks().forEach(t=>t.stop());recorderStream=null;return say("The conversation changed. Open it again before recording.");
      }
      const mimeOptions=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"];
      const mimeType=mimeOptions.find(m=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m))||"";
      recorder=mimeType?new MediaRecorder(recorderStream,{mimeType}):new MediaRecorder(recorderStream);
      recorderChunks=[];recorderStartedAt=Date.now();recorderChatId=chat.id;recorderStopReason="";
      recorder.ondataavailable=event=>{if(event.data&&event.data.size)recorderChunks.push(event.data);};
      recorder.onerror=()=>{recorderStopReason="error";try{if(recorder&&recorder.state!=="inactive")recorder.stop();}catch(_){};};
      recorder.onstop=()=>{
        const activeRecorder=recorder,stopReason=recorderStopReason;
        const blobType=(activeRecorder&&activeRecorder.mimeType)||mimeType||"audio/webm";
        const duration=Math.max(1,Math.min(120000,Date.now()-recorderStartedAt));
        const blob=new Blob(recorderChunks,{type:blobType});
        const ext=blobType.includes("mp4")?"m4a":blobType.includes("ogg")?"ogg":"webm";
        const stillSameChat=currentSelectedChat()&&String(currentSelectedChat().id)===String(recorderChatId);
        if(recorderStream)recorderStream.getTracks().forEach(t=>t.stop());
        recorderStream=null;recorder=null;recorderChunks=[];
        resetRecordingUI();recorderStopReason="";
        if(stopReason==="cancel"){say("Voice message discarded.");return;}
        if(stopReason==="error"){say("Voice recording failed.");return;}
        if(!stillSameChat){say("Voice note cancelled because the conversation changed.");return;}
        if(!blob.size){say("No audio was captured. Record a voice message and try again.");return;}
        void uploadStoredAttachment(blob,{type:"voice",name:"voice-note."+ext,mime:blobType,durationMs:duration});
      };
      recorder.start(250);
      const button=$(".send-button"),input=$("#message-input");
      showRecordingBar();
      if(button){button.classList.add("recording");button.hidden=true;}
      if(input){input.disabled=true;input.placeholder="Recording… use the voice bar to discard or send";}
      say("Recording voice message. Use the bar to discard or send; the maximum length is two minutes.");
      window.waVoiceLimit=setTimeout(()=>{if(recorder&&recorder.state!=="inactive"){recorderStopReason="limit";stopVoiceRecording();say("Two-minute recording limit reached.");}},120000);
    }catch(error){
      if(recorderStream)recorderStream.getTracks().forEach(t=>t.stop());
      recorderStream=null;recorder=null;recorderChunks=[];recorderStopReason="";
      resetRecordingUI();
      say(error&&error.name==="NotAllowedError"?"Microphone permission was denied. Allow microphone access in your browser settings and try again.":safeError(error,"Could not start voice recording."));
    }
  }
  function stopVoiceRecording(reason){
    if(reason&&!recorderStopReason)recorderStopReason=reason;
    else if(!recorderStopReason)recorderStopReason="send";
    if(window.waVoiceLimit){clearTimeout(window.waVoiceLimit);window.waVoiceLimit=null;}
    if(recorder&&recorder.state!=="inactive"){try{recorder.stop();}catch(_){cleanupRecorder();}}
  }
  function cleanupRecorder(){
    if(window.waVoiceLimit){clearTimeout(window.waVoiceLimit);window.waVoiceLimit=null;}
    if(recorderStream)recorderStream.getTracks().forEach(t=>t.stop());
    recorderStream=null;recorder=null;recorderChunks=[];recorderStopReason="";
    resetRecordingUI();
  }
  async function deleteOrHideMessage(){
    const me=getUser(),s=appState(),chat=currentSelectedChat(),ref=s&&s.lastContextMessage;
    if(!me||!me.isSupabase||!chat||!ref||!ref.id)return;
    const message=(chat.messages||[]).find(m=>String(m.id)===String(ref.id));
    if(!message)return say("Select a message first.");
    try{
      if(message.from==="me"){
        const {error}=await db.from("aeroshell_messages").delete().eq("id",message.id).eq("sender_id",me.id);
        if(error)throw error;
      }else{
        const {error}=await db.from("aeroshell_message_hides").insert({message_id:message.id,user_id:me.id});
        if(error&&error.code!=="23505")throw error;
      }
      bridge.closeDialog();await loadData(true);say(message.from==="me"?"Message deleted for everyone.":"Message removed from your view.");
    }catch(error){say(safeError(error,"Could not remove this message."));}
  }

  async function sendRequest(person){
    const me=getUser(),s=appState();
    if(!me||!me.isSupabase)return say("Sign in with a Supabase account to send a contact request.");
    if(!person||!person.id||person.id===me.id)return say("Choose a different username.");
    if(s.chats.some(c=>String(c.id)===String(person.id)))return say("You are already connected to this person.");
    if((s.sentRequests||[]).some(r=>r.requestUserId===person.id||r.username===person.username))return say("You already sent a request.");
    try{
      const {error}=await db.from("aeroshell_friend_requests").insert({requester_id:me.id,recipient_id:person.id,status:"pending"});
      if(error)throw error;bridge.closeDialog();say("Request sent to @"+person.username+".");await loadData(true);
    }catch(error){say(safeError(error,"Could not send the request."));}
  }
  async function respondRequest(id,decision){
    const me=getUser();if(!me||!me.isSupabase)return;
    try{
      if(decision==="cancel"){
        const {error}=await db.from("aeroshell_friend_requests").delete().eq("id",id).eq("requester_id",me.id).eq("status","pending");if(error)throw error;
      }else{
        const {data,error}=await db.from("aeroshell_friend_requests").update({status:decision}).eq("id",id).eq("recipient_id",me.id).eq("status","pending").select("id").maybeSingle();
        if(error)throw error;if(!data)throw new Error("This request is no longer pending. Refresh the page.");
      }
      await loadData(true);say(decision==="accepted"?"Request accepted. You can now chat and call.":decision==="declined"?"Request declined.":"Request cancelled.");
    }catch(error){say(safeError(error,"Could not update the request."));}
  }

  async function sendPoll(){
    const me=getUser(),chat=currentSelectedChat();
    if(!me||!me.isSupabase||!chat)return say("Open a conversation before creating a poll.");
    const question=String($("#poll-question")?.value||"").trim().slice(0,240);
    const options=String($("#poll-options")?.value||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,10);
    const unique=Array.from(new Set(options));
    if(!question)return say("Enter a poll question.");
    if(unique.length<2)return say("Add at least two different poll options.");
    if(unique.length!==options.length)return say("Poll options must be unique.");
    if(unique.some(s=>s.length>120))return say("Each poll option must be 120 characters or fewer.");
    const body="📊 Poll: "+question+"\n"+unique.map((o,i)=>(i+1)+". "+o).join("\n");
    if(body.length>1950)return say("Shorten the question or options so the poll fits within the message limit.");
    try{
      const {data:message,error:messageError}=await db.from("aeroshell_messages").insert({
        sender_id:me.id,recipient_id:chat.type==="group"?null:chat.id,group_id:chat.type==="group"?chat.id:null,
        body,message_type:"text"
      }).select("id").single();
      if(messageError)throw messageError;
      const {error:pollError}=await db.from("whatsapp_polls").insert({
        message_id:message.id,created_by:me.id,question,options:unique
      });
      if(pollError){
        try{await db.from("aeroshell_messages").delete().eq("id",message.id).eq("sender_id",me.id);}catch(_){}
        throw pollError;
      }
      void dispatchServerPush("notify-message",{messageId:message.id});
      bridge.closeDialog();await loadData(true);say("Poll sent. Votes will sync to the conversation.");
    }catch(error){say(safeError(error,"Could not send the poll."));}
  }
  async function votePoll(pollId,optionIndex){
    const me=getUser();if(!me||!me.isSupabase)return;
    const index=Number(optionIndex);
    if(!Number.isInteger(index)||index<0)return;
    try{
      const {error}=await db.from("whatsapp_poll_votes").upsert({
        poll_id:pollId,voter_id:me.id,option_index:index,updated_at:new Date().toISOString()
      },{onConflict:"poll_id,voter_id"});
      if(error)throw error;
      await loadData(true);
    }catch(error){say(safeError(error,"Your vote could not be saved."));}
  }
  async function sendEvent(){
    const me=getUser(),chat=currentSelectedChat();
    if(!me||!me.isSupabase||!chat)return say("Open a conversation before creating an event.");
    const title=String($("#event-name")?.value||"").trim().slice(0,120);
    const date=String($("#event-date")?.value||"").trim(),time=String($("#event-time")?.value||"").trim();
    if(!title)return say("Enter an event name.");
    if(!date||!time)return say("Choose both a date and a time.");
    const start=new Date(date+"T"+time);
    if(Number.isNaN(start.getTime()))return say("Choose a valid date and time.");
    const startsAt=start.toISOString();
    const body="📅 Event: "+title+" · "+start.toLocaleString();
    try{
      const {data:message,error:messageError}=await db.from("aeroshell_messages").insert({
        sender_id:me.id,recipient_id:chat.type==="group"?null:chat.id,group_id:chat.type==="group"?chat.id:null,
        body,message_type:"text"
      }).select("id").single();
      if(messageError)throw messageError;
      const {error:eventError}=await db.from("whatsapp_events").insert({
        message_id:message.id,created_by:me.id,title,starts_at:startsAt
      });
      if(eventError){
        try{await db.from("aeroshell_messages").delete().eq("id",message.id).eq("sender_id",me.id);}catch(_){}
        throw eventError;
      }
      void dispatchServerPush("notify-message",{messageId:message.id});
      bridge.closeDialog();await loadData(true);say("Event sent to the conversation.");
    }catch(error){say(safeError(error,"Could not send the event."));}
  }
  async function respondToEvent(eventId){
    const me=getUser(),s=appState();if(!me||!me.isSupabase||!s)return;
    const messages=(s.chats||[]).flatMap(c=>c.messages||[]);
    const event=messages.map(m=>m.event).find(e=>e&&String(e.id)===String(eventId));
    const response=event&&event.myResponse==="going"?"not_going":"going";
    try{
      const {error}=await db.from("whatsapp_event_rsvps").upsert({
        event_id:eventId,user_id:me.id,response,updated_at:new Date().toISOString()
      },{onConflict:"event_id,user_id"});
      if(error)throw error;await loadData(true);say(response==="going"?"You are going to this event.":"Your RSVP was removed.");
    }catch(error){say(safeError(error,"Could not update your event RSVP."));}
  }


  async function publishStatus(){
    const me=getUser();if(!me||!me.isSupabase)return;
    const text=String($("#status-text")?.value||"").trim().slice(0,700);
    if(!text)return say("Write a status before sharing it.");
    try{
      await db.from("whatsapp_statuses").delete().eq("user_id",me.id).lt("expires_at",new Date().toISOString());
      const {error}=await db.from("whatsapp_statuses").insert({user_id:me.id,text,expires_at:new Date(Date.now()+24*60*60*1000).toISOString()});
      if(error)throw error;bridge.closeDialog();await loadData(true);bridge.setView("updates");say("Status shared. It expires after 24 hours.");
    }catch(error){say(safeError(error,"Could not share the status."));}
  }
  async function updateStatus(statusId){
    const me=getUser();
    if(!me||!me.isSupabase)return;
    const statusIdValue=String(statusId||"");
    const text=String($("#edit-status-text")?.value||"").trim().slice(0,700);
    if(!statusIdValue)return say("Choose a status to edit.");
    if(!text)return say("Write a status before saving changes.");
    try{
      const {data,error}=await db.from("whatsapp_statuses").update({text}).eq("id",statusIdValue).eq("user_id",me.id).select("id").maybeSingle();
      if(error)throw error;
      if(!data)throw new Error("This status has expired or is no longer editable.");
      bridge.closeDialog();await loadData(true);bridge.setView("updates");say("Status updated.");
    }catch(error){say(safeError(error,"Could not edit this status."));}
  }
  async function deleteStatus(statusId){
    const me=getUser();if(!me||!me.isSupabase)return;
    try{const {error}=await db.from("whatsapp_statuses").delete().eq("id",statusId).eq("user_id",me.id);if(error)throw error;bridge.closeDialog();await loadData(true);say("Status deleted.");}
    catch(error){say(safeError(error,"Could not delete this status."));}
  }
  function openStatus(statusId){
    const me=getUser(),s=appState(),status=(s&&s.backendStatuses||[]).find(row=>String(row.id)===String(statusId));
    if(!status)return say("This status has expired or is no longer available.");
    const date=new Date(status.createdAt),isMine=Boolean(me&&me.isSupabase&&status.userId===me.id);
    const body="<div class='wa-status-view'><strong>"+esc(status.name)+" <span>@"+esc(status.username)+"</span></strong><small>"+esc(Number.isNaN(date.getTime())?"Recently":date.toLocaleString())+"</small>"+(isMine?"<div class='dialog-field'><label for='edit-status-text'>Edit your status</label><textarea id='edit-status-text' rows='4' maxlength='700'>"+esc(status.text)+"</textarea></div>":"<p>"+esc(status.text)+"</p>")+"</div>";
    const footer=isMine
      ?"<button class='secondary-button' data-action='close-dialog'>Close</button><button class='danger-button' data-dialog-action='delete-status' data-status-id='"+esc(status.id)+"'>Delete</button><button class='primary-button' data-dialog-action='edit-status' data-status-id='"+esc(status.id)+"'>Save changes</button>"
      :"<button class='secondary-button' data-action='close-dialog'>Close</button>";
    bridge.openDialog(isMine?"Edit status":"Status update",body,footer);
  }
  async function createCommunity(){
    const me=getUser();if(!me||!me.isSupabase)return;
    const name=String($("#community-name")?.value||"").trim().slice(0,60);
    const description=String($("#community-description")?.value||"").trim().slice(0,500);
    if(!name)return say("Enter a community name.");
    try{
      const {data,error}=await db.from("whatsapp_communities").insert({name,description,created_by:me.id}).select("id").single();
      if(error)throw error;
      const member=await db.from("whatsapp_community_members").insert({community_id:data.id,user_id:me.id,role:"owner"});
      if(member.error){try{await db.from("whatsapp_communities").delete().eq("id",data.id).eq("created_by",me.id);}catch(_){}throw member.error;}
      bridge.closeDialog();await loadData(true);bridge.setView("communities");say("Community created and saved to Supabase.");
    }catch(error){say(safeError(error,"Could not create the community."));}
  }
  function openCommunity(communityId){
    const s=appState(),item=(s&&s.backendCommunities||[]).find(row=>String(row.id)===String(communityId));
    if(!item)return say("This community is no longer available.");
    const mine=item.createdBy===getUser().id;
    const body="<div class='wa-community-detail'><h3>"+esc(item.name)+"</h3><p>"+esc(item.description||"No description yet.")+"</p><small>"+(mine?"Created by you":item.joined?"You are a member":"Public community")+"</small></div>";
    const footer="<button class='secondary-button' data-action='close-dialog'>Close</button>"+(item.joined?"<button class='primary-button' data-dialog-action='leave-community' data-community-id='"+esc(item.id)+"'>Leave community</button>":"<button class='primary-button' data-dialog-action='join-community' data-community-id='"+esc(item.id)+"'>Join community</button>");
    bridge.openDialog("Community",body,footer);
  }
  async function setCommunityMembership(communityId,join){
    const me=getUser();if(!me||!me.isSupabase)return;
    try{
      if(join){
        const community=(appState().backendCommunities||[]).find(c=>String(c.id)===String(communityId));
        const role=community&&community.createdBy===me.id?"owner":"member";
        const {error}=await db.from("whatsapp_community_members").insert({community_id:communityId,user_id:me.id,role});
        if(error&&error.code!=="23505")throw error;
      }else{
        const {error}=await db.from("whatsapp_community_members").delete().eq("community_id",communityId).eq("user_id",me.id);
        if(error)throw error;
      }
      bridge.closeDialog();await loadData(true);bridge.setView("communities");say(join?"Joined the community.":"Left the community.");
    }catch(error){say(safeError(error,"Could not update community membership."));}
  }

  function createDeviceKey(){
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,character=>{
      const random=Math.random()*16|0;
      return (character==="x"?random:(random&3|8)).toString(16);
    });
  }
  function getDeviceKey(username){
    const keyName="wa_linked_device_key_"+String(username||"").toLowerCase();
    try{
      let key=localStorage.getItem(keyName);
      if(!key){key=crypto.randomUUID?crypto.randomUUID():createDeviceKey();localStorage.setItem(keyName,key);}
      return key;
    }catch(_){return createDeviceKey();}
  }
  function getDeviceName(){
    const ua=String(navigator.userAgent||"");
    const os=/Android/i.test(ua)?"Android":/iPhone|iPad|iPod/i.test(ua)?"iOS":/Windows/i.test(ua)?"Windows":/Mac OS|Macintosh/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"Browser";
    const browser=/Edg\//i.test(ua)?"Edge":/Firefox\//i.test(ua)?"Firefox":/OPR\//i.test(ua)?"Opera":/Chrome\//i.test(ua)?"Chrome":/Safari\//i.test(ua)?"Safari":"Browser";
    return (os+" · "+browser).slice(0,80);
  }
  async function registerCurrentDevice(){
    const me=getUser();
    if(!db||!me||!me.isSupabase)return true;
    const deviceKey=getDeviceKey(me.username),identity=me.id+":"+deviceKey;
    if(deviceSyncIdentity===identity&&deviceHeartbeatTimer!==null)return true;
    if(deviceHeartbeatTimer!==null)clearInterval(deviceHeartbeatTimer);
    const payload={user_id:me.id,device_key:deviceKey,device_name:getDeviceName(),user_agent:String(navigator.userAgent||"").slice(0,300),last_seen_at:new Date().toISOString()};
    const {data,error}=await db.from("whatsapp_linked_devices").upsert(payload,{onConflict:"user_id,device_key"}).select("id,revoked_at").single();
    if(error)throw error;
    if(data&&data.revoked_at){
      say("This browser session was signed out from Linked devices.");
      if(window.waBackendLogout)await window.waBackendLogout();
      return false;
    }
    deviceSyncIdentity=identity;
    deviceHeartbeatTimer=setInterval(async()=>{
      const current=getUser();
      if(!current||!current.isSupabase||current.id!==me.id)return;
      try{
        const {data:row,error:updateError}=await db.from("whatsapp_linked_devices").update({last_seen_at:new Date().toISOString()}).eq("user_id",me.id).eq("device_key",deviceKey).select("id,revoked_at").maybeSingle();
        if(updateError||!row)return;
        if(row.revoked_at){
          clearInterval(deviceHeartbeatTimer);deviceHeartbeatTimer=null;deviceSyncIdentity="";
          say("This device was signed out from another session.");
          if(window.waBackendLogout)await window.waBackendLogout();
        }
      }catch(_){}
    },60000);
    return true;
  }
  async function openLinkedDevices(){
    const me=getUser();
    if(!me||!me.isSupabase)return say("Sign in to manage this account's linked browser sessions.");
    try{
      if(!(await registerCurrentDevice()))return;
      const {data,error}=await db.from("whatsapp_linked_devices").select("id,device_key,device_name,created_at,last_seen_at,revoked_at").eq("user_id",me.id).is("revoked_at",null).order("last_seen_at",{ascending:false}).limit(30);
      if(error)throw error;
      const currentKey=getDeviceKey(me.username);
      const rows=(data||[]).map(device=>{
        const active=String(device.device_key)===String(currentKey);
        const seen=new Date(device.last_seen_at||device.created_at);
        const lastSeen=Number.isNaN(seen.getTime())?"Unknown":seen.toLocaleString();
        return "<div class='linked-device-card'>"+bridge.icon("monitor")+"<div><strong>"+esc(device.device_name||"Browser")+(active?" · This device":"")+"</strong><span>"+(active?"Current signed-in browser":"Linked browser session")+"</span><small>Last active: "+esc(lastSeen)+"</small></div><button class='danger-button' data-action='revoke-linked-device' data-device-key='"+esc(device.device_key)+"'>"+(active?"Sign out":"Sign out")+"</button></div>";
      }).join("");
      bridge.openDialog("Linked devices","<p class='screen-description'>These are browser sessions signed into this app account. Signing one out marks that session for revocation; it checks the change during its next active sync.</p><div class='wa-linked-device-list'>"+(rows||"<div class='empty-state'>No linked browser sessions are registered yet.</div>")+"</div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");
    }catch(error){say(safeError(error,"Could not load linked browser devices."));}
  }
  async function revokeLinkedDevice(deviceKey){
    const me=getUser();
    if(!me||!me.isSupabase||!deviceKey)return;
    try{
      const {data,error}=await db.from("whatsapp_linked_devices").update({revoked_at:new Date().toISOString()}).eq("user_id",me.id).eq("device_key",deviceKey).is("revoked_at",null).select("device_key").maybeSingle();
      if(error)throw error;
      if(!data)throw new Error("That device is no longer linked.");
      const own=String(deviceKey)===String(getDeviceKey(me.username));
      bridge.closeDialog();
      if(own){say("Signing out this device.");if(window.waBackendLogout)await window.waBackendLogout();return;}
      say("Device sign-out requested. It will sign out when it next syncs.");
      await openLinkedDevices();
    }catch(error){say(safeError(error,"Could not sign out that device."));}
  }

  function openChannel(channelId){
    const me=getUser(),s=appState();
    const channel=(s&&s.backendChannels||[]).find(c=>String(c.id)===String(channelId));
    if(!channel)return say("This channel is no longer available.");
    activeChannelId=channel.id;
    const posts=(s.backendChannelPosts||[]).filter(p=>String(p.channelId)===String(channel.id));
    const items=posts.map(post=>{
      const date=new Date(post.createdAt),label=Number.isNaN(date.getTime())?"":date.toLocaleString();
      return "<article class='wa-channel-post'><header><strong>"+(post.isMine?"You":"Channel owner")+"</strong><small>"+esc(label)+"</small></header><p>"+esc(post.body)+"</p>"+(post.isMine?"<button class='text-danger-button' data-action='delete-channel-post' data-post-id='"+esc(post.id)+"'>Delete post</button>":"")+"</article>";
    }).join("");
    const owner=channel.createdBy===me.id;
    const footer="<button class='secondary-button' data-action='close-dialog'>Close</button>"+(owner?"<button class='primary-button' data-action='new-channel-post' data-channel-id='"+esc(channel.id)+"'>Write post</button>":"");
    bridge.openDialog(channel.name,"<div class='wa-channel-detail'><p>"+esc(channel.description||"No description")+"</p><div class='wa-channel-feed'>"+(items||"<div class='empty-state'>No posts yet.</div>")+"</div></div>",footer);
  }
  function openNewChannelPost(channelId){
    const channel=(appState().backendChannels||[]).find(c=>String(c.id)===String(channelId||activeChannelId));
    if(!channel||channel.createdBy!==getUser().id)return say("Only the channel owner can publish posts.");
    activeChannelId=channel.id;
    bridge.openDialog("Publish to "+channel.name,"<div class='dialog-field'><label for='channel-post-body'>Post</label><textarea id='channel-post-body' maxlength='2000' rows='5' placeholder='Write a channel update…'></textarea></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='publish-channel-post' data-channel-id='"+esc(channel.id)+"'>Publish post</button>");
  }
  async function publishChannelPost(channelId){
    const me=getUser(),channel=(appState().backendChannels||[]).find(c=>String(c.id)===String(channelId||activeChannelId));
    const body=String($("#channel-post-body")?.value||"").trim();
    if(!me||!me.isSupabase||!channel)return;
    if(!body)return say("Write a post before publishing.");
    if(body.length>2000)return say("Channel posts are limited to 2,000 characters.");
    try{
      const {error}=await db.from("whatsapp_channel_posts").insert({channel_id:channel.id,author_id:me.id,body});
      if(error)throw error;
      activeChannelId=channel.id;bridge.closeDialog();await loadData(true);openChannel(channel.id);say("Channel post published.");
    }catch(error){say(safeError(error,"Could not publish the channel post. Only the channel owner can post."));}
  }
  async function deleteChannelPost(postId){
    const me=getUser(),post=(appState().backendChannelPosts||[]).find(p=>String(p.id)===String(postId));
    if(!me||!me.isSupabase||!post||post.authorId!==me.id)return say("You can delete only your own posts.");
    try{
      const {error}=await db.from("whatsapp_channel_posts").delete().eq("id",postId).eq("author_id",me.id);
      if(error)throw error;
      await loadData(true);openChannel(post.channelId);say("Channel post deleted.");
    }catch(error){say(safeError(error,"Could not delete this post."));}
  }

  async function createChannel(){
    const me=getUser();if(!me||!me.isSupabase)return;
    const name=String($("#channel-name")?.value||"").trim().slice(0,70);
    const description=String($("#channel-description")?.value||"").trim().slice(0,500);
    if(!name)return say("Enter a channel name.");
    try{
      const {data,error}=await db.from("whatsapp_channels").insert({name,description,created_by:me.id}).select("id").single();
      if(error)throw error;
      const follow=await db.from("whatsapp_channel_follows").insert({channel_id:data.id,user_id:me.id});
      if(follow.error){try{await db.from("whatsapp_channels").delete().eq("id",data.id).eq("created_by",me.id);}catch(_){}throw follow.error;}
      bridge.closeDialog();await loadData(true);bridge.setView("channels");say("Channel created and followed.");
    }catch(error){say(safeError(error,"Could not create the channel. Channel names must be unique."));}
  }
  async function toggleChannelFollow(channelId){
    const me=getUser();if(!me||!me.isSupabase)return;
    const channel=(appState().backendChannels||[]).find(c=>String(c.id)===String(channelId));
    if(!channel)return say("This channel is no longer available.");
    try{
      if(channel.following){
        const {error}=await db.from("whatsapp_channel_follows").delete().eq("channel_id",channelId).eq("user_id",me.id);
        if(error)throw error;
      }else{
        const {error}=await db.from("whatsapp_channel_follows").insert({channel_id:channelId,user_id:me.id});
        if(error&&error.code!=="23505")throw error;
      }
      await loadData(true);
    }catch(error){say(safeError(error,"Could not update channel follow state."));}
  }
  function openChannelSearch(){
    const body="<p class='screen-description'>Search channels created by users of this app.</p><div class='dialog-field'><label for='channel-search-input'>Search channels</label><input id='channel-search-input' placeholder='Search channels'></div><div id='channel-search-results'></div>";
    bridge.openDialog("Discover channels",body,"<button class='secondary-button' data-action='close-dialog'>Close</button>");
    renderChannelSearchResults("");
  }
  function renderChannelSearchResults(query){
    const result=$("#channel-search-results");if(!result)return;
    const s=appState(),q=String(query||"").trim().toLowerCase();
    const channels=(s&&s.backendChannels||[]).filter(c=>!q||(c.name+" "+c.description).toLowerCase().includes(q));
    result.innerHTML=channels.length?channels.map(c=>"<div class='channel-row'>"+bridge.avatarHTML({name:c.name})+"<button class='channel-open-button community-copy' type='button' data-action='open-channel' data-channel-id='"+esc(c.id)+"'><strong>"+esc(c.name)+"</strong><span>"+esc(c.description||"No description")+"</span></button><button class='"+(c.following?"secondary-button":"primary-button")+"' data-action='toggle-channel' data-channel-id='"+esc(c.id)+"'>"+(c.following?"Following":"Follow")+"</button></div>").join(""):"<div class='empty-state'>No matching channels. You can create one from Channels.</div>";
  }

  async function updateProfile(name,about){
    const me=getUser();if(!me||!me.isSupabase)return;
    name=String(name||"").trim().slice(0,48);about=String(about||"Available").trim().slice(0,140)||"Available";
    if(!name)return say("Display name cannot be empty.");
    try{
      const {error}=await db.from("aeroshell_profiles").update({display_name:name,about}).eq("id",me.id);
      if(error)throw error;const s=appState();s.profile.name=name;s.profile.about=about;me.name=name;me.about=about;
      bridge.closeDialog();bridge.saveState();bridge.render();say("Profile saved.");
    }catch(error){say(safeError(error,"Could not save profile."));}
  }
  async function updateAvatar(file){
    const me=getUser();if(!me||!me.isSupabase||!file||!file.type.startsWith("image/"))return;
    if(file.size>8*1024*1024)return say("Choose an image smaller than 8 MB.");
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("Could not read this image."));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});
      const image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error("This image could not be opened."));im.src=String(dataUrl);});
      const canvas=document.createElement("canvas"),ratio=Math.min(1,256/Math.max(image.width,image.height));
      canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
      canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
      let compressed=canvas.toDataURL("image/jpeg",0.76);
      if(compressed.length>58000)compressed=canvas.toDataURL("image/jpeg",0.5);
      if(compressed.length>60000)return say("That image is too large after compression. Choose a simpler photo.");
      const {error}=await db.from("aeroshell_profiles").update({avatar_data:compressed}).eq("id",me.id);if(error)throw error;
      me.avatarData=compressed;const s=appState();s.profile.avatarData=compressed;bridge.saveState();bridge.render();say("Profile photo saved across your signed-in devices.");
    }catch(error){say(safeError(error,"Could not upload the profile photo."));}
  }
  async function createGroup(){
    const me=getUser();if(!me||!me.isSupabase)return say("Sign in to create a shared group.");
    const name=String($("#group-name")?.value||"").trim(),description=String($("#group-description")?.value||"").trim().slice(0,500);
    const memberIds=$$("#group-contact-list input[type=checkbox]:checked").map(el=>el.value).filter(id=>appState().chats.some(c=>String(c.id)===String(id)&&c.type==="person"));
    if(!name)return say("Enter a group name.");
    if(name.length>60)return say("Group names are limited to 60 characters.");
    try{
      const {data,error}=await db.rpc("aeroshell_create_group",{p_name:name,p_avatar_data:null,p_member_ids:memberIds});if(error)throw error;
      if(description&&data){const result=await db.from("aeroshell_groups").update({description}).eq("id",data);if(result.error)throw result.error;}
      bridge.closeDialog();await loadData(true);if(data){bridge.setView("chats");bridge.selectChat(data);}say("Group created and saved to your account.");
    }catch(error){say(safeError(error,"Could not create the group."));}
  }

  async function updateGroup(groupId) {
    const me=getUser();if(!me||!me.isSupabase)return;
    const name=String($("#edit-group-name")?.value||"").trim();
    const description=String($("#edit-group-about")?.value||"").trim().slice(0,500);
    if(!name)return say("Group subject cannot be empty.");
    if(name.length>60)return say("Group subjects are limited to 60 characters.");
    try{
      const {data,error}=await db.from("aeroshell_groups").update({name,description}).eq("id",groupId).select("id").maybeSingle();
      if(error)throw error;if(!data)throw new Error("Only a group admin can change group information.");
      bridge.closeDialog();await loadData(true);bridge.selectChat(groupId);say("Group information saved to Supabase.");
    }catch(error){say(safeError(error,"Could not save group information."));}
  }
  function openAddParticipants() {
    const me=getUser(),chat=bridge.getCurrentChat(),s=appState();
    if(!me||!me.isSupabase||!chat||chat.type!=="group")return say("Open a group to add participants.");
    const already=new Set((chat.participants||[]).map(p=>typeof p==="string"?p:(p.id||"")));
    const candidates=(s.chats||[]).filter(p=>p.type==="person"&&!already.has(p.id));
    const body=candidates.length?candidates.map(p=>"<div class='pick-row'>"+bridge.avatarHTML(p)+"<label for='add-member-"+esc(p.id)+"'>@"+esc(p.username)+"</label><input id='add-member-"+esc(p.id)+"' type='checkbox' value='"+esc(p.id)+"'></div>").join(""):"<div class='empty-state'>All your accepted contacts are already members of this group.</div>";
    bridge.openDialog("Add participants",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='add-group-participants' data-chat-id='"+esc(chat.id)+"' "+(candidates.length?"":"disabled")+">Add selected</button>");
  }
  async function addGroupParticipants(groupId) {
    const me=getUser(),s=appState();
    if(!me||!me.isSupabase)return;
    const ids=$$("#dialog-backdrop input[type=checkbox]:checked").map(el=>el.value).filter(id=>(s.chats||[]).some(c=>String(c.id)===String(id)&&c.type==="person"));
    if(!ids.length)return say("Select at least one accepted contact.");
    try{
      const rows=ids.map(id=>({group_id:groupId,user_id:id,role:"member",added_by:me.id}));
      const {error}=await db.from("aeroshell_group_members").insert(rows);
      if(error)throw error;
      bridge.closeDialog();await loadData(true);bridge.selectChat(groupId);say(ids.length+" participant(s) added to the group.");
    }catch(error){say(safeError(error,"Could not add participants. The current account may not be a group admin."));}
  }

  document.addEventListener("submit",event=>{
    const form=event.target;if(!form||!form.matches("#signup-form,#login-form,#message-form"))return;
    if(form.id===""||form.id==="signup-form"||form.id==="login-form"){event.preventDefault();event.stopImmediatePropagation();form.id==="signup-form"?void signUp(form):void signIn(form);}
    else if(getUser()&&getUser().isSupabase){event.preventDefault();event.stopImmediatePropagation();void sendMessage($("#message-input")?.value||"",bridge.getReplyToMessageId?bridge.getReplyToMessageId():null);}
  },true);
  document.addEventListener("click",event=>{
    const target=event.target.closest("[data-action],[data-dialog-action],[data-setting-option],[data-menu-action],[data-community-id]");if(!target)return;
    const action=target.dataset.action||"",menuAction=target.dataset.menuAction||"",dialogAction=target.dataset.dialogAction||"",me=getUser();
    if(me&&me.isSupabase&&action==="status-preview"){
      event.preventDefault();event.stopImmediatePropagation();openStatus(target.dataset.statusId);return;
    }
    if(me&&me.isSupabase&&(action==="linked-devices"||menuAction==="linked-devices")){
      event.preventDefault();event.stopImmediatePropagation();void openLinkedDevices();return;
    }
    if(me&&me.isSupabase&&action==="revoke-linked-device"){
      event.preventDefault();event.stopImmediatePropagation();void revokeLinkedDevice(target.dataset.deviceKey);return;
    }
    if(me&&me.isSupabase&&dialogAction==="publish-status"){
      event.preventDefault();event.stopImmediatePropagation();void publishStatus();return;
    }
    if(me&&me.isSupabase&&dialogAction==="edit-status"){
      event.preventDefault();event.stopImmediatePropagation();void updateStatus(target.dataset.statusId);return;
    }
    if(me&&me.isSupabase&&dialogAction==="delete-status"){
      event.preventDefault();event.stopImmediatePropagation();void deleteStatus(target.dataset.statusId);return;
    }
    if(me&&me.isSupabase&&dialogAction==="create-community"){
      event.preventDefault();event.stopImmediatePropagation();void createCommunity();return;
    }
    if(me&&me.isSupabase&&target.dataset.communityId&&!dialogAction){
      event.preventDefault();event.stopImmediatePropagation();openCommunity(target.dataset.communityId);return;
    }
    if(me&&me.isSupabase&&target.dataset.communityId&&dialogAction==="join-community"){
      event.preventDefault();event.stopImmediatePropagation();void setCommunityMembership(target.dataset.communityId,true);return;
    }
    if(me&&me.isSupabase&&target.dataset.communityId&&dialogAction==="leave-community"){
      event.preventDefault();event.stopImmediatePropagation();void setCommunityMembership(target.dataset.communityId,false);return;
    }
    if(me&&me.isSupabase&&action==="open-channel"){
      event.preventDefault();event.stopImmediatePropagation();openChannel(target.dataset.channelId);return;
    }
    if(me&&me.isSupabase&&action==="new-channel-post"){
      event.preventDefault();event.stopImmediatePropagation();openNewChannelPost(target.dataset.channelId);return;
    }
    if(me&&me.isSupabase&&dialogAction==="publish-channel-post"){
      event.preventDefault();event.stopImmediatePropagation();void publishChannelPost(target.dataset.channelId);return;
    }
    if(me&&me.isSupabase&&action==="delete-channel-post"){
      event.preventDefault();event.stopImmediatePropagation();void deleteChannelPost(target.dataset.postId);return;
    }
    if(me&&me.isSupabase&&action==="new-channel"){
      event.preventDefault();event.stopImmediatePropagation();bridge.openDialog("Create channel","<div class='dialog-field'><label for='channel-name'>Channel name</label><input id='channel-name' maxlength='70' placeholder='Channel name'></div><div class='dialog-field'><label for='channel-description'>Description</label><textarea id='channel-description' maxlength='500' rows='3' placeholder='What is this channel about?'></textarea></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='create-channel'>Create channel</button>");return;
    }
    if(me&&me.isSupabase&&dialogAction==="create-channel"){
      event.preventDefault();event.stopImmediatePropagation();void createChannel();return;
    }
    if(me&&me.isSupabase&&action==="toggle-channel"){
      event.preventDefault();event.stopImmediatePropagation();void toggleChannelFollow(target.dataset.channelId);return;
    }
    if(me&&me.isSupabase&&action==="channel-search"){
      event.preventDefault();event.stopImmediatePropagation();openChannelSearch();return;
    }
    if(me&&me.isSupabase&&dialogAction==="send-poll"){
      event.preventDefault();event.stopImmediatePropagation();void sendPoll();return;
    }
    if(me&&me.isSupabase&&dialogAction==="send-event"){
      event.preventDefault();event.stopImmediatePropagation();void sendEvent();return;
    }
    if(me&&me.isSupabase&&action==="vote-poll"){
      event.preventDefault();event.stopImmediatePropagation();void votePoll(target.dataset.pollId,target.dataset.optionIndex);return;
    }
    if(me&&me.isSupabase&&action==="event-rsvp"){
      event.preventDefault();event.stopImmediatePropagation();void respondToEvent(target.dataset.eventId);return;
    }
    if(me&&me.isSupabase&&action==="add-participants"){
      event.preventDefault();event.stopImmediatePropagation();openAddParticipants();return;
    }
    if(me&&me.isSupabase&&dialogAction==="save-group"){
      event.preventDefault();event.stopImmediatePropagation();void updateGroup(target.dataset.chatId);return;
    }
    if(me&&me.isSupabase&&dialogAction==="add-group-participants"){
      event.preventDefault();event.stopImmediatePropagation();void addGroupParticipants(target.dataset.chatId);return;
    }
    if(me&&me.isSupabase&&action==="open-attachment"){
      event.preventDefault();event.stopImmediatePropagation();void openAttachment(target.dataset.messageId);return;
    }
    if(me&&me.isSupabase&&(action==="delete-message"||menuAction==="delete-message")){
      event.preventDefault();event.stopImmediatePropagation();void deleteOrHideMessage();return;
    }
    if(me&&me.isSupabase&&action==="logout"){event.preventDefault();event.stopImmediatePropagation();bridge.openDialog("Log out","<p class='screen-description'>Sign out of this device. Your account and server-side conversations will remain saved.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='backend-logout'>Log out</button>");return;}
    if(me&&me.isSupabase&&target.dataset.settingOption==="Change number"){
      event.preventDefault();event.stopImmediatePropagation();
      bridge.openDialog("Change in-app ID","<p class='screen-description'>Changing an ID safely requires a dedicated server-side uniqueness flow. Your current ID remains active; it is not a real phone number.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(me&&me.isSupabase&&target.dataset.settingOption==="Delete account"){
      event.preventDefault();event.stopImmediatePropagation();
      bridge.openDialog("Account deletion is not enabled","<p class='screen-description'>This project shares its Supabase identity system with the Windows 12 Master Chat. Deleting it here could remove access to both apps, so account deletion is not exposed from this frontend.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(me&&me.isSupabase&&target.dataset.settingOption==="Log out"){
      event.preventDefault();event.stopImmediatePropagation();
      bridge.openDialog("Log out","<p class='screen-description'>Sign out of this device. Your account and server-side conversations will remain saved.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='backend-logout'>Log out</button>");return;
    }
    if(me&&me.isSupabase&&target.dataset.requestId&&["accept-request","decline-request","cancel-request"].includes(action)){
      event.preventDefault();event.stopImmediatePropagation();void respondRequest(target.dataset.requestId,action==="accept-request"?"accepted":action==="decline-request"?"declined":"cancel");return;
    }
    if(me&&me.isSupabase&&action==="send-contact-request"){
      event.preventDefault();event.stopImmediatePropagation();const p=people.get(String(target.dataset.contactUsername||"").toLowerCase());if(p)void sendRequest(p);else say("Search for this account again, then send the request.");return;
    }
    if(me&&me.isSupabase&&action==="accept-found-request"){event.preventDefault();event.stopImmediatePropagation();void respondRequest(target.dataset.requestId,"accepted");return;}
    if(me&&me.isSupabase&&action==="open-found-chat"){event.preventDefault();event.stopImmediatePropagation();bridge.selectChat(target.dataset.chatId);bridge.closeDialog();return;}
    if(me&&me.isSupabase&&dialogAction==="save-profile"){event.preventDefault();event.stopImmediatePropagation();void updateProfile($("#edit-name")?.value||"",$("#edit-about")?.value||"");return;}
    if(me&&me.isSupabase&&dialogAction==="save-about"){event.preventDefault();event.stopImmediatePropagation();void updateProfile(appState()?.profile?.name||"",$("#edit-about-quick")?.value||"");return;}
    if(me&&me.isSupabase&&dialogAction==="create-group"){event.preventDefault();event.stopImmediatePropagation();void createGroup();return;}
    if(me&&me.isSupabase&&action==="find-friends"){event.preventDefault();event.stopImmediatePropagation();bridge.handleAction("new-chat",target);return;}
    if(me&&me.isSupabase&&action==="logout"){event.preventDefault();event.stopImmediatePropagation();bridge.openDialog("Log out","<p class='screen-description'>Sign out of this account on this device?</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='backend-logout'>Log out</button>");return;}
    if(me&&me.isSupabase&&dialogAction==="backend-logout"){event.preventDefault();event.stopImmediatePropagation();void window.waBackendLogout();return;}
  },true);

  document.addEventListener("input",event=>{
    const target=event.target;
    if(target&&target.id==="channel-search-input"&&getUser()&&getUser().isSupabase){
      event.stopImmediatePropagation();renderChannelSearchResults(target.value);return;
    }
  },true);
  document.addEventListener("input",event=>{
    const target=event.target;
    if(!target||!["signup-phone","login-identity"].includes(target.id))return;
    event.stopImmediatePropagation();
    const fieldId=target.id, label=$("#"+(fieldId==="signup-phone"?"signup-phone-match":"login-identity-match"));
    const value=target.value;
    if(fieldId==="signup-phone") target.value=String(value||"").replace(/[^\d\s()-]/g,"").slice(0,18);
    const number=canonicalNumber(target.value);
    if(!label)return;
    if(!number){label.textContent=fieldId==="signup-phone"?"Enter nine digits to check whether this app ID is available.":"";return;}
    label.textContent="Checking the shared account directory…";
    void usernameFromNumber(number).then(username=>{
      if(!label.isConnected)return;
      if(fieldId==="signup-phone")label.textContent=username?"This in-app ID belongs to @"+username+". Choose another ID.":"No account currently uses this in-app ID.";
      else label.textContent=username?"In-app ID belongs to @"+username+".":"No account uses this ID; try your username instead.";
    }).catch(error=>{if(label.isConnected)label.textContent=safeError(error,"Custom ID lookup is temporarily unavailable.");});
  },true);
  // Make the Find People action work with both the visible Search button and Enter on mobile keyboards.
  // Reusing the input handler keeps one shared, debounced path for live search and explicit submission.
  document.addEventListener("submit",event=>{
    const form=event.target;
    if(!form||form.id!=="friend-search-form")return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input=$("#friend-search");
    if(input)input.dispatchEvent(new Event("input",{bubbles:true}));
  },true);

    document.addEventListener("change",event=>{const target=event.target;if(target&&target.id==="profile-photo-input"&&target.files&&target.files[0]&&getUser()&&getUser().isSupabase)void updateAvatar(target.files[0]);},true);
  document.addEventListener("click",event=>{
    const target=event.target;
    if(!target||!getUser()||!getUser().isSupabase)return;
    const chatRow=target.closest(".chat-row[data-chat-id]");
    if(!chatRow||target.closest(".row-menu"))return;
    setTimeout(()=>void markReadForChat(bridge.getCurrentChat()),80);
  },true);
  document.addEventListener("change",event=>{
    const target=event.target;
    if(!target||target.id!=="attachment-input"||!target.files||!target.files[0]||!getUser()||!getUser().isSupabase)return;
    event.preventDefault();event.stopImmediatePropagation();
    const file=target.files[0];target.value="";
    void uploadStoredAttachment(file,{type:"file",name:file.name,mime:file.type||"application/octet-stream"});
  },true);
  document.addEventListener("click",event=>{
    const control=event.target.closest("[data-wa-recording-action]");
    if(!control||!getUser()||!getUser().isSupabase)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(control.dataset.waRecordingAction==="cancel"){
      recorderStopReason="cancel";stopVoiceRecording("cancel");
    }else if(control.dataset.waRecordingAction==="send"){
      stopVoiceRecording("send");
    }
  },true);
  document.addEventListener("click",event=>{
    const button=event.target.closest(".send-button");
    if(!button||!getUser()||!getUser().isSupabase)return;
    const input=$("#message-input");
    if(input&&input.value.trim())return;
    event.preventDefault();event.stopImmediatePropagation();void startVoiceRecording();
  },true);
  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();window.__waInstallPrompt=event;
    if(!$("#install-app-button")){const button=document.createElement("button");button.id="install-app-button";button.type="button";button.className="install-app-button";button.textContent="Install app";const foot=$(".auth-card-footer");(foot||document.body).insertAdjacentElement("beforebegin",button);}
    $("#install-app-button").hidden=false;
  });
  window.addEventListener("appinstalled",()=>{window.__waInstallPrompt=null;say("App installed.");});
  document.addEventListener("click",event=>{
    const button=event.target.closest("#install-app-button,[data-action='install-app']");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const prompt=window.__waInstallPrompt;
    if(prompt){prompt.prompt();prompt.userChoice.finally(()=>{window.__waInstallPrompt=null;button.hidden=true;});}
    else say("Install this app from the browser menu: Install app or Add to Home Screen.");
  },true);
  window.addEventListener("pagehide",()=>{if(recorder&&recorder.state!=="inactive")try{recorder.stop();}catch(_){}cleanupRecorder();},{once:true});
  window.waBackendLogout=async()=>{
    if(deviceHeartbeatTimer!==null)clearInterval(deviceHeartbeatTimer);deviceHeartbeatTimer=null;deviceSyncIdentity="";
    if(liveChannel&&db)try{await db.removeChannel(liveChannel);}catch(_){}
    if(presenceChannel&&db)try{await db.removeChannel(presenceChannel);}catch(_){}
    presenceChannel=null;presenceUserId="";
    liveChannel=null;liveUserId="";if(window.WhatsAppCalls)window.WhatsAppCalls.cleanup();
    try{await db.auth.signOut();}catch(_){}
    const root=$("#app-screen"),auth=$("#auth-screen");if(root)root.classList.add("hidden");if(auth)auth.classList.remove("hidden");
    try{localStorage.removeItem("wa_frontend_session_v2");}catch(_){}
    location.reload();
  };
  bridge.supabase=db;bridge.isBackendReady=()=>!!db;bridge.loadBackendData=()=>loadData(false);
  bridge.sendBackendMessage=sendMessage;bridge.searchBackendPeople=searchPeople;bridge.requestBackend=sendRequest;bridge.markAllBackendRead=markAllRead;
  bridge.hideBackendMessage=hideMessageForMe;bridge.deleteBackendMessage=deleteMessageForEveryone;bridge.editBackendMessage=editMessage;bridge.forwardBackendMessage=forwardMessage;bridge.reactBackendMessage=toggleMessageReaction;
  window.waBackendEnablePush=enableDevicePush;
  window.waBackendUpdatePushPreferences=updateDevicePushPreferences;
  window.waBackendTestCallPush=testCallPush;
  window.waBackendOpenLinkedDevices=openLinkedDevices;
  window.waBackend={client:db,load:()=>loadData(false),safeError,searchPeople,sendMessage,hideMessageForMe,deleteMessageForEveryone,editMessage,forwardMessage,toggleMessageReaction,markAllRead,enableDevicePush,updateDevicePushPreferences,testCallPush,openLinkedDevices,revokeLinkedDevice};
  function finishStartup(showAuth) {
    const root = $("#app-screen");
    const auth = $("#auth-screen");
    const boot = $("#boot-screen");
    if (showAuth) {
      if (root) root.classList.add("hidden");
      if (auth) auth.classList.remove("hidden");
    } else {
      if (auth) auth.classList.add("hidden");
      if (root) root.classList.remove("hidden");
    }
    if (boot) boot.hidden = true;
    if (document.body) document.body.classList.remove("wa-booting");
    try { window.dispatchEvent(new Event("wa-startup-finished")); } catch (_) {}
  }
  async function bootstrap(){
    if(!db){
      finishStartup(true);
      say("Supabase client did not load. Refresh the page and check your internet connection.");
      return;
    }
    try{
      const {data,error}=await withTimeout(db.auth.getSession(),12000,"Signing in took too long. Check your internet connection and try again.");
      if(error)throw error;
      if(data&&data.session&&data.session.user)await withTimeout(hydrate(data.session.user),18000,"WhatsApp took too long to load your chats. The app will open and you can retry.");
      const restored=!!(getUser()&&getUser().isSupabase);
      finishStartup(!restored);
      db.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"){if(window.WhatsAppCalls)window.WhatsAppCalls.cleanup();return;}
        if(event==="SIGNED_IN"&&session&&session.user&&(!getUser()||!getUser().isSupabase))void hydrate(session.user).catch(e=>say(safeError(e,"Could not load your account.")));
      });
    }catch(error){
      const restored=!!(getUser()&&getUser().isSupabase);
      finishStartup(!restored);
      say(safeError(error,"Could not restore your Supabase session."));
    }
  }
  void bootstrap();
})();