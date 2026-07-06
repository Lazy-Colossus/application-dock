from pydantic import BaseModel


class HotaruUser(BaseModel):
    id: str
    name: str
