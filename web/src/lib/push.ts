export function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function uint8ArrayToBase64Url(value: ArrayBuffer | null) {
  if (!value) return "";
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function subscriptionUsesKey(subscription: PushSubscription, publicKey: string) {
  return uint8ArrayToBase64Url(subscription.options.applicationServerKey) === publicKey;
}

export function browserDeviceName() {
  const userAgent = navigator.userAgent;
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Firefox/") ? "Firefox" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Safari/") ? "Safari" : "Browser";
  const platform = navigator.platform || "device";
  return `${browser} on ${platform}`.slice(0, 160);
}
