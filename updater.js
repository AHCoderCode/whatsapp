(() => {
  "use strict";
  const native = window.WhatsAppNativeAndroid;
  if (!native || typeof native.isNativeApp !== "function" || !native.isNativeApp()) return;
  let latestUpdate = null, lastCheckAt = 0, banner = null, installButton = null, message = null, dismissedVersion = "", checking = false;
  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement("section");
    banner.className = "wa-native-update-banner";
    banner.id = "wa-native-update-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    const copy = document.createElement("div");
    copy.className = "wa-native-update-copy";
    const title = document.createElement("strong");
    title.textContent = "WhatsApp update available";
    const detail = document.createElement("small");
    detail.id = "wa-native-update-detail";
    detail.textContent = "A newer signed version is ready to install.";
    copy.append(title, detail);
    const actions = document.createElement("div");
    actions.className = "wa-native-update-actions";
    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "wa-native-update-install";
    installButton.textContent = "Update now";
    installButton.setAttribute("data-wa-update-install", "true");
    const later = document.createElement("button");
    later.type = "button";
    later.className = "wa-native-update-dismiss";
    later.textContent = "Later";
    later.setAttribute("data-wa-update-dismiss", "true");
    actions.append(installButton, later);
    message = document.createElement("small");
    message.className = "wa-native-update-message";
    message.hidden = true;
    banner.append(copy, actions, message);
    document.body.appendChild(banner);
    return banner;
  }
  function hideBanner() { if (banner) banner.hidden = true; }
  window.waOnNativeUpdateCheck = function (info) {
    checking = false;
    if (!info) return;
    if (info.checkFailed) {
      // Keep a previously discovered update available through a temporary network/API failure.
      if (latestUpdate && dismissedVersion !== String(latestUpdate.versionCode)) {
        const el = ensureBanner(); el.hidden = false;
        if (message) {
          message.textContent = "Could not refresh update information. The previously found update is still available; check your connection and try again if needed.";
          message.hidden = false;
        }
        if (installButton) { installButton.disabled = false; installButton.textContent = "Update now"; }
      }
      return;
    }
    if (!info.updateAvailable || !info.apkUrl || !info.sha256) {
      latestUpdate = null; hideBanner(); return;
    }
    latestUpdate = info;
    if (dismissedVersion === String(info.versionCode)) { hideBanner(); return; }
    const el = ensureBanner(); el.hidden = false;
    const detail = document.getElementById("wa-native-update-detail");
    if (detail) detail.textContent = "Version " + String(info.versionName || "new version") + " is available. Tap Update now, then approve Android’s installer.";
    if (message) { message.hidden = true; message.textContent = ""; }
    if (installButton) { installButton.disabled = false; installButton.textContent = "Update now"; }
  };
  window.waNativeUpdateInstallFailed = function (reason) {
    const el = ensureBanner(); el.hidden = false;
    if (message) { message.textContent = String(reason || "The update could not be installed."); message.hidden = false; }
    if (installButton) { installButton.disabled = false; installButton.textContent = "Try again"; }
  };
  document.addEventListener("click", event => {
    const install = event.target.closest("[data-wa-update-install]");
    if (install) {
      if (!latestUpdate) return;
      install.disabled = true; install.textContent = "Preparing…";
      if (message) { message.hidden = true; message.textContent = ""; }
      try { native.downloadAndInstallUpdate(latestUpdate.apkUrl, latestUpdate.sha256); }
      catch (error) { window.waNativeUpdateInstallFailed(error && error.message || "Could not start Android's installer."); }
      return;
    }
    const dismiss = event.target.closest("[data-wa-update-dismiss]");
    if (dismiss && latestUpdate) { dismissedVersion = String(latestUpdate.versionCode || ""); hideBanner(); }
  });
  function check(force) {
    const now = Date.now();
    if (checking || (!force && now - lastCheckAt < 5 * 60 * 1000)) return;
    lastCheckAt = now;
    checking = true;
    try {
      native.checkForUpdates();
    } catch (error) {
      checking = false;
      console.warn("[updater] Update check could not start:", error);
    }
  }
  const priorResume = window.waNativeAppResumed;
  window.waNativeAppResumed = function () {
    if (typeof priorResume === "function") priorResume.apply(this, arguments);
    check(true);
  };
  window.addEventListener("focus", () => check(false));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(false); });
  check(true);
})();
