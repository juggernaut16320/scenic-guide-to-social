"""api/images.py —— 百度图片搜索与下载（无需 key）

为地名配图（每地名 6 张）与评论头像提供真实图片，下载到 static/media/ 并带磁盘缓存。
"""
import os
import re
import ssl
import hashlib
import threading
import urllib.request
import urllib.parse
import http.cookiejar
from concurrent.futures import ThreadPoolExecutor

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "media")
_SPOT_DIR = os.path.join(_BASE, "spots")
_AVA_DIR = os.path.join(_BASE, "avatars")

_opener = None
_lock = threading.Lock()


def _get_opener():
    """惰性构建带 Cookie 的 opener，并预热 image.baidu.com 拿 BAIDUID（反爬必需）"""
    global _opener
    with _lock:
        if _opener is None:
            cj = http.cookiejar.CookieJar()
            op = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(cj),
                urllib.request.HTTPSHandler(context=_CTX),
            )
            op.addheaders = [
                ("User-Agent", _UA),
                ("Referer", "https://image.baidu.com/"),
                ("Accept-Language", "zh-CN,zh;q=0.9"),
            ]
            try:
                op.open("https://image.baidu.com/", timeout=15).read()
            except Exception:
                pass
            _opener = op
        return _opener


def _search_urls(word, want=6):
    """搜索并返回图片直链（优先 https thumbURL）"""
    op = _get_opener()
    q = urllib.parse.quote(word)
    url = ("https://image.baidu.com/search/acjson?tn=resultjson_com&ipn=rj&ct=201326592"
           "&fp=result&cl=2&lm=-1&ie=utf-8&oe=utf-8&st=-1&ic=0&word=%s&queryWord=%s"
           "&face=0&istype=2&nc=1&pn=0&rn=%d&gsm=1e" % (q, q, max(want * 4, 30)))
    raw = op.open(url, timeout=20).read().decode("utf-8", "ignore")
    found = re.findall(r'"thumbURL":"(https?://[^"]+)"', raw) or \
        re.findall(r'"middleURL":"(https?://[^"]+)"', raw)
    seen, out = set(), []
    for u in found:
        if u.startswith("https") and u not in seen:
            seen.add(u)
            out.append(u)
        if len(out) >= want:
            break
    return out


def _download(url, path):
    op = _get_opener()
    data = op.open(url, timeout=20).read()
    if len(data) < 800:
        raise ValueError("响应过小，疑似无效图片")
    with open(path, "wb") as f:
        f.write(data)


def _key(word):
    return hashlib.md5(word.encode("utf-8")).hexdigest()[:12]


def _download_batch(urls, out_dir, prefix, url_prefix, want):
    """并发下载一批图片，返回可访问的 /static 路径列表"""
    os.makedirs(out_dir, exist_ok=True)
    paths = []

    def task(pair):
        i, u = pair
        fn = "%s%d.jpg" % (prefix, i)
        p = os.path.join(out_dir, fn)
        try:
            if not os.path.exists(p):
                _download(u, p)
            return url_prefix + fn
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(task, list(enumerate(urls))):
            if r:
                paths.append(r)
            if len(paths) >= want:
                break
    return paths


def get_spot_images(word, n=6):
    """下载地名的 n 张配图，返回 /static/media/... 路径；已缓存则直接返回"""
    k = _key(word)
    d = os.path.join(_SPOT_DIR, k)
    if os.path.isdir(d):
        cached = sorted(f for f in os.listdir(d) if f.endswith(".jpg"))
        if len(cached) >= n:
            return ["/static/media/spots/%s/%s" % (k, f) for f in cached[:n]]
    urls = _search_urls(word, n * 2)
    return _download_batch(urls, d, "", "/static/media/spots/%s/" % k, n)


_AVA_TERMS = ["卡通头像", "文艺插画头像", "旅行头像", "简约头像"]


def get_avatars(n=12):
    """下载一批评论用头像（全局共用，仅首次下载）"""
    if os.path.isdir(_AVA_DIR):
        cached = sorted(f for f in os.listdir(_AVA_DIR) if f.endswith(".jpg"))
        if len(cached) >= n:
            return ["/static/media/avatars/%s" % f for f in cached[:n]]
    urls = []
    for t in _AVA_TERMS:
        try:
            urls += _search_urls(t, 5)
        except Exception:
            pass
    urls = list(dict.fromkeys(urls))[:n * 2]
    return _download_batch(urls, _AVA_DIR, "a", "/static/media/avatars/", n)
