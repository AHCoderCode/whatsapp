(() => {
  "use strict";

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const STORE_KEY = "wa_frontend_db_v2";
  const SESSION_KEY = "wa_frontend_session_v2";
  const app = $("#app-screen");
  const auth = $("#auth-screen");
  const authSlot = $("#auth-form-slot");
  const main = $("#main-pane");
  const sidebar = $("#chat-sidebar");
  const list = $("#chat-list");
  const overlayRoot = $("#overlay-root");
  const toastRoot = $("#toast-root");
  let authMode = "signup";
  let view = "chats";
  let filter = "all";
  let selectedChatId = null;
  let settingsTab = "account";
  let settingsQuery = "";
  let searchQuery = "";
  let archivedMode = false;
  let menuChatId = null;
  let toastTimer = null;
  let state = null;
  let currentUser = null;
  let attachmentFile = null;
  let demoDirectory = [];
  let replyingTo = null;
  let selectedMessage = null;
  let messageHoldTimer = null;
  let messageHoldRow = null;
  let messageHoldStart = null;
  let messageHoldTriggered = false;
  let messageReactionPickerOpen = false;
  let forwardDraft = null;
  const settingsTabs = [
    ["account","key","Account"],["privacy","shield","Privacy"],["chats","chat","Chats"],
    ["notifications","bell","Notifications"],["personalization","palette","Appearance"],
    ["storage","database","Storage and data"],["accessibility","users","Accessibility"],
    ["language","globe","App language"],["help","help","Help"],["shortcuts","keyboard","Keyboard shortcuts"]
  ];
  const settingDescriptions = {
    account:[
      ["key","Security notifications","Get notified when security codes change.","toggle"],
      ["shield","Two-step verification","Add an extra layer of security to your account.","button"],
      ["phone","Change number","Change the phone number linked to your account.","button"],
      ["database","Request account info","Request a report of your account information.","button"],
      ["log-out","Log out","Sign out on this device.","button"]
    ],
    privacy:[
      ["lock","Last seen and online","Control who can see when you’re online.","Everyone"],
      ["image","Profile photo","Choose who can see your profile photo.","My contacts"],
      ["info","About","Choose who can see your About.","Everyone"],
      ["status","Status","Manage status privacy.","My contacts"],
      ["checks","Read receipts","Show read receipts in one-to-one chats.","toggle"],
      ["users","Groups","Choose who can add you to groups.","My contacts"],
      ["lock","App lock","Require a lock to open the app.","toggle"],
      ["clock","Disappearing messages","Set a default message timer.","Off"]
    ],
    chats:[
      ["palette","Theme","Choose light, dark or system theme.","Light"],
      ["image","Wallpaper","Set the chat wallpaper.","Default"],
      ["archive","Keep chats archived","Archived chats stay archived when new messages arrive.","toggle"],
      ["database","Chat backup","Download the conversations and profile loaded in this app.","button"],
      ["image","Media visibility","Show downloaded media in your device gallery.","toggle"],
      ["keyboard","Enter is send","Press Enter to send messages.","toggle"]
    ],
    notifications:[
      ["bell","Messages","Show device notifications for incoming messages.","toggle"],
      ["users","Groups","Show device notifications for group messages.","toggle"],
      ["phone","Calls","Show device notifications for incoming calls.","toggle"],
      ["phone","Ringtone","Choose a built-in tone or select an MP3 for incoming calls.","ringer"],
      ["sparkles","Reaction notifications","Show notifications when someone reacts to messages.","toggle"]
    ],
    personalization:[
      ["palette","Theme","Choose light or dark appearance.","toggle-theme"],
      ["image","Chat wallpaper","Change the conversation wallpaper.","wallpaper"],
      ["sparkles","Accent color","WhatsApp green accent theme.","Green"]
    ],
    storage:[
      ["database","Manage storage","Review storage for this app.","button"],
      ["image","Manage media","Manage media shared in your account's conversations.","button"],
      ["download","Media auto-download","Choose when media should download.","button"],
      ["database","Network usage","Network usage details are not available here.","button"]
    ],
    accessibility:[
      ["help","Reduce motion","Limit interface animations.","toggle"],
      ["users","Keyboard navigation","Navigate the interface with a keyboard.","toggle"],
      ["palette","High contrast","Improve contrast in the interface.","toggle"]
    ],
    language:[
      ["globe","App language","Language used in this preview.","English"],
      ["globe","Spell check","Browser spell-check while typing.","toggle"]
    ],
    help:[
      ["help","Help center","Browse common questions.","button"],
      ["phone","Contact us","Contact support (preview only).","button"],
      ["file","Terms and privacy policy","Review the app's privacy details.","button"],
      ["info","App info","WhatsApp · v1.0","button"]
    ],
    shortcuts:[
      ["new","New chat","Ctrl + Alt + N","Ctrl + Alt + N"],
      ["users","New group","Ctrl + Alt + Shift + N","Ctrl + Alt + Shift + N"],
      ["search","Search chats","Ctrl + Alt + Shift + F","Ctrl + Alt + Shift + F"],
      ["settings","Settings","Ctrl + Alt + ,","Ctrl + Alt + ,"],
      ["x","Close chat","Escape","Escape"]
    ]
  };

  function icon(name, cls) {
    return "<svg" + (cls ? " class='" + cls + "'" : "") + " viewBox='0 0 24 24' aria-hidden='true'><use href='#i-" + esc(name) + "'></use></svg>";
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function linkifyText(value) {
    const safe=esc(value);
    return safe.replace(/(?:https?:\/\/|www\.)[^\s<]+/gi,match=>{
      let url=match,suffix="";
      while(/[.,!?;:)]$/.test(url)){suffix=url.slice(-1)+suffix;url=url.slice(0,-1);}
      if(!url)return match;
      const href=/^https?:\/\//i.test(url)?url:"https://"+url;
      return "<a class='message-link' href='"+href+"' target='_blank' rel='noopener noreferrer'>"+url+"</a>"+suffix;
    });
  }
  function uid(prefix) { return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8); }
  function normalizeUsername(value) { return String(value || "").trim().toLowerCase().replace(/^@/, ""); }
  function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
  function nowTime() { return new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit", hour12:true}); }
  function dayLabel(date = new Date()) {
    const day = new Date(date);
    const today = new Date(); today.setHours(0,0,0,0);
    const labelDay = new Date(day); labelDay.setHours(0,0,0,0);
    const delta = Math.round((today.getTime() - labelDay.getTime()) / 86400000);
    if (delta === 0) return "TODAY";
    if (delta === 1) return "YESTERDAY";
    return day.toLocaleDateString([], {month:"short", day:"numeric", ...(day.getFullYear() !== today.getFullYear() ? {year:"numeric"} : {})});
  }
  // New accounts start empty; this factory is only for explicit create/accept actions.
  function seedChat(id,name,username,phone,avatar,type,time,preview,unread,favorite,pinned,online,messages,extra) {
    const contactName = String(name || "Contact");
    return Object.assign({
      id:String(id), name:contactName, username:normalizeUsername(username), phone:String(phone || ""),
      avatar:avatar || initials(contactName), type:type || "person", time:"", preview:"", unread:0,
      favorite:!!favorite, pinned:!!pinned, online:!!online, muted:false, archived:false, locked:false,
      about:"Available", participants:[], messages:[], attachments:[]
    }, extra || {});
  }
  function defaultChats() { return []; }
  function defaultRequests() { return []; }
  function freshDb() { return {version:3,accounts:[],directory:[]}; }
  // Browser-only accounts are obsolete; authentication is handled by Supabase.
  function readDb() { return freshDb(); }
  let db = readDb();
  function saveDb() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (_) { toast("Browser storage is full; some demo changes may not persist."); }
  }
  function stateKey(username) { return "wa_local_state_" + normalizeUsername(username); }
  function createUserState(user) {
    return {
      profile:{username:user.username,name:user.name,phone:user.phone,about:user.about || "Available",avatar:user.avatar || initials(user.name),avatarColor:user.avatarColor || 2},
      chats:defaultChats(),
      requests:defaultRequests(),
      sentRequests:[],
      contacts:[],
      calls:[],
      backendStatuses:[],backendChannels:[],backendChannelPosts:[],backendCommunities:[],
      communities:[],
      channels:[],
      settings:{dark:false,wallpaper:"default",readReceipts:true,keepArchived:true,enterToSend:true,mediaVisibility:true,appLock:false,reduceMotion:false,keyboardNav:true,highContrast:false,spellcheck:true,reactionNotifications:true,securityNotifications:true,messageNotifications:false,groupNotifications:false,callNotifications:false},
      starredMessages:[],
      blocked:[],
      archived:[],
      locked:[],
      statusUpdates:[],
      customLists:[]
    };
  }
  function loadState(user) {
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey(user.username)) || "null");
      if (saved && Array.isArray(saved.chats) && saved.profile) {
        const defaults = createUserState(user);
        const merged = Object.assign(defaults, saved, {profile:Object.assign(defaults.profile,saved.profile),settings:Object.assign(defaults.settings,saved.settings || {})});
        // One-time cleanup for requests that were previously shipped as fake demo data.
        // Genuine locally-created requests use generated IDs, not r1/r2/r3.
        const demoRequestIds = new Set(["r1","r2","r3"]);
        const originalRequests = Array.isArray(merged.requests) ? merged.requests : [];
        merged.requests = originalRequests.filter(request => !(
          demoRequestIds.has(String(request && request.id)) &&
          ["bilal.k","hira.m","mina.s"].includes(normalizeUsername(request && request.username))
        ));
        if (merged.requests.length !== originalRequests.length) {
          try { localStorage.setItem(stateKey(user.username), JSON.stringify(merged)); } catch (_) {}
        }
        return merged;
      }
    } catch (_) {}
    const created = createUserState(user);
    saveState(created,user.username);
    return created;
  }
  function saveState(s = state, username = currentUser && currentUser.username) {
    if (!s || !username) return;
    try {
      if (currentUser && currentUser.isSupabase) {
        const localPrefs = { version: 3, profile: { username: s.profile.username, name: s.profile.name, phone: s.profile.phone, about: s.profile.about },
          settings: s.settings || {}, starredMessages: [], blocked: s.blocked || [], archived: [], locked: [], customLists: s.customLists || [] };
        localStorage.setItem(stateKey(username), JSON.stringify(localPrefs));
      } else localStorage.setItem(stateKey(username), JSON.stringify(s));
    } catch (_) { toast("Could not save all changes to browser storage."); }
  }
  function initials(name) { return String(name || "User").trim().split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join("") || "U"; }
  function generatePhone() {
    const used = new Set(db.accounts.map(a=>normalizePhone(a.phone)));
    for (let i=0;i<100;i++) {
      const n = String(Math.floor(100000000 + Math.random()*899999999));
      const phone = "+990 " + n.slice(0,3) + " " + n.slice(3,6) + " " + n.slice(6);
      if (!used.has(normalizePhone(phone))) return phone;
    }
    return "+990 799 999 999";
  }
  function showAuthError(message) {
    const el = $("#auth-error", authSlot);
    if (el) { el.textContent=message; el.classList.add("show"); }
  }
  function authField(id,label,type,placeholder,value,help,extra) {
    return "<div class='form-field'><label for='" + esc(id) + "'>" + esc(label) + "</label><input id='" + esc(id) + "' name='" + esc(id) + "' type='" + esc(type || "text") + "' placeholder='" + esc(placeholder || "") + "' value='" + esc(value || "") + "'" + (extra || "") + ">" + (help ? "<span class='field-help'>" + help + "</span>" : "") + "</div>";
  }
  function renderAuth(mode) {
    authMode = mode || authMode;
    $$(".auth-tab").forEach(tab => {
      const active = tab.dataset.authMode === authMode;
      tab.classList.toggle("active",active);
      tab.setAttribute("aria-selected",active?"true":"false");
    });
    const phone = generatePhone();
    if (authMode === "signup") {
      authSlot.innerHTML = "<h2 class='auth-heading'>Create your account</h2><p class='auth-subheading'>Create an account to find people by username or in-app ID. Your chats and contact requests sync through the shared messaging service.</p>" +
        "<form class='auth-form' id='signup-form' novalidate>" +
        "<div id='auth-error' class='form-error' role='alert'></div>" +
        authField("signup-name","Your display name","text","How people see you","","This can be changed later.","autocomplete='name' maxlength='48' required") +
        authField("signup-username","Username","text","Choose a unique username","","3–20 characters: letters, numbers or underscores. Other people can find you by this.","autocomplete='username' maxlength='20' required") +
        "<div class='form-field'><label for='signup-phone'>Your in-app ID</label><div class='phone-field-wrap'><span class='phone-prefix'>" + icon("phone") + "+990</span><input id='signup-phone' name='phone' type='tel' value='" + esc(phone.replace("+990 ","")) + "' inputmode='numeric' autocomplete='tel-national' required></div><span class='field-help'>This is an in-app ID, not a telephone number. You can share it to help people find your account.</span><span class='form-username-match' id='signup-phone-match'></span></div>" +
        authField("signup-password","Password","password","At least 8 characters","","Use a unique password and do not share it.","autocomplete='new-password' minlength='8' required") +
        authField("signup-confirm","Confirm password","password","Type your password again","","","autocomplete='new-password' minlength='8' required") +
        "<div class='form-error' id='signup-error' role='alert'></div><button class='auth-primary' type='submit'>Create account " + icon("chevron") + "</button></form>";
      const phoneInput = $("#signup-phone");
      if (phoneInput) phoneInput.addEventListener("input", () => {
        phoneInput.value = phoneInput.value.replace(/[^0-9\s()-]/g,"").slice(0,18);
        const label = $("#signup-phone-match");
        if (label) label.textContent = "This ID will be checked when you create your account.";
      });
    } else {
      authSlot.innerHTML = "<h2 class='auth-heading'>Welcome back</h2><p class='auth-subheading'>Log in with the username you registered for this messaging app.</p>" +
        "<form class='auth-form' id='login-form' novalidate><div class='form-error' id='login-error' role='alert'></div>" +
        authField("login-identity","Username or in-app ID","text","@username or +990 ID","","Use your username or custom in-app ID.","autocomplete='username' required") +
        "<div id='login-identity-match' class='form-username-match'></div>" +
        authField("login-password","Password","password","Enter your password","","","autocomplete='current-password' required") +
        "<button class='auth-primary' type='submit'>Log in " + icon("chevron") + "</button></form>";
    }
  }
  function lookupIdentity(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const normalizedName = normalizeUsername(raw);
    const normalizedNumber = normalizePhone(raw);
    const all = db.accounts.concat(db.directory);
    return all.find(u => normalizeUsername(u.username) === normalizedName) ||
      (normalizedNumber.length >= 7 ? all.find(u => normalizePhone(u.phone) === normalizedNumber) : null) || null;
  }
  function lookupDirectory(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const phoneDigits = normalizePhone(raw);
    const name = normalizeUsername(raw);
    return db.accounts.concat(db.directory).find(u => normalizeUsername(u.username) === name) ||
      (phoneDigits.length >= 7 ? db.accounts.concat(db.directory).find(u => normalizePhone(u.phone) === phoneDigits) : null) ||
      db.accounts.concat(db.directory).find(u => String(u.name || "").toLowerCase().includes(raw.toLowerCase())) || null;
  }
  // Never create or authenticate browser-only accounts. If the Supabase module is unavailable,
  // fail clearly rather than silently opening a fake local account.
  function handleSignup() {
    const error = $("#signup-error") || $("#auth-error", authSlot);
    if (error) { error.textContent = "Secure account service is unavailable. Refresh the page and try again."; error.classList.add("show"); }
  }
  function handleLogin() {
    const error = $("#login-error");
    if (error) { error.textContent = "Secure account service is unavailable. Refresh the page and try again."; error.classList.add("show"); }
  }
  function logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    currentUser = null; state = null; selectedChatId = null; view = "chats";
    app.classList.add("hidden"); auth.classList.remove("hidden"); renderAuth("login");
  }
  function findChat(id) { return state && state.chats.find(c=>String(c.id)===String(id)); }
  function currentChat() { return findChat(selectedChatId); }
  function findContact(name) {
    return state.chats.find(c=>normalizeUsername(c.username)===normalizeUsername(name) || normalizeUsername(c.name)===normalizeUsername(name)) ||
      db.accounts.find(u=>normalizeUsername(u.username)===normalizeUsername(name)) ||
      db.directory.find(u=>normalizeUsername(u.username)===normalizeUsername(name)) || null;
  }
  function avatarHTML(obj,sizeClass) {
    const avatar = Number(obj && (obj.avatarColor || obj.avatar)) || 1;
    const label = obj && typeof obj.avatar === "string" ? obj.avatar : (obj && obj.initials ? obj.initials : initials(obj && obj.name));
    const initialsText = esc(label);
    const photo = obj && obj.avatarData ? "<img class='avatar-image' src='"+esc(obj.avatarData)+"' alt=''>" : initialsText;
    return "<span class='avatar av" + avatar + (sizeClass ? " " + sizeClass : "") + "' aria-hidden='true'>" + photo + "</span>";
  }
  function save() { saveState(); renderSidebar(); updateCounts(); }
  function updateCounts() {
    const unread = state ? state.chats.filter(c=>!c.archived && c.unread>0).length : 0;
    const requests = state ? state.requests.filter(r=>r.status==="received").length : 0;
    const railChat = $("#rail-chat-count"), railRequest = $("#rail-request-count"), stripCount = $("#requests-strip-count"), mobileCount = $("#mobile-chat-count");
    if (railChat) { railChat.textContent=unread ? String(unread) : ""; railChat.style.display=unread?"grid":"none"; }
    if (railRequest) { railRequest.textContent=requests ? String(requests) : ""; railRequest.style.display=requests?"grid":"none"; }
    if (stripCount) { stripCount.textContent=String(requests); stripCount.style.display=requests?"grid":"none"; }
    if (mobileCount) { mobileCount.textContent=unread ? String(unread) : ""; mobileCount.style.display=unread?"grid":"none"; }
    const ac = $("#archived-count"); if (ac) ac.textContent=state.chats.filter(c=>c.archived).length;
    const strip = $("#requests-strip"); if (strip) strip.style.borderColor=requests?"#d3ece2":"#e2eeea";
  }
  function getFilteredChats() {
    return state.chats.filter(chat => {
      if (archivedMode) { if (!chat.archived) return false; }
      else if (chat.archived) return false;
      else {
        if (filter==="unread" && !chat.unread) return false;
        if (filter==="favorites" && !chat.favorite) return false;
        if (filter==="groups" && chat.type!=="group") return false;
        if (filter==="locked" && !chat.locked) return false;
      }
      const q = (searchQuery || "").trim().toLowerCase();
      if (q && ![chat.name,chat.username,chat.phone,chat.preview].join(" ").toLowerCase().includes(q)) return false;
      return true;
    }).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  }
  function renderSidebar() {
    const title = $("#sidebar-title");
    if (title) title.textContent = view==="chats" ? (archivedMode?"Archived":"Chats") : view==="requests" ? "Contact requests" : view==="profile" ? "Profile" : view==="settings" ? "Settings" : view==="calls" ? "Calls" : view==="updates" ? "Updates" : view==="communities" ? "Communities" : view==="channels" ? "Channels" : view==="starred" ? "Starred messages" : view==="archived" ? "Archived" : view==="locked" ? "Locked chats" : "Chats";
    const isChatList = ["chats","archived","locked"].includes(view);
    $("#chat-search-row").style.display = isChatList ? "flex" : "none";
    $("#chat-filter-row").style.display = isChatList && !archivedMode && view==="chats" ? "flex" : "none";
    $("#requests-strip").style.display = isChatList && !archivedMode && view==="chats" ? "flex" : "none";
    $$(".filter-chip").forEach(b=>{b.classList.toggle("active",b.dataset.filter===filter&&!archivedMode);b.setAttribute("aria-pressed",b.dataset.filter===filter&&!archivedMode?"true":"false");});
    $("#sidebar-list-scroll").style.display = isChatList ? "block" : "none";
    $("#chat-list").style.display = isChatList ? "block" : "none";
    if (!isChatList) { updateCounts(); return; }
    const rows = getFilteredChats();
    if (!rows.length) {
      list.innerHTML = "<div class='empty-state'>" + (searchQuery?"No chats found.":"Nothing to show here yet.") + "</div>";
    } else {
      list.innerHTML = rows.map(chat=>{
        const meta = [];
        if(chat.pinned) meta.push("<span class='meta-icon' title='Pinned'>" + icon("pin") + "</span>");
        if(chat.muted) meta.push("<span class='meta-icon' title='Muted'>" + icon("mute") + "</span>");
        if(chat.unread>0) meta.push("<span class='unread-badge'>" + chat.unread + "</span>");
        const checks = chat.lastOutgoing ? "<span class='preview-check'>" + icon("checks") + "</span>" : "";
        const preview = chat.lastMessageType==="attachment" ? "📎 " + chat.preview : chat.preview;
        return "<div class='chat-row" + (selectedChatId===chat.id&&view==="chats"?" selected":"") + "' data-chat-id='" + esc(chat.id) + "' role='listitem' tabindex='0' aria-label='Open " + esc(chat.name) + "'>" +
          avatarHTML(chat) + "<div class='chat-copy'><div class='chat-line'><span class='chat-name'>" + esc(chat.name) + "</span><span class='chat-time" + (chat.unread>0?" unread":"") + "'>" + esc(chat.time || "") + "</span></div>" +
          "<div class='chat-line'><div class='chat-preview'>" + checks + "<span class='preview-text'>" + esc(preview) + "</span></div><div class='chat-meta'>" + meta.join("") + "</div></div></div>" +
          "<button class='row-menu' data-action='row-menu' data-chat-id='" + esc(chat.id) + "' aria-label='Chat options'>" + icon("more") + "</button></div>";
      }).join("");
    }
    updateCounts();
  }
  function setView(next) {
    if (next !== "chats") { dismissMessageSelection(false); replyingTo = null; }
    view = next;
    archivedMode = next==="archived";
    selectedChatId = null;
    if (next==="locked") filter="locked"; else if (next==="chats" && filter==="locked") filter="all";
    closePopup(); closeDialog();
    renderSidebar(); renderMain(); updateNav(); updateMobileMode();
  }
  function updateNav() {
    $$(".rail-button[data-view],.mobile-tab[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===view && !(view==="archived" || view==="locked")));
  }
  function updateMobileMode() {
    const isLandscapePhone = window.matchMedia("(max-height:520px) and (orientation:landscape) and (pointer:coarse)").matches;
    const isMobile = window.matchMedia("(max-width:700px)").matches || isLandscapePhone;
    const mainVisible = selectedChatId!==null || view!=="chats";
    app.classList.toggle("mobile-landscape",isLandscapePhone);
    app.classList.toggle("mobile-open",isMobile && mainVisible);
    app.classList.toggle("mobile-section-open",isMobile && selectedChatId===null && view!=="chats");
    app.classList.toggle("mobile-conversation-open",isMobile && selectedChatId!==null);
  }
  function messageHTML(message, chat) {
    const outgoing = message.from==="me";
    const sender = !outgoing&&chat.type==="group" ? "<span class='message-sender'>" + esc(message.sender || "Group member") + "</span>" : "";
    const time = esc(message.time || "");
    const reactions = message.reactions && message.reactions.length ? "<span class='reaction'>" + esc(message.reactions.join(" ")) + "</span>" : "";
    const isRead=message.status==="read";
    const checks = outgoing ? "<span class='message-read-status " + (isRead?"is-read":"is-delivered") + "' title='" + (isRead?"Read by recipient":"Sent") + "' aria-label='" + (isRead?"Read by recipient":"Sent") + "'>" + icon(isRead?"checks":"check") + "</span>" : "";
    const isVoiceAttachment = message.attachmentType==="voice" || message.messageType==="voice";
    const voiceBars = "<span class='voice-waveform' aria-hidden='true'>" + [9,15,11,19,13,22,10,16,7,18,12,21,9,15,6,13].map((height,index)=>"<i style='--wave-height:"+height+"px;--wave-index:"+index+"'></i>").join("") + "</span>";
    const attachmentAction = message.attachmentPath ? "<button type='button' class='message-attachment-open "+(isVoiceAttachment?"voice-message-open":"")+"' data-action='open-attachment' data-message-id='" + esc(message.id) + "' aria-label='"+(isVoiceAttachment?"Play voice message":"Open attachment")+"'>" + (isVoiceAttachment?"<span class='voice-play-button'>"+icon("play")+"</span>"+voiceBars+"<span class='voice-message-copy'><strong>Voice message</strong><small>Tap to listen</small></span>":icon((message.attachmentMime||"").startsWith("image/")?"image":"file")+"<span>"+esc(message.attachmentName||"Open attachment")+"</span>") + "</button>" : "";
    const pollCard = message.poll ? (function(){
      const p=message.poll, options=Array.isArray(p.options)?p.options:[], counts=Array.isArray(p.counts)?p.counts:[];
      const total=counts.reduce((sum,count)=>sum+Number(count||0),0);
      return "<div class='wa-poll-card'><strong>"+esc(p.question)+"</strong><div class='wa-poll-options'>"+options.map((option,index)=>{
        const count=Number(counts[index]||0),percent=total?Math.round(count*100/total):0;
        const selected=typeof p.myVote==="number"&&p.myVote===index;
        return "<button type='button' class='wa-poll-option "+(selected?"selected":"")+"' data-action='vote-poll' data-poll-id='"+esc(p.id)+"' data-option-index='"+index+"'><span>"+esc(option)+(selected?" ✓":"")+"</span><strong>"+count+"</strong><i style='width:"+percent+"%'></i></button>";
      }).join("")+"</div><small>"+total+" vote"+(total===1?"":"s")+" · Tap an option to vote or change your vote</small></div>";
    })() : "";
    const eventCard = message.event ? (function(){
      const e=message.event,date=new Date(e.startsAt),valid=!Number.isNaN(date.getTime()),going=e.myResponse==="going";
      return "<div class='wa-event-card'><span class='wa-event-kicker'>EVENT</span><strong>"+esc(e.title)+"</strong><span class='wa-event-date'>"+esc(valid?date.toLocaleString():"Date unavailable")+"</span><small>"+Number(e.total||0)+" going"+(Number(e.interested||0)?" · "+Number(e.interested)+" interested":"")+"</small><button type='button' class='primary-button wa-event-rsvp "+(going?"going":"")+"' data-action='event-rsvp' data-event-id='"+esc(e.id)+"'>"+(going?"Going ✓ · Cancel RSVP":"I'm going")+"</button></div>";
    })() : "";
    const textBody = message.poll || message.event || isVoiceAttachment ? "" : linkifyText(message.text);
    const replyQuote = message.replyTo ? "<button type='button' class='message-reply-quote' data-action='jump-to-reply' data-reply-target-id='" + esc(message.replyTo.id) + "'><span class='message-reply-quote-icon'>" + icon("reply") + "</span><span class='message-reply-quote-copy'><strong>" + esc(message.replyTo.sender || "Replied message") + "</strong><span>" + esc(message.replyTo.text || "Message") + "</span></span></button>" : "";
    const forwardedLabel = message.forwarded ? "<span class='forwarded-label'>" + icon("forward") + " Forwarded</span>" : "";
    const selected = selectedMessage && String(selectedMessage.id) === String(message.id) && String(selectedMessage.chatId) === String(chat.id) ? " message-selected" : "";
    const messageLabel = (outgoing ? "You: " : (chat.name || "Contact") + ": ") + String(message.text || message.attachmentName || "Message").slice(0,100);
    return "<div class='message-row " + (outgoing?"outgoing":"incoming") + selected + "' data-message-id='" + esc(message.id) + "' tabindex='0' aria-label='" + esc(messageLabel) + "'><div class='message-bubble'>" + sender + forwardedLabel + replyQuote + "<span class='message-text'>" + textBody + "</span>" + pollCard + eventCard + attachmentAction + "<span class='message-meta'>" + time + checks + "</span>" + reactions + "</div></div>";
  }
  function syncMessageSelectionUI() {
    const bar = $("#message-selection-toolbar", main);
    const header = $(".conversation-header", main);
    const chat = currentChat();
    const active = !!(selectedMessage && chat && String(selectedMessage.chatId) === String(chat.id));
    if (bar) bar.hidden = !active;
    if (header) header.hidden = active;
    $$(".message-row", main).forEach(row => row.classList.toggle("message-selected", active && String(row.dataset.messageId) === String(selectedMessage.id)));
    const count = $("#message-selection-count", main);
    if (count) count.textContent = active ? "1" : "";
    const picker = $("#message-reaction-picker", main);
    if (picker) picker.hidden = !active || !messageReactionPickerOpen;
  }
  function selectMessageForActions(row) {
    messageReactionPickerOpen = false;
    const chat = currentChat();
    if (!chat || !row) return;
    const message = chat.messages.find(m => String(m.id) === String(row.dataset.messageId));
    if (!message) return;
    selectedMessage = { id:message.id, chatId:chat.id, text:String(message.text || ""), from:message.from, time:message.time || "", sender:message.sender || (message.from === "me" ? "You" : chat.name), attachmentName:message.attachmentName || "", replyTo:message.replyTo || null };
    state.lastContextMessage = Object.assign({}, selectedMessage, { chatName:chat.name, avatar:chat.avatar });
    closePopup();
    syncMessageSelectionUI();
  }
  function dismissMessageSelection(keepContext) {
    selectedMessage = null;
    messageReactionPickerOpen = false;
    if (!keepContext && state) state.lastContextMessage = null;
    syncMessageSelectionUI();
  }
  function updateReplyPreview() {
    const box = $("#reply-preview", main);
    const chat = currentChat();
    if (!box) return;
    if (!replyingTo || !chat || String(replyingTo.chatId) !== String(chat.id)) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = "<div class='reply-preview-accent'></div><div class='reply-preview-copy'><strong>Replying to " + esc(replyingTo.sender || "message") + "</strong><span>" + esc(replyingTo.text || "Attachment") + "</span></div><button type='button' class='reply-preview-cancel' data-action='cancel-reply' aria-label='Cancel reply'>" + icon("x") + "</button>";
  }
  function showForwardMessageDialog() {
    const ref = state && state.lastContextMessage;
    if (!ref) { toast("Select a message first."); return; }
    forwardDraft = Object.assign({}, ref);
    dismissMessageSelection(true);
    const targets = (state.chats || []).filter(c => !c.archived && (c.type === "person" || c.type === "group"));
    const body = "<p class='screen-description'>Choose a contact or group to forward this message to.</p><div class='forward-message-preview'><span>" + icon("forward") + "</span><div><strong>Forwarded message</strong><p>" + esc(ref.text || ref.attachmentName || "Attachment") + "</p></div></div>" +
      (targets.length ? "<div class='forward-target-list'>" + targets.map(c => "<button type='button' class='forward-target' data-action='forward-message-to-chat' data-target-chat-id='" + esc(c.id) + "'>" + avatarHTML(c) + "<span><strong>" + esc(c.name || c.username || "Contact") + "</strong><small>" + (c.type === "group" ? "Group" : "@" + esc(c.username || "")) + "</small></span>" + icon("chevron") + "</button>").join("") + "</div>" : "<div class='empty-state'>You need an accepted contact or group before forwarding messages.</div>");
    openDialog("Forward message", body, "<button class='secondary-button' data-action='close-dialog'>Cancel</button>");
  }
  function renderWelcome() {
    main.innerHTML = "<div class='welcome-pane'><div class='welcome-content'><svg class='welcome-art' viewBox='0 0 320 250' aria-hidden='true'><ellipse cx='161' cy='220' rx='112' ry='9' fill='#e0e6e8'/><path d='M61 142c-1-40 39-70 89-70 45 0 79 25 83 60 4 36-31 66-78 69l-30 24 4-26c-40-8-67-29-68-57Z' fill='#d9fdd3'/><path d='M76 139c0-30 31-54 71-54 40 0 72 24 72 54s-32 54-72 54c-10 0-20-1-29-4l-22 14 4-22c-15-10-24-24-24-42Z' fill='#25d366'/><path d='M128 114c-3-5-5-5-8-5s-7 3-8 7c-2 5 2 15 7 23 8 11 18 19 30 25 7 3 13 5 17 4 5-1 8-6 8-10 0-2-1-3-4-5l-10-5c-2-1-3 0-5 2l-4 5c-1 1-2 2-4 1-6-2-12-7-17-12-4-4-7-9-8-12 0-1 0-2 1-3l4-4c1-2 1-3 1-4l-4-7Z' fill='#fff'/></svg><h2>Messaging Web</h2><p>Send and receive messages with ease, right from your computer.</p><div class='welcome-divider'></div>"+((state&&Array.isArray(state.chats)&&state.chats.length===0)?"<div class='wa-empty-actions'><button class='primary-button' data-action='new-chat'>Find people</button><button class='secondary-button' data-action='new-group'>Create group</button></div>":"")+"<div class='welcome-caption'>" + icon("lock") + "<span>Your messages sync through the connected account backend</span></div></div><div class='welcome-footer'>" + icon("lock") + "<span>WhatsApp is an independent messaging app and is not connected to other messaging accounts</span></div></div>";
  }
  function syncComposerButton(input) {
    const field = input || $("#message-input");
    const button = $("#message-form .send-button");
    if (!button || button.classList.contains("recording")) return;
    const hasText = !!(field && String(field.value || "").trim());
    button.innerHTML = icon(hasText ? "send" : "mic");
    button.classList.toggle("voice-mode", !hasText);
    button.title = hasText ? "Send message" : "Record voice message";
    button.setAttribute("aria-label", hasText ? "Send message" : "Record voice message");
  }
  function renderConversation(chat) {
    if (!chat) { renderWelcome(); return; }
    const subtitle = chat.type==="group" ? ((chat.participants||[]).slice(0,5).map(p=>typeof p==="string"?p:(p.name||p.username||"Member")).join(", ") || "Group") : (chat.online ? "online" : "offline");
    const pinned = chat.pinnedMessage ? "<div class='pinned-banner'>" + icon("pin") + "<div class='pinned-copy'><strong>Pinned message</strong><span>" + esc(chat.pinnedMessage.text) + "</span></div><button class='icon-button' data-action='pinned-menu' aria-label='Pinned messages'>" + icon("more") + "</button></div>" : "";
    let messages = "";
    let previousDate = "";
    (chat.messages||[]).forEach(m=>{
      if(m.date && m.date!==previousDate) {
        const label = m.date==="TODAY"?"Today":m.date==="YESTERDAY"?"Yesterday":m.date.toLowerCase().replace(/^\w/,c=>c.toUpperCase());
        messages += "<div class='date-separator'>" + esc(label) + "</div>"; previousDate=m.date;
      }
      messages += messageHTML(m,chat);
    });
    const callActions = "<button type='button' class='icon-button conversation-call-button' data-action='voice-call' title='Voice call' aria-label='Voice call'>" + icon("phone") + "</button><button type='button' class='icon-button conversation-call-button' data-action='video-call' title='Video call' aria-label='Video call'>" + icon("video") + "</button>";
    main.innerHTML = "<section class='conversation'>" +
      "<header class='message-selection-toolbar' id='message-selection-toolbar' hidden><button class='icon-button' type='button' data-message-toolbar-action='cancel' aria-label='Cancel selection'>" + icon("x") + "</button><span class='message-selection-count' id='message-selection-count'>1</span><div class='message-selection-actions'><button class='icon-button' type='button' data-message-toolbar-action='react' title='React' aria-label='React to message'>" + icon("smile") + "</button><button class='icon-button' type='button' data-message-toolbar-action='reply' title='Reply' aria-label='Reply'>" + icon("reply") + "</button><button class='icon-button' type='button' data-message-toolbar-action='forward' title='Forward' aria-label='Forward'>" + icon("forward") + "</button><button class='icon-button' type='button' data-message-toolbar-action='star' title='Star' aria-label='Star'>" + icon("star") + "</button><button class='icon-button' type='button' data-message-toolbar-action='copy' title='Copy' aria-label='Copy'>" + icon("copy") + "</button><button class='icon-button' type='button' data-message-toolbar-action='delete' title='Delete' aria-label='Delete'>" + icon("trash") + "</button><button class='icon-button' type='button' data-message-toolbar-action='more' title='More options' aria-label='More message options'>" + icon("more") + "</button></div></header><div class='message-reaction-picker' id='message-reaction-picker' hidden><span class='message-reaction-picker-label'>React</span><button type='button' data-message-reaction-emoji='👍' aria-label='Like'>👍</button><button type='button' data-message-reaction-emoji='❤️' aria-label='Love'>❤️</button><button type='button' data-message-reaction-emoji='😂' aria-label='Laugh'>😂</button><button type='button' data-message-reaction-emoji='😮' aria-label='Wow'>😮</button><button type='button' data-message-reaction-emoji='🙏' aria-label='Thanks'>🙏</button></div>" +
      "<header class='conversation-header'><button class='back-button' data-action='back-to-list' aria-label='Back to chats'>" + icon("back") + "</button><button class='conversation-person' data-action='chat-info' aria-label='Open contact information'>" +
      avatarHTML(chat) + "<span class='person-copy'><span class='person-name'>" + esc(chat.name) + "</span><span class='person-subtitle'>" + esc(subtitle) + "</span></span></button><div class='conversation-actions'>" + callActions +
      "<button class='icon-button conversation-menu-button' data-action='chat-menu' title='More options' aria-label='More options'>" + icon("more") + "</button></div></header>" +
      pinned + "<div class='message-scroll' id='message-scroll'><div class='encryption-notice'>" + icon("lock") + " Messages sync through your account backend. This app does not provide end-to-end encryption.</div>" + messages + "</div>" +
      "<form class='composer' id='message-form'><div class='reply-preview' id='reply-preview' hidden></div><button class='composer-tool' type='button' data-action='attachment' aria-label='Attach' title='Attach'>" + icon("paperclip") + "</button><button class='composer-tool' type='button' data-action='emoji' aria-label='Emoji' title='Emoji'>" + icon("smile") + "</button><div class='composer-box'><textarea id='message-input' rows='1' placeholder='Type a message' aria-label='Type a message'></textarea></div><button class='send-button' type='submit' aria-label='Send message' title='Send message'>" + icon("send") + "</button></form></section>";
    updateReplyPreview();
    syncMessageSelectionUI();
    const composerInput = $("#message-input", main);
    if (composerInput) { composerInput.addEventListener("input", () => syncComposerButton(composerInput)); syncComposerButton(composerInput); }
    requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;});
  }
  function screenHeader(title,extra) { return "<header class='screen-header'><button class='icon-button mobile-only' data-action='back-to-list' aria-label='Back'>" + icon("back") + "</button><h2>" + esc(title) + "</h2>" + (extra||"") + "</header>"; }
  function settingRow(iconName,title,sub,action) { return "<button class='setting-row' data-action='" + esc(action||"not-ready") + "'><span class='row-icon'>" + icon(iconName) + "</span><span class='setting-copy'><span class='setting-title'>" + esc(title) + "</span><span class='setting-subtitle'>" + esc(sub) + "</span></span><span class='end-icon'>" + icon("chevron") + "</span></button>"; }
  function renderProfile() {
    const p=state.profile;
    const photo=p.avatarData?"<img src='"+esc(p.avatarData)+"' alt='Profile photo'>":esc(p.avatar||initials(p.name));
    main.innerHTML="<section class='section-screen'>"+screenHeader("Profile","<button class='icon-button' data-action='edit-profile' aria-label='Edit profile'>"+icon("edit")+"</button>")+"<div class='screen-content'><div class='profile-card'><button class='profile-photo photo-button' data-action='change-profile-photo' aria-label='Change profile photo'>"+photo+"</button><div><h3>"+esc(p.name)+"</h3><p>@"+esc(p.username)+" · "+esc(p.phone)+"</p><button class='secondary-button' data-action='change-profile-photo'>"+icon("image")+" Change photo</button> <button class='primary-button' data-action='edit-profile'>"+icon("edit")+" Edit profile</button></div></div><div class='section-card'><h3 class='section-card-title'>Profile information</h3><div class='setting-row'><span class='row-icon'>"+icon("edit")+"</span><span class='setting-copy'><span class='setting-subtitle'>Name</span><span class='setting-title'>"+esc(p.name)+"</span></span><button class='icon-button' data-action='edit-profile' aria-label='Edit name'>"+icon("edit")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("info")+"</span><span class='setting-copy'><span class='setting-subtitle'>About</span><span class='setting-title'>"+esc(p.about)+"</span></span><button class='icon-button' data-action='edit-about' aria-label='Edit about'>"+icon("edit")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("phone")+"</span><span class='setting-copy'><span class='setting-subtitle'>Custom in-app number</span><span class='setting-title'>"+esc(p.phone)+"</span></span><button class='icon-button' data-action='copy-phone' aria-label='Copy number'>"+icon("copy")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("users")+"</span><span class='setting-copy'><span class='setting-subtitle'>Username</span><span class='setting-title'>@"+esc(p.username)+"</span></span><button class='icon-button' data-action='copy-username' aria-label='Copy username'>"+icon("copy")+"</button></div></div><p class='screen-description'>Your in-app ID is not a real telephone number. It is not a real phone number and cannot receive SMS or phone calls.</p></div></section>";
  }
  function renderRequests() {
    const received=state.requests.filter(r=>r.status==="received");
    const sent=state.sentRequests||[];
    const receivedHtml=received.length?received.map(r=>"<div class='request-card'>"+avatarHTML(r)+"<div class='request-info'><strong>"+esc(r.name)+"</strong><span>@"+esc(r.username)+" · "+esc(r.phone)+"</span><span>"+esc(r.note||"Would like to connect")+" · "+esc(r.time||"Recently")+"</span></div><div class='request-actions'><button class='accept-request' data-action='accept-request' data-request-id='"+esc(r.id)+"'>Accept</button><button class='decline-request' data-action='decline-request' data-request-id='"+esc(r.id)+"'>Decline</button></div></div>").join(""):"<div class='empty-state'>No new contact requests.<br>When someone asks to connect, they will appear here.</div>";
    const sentHtml=sent.length?sent.map(r=>"<div class='request-card'>"+avatarHTML(r)+"<div class='request-info'><strong>"+esc(r.name)+"</strong><span>@"+esc(r.username)+" · "+esc(r.phone)+"</span><span>Request sent · Pending</span></div><div class='request-actions'><button class='decline-request' data-action='cancel-request' data-request-id='"+esc(r.id)+"'>Cancel</button></div></div>").join(""):"<div class='empty-state'>No outgoing requests.</div>";
    main.innerHTML="<section class='section-screen'>"+screenHeader("Contact requests","<button class='primary-button' data-action='find-friends'>"+icon("user-plus")+" Find people</button>")+"<div class='screen-content'><p class='screen-description'>Manage connection requests. Requests are shared across devices. Accepting connects the two accounts; declining or cancelling updates the server.</p><div class='request-section-label'>RECEIVED · "+received.length+"</div><div class='section-card'>"+receivedHtml+"</div><div class='request-section-label'>SENT · "+sent.length+"</div><div class='section-card'>"+sentHtml+"</div><div class='screen-description'>Contact requests use this app’s own account directory and are not linked to other messaging services.</div></div></section>";
  }
  function downloadLocalJson(filename, object) {
    const blob=new Blob([JSON.stringify(object,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function requestNotificationPermission(settingKey) {
    if(typeof Notification==="undefined"){state.settings[settingKey]=false;state.settings.notificationsSetupComplete=false;saveState();renderSettings();toast("This browser does not support device notifications.");return false;}
    let permission=Notification.permission;
    if(permission==="default"){try{permission=await Notification.requestPermission();}catch(_){permission="denied";}}
    if(permission!=="granted"){state.settings[settingKey]=false;state.settings.notificationsSetupComplete=false;saveState();renderSettings();toast("Notifications are blocked. Allow them in browser or device settings, then try again.");return false;}
    saveState();renderSettings();
    let backgroundPushReady=false;
    if(window.waBackendEnablePush){
      try{backgroundPushReady=await window.waBackendEnablePush(state.settings);}catch(error){console.warn("Background push registration failed:",error&&error.message||error);}
    }
    const allAlertsEnabled=!!(state.settings.messageNotifications&&state.settings.groupNotifications&&state.settings.callNotifications);
    state.settings.notificationsSetupComplete=backgroundPushReady&&allAlertsEnabled;
    saveState();
    try{
      if("serviceWorker" in navigator){const registration=await navigator.serviceWorker.ready;await registration.showNotification("WhatsApp notifications enabled",{body:backgroundPushReady?"Background message and call alerts are registered for this device.":"Browser notifications are enabled, but background delivery still needs push registration.",icon:"/icon-192.svg",badge:"/icon-192.svg",tag:"wa-notifications-enabled"});}
      else new Notification("WhatsApp notifications enabled",{body:"Notifications are enabled while the app is connected."});
    }catch(_){}
    toast(backgroundPushReady?"Device and background notifications enabled.":"Browser notifications enabled, but background delivery could not be registered on this device.");return true;
  }
  async function enableNotificationsFromPrompt(){
    if(!state||!currentUser||!currentUser.isSupabase){closeDialog();toast("Sign in before enabling device notifications.");return;}
    if(typeof Notification==="undefined"||!("serviceWorker" in navigator)||!("PushManager" in window)){
      toast("This browser does not support background push. Open this app in a current browser that supports notifications.");return;
    }
    let permission=Notification.permission;
    if(permission==="default"){try{permission=await Notification.requestPermission();}catch(_){permission="denied";}}
    if(permission!=="granted"){
      closeDialog();
      toast(permission==="denied"?"Notifications are blocked. Open your browser's site settings, allow notifications for this site, then reopen WhatsApp.":"Notification permission was not granted.");
      return;
    }
    const nextSettings=Object.assign({},state.settings,{messageNotifications:true,groupNotifications:true,callNotifications:true});
    try{
      if(!window.waBackendEnablePush)throw new Error("The push service is still loading. Close this prompt and retry.");
      await window.waBackendEnablePush(nextSettings);
      state.settings=Object.assign(state.settings,nextSettings,{notificationsSetupComplete:true});
      saveState();closeDialog();renderApp();
      toast("Message, group and call notifications are enabled on this device.");
      try{const registration=await navigator.serviceWorker.ready;await registration.showNotification("WhatsApp notifications enabled",{body:"You can now receive background message and call alerts on this device.",icon:"/icon-192.svg",badge:"/icon-192.svg",tag:"wa-notifications-enabled"});}catch(_){}
    }catch(error){
      console.warn("Could not register device push:",error&&error.message||error);
      toast("The browser granted permission, but push setup did not finish. Check your connection and tap Enable notifications again.");
    }
  }
  async function promptNotificationSetup(){
    if(!state||!currentUser||!currentUser.isSupabase||$("#dialog-backdrop"))return;
    const permission=typeof Notification==="undefined"?"unsupported":Notification.permission;
    const settings=state.settings||{};
    const allAlertsEnabled=!!(settings.messageNotifications&&settings.groupNotifications&&settings.callNotifications);
    if(permission==="granted"&&allAlertsEnabled){
      try{
        if(!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("Push is unavailable in this browser.");
        const registration=await navigator.serviceWorker.ready;
        const existing=await registration.pushManager.getSubscription();
        if(existing&&window.waBackendEnablePush){
          await window.waBackendEnablePush(settings);
          if(settings.notificationsSetupComplete!==true){settings.notificationsSetupComplete=true;saveState();}
          return;
        }
      }catch(error){console.warn("Saved push subscription needs setup again:",error&&error.message||error);}
      settings.notificationsSetupComplete=false;saveState();
    }
    const blocked=permission==="denied";
    const unsupported=permission==="unsupported"||!("serviceWorker" in navigator)||!("PushManager" in window);
    const body=blocked
      ? "<p class='screen-description'>This browser has notifications blocked for this site. The browser will not show its permission prompt again until you change the site's notification permission.</p><p class='screen-description'>Open your browser's site settings for this website, change Notifications to Allow, then reopen WhatsApp.</p>"
      : unsupported
        ? "<p class='screen-description'>This browser does not support background push notifications. Open WhatsApp in a current browser with notification and service-worker support for device-wide alerts.</p>"
        : "<p class='screen-description'>Enable device notifications to receive message, group and incoming-call alerts while you are using another app or when WhatsApp is in the background.</p><p class='screen-description'>Tap Enable notifications, then choose Allow in the browser's system permission prompt. You can change these preferences later in Settings.</p>";
    const primary=blocked
      ? "<button class='primary-button' data-action='notification-settings-help'>How to enable</button>"
      : unsupported
        ? "<button class='primary-button' data-action='close-dialog'>Got it</button>"
        : "<button class='primary-button' data-action='enable-notifications'>Enable notifications</button>";
    const secondary=unsupported?"":"<button class='secondary-button' data-action='notification-settings'>Notification settings</button>";
    openDialog(blocked?"Notifications are blocked":unsupported?"Notifications unavailable":"Enable notifications",body,primary+secondary+"<button class='secondary-button' data-action='close-dialog'>Not now</button>");
  }

  function openRingtoneDialog(){const api=window.WhatsAppCalls,info=api&&api.getRingtoneInfo?api.getRingtoneInfo():{name:"Built-in loud ringtone",volume:100},volume=Math.max(0,Math.min(100,Number(info.volume)||100));const body="<p class='screen-description'>Choose the sound this device plays for incoming calls. MP3 files are saved locally in this browser and are not uploaded to your account.</p>"+"<div class='wa-ringtone-current'><span class='wa-ringtone-current-icon'>"+icon("phone")+"</span><span><small>Current ringtone</small><strong id='wa-ringtone-current-name'>"+esc(info.name||"Built-in loud ringtone")+"</strong></span></div>"+"<div class='dialog-field wa-ringtone-volume-field'><label for='wa-ringtone-volume'>Ringtone volume <strong id='wa-ringtone-volume-label'>"+volume+"%</strong></label><input id='wa-ringtone-volume' type='range' min='25' max='100' step='5' value='"+volume+"'><small>Set to 100% for the loudest level available to the browser. Your phone's media volume still controls final loudness.</small></div>"+"<p class='screen-description'>When WhatsApp is closed, your phone uses its normal notification sound and vibration; browsers cannot force a custom MP3 to play in the background on every device. A powered-off phone cannot receive a web call.</p>"+"<input id='wa-ringtone-file-input' type='file' accept='.mp3,audio/mpeg' hidden>";const footer="<button class='secondary-button' data-action='use-default-ringtone'>Use built-in</button>"+"<button class='secondary-button' data-action='preview-ringtone'>Test ringtone</button>"+"<button class='primary-button' data-action='select-ringtone-file'>Choose MP3</button>"+"<button class='secondary-button' data-action='close-dialog'>Done</button>";openDialog("Incoming call ringtone",body,footer);}

  function handleSettingOption(title) {
    if(title==="Ringtone"){openRingtoneDialog();return;}
    if(title==="Theme"){state.settings.dark=!state.settings.dark;saveState();applySettings();renderSettings();toast("Theme updated.");return;}
    const settingByTitle={"Read receipts":"readReceipts","Keep chats archived":"keepArchived","Enter is send":"enterToSend","Media visibility":"mediaVisibility","App lock":"appLock","Reduce motion":"reduceMotion","Keyboard navigation":"keyboardNav","High contrast":"highContrast","Spell check":"spellcheck","Reaction notifications":"reactionNotifications","Security notifications":"securityNotifications","Messages":"messageNotifications","Groups":"groupNotifications","Calls":"callNotifications"};
    if(settingByTitle[title]){
      const key=settingByTitle[title];state.settings[key]=!state.settings[key];saveState();applySettings();renderSettings();
      if(["messageNotifications","groupNotifications","callNotifications"].includes(key)){
        if(state.settings[key])void requestNotificationPermission(key);
        else if(window.waBackendUpdatePushPreferences)void window.waBackendUpdatePushPreferences(state.settings).catch(error=>console.warn("Push preferences could not sync:",error));
      }
      toast(title+" updated.");
      return;
    }
    if(title==="Chat wallpaper"||title==="Wallpaper"){chooseWallpaperDialog();return;}
    if(title==="Request account info"||title==="Chat backup"){
      downloadLocalJson(title==="Chat backup"?"whatsapp-demo-chat-backup.json":"whatsapp-demo-account-info.json",title==="Chat backup"?{profile:state.profile,chats:state.chats,requests:state.requests,settings:state.settings}:{profile:state.profile,account:{username:currentUser.username,phone:currentUser.phone,createdAt:currentUser.createdAt},localDataOnly:true});
      toast("Local JSON export downloaded.");return;
    }
    if(title==="Manage storage"||title==="Manage media"||title==="Network usage"){
      const size=new Blob([JSON.stringify(state)]).size;
      const mediaCount=state.chats.reduce((sum,c)=>sum+(c.attachments||[]).length+(c.messages||[]).filter(m=>m.attachmentPath||m.attachmentId).length,0);
      const message=title==="Network usage"
        ?"Connection: "+(navigator.onLine?"Online":"Offline")+". The app does not currently measure total network bytes."
        :title==="Manage media"
          ?"Media references in loaded chats: "+mediaCount+". Private server attachments remain in Supabase Storage; this screen does not delete remote media."
          :"Estimated currently loaded app data: "+Math.round(size/1024)+" KB. This is an in-memory estimate, not a Supabase storage quota.";
      openDialog(title,"<p class='screen-description'>"+esc(message)+"</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Change number"){
      openDialog("Change custom number","<p class='screen-description'>Choose a unique in-app ID. It is not a real phone number.</p><div class='dialog-field'><label for='new-custom-number'>Custom number after +990</label><input id='new-custom-number' inputmode='numeric' value='"+esc(state.profile.phone.replace("+990 ",""))+"'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-custom-number'>Save number</button>");return;
    }
    if(title==="Two-step verification"){
      openDialog(title,"<p class='screen-description'>Create a local six-digit demo PIN. It is saved only in this browser and does not protect a real account.</p><div class='dialog-field'><label for='two-step-pin'>Six-digit PIN</label><input id='two-step-pin' inputmode='numeric' maxlength='6' placeholder='••••••'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-two-step'>Save PIN</button>");return;
    }
    if(title==="Delete account"){
      openDialog("Delete local demo account","<p class='screen-description'>This removes this local demo account and its browser-stored chat state only. It does not delete a Supabase account.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='danger-button' data-dialog-action='delete-local-account'>Delete local account</button>");return;
    }
    if(["Last seen and online","Profile photo","About","Status","Groups"].includes(title) && settingsTab==="privacy"){
      const values=["Everyone","My contacts","My contacts except…","Nobody"];
      const options=values.map(value=>"<button class='setting-row' data-dialog-action='save-setting-choice' data-setting-name='"+esc(title)+"' data-setting-value='"+esc(value)+"'><span class='setting-copy'><span class='setting-title'>"+esc(value)+"</span></span>"+icon((state.settings.privacy||{})[title]===value?"check":"circle")+"</button>").join("");
      openDialog(title,options,"<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="App language"){
      const values=["English","اردو (Urdu)","العربية (Arabic)","Español (Spanish)"];
      openDialog(title,values.map(value=>"<button class='setting-row' data-dialog-action='save-language' data-language='"+esc(value)+"'><span class='setting-copy'><span class='setting-title'>"+esc(value)+"</span></span>"+icon((state.settings.language||"English")===value?"check":"circle")+"</button>").join(""),"<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Accent color"){
      const colors=[["Green","#00a884"],["Blue","#1677d2"],["Purple","#7952b3"],["Teal","#008c8c"]];
      openDialog(title,colors.map(c=>"<button class='setting-row' data-dialog-action='save-accent' data-accent-name='"+esc(c[0])+"' data-accent-color='"+esc(c[1])+"'><span class='row-icon' style='color:"+esc(c[1])+"'>"+icon("palette")+"</span><span class='setting-copy'><span class='setting-title'>"+esc(c[0])+"</span></span>"+icon((state.settings.accent||"Green")===c[0]?"check":"circle")+"</button>").join(""),"<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Media auto-download"){
      const current=state.settings.mediaAutoDownload||"Wi-Fi and mobile data";
      const values=["Wi-Fi and mobile data","Wi-Fi only","Never"];
      openDialog("Media auto-download","<p class='screen-description'>Choose your preferred download policy for supported attachments. This preference is stored on this browser.</p>"+values.map(value=>"<button class='setting-row' data-dialog-action='save-media-auto-download' data-media-policy='"+esc(value)+"'><span class='setting-copy'><span class='setting-title'>"+esc(value)+"</span></span>"+icon(current===value?"check":"circle")+"</button>").join(""),"<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Help center"){
      openDialog("Help center","<p class='screen-description'>This independent messaging app uses its own account directory. For sign-in, messaging, privacy, or calling bugs, open the repository issue tracker.</p><p><a href='https://github.com/AHCoderCode/whatsapp/issues/new' target='_blank' rel='noopener noreferrer'>Report an issue on GitHub</a></p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Contact us"){
      openDialog("Contact support","<p class='screen-description'>This app does not currently have a built-in support inbox. Use the public issue tracker to report a problem, with private information removed.</p><p><a href='https://github.com/AHCoderCode/whatsapp/issues/new' target='_blank' rel='noopener noreferrer'>Open the issue tracker</a></p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Terms and privacy policy"){
      openDialog("Privacy and data","<p class='screen-description'>This independent app stores account profiles, messages, contact requests, groups, statuses and attachments using its connected Supabase project. Browser preferences and contact aliases are stored locally. Device notifications require permission. Do not send sensitive information unless you understand this project's deployment and data practices.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="App info"){
      openDialog("App info","<p class='screen-description'><strong>WhatsApp-inspired web app</strong><br>Build: 2026.10.28<br>Installed web app · Service worker updates enabled</p><p class='screen-description'>This is an independent app and is not the official WhatsApp service.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Messages"||title==="Groups"||title==="Calls"){
      const key={"Messages":"messageNotifications","Groups":"groupNotifications","Calls":"callNotifications"}[title];
      state.settings[key]=!state.settings[key];saveState();applySettings();renderSettings();
      if(state.settings[key])void requestNotificationPermission(key);
      else if(window.waBackendUpdatePushPreferences)void window.waBackendUpdatePushPreferences(state.settings).catch(error=>console.warn("Push preferences could not sync:",error));
      toast(title+" notifications "+(state.settings[key]?"enabled":"disabled")+".");return;
    }
    if(title==="Wallpaper"){chooseWallpaperDialog();return;}
    if(title==="Spell check"){state.settings.spellcheck=!state.settings.spellcheck;saveState();applySettings();renderSettings();toast("Spell check "+(state.settings.spellcheck?"enabled":"disabled")+".");return;}
    if(title==="Security notifications"){state.settings.securityNotifications=!state.settings.securityNotifications;saveState();renderSettings();toast("Security notification preference saved.");return;}
    if(title==="Disappearing messages"){const chat=currentChat();if(chat){handleAction("disappearing",{});return;}openDialog("Disappearing messages","<p class='screen-description'>Open a conversation first to choose its disappearing-message timer.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;}
    if(title==="Two-step verification"){
      openDialog(title,"<p class='screen-description'>This app does not yet provide server-enforced two-step verification. A browser-only PIN is not account security, so this control does not claim to protect your account.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Enter is send"){state.settings.enterToSend=!state.settings.enterToSend;saveState();renderSettings();toast("Enter-to-send preference updated.");return;}
    toast(title+" is shown as a local frontend setting.");
  }
  function renderSettingsDetail() {
    const tab=settingsTabs.find(t=>t[0]===settingsTab)||settingsTabs[0];
    const options=settingDescriptions[settingsTab]||settingDescriptions.account;
    let content="";
    if(settingsTab==="account"){
      const profilePhoto=state.profile.avatarData
        ? "<img src='"+esc(state.profile.avatarData)+"' alt='Profile photo'>"
        : esc(state.profile.avatar||initials(state.profile.name));
      content="<section class='wa-settings-profile-card'>"+
        "<div class='wa-settings-profile-top'><button class='wa-settings-profile-photo' data-action='change-profile-photo' aria-label='Change profile photo'>"+profilePhoto+"<span class='wa-profile-camera'>"+icon("image")+"</span></button>"+
        "<div class='wa-settings-profile-identity'><span class='wa-settings-kicker'>YOUR ACCOUNT</span><h4>"+esc(state.profile.name)+"</h4><p>@"+esc(state.profile.username)+"</p><button class='text-button' data-action='edit-profile'>Edit profile</button></div></div>"+
        "<div class='wa-profile-fields'><button class='wa-profile-field' data-action='edit-profile'><span><small>Display name</small><strong>"+esc(state.profile.name||"Add your name")+"</strong></span>"+icon("edit")+"</button>"+
        "<button class='wa-profile-field' data-action='edit-about'><span><small>About</small><strong>"+esc(state.profile.about||"Add an About")+"</strong></span>"+icon("edit")+"</button>"+
        "<button class='wa-profile-field' data-action='change-profile-photo'><span><small>Profile photo</small><strong>Change or upload photo</strong></span>"+icon("image")+"</button></div>"+
        "<p class='wa-profile-helper'>Your profile changes are saved to your account and shared with contacts in this app.</p></section>";
    }
    content+="<div class='section-card'>"+options.map(opt=>{
      let side="";
      const settingMap={"Read receipts":"readReceipts","Keep chats archived":"keepArchived","Enter is send":"enterToSend","Media visibility":"mediaVisibility","App lock":"appLock","Reduce motion":"reduceMotion","Keyboard navigation":"keyboardNav","High contrast":"highContrast","Spell check":"spellcheck","Reaction notifications":"reactionNotifications","Security notifications":"securityNotifications","Messages":"messageNotifications","Groups":"groupNotifications","Calls":"callNotifications"};
      if(opt[3]==="toggle" || settingMap[opt[1]]) {const key=settingMap[opt[1]]||opt[1];const on=!!state.settings[key];side="<button class='toggle "+(on?"on":"")+"' data-setting='"+esc(key)+"' aria-pressed='"+(on?"true":"false")+"' aria-label='Toggle "+esc(opt[1])+"'></button>";}
      else if(opt[3]==="toggle-theme")side="<button class='toggle "+(state.settings.dark?"on":"")+"' data-setting='dark' aria-pressed='"+(state.settings.dark?"true":"false")+"' aria-label='Toggle dark mode'></button>";
      else if(opt[3]==="wallpaper")side="<button class='secondary-button' data-action='wallpaper'>Change</button>";
      else if(opt[3]==="button")side="<span class='end-icon'>"+icon("chevron")+"</span>";
      else if(opt[1]==="Media auto-download")side="<span class='setting-side-label'>"+esc(state.settings.mediaAutoDownload||"Wi-Fi and mobile data")+"</span>";
      else if(opt[1]==="App language")side="<span class='setting-side-label'>"+esc(state.settings.language||"English")+"</span>";
      else if(opt[3]==="ringer"){const ringtone=window.WhatsAppCalls&&window.WhatsAppCalls.getRingtoneInfo?window.WhatsAppCalls.getRingtoneInfo():null;side="<span class='setting-side-label'>"+esc(ringtone&&ringtone.name||"Built-in loud ringtone")+"</span>";}
      else side="<span class='setting-side-label'>"+esc(opt[3]||"")+"</span>";
      return "<div class='setting-option' data-setting-option='"+esc(opt[1])+"' role='button' tabindex='0'><span class='row-icon'>"+icon(opt[0])+"</span><div class='setting-option-copy'><strong>"+esc(opt[1])+"</strong><span>"+esc(opt[2])+"</span></div>"+side+"</div>";
    }).join("")+"</div><p class='screen-description'>"+(currentUser&&currentUser.isSupabase?"Appearance and legacy privacy options are local preferences. Account profile changes, accepted contacts, groups and text messages use Supabase. Some older screens remain previews.":"Settings here change the local demo interface only. They do not change a remote account or device settings.")+"</p>";
    return "<div class='settings-detail-header'><h3>"+esc(tab[2])+"</h3></div><div class='settings-detail-content'>"+content+"</div>";
  }
  function renderSettings() {
    const matched=settingsTabs.filter(t=>(t[2]+" "+t[0]).toLowerCase().includes(settingsQuery.toLowerCase()));
    main.innerHTML="<section class='settings-layout'><aside class='settings-list'><div class='settings-list-header'><h2>Settings</h2><label class='settings-search'>"+icon("search")+"<input id='settings-search' placeholder='Search settings' value='"+esc(settingsQuery)+"' aria-label='Search settings'></label></div>"+matched.map(t=>"<button class='settings-nav-item"+(t[0]===settingsTab?" active":"")+"' data-setting-tab='"+esc(t[0])+"'>"+icon(t[1])+"<span>"+esc(t[2])+"</span></button>").join("")+"<button class='settings-nav-item' data-action='profile'>"+icon("users")+"<span>Profile</span></button></aside><div class='settings-detail'>"+renderSettingsDetail()+"</div></section>";
  }
  function renderInfo(chat) {
    if(!chat){renderWelcome();return;}
    const history=Array.isArray(chat.messages)?chat.messages:[];
    const attachments=history.filter(m=>m&&m.attachmentPath);
    const mediaCount=attachments.filter(m=>/^image\//i.test(m.attachmentMime||"")||/^video\//i.test(m.attachmentMime||"")||/^audio\//i.test(m.attachmentMime||"")||m.attachmentType==="voice").length;
    const documentCount=attachments.length-mediaCount;
    const linkCount=history.reduce((total,m)=>total+((String(m.text||"").match(/https?:\/\/[^\s<>"']+/gi)||[]).length),0);
    const actions="<div class='hero-actions'><button class='hero-action' data-action='voice-call'>"+icon("phone")+"<span>Audio</span></button><button class='hero-action' data-action='video-call'>"+icon("video")+"<span>Video</span></button><button class='hero-action' data-action='search-in-chat'>"+icon("search")+"<span>Search</span></button></div>";
    let detail="<div class='contact-hero contact-hero-modern'>"+avatarHTML(chat)+"<h3>"+esc(chat.name)+"</h3><p>"+(chat.type==="group"?(chat.participants||[]).length+" participants":esc(chat.phone||"Custom in-app number"))+"</p>"+(chat.type==="person"?"<span class='contact-username'>@"+esc(chat.username||"user")+"</span>":"")+"<div class='contact-info-actions'>"+actions+"</div></div>";
    if(chat.type==="group"){
      detail+="<div class='description-card'><h4>Group description</h4><p>"+esc(chat.about||"No description added")+"</p></div><div class='section-card'><h3 class='section-card-title'>Participants · "+(chat.participants||[]).length+"</h3><button class='setting-row' data-action='add-participants'>"+icon("user-plus")+"<span class='setting-copy'><span class='setting-title'>Add participants</span></span>"+icon("chevron")+"</button>"+(chat.participants||[]).map((person,i)=>{const name=typeof person==="string"?person:(person.name||person.username||"Member");return "<div class='member-row'>"+avatarHTML({name:name,avatar:(i%12)+1,avatarData:typeof person==="object"?person.avatarData:""})+"<span class='member-name'>"+esc(name)+"</span>"+(i===0?"<span class='member-role'>Admin</span>":"")+"</div>";}).join("")+"</div><div class='section-card'>"+settingRow("edit","Edit group subject",chat.name,"edit-group")+"<button class='setting-row' data-action='edit-group-description'>"+icon("info")+"<span class='setting-copy'><span class='setting-title'>Edit group description</span><span class='setting-subtitle'>"+esc(chat.about||"Add a description")+"</span></span>"+icon("chevron")+"</button></div>";
    } else {
      detail+="<div class='section-card contact-details-card'><h3 class='section-card-title'>Contact details</h3>"+settingRow("edit","Rename contact","Change how this contact appears on your device","rename-contact")+"<div class='setting-row'><span class='row-icon'>"+icon("info")+"</span><span class='setting-copy'><span class='setting-subtitle'>About</span><span class='setting-title'>"+esc(chat.about||"Available")+"</span></span><button class='icon-button' data-action='edit-contact-about' data-chat-id='"+esc(chat.id)+"' aria-label='Edit About'>"+icon("edit")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("user")+"</span><span class='setting-copy'><span class='setting-subtitle'>Username</span><span class='setting-title'>@"+esc(chat.username||"user")+"</span></span><button class='icon-button' data-action='copy-chat-username' data-chat-id='"+esc(chat.id)+"' aria-label='Copy username'>"+icon("copy")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("phone")+"</span><span class='setting-copy'><span class='setting-subtitle'>Custom in-app number</span><span class='setting-title'>"+esc(chat.phone||"Not set")+"</span></span><button class='icon-button' data-action='copy-chat-phone' data-chat-id='"+esc(chat.id)+"' aria-label='Copy number'>"+icon("copy")+"</button></div></div>";
      detail+="<div class='section-card shared-content-card'><h3 class='section-card-title'>Media, links and documents</h3><div class='shared-content-grid'><button type='button' data-action='shared-media' class='shared-content-tile'>"+icon("image")+"<strong>Media</strong><span>"+mediaCount+"</span></button><button type='button' data-action='shared-links' class='shared-content-tile'>"+icon("link")+"<strong>Links</strong><span>"+linkCount+"</span></button><button type='button' data-action='shared-documents' class='shared-content-tile'>"+icon("file")+"<strong>Docs</strong><span>"+documentCount+"</span></button></div></div>";
    }
    detail+="<div class='section-card contact-actions-card'>"+settingRow("star",chat.favorite?"Remove from favorites":"Add to favorites","Keep this chat in your favorite list","toggle-favorite")+"<button class='setting-row' data-action='toggle-mute' data-chat-id='"+esc(chat.id)+"'>"+icon("mute")+"<span class='setting-copy'><span class='setting-title'>"+(chat.muted?"Unmute notifications":"Mute notifications")+"</span><span class='setting-subtitle'>Change notifications for this chat</span></span>"+icon("chevron")+"</button><button class='setting-row' data-action='disappearing' data-chat-id='"+esc(chat.id)+"'>"+icon("clock")+"<span class='setting-copy'><span class='setting-title'>Disappearing messages</span><span class='setting-subtitle'>Off</span></span>"+icon("chevron")+"</button><button class='setting-row' data-action='report-chat' data-chat-id='"+esc(chat.id)+"'>"+icon("flag")+"<span class='setting-copy'><span class='setting-title'>Report "+esc(chat.type==="group"?"group":"contact")+"</span><span class='setting-subtitle'>Report this conversation</span></span>"+icon("chevron")+"</button><button class='setting-row' data-action='block-chat' data-chat-id='"+esc(chat.id)+"'>"+icon("slash")+"<span class='setting-copy'><span class='setting-title'>Block "+esc(chat.name)+"</span><span class='setting-subtitle'>Prevent contact from reaching you on this device</span></span>"+icon("chevron")+"</button><button class='setting-row' data-action='clear-chat' data-chat-id='"+esc(chat.id)+"'>"+icon("trash")+"<span class='setting-copy'><span class='setting-title'>Clear chat</span><span class='setting-subtitle'>Clear messages from your view</span></span>"+icon("chevron")+"</button>"+(chat.type==="person"?"<button class='setting-row danger-setting-row' data-action='remove-contact' data-chat-id='"+esc(chat.id)+"'>"+icon("user-minus")+"<span class='setting-copy'><span class='setting-title'>Remove contact</span><span class='setting-subtitle'>Remove from this device</span></span>"+icon("chevron")+"</button>":"")+"</div>";
    main.innerHTML="<section class='details-layout'><header class='details-header'><button class='icon-button' data-action='back-to-chat' aria-label='Back'>"+icon("back")+"</button><h2>"+(chat.type==="group"?"Group info":"Contact info")+"</h2><button class='icon-button' data-action='chat-menu' aria-label='More options'>"+icon("more")+"</button></header><div class='details-content'>"+detail+"</div></section>";
  }
  function renderUpdates() {
    const statuses = currentUser && currentUser.isSupabase && state ? (state.backendStatuses || []) : [];
    const profile = state && state.profile ? state.profile : {name:"",avatar:"ME",avatarData:""};
    const userId = currentUser && currentUser.isSupabase ? currentUser.id : "";
    const own = statuses.filter(status => status.userId === userId);
    const latestByUser = new Map();
    statuses.filter(status => status.userId !== userId).forEach(status => {
      if (!latestByUser.has(status.userId)) latestByUser.set(status.userId,status);
    });
    const mine = own[0];
    const myAvatar = profile.avatarData
      ? "<img class='avatar-image' src='" + esc(profile.avatarData) + "' alt=''>"
      : esc(profile.avatar || initials(profile.name));
    const myRow = "<div class='status-row' data-action='" + (mine ? "status-preview" : "new-status") + "' " +
      (mine ? "data-status-id='" + esc(mine.id) + "'" : "") + "><div class='status-ring'><div class='status-inner'>" +
      myAvatar + "</div></div><div class='status-copy'><strong>My status</strong><span>" +
      esc(mine ? mine.text : "Tap to add a text status") +
      "</span></div><button class='icon-button' data-action='new-status' aria-label='Add status'>" + icon("new") + "</button></div>";
    const recent = Array.from(latestByUser.values()).map(status => {
      const avatar = status.avatarData
        ? "<img class='avatar-image' src='" + esc(status.avatarData) + "' alt=''>"
        : esc(status.avatar || initials(status.name));
      return "<div class='status-row' data-action='status-preview' data-status-id='" + esc(status.id) +
        "'><div class='status-ring'><div class='status-inner'>" + avatar +
        "</div></div><div class='status-copy'><strong>" + esc(status.name) + "</strong><span>" +
        esc(status.text) + " · " + esc(new Date(status.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})) +
        "</span></div></div>";
    }).join("");
    main.innerHTML = "<section class='section-screen'>" +
      screenHeader("Updates","<button class='icon-button' data-action='new-status' aria-label='New text status'>" + icon("new") + "</button>") +
      "<div class='screen-content'><p class='screen-description'>Text status updates expire automatically after 24 hours and are shared with your accepted contacts.</p>" +
      "<div class='section-card'><h3 class='section-card-title'>Status</h3>" + myRow + "</div>" +
      "<div class='section-card'><h3 class='section-card-title'>Recent updates</h3>" +
      (recent || "<div class='empty-state'>No contact status updates yet.</div>") +
      "</div><div class='section-card'><h3 class='section-card-title'>Channels</h3>" +
      settingRow("channels","Discover channels","Follow updates from channels you choose","nav-channels") +
      "</div></div></section>";
  }

  function renderCalls() {
    const rows = currentUser && currentUser.isSupabase && state && Array.isArray(state.calls) ? state.calls : [];
    const description = currentUser && currentUser.isSupabase
      ? "Call history from your account. Voice and video calls require the other contact to accept."
      : "Your call history will appear here when you sign in to your account.";
    main.innerHTML = "<section class='section-screen'>" +
      screenHeader("Calls","<button class='icon-button' data-action='new-call' aria-label='New call'>" + icon("phone") + "</button>") +
      "<div class='screen-content'><p class='screen-description'>" + description + "</p><div class='section-card'>" +
      (rows.length ? rows.map((row,index) => "<button class='setting-row' data-action='call-entry' data-call-name='" +
        esc(row.name) + "' data-chat-id='" + esc(row.contactId || "") + "' data-media-type='" + esc(row.mediaType || "audio") + "'>" +
        avatarHTML({name:row.name,avatar:row.avatar || index+1}) +
        "<span class='setting-copy'><span class='setting-title'>" + esc(row.name) + "</span><span class='setting-subtitle'>" +
        icon(row.type === "outgoing" ? "forward" : "reply") + " " + esc(row.time) +
        "</span></span><span class='end-icon'>" + icon("phone") + "</span></button>").join("") :
        "<div class='empty-state'>No calls yet. Start a call from an accepted contact's chat.</div>") +
      "</div></div></section>";
  }

  function renderCommunities() {
    if(currentUser&&currentUser.isSupabase){
      const communities=state.backendCommunities||[];
      const rows=communities.map(c=>"<button class='community-row' data-community-id='"+esc(c.id)+"'>"+avatarHTML({name:c.name})+"<span class='community-copy'><strong>"+esc(c.name)+"</strong><span>"+esc(c.description||"Community")+"</span></span><span class='setting-side-label'>"+(c.joined?"Member":"Join")+"</span>"+icon("chevron")+"</button>").join("");
      main.innerHTML="<section class='section-screen'>"+screenHeader("Communities","<button class='icon-button' data-action='new-community' aria-label='New community'>"+icon("new")+"</button>")+"<div class='screen-content'><p class='screen-description'>Create a community or join one created by another account. Membership is synced through Supabase.</p><div class='section-card'>"+(rows||"<div class='empty-state'>No communities yet. Create the first one.</div>")+"</div><button class='primary-button' data-action='new-community'>"+icon("new")+" New community</button></div></section>";
      return;
    }
    main.innerHTML="<section class='section-screen'>"+screenHeader("Communities","<button class='icon-button' data-action='new-community' aria-label='New community'>"+icon("new")+"</button>")+"<div class='screen-content'><p class='screen-description'>Bring people together in topic-based communities. Organize group chats and announcements in one place.</p><div class='section-card'>"+state.communities.map(c=>"<button class='community-row' data-community-id='"+esc(c.id)+"'><span class='avatar av7'>"+esc(initials(c.name))+"</span><span class='community-copy'><strong>"+esc(c.name)+"</strong><span>"+esc(c.groups.join(" · "))+"</span></span>"+icon("chevron")+"</button>").join("")+"</div><button class='primary-button' data-action='new-community'>"+icon("new")+" New community</button></div></section>";
  }
  function renderChannels() {
    if(currentUser&&currentUser.isSupabase){
      const channels=state.backendChannels||[];
      const rows=channels.map(c=>"<div class='channel-row'>"+avatarHTML({name:c.name})+"<button class='channel-open-button community-copy' type='button' data-action='open-channel' data-channel-id='"+esc(c.id)+"'><strong>"+esc(c.name)+"</strong><span>"+esc(c.description||"No description")+"</span></button><button class='"+(c.following?"secondary-button":"primary-button")+"' data-action='toggle-channel' data-channel-id='"+esc(c.id)+"'>"+(c.following?"Following":"Follow")+"</button></div>").join("");
      main.innerHTML="<section class='section-screen'>"+screenHeader("Channels","<button class='icon-button' data-action='channel-search' aria-label='Search channels'>"+icon("search")+"</button><button class='icon-button' data-action='new-channel' aria-label='Create channel'>"+icon("new")+"</button>")+"<div class='screen-content'><p class='screen-description'>Follow channels created by users of this app, or create your own channel. Channel posts are not included in this build yet.</p><div class='section-card'><h3 class='section-card-title'>Channels</h3>"+(rows||"<div class='empty-state'>No channels yet. Create one to get started.</div>")+"</div></div></section>";
      return;
    }
    main.innerHTML="<section class='section-screen'>"+screenHeader("Channels","<button class='icon-button' data-action='channel-search' aria-label='Search channels'>"+icon("search")+"</button>")+"<div class='screen-content'><p class='screen-description'>Discover updates from people and organizations. Follow channels to see their updates here.</p><div class='section-card'><h3 class='section-card-title'>Suggested</h3>"+state.channels.map(c=>"<div class='channel-row'>"+avatarHTML(c)+"<span class='community-copy'><strong>"+esc(c.name)+"</strong><span>"+esc(c.description)+"</span></span><button class='"+(c.following?"secondary-button":"primary-button")+"' data-action='toggle-channel' data-channel-id='"+esc(c.id)+"'>"+(c.following?"Following":"Follow")+"</button></div>").join("")+"</div></div></section>";
  }
  function renderBasic(title,rows,desc,kind) {
    main.innerHTML="<section class='section-screen'>"+screenHeader(title)+"<div class='screen-content'><p class='screen-description'>"+esc(desc)+"</p><div class='section-card'>"+(rows.length?rows.map(chat=>"<button class='setting-row' data-chat-id='"+esc(chat.id)+"'>"+avatarHTML(chat)+"<span class='setting-copy'><span class='setting-title'>"+esc(chat.name)+"</span><span class='setting-subtitle'>"+esc(chat.preview||chat.username||"")+"</span></span><span class='end-icon'>"+icon(kind||"chevron")+"</span></button>").join(""):"<div class='empty-state'>Nothing to show here yet.</div>")+"</div></div></section>";
  }
  function renderMain() {
    if(view==="chats") { if(selectedChatId!==null) renderConversation(currentChat()); else renderWelcome(); }
    else if(view==="requests") renderRequests();
    else if(view==="profile") renderProfile();
    else if(view==="settings") renderSettings();
    else if(view==="info") renderInfo(currentChat());
    else if(view==="updates") renderUpdates();
    else if(view==="calls") renderCalls();
    else if(view==="communities") renderCommunities();
    else if(view==="channels") renderChannels();
    else if(view==="starred") renderBasic("Starred messages",state.starredMessages.map(entry=>({id:entry.chatId,name:entry.chatName,preview:entry.text,avatar:entry.avatar})).filter(x=>x.id),"Messages you star will appear here.","star");
    else if(view==="archived") renderBasic("Archived",state.chats.filter(c=>c.archived),"Archived chats stay out of your main chat list.","archive");
    else if(view==="locked") renderBasic("Locked chats",state.chats.filter(c=>c.locked),"Chats you lock appear here in this local preview.","lock");
    else renderWelcome();
    updateMobileMode();
  }
  function renderApp() {
    if(!state||!currentUser)return;
    $("#rail-profile-avatar").textContent=state.profile.avatar||initials(state.profile.name);
    applySettings();
    renderSidebar();renderMain();updateNav();updateMobileMode();
  }
  function applySettings() {
    if(!state)return;
    app.classList.toggle("theme-dark",!!state.settings.dark);
    app.classList.toggle("reduce-motion",!!state.settings.reduceMotion);
    app.classList.toggle("high-contrast",!!state.settings.highContrast);
    app.classList.toggle("keyboard-nav",state.settings.keyboardNav!==false);
    document.querySelector('meta[name="theme-color"]').setAttribute("content",state.settings.dark?"#111b21":"#00a884");
    const conversation=main.querySelector(".conversation");
    if(conversation) conversation.style.background=state.settings.wallpaper==="plain"?"#ffffff":state.settings.wallpaper==="green"?"#dbeee5":"#efeae2";
    $$("#app-screen input,#app-screen textarea,[contenteditable='true']").forEach(field=>{
      field.spellcheck=state.settings.spellcheck!==false;
    });
  }
  function updateMobile() { updateMobileMode(); }
  function selectChat(id) {
    const chat=findChat(id);if(!chat)return;
    if (replyingTo && String(replyingTo.chatId) !== String(chat.id)) replyingTo = null;
    if (selectedMessage && String(selectedMessage.chatId) !== String(chat.id)) dismissMessageSelection(false);
    selectedChatId=chat.id;view="chats";archivedMode=false;chat.unread=0;
    closePopup();closeDialog();renderSidebar();renderMain();updateNav();updateMobile();
    requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;const input=$("#message-input");if(input&&!window.matchMedia("(max-width:700px)").matches)input.focus({preventScroll:true});});
    saveState();
  }
  function closePopup() { const e=$("#popup-menu");if(e)e.remove();menuChatId=null; }
  function closeDialog() { const e=$("#dialog-backdrop");if(e)e.remove(); }
  function toast(message) {
    toastRoot.innerHTML="<div class='toast' role='status'>"+esc(message)+"</div>";
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastRoot.innerHTML="",3000);
  }
  function openPopup(anchor,items,chatId) {
    closePopup();closeDialog();
    const menu=document.createElement("div");menu.className="popup-menu";menu.id="popup-menu";
    menu.innerHTML=items.map(it=>it.sep?"<div class='popup-separator'></div>":"<button type='button' class='"+(it.danger?"danger":"")+"' data-menu-action='"+esc(it.action)+"'>"+icon(it.icon||"info")+"<span>"+esc(it.label)+"</span></button>").join("");
    overlayRoot.appendChild(menu);
    const rect=anchor.getBoundingClientRect();const width=Math.min(300,Math.max(220,menu.offsetWidth));
    const left=Math.max(8,Math.min(window.innerWidth-width-8,rect.right-width));
    const height=menu.offsetHeight;const top=rect.bottom+height>window.innerHeight-8?Math.max(8,rect.top-height-4):rect.bottom+4;
    menu.style.left=left+"px";menu.style.top=top+"px";menuChatId=chatId==null?null:String(chatId);
  }
  function openDialog(title,body,footer,wide) {
    closePopup();closeDialog();
    overlayRoot.insertAdjacentHTML("beforeend","<div class='dialog-backdrop' id='dialog-backdrop'><section class='dialog"+(wide?" wide":"")+"' role='dialog' aria-modal='true' aria-label='"+esc(title)+"'><header class='dialog-header'><h2>"+esc(title)+"</h2><button class='icon-button' data-action='close-dialog' aria-label='Close'>"+icon("x")+"</button></header><div class='dialog-content'>"+body+"</div>"+(footer?"<footer class='dialog-footer'>"+footer+"</footer>":"")+"</section></div>");
    const first=$("#dialog-backdrop input:not([type=checkbox]),#dialog-backdrop textarea");if(first)setTimeout(()=>first.focus(),20);
  }
  function menuItems(action,chat) {
    if(action==="sidebar-menu") return [
      {icon:"users",label:"New group",action:"new-group"},
      {icon:"communities",label:"New community",action:"new-community"},
      {icon:"broadcast",label:"New broadcast list",action:"broadcast-list"},
      {icon:"monitor",label:"Linked devices",action:"linked-devices"},
      {sep:true},
      {icon:"channels",label:"Channels",action:"go-channels"},
      {icon:"archive",label:"Archived chats",action:"go-archived"},
      {icon:"star",label:"Starred messages",action:"go-starred"},
      {icon:"check",label:"Mark all as read",action:"mark-all-read"},
      {icon:"user-plus",label:"Contact requests",action:"go-requests"},
      {sep:true},
      {icon:"download",label:"Install app",action:"install-app"},
      {icon:"settings",label:"Settings",action:"settings"},
      {icon:"help",label:"Help",action:"help"},
      {sep:true},{icon:"log-out",label:"Log out",action:"logout"}
    ];
    if(action==="row-menu")return[
      {icon:"chat",label:"Open chat",action:"open-chat"},{icon:"checks",label:chat&&chat.unread?"Mark as read":"Mark as unread",action:"toggle-unread"},
      {icon:"star",label:chat&&chat.favorite?"Remove from favorites":"Add to favorites",action:"toggle-favorite"},
      {icon:"pin",label:chat&&chat.pinned?"Unpin chat":"Pin chat",action:"toggle-pin"},
      {icon:"mute",label:chat&&chat.muted?"Unmute notifications":"Mute notifications",action:"toggle-mute"},
      {sep:true},{icon:"archive",label:chat&&chat.archived?"Unarchive chat":"Archive chat",action:"toggle-archive"},
      {icon:"trash",label:"Delete chat",action:"delete-chat",danger:true}
    ];
    if(action==="chat-menu")return[
      {icon:"info",label:chat&&chat.type==="group"?"Group info":"Contact info",action:"chat-info"},
      {icon:"search",label:"Search",action:"chat-search"},{icon:"check",label:"Select messages",action:"select-messages"},
      {sep:true},{icon:"star",label:chat&&chat.favorite?"Remove from favorites":"Add to favorites",action:"toggle-favorite"},
      {icon:"pin",label:chat&&chat.pinned?"Unpin chat":"Pin chat",action:"toggle-pin"},{icon:"mute",label:chat&&chat.muted?"Unmute notifications":"Mute notifications",action:"toggle-mute"},
      {icon:"clock",label:"Disappearing messages",action:"disappearing"},{icon:"lock",label:chat&&chat.locked?"Unlock chat":"Lock chat",action:"lock-chat"},
      {sep:true},{icon:"slash",label:"Report",action:"report-chat"},{icon:"slash",label:"Block",action:"block-chat",danger:true},
      {icon:"trash",label:"Clear chat",action:"clear-chat",danger:true},{icon:"trash",label:"Delete chat",action:"delete-chat",danger:true}
    ];
    if(action==="call-menu")return[{icon:"phone",label:"Voice call",action:"voice-call"},{icon:"video",label:"Video call",action:"video-call"}];
    if(action==="attachment")return[
      {icon:"file",label:"Document",action:"pick-file"},{icon:"image",label:"Photos & videos",action:"pick-image"},
      {icon:"camera",label:"Camera",action:"camera"},{icon:"contact",label:"Contact",action:"share-contact"},
      {icon:"poll",label:"Poll",action:"create-poll"},{icon:"calendar",label:"Event",action:"create-event"}
    ];
    if(action==="emoji")return ["😀","😂","🥹","😍","😊","😭","❤️","👍","🙏","🔥","🎉","✨","🙌","🤔","✅","💯"].map(e=>({icon:"smile",label:e,action:"emoji:"+e}));
    if(action==="more-lists")return[{icon:"new",label:"Create new list",action:"new-list"},{icon:"settings",label:"Manage lists",action:"manage-lists"}];
    if(action==="search-filters")return[{icon:"chat",label:"All chats",action:"filter-all"},{icon:"image",label:"Photos",action:"search-media"},{icon:"file",label:"Documents",action:"search-media"},{icon:"link",label:"Links",action:"search-media"}];
    if(action==="pinned-menu")return[{icon:"pin",label:"View pinned messages",action:"pinned-preview"},{icon:"x",label:"Unpin message",action:"unpin-message"}];
    if(action==="message-menu")return[{icon:"reply",label:"Reply",action:"reply-message"},{icon:"forward",label:"Forward",action:"forward-message"},{icon:"star",label:"Star message",action:"star-message"},{icon:"copy",label:"Copy text",action:"copy-message"},{icon:"trash",label:"Delete message",action:"delete-message",danger:true}];
    return[];
  }
  function createNewChatDialog() {
    const sharedAccount = !!(currentUser && currentUser.isSupabase);
    const intro = sharedAccount
      ? "<p class='screen-description'>Find registered accounts across devices by display name, username, or custom in-app ID.</p>"
      : "<p class='screen-description'><strong>Not connected to a shared account.</strong> Log in to find people registered on other devices.</p>";
    const body = intro + "<div id='friend-search-form' class='friend-search-form' role='search'><div class='dialog-field'><label for='friend-search'>Display name, username, or in-app ID</label><input id='friend-search' type='search' placeholder='Name, @username, or app ID' autocomplete='off' enterkeyhint='search' aria-label='Search registered people'></div><button id='friend-search-submit' class='primary-button friend-search-submit' type='button'>Search people</button></div><div id='friend-lookup-result' role='status' aria-live='polite'><div class='empty-state'>Type a name or username, then tap Search people or press Enter.</div></div>";
    openDialog("Find people",body,"<button class='secondary-button' data-action='close-dialog'>Close</button>");

    // Bind directly to this dialog's controls: one shared lookup, no competing local-only handler.
    const input = $("#friend-search");
    const button = $("#friend-search-submit");
    const initialBox = $("#friend-lookup-result");
    let searchSequence = 0;
    let searching = false;
    const status = message => {
      const result = $("#friend-lookup-result");
      if (result) result.innerHTML = "<div class='empty-state' role='status'>" + esc(message) + "</div>";
    };
    const runSearch = async () => {
      if (searching) return;
      const query = String(input && input.value || "").trim().replace(/^@+/, "").replace(/\s+/g, " ").trim();
      const bridge = window.waAppBridge;
      if (!query) { status("Enter a name, username, or in-app ID to search."); return; }
      if (query.length < 2) { status("Enter at least 2 characters or digits."); return; }
      if (query.length > 80) { status("Search text must be 80 characters or fewer."); return; }
      if (!currentUser || !currentUser.isSupabase) {
        status("You are not signed in to the shared account service. Log in again, then search.");
        return;
      }
      const search = bridge && bridge.searchBackendPeople;
      if (typeof search !== "function") {
        status("The account search service did not initialize. Reload the app, then open Find people again.");
        return;
      }
      const thisSearch = ++searchSequence;
      searching = true;
      if (button) { button.disabled = true; button.setAttribute("aria-busy","true"); button.textContent = "Searching…"; }
      if (initialBox) initialBox.innerHTML = "<div class='empty-state' role='status'>Searching registered accounts…</div>";
      try {
        const found = await search(query);
        if (thisSearch !== searchSequence || !$("#friend-lookup-result")) return;
        const resultBox = $("#friend-lookup-result");
        if (!Array.isArray(found) || found.length === 0) {
          status("No matching accounts found. Try the exact username without @, and confirm the other account finished signing up.");
          return;
        }
        const s = state || {chats:[],requests:[],sentRequests:[]};
        const chats = Array.isArray(s.chats) ? s.chats : [];
        const requests = Array.isArray(s.requests) ? s.requests : [];
        const sentRequests = Array.isArray(s.sentRequests) ? s.sentRequests : [];
        const cards = found.map(person => {
          const friend = chats.find(chat => String(chat.id) === String(person.id));
          const incoming = requests.find(request =>
            (String(request.requestUserId) === String(person.id) || normalizeUsername(request.username) === normalizeUsername(person.username)) &&
            (!request.status || request.status === "received" || request.status === "pending"));
          const sent = sentRequests.some(request =>
            String(request.requestUserId) === String(person.id) || normalizeUsername(request.username) === normalizeUsername(person.username));
          const self = String(person.id) === String(currentUser.id);
          let action;
          if (self) action = "<button class='secondary-button' disabled>Your account</button>";
          else if (friend) action = "<button class='primary-button' data-action='open-found-chat' data-chat-id='" + esc(friend.id) + "'>Open chat</button>";
          else if (incoming) action = "<button class='primary-button' data-action='accept-found-request' data-request-id='" + esc(incoming.id) + "'>Accept request</button>";
          else if (sent) action = "<button class='secondary-button' disabled>Request sent</button>";
          else action = "<button class='primary-button' data-action='send-contact-request' data-contact-username='" + esc(person.username) + "'>Send contact request</button>";
          const name = esc(person.name || person.username || "User");
          const username = esc("@" + String(person.username || ""));
          const number = person.phone ? "<span>" + esc(person.phone) + "</span>" : "";
          return "<div class='request-card'>" + bridge.avatarHTML(person) + "<div class='request-info'><strong>" + name + "</strong><span>" + username + "</span>" + number + "</div>" + action + "</div>";
        }).join("");
        resultBox.innerHTML = "<div class='search-result-summary' role='status'>Found " + found.length + " matching account" + (found.length === 1 ? "" : "s") + ".</div>" + cards;
      } catch (error) {
        if (thisSearch !== searchSequence) return;
        status("Search failed: " + String(error && error.message || "Unknown directory error") + ". Check your connection and sign-in, then try again.");
      } finally {
        if (thisSearch === searchSequence) {
          searching = false;
          const currentButton = $("#friend-search-submit");
          if (currentButton) { currentButton.disabled = false; currentButton.removeAttribute("aria-busy"); currentButton.textContent = "Search people"; }
        }
      }
    };
    if (button) button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation(); void runSearch();
    });
    if (input) {
      input.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault(); event.stopPropagation(); void runSearch();
      });
      input.addEventListener("input", event => event.stopPropagation());
    }
  }
  function createGroupDialog() {
    const contacts=state.chats.filter(c=>c.type==="person"&&!c.archived);
    const body="<div class='dialog-field'><label for='group-name'>Group subject</label><input id='group-name' maxlength='60' placeholder='Enter a group name'></div><div class='dialog-field'><label for='group-description'>Description (optional)</label><textarea id='group-description' rows='2' placeholder='What is this group about?'></textarea></div><p class='screen-description'>Choose participants from your local contacts.</p><input class='dialog-search' id='group-contact-search' placeholder='Search contacts'><div id='group-contact-list'>"+contacts.map(c=>"<div class='pick-row'>"+avatarHTML(c)+"<label for='group-member-"+esc(c.id)+"'>"+esc(c.name)+"</label><input id='group-member-"+esc(c.id)+"' type='checkbox' value='"+esc(c.id)+"'></div>").join("")+"</div>";
    openDialog("New group",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='create-group'>Create group</button>");
  }
  function createCommunityDialog() {
    const body="<div class='dialog-field'><label for='community-name'>Community name</label><input id='community-name' maxlength='60' placeholder='Enter a community name'></div><div class='dialog-field'><label for='community-description'>Description (optional)</label><textarea id='community-description' rows='3' placeholder='What is this community about?'></textarea></div>";
    openDialog("New community",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='create-community'>Create community</button>");
  }
  function editProfileDialog() {
    const p=state.profile;const body="<div class='dialog-field'><label for='edit-name'>Display name</label><input id='edit-name' maxlength='48' value='"+esc(p.name)+"'></div><div class='dialog-field'><label for='edit-about'>About</label><input id='edit-about' maxlength='140' value='"+esc(p.about)+"'></div><div class='dialog-field'><label>Username</label><input value='@"+esc(p.username)+"' readonly><span class='field-help'>Usernames are unique identifiers and cannot be edited from this screen.</span></div><div class='dialog-field'><label>Custom in-app number</label><input value='"+esc(p.phone)+"' readonly><span class='field-help'>This unique app ID is not a real phone number and cannot receive SMS.</span></div>";
    openDialog("Edit profile",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-profile'>Save</button>");
  }
  function editAboutDialog() {
    const current=String(state.profile.about||"Available");
    const body="<div class='wa-about-editor'><p class='screen-description'>Choose a short About that describes you. Changes are saved to your account.</p><div class='dialog-field'><label for='edit-about-quick'>About</label><textarea id='edit-about-quick' maxlength='140' rows='3' placeholder='Hey there! I am using WhatsApp.'>"+esc(current)+"</textarea><small class='field-help'>Up to 140 characters</small></div></div>";
    openDialog("Edit About",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-about'>Save</button>");
  }
  function editGroupDialog(chat) {
    const body="<div class='dialog-field'><label for='edit-group-name'>Group subject</label><input id='edit-group-name' maxlength='60' value='"+esc(chat.name)+"'></div><div class='dialog-field'><label for='edit-group-about'>Group description</label><textarea id='edit-group-about' rows='3'>"+esc(chat.about||"")+"</textarea></div>";
    openDialog("Edit group",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-group' data-chat-id='"+esc(chat.id)+"'>Save</button>");
  }
  function chooseWallpaperDialog() {
    openDialog("Chat wallpaper","<p class='screen-description'>Choose the wallpaper for your conversations.</p><div class='wallpaper-options'><button class='wallpaper-swatch' data-wallpaper='default'><span class='wallpaper-preview default-wallpaper'></span><span>Default doodles</span></button><button class='wallpaper-swatch' data-wallpaper='plain'><span class='wallpaper-preview plain-wallpaper'></span><span>Plain</span></button><button class='wallpaper-swatch' data-wallpaper='green'><span class='wallpaper-preview green-wallpaper'></span><span>Soft green</span></button></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");
  }
  function createBroadcastDialog() {
    const contacts=(state.chats||[]).filter(c=>c.type==="person"&&!c.archived);
    const choices=contacts.map(c=>"<label class='broadcast-recipient'>"+avatarHTML(c)+"<span><strong>"+esc(c.name)+"</strong><small>@"+esc(c.username||"")+"</small></span><input type='checkbox' value='"+esc(c.id)+"'></label>").join("");
    const body="<p class='screen-description'>Choose individual contacts and write one message to send separately to each recipient.</p><div id='broadcast-contact-list' class='broadcast-recipient-list'>"+(choices||"<div class='empty-state'>Connect with at least one person before creating a broadcast.</div>")+"</div><div class='dialog-field'><label for='broadcast-message'>Message</label><textarea id='broadcast-message' rows='3' maxlength='2000' placeholder='Write a broadcast message'></textarea></div>";
    openDialog("New broadcast list",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='send-broadcast' "+(contacts.length?"":"disabled")+">Send broadcast</button>");
  }
  async function sendBroadcastNow() {
    const recipients=$$("#broadcast-contact-list input:checked").map(input=>String(input.value));
    const body=String($("#broadcast-message")?.value||"").trim();
    if(!recipients.length){toast("Select at least one recipient.");return;}
    if(!body){toast("Write a message before sending.");return;}
    if(body.length>2000){toast("Messages are limited to 2,000 characters.");return;}
    if(currentUser&&currentUser.isSupabase&&window.waAppBridge&&window.waAppBridge.supabase){
      const client=window.waAppBridge.supabase,rows=recipients.map(id=>({sender_id:currentUser.id,recipient_id:id,body,message_type:"text"}));
      try{
        const {error}=await client.from("aeroshell_messages").insert(rows);
        if(error)throw error;
        closeDialog();toast("Broadcast sent to "+recipients.length+" contact"+(recipients.length===1?"":"s")+".");
        if(typeof window.waAppBridge.loadBackendData==="function")void window.waAppBridge.loadBackendData();
      }catch(error){toast("Broadcast could not be sent: "+String(error&&error.message||"Check your connection and contact permissions."));}
      return;
    }
    let delivered=0;
    for(const id of recipients){const chat=state.chats.find(c=>String(c.id)===id);if(!chat)continue;const msg={id:uid("message"),from:"me",text:body,time:nowTime(),date:"TODAY",createdAt:new Date().toISOString(),status:"sent",reactions:[],sender:"You"};chat.messages.push(msg);chat.preview=body;chat.time=msg.time;chat.lastOutgoing=true;delivered++;}
    if(!delivered){toast("No selected contacts are available.");return;}
    saveState();closeDialog();renderSidebar();renderMain();toast("Broadcast added to "+delivered+" local conversation"+(delivered===1?"":"s")+".");
  }

  function selectChatsDialog() {
    const body="<p class='screen-description'>Select conversations for this action.</p>"+state.chats.filter(c=>!c.archived).map(c=>"<div class='pick-row'>"+avatarHTML(c)+"<label for='pick-"+esc(c.id)+"'>"+esc(c.name)+"</label><input type='checkbox' id='pick-"+esc(c.id)+"' value='"+esc(c.id)+"'></div>").join("");
    openDialog("Select chats",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='bulk-selection'>Continue</button>");
  }
  function actionMenu(anchor, action) { const chat=findChat(anchor.dataset.chatId)||currentChat();openPopup(anchor,menuItems(action,chat),chat?chat.id:null); }
  function addChatFromContact(contact) {
    let chat=state.chats.find(c=>normalizeUsername(c.username)===normalizeUsername(contact.username));
    if(chat)return chat;
    const id=uid("chat");
    chat=seedChat(id,contact.name,contact.username,contact.phone,contact.avatar||Math.floor(Math.random()*12)+1,"person","Now","You are now connected.",0,false,false,!!contact.online,[],{about:contact.about||"Available",participants:[]});
    state.chats.unshift(chat);state.contacts.push(contact.username);saveState();return chat;
  }
  function requestSend(contact) {
    const username=normalizeUsername(contact.username);
    if(username===normalizeUsername(currentUser.username)){toast("That's your own username.");return;}
    if(state.chats.some(c=>normalizeUsername(c.username)===username)){toast("You are already connected to this person.");return;}
    if(state.sentRequests.some(r=>normalizeUsername(r.username)===username)){toast("Contact request already sent.");return;}
    state.sentRequests.unshift({id:uid("outreq"),username:username,name:contact.name,phone:contact.phone,avatar:contact.avatar||1,status:"sent",time:"Just now"});
    saveState();closeDialog();toast("Contact request saved in this local demo.");if(view==="requests")renderRequests();
  }
  function acceptRequest(id) {
    const req=state.requests.find(r=>r.id===id);if(!req)return;
    req.status="accepted";
    const chat=addChatFromContact(req);
    state.requests=state.requests.filter(r=>r.id!==id);
    state.sentRequests=state.sentRequests.filter(r=>normalizeUsername(r.username)!==normalizeUsername(req.username));
    saveState();renderSidebar();renderMain();toast("@"+req.username+" added to your chats.");
  }
  function declineRequest(id) { state.requests=state.requests.filter(r=>r.id!==id);save();renderMain();toast("Request declined in this browser."); }
  function setChatProperty(chat,prop,value) {
    if(!chat)return;
    chat[prop]=value===undefined?!chat[prop]:value;
    saveState();renderSidebar();renderMain();
  }
function openSharedItemsDialog(chat,kind) {
    if(!chat){toast("Open a conversation first.");return;}
    const messages=Array.isArray(chat.messages)?chat.messages:[];
    const attachments=messages.filter(m=>m&&m.attachmentPath);
    const media=attachments.filter(m=>/^image\//i.test(m.attachmentMime||"")||/^video\//i.test(m.attachmentMime||"")||/^audio\//i.test(m.attachmentMime||"")||m.attachmentType==="voice");
    const docs=attachments.filter(m=>!media.includes(m));
    const links=[];
    messages.forEach(m=>{const found=String(m.text||"").match(/https?:\/\/[^\s<>"']+/gi)||[];found.forEach(url=>links.push({url,message:m}));});
    let rows="";
    if(kind==="media"||kind==="all") rows+=media.map(m=>"<button type='button' class='shared-file-row' data-action='open-attachment' data-message-id='"+esc(m.id)+"'>"+icon(m.attachmentType==="voice"?"play":/^audio\//i.test(m.attachmentMime||"")?"music":"image")+"<span><strong>"+esc(m.attachmentType==="voice"?"Voice message":m.attachmentName||"Photo or audio")+"</strong><small>"+esc(m.time||"Shared attachment")+"</small></span>"+icon("chevron")+"</button>").join("");
    if(kind==="documents"||kind==="all") rows+=docs.map(m=>"<button type='button' class='shared-file-row' data-action='open-attachment' data-message-id='"+esc(m.id)+"'>"+icon("file")+"<span><strong>"+esc(m.attachmentName||m.text||"Document")+"</strong><small>"+esc(m.time||"Shared document")+"</small></span>"+icon("chevron")+"</button>").join("");
    if(kind==="links"||kind==="all") rows+=links.map(item=>"<a class='shared-file-row shared-link-row' href='"+esc(item.url)+"' target='_blank' rel='noopener noreferrer'>"+icon("link")+"<span><strong>"+esc(item.url)+"</strong><small>Shared link · "+esc(item.message.time||"")+"</small></span>"+icon("external-link")+"</a>").join("");
    const title=kind==="links"?"Shared links":kind==="documents"?"Shared documents":kind==="media"?"Shared media":"Media, links and documents";
    openDialog(title,rows||"<div class='empty-state'>Nothing shared here yet.</div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");
  }
  function useAction(action,chat) {
    if(["open-chat"].includes(action)){if(chat)selectChat(chat.id);return;}
    if(!chat && ["toggle-unread","toggle-favorite","toggle-pin","toggle-mute","toggle-archive","toggle-lock","toggle-favorite"].includes(action)){toast("Choose a chat first.");return;}
    if(action==="toggle-unread"){chat.unread=chat.unread?0:1;save();renderMain();toast(chat.unread?"Marked as unread":"Marked as read");return;}
    if(action==="toggle-favorite"){chat.favorite=!chat.favorite;save();renderMain();toast(chat.favorite?"Added to favorites":"Removed from favorites");return;}
    if(action==="toggle-pin"){chat.pinned=!chat.pinned;save();renderMain();toast(chat.pinned?"Chat pinned":"Chat unpinned");return;}
    if(action==="toggle-mute"){chat.muted=!chat.muted;save();renderMain();toast(chat.muted?"Notifications muted":"Notifications unmuted");return;}
    if(action==="toggle-archive"){chat.archived=!chat.archived;if(chat.archived&&chat.id===selectedChatId){selectedChatId=null;view="chats";}save();renderSidebar();renderMain();toast(chat.archived?"Chat archived":"Chat unarchived");return;}
    if(action==="lock-chat"||action==="toggle-lock"){chat.locked=!chat.locked;if(chat.locked&&!state.locked.includes(chat.id))state.locked.push(chat.id);else state.locked=state.locked.filter(x=>x!==chat.id);save();renderSidebar();renderMain();toast(chat.locked?"Chat locked in this preview":"Chat unlocked");return;}
    if(action==="delete-chat"){if(!confirm("Delete this local demo chat and its messages?"))return;state.chats=state.chats.filter(c=>c.id!==chat.id);if(selectedChatId===chat.id)selectedChatId=null;save();renderSidebar();renderMain();toast("Local chat deleted.");return;}
    if(action==="clear-chat"){
      if(!confirm("Clear messages from your view? This will not delete messages for the other person."))return;
      if(currentUser&&currentUser.isSupabase&&window.waAppBridge&&typeof window.waAppBridge.hideBackendMessage==="function"){
        const rows=(chat.messages||[]).filter(m=>m.id);
        void (async()=>{try{for(const message of rows)await window.waAppBridge.hideBackendMessage(message.id);chat.messages=[];chat.preview="";save();renderSidebar();renderMain();toast("Messages cleared from your view.");}catch(error){toast("Could not clear this chat: "+String(error&&error.message||"Unknown error"));}})();
        return;
      }
      chat.messages=[];chat.preview="";save();renderMain();toast("Messages cleared from this device.");return;
    }
    if(action==="chat-info"){view="info";closePopup();renderSidebar();renderMain();updateMobile();return;}
    if(action==="chat-search"||action==="search-in-chat"){openDialog("Search in chat","<div class='dialog-field'><label for='chat-message-search'>Search messages in "+esc(chat?chat.name:"this chat")+"</label><input id='chat-message-search' placeholder='Search this conversation'></div><div id='chat-message-search-results'></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;}
    if(action==="disappearing"){openDialog("Disappearing messages","<p class='screen-description'>Choose when new messages disappear from this local preview.</p><div class='section-card'><button class='setting-row' data-dialog-action='set-disappearing' data-days='0'>Off</button><button class='setting-row' data-dialog-action='set-disappearing' data-days='1'>24 hours</button><button class='setting-row' data-dialog-action='set-disappearing' data-days='7'>7 days</button><button class='setting-row' data-dialog-action='set-disappearing' data-days='90'>90 days</button></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button>");return;}
    if(action==="block-chat"||action==="report-chat"){openDialog(action==="block-chat"?"Block "+chat.name:"Report "+chat.name,"<p class='screen-description'>This control is part of the frontend preview. It does not contact or report anyone to a server.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='danger-button' data-dialog-action='confirm-local-action' data-kind='"+action+"' data-chat-id='"+esc(chat.id)+"'>Confirm demo action</button>");return;}
    if(action==="select-messages"){toast("Tip: click a message and use its menu to star, copy, or delete it.");return;}
    if(action==="star-message"){
      const ref=state.lastContextMessage;
      if(ref && chat) {
        if(!state.starredMessages.some(m=>m.id===ref.id)) state.starredMessages.unshift({id:ref.id,chatId:chat.id,chatName:chat.name,text:ref.text,avatar:chat.avatar,time:ref.time});
        saveState();toast("Message starred.");renderSidebar();
      } else toast("Right-click a message to star it.");
      return;
    }
    if(action==="pinned-preview"){toast(chat&&chat.pinnedMessage?"Pinned message: "+chat.pinnedMessage.text:"No pinned message.");return;}
    if(action==="unpin-message"){if(chat)chat.pinnedMessage=null;save();renderMain();toast("Pinned message removed.");return;}
    if(action==="reply-message"){
      const ref=state.lastContextMessage;
      if(!ref||!chat){toast("Select a message to reply to.");return;}
      replyingTo={id:ref.id,chatId:chat.id,text:String(ref.text||ref.attachmentName||"Attachment"),sender:ref.from==="me"?"You":(ref.sender||chat.name)};
      dismissMessageSelection(false);
      updateReplyPreview();
      const input=$("#message-input");if(input)input.focus();
      return;
    }
    if(action==="forward-message"){showForwardMessageDialog();return;}
    if(action==="copy-message"){
      const msg=state.lastContextMessage;
      if(msg&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(msg.text||msg.attachmentName||"").then(()=>toast("Message copied")).catch(()=>toast(msg.text||"Message"));}else if(msg)toast(msg.text||"Message");
      dismissMessageSelection(false);return;
    }
    if(action==="delete-message"){
      const ref=state.lastContextMessage;
      if(!ref||!chat){toast("Select a message first.");return;}
      const canDeleteEveryone=!!(currentUser&&currentUser.isSupabase&&ref.from==="me"&&/^[0-9a-f-]{36}$/i.test(String(ref.id)));
      const body="<p class='screen-description'>Choose how you want to remove this message.</p><div class='delete-message-preview'><strong>"+esc(ref.from==="me"?"You":(ref.sender||chat.name))+"</strong><span>"+esc(ref.text||ref.attachmentName||"Attachment")+"</span></div>";
      const actions="<button class='secondary-button' data-action='delete-message-for-me'>Delete for me</button>"+(canDeleteEveryone?"<button class='danger-button' data-action='delete-message-for-everyone'>Delete for everyone</button>":"");
      dismissMessageSelection(true);
      openDialog("Delete message",body,actions+"<button class='secondary-button' data-action='close-dialog'>Cancel</button>");
      return;
    }
    if(action==="voice-call"||action==="video-call"){
      if(!chat||chat.type!=="person"){toast("Open a person's conversation before calling.");return;}
      const calls=window.WhatsAppCalls;
      if(!calls||typeof calls.start!=="function"){toast("The calling service has not finished loading. Refresh and try again.");return;}
      void calls.start(chat,action==="video-call"?"video":"audio").catch(error=>toast("Could not start call: "+String(error&&error.message||"Check microphone/camera permission and relay setup.")));
      return;
    }
    if(action==="shared-media"||action==="shared-links"||action==="shared-documents"){openSharedItemsDialog(chat,action==="shared-links"?"links":action==="shared-documents"?"documents":"media");return;}
    if(action==="edit-group"){editGroupDialog(chat);return;}
    if(action==="edit-group-description"){editGroupDialog(chat);return;}
    if(action==="edit-contact-about"){openDialog("Edit About","<div class='dialog-field'><label for='contact-about'>About</label><input id='contact-about' value='"+esc(chat.about||"")+"' maxlength='140'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-contact-about' data-chat-id='"+esc(chat.id)+"'>Save</button>");return;}
    if(action==="copy-chat-phone"){copyText(chat.phone||"");return;}
    if(action==="copy-chat-username"){copyText("@"+(chat.username||""));return;}
  }
  function copyText(text) { if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast("Copied to clipboard")).catch(()=>toast(text));else toast(text); }
  function sendMessage(text) {
    const chat=currentChat();if(!chat||!text.trim())return;
    const quote=replyingTo&&String(replyingTo.chatId)===String(chat.id)?Object.assign({},replyingTo):null;
    const msg={id:uid("msg"),from:"me",text:text.trim(),time:nowTime(),date:dayLabel(),status:"sent",reactions:[],replyTo:quote};
    chat.messages.push(msg);chat.preview=text.trim();chat.time="Now";chat.lastOutgoing=true;chat.lastMessageType="text";chat.unread=0;
    replyingTo=null;dismissMessageSelection(false);
    saveState();renderSidebar();renderMain();
    requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;});
  }
  function handleAction(action,el) {
    const chat=findChat(el.dataset.chatId)||currentChat();
    if(action==="rename-contact" && chat && chat.type==="person"){
      openDialog("Rename contact","<p class='screen-description'>This name is saved on this device only.</p><div class='dialog-field'><label for='contact-alias-name'>Contact name</label><input id='contact-alias-name' maxlength='60' value='"+esc(chat.name)+"' autocomplete='off'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-contact-name' data-chat-id='"+esc(chat.id)+"'>Save name</button>");return;
    }
    if(action==="remove-contact" && chat && chat.type==="person"){
      openDialog("Remove contact?","<p class='screen-description'>This front-end-only action removes the conversation from this device. It does not delete the server-side friend relationship or hide this account on another device.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='danger-button' data-dialog-action='remove-contact-local' data-chat-id='"+esc(chat.id)+"'>Remove from this device</button>");return;
    }
    if(action==="new-chat"){createNewChatDialog();return;}
    if(action==="new-group"){createGroupDialog();return;}
    if(action==="new-community"){createCommunityDialog();return;}
    if(action==="broadcast-list"){createBroadcastDialog();return;}
    if(action==="linked-devices"){
      if(currentUser&&currentUser.isSupabase&&window.waBackendOpenLinkedDevices){void window.waBackendOpenLinkedDevices();return;}
      openDialog("Linked devices","<p class='screen-description'>Sign in to an account to register and manage linked browser sessions.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(action==="mark-all-read"){
      if(currentUser&&currentUser.isSupabase&&window.waAppBridge&&typeof window.waAppBridge.markAllBackendRead==="function"){
        void window.waAppBridge.markAllBackendRead().then(count=>toast("Marked "+count+" message"+(count===1?"":"s")+" as read.")).catch(error=>toast("Could not mark all as read: "+String(error&&error.message||"Unknown error")));
      }else{(state.chats||[]).forEach(c=>{c.unread=0;(c.messages||[]).forEach(m=>{if(m.from==="them")m.read=true;});});saveState();renderSidebar();renderMain();toast("All chats marked as read on this device.");}
      return;
    }
    if(action==="install-app"){
      const prompt=window.__waInstallPrompt;
      if(prompt){prompt.prompt();prompt.userChoice.finally(()=>{window.__waInstallPrompt=null;});}
      else toast("Open your browser menu and choose Install app or Add to Home screen.");return;
    }
    if(action==="go-archived"){setView("archived");return;}
    if(action==="go-channels"){setView("channels");return;}
    if(action==="go-calls"){setView("calls");return;}
    if(action==="profile"){setView("profile");return;}
    if(action==="settings"){settingsTab="account";settingsQuery="";setView("settings");return;}
    if(action==="enable-notifications"){void enableNotificationsFromPrompt();return;}
    if(action==="select-ringtone-file"){const input=$("#wa-ringtone-file-input");if(input)input.click();else toast("Open Settings → Notifications → Ringtone first.");return;}
    if(action==="preview-ringtone"){const api=window.WhatsAppCalls;if(!api||!api.previewRingtone){toast("Ringtone controls are still loading. Refresh and retry.");return;}void api.previewRingtone().then(played=>{if(!played)toast("The browser blocked ringtone playback. Tap Test ringtone again and check device media volume.");}).catch(error=>toast("Could not play the ringtone: "+String(error&&error.message||"Unknown error")));return;}
    if(action==="use-default-ringtone"){const api=window.WhatsAppCalls;if(!api||!api.resetRingtone){toast("Ringtone controls are still loading. Refresh and retry.");return;}void api.resetRingtone().then(()=>{closeDialog();renderSettings();toast("Built-in ringtone selected.");}).catch(error=>toast("Could not reset ringtone: "+String(error&&error.message||"Unknown error")));return;}
    if(action==="notification-settings"){closeDialog();settingsTab="notifications";settingsQuery="";setView("settings");return;}
    if(action==="notification-settings-help"){closeDialog();toast("Open your browser's site settings for this website, set Notifications to Allow, then reopen WhatsApp.");return;}
    if(action==="sidebar-menu"||action==="row-menu"||action==="chat-menu"||action==="call-menu"||action==="attachment"||action==="emoji"||action==="more-lists"||action==="search-filters"||action==="pinned-menu"||action==="message-menu"){actionMenu(el,action);return;}
    if(action==="close-dialog"){closeDialog();return;}
    if(action==="back-to-list"){selectedChatId=null;view="chats";renderSidebar();renderMain();updateMobile();return;}
    if(action==="back-to-chat"){view="chats";renderMain();updateMobile();return;}
    if(action==="edit-profile"){editProfileDialog();return;}
    if(action==="edit-about"){editAboutDialog();return;}
    if(action==="find-friends"){createNewChatDialog();return;}
    if(action==="copy-phone"){copyText(state.profile.phone);return;}
    if(action==="copy-username"){copyText("@"+state.profile.username);return;}
    if(action==="change-profile-photo"){const input=$("#profile-photo-input");if(input)input.click();return;}
    if(action==="camera"){handleAction("new-status",el);return;}
    if(action==="new-status"){openDialog("New status","<div class='dialog-field'><label for='status-text'>Type a status update</label><textarea id='status-text' rows='3' maxlength='700' placeholder='What’s on your mind?'></textarea></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='publish-status'>Share status</button>");return;}
    if(action==="status-preview"){toast("Status viewer preview.");return;}
    if(action==="new-call"){openPopup(el,[{icon:"phone",label:"New voice call",action:"new-voice-call"},{icon:"video",label:"New video call",action:"new-video-call"}],null);return;}
    if(action==="new-voice-call"||action==="new-video-call"||action==="call-entry"){if(window.WhatsAppCalls){if(action==="call-entry"){const person=state.chats.find(c=>String(c.id)===String(el.dataset.chatId)&&c.type==="person");if(person)window.WhatsAppCalls.start(person,el.dataset.mediaType==="video"?"video":"audio");else window.WhatsAppCalls.openPicker("audio");}else window.WhatsAppCalls.openPicker(action==="new-video-call"?"video":"audio");}else toast("The calling interface has not loaded. Refresh and try again.");return;}
    if(action==="channel-search"){openDialog("Discover channels","<div class='dialog-field'><label for='channel-search-input'>Search channels</label><input id='channel-search-input' placeholder='Search channels'></div><div id='channel-search-results'></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");renderChannelSearchResults();return;}
    if(action==="toggle-channel"){const ch=state.channels.find(c=>c.id===el.dataset.channelId);if(ch){ch.following=!ch.following;saveState();renderMain();toast(ch.following?"Channel followed in preview":"Channel unfollowed");}return;}
    if(action==="go-starred"){setView("starred");return;}
    if(action==="go-requests"){setView("requests");return;}
    if(action==="go-archived"){setView("archived");return;}
    if(action==="select-chats"){selectChatsDialog();return;}
    if(action==="help"){settingsTab="help";setView("settings");return;}
    if(action==="logout"){openDialog("Log out","<p class='screen-description'>Log out of your account on this device?</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='logout'>Log out</button>");return;}
    if(action==="accounts-center"){toast("Accounts Center is a visual demo only.");return;}
    if(action==="filter-all"){filter="all";searchQuery="";$("#chat-search").value="";renderSidebar();closePopup();return;}
    if(action==="search-media"){toast("Media search UI preview.");return;}
    if(action==="new-list"){openDialog("Create chat list","<div class='dialog-field'><label for='list-name'>List name</label><input id='list-name' maxlength='30' placeholder='Create a list'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='create-list'>Create</button>");return;}
    if(action==="manage-lists"){openDialog("Manage lists",state.customLists.length?state.customLists.map(l=>"<div class='setting-row'>"+icon("chat")+"<span class='setting-copy'><span class='setting-title'>"+esc(l.name)+"</span></span><button class='secondary-button' data-action='remove-list' data-list-id='"+esc(l.id)+"'>Remove</button></div>").join(""):"<div class='empty-state'>No custom lists yet.</div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;}
    if(action==="toggle-favorite"||action==="toggle-unread"||action==="toggle-pin"||action==="toggle-mute"||action==="toggle-archive"||action==="lock-chat"||action==="toggle-lock"||action==="delete-chat"||action==="clear-chat"||action==="chat-info"||action==="chat-search"||action==="search-in-chat"||action==="disappearing"||action==="block-chat"||action==="report-chat"||action==="select-messages"||action==="star-message"||action==="pinned-preview"||action==="unpin-message"||action==="reply-message"||action==="forward-message"||action==="copy-message"||action==="delete-message"||action==="voice-call"||action==="video-call"||action==="shared-media"||action==="shared-links"||action==="shared-documents"||action==="edit-group"||action==="edit-group-description"||action==="edit-contact-about"||action==="copy-chat-phone"||action==="copy-chat-username"){useAction(action,chat);return;}
    if(action==="attachment-preview"||action==="share-contact"){toast("This item is a local frontend preview.");return;}
    if(action==="pick-file"){const input=$("#attachment-input");if(input){input.accept="*/*";input.click();}return;}
    if(action==="pick-image"){const input=$("#attachment-input");if(input){input.accept="image/*";input.click();}return;}
    if(action==="create-poll"){openDialog("Create poll","<div class='dialog-field'><label for='poll-question'>Question</label><input id='poll-question' placeholder='Ask a question'></div><div class='dialog-field'><label for='poll-options'>Options (one per line)</label><textarea id='poll-options' rows='4' placeholder='Option 1&#10;Option 2'></textarea></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='send-poll'>Add poll</button>");return;}
    if(action==="create-event"){openDialog("Create event","<div class='dialog-field'><label for='event-name'>Event name</label><input id='event-name' placeholder='Event name'></div><div class='dialog-field'><label for='event-date'>Date</label><input id='event-date' type='date'></div><div class='dialog-field'><label for='event-time'>Time</label><input id='event-time' type='time'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='send-event'>Add event</button>");return;}
    if(action==="edit-profile"){editProfileDialog();return;}
    if(action==="edit-about"){editAboutDialog();return;}
    if(action==="wallpaper"){chooseWallpaperDialog();return;}
    if(action==="status-preview"){toast("Status viewer preview.");return;}
    if(action==="toggle-unread"||action==="toggle-favorite")return;
    if(action==="not-ready"){toast("This control is part of the frontend preview.");return;}
    toast("This control is available as a frontend interaction.");
  }
  function renderChannelSearchResults() {
    const input=$("#channel-search-input");const box=$("#channel-search-results");if(!input||!box)return;
    const q=input.value.toLowerCase();
    const matches=state.channels.filter(c=>(c.name+" "+c.description).toLowerCase().includes(q));
    box.innerHTML=matches.map(c=>"<div class='channel-row'>"+avatarHTML(c)+"<span class='community-copy'><strong>"+esc(c.name)+"</strong><span>"+esc(c.description)+"</span></span><button class='"+(c.following?"secondary-button":"primary-button")+"' data-action='toggle-channel' data-channel-id='"+esc(c.id)+"'>"+(c.following?"Following":"Follow")+"</button></div>").join("")||"<div class='empty-state'>No channels found.</div>";
  }
  function runMenuAction(action,chat) {
    closePopup();
    if(["linked-devices","mark-all-read","install-app","broadcast-list","go-archived","go-channels","go-calls","new-voice-call","new-video-call"].includes(action)){
      handleAction(action,{dataset:{}});
      return;
    }
    const mapped=["open-chat","toggle-unread","toggle-favorite","toggle-pin","toggle-mute","toggle-archive","lock-chat","toggle-lock","delete-chat","clear-chat","chat-info","chat-search","search-in-chat","disappearing","block-chat","report-chat","select-messages","star-message","pinned-preview","unpin-message","reply-message","forward-message","copy-message","delete-message","voice-call","video-call","shared-media","shared-links","shared-documents","rename-contact","remove-contact","edit-group","edit-group-description","edit-contact-about","copy-chat-phone","copy-chat-username"];
    if(mapped.includes(action)){useAction(action,chat||currentChat());return;}
    if(action==="new-group"){createGroupDialog();return;}
    if(action==="new-community"){createCommunityDialog();return;}
    if(action==="go-starred"){setView("starred");return;}
    if(action==="go-requests"){setView("requests");return;}
    if(action==="select-chats"){selectChatsDialog();return;}
    if(action==="settings"){settingsTab="account";settingsQuery="";setView("settings");return;}
    if(action==="profile"){setView("profile");return;}
    if(action==="help"){settingsTab="help";setView("settings");return;}
    if(action==="logout"){handleAction("logout",{});return;}
    if(action==="voice-call"||action==="video-call"){useAction(action,chat);return;}
    if(action.startsWith("emoji:")){const input=$("#message-input");if(input){input.value+=action.slice(5);input.focus();input.dispatchEvent(new Event("input",{bubbles:true}));}return;}
    if(action==="pick-file"||action==="pick-image"||action==="camera"||action==="share-contact"||action==="create-poll"||action==="create-event"){handleAction(action,{});return;}
    if(action==="search-all"){filter="all";archivedMode=false;searchQuery="";$("#chat-search").value="";renderSidebar();return;}
    if(action==="search-media"){toast("Search by media type preview.");return;}
    if(action==="new-list"){handleAction(action,{});return;}
    if(action==="manage-lists"){handleAction(action,{});return;}
    if(action==="accounts-center"){toast("Accounts Center is a preview only.");return;}
    toast("This menu item is included as a visual frontend preview.");
  }

  document.addEventListener("click",event=>{
    const t=event.target.closest("[data-auth-mode],[data-action],[data-view],[data-filter],[data-chat-id],[data-request-id],[data-setting-tab],[data-setting],[data-dialog-action],[data-menu-action],[data-wallpaper],[data-community-id],[data-setting-option]");
    if(!t)return;
    if(t.dataset.authMode){renderAuth(t.dataset.authMode);return;}
    if(t.dataset.menuAction){runMenuAction(t.dataset.menuAction,findChat(menuChatId));return;}
    if(t.dataset.view){const v=t.dataset.view;if(v==="chats"){filter="all";archivedMode=false;searchQuery="";$("#chat-search").value="";}setView(v);return;}
    if(t.dataset.filter){filter=t.dataset.filter;archivedMode=false;view="chats";selectedChatId=null;renderSidebar();renderMain();return;}
    if(t.dataset.requestId){
      const id=t.dataset.requestId;
      if(t.dataset.action==="accept-request"){acceptRequest(id);return;}
      if(t.dataset.action==="decline-request"){declineRequest(id);return;}
      if(t.dataset.action==="cancel-request"){state.sentRequests=state.sentRequests.filter(r=>r.id!==id);save();renderMain();toast("Outgoing request cancelled.");return;}
    }
    if(t.dataset.settingOption){handleSettingOption(t.dataset.settingOption);return;}
    if(t.dataset.settingTab){settingsTab=t.dataset.settingTab;renderSettings();return;}
    if(t.dataset.setting){
      const key=t.dataset.setting;
      if(key==="dark")state.settings.dark=!state.settings.dark;else state.settings[key]=!state.settings[key];
      saveState();applySettings();renderSettings();
      if(["messageNotifications","groupNotifications","callNotifications"].includes(key)){
        if(state.settings[key])void requestNotificationPermission(key);
        else if(window.waBackendUpdatePushPreferences)void window.waBackendUpdatePushPreferences(state.settings).catch(error=>console.warn("Push preferences could not sync:",error));
      }
      toast("Setting updated.");
      return;
    }
    if(t.dataset.wallpaper){
      state.settings.wallpaper=t.dataset.wallpaper;saveState();closeDialog();applySettings();renderMain();toast("Wallpaper updated.");return;
    }
    if(t.dataset.dialogAction){
      const action=t.dataset.dialogAction;
      if(action==="save-contact-name"){
        const target=findChat(t.dataset.chatId)||currentChat(),alias=String($("#contact-alias-name")?.value||"").trim().replace(/\s+/g," ");
        if(!target||!alias){toast("Enter a contact name.");return;}
        const key="wa_contact_aliases_"+normalizeUsername(currentUser&&currentUser.username||state.profile.username);
        let aliases={};try{aliases=JSON.parse(localStorage.getItem(key)||"{}")||{};}catch(_){}
        aliases[String(target.id)]=alias;localStorage.setItem(key,JSON.stringify(aliases));
        target.name=alias;target.localAlias=alias;saveState();closeDialog();renderSidebar();renderMain();toast("Contact renamed on this device.");return;
      }
      if(action==="remove-contact-local"){
        const target=findChat(t.dataset.chatId)||currentChat();if(!target){closeDialog();return;}
        const key="wa_hidden_contacts_"+normalizeUsername(currentUser&&currentUser.username||state.profile.username);
        let hidden=[];try{hidden=JSON.parse(localStorage.getItem(key)||"[]")||[];}catch(_){}
        if(!hidden.includes(String(target.id)))hidden.push(String(target.id));localStorage.setItem(key,JSON.stringify(hidden));
        state.chats=state.chats.filter(c=>String(c.id)!==String(target.id));
        state.contacts=(state.contacts||[]).filter(x=>normalizeUsername(x)!==normalizeUsername(target.username));
        if(String(selectedChatId)===String(target.id)){selectedChatId=null;view="chats";}
        saveState();closeDialog();renderSidebar();renderMain();updateNav();updateMobile();toast("Removed from this device. The server-side friend link remains unchanged.");return;
      }
      if(action==="send-broadcast"){void sendBroadcastNow();return;}
          if(action==="create-group"){
        const name=$("#group-name").value.trim();const desc=$("#group-description").value.trim();
        const ids=$$("#group-contact-list input:checked").map(i=>i.value);
        if(!name){toast("Enter a group name.");return;}
        const people=ids.map(id=>findChat(id)).filter(Boolean);
        const group=seedChat(uid("group"),name,normalizeUsername(name).replace(/\s+/g,".")+".group","+990 "+String(Math.floor(100000000+Math.random()*899999999)).replace(/(\d{3})(\d{3})(\d{3})/,"$1 $2 $3"),Math.floor(Math.random()*12)+1,"group","Now","Group created",0,false,false,false,[],{about:desc,participants:[state.profile.name].concat(people.map(p=>p.name))});
        state.chats.unshift(group);saveState();closeDialog();selectChat(group.id);toast("Group created in this local demo.");return;
      }
      if(action==="create-community"){
        const name=$("#community-name").value.trim();const description=$("#community-description").value.trim();if(!name){toast("Enter a community name.");return;}
        state.communities.unshift({id:uid("community"),name:name,description:description,groups:[]});saveState();closeDialog();setView("communities");toast("Community created locally.");return;
      }
      if(action==="save-profile"){
        const name=$("#edit-name").value.trim();const about=$("#edit-about").value.trim();if(!name){toast("Enter your display name.");return;}
        state.profile.name=name;state.profile.about=about||"Available";state.profile.avatar=initials(name);
        const account=db.accounts.find(a=>a.id===currentUser.id);if(account){account.name=name;account.about=state.profile.about;account.avatar=state.profile.avatar;saveDb();currentUser=account;}
        saveState();closeDialog();renderSidebar();renderMain();$("#rail-profile-avatar").textContent=state.profile.avatar;toast("Profile saved in this browser.");return;
      }
      if(action==="save-group"){
        const c=findChat(t.dataset.chatId);if(!c)return;const name=$("#edit-group-name").value.trim();if(!name){toast("Group subject cannot be empty.");return;}
        c.name=name;c.about=$("#edit-group-about").value.trim();saveState();closeDialog();renderSidebar();renderMain();toast("Group information updated.");return;
      }
      if(action==="save-participants"){
        const c=findChat(t.dataset.chatId);if(!c)return;
        const selected=$$("#dialog-backdrop input[type=checkbox]:checked").map(input=>input.value);
        c.participants=Array.from(new Set((c.participants||[]).concat(selected)));
        saveState();closeDialog();renderMain();toast(selected.length+" participant(s) added to this local group.");return;
      }
      if(action==="save-custom-number"){
        const raw=normalizePhone($("#new-custom-number").value);
        const suffix=raw.startsWith("990")?raw.slice(3):raw;
        if(suffix.length!==9){toast("Enter exactly 9 digits after +990.");return;}
        const newPhone="+990 "+suffix.replace(/(\d{3})(\d{3})(\d{3})/,"$1 $2 $3");
        if(db.accounts.concat(db.directory).some(a=>normalizePhone(a.phone)===normalizePhone(newPhone)&&normalizeUsername(a.username)!==normalizeUsername(currentUser.username))){toast("That demo number is already in use.");return;}
        state.profile.phone=newPhone;currentUser.phone=newPhone;
        const account=db.accounts.find(a=>a.id===currentUser.id);if(account){account.phone=newPhone;saveDb();}
        saveState();closeDialog();renderMain();toast("Custom number updated locally.");return;
      }
      if(action==="save-two-step"){
        const pin=$("#two-step-pin").value.trim();if(!/^\d{6}$/.test(pin)){toast("Enter a six-digit PIN.");return;}
        state.settings.twoStepPin=pin;saveState();closeDialog();toast("Demo PIN saved in this browser.");return;
      }
      if(action==="delete-local-account"){
        db.accounts=db.accounts.filter(a=>a.id!==currentUser.id);saveDb();
        try{localStorage.removeItem(stateKey(currentUser.username));localStorage.removeItem(SESSION_KEY);}catch(_){}
        closeDialog();currentUser=null;state=null;selectedChatId=null;app.classList.add("hidden");auth.classList.remove("hidden");renderAuth("signup");toast("Local account deleted.");return;
      }
      if(action==="save-about"){
        const about=String($("#edit-about-quick")?.value||"").trim().slice(0,140)||"Available";
        if(currentUser&&currentUser.isSupabase){
          if(window.waBackendSaveAbout)void window.waBackendSaveAbout(about);
          else toast("Profile service is still loading. Try again.");
        }else{
          state.profile.about=about;currentUser.about=about;saveState();closeDialog();renderApp();toast("About updated.");
        }
        return;
      }
      if(action==="save-setting-choice"){
        state.settings.privacy=state.settings.privacy||{};state.settings.privacy[t.dataset.settingName]=t.dataset.settingValue;
        saveState();closeDialog();renderSettings();toast("Privacy preference saved locally.");return;
      }
      if(action==="save-language"){
        state.settings.language=t.dataset.language;saveState();closeDialog();renderSettings();toast("Language preference saved. Interface labels remain in English where translations are unavailable.");return;
      }
      if(action==="save-media-auto-download"){
        state.settings.mediaAutoDownload=t.dataset.mediaPolicy||"Wi-Fi and mobile data";
        saveState();closeDialog();renderSettings();toast("Media auto-download preference saved.");return;
      }
      if(action==="save-accent"){
        state.settings.accent=t.dataset.accentName;document.documentElement.style.setProperty("--green",t.dataset.accentColor);saveState();closeDialog();renderSettings();toast("Accent color changed.");return;
      }
      if(action==="save-contact-about"){
        const c=findChat(t.dataset.chatId);if(c){c.about=$("#contact-about").value.trim();saveState();closeDialog();renderMain();toast("Contact details updated in demo.");}return;
      }
      if(action==="publish-status"){
        const text=$("#status-text").value.trim();if(!text){toast("Enter a status first.");return;}
        state.statusUpdates.unshift({id:uid("status"),text:text,time:"Just now",name:"My status",avatar:state.profile.avatar});saveState();closeDialog();setView("updates");toast("Status added to this local preview.");return;
      }
      if(action==="logout"){closeDialog();logout();return;}
      if(action==="set-disappearing"){const days=Number(t.dataset.days);const c=currentChat();if(c)c.disappearingDays=days;saveState();closeDialog();renderMain();toast("Disappearing messages preference saved locally.");return;}
      if(action==="confirm-local-action"){
        const c=findChat(t.dataset.chatId);const kind=t.dataset.kind;
        if(c&&kind==="block-chat"){c.blocked=true;if(!state.blocked.includes(c.username))state.blocked.push(c.username);}
        if(c&&kind==="report-chat")c.reported=true;
        saveState();closeDialog();renderMain();toast("Demo action saved locally.");return;
      }
      if(action==="create-list"){const name=$("#list-name").value.trim();if(!name){toast("Enter a list name.");return;}state.customLists.push({id:uid("list"),name:name});saveState();closeDialog();toast("Custom list created.");return;}
      if(action==="bulk-selection"){const n=$$("#dialog-backdrop input[type=checkbox]:checked").length;closeDialog();toast(n+" chat(s) selected in this preview.");return;}
      if(action==="send-poll"){
        const c=currentChat();const question=$("#poll-question").value.trim();const opts=$("#poll-options").value.trim().split(/\n/).filter(Boolean);
        if(!c||!question||opts.length<2){toast("Add a question and at least two options.");return;}
        c.messages.push({id:uid("msg"),from:"me",text:"📊 Poll: "+question+"\n"+opts.map((o,i)=>(i+1)+". "+o).join("\n"),time:nowTime(),date:"TODAY",status:"sent"});c.preview="📊 Poll: "+question;c.time="Now";saveState();closeDialog();renderSidebar();renderMain();toast("Poll added to the local conversation.");return;
      }
      if(action==="send-event"){
        const c=currentChat();const name=$("#event-name").value.trim();if(!c||!name){toast("Enter an event name.");return;}
        const date=$("#event-date").value;const time=$("#event-time").value;
        const text="📅 Event: "+name+(date?"\nDate: "+date:"")+(time?"\nTime: "+time:"");
        c.messages.push({id:uid("msg"),from:"me",text:text,time:nowTime(),date:"TODAY",status:"sent"});c.preview=text;c.time="Now";saveState();closeDialog();renderSidebar();renderMain();toast("Event added to local conversation.");return;
      }
      return;
    }
    if(t.dataset.action){
      const action=t.dataset.action;
      if(action==="accept-request"){acceptRequest(t.dataset.requestId);return;}
      if(action==="decline-request"){declineRequest(t.dataset.requestId);return;}
      if(action==="cancel-request"){state.sentRequests=state.sentRequests.filter(r=>r.id!==t.dataset.requestId);save();renderMain();return;}
      if(action==="remove-list"){state.customLists=state.customLists.filter(l=>l.id!==t.dataset.listId);saveState();renderMain();return;}
      if(action==="status-preview"){toast("Status viewer preview.");return;}
      handleAction(action,t);return;
    }
    if(t.dataset.chatId){
      if(t.classList.contains("row-menu"))return;
      if(t.dataset.chatId)selectChat(t.dataset.chatId);
      return;
    }
    if(t.dataset.communityId){const c=state.communities.find(x=>x.id===t.dataset.communityId);if(c)openDialog(c.name,"<p class='screen-description'>"+esc(c.description||"A local demo community.")+"</p><div class='section-card'>"+c.groups.map(n=>"<div class='setting-row'>"+icon("users")+"<span class='setting-title'>"+esc(n)+"</span></div>").join("")+"</div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;}
    if(t.dataset.wallpaper)return;
    if(t.dataset.dialogDismiss==="true"&&event.target===t)closeDialog();
  });

  document.addEventListener("submit",event=>{
    if(event.target.id==="signup-form"){event.preventDefault();handleSignup(event.target);return;}
    if(event.target.id==="login-form"){event.preventDefault();handleLogin();return;}
    if(event.target.id==="message-form"){
      event.preventDefault();const input=$("#message-input");const text=input?input.value.trim():"";
      if(text){sendMessage(text);return;}
      const chat=currentChat();
      if(chat){const voice={id:uid("msg"),from:"me",text:"🎤 Voice message · 0:05",time:nowTime(),date:"TODAY",status:"sent",attachmentType:"voice"};chat.messages.push(voice);chat.preview="🎤 Voice message · 0:05";chat.time="Now";chat.lastOutgoing=true;saveState();renderSidebar();renderMain();toast("Demo voice message added locally.");}
      return;
    }
  });
  document.addEventListener("input",event=>{
    const target=event.target;
    if(target.id==="chat-search"){searchQuery=target.value;renderSidebar();return;}
    if(target.id==="friend-search"){
      const contact=lookupDirectory(target.value);const box=$("#friend-lookup-result");if(!box)return;
      if(!target.value.trim()){box.innerHTML="";return;}
      if(!contact){box.innerHTML="<div class='empty-state'>No local sample matched. Demo mode only searches contacts on this device; sign in with a shared WhatsApp account to find real usernames.</div>";return;}
      const isSelf=normalizeUsername(contact.username)===normalizeUsername(currentUser.username);
      const existing=state.chats.find(c=>normalizeUsername(c.username)===normalizeUsername(contact.username));
      const sent=state.sentRequests.some(r=>normalizeUsername(r.username)===normalizeUsername(contact.username));
      const received=state.requests.some(r=>normalizeUsername(r.username)===normalizeUsername(contact.username)&&r.status==="received");
      let button="";
      if(isSelf)button="<button class='secondary-button' disabled>Your account</button>";
      else if(existing)button="<button class='primary-button' data-action='open-found-chat' data-chat-id='"+esc(existing.id)+"'>Open chat</button>";
      else if(received)button="<button class='primary-button' data-action='accept-found-request' data-request-id='"+esc(state.requests.find(r=>normalizeUsername(r.username)===normalizeUsername(contact.username)).id)+"'>Accept request</button>";
      else if(sent)button="<button class='secondary-button' disabled>Request sent</button>";
      else button="<button class='primary-button' data-action='send-contact-request' data-contact-username='"+esc(contact.username)+"'>Send contact request</button>";
      box.innerHTML="<div class='request-card'>"+avatarHTML(contact)+"<div class='request-info'><strong>"+esc(contact.name)+"</strong><span>@"+esc(contact.username)+" · "+esc(contact.phone)+"</span><span>"+esc(contact.about||"Available")+"</span></div>"+button+"</div>";
      return;
    }
    if(target.id==="group-contact-search"){
      const q=target.value.toLowerCase();$$(".pick-row",$("#group-contact-list")).forEach(row=>row.style.display=row.textContent.toLowerCase().includes(q)?"":"none");return;
    }
    if(target.id==="settings-search"){
      settingsQuery=target.value;const pos=target.selectionStart;renderSettings();const next=$("#settings-search");if(next){next.focus();next.setSelectionRange(pos,pos);}return;
    }
    if(target.id==="chat-message-search"){
      const c=currentChat();const results=$("#chat-message-search-results");if(!c||!results)return;const q=target.value.toLowerCase();
      const matches=c.messages.filter(m=>m.text.toLowerCase().includes(q));results.innerHTML=q?matches.map(m=>"<div class='setting-row'>"+icon("chat")+"<span class='setting-copy'><span class='setting-title'>"+esc(m.text)+"</span><span class='setting-subtitle'>"+esc(m.time)+"</span></span></div>").join(""):"";
      return;
    }
    if(target.id==="channel-search-input"){renderChannelSearchResults();return;}
    if(target.id==="message-input"){
      target.style.height="auto";target.style.height=Math.min(target.scrollHeight,106)+"px";
      const send=$(".send-button");if(send)send.innerHTML=icon(target.value.trim()?"send":"mic");
    }
  });
  document.addEventListener("input",event=>{const target=event.target;if(!target||target.id!=="wa-ringtone-volume")return;const value=Math.max(25,Math.min(100,Number(target.value)||100));if(window.WhatsAppCalls&&window.WhatsAppCalls.setRingtoneVolume)window.WhatsAppCalls.setRingtoneVolume(value);const label=$("#wa-ringtone-volume-label");if(label)label.textContent=value+"%";});
  document.addEventListener("change",event=>{
    const t=event.target;
    if(t.id==="wa-ringtone-file-input"&&t.files&&t.files[0]){const file=t.files[0];t.value="";if(!/\.mp3$/i.test(String(file.name||""))){toast("Choose an MP3 file (.mp3).");return;}if(file.size>10*1024*1024){toast("Choose an MP3 smaller than 10 MB.");return;}const api=window.WhatsAppCalls;if(!api||!api.setCustomRingtone){toast("Ringtone controls are still loading. Refresh and retry.");return;}void api.setCustomRingtone(file).then(()=>{closeDialog();renderSettings();toast("Custom MP3 ringtone saved on this device.");}).catch(error=>toast("Could not save ringtone: "+String(error&&error.message||"Unknown error")));return;}
    if(t.id==="profile-photo-input" && t.files && t.files[0]){
      if(currentUser&&currentUser.isSupabase){t.value="";return;}
      const file=t.files[0];
      if(!file.type.startsWith("image/")){toast("Choose an image file.");t.value="";return;}
      if(file.size>2*1024*1024){toast("Choose an image smaller than 2 MB for this local demo.");t.value="";return;}
      const reader=new FileReader();
      reader.onload=()=>{state.profile.avatarData=reader.result;saveState();renderMain();toast("Profile photo updated locally.");};
      reader.readAsDataURL(file);t.value="";return;
    }
    if(t.id==="attachment-input" && t.files && t.files[0]){
      const file=t.files[0];attachmentFile=file;
      const chat=currentChat();if(chat){
        const reader=new FileReader();
        reader.onload=()=>{
          const attachment={id:uid("attachment"),name:file.name,type:file.type.startsWith("image/")?"image":"file",size:file.size,dataUrl:file.type.startsWith("image/")?reader.result:null};
          chat.attachments=chat.attachments||[];chat.attachments.push(attachment);
          const text=file.type.startsWith("image/")?"🖼️ Photo: "+file.name:"📎 "+file.name;
          chat.messages.push({id:uid("msg"),from:"me",text:text,time:nowTime(),date:"TODAY",status:"sent",attachmentId:attachment.id});
          chat.preview=text;chat.time="Now";chat.lastMessageType="attachment";saveState();renderSidebar();renderMain();toast("Attachment added to the local preview.");
        };
        if(file.type.startsWith("image/")&&file.size<2*1024*1024)reader.readAsDataURL(file);else {reader.result=null;reader.onload();} 
      }
      t.value="";
    }
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){
      if(selectedMessage){dismissMessageSelection(false);return;}
      closePopup();if($("#dialog-backdrop"))closeDialog();
      else if(view==="info"){view="chats";renderMain();updateMobile();}
      else if(selectedChatId!==null&&window.matchMedia("(max-width:700px)").matches){selectedChatId=null;renderSidebar();renderMain();updateMobile();}
    }
    if((event.target.classList.contains("chat-row")||event.target.classList.contains("archived-row"))&&(event.key==="Enter"||event.key===" ")){event.preventDefault();const id=event.target.dataset.chatId;if(id)selectChat(id);else if(event.target.classList.contains("archived-row"))setView("archived");}
    if(event.target.classList.contains("message-row")&&(event.key==="Enter"||event.key===" ")){event.preventDefault();selectMessageForActions(event.target);}
    if(event.target.id==="message-input"&&event.key==="Enter"&&!event.shiftKey&&state.settings.enterToSend){event.preventDefault();$("#message-form").requestSubmit();}
  });
  document.addEventListener("click",event=>{
    const menu=$("#popup-menu");
    if(menu&&!menu.contains(event.target)&&!event.target.closest("[data-action]"))closePopup();
  });
  main.addEventListener("pointerdown",event=>{
    const row=event.target.closest(".message-row");
    if(!row||event.target.closest("button,a,input,textarea,select"))return;
    if(event.pointerType==="mouse"&&event.button!==0)return;
    clearTimeout(messageHoldTimer);
    messageHoldRow=row;messageHoldStart={x:event.clientX,y:event.clientY};
    messageHoldTimer=setTimeout(()=>{if(!messageHoldRow)return;messageHoldTriggered=true;selectMessageForActions(messageHoldRow);},520);
  },true);
  main.addEventListener("pointermove",event=>{
    if(!messageHoldTimer||!messageHoldStart)return;
    if(Math.abs(event.clientX-messageHoldStart.x)>10||Math.abs(event.clientY-messageHoldStart.y)>10){
      clearTimeout(messageHoldTimer);messageHoldTimer=null;messageHoldRow=null;messageHoldStart=null;
    }
  },{capture:true,passive:true});
  const stopMessageHold=()=>{if(messageHoldTimer){clearTimeout(messageHoldTimer);messageHoldTimer=null;}messageHoldRow=null;messageHoldStart=null;};
  main.addEventListener("pointerup",stopMessageHold,true);
  main.addEventListener("pointercancel",stopMessageHold,true);
  main.addEventListener("click",event=>{
    if(messageHoldTriggered&&event.target.closest(".message-row")){
      event.preventDefault();event.stopImmediatePropagation();messageHoldTriggered=false;
    }
  },true);
  async function applySelectedMessageReaction(emoji) {
    const ref=selectedMessage||state&&state.lastContextMessage;
    if(!ref||!ref.id){toast("Hold a message first to react.");return;}
    const allowed=["👍","❤️","😂","😮","🙏"];
    if(!allowed.includes(emoji))return;
    messageReactionPickerOpen=false;
    syncMessageSelectionUI();
    try {
      if(currentUser&&currentUser.isSupabase){
        const react=window.waAppBridge&&window.waAppBridge.reactBackendMessage;
        if(typeof react!=="function")throw new Error("Message reactions are not ready. Reload and try again.");
        await react(ref.id,emoji);
      } else {
        const chat=state.chats.find(c=>String(c.id)===String(ref.chatId));
        const message=chat&&chat.messages.find(m=>String(m.id)===String(ref.id));
        if(!message)throw new Error("That message is no longer in this chat.");
        message.reactions=Array.isArray(message.reactions)?message.reactions:[];
        const same=message.reactions.indexOf(emoji);
        if(same>=0)message.reactions.splice(same,1);else message.reactions.push(emoji);
        saveState();renderSidebar();renderMain();
      }
      toast("Reaction updated.");
    } catch(error) { toast("Could not react: "+String(error&&error.message||"Unknown error")); }
  }
  main.addEventListener("click",event=>{
    const reactionButton=event.target.closest("[data-message-reaction-emoji]");
    if(reactionButton){
      event.preventDefault();event.stopPropagation();
      void applySelectedMessageReaction(reactionButton.dataset.messageReactionEmoji);
      return;
    }
    const button=event.target.closest("[data-message-toolbar-action]");
    if(!button)return;
    event.preventDefault();event.stopPropagation();
    const action=button.dataset.messageToolbarAction,chat=currentChat();
    if(action==="cancel"){dismissMessageSelection(false);messageReactionPickerOpen=false;return;}
    if(action==="react"){messageReactionPickerOpen=!messageReactionPickerOpen;syncMessageSelectionUI();return;}
    if(action==="more"){const bar=$("#message-selection-toolbar",main);if(chat&&bar)openPopup(bar,menuItems("message-menu",chat),chat.id);return;}
    const map={reply:"reply-message",forward:"forward-message",star:"star-message",copy:"copy-message",delete:"delete-message"};
    if(map[action])runMenuAction(map[action],chat);
  });
  main.addEventListener("contextmenu",event=>{
    const row=event.target.closest(".message-row");
    if(!row)return;
    event.preventDefault();
    selectMessageForActions(row);
  });
  window.addEventListener("resize",updateMobile);

  const originalHandleAction=handleAction;
  handleAction=function(action,el){
    if(action==="cancel-message-selection"){dismissMessageSelection(false);return;}
    if(action==="cancel-reply"){replyingTo=null;updateReplyPreview();const input=$("#message-input");if(input)input.focus();return;}
    if(action==="jump-to-reply"){
      const targetId=el.dataset.replyTargetId;
      const row=$$(".message-row",main).find(node=>String(node.dataset.messageId)===String(targetId));
      if(row){row.scrollIntoView({behavior:"smooth",block:"center"});row.classList.add("reply-target-flash");setTimeout(()=>row.classList.remove("reply-target-flash"),1200);}
      return;
    }
    if(action==="delete-message-for-me"||action==="delete-message-for-everyone"){
      const ref=state&&state.lastContextMessage;
      if(!ref){toast("Select a message first.");closeDialog();return;}
      const id=ref.id,isServer=!!(currentUser&&currentUser.isSupabase);
      const run=async()=>{
        try{
          if(isServer){
            if(action==="delete-message-for-everyone"){
              if(ref.from!=="me"||!window.waAppBridge?.deleteBackendMessage)throw new Error("Only your own sent messages can be deleted for everyone.");
              await window.waAppBridge.deleteBackendMessage(id);
            }else{
              if(!window.waAppBridge?.hideBackendMessage)throw new Error("Message sync is unavailable. Reload the app and retry.");
              await window.waAppBridge.hideBackendMessage(id);
            }
          }else{
            const targetChat=state.chats.find(c=>String(c.id)===String(ref.chatId));
            if(targetChat)targetChat.messages=targetChat.messages.filter(m=>String(m.id)!==String(id));
            if(targetChat&&!targetChat.messages.length)targetChat.preview="";
            saveState();renderSidebar();renderMain();
          }
          closeDialog();dismissMessageSelection(false);toast(action==="delete-message-for-everyone"?"Message deleted for everyone.":"Message deleted for you.");
        }catch(error){toast("Could not delete message: "+String(error&&error.message||"Unknown error"));}
      };
      void run();return;
    }
    if(action==="forward-message-to-chat"){
      const targetId=el.dataset.targetChatId,draft=forwardDraft;
      if(!draft){toast("Select a message to forward.");closeDialog();return;}
      const target=findChat(targetId);
      if(!target){toast("That conversation is no longer available.");return;}
      const run=async()=>{
        try{
          if(currentUser&&currentUser.isSupabase){
            if(!window.waAppBridge?.forwardBackendMessage)throw new Error("Message sync is unavailable. Reload the app and retry.");
            await window.waAppBridge.forwardBackendMessage(targetId,draft.id,draft.text||draft.attachmentName||"Attachment");
          }else{
            target.messages.push({id:uid("msg"),from:"me",text:draft.text||draft.attachmentName||"Attachment",time:nowTime(),date:dayLabel(),status:"sent",forwarded:true,forwardedFromId:draft.id});
            target.preview=draft.text||"Forwarded message";target.time="Now";saveState();renderSidebar();
          }
          forwardDraft=null;closeDialog();dismissMessageSelection(false);toast("Message forwarded.");
        }catch(error){toast("Could not forward message: "+String(error&&error.message||"Unknown error"));}
      };
      void run();return;
    }
    if(action==="send-contact-request"){
      const contact=lookupDirectory(el.dataset.contactUsername);
      if(contact)requestSend(contact);
      return;
    }
    if(action==="open-found-chat"){selectChat(el.dataset.chatId);closeDialog();return;}
    if(action==="accept-found-request"){acceptRequest(el.dataset.requestId);closeDialog();return;}
    if(action==="edit-profile"){editProfileDialog();return;}
    if(action==="edit-about"){editAboutDialog();return;}
    if(action==="remove-list"){state.customLists=state.customLists.filter(l=>l.id!==el.dataset.listId);saveState();renderMain();return;}
    if(action==="toggle-channel"){const c=state.channels.find(c=>c.id===el.dataset.channelId);if(c){c.following=!c.following;saveState();renderMain();}return;}
    if(action==="go-requests"){setView("requests");return;}
    if(action==="open-archived"){setView("archived");return;}
    if(action==="new-community"){createCommunityDialog();return;}
    originalHandleAction(action,el);
  };
  const originalUseAction=useAction;
  useAction=function(action,chat){
    if(action==="edit-group"||action==="edit-group-description"){if(chat){editGroupDialog(chat);return;}}
    if(action==="copy-phone"){copyText(state.profile.phone);return;}
    originalUseAction(action,chat);
  };

  function clearLegacyLocalDemoState() {
    // Remove the old browser-only account and cached demo conversations. Supabase's
    // auth storage is separate and is intentionally left untouched.
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(SESSION_KEY);
      const keys = [];
      for (let i=0; i<localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("wa_local_state_")) keys.push(key);
      }
      keys.forEach(key => {
        try {
          const oldState = JSON.parse(localStorage.getItem(key) || "null");
          const settings = oldState && oldState.settings && typeof oldState.settings === "object" ? oldState.settings : {};
          if (Object.keys(settings).length) localStorage.setItem(key, JSON.stringify({version:3,settings}));
          else localStorage.removeItem(key);
        } catch (_) { localStorage.removeItem(key); }
      });
    } catch (_) {}
  }

  function init() {
    clearLegacyLocalDemoState();
    const addInput=document.createElement("input");
    addInput.type="file";addInput.id="attachment-input";addInput.hidden=true;addInput.accept="*/*";document.body.appendChild(addInput);
    const photoInput=document.createElement("input");
    photoInput.type="file";photoInput.id="profile-photo-input";photoInput.hidden=true;photoInput.accept="image/*";document.body.appendChild(photoInput);
    renderAuth("signup");
    auth.classList.add("hidden");
    const closeBackdrop=document.createElement("style");
    closeBackdrop.textContent=".wallpaper-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.wallpaper-swatch{display:flex;flex-direction:column;gap:8px;padding:8px;border:1px solid #e2e6e8;border-radius:9px;background:#fff;font-size:12px}.wallpaper-preview{height:90px;border-radius:6px;display:block;border:1px solid #e8ecee}.default-wallpaper{background:#efeae2 repeating-linear-gradient(45deg,transparent,transparent 12px,#e4ddd2 13px,transparent 14px)}.plain-wallpaper{background:#fff}.green-wallpaper{background:#dbeee5}.setting-side-label{font-size:12px;color:#667781}.settings-summary h4{margin:0 0 4px;font-size:16px;font-weight:500}.settings-summary p{margin:0;color:#667781;font-size:12px}.settings-option{display:flex;align-items:center;gap:14px;min-height:72px;padding:12px 16px;border-bottom:1px solid #f0f2f2;background:#fff}.settings-option:first-child{border-top:1px solid #f0f2f2}.settings-option-copy{min-width:0;flex:1}.settings-option-copy strong{display:block;font-size:14px;font-weight:500;margin-bottom:5px}.settings-option-copy span{display:block;color:#667781;font-size:12px;line-height:1.45}.toggle{width:38px;height:22px;flex:0 0 auto;border:0;border-radius:12px;background:#d6dcdf;padding:3px;display:flex;align-items:center}.toggle:after{content:'';height:16px;width:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002}.toggle.on{justify-content:flex-end;background:#00a884}.mobile-open .chat-sidebar{display:none}.mobile-open .main-pane{display:flex}@media(max-width:700px){.wallpaper-preview{height:65px}.wide{max-width:100%}}";
    document.head.appendChild(closeBackdrop);
  }

  // Small public bridge used by backend.js; database/auth code remains in a separate module.
  window.waAppBridge = {
    getState: () => state,
    getCurrentUser: () => currentUser,
    getCurrentChat: () => currentChat(),
    getReplyToMessageId: () => { const chat=currentChat(); return replyingTo&&chat&&String(replyingTo.chatId)===String(chat.id)?replyingTo.id:null; },
    clearReplyToMessage: (id) => { if(replyingTo&&(!id||String(replyingTo.id)===String(id))){replyingTo=null;updateReplyPreview();} },
    getSelectedChatId: () => selectedChatId,
    setBackendUser: (authUser, profile) => {
      const name = String(profile.display_name || profile.username || "User");
      const phoneDigits = String(profile.custom_number || "").replace(/\D/g, "");
      const tail = phoneDigits.startsWith("990") ? phoneDigits.slice(3) : phoneDigits;
      const number = tail.length === 9 ? "+990 " + tail.slice(0,3) + " " + tail.slice(3,6) + " " + tail.slice(6,9) : String(profile.custom_number || "");
      currentUser = { id: authUser.id, username: String(profile.username || "").toLowerCase(), name, phone: number,
        about: profile.about || "Available", avatarData: profile.avatar_data || "", avatarColor: 1,
        avatar: initials(name), createdAt: authUser.created_at || profile.created_at || new Date().toISOString(),
        email: authUser.email || "", isSupabase: true };
      const fresh = createUserState(currentUser);
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(stateKey(currentUser.username)) || "null"); } catch (_) {}
      if (saved && saved.settings) fresh.settings = Object.assign(fresh.settings, saved.settings);
      if (saved && saved.customLists) fresh.customLists = saved.customLists;
      fresh.profile = { username: currentUser.username, name: currentUser.name, phone: currentUser.phone,
        about: currentUser.about, avatar: initials(name), avatarColor: 1, avatarData: currentUser.avatarData };
      fresh.chats = []; fresh.requests = []; fresh.sentRequests = []; fresh.contacts = []; fresh.calls = []; fresh.backendStatuses=[]; fresh.backendChannels=[]; fresh.backendChannelPosts=[]; fresh.backendCommunities=[]; fresh.statusUpdates=[]; fresh.channels=[]; fresh.communities=[];
      state = fresh; selectedChatId = null; view = "chats";
      auth.classList.add("hidden"); app.classList.remove("hidden"); applySettings(); renderApp();
    },
    setBackendData: (data) => {
      if (!state || !currentUser || !currentUser.isSupabase) return;
      if (data.profile) state.profile = data.profile;
      if (data.chats) {
        let aliases={},hidden=[];
        try{aliases=JSON.parse(localStorage.getItem("wa_contact_aliases_"+normalizeUsername(currentUser.username))||"{}")||{};}catch(_){}
        try{hidden=JSON.parse(localStorage.getItem("wa_hidden_contacts_"+normalizeUsername(currentUser.username))||"[]")||[];}catch(_){}
        const hiddenSet=new Set(hidden.map(String));
        state.chats=data.chats.filter(chat=>!hiddenSet.has(String(chat.id))).map(chat=>aliases[String(chat.id)]?Object.assign({},chat,{name:aliases[String(chat.id)],localAlias:aliases[String(chat.id)]}):chat);
      }
      if (data.requests) state.requests = data.requests;
      if (data.sentRequests) state.sentRequests = data.sentRequests;
      if (data.calls) state.calls = data.calls;
      if (data.statuses) state.backendStatuses = data.statuses;
      if (data.channels) state.backendChannels = data.channels;
      if (data.channelPosts) state.backendChannelPosts = data.channelPosts;
      if (data.communities) state.backendCommunities = data.communities;
      if (selectedChatId && !state.chats.some(c => String(c.id) === String(selectedChatId))) selectedChatId = null;
      const oldInput = $("#message-input");
      const draft = oldInput ? oldInput.value : "";
      const wasTyping = !!oldInput && document.activeElement === oldInput;
      const selection = oldInput && typeof oldInput.selectionStart === "number" ? [oldInput.selectionStart, oldInput.selectionEnd] : null;
      const scrollBefore = $("#message-scroll") ? $("#message-scroll").scrollTop : null;
      renderApp();
      const nextInput = $("#message-input");
      if (nextInput && draft) {
        nextInput.value = draft;
        nextInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (nextInput && wasTyping) {
        nextInput.focus({ preventScroll: true });
        if (selection) try { nextInput.setSelectionRange(selection[0], selection[1]); } catch (_) {}
      }
      const nextScroll = $("#message-scroll");
      if (nextScroll && scrollBefore !== null) nextScroll.scrollTop = scrollBefore;
    },
    render: () => renderApp(),
    renderMain: () => renderMain(),
    renderSidebar: () => renderSidebar(),
    selectChat: (id) => selectChat(id),
    setView: (next) => setView(next),
    closeDialog: () => closeDialog(),
    openDialog: (title, body, footer) => openDialog(title, body, footer),
    toast: (message) => toast(message),
    handleAction: (action, element) => handleAction(action, element),
    useAction: (action, chat) => useAction(action, chat),
    saveState: () => saveState(),
    updateCounts: () => updateCounts(),
    currentUser: () => currentUser,
    icon: (name) => icon(name),
    avatarHTML: (person) => avatarHTML(person),
    escapeHTML: (value) => esc(value),
    getSettings: () => state && state.settings || {},
    promptNotificationSetup: () => promptNotificationSetup(),
    updateBackendProfile: (profile) => {
      if (!currentUser || !state) return;
      currentUser.name = profile.name || currentUser.name;
      currentUser.about = profile.about || currentUser.about;
      currentUser.phone = profile.phone || currentUser.phone;
      currentUser.avatarData = profile.avatarData || currentUser.avatarData;
      state.profile = Object.assign(state.profile, profile);
      renderApp();
    }
  };

  // Compatibility for previously rendered callbacks; new code uses scoped helpers.
  window.ESC = window.ESC || esc;
  window.Escape = window.Escape || window.ESC;
  window.icon = window.icon || ((name, cls) => icon(name, cls));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", event => {
      const data=event.data||{};
      if(data.type==="whatsapp-notification-action"){
        if(data.kind==="call")window.WhatsAppCalls?.handleNotificationAction?.(data);
        else if(data.chatId&&window.waAppBridge)window.waAppBridge.selectChat(data.chatId);
      }
    });
  }
  init();
})();