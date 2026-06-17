# Stage 1 Subscription Engine — Implementation Plan

Goal: make the first enforcement slice real.

1. Add a daemon-side quota store.
2. Add capability generation from subscription state.
3. Enforce browse quotas.
4. Enforce publish quotas.
5. Expose quota state to the UI.
6. Add structured over-limit errors.
7. Keep free tier useful and honest.

Success means free users can browse and publish within limits, and premium actions are rejected by the daemon when not entitled.
