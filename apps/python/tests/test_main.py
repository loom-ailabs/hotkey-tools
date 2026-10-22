import pytest
from fastapi.testclient import TestClient

from hotkey_tools.main import app


def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_normalize_api() -> None:
    response = TestClient(app).post("/normalize", json={"combination": " ctrl + shift + p "})
    assert response.status_code == 200
    assert response.json() == {"combination": "Ctrl + Shift + P"}


@pytest.mark.parametrize("combination", ["", "   ", " + + ", None, 123])
def test_normalize_api_rejects_invalid_combinations(combination: object) -> None:
    response = TestClient(app).post("/normalize", json={"combination": combination})
    assert response.status_code == 422


def test_normalize_api_requires_combination() -> None:
    response = TestClient(app).post("/normalize", json={})
    assert response.status_code == 422
