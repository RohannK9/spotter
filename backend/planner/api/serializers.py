import math
from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from planner.domain.models import Point
from planner.domain.sampling import distance


class AwareDateTimeField(serializers.DateTimeField):
    def to_internal_value(self, value):
        if not isinstance(value, str):
            raise serializers.ValidationError("Enter a departure timestamp with a UTC offset.")
        from django.utils.dateparse import parse_datetime

        try:
            parsed = parse_datetime(value)
        except ValueError:
            parsed = None
        if parsed is None or parsed.tzinfo is None:
            raise serializers.ValidationError("Departure must include a timezone or UTC offset.")
        return super().to_internal_value(value)


class LocationSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=300)
    point = serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2)

    def validate_point(self, value):
        try:
            Point(*value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from None
        return value


class TripSerializer(serializers.Serializer):
    origin = LocationSerializer()
    destination = LocationSerializer()
    departure = AwareDateTimeField()
    load_lb = serializers.FloatField()
    interval_miles = serializers.ChoiceField(choices=[10, 25, 50], default=25)

    def validate_load_lb(self, value):
        if not math.isfinite(value) or value <= 0:
            raise serializers.ValidationError("Load weight must be greater than 0 lb and finite.")
        return value

    def validate_departure(self, value):
        now = timezone.now()
        if value < now:
            raise serializers.ValidationError("Choose a departure time in the future.")
        if value > now + timedelta(hours=48):
            raise serializers.ValidationError("Departure must be within the next 48 hours.")
        return value

    def validate(self, attrs):
        a, b = attrs["origin"], attrs["destination"]
        if (
            a["label"].strip().casefold() == b["label"].strip().casefold()
            or distance(Point(*a["point"]), Point(*b["point"])) < 1
        ):
            raise serializers.ValidationError(
                {"destination": "Choose a different destination from the origin."}
            )
        return attrs


class LocationQuerySerializer(serializers.Serializer):
    query = serializers.CharField(min_length=2, max_length=300)
