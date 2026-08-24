"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, LoaderCircle, Mail, Send, TriangleAlert } from "lucide-react";
import { browserDeviceName, base64UrlToUint8Array, subscriptionUsesKey } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

type PushState = "checking" | "unsupported" | "waiting" | "blocked" | "disabled" | "enabled";
type DeliveryMode = "batch" | "recording";

const TEST_NOTIFICATION = {
  body: "Desktop notifications are working. You can keep working in another app.",
  icon: "/class-scribe-icon.svg",
  badge: "/class-scribe-icon.svg",
  tag: "class-scribe-test",
  data: { url: "/dashboard" },
};

export function NotificationSettings({ userId, accountEmail }: { userId: string; accountEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const normalizedEmail = accountEmail.trim().toLowerCase();
  const [pushState, setPushState] = useState<PushState>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [mode, setMode] = useState<DeliveryMode>("batch");
  const [notifyFailures, setNotifyFailures] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: configuration }, { data: preferences, error: preferencesError }] = await Promise.all([
      supabase.from("notification_configuration").select("public_value").eq("key", "web_push").maybeSingle(),
      supabase.from("notification_preferences")
        .select("notify_each_recording,notify_failures,email_notifications_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (preferencesError) throw preferencesError;
    if (preferences) {
      setMode(preferences.notify_each_recording ? "recording" : "batch");
      setNotifyFailures(preferences.notify_failures);
      setEmailEnabled(preferences.email_notifications_enabled);
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("blocked");
      return;
    }
    if (!configuration?.public_value) {
      setPushState("waiting");
      return;
    }
    setPublicKey(configuration.public_value);

    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setPushState("disabled");
      return;
    }
    if (!subscriptionUsesKey(subscription, configuration.public_value)) {
      await subscription.unsubscribe();
      setPushState("disabled");
      return;
    }
    const { data: saved } = await supabase.from("push_subscriptions").select("id").eq("endpoint", subscription.endpoint).maybeSingle();
    setPushState(saved ? "enabled" : "disabled");
  }, [supabase, userId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load().catch(() => setPushState("disabled")), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function savePreferences(nextMode: DeliveryMode, nextFailures: boolean, nextEmailEnabled: boolean) {
    const { error: preferenceError } = await supabase.from("notification_preferences").upsert({
      user_id: userId,
      notify_each_recording: nextMode === "recording",
      notify_batch_complete: nextMode === "batch",
      notify_failures: nextFailures,
      email_notifications_enabled: nextEmailEnabled,
      email_address: nextEmailEnabled ? normalizedEmail : null,
    }, { onConflict: "user_id" });
    if (preferenceError) throw preferenceError;
    setMode(nextMode);
    setNotifyFailures(nextFailures);
    setEmailEnabled(nextEmailEnabled);
  }

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

  async function enablePush() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "blocked" : "disabled");
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
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(key) });
      await saveSubscription(subscription);
      setPushState("enabled");
      setMessage("Browser pop-ups are enabled on this device.");
      await registration.showNotification("Class Scribe notifications enabled", TEST_NOTIFICATION);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Browser notifications could not be enabled.");
    } finally { setBusy(false); }
  }

  async function disablePush() {
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
      setPushState("disabled");
      setMessage("Browser pop-ups are disabled on this device.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Browser notifications could not be disabled.");
    } finally { setBusy(false); }
  }

  async function toggleEmail(nextEnabled: boolean) {
    if (nextEnabled && !normalizedEmail) { setError("Your account does not have an email address."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await savePreferences(mode, notifyFailures, nextEnabled);
      setMessage(nextEnabled ? `Completion emails are enabled for ${normalizedEmail}.` : "Completion emails are disabled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Email notifications could not be updated.");
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Class Scribe test notification", TEST_NOTIFICATION);
      setMessage("Test sent. Check your desktop notification area.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The test notification could not be shown.");
    } finally { setBusy(false); }
  }

  async function updatePreferences(nextMode: DeliveryMode, nextFailures: boolean) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await savePreferences(nextMode, nextFailures, emailEnabled);
      setMessage("Notification preferences saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preferences could not be saved.");
    } finally { setBusy(false); }
  }

  const pushCopy = {
    checking: "Checking this browser...",
    unsupported: "This browser does not support persistent pop-ups.",
    waiting: "The browser notification service is starting.",
    blocked: "Pop-ups are blocked. Allow notifications for this site in your browser settings.",
    disabled: "Show a desktop or phone pop-up while you do something else.",
    enabled: "This device receives completion pop-ups, even after the tab closes.",
  }[pushState];
  const anyEnabled = pushState === "enabled" || emailEnabled;

  return <section className={`notification-card ${anyEnabled ? "enabled" : ""}`}>
    <div className="notification-heading">
      <span className="notification-icon"><Bell size={20} /></span>
      <div><h2>Completion notifications</h2><p>Choose email, browser pop-ups, or both. You can change this anytime.</p></div>
      <span className={`notification-status ${anyEnabled ? "active" : ""}`}>{anyEnabled ? <><Check size={13} /> On</> : pushState === "checking" ? "Checking" : "Off"}</span>
    </div>

    <div className="notification-channels">
      <div className="notification-channel">
        <span className="channel-icon"><Mail size={18} /></span>
        <div><strong>Email</strong><small>{emailEnabled ? `Sending to ${normalizedEmail}` : `Send a private sign-in link to ${normalizedEmail || "your account email"}.`}</small></div>
        <button className={emailEnabled ? "ghost-button" : "button button-primary button-small"} disabled={busy || !normalizedEmail} onClick={() => void toggleEmail(!emailEnabled)}>{emailEnabled ? "Turn off" : "Enable email"}</button>
      </div>
      <div className="notification-channel">
        <span className="channel-icon">{pushState === "blocked" ? <BellOff size={18} /> : <Bell size={18} />}</span>
        <div><strong>Browser pop-ups</strong><small>{pushCopy}</small></div>
        {pushState === "enabled" ? <button className="ghost-button" disabled={busy} onClick={() => void disablePush()}>Turn off</button>
          : !["checking", "unsupported", "blocked", "waiting"].includes(pushState) ? <button className="button button-primary button-small" disabled={busy} onClick={() => void enablePush()}>Enable pop-ups</button> : null}
      </div>
    </div>

    {anyEnabled && <div className="notification-preferences">
      <label>Notify me
        <select value={mode} disabled={busy} onChange={(event) => void updatePreferences(event.target.value as DeliveryMode, notifyFailures)}>
          <option value="batch">When the whole batch is ready</option>
          <option value="recording">After each recording</option>
        </select>
      </label>
      <label className="notification-checkbox"><input type="checkbox" checked={notifyFailures} disabled={busy} onChange={(event) => void updatePreferences(mode, event.target.checked)} /> Notify me when processing fails</label>
    </div>}

    {pushState === "enabled" && <div className="notification-actions">
      <button className="ghost-button" disabled={busy} onClick={() => void sendTest()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Test browser pop-up</button>
    </div>}
    {error && <p className="notification-message error" role="alert"><TriangleAlert size={14} />{error}</p>}
    {message && <p className="notification-message success" role="status"><Check size={14} />{message}</p>}
  </section>;
}
