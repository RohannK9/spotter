from django.urls import path

from planner.api import views

urlpatterns = [
    path("api/health/", views.health),
    path("api/locations/", views.locations),
    path("api/analyze/", views.analysis),
]
