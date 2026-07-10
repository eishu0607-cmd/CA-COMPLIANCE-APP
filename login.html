async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  return res.json();
}

async function requireLogin() {
  const me = await api('/api/me');
  if (!me) return;
  document.getElementById('firmName').textContent = me.firm;
  document.getElementById('userName').textContent = `${me.name} (${me.role})`;
  return me;
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await api('/api/logout', 'POST');
      window.location.href = '/login.html';
    });
  }
});
