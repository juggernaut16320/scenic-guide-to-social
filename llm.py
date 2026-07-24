"""LLM 抽象层 —— 统一调用入口，切换 Provider 只改这里"""

from openai import OpenAI
import config


def _get_client(provider: str = None) -> tuple[OpenAI, str]:
    """根据 provider 返回对应的 client 和模型名"""
    provider = provider or config.LLM_PROVIDER

    if provider == "deepseek":
        return (
            OpenAI(api_key=config.DEEPSEEK_API_KEY, base_url=config.DEEPSEEK_BASE_URL),
            config.DEEPSEEK_MODEL,
        )
    elif provider == "qwen":
        return (
            OpenAI(api_key=config.QWEN_API_KEY, base_url=config.QWEN_BASE_URL),
            config.QWEN_MODEL,
        )
    elif provider == "openai":
        return (
            OpenAI(api_key=config.OPENAI_API_KEY, base_url=config.OPENAI_BASE_URL),
            config.OPENAI_MODEL,
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
    """统一 LLM 调用入口

    Args:
        system_prompt: 系统提示词
        user_prompt: 用户输入
        provider: deepseek / qwen / openai，默认用配置里的
        model: 模型名，默认用 provider 对应的默认模型
        temperature: 温度参数

    Returns:
        LLM 返回的文本
    """
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
