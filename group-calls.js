(() => {
  "use strict";
  const bridge = () => window.waAppBridge;
  const db = () => bridge()?.supabase;
  const me = () => bridge()?.getCurrentUser?.();
  const state = () => bridge()?.getState?.();
  const toast = message => bridge()?.toast?.(message);
  const openDialog = (title, body, footer) => bridge()?.openDialog?.(title, body, footer);
  const closeDialog = () => bridge()?.closeDialog?.();
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  const esc = value => bridge()?.escapeHTML?.(String(value ?? "")) || String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const userName = () => String(me()?.name || me()?.username || "You");
  const groupName = groupId => (state()?.chats || []).find(chat => String(chat.id) === String(groupId))?.name || "Group";
  const memberName = userId => {
    const chat = (state()?.chats || []).find(row => row.type === "group" && (row.participants || []).some(p => String(p.id) === String(userId)));
    const person = chat?.participants?.find(p => String(p.id) === String(userId));
    return person?.name || person?.username || (String(userId) === String(me()?.id) ? userName() : "Member");
  };
  const maxParticipants = 8;

  let session = null;
  let inviteChannel = null;
  let inviteUserId = "";
  let scanRunning = false;
  let pendingPrompt = "";

  const errorText = error => String(error?.message || error?.details || error?.hint || "Unknown error");
  const stopStream = stream => { try { stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {} };
  const closePeer = pc => { try { pc?.close?.(); } catch (_) {} };

  async function getIceServers(groupCallId) {
    const { data, error } = await db().functions.invoke("whatsapp-group-turn-credentials", { body: { groupCallId } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (!Array.isArray(data?.iceServers) || !data.iceServers.length) throw new Error("The group-call relay did not return ICE servers.");
    return data.iceServers;
  }

  async function loadParticipants(groupCallId) {
    const { data, error } = await db().from("aeroshell_group_call_participants")
      .select("group_call_id,user_id,invited_by,status,created_at,responded_at")
      .eq("group_call_id", groupCallId);
    if (error) throw error;
    return data || [];
  }

  async function sendSignal(remoteId, kind, payload) {
    if (!session || !uuid(remoteId) || remoteId === me().id) return;
    const { error } = await db().from("aeroshell_group_call_signals").insert({
      group_call_id: session.id, from_user_id: me().id, to_user_id: remoteId, kind, payload
    });
    if (error) throw error;
  }

  function peerFor(remoteId) {
    return session?.peers.get(String(remoteId)) || null;
  }

  async function createPeer(remoteId) {
    const id = String(remoteId);
    if (!session || id === me().id) return null;
    let record = peerFor(id);
    if (record) return record;
    const pc = new RTCPeerConnection({
      iceServers: session.iceServers,
      iceTransportPolicy: "relay",
      iceCandidatePoolSize: 1
    });
    const remoteStream = new MediaStream();
    record = { pc, stream: remoteStream, pendingIce: [], offerSent: false };
    session.peers.set(id, record);
    session.localStream.getTracks().forEach(track => pc.addTrack(track, session.localStream));
    pc.ontrack = event => {
      const stream = event.streams?.[0];
      if (stream) record.stream = stream;
      else if (event.track && !record.stream.getTracks().some(t => t.id === event.track.id)) record.stream.addTrack(event.track);
      renderCall();
    };
    pc.onicecandidate = event => {
      if (!event.candidate || !session || session.id !== record.callId) return;
      void sendSignal(id, "ice", { candidate: event.candidate.toJSON() })
        .catch(error => console.warn("[group-calls] ICE signal failed:", errorText(error)));
    };
    pc.onconnectionstatechange = () => {
      if (!session || !session.peers.has(id)) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        console.warn("[group-calls] Peer connection state:", id, pc.connectionState);
        if (pc.connectionState === "failed") toast("A group participant could not connect. Check the relay and network, then retry.");
      }
      renderCall();
    };
    record.callId = session.id;
    return record;
  }

  async function flushIce(record) {
    if (!record?.pc.remoteDescription) return;
    const pending = record.pendingIce.splice(0);
    for (const candidate of pending) {
      try { await record.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn("[group-calls] Could not add queued ICE candidate:", errorText(error)); }
    }
  }

  async function handleSignal(row) {
    if (!session || !row || row.group_call_id !== session.id || row.to_user_id !== me().id) return;
    const record = await createPeer(row.from_user_id);
    if (!record) return;
    const pc = record.pc;
    try {
      if (row.kind === "offer") {
        const sdp = row.payload?.sdp;
        if (typeof sdp !== "string") return;
        if (pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
        }
        await pc.setRemoteDescription({ type: "offer", sdp });
        await flushIce(record);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(row.from_user_id, "answer", { sdp: pc.localDescription.sdp });
        renderCall();
      } else if (row.kind === "answer") {
        const sdp = row.payload?.sdp;
        if (typeof sdp === "string" && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription({ type: "answer", sdp });
          await flushIce(record);
          renderCall();
        }
      } else if (row.kind === "ice") {
        const candidate = row.payload?.candidate;
        if (!candidate) return;
        if (!pc.remoteDescription) record.pendingIce.push(candidate);
        else await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.warn("[group-calls] Signal handling failed:", errorText(error));
      toast("A group-call connection could not be negotiated.");
    }
  }

  async function negotiateAcceptedPeers() {
    if (!session) return;
    const rows = await loadParticipants(session.id);
    session.participants = rows;
    const accepted = rows.filter(row => row.status === "accepted").map(row => String(row.user_id));
    for (const remoteId of accepted) {
      if (remoteId === me().id) continue;
      const record = await createPeer(remoteId);
      if (!record || record.offerSent) continue;
      // Exactly one participant creates the offer for each mesh pair.
      if (me().id.localeCompare(remoteId) < 0) {
        record.offerSent = true;
        try {
          const offer = await record.pc.createOffer();
          await record.pc.setLocalDescription(offer);
          await sendSignal(remoteId, "offer", { sdp: record.pc.localDescription.sdp });
        } catch (error) {
          record.offerSent = false;
          console.warn("[group-calls] Offer creation failed:", errorText(error));
          toast("Could not start a connection to one group member.");
        }
      }
    }
    renderCall();
  }

  async function subscribeSession() {
    if (!session || session.channel) return;
    const id = session.id;
    const channel = db().channel("wa-group-call-" + id);
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "aeroshell_group_calls", filter: "id=eq." + id }, payload => {
        if (!session || session.id !== id) return;
        if (payload.new?.status === "ended") void cleanup("The group call has ended.", true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "aeroshell_group_call_participants", filter: "group_call_id=eq." + id }, payload => {
        if (!session || session.id !== id) return;
        if (payload.new?.user_id === me().id && payload.new?.status === "declined") {
          void cleanup("You declined the invitation.", true); return;
        }
        if (payload.new?.user_id === me().id && payload.new?.status === "left") {
          void cleanup("You left the group call.", true); return;
        }
        void negotiateAcceptedPeers().catch(error => console.warn("[group-calls] Participant refresh failed:", errorText(error)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "aeroshell_group_call_signals", filter: "group_call_id=eq." + id }, payload => {
        if (!session || session.id !== id || payload.new?.to_user_id !== me().id) return;
        void handleSignal(payload.new);
      });
    session.channel = channel;
    const status = await channel.subscribe();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") throw new Error("Realtime group-call signaling could not connect.");
  }

  function attachMedia() {
    if (!session) return;
    const ownVideo = document.querySelector("#wa-group-self");
    if (ownVideo && session.mediaType === "video") {
      ownVideo.srcObject = session.localStream;
      ownVideo.muted = true;
      void ownVideo.play().catch(() => {});
    }
    for (const [id, record] of session.peers) {
      const video = document.querySelector("#wa-group-remote-" + id);
      if (video) {
        video.srcObject = record.stream;
        if (session.mediaType !== "video") video.style.display = "none";
        void video.play().catch(() => {});
      }
      const audio = document.querySelector("#wa-group-audio-" + id);
      if (audio) {
        audio.srcObject = record.stream;
        void audio.play().catch(() => {});
      }
    }
  }

  function renderCall() {
    if (!session) return;
    const accepted = (session.participants || []).filter(row => row.status === "accepted");
    const invited = (session.participants || []).filter(row => row.status === "invited");
    const tiles = accepted.filter(row => String(row.user_id) !== me().id).map(row => {
      const id = String(row.user_id), name = memberName(id);
      const record = session.peers.get(id);
      const connected = record?.pc.connectionState === "connected";
      return "<div class='wa-group-call-tile'><div class='wa-group-call-name'>" + esc(name) +
        "<small>" + (connected ? "Connected" : esc(record?.pc.connectionState || "Connecting")) + "</small></div>" +
        (session.mediaType === "video" ? "<video id='wa-group-remote-" + esc(id) + "' autoplay playsinline></video>" : "<audio id='wa-group-audio-" + esc(id) + "' autoplay></audio>") +
        (session.mediaType === "audio" ? "<div class='wa-group-call-audio-avatar'>" + esc(name.slice(0,1).toUpperCase()) + "</div>" : "") +
        "</div>";
    }).join("");
    const selfTile = session.mediaType === "video"
      ? "<div class='wa-group-call-tile wa-group-call-self'><div class='wa-group-call-name'>You</div><video id='wa-group-self' autoplay playsinline muted></video></div>" : "";
    const buttons = "<div class='wa-group-call-controls'>" +
      "<button type='button' class='secondary-button' data-action='wa-group-toggle-mute'>" + (session.muted ? "Unmute" : "Mute") + "</button>" +
      (session.mediaType === "video" ? "<button type='button' class='secondary-button' data-action='wa-group-toggle-camera'>" + (session.cameraOff ? "Turn camera on" : "Turn camera off") + "</button>" : "") +
      "<button type='button' class='danger-button' data-action='wa-group-end'>Leave call</button></div>";
    const status = "<div class='wa-group-call-status'><strong>" + esc(accepted.length) + " joined</strong><span>" +
      esc(invited.length) + " invited · " + esc(groupName(session.groupId)) + "</span></div>";
    openDialog("Group " + (session.mediaType === "video" ? "video" : "voice") + " call",
      "<div class='wa-group-call-window'>" + status + "<div class='wa-group-call-grid'>" + selfTile +
      (tiles || "<div class='empty-state'>Waiting for another participant to join…</div>") + "</div></div>",
      buttons);
    requestAnimationFrame(attachMedia);
  }

  async function start(groupChat, mediaType) {
    const user = me();
    if (!user?.isSupabase || !db()) return toast("Sign in before starting a group call.");
    if (!groupChat || groupChat.type !== "group") return toast("Open a group conversation first.");
    if (session) return toast("Finish your current group call first.");
    if (window.WhatsAppCalls?.getPhase?.() && window.WhatsAppCalls.getPhase() !== "idle") return toast("Finish your current one-to-one call first.");
    const groupId = String(groupChat.groupId || groupChat.id);
    const type = mediaType === "video" ? "video" : "audio";
    let localStream = null, createdCallId = "";
    try {
      const { data: memberRows, error: memberError } = await db().from("aeroshell_group_members").select("user_id").eq("group_id", groupId);
      if (memberError) throw memberError;
      const memberIds = Array.from(new Set((memberRows || []).map(row => String(row.user_id))));
      if (!memberIds.includes(user.id)) throw new Error("You are no longer a member of this group.");
      if (memberIds.length < 2) throw new Error("Add at least one other member before starting a group call.");
      if (memberIds.length > maxParticipants) throw new Error("Group mesh calling currently supports up to " + maxParticipants + " participants, including you.");
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
      const { data: call, error: callError } = await db().from("aeroshell_group_calls")
        .insert({ group_id: groupId, initiator_id: user.id, media_type: type, status: "active" })
        .select("id,group_id,initiator_id,media_type,status,created_at").single();
      if (callError) throw callError;
      createdCallId = call.id;
      const participantRows = memberIds.map(userId => ({
        group_call_id: call.id, user_id: userId, invited_by: user.id,
        status: userId === user.id ? "accepted" : "invited",
        responded_at: userId === user.id ? new Date().toISOString() : null
      }));
      const { error: insertParticipantsError } = await db().from("aeroshell_group_call_participants").insert(participantRows);
      if (insertParticipantsError) throw insertParticipantsError;
      const { data: turnData, error: turnError } = await db().functions.invoke("whatsapp-group-turn-credentials", { body: { groupCallId: call.id } });
      if (turnError) throw turnError;
      if (turnData?.error) throw new Error(turnData.error);
      if (!Array.isArray(turnData?.iceServers) || !turnData.iceServers.length) throw new Error("The group-call relay is not configured.");
      session = {
        id: call.id, groupId, mediaType: type, initiatorId: user.id,
        localStream, iceServers: turnData.iceServers, peers: new Map(),
        participants: participantRows, channel: null, muted: false, cameraOff: false
      };
      await subscribeSession();
      await negotiateAcceptedPeers();
      renderCall();
      const { error: notifyError } = await db().functions.invoke("whatsapp-push", { body: { action: "notify-group-call", groupCallId: call.id } });
      if (notifyError) console.warn("[group-calls] Invitation push failed:", errorText(notifyError));
      toast("Group " + type + " call started. Invited " + (memberIds.length - 1) + " member(s).");
    } catch (error) {
      stopStream(localStream);
      if (createdCallId) {
        await db().from("aeroshell_group_calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", createdCallId).eq("initiator_id", user.id);
      }
      if (session?.id === createdCallId) await cleanup("", true);
      toast("Could not start the group call: " + errorText(error));
    }
  }

  async function join(groupCallId) {
    const user = me();
    if (!user?.isSupabase || !uuid(groupCallId)) return;
    if (session) return toast("Finish your current call before joining another.");
    let localStream = null;
    try {
      const { data: call, error } = await db().from("aeroshell_group_calls")
        .select("id,group_id,initiator_id,media_type,status,created_at").eq("id", groupCallId).maybeSingle();
      if (error) throw error;
      if (!call || call.status !== "active") throw new Error("This group call has already ended.");
      const { data: invite, error: inviteError } = await db().from("aeroshell_group_call_participants")
        .select("status").eq("group_call_id", groupCallId).eq("user_id", user.id).maybeSingle();
      if (inviteError) throw inviteError;
      if (!invite || invite.status !== "invited") throw new Error("There is no pending invitation for this account.");
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.media_type === "video" });
      const { error: acceptError } = await db().from("aeroshell_group_call_participants")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("group_call_id", groupCallId).eq("user_id", user.id);
      if (acceptError) throw acceptError;
      const { data: turnData, error: turnError } = await db().functions.invoke("whatsapp-group-turn-credentials", { body: { groupCallId } });
      if (turnError) throw turnError;
      if (turnData?.error) throw new Error(turnData.error);
      if (!Array.isArray(turnData?.iceServers) || !turnData.iceServers.length) throw new Error("The group-call relay is not configured.");
      session = {
        id: call.id, groupId: call.group_id, mediaType: call.media_type, initiatorId: call.initiator_id,
        localStream, iceServers: turnData.iceServers, peers: new Map(), participants: [],
        channel: null, muted: false, cameraOff: false
      };
      closeDialog();
      await subscribeSession();
      await negotiateAcceptedPeers();
      renderCall();
      toast("Joined the group call.");
    } catch (error) {
      stopStream(localStream);
      toast("Could not join the group call: " + errorText(error));
    }
  }

  async function decline(groupCallId) {
    if (!me()?.isSupabase) return;
    const { error } = await db().from("aeroshell_group_call_participants")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("group_call_id", groupCallId).eq("user_id", me().id);
    if (error) toast("Could not decline the group call: " + errorText(error));
    else { closeDialog(); toast("Group call declined."); }
  }

  async function showInvite(groupCallId) {
    if (!me()?.isSupabase || pendingPrompt === groupCallId || session) return;
    pendingPrompt = groupCallId;
    try {
      const { data: call, error } = await db().from("aeroshell_group_calls")
        .select("id,group_id,initiator_id,media_type,status,created_at").eq("id", groupCallId).maybeSingle();
      if (error) throw error;
      if (!call || call.status !== "active") return;
      const { data: invite, error: inviteError } = await db().from("aeroshell_group_call_participants")
        .select("status").eq("group_call_id", groupCallId).eq("user_id", me().id).maybeSingle();
      if (inviteError) throw inviteError;
      if (!invite || invite.status !== "invited") return;
      const { data: caller } = await db().from("aeroshell_profiles")
        .select("username,display_name").eq("id", call.initiator_id).maybeSingle();
      const callerName = caller?.display_name || caller?.username || "A group member";
      openDialog("Incoming group " + (call.media_type === "video" ? "video" : "voice") + " call",
        "<div class='wa-group-invite'><strong>" + esc(callerName) + "</strong><p>invited you to a group call in <strong>" + esc(groupName(call.group_id)) + "</strong>.</p>" +
        "<p class='screen-description'>Allow microphone" + (call.media_type === "video" ? " and camera" : "") + " access when you join.</p></div>",
        "<button class='secondary-button' data-action='wa-group-decline' data-group-call-id='" + esc(groupCallId) + "'>Decline</button>" +
        "<button class='primary-button' data-action='wa-group-accept' data-group-call-id='" + esc(groupCallId) + "'>Join call</button>");
    } catch (error) {
      console.warn("[group-calls] Invite prompt failed:", errorText(error));
    } finally {
      setTimeout(() => { if (pendingPrompt === groupCallId) pendingPrompt = ""; }, 3000);
    }
  }

  async function scanInvites() {
    if (!me()?.isSupabase || !db() || scanRunning || session) return;
    scanRunning = true;
    try {
      const { data: invites, error } = await db().from("aeroshell_group_call_participants")
        .select("group_call_id").eq("user_id", me().id).eq("status", "invited")
        .order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      if (invites?.length) await showInvite(invites[0].group_call_id);
    } catch (error) {
      console.warn("[group-calls] Pending invite scan failed:", errorText(error));
    } finally { scanRunning = false; }
  }

  async function subscribeIncoming() {
    if (!me()?.isSupabase) return;
    if (inviteChannel && inviteUserId === me().id) return;
    if (inviteChannel) {
      await db().removeChannel(inviteChannel).catch(() => {});
      inviteChannel = null;
    }
    inviteUserId = me().id;
    inviteChannel = db().channel("wa-group-invites-" + inviteUserId)
      .on("postgres_changes", { event: "*", schema: "public", table: "aeroshell_group_call_participants", filter: "user_id=eq." + inviteUserId }, payload => {
        if (payload.new?.status === "invited") void showInvite(payload.new.group_call_id);
      })
      .subscribe();
  }

  async function cleanup(message, closeUi) {
    const old = session;
    session = null;
    if (old) {
      if (old.channel) await db().removeChannel(old.channel).catch(() => {});
      for (const record of old.peers.values()) closePeer(record.pc);
      stopStream(old.localStream);
    }
    if (closeUi) closeDialog();
    if (message) toast(message);
  }

  async function leave() {
    if (!session) return;
    const old = session, user = me();
    try {
      if (old.initiatorId === user.id) {
        const { error } = await db().from("aeroshell_group_calls")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", old.id).eq("initiator_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await db().from("aeroshell_group_call_participants")
          .update({ status: "left", responded_at: new Date().toISOString() })
          .eq("group_call_id", old.id).eq("user_id", user.id);
        if (error) throw error;
      }
      await cleanup("You left the group call.", true);
    } catch (error) {
      toast("Could not leave cleanly: " + errorText(error));
      await cleanup("", true);
    }
  }

  function toggleMute() {
    if (!session) return;
    session.muted = !session.muted;
    session.localStream.getAudioTracks().forEach(track => track.enabled = !session.muted);
    renderCall();
  }

  function toggleCamera() {
    if (!session || session.mediaType !== "video") return;
    session.cameraOff = !session.cameraOff;
    session.localStream.getVideoTracks().forEach(track => track.enabled = !session.cameraOff);
    renderCall();
  }

  function handleClick(event) {
    const target = event.target?.closest?.("[data-action],[data-dialog-action]");
    if (!target) return;
    const action = target.dataset.action || "", dialogAction = target.dataset.dialogAction || "";
    if ((action === "voice-call" || action === "video-call") && bridge()?.getCurrentChat?.()?.type === "group") {
      event.preventDefault(); event.stopImmediatePropagation();
      void start(bridge().getCurrentChat(), action === "video-call" ? "video" : "audio"); return;
    }
    const id = target.dataset.groupCallId;
    if (action === "wa-group-accept") { event.preventDefault(); event.stopImmediatePropagation(); void join(id); return; }
    if (action === "wa-group-decline") { event.preventDefault(); event.stopImmediatePropagation(); void decline(id); return; }
    if (action === "wa-group-end") { event.preventDefault(); event.stopImmediatePropagation(); void leave(); return; }
    if (action === "wa-group-toggle-mute") { event.preventDefault(); event.stopImmediatePropagation(); toggleMute(); return; }
    if (action === "wa-group-toggle-camera") { event.preventDefault(); event.stopImmediatePropagation(); toggleCamera(); return; }
  }

  async function resume() {
    if (!me()?.isSupabase || !db()) {
      if (inviteChannel) { await db()?.removeChannel(inviteChannel).catch(() => {}); inviteChannel = null; inviteUserId = ""; }
      return;
    }
    await subscribeIncoming();
    await scanInvites();
  }

  document.addEventListener("click", handleClick, true);
  window.WhatsAppGroupCalls = { start, join, decline, leave, resume, getActive: () => !!session };
  window.addEventListener("focus", () => { void resume(); });
})();