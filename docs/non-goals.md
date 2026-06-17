# Non-Goals

What Echelon explicitly does NOT do. Stating this is a strength — a privacy
tool that pretends to be a magic cloak gets people hurt. Read with
`docs/privacy-claims.md`.

## Echelon does NOT...

1. **...make you invisible to a global passive adversary.**
   An adversary who can observe a large fraction of the network and do
   traffic confirmation across both ends can still attack I2P (and Tor).
   Echelon rides on I2P; it inherits I2P's limits. We close the
   app/transport-shape gaps, not the global-observer problem.

2. **...fix a compromised endpoint.**
   Rooted phone, malware, a hostile keyboard, a clipboard stealer, a
   backdoored OS — game over before Echelon runs. We protect the network
   + content boundary, not the device.

3. **...make unsafe wallet behavior safe.**
   If you sign a malicious transaction, reuse a doxxed wallet, or paste
   your seed phrase somewhere, Echelon can't save you. Wallet connect is
   capability-scoped and never required to browse — but it's still your
   wallet.

4. **...anonymize your Solana RPC activity by default.**
   When you connect a wallet, requests go to the RPC endpoint you chose,
   over clearnet, linking that wallet to that RPC's view. Routing RPC
   through a privacy path is a separate, modeled feature (roadmap), not
   an automatic property today.

5. **...anonymize the outproxy/clearnet path.**
   If YOU enable the clearnet outproxy, the exit relay sees your request's
   content + destination (not your IP). Don't send secrets through it.
   This is opt-in and labeled; it is not the default eepsite path.

6. **...un-dox content you publish.**
   If you host an eepsite with identifying info in it, that's on you. We
   serve your files; we can't scrub your identity out of your own content.

7. **...hide that you use Yggdrasil (if you enable it).**
   Your Yggdrasil peers see you're a node on the mesh. They carry i2pd
   ciphertext, not your browsing — but the meta-fact of mesh membership is
   visible. It's a NAT-traversal transport assist, not an anonymity layer.

8. **...silently fall back to an unsafe mode.**
   If routing can't be done safely, the browser refuses and the Network
   Doctor tells you why — it does not quietly fetch over clearnet. No
   privacy claim degrades without the UI saying so.

9. **...replace operational security.**
   Timing your activity, correlating across services, naming your eepsite
   after your cat — behavioral deanonymization is yours to manage. Tools
   are armor, not absolution.

## What this means in practice

Echelon is the right tool for: browsing + publishing eepsites safely from a
hostile network on a phone, resisting hostile-content deanonymization, and
reducing traffic-shape fingerprinting. It is the wrong tool if your threat
model is a nation-state with global network visibility specifically
targeting you — for that, no single low-latency overlay suffices, and you
should consult people who do this for a living.
