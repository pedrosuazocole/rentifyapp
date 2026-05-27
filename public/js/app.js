// public/js/app.js
// ══════════════════════════════════════════════════════════════
// RENTIFY APP — JavaScript del Frontend
// Arquitectura: SPA ligera con fetch API + estado en memoria
// ══════════════════════════════════════════════════════════════

// ── Estado Global ──────────────────────────────────────────────
const State = {
  token: localStorage.getItem('rentify_token') || null,
  user: JSON.parse(localStorage.getItem('rentify_user') || 'null'),
  currentPage: 'dashboard',
};

// ── API Client ─────────────────────────────────────────────────
const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(State.token ? { Authorization: `Bearer ${State.token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    // Token expirado → logout automático
    if (res.status === 401 && State.token) {
      logout();
      return null;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error en el servidor');
    return data;
  } catch (err) {
    if (err.name !== 'TypeError') toast(err.message, 'danger');
    throw err;
  }
}

// ── Autenticación ──────────────────────────────────────────────
async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!data) return false;

  State.token = data.data.token;
  State.user  = data.data.user;
  localStorage.setItem('rentify_token', State.token);
  localStorage.setItem('rentify_user', JSON.stringify(State.user));
  return true;
}

function logout() {
  State.token = null;
  State.user  = null;
  localStorage.removeItem('rentify_token');
  localStorage.removeItem('rentify_user');
  renderApp();
}

function isAuthenticated() {
  return !!State.token && !!State.user;
}

// ── Formato de moneda ──────────────────────────────────────────
function formatMoney(amount, currency = 'HNL') {
  const num = parseFloat(amount) || 0;
  const formatted = num.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'HNL' ? `L ${formatted}` : `$ ${formatted}`;
}

// ── Formato de fechas ──────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-HN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('es-HN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const MONTHS_ES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Badges de estado ───────────────────────────────────────────
function contractStatusBadge(status) {
  const map = {
    ACTIVE:     '<span class="badge badge-success">Activo</span>',
    EXPIRED:    '<span class="badge badge-danger">Vencido</span>',
    TERMINATED: '<span class="badge badge-neutral">Rescindido</span>',
    PENDING:    '<span class="badge badge-warning">Pendiente</span>',
  };
  return map[status] || `<span class="badge badge-neutral">${status}</span>`;
}

function paymentStatusBadge(status) {
  const map = {
    PAID:    '<span class="badge badge-success">Pagado</span>',
    PENDING: '<span class="badge badge-warning">Pendiente</span>',
    LATE:    '<span class="badge badge-danger">En Mora</span>',
    PARTIAL: '<span class="badge badge-accent">Parcial</span>',
    WAIVED:  '<span class="badge badge-neutral">Condonado</span>',
  };
  return map[status] || `<span class="badge badge-neutral">${status}</span>`;
}

// ── Toast notifications ────────────────────────────────────────
function toast(message, type = 'success', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    danger:  `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icons[type] || icons.success}<span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Modal helper ───────────────────────────────────────────────
function openModal(modalId) {
  const backdrop = document.getElementById(modalId);
  if (!backdrop) return;
  backdrop.style.display = 'flex';
  setTimeout(() => backdrop.classList.add('show'), 10);
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const backdrop = document.getElementById(modalId);
  if (!backdrop) return;
  backdrop.classList.remove('show');
  setTimeout(() => {
    backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }, 220);
}

// Cerrar modal al hacer clic en el backdrop
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    closeModal(e.target.id);
  }
});

// ── Vista Previa de Impresión ──────────────────────────────────
let currentPrintData = null;

function openPrintPreview(type, data) {
  currentPrintData = { type, data };
  renderPrintPreview(type, data, '210x297', 1);
  openModal('modal-print-preview');
}

function renderPrintPreview(type, data, format, copies) {
  const frame = document.getElementById('print-preview-frame');
  if (!frame) return;

  const isTicket = format === 'ticket';
  const pageClass = isTicket ? 'print-preview-page ticket-size' : 'print-preview-page';

  if (type === 'receipt') {
    frame.innerHTML = `<div class="${pageClass}">${buildReceiptHtml(data)}</div>`;
  }
}

function buildReceiptHtml(p) {
  return `
    <div class="receipt-header">
      <h2>RECIBO DE PAGO</h2>
      <p>Rentify App — Sistema de Control de Alquileres</p>
      <p>Honduras</p>
    </div>
    <hr class="receipt-divider">
    <div class="receipt-row"><span>Recibo N°:</span> <strong>${p.receiptNumber || '—'}</strong></div>
    <div class="receipt-row"><span>Inquilino:</span> <strong>${p.tenantName || '—'}</strong></div>
    <div class="receipt-row"><span>Propiedad:</span> <strong>${p.propertyUnit || '—'}</strong></div>
    <div class="receipt-row"><span>Período:</span> <strong>${MONTHS_ES[p.periodMonth] || ''} ${p.periodYear || ''}</strong></div>
    <div class="receipt-row"><span>Fecha de pago:</span> <strong>${formatDate(p.paymentDate)}</strong></div>
    <hr class="receipt-divider">
    <div class="receipt-row"><span>Monto alquiler:</span> <strong>${formatMoney(p.amountDue, p.currency)}</strong></div>
    ${p.isLate ? `<div class="receipt-row" style="color:#c00"><span>Cargo por mora:</span> <strong>${formatMoney(p.lateFeeAmount, p.currency)}</strong></div>` : ''}
    ${p.exchangeRateUsed ? `<div class="receipt-row"><span>Tipo de cambio:</span> <strong>L ${parseFloat(p.exchangeRateUsed).toFixed(4)}</strong></div>` : ''}
    <div class="receipt-total">
      <span>TOTAL PAGADO</span>
      <strong>${formatMoney(p.amountPaid, p.paymentCurrency)}</strong>
    </div>
    <hr class="receipt-divider">
    <div class="receipt-footer">
      <p>Documento generado el ${formatDateTime(new Date().toISOString())}</p>
      <p>Rentify App — Este recibo es un comprobante digital válido</p>
    </div>
  `;
}

function printDocument() {
  const frame = document.getElementById('print-preview-frame');
  if (!frame) return;

  const copies = parseInt(document.getElementById('print-copies')?.value || '1');
  const format = document.getElementById('print-format')?.value || '210x297';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Rentify App - Recibo</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', sans-serif; color: #1a1916; }
    @page { size: ${format === 'ticket' ? '80mm auto' : 'letter'}; margin: 15mm; }
    .receipt-header { text-align: center; margin-bottom: 16px; }
    .receipt-header h2 { font-size: 16px; font-weight: 700; }
    .receipt-header p { font-size: 10px; color: #666; }
    .receipt-divider { border: none; border-top: 1px dashed #ccc; margin: 10px 0; }
    .receipt-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 11px; }
    .receipt-row strong { font-weight: 600; }
    .receipt-total { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin-top: 8px; padding-top: 8px; border-top: 2px solid #333; }
    .receipt-footer { text-align: center; font-size: 9px; color: #888; margin-top: 14px; }
  </style>
</head>
<body>
  ${Array(copies).fill(frame.querySelector('.print-preview-page')?.innerHTML || '').join('<div style="page-break-after:always"></div>')}
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); win.close(); };

  closeModal('modal-print-preview');
}

// ── Navegación ─────────────────────────────────────────────────
function navigate(page) {
  State.currentPage = page;

  // Actualizar nav activo
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Renderizar la página
  const contentArea = document.getElementById('page-content');
  if (!contentArea) return;

  const pages = {
    dashboard:   renderDashboard,
    properties:  renderProperties,
    tenants:     renderTenants,
    contracts:   renderContracts,
    payments:    renderPayments,
    'exchange-rates': renderExchangeRates,
    reports:     renderReports,
  };

  const renderFn = pages[page];
  if (renderFn) {
    contentArea.innerHTML = '<div class="empty-state"><div class="spinner"></div><p style="margin-top:16px">Cargando...</p></div>';
    renderFn().catch(err => {
      contentArea.innerHTML = `<div class="alert alert-danger">Error al cargar: ${err.message}</div>`;
    });
  }

  // Actualizar título de topbar
  const titles = {
    dashboard: 'Panel Principal',
    properties: 'Propiedades',
    tenants: 'Inquilinos',
    contracts: 'Contratos',
    payments: 'Pagos',
    'exchange-rates': 'Tipo de Cambio',
    reports: 'Reportes',
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[page] || page;
}

// ════════════════════════════════════════════════════════════════
// PÁGINAS
// ════════════════════════════════════════════════════════════════

// ── Dashboard ──────────────────────────────────────────────────
async function renderDashboard() {
  const [propertiesRes, contractsRes, paymentsRes, rateRes] = await Promise.allSettled([
    apiFetch('/properties?limit=100'),
    apiFetch('/contracts?status=ACTIVE&limit=100'),
    apiFetch('/payments?status=PENDING&limit=100'),
    apiFetch('/exchange-rates/today'),
  ]);

  const props     = propertiesRes.value?.data || [];
  const contracts = contractsRes.value?.data || [];
  const pending   = paymentsRes.value?.data || [];
  const rate      = rateRes.value?.data?.rate || '—';

  const latePayments = pending.filter(p => p.status === 'LATE');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon green">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
        <div class="stat-value">${props.length}</div>
        <div class="stat-label">Propiedades registradas</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="stat-value">${contracts.length}</div>
        <div class="stat-label">Contratos activos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="stat-value">${latePayments.length}</div>
        <div class="stat-label">Pagos en mora</div>
        ${latePayments.length > 0 ? '<span class="stat-change down">⚠ Atención</span>' : '<span class="stat-change up">✓ Sin mora</span>'}
      </div>
      <div class="stat-card">
        <div class="stat-icon gold">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-value" style="font-size:1.2rem">L ${parseFloat(rate).toFixed(4)}</div>
        <div class="stat-label">Tasa USD hoy</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Pagos pendientes urgentes</span>
          <button class="btn btn-ghost btn-sm" onclick="navigate('payments')">Ver todos</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Inquilino</th><th>Unidad</th><th>Monto</th><th>Estado</th>
            </tr></thead>
            <tbody>
              ${pending.slice(0, 6).map(p => `
                <tr>
                  <td>${p.contract?.tenant?.firstName || ''} ${p.contract?.tenant?.lastName || ''}</td>
                  <td class="text-muted">${p.contract?.unit?.number || '—'}</td>
                  <td class="td-mono">${formatMoney(p.amountDue, p.contract?.currency)}</td>
                  <td>${paymentStatusBadge(p.status)}</td>
                </tr>`).join('') || '<tr><td colspan="4"><div class="empty-state" style="padding:24px">No hay pagos pendientes</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Contratos por vencer (30 días)</span>
          <button class="btn btn-ghost btn-sm" onclick="loadExpiringContracts()">Ver</button>
        </div>
        <div id="expiring-contracts-list">
          <div class="empty-state" style="padding:24px">
            <p>Hacé clic en "Ver" para cargar</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadExpiringContracts() {
  const res = await apiFetch('/contracts/expiring?days=30');
  const list = document.getElementById('expiring-contracts-list');
  if (!list) return;

  const contracts = res?.data || [];
  if (contracts.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:24px"><p>No hay contratos por vencer</p></div>';
    return;
  }

  list.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Inquilino</th><th>Unidad</th><th>Vence</th></tr></thead>
        <tbody>
          ${contracts.slice(0, 6).map(c => `
            <tr>
              <td>${c.tenant?.firstName} ${c.tenant?.lastName}</td>
              <td class="text-muted">${c.unit?.number}</td>
              <td class="td-mono">${formatDate(c.endDate)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Propiedades ────────────────────────────────────────────────
async function renderProperties() {
  const res = await apiFetch('/properties');
  const properties = res?.data || [];

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Propiedades</h2>
        <p>Gestioná tus propiedades y unidades disponibles</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-new-property')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva propiedad
      </button>
    </div>

    ${properties.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <h4>Sin propiedades registradas</h4>
          <p>Creá tu primera propiedad para empezar a gestionar alquileres</p>
        </div>
      </div>` : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${properties.map(p => {
        const occupied = p.units?.filter(u => u.isOccupied).length || 0;
        const total    = p.units?.length || 0;
        return `
          <div class="card" style="cursor:pointer" onclick="openPropertyDetail('${p.id}')">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
              <div>
                <div style="font-weight:600;font-size:0.95rem">${p.name}</div>
                <div class="text-muted" style="margin-top:2px">${p.address}</div>
                <div class="text-muted">${p.city}, ${p.department}</div>
              </div>
              <span class="badge ${p.isActive ? 'badge-success' : 'badge-neutral'}">${p.isActive ? 'Activa' : 'Inactiva'}</span>
            </div>
            <div style="display:flex;gap:16px;padding-top:14px;border-top:1px solid var(--c-border)">
              <div style="flex:1;text-align:center">
                <div style="font-family:var(--font-mono);font-size:1.3rem;font-weight:500">${total}</div>
                <div class="text-muted">Unidades</div>
              </div>
              <div style="flex:1;text-align:center">
                <div style="font-family:var(--font-mono);font-size:1.3rem;font-weight:500;color:var(--c-primary)">${occupied}</div>
                <div class="text-muted">Ocupadas</div>
              </div>
              <div style="flex:1;text-align:center">
                <div style="font-family:var(--font-mono);font-size:1.3rem;font-weight:500;color:var(--c-text-muted)">${total - occupied}</div>
                <div class="text-muted">Libres</div>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`}

    <!-- Modal nueva propiedad -->
    <div id="modal-new-property" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Nueva propiedad</span>
          <button class="modal-close" onclick="closeModal('modal-new-property')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre de la propiedad <span>*</span></label>
            <input id="prop-name" class="form-control" placeholder="Ej: Residencial Las Palmas">
          </div>
          <div class="form-group">
            <label class="form-label">Dirección <span>*</span></label>
            <input id="prop-address" class="form-control" placeholder="Col. Kennedy, Calle Principal #45">
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Ciudad</label>
              <input id="prop-city" class="form-control" value="Tegucigalpa">
            </div>
            <div class="form-group">
              <label class="form-label">Departamento</label>
              <input id="prop-dept" class="form-control" value="Francisco Morazán">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Descripción</label>
            <textarea id="prop-desc" class="form-control" rows="3" placeholder="Descripción opcional..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-property')">Cancelar</button>
          <button class="btn btn-primary" onclick="createProperty()">Crear propiedad</button>
        </div>
      </div>
    </div>
  `;
}

async function createProperty() {
  const name    = document.getElementById('prop-name')?.value?.trim();
  const address = document.getElementById('prop-address')?.value?.trim();
  const city    = document.getElementById('prop-city')?.value?.trim();
  const department = document.getElementById('prop-dept')?.value?.trim();
  const description = document.getElementById('prop-desc')?.value?.trim();

  if (!name || !address) { toast('El nombre y la dirección son requeridos.', 'warning'); return; }

  await apiFetch('/properties', { method: 'POST', body: JSON.stringify({ name, address, city, department, description }) });
  toast('Propiedad creada correctamente.');
  closeModal('modal-new-property');
  renderProperties();
}

async function openPropertyDetail(id) {
  const res = await apiFetch(`/properties/${id}`);
  const p = res?.data;
  if (!p) return;

  const modal = document.createElement('div');
  modal.id = 'modal-property-detail';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">${p.name}</span>
        <button class="modal-close" onclick="closeModal('modal-property-detail');this.closest('.modal-backdrop').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p class="text-muted mb-4">${p.address} — ${p.city}, ${p.department}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <strong style="font-size:0.88rem">Unidades (${p.units?.length || 0})</strong>
          <button class="btn btn-ghost btn-sm" onclick="openAddUnit('${p.id}')">+ Agregar unidad</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Número</th><th>Piso</th><th>Hab.</th><th>Estado</th><th>Inquilino activo</th></tr></thead>
            <tbody>
              ${(p.units || []).map(u => {
                const activeContract = u.contracts?.[0];
                const tenant = activeContract?.tenant;
                return `<tr>
                  <td><strong>${u.number}</strong></td>
                  <td>${u.floor ?? '—'}</td>
                  <td>${u.bedrooms}</td>
                  <td><span class="badge ${u.isOccupied ? 'badge-success' : 'badge-neutral'}">${u.isOccupied ? 'Ocupada' : 'Libre'}</span></td>
                  <td>${tenant ? `${tenant.firstName} ${tenant.lastName}` : '<span class="text-muted">—</span>'}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:20px">Sin unidades</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-property-detail');
}

// ── Inquilinos ─────────────────────────────────────────────────
async function renderTenants(page = 1, search = '') {
  const query = `?page=${page}&limit=10${search ? '&search=' + encodeURIComponent(search) : ''}`;
  const res = await apiFetch(`/tenants${query}`);
  const tenants = res?.data || [];
  const pagination = res?.pagination;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Inquilinos</h2><p>Registro de todos los arrendatarios</p></div>
      <div class="flex gap-2">
        <div class="search-box">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="form-control" id="tenant-search" placeholder="Buscar por nombre, DNI..." value="${search}"
            onkeyup="if(event.key==='Enter') renderTenants(1, this.value)">
        </div>
        <button class="btn btn-primary" onclick="openModal('modal-new-tenant')">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo inquilino
        </button>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Nombre</th><th>Teléfono</th><th>DNI</th><th>Email</th><th>Contrato activo</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${tenants.map(t => {
              const active = t.contracts?.[0];
              return `<tr>
                <td><strong>${t.firstName} ${t.lastName}</strong></td>
                <td class="td-mono">${t.phone}</td>
                <td class="td-mono">${t.nationalId || '—'}</td>
                <td>${t.email || '—'}</td>
                <td>${active ? `<span class="text-muted">${active.unit?.property?.name} — ${active.unit?.number}</span>` : '<span class="text-muted">—</span>'}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="viewTenantHistory('${t.id}','${t.firstName} ${t.lastName}')">Historial</button>
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="6"><div class="empty-state" style="padding:30px">No se encontraron inquilinos</div></td></tr>'}
          </tbody>
        </table>
      </div>
      ${pagination ? renderPagination(pagination, (p) => `renderTenants(${p}, '${search}')`) : ''}
    </div>

    <!-- Modal nuevo inquilino -->
    <div id="modal-new-tenant" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Registrar inquilino</span>
          <button class="modal-close" onclick="closeModal('modal-new-tenant')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nombre <span>*</span></label>
              <input id="ten-firstname" class="form-control" placeholder="Juan">
            </div>
            <div class="form-group">
              <label class="form-label">Apellido <span>*</span></label>
              <input id="ten-lastname" class="form-control" placeholder="Martínez">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono WhatsApp <span>*</span></label>
            <input id="ten-phone" class="form-control" placeholder="+504XXXXXXXX">
            <div class="form-hint">Formato requerido: +504XXXXXXXX (para notificaciones)</div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">DNI hondureño</label>
              <input id="ten-dni" class="form-control" placeholder="0801XXXXXXXXX">
            </div>
            <div class="form-group">
              <label class="form-label">Correo electrónico</label>
              <input id="ten-email" class="form-control" type="email" placeholder="correo@ejemplo.com">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notas internas</label>
            <textarea id="ten-notes" class="form-control" rows="2" placeholder="Notas privadas sobre el inquilino..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-tenant')">Cancelar</button>
          <button class="btn btn-primary" onclick="createTenant()">Registrar</button>
        </div>
      </div>
    </div>
  `;
}

async function createTenant() {
  const firstName = document.getElementById('ten-firstname')?.value?.trim();
  const lastName  = document.getElementById('ten-lastname')?.value?.trim();
  const phone     = document.getElementById('ten-phone')?.value?.trim();
  const nationalId = document.getElementById('ten-dni')?.value?.trim();
  const email     = document.getElementById('ten-email')?.value?.trim();
  const notes     = document.getElementById('ten-notes')?.value?.trim();

  if (!firstName || !lastName || !phone) { toast('Nombre, apellido y teléfono son requeridos.', 'warning'); return; }
  if (!/^\+504\d{8}$/.test(phone)) { toast('El teléfono debe ser +504XXXXXXXX.', 'warning'); return; }

  await apiFetch('/tenants', { method: 'POST', body: JSON.stringify({ firstName, lastName, phone, nationalId: nationalId || undefined, email: email || undefined, notes: notes || undefined }) });
  toast('Inquilino registrado correctamente.');
  closeModal('modal-new-tenant');
  renderTenants();
}

async function viewTenantHistory(tenantId, tenantName) {
  const res = await apiFetch(`/tenants/${tenantId}/payments`);
  const payments = res?.data || [];

  const modal = document.createElement('div');
  modal.id = 'modal-tenant-history';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">Historial de pagos — ${tenantName}</span>
        <button class="modal-close" onclick="closeModal('modal-tenant-history');this.closest('.modal-backdrop').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Período</th><th>Unidad</th><th>Monto due</th><th>Pagado</th><th>Estado</th><th>Fecha pago</th><th>Recibo</th></tr></thead>
            <tbody>
              ${payments.map(p => `<tr>
                <td><strong>${MONTHS_ES[p.periodMonth]} ${p.periodYear}</strong></td>
                <td class="text-muted">${p.contract?.unit?.number || '—'}</td>
                <td class="td-mono">${formatMoney(p.amountDue, p.contract?.currency)}</td>
                <td class="td-mono">${p.amountPaid > 0 ? formatMoney(p.amountPaid, p.paymentCurrency) : '—'}</td>
                <td>${paymentStatusBadge(p.status)}</td>
                <td>${formatDate(p.paymentDate)}</td>
                <td>${p.status === 'PAID' ? `<button class="btn btn-ghost btn-sm" onclick="previewReceipt('${p.id}')">PDF</button>` : '—'}</td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin pagos registrados</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-tenant-history');
}

// ── Contratos ──────────────────────────────────────────────────
async function renderContracts(page = 1, status = '') {
  const query = `?page=${page}&limit=10${status ? '&status=' + status : ''}`;
  const res = await apiFetch(`/contracts${query}`);
  const contracts = res?.data || [];
  const pagination = res?.pagination;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Contratos</h2><p>Gestión de contratos de arrendamiento</p></div>
      <button class="btn btn-primary" onclick="openNewContractModal()">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nuevo contrato
      </button>
    </div>

    <div class="tabs">
      <button class="tab-btn ${!status ? 'active' : ''}" onclick="renderContracts(1,'')">Todos</button>
      <button class="tab-btn ${status==='ACTIVE' ? 'active' : ''}" onclick="renderContracts(1,'ACTIVE')">Activos</button>
      <button class="tab-btn ${status==='EXPIRED' ? 'active' : ''}" onclick="renderContracts(1,'EXPIRED')">Vencidos</button>
      <button class="tab-btn ${status==='TERMINATED' ? 'active' : ''}" onclick="renderContracts(1,'TERMINATED')">Rescindidos</button>
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Inquilino</th><th>Unidad</th><th>Monto mensual</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${contracts.map(c => `<tr>
              <td><strong>${c.tenant?.firstName} ${c.tenant?.lastName}</strong></td>
              <td class="text-muted">${c.unit?.property?.name} — ${c.unit?.number}</td>
              <td class="td-mono">${formatMoney(c.monthlyRent, c.currency)}</td>
              <td>${formatDate(c.startDate)}</td>
              <td>${formatDate(c.endDate)}</td>
              <td>${contractStatusBadge(c.status)}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-ghost btn-sm" onclick="viewContractDetail('${c.id}')">Ver</button>
                  ${c.status === 'ACTIVE' ? `<button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="terminateContract('${c.id}')">Rescindir</button>` : ''}
                </div>
              </td>
            </tr>`).join('') || '<tr><td colspan="7"><div class="empty-state" style="padding:30px">No hay contratos</div></td></tr>'}
          </tbody>
        </table>
      </div>
      ${pagination ? renderPagination(pagination, (p) => `renderContracts(${p}, '${status}')`) : ''}
    </div>

    <div id="modal-new-contract" class="modal-backdrop" style="display:none">
      <div class="modal modal-lg">
        <div class="modal-header">
          <span class="modal-title">Nuevo contrato</span>
          <button class="modal-close" onclick="closeModal('modal-new-contract')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" id="new-contract-form-body">
          <div class="alert alert-info">Cargando datos...</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-contract')">Cancelar</button>
          <button class="btn btn-primary" onclick="createContract()">Crear contrato</button>
        </div>
      </div>
    </div>
  `;
}

async function openNewContractModal() {
  openModal('modal-new-contract');
  const body = document.getElementById('new-contract-form-body');
  if (!body) return;

  const [propsRes, tenantsRes] = await Promise.all([
    apiFetch('/properties?limit=100'),
    apiFetch('/tenants?limit=100'),
  ]);
  const properties = propsRes?.data || [];
  const tenants    = tenantsRes?.data || [];

  // Recoger todas las unidades disponibles
  const allUnits = properties.flatMap(p => (p.units || [])
    .filter(u => !u.isOccupied)
    .map(u => ({ ...u, propertyName: p.name }))
  );

  body.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Inquilino <span>*</span></label>
        <select id="ct-tenant" class="form-control">
          <option value="">Seleccioná un inquilino</option>
          ${tenants.map(t => `<option value="${t.id}">${t.firstName} ${t.lastName} — ${t.phone}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Unidad disponible <span>*</span></label>
        <select id="ct-unit" class="form-control">
          <option value="">Seleccioná una unidad</option>
          ${allUnits.map(u => `<option value="${u.id}">${u.propertyName} — ${u.number}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Fecha de inicio <span>*</span></label>
        <input id="ct-start" class="form-control" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de fin <span>*</span></label>
        <input id="ct-end" class="form-control" type="date">
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label class="form-label">Monto mensual <span>*</span></label>
        <input id="ct-rent" class="form-control" type="number" min="0" placeholder="3000.00">
      </div>
      <div class="form-group">
        <label class="form-label">Moneda <span>*</span></label>
        <select id="ct-currency" class="form-control">
          <option value="HNL">HNL — Lempiras</option>
          <option value="USD">USD — Dólares</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Día de pago <span>*</span></label>
        <input id="ct-day" class="form-control" type="number" min="1" max="28" value="5">
        <div class="form-hint">Día del mes (1-28)</div>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Depósito</label>
        <input id="ct-deposit" class="form-control" type="number" min="0" placeholder="3000.00">
      </div>
      <div class="form-group">
        <label class="form-label">Moneda del depósito</label>
        <select id="ct-deposit-currency" class="form-control">
          <option value="HNL">HNL</option>
          <option value="USD">USD</option>
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">% de mora mensual</label>
        <input id="ct-late" class="form-control" type="number" min="0" max="100" value="5" step="0.5">
        <div class="form-hint">Porcentaje aplicado después del plazo de gracia</div>
      </div>
      <div class="form-group">
        <label class="form-label">Días de gracia</label>
        <input id="ct-grace" class="form-control" type="number" min="0" value="5">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas del contrato</label>
      <textarea id="ct-notes" class="form-control" rows="2" placeholder="Condiciones especiales, observaciones..."></textarea>
    </div>
  `;
}

async function createContract() {
  const data = {
    tenantId:         document.getElementById('ct-tenant')?.value,
    unitId:           document.getElementById('ct-unit')?.value,
    startDate:        document.getElementById('ct-start')?.value,
    endDate:          document.getElementById('ct-end')?.value,
    monthlyRent:      parseFloat(document.getElementById('ct-rent')?.value),
    currency:         document.getElementById('ct-currency')?.value,
    paymentDayOfMonth: parseInt(document.getElementById('ct-day')?.value),
    depositAmount:    parseFloat(document.getElementById('ct-deposit')?.value || '0'),
    depositCurrency:  document.getElementById('ct-deposit-currency')?.value,
    lateFeePercent:   parseFloat(document.getElementById('ct-late')?.value),
    gracePeriodDays:  parseInt(document.getElementById('ct-grace')?.value),
    notes:            document.getElementById('ct-notes')?.value?.trim(),
  };

  if (!data.tenantId || !data.unitId || !data.startDate || !data.endDate || !data.monthlyRent) {
    toast('Completá todos los campos requeridos.', 'warning');
    return;
  }

  await apiFetch('/contracts', { method: 'POST', body: JSON.stringify(data) });
  toast('Contrato creado correctamente. La unidad ha sido marcada como ocupada.');
  closeModal('modal-new-contract');
  renderContracts();
}

async function terminateContract(id) {
  const reason = prompt('Motivo de rescisión del contrato:');
  if (!reason) return;
  await apiFetch(`/contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) });
  toast('Contrato rescindido. La unidad quedó disponible.');
  renderContracts();
}

// ── Pagos ──────────────────────────────────────────────────────
async function renderPayments(page = 1, status = '') {
  const query = `?page=${page}&limit=12${status ? '&status=' + status : ''}`;
  const res = await apiFetch(`/payments${query}`);
  const payments = res?.data || [];
  const pagination = res?.pagination;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Pagos</h2><p>Control de cobros y recibos</p></div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" onclick="openGenerateModal()">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Generar del mes
        </button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${!status ? 'active' : ''}" onclick="renderPayments(1,'')">Todos</button>
      <button class="tab-btn ${status==='PENDING' ? 'active' : ''}" onclick="renderPayments(1,'PENDING')">Pendientes</button>
      <button class="tab-btn ${status==='LATE' ? 'active' : ''}" onclick="renderPayments(1,'LATE')">En Mora</button>
      <button class="tab-btn ${status==='PAID' ? 'active' : ''}" onclick="renderPayments(1,'PAID')">Pagados</button>
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Período</th><th>Inquilino</th><th>Unidad</th><th>Monto</th><th>Mora</th><th>Estado</th><th>Vencimiento</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${payments.map(p => `<tr>
              <td><strong>${MONTHS_ES[p.periodMonth]} ${p.periodYear}</strong></td>
              <td>${p.contract?.tenant?.firstName} ${p.contract?.tenant?.lastName}</td>
              <td class="text-muted">${p.contract?.unit?.number}</td>
              <td class="td-mono">${formatMoney(p.amountDue, p.contract?.currency)}</td>
              <td class="td-mono" style="color:var(--c-danger)">${p.lateFeeAmount > 0 ? formatMoney(p.lateFeeAmount, p.contract?.currency) : '—'}</td>
              <td>${paymentStatusBadge(p.status)}</td>
              <td>${formatDate(p.dueDate)}</td>
              <td>
                <div class="flex gap-2">
                  ${(p.status === 'PENDING' || p.status === 'LATE' || p.status === 'PARTIAL') ? `<button class="btn btn-primary btn-sm" onclick="openRegisterPayment('${p.id}')">Registrar pago</button>` : ''}
                  ${p.status === 'PAID' ? `<button class="btn btn-ghost btn-sm" onclick="previewReceipt('${p.id}')">Recibo</button>` : ''}
                </div>
              </td>
            </tr>`).join('') || '<tr><td colspan="8"><div class="empty-state" style="padding:30px">No hay pagos registrados</div></td></tr>'}
          </tbody>
        </table>
      </div>
      ${pagination ? renderPagination(pagination, (p) => `renderPayments(${p}, '${status}')`) : ''}
    </div>

    <!-- Modal generar pagos del mes -->
    <div id="modal-generate" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Generar pagos del mes</span>
          <button class="modal-close" onclick="closeModal('modal-generate')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="text-muted mb-4">Esto creará los registros de pago para todos los contratos activos del período seleccionado. Los registros ya existentes no se duplicarán.</p>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Mes</label>
              <select id="gen-month" class="form-control">
                ${MONTHS_ES.slice(1).map((m, i) => `<option value="${i+1}" ${i+1===new Date().getMonth()+1?'selected':''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Año</label>
              <input id="gen-year" class="form-control" type="number" value="${new Date().getFullYear()}">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-generate')">Cancelar</button>
          <button class="btn btn-primary" onclick="generatePayments()">Generar pagos</button>
        </div>
      </div>
    </div>

    <!-- Modal registrar pago -->
    <div id="modal-register-payment" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Registrar pago</span>
          <button class="modal-close" onclick="closeModal('modal-register-payment')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" id="register-payment-body">
          <div class="spinner"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-register-payment')">Cancelar</button>
          <button class="btn btn-primary" onclick="submitPayment()">Confirmar pago</button>
        </div>
      </div>
    </div>

    <!-- Modal vista previa de impresión -->
    <div id="modal-print-preview" class="modal-backdrop print-preview-modal" style="display:none">
      <div class="modal modal-xl">
        <div class="modal-header">
          <span class="modal-title">Vista previa de impresión</span>
          <button class="modal-close" onclick="closeModal('modal-print-preview')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="print-preview-toolbar">
          <span class="print-preview-toolbar-label">Opciones:</span>
          <div class="print-options">
            <div class="print-option-group">
              <label>Formato</label>
              <select id="print-format" onchange="refreshPreview()">
                <option value="210x297">Carta / A4</option>
                <option value="ticket">Ticket (80mm)</option>
              </select>
            </div>
            <div class="print-option-group">
              <label>Copias</label>
              <input type="number" id="print-copies" value="1" min="1" max="10" onchange="refreshPreview()">
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="downloadReceiptPdf()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar PDF
          </button>
        </div>
        <div class="print-preview-frame" id="print-preview-frame"></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-print-preview')">Cancelar</button>
          <button class="btn btn-primary" onclick="printDocument()">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir
          </button>
        </div>
      </div>
    </div>
  `;
}

function openGenerateModal() { openModal('modal-generate'); }

async function generatePayments() {
  const month = parseInt(document.getElementById('gen-month')?.value);
  const year  = parseInt(document.getElementById('gen-year')?.value);
  const res   = await apiFetch('/payments/generate', { method: 'POST', body: JSON.stringify({ month, year }) });
  toast(res?.message || 'Pagos generados.');
  closeModal('modal-generate');
  renderPayments();
}

let currentPaymentId = null;
async function openRegisterPayment(paymentId) {
  currentPaymentId = paymentId;
  openModal('modal-register-payment');

  const res = await apiFetch(`/payments?limit=100`);
  const payment = res?.data?.find(p => p.id === paymentId);

  const body = document.getElementById('register-payment-body');
  if (!body) return;

  const rateRes = await apiFetch('/exchange-rates/today');
  const todayRate = rateRes?.data?.rate;

  body.innerHTML = `
    ${payment?.isLate ? `<div class="alert alert-danger">Este pago está en mora (${payment.daysLate} días). Se aplicará un cargo del ${payment.contract?.lateFeePercent}%.</div>` : ''}
    <div class="form-group">
      <label class="form-label">Monto a registrar</label>
      <input id="pay-amount" class="form-control td-mono" type="number" step="0.01" value="${payment?.amountDue || ''}">
      <div class="form-hint">Monto adeudado: ${formatMoney(payment?.amountDue, payment?.contract?.currency)}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Moneda del pago</label>
      <select id="pay-currency" class="form-control" onchange="updateConversion()">
        <option value="HNL">HNL — Lempiras hondureños</option>
        <option value="USD">USD — Dólares americanos</option>
      </select>
    </div>
    <div id="conversion-info" class="alert alert-info" style="display:none">
      Tasa de cambio de hoy: <strong>L ${parseFloat(todayRate || 0).toFixed(4)}</strong> por USD
    </div>
    <div class="form-group">
      <label class="form-label">Fecha del pago</label>
      <input id="pay-date" class="form-control" type="date" value="${new Date().toISOString().split('T')[0]}">
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <input id="pay-notes" class="form-control" placeholder="Transferencia, efectivo, etc.">
    </div>
  `;
}

function updateConversion() {
  const currency = document.getElementById('pay-currency')?.value;
  const convInfo = document.getElementById('conversion-info');
  if (convInfo) convInfo.style.display = currency === 'USD' ? 'flex' : 'none';
}

async function submitPayment() {
  const amountPaid     = parseFloat(document.getElementById('pay-amount')?.value);
  const paymentCurrency = document.getElementById('pay-currency')?.value;
  const paymentDate    = document.getElementById('pay-date')?.value;
  const notes          = document.getElementById('pay-notes')?.value;

  if (!amountPaid || amountPaid <= 0) { toast('Ingresá un monto válido.', 'warning'); return; }

  const res = await apiFetch(`/payments/${currentPaymentId}/register`, {
    method: 'POST',
    body: JSON.stringify({ amountPaid, paymentCurrency, paymentDate, notes }),
  });

  toast(res?.message || 'Pago registrado. El recibo fue enviado por WhatsApp.');
  closeModal('modal-register-payment');

  // Abrir vista previa del recibo automáticamente
  if (res?.data?.status === 'PAID') {
    setTimeout(() => previewReceipt(currentPaymentId), 600);
  }

  renderPayments();
}

async function previewReceipt(paymentId) {
  const res = await apiFetch(`/payments?limit=200`);
  const payment = res?.data?.find(p => p.id === paymentId);
  if (!payment) { toast('Pago no encontrado', 'danger'); return; }

  openPrintPreview('receipt', {
    receiptNumber: payment.receiptNumber,
    tenantName: `${payment.contract?.tenant?.firstName} ${payment.contract?.tenant?.lastName}`,
    propertyUnit: `${payment.contract?.unit?.property?.name} — ${payment.contract?.unit?.number}`,
    periodMonth: payment.periodMonth,
    periodYear: payment.periodYear,
    paymentDate: payment.paymentDate,
    amountDue: payment.amountDue,
    amountPaid: payment.amountPaid,
    currency: payment.contract?.currency,
    paymentCurrency: payment.paymentCurrency,
    lateFeeAmount: payment.lateFeeAmount,
    isLate: payment.isLate,
    exchangeRateUsed: payment.exchangeRateUsed,
  });
}

function refreshPreview() {
  if (currentPrintData) {
    const format = document.getElementById('print-format')?.value;
    const copies = document.getElementById('print-copies')?.value;
    renderPrintPreview(currentPrintData.type, currentPrintData.data, format, parseInt(copies));
  }
}

function downloadReceiptPdf() {
  if (!currentPrintData?.data?.receiptNumber) return;
  window.open(`/api/payments/${currentPaymentId}/receipt`, '_blank');
}

// ── Tipo de Cambio ─────────────────────────────────────────────
async function renderExchangeRates() {
  const [todayRes, historyRes] = await Promise.all([
    apiFetch('/exchange-rates/today'),
    apiFetch('/exchange-rates?limit=30'),
  ]);
  const todayRate = todayRes?.data?.rate;
  const history   = historyRes?.data || [];

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Tipo de Cambio</h2><p>Historial HNL / USD — Honduras</p></div>
      <button class="btn btn-primary" onclick="forceRateUpdate()">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Actualizar ahora
      </button>
    </div>

    <div class="stat-grid" style="max-width:480px;margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon gold">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-value">L ${parseFloat(todayRate || 0).toFixed(4)}</div>
        <div class="stat-label">Tasa USD/HNL de hoy</div>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--c-border)">
        <strong style="font-size:0.88rem">Historial (últimos 30 días)</strong>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Tasa (L por 1 USD)</th><th>Fuente</th></tr></thead>
          <tbody>
            ${history.map(r => `<tr>
              <td>${formatDate(r.date)}</td>
              <td class="td-mono">L ${parseFloat(r.rate).toFixed(4)}</td>
              <td class="text-muted">${r.source}</td>
            </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin historial</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function forceRateUpdate() {
  await apiFetch('/exchange-rates/fetch', { method: 'POST' });
  toast('Tipo de cambio actualizado correctamente.');
  renderExchangeRates();
}

// ── Reportes ───────────────────────────────────────────────────
async function renderReports() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const res = await apiFetch(`/payments/report?month=${month}&year=${year}`);
  const report = res?.data;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Reportes Financieros</h2><p>Consolidado de ingresos por período</p></div>
      <div class="flex gap-2">
        <select id="report-month" class="form-control" style="width:auto" onchange="loadReport()">
          ${MONTHS_ES.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===month?'selected':''}>${m}</option>`).join('')}
        </select>
        <input id="report-year" class="form-control" type="number" style="width:90px" value="${year}" onchange="loadReport()">
      </div>
    </div>

    <div id="report-content">
      ${renderReportContent(report, month, year)}
    </div>
  `;
}

function renderReportContent(report, month, year) {
  if (!report) return '<div class="empty-state"><p>Sin datos para este período</p></div>';

  const { summary, payments } = report;
  return `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon green"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="stat-value">${summary.totalPayments}</div>
        <div class="stat-label">Pagos recibidos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="stat-value td-mono" style="font-size:1.2rem">L ${parseFloat(summary.totalHNL).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Total en Lempiras</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></div>
        <div class="stat-value td-mono" style="font-size:1.2rem">$ ${parseFloat(summary.totalUSD).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Total en Dólares</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <div class="stat-value td-mono" style="font-size:1.2rem">L ${parseFloat(summary.totalLateFees).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Total en mora cobrado</div>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div style="padding:14px 20px;border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between">
        <strong style="font-size:0.88rem">Detalle de pagos — ${MONTHS_ES[month]} ${year}</strong>
        <button class="btn btn-ghost btn-sm" onclick="exportReportCSV()">Exportar CSV</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Inquilino</th><th>Unidad</th><th>Pagado</th><th>Mora</th><th>Moneda</th><th>Fecha</th><th>Estado</th></tr></thead>
          <tbody>
            ${(payments || []).map(p => `<tr>
              <td>${p.contract?.unit?.property?.name || ''}<br><small class="text-muted">${p.contract?.unit?.number || ''}</small></td>
              <td class="text-muted">${p.contract?.unit?.property?.city || ''}</td>
              <td class="td-mono">${formatMoney(p.amountPaid, p.paymentCurrency)}</td>
              <td class="td-mono" style="color:${p.lateFeeAmount > 0 ? 'var(--c-danger)' : 'inherit'}">${p.lateFeeAmount > 0 ? formatMoney(p.lateFeeAmount, p.paymentCurrency) : '—'}</td>
              <td><span class="badge badge-neutral">${p.paymentCurrency}</span></td>
              <td>${formatDate(p.paymentDate)}</td>
              <td>${paymentStatusBadge(p.status)}</td>
            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin pagos en este período</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadReport() {
  const month = parseInt(document.getElementById('report-month')?.value);
  const year  = parseInt(document.getElementById('report-year')?.value);
  const res   = await apiFetch(`/payments/report?month=${month}&year=${year}`);
  const el    = document.getElementById('report-content');
  if (el) el.innerHTML = renderReportContent(res?.data, month, year);
}

function exportReportCSV() {
  toast('Función de exportación CSV disponible en la próxima versión.', 'warning');
}

// ── Paginación helper ──────────────────────────────────────────
function renderPagination(pagination, onPageClick) {
  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  return `<div class="pagination">
    <span>Mostrando ${start}–${end} de ${total}</span>
    <div class="pagination-pages">
      <button class="page-btn" onclick="${onPageClick(page - 1)}" ${page <= 1 ? 'disabled' : ''}>‹</button>
      ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
        return `<button class="page-btn ${p === page ? 'active' : ''}" onclick="${onPageClick(p)}">${p}</button>`;
      }).join('')}
      <button class="page-btn" onclick="${onPageClick(page + 1)}" ${page >= totalPages ? 'disabled' : ''}>›</button>
    </div>
  </div>`;
}

// ── Renderizado de la App ──────────────────────────────────────
function renderApp() {
  const root = document.getElementById('app');
  if (!root) return;

  if (!isAuthenticated()) {
    root.innerHTML = renderLoginPage();
    return;
  }

  const initials = State.user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'US';

  root.innerHTML = `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <h1>🏠 Rentify</h1>
          <span>Sistema de Alquileres</span>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-label">Principal</div>
          <button class="nav-item active" data-page="dashboard" onclick="navigate('dashboard')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Panel principal
          </button>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-label">Gestión</div>
          <button class="nav-item" data-page="properties" onclick="navigate('properties')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Propiedades
          </button>
          <button class="nav-item" data-page="tenants" onclick="navigate('tenants')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Inquilinos
          </button>
          <button class="nav-item" data-page="contracts" onclick="navigate('contracts')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Contratos
          </button>
          <button class="nav-item" data-page="payments" onclick="navigate('payments')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Pagos
          </button>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-label">Finanzas</div>
          <button class="nav-item" data-page="exchange-rates" onclick="navigate('exchange-rates')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Tipo de cambio
          </button>
          <button class="nav-item" data-page="reports" onclick="navigate('reports')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Reportes
          </button>
        </div>

        <div class="sidebar-footer">
          <div class="user-pill">
            <div class="user-avatar">${initials}</div>
            <div class="user-info">
              <div class="user-name">${State.user?.name || 'Usuario'}</div>
              <div class="user-role">${State.user?.role || ''}</div>
            </div>
          </div>
          <button class="nav-item" style="margin-top:4px" onclick="logout()">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <!-- Topbar -->
      <header class="topbar">
        <button class="btn btn-ghost btn-icon" id="sidebar-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')" style="display:none">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span class="topbar-title" id="topbar-title">Panel Principal</span>
      </header>

      <!-- Contenido -->
      <main class="main-content">
        <div id="page-content"></div>
      </main>
    </div>
  `;

  // Mostrar botón hamburguesa en mobile
  if (window.innerWidth <= 1024) {
    document.getElementById('sidebar-toggle').style.display = 'flex';
  }

  navigate('dashboard');
}

function renderLoginPage() {
  return `
    <div class="login-page">
      <div class="login-brand">
        <div class="login-brand-logo">🏠 Rentify App</div>
        <div class="login-brand-tagline">Sistema de control de alquileres diseñado para Honduras. Gestioná propiedades, contratos, pagos y notificaciones en un solo lugar.</div>
        <div class="login-brand-features">
          <div class="login-feat"><div class="login-feat-icon">💱</div><span>Multimoneda HNL / USD con tipo de cambio automático</span></div>
          <div class="login-feat"><div class="login-feat-icon">📱</div><span>Notificaciones automáticas por WhatsApp vía Twilio</span></div>
          <div class="login-feat"><div class="login-feat-icon">🧾</div><span>Recibos digitales PDF con vista previa de impresión</span></div>
          <div class="login-feat"><div class="login-feat-icon">⚡</div><span>Motor de mora automático con días de gracia</span></div>
        </div>
      </div>
      <div class="login-form-wrap">
        <div class="login-form-card">
          <h2>Iniciar sesión</h2>
          <p>Ingresá con tus credenciales de administrador</p>

          <div id="login-error" class="alert alert-danger" style="display:none"></div>

          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input id="login-email" class="form-control" type="email" placeholder="admin@rentify.hn"
              onkeydown="if(event.key==='Enter') submitLogin()">
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input id="login-password" class="form-control" type="password" placeholder="••••••••"
              onkeydown="if(event.key==='Enter') submitLogin()">
          </div>

          <button class="btn btn-primary btn-lg" style="width:100%;margin-top:8px" id="login-btn" onclick="submitLogin()">
            Ingresar al sistema
          </button>

          <p style="font-size:0.75rem;color:var(--c-text-muted);text-align:center;margin-top:20px">
            Rentify App v1.0 — Honduras 🇭🇳
          </p>
        </div>
      </div>
    </div>
  `;
}

async function submitLogin() {
  const email    = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;
  const errorEl  = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  if (!email || !password) {
    if (errorEl) { errorEl.textContent = 'Ingresá tu correo y contraseña.'; errorEl.style.display = 'flex'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Ingresando...'; }
  if (errorEl) errorEl.style.display = 'none';

  try {
    const ok = await login(email, password);
    if (ok) {
      renderApp();
    } else {
      if (errorEl) { errorEl.textContent = 'Credenciales incorrectas.'; errorEl.style.display = 'flex'; }
    }
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || 'Error al iniciar sesión.'; errorEl.style.display = 'flex'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar al sistema'; }
  }
}

function openAddUnit(propertyId) {
  toast('Funcionalidad disponible — usá el botón "Nueva unidad" en el detalle de propiedad.', 'warning');
}

// ── Inicialización ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', renderApp);
