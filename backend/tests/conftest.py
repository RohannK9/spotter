import os

# Explicit fixture mode for tests; no provider keys or network access required.
os.environ["PROVIDER_MODE"] = "demo"
os.environ["DJANGO_SECRET_KEY"] = "test-only-not-a-deployment-secret"
os.environ["DJANGO_ALLOWED_HOSTS"] = "testserver,localhost,127.0.0.1"
