from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import os

app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'service': 'video-download-service',
        'status': 'running',
        'endpoints': ['/download', '/info', '/playlist']
    })

@app.route('/download', methods=['POST'])
def download():
    data = request.json
    url = data.get('url')

    if not url:
        return jsonify({'error': 'Missing URL'}), 400

    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return jsonify({
                'success': True,
                'title': info.get('title'),
                'duration': info.get('duration'),
                'url': info.get('url'),
                'thumbnail': info.get('thumbnail')
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/info', methods=['POST'])
def info():
    data = request.json
    url = data.get('url')

    if not url:
        return jsonify({'error': 'Missing URL'}), 400

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return jsonify({
                'success': True,
                'title': info.get('title'),
                'duration': info.get('duration'),
                'thumbnail': info.get('thumbnail'),
                'description': info.get('description')
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/playlist', methods=['POST'])
def playlist():
    data = request.json
    url = data.get('url')

    if not url:
        return jsonify({'error': 'Missing URL'}), 400

    ydl_opts = {
        'extract_flat': True,
        'quiet': True,
        'no_warnings': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            entries = info.get('entries', [])
            videos = []

            for entry in entries:
                if entry:
                    video_url = entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id')}"
                    videos.append(video_url)

            return jsonify({
                'success': True,
                'videos': videos,
                'count': len(videos)
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
