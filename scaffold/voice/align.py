"""Ultrademo narration alignment and audit (batch).

Given a WAV and the script it was supposed to say, returns per-word timings for the SCRIPT
words (so captions show the script, not the transcript) and the places where what was heard
diverges from the script: repeats, drops, mispronunciations. The transcript is evidence; the
script is truth. Runs in the voice/.envs/align environment (faster-whisper, CPU).

    python align.py <jobs.json>

jobs.json: {"model": "base.en", "items": [{"id": "...", "wav": "/abs.wav", "text": "..."}]}
Prints one JSON line per item:
  {"id", "ok": true, "words": [{"w", "start", "end"}], "heard": "...", "similarity": 0.0-1.0,
   "divergences": [{"type": "replace|insert|delete", "at": seconds, "script": "...", "heard": "..."}]}
"""
import json, re, sys, difflib

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split()

def num_words(n):
    n = int(n)
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + num_words(n % 100))
    return str(n)

def norm_tokens(text):
    t = text.lower().replace("’", "'")
    t = re.sub(r"\b(\d{1,3})\b", lambda m: num_words(m.group(1)), t)
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    return t.split()

def main():
    jobs = json.load(open(sys.argv[1]))
    from faster_whisper import WhisperModel
    model = WhisperModel(jobs.get("model", "base.en"), device="cpu", compute_type="int8")
    for it in jobs["items"]:
        try:
            segs, _ = model.transcribe(it["wav"], word_timestamps=True, beam_size=5, condition_on_previous_text=False)
            heard = [w for s in segs for w in (s.words or [])]
            heard_tok = [norm_tokens(w.word) for w in heard]
            # one whisper "word" can normalise to several tokens (e.g. "20" -> "twenty"); flatten with timing
            flat = []
            for w, toks in zip(heard, heard_tok):
                for k, tok in enumerate(toks):
                    span = (w.end - w.start) / max(1, len(toks))
                    flat.append((tok, w.start + k * span, w.start + (k + 1) * span))
            script_words = it["text"].split()
            script_tok = [norm_tokens(w) for w in script_words]
            # script word -> list of token indices (a script word may normalise to 0..n tokens)
            s_flat, owner = [], []
            for i, toks in enumerate(script_tok):
                for tok in toks: s_flat.append(tok); owner.append(i)
            sm = difflib.SequenceMatcher(a=s_flat, b=[f[0] for f in flat], autojunk=False)
            # timing per script token: equal blocks map 1:1; everything else interpolates across the heard span
            tok_time = [None] * len(s_flat)
            divergences = []
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    for k in range(i2 - i1): tok_time[i1 + k] = (flat[j1 + k][1], flat[j1 + k][2])
                else:
                    at = flat[j1][1] if j1 < len(flat) else (flat[-1][2] if flat else 0.0)
                    divergences.append({"type": tag, "at": round(at, 2), "script": " ".join(s_flat[i1:i2]), "heard": " ".join(f[0] for f in flat[j1:j2])})
                    if i2 > i1:
                        t0 = flat[j1][1] if j1 < len(flat) else (flat[-1][2] if flat else 0.0)
                        t1 = flat[j2 - 1][2] if j2 > j1 else t0
                        if t1 <= t0: t1 = t0 + 0.25 * (i2 - i1)
                        for k in range(i2 - i1):
                            a = t0 + (t1 - t0) * k / (i2 - i1); b = t0 + (t1 - t0) * (k + 1) / (i2 - i1)
                            tok_time[i1 + k] = (a, b)
            # collapse tokens back to script words
            words = []
            for i, w in enumerate(script_words):
                ts = [tok_time[k] for k in range(len(s_flat)) if owner[k] == i and tok_time[k]]
                if ts: words.append({"w": w, "start": round(min(t[0] for t in ts), 3), "end": round(max(t[1] for t in ts), 3)})
                elif words: words.append({"w": w, "start": words[-1]["end"], "end": words[-1]["end"]})
                else: words.append({"w": w, "start": 0.0, "end": 0.0})
            # fill silent words (punctuation-only) by neighbours so the track is monotonic
            for k in range(1, len(words)):
                if words[k]["start"] < words[k - 1]["end"]: words[k]["start"] = words[k - 1]["end"]
                if words[k]["end"] < words[k]["start"]: words[k]["end"] = words[k]["start"]
            print(json.dumps({"id": it["id"], "ok": True, "words": words, "heard": " ".join(f[0] for f in flat), "similarity": round(sm.ratio(), 3), "divergences": divergences}), flush=True)
        except Exception as e:
            print(json.dumps({"id": it["id"], "ok": False, "error": f"{type(e).__name__}: {e}"}), flush=True)
    print(json.dumps({"done": True}), flush=True)

if __name__ == "__main__":
    main()
