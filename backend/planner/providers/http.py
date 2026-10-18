import logging
import random
import time
from collections.abc import Callable
from typing import Any

import httpx
from django.conf import settings

from planner.api.errors import ApplicationError, malformed

logger = logging.getLogger("planner")


def request_json(
    provider: str,
    method: str,
    url: str,
    *,
    request_id: str = "",
    validate: Callable[[Any], None] | None = None,
    **kwargs,
) -> Any:
    """At most three attempts, only transient failures; no raw upstream data escapes."""
    started = time.monotonic()
    timeout = httpx.Timeout(settings.PROVIDER_TIMEOUT_SECONDS, connect=3, pool=3)
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for attempt in range(3):
            error: ApplicationError
            try:
                response = client.request(method, url, **kwargs)
                if response.status_code == 429:
                    raise ApplicationError(
                        f"{provider} is rate limited. Please try again shortly.",
                        "rate_limited",
                        503,
                        provider,
                        True,
                    )
                if response.status_code in {408, 500, 502, 503, 504}:
                    raise ApplicationError(
                        f"{provider} is temporarily unavailable. Please try again.",
                        provider=provider,
                        retryable=True,
                    )
                if response.status_code >= 400 or response.is_redirect:
                    raise ApplicationError(
                        f"{provider} could not accept this request. Check the location or "
                        "contact the operator to verify provider configuration.",
                        "provider_rejected_request",
                        502,
                        provider,
                    )
                try:
                    data = response.json()
                except ValueError:
                    raise malformed(provider) from None
                if validate:
                    validate(data)
                logger.info(
                    "provider_complete",
                    extra={
                        "provider": provider,
                        "request_id": request_id,
                        "attempt": attempt + 1,
                        "duration_ms": round((time.monotonic() - started) * 1000),
                    },
                )
                return data
            except httpx.TimeoutException:
                error = ApplicationError(
                    f"{provider} took too long to respond. Please try again.",
                    "timeout",
                    504,
                    provider,
                    True,
                )
            except httpx.TransportError:
                error = ApplicationError(
                    f"{provider} is temporarily unreachable. Please try again.",
                    provider=provider,
                    retryable=True,
                )
            except ApplicationError as exc:
                error = exc
            logger.warning(
                "provider_failure",
                extra={
                    "provider": provider,
                    "request_id": request_id,
                    "category": error.category,
                    "attempt": attempt + 1,
                },
            )
            if not error.retryable or attempt == 2:
                raise error
            time.sleep(0.25 * 2**attempt + random.uniform(0, 0.2))
    raise RuntimeError("Unreachable retry state")
