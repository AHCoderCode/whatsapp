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
  let demoDirectory = [
    { username:"ayesha.k", name:"Ayesha Khan", phone:"+990 700 100 101", about:"Available", avatar:1, online:true },
    { username:"hassan.r", name:"Hassan Raza", phone:"+990 700 100 102", about:"Hey there! I am using WhatsApp.", avatar:3, online:false },
    { username:"mom", name:"Mom", phone:"+990 700 100 103", about:"Love you always", avatar:5, online:false },
    { username:"dad", name:"Dad", phone:"+990 700 100 104", about:"Busy", avatar:6, online:false },
    { username:"ali.r", name:"Ali Raza", phone:"+990 700 100 105", about:"At work", avatar:7, online:true },
    { username:"sara.a", name:"Sara Ahmed", phone:"+990 700 100 106", about:"Good vibes only", avatar:9, online:false },
    { username:"noor.f", name:"Noor Fatima", phone:"+990 700 100 107", about:"At school", avatar:2, online:false },
    { username:"zainab", name:"Zainab", phone:"+990 700 100 108", about:"Available", avatar:5, online:false },
    { username:"bilal.k", name:"Bilal Khan", phone:"+990 700 100 109", about:"Can't talk, WhatsApp only", avatar:4, online:false },
    { username:"mina.s", name:"Mina Shah", phone:"+990 700 100 110", about:"✨", avatar:8, online:true },
    { username:"hira.m", name:"Hira Malik", phone:"+990 700 100 111", about:"Available", avatar:10, online:false },
    { username:"hamza", name:"Hamza", phone:"+990 700 100 112", about:"At the gym", avatar:11, online:false }
  ];
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
      ["log-out","Log out","Leave this demo account on this device.","button"]
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
      ["database","Chat backup","Back up your local demo data.","button"],
      ["image","Media visibility","Show downloaded media in your device gallery.","toggle"],
      ["keyboard","Enter is send","Press Enter to send messages.","toggle"]
    ],
    notifications:[
      ["bell","Messages","Message notifications and sounds.","button"],
      ["users","Groups","Group notifications and sounds.","button"],
      ["phone","Calls","Ringtone and call notifications.","button"],
      ["sparkles","Reaction notifications","Show notifications when someone reacts to messages.","toggle"]
    ],
    personalization:[
      ["palette","Theme","Choose light or dark appearance.","toggle-theme"],
      ["image","Chat wallpaper","Change the conversation wallpaper.","wallpaper"],
      ["sparkles","Accent color","WhatsApp green accent theme.","Green"]
    ],
    storage:[
      ["database","Manage storage","Review the local data used by this preview.","button"],
      ["image","Manage media","No uploaded media is stored in this demo.","button"],
      ["download","Media auto-download","Choose when media should download.","button"],
      ["database","Network usage","No network usage in this frontend demo.","button"]
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
      ["file","Terms and privacy policy","Review the demo privacy note.","button"],
      ["info","App info","WhatsApp-style frontend demo · v0.2","button"]
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
  function uid(prefix) { return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8); }
  function normalizeUsername(value) { return String(value || "").trim().toLowerCase().replace(/^@/, ""); }
  function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
  function nowTime() { return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
  function dayLabel() { return "TODAY"; }
  function seedMessages(parts) { return parts.map(p => ({id:uid("m"), from:p[0], text:p[1], time:p[2], date:p[3] || "TODAY", sender:p[4] || "", status:p[0] === "me" ? "read" : "received", reactions:p[5] || []})); }
  function seedChat(id,name,username,phone,avatar,type,time,preview,unread,favorite,pinned,online,messages,extra) {
    return Object.assign({id:id,name:name,username:username,phone:phone,avatar:avatar,type:type,time:time,preview:preview,unread:unread,favorite:favorite,pinned:pinned,online:!!online,muted:false,archived:false,locked:false,about:"Available",participants:[],messages:seedMessages(messages || []),attachments:[]},extra || {});
  }
  function defaultChats() {
    return [
      seedChat("c1","Ayesha Khan","ayesha.k","+990 700 100 101",1,"person","12:48 PM","That sounds great! 😊",0,true,true,true,[["them","Hey! How are you?","12:39 PM"],["me","I'm good, thank you! How are you?","12:41 PM"],["them","Doing well 😊 Are we still meeting later?","12:44 PM"],["me","Yes, absolutely. I'll be there around 5.","12:46 PM"],["them","That sounds great! 😊","12:48 PM"]],{about:"Available",phone:"+990 700 100 101"}),
      seedChat("c2","Family Group","family.group","+990 700 900 001",2,"group","12:41 PM","Ammi: Everyone be home by 6",3,true,false,false,[["them","Reminder: family dinner tonight!","12:34 PM","TODAY","Ammi"],["them","What time should everyone arrive?","12:36 PM","TODAY","Ayesha Khan"],["them","Everyone be home by 6","12:41 PM","TODAY","Ammi"]],{about:"Family first ❤️",participants:["Ammi","Abu","Ayesha Khan","Hassan Raza","You"]}),
      seedChat("c3","Hassan Raza","hassan.r","+990 700 100 102",3,"person","12:25 PM","😂😂😂",1,true,false,false,[["them","Did you see that video?","12:18 PM"],["me","Not yet, send it 😄","12:22 PM"],["them","😂😂😂","12:25 PM"]],{phone:"+990 700 100 102"}),
      seedChat("c4","School Friends","school.friends","+990 700 900 002",4,"group","11:52 AM","Zain: Send the notes when you can",8,false,false,false,[["them","Is anyone free to study together this weekend?","11:41 AM","TODAY","Mina"],["them","I'm free Saturday afternoon","11:48 AM","TODAY","Sara Ahmed"],["them","Send the notes when you can","11:52 AM","TODAY","Zain"]],{about:"Class group",participants:["Zain","Mina","Sara Ahmed","Hassan Raza","You"]}),
      seedChat("c5","Mom","mom","+990 700 100 103",5,"person","11:30 AM","Okay, I'll be there soon.",0,true,false,false,[["me","I'm on my way home","11:27 AM"],["them","Okay, I'll be there soon.","11:30 AM"]],{about:"Love you always"}),
      seedChat("c6","Dad","dad","+990 700 100 104",6,"person","10:58 AM","Call me when you're free",1,true,false,false,[["them","Call me when you're free","10:58 AM"]],{about:"Busy"}),
      seedChat("c7","Ali Raza","ali.r","+990 700 100 105",7,"person","10:31 AM","See you tomorrow!",0,true,true,true,[["them","Same cafe tomorrow?","10:27 AM"],["me","Perfect. See you tomorrow!","10:31 AM"]],{about:"At work"}),
      seedChat("c8","Study Group","study.group","+990 700 900 003",8,"group","Yesterday","Mina: Did anyone finish the worksheet?",4,false,false,false,[["them","Can someone explain question 4?","Yesterday","YESTERDAY","Noor Fatima"],["them","I can help after lunch","Yesterday","YESTERDAY","Mina"],["them","Did anyone finish the worksheet?","Yesterday","YESTERDAY","Mina"]],{about:"Study together, succeed together 📚",participants:["Mina","Noor Fatima","Sara Ahmed","You"]}),
      seedChat("c9","Sara Ahmed","sara.a","+990 700 100 106",9,"person","Yesterday","Good morning ☀️",0,false,false,false,[["them","Hope you have a lovely day!","Yesterday","YESTERDAY"],["me","Good morning ☀️","Yesterday","YESTERDAY"]]),
      seedChat("c10","Cousins Group","cousins.group","+990 700 900 004",10,"group","Yesterday","Hira: Shared a photo",2,true,false,false,[["them","Weekend plan?","Yesterday","YESTERDAY","Bilal"],["them","Shared a photo","Yesterday","YESTERDAY","Hira"]],{muted:true,about:"Cousins ❤️",participants:["Hira","Bilal","Ayesha Khan","You"]}),
      seedChat("c11","Hamza","hamza","+990 700 100 112",11,"person","Yesterday","Voice message",0,false,false,false,[["them","Voice message · 0:18","Yesterday","YESTERDAY"]]),
      seedChat("c12","Work Group","work.group","+990 700 900 005",12,"group","Tuesday","Meeting moved to 3:30 PM",6,false,false,false,[["them","Agenda is ready for the team meeting.","Tuesday","TUESDAY","Manager"],["them","Meeting moved to 3:30 PM","Tuesday","TUESDAY","Ahmed"]],{about:"Work updates",participants:["Manager","Ahmed","Mina","You"]}),
      seedChat("c13","Noor Fatima","noor.f","+990 700 100 107",2,"person","Monday","Sure, no problem!",0,false,false,false,[["me","Could you share the notes?","Monday","MONDAY"],["them","Sure, no problem!","Monday","MONDAY"]]),
      seedChat("c14","Project Group","project.group","+990 700 900 006",3,"group","Monday","You: Let's do it 👍",2,false,false,false,[["them","I added the latest updates to the document.","Monday","MONDAY","Ali Raza"],["me","Let's do it 👍","Monday","MONDAY"]],{participants:["Ali Raza","Sara Ahmed","You"]}),
      seedChat("c15","Zainab","zainab","+990 700 100 108",5,"person","Sunday","Thank you ❤️",0,true,false,false,[["them","You really helped me today.","Sunday","SUNDAY"],["me","Thank you ❤️","Sunday","SUNDAY"]]),
      seedChat("c16","Weekend Plans","weekend.plans","+990 700 900 007",4,"group","Saturday","I'll check and let you know",0,false,false,false,[["me","I'll check and let you know","Saturday","SATURDAY"]],{archived:true,participants:["Hassan Raza","Noor Fatima","You"]})
    ];
  }
  function defaultRequests() {
    return [
      {id:"r1",username:"bilal.k",name:"Bilal Khan",phone:"+990 700 100 109",avatar:4,about:"Can't talk, WhatsApp only",note:"Hello! Please add me.",time:"10 min ago",status:"received"},
      {id:"r2",username:"hira.m",name:"Hira Malik",phone:"+990 700 100 111",avatar:10,about:"Available",note:"Hi! I'd like to connect with you.",time:"35 min ago",status:"received"},
      {id:"r3",username:"mina.s",name:"Mina Shah",phone:"+990 700 100 110",avatar:8,about:"✨",note:"Let's stay in touch 😊",time:"1 hour ago",status:"received"}
    ];
  }
  function freshDb() { return {version:2,accounts:[],directory:demoDirectory.map(o=>Object.assign({},o))}; }
  function readDb() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.directory)) return parsed;
    } catch (_) {}
    return freshDb();
  }
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
      communities:[{id:"community-school",name:"School community",description:"Class updates and school friends",groups:["School Friends","Study Group"]},{id:"community-family",name:"Family community",description:"Family updates in one place",groups:["Family Group","Cousins Group"]}],
      channels:[{id:"whatsapp-official",name:"WhatsApp",initials:"W",avatar:2,description:"Official updates from WhatsApp",following:true},{id:"meta-official",name:"Meta",initials:"M",avatar:3,description:"Updates from Meta",following:false},{id:"tech-today",name:"Technology Today",initials:"T",avatar:7,description:"Technology news and updates",following:false}],
      settings:{dark:false,wallpaper:"default",readReceipts:true,keepArchived:true,enterToSend:true,mediaVisibility:true,appLock:false,reduceMotion:false,keyboardNav:true,highContrast:false,spellcheck:true,reactionNotifications:true,securityNotifications:true},
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
        return Object.assign(defaults, saved, {profile:Object.assign(defaults.profile,saved.profile),settings:Object.assign(defaults.settings,saved.settings || {})});
      }
    } catch (_) {}
    const created = createUserState(user);
    saveState(created,user.username);
    return created;
  }
  function saveState(s = state, username = currentUser && currentUser.username) {
    if (!s || !username) return;
    try { localStorage.setItem(stateKey(username), JSON.stringify(s)); } catch (_) { toast("Could not save all changes to browser storage."); }
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
      authSlot.innerHTML = "<h2 class='auth-heading'>Create your account</h2><p class='auth-subheading'>Choose a username and an in-app number. No real phone number or SMS verification is needed for this demo.</p>" +
        "<form class='auth-form' id='signup-form' novalidate>" +
        "<div id='auth-error' class='form-error' role='alert'></div>" +
        authField("signup-name","Your display name","text","How people see you","","This can be changed later.","autocomplete='name' maxlength='48' required") +
        authField("signup-username","Username","text","Choose a unique username","","3–20 characters: letters, numbers, dots or underscores. Other people can find you by this.","autocomplete='username' maxlength='20' required") +
        "<div class='form-field'><label for='signup-phone'>Your custom WhatsApp number</label><div class='phone-field-wrap'><span class='phone-prefix'>" + icon("phone") + "+990</span><input id='signup-phone' name='phone' type='tel' value='" + esc(phone.replace("+990 ","")) + "' inputmode='numeric' autocomplete='tel-national' required></div><span class='field-help'>A unique in-app demo number, not a real telephone number. It can be used to find your username.</span><span class='form-username-match' id='signup-phone-match'></span></div>" +
        authField("signup-password","Password","password","At least 6 characters","","Stored in this browser only for this frontend prototype.","autocomplete='new-password' minlength='6' required") +
        authField("signup-confirm","Confirm password","password","Type your password again","","","autocomplete='new-password' minlength='6' required") +
        "<div class='form-error' id='signup-error' role='alert'></div><button class='auth-primary' type='submit'>Create account " + icon("chevron") + "</button></form>" +
        "<div class='auth-separator'>OR</div><button class='auth-secondary' type='button' data-action='demo-login'>" + icon("sparkles") + " Try the interactive demo</button>";
      const phoneInput = $("#signup-phone");
      if (phoneInput) phoneInput.addEventListener("input", () => {
        phoneInput.value = phoneInput.value.replace(/[^\d\s()-]/g,"").slice(0,18);
        const match = lookupIdentity("+990 " + phoneInput.value);
        const label = $("#signup-phone-match");
        if (label) label.textContent = match ? "This in-app number belongs to @" + match.username + ". Choose another number." : "This number is available in the local demo.";
      });
    } else {
      authSlot.innerHTML = "<h2 class='auth-heading'>Welcome back</h2><p class='auth-subheading'>Log in with your username or custom in-app number.</p>" +
        "<form class='auth-form' id='login-form' novalidate><div class='form-error' id='login-error' role='alert'></div>" +
        authField("login-identity","Username or custom number","text","@username or +990 number","","Typing a known number will show its username.","autocomplete='username' required") +
        "<div id='login-identity-match' class='form-username-match'></div>" +
        authField("login-password","Password","password","Enter your password","","","autocomplete='current-password' required") +
        "<button class='auth-primary' type='submit'>Log in " + icon("chevron") + "</button></form>" +
        "<div class='auth-separator'>OR</div><button class='auth-secondary' type='button' data-action='demo-login'>" + icon("sparkles") + " Try the interactive demo</button>";
      const identity = $("#login-identity");
      if (identity) identity.addEventListener("input", () => {
        const match = lookupIdentity(identity.value);
        const label = $("#login-identity-match");
        if (label) label.textContent = match ? "Username found: @" + match.username : "";
      });
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
  function persistUser(user) {
    currentUser = user;
    localStorage.setItem(SESSION_KEY, normalizeUsername(user.username));
    state = loadState(user);
    auth.classList.add("hidden");
    app.classList.remove("hidden");
    applySettings();
    renderApp();
  }
  function handleSignup(form) {
    const name = $("#signup-name").value.trim();
    const username = normalizeUsername($("#signup-username").value);
    let phoneDigits = normalizePhone($("#signup-phone").value);
    if (phoneDigits.length === 9 && !phoneDigits.startsWith("990")) phoneDigits = "990" + phoneDigits;
    const phone = "+990 " + phoneDigits.replace(/^990/,"").replace(/(\d{3})(\d{3})(\d{0,3}).*/, "$1 $2 $3").trim();
    const password = $("#signup-password").value;
    const confirm = $("#signup-confirm").value;
    const error = $("#signup-error");
    const fail = text => { error.textContent=text; error.classList.add("show"); };
    if (!name) return fail("Enter a display name.");
    if (!/^[a-z0-9._]{3,20}$/.test(username)) return fail("Username must be 3–20 characters using letters, numbers, dots or underscores.");
    if (db.accounts.some(a=>normalizeUsername(a.username)===username)) return fail("That username is already taken on this browser.");
    if (normalizePhone(phone).length < 9) return fail("Enter a custom number with at least 9 digits after the demo prefix.");
    if (db.accounts.concat(db.directory).some(a=>normalizePhone(a.phone)===normalizePhone(phone))) return fail("That custom number is already in use. Choose another.");
    if (password.length < 6) return fail("Use a password with at least 6 characters.");
    if (password !== confirm) return fail("The passwords do not match.");
    const user = {id:uid("account"),username:username,name:name,phone:phone,about:"Available",password:password,avatar:initials(name),avatarColor:Math.floor(Math.random()*12)+1,createdAt:new Date().toISOString()};
    db.accounts.push(user); saveDb();
    persistUser(user);
    toast("Account created locally. No backend account exists yet.");
  }
  function handleLogin() {
    const identity = $("#login-identity").value.trim();
    const password = $("#login-password").value;
    const error = $("#login-error");
    const user = lookupIdentity(identity);
    if (!user || !db.accounts.some(a=>a.id===user.id) || user.password !== password) {
      error.textContent = "Account not found or password incorrect. Use your browser's demo account or create a local account.";
      error.classList.add("show"); return;
    }
    persistUser(user);
    toast("Logged in to the local demo.");
  }
  function enterDemo() {
    let user = db.accounts.find(a=>a.demoAccount);
    if (!user) {
      user = {id:"demo-account",username:"demo",name:"Demo User",phone:"+990 700 000 001",about:"Available",password:"demo123",avatar:"DU",avatarColor:2,demoAccount:true,createdAt:new Date().toISOString()};
      db.accounts.push(user); saveDb();
    }
    persistUser(user);
    toast("Demo opened. Everything is stored in this browser.");
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
    const mainVisible = selectedChatId!==null || view!=="chats";
    app.classList.toggle("mobile-open",window.matchMedia("(max-width:700px)").matches && mainVisible);
  }
  function messageHTML(message, chat) {
    const outgoing = message.from==="me";
    const sender = !outgoing&&chat.type==="group" ? "<span class='message-sender'>" + esc(message.sender || "Group member") + "</span>" : "";
    const time = esc(message.time || "");
    const reactions = message.reactions && message.reactions.length ? "<span class='reaction'>" + esc(message.reactions.join(" ")) + "</span>" : "";
    const checks = outgoing ? icon("checks") : "";
    return "<div class='message-row " + (outgoing?"outgoing":"incoming") + "' data-message-id='" + esc(message.id) + "'><div class='message-bubble'>" + sender + "<span class='message-text'>" + esc(message.text) + "</span><span class='message-meta'>" + time + checks + "</span>" + reactions + "</div></div>";
  }
  function renderWelcome() {
    main.innerHTML = "<div class='welcome-pane'><div class='welcome-content'><svg class='welcome-art' viewBox='0 0 320 250' aria-hidden='true'><ellipse cx='161' cy='220' rx='112' ry='9' fill='#e0e6e8'/><path d='M61 142c-1-40 39-70 89-70 45 0 79 25 83 60 4 36-31 66-78 69l-30 24 4-26c-40-8-67-29-68-57Z' fill='#d9fdd3'/><path d='M76 139c0-30 31-54 71-54 40 0 72 24 72 54s-32 54-72 54c-10 0-20-1-29-4l-22 14 4-22c-15-10-24-24-24-42Z' fill='#25d366'/><path d='M128 114c-3-5-5-5-8-5s-7 3-8 7c-2 5 2 15 7 23 8 11 18 19 30 25 7 3 13 5 17 4 5-1 8-6 8-10 0-2-1-3-4-5l-10-5c-2-1-3 0-5 2l-4 5c-1 1-2 2-4 1-6-2-12-7-17-12-4-4-7-9-8-12 0-1 0-2 1-3l4-4c1-2 1-3 1-4l-4-7Z' fill='#fff'/></svg><h2>WhatsApp Web</h2><p>Send and receive messages with ease, right from your computer.</p><div class='welcome-divider'></div><div class='welcome-caption'>" + icon("lock") + "<span>Private messaging UI preview · Local demo only</span></div></div><div class='welcome-footer'>" + icon("lock") + "<span>No real WhatsApp server connection</span></div></div>";
  }
  function renderConversation(chat) {
    if (!chat) { renderWelcome(); return; }
    const subtitle = chat.type==="group" ? ((chat.participants||[]).slice(0,5).join(", ") || "Group") : (chat.online ? "online" : "click here for contact info");
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
    const callActions = "<button class='call-button' data-action='call-menu'>" + icon("video") + "<span>Video call</span>" + icon("chevron") + "</button>";
    main.innerHTML = "<section class='conversation'>" +
      "<header class='conversation-header'><button class='back-button' data-action='back-to-list' aria-label='Back to chats'>" + icon("back") + "</button><button class='conversation-person' data-action='chat-info' aria-label='Open contact information'>" +
      avatarHTML(chat) + "<span class='person-copy'><span class='person-name'>" + esc(chat.name) + "</span><span class='person-subtitle'>" + esc(subtitle) + "</span></span></button><div class='conversation-actions'>" + callActions +
      "<button class='icon-button' data-action='chat-search' title='Search in chat' aria-label='Search in chat'>" + icon("search") + "</button><button class='icon-button' data-action='chat-menu' title='More options' aria-label='More options'>" + icon("more") + "</button></div></header>" +
      pinned + "<div class='message-scroll' id='message-scroll'><div class='encryption-notice'>" + icon("lock") + " Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. This is sample demo text.</div>" + messages + "</div>" +
      "<form class='composer' id='message-form'><button class='composer-tool' type='button' data-action='attachment' aria-label='Attach' title='Attach'>" + icon("paperclip") + "</button><button class='composer-tool' type='button' data-action='emoji' aria-label='Emoji' title='Emoji'>" + icon("smile") + "</button><div class='composer-box'><textarea id='message-input' rows='1' placeholder='Type a message' aria-label='Type a message'></textarea></div><button class='send-button' type='submit' aria-label='Send message' title='Send message'>" + icon("send") + "</button></form></section>";
    requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;});
  }
  function screenHeader(title,extra) { return "<header class='screen-header'><button class='icon-button mobile-only' data-action='back-to-list' aria-label='Back'>" + icon("back") + "</button><h2>" + esc(title) + "</h2>" + (extra||"") + "</header>"; }
  function settingRow(iconName,title,sub,action) { return "<button class='setting-row' data-action='" + esc(action||"not-ready") + "'><span class='row-icon'>" + icon(iconName) + "</span><span class='setting-copy'><span class='setting-title'>" + esc(title) + "</span><span class='setting-subtitle'>" + esc(sub) + "</span></span><span class='end-icon'>" + icon("chevron") + "</span></button>"; }
  function renderProfile() {
    const p=state.profile;
    const photo=p.avatarData?"<img src='"+esc(p.avatarData)+"' alt='Profile photo'>":esc(p.avatar||initials(p.name));
    main.innerHTML="<section class='section-screen'>"+screenHeader("Profile","<button class='icon-button' data-action='edit-profile' aria-label='Edit profile'>"+icon("edit")+"</button>")+"<div class='screen-content'><div class='profile-card'><button class='profile-photo photo-button' data-action='change-profile-photo' aria-label='Change profile photo'>"+photo+"</button><div><h3>"+esc(p.name)+"</h3><p>@"+esc(p.username)+" · "+esc(p.phone)+"</p><button class='secondary-button' data-action='change-profile-photo'>"+icon("image")+" Change photo</button> <button class='primary-button' data-action='edit-profile'>"+icon("edit")+" Edit profile</button></div></div><div class='section-card'><h3 class='section-card-title'>Profile information</h3><div class='setting-row'><span class='row-icon'>"+icon("edit")+"</span><span class='setting-copy'><span class='setting-subtitle'>Name</span><span class='setting-title'>"+esc(p.name)+"</span></span><button class='icon-button' data-action='edit-profile' aria-label='Edit name'>"+icon("edit")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("info")+"</span><span class='setting-copy'><span class='setting-subtitle'>About</span><span class='setting-title'>"+esc(p.about)+"</span></span><button class='icon-button' data-action='edit-profile' aria-label='Edit about'>"+icon("edit")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("phone")+"</span><span class='setting-copy'><span class='setting-subtitle'>Custom in-app number</span><span class='setting-title'>"+esc(p.phone)+"</span></span><button class='icon-button' data-action='copy-phone' aria-label='Copy number'>"+icon("copy")+"</button></div><div class='setting-row'><span class='row-icon'>"+icon("users")+"</span><span class='setting-copy'><span class='setting-subtitle'>Username</span><span class='setting-title'>@"+esc(p.username)+"</span></span><button class='icon-button' data-action='copy-username' aria-label='Copy username'>"+icon("copy")+"</button></div></div><p class='screen-description'>Your number is a custom demo ID. It is not a real phone number and cannot receive SMS or phone calls.</p></div></section>";
  }
  function renderRequests() {
    const received=state.requests.filter(r=>r.status==="received");
    const sent=state.sentRequests||[];
    const receivedHtml=received.length?received.map(r=>"<div class='request-card'>"+avatarHTML(r)+"<div class='request-info'><strong>"+esc(r.name)+"</strong><span>@"+esc(r.username)+" · "+esc(r.phone)+"</span><span>"+esc(r.note||"Would like to connect")+" · "+esc(r.time||"Recently")+"</span></div><div class='request-actions'><button class='accept-request' data-action='accept-request' data-request-id='"+esc(r.id)+"'>Accept</button><button class='decline-request' data-action='decline-request' data-request-id='"+esc(r.id)+"'>Decline</button></div></div>").join(""):"<div class='empty-state'>No new contact requests.<br>When someone asks to connect, they will appear here.</div>";
    const sentHtml=sent.length?sent.map(r=>"<div class='request-card'>"+avatarHTML(r)+"<div class='request-info'><strong>"+esc(r.name)+"</strong><span>@"+esc(r.username)+" · "+esc(r.phone)+"</span><span>Request sent · Pending</span></div><div class='request-actions'><button class='decline-request' data-action='cancel-request' data-request-id='"+esc(r.id)+"'>Cancel</button></div></div>").join(""):"<div class='empty-state'>No outgoing requests.</div>";
    main.innerHTML="<section class='section-screen'>"+screenHeader("Contact requests","<button class='primary-button' data-action='find-friends'>"+icon("user-plus")+" Find people</button>")+"<div class='screen-content'><p class='screen-description'>Manage connection requests. Accepting a request adds the person to your local chat list; declining removes it. No notification is sent to a server.</p><div class='request-section-label'>RECEIVED · "+received.length+"</div><div class='section-card'>"+receivedHtml+"</div><div class='request-section-label'>SENT · "+sent.length+"</div><div class='section-card'>"+sentHtml+"</div><div class='screen-description'>Contact requests are an extra feature of this demo and are not a native WhatsApp feature.</div></div></section>";
  }
  function downloadLocalJson(filename, object) {
    const blob=new Blob([JSON.stringify(object,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function handleSettingOption(title) {
    if(title==="Theme"){state.settings.dark=!state.settings.dark;saveState();applySettings();renderSettings();toast("Theme updated locally.");return;}
    if(title==="Chat wallpaper"){chooseWallpaperDialog();return;}
    if(title==="Request account info"||title==="Chat backup"){
      downloadLocalJson(title==="Chat backup"?"whatsapp-demo-chat-backup.json":"whatsapp-demo-account-info.json",title==="Chat backup"?{profile:state.profile,chats:state.chats,requests:state.requests,settings:state.settings}:{profile:state.profile,account:{username:currentUser.username,phone:currentUser.phone,createdAt:currentUser.createdAt},localDataOnly:true});
      toast("Local JSON export downloaded.");return;
    }
    if(title==="Manage storage"||title==="Manage media"||title==="Network usage"){
      const size=new Blob([JSON.stringify(state)]).size;
      const message=title==="Network usage"?"Network requests: 0. All app state is stored locally.":title==="Manage media"?"Local attachments: "+state.chats.reduce((sum,c)=>sum+(c.attachments||[]).length,0):"Estimated local demo data: "+Math.round(size/1024)+" KB.";
      openDialog(title,"<p class='screen-description'>"+esc(message)+"</p><p class='screen-description'>This report describes this browser-only demo, not WhatsApp's real storage.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Change number"){
      openDialog("Change custom number","<p class='screen-description'>Choose a new unique in-app demo number. It is not a real phone number.</p><div class='dialog-field'><label for='new-custom-number'>Custom number after +990</label><input id='new-custom-number' inputmode='numeric' value='"+esc(state.profile.phone.replace("+990 ",""))+"'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-custom-number'>Save number</button>");return;
    }
    if(title==="Two-step verification"){
      openDialog(title,"<p class='screen-description'>Create a local six-digit demo PIN. It is saved only in this browser and does not protect a real account.</p><div class='dialog-field'><label for='two-step-pin'>Six-digit PIN</label><input id='two-step-pin' inputmode='numeric' maxlength='6' placeholder='••••••'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-two-step'>Save PIN</button>");return;
    }
    if(title==="Delete account"){
      openDialog("Delete local demo account","<p class='screen-description'>This removes this demo account and its browser-stored chat state. No remote WhatsApp account is affected.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='danger-button' data-dialog-action='delete-local-account'>Delete local account</button>");return;
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
    if(["Messages","Groups","Calls","Media auto-download","Spell check","Help center","Contact us","Terms and privacy policy","App info","Two-step verification","Security notifications","Disappearing messages","Wallpaper"].includes(title)){
      openDialog(title,"<p class='screen-description'>This option is represented in the frontend demo. No remote account or device setting will be changed.</p>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;
    }
    if(title==="Enter is send"){state.settings.enterToSend=!state.settings.enterToSend;saveState();renderSettings();toast("Enter-to-send preference updated.");return;}
    toast(title+" is shown as a local frontend setting.");
  }
  function renderSettingsDetail() {
    const tab=settingsTabs.find(t=>t[0]===settingsTab)||settingsTabs[0];
    const options=settingDescriptions[settingsTab]||settingDescriptions.account;
    let content="";
    if(settingsTab==="account")content="<div class='settings-summary'>"+avatarHTML(state.profile)+"<div><h4>"+esc(state.profile.name)+"</h4><p>@"+esc(state.profile.username)+" · "+esc(state.profile.phone)+"</p></div></div>";
    content+="<div class='section-card'>"+options.map(opt=>{
      let side="";
      const settingMap={"Read receipts":"readReceipts","Keep chats archived":"keepArchived","Enter is send":"enterToSend","Media visibility":"mediaVisibility","App lock":"appLock","Reduce motion":"reduceMotion","Keyboard navigation":"keyboardNav","High contrast":"highContrast","Spell check":"spellcheck","Reaction notifications":"reactionNotifications","Security notifications":"securityNotifications"};
      if(opt[3]==="toggle" || settingMap[opt[1]]) {const key=settingMap[opt[1]]||opt[1];const on=!!state.settings[key];side="<button class='toggle "+(on?"on":"")+"' data-setting='"+esc(key)+"' aria-pressed='"+(on?"true":"false")+"' aria-label='Toggle "+esc(opt[1])+"'></button>";}
      else if(opt[3]==="toggle-theme")side="<button class='toggle "+(state.settings.dark?"on":"")+"' data-setting='dark' aria-pressed='"+(state.settings.dark?"true":"false")+"' aria-label='Toggle dark mode'></button>";
      else if(opt[3]==="wallpaper")side="<button class='secondary-button' data-action='wallpaper'>Change</button>";
      else if(opt[3]==="button")side="<span class='end-icon'>"+icon("chevron")+"</span>";
      else side="<span class='setting-side-label'>"+esc(opt[3]||"")+"</span>";
      return "<div class='setting-option' data-setting-option='"+esc(opt[1])+"' role='button' tabindex='0'><span class='row-icon'>"+icon(opt[0])+"</span><div class='setting-option-copy'><strong>"+esc(opt[1])+"</strong><span>"+esc(opt[2])+"</span></div>"+side+"</div>";
    }).join("")+"</div><p class='screen-description'>Settings here change the local interface only. No WhatsApp account, server, or device settings are affected.</p>";
    return "<div class='settings-detail-header'><h3>"+esc(tab[2])+"</h3></div><div class='settings-detail-content'>"+content+"</div>";
  }
  function renderSettings() {
    const matched=settingsTabs.filter(t=>(t[2]+" "+t[0]).toLowerCase().includes(settingsQuery.toLowerCase()));
    main.innerHTML="<section class='settings-layout'><aside class='settings-list'><div class='settings-list-header'><h2>Settings</h2><label class='settings-search'>"+icon("search")+"<input id='settings-search' placeholder='Search settings' value='"+esc(settingsQuery)+"' aria-label='Search settings'></label></div>"+matched.map(t=>"<button class='settings-nav-item"+(t[0]===settingsTab?" active":"")+"' data-setting-tab='"+esc(t[0])+"'>"+icon(t[1])+"<span>"+esc(t[2])+"</span></button>").join("")+"<button class='settings-nav-item' data-action='accounts-center'>"+icon("users")+"<span>Accounts Center</span></button></aside><div class='settings-detail'>"+renderSettingsDetail()+"</div></section>";
  }
  function renderInfo(chat) {
    if(!chat){renderWelcome();return;}
    const actions="<div class='hero-actions'><button class='hero-action' data-action='voice-call'>"+icon("phone")+"<span>Audio</span></button><button class='hero-action' data-action='video-call'>"+icon("video")+"<span>Video</span></button><button class='hero-action' data-action='search-in-chat'>"+icon("search")+"<span>Search</span></button></div>";
    let detail="<div class='contact-hero'>"+avatarHTML(chat)+"<h3>"+esc(chat.name)+"</h3><p>"+(chat.type==="group"?(chat.participants||[]).length+" participants":esc(chat.phone||"Custom in-app number"))+"</p>"+actions+"</div>";
    if(chat.type==="group"){
      detail+="<div class='description-card'><h4>Group description</h4><p>"+esc(chat.about||"No description added")+"</p></div><div class='section-card'><h3 class='section-card-title'>Participants · "+(chat.participants||[]).length+"</h3><button class='setting-row' data-action='add-participants'>"+icon("user-plus")+"<span class='setting-copy'><span class='setting-title'>Add participants</span></span>"+icon("chevron")+"</button>"+(chat.participants||[]).map((name,i)=>"<div class='member-row'>"+avatarHTML({name:name,avatar:(i%12)+1})+"<span class='member-name'>"+esc(name)+"</span>"+(i===0?"<span class='member-role'>Admin</span>":"")+"</div>").join("")+"</div><div class='section-card'>"+settingRow("edit","Edit group subject",chat.name,"edit-group")+"<button class='setting-row' data-action='edit-group-description'>"+icon("info")+"<span class='setting-copy'><span class='setting-title'>Edit group description</span><span class='setting-subtitle'>"+esc(chat.about||"Add a description")+"</span></span>"+icon("chevron")+"</button></div>";
    }else{
      detail+="<div class='section-card'><h3 class='section-card-title'>About and custom number</h3><div class='setting-row'><span class='setting-copy'><span class='setting-subtitle'>About</span><span class='setting-title'>"+esc(chat.about||"Available")+"</span></span><button class='icon-button' data-action='edit-contact-about'>"+icon("edit")+"</button></div><div class='setting-row'><span class='setting-copy'><span class='setting-subtitle'>Username</span><span class='setting-title'>@"+esc(chat.username||"user")+"</span></span><button class='icon-button' data-action='copy-chat-username'>"+icon("copy")+"</button></div><div class='setting-row'><span class='setting-copy'><span class='setting-subtitle'>Custom in-app number</span><span class='setting-title'>"+esc(chat.phone||"Not set")+"</span></span><button class='icon-button' data-action='copy-chat-phone'>"+icon("copy")+"</button></div></div><div class='section-card'><h3 class='section-card-title'>Shared media, links and documents</h3><button class='setting-row' data-action='shared-media'>"+icon("image")+"<span class='setting-copy'><span class='setting-title'>Media, links and documents</span><span class='setting-subtitle'>"+(chat.attachments||[]).length+" local attachments</span></span>"+icon("chevron")+"</button></div>";
    }
    detail+="<div class='section-card'>"+settingRow("star",chat.favorite?"Remove from favorites":"Add to favorites","Keep this chat in your favorite list","toggle-favorite")+"<button class='setting-row' data-action='toggle-mute'>"+icon("mute")+"<span class='setting-copy'><span class='setting-title'>"+(chat.muted?"Unmute notifications":"Mute notifications")+"</span></span>"+icon("chevron")+"</button><button class='setting-row' data-action='disappearing'>"+icon("clock")+"<span class='setting-copy'><span class='setting-title'>Disappearing messages</span><span class='setting-subtitle'>Off</span></span>"+icon("chevron")+"</button><button class='setting-row' data-action='block-chat'>"+icon("slash")+"<span class='setting-copy'><span class='setting-title'>Block "+esc(chat.name)+"</span></span>"+icon("chevron")+"</button></div>";
    main.innerHTML="<section class='details-layout'><header class='details-header'><button class='icon-button' data-action='back-to-chat' aria-label='Back'>"+icon("back")+"</button><h2>"+(chat.type==="group"?"Group info":"Contact info")+"</h2><button class='icon-button' data-action='chat-menu' aria-label='More options'>"+icon("more")+"</button></header><div class='details-content'>"+detail+"</div></section>";
  }
  function renderUpdates() {
    const names=[{name:"My status",label:state.statusUpdates.length?state.statusUpdates[0].text:"Tap to add status update",initials:state.profile.avatar||"ME",avatar:2,action:"new-status"},{name:"Ayesha Khan",label:"Today, 12:24 PM",initials:"AK",avatar:1,action:"status-preview"},{name:"Hassan Raza",label:"Today, 11:58 AM",initials:"HR",avatar:3,action:"status-preview"},{name:"Sara Ahmed",label:"Today, 10:42 AM",initials:"SA",avatar:9,action:"status-preview"},{name:"Noor Fatima",label:"Yesterday, 8:30 PM",initials:"NF",avatar:2,action:"status-preview"}];
    main.innerHTML="<section class='section-screen'>"+screenHeader("Updates","<button class='icon-button' data-action='camera' aria-label='Camera'>"+icon("camera")+"</button><button class='icon-button' data-action='new-status' aria-label='New status'>"+icon("new")+"</button>")+"<div class='screen-content'><p class='screen-description'>Share everyday moments with status updates that disappear after 24 hours.</p><div class='section-card'><h3 class='section-card-title'>Status</h3>"+names.map((n,i)=>"<div class='status-row' data-action='"+n.action+"' data-status-name='"+esc(n.name)+"'><div class='status-ring'><div class='status-inner'>"+esc(n.initials)+"</div></div><div class='status-copy'><strong>"+esc(n.name)+"</strong><span>"+esc(n.label)+"</span></div></div>").join("")+"</div><div class='section-card'><h3 class='section-card-title'>Channels</h3>"+settingRow("channels","Discover channels","Follow updates from people and organizations","nav-channels")+"</div></div></section>";
  }
  function renderCalls() {
    const rows=state.calls.length?state.calls:[{name:"Ayesha Khan",time:"Today, 11:45 AM",type:"incoming",avatar:1},{name:"Hassan Raza",time:"Yesterday, 8:10 PM",type:"outgoing",avatar:3},{name:"Family Group",time:"Yesterday, 6:30 PM",type:"missed",avatar:2},{name:"Mom",time:"Monday, 2:42 PM",type:"incoming",avatar:5}];
    main.innerHTML="<section class='section-screen'>"+screenHeader("Calls","<button class='icon-button' data-action='new-call' aria-label='New call'>"+icon("phone")+"</button>")+"<div class='screen-content'><p class='screen-description'>Your recent calls appear here. Calls in this prototype are simulated only.</p><div class='section-card'>"+rows.map((r,i)=>"<button class='setting-row' data-action='call-entry' data-call-name='"+esc(r.name)+"'>"+avatarHTML({name:r.name,avatar:r.avatar||i+1})+"<span class='setting-copy'><span class='setting-title'>"+esc(r.name)+"</span><span class='setting-subtitle'>"+icon(r.type==="outgoing"?"forward":"reply")+" "+esc(r.time)+"</span></span><span class='end-icon'>"+icon("phone")+"</span></button>").join("")+"</div></div></section>";
  }
  function renderCommunities() {
    main.innerHTML="<section class='section-screen'>"+screenHeader("Communities","<button class='icon-button' data-action='new-community' aria-label='New community'>"+icon("new")+"</button>")+"<div class='screen-content'><p class='screen-description'>Bring people together in topic-based communities. Organize group chats and announcements in one place.</p><div class='section-card'>"+state.communities.map(c=>"<button class='community-row' data-community-id='"+esc(c.id)+"'><span class='avatar av7'>"+esc(initials(c.name))+"</span><span class='community-copy'><strong>"+esc(c.name)+"</strong><span>"+esc(c.groups.join(" · "))+"</span></span>"+icon("chevron")+"</button>").join("")+"</div><button class='primary-button' data-action='new-community'>"+icon("new")+" New community</button></div></section>";
  }
  function renderChannels() {
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
    document.querySelector('meta[name="theme-color"]').setAttribute("content",state.settings.dark?"#111b21":"#00a884");
    const conversation=main.querySelector(".conversation");
    if(conversation) conversation.style.background=state.settings.wallpaper==="plain"?"#ffffff":state.settings.wallpaper==="green"?"#dbeee5":"#efeae2";
  }
  function updateMobile() { app.classList.toggle("mobile-open",window.matchMedia("(max-width:700px)").matches && (selectedChatId!==null || view!=="chats")); }
  function selectChat(id) {
    const chat=findChat(id);if(!chat)return;
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
      {icon:"new",label:"New group",action:"new-group"},{icon:"communities",label:"New community",action:"new-community"},
      {icon:"star",label:"Starred messages",action:"go-starred"},{icon:"user-plus",label:"Contact requests",action:"go-requests"},
      {icon:"users",label:"Select chats",action:"select-chats"},{sep:true},{icon:"settings",label:"Settings",action:"settings"},
      {icon:"help",label:"Help",action:"help"},{sep:true},{icon:"log-out",label:"Log out",action:"logout"}
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
    const body="<p class='screen-description'>Search by username or custom in-app number. Numbers beginning with +990 are demo IDs and do not work as real phone numbers.</p><div class='dialog-field'><label for='friend-search'>Username or custom number</label><input id='friend-search' placeholder='@username or +990 700 100 101' autocomplete='off'></div><div id='friend-lookup-result'></div>";
    openDialog("Find people",body,"<button class='secondary-button' data-action='close-dialog'>Close</button>");
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
    const p=state.profile;const body="<div class='dialog-field'><label for='edit-name'>Display name</label><input id='edit-name' maxlength='48' value='"+esc(p.name)+"'></div><div class='dialog-field'><label for='edit-about'>About</label><input id='edit-about' maxlength='140' value='"+esc(p.about)+"'></div><div class='dialog-field'><label>Username</label><input value='@"+esc(p.username)+"' readonly><span class='field-help'>Username changes will be available when the backend is added.</span></div><div class='dialog-field'><label>Custom in-app number</label><input value='"+esc(p.phone)+"' readonly><span class='field-help'>Numbers are local demo identifiers only.</span></div>";
    openDialog("Edit profile",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-profile'>Save</button>");
  }
  function editGroupDialog(chat) {
    const body="<div class='dialog-field'><label for='edit-group-name'>Group subject</label><input id='edit-group-name' maxlength='60' value='"+esc(chat.name)+"'></div><div class='dialog-field'><label for='edit-group-about'>Group description</label><textarea id='edit-group-about' rows='3'>"+esc(chat.about||"")+"</textarea></div>";
    openDialog("Edit group",body,"<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-group' data-chat-id='"+esc(chat.id)+"'>Save</button>");
  }
  function chooseWallpaperDialog() {
    openDialog("Chat wallpaper","<p class='screen-description'>Choose the wallpaper for your demo conversations.</p><div class='wallpaper-options'><button class='wallpaper-swatch' data-wallpaper='default'><span class='wallpaper-preview default-wallpaper'></span><span>Default doodles</span></button><button class='wallpaper-swatch' data-wallpaper='plain'><span class='wallpaper-preview plain-wallpaper'></span><span>Plain</span></button><button class='wallpaper-swatch' data-wallpaper='green'><span class='wallpaper-preview green-wallpaper'></span><span>Soft green</span></button></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");
  }
  function selectChatsDialog() {
    const body="<p class='screen-description'>Select chats for a demo bulk action.</p>"+state.chats.filter(c=>!c.archived).map(c=>"<div class='pick-row'>"+avatarHTML(c)+"<label for='pick-"+esc(c.id)+"'>"+esc(c.name)+"</label><input type='checkbox' id='pick-"+esc(c.id)+"' value='"+esc(c.id)+"'></div>").join("");
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
    if(action==="clear-chat"){if(!confirm("Clear messages from this local demo chat?"))return;chat.messages=[];chat.preview="";save();renderMain();toast("Local messages cleared.");return;}
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
    if(action==="reply-message"){const input=$("#message-input");if(input){input.value="Replying: ";input.focus();}return;}
    if(action==="forward-message"){toast("Forward is a UI-only demo action.");return;}
    if(action==="copy-message"){const msg=state.lastContextMessage;if(msg&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(msg.text).then(()=>toast("Message copied")).catch(()=>toast(msg.text));}else if(msg)toast(msg.text);return;}
    if(action==="delete-message"){const ref=state.lastContextMessage;if(ref&&chat){chat.messages=chat.messages.filter(m=>m.id!==ref.id);save();renderMain();toast("Message removed locally.");}return;}
    if(action==="voice-call"||action==="video-call"){const call={id:uid("call"),name:chat?chat.name:"New call",time:"Just now",type:"outgoing",avatar:chat?chat.avatar:1};state.calls.unshift(call);saveState();toast("Call UI preview only — no actual call is placed.");return;}
    if(action==="shared-media"){const attachments=(chat.attachments||[]);openDialog("Media, links and documents",attachments.length?attachments.map(a=>"<div class='setting-row'>"+icon(a.type==="image"?"image":"file")+"<span class='setting-copy'><span class='setting-title'>"+esc(a.name)+"</span><span class='setting-subtitle'>"+esc(a.type||"file")+"</span></span></div>").join(""):"<div class='empty-state'>No local attachments in this chat.</div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;}
    if(action==="edit-group"){editGroupDialog(chat);return;}
    if(action==="edit-group-description"){editGroupDialog(chat);return;}
    if(action==="edit-contact-about"){openDialog("Edit About","<div class='dialog-field'><label for='contact-about'>About</label><input id='contact-about' value='"+esc(chat.about||"")+"' maxlength='140'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='save-contact-about' data-chat-id='"+esc(chat.id)+"'>Save</button>");return;}
    if(action==="copy-chat-phone"){copyText(chat.phone||"");return;}
    if(action==="copy-chat-username"){copyText("@"+(chat.username||""));return;}
  }
  function copyText(text) { if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast("Copied to clipboard")).catch(()=>toast(text));else toast(text); }
  function sendMessage(text) {
    const chat=currentChat();if(!chat||!text.trim())return;
    const msg={id:uid("msg"),from:"me",text:text.trim(),time:nowTime(),date:dayLabel(),status:"sent",reactions:[]};
    chat.messages.push(msg);chat.preview=text.trim();chat.time="Now";chat.lastOutgoing=true;chat.lastMessageType="text";chat.unread=0;
    saveState();renderSidebar();renderMain();
    requestAnimationFrame(()=>{const sc=$("#message-scroll");if(sc)sc.scrollTop=sc.scrollHeight;});
  }
  function handleAction(action,el) {
    const chat=findChat(el.dataset.chatId)||currentChat();
    if(action==="new-chat"){createNewChatDialog();return;}
    if(action==="new-group"){createGroupDialog();return;}
    if(action==="new-community"){createCommunityDialog();return;}
    if(action==="profile"){setView("profile");return;}
    if(action==="settings"){settingsTab="account";settingsQuery="";setView("settings");return;}
    if(action==="sidebar-menu"||action==="row-menu"||action==="chat-menu"||action==="call-menu"||action==="attachment"||action==="emoji"||action==="more-lists"||action==="search-filters"||action==="pinned-menu"||action==="message-menu"){actionMenu(el,action);return;}
    if(action==="close-dialog"){closeDialog();return;}
    if(action==="back-to-list"){selectedChatId=null;view="chats";renderSidebar();renderMain();updateMobile();return;}
    if(action==="back-to-chat"){view="chats";renderMain();updateMobile();return;}
    if(action==="edit-profile"){editProfileDialog();return;}
    if(action==="find-friends"){createNewChatDialog();return;}
    if(action==="demo-login"){enterDemo();return;}
    if(action==="copy-phone"){copyText(state.profile.phone);return;}
    if(action==="copy-username"){copyText("@"+state.profile.username);return;}
    if(action==="change-profile-photo"){const input=$("#profile-photo-input");if(input)input.click();return;}
    if(action==="camera"){toast("Camera preview only. No camera stream is opened.");return;}
    if(action==="new-status"){openDialog("New status","<div class='dialog-field'><label for='status-text'>Type a status update</label><textarea id='status-text' rows='3' maxlength='700' placeholder='What’s on your mind?'></textarea></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='publish-status'>Share status</button>");return;}
    if(action==="status-preview"){toast("Status viewer preview.");return;}
    if(action==="new-call"){openPopup(el,[{icon:"phone",label:"New voice call",action:"new-voice-call"},{icon:"video",label:"New video call",action:"new-video-call"}],null);return;}
    if(action==="new-voice-call"||action==="new-video-call"||action==="call-entry"){toast("Calls are not connected in this frontend demo.");return;}
    if(action==="channel-search"){openDialog("Discover channels","<div class='dialog-field'><label for='channel-search-input'>Search channels</label><input id='channel-search-input' placeholder='Search channels'></div><div id='channel-search-results'></div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");renderChannelSearchResults();return;}
    if(action==="toggle-channel"){const ch=state.channels.find(c=>c.id===el.dataset.channelId);if(ch){ch.following=!ch.following;saveState();renderMain();toast(ch.following?"Channel followed in preview":"Channel unfollowed");}return;}
    if(action==="go-starred"){setView("starred");return;}
    if(action==="go-requests"){setView("requests");return;}
    if(action==="go-archived"){setView("archived");return;}
    if(action==="select-chats"){selectChatsDialog();return;}
    if(action==="help"){settingsTab="help";setView("settings");return;}
    if(action==="logout"){openDialog("Log out","<p class='screen-description'>Log out of this local demo? Your local account and demo data will remain saved in this browser.</p>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='logout'>Log out</button>");return;}
    if(action==="accounts-center"){toast("Accounts Center is a visual demo only.");return;}
    if(action==="filter-all"){filter="all";searchQuery="";$("#chat-search").value="";renderSidebar();closePopup();return;}
    if(action==="search-media"){toast("Media search UI preview.");return;}
    if(action==="new-list"){openDialog("Create chat list","<div class='dialog-field'><label for='list-name'>List name</label><input id='list-name' maxlength='30' placeholder='Create a list'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='create-list'>Create</button>");return;}
    if(action==="manage-lists"){openDialog("Manage lists",state.customLists.length?state.customLists.map(l=>"<div class='setting-row'>"+icon("chat")+"<span class='setting-copy'><span class='setting-title'>"+esc(l.name)+"</span></span><button class='secondary-button' data-action='remove-list' data-list-id='"+esc(l.id)+"'>Remove</button></div>").join(""):"<div class='empty-state'>No custom lists yet.</div>","<button class='secondary-button' data-action='close-dialog'>Close</button>");return;}
    if(action==="toggle-favorite"||action==="toggle-unread"||action==="toggle-pin"||action==="toggle-mute"||action==="toggle-archive"||action==="lock-chat"||action==="toggle-lock"||action==="delete-chat"||action==="clear-chat"||action==="chat-info"||action==="chat-search"||action==="search-in-chat"||action==="disappearing"||action==="block-chat"||action==="report-chat"||action==="select-messages"||action==="star-message"||action==="pinned-preview"||action==="unpin-message"||action==="reply-message"||action==="forward-message"||action==="copy-message"||action==="delete-message"||action==="voice-call"||action==="video-call"||action==="shared-media"||action==="edit-group"||action==="edit-group-description"||action==="edit-contact-about"||action==="copy-chat-phone"||action==="copy-chat-username"){useAction(action,chat);return;}
    if(action==="attachment-preview"||action==="share-contact"){toast("This item is a local frontend preview.");return;}
    if(action==="pick-file"){const input=$("#attachment-input");if(input){input.accept="*/*";input.click();}return;}
    if(action==="pick-image"){const input=$("#attachment-input");if(input){input.accept="image/*,video/*";input.click();}return;}
    if(action==="create-poll"){openDialog("Create poll","<div class='dialog-field'><label for='poll-question'>Question</label><input id='poll-question' placeholder='Ask a question'></div><div class='dialog-field'><label for='poll-options'>Options (one per line)</label><textarea id='poll-options' rows='4' placeholder='Option 1&#10;Option 2'></textarea></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='send-poll'>Add poll</button>");return;}
    if(action==="create-event"){openDialog("Create event","<div class='dialog-field'><label for='event-name'>Event name</label><input id='event-name' placeholder='Event name'></div><div class='dialog-field'><label for='event-date'>Date</label><input id='event-date' type='date'></div><div class='dialog-field'><label for='event-time'>Time</label><input id='event-time' type='time'></div>","<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='send-event'>Add event</button>");return;}
    if(action==="edit-profile"){editProfileDialog();return;}
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
    const mapped=["open-chat","toggle-unread","toggle-favorite","toggle-pin","toggle-mute","toggle-archive","lock-chat","toggle-lock","delete-chat","clear-chat","chat-info","chat-search","search-in-chat","disappearing","block-chat","report-chat","select-messages","star-message","pinned-preview","unpin-message","reply-message","forward-message","copy-message","delete-message","voice-call","video-call","shared-media","edit-group","edit-group-description","edit-contact-about","copy-chat-phone","copy-chat-username"];
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
      saveState();applySettings();renderSettings();toast("Setting updated locally.");return;
    }
    if(t.dataset.wallpaper){
      state.settings.wallpaper=t.dataset.wallpaper;saveState();closeDialog();applySettings();renderMain();toast("Wallpaper updated.");return;
    }
    if(t.dataset.dialogAction){
      const action=t.dataset.dialogAction;
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
        const selected=$("#dialog-backdrop input[type=checkbox]:checked").map(input=>input.value);
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
      if(action==="save-setting-choice"){
        state.settings.privacy=state.settings.privacy||{};state.settings.privacy[t.dataset.settingName]=t.dataset.settingValue;
        saveState();closeDialog();renderSettings();toast("Privacy preference saved locally.");return;
      }
      if(action==="save-language"){
        state.settings.language=t.dataset.language;saveState();closeDialog();renderSettings();toast("Language preference saved. Full translation is not wired into this preview.");return;
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
      if(!contact){box.innerHTML="<div class='empty-state'>No local demo account matches this username or number. You can still try another value.</div>";return;}
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
  document.addEventListener("change",event=>{
    const t=event.target;
    if(t.id==="profile-photo-input" && t.files && t.files[0]){
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
      closePopup();if($("#dialog-backdrop"))closeDialog();
      else if(view==="info"){view="chats";renderMain();updateMobile();}
      else if(selectedChatId!==null&&window.matchMedia("(max-width:700px)").matches){selectedChatId=null;renderSidebar();renderMain();updateMobile();}
    }
    if((event.target.classList.contains("chat-row")||event.target.classList.contains("archived-row"))&&(event.key==="Enter"||event.key===" ")){event.preventDefault();const id=event.target.dataset.chatId;if(id)selectChat(id);else if(event.target.classList.contains("archived-row"))setView("archived");}
    if(event.target.id==="message-input"&&event.key==="Enter"&&!event.shiftKey&&state.settings.enterToSend){event.preventDefault();$("#message-form").requestSubmit();}
  });
  document.addEventListener("click",event=>{
    const menu=$("#popup-menu");
    if(menu&&!menu.contains(event.target)&&!event.target.closest("[data-action]"))closePopup();
  });
  main.addEventListener("contextmenu",event=>{
    const row=event.target.closest(".message-row");
    if(!row)return;
    const chat=currentChat();
    if(!chat)return;
    const message=chat.messages.find(m=>String(m.id)===String(row.dataset.messageId));
    if(!message)return;
    event.preventDefault();
    state.lastContextMessage={id:message.id,text:message.text,chatId:chat.id,chatName:chat.name,avatar:chat.avatar,time:message.time};
    const anchor=row;
    openPopup(anchor,menuItems("message-menu",chat),chat.id);
  });
  window.addEventListener("resize",updateMobile);

  const originalHandleAction=handleAction;
  handleAction=function(action,el){
    if(action==="send-contact-request"){
      const contact=lookupDirectory(el.dataset.contactUsername);
      if(contact)requestSend(contact);
      return;
    }
    if(action==="open-found-chat"){selectChat(el.dataset.chatId);closeDialog();return;}
    if(action==="accept-found-request"){acceptRequest(el.dataset.requestId);closeDialog();return;}
    if(action==="edit-profile"){editProfileDialog();return;}
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

  function init() {
    const addInput=document.createElement("input");
    addInput.type="file";addInput.id="attachment-input";addInput.hidden=true;addInput.accept="*/*";document.body.appendChild(addInput);
    const photoInput=document.createElement("input");
    photoInput.type="file";photoInput.id="profile-photo-input";photoInput.hidden=true;photoInput.accept="image/*";document.body.appendChild(photoInput);
    renderAuth("signup");
    let session=null;
    try {session=localStorage.getItem(SESSION_KEY);} catch (_) {}
    if(session) {
      const user=db.accounts.find(a=>normalizeUsername(a.username)===normalizeUsername(session));
      if(user)persistUser(user);
      else {localStorage.removeItem(SESSION_KEY);renderAuth("signup");}
    }
    if(!currentUser)auth.classList.remove("hidden");
    const closeBackdrop=document.createElement("style");
    closeBackdrop.textContent=".wallpaper-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.wallpaper-swatch{display:flex;flex-direction:column;gap:8px;padding:8px;border:1px solid #e2e6e8;border-radius:9px;background:#fff;font-size:12px}.wallpaper-preview{height:90px;border-radius:6px;display:block;border:1px solid #e8ecee}.default-wallpaper{background:#efeae2 repeating-linear-gradient(45deg,transparent,transparent 12px,#e4ddd2 13px,transparent 14px)}.plain-wallpaper{background:#fff}.green-wallpaper{background:#dbeee5}.setting-side-label{font-size:12px;color:#667781}.settings-summary h4{margin:0 0 4px;font-size:16px;font-weight:500}.settings-summary p{margin:0;color:#667781;font-size:12px}.settings-option{display:flex;align-items:center;gap:14px;min-height:72px;padding:12px 16px;border-bottom:1px solid #f0f2f2;background:#fff}.settings-option:first-child{border-top:1px solid #f0f2f2}.settings-option-copy{min-width:0;flex:1}.settings-option-copy strong{display:block;font-size:14px;font-weight:500;margin-bottom:5px}.settings-option-copy span{display:block;color:#667781;font-size:12px;line-height:1.45}.toggle{width:38px;height:22px;flex:0 0 auto;border:0;border-radius:12px;background:#d6dcdf;padding:3px;display:flex;align-items:center}.toggle:after{content:'';height:16px;width:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0002}.toggle.on{justify-content:flex-end;background:#00a884}.mobile-open .chat-sidebar{display:none}.mobile-open .main-pane{display:flex}@media(max-width:700px){.wallpaper-preview{height:65px}.wide{max-width:100%}}";
    document.head.appendChild(closeBackdrop);
  }
  init();
})();