'use strict';
const $ = id => document.getElementById(id);
let ticket;
function newPassword() {
  // 144 random bits, with no ambiguous punctuation when sharing from a phone.
  $('password').value = Array.from(crypto.getRandomValues(new Uint8Array(18)), n => n.toString(16).padStart(2, '0')).join('');
}
function selectFile() {
  const file = $('file').files[0];
  $('filename').textContent = file ? file.name : 'Drop your HTML here';
  $('filehint').textContent = file ? `${(file.size / 1024).toFixed(0)} KB · ready to publish` : 'or tap to choose a file · up to 8 MB';
}
newPassword();
$('regenerate').addEventListener('click', newPassword);
$('file').addEventListener('change', selectFile);
for (const type of ['dragenter', 'dragover']) $('drop').addEventListener(type, event => { event.preventDefault(); $('drop').classList.add('drag'); });
for (const type of ['dragleave', 'drop']) $('drop').addEventListener(type, () => $('drop').classList.remove('drag'));
$('drop').addEventListener('drop', event => {
  event.preventDefault();
  if (event.dataTransfer.files.length !== 1) { $('status').textContent = 'Choose one self-contained HTML file.'; return; }
  $('file').files = event.dataTransfer.files;
  selectFile();
});
$('publish').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('file').files[0];
  if (!file || !/\.html?$/i.test(file.name) || file.size > 8 * 1024 * 1024 || file.size === 0) {
    $('status').textContent = 'Choose a nonempty .html file, up to 8 MB.';
    return;
  }
  const password = $('password').value;
  const days = Number($('expiry').value);
  const expires = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  const form = new FormData();
  form.append('files', file, 'index.html');
  form.append('mode', 'webserver');
  form.append('view_password', password);
  if (expires) form.append('expires_at', expires);
  $('submit').disabled = true;
  $('status').textContent = 'Publishing…';
  try {
    const response = await fetch('/api/sites', {method: 'POST', body: form});
    if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
    const data = await response.json();
    // Keep links on this authenticated host, even if upstream URL generation changes.
    const view = new URL(data.view_url, location.origin);
    const edit = new URL(data.edit_url, location.origin);
    if (view.origin !== location.origin || edit.origin !== location.origin || !data.view_password_protected) throw new Error('Unexpected publication response. Check Sitebin before retrying.');
    ticket = {...data, original_filename: file.name, viewer_password: password};
    $('view').href = view.href;
    $('view').textContent = view.href;
    $('edit').href = edit.href;
    $('viewer-password').textContent = password;
    $('edit-password').textContent = data.edit_password;
    $('expires').textContent = expires ? `Available until ${new Date(expires).toLocaleString()}.` : 'Available until you delete it or set an expiry.';
    $('result').hidden = false;
    $('status').textContent = 'Published. Save the private receipt before leaving this page.';
    $('result').scrollIntoView({block: 'nearest'});
  } catch (error) {
    $('status').textContent = `${error.message} If the connection dropped, a report may already exist; save any receipt before retrying.`;
  } finally { $('submit').disabled = false; }
});
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const target = $(button.dataset.copy);
  const value = target.id === 'view' ? target.href : target.textContent;
  try { await navigator.clipboard.writeText(value); $('status').textContent = 'Copied.'; }
  catch { const range = document.createRange(); range.selectNodeContents(target); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); $('status').textContent = 'Select Copy from your device’s menu.'; }
}));
$('receipt').addEventListener('click', () => {
  if (!ticket) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(ticket, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `private-report-${ticket.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
