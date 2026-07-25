"""api/services.py —— 业务逻辑：预处理流程，不含 Flask 依赖"""

import re
import json
import random
from typing import Optional
from core.llm import call_llm
from prompts.convert import PREPROCESS_PROMPT, GUIDE_GENERATION_PROMPT
from prompts.data import (
    CITY_TO_ATTRACTIONS, FAMOUS_ATTRACTIONS, CATEGORY_KEYWORDS, ATLAS_CITIES,
)


def _is_known_city(text: str) -> Optional[str]:
    """检查输入是否是一个已知的城市名"""
    for city in CITY_TO_ATTRACTIONS:
        if city in text or text in city:
            return city
    return None


def _match_category(spot_name: str) -> str:
    """根据景点名关键词匹配到最接近的类别"""
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in spot_name:
                return category
    return "古建筑类"


def build_graph_data() -> dict:
    """从真实城市→景点数据构建景点星图的节点与连线（供 atlas 首页使用）"""
    nodes = [{"id": "center", "type": "center", "name": "中国景点",
              "emoji": "🧭", "w": 3}]
    edges = []
    for city, emo in ATLAS_CITIES.items():
        cid = "city:" + city
        nodes.append({"id": cid, "type": "city", "name": city, "emoji": emo, "w": 2})
        edges.append(["center", cid])
        for spot in CITY_TO_ATTRACTIONS.get(city, []):
            sid = "spot:" + spot
            nodes.append({"id": sid, "type": "spot", "name": spot,
                          "cat": _match_category(spot), "w": 1.1})
            edges.append([cid, sid])
    return {"nodes": nodes, "edges": edges}


def preprocess_input(text: str) -> dict:
    """
    预处理用户输入，返回标准讲解词 + 景点信息。
    流程：
      空输入 → 随机知名景点 → 生成讲解词
      城市名 → 映射到该城市随机景点 → 生成讲解词
      景点名 → 直接生成讲解词
      长篇讲解词 → 原样返回
      不规范输入 → 随机知名景点 → 生成讲解词
    """
    text = text.strip().replace("\n", " ")

    # 情况1：空输入 → 随机知名景点
    if not text:
        spot_name = random.choice(FAMOUS_ATTRACTIONS)
        guide_text = call_llm(
            system_prompt=GUIDE_GENERATION_PROMPT,
            user_prompt=f"请为以下景点撰写讲解词：{spot_name}",
        )
        return {
            "guide_text": guide_text.strip(),
            "spot_name": spot_name,
            "matched_category": _match_category(spot_name),
            "input_type": "auto_filled",
        }

    # 情况2：长篇讲解词（≥80字且含景点特征词）
    if len(text) >= 80:
        spot_keywords = ["位于", "建于", "始建于", "面积", "占地", "高", "长", "宽", "著名", "历史", "景区"]
        if any(kw in text for kw in spot_keywords):
            return {
                "guide_text": text,
                "spot_name": "",
                "matched_category": "",
                "input_type": "guide_direct",
            }

    # 情况3：短文本，先用静态表查城市
    known_city = _is_known_city(text)
    if known_city:
        spot_name = random.choice(CITY_TO_ATTRACTIONS[known_city])
        guide_text = call_llm(
            system_prompt=GUIDE_GENERATION_PROMPT,
            user_prompt=f"请为以下景点撰写讲解词：{spot_name}",
        )
        return {
            "guide_text": guide_text.strip(),
            "spot_name": spot_name,
            "matched_category": _match_category(spot_name),
            "input_type": "city_mapped",
        }

    # 非已知城市 → LLM 识别
    try:
        identify_result = call_llm(system_prompt=PREPROCESS_PROMPT, user_prompt=text)
        identify_result = identify_result.strip()
        if identify_result.startswith("```"):
            identify_result = re.sub(r"```\w*\n?", "", identify_result).rstrip("```").strip()
        identified = json.loads(identify_result)
        input_type = identified.get("type", "invalid")
        spot_name = identified.get("spot_name", "")
    except Exception:
        input_type = "invalid"
        spot_name = ""

    # 根据识别结果处理
    if input_type == "guide":
        return {
            "guide_text": text,
            "spot_name": spot_name or "",
            "matched_category": _match_category(spot_name) if spot_name else "",
            "input_type": "guide_detected",
        }

    if input_type == "spot" and spot_name:
        target_spot = spot_name
        input_type_label = "spot_detected"
    elif input_type == "city":
        target_spot = spot_name or text
        input_type_label = "city_detected"
    else:
        target_spot = random.choice(FAMOUS_ATTRACTIONS)
        input_type_label = "fallback_random"

    guide_text = call_llm(
        system_prompt=GUIDE_GENERATION_PROMPT,
        user_prompt=f"请为以下景点撰写讲解词：{target_spot}",
    )
    return {
        "guide_text": guide_text.strip(),
        "spot_name": target_spot,
        "matched_category": _match_category(target_spot),
        "input_type": input_type_label,
    }
