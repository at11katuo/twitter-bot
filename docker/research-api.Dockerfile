FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY research/ ./research/

CMD ["uvicorn", "research.api:app", "--host", "0.0.0.0", "--port", "8787"]
