(() => {
  "use strict";

  const chats = [
    { id: 1, name: "Ayesha Khan", initials: "AK", avatar: 1, time: "12:48 PM", preview: "That sounds great! 😊", outgoing: true, unread: 0, favorite: true, group: false, pinned: true },
    { id: 2, name: "Family Group", initials: "FG", avatar: 2, time: "12:41 PM", preview: "Ammi: Everyone be home by 6", outgoing: false, unread: 3, favorite: true, group: true },
    { id: 3, name: "Hassan Raza", initials: "HR", avatar: 3, time: "12:25 PM", preview: "😂😂😂", outgoing: false, unread: 1, favorite: true, group: false },
    { id: 4, name: "School Friends", initials: "SF", avatar: 4, time: "11:52 AM", preview: "Zain: Send the notes when you can", outgoing: false, unread: 8, favorite: false, group: true },
    { id: 5, name: "Mom", initials: "M", avatar: 5, time: "11:30 AM", preview: "Okay, I'll be there soon.", outgoing: true, unread: 0, favorite: true, group: false },
    { id: 6, name: "Dad", initials: "D", avatar: 6, time: "10:58 AM", preview: "Call me when you're free", outgoing: false, unread: 1, favorite: true, group: false },
    { id: 7, name: "Ali Raza", initials: "AR", avatar: 7, time: "10:31 AM", preview: "See you tomorrow!", outgoing: true, unread: 0, favorite: true, group: false, pinned: true },
    { id: 8, name: "Study Group", initials: "SG", avatar: 8, time: "Yesterday", preview: "Mina: Did anyone finish the worksheet?", outgoing: false, unread: 4, favorite: false, group: true },
    { id: 9, name: "Sara Ahmed", initials: "SA", avatar: 9, time: "Yesterday", preview: "Good morning ☀️", outgoing: true, unread: 0, favorite: false, group: false },
    { id: 10, name: "Cousins Group", initials: "CG", avatar: 10, time: "Yesterday", preview: "Hira: Shared a photo", outgoing: false, unread: 2, favorite: true, group: true, muted: true },
    { id: 11, name: "Hamza", initials: "H", avatar: 11, time: "Yesterday", preview: "Voice message", outgoing: false, unread: 0, favorite: false, group: false },
    { id: 12, name: "Work Group", initials: "WG", avatar: 12, time: "Tuesday", preview: "Meeting moved to 3:30 PM", outgoing: false, unread: 6, favorite: false, group: true },
    { id: 13, name: "Noor Fatima", initials: "NF", avatar: 2, time: "Monday", preview: "Sure, no problem!", outgoing: true, unread: 0, favorite: false, group: false },
    { id: 14, name: "Project Group", initials: "PG", avatar: 3, time: "Monday", preview: "You: Let's do it 👍", outgoing: false, unread: 2, favorite: false, group: true },
    { id: 15, name: "Zainab", initials: "Z", avatar: 5, time: "Sunday", preview: "Thank you ❤️", outgoing: true, unread: 0, favorite: true, group: false }
  ];

  const list = document.getElementById("chat-list");
  const filters = Array.from(document.querySelectorAll("[data-filter]"));
  let activeFilter = "all";

  const svg = (symbol, className = "") => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (className) icon.setAttribute("class", className);
    icon.setAttribute("viewBox", "0 0 24 24");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + symbol);
    icon.appendChild(use);
    return icon;
  };

  function makeChatRow(chat) {
    const row = document.createElement("div");
    row.className = "chat-row";
    row.setAttribute("role", "listitem");
    row.dataset.chatId = String(chat.id);

    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-" + chat.avatar;
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = chat.initials;

    const copy = document.createElement("div");
    copy.className = "chat-copy";

    const top = document.createElement("div");
    top.className = "chat-line";

    const name = document.createElement("span");
    name.className = "chat-name";
    name.textContent = chat.name;

    const time = document.createElement("span");
    time.className = "chat-time" + (chat.unread > 0 ? " unread-time" : "");
    time.textContent = chat.time;

    top.append(name, time);

    const bottom = document.createElement("div");
    bottom.className = "chat-line";

    const preview = document.createElement("div");
    preview.className = "chat-preview";
    if (chat.outgoing) {
      const checks = document.createElement("span");
      checks.className = "preview-check";
      checks.appendChild(svg("i-checks"));
      preview.appendChild(checks);
    }
    const message = document.createElement("span");
    message.className = "preview-text";
    message.textContent = chat.preview;
    preview.appendChild(message);

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    if (chat.pinned) {
      const pin = document.createElement("span");
      pin.className = "meta-icon";
      pin.title = "Pinned";
      pin.appendChild(svg("i-pin"));
      meta.appendChild(pin);
    }
    if (chat.muted) {
      const muted = document.createElement("span");
      muted.className = "meta-icon";
      muted.title = "Muted";
      muted.appendChild(svg("i-mute"));
      meta.appendChild(muted);
    }
    if (chat.unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = String(chat.unread);
      meta.appendChild(badge);
    }

    bottom.append(preview, meta);
    copy.append(top, bottom);
    row.append(avatar, copy);
    return row;
  }

  function filteredChats() {
    switch (activeFilter) {
      case "unread": return chats.filter(chat => chat.unread > 0);
      case "favorites": return chats.filter(chat => chat.favorite);
      case "groups": return chats.filter(chat => chat.group);
      default: return chats;
    }
  }

  function renderChats() {
    const visibleChats = filteredChats();
    const fragment = document.createDocumentFragment();
    if (visibleChats.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-filter";
      empty.textContent = "No chats in this list yet.";
      fragment.appendChild(empty);
    } else {
      visibleChats.forEach(chat => fragment.appendChild(makeChatRow(chat)));
    }
    list.replaceChildren(fragment);
    list.setAttribute("aria-label", activeFilter === "all" ? "All conversations" : activeFilter + " conversations");
  }

  filters.forEach(button => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      filters.forEach(filterButton => {
        const selected = filterButton === button;
        filterButton.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      renderChats();
    });
  });

  renderChats();
})();