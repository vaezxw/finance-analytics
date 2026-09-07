FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir pandas yfinance httpx

COPY sync.py /app/sync.py

CMD ["python", "sync.py"]
