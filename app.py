
from flask import Flask, request, jsonify, send_file
from yt_dlp import YoutubeDL
from urllib.parse import urlparse
from pathlib import Path
import tempfile
import shutil
from flask_cors import CORS
import os
import imageio_ffmpeg


app = Flask(__name__)

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "https://pavan-youtube-downloader-site.onrender.com"
        ]
    }
})

ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be"
}

ALLOWED_QUALITIES = {"360", "480", "720", "1080", "1440", "2160", "best"}

os.environ["PATH"] = "/opt/render/.deno/bin" + os.pathsep + os.environ.get("PATH", "")
FFMPEG_PATH = os.environ.get("FFMPEG_PATH") or imageio_ffmpeg.get_ffmpeg_exe()



def valid_url(url):
    try:
        parsed = urlparse(url)
        return (
            parsed.scheme == "https"
            and parsed.hostname in ALLOWED_HOSTS
            and parsed.username is None
            and parsed.password is None
        )
    except ValueError:
        return False


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/info")
def video_info():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()

    if not valid_url(url):
        return jsonify({"error": "Enter a valid YouTube URL."}), 400

    try:
        with YoutubeDL({
            "quiet": True,
            "noplaylist": True,
            "skip_download": True,
            "js_runtimes": {"deno": {}}
        }) as ydl:
            info = ydl.extract_info(url, download=False)

        available_heights = sorted({
            int(fmt["height"])
            for fmt in info.get("formats", [])
            if fmt.get("height")
            and fmt.get("vcodec") != "none"
        })

        supported_qualities = [
            quality
            for quality in (360, 480, 720, 1080, 1440, 2160)
            if any(height >= quality for height in available_heights)
        ]

        return jsonify({
            "title": info.get("title", "Video"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "availableQualities": supported_qualities
        })

    except Exception as e:
        print("INFO ERROR:", repr(e))
        return jsonify({
            "error": "Unable to retrieve video information. Check the URL."
        }), 400


@app.post("/api/download")
def download_video():
    data = request.get_json(silent=True) or {}
    url = data.get("url", "").strip()
    quality = str(data.get("quality", "720"))

    if quality not in ALLOWED_QUALITIES:
        return jsonify({"error": "Invalid video quality."}), 400

    if not valid_url(url):
        return jsonify({"error": "Enter a valid YouTube URL."}), 400

    folder = Path(tempfile.mkdtemp(prefix="video_dl_"))

    try:
        if quality == "best":
            format_selector = "bv*+ba/b"
        else:
            format_selector = (
                f"bv*[height<={quality}]+ba/"
                f"b[height<={quality}]"
            )

        options = {
            "format": format_selector,
            "merge_output_format": "mp4",
            "ffmpeg_location": FFMPEG_PATH,
            "outtmpl": str(folder / "%(title).80s.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "socket_timeout": 20,
            "max_filesize": 500 * 1024 * 1024
        }

        with YoutubeDL(options) as ydl:
            ydl.download([url])

        files = [
            file for file in folder.iterdir()
            if file.is_file() and file.suffix.lower() == ".mp4"
        ]

        if not files:
            shutil.rmtree(folder, ignore_errors=True)
            return jsonify({
                "error": "MP4 file unavailable. Check FFmpeg installation."
            }), 400

        video = files[0]

        response = send_file(
            video,
            as_attachment=True,
            download_name=video.name,
            mimetype="video/mp4"
        )

        response.call_on_close(
            lambda: shutil.rmtree(folder, ignore_errors=True)
        )
        return response

    except Exception as e:
        print("DOWNLOAD ERROR:", repr(e))
        shutil.rmtree(folder, ignore_errors=True)
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True)
