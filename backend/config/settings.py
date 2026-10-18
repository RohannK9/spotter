import math
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    raise ImproperlyConfigured("Missing DJANGO_SECRET_KEY. See .env.example.")
PROVIDER_MODE = os.getenv("PROVIDER_MODE", "live")
if PROVIDER_MODE not in {"live", "demo"}:
    raise ImproperlyConfigured("PROVIDER_MODE must be live or demo.")
GOOGLE_ROUTES_API_KEY = os.getenv("GOOGLE_ROUTES_API_KEY", "")
if PROVIDER_MODE == "live" and not GOOGLE_ROUTES_API_KEY:
    raise ImproperlyConfigured("Missing GOOGLE_ROUTES_API_KEY. See .env.example.")
PROVIDER_TIMEOUT_SECONDS = float(os.getenv("PROVIDER_TIMEOUT_SECONDS", "8"))
WEATHER_CACHE_SECONDS = int(os.getenv("WEATHER_CACHE_SECONDS", "600"))
WEATHER_STALE_SECONDS = int(os.getenv("WEATHER_STALE_SECONDS", "1800"))
if not math.isfinite(PROVIDER_TIMEOUT_SECONDS) or not 0 < PROVIDER_TIMEOUT_SECONDS <= 15:
    raise ImproperlyConfigured("PROVIDER_TIMEOUT_SECONDS must be between 0 and 15 seconds.")
if not 0 < WEATHER_CACHE_SECONDS <= WEATHER_STALE_SECONDS <= 3600:
    raise ImproperlyConfigured("Weather TTLs must satisfy 0 < cache <= stale <= 3600 seconds.")
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
if railway_domain := os.getenv("RAILWAY_PUBLIC_DOMAIN"):
    ALLOWED_HOSTS.append(railway_domain)
if render_domain := os.getenv("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(render_domain)
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
CORS_ALLOW_HEADERS = ["accept", "content-type", "x-request-id"]
CORS_EXPOSE_HEADERS = ["X-Request-ID"]
ROOT_URLCONF = "config.urls"
INSTALLED_APPS = ["corsheaders", "rest_framework", "planner"]
MIDDLEWARE = [
    "planner.api.middleware.RequestLogMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]
DATABASES = {}  # No persistence or database required.
USE_TZ = True
TIME_ZONE = "UTC"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "planner.api.errors.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "20/minute"},
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 16_384
SECURE_CONTENT_TYPE_NOSNIFF = True
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "planner.api.middleware.JSONFormatter"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json"},
        "null": {"class": "logging.NullHandler"},
    },
    "loggers": {
        "planner": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "httpx": {"level": "WARNING"},
        "httpcore": {"level": "WARNING"},
        # The middleware supplies safe access logs; raw request URLs can contain addresses.
        "django.server": {"handlers": ["null"], "propagate": False},
    },
}
