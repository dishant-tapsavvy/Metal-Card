import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import { clearToken, getToken, request, saveToken } from './api.js';

async function createQrJpeg(qrUrl, activationCode) {
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 4, width: 760 });
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Could not render a QR code image.'));
    image.src = qrDataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 880;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the QR image for download.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 20, 20, 760, 760);
  context.fillStyle = '#202b28';
  context.font = '600 22px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(`Activation code: ${activationCode}`, 400, 830);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the QR image as JPEG.'));
    }, 'image/jpeg', 0.92);
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createBatchWorkbook(codes) {
  const rows = [
    ['QR file name', 'Activation code'],
    ...codes.map(({ qrId, activationCode }) => [
      `QR-${qrId}-CODE-${activationCode}.jpg`,
      activationCode,
    ]),
  ];
  const worksheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => {
      const column = columnIndex === 0 ? 'A' : 'B';
      return `<c r="${column}${rowNumber}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  const workbook = new JSZip();
  workbook.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  workbook.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  workbook.folder('xl').file('workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="QR Codes" sheetId="1" r:id="rId1"/></sheets></workbook>');
  workbook.folder('xl').folder('_rels').file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  workbook.folder('xl').folder('worksheets').file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${worksheetRows}</sheetData></worksheet>`);
  return workbook.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function Brand({ compact = false }) {
  return (
    <div className={`brand${compact ? ' brand-compact' : ''}`}>
      <span className="brand-mark" aria-hidden="true">Q</span>
      <span>dynamic<span className="brand-accent">qr</span></span>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      saveToken(result.token);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <Brand />
        <div className="intro-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> QR management, made simple</span>
          <h1>One code.<br /><span>Any destination.</span></h1>
          <p>Create a QR code once. Set its destination when it’s ready, then let it do the rest.</p>
        </div>
        <div className="intro-footer"><span>01</span> Create <i /> <span>02</span> Activate <i /> <span>03</span> Share</div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <div className="login-icon" aria-hidden="true">↗</div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to manage your QR codes.</p>
          <form onSubmit={submit} className="form-stack">
            <label htmlFor="username">Username</label>
            <input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark button-wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span></button>
          </form>
          <p className="login-footnote"><span className="lock-icon" aria-hidden="true">●</span> Private admin access</p>
        </div>
        <p className="side-note">A calmer way to manage every destination.</p>
      </section>
    </main>
  );
}

function Dashboard({ onLogout }) {
  const token = getToken();
  const [codes, setCodes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(null);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);
  const [batchCount, setBatchCount] = useState('10');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [downloadingBatch, setDownloadingBatch] = useState(null);
  const [batchExportFormat, setBatchExportFormat] = useState('');
  const [batchNotice, setBatchNotice] = useState('');

  async function loadCodes() {
    try {
      setError('');
      const [nextCodes, nextBatches] = await Promise.all([
        request('/admin/qrs', { token }),
        request('/admin/batches', { token }),
      ]);
      setCodes(nextCodes);
      setBatches(nextBatches);
    } catch (err) {
      if (err.message.includes('session')) onLogout();
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCodes(); }, []);

  async function createCode() {
    setCreating(true);
    setError('');
    try {
      const result = await request('/admin/qrs', { method: 'POST', token, body: JSON.stringify({}) });
      setCreated(result);
      setCopied(false);
      await loadCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function createBatch(event) {
    event.preventDefault();
    setCreatingBatch(true);
    setError('');
    setBatchNotice('');
    try {
      const result = await request('/admin/batches', {
        method: 'POST',
        token,
        body: JSON.stringify({ count: Number(batchCount) }),
      });
      setBatchNotice(`Batch ${result.batchNumber} created with ${result.count} QR codes.`);
      await loadCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingBatch(false);
    }
  }

  async function downloadBatch(batch) {
    setDownloadingBatch(batch.id);
    setBatchExportFormat('zip');
    setError('');
    try {
      const result = await request(`/admin/batches/${encodeURIComponent(batch.id)}/download`, { token });
      const zip = new JSZip();
      for (const code of result.codes) {
        const jpeg = await createQrJpeg(code.qrUrl, code.activationCode);
        zip.file(`Batch ${result.batchNumber}/QR-${code.qrId}-CODE-${code.activationCode}.jpg`, jpeg);
      }

      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const downloadUrl = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `batch-${result.batchNumber}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingBatch(null);
      setBatchExportFormat('');
    }
  }

  async function exportBatchExcel(batch) {
    setDownloadingBatch(batch.id);
    setBatchExportFormat('excel');
    setError('');
    try {
      const result = await request(`/admin/batches/${encodeURIComponent(batch.id)}/download`, { token });
      const workbook = await createBatchWorkbook(result.codes);
      const downloadUrl = URL.createObjectURL(workbook);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `batch-${result.batchNumber}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingBatch(null);
      setBatchExportFormat('');
    }
  }

  async function deleteBatch() {
    if (!deletingBatch) return;
    setBatchDeleteBusy(true);
    setError('');
    try {
      await request(`/admin/batches/${encodeURIComponent(deletingBatch.id)}`, {
        method: 'DELETE',
        token,
      });
      setDeletingBatch(null);
      await loadCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(created.activationCode);
      setCopied(true);
    } catch {
      setError('Could not access the clipboard. Select and copy the code instead.');
    }
  }

  function openEdit(code) {
    setEditing(code);
    setEditUrl(code.redirectUrl || '');
  }

  async function updateDestination(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const updated = await request(`/admin/qrs/${encodeURIComponent(editing.qrId)}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ redirectUrl: editUrl }),
      });
      setCodes((current) => current.map((code) => code.qrId === updated.qrId ? { ...code, ...updated } : code));
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCode() {
    if (!deleting) return;
    setDeleteBusy(true);
    setError('');
    try {
      await request(`/admin/qrs/${encodeURIComponent(deleting.qrId)}`, {
        method: 'DELETE',
        token,
      });
      setDeleting(null);
      await loadCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const activeCount = codes.filter((code) => code.status === 'activated').length;
  const pendingCount = codes.length - activeCount;

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <Link to="/admin" aria-label="DynamicQR home"><Brand compact /></Link>
        <div className="topbar-right">
          <span className="admin-pill"><span /> Admin</span>
          <button className="text-button" onClick={onLogout}>Sign out <span aria-hidden="true">↗</span></button>
        </div>
      </header>
      <main className="dashboard-main">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h1>QR codes <span className="heading-count">{codes.length}</span></h1>
            <p className="muted">Create, activate, and keep track of your destinations.</p>
          </div>
          <button className="button button-dark create-button" onClick={createCode} disabled={creating}>
            <span className="plus-icon" aria-hidden="true">＋</span> {creating ? 'Creating…' : 'Create QR code'}
          </button>
        </div>

        <div className="stats-row">
          <div className="stat-card"><span className="stat-label">Total codes</span><strong>{codes.length.toString().padStart(2, '0')}</strong><span className="stat-detail">All your QR codes</span></div>
          <div className="stat-card"><span className="stat-label">Activated</span><strong>{activeCount.toString().padStart(2, '0')}</strong><span className="stat-detail"><span className="status-dot active-dot" /> Ready to redirect</span></div>
          <div className="stat-card"><span className="stat-label">Waiting for activation</span><strong>{pendingCount.toString().padStart(2, '0')}</strong><span className="stat-detail"><span className="status-dot pending-dot" /> Not activated yet</span></div>
        </div>

        {error && <p className="inline-error" role="alert">{error}</p>}

        <section className="batches-section">
          <div className="section-heading">
            <div><h2>QR batches</h2><p className="muted">Generate codes together, download their JPEGs, or export filenames and activation codes to Excel.</p></div>
          </div>
          {batchNotice && <p className="batch-notice" role="status">{batchNotice}</p>}
          <form className="batch-create-form" onSubmit={createBatch}>
            <label htmlFor="batch-count">Number of QR codes</label>
            <input id="batch-count" type="number" min="1" max="250" step="1" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} required />
            <span className="batch-limit">Up to 250 codes per batch</span>
            <button className="button button-dark" type="submit" disabled={creatingBatch}>
              {creatingBatch ? 'Generating…' : 'Generate batch'} <span aria-hidden="true">→</span>
            </button>
          </form>
          {batches.length === 0 ? (
            <p className="batch-empty">Your generated batches will appear here.</p>
          ) : (
            <div className="batch-list">
              {batches.map((batch) => (
                <article className="batch-card" key={batch.id}>
                  <div className="batch-icon" aria-hidden="true">▦</div>
                  <div className="batch-info">
                    <h3>Batch {batch.batchNumber}</h3>
                    <p>{batch.count} {batch.count === 1 ? 'QR code' : 'QR codes'} · Created {new Date(batch.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div className="batch-actions">
                    <button className="button button-outline batch-download" type="button" onClick={() => downloadBatch(batch)} disabled={batch.count === 0 || downloadingBatch !== null || batchDeleteBusy}>
                      {downloadingBatch === batch.id && batchExportFormat === 'zip' ? 'Preparing ZIP…' : 'Download ZIP'} <span aria-hidden="true">↓</span>
                    </button>
                    <button className="button button-outline batch-download" type="button" onClick={() => exportBatchExcel(batch)} disabled={batch.count === 0 || downloadingBatch !== null || batchDeleteBusy}>
                      {downloadingBatch === batch.id && batchExportFormat === 'excel' ? 'Preparing Excel…' : 'Export Excel'} <span aria-hidden="true">↓</span>
                    </button>
                    <button className="delete-link batch-delete" type="button" onClick={() => setDeletingBatch(batch)} disabled={batchDeleteBusy}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="codes-section">
          <div className="section-heading">
            <div><h2>All codes</h2><p className="muted">Your QR codes and where they lead.</p></div>
            <span className="live-label"><span /> LIVE</span>
          </div>
          {loading ? <div className="empty-state"><span className="loading-spinner" /> Loading your codes…</div> :
            codes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-graphic" aria-hidden="true"><span>▦</span></div>
                <h3>A fresh start</h3>
                <p>Your QR codes will live here. Create one to get started.</p>
                <button className="button button-outline" onClick={createCode} disabled={creating}>Create your first QR code <span aria-hidden="true">→</span></button>
              </div>
            ) : (
              <div className="code-list">
                {codes.map((code, index) => (
                  <article className="code-card" key={code.qrId}>
                    <div className="code-preview"><QRCodeSVG value={code.qrUrl} size={88} level="M" /></div>
                    <div className="code-info">
                      <div className="code-title-row"><h3>QR code <span>#{String(codes.length - index).padStart(3, '0')}</span></h3><span className={`status-badge ${code.status}`}>{code.status === 'activated' ? 'Activated' : 'Pending activation'}</span></div>
                      <p className="code-link">{code.redirectUrl || code.qrUrl}</p>
                      <p className="code-activation">
                        <span>Activation code</span>
                        <strong>{code.activationCode || 'Unavailable for older code'}</strong>
                      </p>
                      <p className="code-date">Created {new Date(code.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div className="code-actions">
                      {code.status === 'activated' && (
                        <button className="edit-link" type="button" onClick={() => openEdit(code)} aria-label="Update QR destination">Edit</button>
                      )}
                      <button className="delete-link" type="button" onClick={() => setDeleting(code)} aria-label="Delete QR code">Delete</button>
                      <a className="open-link" href={code.qrUrl} target="_blank" rel="noreferrer" aria-label="Open QR code">↗</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </section>
        <footer className="dashboard-footer"><Brand compact /><span>Keep it simple. Keep it moving.</span></footer>
      </main>

      {created && <div className="modal-backdrop" role="presentation" onClick={() => setCreated(null)}>
        <section className="created-modal" role="dialog" aria-modal="true" aria-labelledby="created-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setCreated(null)} aria-label="Close">×</button>
          <span className="eyebrow">YOUR QR IS READY</span>
          <h2 id="created-title">One more thing.</h2>
          <p className="muted">Share this code and activation number with the person who will set its destination.</p>
          <div className="modal-qr"><QRCodeSVG value={created.qrUrl} size={144} level="M" /></div>
          <div className="activation-code">
            <div><span className="stat-label">ONE-TIME ACTIVATION CODE</span><strong>{created.activationCode}</strong></div>
            <button className="button button-outline copy-button" onClick={copyCode}>{copied ? 'Copied ✓' : 'Copy code'}</button>
          </div>
          <p className="modal-hint">Keep this code somewhere safe. An activated QR’s destination can be updated later from the admin panel.</p>
          <button className="button button-dark button-wide" onClick={() => setCreated(null)}>Done <span aria-hidden="true">→</span></button>
        </section>
      </div>}

      {editing && <div className="modal-backdrop" role="presentation" onClick={() => !saving && setEditing(null)}>
        <section className="created-modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setEditing(null)} disabled={saving} aria-label="Close">×</button>
          <span className="eyebrow">UPDATE DESTINATION</span>
          <h2 id="edit-title">Change where it leads.</h2>
          <p className="muted">The QR code stays the same. Future scans will open the new destination.</p>
          <form className="form-stack edit-form" onSubmit={updateDestination}>
            <label htmlFor="destination">Destination URL</label>
            <input id="destination" type="url" value={editUrl} onChange={(event) => setEditUrl(event.target.value)} placeholder="https://example.com" required />
            <button className="button button-dark button-wide" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save destination'} <span aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      </div>}

      {deleting && <div className="modal-backdrop" role="presentation" onClick={() => !deleteBusy && setDeleting(null)}>
        <section className="created-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setDeleting(null)} disabled={deleteBusy} aria-label="Close">×</button>
          <span className="eyebrow delete-eyebrow">DELETE QR CODE</span>
          <h2 id="delete-title">Remove this QR code?</h2>
          <p className="muted">This permanently removes the code and its destination. QR links will stop working.</p>
          <div className="delete-actions">
            <button className="button button-outline" type="button" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button>
            <button className="button delete-button" type="button" onClick={deleteCode} disabled={deleteBusy}>{deleteBusy ? 'Deleting…' : 'Delete QR code'}</button>
          </div>
        </section>
      </div>}

      {deletingBatch && <div className="modal-backdrop" role="presentation" onClick={() => !batchDeleteBusy && setDeletingBatch(null)}>
        <section className="created-modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-batch-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setDeletingBatch(null)} disabled={batchDeleteBusy} aria-label="Close">×</button>
          <span className="eyebrow delete-eyebrow">DELETE QR BATCH</span>
          <h2 id="delete-batch-title">Remove Batch {deletingBatch.batchNumber}?</h2>
          <p className="muted">This permanently deletes the batch and its {deletingBatch.count} QR codes. Their QR links will stop working.</p>
          <div className="delete-actions">
            <button className="button button-outline" type="button" onClick={() => setDeletingBatch(null)} disabled={batchDeleteBusy}>Cancel</button>
            <button className="button delete-button" type="button" onClick={deleteBatch} disabled={batchDeleteBusy}>{batchDeleteBusy ? 'Deleting…' : 'Delete batch'}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}

function ActivationPage() {
  const { qrId } = useParams();
  const [record, setRecord] = useState(null);
  const [activationCode, setActivationCode] = useState('');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    request(`/qrs/${encodeURIComponent(qrId)}`)
      .then((result) => {
        if (!active) return;
        setRecord(result);
        if (result.status === 'activated' && result.redirectUrl) window.location.replace(result.redirectUrl);
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [qrId]);

  async function activate(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await request(`/qrs/${encodeURIComponent(qrId)}/activate`, {
        method: 'POST',
        body: JSON.stringify({ activationCode, redirectUrl: destination }),
      });
      window.location.replace(result.redirectUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="activation-page"><div className="activation-card"><Brand /><p className="muted activation-loading">Checking your QR code…</p></div></main>;
  if (error && !record) return <main className="activation-page"><div className="activation-card"><Brand /><div className="activation-symbol error-symbol">!</div><h1>QR not found</h1><p className="muted">{error}</p></div></main>;
  if (record?.status === 'activated') return <main className="activation-page"><div className="activation-card"><Brand /><div className="activation-symbol">↗</div><h1>Taking you there…</h1><p className="muted">Your destination is opening now.</p></div></main>;

  return (
    <main className="activation-page">
      <section className="activation-card">
        <Brand />
        <div className="activation-symbol">↗</div>
        <span className="eyebrow">ONE-TIME SETUP</span>
        <h1>Make this QR yours.</h1>
        <p className="muted activation-description">Enter your activation code and the website you’d like this QR code to open.</p>
        <form className="form-stack activation-form" onSubmit={activate}>
          <label htmlFor="activation-code">Activation code</label>
          <input id="activation-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" placeholder="000000" value={activationCode} onChange={(event) => setActivationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required />
          <label htmlFor="destination">Destination URL</label>
          <input id="destination" type="url" inputMode="url" placeholder="https://yourwebsite.com" value={destination} onChange={(event) => setDestination(event.target.value)} required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark button-wide" disabled={busy}>{busy ? 'Activating…' : 'Activate QR code'} <span aria-hidden="true">→</span></button>
        </form>
        <p className="activation-note"><span className="lock-icon" aria-hidden="true">●</span> This destination can’t be changed after activation.</p>
      </section>
      <p className="activation-footer">Powered by <strong>dynamic<span className="brand-accent">qr</span></strong></p>
    </main>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));
  const navigate = useNavigate();

  function logout() {
    clearToken();
    setAuthenticated(false);
    navigate('/admin/login', { replace: true });
  }

  return (
    <Routes>
      <Route path="/q/:qrId" element={<ActivationPage />} />
      <Route path="/admin/login" element={authenticated ? <Navigate to="/admin" replace /> : <LoginPage onLogin={() => { setAuthenticated(true); navigate('/admin', { replace: true }); }} />} />
      <Route path="/admin" element={authenticated ? <Dashboard onLogout={logout} /> : <Navigate to="/admin/login" replace />} />
      <Route path="*" element={<Navigate to={authenticated ? '/admin' : '/admin/login'} replace />} />
    </Routes>
  );
}
