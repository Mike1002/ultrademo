# voice/ — local narration engines

Python lives here only to turn text into WAV and to align audio to a script. Everything else
(chunking, caching, the audit, pace, loudness, the storyboard write) is Node, in `tts/`.

| File | Role |
|---|---|
| `synth.py` | Batch synthesis for one engine: `pocket` or `chatterbox`. One model load per batch. |
| `align.py` | faster-whisper alignment of a WAV against its script: word timings for the script words plus the divergences (repeats, drops, mispronunciations). |
| `engines/<name>.txt` | Pinned requirements per environment: `pocket`, `chatterbox`, `align`. |
| `.envs/<name>/` | The environments, created by `npm run voice -- setup <name>` with `uv`. Git-ignored. |

## Tiers

| Spec | Tier | Cost on first use | Runs on |
|---|---|---|---|
| `pocket:eve`, `pocket:george` | default, free | 0.8 GB packages + 0.45 GB weights | any CPU, about 0.15x realtime |
| `chatterbox:default` | expressive, free | 1.0 GB packages (PyTorch) + 3.2 GB weights | CUDA or Apple silicon; slow on plain CPU |
| `chatterbox:clone=<10s.wav>` | expressive, cloned | + 4.0 GB Turbo weights | same |
| `elevenlabs[:<voiceId>]` | premium | the user's own key in `.env` | cloud |
| `say` | placeholder | nothing | macOS only |

Plus `align` (0.2 GB + 0.15 GB), needed for word-timed captions and the audit on every local voice.
Nothing downloads until the user picks a tier; the skill quotes the size and waits for a go.

## Why uv

A single static binary for macOS, Linux and Windows that also provides its own Python builds,
so users never manage a system Python. Install: https://docs.astral.sh/uv/getting-started/installation/

## Known quirks

- `HF_HUB_DISABLE_XET=1` is set for every synth/align run: Hugging Face's xet transfer crawled
  to ~200 KB/s on at least one Mac while plain HTTP ran at 2 MB/s.
- `resemble-perth` 1.0.1 can expose `PerthImplicitWatermarker` as `None`; `synth.py` then skips
  the PerTh watermark rather than crash. Whether the skill should add that watermark is open.
- `av` is pinned in `align.txt`: faster-whisper 1.2.1 breaks on PyAV 19.
- Chatterbox occasionally re-reads a phrase. The pipeline generates per sentence, audits every
  chunk against the script and regenerates divergent ones (up to 3 attempts) before flagging.
