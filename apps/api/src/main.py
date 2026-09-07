from fastapi import FastAPI
from workers import asgi

app = FastAPI(title="finance-analytics-api", version="0.1.0")
Default = asgi.entrypoint(app)


@app.get("/health")
def health():
    return {"ok": True, "service": "finance-analytics-api"}


@app.get("/api/v1/instruments")
def list_instruments():
    """Placeholder: instruments will come from D1."""
    return {
        "items": [
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "asset_class": "stock",
                "market": "US",
            },
            {
                "symbol": "SPY",
                "name": "SPDR S&P 500 ETF Trust",
                "asset_class": "fund",
                "market": "US",
            },
        ]
    }
