from vocalize_server.device import resolve_device


def test_explicit_preference_returned_as_is():
    assert resolve_device.__wrapped__("cuda") == "cuda"
    assert resolve_device.__wrapped__("mps") == "mps"
    assert resolve_device.__wrapped__("cpu") == "cpu"


def test_auto_falls_back_to_cpu_without_torch(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "torch":
            raise ImportError("no torch in this environment")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    assert resolve_device.__wrapped__("auto") == "cpu"
