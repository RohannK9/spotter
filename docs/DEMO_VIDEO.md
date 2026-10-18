# Live demo video

The automated recorder produces silent browser footage and a matching narration script. It records the actual running UI and real provider responses; it does not mock results or embed API keys. Use the hosted URL once deployment and Google browser-key restrictions are verified.

## Completed recording

Recorded from **https://spotter-toz3.onrender.com** on October 18, 2026. The local MP4 is **5:08**, 1440×1000, approximately 8.6 MB, with chapter subtitles and no audio. `artifacts/demo/narration.md` contains the matching timed voiceover. Live verification returned three routes, full checkpoint weather, 48-hour forecasts, one analysis request and no page errors. The video is not uploaded to a video-sharing service.

## Record

Requires the frontend dependencies, Playwright Chromium and FFmpeg. Ensure the target app reports `live` at `/api/health/` and has a working Google map.

```sh
cd frontend
npx playwright install chromium
DEMO_URL=http://localhost:8080 node scripts/record-demo.mjs
# For the finished deployment, replace DEMO_URL with its HTTPS URL.
```

Outputs go to ignored `artifacts/demo/`:

- `spotter-live.mp4`: H.264 video with optional chapter subtitles, suitable for uploading or editing.
- `spotter-live.webm`: source browser recording.
- `narration.md`: timed voiceover script matched to the actual take.
- `chapters.srt`: chapter subtitle track.
- `verification.json`: recording timestamp, URL, route/coverage summary and observed analysis count. No API keys or route geometry are saved here.
- `final-frame.png`: visual review image.

The planned take lasts about five minutes, plus any unusually long live request. Read the narration as a voiceover in your editor or use it to rehearse a Loom walkthrough. The generated video contains no voice track. Do not describe local footage as a hosted deployment. Re-record if the app's behavior differs materially or a provider fails; partial failed recordings are named `incomplete-recording.webm`.

## Walkthrough

1. Introduce the weather-aware routing problem and planning limitations.
2. Resolve Denver, CO and Salt Lake City, UT; inspect departure, 32,000 lb load and 25-mile checkpoint interval.
3. Analyze once with live providers and explain the backend sampling pipeline.
4. Compare whatever alternatives Google returns. Explain exclusions and ranking without claiming the fastest route is always safest.
5. Open a checkpoint to show arrival time, wind/rain/snow, risk and reason.
6. Scrub corridor forecasts and toggle the weather layer. The recorder asserts no second analysis request.
7. Show zero-weight validation and an explicitly simulated offline connection, then restore connectivity.
8. Explain React/Django/provider boundaries, the separate server/browser keys and the single-service cloud image.

Use [SUBMISSION.md](SUBMISSION.md) for an optional longer code/test walkthrough. Public URLs and test results should reflect completed verification, not planned steps.
