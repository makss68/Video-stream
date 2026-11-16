# VPN capability: evaluation and plan

Status: proposal, nothing implemented. Written 2026-11-16.

## First finding (2026-11-16): the 451 errors are not a network block

Tested from a Mac on a VPN (French datacenter exit). `line.dino.ws` resolves the same through the system DNS and DNS-over-HTTPS, so there is no DNS block. The login still works (`auth: 1`), but the line reports `status: "Expired"` (since 14 Nov 2026, 1 connection) and every content call (`get_live_categories`, `get_vod_categories`, …) returns **HTTP 451**. Renew the line first. The home screen now shows the line status, so this is visible right away. Then run step 1 below from the TV's own network before choosing an option.

## What a VPN would solve here

The app talks to two kinds of hosts, both over plain HTTP:

1. The Xtream API and stream entry points (`line.dino.ws`, `line.dino-ott.ru`, … in `src/config.ts`).
2. The hosts those redirect to for the actual media, often bare IP addresses.

A VPN helps with three distinct problems. They have different, much cheaper fixes, so the first job is to know which one we actually have:

| Problem | Symptom in the app | Cheapest real fix |
|---|---|---|
| **DNS blocking by the ISP** (French ISPs block IPTV domains on court order) | "Find best": most servers `Unreachable` / `Timeout`, but they work from another network or with a public DNS | Resolve with DNS-over-HTTPS. No VPN needed |
| **IP blocking or throttling** of the stream hosts | API answers, playback fails or buffers; works through a VPN | Tunnel: device VPN or in-app VPN |
| **Privacy**: the ISP sees which IPTV hosts are reached and that video flows (traffic is unencrypted HTTP) | none visible | Tunnel |

Not a reason to add one: the provider limits connections per line (1-connection lines). A VPN changes the IP, not the count. The second credential set covers a second screen.

## Options

### A. VPN app on the TV, no app change *(recommended to start)*

Fire TV and Android TV run VPN apps from their stores (Proton VPN, Surfshark, NordVPN, Mullvad, the official WireGuard app). They tunnel every app, ours included, with no code change. Several support split tunnelling, so you can send only StreamViewer through the VPN.

- Effort: none in the app.
- Limits: one more app to start; some free tiers cap bandwidth or block streaming; whole-device unless split tunnelling is set.
- Small app add-on (½ day): show a "VPN on/off" chip on the home screen using `@react-native-community/netinfo` (reports `type: 'vpn'` on Android), so a failure can be told apart from a VPN that dropped.

### B. DNS-over-HTTPS inside the app *(if the diagnosis says DNS blocking)*

Resolve the server hostnames through Cloudflare or Google DoH instead of the ISP's resolver.

- API calls (axios → OkHttp on Android): plug a custom OkHttp client with `okhttp-dnsoverhttps` through React Native's `OkHttpClientProvider`. Small native change in `MainApplication`.
- Playback: expo-video uses Media3's default HTTP stack, which has no DNS hook. Two ways around it:
  - resolve in JS and rewrite the URL to the IP. Works only if the server accepts requests without the right `Host` header; many Xtream panels do, but this needs testing per server;
  - or patch expo-video to use `OkHttpDataSource` with the same DoH client (patch-package, upkeep on every expo-video upgrade).
- Effort: 1–2 days. Encrypts DNS only; the ISP still sees IPs and plain HTTP.

### C. Embedded WireGuard tunnel, only for this app

Bundle a WireGuard client in the app with Android's `VpnService` and route only StreamViewer's traffic through it (`addAllowedApplication(own package)`).

- Building blocks: `com.wireguard.android:tunnel` (official library, Maven Central, userspace `GoBackend`), a small Expo native module (Kotlin) exposing `connect(config)`, `disconnect()` and `status()`, and a config plugin that declares the `VpnService` (`BIND_VPN_SERVICE` permission) and the foreground-service entries.
- Config: a WireGuard `.conf` from a provider that issues them (Proton, Mullvad, Surfshark, IVPN) or from your own server (a cheap VPS outside France running WireGuard). Store it next to the credential sets, one optional `vpn` field per set, so each line can have its own exit.
- UX: Android shows its VPN consent dialog once (D-pad navigable on Android TV and Fire TV); a key icon then sits in the status bar. Add a VPN toggle and status to the home screen, and an "auto-connect before playback" option.
- Effort: 3–5 days including Fire TV testing. Then upkeep on native upgrades (Expo SDK, Android target SDK, foreground-service type rules).
- Risks: Android only (no web). Commercial VPN exit IPs are sometimes blocked by IPTV providers, as datacenter IPs are; a self-hosted VPS has the same risk. Battery and CPU are a non-issue on mains-powered TVs, but userspace WireGuard on a low-end Fire TV Stick can cap throughput: measure with a 4K/FHD channel.

### D. Self-hosted relay instead of a VPN *(not recommended)*

The app already has a stream relay (`api/stream.js`) for the web build. Native could route through a relay hosted outside France. On Vercel it is not viable for live TV (function duration limits, bandwidth cost), and on a VPS it is more code than WireGuard for less protection: plain HTTP to the relay unless TLS is added, and the provider sees a datacenter IP either way.

## Plan

1. **Diagnose (½ day).** Add a "Network check" action to the server picker: for each server, resolve the hostname with the system resolver and with DoH (`https://cloudflare-dns.com/dns-query`), then call `player_api.php` on both. Results:
   - system DNS fails or returns a block page IP, DoH works → DNS blocking → step 3.
   - both resolve, API or playback fails, works on a phone with a VPN → IP blocking → step 4.
   - everything works → the VPN is only for privacy → step 2 is enough.
2. **Today, with no code:** install Proton VPN or WireGuard on the TV, enable split tunnelling for StreamViewer only, check that "Find best" and a live channel work. Add the VPN status chip (½ day).
3. **If DNS blocking only:** option B for the API, then test the IP-rewrite approach for playback on each server; fall back to step 4 if servers reject IP-based requests.
4. **If the app must be self-contained** (a TV where you don't want to manage a separate VPN app, or several family TVs): option C, per credential set, behind a toggle that defaults off.

Decision points for you: which TVs this must run on (Fire TV Stick generation matters for step 4 throughput), and whether a paid VPN account or a VPS you manage is acceptable as the exit.
