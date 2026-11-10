from backend.app.services.llm import _model_for


def test_openrouter_model_namespacing():
    assert _model_for("openrouter", "gpt-4o-mini") == "openai/gpt-4o-mini"
    assert _model_for("openrouter", "gpt-4o") == "openai/gpt-4o"
    assert _model_for("openrouter", "openai/gpt-4o-mini") == "openai/gpt-4o-mini"
    assert _model_for("openrouter", "claude-3-5-sonnet") == "anthropic/claude-3-5-sonnet"
    assert _model_for("openrouter", "Auto") == "openai/gpt-4o-mini"
    assert _model_for("openrouter", "Fast") == "openai/gpt-4o-mini"
    assert _model_for("openrouter", "Deep Thinking") == "openai/gpt-4o"
    assert _model_for("openai", "gpt-4o-mini") == "gpt-4o-mini"
