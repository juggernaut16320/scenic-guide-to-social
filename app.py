"""Flask 后端 —— 只有一个接口 + 静态页面"""

from flask import Flask, request, jsonify, send_file
from llm import call_llm
from prompts.convert import SYSTEM_PROMPT, SAMPLE_TEXTS

app = Flask(__name__, static_folder=".", static_url_path="")


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

    try:
        result = call_llm(system_prompt=SYSTEM_PROMPT, user_prompt=text)
    except Exception as e:
        return jsonify({"error": f"LLM 调用失败: {str(e)}"}), 500

    # 按 --- 分隔三种内容
    parts = [p.strip() for p in result.split("---")]

    return jsonify({
        "raw": result,
        "parts": parts,
        "count": len(parts),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
