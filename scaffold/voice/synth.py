"""Ultrademo local voice synthesis (batch).

Runs inside the engine's own uv-managed environment (voice/.envs/<engine>), one model load
per batch. The Node pipeline (tts/narration.mjs) owns chunking, caching, the alignment audit,
pace and loudness; this file only turns text into WAV.

    python synth.py <jobs.json>

jobs.json: {
  "engine": "pocket" | "chatterbox",
  "voice": "eve" | "george" | "<path to wav>"      (pocket: built-in name or reference wav)
         | "default" | "clone"                      (chatterbox: built-in voice, or Turbo clone)
  "reference": "<path to 10 s wav>" | null,         (chatterbox clone only)
  "params": {"exaggeration": 0.5, "cfg_weight": 0.5},
  "items": [{"id": "...", "text": "...", "out": "/abs/path.wav", "seed": 123}]
}
Prints one JSON line per item ({"id", "ok", "secs", "wall"} or {"id", "ok": false, "error"})
and a final {"done": true, "engine", "device", "sample_rate"}.
"""
import json, sys, time, traceback

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n"); sys.stdout.flush()

def main():
    jobs = json.load(open(sys.argv[1]))
    engine, voice = jobs["engine"], jobs.get("voice", "default")
    import numpy as np, soundfile as sf

    if engine == "pocket":
        from pocket_tts import TTSModel
        model = TTSModel.load_model()
        state = model.get_state_for_audio_prompt(voice)
        sr = model.sample_rate
        device = "cpu"
        def synth(text, seed):
            import torch
            if seed is not None: torch.manual_seed(seed)
            a = model.generate_audio(state, text)
            return a.detach().cpu().numpy() if hasattr(a, "detach") else np.asarray(a)

    elif engine == "chatterbox":
        import torch
        import perth
        # resemble-perth 1.0.1 ships PerthImplicitWatermarker as None on some installs and
        # ChatterboxTTS.__init__ calls it. Fall back to a pass-through so synthesis works;
        # the skill does not add the PerTh watermark in that case.
        if getattr(perth, "PerthImplicitWatermarker", None) is None:
            class _NoWatermark:
                def apply_watermark(self, wav, sample_rate=None, **kw): return wav
                def get_watermark(self, wav, sample_rate=None, **kw): return 0.0
            perth.PerthImplicitWatermarker = _NoWatermark
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        params = jobs.get("params") or {}
        if voice == "clone":
            from chatterbox.tts_turbo import ChatterboxTurboTTS
            model = ChatterboxTurboTTS.from_pretrained(device=device)
            ref = jobs["reference"]
            def synth(text, seed):
                if seed is not None: torch.manual_seed(seed)
                return model.generate(text, audio_prompt_path=ref).detach().cpu().numpy().squeeze()
        else:
            from chatterbox.tts import ChatterboxTTS
            model = ChatterboxTTS.from_pretrained(device=device)
            kw = {k: float(params[k]) for k in ("exaggeration", "cfg_weight") if k in params}
            def synth(text, seed):
                if seed is not None: torch.manual_seed(seed)
                return model.generate(text, **kw).detach().cpu().numpy().squeeze()
        sr = model.sr
    else:
        emit({"done": False, "error": f"unknown engine {engine}"}); return 2

    for it in jobs["items"]:
        t0 = time.perf_counter()
        try:
            a = np.asarray(synth(it["text"], it.get("seed")), dtype=np.float32).squeeze()
            sf.write(it["out"], a, sr)
            emit({"id": it["id"], "ok": True, "secs": round(len(a) / sr, 3), "wall": round(time.perf_counter() - t0, 2)})
        except Exception as e:
            emit({"id": it["id"], "ok": False, "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-800:]})
    emit({"done": True, "engine": engine, "device": device, "sample_rate": sr})
    return 0

if __name__ == "__main__":
    sys.exit(main())
