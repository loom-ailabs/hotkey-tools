from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field, field_validator

from hotkey_tools_core import normalize_combination

app = FastAPI(title="hotkey-tools Python service", version="0.1.0")


class NormalizeRequest(BaseModel):
    combination: str = Field(min_length=1)

    @field_validator("combination")
    @classmethod
    def require_key(cls, value: str) -> str:
        if not normalize_combination(value):
            raise ValueError("combination must contain at least one key")
        return value


class NormalizeResponse(BaseModel):
    combination: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/normalize", response_model=NormalizeResponse)
async def normalize(request: NormalizeRequest) -> NormalizeResponse:
    return NormalizeResponse(combination=normalize_combination(request.combination))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("hotkey_tools.main:app", host="127.0.0.1", port=8000, reload=True)
