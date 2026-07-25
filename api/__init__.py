"""api/__init__.py —— Flask 应用工厂"""
from flask import Flask

app = Flask(__name__, static_folder="../static", static_url_path="/static", template_folder="../templates")

# 导入路由模块以注册路由
import api.routes  # noqa: F401
