import os
from pathlib import Path

from django.core.wsgi import get_wsgi_application
from whitenoise import WhiteNoise

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()

# The cloud image serves the Vite build and API from one origin. Local Compose
# continues to use Nginx. Only the built public directory is exposed here.
frontend_dir = os.getenv("SPOTTER_FRONTEND_DIR")
if frontend_dir:
    if not (Path(frontend_dir) / "index.html").is_file():
        raise RuntimeError("SPOTTER_FRONTEND_DIR must contain the built frontend.")
    application = WhiteNoise(application, root=frontend_dir, index_file=True, max_age=60)
