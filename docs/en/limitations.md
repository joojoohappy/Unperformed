# Known limitations

[繁體中文](../zh-TW/limitations.md)

An honest list of what UNPERFORMED does not do yet, or has not been verified to
do.

## Live AI

- **Verified against the real API on a small sample only.** On 2026-10-26 the
  full workflow ran against `claude-opus-5-5` for the six example ideas in both
  languages: 36 calls, no failures or retries, every request classified
  correctly (see [evaluation](evaluation.md#live-ai-model-calls-latency-and-cost)).
  Ideas beyond the examples, other models, and creative quality as judged by
  users have not been tested.
- The model's short acknowledgement is written before the engine applies the
  change, so it can describe the change loosely (for example "more chaos" on a
  plan with no fracture section).
- Cost estimates use a static price table in `services/ai/src/unperformed_ai/config.py`.
- Live AI needs the service to be running. A static deployment can only offer
  demo mode.

## Demo mode

- The rule-based planner recognises a limited vocabulary in English and
  Traditional Chinese (order, collapse, chaos, silence, dawn, flow, and
  similar). Ideas it does not recognise get a generic four-part arc, and the
  Compose stage says so.
- Negotiation understands eight kinds of request: climax explosion, a loud
  ending, strobe or flashing, warmer colours, a warmer ending, more chaos,
  faster and slower. Anything else is answered with "not understood" and
  nothing changes.
- Four scenarios have a creative-difference rule: the climax, a warmer ending,
  more chaos in the fracture, and a faster tempo (see
  [negotiation protocol](negotiation-protocol.md#scenarios-with-rules)). The
  rest are constraint conflicts, safety notices or agreements.
- Live AI classification into the new kinds has been run against the real
  model only on the six examples (24 of 24 correct).

## Rendering and audio

- Measured in headless Chromium with SwiftShader (software WebGL) and on one
  GPU-backed laptop (Edge on a Snapdragon X Surface Laptop) and one flagship
  phone (Safari on an iPhone 17 Pro). No mid-range phone has been measured. Safari and Firefox have not been tested.
- Adaptive quality has one reduced level and only steps down. Its rule was
  tuned once, from a single iPhone measurement; the new rule has not yet been
  measured on a device.
- The 3D stage is a single instanced mesh of 240 elements with simple lights. It
  is deliberately restrained and not yet art-directed per section.
- The 2D fallback has no lighting model and draws a flat projection.
- Sound is synthesised from oscillators and filtered noise; timbres are simple.
- three.js is loaded on demand, but it is still a 471 KB chunk (119 KB gzip)
  that every stage view needs; the stage cannot render before it arrives.

## Safety and accessibility

- The flash check estimates luminance from the key light colour and intensity
  in the sampled timeline. It does not measure rendered pixels. The engine caps
  modulation at 2 Hz and 30% depth regardless.
- The interface is keyboard operable, labelled, and follows reduced-motion
  preferences, but it has not been audited with screen reader users.

## Product

- One person, one browser. Sessions live in `localStorage`: no accounts, no
  sharing, no server persistence. Export is a JSON download.
- The Traditional Chinese terminology, tagline and key interface strings were
  reviewed with a native speaker (the project owner) in October 2026. The
  long-form docs have not had a line-by-line edit by a professional editor.

## Media

- The demo video was captured frame by frame with a virtual clock, because
  software WebGL cannot render in real time. See [media](media.md).
