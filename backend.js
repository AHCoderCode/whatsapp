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
  const usernamePattern = /^[a-z0-9_]{3,20}$/;
  let signedProfile = null, liveChannel = null, liveUserId = "", people = new Map();
  let busy = false, loading = false, refreshQueued = false, searchTimer = null, searchCounter = 0;

  const getUser = () => bridge.getCurrentUser();
  const appState = () => bridge.getState();
  const say = message => bridge.toast(message);
  const safeError = (error, fallback) => {
    const m = String(error && error.message || "");
    if (/invalid login credentials/i.test(m)) return "Username or in-app number or password is incorrect.";
    if (/duplicate key|unique constraint|aeroshell_profiles_username_key|custom_number_uidx/i.test(m)) return "That username or custom app ID is already taken. Choose another.";
    if (/email not confirmed/i.test(m)) return "Email confirmation is enabled. In Supabase Auth, switch OFF Confirm email, then sign up again with a new username.";
    if (/row-level security|permission denied|not allowed/i.test(m)) return "Supabase rejected that request under its security rules. Check the README backend checklist; do not disable row-level security.";
    return m || fallback || "Something went wrong. Check your connection and try again.";
  };
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
    if(!db||!me||!me.isSupabase)return [];
    let query=String(value||"").trim().replace(/^@+/,"").toLowerCase();
    if(canonicalNumber(query)){query=await usernameFromNumber(query);if(!query)return [];}
    query=query.replace(/[^a-z0-9_]/g,"");
    if(query.length<3||query.length>20)return [];
    const {data,error}=await db.rpc("aeroshell_search_profiles",{search_query:query});
    if(error)throw error;
    return (data||[]).filter(p=>p.id!==me.id).map(row=>{
      const p=mapProfile(row);
      if(p){p.name=p.username;p.phone="";p.about=""; }
      return p;
    }).filter(Boolean).slice(0,8);
  }
  function localMessage(row, me, chat) {
    const stamp=new Date(row.created_at);
    const body=row.message_type==="voice"?"🎤 Voice message":(row.body||(row.attachment_name?"📎 "+row.attachment_name:""));
    return {id:row.id,from:row.sender_id===me.id?"me":"them",text:body,
      time:stamp.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),
      date:stamp.toDateString()===new Date().toDateString()?"TODAY":stamp.toLocaleDateString(),
      createdAt:row.created_at,status:"sent",reactions:[],sender:row.sender_id===me.id?"You":(chat&&chat.name)||"Member",
      attachmentType:row.message_type==="voice"?"voice":row.message_type==="file"?"file":null,
      attachmentName:row.attachment_name||"",attachmentPath:row.attachment_path||"",
      attachmentMime:row.attachment_mime||"",attachmentSize:Number(row.attachment_size||0),
      messageType:row.message_type||"text",voiceDurationMs:Number(row.voice_duration_ms||0)};
  }
  function insertMessageIntoUI(row) {
    const me=getUser(), s=appState();
    if(!me||!me.isSupabase||!s||!row)return;
    const id=row.group_id||(row.sender_id===me.id?row.recipient_id:row.sender_id);
    let chat=s.chats.find(c=>String(c.id)===String(id));
    if(!chat){void loadData(true);return;}
    if(chat.messages.some(m=>String(m.id)===String(row.id)))return;
    const msg=localMessage(row,me,chat);
    chat.messages.push(msg);chat.preview=msg.text;chat.time=msg.time;
    chat.lastOutgoing=msg.from==="me";chat.lastMessageType=row.message_type||"text";
    if(msg.from==="them"&&String(bridge.getSelectedChatId?bridge.getSelectedChatId():"")!==String(chat.id))chat.unread=(chat.unread||0)+1;
    bridge.renderSidebar();
    if(String(bridge.getSelectedChatId?bridge.getSelectedChatId():"")===String(chat.id)){
      bridge.renderMain();requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;});
      if(msg.from==="them")void markReadForChat(chat);
    }
  }
  function subscribe(userId) {
    if(!db||!userId||(liveChannel&&liveUserId===userId))return;
    if(liveChannel)void db.removeChannel(liveChannel);
    liveUserId=userId;
    liveChannel=db.channel("whatsapp-main-"+userId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_messages"},e=>insertMessageIntoUI(e.new))
      .on("postgres_changes",{event:"*",schema:"public",table:"aeroshell_friend_requests"},()=>void loadData(true))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_message_reads"},()=>void loadData(true))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"whatsapp_polls"},()=>void loadData(true))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"whatsapp_events"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_poll_votes"},()=>void loadData(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_event_rsvps"},()=>void loadData(true))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"aeroshell_profiles",filter:"id=eq."+userId},()=>void loadData(true))
      .subscribe();
  }
  async function loadData(quiet) {
    const me=getUser(),s=appState();
    if(!db||!me||!me.isSupabase||!s)return;
    if(loading){refreshQueued=true;return;}
    loading=true;
    try{
      const [profileResult,requestResult,membershipResult,messageResult,callResult]=await Promise.all([
        db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").eq("id",me.id).maybeSingle(),
        db.from("aeroshell_friend_requests").select("id,requester_id,recipient_id,status,created_at,responded_at").or("requester_id.eq."+me.id+",recipient_id.eq."+me.id).order("created_at",{ascending:false}).limit(300),
        db.from("aeroshell_group_members").select("group_id,role").eq("user_id",me.id),
        db.from("aeroshell_messages").select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms").or("sender_id.eq."+me.id+",recipient_id.eq."+me.id).order("created_at",{ascending:true}).limit(800),
        db.from("aeroshell_calls").select("id,caller_id,callee_id,status,created_at,media_type").or("caller_id.eq."+me.id+",callee_id.eq."+me.id).order("created_at",{ascending:false}).limit(100)
      ]);
      for(const result of [profileResult,requestResult,membershipResult,messageResult])if(result.error)throw result.error;
      if(!profileResult.data)throw new Error("Your profile is missing. Sign out and create a new account after applying the Supabase profile migration.");
      signedProfile=profileResult.data;
      const self=mapProfile(profileResult.data);
      me.name=self.name;me.phone=self.phone;me.about=self.about;me.avatarData=self.avatarData;
      const relations=requestResult.data||[];
      const friends=Array.from(new Set(relations.filter(r=>r.status==="accepted").map(r=>r.requester_id===me.id?r.recipient_id:r.requester_id)));
      const memberships=membershipResult.data||[], groupIds=Array.from(new Set(memberships.map(r=>r.group_id)));
      const relatedIds=Array.from(new Set(friends.concat(relations.flatMap(r=>[r.requester_id,r.recipient_id]).filter(id=>id!==me.id))));
      let groups=[],roster=[],groupMessages=[];
      if(groupIds.length){
        const [g,m,gm]=await Promise.all([
          db.from("aeroshell_groups").select("id,name,avatar_data,created_by,updated_at,description").in("id",groupIds).order("updated_at",{ascending:false}),
          db.from("aeroshell_group_members").select("group_id,user_id,role").in("group_id",groupIds),
          db.from("aeroshell_messages").select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms").in("group_id",groupIds).order("created_at",{ascending:true}).limit(800)
        ]);
        if(g.error)throw g.error;if(m.error)throw m.error;if(gm.error)throw gm.error;
        groups=g.data||[];roster=m.data||[];groupMessages=gm.data||[];
        relatedIds.push(...roster.map(r=>r.user_id).filter(id=>id!==me.id));
      }
      const uniqueIds=Array.from(new Set(relatedIds)).filter(id=>id!==me.id);
      let profileRows=[];
      if(uniqueIds.length){
        const pr=await db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").in("id",uniqueIds);
        if(pr.error)throw pr.error;profileRows=pr.data||[];
      }
      const mapped=[self].concat(profileRows.map(mapProfile).filter(Boolean));
      const profileById=new Map(mapped.map(p=>[p.id,p]));
      const chats=friends.map(id=>{
        const p=profileById.get(id);return p?Object.assign({},p,{id:p.id,backendId:p.id,type:"person",messages:[],attachments:[],unread:0,time:"",preview:"",lastMessageType:"text",archived:false,locked:false,participants:[]}):null;
      }).filter(Boolean);
      const roleByGroup=new Map(memberships.map(x=>[x.group_id,x.role])),counts=new Map();
      roster.forEach(r=>counts.set(r.group_id,(counts.get(r.group_id)||0)+1));
      for(const g of groups)chats.push({id:g.id,backendId:g.id,groupId:g.id,type:"group",name:g.name,username:"",phone:"",about:"",avatar:initials(g.name),avatarColor:colorFor(g.name),avatarData:g.avatar_data||"",messages:[],attachments:[],unread:0,time:"",preview:"Group conversation",lastMessageType:"text",archived:false,locked:false,participants:roster.filter(m=>m.group_id===g.id).map(m=>profileById.get(m.user_id)).filter(Boolean),memberCount:counts.get(g.id)||1,groupRole:roleByGroup.get(g.id)||"member",createdBy:g.created_by});
      const all=Array.from(new Map((messageResult.data||[]).concat(groupMessages).map(m=>[m.id,m])).values()).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
      const chatMap=new Map(chats.map(c=>[c.id,c]));
      const readSet=new Set();
      const ownMessageIds=all.filter(row=>row.sender_id===me.id).map(row=>row.id);
      if(ownMessageIds.length){
        const readResult=await db.from("aeroshell_message_reads").select("message_id,user_id").in("message_id",ownMessageIds).neq("user_id",me.id);
        if(!readResult.error)(readResult.data||[]).forEach(row=>readSet.add(row.message_id));
      }
      const messageIds=all.map(row=>row.id);
      let pollRows=[],eventRows=[],voteRows=[],rsvpRows=[];
      if(messageIds.length){
        const [pollResult,eventResult]=await Promise.all([
          db.from("whatsapp_polls").select("id,message_id,created_by,question,options,created_at").in("message_id",messageIds),
          db.from("whatsapp_events").select("id,message_id,created_by,title,starts_at,created_at").in("message_id",messageIds)
        ]);
        if(pollResult.error)throw pollResult.error;
        if(eventResult.error)throw eventResult.error;
        pollRows=pollResult.data||[];eventRows=eventResult.data||[];
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
      const votesByPoll=new Map(),rsvpsByEvent=new Map();
      voteRows.forEach(row=>{const list=votesByPoll.get(row.poll_id)||[];list.push(row);votesByPoll.set(row.poll_id,list);});
      rsvpRows.forEach(row=>{const list=rsvpsByEvent.get(row.event_id)||[];list.push(row);rsvpsByEvent.set(row.event_id,list);});
      for(const row of all){
        const cid=row.group_id||(row.sender_id===me.id?row.recipient_id:row.sender_id),chat=chatMap.get(cid);
        if(!chat)continue;
        const msg=localMessage(row,me,chat);
        if(row.sender_id===me.id&&readSet.has(row.id))msg.status="read";
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
      void markReadForChat(bridge.getCurrentChat());
      const received=relations.filter(r=>r.status==="pending"&&r.recipient_id===me.id).map(r=>Object.assign({},profileById.get(r.requester_id)||{id:r.requester_id,username:"user",name:"User",phone:"",avatar:"U",avatarColor:1},{id:r.id,requestUserId:r.requester_id,recipientId:r.recipient_id,status:"received",note:"Would like to connect",time:new Date(r.created_at).toLocaleString()}));
      const sent=relations.filter(r=>r.status==="pending"&&r.requester_id===me.id).map(r=>Object.assign({},profileById.get(r.recipient_id)||{id:r.recipient_id,username:"user",name:"User",phone:"",avatar:"U",avatarColor:1},{id:r.id,requestUserId:r.recipient_id,recipientId:r.recipient_id,status:"sent",time:new Date(r.created_at).toLocaleString()}));
      const calls=(callResult.data||[]).map(r=>{const peer=profileById.get(r.caller_id===me.id?r.callee_id:r.caller_id);return{id:r.id,contactId:peer?peer.id:"",name:peer?peer.name:"Contact",username:peer?peer.username:"",time:new Date(r.created_at).toLocaleString(),type:r.caller_id===me.id?"outgoing":"incoming",avatar:peer?peer.avatar:1,mediaType:r.media_type,status:r.status};});
      bridge.setBackendData({profile:{username:self.username,name:self.name,phone:self.phone,about:self.about,avatar:self.avatar,avatarColor:self.avatarColor,avatarData:self.avatarData},chats,requests:received,sentRequests:sent,calls});
      subscribe(me.id);
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
  async function sendMessage(value){
    const me=getUser(),chat=bridge.getCurrentChat(),body=String(value||"").trim();
    if(!me||!me.isSupabase){say("Sign in with a Supabase account to send real messages.");return;}
    if(!chat||!body)return;if(body.length>2000)return say("Messages are limited to 2,000 characters.");
    const button=$(".send-button");if(button)button.disabled=true;
    try{
      const payload={sender_id:me.id,recipient_id:chat.type==="group"?null:chat.id,group_id:chat.type==="group"?chat.id:null,body,message_type:"text"};
      const {data,error}=await db.from("aeroshell_messages").insert(payload).select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms").single();
      if(error)throw error;if(data)insertMessageIntoUI(data);
      const input=$("#message-input");if(input){input.value="";input.style.height="";input.dispatchEvent(new Event("input",{bubbles:true}));}
    }catch(error){say(safeError(error,"Message was not delivered."));}
    finally{if(button)button.disabled=false;}
  }

  const ATTACHMENT_BUCKET = "master-chat-attachments";
  let recorder = null, recorderStream = null, recorderChunks = [], recorderStartedAt = 0, recorderChatId = null, recorderStopReason = "";
  function currentSelectedChat() {
    const selected = bridge.getCurrentChat();
    return selected && selected.id ? selected : null;
  }
  async function markReadForChat(chat) {
    const me=getUser();
    if(!me||!me.isSupabase||!chat||!Array.isArray(chat.messages))return;
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
    if(mime.startsWith("video/"))return say("Video attachments are not enabled by the current secure storage policy. Choose a photo or document instead.");
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
        .select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path,attachment_mime,attachment_size,voice_duration_ms").single();
      if(error)throw error;
      if(data)insertMessageIntoUI(data);
      if(!isVoice)say("Attachment sent.");
      else say("Voice message sent.");
    }catch(error){
      try{await db.storage.from(ATTACHMENT_BUCKET).remove([path]);}catch(_){}
      say(safeError(error,"Attachment upload failed. Check your connection and try again."));
    }
  }
  async function openAttachment(messageId) {
    const me=getUser(), s=appState();
    if(!me||!me.isSupabase||!s)return;
    const chat=(s.chats||[]).find(c=>(c.messages||[]).some(m=>String(m.id)===String(messageId)));
    const message=chat&&(chat.messages||[]).find(m=>String(m.id)===String(messageId));
    if(!message||!message.attachmentPath)return say("The attachment is not available in this chat.");
    try{
      const {data,error}=await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(message.attachmentPath,120);
      if(error||!data||!data.signedUrl)throw error||new Error("Could not create a private attachment link.");
      const url=esc(data.signedUrl),name=esc(message.attachmentName||"Attachment"),mime=String(message.attachmentMime||"");
      let preview="";
      if(mime.startsWith("image/"))preview="<img class='wa-attachment-preview' src='"+url+"' alt='"+name+"'>";
      else if(mime.startsWith("audio/"))preview="<audio class='wa-attachment-audio' controls preload='none' src='"+url+"'></audio>";
      bridge.openDialog("Shared attachment","<div class='wa-attachment-dialog'>"+preview+"<p>"+name+"</p><a class='primary-button' href='"+url+"' target='_blank' rel='noopener noreferrer'>Open / download attachment</a><small>This private link expires in about two minutes.</small></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");
    }catch(error){say(safeError(error,"This private attachment could not be opened."));}
  }
  async function startVoiceRecording() {
    const me=getUser(),chat=currentSelectedChat();
    if(!me||!me.isSupabase)return say("Sign in to record and send a voice note.");
    if(!chat)return say("Open a conversation first.");
    if(recorder)return stopVoiceRecording();
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
        const activeRecorder=recorder;
        const blobType=(activeRecorder&&activeRecorder.mimeType)||mimeType||"audio/webm";
        const duration=Math.max(1,Math.min(120000,Date.now()-recorderStartedAt));
        const blob=new Blob(recorderChunks,{type:blobType});
        const ext=blobType.includes("mp4")?"m4a":blobType.includes("ogg")?"ogg":"webm";
        const stillSameChat=currentSelectedChat()&&String(currentSelectedChat().id)===String(recorderChatId);
        if(recorderStream)recorderStream.getTracks().forEach(t=>t.stop());
        recorderStream=null;recorder=null;recorderChunks=[];
        const button=$(".send-button"), input=$("#message-input");
        if(button){button.classList.remove("recording");button.innerHTML=bridge.icon("mic");button.title="Record voice message";button.setAttribute("aria-label","Record voice message");}
        if(input){input.disabled=false;input.placeholder="Type a message";}
        if(recorderStopReason==="error"){say("Voice recording failed.");return;}
        if(!stillSameChat){say("Voice note cancelled because the conversation changed.");return;}
        void uploadStoredAttachment(blob,{type:"voice",name:"voice-note."+ext,mime:blobType,durationMs:duration});
      };
      recorder.start(250);
      const button=$(".send-button"),input=$("#message-input");
      if(button){button.classList.add("recording");button.innerHTML="■";button.title="Stop recording and send";button.setAttribute("aria-label","Stop recording and send voice message");}
      if(input){input.disabled=true;input.placeholder="Recording… tap the red square to send";}
      say("Recording voice message. Tap the red button to send; the maximum length is two minutes.");
      window.waVoiceLimit=setTimeout(()=>{if(recorder&&recorder.state!=="inactive"){recorderStopReason="limit";stopVoiceRecording();say("Two-minute recording limit reached.");}},120000);
    }catch(error){
      if(recorderStream)recorderStream.getTracks().forEach(t=>t.stop());
      recorderStream=null;recorder=null;
      say(error&&error.name==="NotAllowedError"?"Microphone permission was denied. Allow microphone access in your browser settings and try again.":safeError(error,"Could not start voice recording."));
    }
  }
  function stopVoiceRecording(){
    if(window.waVoiceLimit){clearTimeout(window.waVoiceLimit);window.waVoiceLimit=null;}
    if(recorder&&recorder.state!=="inactive"){try{recorder.stop();}catch(_){cleanupRecorder();}}
  }
  function cleanupRecorder(){
    if(window.waVoiceLimit){clearTimeout(window.waVoiceLimit);window.waVoiceLimit=null;}
    if(recorderStream)recorderStream.getTracks().forEach(t=>t.stop());
    recorderStream=null;recorder=null;recorderChunks=[];
    const button=$(".send-button"),input=$("#message-input");
    if(button){button.classList.remove("recording");button.innerHTML=bridge.icon("mic");button.title="Record voice message";}
    if(input){input.disabled=false;input.placeholder="Type a message";}
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
    const memberIds=$("#group-contact-list input[type=checkbox]:checked").map(el=>el.value).filter(id=>appState().chats.some(c=>String(c.id)===String(id)&&c.type==="person"));
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
    const ids=$("#dialog-backdrop input[type=checkbox]:checked").map(el=>el.value).filter(id=>(s.chats||[]).some(c=>String(c.id)===String(id)&&c.type==="person"));
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
    else if(getUser()&&getUser().isSupabase){event.preventDefault();event.stopImmediatePropagation();void sendMessage($("#message-input")?.value||"");}
  },true);
  document.addEventListener("click",event=>{
    const target=event.target.closest("[data-action],[data-dialog-action],[data-setting-option],[data-menu-action]");if(!target)return;
    const action=target.dataset.action||"",menuAction=target.dataset.menuAction||"",dialogAction=target.dataset.dialogAction||"",me=getUser();
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
    if(me&&me.isSupabase&&dialogAction==="create-group"){event.preventDefault();event.stopImmediatePropagation();void createGroup();return;}
    if(me&&me.isSupabase&&action==="find-friends"){event.preventDefault();event.stopImmediatePropagation();bridge.handleAction("new-chat",target);return;}
    if(me&&me.isSupabase&&action==="logout"){event.preventDefault();event.stopImmediatePropagation();bridge.openDialog("Log out","<p class='screen-description'>Sign out of this account on this device?</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='backend-logout'>Log out</button>");return;}
    if(me&&me.isSupabase&&dialogAction==="backend-logout"){event.preventDefault();event.stopImmediatePropagation();void window.waBackendLogout();return;}
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
  document.addEventListener("input",event=>{
    const target=event.target;if(!target||target.id!=="friend-search"||!getUser()||!getUser().isSupabase)return;
    event.stopImmediatePropagation();clearTimeout(searchTimer);
    const value=target.value;const result=$("#friend-lookup-result");if(!result)return;
    searchTimer=setTimeout(async()=>{
      const seq=++searchCounter;
      if(String(value||"").trim().length<3){result.innerHTML="";return;}
      result.innerHTML="<div class='empty-state'>Searching verified accounts…</div>";
      try{
        const found=await searchPeople(value);if(seq!==searchCounter||!$("#friend-lookup-result"))return;
        if(!found.length){result.innerHTML="<div class='empty-state'>No account matched that username or in-app ID.</div>";return;}
        result.innerHTML=found.map(p=>{
          const s=appState(),friend=s.chats.some(c=>String(c.id)===String(p.id));
          const incoming=(s.requests||[]).find(r=>r.requestUserId===p.id||r.username===p.username);
          const sent=(s.sentRequests||[]).some(r=>r.requestUserId===p.id||r.username===p.username);
          const action=friend?"<button class='secondary-button' data-action='open-found-chat' data-chat-id='"+esc(p.id)+"'>Open chat</button>":
            incoming?"<button class='primary-button' data-action='accept-found-request' data-request-id='"+esc(incoming.id)+"'>Accept request</button>":
            sent?"<button class='secondary-button' disabled>Request sent</button>":
            "<button class='primary-button' data-action='send-contact-request' data-contact-username='"+esc(p.username)+"'>Send contact request</button>";
          return "<div class='request-card'>"+bridge.avatarHTML(p)+"<div class='request-info'><strong>@"+esc(p.username)+"</strong><span>Verified in-app account</span></div>"+action+"</div>";
        }).join("");
      }catch(error){if($("#friend-lookup-result"))result.innerHTML="<div class='empty-state'>"+esc(safeError(error,"Search failed."))+"</div>";}
    },220);
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
    if(liveChannel&&db)try{await db.removeChannel(liveChannel);}catch(_){}
    liveChannel=null;liveUserId="";if(window.WhatsAppCalls)window.WhatsAppCalls.cleanup();
    try{await db.auth.signOut();}catch(_){}
    const root=$("#app-screen"),auth=$("#auth-screen");if(root)root.classList.add("hidden");if(auth)auth.classList.remove("hidden");
    try{localStorage.removeItem("wa_frontend_session_v2");}catch(_){}
    location.reload();
  };
  bridge.supabase=db;bridge.isBackendReady=()=>!!db;bridge.loadBackendData=()=>loadData(false);
  bridge.sendBackendMessage=sendMessage;bridge.searchBackendPeople=searchPeople;bridge.requestBackend=sendRequest;
  window.waBackend={client:db,load:()=>loadData(false),safeError};
  async function bootstrap(){
    if(!db){say("Supabase client did not load. Refresh the page and check your internet connection.");return;}
    try{
      const {data,error}=await db.auth.getSession();if(error)throw error;
      if(data&&data.session&&data.session.user){await hydrate(data.session.user);}
      else if(!(getUser()&&getUser().demoAccount)){
        $("#app-screen")?.classList.add("hidden");$("#auth-screen")?.classList.remove("hidden");
      }
      db.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"){if(window.WhatsAppCalls)window.WhatsAppCalls.cleanup();return;}
        if(event==="SIGNED_IN"&&session&&session.user&&(!getUser()||!getUser().isSupabase))void hydrate(session.user).catch(e=>say(safeError(e,"Could not load your account.")));
      });
    }catch(error){say(safeError(error,"Could not restore your Supabase session."));}
  }
  void bootstrap();
})();