#!/usr/bin/env python3
"""Generate or edit an image with the gpt-image deployment on Microsoft Foundry.

Standard library only. Reads AZURE_OPENAI_ENDPOINT, AZURE_API_KEY and
AZURE_IMAGE_DEPLOYMENT from the environment, or from the nearest .env file
found walking up from the current directory.

Text to image:
    python generate_image.py --prompt "..." --size 1024x1024 --out icon.png

Image to image (guide or reference pictures, optional mask):
    python generate_image.py --prompt "..." --image guide.png --size 1440x960 --out map.png

Every output gets a sidecar <out>.json with the prompt, model, size, quality,
token usage and request id, so the result can be stored as an Asset and
repeated later.

The deployment allows 2 requests per 60 s, and failed requests count too.
A shared timestamp file throttles all invocations on this machine, and 429
responses are retried after the wait the server asks for.
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

RATE_LIMIT = 2
RATE_WINDOW = 60.0
MAX_RETRIES = 4
STAMP_FILE = Path(os.environ.get("TEMP") or os.environ.get("TMPDIR") or "/tmp") / "foundry-image-ratelimit.json"


def load_env():
    for d in [Path.cwd(), *Path.cwd().parents]:
        f = d / ".env"
        if f.is_file():
            for line in f.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            break
    missing = [k for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_API_KEY") if not os.environ.get(k)]
    if missing:
        sys.exit(f"Missing {', '.join(missing)}: set them in the environment or in a .env file at the project root.")
    return (
        os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/"),
        os.environ["AZURE_API_KEY"],
        os.environ.get("AZURE_IMAGE_DEPLOYMENT", "gpt-image-2.5-flare"),
    )


def wait_for_slot():
    """Block until a request fits in the rolling window, then record it."""
    while True:
        try:
            stamps = json.loads(STAMP_FILE.read_text())
        except (OSError, ValueError):
            stamps = []
        now = time.time()
        stamps = [t for t in stamps if now - t < RATE_WINDOW]
        if len(stamps) < RATE_LIMIT:
            stamps.append(now)
            STAMP_FILE.write_text(json.dumps(stamps))
            return
        delay = RATE_WINDOW - (now - min(stamps)) + 0.5
        print(f"Rate limit: waiting {delay:.0f} s for a free slot...", file=sys.stderr)
        time.sleep(delay)


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = bytearray()
    for name, value in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    for name, path in files:
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        out += (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{Path(path).name}"\r\n'
                f"Content-Type: {ctype}\r\n\r\n").encode()
        out += Path(path).read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def retry_after(err, body):
    header = err.headers.get("retry-after") if err.headers else None
    if header and header.isdigit():
        return int(header) + 1
    m = re.search(r"retry after (\d+) second", body)
    return int(m.group(1)) + 1 if m else RATE_WINDOW


def call(url, key, body, ctype):
    for attempt in range(MAX_RETRIES + 1):
        wait_for_slot()
        req = urllib.request.Request(url, data=body, method="POST",
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read()), r.headers.get("apim-request-id")
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            if e.code == 429 and attempt < MAX_RETRIES:
                delay = retry_after(e, text)
                print(f"429 from server, retrying in {delay} s...", file=sys.stderr)
                time.sleep(delay)
                continue
            try:
                msg = json.loads(text)["error"]["message"]
            except (ValueError, KeyError, TypeError):
                msg = text[:500]
            sys.exit(f"HTTP {e.code}: {msg}")
    sys.exit("Gave up after repeated rate limiting.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--prompt")
    g.add_argument("--prompt-file", help="read the prompt from a text file")
    p.add_argument("--out", required=True, help="output path; with --n > 1, _1, _2... are appended")
    p.add_argument("--size", default="1024x1024",
                   help="WxH, both divisible by 16 (any aspect ratio the model accepts), or 'auto'")
    p.add_argument("--quality", default="medium", choices=["low", "medium", "high", "auto"])
    p.add_argument("--background", default="auto", choices=["auto", "opaque", "transparent"])
    p.add_argument("--format", default=None, choices=["png", "webp", "jpeg"], help="default: from --out extension")
    p.add_argument("--compression", type=int, default=None, help="0-100, webp/jpeg only")
    p.add_argument("--n", type=int, default=1, help="images per request (one request against the rate limit)")
    p.add_argument("--image", action="append", default=[], help="input image for an edit; repeat for several")
    p.add_argument("--mask", help="PNG mask for an edit: transparent pixels are repainted")
    a = p.parse_args()

    if a.size != "auto":
        m = re.fullmatch(r"(\d+)x(\d+)", a.size)
        w, h = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
        problem = ("use WxH" if not m else "both sides must be divisible by 16" if w % 16 or h % 16
                   else "longest edge is 3840" if max(w, h) > 3840 else "aspect ratio is at most 3:1" if max(w, h) > 3 * min(w, h)
                   else "at most 8,294,400 pixels (3840x2160)" if w * h > 8_294_400
                   else "at least 655,360 pixels (e.g. 1024x640)" if w * h < 655_360 else None)
        if problem:
            sys.exit(f"--size {a.size}: {problem}. Checked locally because a rejected request still costs a rate-limit slot.")
    for f in a.image + ([a.mask] if a.mask else []):
        if not Path(f).is_file():
            sys.exit(f"Input file not found: {f}")
    if a.mask and not a.image:
        sys.exit("--mask needs --image.")

    endpoint, key, model = load_env()
    prompt = Path(a.prompt_file).read_text(encoding="utf-8").strip() if a.prompt_file else a.prompt
    out = Path(a.out)
    fmt = a.format or {".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp"}.get(out.suffix.lower(), "png")
    if fmt == "png" and a.compression is not None:
        a.compression = None
    params = {"model": model, "prompt": prompt, "size": a.size, "n": a.n, "quality": a.quality,
              "output_format": fmt, "background": a.background}
    if a.compression is not None:
        params["output_compression"] = a.compression

    started = time.time()
    if a.image:
        fields = {k: str(v) for k, v in params.items()}
        files = [("image[]" if len(a.image) > 1 else "image", f) for f in a.image]
        if a.mask:
            files.append(("mask", a.mask))
        body, ctype = multipart(fields, files)
        resp, req_id = call(f"{endpoint}/images/edits", key, body, ctype)
    else:
        resp, req_id = call(f"{endpoint}/images/generations", key, json.dumps(params).encode(), "application/json")
    elapsed = round(time.time() - started, 1)

    out.parent.mkdir(parents=True, exist_ok=True)
    written = []
    for i, item in enumerate(resp.get("data", []), 1):
        path = out if len(resp["data"]) == 1 else out.with_name(f"{out.stem}_{i}{out.suffix}")
        path.write_bytes(base64.b64decode(item["b64_json"]))
        meta = {
            "file": path.name, "kind": "edit" if a.image else "generation", "model": model, "prompt": prompt,
            "revised_prompt": item.get("revised_prompt"), "size": resp.get("size", a.size),
            "quality": resp.get("quality", a.quality), "background": resp.get("background", a.background),
            "output_format": fmt, "input_images": a.image, "mask": a.mask, "usage": resp.get("usage"),
            "request_id": req_id, "seconds": elapsed, "created": resp.get("created"),
        }
        path.with_suffix(path.suffix + ".json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        written.append(str(path))
    if not written:
        sys.exit(f"No image in response: {json.dumps(resp)[:500]}")
    usage = resp.get("usage") or {}
    print(json.dumps({"files": written, "size": resp.get("size"), "quality": resp.get("quality"),
                      "seconds": elapsed, "total_tokens": usage.get("total_tokens")}))


if __name__ == "__main__":
    main()
