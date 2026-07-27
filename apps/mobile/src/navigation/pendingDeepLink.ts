let pendingUrl: string | null = null;

export function rememberPendingDeepLink(url: string) {
  pendingUrl = url;
}

export function consumePendingDeepLink(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}
