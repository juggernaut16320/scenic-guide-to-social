"""api/routes.py —— Flask 路由定义，只做请求处理和响应，业务逻辑在 services/parsers"""

import json

from flask import request, jsonify, render_template

from api import app
from api.services import preprocess_input
from core.llm import call_llm
from core.parsers import (
    extract_tag, extract_list,
    parse_convert_output, parse_single_output, parse_and_clean_entities,
)
from prompts.convert import (
    build_system_prompt, build_single_prompt,
    ENTITY_PROMPT, INTRO_PROMPT,
)
from prompts.data import SAMPLE_TEXTS


@app.route("/")
def index():
    """首页"""
    return render_template("index.html")


@app.route("/api/samples", methods=["GET"])
def get_samples():
    """返回样例列表"""
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

    return jsonify(parse_convert_output(result))


@app.route("/api/convert-single", methods=["POST"])
def convert_single():
    """单卡片重新生成"""
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

    return jsonify({"platform": platform, "content": parse_single_output(result, platform)})


@app.route("/api/extract-entities", methods=["POST"])
def extract_entities():
    """从讲解词中提取实体"""
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
    """获取单个实体的简介（≤100字）"""
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
    """预处理接口：接收任意输入，返回标准讲解词"""
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "缺少 text 字段"}), 400

    try:
        result = preprocess_input(data["text"])
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"预处理失败: {str(e)}"}), 500
