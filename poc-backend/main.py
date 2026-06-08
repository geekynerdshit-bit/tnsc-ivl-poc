import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routes import consoles, scans
from log_config import setup_logging, get_logger

setup_logging()
logger = get_logger("main")

app = FastAPI(
    title="IVL Console Tracker — POC API",
    description="Geo-Verified NFC tracking system for Translumina Therapeutics",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    logger.info("→ %s %s", request.method, request.url.path)

    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000
        logger.exception("✗ %s %s failed after %.1fms: %s",
                         request.method, request.url.path, elapsed, exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    elapsed = (time.perf_counter() - start) * 1000
    level = "info" if response.status_code < 400 else "warning" if response.status_code < 500 else "error"
    getattr(logger, level)(
        "← %s %s  %d  %.1fms",
        request.method, request.url.path, response.status_code, elapsed
    )
    return response


app.include_router(consoles.router, prefix="/api")
app.include_router(scans.router, prefix="/api")


@app.get("/health", tags=["Health"])
def health_check():
    logger.info("health check called")
    return {"status": "ok", "message": "POC API is running"}
