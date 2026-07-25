"""Flask 后端 —— 只有一个接口 + 静态页面"""

import re
import json
from flask import Flask, request, jsonify, send_file
from llm import call_llm
from prompts.convert import build_system_prompt, build_single_prompt, ENTITY_PROMPT, SAMPLE_TEXTS

app = Flask(__name__, static_folder=".", static_url_path="")

# ── 结构化解析 ──────────────────────────────────────────────

def _extract(text, tag):
    """从文本中提取 [tag] 后面的内容，直到下一个 [ 或文本结束"""
    pattern = rf'\[{tag}\]\s*(.+?)(?=\n\[|\Z)'
    m = re.search(pattern, text, re.DOTALL)
    return m.group(1).strip() if m else ''

def _extract_list(text, tag):
    """从文本中提取 [tag] 后每行去掉编号前缀，返回列表"""
    section = _extract(text, tag)
    if not section:
        return []
    lines = []
    for line in section.strip().split('\n'):
        line = re.sub(r'^\d+[\.\、\s]+', '', line).strip()
        if line:
            lines.append(line)
    return lines

def parse_output(raw):
    """解析 LLM 输出为结构化数据"""
    parts = [p.strip() for p in raw.split('---')]
    # 去掉 LLM 偶尔加的废话前言（split 后第一部分如果不是以 [ 开头就丢弃）
    if parts and not parts[0].startswith('['):
        parts = parts[1:]

    xhs_text = parts[0] if len(parts) > 0 else ''
    dy_text = parts[1] if len(parts) > 1 else ''
    pyq_text = parts[2] if len(parts) > 2 else ''

    return {
        "raw": raw,
        "xiaohongshu": {
            "title": _extract(xhs_text, '标题'),
            "body": _extract(xhs_text, '正文'),
            "tags": _extract(xhs_text, '标签').strip('#').split('#'),
        },
        "douyin": {
            "hook": _extract(dy_text, '黄金3秒'),
            "narration": _extract(dy_text, '口播'),
            "ending": _extract(dy_text, '结尾'),
        },
        "pengyouquan": {
            "text": _extract(pyq_text, '配文'),
            "images": _extract_list(pyq_text, '配图建议'),
        },
    }


@app.route("/")
def index():
    """返回前端页面"""
    return send_file("index.html")


@app.route("/api/samples", methods=["GET"])
def get_samples():
    """返回样例列表（不含正文，正文在用户选择后才加载）"""
    return jsonify(SAMPLE_TEXTS)


@app.route("/api/convert", methods=["POST"])
def convert():
    """核心接口：输入讲解词，输出三平台内容"""
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "缺少 text 字段"}), 400

    text = data["text"].strip()
    if not text:
        return jsonify({"error": "text 不能为空"}), 400

    xhs_style = data.get("xhs_style", "种草探店")
    dy_style = data.get("dy_style", "正经解说")

    try:
        prompt = build_system_prompt(xhs_style=xhs_style, dy_style=dy_style)
        result = call_llm(system_prompt=prompt, user_prompt=text)
    except Exception as e:
        return jsonify({"error": f"LLM 调用失败: {str(e)}"}), 500

    return jsonify(parse_output(result))


@app.route("/api/convert-single", methods=["POST"])
def convert_single():
    """单卡片重新生成：只生成一个平台的内容"""
    data = request.get_json()
    if not data or "text" not in data or "platform" not in data:
        return jsonify({"error": "缺少 text 或 platform 字段"}), 400

    text = data["text"].strip()
    platform = data["platform"]
    if platform not in ("xiaohongshu", "douyin", "pengyouquan"):
        return jsonify({"error": "platform 必须是 xiaohongshu / douyin / pengyouquan"}), 400

    style = data.get("style", "")
    if not text:
        return jsonify({"error": "text 不能为空"}), 400

    try:
        prompt = build_single_prompt(platform=platform, style=style)
        result = call_llm(system_prompt=prompt, user_prompt=text)
    except Exception as e:
        return jsonify({"error": f"LLM 调用失败: {str(e)}"}), 500

    # 解析单平台输出
    if platform == "xiaohongshu":
        content = {
            "title": _extract(result, '标题'),
            "body": _extract(result, '正文'),
            "tags": _extract(result, '标签').strip('#').split('#'),
        }
    elif platform == "douyin":
        content = {
            "hook": _extract(result, '黄金3秒'),
            "narration": _extract(result, '口播'),
            "ending": _extract(result, '结尾'),
        }
    else:
        content = {
            "text": _extract(result, '配文'),
            "images": _extract_list(result, '配图建议'),
        }

    return jsonify({"platform": platform, "content": content})


@app.route("/api/extract-entities", methods=["POST"])
def extract_entities():
    """从讲解词中提取实体（人名、地名、建筑等）"""
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "缺少 text 字段"}), 400

    text = data["text"].strip()
    if len(text) < 10:
        return jsonify({"entities": []})

    try:
        result = call_llm(system_prompt=ENTITY_PROMPT, user_prompt=text)
        result = result.strip()
        # 去掉可能的 markdown 包裹
        if result.startswith("```"):
            result = re.sub(r"```\w*\n?", "", result).rstrip("```").strip()
        entities = json.loads(result)
        # 校验
        raw = entities.get("entities", entities if isinstance(entities, list) else [])
        if isinstance(raw, list):
            raw = [e for e in raw if isinstance(e, dict) and "name" in e and "type" in e]
        # 去重
        seen = set()
        clean = []
        for e in raw:
            key = (e["name"], e["type"])
            if key not in seen:
                seen.add(key)
                clean.append(e)
        return jsonify({"entities": clean})
    except Exception as e:
        return jsonify({"error": f"实体提取失败: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
