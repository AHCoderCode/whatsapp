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
  let busy = false, loading = false, searchTimer = null, searchCounter = 0;

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
    const body=row.body||(row.attachment_name?"📎 "+row.attachment_name:row.message_type==="voice"?"🎤 Voice message":"");
    return {id:row.id,from:row.sender_id===me.id?"me":"them",text:body,
      time:stamp.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),
      date:stamp.toDateString()===new Date().toDateString()?"TODAY":stamp.toLocaleDateString(),
      createdAt:row.created_at,status:"sent",reactions:[],sender:row.sender_id===me.id?"You":(chat&&chat.name)||"Member",
      attachmentType:row.message_type==="voice"?"voice":row.message_type==="file"?"file":null};
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
    }
  }
  function subscribe(userId) {
    if(!db||!userId||(liveChannel&&liveUserId===userId))return;
    if(liveChannel)void db.removeChannel(liveChannel);
    liveUserId=userId;
    liveChannel=db.channel("whatsapp-main-"+userId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"aeroshell_messages"},e=>insertMessageIntoUI(e.new))
      .on("postgres_changes",{event:"*",schema:"public",table:"aeroshell_friend_requests"},()=>void loadData(true))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"aeroshell_profiles",filter:"id=eq."+userId},()=>void loadData(true))
      .subscribe();
  }
  async function loadData(quiet) {
    const me=getUser(),s=appState();
    if(!db||!me||!me.isSupabase||!s||loading)return;
    loading=true;
    try{
      const [profileResult,requestResult,membershipResult,messageResult,callResult]=await Promise.all([
        db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").eq("id",me.id).maybeSingle(),
        db.from("aeroshell_friend_requests").select("id,requester_id,recipient_id,status,created_at,responded_at").or("requester_id.eq."+me.id+",recipient_id.eq."+me.id).order("created_at",{ascending:false}).limit(300),
        db.from("aeroshell_group_members").select("group_id,role").eq("user_id",me.id),
        db.from("aeroshell_messages").select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path").or("sender_id.eq."+me.id+",recipient_id.eq."+me.id).order("created_at",{ascending:true}).limit(800),
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
          db.from("aeroshell_groups").select("id,name,avatar_data,created_by,updated_at").in("id",groupIds).order("updated_at",{ascending:false}),
          db.from("aeroshell_group_members").select("group_id,user_id,role").in("group_id",groupIds),
          db.from("aeroshell_messages").select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path").in("group_id",groupIds).order("created_at",{ascending:true}).limit(800)
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
      for(const row of all){
        const cid=row.group_id||(row.sender_id===me.id?row.recipient_id:row.sender_id),chat=chatMap.get(cid);
        if(!chat)continue;
        const msg=localMessage(row,me,chat);chat.messages.push(msg);chat.preview=msg.text;chat.time=msg.time;chat.lastOutgoing=msg.from==="me";chat.lastMessageType=row.message_type||"text";
      }
      chats.sort((a,b)=>(Date.parse(b.messages.at(-1)?.createdAt||0)-Date.parse(a.messages.at(-1)?.createdAt||0))||String(a.name).localeCompare(String(b.name)));
      const received=relations.filter(r=>r.status==="pending"&&r.recipient_id===me.id).map(r=>Object.assign({},profileById.get(r.requester_id)||{id:r.requester_id,username:"user",name:"User",phone:"",avatar:"U",avatarColor:1},{id:r.id,requestUserId:r.requester_id,recipientId:r.recipient_id,status:"received",note:"Would like to connect",time:new Date(r.created_at).toLocaleString()}));
      const sent=relations.filter(r=>r.status==="pending"&&r.requester_id===me.id).map(r=>Object.assign({},profileById.get(r.recipient_id)||{id:r.recipient_id,username:"user",name:"User",phone:"",avatar:"U",avatarColor:1},{id:r.id,requestUserId:r.recipient_id,recipientId:r.recipient_id,status:"sent",time:new Date(r.created_at).toLocaleString()}));
      const calls=(callResult.data||[]).map(r=>{const peer=profileById.get(r.caller_id===me.id?r.callee_id:r.caller_id);return{id:r.id,name:peer?peer.name:"Contact",username:peer?peer.username:"",time:new Date(r.created_at).toLocaleString(),type:r.caller_id===me.id?"outgoing":"incoming",avatar:peer?peer.avatar:1,mediaType:r.media_type,status:r.status};});
      bridge.setBackendData({profile:{username:self.username,name:self.name,phone:self.phone,about:self.about,avatar:self.avatar,avatarColor:self.avatarColor,avatarData:self.avatarData},chats,requests:received,sentRequests:sent,calls});
      subscribe(me.id);
      if(window.WhatsAppCalls)window.WhatsAppCalls.subscribe();
    }catch(error){if(!quiet)say(safeError(error,"Could not load messaging data from Supabase."));}
    finally{loading=false;}
  }
  async function hydrate(authUser){
    const {data,error}=await db.from("aeroshell_profiles").select("id,username,display_name,about,custom_number,avatar_data,created_at").eq("id",authUser.id).maybeSingle();
    if(error)throw error;if(!data)throw new Error("No messaging profile exists for this account. Sign out and create a messaging account.");
    const sessionUser=Object.assign({},authUser,{isSupabase:true});
    bridge.setBackendUser(sessionUser,data);
    await loadData(false);
  }
  async function signUp(form){
    if(!db||busy)return;
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
    if(!db||busy)return;
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
      const {data,error}=await db.from("aeroshell_messages").insert(payload).select("id,sender_id,recipient_id,group_id,body,message_type,created_at,attachment_name,attachment_path").single();
      if(error)throw error;if(data)insertMessageIntoUI(data);
      const input=$("#message-input");if(input){input.value="";input.style.height="";input.dispatchEvent(new Event("input",{bubbles:true}));}
    }catch(error){say(safeError(error,"Message was not delivered."));}
    finally{if(button)button.disabled=false;}
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
    const name=String($("#group-name")?.value||"").trim();
    const memberIds=$$("#group-contact-list input[type=checkbox]:checked").map(el=>el.value).filter(id=>appState().chats.some(c=>String(c.id)===String(id)&&c.type==="person"));
    if(!name)return say("Enter a group name.");
    try{const {data,error}=await db.rpc("aeroshell_create_group",{p_name:name,p_avatar_data:null,p_member_ids:memberIds});if(error)throw error;bridge.closeDialog();await loadData(true);if(data){bridge.setView("chats");bridge.selectChat(data);}say("Group created for your contacts.");}
    catch(error){say(safeError(error,"Could not create the group."));}
  }
  document.addEventListener("submit",event=>{
    const form=event.target;if(!form||!form.matches("#signup-form,#login-form,#message-form"))return;
    if(form.id===""||form.id==="signup-form"||form.id==="login-form"){event.preventDefault();event.stopImmediatePropagation();form.id==="signup-form"?void signUp(form):void signIn(form);}
    else if(getUser()&&getUser().isSupabase){event.preventDefault();event.stopImmediatePropagation();void sendMessage($("#message-input")?.value||"");}
  },true);
  document.addEventListener("click",event=>{
    const target=event.target.closest("[data-action],[data-dialog-action]");if(!target)return;
    const action=target.dataset.action||"",dialogAction=target.dataset.dialogAction||"",me=getUser();
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
  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();window.__waInstallPrompt=event;
    if(!$("#install-app-button")){const button=document.createElement("button");button.id="install-app-button";button.type="button";button.className="install-app-button";button.textContent="Install app";const foot=$(".auth-card-footer");(foot||document.body).insertAdjacentElement("beforebegin",button);}
    $("#install-app-button").hidden=false;
  });
  window.addEventListener("appinstalled",()=>{window.__waInstallPrompt=null;say("App installed.");});
  document.addEventListener("click",event=>{
    const button=event.target.closest("#install-app-button");if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const prompt=window.__waInstallPrompt;
    if(prompt){prompt.prompt();prompt.userChoice.finally(()=>{window.__waInstallPrompt=null;button.hidden=true;});}
    else say("Install this app from the browser menu: Install app or Add to Home Screen.");
  },true);
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