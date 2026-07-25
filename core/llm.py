"""core/llm.py —— LLM 抽象层，统一调用入口，切换 Provider 只改这里"""

from openai import OpenAI
from core import config as cfg


def _get_client(provider: str = None) -> tuple[OpenAI, str]:
    """根据 provider 返回对应的 client 和模型名"""
    provider = provider or cfg.LLM_PROVIDER

    if provider == "deepseek":
        return (
            OpenAI(api_key=cfg.DEEPSEEK_API_KEY, base_url=cfg.DEEPSEEK_BASE_URL),
            cfg.DEEPSEEK_MODEL,
        )
    elif provider == "qwen":
        return (
            OpenAI(api_key=cfg.QWEN_API_KEY, base_url=cfg.QWEN_BASE_URL),
            cfg.QWEN_MODEL,
        )
    elif provider == "openai":
        return (
            OpenAI(api_key=cfg.OPENAI_API_KEY, base_url=cfg.OPENAI_BASE_URL),
            cfg.OPENAI_MODEL,
        )
    else:
        raise ValueError(f"不支持的 LLM Provider: {provider}")


def call_llm(
    system_prompt: str,
    user_prompt: str,
    provider: str = None,
    model: str = None,
    temperature: float = 0.7,
) -> str:
    """统一 LLM 调用入口"""
    client, default_model = _get_client(provider)
    model = model or default_model

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
    )

    return response.choices[0].message.content
