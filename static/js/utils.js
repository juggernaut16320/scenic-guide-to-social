/* static/js/utils.js —— 工具函数：HTML 转义、错误显示 */

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = '❌ ' + msg;
  el.style.display = 'block';
}
