from django.conf import settings
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from planner.api.serializers import LocationQuerySerializer, TripSerializer
from planner.providers import demo, geocoding
from planner.services.analysis import analyze


@api_view(["GET"])
@throttle_classes([])
def health(request):
    return Response({"status": "ok", "mode": settings.PROVIDER_MODE})


@api_view(["GET"])
def locations(request):
    serializer = LocationQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    provider = demo if settings.PROVIDER_MODE == "demo" else geocoding
    results = provider.search_locations(serializer.validated_data["query"], request.request_id)
    return Response({"results": results, "mode": settings.PROVIDER_MODE})


@api_view(["POST"])
def analysis(request):
    serializer = TripSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(analyze(serializer.validated_data, request.request_id))
