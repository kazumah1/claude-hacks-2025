import fastapi

app = fastapi.FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}