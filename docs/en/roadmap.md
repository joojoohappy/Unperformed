# Roadmap

[繁體中文](../zh-TW/roadmap.md)

The MVP proves the workflow end to end. These are the next steps, in priority
order. Each is sized to be one focused piece of work.

## Next

1. **Broaden the Live AI evaluation.** The six examples have been run against
   the real API (see [evaluation](evaluation.md#live-ai-model-calls-latency-and-cost)).
   Next: 10–20 varied ideas of your own in both languages, other requests, and
   a cheaper model for analysis, compared on the same runs.
2. **Measure on real hardware.** Run `BENCH_GPU=1 pnpm bench:browser` on a
   GPU-backed desktop and the in-app review on a mid-range phone, and publish
   the numbers (see [evaluation](evaluation.md#real-hardware)). Adaptive
   quality is in place; its thresholds may need tuning once real numbers exist.

## Then

- **More negotiation scenarios with real rules:** a rule for whole-palette
  warmth and for slowing down, and section-level tempo or length changes.
  (Warmer ending, more chaos and faster tempo have rules now.)
- **Art direction, further:** camera language per section type, per-mood
  palettes, and letting reduced quality drop the light beam too on slow
  devices. (A first pass of light, air and motion per section type shipped
  after 0.1.0.)
- **Sound, further:** per-mood instruments and a mix measured on real
  speakers. (A voice per section type shipped after 0.1.0.)
- **Sharing:** export and import a score; a read-only link to a performance.
- **Accessibility audit** with screen reader users; captions or audio
  description for the performance.
- **Browser coverage:** Firefox and Safari in CI.

## Not planned

- Executable content in scores (scripts, shaders from a model). The score stays
  data only. See [design decisions](design-decisions.md).
- Strobe effects. The 2 Hz cap is a safety rule, not a setting.
