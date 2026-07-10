<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Document Upload Portal</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="portal-wrap">
  <div class="card">
    <h1 id="clientName">Loading...</h1>
    <p class="subtitle" id="clientGstin"></p>

    <h3>Upload your documents</h3>
    <p style="font-size:13px;color:#6b7280;">Upload sales/purchase invoices or any documents your CA has requested for the current filing period.</p>
    <div class="upload-row">
      <input type="file" id="fileInput">
      <button class="small-btn" id="uploadBtn">Upload</button>
    </div>
    <div id="uploadStatus" style="font-size:13px;margin-top:8px;"></div>
  </div>

  <div class="card">
    <h3>Your recent filings</h3>
    <table id="deadlinesTable">
      <thead><tr><th>Return</th><th>Period</th><th>Due Date</th><th>Status</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<script>
const params = new URLSearchParams(window.location.search);
const token = params.get('token');

async function loadPortal() {
  if (!token) {
    document.getElementById('clientName').textContent = 'Invalid link';
    return;
  }
  const res = await fetch(`/api/portal/${token}`);
  if (!res.ok) {
    document.getElementById('clientName').textContent = 'Invalid or expired link';
    return;
  }
  const data = await res.json();
  document.getElementById('clientName').textContent = data.client.name;
  document.getElementById('clientGstin').textContent = data.client.gstin || '';

  const tbody = document.querySelector('#deadlinesTable tbody');
  tbody.innerHTML = '';
  for (const d of data.deadlines) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.return_type}</td><td>${d.period_label}</td><td>${d.due_date}</td><td><span class="badge ${d.status}">${d.status.replace('_',' ')}</span></td>`;
    tbody.appendChild(tr);
  }
}

document.getElementById('uploadBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('fileInput');
  const statusEl = document.getElementById('uploadStatus');
  if (!fileInput.files.length) {
    statusEl.textContent = 'Choose a file first.';
    return;
  }
  const formData = new FormData();
  formData.append('token', token);
  formData.append('file', fileInput.files[0]);
  statusEl.textContent = 'Uploading...';
  const res = await fetch('/api/portal-upload', { method: 'POST', body: formData });
  if (res.ok) {
    statusEl.textContent = 'Uploaded successfully.';
    fileInput.value = '';
  } else {
    statusEl.textContent = 'Upload failed. Please try again.';
  }
});

loadPortal();
</script>
</body>
</html>
