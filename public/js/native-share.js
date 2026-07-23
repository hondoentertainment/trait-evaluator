/** Web Share + PWA install helpers */

export async function shareLink({ url, title, text }) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return { ok: true, method: "native" };
    } catch (e) {
      if (e?.name === "AbortError") return { ok: false, method: "native", aborted: true };
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, method: "clipboard" };
  } catch {
    prompt("Copy share link:", url);
    return { ok: true, method: "prompt" };
  }
}

let deferredInstall = null;

export function bindInstallCapture() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
}

export function hasInstallPrompt() {
  return Boolean(deferredInstall);
}

export async function promptInstall() {
  if (!deferredInstall) return { ok: false, reason: "unavailable" };
  deferredInstall.prompt();
  const choice = await deferredInstall.userChoice;
  deferredInstall = null;
  return { ok: choice.outcome === "accepted", outcome: choice.outcome };
}
