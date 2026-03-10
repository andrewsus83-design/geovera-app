"""
GeoVera FFmpeg Stitcher — Modal Web Endpoint
Concatenates Runway video clips into a single stitched video.

Deploy:
  modal deploy modal/ffmpeg_stitcher.py

Setup (once):
  modal secret create geovera-supabase \
    SUPABASE_URL=https://vozjwptzutolvkvfpknk.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>

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
    .pip_install("httpx==0.27.0")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("geovera-supabase")],
    timeout=300,
    memory=2048,
)
@modal.web_endpoint(method="POST")
def stitch_videos(request: dict) -> dict:
    """
    Input:  { "video_urls": ["https://...", ...], "output_key": "stitched_abc123" }
    Output: { "url": "https://...", "clips": N, "duration_s": X }
    """
    import httpx

    video_urls: list[str] = request.get("video_urls", [])
    output_key: str = request.get("output_key", f"stitched_{int(time.time())}")

    if not video_urls:
        return {"error": "no video_urls provided"}

    if len(video_urls) == 1:
        # Nothing to stitch
        return {"url": video_urls[0], "clips": 1, "duration_s": None}

    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    bucket = "images"
    storage_path = f"videos/{output_key}.mp4"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        clip_paths: list[Path] = []

        # ── 1. Download all clips ─────────────────────────────────────
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            for i, url in enumerate(video_urls):
                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                    clip_path = tmp / f"clip_{i:03d}.mp4"
                    clip_path.write_bytes(resp.content)
                    clip_paths.append(clip_path)
                except Exception as e:
                    print(f"[ffmpeg-stitcher] Skip clip {i}: {e}")

        if not clip_paths:
            return {"error": "all clip downloads failed", "url": video_urls[0]}

        if len(clip_paths) == 1:
            # Only one clip downloaded successfully — return it directly
            return {"url": video_urls[0], "clips": 1, "duration_s": None}

        # ── 2. Re-encode each clip to uniform codec/resolution ────────
        # Runway clips can have slightly different resolutions — re-encode for safe concat
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
                print(f"[ffmpeg-stitcher] Re-encode failed clip {i}: {result.stderr[-500:]}")
                reencoded.append(clip)  # fallback: use original

        # ── 3. Build concat list ──────────────────────────────────────
        concat_list = tmp / "concat.txt"
        lines = [f"file '{p}'\n" for p in reencoded]
        concat_list.write_text("".join(lines))

        # ── 4. FFmpeg concat ──────────────────────────────────────────
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
            print(f"[ffmpeg-stitcher] Concat failed: {result.stderr[-500:]}")
            return {"error": "ffmpeg concat failed", "url": video_urls[0]}

        video_bytes = output_path.read_bytes()
        size_mb = len(video_bytes) / 1024 / 1024
        print(f"[ffmpeg-stitcher] Stitched {len(reencoded)} clips → {size_mb:.1f} MB")

        # ── 5. Get duration ───────────────────────────────────────────
        duration_s: float | None = None
        dur_result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(output_path),
            ],
            capture_output=True,
            text=True,
        )
        if dur_result.returncode == 0:
            try:
                duration_s = float(dur_result.stdout.strip())
            except ValueError:
                pass

        # ── 6. Upload to Supabase Storage ─────────────────────────────
        upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{storage_path}"
        headers = {
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        }

        with httpx.Client(timeout=120) as client:
            upload_resp = client.post(upload_url, content=video_bytes, headers=headers)

        if upload_resp.status_code not in (200, 201):
            print(f"[ffmpeg-stitcher] Upload failed {upload_resp.status_code}: {upload_resp.text[:300]}")
            return {"error": "upload failed", "url": video_urls[0]}

        public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{storage_path}"
        print(f"[ffmpeg-stitcher] Done → {public_url}")

        return {
            "url": public_url,
            "clips": len(reencoded),
            "duration_s": duration_s,
            "size_mb": round(size_mb, 2),
        }
