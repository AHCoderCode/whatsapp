(() => {
  "use strict";
  const BUCKET = "master-chat-attachments";
  const bridge = () => window.waAppBridge;
  const db = () => bridge()?.supabase;
  const me = () => bridge()?.getCurrentUser?.();
  const state = () => bridge()?.getState?.();
  const esc = value => bridge()?.escapeHTML ? bridge().escapeHTML(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const say = message => bridge()?.toast?.(message);
  const open = (title, body, footer) => bridge()?.openDialog?.(title, body, footer);
  const close = () => bridge()?.closeDialog?.();
  const refresh = async () => { try { await window.waBackend?.load?.(); } catch (error) { console.warn("[feature-gaps] refresh failed", error); } };
  const signedUrl = async path => {
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data?.signedUrl || "";
  };
  const safeFileName = name => String(name || "media").replace(/[\\\/:*?"<>|#%{}^]/g, "_").replace(/\s+/g, "_").slice(0, 150) || "media";
  const extension = file => {
    const match = safeFileName(file?.name || "").match(/\.([a-z0-9]{1,8})$/i);
    if (match) return match[1].toLowerCase();
    const map = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif", "video/mp4":"mp4", "video/webm":"webm", "video/quicktime":"mov" };
    return map[String(file?.type || "").toLowerCase()] || "bin";
  };
  const allowedMedia = file => {
    const mime = String(file?.type || "").toLowerCase();
    return (mime.startsWith("image/") || mime.startsWith("video/")) && file.size > 0 && file.size <= 15 * 1024 * 1024;
  };
  const ready = () => !!(me()?.isSupabase && db());
  const mediaHTML = (url, mime, name) => {
    if (!url) return "";
    if (String(mime || "").startsWith("video/")) return "<video class='wa-feature-media' controls playsinline preload='metadata' src='" + esc(url) + "' aria-label='" + esc(name || "Video") + "'></video>";
    return "<a class='wa-feature-media-link' href='" + esc(url) + "' target='_blank' rel='noopener'><img class='wa-feature-media' src='" + esc(url) + "' alt='" + esc(name || "Image") + "' loading='lazy'></a>";
  };
  async function uploadMedia(path, file) {
    const { error } = await db().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (error) throw error;
  }

  async function composeStatus() {
    if (!ready()) return;
    open("New status",
      "<div class='wa-gap-form'><div class='dialog-field'><label for='wa-status-caption'>Caption</label><textarea id='wa-status-caption' maxlength='700' rows='3' placeholder='Write a status (optional when media is selected)'></textarea></div>" +
      "<div class='dialog-field'><label for='wa-status-media'>Photo or video (optional)</label><input id='wa-status-media' type='file' accept='image/*,video/*'><small class='field-hint'>One image or video, up to 15 MB. Statuses expire after 24 hours.</small></div><div id='wa-status-media-preview' class='wa-gap-media-preview'></div></div>",
      "<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='wa-publish-status'>Share status</button>");
    const input = document.querySelector("#wa-status-media");
    input?.addEventListener("change", () => {
      const file = input.files?.[0], box = document.querySelector("#wa-status-media-preview");
      if (!box) return;
      if (!file) { box.textContent = ""; return; }
      if (!allowedMedia(file)) { box.textContent = "Choose an image or video no larger than 15 MB."; return; }
      const url = URL.createObjectURL(file);
      box.innerHTML = file.type.startsWith("video/")
        ? "<video class='wa-feature-media' controls playsinline src='" + esc(url) + "'></video>"
        : "<img class='wa-feature-media' src='" + esc(url) + "' alt='Status preview'>";
    });
  }

  async function publishStatus() {
    const user = me(), file = document.querySelector("#wa-status-media")?.files?.[0] || null;
    const caption = String(document.querySelector("#wa-status-caption")?.value || "").trim().slice(0, 700);
    if (!user?.isSupabase) return;
    if (!caption && !file) return say("Add a caption or choose a photo/video.");
    if (file && !allowedMedia(file)) return say("Choose an image or video no larger than 15 MB.");
    const type = file ? (file.type.startsWith("video/") ? "video" : "image") : "text";
    const row = { user_id: user.id, text: caption || (type === "video" ? "Video status" : "Photo status"),
      content_type: type, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
    let path = "";
    try {
      if (file) {
        path = "statuses/" + user.id + "/" + crypto.randomUUID() + "." + extension(file);
        await uploadMedia(path, file);
        Object.assign(row, { media_path: path, media_mime: file.type, media_name: safeFileName(file.name), media_size: file.size });
      }
      const { error } = await db().from("whatsapp_statuses").insert(row);
      if (error) throw error;
      close(); await refresh(); bridge()?.setView?.("updates"); say("Status shared. It expires after 24 hours.");
    } catch (error) {
      if (path) try { await db().storage.from(BUCKET).remove([path]); } catch (_) {}
      say("Could not share this status: " + String(error?.message || "Check your connection and try again."));
    }
  }

  async function viewStatus(statusId) {
    if (!ready()) return;
    try {
      const { data, error } = await db().from("whatsapp_statuses")
        .select("id,user_id,text,created_at,expires_at,content_type,media_path,media_mime,media_name")
        .eq("id", statusId).maybeSingle();
      if (error) throw error;
      if (!data) return say("This status has expired or is no longer available.");
      const own = data.user_id === me().id;
      const profile = (state()?.backendStatuses || []).find(row => String(row.id) === String(statusId));
      const media = data.media_path ? mediaHTML(await signedUrl(data.media_path), data.media_mime, data.media_name) : "";
      const date = new Date(data.created_at);
      const content = (media ? "<div class='wa-gap-status-media'>" + media + "</div>" : "") +
        (data.text && !["Photo status","Video status"].includes(data.text) ? "<p class='wa-gap-caption'>" + esc(data.text) + "</p>" : "");
      open((profile?.name || "Status update") + (profile?.username ? " · @" + profile.username : ""),
        "<div class='wa-gap-status-view'><small>" + esc(Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleString()) + "</small>" +
        (content || "<p>" + esc(data.text || "Status update") + "</p>") + "</div>",
        "<button class='secondary-button' data-action='close-dialog'>Close</button>" +
        (own ? "<button class='danger-button' data-dialog-action='wa-delete-status' data-status-id='" + esc(data.id) + "'>Delete status</button>" : ""));
    } catch (error) { say("Could not open this status: " + String(error?.message || "Try again.")); }
  }

  async function deleteStatus(statusId) {
    const user = me();
    if (!user?.isSupabase) return;
    try {
      const { data, error } = await db().from("whatsapp_statuses").select("id,media_path").eq("id", statusId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This status is no longer available.");
      const removed = await db().from("whatsapp_statuses").delete().eq("id", statusId).eq("user_id", user.id);
      if (removed.error) throw removed.error;
      if (data.media_path) {
        const storageResult = await db().storage.from(BUCKET).remove([data.media_path]);
        if (storageResult.error) console.warn("[feature-gaps] status media cleanup failed", storageResult.error);
      }
      close(); await refresh(); say("Status deleted.");
    } catch (error) { say("Could not delete this status: " + String(error?.message || "Try again.")); }
  }

  async function openChannel(channelId) {
    if (!ready()) return;
    try {
      const { data: channel, error: channelError } = await db().from("whatsapp_channels").select("id,name,description,created_by").eq("id", channelId).maybeSingle();
      if (channelError) throw channelError;
      if (!channel) return say("This channel is no longer available.");
      const { data: posts, error } = await db().from("whatsapp_channel_posts")
        .select("id,channel_id,author_id,body,created_at,content_type,media_path,media_mime,media_name")
        .eq("channel_id", channelId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const items = await Promise.all((posts || []).map(async post => {
        const url = post.media_path ? await signedUrl(post.media_path) : "";
        const date = new Date(post.created_at);
        return "<article class='wa-channel-post'><header><strong>" + (post.author_id === me().id ? "You" : "Channel owner") +
          "</strong><small>" + esc(Number.isNaN(date.getTime()) ? "" : date.toLocaleString()) + "</small></header>" +
          (url ? mediaHTML(url, post.media_mime, post.media_name) : "") + "<p>" + esc(post.body || "") + "</p>" +
          (post.author_id === me().id || channel.created_by === me().id
            ? "<button class='text-danger-button' data-action='wa-delete-channel-post' data-post-id='" + esc(post.id) + "'>Delete post</button>" : "") +
          "</article>";
      }));
      const owner = channel.created_by === me().id;
      open(channel.name, "<div class='wa-channel-detail'><p>" + esc(channel.description || "No description") +
        "</p><div class='wa-channel-feed'>" + (items.join("") || "<div class='empty-state'>No posts yet.</div>") + "</div></div>",
        "<button class='secondary-button' data-action='close-dialog'>Close</button>" +
        (owner ? "<button class='primary-button' data-action='wa-new-channel-post' data-channel-id='" + esc(channel.id) + "'>Publish update</button>" : ""));
    } catch (error) { say("Could not load channel: " + String(error?.message || "Try again.")); }
  }

  function composeChannelPost(channelId) {
    open("Publish channel update",
      "<div class='wa-gap-form'><div class='dialog-field'><label for='wa-channel-caption'>Caption</label><textarea id='wa-channel-caption' maxlength='2000' rows='4' placeholder='Write an update or add a photo/video'></textarea></div>" +
      "<div class='dialog-field'><label for='wa-channel-media'>Photo or video (optional)</label><input id='wa-channel-media' type='file' accept='image/*,video/*'><small class='field-hint'>One image or video, up to 15 MB.</small></div><div id='wa-channel-media-preview' class='wa-gap-media-preview'></div></div>",
      "<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-dialog-action='wa-publish-channel-post' data-channel-id='" + esc(channelId) + "'>Publish</button>");
    const input = document.querySelector("#wa-channel-media");
    input?.addEventListener("change", () => {
      const file = input.files?.[0], box = document.querySelector("#wa-channel-media-preview");
      if (!box) return;
      if (!file) { box.textContent = ""; return; }
      if (!allowedMedia(file)) { box.textContent = "Choose an image or video no larger than 15 MB."; return; }
      const url = URL.createObjectURL(file);
      box.innerHTML = file.type.startsWith("video/")
        ? "<video class='wa-feature-media' controls playsinline src='" + esc(url) + "'></video>"
        : "<img class='wa-feature-media' src='" + esc(url) + "' alt='Post preview'>";
    });
  }

  async function publishChannelPost(channelId) {
    const user = me(), file = document.querySelector("#wa-channel-media")?.files?.[0] || null;
    const caption = String(document.querySelector("#wa-channel-caption")?.value || "").trim().slice(0, 2000);
    if (!user?.isSupabase) return;
    if (!caption && !file) return say("Write an update or choose a photo/video.");
    if (file && !allowedMedia(file)) return say("Choose an image or video no larger than 15 MB.");
    let path = "";
    try {
      const { data: channel, error: channelError } = await db().from("whatsapp_channels").select("id,created_by").eq("id", channelId).maybeSingle();
      if (channelError) throw channelError;
      if (!channel || channel.created_by !== user.id) throw new Error("Only the channel owner can publish updates.");
      const type = file ? (file.type.startsWith("video/") ? "video" : "image") : "text";
      const row = { channel_id: channelId, author_id: user.id,
        body: caption || (type === "video" ? "Video update" : "Photo update"), content_type: type };
      if (file) {
        path = "channels/" + channelId + "/" + user.id + "/" + crypto.randomUUID() + "." + extension(file);
        await uploadMedia(path, file);
        Object.assign(row, { media_path: path, media_mime: file.type, media_name: safeFileName(file.name), media_size: file.size });
      }
      const { error } = await db().from("whatsapp_channel_posts").insert(row);
      if (error) throw error;
      close(); await openChannel(channelId); say("Channel update published.");
    } catch (error) {
      if (path) try { await db().storage.from(BUCKET).remove([path]); } catch (_) {}
      say("Could not publish the update: " + String(error?.message || "Try again."));
    }
  }

  async function deleteChannelPost(postId) {
    const user = me();
    if (!user?.isSupabase) return;
    try {
      const { data, error } = await db().from("whatsapp_channel_posts").select("id,channel_id,author_id,media_path").eq("id", postId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This post is no longer available.");
      const { data: channel, error: channelError } = await db().from("whatsapp_channels").select("created_by").eq("id", data.channel_id).maybeSingle();
      if (channelError) throw channelError;
      if (data.author_id !== user.id && channel?.created_by !== user.id) throw new Error("Only the author or channel owner can delete this post.");
      const removed = await db().from("whatsapp_channel_posts").delete().eq("id", postId);
      if (removed.error) throw removed.error;
      if (data.media_path) {
        const storageResult = await db().storage.from(BUCKET).remove([data.media_path]);
        if (storageResult.error) console.warn("[feature-gaps] channel media cleanup failed", storageResult.error);
      }
      await openChannel(data.channel_id); say("Channel update deleted.");
    } catch (error) { say("Could not delete this update: " + String(error?.message || "Try again.")); }
  }

  async function openCommunity(communityId) {
    const user = me();
    if (!user?.isSupabase) return;
    try {
      const { data: community, error } = await db().from("whatsapp_communities").select("id,name,description,created_by").eq("id", communityId).maybeSingle();
      if (error) throw error;
      if (!community) return say("This community is no longer available.");
      const { data: membership, error: membershipError } = await db().from("whatsapp_community_members")
        .select("role").eq("community_id", communityId).eq("user_id", user.id).maybeSingle();
      if (membershipError) throw membershipError;
      const isMember = !!membership;
      let links = [];
      if (isMember) {
        const linked = await db().from("whatsapp_community_groups").select("id,group_id,title,created_by")
          .eq("community_id", communityId).order("created_at", { ascending: true });
        if (linked.error) throw linked.error;
        links = linked.data || [];
      }
      const currentState = state();
      const groups = new Map((currentState?.chats || []).filter(chat => chat.type === "group").map(chat => [String(chat.id), chat]));
      const owner = community.created_by === user.id;
      const linkedHTML = links.map(item => {
        const group = groups.get(String(item.group_id));
        return "<div class='wa-community-subgroup-row'><span><strong>" + esc(item.title) + "</strong><small>" +
          (group ? esc(group.memberCount + " members · " + (group.groupRole === "admin" ? "Admin" : "Member")) : "Linked group · join to open") +
          "</small></span>" +
          (group ? "<span class='setting-side-label'>Joined</span>" :
            "<button class='primary-button' data-action='wa-join-community-subgroup' data-group-id='" + esc(item.group_id) + "'>Join group</button>") +
          (owner ? "<button class='text-danger-button' data-action='wa-unlink-community-subgroup' data-link-id='" + esc(item.id) + "'>Unlink</button>" : "") +
          "</div>";
      }).join("");
      const myGroups = (currentState?.chats || []).filter(chat => chat.type === "group" && chat.groupRole === "admin");
      const addControl = owner
        ? "<div class='wa-community-add-subgroup'><label for='wa-community-group'>Link an existing group you administer</label><select id='wa-community-group'>" +
          "<option value=''>Choose group</option>" + myGroups.map(group => "<option value='" + esc(group.id) + "'>" + esc(group.name) + "</option>").join("") +
          "</select><input id='wa-community-group-title' maxlength='60' placeholder='Subgroup title (optional)'>" +
          "<button class='primary-button' data-dialog-action='wa-link-community-subgroup' data-community-id='" + esc(communityId) + "' " + (myGroups.length ? "" : "disabled") + ">Link group</button></div>" : "";
      const footer = "<button class='secondary-button' data-action='close-dialog'>Close</button>" +
        (!isMember ? "<button class='primary-button' data-dialog-action='join-community' data-community-id='" + esc(communityId) + "'>Join community</button>" :
          "<button class='secondary-button' data-dialog-action='leave-community' data-community-id='" + esc(communityId) + "'>Leave community</button>");
      open(community.name, "<div class='wa-community-detail'><p>" + esc(community.description || "No description yet.") + "</p>" +
        "<p class='screen-description'>" + (isMember ? "Linked subgroups" : "Join this community to see and join its subgroups.") + "</p>" +
        (isMember ? (linkedHTML || "<div class='empty-state'>No subgroups linked yet.</div>") + addControl : "") + "</div>", footer);
    } catch (error) { say("Could not load community: " + String(error?.message || "Try again.")); }
  }

  async function linkCommunityGroup(communityId) {
    const user = me(), groupId = String(document.querySelector("#wa-community-group")?.value || "");
    const title = String(document.querySelector("#wa-community-group-title")?.value || "").trim().slice(0, 60);
    if (!user?.isSupabase || !groupId) return say("Choose a group to link.");
    const group = (state()?.chats || []).find(chat => chat.type === "group" && String(chat.id) === groupId);
    if (!group || group.groupRole !== "admin") return say("You must administer the group to link it.");
    try {
      const { error } = await db().from("whatsapp_community_groups").insert({
        community_id: communityId, group_id: groupId, title: title || group.name, created_by: user.id
      });
      if (error) throw error;
      await openCommunity(communityId); say("Group linked to the community.");
    } catch (error) { say("Could not link this group: " + String(error?.message || "Try again.")); }
  }

  async function joinCommunitySubgroup(groupId) {
    const user = me();
    if (!user?.isSupabase) return;
    try {
      const { error } = await db().from("aeroshell_group_members").insert({ group_id: groupId, user_id: user.id, role: "member", added_by: user.id });
      if (error && error.code !== "23505") throw error;
      close(); await refresh(); say("Joined the subgroup.");
    } catch (error) { say("Could not join this subgroup: " + String(error?.message || "You may need to join its community first.")); }
  }

  async function unlinkCommunityGroup(linkId) {
    if (!me()?.isSupabase) return;
    try {
      const { error } = await db().from("whatsapp_community_groups").delete().eq("id", linkId);
      if (error) throw error;
      close(); await refresh(); say("Subgroup unlinked.");
    } catch (error) { say("Could not unlink this subgroup: " + String(error?.message || "Try again.")); }
  }

  async function setDisappearing(chat, seconds) {
    const user = me();
    if (!user?.isSupabase || !chat) return;
    const isGroup = chat.type === "group";
    const row = { disappearing_seconds: Number(seconds), changed_by: user.id, updated_at: new Date().toISOString() };
    if (isGroup) row.group_id = chat.groupId || chat.id;
    else {
      const ids = [String(user.id), String(chat.id)].sort();
      row.direct_user_low = ids[0]; row.direct_user_high = ids[1];
    }
    try {
      let query = db().from("whatsapp_disappearing_settings").select("id");
      query = isGroup ? query.eq("group_id", row.group_id) : query.eq("direct_user_low", row.direct_user_low).eq("direct_user_high", row.direct_user_high);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      const result = data?.id
        ? await db().from("whatsapp_disappearing_settings").update(row).eq("id", data.id)
        : await db().from("whatsapp_disappearing_settings").insert(row);
      if (result.error) throw result.error;
      close(); await refresh();
      const label = Number(seconds) === 0 ? "off" : Number(seconds) === 86400 ? "24 hours" : Number(seconds) === 604800 ? "7 days" : "90 days";
      say("Disappearing messages set to " + label + ". New messages will expire automatically.");
    } catch (error) { say("Could not update disappearing messages: " + String(error?.message || "Try again.")); }
  }

  async function openDisappearing(chat) {
    if (!ready() || !chat) return;
    const user = me(), isGroup = chat.type === "group";
    let query = db().from("whatsapp_disappearing_settings").select("disappearing_seconds");
    if (isGroup) query = query.eq("group_id", chat.groupId || chat.id);
    else {
      const ids = [String(user.id), String(chat.id)].sort();
      query = query.eq("direct_user_low", ids[0]).eq("direct_user_high", ids[1]);
    }
    try {
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      const selected = Number(data?.disappearing_seconds || 0);
      const options = [[0,"Off"],[86400,"24 hours"],[604800,"7 days"],[7776000,"90 days"]];
      open("Disappearing messages",
        "<p class='screen-description'>This setting applies to new messages in this conversation. Expired messages are hidden by the server.</p><div class='section-card'>" +
        options.map(([seconds,label]) => "<button class='setting-row " + (selected === seconds ? "active" : "") + "' data-dialog-action='wa-set-disappearing' data-seconds='" + seconds + "'><span class='setting-copy'><strong>" + label + "</strong></span>" +
          (selected === seconds ? "<span class='setting-side-label'>Selected</span>" : "") + "</button>").join("") + "</div>",
        "<button class='secondary-button' data-action='close-dialog'>Close</button>");
    } catch (error) { say("Could not load this setting: " + String(error?.message || "Try again.")); }
  }

  async function privacyAction(action, chat) {
    const user = me();
    if (!user?.isSupabase || !chat) return;
    if (action === "disappearing") { await openDisappearing(chat); return; }
    if (action === "block-chat") {
      if (chat.type !== "person") return say("Blocking is currently available for individual contacts.");
      try {
        const { data, error } = await db().from("whatsapp_user_blocks").select("blocker_id")
          .eq("blocker_id", user.id).eq("blocked_id", chat.id).maybeSingle();
        if (error) throw error;
        const blocked = !!data;
        open(blocked ? "Unblock " + chat.name + "?" : "Block " + chat.name + "?",
          "<p class='screen-description'>" + (blocked
            ? "This will allow direct messages between both accounts again."
            : "This prevents direct message reads and sends between both accounts. Existing friend requests are not deleted.") + "</p>",
          "<button class='secondary-button' data-action='close-dialog'>Cancel</button>" +
          "<button class='danger-button' data-dialog-action='wa-confirm-block' data-user-id='" + esc(chat.id) + "' data-blocked='" + (blocked ? "true" : "false") + "'>" + (blocked ? "Unblock" : "Block") + "</button>");
      } catch (error) { say("Could not check block status: " + String(error?.message || "Try again.")); }
      return;
    }
    if (action === "report-chat") {
      const reported = chat.type === "person" ? chat.id : chat.createdBy;
      if (!reported) return say("This conversation has no reportable account owner.");
      open("Report " + (chat.type === "group" ? "group" : chat.name),
        "<div class='dialog-field'><label for='wa-report-reason'>Reason</label><select id='wa-report-reason'><option value='spam'>Spam</option><option value='harassment'>Harassment</option><option value='impersonation'>Impersonation</option><option value='inappropriate_content'>Inappropriate content</option><option value='other'>Other</option></select></div>" +
        "<div class='dialog-field'><label for='wa-report-details'>Details (optional)</label><textarea id='wa-report-details' maxlength='1000' rows='4' placeholder='Describe the issue'></textarea></div>" +
        "<p class='field-hint'>Your report is stored securely for review. This project does not yet have a moderation dashboard.</p>",
        "<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='danger-button' data-dialog-action='wa-submit-report' data-user-id='" + esc(reported) + "' data-chat-id='" + (chat.type === "group" ? esc(chat.id) : "") + "'>Submit report</button>");
    }
  }

  async function confirmBlock(button) {
    const user = me(), blockedId = String(button.dataset.userId || ""), wasBlocked = button.dataset.blocked === "true";
    if (!user?.isSupabase || !blockedId) return;
    try {
      const result = wasBlocked
        ? await db().from("whatsapp_user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId)
        : await db().from("whatsapp_user_blocks").insert({ blocker_id: user.id, blocked_id: blockedId });
      if (result.error) throw result.error;
      close(); await refresh(); say(wasBlocked ? "Contact unblocked." : "Contact blocked. Direct messages are now blocked by the server.");
    } catch (error) { say("Could not update blocking: " + String(error?.message || "Try again.")); }
  }

  async function submitReport(button) {
    const user = me(), reported = String(button.dataset.userId || "");
    if (!user?.isSupabase || !reported) return;
    try {
      const { error } = await db().from("whatsapp_user_reports").insert({
        reporter_id: user.id, reported_user_id: reported,
        chat_id: button.dataset.chatId || null,
        reason: String(document.querySelector("#wa-report-reason")?.value || "other"),
        details: String(document.querySelector("#wa-report-details")?.value || "").trim().slice(0,1000)
      });
      if (error) throw error;
      close(); say("Report submitted and stored for review.");
    } catch (error) { say("Could not submit the report: " + String(error?.message || "Try again.")); }
  }

  const localListNames = () => (state()?.customLists || []).map(item => ({
    id: String(item.id || ""), name: String(item.name || "").trim(),
    chatIds: Array.isArray(item.chatIds) ? item.chatIds.map(String) : []
  })).filter(item => item.name);
  let syncingLists = false;
  async function syncCustomLists(mode) {
    const user = me();
    if (!user?.isSupabase || !db() || syncingLists) return;
    syncingLists = true;
    try {
      const { data: currentRows, error } = await db().from("whatsapp_custom_chat_lists")
        .select("id,name,chat_ids,sort_order").eq("user_id", user.id).order("sort_order", { ascending: true });
      if (error) throw error;
      const current = currentRows || [], local = localListNames();
      const localByName = new Map(local.map(item => [item.name.toLowerCase(), item]));
      if (mode === "initial" && current.length === 0 && local.length) {
        for (let i = 0; i < local.length; i++) {
          const item = local[i];
          const created = await db().from("whatsapp_custom_chat_lists").insert({ user_id: user.id, name: item.name, chat_ids: item.chatIds, sort_order: i });
          if (created.error) throw created.error;
        }
      } else if (mode === "save") {
        for (const row of current) {
          const item = localByName.get(String(row.name).toLowerCase());
          if (!item) {
            const removed = await db().from("whatsapp_custom_chat_lists").delete().eq("id", row.id).eq("user_id", user.id);
            if (removed.error) throw removed.error;
          } else {
            const updated = await db().from("whatsapp_custom_chat_lists").update({
              name: item.name, chat_ids: item.chatIds,
              sort_order: local.findIndex(x => x.name.toLowerCase() === item.name.toLowerCase()),
              updated_at: new Date().toISOString()
            }).eq("id", row.id).eq("user_id", user.id);
            if (updated.error) throw updated.error;
          }
        }
        const names = new Set(current.map(row => String(row.name).toLowerCase()));
        for (let i = 0; i < local.length; i++) {
          const item = local[i];
          if (names.has(item.name.toLowerCase())) continue;
          const created = await db().from("whatsapp_custom_chat_lists").insert({ user_id: user.id, name: item.name, chat_ids: item.chatIds, sort_order: i });
          if (created.error) throw created.error;
        }
      }
      const refreshed = await db().from("whatsapp_custom_chat_lists")
        .select("id,name,chat_ids,sort_order").eq("user_id", user.id).order("sort_order", { ascending: true });
      if (refreshed.error) throw refreshed.error;
      const oldByName = new Map(local.map(item => [item.name.toLowerCase(), item.id]));
      const mapped = (refreshed.data || []).map(row => ({
        id: oldByName.get(String(row.name).toLowerCase()) || row.id,
        serverId: row.id, name: row.name,
        chatIds: Array.isArray(row.chat_ids) ? row.chat_ids.map(String) : []
      }));
      const currentState = state();
      if (currentState) currentState.customLists = mapped;
      bridge()?.saveState?.(); bridge()?.renderSidebar?.(); bridge()?.renderMain?.();
    } catch (error) {
      console.warn("[feature-gaps] custom-list sync failed", error);
      if (mode === "save") say("Your list was saved on this device, but could not sync to your account.");
    } finally { syncingLists = false; }
  }

  async function onBackendData() {
    await syncCustomLists("initial");
    await window.WhatsAppGroupCalls?.resume?.();
  }

  function handleActionEvent(event) {
    if (!ready()) return;
    const target = event.target?.closest?.("[data-action],[data-dialog-action],[data-community-id]");
    if (!target) return;
    const action = String(target.dataset.action || ""), dialogAction = String(target.dataset.dialogAction || "");

    if (action === "new-status") { event.preventDefault(); event.stopImmediatePropagation(); void composeStatus(); return; }
    if (action === "status-preview") { event.preventDefault(); event.stopImmediatePropagation(); void viewStatus(target.dataset.statusId); return; }
    if (dialogAction === "wa-publish-status") { event.preventDefault(); event.stopImmediatePropagation(); void publishStatus(); return; }
    if (dialogAction === "wa-delete-status") { event.preventDefault(); event.stopImmediatePropagation(); void deleteStatus(target.dataset.statusId); return; }
    if (action === "open-channel") { event.preventDefault(); event.stopImmediatePropagation(); void openChannel(target.dataset.channelId); return; }
    if (action === "new-channel-post" || action === "wa-new-channel-post") {
      event.preventDefault(); event.stopImmediatePropagation(); composeChannelPost(target.dataset.channelId); return;
    }
    if (dialogAction === "wa-publish-channel-post") { event.preventDefault(); event.stopImmediatePropagation(); void publishChannelPost(target.dataset.channelId); return; }
    if (action === "delete-channel-post" || action === "wa-delete-channel-post") {
      event.preventDefault(); event.stopImmediatePropagation(); void deleteChannelPost(target.dataset.postId); return;
    }
    if (target.dataset.communityId && !dialogAction) {
      event.preventDefault(); event.stopImmediatePropagation(); void openCommunity(target.dataset.communityId); return;
    }
    if (dialogAction === "wa-link-community-subgroup") { event.preventDefault(); event.stopImmediatePropagation(); void linkCommunityGroup(target.dataset.communityId); return; }
    if (action === "wa-join-community-subgroup") { event.preventDefault(); event.stopImmediatePropagation(); void joinCommunitySubgroup(target.dataset.groupId); return; }
    if (action === "wa-unlink-community-subgroup") { event.preventDefault(); event.stopImmediatePropagation(); void unlinkCommunityGroup(target.dataset.linkId); return; }
    if (dialogAction === "wa-set-disappearing") { event.preventDefault(); event.stopImmediatePropagation(); void setDisappearing(bridge().getCurrentChat(), target.dataset.seconds); return; }
    if (action === "disappearing" || action === "block-chat" || action === "report-chat") {
      const chat = (state()?.chats || []).find(row => String(row.id) === String(target.dataset.chatId)) || bridge().getCurrentChat();
      if (!chat) return;
      event.preventDefault(); event.stopImmediatePropagation(); void privacyAction(action, chat); return;
    }
    if (dialogAction === "wa-confirm-block") { event.preventDefault(); event.stopImmediatePropagation(); void confirmBlock(target); return; }
    if (dialogAction === "wa-submit-report") { event.preventDefault(); event.stopImmediatePropagation(); void submitReport(target); return; }
    if (dialogAction === "create-list" || dialogAction === "update-list") {
      queueMicrotask(() => setTimeout(() => void syncCustomLists("save"), 0)); return;
    }
    if (action === "remove-list") queueMicrotask(() => setTimeout(() => void syncCustomLists("save"), 0));
  }

  document.addEventListener("click", handleActionEvent, true);
  window.WhatsAppFeatureGaps = { onBackendData, syncCustomLists };
})();