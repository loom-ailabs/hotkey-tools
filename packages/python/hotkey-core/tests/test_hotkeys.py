from hotkey_tools_core import normalize_combination


def test_normalize_combination() -> None:
    assert normalize_combination(" ctrl + shift + p ") == "Ctrl + Shift + P"
