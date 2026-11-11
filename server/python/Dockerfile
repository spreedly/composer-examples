# syntax=docker/dockerfile:1

FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
RUN useradd --uid 10001 --create-home sidecar
USER sidecar
ENV PORT=3021
ENV HOST=0.0.0.0
EXPOSE 3021
CMD ["python", "app.py"]
