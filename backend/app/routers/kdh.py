"""KDH API router.

Shared availability calendars. Unlike the other apps in this dock, KDH's data is
**not** scoped per user: the group votes behind one shared login, so calendars are
global to the deployment and a file is selected by calendar id, never by username.
Every route still sits behind `Depends(get_current_user)` — the username is used
for the admin check (Story 1.3), never to pick a file.

Routes land in Story 1.3, once the data layer (Story 1.2) exists.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/kdh", tags=["kdh"])
