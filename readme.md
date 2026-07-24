# 景区讲解词 → 社交营销内容 一键转换

> 输入官方讲解词，AI 自动产出小红书种草文 / 短视频口播脚本 / 朋友圈配文，事实零错误。

## 运行

```bash
pip install flask openai
python3 app.py
# 浏览器打开 http://127.0.0.1:5000
```

## 项目结构

```
├── app.py              # Flask 入口，只有一个 POST 接口
├── llm.py              # LLM 抽象层，切换 Provider 只改这里
├── config.py           # 从 .env 读配置
├── prompts/
│   ├── convert.py      # 提示词模板 + 样例数据
├── index.html          # 前端，单文件，内嵌 CSS/JS
└── .env                # API Key（不入 git）
```

## API

### POST /api/convert

```
Request:  { "text": "景区讲解词原文..." }
Response: {
  "raw": "完整 LLM 输出",
  "parts": ["小红书内容", "短视频脚本", "朋友圈配文"],
  "count": 3
}
```

### GET /api/samples

返回内置样例列表，前端下拉选择用。

## LLM Provider 切换

编辑 `.env`：

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat
```

换 Provider 时在 `llm.py` 加一个分支即可，已预留 Qwen / OpenAI 接口。

## 提示词修改

所有提示词在 `prompts/convert.py`，与代码解耦，调 prompt 不改业务逻辑。

## 设计原则

- **单文件优先**：前端一个 HTML、后端一个 app.py，能跑就行，拒绝过度工程
- **可插拔 LLM**：`llm.py` 做抽象，加新 Provider 不改调用方
- **提示词即产品**：核心价值在 prompt 设计（事实锁定 + 三平台风格），代码只是壳
- **事实不可改**：prompt 中要求 LLM 先提取年代/人名/地名/数字，只换表达不换事实

## .gitignore

```
.env
__pycache__/
*.pyc
```
