"""
GeoVera FFmpeg Stitcher — Modal Web Endpoint
Concatenates Runway video clips and uploads the result to Cloudflare R2.

Deploy:
  modal deploy modal/ffmpeg_stitcher.py

Required Modal secrets (create once):
  modal secret create geovera-r2 \
    R2_ACCOUNT_ID=<cloudflare_account_id> \
    R2_ACCESS_KEY_ID=<r2_access_key_id> \
    R2_SECRET_ACCESS_KEY=<r2_secret_access_key> \
    R2_BUCKET=geovera-media \
    R2_PUBLIC_URL=https://pub-xxx.r2.dev   # or your custom R2 domain

After deploy, set the endpoint URL as a Supabase secret:
  supabase secrets set MODAL_FFMPEG_URL=<url_from_deploy_output> --project-ref vozjwptzutolvkvfpknk
"""

import modal
import os
import tempfile
import subprocess
import time
from pathlib import Path

app = modal.App("geovera-ffmpeg-stitcher")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("httpx==0.27.0", "boto3==1.34.0")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("geovera-r2")],
    timeout=300,
    memory=2048,
)
@modal.web_endpoint(method="POST")
def stitch_videos(request: dict) -> dict:
    """
    Input:  { "video_urls": ["https://...", ...], "output_key": "stitched_abc123" }
    Output: { "url": "https://r2.../stitched_abc123.mp4", "clips": N, "duration_s": X }
    """
    import httpx
    import boto3
    from botocore.config import Config

    video_urls: list[str] = request.get("video_urls", [])
    output_key: str = request.get("output_key", f"stitched_{int(time.time())}")

    if not video_urls:
        return {"error": "no video_urls provided"}

    if len(video_urls) == 1:
        return {"url": video_urls[0], "clips": 1, "duration_s": None}

    # ── R2 config ────────────────────────────────────────────────────────────
    r2_account_id    = os.environ["R2_ACCOUNT_ID"]
    r2_access_key    = os.environ["R2_ACCESS_KEY_ID"]
    r2_secret_key    = os.environ["R2_SECRET_ACCESS_KEY"]
    r2_bucket        = os.environ.get("R2_BUCKET", "geovera-media")
    r2_public_url    = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    r2_endpoint      = f"https://{r2_account_id}.r2.cloudflarestorage.com"

    s3 = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=r2_access_key,
        aws_secret_access_key=r2_secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        clip_paths: list[Path] = []

        # ── 1. Download all clips ─────────────────────────────────────────────
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            for i, url in enumerate(video_urls):
                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                    clip_path = tmp / f"clip_{i:03d}.mp4"
                    clip_path.write_bytes(resp.content)
                    clip_paths.append(clip_path)
                    print(f"[ffmpeg] Downloaded clip {i}: {len(resp.content) / 1024:.0f} KB")
                except Exception as e:
                    print(f"[ffmpeg] Skip clip {i}: {e}")

        if not clip_paths:
            return {"error": "all clip downloads failed", "url": video_urls[0]}

        if len(clip_paths) == 1:
            return {"url": video_urls[0], "clips": 1, "duration_s": None}

        # ── 2. Re-encode to uniform H.264 + AAC ──────────────────────────────
        reencoded: list[Path] = []
        for i, clip in enumerate(clip_paths):
            out = tmp / f"reenc_{i:03d}.mp4"
            result = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(clip),
                    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                    "-c:a", "aac", "-ar", "44100",
                    "-movflags", "+faststart",
                    str(out),
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and out.exists():
                reencoded.append(out)
            else:
                print(f"[ffmpeg] Re-encode failed clip {i}: {result.stderr[-300:]}")
                reencoded.append(clip)

        # ── 3. Build concat list + stitch ────────────────────────────────────
        concat_list = tmp / "concat.txt"
        concat_list.write_text("".join(f"file '{p}'\n" for p in reencoded))

        output_path = tmp / "stitched.mp4"
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", str(concat_list),
                "-c", "copy",
                "-movflags", "+faststart",
                str(output_path),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0 or not output_path.exists():
            print(f"[ffmpeg] Concat failed: {result.stderr[-300:]}")
            return {"error": "ffmpeg concat failed", "url": video_urls[0]}

        video_bytes = output_path.read_bytes()
        size_mb = len(video_bytes) / 1024 / 1024
        print(f"[ffmpeg] Stitched {len(reencoded)} clips → {size_mb:.1f} MB")

        # ── 4. Get duration ───────────────────────────────────────────────────
        duration_s: float | None = None
        dur = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(output_path)],
            capture_output=True, text=True,
        )
        if dur.returncode == 0:
            try:
                duration_s = float(dur.stdout.strip())
            except ValueError:
                pass

        # ── 5. Upload to Cloudflare R2 ────────────────────────────────────────
        r2_key = f"videos/{output_key}.mp4"
        s3.put_object(
            Bucket=r2_bucket,
            Key=r2_key,
            Body=video_bytes,
            ContentType="video/mp4",
        )

        public_url = (
            f"{r2_public_url}/{r2_key}"
            if r2_public_url
            else f"{r2_endpoint}/{r2_bucket}/{r2_key}"
        )
        print(f"[ffmpeg] Uploaded → {public_url}")

        return {
            "url": public_url,
            "clips": len(reencoded),
            "duration_s": duration_s,
            "size_mb": round(size_mb, 2),
        }
