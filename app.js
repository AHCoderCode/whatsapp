(() => {
  "use strict";
  const root = document.getElementById("wa-rebuild");
  if (!root) return;
  const main = root.querySelector("#wa-main");
  const chatList = root.querySelector("#wa-chat-list");
  const floatLayer = root.querySelector("#wa-float");
  const dialogSlot = root.querySelector("#wa-dialog-slot");
  const toastSlot = root.querySelector("#wa-toast-slot");
  const searchInput = root.querySelector("#wa-search");

  const paths = {
    chat:"<path d='M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z'/>",
    status:"<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3.5 2'/>",
    communities:"<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/>",
    channels:"<rect x='3' y='4' width='18' height='16' rx='2'/><path d='M7 8h10M7 12h6M7 16h8'/>",
    phone:"<path d='M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.85a16 16 0 0 0 6 6l1.25-1.25a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.75 2.05z'/>",
    star:"<path d='m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'/>",
    archive:"<rect x='3' y='4' width='18' height='5' rx='1'/><path d='M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4'/>",
    lock:"<rect x='4' y='10' width='16' height='11' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/>",
    settings:"<circle cx='12' cy='12' r='3'/><path d='m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2L6.5 12l1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.9z'/>",
    new:"<path d='M12 5v14M5 12h14'/>",
    more:"<circle cx='5' cy='12' r='1'/><circle cx='12' cy='12' r='1'/><circle cx='19' cy='12' r='1'/>",
    search:"<circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/>",
    sliders:"<path d='M4 7h9M17 7h3M4 17h3M11 17h9'/><circle cx='15' cy='7' r='2'/><circle cx='9' cy='17' r='2'/>",
    camera:"<path d='M14 5 12 3H8L6 5H3v14h18V5z'/><circle cx='12' cy='12' r='4'/>",
    video:"<rect x='3' y='6' width='13' height='12' rx='2'/><path d='m16 10 5-3v10l-5-3z'/>",
    checks:"<path d='m2 12 4 4L16 6M9 12l4 4L23 6'/>",
    pin:"<path d='m16 3 5 5-4 1-4 4-1 6-3-3-3-3 6-1 4-4zM3 21l7-7'/>",
    mute:"<path d='M11 5 6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6'/>",
    clip:"<path d='m21 11.5-8.8 8.8a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2L9.7 17.6a1.9 1.9 0 0 1-2.7-2.7l8.5-8.5'/>",
    smile:"<circle cx='12' cy='12' r='10'/><path d='M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01'/>",
    mic:"<rect x='9' y='2' width='6' height='12' rx='3'/><path d='M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8'/>",
    send:"<path d='m22 2-7 20-4-9-9-4Z'/><path d='M22 2 11 13'/>",
    chevron:"<path d='m6 9 6 6 6-6'/>",
    back:"<path d='m15 18-6-6 6-6'/>",
    info:"<circle cx='12' cy='12' r='10'/><path d='M12 16v-4M12 8h.01'/>",
    users:"<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/>",
    image:"<rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='m21 15-5-5L5 21'/>",
    document:"<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><path d='M14 2v6h6M8 13h8M8 17h8'/>",
    music:"<path d='M9 18V5l12-2v13'/><circle cx='6' cy='18' r='3'/><circle cx='18' cy='16' r='3'/>",
    contact:"<rect x='3' y='4' width='18' height='16' rx='2'/><circle cx='9' cy='10' r='2.5'/><path d='M5 17c.8-2 2.2-3 4-3s3.2 1 4 3M15 9h3M15 13h3'/>",
    poll:"<path d='M4 19V5M4 19h17'/><path d='M8 15v-4M13 15V7M18 15v-6'/>",
    calendar:"<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M16 3v4M8 3v4M3 10h18'/>",
    help:"<circle cx='12' cy='12' r='10'/><path d='M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'/>",
    shield:"<path d='M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z'/><path d='m9 12 2 2 4-4'/>",
    bell:"<path d='M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'/>",
    database:"<ellipse cx='12' cy='5' rx='9' ry='3'/><path d='M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3'/>",
    edit:"<path d='M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'/>",
    plusUser:"<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M19 8v6M22 11h-6'/>",
    logout:"<path d='M10 17l5-5-5-5M15 12H3'/><path d='M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7'/>",
    forward:"<path d='m14 3 7 9-7 9v-6C8 15 5 18 3 21c0-8 3-12 11-12z'/>",
    reply:"<path d='m9 17-6-5 6-5v4c7 0 10 3 12 8-3-3-6-4-12-4z'/>",
    x:"<path d='m18 6-12 12M6 6l12 12'/>",
    check:"<path d='m5 12 4 4L19 6'/>",
    circle:"<circle cx='12' cy='12' r='9'/>",
    palette:"<path d='M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.2-2.5H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9z'/><path d='M7.5 10h.01M10 7h.01M14 7h.01M16.5 10h.01'/>",
    key:"<circle cx='8' cy='15' r='5'/><path d='m11.5 11.5 9-9 2 2-3 3 2 2-3 3-2-2-3 3'/>",
    globe:"<circle cx='12' cy='12' r='10'/><path d='M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/>",
    copy:"<rect x='8' y='8' width='12' height='12' rx='2'/><path d='M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3'/>",
    trash:"<path d='M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6'/>",
    clock:"<circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/>",
    download:"<path d='M12 3v12M7 10l5 5 5-5M4 20h16'/>",
    filter:"<path d='M4 5h16l-6 7v5l-4 2v-7z'/>",
    sparkles:"<path d='m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l1 2.5 2.5 1-2.5 1L19 22l-1-2.5-2.5-1 2.5-1z'/>"
  };
  function ic(name, cls) { return "<svg" + (cls ? " class='" + cls + "'" : "") + " viewBox='0 0 24 24' aria-hidden='true' stroke-linecap='round' stroke-linejoin='round'>" + (paths[name] || paths.more) + "</svg>"; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch])); }
  function msg(from, text, time, date, sender, reaction) { return { from, text, time, date: date || "TODAY", sender: sender || "", reaction: reaction || "" }; }
  const chats = [
    {id:1,name:"Ayesha Khan",initials:"AK",avatar:1,type:"person",time:"12:48 PM",preview:"That sounds great! 😊",outgoing:true,unread:0,favorite:true,pinned:true,online:true,phone:"+92 300 1234567",about:"Available",messages:[msg("them","Hey! How are you?","12:39 PM"),msg("me","I'm good, thank you! How are you?","12:41 PM"),msg("them","Doing well 😊 Are we still meeting later?","12:44 PM"),msg("me","Yes, absolutely. I'll be there around 5.","12:46 PM"),msg("them","That sounds great! 😊","12:48 PM")]},
    {id:2,name:"Family Group",initials:"FG",avatar:2,type:"group",time:"12:41 PM",preview:"Ammi: Everyone be home by 6",outgoing:false,unread:3,favorite:true,participants:["Ammi","Abu","Ayesha Khan","Hassan Raza","You"],about:"Family first ❤️",messages:[msg("them","Reminder: family dinner tonight!","12:34 PM","TODAY","Ammi"),msg("them","What time should everyone arrive?","12:36 PM","TODAY","Ayesha Khan"),msg("them","Everyone be home by 6","12:41 PM","TODAY","Ammi")]},
    {id:3,name:"Hassan Raza",initials:"HR",avatar:3,type:"person",time:"12:25 PM",preview:"😂😂😂",outgoing:false,unread:1,favorite:true,online:false,phone:"+92 321 5550123",about:"Hey there! I am using WhatsApp.",messages:[msg("them","Did you see that video?","12:18 PM"),msg("me","Not yet, send it 😄","12:22 PM"),msg("them","😂😂😂","12:25 PM")]},
    {id:4,name:"School Friends",initials:"SF",avatar:4,type:"group",time:"11:52 AM",preview:"Zain: Send the notes when you can",outgoing:false,unread:8,favorite:false,participants:["Zain","Mina","Sara Ahmed","Hassan Raza","You"],about:"Class group",messages:[msg("them","Is anyone free to study together this weekend?","11:41 AM","TODAY","Mina"),msg("them","I'm free Saturday afternoon","11:48 AM","TODAY","Sara Ahmed"),msg("them","Send the notes when you can","11:52 AM","TODAY","Zain")]},
    {id:5,name:"Mom",initials:"M",avatar:5,type:"person",time:"11:30 AM",preview:"Okay, I'll be there soon.",outgoing:true,unread:0,favorite:true,online:false,phone:"+92 300 7654321",about:"Love you always",messages:[msg("me","I'm on my way home","11:27 AM"),msg("them","Okay, I'll be there soon.","11:30 AM")]},
    {id:6,name:"Dad",initials:"D",avatar:6,type:"person",time:"10:58 AM",preview:"Call me when you're free",outgoing:false,unread:1,favorite:true,online:false,phone:"+92 333 2020202",about:"Busy",messages:[msg("them","Call me when you're free","10:58 AM")]},
    {id:7,name:"Ali Raza",initials:"AR",avatar:7,type:"person",time:"10:31 AM",preview:"See you tomorrow!",outgoing:true,unread:0,favorite:true,pinned:true,online:true,phone:"+92 300 1002003",about:"At work",messages:[msg("them","Same cafe tomorrow?","10:27 AM"),msg("me","Perfect. See you tomorrow!","10:31 AM")]},
    {id:8,name:"Study Group",initials:"SG",avatar:8,type:"group",time:"Yesterday",preview:"Mina: Did anyone finish the worksheet?",outgoing:false,unread:4,favorite:false,participants:["Mina","Noor Fatima","Sara Ahmed","You"],about:"Study together, succeed together 📚",messages:[msg("them","Can someone explain question 4?","Yesterday","YESTERDAY","Noor Fatima"),msg("them","I can help after lunch","Yesterday","YESTERDAY","Mina"),msg("them","Did anyone finish the worksheet?","Yesterday","YESTERDAY","Mina")]},
    {id:9,name:"Sara Ahmed",initials:"SA",avatar:9,type:"person",time:"Yesterday",preview:"Good morning ☀️",outgoing:true,unread:0,favorite:false,online:false,phone:"+92 300 3332221",about:"Good vibes only",messages:[msg("them","Hope you have a lovely day!","Yesterday","YESTERDAY"),msg("me","Good morning ☀️","Yesterday","YESTERDAY")]},
    {id:10,name:"Cousins Group",initials:"CG",avatar:10,type:"group",time:"Yesterday",preview:"Hira: Shared a photo",outgoing:false,unread:2,favorite:true,muted:true,participants:["Hira","Bilal","Ayesha Khan","You"],about:"Cousins ❤️",messages:[msg("them","Weekend plan?","Yesterday","YESTERDAY","Bilal"),msg("them","Shared a photo","Yesterday","YESTERDAY","Hira")]},
    {id:11,name:"Hamza",initials:"H",avatar:11,type:"person",time:"Yesterday",preview:"Voice message",outgoing:false,unread:0,favorite:false,online:false,phone:"+92 312 9998877",about:"Available",messages:[msg("them","Voice message · 0:18","Yesterday","YESTERDAY")]},
    {id:12,name:"Work Group",initials:"WG",avatar:12,type:"group",time:"Tuesday",preview:"Meeting moved to 3:30 PM",outgoing:false,unread:6,favorite:false,participants:["Manager","Ahmed","Mina","You"],about:"Work updates",messages:[msg("them","Agenda is ready for the team meeting.","Tuesday","TUESDAY","Manager"),msg("them","Meeting moved to 3:30 PM","Tuesday","TUESDAY","Ahmed")]},
    {id:13,name:"Noor Fatima",initials:"NF",avatar:2,type:"person",time:"Monday",preview:"Sure, no problem!",outgoing:true,unread:0,favorite:false,online:false,phone:"+92 300 6660011",about:"At school",messages:[msg("me","Could you share the notes?","Monday","MONDAY"),msg("them","Sure, no problem!","Monday","MONDAY")]},
    {id:14,name:"Project Group",initials:"PG",avatar:3,type:"group",time:"Monday",preview:"You: Let's do it 👍",outgoing:false,unread:2,favorite:false,participants:["Ali Raza","Sara Ahmed","You"],about:"Project collaboration",messages:[msg("them","I added the latest updates to the document.","Monday","MONDAY","Ali Raza"),msg("me","Let's do it 👍","Monday","MONDAY")]},
    {id:15,name:"Zainab",initials:"Z",avatar:5,type:"person",time:"Sunday",preview:"Thank you ❤️",outgoing:true,unread:0,favorite:true,online:false,phone:"+92 301 1442211",about:"Available",messages:[msg("them","You really helped me today.","Sunday","SUNDAY"),msg("me","Thank you ❤️","Sunday","SUNDAY")]},
    {id:16,name:"Weekend Plans",initials:"WP",avatar:4,type:"group",time:"Saturday",preview:"You: I'll check and let you know",outgoing:true,unread:0,favorite:false,archived:true,participants:["Hassan Raza","Noor Fatima","You"],about:"Planning ahead",messages:[msg("me","I'll check and let you know","Saturday","SATURDAY")]}
  ];
  const settingsTabs = [
    ["account","key","Account"],["privacy","shield","Privacy"],["chats","chat","Chats"],["notifications","bell","Notifications"],
    ["personalization","palette","Appearance"],["storage","database","Storage and data"],["accessibility","users","Accessibility"],
    ["language","globe","App language"],["help","help","Help"],["shortcuts","keyboard","Keyboard shortcuts"]
  ];
  let currentView = "chats";
  let activeFilter = "all";
  let selectedId = null;
  let settingsTab = "account";
  let settingsSearch = "";
  let toastTimer = null;
  let profile = {name:"Maryam Ali",about:"Available",phone:"+92 300 1234567"};
  let archivedMode = false;
  let selectionMode = false;
  let lastPopup = null;
  const byId = id => chats.find(c => c.id === Number(id));
  const selectedChat = () => byId(selectedId);
  const isMobile = () => window.matchMedia("(max-width: 700px)").matches;
  function toast(text) {
    toastSlot.innerHTML = "<div class='wa-toast'>" + esc(text) + "</div>";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastSlot.innerHTML = ""; }, 2600);
  }
  function updateMobile() {
    root.classList.toggle("wa-mobile-open", isMobile() && (currentView !== "chats" || selectedId !== null));
  }
  function updateNav() {
    root.querySelectorAll("[data-view]").forEach(el => {
      const active = el.dataset.view === currentView;
      el.classList.toggle("active", active);
    });
  }
  function avatar(chat, extra) {
    const letters = esc(chat.initials || chat.name.split(/\s+/).map(p => p[0]).slice(0,2).join("").toUpperCase());
    return "<span class='wa-avatar wa-av" + (chat.avatar || 1) + (extra ? " " + extra : "") + "' aria-hidden='true'>" + letters + "</span>";
  }
  function filteredChats() {
    const query = (searchInput.value || "").trim().toLowerCase();
    return chats.filter(chat => {
      if (chat.archived && !archivedMode) return false;
      if (archivedMode && !chat.archived) return false;
      if (!archivedMode) {
        if (activeFilter === "unread" && chat.unread <= 0) return false;
        if (activeFilter === "favorites" && !chat.favorite) return false;
        if (activeFilter === "groups" && chat.type !== "group") return false;
      }
      if (query && !(chat.name + " " + chat.preview + " " + (chat.phone || "")).toLowerCase().includes(query)) return false;
      return true;
    });
  }
  function renderList() {
    const title = root.querySelector("#wa-view-title");
    if (title) title.textContent = currentView === "chats" ? (archivedMode ? "Archived" : "Chats") : "Chats";
    root.querySelectorAll("[data-filter]").forEach(b => b.setAttribute("aria-pressed", b.dataset.filter === activeFilter && !archivedMode ? "true" : "false"));
    const rows = filteredChats();
    if (!rows.length) {
      chatList.innerHTML = "<div class='wa-empty'>" + (searchInput.value ? "No chats found." : "No chats in this list yet.") + "</div>";
      return;
    }
    chatList.innerHTML = rows.map(chat => {
      const meta = [];
      if (chat.pinned) meta.push("<span title='Pinned'>" + ic("pin") + "</span>");
      if (chat.muted) meta.push("<span title='Muted'>" + ic("mute") + "</span>");
      if (chat.unread > 0) meta.push("<span class='wa-unread-count'>" + chat.unread + "</span>");
      const previewPrefix = chat.outgoing ? "<span class='wa-checks'>" + ic("checks") + "</span>" : "";
      return "<div class='wa-chat-row" + (selectedId === chat.id && currentView === "chats" ? " selected" : "") + "' data-chat-id='" + chat.id + "' role='listitem' tabindex='0' aria-label='Open " + esc(chat.name) + "'>" +
        avatar(chat) + "<div class='wa-chat-copy'><div class='wa-chat-line'><span class='wa-chat-name'>" + esc(chat.name) + "</span><span class='wa-chat-time" + (chat.unread > 0 ? " unread" : "") + "'>" + esc(chat.time) + "</span></div>" +
        "<div class='wa-chat-line'><div class='wa-preview'>" + previewPrefix + "<span class='wa-preview-text'>" + esc(chat.preview) + "</span></div><div class='wa-meta'>" + meta.join("") + "</div></div></div>" +
        "<button class='wa-row-menu' type='button' data-action='row-menu' data-chat-id='" + chat.id + "' aria-label='Chat options'><svg viewBox='0 0 24 24' stroke='currentColor' fill='none' stroke-width='2'><circle cx='5' cy='12' r='1'/><circle cx='12' cy='12' r='1'/><circle cx='19' cy='12' r='1'/></svg></button></div>";
    }).join("");
    updateNav();
  }
  function messageHtml(message, chat) {
    const outgoing = message.from === "me";
    const sender = !outgoing && chat.type === "group" ? "<span class='wa-message-sender'>" + esc(message.sender || "Group member") + "</span>" : "";
    const time = esc(message.time || "12:00 PM");
    const reaction = message.reaction ? "<span class='wa-reaction'>" + esc(message.reaction) + "</span>" : "";
    const meta = "<span class='wa-message-meta'>" + time + (outgoing ? ic("checks") : "") + "</span>";
    return "<div class='wa-message-row " + (outgoing ? "outgoing" : "incoming") + "'><div class='wa-message-bubble'>" + sender + "<span class='wa-message-text'>" + esc(message.text) + "</span>" + meta + reaction + "</div></div>";
  }
  const welcomeArt = "<svg class='wa-welcome-art' viewBox='0 0 320 250' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'><ellipse cx='161' cy='220' rx='112' ry='9' fill='#e0e6e8'/><path d='M61 142c-1-40 39-70 89-70 45 0 79 25 83 60 4 36-31 66-78 69l-30 24 4-26c-40-8-67-29-68-57Z' fill='#d9fdd3'/><path d='M76 139c0-30 31-54 71-54 40 0 72 24 72 54s-32 54-72 54c-10 0-20-1-29-4l-22 14 4-22c-15-10-24-24-24-42Z' fill='#25d366'/><path d='M128 114c-3-5-5-5-8-5s-7 3-8 7c-2 5 2 15 7 23 8 11 18 19 30 25 7 3 13 5 17 4 5-1 8-6 8-10 0-2-1-3-4-5l-10-5c-2-1-3 0-5 2l-4 5c-1 1-2 2-4 1-6-2-12-7-17-12-4-4-7-9-8-12 0-1 0-2 1-3l4-4c1-2 1-3 1-4l-4-7Z' fill='#fff'/><path d='M233 60c0-17 15-31 34-31 18 0 33 14 33 31s-15 31-33 31c-5 0-9-1-13-3l-13 7 4-13c-7-6-12-13-12-22Z' fill='#e3e8eb'/><path d='M263 49c-2-2-3-1-4 0-2 2-3 5-2 8 2 5 6 9 11 12 4 2 7 3 9 2 2-1 3-3 3-4 0-1 0-2-2-2l-5-2c-1 0-2 0-2 1l-2 2c-1 1-1 1-2 0-2-1-4-3-6-5-1-2-2-3-2-4 0-1 0-1 1-2l2-2c1-1 1-1 0-2l-1-2Z' fill='#fff'/><path d='M34 185h35M50 168v34M248 157h30M263 142v30' stroke='#c2d2d8' stroke-width='3' stroke-linecap='round'/><circle cx='104' cy='50' r='5' fill='#b8dccc'/><circle cx='222' cy='112' r='4' fill='#c6d8df'/><circle cx='93' cy='208' r='4' fill='#b7d9c8'/></svg>";
  function renderWelcome() {
    main.innerHTML = "<div class='wa-welcome'><div class='wa-welcome-inner'>" + welcomeArt + "<h2>WhatsApp Web</h2><p>Send and receive messages with ease, right from your computer.</p><div class='wa-welcome-line'></div><div class='wa-caption'>" + ic("lock") + "<span>Frontend preview · Conversations aren’t connected yet</span></div></div><div class='wa-welcome-footer'>" + ic("lock") + "<span>WhatsApp-style interface preview</span></div></div>";
  }
  function renderConversation(chat) {
    const subtitle = chat.type === "group" ? (chat.participants || []).slice(0,4).join(", ") : (chat.online ? "online" : "click here for contact info");
    const pinned = chat.pinned ? "<div class='wa-pinned'>" + ic("pin") + "<div class='wa-pinned-copy'><strong>Pinned message</strong><span>" + esc(chat.messages[0] ? chat.messages[0].text : chat.preview) + "</span></div><button class='wa-icon-btn' data-action='pinned-menu' aria-label='Pinned message options'>" + ic("more") + "</button></div>" : "";
    let items = "";
    let lastDate = "";
    (chat.messages || []).forEach(message => {
      if (message.date && message.date !== lastDate) {
        const dateName = message.date === "TODAY" ? "Today" : message.date === "YESTERDAY" ? "Yesterday" : message.date[0] + message.date.slice(1).toLowerCase();
        items += "<div class='wa-date'>" + dateName + "</div>";
        lastDate = message.date;
      }
      items += messageHtml(message, chat);
    });
    return "<div class='wa-conversation'>" +
      "<header class='wa-conversation-header'><button class='wa-back' data-action='back-to-list' aria-label='Back to chats'>" + ic("back") + "</button>" +
      "<button class='wa-person' data-action='chat-info' aria-label='Open " + esc(chat.name) + " info'>" + avatar(chat) + "<span class='wa-person-copy'><span class='wa-person-name'>" + esc(chat.name) + "</span><span class='wa-person-subtitle'>" + esc(subtitle) + "</span></span></button>" +
      "<div class='wa-conversation-actions'><button class='wa-call-button' data-action='call-menu'>" + ic("video") + "<span>Video call</span>" + ic("chevron") + "</button>" +
      "<button class='wa-icon-btn' data-action='chat-search' title='Search in chat' aria-label='Search in chat'>" + ic("search") + "</button>" +
      "<button class='wa-icon-btn' data-action='chat-menu' title='More options' aria-label='More options'>" + ic("more") + "</button></div></header>" +
      pinned +
      "<div class='wa-message-scroll' id='wa-message-scroll'><div class='wa-encryption'>" + ic("lock") + " Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. Click to learn more.</div>" + items + "</div>" +
      "<form class='wa-composer' data-form='send-message'><button class='wa-composer-tool' type='button' data-action='attachment' aria-label='Attach' title='Attach'>" + ic("clip") + "</button>" +
      "<button class='wa-composer-tool' type='button' data-action='emoji' aria-label='Emoji' title='Emoji'>" + ic("smile") + "</button>" +
      "<div class='wa-composer-box'><textarea id='wa-message-input' rows='1' placeholder='Type a message' aria-label='Type a message'></textarea></div>" +
      "<button class='wa-send' type='submit' aria-label='Send message' title='Send message'>" + ic("send") + "</button></form></div>";
  }
  function screenHeader(title, extra) {
    return "<header class='wa-screen-header'><button class='wa-icon-btn wa-mobile-back' data-action='back-to-list' aria-label='Back'>" + ic("back") + "</button><h2>" + esc(title) + "</h2>" + (extra || "") + "</header>";
  }
  function settingRow(iconName, title, subtitle, action) {
    return "<button class='wa-setting-row' type='button' data-action='" + esc(action || "placeholder") + "'><span class='wa-row-icon'>" + ic(iconName) + "</span><span class='wa-setting-copy'><span class='wa-setting-title'>" + esc(title) + "</span><span class='wa-setting-subtitle'>" + esc(subtitle) + "</span></span><span class='wa-end-icon'>" + ic("chevron") + "</span></button>";
  }
  function renderProfile() {
    main.innerHTML = "<section class='wa-screen'>" + screenHeader("Profile", "<button class='wa-icon-btn' data-action='settings' title='Settings' aria-label='Settings'>" + ic("settings") + "</button>") +
      "<div class='wa-screen-content'><div class='wa-profile-card'><div class='wa-profile-photo'>MA</div><div><h3>" + esc(profile.name) + "</h3><p>" + esc(profile.phone) + "</p><button class='wa-primary' data-action='edit-profile'>" + ic("edit") + " Edit profile</button></div></div>" +
      "<div class='wa-card'><h3 class='wa-card-title'>Profile information</h3>" +
      "<div class='wa-setting-row'><span class='wa-row-icon'>" + ic("edit") + "</span><span class='wa-setting-copy'><span class='wa-setting-subtitle'>Name</span><span class='wa-setting-title'>" + esc(profile.name) + "</span></span><button class='wa-icon-btn' data-action='edit-profile' aria-label='Edit name'>" + ic("edit") + "</button></div>" +
      "<div class='wa-setting-row'><span class='wa-row-icon'>" + ic("info") + "</span><span class='wa-setting-copy'><span class='wa-setting-subtitle'>About</span><span class='wa-setting-title'>" + esc(profile.about) + "</span></span><button class='wa-icon-btn' data-action='edit-profile' aria-label='Edit about'>" + ic("edit") + "</button></div>" +
      "<div class='wa-setting-row'><span class='wa-row-icon'>" + ic("phone") + "</span><span class='wa-setting-copy'><span class='wa-setting-subtitle'>Phone</span><span class='wa-setting-title'>" + esc(profile.phone) + "</span></span></div></div>" +
      "<p class='wa-description'>Your profile information is shown here as demo content. Changes are not synced to a real WhatsApp account.</p></div></section>";
  }
  const settingDescriptions = {
    account:[["key","Security notifications","Get notified when security codes change.","toggle"],["shield","Two-step verification","Add extra security to your account.","button"],["phone","Change number","Change the phone number linked to your account.","button"],["database","Request account info","Request a report of your account information.","button"],["logout","Delete account","Delete your account from this device.","danger"]],
    privacy:[["lock","Last seen and online","Control who can see when you’re online.","Everyone"],["image","Profile photo","Choose who can see your profile photo.","My contacts"],["info","About","Choose who can see your About.","Everyone"],["status","Status","Manage status privacy.","My contacts"],["checks","Read receipts","Show read receipts in one-to-one chats.","toggle"],["users","Groups","Choose who can add you to groups.","My contacts"],["lock","App lock","Require a password to unlock WhatsApp.","toggle"],["clock","Disappearing messages","Set a default message timer.","Off"]],
    chats:[["palette","Theme","Choose light, dark or system theme.","Light"],["image","Wallpaper","Set a chat wallpaper.","Default"],["archive","Keep chats archived","Archived chats stay archived when new messages arrive.","toggle"],["database","Chat backup","Back up your chat history.","button"],["document","Media visibility","Show newly downloaded media in your device gallery.","toggle"],["key","Enter is send","Press Enter to send messages.","toggle"]],
    notifications:[["bell","Messages","Message notifications and sounds.","button"],["users","Groups","Group notifications and sounds.","button"],["phone","Calls","Ringtone and call notifications.","button"],["sparkles","Reaction notifications","Show notifications when someone reacts to your messages.","toggle"]],
    personalization:[["palette","Theme","Light, dark or system default.","Light"],["image","Chat wallpaper","Change the default wallpaper for chats.","Default"],["sparkles","Accent color","Preview color personalization options.","Green"]],
    storage:[["database","Manage storage","Review items and chats taking up space.","button"],["image","Manage media","Review photos, videos and documents.","button"],["download","Media auto-download","Choose when media should download.","button"],["database","Network usage","View network usage details.","button"]],
    accessibility:[["help","Reduce motion","Limit animations and movement.","toggle"],["users","Keyboard navigation","Navigate the interface with the keyboard.","toggle"],["palette","High contrast","Improve contrast in the interface.","toggle"]],
    language:[["globe","App language","English (device language)","English"],["globe","Spell check","Spell-check message text while typing.","toggle"]],
    help:[["help","Help center","Find answers to common questions.","button"],["phone","Contact us","Get help with WhatsApp.","button"],["document","Terms and privacy policy","Read terms and policies.","button"],["info","App info","Version 2.26 · Frontend preview","button"]],
    shortcuts:[["new","New chat","Ctrl + Alt + N","key"],["users","New group","Ctrl + Alt + Shift + N","key"],["search","Search chat","Ctrl + Alt + Shift + F","key"],["settings","Settings","Ctrl + Alt + ,","key"],["x","Close chat","Escape","key"]]
  };
  function renderSettingDetail() {
    const tab = settingsTabs.find(t => t[0] === settingsTab) || settingsTabs[0];
    const options = settingDescriptions[settingsTab] || settingDescriptions.account;
    let content = "";
    if (settingsTab === "account") content = "<div class='wa-settings-summary'>" + avatar({initials:"MA",avatar:2}) + "<div><h4>" + esc(profile.name) + "</h4><p>" + esc(profile.phone) + "</p></div></div>";
    content += "<div class='wa-card'>" + options.map((item, index) => {
      const side = item[3] === "toggle" ? "<button class='wa-toggle " + (item[1] === "Read receipts" || item[1] === "Keep chats archived" ? "on" : "") + "' type='button' data-setting-toggle='" + esc(item[1]) + "' aria-pressed='" + ((item[1] === "Read receipts" || item[1] === "Keep chats archived") ? "true" : "false") + "' aria-label='Toggle " + esc(item[1]) + "'></button>" :
        item[3] === "button" || item[3] === "danger" ? "<span class='wa-setting-option-side'>" + ic("chevron") + "</span>" :
        item[3] === "key" ? "<span class='wa-setting-option-side'>" + esc(item[2]) + "</span>" : "<span class='wa-setting-option-side'>" + esc(item[3] || "") + "</span>";
      return "<div class='wa-setting-option'><span class='wa-row-icon'>" + ic(item[0]) + "</span><div class='wa-setting-option-copy'><strong>" + esc(item[1]) + "</strong><span>" + esc(item[2]) + "</span></div>" + side + "</div>";
    }).join("") + "</div><p class='wa-description'>This settings page is a visual frontend preview. Changes are local demo state only.</p>";
    return "<div class='wa-settings-detail-head'><button class='wa-icon-btn wa-mobile-back' data-action='back-to-list' aria-label='Back'>" + ic("back") + "</button><h3>" + esc(tab[2]) + "</h3></div><div class='wa-settings-detail-content'>" + content + "</div>";
  }
  function renderSettings() {
    const matches = settingsTabs.filter(t => (t[2] + " " + t[0]).toLowerCase().includes(settingsSearch.toLowerCase()));
    main.innerHTML = "<section class='wa-settings-layout'><aside class='wa-settings-list'><div class='wa-settings-list-head'><h2>Settings</h2><label class='wa-settings-search'>" + ic("search") + "<input id='wa-settings-search' placeholder='Search settings' value='" + esc(settingsSearch) + "' aria-label='Search settings'></label></div>" +
      matches.map(tab => "<button class='wa-settings-nav" + (tab[0] === settingsTab ? " active" : "") + "' data-setting-tab='" + esc(tab[0]) + "'>" + ic(tab[1]) + "<span>" + esc(tab[2]) + "</span></button>").join("") +
      "<button class='wa-settings-nav' data-action='accounts-center'>" + ic("users") + "<span>Accounts Center</span></button></aside>" +
      "<div class='wa-settings-detail'>" + renderSettingDetail() + "</div></section>";
  }
  function renderInfo(chat) {
    if (!chat) { renderWelcome(); return; }
    const actions = "<div class='wa-hero-actions'>" +
      "<button class='wa-hero-action' data-action='info-call'>" + ic("phone") + "<span>Audio</span></button>" +
      "<button class='wa-hero-action' data-action='info-video'>" + ic("video") + "<span>Video</span></button>" +
      "<button class='wa-hero-action' data-action='search-in-chat'>" + ic("search") + "<span>Search</span></button></div>";
    let detail = "<div class='wa-contact-hero'>" + avatar(chat) + "<h3>" + esc(chat.name) + "</h3><p>" + esc(chat.type === "group" ? (chat.participants || []).length + " participants" : (chat.phone || "+92 300 0000000")) + "</p>" + actions + "</div>";
    if (chat.type === "group") {
      detail += "<div class='wa-description-card'><h4>Group description</h4><p>" + esc(chat.about || "No description added") + "</p></div>";
      detail += "<div class='wa-card'><h3 class='wa-card-title'>Participants · " + (chat.participants || []).length + "</h3><button class='wa-setting-row' data-action='add-participants'>" + ic("plusUser") + "<span class='wa-setting-copy'><span class='wa-setting-title'>Add participants</span></span>" + ic("chevron") + "</button>" +
        (chat.participants || []).map((name, i) => "<div class='wa-member'>" + avatar({initials:name.split(/\\s+/).map(p => p[0]).slice(0,2).join("").toUpperCase(),avatar:(i%12)+1}) + "<span class='wa-member-name'>" + esc(name) + "</span>" + (i === 0 ? "<span class='wa-member-role'>Admin</span>" : "") + "</div>").join("") + "</div>";
    } else {
      detail += "<div class='wa-card'><h3 class='wa-card-title'>About and phone number</h3><div class='wa-setting-row'><span class='wa-setting-copy'><span class='wa-setting-subtitle'>About</span><span class='wa-setting-title'>" + esc(chat.about || "Available") + "</span></span></div><div class='wa-setting-row'><span class='wa-setting-copy'><span class='wa-setting-subtitle'>Phone number</span><span class='wa-setting-title'>" + esc(chat.phone || "+92 300 0000000") + "</span></span></div></div>";
      detail += "<div class='wa-card'><h3 class='wa-card-title'>Shared media, links and documents</h3><button class='wa-setting-row' data-action='shared-media'>" + ic("image") + "<span class='wa-setting-copy'><span class='wa-setting-title'>Media, links and documents</span><span class='wa-setting-subtitle'>No shared media in this preview</span></span>" + ic("chevron") + "</button></div>";
    }
    detail += "<div class='wa-card'><button class='wa-setting-row' data-action='mute-chat'>" + ic("mute") + "<span class='wa-setting-copy'><span class='wa-setting-title'>" + (chat.muted ? "Unmute notifications" : "Mute notifications") + "</span></span>" + ic("chevron") + "</button><button class='wa-setting-row' data-action='disappearing'>" + ic("clock") + "<span class='wa-setting-copy'><span class='wa-setting-title'>Disappearing messages</span><span class='wa-setting-subtitle'>Off</span></span>" + ic("chevron") + "</button><button class='wa-setting-row' data-action='block-chat'>" + ic("slash") + "<span class='wa-setting-copy'><span class='wa-setting-title'>Block " + esc(chat.name) + "</span></span>" + ic("chevron") + "</button></div>";
    main.innerHTML = "<section class='wa-details'><header class='wa-details-head'><button class='wa-icon-btn' data-action='back-to-chat' aria-label='Back to chat'>" + ic("back") + "</button><h2>Contact info</h2><button class='wa-icon-btn' data-action='chat-menu' aria-label='More options'>" + ic("more") + "</button></header><div class='wa-details-content'>" + detail + "</div></section>";
  }
  function renderUpdates() {
    const status = [
      ["MA","My status","Tap to add status update","wa-av2"],["AK","Ayesha Khan","Today, 12:24 PM","wa-av1"],["HR","Hassan Raza","Today, 11:58 AM","wa-av3"],["SA","Sara Ahmed","Today, 10:42 AM","wa-av9"],["NF","Noor Fatima","Yesterday, 8:30 PM","wa-av5"]
    ];
    main.innerHTML = "<section class='wa-screen'>" + screenHeader("Updates", "<button class='wa-icon-btn' data-action='camera' aria-label='Camera'>" + ic("camera") + "</button><button class='wa-icon-btn' data-action='new-status' aria-label='New status'>" + ic("new") + "</button>") +
      "<div class='wa-screen-content'><p class='wa-description'>Share everyday moments with status updates that disappear after 24 hours.</p><div class='wa-card'><h3 class='wa-card-title'>Status</h3>" + status.map((s,i) => "<div class='wa-status-row' data-action='status-preview' data-status-name='" + esc(s[1]) + "'><div class='wa-status-ring'><div class='wa-status-inner'>" + esc(s[0]) + "</div></div><div class='wa-status-copy'><strong>" + esc(s[1]) + "</strong><span>" + esc(s[2]) + "</span></div></div>").join("") + "</div><div class='wa-card'><h3 class='wa-card-title'>Channels</h3>" + settingRow("channels","Explore channels","Follow updates from people and organizations","nav-channels") + "</div></div></section>";
  }
  function renderCalls() {
    const rows = [["AK","Ayesha Khan","Today, 11:45 AM","incoming"],["HR","Hassan Raza","Yesterday, 8:10 PM","outgoing"],["FG","Family Group","Yesterday, 6:30 PM","missed"],["M","Mom","Monday, 2:42 PM","incoming"],["AR","Ali Raza","Sunday, 10:10 AM","outgoing"]];
    main.innerHTML = "<section class='wa-screen'>" + screenHeader("Calls","<button class='wa-icon-btn' data-action='new-call' aria-label='New call'>" + ic("phone") + "</button>") +
      "<div class='wa-screen-content'><p class='wa-description'>Your recent calls will appear here.</p><div class='wa-card'>" + rows.map((r,i) => "<div class='wa-setting-row' data-action='call-entry' data-call-name='" + esc(r[1]) + "'>" + avatar({initials:r[0],avatar:(i%12)+1}) + "<span class='wa-setting-copy'><span class='wa-setting-title'>" + esc(r[1]) + "</span><span class='wa-setting-subtitle'>" + ic(r[3] === "outgoing" ? "forward" : "reply") + " " + esc(r[2]) + "</span></span><span class='wa-end-icon'>" + ic("phone") + "</span></div>").join("") + "</div></div></section>";
  }
  function renderCommunities() {
    main.innerHTML = "<section class='wa-screen'>" + screenHeader("Communities","<button class='wa-icon-btn' data-action='new-community' aria-label='New community'>" + ic("new") + "</button>") +
      "<div class='wa-screen-content'><p class='wa-description'>Bring people together in topic-based communities. Organize group chats and announcements in one place.</p><div class='wa-card'><div class='wa-setting-row'>" + avatar({initials:"EC",avatar:7}) + "<span class='wa-setting-copy'><span class='wa-setting-title'>School community</span><span class='wa-setting-subtitle'>Announcements · Study Group</span></span>" + ic("chevron") + "</div><div class='wa-setting-row'>" + avatar({initials:"FM",avatar:2}) + "<span class='wa-setting-copy'><span class='wa-setting-title'>Family community</span><span class='wa-setting-subtitle'>Family Group · Cousins Group</span></span>" + ic("chevron") + "</div></div><button class='wa-primary' data-action='new-community'>" + ic("new") + " New community</button></div></section>";
  }
  function renderChannels() {
    const channels = [["W","WhatsApp","Official updates from WhatsApp"],["M","Meta","Updates from Meta"],["T","Technology Today","Technology news and updates"]];
    main.innerHTML = "<section class='wa-screen'>" + screenHeader("Channels","<button class='wa-icon-btn' data-action='channel-discover' aria-label='Discover channels'>" + ic("search") + "</button>") +
      "<div class='wa-screen-content'><p class='wa-description'>Discover updates from people and organizations. Follow channels to see their updates here.</p><div class='wa-card'><h3 class='wa-card-title'>Suggested</h3>" + channels.map((c,i) => "<div class='wa-setting-row'>" + avatar({initials:c[0],avatar:i+3}) + "<span class='wa-setting-copy'><span class='wa-setting-title'>" + esc(c[1]) + " " + ic("check") + "</span><span class='wa-setting-subtitle'>" + esc(c[2]) + "</span></span><button class='wa-secondary' data-action='follow-channel' data-channel='" + esc(c[1]) + "'>Follow</button></div>").join("") + "</div></div></section>";
  }
  function renderBasicList(title, list, iconName) {
    main.innerHTML = "<section class='wa-screen'>" + screenHeader(title) + "<div class='wa-screen-content'><p class='wa-description'>" + (title === "Starred messages" ? "Messages you mark with a star will appear here." : title === "Archived" ? "Archived chats stay out of your main chat list." : "This section is shown as a frontend preview.") + "</p><div class='wa-card'>" +
      (list.length ? list.map(chat => "<button class='wa-setting-row' data-chat-id='" + chat.id + "'>" + avatar(chat) + "<span class='wa-setting-copy'><span class='wa-setting-title'>" + esc(chat.name) + "</span><span class='wa-setting-subtitle'>" + esc(chat.preview) + "</span></span><span class='wa-end-icon'>" + ic(iconName || "chevron") + "</span></button>").join("") : "<div class='wa-empty'>Nothing to show here yet.</div>") + "</div></div></section>";
  }
  function renderSection() {
    updateMobile(); updateNav();
    if (currentView === "chats") {
      if (selectedId !== null) renderConversation(selectedChat());
      else renderWelcome();
    } else if (currentView === "profile") renderProfile();
    else if (currentView === "settings") renderSettings();
    else if (currentView === "info") renderInfo(selectedChat());
    else if (currentView === "updates") renderUpdates();
    else if (currentView === "calls") renderCalls();
    else if (currentView === "communities") renderCommunities();
    else if (currentView === "channels") renderChannels();
    else if (currentView === "starred") renderBasicList("Starred messages", chats.filter(c => c.pinned || c.favorite), "star");
    else if (currentView === "archived") renderBasicList("Archived", chats.filter(c => c.archived), "archive");
    else if (currentView === "locked')") renderBasicList("Locked chats", [], "lock");
    else renderWelcome();
    updateMobile();
  }
  function goView(view) {
    currentView = view;
    if (view !== "chats") selectionMode = false;
    if (view === "archived") archivedMode = true;
    else if (view === "chats") archivedMode = false;
    if (view !== "chats") selectedId = null;
    closeMenu(); closeDialog(); renderList(); renderSection(); updateNav();
  }
  function selectChat(id) {
    const chat = byId(id);
    if (!chat) return;
    selectedId = chat.id;
    currentView = "chats";
    archivedMode = false;
    if (chat.unread > 0) chat.unread = 0;
    closeMenu(); closeDialog();
    renderList(); renderSection();
    updateMobile();
    requestAnimationFrame(() => {
      const scroller = root.querySelector("#wa-message-scroll");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      const input = root.querySelector("#wa-message-input");
      if (input && !isMobile()) input.focus({preventScroll:true});
    });
  }
  function closeMenu() { floatLayer.innerHTML = ""; lastPopup = null; }
  function openMenu(anchor, items) {
    closeMenu();
    const rect = anchor.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "wa-menu";
    menu.id = "wa-active-menu";
    menu.innerHTML = items.map(item => item.separator ? "<div class='wa-menu-sep'></div>" :
      "<button type='button' class='" + (item.danger ? "danger" : "") + "' data-menu-action='" + esc(item.action) + "'>" + ic(item.icon || "circle") + "<span>" + esc(item.label) + "</span></button>").join("");
    floatLayer.appendChild(menu);
    const width = Math.min(300, Math.max(220, menu.offsetWidth));
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const height = menu.offsetHeight;
    const top = rect.bottom + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
    menu.style.left = left + "px"; menu.style.top = top + "px";
    lastPopup = items;
  }
  function closeDialog() { dialogSlot.innerHTML = ""; }
  function showDialog(title, body, footer) {
    closeMenu();
    dialogSlot.innerHTML = "<div class='wa-dialog-root' data-dialog-dismiss='true'><section class='wa-dialog' role='dialog' aria-modal='true' aria-label='" + esc(title) + "'><header class='wa-dialog-head'><h2>" + esc(title) + "</h2><button class='wa-icon-btn' data-action='close-dialog' aria-label='Close'>" + ic("x") + "</button></header><div class='wa-dialog-content'>" + body + "</div>" + (footer ? "<footer class='wa-dialog-footer'>" + footer + "</footer>" : "") + "</section></div>";
    const first = dialogSlot.querySelector("input:not([type=checkbox]),textarea");
    if (first) setTimeout(() => first.focus(), 20);
  }
  function newChatDialog() {
    const contacts = chats.filter(c => c.type === "person" && !c.archived);
    const body = "<label class='wa-dialog-search-wrap'><input class='wa-dialog-search' id='wa-contact-search' placeholder='Search name or number' aria-label='Search contacts'></label><div id='wa-contact-list'>" +
      contacts.map(c => "<div class='wa-pick-row' data-chat-pick='" + c.id + "' tabindex='0'>" + avatar(c) + "<label>" + esc(c.name) + "</label><span class='wa-end-icon'>" + ic("chevron") + "</span></div>").join("") + "</div>";
    showDialog("New chat", body, "<button class='wa-secondary' data-action='close-dialog'>Cancel</button>");
  }
  function newGroupDialog() {
    const options = chats.filter(c => c.type === "person");
    const body = "<div class='wa-field'><label for='wa-group-name'>Group subject</label><input id='wa-group-name' maxlength='60' placeholder='Enter group name'></div><p class='wa-description'>Add people to this demo group. No messages will be sent.</p><input class='wa-dialog-search' id='wa-group-search' placeholder='Search contacts'><div id='wa-group-contacts'>" +
      options.map(c => "<div class='wa-pick-row'>" + avatar(c) + "<label for='wa-member-" + c.id + "'>" + esc(c.name) + "</label><input id='wa-member-" + c.id + "' type='checkbox' value='" + c.id + "'></div>").join("") + "</div>";
    showDialog("New group", body, "<button class='wa-secondary' data-action='close-dialog'>Cancel</button><button class='wa-primary' data-dialog-action='create-group'>Create group</button>");
  }
  function newCommunityDialog() {
    const body = "<p class='wa-description'>Organize related groups and announcements in one place.</p><div class='wa-field'><label for='wa-community-name'>Community name</label><input id='wa-community-name' maxlength='60' placeholder='Enter community name'></div><div class='wa-field'><label for='wa-community-description'>Description (optional)</label><textarea id='wa-community-description' rows='3' placeholder='What is this community about?'></textarea></div>";
    showDialog("New community", body, "<button class='wa-secondary' data-action='close-dialog'>Cancel</button><button class='wa-primary' data-dialog-action='create-community'>Create community</button>");
  }
  function editProfileDialog() {
    const body = "<div class='wa-field'><label for='wa-edit-name'>Name</label><input id='wa-edit-name' maxlength='32' value='" + esc(profile.name) + "'></div><div class='wa-field'><label for='wa-edit-about'>About</label><input id='wa-edit-about' maxlength='140' value='" + esc(profile.about) + "'></div><div class='wa-field'><label for='wa-edit-phone'>Phone</label><input id='wa-edit-phone' value='" + esc(profile.phone) + "'></div>";
    showDialog("Edit profile", body, "<button class='wa-secondary' data-action='close-dialog'>Cancel</button><button class='wa-primary' data-dialog-action='save-profile'>Save</button>");
  }
  function selectChatsDialog() {
    const body = "<p class='wa-description'>Select chats to perform a bulk action. This preview only shows the selection interface.</p>" + chats.filter(c => !c.archived).map(c => "<div class='wa-pick-row'>" + avatar(c) + "<label for='wa-select-" + c.id + "'>" + esc(c.name) + "</label><input id='wa-select-" + c.id + "' type='checkbox' value='" + c.id + "'></div>").join("");
    showDialog("Select chats", body, "<button class='wa-secondary' data-action='close-dialog'>Cancel</button><button class='wa-primary' data-dialog-action='bulk-selection'>Continue</button>");
  }
  function itemsFor(action, chat) {
    if (action === "list-menu") return [
      {icon:"new",label:"New group",action:"new-group"},{icon:"users",label:"New community",action:"new-community"},
      {icon:"star",label:"Starred messages",action:"go-starred"},{icon:"check",label:"Select chats",action:"select-chats"},
      {separator:true},{icon:"settings",label:"Settings",action:"settings"},{icon:"help",label:"Help",action:"help"},{separator:true},{icon:"logout",label:"Log out",action:"logout"}
    ];
    if (action === "row-menu") return [
      {icon:"chat",label:"Open chat",action:"open-chat"},
      {icon:chat && chat.unread ? "checks" : "circle",label:chat && chat.unread ? "Mark as read" : "Mark as unread",action:"toggle-unread"},
      {icon:chat && chat.favorite ? "star" : "star",label:chat && chat.favorite ? "Remove from favorites" : "Add to favorites",action:"toggle-favorite"},
      {icon:"pin",label:chat && chat.pinned ? "Unpin chat" : "Pin chat",action:"toggle-pin"},
      {icon:"mute",label:chat && chat.muted ? "Unmute notifications" : "Mute notifications",action:"toggle-mute"},
      {separator:true},{icon:"archive",label:chat && chat.archived ? "Unarchive chat" : "Archive chat",action:"toggle-archive"},
      {icon:"trash",label:"Delete chat",action:"delete-chat",danger:true}
    ];
    if (action === "chat-menu") return [
      {icon:"info",label:chat && chat.type === "group" ? "Group info" : "Contact info",action:"chat-info"},
      {icon:"search",label:"Search",action:"chat-search"},{icon:"check",label:"Select messages",action:"select-messages"},
      {separator:true},{icon:"mute",label:chat && chat.muted ? "Unmute notifications" : "Mute notifications",action:"toggle-mute"},
      {icon:"clock",label:"Disappearing messages",action:"disappearing"},{icon:"lock",label:"Lock chat",action:"lock-chat"},
      {separator:true},{icon:"slash",label:"Report",action:"report-chat"},{icon:"slash",label:"Block",action:"block-chat",danger:true},
      {icon:"trash",label:"Clear chat",action:"clear-chat",danger:true},{icon:"trash",label:"Delete chat",action:"delete-chat",danger:true}
    ];
    if (action === "call-menu") return [{icon:"phone",label:"Voice call",action:"voice-call"},{icon:"video",label:"Video call",action:"video-call"}];
    if (action === "attachment") return [
      {icon:"document",label:"Document",action:"attachment-preview"},{icon:"image",label:"Photos & videos",action:"attachment-preview"},
      {icon:"camera",label:"Camera",action:"attachment-preview"},{icon:"contact",label:"Contact",action:"attachment-preview"},
      {icon:"poll",label:"Poll",action:"attachment-preview"},{icon:"calendar",label:"Event",action:"attachment-preview"}
    ];
    if (action === "emoji") return ["😀","😂","🥹","😍","😊","😭","❤️","👍","🙏","🔥","🎉","✨"].map(e => ({icon:"smile",label:e,action:"emoji-" + e}));
    if (action === "lists-menu") return [{icon:"new",label:"New list",action:"new-list"},{icon:"settings",label:"Manage lists",action:"manage-lists"}];
    if (action === "search-filters") return [{icon:"chat",label:"Search all chats",action:"search-all"},{icon:"image",label:"Photos",action:"search-media"},{icon:"document",label:"Documents",action:"search-media"},{icon:"link",label:"Links",action:"search-media"}];
    if (action === "pinned-menu") return [{icon:"pin",label:"View pinned messages",action:"pinned-preview"},{icon:"x",label:"Unpin message",action:"pinned-preview"}];
    return [];
  }
  function applyChatAction(action, chat) {
    if (!chat) { toast("Choose a chat first."); return; }
    if (action === "open-chat") { selectChat(chat.id); return; }
    if (action === "toggle-unread") { chat.unread = chat.unread ? 0 : 1; toast(chat.unread ? "Chat marked as unread" : "Chat marked as read"); }
    else if (action === "toggle-favorite") { chat.favorite = !chat.favorite; toast(chat.favorite ? "Added to favorites" : "Removed from favorites"); }
    else if (action === "toggle-pin") { chat.pinned = !chat.pinned; toast(chat.pinned ? "Chat pinned" : "Chat unpinned"); }
    else if (action === "toggle-mute" || action === "mute-chat") { chat.muted = !chat.muted; toast(chat.muted ? "Notifications muted" : "Notifications unmuted"); }
    else if (action === "toggle-archive") { chat.archived = !chat.archived; toast(chat.archived ? "Chat archived" : "Chat unarchived"); if (chat.archived && selectedId === chat.id) selectedId = null; }
    else if (action === "delete-chat") { toast("Delete is a preview action. No real chat was deleted."); }
    else if (action === "clear-chat") { toast("Clear chat is a preview action."); }
    else if (action === "chat-info") { currentView = "info"; renderSection(); return; }
    else if (action === "chat-search" || action === "search-in-chat") { toast("Search in chat preview"); return; }
    else if (action === "disappearing") { toast("Disappearing messages options are shown as preview only."); return; }
    else if (action === "block-chat" || action === "report-chat") { toast("This account action is not connected in the frontend preview."); return; }
    else if (action === "lock-chat") { chat.locked = !chat.locked; toast(chat.locked ? "Chat locked in this preview" : "Chat unlocked in this preview"); }
    else if (action === "select-messages") { toast("Message selection preview"); return; }
    else if (action === "pinned-preview") { toast("Pinned messages preview"); return; }
    renderList(); renderSection();
  }
  function handleMenuAction(action, chat) {
    closeMenu();
    if (["open-chat","toggle-unread","toggle-favorite","toggle-pin","toggle-mute","toggle-archive","delete-chat","clear-chat","chat-info","chat-search","search-in-chat","disappearing","block-chat","report-chat","lock-chat","select-messages","pinned-preview","mute-chat"].includes(action)) { applyChatAction(action, chat || selectedChat()); return; }
    if (action === "new-group") { newGroupDialog(); return; }
    if (action === "new-community") { newCommunityDialog(); return; }
    if (action === "go-starred") { goView("starred"); return; }
    if (action === "select-chats") { selectChatsDialog(); return; }
    if (action === "settings") { settingsTab = "account"; currentView = "settings"; renderSection(); return; }
    if (action === "profile") { currentView = "profile"; renderSection(); return; }
    if (action === "help") { settingsTab = "help"; currentView = "settings"; renderSection(); return; }
    if (action === "logout") { toast("Log out is not connected in this frontend preview."); return; }
    if (action === "voice-call" || action === "video-call" || action === "info-call" || action === "info-video") { toast("Calling UI preview only — no call is placed."); return; }
    if (action === "attachment-preview") { toast("Attachment picker is shown as a frontend preview."); return; }
    if (action.startsWith("emoji-")) { insertEmoji(action.slice(6)); return; }
    if (action === "new-list" || action === "manage-lists") { toast("Custom chat lists UI preview."); return; }
    if (action === "search-all") { searchInput.focus(); searchInput.value = ""; activeFilter = "all"; archivedMode = false; renderList(); return; }
    if (action === "search-media") { toast("Search media filter preview."); return; }
    if (action === "accounts-center") { toast("Accounts Center preview only."); return; }
    if (action === "channel-discover") { toast("Channel discovery preview."); return; }
    if (action === "follow-channel") { toast("Channel follow is demo-only."); return; }
    if (action === "camera" || action === "new-status" || action === "status-preview") { toast("Status creation and viewing are preview-only."); return; }
    if (action === "new-call" || action === "call-entry") { toast("Calls are not connected in this frontend preview."); return; }
    if (action === "shared-media") { toast("No real shared media exists in this demo."); return; }
    if (action === "add-participants") { newChatDialog(); return; }
    if (action === "placeholder") { toast("This option is a visual preview only."); return; }
  }
  function insertEmoji(emoji) {
    closeMenu();
    const input = root.querySelector("#wa-message-input");
    if (input) { input.value += emoji; input.focus(); }
  }
  function openActionMenu(button, action) {
    const chat = byId(button.dataset.chatId) || selectedChat();
    openMenu(button, itemsFor(action, chat));
  }

  root.addEventListener("click", event => {
    const target = event.target.closest("button,[data-view],[data-filter],[data-chat-id],[data-chat-pick],[data-action],[data-dialog-action],[data-setting-tab],[data-setting-toggle],[data-dialog-dismiss],[data-status-name]");
    if (!target || !root.contains(target)) return;
    if (target.dataset.dialogDismiss === "true" && event.target === target) { closeDialog(); return; }
    if (target.dataset.menuAction) { handleMenuAction(target.dataset.menuAction, selectedChat()); return; }
    if (target.dataset.dialogAction) {
      if (target.dataset.dialogAction === "create-group") {
        const name = (root.querySelector("#wa-group-name") || {}).value.trim();
        const ids = Array.from(root.querySelectorAll("#wa-group-contacts input:checked")).map(i => Number(i.value));
        if (!name) { toast("Enter a group subject."); return; }
        const members = ids.map(id => byId(id)).filter(Boolean).map(c => c.name);
        const newId = Math.max.apply(null, chats.map(c => c.id)) + 1;
        const chat = {id:newId,name,initials:name.split(/\s+/).slice(0,2).map(p => p[0]).join("").toUpperCase(),avatar:Math.floor(Math.random()*12)+1,type:"group",time:"Now",preview:"Group created",outgoing:false,unread:0,favorite:false,participants:["You"].concat(members),about:"",messages:[msg("them","This group was created in the frontend preview.","Now","TODAY","You")]};
        chats.unshift(chat); closeDialog(); selectChat(chat.id); toast("Demo group created.");
      } else if (target.dataset.dialogAction === "create-community") {
        const name = (root.querySelector("#wa-community-name") || {}).value.trim();
        if (!name) { toast("Enter a community name."); return; }
        closeDialog(); toast("Demo community '" + name + "' created.");
      } else if (target.dataset.dialogAction === "save-profile") {
        const name = (root.querySelector("#wa-edit-name") || {}).value.trim();
        const about = (root.querySelector("#wa-edit-about") || {}).value.trim();
        const phone = (root.querySelector("#wa-edit-phone") || {}).value.trim();
        if (name) profile.name = name;
        profile.about = about || "Available";
        profile.phone = phone || profile.phone;
        closeDialog(); renderProfile(); toast("Profile updated in this preview.");
      } else if (target.dataset.dialogAction === "bulk-selection") {
        const selected = root.querySelectorAll("#wa-dialog-slot input[type=checkbox]:checked").length;
        closeDialog(); toast(selected + " chat(s) selected in preview.");
      }
      return;
    }
    if (target.dataset.settingToggle) {
      const on = target.getAttribute("aria-pressed") !== "true";
      target.setAttribute("aria-pressed", on ? "true" : "false");
      target.classList.toggle("on", on);
      toast(target.dataset.settingToggle + (on ? " enabled" : " disabled") + " in preview.");
      return;
    }
    if (target.dataset.settingTab) {
      settingsTab = target.dataset.settingTab; renderSettings(); updateMobile(); return;
    }
    if (target.dataset.filter) {
      activeFilter = target.dataset.filter; archivedMode = false; currentView = "chats"; selectedId = null; renderList(); renderSection(); return;
    }
    if (target.dataset.view) {
      goView(target.dataset.view); return;
    }
    if (target.dataset.chatPick) { selectChat(target.dataset.chatPick); return; }
    if (target.dataset.chatId && target.dataset.action !== "row-menu") { selectChat(target.dataset.chatId); return; }
    if (target.dataset.statusName) { toast("Status viewer preview: " + target.dataset.statusName); return; }
    if (target.dataset.action) {
      const action = target.dataset.action;
      if (action === "new-chat") { newChatDialog(); return; }
      if (action === "new-group") { newGroupDialog(); return; }
      if (action === "new-community") { newCommunityDialog(); return; }
      if (action === "profile") { currentView = "profile"; renderSection(); return; }
      if (action === "settings") { settingsTab = "account"; currentView = "settings"; settingsSearch = ""; renderSection(); return; }
      if (action === "close-dialog") { closeDialog(); return; }
      if (action === "list-menu" || action === "row-menu" || action === "chat-menu" || action === "call-menu" || action === "attachment" || action === "emoji" || action === "lists-menu" || action === "search-filters" || action === "pinned-menu") { openActionMenu(target, action); return; }
      if (action === "chat-info") { currentView = "info"; renderSection(); return; }
      if (action === "back-to-list") { currentView = "chats"; selectedId = null; archivedMode = false; closeDialog(); renderList(); renderSection(); return; }
      if (action === "back-to-chat") { currentView = "chats"; renderSection(); return; }
      if (action === "edit-profile") { editProfileDialog(); return; }
      if (action === "mute-chat" || action === "disappearing" || action === "block-chat" || action === "info-call" || action === "info-video" || action === "shared-media" || action === "add-participants") { handleMenuAction(action, selectedChat()); return; }
      if (action === "call-menu") { openActionMenu(target, action); return; }
      if (action === "chat-search") { toast("Search in this chat is a UI preview."); return; }
      if (action === "camera" || action === "new-status" || action === "status-preview" || action === "new-call" || action === "call-entry" || action === "channel-discover" || action === "follow-channel" || action === "accounts-center" || action === "help" || action === "logout" || action === "attachment-preview" || action === "new-list" || action === "manage-lists" || action === "search-media" || action === "search-all" || action === "toggle-unread" || action === "toggle-favorite" || action === "toggle-pin" || action === "toggle-mute" || action === "toggle-archive" || action === "select-messages" || action === "pinned-preview" || action === "lock-chat" || action === "report-chat" || action === "clear-chat" || action === "delete-chat" || action === "voice-call" || action === "video-call") { handleMenuAction(action, byId(target.dataset.chatId) || selectedChat()); return; }
      toast("This control is included as a visual preview.");
    }
  });
  root.addEventListener("submit", event => {
    const form = event.target.closest("form");
    if (!form) return;
    if (form.dataset.form === "send-message") {
      event.preventDefault();
      const chat = selectedChat();
      const input = root.querySelector("#wa-message-input");
      const text = (input && input.value || "").trim();
      if (!chat || !text) return;
      chat.messages.push(msg("me", text, new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}), "TODAY"));
      chat.preview = text; chat.time = "Now"; chat.outgoing = true;
      input.value = ""; renderList(); renderSection();
      const scroller = root.querySelector("#wa-message-scroll"); if (scroller) scroller.scrollTop = scroller.scrollHeight;
      toast("Message added to this local preview only.");
    }
  });
  root.addEventListener("input", event => {
    if (event.target.id === "wa-search") renderList();
    if (event.target.id === "wa-settings-search") { settingsSearch = event.target.value; const pos = event.target.selectionStart; renderSettings(); const replacement = root.querySelector("#wa-settings-search"); if(replacement){replacement.focus();replacement.setSelectionRange(pos,pos);} }
    if (event.target.id === "wa-contact-search") {
      const q = event.target.value.toLowerCase();
      root.querySelectorAll("#wa-contact-list [data-chat-pick]").forEach(row => row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none");
    }
    if (event.target.id === "wa-group-search") {
      const q = event.target.value.toLowerCase();
      root.querySelectorAll("#wa-group-contacts .wa-pick-row").forEach(row => row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none");
    }
    if (event.target.id === "wa-message-input") {
      event.target.style.height = "auto";
      event.target.style.height = Math.min(event.target.scrollHeight, 106) + "px";
      const send = root.querySelector(".wa-send"); if (send) send.innerHTML = ic(event.target.value.trim() ? "send" : "mic");
    }
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenu();
      if (dialogSlot.innerHTML) closeDialog();
      else if (currentView === "info") { currentView = "chats"; renderSection(); }
      else if (selectedId !== null && isMobile()) { currentView = "chats"; selectedId = null; renderList(); renderSection(); }
    }
    if ((event.target.matches(".wa-chat-row") || event.target.matches("[data-chat-pick]")) && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const id = event.target.dataset.chatId || event.target.dataset.chatPick;
      if (id) selectChat(id);
    }
    if (event.target.id === "wa-message-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.target.closest("form"); if (form) form.requestSubmit();
    }
  });
  document.addEventListener("click", event => {
    if (!root.contains(event.target)) { closeMenu(); return; }
    const menu = root.querySelector("#wa-active-menu");
    if (menu && !menu.contains(event.target) && !event.target.closest("[data-action]")) closeMenu();
  });
  window.addEventListener("resize", updateMobile);
  renderList(); renderSection();
})();