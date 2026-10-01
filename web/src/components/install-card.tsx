"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Share, Smartphone } from "lucide-react";
import {
  getInstallState,
  getPlatform,
  getServerInstallState,
  getServerPlatform,
  promptInstall,
  subscribeToInstallState,
} from "@/lib/install-prompt";

const subscribeToNothing = () => () => {};

function ManualSteps({ platform }: { platform: ReturnType<typeof getPlatform> }) {
  if (platform === "ios") {
    return <p>Tap <Share size={13} aria-hidden="true" /> <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>. Safari is required; Chrome on iPhone cannot install apps.</p>;
  }
  if (platform === "android") {
    return <p>Tap the <strong>⋮</strong> menu in Chrome, then <strong>Add to Home screen</strong>. If you don’t see it, reload the page once and try again.</p>;
  }
  return <p>Open this page in Chrome on your phone, then use the browser menu to add it to your home screen.</p>;
}

export function InstallCard() {
  const state = useSyncExternalStore(subscribeToInstallState, getInstallState, getServerInstallState);
  const platform = useSyncExternalStore(subscribeToNothing, getPlatform, getServerPlatform);
  const [working, setWorking] = useState(false);

  if (state === "installed") {
    return <section className="install-card installed">
      <span className="install-icon"><Check size={17} /></span>
      <div><strong>Installed</strong><small>You’re running Class Scribe as an app.</small></div>
    </section>;
  }

  return <section className="install-card">
    <span className="install-icon"><Smartphone size={17} /></span>
    <div>
      <strong>Add to your home screen</strong>
      {state === "ready"
        ? <small>Open Class Scribe like a normal app, and keep recording in its own window.</small>
        : <ManualSteps platform={platform} />}
    </div>
    {state === "ready" ? <button
      type="button"
      className="button button-small button-primary"
      disabled={working}
      onClick={() => {
        setWorking(true);
        void promptInstall().finally(() => setWorking(false));
      }}
    >
      Install
    </button> : null}
  </section>;
}
