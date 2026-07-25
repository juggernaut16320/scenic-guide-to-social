"""core/parsers.py —— 纯函数：JSON 输出解析（加固版）、实体清洗、标签提取"""

import re
import json


# ── 旧版文本解析（单平台 regenerate / JSON 失败回退用）────────

def extract_tag(text: str, tag: str) -> str:
    pattern = rf'\[{tag}\]\s*(.+?)(?=\n\[|\Z)'
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1).strip() if m else ''


def extract_list(text: str, tag: str) -> list:
    section = extract_tag(text, tag)
    if not section:
        return []
    lines = []
    for line in section.strip().split('\n'):
        line = re.sub(r'^\d+[\.\、\s]+', '', line).strip()
        if line:
            lines.append(line)
    return lines


def parse_single_output(raw: str, platform: str) -> dict:
    """解析单平台输出（文本格式，用于 convert-single / refine）"""
    if platform == "xiaohongshu":
        title = extract_tag(raw, '标题')
        body = extract_tag(raw, '正文')
        tags = extract_tag(raw, '标签').strip('#').split('#')
        # 兜底：如果全空，整段文本当 body
        if not title and not body:
            body = raw.strip()
        return {"title": title, "body": body, "tags": [t for t in tags if t.strip()]}
    elif platform == "douyin":
        hook = extract_tag(raw, '黄金3秒')
        narration = extract_tag(raw, '口播')
        ending = extract_tag(raw, '结尾')
        if not hook and not narration:
            narration = raw.strip()
        return {"hook": hook, "narration": narration, "ending": ending}
    else:
        text = extract_tag(raw, '配文')
        images = extract_list(raw, '配图建议')
        if not text:
            text = raw.strip()
        return {"text": text, "images": images}


# ── JSON 解析（加固版）───────────────────────────────────

def _extract_json_block(raw: str) -> str:
    """从 LLM 输出中提取 JSON 块"""
    raw = raw.strip()
    # 去掉 markdown 包裹
    if raw.startswith("```"):
        raw = re.sub(r"^```\w*\n", "", raw).rstrip("```").strip()
    return raw


def _repair_json(raw: str) -> str:
    """修复常见的 LLM JSON 瑕疵"""
    # 1. 在字符串值内未转义的换行（LLM 把 \n 写成真实换行）
    #    策略：逐行扫描，如果一行内有未闭合的字符串，合并直到闭合
    lines = raw.split('\n')
    repaired_lines = []
    in_string = False
    current = []

    for line in lines:
        if not in_string:
            repaired_lines.append(line)
            # 检测是否在字符串中间（不能简单处理，跳过）
            # 简单启发：如果行内 " 数量为奇数且行尾不是 ,
            stripped = line.rstrip()
            quotes_in_line = len(re.findall(r'(?<!\\)"', stripped))
            if quotes_in_line % 2 == 1:
                in_string = True
                current.append(line)
        else:
            current.append(line)
            stripped = line.rstrip()
            quotes_in_line = len(re.findall(r'(?<!\\)"', stripped))
            if quotes_in_line % 2 == 1:
                # 字符串闭合
                in_string = False
                # 把多行字符串中的真实换行转成 \\n
                merged = '\\n'.join(l.strip() for l in current)
                repaired_lines[-1] = merged
                current = []

    raw = '\n'.join(repaired_lines)

    # 2. 移除尾随逗号（JSON 不允许）
    raw = re.sub(r',\s*([}\]])', r'\1', raw)

    # 3. 修复分号误用
    raw = raw.replace('";', '",')

    return raw


def _parse_json_robust(raw: str) -> dict:
    """多层回退的 JSON 解析"""
    raw = _extract_json_block(raw)

    errors = []

    # 第一层：直接解析
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        errors.append(f"direct: {e}")

    # 第二层：修复后解析
    repaired = _repair_json(raw)
    if repaired != raw:
        try:
            return json.loads(repaired)
        except json.JSONDecodeError as e:
            errors.append(f"repaired: {e}")

    # 第三层：提取第一个 { 到最后一个 } 之间的内容
    try:
        start = raw.index('{')
        end = raw.rindex('}')
        core = raw[start:end+1]
        if core != raw:
            try:
                return json.loads(core)
            except json.JSONDecodeError as e:
                errors.append(f"core: {e}")
    except ValueError:
        pass

    raise ValueError("all JSON strategies failed: " + " | ".join(errors))


def parse_convert_json(raw: str) -> dict:
    """解析 LLM JSON 输出 → 结构化数据，失败时回退到文本解析"""
    result = _parse_json_robust(raw)

    xhs = result.get("xiaohongshu", {})
    dy = result.get("douyin", {})
    pyq = result.get("pengyouquan", {})
    facts = result.get("facts", [])

    return {
        "raw": raw,
        "xiaohongshu": {
            "title": (xhs.get("title") or "").strip(),
            "body": (xhs.get("body") or "").strip(),
            "tags": xhs.get("tags", []),
        },
        "douyin": {
            "hook": (dy.get("hook") or "").strip(),
            "narration": (dy.get("narration") or "").strip(),
            "ending": (dy.get("ending") or "").strip(),
        },
        "pengyouquan": {
            "text": (pyq.get("text") or "").strip(),
            "images": pyq.get("images", []),
        },
        "facts": facts,
    }


# ── 实体 JSON 解析 ───────────────────────────────────────

def parse_and_clean_entities(raw: str) -> list[dict]:
    """解析 LLM 实体 JSON，去重校验"""
    raw = _extract_json_block(raw)
    data = json.loads(raw)
    raw_entities = data.get("entities", data if isinstance(data, list) else [])
    if isinstance(raw_entities, list):
        raw_entities = [e for e in raw_entities if isinstance(e, dict) and "name" in e and "type" in e]
    seen = set()
    clean = []
    for e in raw_entities:
        key = (e["name"], e["type"])
        if key not in seen:
            seen.add(key)
            clean.append(e)
    return clean
