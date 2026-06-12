FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn requests python-dotenv pillow numpy
COPY research/ /app/research/
CMD ["uvicorn", "research.api:app", "--host", "0.0.0.0", "--port", "8787"]
