"""app.py —— Fly 应用入口：景区讲解词转社交营销内容"""
from api import app

if __name__ == "__main__":
    # threaded=True：并发处理请求，避免 LLM 调用阻塞图片等静态资源加载
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False, threaded=True)
