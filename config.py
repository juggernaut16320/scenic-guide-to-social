"""从 .env 文件读取配置"""

import os
from pathlib import Path


def _load_dotenv():
    """简易 .env 加载，不依赖第三方库"""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# LLM Provider 配置
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "deepseek")  # deepseek | qwen | openai

# DeepSeek 兼容 OpenAI 接口
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

# Qwen（预留）
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-plus")

# OpenAI（预留）
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
