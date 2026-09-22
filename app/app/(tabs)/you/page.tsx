"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { YouScreen } from "../../../components/Account";
import { useAccount } from "../../../hooks/useAccount";
import { account as accountClient, history } from "@/lib/data";
import { hapticsSupported } from "@/lib/haptics";
import { applyPreferences, readLocalPreferences, writeLocalPreference } from "@/lib/preferences";
import type { AccountDevice } from "@/lib/data/account";
import type { ThemeChoice } from "@/lib/theme";

export default function YouPage() {
  const router = useRouter();
  const account = useAccount();
  const signedIn = account.state === "signedIn";

  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [local, setLocal] = useState(() => readLocalPreferences());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    if (!signedIn) return;
    setDevices(await accountClient.devices());
  }, [signedIn]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  // Signed out with no account to show, this screen has nothing to be. Home is
  // where sign-in lives.
  useEffect(() => {
    if (account.state === "signedOut") router.replace("/app");
  }, [account.state, router]);

  const rename = async (displayName: string) => {
    setBusy(true);
    setError(null);
    try {
      await account.rename(displayName);
    } catch {
      setError("Couldn't save that name. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const change = (patch: { theme?: ThemeChoice; notifications?: boolean }) => {
    // Local first, then pushed up. The setting has already applied and is
    // already visible; the sync is bookkeeping.
    const next = writeLocalPreference(patch);
    setLocal(next);
    applyPreferences(next);
    void accountClient.savePreferences(patch);
  };

  const forgetDevice = async (id: string) => {
    try {
      await accountClient.forgetDevice(id);
      await loadDevices();
    } catch {
      setError("Couldn't sign that device out. Try again.");
    }
  };

  return (
    <YouScreen
      name={account.profile?.displayName ?? ""}
      devices={devices}
      themeChoice={local.theme}
      notifsOn={local.notifications}
      hapticsSupported={hapticsSupported()}
      busy={busy}
      error={error}
      onRename={(n) => void rename(n)}
      onChangeTheme={(theme) => change({ theme })}
      onToggleNotifs={() => change({ notifications: !local.notifications })}
      onForgetDevice={(id) => void forgetDevice(id)}
      // Straight to the client rather than through `useHistory`: this screen
      // shows no trips, and loading a page of them to reach one delete would be
      // a request for nothing.
      onClearHistory={() =>
        void history.forgetAll().catch(() => setError("Couldn't clear your history. Try again."))
      }
      onSignOut={() => {
        void account.signOut();
        router.push("/app");
      }}
    />
  );
}
