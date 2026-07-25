"""api/guides.py —— 景点讲解词原文：预生成 + JSON 磁盘缓存

每个景点对应一份讲解词原文，点进来直接用；缺失时用 LLM 现生成并缓存。
读写都直接落 JSON 文件（不做进程内缓存），保证批量脚本与服务端看到同一份数据。
"""
import os
import json
import threading

from core.llm import call_llm
from prompts.convert import GUIDE_GENERATION_PROMPT
from api.services import _match_category

_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "data")
_FILE = os.path.join(_DIR, "spot_guides.json")
_lock = threading.Lock()


def _read():
    try:
        with open(_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _write(cache):
    os.makedirs(_DIR, exist_ok=True)
    with open(_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)


def has_guide(name):
    return (name or "").strip() in _read()


def get_guide(name):
    """返回 {name, guide, category}；命中缓存直接返回，否则 LLM 生成后缓存"""
    name = (name or "").strip()
    if not name:
        return {"name": "", "guide": "", "category": ""}
    with _lock:
        cache = _read()
        if name in cache:
            hit = cache[name]
            return {"name": name, "guide": hit.get("guide", ""), "category": hit.get("category", "")}
    # 未命中 → 生成
    guide = call_llm(system_prompt=GUIDE_GENERATION_PROMPT,
                     user_prompt="请为以下景点撰写讲解词：" + name).strip()
    category = _match_category(name)
    with _lock:
        cache = _read()
        cache[name] = {"guide": guide, "category": category}
        _write(cache)
    return {"name": name, "guide": guide, "category": category}
