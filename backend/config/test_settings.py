import os

os.environ["PROVIDER_MODE"] = "demo"
os.environ["DJANGO_SECRET_KEY"] = "test-only-not-a-deployment-secret"
os.environ["DJANGO_ALLOWED_HOSTS"] = "testserver,localhost,127.0.0.1"

from config.settings import *  # noqa: E402,F403
