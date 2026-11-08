(() => {
  "use strict";

  const escapeHTML = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[ch]));
  const bridge = () => window.waAppBridge;
  const db = () => bridge()?.supabase;
  const user = () => bridge()?.getCurrentUser?.();
  const open = (title, body, footer) => bridge()?.openDialog?.(title, body, footer);
  const close = () => bridge()?.closeDialog?.();
  const toast = message => bridge()?.toast?.(message);
  let recoveryBusy = false;
  let moderationBusy = false;

  function requireAccount() {
    if (!user()?.isSupabase || !db()) {
      toast("Sign in to your account first.");
      return false;
    }
    return true;
  }

  async function createRecoveryCode() {
    if (!requireAccount() || recoveryBusy) return;
    open("Create account recovery code",
      "<p class='screen-description'>This generates a one-time 256-bit recovery code. Save it somewhere private and offline. It is shown only once; creating another code invalidates the previous one.</p>" +
      "<p class='screen-description'><strong>Important:</strong> this password reset also changes the password for the shared Supabase identity used by Windows 12 Master Chat.</p>",
      "<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-security-action='create-recovery-code'>Generate recovery code</button>");
  }

  async function generateRecoveryCode() {
    if (!requireAccount() || recoveryBusy) return;
    recoveryBusy = true;
    try {
      const { data, error } = await db().functions.invoke("whatsapp-account-recovery", {
        body: { action: "create" }
      });
      if (error) throw error;
      const code = String(data?.recoveryCode || "");
      if (!data?.success || !/^[0-9a-f]{64}$/.test(code)) throw new Error("The server did not return a valid recovery code.");
      open("Save your recovery code",
        "<p class='screen-description'>This code is displayed once. Copy it and store it somewhere private, such as a password manager or a printed copy kept securely. Anyone with this code and your username can reset your password.</p>" +
        "<div class='dialog-field'><label for='wa-recovery-code'>One-time recovery code</label><input id='wa-recovery-code' readonly value='" + escapeHTML(code) + "' autocomplete='off' spellcheck='false'></div>" +
        "<p class='field-hint'>Do not send this code to anyone or store it in a public note. The old recovery code, if any, has now been replaced.</p>",
        "<button class='secondary-button' data-security-action='copy-recovery-code'>Copy code</button><button class='primary-button' data-action='close-dialog'>I saved it</button>");
    } catch (error) {
      toast("Could not create a recovery code: " + String(error?.message || "Check your connection and try again."));
    } finally {
      recoveryBusy = false;
    }
  }

  function showRecoveryDialog() {
    open("Recover your account",
      "<p class='screen-description'>Enter your username, the recovery code you saved earlier, and a new password. Recovery codes are one-time use.</p>" +
      "<div class='dialog-field'><label for='wa-recover-username'>Username</label><input id='wa-recover-username' maxlength='20' autocomplete='username' placeholder='Your username'></div>" +
      "<div class='dialog-field'><label for='wa-recover-code'>Recovery code</label><input id='wa-recover-code' maxlength='64' autocomplete='off' autocapitalize='none' spellcheck='false' placeholder='64-character recovery code'></div>" +
      "<div class='dialog-field'><label for='wa-recover-password'>New password</label><input id='wa-recover-password' type='password' minlength='10' maxlength='128' autocomplete='new-password' placeholder='At least 10 characters'></div>" +
      "<div class='dialog-field'><label for='wa-recover-confirm'>Confirm new password</label><input id='wa-recover-confirm' type='password' minlength='10' maxlength='128' autocomplete='new-password' placeholder='Repeat your new password'></div>" +
      "<p class='field-hint'>Recovery does not use SMS, a SIM card, or an email address. You must already have generated and saved a recovery code.</p>",
      "<button class='secondary-button' data-action='close-dialog'>Cancel</button><button class='primary-button' data-security-action='submit-recovery'>Reset password</button>");
  }

  async function submitRecovery() {
    if (recoveryBusy) return;
    const username = String(document.querySelector("#wa-recover-username")?.value || "").trim().replace(/^@+/, "").toLowerCase();
    const recoveryCode = String(document.querySelector("#wa-recover-code")?.value || "").trim().toLowerCase();
    const password = String(document.querySelector("#wa-recover-password")?.value || "");
    const confirm = String(document.querySelector("#wa-recover-confirm")?.value || "");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return toast("Enter a valid 3–20 character username.");
    if (!/^[0-9a-f]{64}$/.test(recoveryCode)) return toast("Enter the complete 64-character recovery code.");
    if (password.length < 10 || password.length > 128) return toast("Use a new password with at least 10 characters.");
    if (password !== confirm) return toast("The new passwords do not match.");
    recoveryBusy = true;
    const button = document.querySelector("[data-security-action='submit-recovery']");
    if (button) { button.disabled = true; button.textContent = "Resetting password…"; }
    try {
      const { data, error } = await db().functions.invoke("whatsapp-account-recovery", {
        body: { action: "recover", username, recoveryCode, newPassword: password }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "recovery_failed");
      close();
      toast(data.sessionsRevoked
        ? "Password changed. Sign in again with your new password."
        : "Password changed. Other sessions may remain active until their access tokens expire. Sign in again.");
    } catch (error) {
      toast("Recovery failed. Check the username and saved code, then try again. A recovery code can be used only once.");
    } finally {
      recoveryBusy = false;
      const current = document.querySelector("[data-security-action='submit-recovery']");
      if (current) { current.disabled = false; current.textContent = "Reset password"; }
    }
  }

  const reasonLabel = reason => ({
    spam:"Spam", harassment:"Harassment", impersonation:"Impersonation",
    inappropriate_content:"Inappropriate content", other:"Other"
  }[reason] || "Other");

  async function invokeModeration(body) {
    const { data, error } = await db().functions.invoke("whatsapp-moderation", { body });
    if (error) throw error;
    if (!data?.success && !Array.isArray(data?.reports)) throw new Error(data?.error || "Moderation request failed.");
    return data;
  }

  async function loadModerationCentre() {
    if (!requireAccount() || moderationBusy) return;
    moderationBusy = true;
    open("Moderation centre", "<p class='screen-description'>Loading reports…</p>", "<button class='secondary-button' data-action='close-dialog'>Close</button>");
    try {
      const result = await invokeModeration({ action: "list_reports" });
      const reports = Array.isArray(result.reports) ? result.reports : [];
      const cards = reports.map(report => {
        const reporter = report.reporter?.username ? "@" + report.reporter.username : "Account";
        const reported = report.reported?.username ? "@" + report.reported.username : String(report.reported_user_id || "");
        const id = escapeHTML(report.id);
        return "<article class='section-card wa-moderation-card'>" +
          "<div class='setting-copy'><strong>" + escapeHTML(reasonLabel(report.reason)) + "</strong><span>From " + escapeHTML(reporter) + " · About " + escapeHTML(reported) + "</span></div>" +
          "<p class='screen-description'>" + escapeHTML(report.details || "No additional details were supplied.") + "</p>" +
          "<small class='field-hint'>Status: " + escapeHTML(report.status) + " · " + escapeHTML(new Date(report.created_at).toLocaleString()) + "</small>" +
          "<div class='wa-moderation-actions'>" +
          "<button class='secondary-button' data-security-action='moderate' data-action-name='mark_reviewing' data-report-id='" + id + "'>Review</button>" +
          "<button class='secondary-button' data-security-action='moderate' data-action-name='resolve_report' data-report-id='" + id + "'>Resolve</button>" +
          "<button class='secondary-button' data-security-action='moderate' data-action-name='dismiss_report' data-report-id='" + id + "'>Dismiss</button>" +
          "<button class='danger-button' data-security-action='moderate' data-action-name='restrict_messaging' data-report-id='" + id + "' data-user-id='" + escapeHTML(report.reported_user_id) + "'>Restrict messaging 24h</button>" +
          "</div></article>";
      }).join("");
      open("Moderation centre",
        "<p class='screen-description'>Reports awaiting review: " + reports.length + ". Only accounts explicitly assigned the moderator role can use this area. Restrictions stop message sending but do not suspend account sign-in or calls.</p>" +
        (cards || "<div class='empty-state'>There are no reports awaiting review.</div>"),
        "<button class='secondary-button' data-security-action='refresh-moderation'>Refresh</button><button class='primary-button' data-action='close-dialog'>Close</button>", true);
    } catch (error) {
      open("Moderation centre",
        "<p class='screen-description'>You do not have moderator access, or the moderation service is unavailable. Moderator access must be assigned by a trusted project administrator; it cannot be granted from this screen.</p>",
        "<button class='secondary-button' data-action='close-dialog'>Close</button>");
    } finally {
      moderationBusy = false;
    }
  }

  async function runModerationAction(button) {
    if (moderationBusy) return;
    const action = String(button.dataset.actionName || "");
    const reportId = String(button.dataset.reportId || "");
    const targetUserId = String(button.dataset.userId || "");
    const body = { action, reportId, targetUserId };
    if (action === "restrict_messaging") {
      body.durationHours = 24;
      body.reason = "Temporary messaging restriction after moderator review of report " + reportId;
      if (!confirm("Restrict this account from sending messages for 24 hours? This does not suspend login or calling.")) return;
    }
    moderationBusy = true;
    button.disabled = true;
    try {
      await invokeModeration(body);
      toast("Moderation action saved.");
      await loadModerationCentre();
    } catch (error) {
      toast("The moderation action could not be completed. Check moderator access and try again.");
    } finally {
      moderationBusy = false;
      if (button.isConnected) button.disabled = false;
    }
  }

  function installLoginRecoveryLink() {
    const form = document.querySelector("#login-form");
    if (!form || form.parentElement?.querySelector("[data-security-action='open-recovery']")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.dataset.securityAction = "open-recovery";
    button.textContent = "Forgot password? Use recovery code";
    button.style.marginTop = "12px";
    button.style.width = "100%";
    form.insertAdjacentElement("afterend", button);
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const setting = target.closest("[data-setting-option]");
    if (setting && ["Account recovery code", "Moderation centre"].includes(setting.dataset.settingOption)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (setting.dataset.settingOption === "Account recovery code") void createRecoveryCode();
      else void loadModerationCentre();
      return;
    }
    const button = target.closest("[data-security-action]");
    if (!button) return;
    const action = button.dataset.securityAction;
    if (action === "open-recovery") { event.preventDefault(); event.stopImmediatePropagation(); showRecoveryDialog(); }
    else if (action === "create-recovery-code") { event.preventDefault(); event.stopImmediatePropagation(); void generateRecoveryCode(); }
    else if (action === "copy-recovery-code") {
      event.preventDefault(); event.stopImmediatePropagation();
      const input = document.querySelector("#wa-recovery-code");
      if (!input) return;
      input.select(); input.setSelectionRange(0, input.value.length);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(input.value).then(() => toast("Recovery code copied.")).catch(() => toast("Code selected. Copy it manually."));
      else toast("Code selected. Copy it manually.");
    } else if (action === "submit-recovery") { event.preventDefault(); event.stopImmediatePropagation(); void submitRecovery(); }
    else if (action === "refresh-moderation") { event.preventDefault(); event.stopImmediatePropagation(); void loadModerationCentre(); }
    else if (action === "moderate") { event.preventDefault(); event.stopImmediatePropagation(); void runModerationAction(button); }
  }, true);

  const authSlot = document.querySelector("#auth-form-slot");
  if (authSlot) {
    const observer = new MutationObserver(() => installLoginRecoveryLink());
    observer.observe(authSlot, { childList: true, subtree: true });
    installLoginRecoveryLink();
  }
  window.WhatsAppSecurityCenter = { createRecoveryCode, showRecoveryDialog, loadModerationCentre };
})();