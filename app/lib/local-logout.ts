type LocalSignOut = (options: { scope: "local" }) => Promise<unknown>;

export async function logoutCurrentBrowser({
  releaseLock,
  signOut,
  releaseTimeoutMs = 1500,
}: {
  releaseLock?: () => Promise<unknown> | undefined;
  signOut: LocalSignOut;
  releaseTimeoutMs?: number;
}) {
  if (releaseLock) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.resolve().then(releaseLock).catch(() => undefined),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, releaseTimeoutMs);
      }),
    ]);
    if (timeoutId) clearTimeout(timeoutId);
  }

  await signOut({ scope: "local" });
}

