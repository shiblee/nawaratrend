from fastapi import FastAPI

app = FastAPI(title="My Project - Python Service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Python service is running"}
