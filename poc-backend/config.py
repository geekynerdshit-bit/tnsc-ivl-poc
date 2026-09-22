from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # Gates the admin "relocate console" endpoint (PATCH /api/consoles/{id}/site).
    # The dashboard's Vercel passcode gate only protects the SPA's page routes —
    # it never reaches this backend, which sits on its own Render origin with
    # no auth of its own otherwise. Without this, anyone who finds the API URL
    # (visible in any browser's network tab, since it's a public VITE_ env var)
    # could silently relocate any console's approved site. Set the same value
    # here and as Vercel's DASHBOARD_PASSCODE for one shared admin PIN.
    ADMIN_PASSCODE: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
