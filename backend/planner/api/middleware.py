import json
import logging
import time
import uuid


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"level": record.levelname, "event": record.getMessage()}
        for key in (
            "request_id",
            "duration_ms",
            "provider",
            "route_count",
            "checkpoint_count",
            "category",
            "exception_type",
            "attempt",
            "sampling_ms",
            "weather_ms",
            "routing_ms",
            "status_code",
        ):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        return json.dumps(payload)


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = uuid.uuid4().hex[:16]
        started = time.monotonic()
        response = self.get_response(request)
        response["X-Request-ID"] = request.request_id
        logging.getLogger("planner").info(
            "request_complete",
            extra={
                "request_id": request.request_id,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "status_code": response.status_code,
            },
        )
        return response
