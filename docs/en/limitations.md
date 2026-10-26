# Known limitations

[繁體中文](../zh-TW/limitations.md)

An honest list of what UNPERFORMED does not do yet, or has not been verified to
do.

## Live AI

- **Not yet verified against the real API.** The service was built and tested
  without an API key. The tests replace the HTTP transport with an in-memory
  fake: they prove the request shape, validation, retries, error mapping and
  usage accounting, not the creative quality of a real model's answers or the
  real latency and cost. See [evaluation](evaluation.md) for how to measure
  them.
- Cost estimates use a static price table in `services/ai/src/unperformed_ai/config.py`.
- Live AI needs the service to be running. A static deployment can only offer
  demo mode.

## Demo mode

- The rule-based planner recognises a limited vocabulary in English and
  Traditional Chinese (order, collapse, chaos, silence, dawn, flow, and
  similar). Ideas it does not recognise get a generic four-part arc, and the
  Compose stage says so.
- Negotiation understands five kinds of request: climax explosion, a loud
  ending, strobe or flashing, warmer colours, and more chaos. Anything else is
  answered with "not understood" and nothing changes.
- Only the climax scenario has a full creative-difference rule. Other requests
  are either constraint conflicts, safety notices or agreements.

## Rendering and audio

- Measured only in headless Chromium with SwiftShader (software WebGL). No
  GPU-backed browser, Firefox or Safari measurements have been made. Safari
  and Firefox have not been tested.
- The 3D stage is a single instanced mesh of 240 elements with simple lights. It
  is deliberately restrained and not yet art-directed per section.
- The 2D fallback has no lighting model and draws a flat projection.
- Sound is synthesised from oscillators and filtered noise; timbres are simple.
- The JavaScript bundle is one 782 KB chunk (216 KB gzip), most of it three.js.
  There is no code splitting yet.

## Safety and accessibility

- The flash check estimates luminance from the key light colour and intensity
  in the sampled timeline. It does not measure rendered pixels. The engine caps
  modulation at 2 Hz and 30% depth regardless.
- The interface is keyboard operable, labelled, and follows reduced-motion
  preferences, but it has not been audited with screen reader users.

## Product

- One person, one browser. Sessions live in `localStorage`: no accounts, no
  sharing, no server persistence. Export is a JSON download.
- The Traditional Chinese interface and documents were written alongside the
  English and have not yet been reviewed by a native editor.

## Media

- The demo video was captured frame by frame with a virtual clock, because
  software WebGL cannot render in real time. See [media](media.md).
