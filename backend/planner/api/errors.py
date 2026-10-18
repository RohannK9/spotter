import logging

from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("planner")


class ApplicationError(Exception):
    def __init__(
        self,
        message: str,
        category: str = "provider_unavailable",
        status: int = 503,
        provider: str | None = None,
        retryable: bool = False,
        details=None,
    ):
        super().__init__(message)
        self.message = message
        self.category = category
        self.status = status
        self.provider = provider
        self.retryable = retryable
        self.details = details


def malformed(provider: str) -> ApplicationError:
    return ApplicationError(
        f"{provider} returned incomplete or invalid data. Please try again.",
        "malformed_provider_response",
        502,
        provider,
    )


def exception_handler(exc: Exception, context: dict) -> Response:
    request = context["request"]
    reference = getattr(request, "request_id", "unavailable")
    details = None
    if isinstance(exc, ApplicationError):
        message, category, status, details = exc.message, exc.category, exc.status, exc.details
    elif isinstance(exc, ValidationError):
        message, category, status, details = (
            "Please correct the highlighted trip details.",
            "validation_error",
            400,
            exc.detail,
        )
    elif isinstance(exc, Throttled):
        message, category, status = (
            "Too many requests. Wait a minute and try again.",
            "rate_limited",
            429,
        )
    else:
        response = drf_exception_handler(exc, context)
        if response is not None:
            message, category, status = (
                "The request could not be accepted.",
                "validation_error",
                response.status_code,
            )
        else:
            message, category, status = (
                "Something went wrong while analyzing this trip. Please try again.",
                "internal_application_error",
                500,
            )
    # Deliberately never log exception strings: upstream URLs can contain credentials.
    logger.warning(
        "request_error",
        extra={"request_id": reference, "category": category, "exception_type": type(exc).__name__},
    )
    return Response(
        {
            "error": {
                "category": category,
                "message": message,
                "details": details,
                "request_id": reference,
            }
        },
        status=status,
    )
