"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { browserDeviceName, base64UrlToUint8Array, subscriptionUsesKey } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

type NotificationState = "checking" | "unsupported" | "waiting" | "blocked" | "disabled" | "enabled";
type DeliveryMode = "batch" | "recording";

const TEST_NOTIFICATION = {
  body: "Desktop notifications are working. You can keep working in another app.",
  icon: "/class-scribe-icon.svg",
  badge: "/class-scribe-icon.svg",
  tag: "class-scribe-test",
  data: { url: "/dashboard" },
};

export function NotificationSettings({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<NotificationState>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [mode, setMode] = useState<DeliveryMode>("batch");
  const [notifyFailures, setNotifyFailures] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    const [{ data: configuration }, { data: preferences }] = await Promise.all([
      supabase.from("notification_configuration").select("public_value").eq("key", "web_push").maybeSingle(),
      supabase.from("notification_preferences").select("notify_each_recording,notify_failures").eq("user_id", userId).maybeSingle(),
    ]);
    if (preferences) {
      setMode(preferences.notify_each_recording ? "recording" : "batch");
      setNotifyFailures(preferences.notify_failures);
    }
    if (!configuration?.public_value) {
      setState("waiting");
      return;
    }
    setPublicKey(configuration.public_value);

    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setState("disabled");
      return;
    }
    if (!subscriptionUsesKey(subscription, configuration.public_value)) {
      await subscription.unsubscribe();
      setState("disabled");
      return;
    }
    const { data: saved } = await supabase.from("push_subscriptions").select("id").eq("endpoint", subscription.endpoint).maybeSingle();
    setState(saved ? "enabled" : "disabled");
  }, [supabase, userId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load().catch(() => setState("disabled")), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function saveSubscription(subscription: PushSubscription) {
    const serialized = subscription.toJSON();
    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
      throw new Error("This browser returned an incomplete notification subscription.");
    }
    const { error: subscriptionError } = await supabase.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: serialized.endpoint,
      p256dh: serialized.keys.p256dh,
      auth_key: serialized.keys.auth,
      device_name: browserDeviceName(),
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (subscriptionError) throw subscriptionError;

    const { data: existingPreferences, error: preferencesReadError } = await supabase
      .from("notification_preferences").select("user_id").eq("user_id", userId).maybeSingle();
    if (preferencesReadError) throw preferencesReadError;
    if (!existingPreferences) {
      const { error: preferencesError } = await supabase.from("notification_preferences").insert({ user_id: userId });
      if (preferencesError) throw preferencesError;
    }
  }

  async function enable() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "disabled");
        return;
      }
      let key = publicKey;
      if (!key) {
        const { data } = await supabase.from("notification_configuration").select("public_value").eq("key", "web_push").maybeSingle();
        key = data?.public_value ?? "";
        setPublicKey(key);
      }
      if (!key) throw new Error("The notification service is still starting. Try again in a moment.");

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !subscriptionUsesKey(subscription, key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(key),
      });
      await saveSubscription(subscription);
      setState("enabled");
      setMessage("Desktop notifications are enabled on this device.");
      await registration.showNotification("Class Scribe notifications enabled", TEST_NOTIFICATION);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const { error: removeError } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
        if (removeError) throw removeError;
      }
      setState("disabled");
      setMessage("Desktop notifications are disabled on this device.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notifications could not be disabled.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Class Scribe test notification", TEST_NOTIFICATION);
      setMessage("Test sent. Check your desktop notification area.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The test notification could not be shown.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePreferences(nextMode: DeliveryMode, nextFailures: boolean) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const { error: preferenceError } = await supabase.from("notification_preferences").upsert({
        user_id: userId,
        notify_each_recording: nextMode === "recording",
        notify_batch_complete: nextMode === "batch",
        notify_failures: nextFailures,
      }, { onConflict: "user_id" });
      if (preferenceError) throw preferenceError;
      setMode(nextMode); setNotifyFailures(nextFailures);
      setMessage("Notification preferences saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preferences could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const copy = {
    checking: "Checking this browser…",
    unsupported: "This browser does not support Web Push notifications.",
    waiting: "The notification service is starting. Refresh in a moment.",
    blocked: "Notifications are blocked. Allow them for this site in your browser settings.",
    disabled: "Get a Windows or macOS pop-up while you work in another app.",
    enabled: "This device will receive completion pop-ups, even after this tab closes.",
  }[state];

  return <section className={`notification-card ${state === "enabled" ? "enabled" : ""}`}>
    <div className="notification-heading">
      <span className="notification-icon">{state === "blocked" ? <BellOff size={20} /> : <Bell size={20} />}</span>
      <div><h2>Desktop notifications</h2><p>{copy}</p></div>
      <span className={`notification-status ${state === "enabled" ? "active" : ""}`}>{state === "enabled" ? <><Check size={13} /> Enabled</> : state === "checking" ? "Checking" : "Off"}</span>
    </div>

    {state === "enabled" && <div className="notification-preferences">
      <label>Notify me
        <select value={mode} disabled={busy} onChange={(event) => void updatePreferences(event.target.value as DeliveryMode, notifyFailures)}>
          <option value="batch">When the whole batch is ready</option>
          <option value="recording">After each recording</option>
        </select>
      </label>
      <label className="notification-checkbox"><input type="checkbox" checked={notifyFailures} disabled={busy} onChange={(event) => void updatePreferences(mode, event.target.checked)} /> Notify me when processing fails</label>
    </div>}

    <div className="notification-actions">
      {state === "enabled" ? <>
        <button className="button button-primary button-small" disabled={busy} onClick={() => void sendTest()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Send test</button>
        <button className="ghost-button" disabled={busy} onClick={() => void disable()}>Turn off on this device</button>
      </> : state !== "checking" && state !== "unsupported" && state !== "blocked" && state !== "waiting" ?
        <button className="button button-primary button-small" disabled={busy} onClick={() => void enable()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Bell size={15} />} Enable desktop notifications</button> : null}
    </div>
    {error && <p className="notification-message error" role="alert"><TriangleAlert size={14} />{error}</p>}
    {message && <p className="notification-message success" role="status"><Check size={14} />{message}</p>}
  </section>;
}
