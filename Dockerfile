FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir yt-dlp flask flask-cors

WORKDIR /app

COPY download-service.py .

EXPOSE 8080

CMD ["python", "download-service.py"]
