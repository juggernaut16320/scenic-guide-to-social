"""api/routes.py —— Flask 路由：请求校验 + 响应，业务逻辑在 services/parsers"""

import json

from flask import request, jsonify, render_template

from api import app
from api.services import preprocess_input, build_graph_data
from core.llm import call_llm
from core.parsers import (
    parse_convert_json, parse_single_output, parse_and_clean_entities,
)
from prompts.convert import (
    build_system_prompt, build_single_prompt, build_refine_prompt,
    ENTITY_PROMPT, INTRO_PROMPT,
)
from prompts.data import SAMPLE_TEXTS


@app.route("/")
def index():
    """首页：景点星图（graph_data 由 Jinja 的 |tojson 安全注入）"""
    return render_template("atlas.html", graph_data=build_graph_data())


@app.route("/studio")
def studio():
    """生成台：讲解词转三平台内容"""
    return render_template("index.html")


@app.route("/api/samples", methods=["GET"])
def get_samples():
    return jsonify(SAMPLE_TEXTS)


@app.route("/api/convert", methods=["POST"])
def convert():
    """核心接口：输入讲解词 → JSON 输出三平台内容 + 事实"""
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "缺少 text 字段"}), 400

    text = data["text"].strip()
    if not text:
        return jsonify({"error": "text 不能为空"}), 400

    xhs_style = data.get("xhs_style", "种草探店")
    dy_style = data.get("dy_style", "正经解说")
    pyq_style = data.get("pyq_style", "文艺清新")
    custom_style = data.get("custom_style", "")

    try:
        prompt = build_system_prompt(xhs_style=xhs_style, dy_style=dy_style,
                                      pyq_style=pyq_style, custom_style=custom_style)
        result = call_llm(system_prompt=prompt, user_prompt=text)
    except Exception as e:
        return jsonify({"error": f"LLM 调用失败: {str(e)}"}), 500

    try:
        return jsonify(parse_convert_json(result))
    except ValueError as e:
        # JSON 解析失败 → 回退到文本解析
        print(f"[warn] JSON parse failed, fallback to text: {e}")
        parts = [p.strip() for p in result.split('---')]
        if parts and not parts[0].startswith('['):
            parts = parts[1:]
        xhs_text = parts[0] if len(parts) > 0 else ''
        dy_text = parts[1] if len(parts) > 1 else ''
        pyq_text = parts[2] if len(parts) > 2 else ''
        return jsonify({
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
            "facts": [],
            "raw": result,
        })
    except Exception as e:
        return jsonify({"error": f"解析失败: {str(e)}", "raw": result}), 500


@app.route("/api/convert-single", methods=["POST"])
def convert_single():
    """单卡片重新生成（保持文本格式兼容）"""
    data = request.get_json()
    if not data or "text" not in data or "platform" not in data:
        return jsonify({"error": "缺少 text 或 platform 字段"}), 400

    text = data["text"].strip()
    platform = data["platform"]
    if platform not in ("xiaohongshu", "douyin", "pengyouquan"):
        return jsonify({"error": "platform 必须是 xiaohongshu / douyin / pengyouquan"}), 400

    style = data.get("style", "")
    custom_style = data.get("custom_style", "")
    if not text:
        return jsonify({"error": "text 不能为空"}), 400

    try:
        prompt = build_single_prompt(platform=platform, style=style, custom_style=custom_style)
        result = call_llm(system_prompt=prompt, user_prompt=text)
    except Exception as e:
        return jsonify({"error": f"LLM 调用失败: {str(e)}"}), 500

    return jsonify({"platform": platform, "content": parse_single_output(result, platform)})


@app.route("/api/refine", methods=["POST"])
def refine():
    """润色接口：缩短/更正式/更生动"""
    data = request.get_json()
    if not data or "text" not in data or "platform" not in data or "action" not in data:
        return jsonify({"error": "缺少 text/platform/action 字段"}), 400

    text = data["text"].strip()
    platform = data["platform"]
    action = data["action"]

    if platform not in ("xiaohongshu", "douyin", "pengyouquan"):
        return jsonify({"error": "platform 无效"}), 400
    if action not in ("shorten", "formal", "vivid"):
        return jsonify({"error": "action 必须是 shorten/formal/vivid"}), 400

    if not text:
        return jsonify({"error": "text 不能为空"}), 400

    try:
        prompt = build_refine_prompt(platform=platform, action=action)
        result = call_llm(system_prompt=prompt, user_prompt=text)
    except Exception as e:
        return jsonify({"error": f"LLM 调用失败: {str(e)}"}), 500

    return jsonify({"platform": platform, "content": parse_single_output(result, platform)})


@app.route("/api/extract-entities", methods=["POST"])
def extract_entities():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "缺少 text 字段"}), 400

    text = data["text"].strip()
    if len(text) < 10:
        return jsonify({"entities": []})

    try:
        result = call_llm(system_prompt=ENTITY_PROMPT, user_prompt=text)
        entities = parse_and_clean_entities(result)
        return jsonify({"entities": entities})
    except Exception as e:
        return jsonify({"error": f"实体提取失败: {str(e)}"}), 500


@app.route("/api/entity-intro", methods=["POST"])
def entity_intro():
    data = request.get_json()
    if not data or "name" not in data:
        return jsonify({"error": "缺少 name 字段"}), 400

    name = data["name"].strip()
    etype = data.get("type", "")

    try:
        user = json.dumps({"name": name, "type": etype}, ensure_ascii=False)
        result = call_llm(system_prompt=INTRO_PROMPT, user_prompt=user)
        return jsonify({"intro": result.strip()})
    except Exception as e:
        return jsonify({"error": f"简介获取失败: {str(e)}"}), 500


@app.route("/api/preprocess", methods=["POST"])
def preprocess():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "缺少 text 字段"}), 400

    try:
        result = preprocess_input(data["text"])
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"预处理失败: {str(e)}"}), 500
