"""app.py —— Fly 应用入口：景区讲解词转社交营销内容"""
from api import app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
