(() => {
  "use strict";
  const APP_BUILD = "whatsapp-fix-20261031e";
  const native = window.WhatsAppNativeAndroid;
  const nativeApp = !!(native && typeof native.isNativeApp === "function" && native.isNativeApp());

  function setupWebUpdateNotice() {
    if (!("serviceWorker" in navigator)) return;
    let hadController = !!navigator.serviceWorker.controller;
    let dismissed = false;
    let banner = null;
    function workerBuild(worker) {
      try { return new URL(worker.scriptURL).searchParams.get("v") || ""; }
      catch (_) { return ""; }
    }
    function ensureBanner() {
      if (banner) return banner;
      banner = document.createElement("section");
      banner.className = "wa-native-update-banner wa-web-update-banner";
      banner.id = "wa-web-update-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      const copy = document.createElement("div");
      copy.className = "wa-native-update-copy";
      const title = document.createElement("strong");
      title.textContent = "WhatsApp update available";
      const detail = document.createElement("small");
      detail.textContent = "A new version is ready. Reload to use the latest fixes and features.";
      copy.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "wa-native-update-actions";
      const reload = document.createElement("button");
      reload.type = "button";
      reload.className = "wa-native-update-install";
      reload.textContent = "Update now";
      reload.setAttribute("data-wa-web-update-reload", "true");
      const later = document.createElement("button");
      later.type = "button";
      later.className = "wa-native-update-dismiss";
      later.textContent = "Later";
      later.setAttribute("data-wa-web-update-dismiss", "true");
      actions.append(reload, later);
      banner.append(copy, actions);
      document.body.appendChild(banner);
      return banner;
    }
    function showNotice() {
      if (dismissed) return;
      ensureBanner().hidden = false;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) showNotice();
      hadController = true;
    });
    const initialController = navigator.serviceWorker.controller;
    if (initialController && workerBuild(initialController) !== APP_BUILD) showNotice();
    document.addEventListener("click", event => {
      const reload = event.target.closest("[data-wa-web-update-reload]");
      if (reload) {
        reload.disabled = true;
        reload.textContent = "Reloading…";
        window.setTimeout(() => window.location.reload(), 120);
        return;
      }
      const later = event.target.closest("[data-wa-web-update-dismiss]");
      if (later) {
        dismissed = true;
        if (banner) banner.hidden = true;
      }
    });
    window.addEventListener("load", () => {
      window.setTimeout(async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration) return;
          const active = navigator.serviceWorker.controller || registration.active;
          if (active && workerBuild(active) !== APP_BUILD) showNotice();
          await registration.update();
        } catch (error) {
          console.warn("[updater] Web app update check failed:", error && error.message || error);
        }
      }, 1200);
    });
  }

  if (!nativeApp) {
    setupWebUpdateNotice();
    return;
  }
  let latestUpdate = null, latestCheckInfo = null, lastCheckAt = 0, banner = null, installButton = null, message = null;
  let dismissedVersion = "", checking = false, installing = false, lastCheckFailed = false, lastCheckMessage = "";
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
  function notifyUpdateState() {
    try { window.dispatchEvent(new CustomEvent("wa-native-update-state")); } catch (_) {}
  }
  window.waNativeUpdateGetState = function () {
    let installedVersionCode = 0, installedVersionName = "";
    try { installedVersionCode = Number(native.getVersionCode()) || 0; } catch (_) {}
    try { installedVersionName = String(native.getVersionName() || ""); } catch (_) {}
    const source = latestUpdate || latestCheckInfo || {};
    return {
      nativeApp: true,
      installedVersionCode,
      installedVersionName,
      checked: !!latestCheckInfo,
      checking,
      installing,
      checkFailed: lastCheckFailed,
      updateAvailable: !!(latestUpdate && latestUpdate.apkUrl && latestUpdate.sha256),
      versionCode: Number(source.versionCode || 0),
      versionName: String(source.versionName || ""),
      apkUrl: String(source.apkUrl || ""),
      sha256: String(source.sha256 || ""),
      releaseUrl: String(source.releaseUrl || ""),
      message: lastCheckMessage,
      lastCheckAt
    };
  };
  window.waNativeUpdateCheckNow = function () { check(true); };
  window.waNativeUpdateInstall = function () {
    if (!latestUpdate || !latestUpdate.apkUrl || !latestUpdate.sha256 || installing) return;
    installing = true;
    lastCheckMessage = "";
    notifyUpdateState();
    try { native.downloadAndInstallUpdate(latestUpdate.apkUrl, latestUpdate.sha256); }
    catch (error) { window.waNativeUpdateInstallFailed(error && error.message || "Could not start Android's installer."); }
  };
  window.waOnNativeUpdateCheck = function (info) {
    checking = false;
    if (!info) { notifyUpdateState(); return; }
    latestCheckInfo = info;
    lastCheckFailed = !!info.checkFailed;
    lastCheckMessage = info.checkFailed ? String(info.message || "Could not check for updates.") : "";
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
      notifyUpdateState();
      return;
    }
    if (!info.updateAvailable || !info.apkUrl || !info.sha256) {
      latestUpdate = null; hideBanner(); notifyUpdateState(); return;
    }
    latestUpdate = info;
    if (dismissedVersion === String(info.versionCode)) { hideBanner(); notifyUpdateState(); return; }
    const el = ensureBanner(); el.hidden = false;
    const detail = document.getElementById("wa-native-update-detail");
    if (detail) detail.textContent = "Version " + String(info.versionName || "new version") + " is available. Tap Update now, then approve Android’s installer.";
    if (message) { message.hidden = true; message.textContent = ""; }
    if (installButton) { installButton.disabled = false; installButton.textContent = "Update now"; }
    notifyUpdateState();
  };
  window.waNativeUpdateInstallFailed = function (reason) {
    installing = false;
    lastCheckMessage = String(reason || "The update could not be installed.");
    const el = ensureBanner(); el.hidden = false;
    if (message) { message.textContent = lastCheckMessage; message.hidden = false; }
    if (installButton) { installButton.disabled = false; installButton.textContent = "Try again"; }
    notifyUpdateState();
  };
  document.addEventListener("click", event => {
    const checkButton = event.target.closest("[data-wa-native-update-check]");
    if (checkButton) { check(true); return; }
    const pageInstall = event.target.closest("[data-wa-native-update-install]");
    if (pageInstall) { window.waNativeUpdateInstall(); return; }
    const install = event.target.closest("[data-wa-update-install]");
    if (install) {
      if (!latestUpdate) return;
      install.disabled = true; install.textContent = "Preparing…";
      if (message) { message.hidden = true; message.textContent = ""; }
      window.waNativeUpdateInstall();
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
    lastCheckFailed = false;
    lastCheckMessage = "";
    notifyUpdateState();
    try {
      native.checkForUpdates();
    } catch (error) {
      checking = false;
      lastCheckFailed = true;
      lastCheckMessage = error && error.message || "The update check could not start.";
      console.warn("[updater] Update check could not start:", error);
      notifyUpdateState();
    }
  }
  const priorResume = window.waNativeAppResumed;
  window.waNativeAppResumed = function () {
    // Android returns here after the package installer is closed. Let the
    // Settings update page offer another attempt if installation was cancelled.
    if (installing) {
      installing = false;
      notifyUpdateState();
    }
    if (typeof priorResume === "function") priorResume.apply(this, arguments);
    check(true);
  };
  window.addEventListener("focus", () => check(false));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(false); });
  // If a release finishes while the app stays open, refresh availability in the foreground too.
  window.setInterval(() => {
    if (document.visibilityState === "visible") check(false);
  }, 60 * 1000);
  check(true);
})();
