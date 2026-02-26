/**
 * Rewrite multiaddrs so they are dialable from the same host.
 * - Replaces /ip4/0.0.0.0/ with /ip4/127.0.0.1/ (listen-all is not dialable).
 * - Optionally appends /p2p/<peerId> so the bootstrap can identify the peer.
 */
export function dialableLocalAddrs(
  multiaddrs: string[],
  peerId?: string,
): string[] {
  let out = multiaddrs.map((addr) =>
    addr.replace(/\/ip4\/0\.0\.0\.0\//, '/ip4/127.0.0.1/'),
  );
  if (peerId != null && peerId.length > 0) {
    out = out.map((addr) => (addr.includes('/p2p/') ? addr : `${addr}/p2p/${peerId}`));
  }
  return out;
}
