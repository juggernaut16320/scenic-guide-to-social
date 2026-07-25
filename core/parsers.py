"""core/parsers.py —— 纯函数：LLM 输出解析、实体 JSON 解析"""

import re
import json


def extract_tag(text: str, tag: str) -> str:
    """从文本中提取 [tag] 后面的内容，直到下一个 [ 或文本结束"""
    pattern = rf'\[{tag}\]\s*(.+?)(?=\n\[|\Z)'
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1).strip() if m else ''


def extract_list(text: str, tag: str) -> list:
    """从文本中提取 [tag] 后每行去掉编号前缀，返回列表"""
    section = extract_tag(text, tag)
    if not section:
        return []
    lines = []
    for line in section.strip().split('\n'):
        line = re.sub(r'^\d+[\.\、\s]+', '', line).strip()
        if line:
            lines.append(line)
    return lines


def parse_convert_output(raw: str) -> dict:
    """解析 LLM 转换输出为结构化数据"""
    parts = [p.strip() for p in raw.split('---')]
    if parts and not parts[0].startswith('['):
        parts = parts[1:]

    xhs_text = parts[0] if len(parts) > 0 else ''
    dy_text = parts[1] if len(parts) > 1 else ''
    pyq_text = parts[2] if len(parts) > 2 else ''

    return {
        "raw": raw,
        "xiaohongshu": {
            "title": extract_tag(xhs_text, '标题'),
            "body": extract_tag(xhs_text, '正文'),
            "tags": extract_tag(xhs_text, '标签').strip('#').split('#'),
        },
        "douyin": {
            "hook": extract_tag(dy_text, '黄金3秒'),
            "narration": extract_tag(dy_text, '口播'),
            "ending": extract_tag(dy_text, '结尾'),
        },
        "pengyouquan": {
            "text": extract_tag(pyq_text, '配文'),
            "images": extract_list(pyq_text, '配图建议'),
        },
    }


def parse_single_output(raw: str, platform: str) -> dict:
    """解析单平台输出"""
    if platform == "xiaohongshu":
        return {
            "title": extract_tag(raw, '标题'),
            "body": extract_tag(raw, '正文'),
            "tags": extract_tag(raw, '标签').strip('#').split('#'),
        }
    elif platform == "douyin":
        return {
            "hook": extract_tag(raw, '黄金3秒'),
            "narration": extract_tag(raw, '口播'),
            "ending": extract_tag(raw, '结尾'),
        }
    else:
        return {
            "text": extract_tag(raw, '配文'),
            "images": extract_list(raw, '配图建议'),
        }


def parse_and_clean_entities(raw: str) -> list[dict]:
    """解析 LLM 返回的实体 JSON，去 markdown 包裹，校验，去重"""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"```\w*\n?", "", raw).rstrip("```").strip()
    data = json.loads(raw)
    raw_entities = data.get("entities", data if isinstance(data, list) else [])
    if isinstance(raw_entities, list):
        raw_entities = [e for e in raw_entities if isinstance(e, dict) and "name" in e and "type" in e]
    # 去重
    seen = set()
    clean = []
    for e in raw_entities:
        key = (e["name"], e["type"])
        if key not in seen:
            seen.add(key)
            clean.append(e)
    return clean
