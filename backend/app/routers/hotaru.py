from fastapi import APIRouter

router = APIRouter(prefix="/api/hotaru", tags=["hotaru"])

# Endpoints are added in later stories (vocabulary, practice, notes). This module
# exists so the app is mounted and reachable from Story 1.2 onward.
