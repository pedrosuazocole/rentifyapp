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
    dashboard:     renderDashboard,
    properties:    renderProperties,
    tenants:       renderTenants,
    contracts:     renderContracts,
    payments:      renderPayments,
    'exchange-rates': renderExchangeRates,
    reports:       renderReports,
    users:         renderUsers,
    companies:     renderCompanies,
    invoices:      renderInvoices,
    notifications: renderNotifications,
    'debit-notes': renderDebitNotes,
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
    users: 'Usuarios del Sistema',
    companies: 'Empresas',
    invoices: 'Facturas SAR',
    notifications: 'Configuración de Notificaciones',
    'debit-notes': 'Notas de Débito',
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
  const res = await apiFetch('/properties?limit=100');
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
                  <div class="flex gap-2">
                    <button class="btn btn-ghost btn-sm" onclick="openEditTenant('${t.id}','${(t.firstName+' '+t.lastName).replace(/'/g,"\\'")}','${(t.email||'').replace(/'/g,"\\'")}','${t.phone}','${(t.nationalId||'').replace(/'/g,"\\'")}','${(t.altAddress||'').replace(/'/g,"\\'")}','${(t.notes||'').replace(/'/g,"\\'")}')">Editar</button>
                    <button class="btn btn-ghost btn-sm" onclick="viewTenantHistory('${t.id}','${(t.firstName+' '+t.lastName).replace(/'/g,"\\'")}')">Historial</button>
                  </div>
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
          <div class="form-group">
            <label class="form-label">📨 Telegram Chat ID</label>
            <input id="ten-telegram" class="form-control td-mono" placeholder="Ej: 123456789">
            <div class="form-hint">El inquilino debe escribir <strong>/start</strong> a tu bot. Obtenés el ID en Notificaciones → "Ver usuarios que escribieron al bot".</div>
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
  const notes      = document.getElementById('ten-notes')?.value?.trim();
  const telegramChatId = document.getElementById('ten-telegram')?.value?.trim();

  if (!firstName || !lastName || !phone) { toast('Nombre, apellido y teléfono son requeridos.', 'warning'); return; }
  if (!/^\+504\d{8}$/.test(phone)) { toast('El teléfono debe ser +504XXXXXXXX.', 'warning'); return; }

  await apiFetch('/tenants', { method: 'POST', body: JSON.stringify({ firstName, lastName, phone, nationalId: nationalId || undefined, email: email || undefined, notes: notes || undefined, telegramChatId: telegramChatId || undefined }) });
  toast('Inquilino registrado correctamente.');
  closeModal('modal-new-tenant');
  renderTenants();
}

function openEditTenant(id, fullName, email, phone, nationalId, altAddress, notes) {
  const existing = document.getElementById('modal-edit-tenant');
  if (existing) existing.remove();

  const [firstName, ...rest] = fullName.split(' ');
  const lastName = rest.join(' ');

  const modal = document.createElement('div');
  modal.id = 'modal-edit-tenant';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Editar inquilino</span>
        <button class="modal-close" onclick="closeModal('modal-edit-tenant');document.getElementById('modal-edit-tenant').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="edit-ten-id" value="${id}">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nombre <span>*</span></label>
            <input id="edit-ten-firstname" class="form-control" value="${firstName}">
          </div>
          <div class="form-group">
            <label class="form-label">Apellido <span>*</span></label>
            <input id="edit-ten-lastname" class="form-control" value="${lastName}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono WhatsApp <span>*</span></label>
          <input id="edit-ten-phone" class="form-control" value="${phone}">
          <div class="form-hint">Formato: +504XXXXXXXX</div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">DNI hondureño</label>
            <input id="edit-ten-dni" class="form-control" value="${nationalId}">
          </div>
          <div class="form-group">
            <label class="form-label">Correo electrónico</label>
            <input id="edit-ten-email" class="form-control" type="email" value="${email}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dirección alternativa</label>
          <input id="edit-ten-address" class="form-control" value="${altAddress}">
        </div>
        <div class="form-group">
          <label class="form-label">Notas internas</label>
          <textarea id="edit-ten-notes" class="form-control" rows="2">${notes}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">📨 Telegram Chat ID</label>
          <input id="edit-ten-telegram" class="form-control td-mono" placeholder="Ej: 123456789">
          <div class="form-hint">Obtené el Chat ID en Notificaciones → "Ver usuarios que escribieron al bot"</div>
        </div>
        <div class="form-group">
          <label class="form-label">📱 CallMeBot API Key (WhatsApp)</label>
          <input id="edit-ten-callmebot" class="form-control td-mono" placeholder="Ej: 1234567">
          <div class="form-hint">El inquilino envía <strong>"I allow callmebot to send me messages"</strong> al +34 644 61 43 97 en WhatsApp y recibe su API Key</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-edit-tenant');document.getElementById('modal-edit-tenant').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitEditTenant()">Guardar cambios</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-edit-tenant');
}

async function submitEditTenant() {
  const id               = document.getElementById('edit-ten-id')?.value;
  const firstName        = document.getElementById('edit-ten-firstname')?.value?.trim();
  const lastName         = document.getElementById('edit-ten-lastname')?.value?.trim();
  const phone            = document.getElementById('edit-ten-phone')?.value?.trim();
  const nationalId       = document.getElementById('edit-ten-dni')?.value?.trim();
  const email            = document.getElementById('edit-ten-email')?.value?.trim();
  const altAddress       = document.getElementById('edit-ten-address')?.value?.trim();
  const notes            = document.getElementById('edit-ten-notes')?.value?.trim();
  const telegramChatId   = document.getElementById('edit-ten-telegram')?.value?.trim();
  const callMeBotApiKey  = document.getElementById('edit-ten-callmebot')?.value?.trim();

  if (!firstName || !lastName || !phone) { toast('Nombre, apellido y teléfono son requeridos.', 'warning'); return; }
  if (!/^\+504\d{8}$/.test(phone)) { toast('El teléfono debe ser +504XXXXXXXX.', 'warning'); return; }

  await apiFetch(`/tenants/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      firstName, lastName, phone,
      nationalId:      nationalId      || undefined,
      email:           email           || undefined,
      altAddress:      altAddress      || undefined,
      notes:           notes           || undefined,
      telegramChatId:  telegramChatId  || undefined,
      callMeBotApiKey: callMeBotApiKey || undefined,
    }),
  });

  toast('✅ Inquilino actualizado correctamente.');
  closeModal('modal-edit-tenant');
  document.getElementById('modal-edit-tenant')?.remove();
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
                  <button class="btn btn-ghost btn-sm" onclick="openEditContractModal('${c.id}')">Editar</button>
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
          ${allUnits.length === 0
            ? '<option value="" disabled>No hay unidades disponibles</option>'
            : allUnits.map(u => `<option value="${u.id}">${u.propertyName} — ${u.number || 'Sin número'}</option>`).join('')
          }
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
        <input id="ct-day" class="form-control" type="number" min="1" max="31" value="5">
        <div class="form-hint">Día del mes (1-31)</div>
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
  const tenantId   = document.getElementById('ct-tenant')?.value;
  const unitId     = document.getElementById('ct-unit')?.value;
  const startDate  = document.getElementById('ct-start')?.value;
  const endDate    = document.getElementById('ct-end')?.value;
  const monthlyRent = parseFloat(document.getElementById('ct-rent')?.value);
  const currency   = document.getElementById('ct-currency')?.value;
  const paymentDay = parseInt(document.getElementById('ct-day')?.value);

  // Validaciones en el frontend antes de enviar
  if (!tenantId)              { toast('Seleccioná un inquilino.', 'warning'); return; }
  if (!unitId)                { toast('Seleccioná una unidad disponible.', 'warning'); return; }
  if (!startDate)             { toast('Ingresá la fecha de inicio.', 'warning'); return; }
  if (!endDate)               { toast('Ingresá la fecha de fin.', 'warning'); return; }
  if (new Date(endDate) <= new Date(startDate)) { toast('La fecha de fin debe ser posterior a la de inicio.', 'warning'); return; }
  if (!monthlyRent || monthlyRent <= 0) { toast('Ingresá un monto mensual válido mayor a 0.', 'warning'); return; }
  if (!paymentDay || paymentDay < 1 || paymentDay > 31) { toast('El día de pago debe estar entre 1 y 31.', 'warning'); return; }

  const data = {
    tenantId, unitId, startDate, endDate, currency,
    monthlyRent,
    paymentDayOfMonth: paymentDay,
    depositAmount:   parseFloat(document.getElementById('ct-deposit')?.value || '0'),
    depositCurrency: document.getElementById('ct-deposit-currency')?.value,
    lateFeePercent:  parseFloat(document.getElementById('ct-late')?.value || '5'),
    gracePeriodDays: parseInt(document.getElementById('ct-grace')?.value || '5'),
    notes:           document.getElementById('ct-notes')?.value?.trim() || undefined,
  };

  try {
    await apiFetch('/contracts', { method: 'POST', body: JSON.stringify(data) });
    toast('✅ Contrato creado correctamente. La unidad fue marcada como ocupada.');
    closeModal('modal-new-contract');
    renderContracts();
  } catch (err) {
    // El error ya fue mostrado por apiFetch, no hacer nada adicional
  }
}

async function viewContractDetail(id) {
  const res = await apiFetch(`/contracts/${id}`);
  const c = res?.data;
  if (!c) return;

  const existing = document.getElementById('modal-contract-detail');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-contract-detail';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';

  const statusBadge = contractStatusBadge(c.status);
  const totalPagos  = c.payments?.filter(p => p.status === 'PAID').length || 0;
  const totalMora   = c.payments?.filter(p => p.status === 'LATE').length || 0;
  const pendientes  = c.payments?.filter(p => p.status === 'PENDING').length || 0;

  modal.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header">
        <span class="modal-title">
          Contrato — ${c.tenant?.firstName} ${c.tenant?.lastName}
        </span>
        <button class="modal-close" onclick="closeModal('modal-contract-detail');document.getElementById('modal-contract-detail').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">

        <!-- Encabezado con estado -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px;background:var(--c-surface-alt);border-radius:var(--radius-md);margin-bottom:20px">
          <div>
            <div class="text-muted" style="font-size:0.72rem;margin-bottom:4px">ESTADO</div>
            ${statusBadge}
          </div>
          <div>
            <div class="text-muted" style="font-size:0.72rem;margin-bottom:4px">PROPIEDAD / UNIDAD</div>
            <div style="font-weight:500;font-size:0.88rem">${c.unit?.property?.name} — ${c.unit?.number}</div>
          </div>
          <div>
            <div class="text-muted" style="font-size:0.72rem;margin-bottom:4px">RENTA MENSUAL</div>
            <div class="td-mono" style="font-weight:600;font-size:1rem">${formatMoney(c.monthlyRent, c.currency)}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
          <!-- Datos del inquilino -->
          <div class="card">
            <div style="font-weight:600;font-size:0.82rem;color:var(--c-primary);margin-bottom:12px">👤 INQUILINO</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:0.85rem">
              <div class="flex gap-2"><span class="text-muted" style="min-width:80px">Nombre:</span><strong>${c.tenant?.firstName} ${c.tenant?.lastName}</strong></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:80px">Teléfono:</span><span class="td-mono">${c.tenant?.phone || '—'}</span></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:80px">Email:</span><span>${c.tenant?.email || '—'}</span></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:80px">DNI:</span><span class="td-mono">${c.tenant?.nationalId || '—'}</span></div>
            </div>
          </div>

          <!-- Datos del contrato -->
          <div class="card">
            <div style="font-weight:600;font-size:0.82rem;color:var(--c-primary);margin-bottom:12px">📋 CONDICIONES</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:0.85rem">
              <div class="flex gap-2"><span class="text-muted" style="min-width:100px">Inicio:</span><strong>${formatDate(c.startDate)}</strong></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:100px">Fin:</span><strong>${formatDate(c.endDate)}</strong></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:100px">Día de pago:</span><span>Día ${c.paymentDayOfMonth} de cada mes</span></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:100px">Depósito:</span><span class="td-mono">${formatMoney(c.depositAmount, c.depositCurrency)}</span></div>
              <div class="flex gap-2"><span class="text-muted" style="min-width:100px">Mora:</span><span>${c.lateFeePercent}% después de ${c.gracePeriodDays} días de gracia</span></div>
              ${c.notes ? `<div class="flex gap-2"><span class="text-muted" style="min-width:100px">Notas:</span><span>${c.notes}</span></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Resumen de pagos -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
          <div style="text-align:center;padding:14px;background:var(--c-success-lt);border-radius:var(--radius-md)">
            <div style="font-size:1.6rem;font-weight:600;color:var(--c-success)">${totalPagos}</div>
            <div style="font-size:0.75rem;color:var(--c-success)">Pagos completados</div>
          </div>
          <div style="text-align:center;padding:14px;background:var(--c-warning-lt);border-radius:var(--radius-md)">
            <div style="font-size:1.6rem;font-weight:600;color:var(--c-warning)">${pendientes}</div>
            <div style="font-size:0.75rem;color:var(--c-warning)">Pendientes</div>
          </div>
          <div style="text-align:center;padding:14px;background:var(--c-danger-lt);border-radius:var(--radius-md)">
            <div style="font-size:1.6rem;font-weight:600;color:var(--c-danger)">${totalMora}</div>
            <div style="font-size:0.75rem;color:var(--c-danger)">En mora</div>
          </div>
        </div>

        <!-- Historial de pagos -->
        <div style="font-weight:600;font-size:0.88rem;margin-bottom:10px">Historial de pagos</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Período</th><th>Monto due</th><th>Pagado</th><th>Mora</th><th>Estado</th><th>Fecha pago</th><th>Recibo</th>
            </tr></thead>
            <tbody>
              ${(c.payments || []).length === 0
                ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--c-text-muted)">Sin pagos generados aún. Andá a Pagos → Generar del mes.</td></tr>'
                : (c.payments || []).map(p => `<tr>
                    <td><strong>${MONTHS_ES[p.periodMonth]} ${p.periodYear}</strong></td>
                    <td class="td-mono">${formatMoney(p.amountDue, c.currency)}</td>
                    <td class="td-mono">${p.amountPaid > 0 ? formatMoney(p.amountPaid, p.paymentCurrency) : '—'}</td>
                    <td class="td-mono" style="color:var(--c-danger)">${p.lateFeeAmount > 0 ? formatMoney(p.lateFeeAmount, c.currency) : '—'}</td>
                    <td>${paymentStatusBadge(p.status)}</td>
                    <td>${formatDate(p.paymentDate)}</td>
                    <td>${p.status === 'PAID' ? `<a href="/api/payments/${p.id}/receipt" target="_blank" class="btn btn-ghost btn-sm">PDF</a>` : '—'}</td>
                  </tr>`).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        ${c.status === 'ACTIVE' ? `
          <button class="btn btn-ghost" style="color:var(--c-danger)" onclick="closeModal('modal-contract-detail');document.getElementById('modal-contract-detail').remove();terminateContract('${c.id}')">
            Rescindir contrato
          </button>` : ''}
        <button class="btn btn-ghost" onclick="closeModal('modal-contract-detail');document.getElementById('modal-contract-detail').remove()">Cerrar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  openModal('modal-contract-detail');
}

async function terminateContract(id) {
  const reason = prompt('Motivo de rescisión del contrato:');
  if (!reason) return;
  await apiFetch(`/contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) });
  toast('Contrato rescindido. La unidad quedó disponible.');
  renderContracts();
}

// ── Editar Contrato ─────────────────────────────────────────────
async function openEditContractModal(id) {
  const res = await apiFetch(`/contracts/${id}`);
  const c = res?.data;
  if (!c) return;

  const existing = document.getElementById('modal-edit-contract');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-edit-contract';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';

  const toInputDate = (iso) => iso ? iso.slice(0, 10) : '';

  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">Editar contrato — ${c.tenant?.firstName} ${c.tenant?.lastName}</span>
        <button class="modal-close" onclick="closeModal('modal-edit-contract');document.getElementById('modal-edit-contract').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="alert alert-info" style="margin-bottom:16px">
          Inquilino: <strong>${c.tenant?.firstName} ${c.tenant?.lastName}</strong> &nbsp;·&nbsp;
          Unidad: <strong>${c.unit?.property?.name} — ${c.unit?.number}</strong>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Fecha de inicio</label>
            <input id="ec-start" class="form-control" type="date" value="${toInputDate(c.startDate)}" disabled>
            <div class="form-hint">No modificable</div>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de fin <span>*</span></label>
            <input id="ec-end" class="form-control" type="date" value="${toInputDate(c.endDate)}">
          </div>
        </div>
        <div class="form-grid-3">
          <div class="form-group">
            <label class="form-label">Monto mensual <span>*</span></label>
            <input id="ec-rent" class="form-control" type="number" min="0" step="0.01" value="${c.monthlyRent}">
          </div>
          <div class="form-group">
            <label class="form-label">Moneda <span>*</span></label>
            <select id="ec-currency" class="form-control">
              <option value="HNL" ${c.currency === 'HNL' ? 'selected' : ''}>HNL — Lempiras</option>
              <option value="USD" ${c.currency === 'USD' ? 'selected' : ''}>USD — Dólares</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Día de pago <span>*</span></label>
            <input id="ec-day" class="form-control" type="number" min="1" max="31" value="${c.paymentDayOfMonth}">
            <div class="form-hint">Día del mes (1-31)</div>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Depósito</label>
            <input id="ec-deposit" class="form-control" type="number" min="0" step="0.01" value="${c.depositAmount || 0}">
          </div>
          <div class="form-group">
            <label class="form-label">Moneda del depósito</label>
            <select id="ec-deposit-currency" class="form-control">
              <option value="HNL" ${c.depositCurrency === 'HNL' ? 'selected' : ''}>HNL</option>
              <option value="USD" ${c.depositCurrency === 'USD' ? 'selected' : ''}>USD</option>
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">% de mora mensual</label>
            <input id="ec-late" class="form-control" type="number" min="0" max="100" step="0.5" value="${c.lateFeePercent || 5}">
          </div>
          <div class="form-group">
            <label class="form-label">Días de gracia</label>
            <input id="ec-grace" class="form-control" type="number" min="0" max="30" value="${c.gracePeriodDays || 5}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea id="ec-notes" class="form-control" rows="3">${c.notes || ''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-edit-contract');document.getElementById('modal-edit-contract').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="updateContract('${c.id}')">Guardar cambios</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  openModal('modal-edit-contract');
}

async function updateContract(id) {
  const endDate        = document.getElementById('ec-end')?.value;
  const monthlyRent    = parseFloat(document.getElementById('ec-rent')?.value);
  const currency       = document.getElementById('ec-currency')?.value;
  const paymentDay     = parseInt(document.getElementById('ec-day')?.value);
  const depositAmount  = parseFloat(document.getElementById('ec-deposit')?.value || '0');
  const depositCurrency= document.getElementById('ec-deposit-currency')?.value;
  const lateFeePercent = parseFloat(document.getElementById('ec-late')?.value || '5');
  const gracePeriodDays= parseInt(document.getElementById('ec-grace')?.value || '5');
  const notes          = document.getElementById('ec-notes')?.value?.trim() || undefined;

  if (!endDate) { toast('⚠️ La fecha de fin es requerida.'); return; }
  if (!monthlyRent || monthlyRent <= 0) { toast('⚠️ El monto mensual debe ser mayor a 0.'); return; }
  if (!paymentDay || paymentDay < 1 || paymentDay > 31) { toast('⚠️ Día de pago inválido (1-31).'); return; }

  const data = {
    endDate, monthlyRent, currency,
    paymentDayOfMonth: paymentDay,
    depositAmount, depositCurrency,
    lateFeePercent, gracePeriodDays,
    notes,
  };

  try {
    await apiFetch(`/contracts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    toast('✅ Contrato actualizado correctamente.');
    closeModal('modal-edit-contract');
    document.getElementById('modal-edit-contract')?.remove();
    renderContracts();
  } catch (err) {
    // El error ya fue mostrado por apiFetch
  }
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
          <button class="btn btn-primary" onclick="generatePayments()">⚙️ Generar pagos automáticos</button>
          <button class="btn btn-ghost" onclick="openCreateManualPayment()">✏️ Crear pago manual</button>
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

// ── Pago Manual ──────────────────────────────────────────────────
async function openCreateManualPayment() {
  // Build modal dynamically
  const existing = document.getElementById('modal-create-manual-payment');
  if (existing) existing.remove();

  const contractsRes = await apiFetch('/contracts?status=ACTIVE&limit=200');
  const contracts = contractsRes?.data || [];
  const now = new Date();

  const modal = document.createElement('div');
  modal.id = 'modal-create-manual-payment';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">✏️ Crear pago manual</span>
        <button class="modal-close" onclick="closeModal('modal-create-manual-payment');document.getElementById('modal-create-manual-payment').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p class="text-muted" style="margin-bottom:16px;font-size:0.85rem">
          Crea un registro de pago pendiente para un contrato y período específico. Los pagos ya existentes no se duplicarán.
        </p>
        <div class="form-group">
          <label class="form-label">Contrato / Inquilino <span>*</span></label>
          <select id="mp-contract" class="form-control" onchange="onManualPaymentContractChange()">
            <option value="">Seleccioná un contrato activo...</option>
            ${contracts.map(c => `<option value="${c.id}" data-rent="${c.monthlyRent}" data-currency="${c.currency}">
              ${c.tenant?.firstName} ${c.tenant?.lastName} — ${c.unit?.property?.name} ${c.unit?.number} (${c.currency})
            </option>`).join('')}
          </select>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Mes (período) <span>*</span></label>
            <select id="mp-month" class="form-control">
              ${MONTHS_ES.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Año (período) <span>*</span></label>
            <input id="mp-year" class="form-control" type="number" value="${now.getFullYear()}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Monto a cobrar</label>
          <input id="mp-amount" class="form-control td-mono" type="number" step="0.01" placeholder="Se toma del contrato si se deja vacío">
          <div class="form-hint" id="mp-amount-hint">Seleccioná un contrato para ver el monto del contrato</div>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de vencimiento</label>
          <input id="mp-due-date" class="form-control" type="date">
          <div class="form-hint">Opcional. Si se deja vacío se usa el día de pago del contrato</div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas internas</label>
          <input id="mp-notes" class="form-control" placeholder="Ej: pago adicional por mes extra...">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-create-manual-payment');document.getElementById('modal-create-manual-payment').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitManualPayment()">Crear pago</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-create-manual-payment');
}

function onManualPaymentContractChange() {
  const sel  = document.getElementById('mp-contract');
  const opt  = sel?.options[sel.selectedIndex];
  const rent = opt?.dataset?.rent;
  const curr = opt?.dataset?.currency;
  const hint = document.getElementById('mp-amount-hint');
  if (rent && curr && hint) {
    hint.textContent = `Monto del contrato: ${curr === 'USD' ? '$ ' : 'L '}${parseFloat(rent).toFixed(2)} ${curr}`;
    const amountInput = document.getElementById('mp-amount');
    if (amountInput && !amountInput.value) amountInput.value = parseFloat(rent).toFixed(2);
  }
}

async function submitManualPayment() {
  const contractId  = document.getElementById('mp-contract')?.value;
  const periodMonth = parseInt(document.getElementById('mp-month')?.value);
  const periodYear  = parseInt(document.getElementById('mp-year')?.value);
  const amountDue   = parseFloat(document.getElementById('mp-amount')?.value) || undefined;
  const dueDate     = document.getElementById('mp-due-date')?.value || undefined;
  const notes       = document.getElementById('mp-notes')?.value?.trim() || undefined;

  if (!contractId) { toast('Seleccioná un contrato.', 'warning'); return; }

  const res = await apiFetch('/payments/create-manual', {
    method: 'POST',
    body: JSON.stringify({ contractId, periodMonth, periodYear, amountDue, dueDate, notes }),
  });

  if (res) {
    toast(`✅ ${res.message || 'Pago manual creado correctamente.'}`);
    closeModal('modal-create-manual-payment');
    document.getElementById('modal-create-manual-payment')?.remove();
    renderPayments();
  }
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
      <label class="form-label">Período del pago</label>
      <div class="form-grid" style="margin-bottom:0">
        <select id="pay-period-month" class="form-control">
          ${MONTHS_ES.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===(payment?.periodMonth||new Date().getMonth()+1)?'selected':''}>${m}</option>`).join('')}
        </select>
        <input id="pay-period-year" class="form-control" type="number" value="${payment?.periodYear||new Date().getFullYear()}">
      </div>
      <div class="form-hint">Período al que corresponde este pago</div>
    </div>
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

// ── Notificaciones ─────────────────────────────────────────────
async function renderNotifications() {
  if (State.user?.role !== 'ADMIN') {
    document.getElementById('page-content').innerHTML =
      '<div class="alert alert-danger">Solo los administradores pueden gestionar las notificaciones.</div>';
    return;
  }

  const [configRes, statusRes] = await Promise.all([
    apiFetch('/notifications/config'),
    apiFetch('/notifications/status'),
  ]);

  const cfg   = configRes?.data || {};
  const stats = statusRes?.data?.stats || {};

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Notificaciones</h2><p>WhatsApp via CallMeBot — gratuito, sin límites de ventana</p></div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" onclick="sendCxcReportNow()" title="Enviar reporte ahora sin esperar el lunes">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Enviar reporte CxC ahora
        </button>
        <button class="btn btn-primary" onclick="saveNotificationConfig()">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Guardar configuración
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon green"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="stat-value">${stats.totalSent || 0}</div>
        <div class="stat-label">Mensajes enviados</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
        <div class="stat-value">${stats.totalFailed || 0}</div>
        <div class="stat-label">Fallidos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="stat-value">${stats.nextReminders || 0}</div>
        <div class="stat-label">Recordatorios próximos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${(stats.tenantsWithoutNotif || 0) > 0 ? 'red' : 'green'}">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div class="stat-value">${stats.tenantsWithoutNotif || 0}</div>
        <div class="stat-label">Sin CallMeBot configurado</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

      <!-- Izquierda -->
      <div>
        <!-- Tipos de notificación -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">📋 Tipos de notificación</span></div>
          <div style="display:flex;flex-direction:column;gap:14px">
            ${[
              { key: 'reminderEnabled',   icon: '📅', label: 'Recordatorio de pago',   desc: (cfg.reminderDaysBefore||3) + ' días antes del vencimiento', daysKey: 'reminderDaysBefore' },
              { key: 'receiptEnabled',    icon: '✅', label: 'Recibo de pago',          desc: 'Al registrar un pago completo', daysKey: null },
              { key: 'lateNoticeEnabled', icon: '⚠️', label: 'Aviso de mora',           desc: '1 día después del plazo de gracia', daysKey: null },
              { key: 'renewalEnabled',    icon: '📋', label: 'Aviso de renovación',     desc: (cfg.renewalDaysBefore||30) + ' días antes del fin del contrato', daysKey: 'renewalDaysBefore' },
              { key: 'debitNoteEnabled',  icon: '⚡', label: 'Nueva nota de débito',    desc: 'Al registrar un cargo por servicio público', daysKey: null },
            ].map(function(item) {
              var isOn = cfg[item.key] !== false;
              return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:12px;border:1px solid var(--c-border);border-radius:var(--radius-md);background:' + (isOn?'var(--c-primary-lt)':'var(--c-surface-alt)') + '" id="wrap-' + item.key + '">' +
                '<div style="flex:1">' +
                  '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span>' + item.icon + '</span><strong style="font-size:0.88rem">' + item.label + '</strong></div>' +
                  '<div class="text-muted" style="font-size:0.78rem">' + item.desc + '</div>' +
                  (item.daysKey ? '<div style="margin-top:8px;display:flex;align-items:center;gap:8px"><label style="font-size:0.75rem;color:var(--c-text-muted)">Días:</label><input id="cfg-' + item.daysKey + '" type="number" min="1" max="60" value="' + (cfg[item.daysKey]||3) + '" class="form-control" style="width:70px;padding:4px 8px;font-size:0.82rem"></div>' : '') +
                '</div>' +
                '<div style="width:44px;height:24px;border-radius:12px;background:' + (isOn?'var(--c-primary)':'var(--c-border)') + ';position:relative;cursor:pointer;flex-shrink:0;margin-left:12px" id="toggle-' + item.key + '" onclick="toggleNotifConfig(\'' + item.key + '\')">' +
                  '<input type="checkbox" id="cfg-' + item.key + '" ' + (isOn?'checked':'') + ' style="display:none">' +
                  '<div style="width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:' + (isOn?'23px':'3px') + ';transition:left 0.2s" id="knob-' + item.key + '"></div>' +
                '</div>' +
              '</div>';
            }).join('')}
          </div>
        </div>

        <!-- Hora de envío -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">⏰ Hora de envío diario</span></div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Hora (0-23)</label>
              <input id="cfg-sendHour" type="number" min="0" max="23" value="${cfg.sendHour ?? 8}" class="form-control td-mono">
              <div class="form-hint">Zona: America/Tegucigalpa</div>
            </div>
            <div class="form-group">
              <label class="form-label">Minuto (0-59)</label>
              <input id="cfg-sendMinute" type="number" min="0" max="59" value="${cfg.sendMinute ?? 0}" class="form-control td-mono">
            </div>
          </div>
        </div>

        <!-- Reporte CxC -->
        <div class="card" style="border:2px solid var(--c-primary-lt)">
          <div class="card-header">
            <span class="card-title">📊 Reporte Cuentas por Cobrar</span>
            <span class="badge badge-success">Automático</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:0.85rem">
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--c-primary-lt);border-radius:var(--radius-md)">
              <svg width="20" height="20" fill="none" stroke="var(--c-primary)" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div>
                <div style="font-weight:600;color:var(--c-primary)">Todos los lunes a las 3:00 PM</div>
                <div class="text-muted">Se envía automáticamente a los números CC</div>
              </div>
            </div>
            <div class="text-muted">El reporte incluye:</div>
            <ul style="margin:0 0 0 16px;display:flex;flex-direction:column;gap:4px">
              <li>Total de cobros pendientes en HNL y USD</li>
              <li>Cantidad de pagos en mora</li>
              <li>Detalle por inquilino — nombre, unidad, monto y fecha de vencimiento</li>
              <li>Estado: 🔴 mora / 🟡 parcial / 🟠 pendiente</li>
            </ul>
            <button class="btn btn-ghost" style="width:100%;margin-top:4px" onclick="sendCxcReportNow()">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Enviar reporte ahora (sin esperar el lunes)
            </button>
          </div>
        </div>
      </div>

      <!-- Derecha -->
      <div>
        <!-- Números CC -->
        <div class="card" style="margin-bottom:16px;border:2px solid var(--c-accent)">
          <div class="card-header">
            <span class="card-title">📲 Números adicionales (CC)</span>
            <span class="badge badge-accent">Reporte CxC aquí</span>
          </div>
          <p class="text-muted" style="margin-bottom:12px;font-size:0.82rem">
            Estos números reciben copia de <strong>todas</strong> las notificaciones
            <strong>y el reporte de cuentas por cobrar los lunes a las 3:00 PM</strong>.
          </p>
          <div class="form-group">
            <label class="form-label">Números WhatsApp con CallMeBot</label>
            <textarea id="cfg-ccNumbers" class="form-control td-mono" rows="4"
              placeholder="+50494502710:8557256&#10;+50499826565:1234567&#10;+50494755230:9876543"
              style="font-size:0.82rem">${(cfg.ccNumbers||'').replace(/,/g, '\n')}</textarea>
            <div class="form-hint">Un número por línea en formato <code>+504XXXXXXXX:apikey</code></div>
          </div>
          <div class="alert alert-info" style="font-size:0.78rem;margin-top:8px">
            💡 Cada número debe activar CallMeBot enviando <strong>"I allow callmebot to send me messages"</strong> al <strong>+34 644 61 43 97</strong> en WhatsApp.
          </div>
        </div>

        <!-- Prueba CallMeBot -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">🧪 Prueba de envío</span></div>
          <div class="form-group">
            <label class="form-label">Número WhatsApp</label>
            <input id="test-cmb-phone" class="form-control td-mono" placeholder="+50499887766">
          </div>
          <div class="form-group">
            <label class="form-label">API Key de CallMeBot</label>
            <input id="test-cmb-apikey" class="form-control td-mono" placeholder="Ej: 8557256">
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="sendTestNotification('callmebot')">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Enviar prueba por WhatsApp
          </button>
          <div id="test-result" style="margin-top:12px"></div>
        </div>

        <!-- Historial -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">📜 Historial reciente</span>
            <button class="btn btn-ghost btn-sm" onclick="loadNotificationLogs()">Actualizar</button>
          </div>
          <div id="notification-logs"><div class="empty-state" style="padding:20px"><p>Hacé clic en "Actualizar"</p></div></div>
          <div style="padding:10px 16px;border-top:1px solid var(--c-border);display:flex;justify-content:space-between">
            <span class="text-muted" style="font-size:0.75rem">Últimos 20 registros</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="clearOldLogs()">Limpiar +30 días</button>
          </div>
        </div>
      </div>
    </div>
  `;

  loadNotificationLogs();
}

function toggleNotifConfig(key) {
  var cb = document.getElementById('cfg-' + key);
  var tog = document.getElementById('toggle-' + key);
  var knob = document.getElementById('knob-' + key);
  var wrap = document.getElementById('wrap-' + key);
  if (!cb) return;
  cb.checked = !cb.checked;
  if (tog)  tog.style.background  = cb.checked ? 'var(--c-primary)' : 'var(--c-border)';
  if (knob) knob.style.left       = cb.checked ? '23px' : '3px';
  if (wrap) wrap.style.background = cb.checked ? 'var(--c-primary-lt)' : 'var(--c-surface-alt)';
}

async function saveNotificationConfig() {
  var getCheck = function(id) { var el = document.getElementById(id); return el ? el.checked : true; };
  var getVal   = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };

  // Convertir textarea de ccNumbers (una por línea) a formato con comas
  var ccRaw = getVal('cfg-ccNumbers').trim().split('\n').map(function(s){ return s.trim(); }).filter(Boolean).join(',');

  var data = {
    reminderEnabled:    getCheck('cfg-reminderEnabled'),
    receiptEnabled:     getCheck('cfg-receiptEnabled'),
    lateNoticeEnabled:  getCheck('cfg-lateNoticeEnabled'),
    renewalEnabled:     getCheck('cfg-renewalEnabled'),
    debitNoteEnabled:   getCheck('cfg-debitNoteEnabled'),
    reminderDaysBefore: parseInt(getVal('cfg-reminderDaysBefore') || '3'),
    renewalDaysBefore:  parseInt(getVal('cfg-renewalDaysBefore')  || '30'),
    sendHour:           parseInt(getVal('cfg-sendHour')   || '8'),
    sendMinute:         parseInt(getVal('cfg-sendMinute') || '0'),
    ccNumbers:          ccRaw || null,
  };

  await apiFetch('/notifications/config', { method: 'PUT', body: JSON.stringify(data) });
  toast('✅ Configuración guardada correctamente.');
  renderNotifications();
}

function switchTestTab(tab, btn) {
  document.querySelectorAll('[id^="test-tab-"]').forEach(function(el) { el.style.display = 'none'; });
  var t = document.getElementById('test-tab-' + tab);
  if (t) t.style.display = 'block';
  document.querySelectorAll('.card .tab-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('test-result').innerHTML = '';
}

async function sendTestNotification(channel) {
  var resultEl = document.getElementById('test-result');
  var body = {};

  if (channel === 'callmebot') {
    var phone  = document.getElementById('test-cmb-phone')?.value?.trim();
    var apiKey = document.getElementById('test-cmb-apikey')?.value?.trim();
    if (!phone || !apiKey) { toast('Ingresá el número y la API Key de CallMeBot.', 'warning'); return; }
    body = { phone, apiKey, channel: 'callmebot' };
  } else {
    var chatId = document.getElementById('test-chat-id')?.value?.trim();
    if (!chatId) { toast('Ingresá un Chat ID de Telegram.', 'warning'); return; }
    body = { chatId, channel: 'telegram' };
  }

  var res = await apiFetch('/notifications/test', { method: 'POST', body: JSON.stringify(body) });
  if (resultEl) {
    resultEl.innerHTML = res?.data?.success
      ? '<div class="alert alert-success">✅ ' + (res.message || 'Mensaje enviado') + '</div>'
      : '<div class="alert alert-danger">❌ ' + (res?.message || 'No se pudo enviar') + '</div>';
  }
  loadNotificationLogs();
}

async function sendCxcReportNow() {
  var res = await apiFetch('/notifications/send-cxc-report', { method: 'POST' });
  if (res?.message) toast(res.message);
  loadNotificationLogs();
}

async function loadTelegramUpdates() {
  var el = document.getElementById('telegram-updates');
  if (!el) return;
  el.innerHTML = '<div class="spinner"></div>';
  var res = await apiFetch('/notifications/telegram-updates');
  var updates = res?.data || [];
  if (updates.length === 0) {
    el.innerHTML = '<div class="alert alert-info" style="font-size:0.82rem">Sin usuarios recientes.</div>';
    return;
  }
  el.innerHTML = '<div>' + updates.map(function(u) {
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--c-border)"><span>' + u.firstName + '</span><code style="font-size:0.78rem">' + u.chatId + '</code><button class="btn btn-ghost btn-sm" onclick="copyToClipboard(\'' + u.chatId + '\')">Copiar</button></div>';
  }).join('') + '</div>';
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() { toast('Copiado: ' + text); });
}

async function loadNotificationLogs() {
  var res  = await apiFetch('/notifications/logs?limit=20');
  var logs = res?.data?.logs || [];
  var el   = document.getElementById('notification-logs');
  if (!el) return;

  var typeLabels = { REMINDER:'📅 Recordatorio', RECEIPT:'✅ Recibo', LATE:'⚠️ Mora', RENEWAL:'📋 Renovación', INVOICE:'🧾 Factura', TEST:'🧪 Prueba' };

  if (logs.length === 0) {
    el.innerHTML = '<div class="empty-state" style="padding:20px"><p>Sin notificaciones enviadas aún</p></div>';
    return;
  }

  el.innerHTML = '<div style="max-height:320px;overflow-y:auto"><table style="width:100%;font-size:0.78rem;border-collapse:collapse"><thead><tr style="background:var(--c-surface-alt)"><th style="padding:6px 10px;text-align:left">Tipo</th><th style="padding:6px 10px;text-align:left">Número</th><th style="padding:6px 10px;text-align:left">Estado</th><th style="padding:6px 10px;text-align:left">Fecha</th></tr></thead><tbody>' +
    logs.map(function(log) {
      var badge = log.status==='SENT' ? '<span class="badge badge-success">Enviado</span>' : log.status==='FAILED' ? '<span class="badge badge-danger">Falló</span>' : '<span class="badge badge-neutral">Omitido</span>';
      return '<tr style="border-top:1px solid var(--c-border)"><td style="padding:6px 10px">' + (typeLabels[log.type]||log.type) + '</td><td style="padding:6px 10px;font-family:var(--font-mono);font-size:0.75rem">' + log.toPhone + '</td><td style="padding:6px 10px">' + badge + (log.errorMessage ? '<div style="font-size:0.68rem;color:var(--c-danger)">' + log.errorMessage.slice(0,35) + '</div>' : '') + '</td><td style="padding:6px 10px;color:var(--c-text-muted)">' + formatDateTime(log.sentAt) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

async function clearOldLogs() {
  if (!confirm('¿Eliminás los logs con más de 30 días?')) return;
  var res = await apiFetch('/notifications/logs', { method: 'DELETE', body: JSON.stringify({ olderThanDays: 30 }) });
  toast(res?.message || 'Logs eliminados.');
  loadNotificationLogs();
}


// ── Notas de Débito ────────────────────────────────────────────
const SERVICE_ICONS = { AGUA:'💧', LUZ:'⚡', GAS:'🔥', INTERNET:'🌐', BASURA:'🗑️', OTRO:'📋' };
const SERVICE_LABELS = { AGUA:'Agua (SANAA)', LUZ:'Energía eléctrica (ENEE)', GAS:'Gas', INTERNET:'Internet / Cable', BASURA:'Recolección de basura', OTRO:'Otro cargo' };

async function renderDebitNotes() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const [summaryRes, notesRes] = await Promise.all([
    apiFetch(`/debit-notes/summary?month=${month}&year=${year}`),
    apiFetch(`/debit-notes?month=${month}&year=${year}`),
  ]);

  const summary = summaryRes?.data || {};
  const notes   = notesRes?.data  || [];

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Notas de Débito</h2>
        <p>Cargos por servicios públicos incluidos en el cobro del local</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-new-debit-note')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva nota de débito
      </button>
    </div>

    <!-- Filtro de período -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <span class="text-muted" style="font-size:0.85rem">Período:</span>
      <select id="dn-month" class="form-control" style="width:auto" onchange="reloadDebitNotes()">
        ${MONTHS_ES.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===month?'selected':''}>${m}</option>`).join('')}
      </select>
      <input id="dn-year" class="form-control" type="number" style="width:90px" value="${year}" onchange="reloadDebitNotes()">
    </div>

    <!-- Resumen por inquilino -->
    ${(summary.contracts||[]).length > 0 ? `
    <div class="card" style="margin-bottom:20px;padding:0">
      <div style="padding:14px 20px;border-bottom:1px solid var(--c-border)">
        <strong style="font-size:0.88rem">📊 Resumen del período — ${MONTHS_ES[month]} ${year}</strong>
        <span class="text-muted" style="margin-left:12px;font-size:0.82rem">${summary.totalNotes} cargo(s) pendientes</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Inquilino</th><th>Unidad</th><th>Servicios</th><th>Total HNL</th><th>Total USD</th></tr></thead>
          <tbody>
            ${(summary.contracts||[]).map(g => `<tr>
              <td><strong>${g.tenantName}</strong></td>
              <td class="text-muted">${g.propertyUnit}</td>
              <td>${g.items.map(n => `<span class="badge badge-neutral" style="margin-right:4px">${SERVICE_ICONS[n.serviceType]||'📋'} ${SERVICE_LABELS[n.serviceType]||n.serviceType}</span>`).join('')}</td>
              <td class="td-mono">${g.totalHNL > 0 ? formatMoney(g.totalHNL,'HNL') : '—'}</td>
              <td class="td-mono">${g.totalUSD > 0 ? formatMoney(g.totalUSD,'USD') : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Listado completo -->
    <div class="card" style="padding:0">
      <div style="padding:14px 20px;border-bottom:1px solid var(--c-border)">
        <strong style="font-size:0.88rem">Todas las notas — ${MONTHS_ES[month]} ${year}</strong>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Servicio</th><th>Inquilino</th><th>Unidad</th><th>Descripción</th><th>N° Factura</th><th>Monto</th><th>Cargo Total Inquilino</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${(() => {
              if (notes.length === 0) return '<tr><td colspan="9"><div class="empty-state" style="padding:30px">Sin notas de débito en este período. Creá la primera con el botón de arriba.</div></td></tr>';

              // Calcular cargo total por contrato (solo PENDING e INCLUDED)
              const totByContract = {};
              notes.forEach(n => {
                if (n.status === 'WAIVED') return;
                const key = n.contractId || n.contract?.id;
                if (!totByContract[key]) totByContract[key] = { HNL: 0, USD: 0, count: 0 };
                if (n.currency === 'HNL') totByContract[key].HNL += parseFloat(n.amount||0);
                else totByContract[key].USD += parseFloat(n.amount||0);
                totByContract[key].count++;
              });

              // Track which contract already showed the total (show only on first row)
              const shown = {};
              let totalHNL = 0, totalUSD = 0;
              notes.forEach(n => { if (n.status !== 'WAIVED') { if (n.currency==='HNL') totalHNL += parseFloat(n.amount||0); else totalUSD += parseFloat(n.amount||0); } });

              const rows = notes.map(n => {
                const key = n.contractId || n.contract?.id;
                const tot = totByContract[key];
                let cargoCell = '—';
                if (tot && !shown[key] && n.status !== 'WAIVED') {
                  const parts = [];
                  if (tot.HNL > 0) parts.push(`L ${tot.HNL.toLocaleString('es-HN',{minimumFractionDigits:2})}`);
                  if (tot.USD > 0) parts.push(`$ ${tot.USD.toLocaleString('es-HN',{minimumFractionDigits:2})}`);
                  cargoCell = `<span class="td-mono" style="font-weight:700;color:var(--c-primary)">${parts.join(' + ')}</span><br><span class="text-muted" style="font-size:0.75rem">${tot.count} servicio(s)</span>`;
                  shown[key] = true;
                }
                return `<tr>
                  <td><span style="font-size:1.1rem">${SERVICE_ICONS[n.serviceType]||'📋'}</span> ${SERVICE_LABELS[n.serviceType]||n.serviceType}</td>
                  <td><strong>${n.contract?.tenant?.firstName} ${n.contract?.tenant?.lastName}</strong></td>
                  <td class="text-muted">${n.contract?.unit?.property?.name} — ${n.contract?.unit?.number}</td>
                  <td>${n.description}</td>
                  <td class="td-mono">${n.invoiceRef || '—'}</td>
                  <td class="td-mono"><strong>${formatMoney(n.amount, n.currency)}</strong></td>
                  <td>${cargoCell}</td>
                  <td>
                    <span class="badge ${n.status==='PENDING'?'badge-warning':n.status==='INCLUDED'?'badge-success':'badge-neutral'}">
                      ${n.status==='PENDING'?'Pendiente':n.status==='INCLUDED'?'Cobrada':'Anulada'}
                    </span>
                  </td>
                  <td>
                    <div class="flex gap-2">
                      ${n.status==='PENDING' ? `
                        <button class="btn btn-ghost btn-sm" onclick="openEditDebitNote('${n.id}')">Editar</button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--c-primary)" onclick="notifyDebitNote('${n.id}')">
                          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          Notificar
                        </button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="cancelDebitNote('${n.id}')">Anular</button>
                      ` : '—'}
                    </div>
                  </td>
                </tr>`;
              });

              // Fila de total global del período
              const totalParts = [];
              if (totalHNL > 0) totalParts.push(`L ${totalHNL.toLocaleString('es-HN',{minimumFractionDigits:2})}`);
              if (totalUSD > 0) totalParts.push(`$ ${totalUSD.toLocaleString('es-HN',{minimumFractionDigits:2})}`);
              rows.push(`<tr style="background:var(--c-surface-alt);font-weight:700">
                <td colspan="5" style="text-align:right;padding:8px 14px">TOTAL DEL PERÍODO</td>
                <td class="td-mono" style="color:var(--c-primary)">${totalParts.join(' + ') || '—'}</td>
                <td colspan="3"></td>
              </tr>`);

              return rows.join('');
            })()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal nueva nota de débito -->
    <div id="modal-new-debit-note" class="modal-backdrop" style="display:none">
      <div class="modal modal-lg">
        <div class="modal-header">
          <span class="modal-title">Nueva nota de débito</span>
          <button class="modal-close" onclick="closeModal('modal-new-debit-note')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" id="new-dn-body">
          <div class="spinner"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-debit-note')">Cancelar</button>
          <button class="btn btn-primary" onclick="submitDebitNote()">Registrar cargo</button>
        </div>
      </div>
    </div>
  `;

  // Cargar contratos activos en el modal
  loadDebitNoteForm();
}

async function loadDebitNoteForm() {
  const body = document.getElementById('new-dn-body');
  if (!body) return;

  const res       = await apiFetch('/contracts?status=ACTIVE&limit=100');
  const contracts = res?.data || [];
  const now       = new Date();

  const serviceOptions = Object.entries(SERVICE_LABELS)
    .map(([k,v]) => `<option value="${k}">${SERVICE_ICONS[k]} ${v}</option>`).join('');

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Contrato / Inquilino <span>*</span></label>
      <select id="dn-contract" class="form-control">
        <option value="">Seleccioná un contrato activo...</option>
        ${contracts.map(c => `<option value="${c.id}">${c.tenant?.firstName} ${c.tenant?.lastName} — ${c.unit?.property?.name} ${c.unit?.number}</option>`).join('')}
      </select>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Mes <span>*</span></label>
        <select id="dn-month-sel" class="form-control">
          ${MONTHS_ES.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Año <span>*</span></label>
        <input id="dn-year-inp" class="form-control" type="number" value="${now.getFullYear()}">
      </div>
    </div>

    <!-- Servicios múltiples -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <label class="form-label" style="margin:0">Servicios <span>*</span></label>
      <button type="button" class="btn btn-ghost btn-sm" onclick="addDebitNoteServiceRow()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Agregar servicio
      </button>
    </div>
    <div id="dn-services-list">
      <!-- primera fila de servicio -->
      ${buildDnServiceRow(0, serviceOptions)}
    </div>
    <div id="dn-total-preview" style="text-align:right;font-size:0.82rem;color:var(--c-text-muted);margin-top:4px"></div>

    <div class="form-group" style="margin-top:12px">
      <label class="form-label">Notas adicionales</label>
      <textarea id="dn-notes" class="form-control" rows="2" placeholder="Observaciones internas..."></textarea>
    </div>
  `;
}

function buildDnServiceRow(idx, serviceOptions) {
  const opts = serviceOptions || Object.entries(SERVICE_LABELS)
    .map(([k,v]) => `<option value="${k}">${SERVICE_ICONS[k]} ${v}</option>`).join('');
  return `
    <div class="dn-service-row" id="dn-row-${idx}" style="border:1px solid var(--c-border);border-radius:6px;padding:10px 12px;margin-bottom:8px;background:var(--c-surface)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:0.8rem;font-weight:600;color:var(--c-text-muted)">Servicio ${idx+1}</span>
        ${idx > 0 ? `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--c-danger);padding:2px 6px" onclick="removeDnServiceRow(${idx})">✕ Quitar</button>` : ''}
      </div>
      <div class="form-grid" style="margin-bottom:8px">
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:0.78rem">Tipo de servicio</label>
          <select class="form-control dn-svc-type" data-row="${idx}" onchange="updateDnTotal()">${opts}</select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:0.78rem">N° Factura</label>
          <input class="form-control td-mono dn-svc-invoice" data-row="${idx}" placeholder="Ej: 00123456">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label" style="font-size:0.78rem">Descripción <span>*</span></label>
        <input class="form-control dn-svc-desc" data-row="${idx}" placeholder="Ej: Factura SANAA mayo, cta #12345">
      </div>
      <div class="form-grid" style="margin:0">
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:0.78rem">Monto <span>*</span></label>
          <input class="form-control td-mono dn-svc-amount" data-row="${idx}" type="number" step="0.01" min="0.01" placeholder="0.00" oninput="updateDnTotal()">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:0.78rem">Moneda</label>
          <select class="form-control dn-svc-currency" data-row="${idx}" onchange="updateDnTotal()">
            <option value="HNL">HNL — Lempiras</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:0.78rem">Fecha factura</label>
          <input class="form-control dn-svc-date" data-row="${idx}" type="date">
        </div>
      </div>
    </div>`;
}

let _dnRowCount = 1;
function addDebitNoteServiceRow() {
  const list = document.getElementById('dn-services-list');
  if (!list) return;
  const serviceOptions = Object.entries(SERVICE_LABELS)
    .map(([k,v]) => `<option value="${k}">${SERVICE_ICONS[k]} ${v}</option>`).join('');
  const div = document.createElement('div');
  div.innerHTML = buildDnServiceRow(_dnRowCount, serviceOptions);
  list.appendChild(div.firstElementChild);
  _dnRowCount++;
}

function removeDnServiceRow(idx) {
  document.getElementById(`dn-row-${idx}`)?.remove();
  updateDnTotal();
}

function updateDnTotal() {
  const amounts  = [...document.querySelectorAll('.dn-svc-amount')];
  const currencies = [...document.querySelectorAll('.dn-svc-currency')];
  let hnl = 0, usd = 0;
  amounts.forEach((inp, i) => {
    const val  = parseFloat(inp.value) || 0;
    const curr = currencies[i]?.value || 'HNL';
    if (curr === 'HNL') hnl += val; else usd += val;
  });
  const preview = document.getElementById('dn-total-preview');
  if (!preview) return;
  const parts = [];
  if (hnl > 0) parts.push(`L ${hnl.toLocaleString('es-HN',{minimumFractionDigits:2})}`);
  if (usd > 0) parts.push(`$ ${usd.toLocaleString('es-HN',{minimumFractionDigits:2})}`);
  preview.textContent = parts.length ? `Total: ${parts.join(' + ')}` : '';
}

async function submitDebitNote() {
  _dnRowCount = 1; // reset counter
  const contractId  = document.getElementById('dn-contract')?.value;
  const periodMonth = document.getElementById('dn-month-sel')?.value;
  const periodYear  = document.getElementById('dn-year-inp')?.value;
  const notes       = document.getElementById('dn-notes')?.value?.trim();

  if (!contractId) { toast('Seleccioná un contrato.', 'warning'); return; }

  // Collect all service rows
  const rows = [...document.querySelectorAll('.dn-service-row')];
  if (rows.length === 0) { toast('Agregá al menos un servicio.', 'warning'); return; }

  const services = [];
  for (const row of rows) {
    const desc   = row.querySelector('.dn-svc-desc')?.value?.trim();
    const amount = parseFloat(row.querySelector('.dn-svc-amount')?.value);
    const svcType = row.querySelector('.dn-svc-type')?.value;
    const currency = row.querySelector('.dn-svc-currency')?.value;
    const invoiceRef = row.querySelector('.dn-svc-invoice')?.value?.trim();
    const invoiceDate = row.querySelector('.dn-svc-date')?.value;
    if (!desc) { toast('Ingresá la descripción de cada servicio.', 'warning'); return; }
    if (!amount || amount <= 0) { toast('Ingresá un monto válido en cada servicio.', 'warning'); return; }
    services.push({ serviceType: svcType, description: desc, amount, currency, invoiceRef: invoiceRef||undefined, invoiceDate: invoiceDate||undefined });
  }

  // POST each service as a separate debit note (one per service, same contract+period)
  let created = 0;
  for (const svc of services) {
    await apiFetch('/debit-notes', {
      method: 'POST',
      body: JSON.stringify({ contractId, periodMonth, periodYear, notes: notes||undefined, ...svc }),
    });
    created++;
  }

  toast(`✅ ${created} nota(s) de débito registradas correctamente.`);
  closeModal('modal-new-debit-note');
  renderDebitNotes();
}

async function openEditDebitNote(id) {
  const res = await apiFetch(`/debit-notes/${id}`);
  const n   = res?.data;
  if (!n) return;

  const existing = document.getElementById('modal-edit-debit-note');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-edit-debit-note';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Editar nota de débito</span>
        <button class="modal-close" onclick="closeModal('modal-edit-debit-note');document.getElementById('modal-edit-debit-note').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="edit-dn-id" value="${n.id}">
        <div class="form-group">
          <label class="form-label">Tipo de servicio</label>
          <select id="edit-dn-service" class="form-control">
            ${Object.entries(SERVICE_LABELS).map(([k,v]) => `<option value="${k}" ${k===n.serviceType?'selected':''}>${SERVICE_ICONS[k]} ${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción <span>*</span></label>
          <input id="edit-dn-desc" class="form-control" value="${n.description}">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Monto <span>*</span></label>
            <input id="edit-dn-amount" class="form-control td-mono" type="number" step="0.01" value="${parseFloat(n.amount).toFixed(2)}">
          </div>
          <div class="form-group">
            <label class="form-label">Moneda</label>
            <select id="edit-dn-currency" class="form-control">
              <option value="HNL" ${n.currency==='HNL'?'selected':''}>HNL</option>
              <option value="USD" ${n.currency==='USD'?'selected':''}>USD</option>
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">N° Factura del servicio</label>
            <input id="edit-dn-invoice-ref" class="form-control td-mono" value="${n.invoiceRef||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de la factura</label>
            <input id="edit-dn-invoice-date" class="form-control" type="date" value="${n.invoiceDate?n.invoiceDate.split('T')[0]:''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea id="edit-dn-notes" class="form-control" rows="2">${n.notes||''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-edit-debit-note');document.getElementById('modal-edit-debit-note').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitEditDebitNote()">Guardar cambios</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-edit-debit-note');
}

async function submitEditDebitNote() {
  const id          = document.getElementById('edit-dn-id')?.value;
  const serviceType = document.getElementById('edit-dn-service')?.value;
  const description = document.getElementById('edit-dn-desc')?.value?.trim();
  const amount      = document.getElementById('edit-dn-amount')?.value;
  const currency    = document.getElementById('edit-dn-currency')?.value;
  const invoiceRef  = document.getElementById('edit-dn-invoice-ref')?.value?.trim();
  const invoiceDate = document.getElementById('edit-dn-invoice-date')?.value;
  const notes       = document.getElementById('edit-dn-notes')?.value?.trim();

  if (!description || !amount) { toast('Completá los campos requeridos.', 'warning'); return; }

  await apiFetch(`/debit-notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ serviceType, description, amount: parseFloat(amount), currency, invoiceRef: invoiceRef||undefined, invoiceDate: invoiceDate||undefined, notes: notes||undefined }),
  });

  toast('✅ Nota de débito actualizada.');
  closeModal('modal-edit-debit-note');
  document.getElementById('modal-edit-debit-note')?.remove();
  renderDebitNotes();
}

async function cancelDebitNote(id) {
  const reason = prompt('Motivo de anulación:');
  if (!reason) return;
  await apiFetch(`/debit-notes/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  toast('Nota de débito anulada.');
  renderDebitNotes();
}

async function notifyDebitNote(id) {
  const res = await apiFetch(`/debit-notes/${id}/notify`, { method: 'POST' });
  if (res?.message) toast(res.message);
}

async function reloadDebitNotes() {
  const month = document.getElementById('dn-month')?.value || new Date().getMonth() + 1;
  const year  = document.getElementById('dn-year')?.value  || new Date().getFullYear();

  const [summaryRes, notesRes] = await Promise.all([
    apiFetch(`/debit-notes/summary?month=${month}&year=${year}`),
    apiFetch(`/debit-notes?month=${month}&year=${year}`),
  ]);
  // Re-renderizar solo la tabla y resumen
  renderDebitNotes();
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
      <div class="flex gap-2">
        <button class="btn btn-ghost" onclick="openModal('modal-manual-rate')">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar manualmente
        </button>
        <button class="btn btn-primary" onclick="forceRateUpdate()">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Actualizar desde API
        </button>
      </div>
    </div>

    <div class="stat-grid" style="max-width:560px;margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon gold">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-value">L ${parseFloat(todayRate || 0).toFixed(4)}</div>
        <div class="stat-label">Tasa USD/HNL de hoy</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="openModal('modal-manual-rate')">
        <div class="stat-icon blue">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div class="stat-value" style="font-size:1rem">Editar tasa</div>
        <div class="stat-label">Ingresar valor manual</div>
      </div>
    </div>

    <div class="tabs" id="er-tabs" style="margin-bottom:0">
      <button class="tab-btn active" onclick="switchErTab('local', this)">📋 Historial Local</button>
      <button class="tab-btn" onclick="switchErTab('bch', this)">🏦 BCH — Banco Central</button>
    </div>

    <div id="er-tab-content">
      <div class="card" style="padding:0;border-top:none;border-radius:0 0 8px 8px">
        <div style="padding:16px 20px;border-bottom:1px solid var(--c-border);display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:0.88rem">Historial local (últimos 30 días)</strong>
          <span class="text-muted" style="font-size:0.75rem">Clic en una fila para editar esa tasa</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tasa (L por 1 USD)</th><th>Fuente</th><th>Acción</th></tr></thead>
            <tbody>
              ${history.map(r => `<tr>
                <td>${formatDate(r.date)}</td>
                <td class="td-mono">L ${parseFloat(r.rate).toFixed(4)}</td>
                <td class="text-muted">${r.source}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="openEditRate('${r.date}', ${parseFloat(r.rate).toFixed(4)})">Editar</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin historial</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal edición manual de tasa -->
    <div id="modal-manual-rate" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Editar tasa de cambio</span>
          <button class="modal-close" onclick="closeModal('modal-manual-rate')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info" style="margin-bottom:16px">
            Podés ingresar la tasa oficial del Banco Central de Honduras (BCH) manualmente. Esta tasa se usará para las conversiones del día seleccionado.
          </div>
          <div class="form-group">
            <label class="form-label">Fecha <span>*</span></label>
            <input id="manual-rate-date" class="form-control" type="date"
              value="${new Date().toISOString().split('T')[0]}">
            <div class="form-hint">Fecha a la que aplica esta tasa</div>
          </div>
          <div class="form-group">
            <label class="form-label">Tasa (Lempiras por 1 USD) <span>*</span></label>
            <input id="manual-rate-value" class="form-control td-mono" type="number"
              step="0.0001" min="1" placeholder="Ej: 24.8950"
              value="${parseFloat(todayRate || 0).toFixed(4)}">
            <div class="form-hint">Ingresá hasta 4 decimales. Ej: 24.8950</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-manual-rate')">Cancelar</button>
          <button class="btn btn-primary" onclick="saveManualRate()">Guardar tasa</button>
        </div>
      </div>
    </div>
  `;
}

function openEditRate(date, rate) {
  // Rellenar el modal con los datos de la fila seleccionada
  const dateInput = document.getElementById('manual-rate-date');
  const rateInput = document.getElementById('manual-rate-value');
  if (dateInput) dateInput.value = date.split('T')[0];
  if (rateInput) rateInput.value = parseFloat(rate).toFixed(4);
  openModal('modal-manual-rate');
}

async function saveManualRate() {
  const date  = document.getElementById('manual-rate-date')?.value;
  const rate  = parseFloat(document.getElementById('manual-rate-value')?.value || '0');

  if (!date) { toast('Seleccioná una fecha.', 'warning'); return; }
  if (!rate || rate <= 0) { toast('Ingresá una tasa válida mayor a 0.', 'warning'); return; }
  if (rate < 20 || rate > 100) { toast('La tasa parece incorrecta. Verificá el valor (debe estar entre 20 y 100 L/USD).', 'warning'); return; }

  // Verificar si la tasa es menor a la del BCH
  try {
    const bchRes = await apiFetch('/exchange-rates/today');
    const bchRate = parseFloat(bchRes?.data?.rate || 0);
    if (bchRate > 0 && rate < bchRate) {
      const confirm = window.confirm(
        `⚠️ ADVERTENCIA: Tasa de Cambio Inferior al BCH\n\n` +
        `Tasa ingresada:  L ${rate.toFixed(4)}\n` +
        `Tasa BCH actual: L ${bchRate.toFixed(4)}\n\n` +
        `La tasa que ingresaste es MENOR a la oficial del Banco Central de Honduras.\n` +
        `Esto puede generar conversiones incorrectas en los reportes.\n\n` +
        `¿Desea guardar de todas formas?`
      );
      if (!confirm) return;
      // Guardar flag para que el reporte CxC lo muestre
      try { localStorage.setItem('cxc_low_rate_warning', JSON.stringify({ date, rate, bchRate, savedAt: new Date().toISOString() })); } catch(e) {}
    } else {
      try { localStorage.removeItem('cxc_low_rate_warning'); } catch(e) {}
    }
  } catch(_e) { /* si no se puede verificar, continuar */ }

  await apiFetch('/exchange-rates/manual', {
    method: 'POST',
    body: JSON.stringify({ date, rate }),
  });

  toast(`✅ Tasa del ${formatDate(date)} guardada: L ${rate.toFixed(4)}`);
  closeModal('modal-manual-rate');
  renderExchangeRates();
}

async function switchErTab(tab, btn) {
  document.querySelectorAll('#er-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'bch') {
    document.getElementById('er-tab-content').innerHTML =
      '<div class="empty-state"><div class="spinner"></div><p style="margin-top:12px">Cargando tasas del Banco Central...</p></div>';
    await loadBchRates();
  } else {
    renderExchangeRates();
  }
}

async function loadBchRates() {
  const res = await apiFetch('/exchange-rates/bch-historical?days=30');
  const el  = document.getElementById('er-tab-content');
  if (!el) return;

  const rates  = res?.data?.rates  || [];
  const source = res?.data?.source || 'local';
  const isFallback = res?.data?.fallback;

  el.innerHTML = `
    <div class="card" style="padding:0;border-top:none;border-radius:0 0 8px 8px">
      ${isFallback ? `<div class="alert alert-warning" style="margin:12px 16px 0">
        ⚠️ No se pudo conectar al BCH directamente. Mostrando historial local como referencia.
      </div>` : ''}
      <div style="padding:16px 20px;border-bottom:1px solid var(--c-border);display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:0.88rem">Tasas ${isFallback ? 'históricas locales' : 'Banco Central de Honduras'} — últimos 30 días</strong>
        <span class="text-muted" style="font-size:0.75rem">Fuente: ${source === 'BCH' ? 'bch.hn' : 'historial local'}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Compra (L/USD)</th><th>Venta (L/USD)</th><th>Fuente</th><th>Usar esta tasa</th></tr></thead>
          <tbody>
            ${rates.map(r => {
              const fecha = r.fecha ? formatDate(r.fecha) : '—';
              const compra = parseFloat(r.compra||r.rate||0).toFixed(4);
              const venta  = parseFloat(r.venta ||r.rate||0).toFixed(4);
              const rawDate = (r.fecha||'').toString().split('T')[0];
              return `<tr>
                <td>${fecha}</td>
                <td class="td-mono">L ${compra}</td>
                <td class="td-mono">L ${venta}</td>
                <td class="text-muted">${r.source||'BCH'}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="openEditRate('${rawDate}', ${venta})">Usar venta</button></td>
              </tr>`;
            }).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin datos disponibles</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function forceRateUpdate() {
  await apiFetch('/exchange-rates/fetch', { method: 'POST' });
  toast('Tipo de cambio actualizado desde la API.');
  renderExchangeRates();
}

// ── Reportes ───────────────────────────────────────────────────
async function renderReports() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Reportes</h2><p>Reportes financieros, fiscales y operativos</p></div>
      <div class="flex gap-2">
        <select id="report-month" class="form-control" style="width:auto">
          ${MONTHS_ES.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===month?'selected':''}>${m}</option>`).join('')}
        </select>
        <input id="report-year" class="form-control" type="number" style="width:90px" value="${year}">
      </div>
    </div>

    <div class="tabs" id="report-tabs">
      <button class="tab-btn active" onclick="switchReportTab('pagos', this)">💰 Cobros</button>
      <button class="tab-btn" onclick="switchReportTab('mora', this)">🔴 Mora</button>
      <button class="tab-btn" onclick="switchReportTab('ocupacion', this)">🏠 Ocupación</button>
      <button class="tab-btn" onclick="switchReportTab('fiscal', this)">🧾 Fiscal SAR</button>
      <button class="tab-btn" onclick="switchReportTab('cxc', this)">📋 Cuentas x Cobrar</button>
    </div>

    <div id="report-content">
      <div class="empty-state"><div class="spinner"></div><p style="margin-top:16px">Cargando...</p></div>
    </div>
  `;

  await loadReportTab('pagos');
}

async function switchReportTab(tab, btn) {
  document.querySelectorAll('#report-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('report-content').innerHTML =
    '<div class="empty-state"><div class="spinner"></div></div>';
  await loadReportTab(tab);
}

async function loadReportTab(tab) {
  const month = parseInt(document.getElementById('report-month')?.value) || new Date().getMonth() + 1;
  const year  = parseInt(document.getElementById('report-year')?.value)  || new Date().getFullYear();
  const el    = document.getElementById('report-content');
  if (!el) return;

  if (tab === 'pagos') {
    const res = await apiFetch(`/payments/report?month=${month}&year=${year}`);
    el.innerHTML = renderReportPagos(res?.data, month, year);
  } else if (tab === 'mora') {
    const res = await apiFetch(`/payments?status=LATE&limit=100`);
    el.innerHTML = renderReportMora(res?.data || [], month, year);
  } else if (tab === 'ocupacion') {
    const res = await apiFetch(`/properties?limit=100`);
    el.innerHTML = renderReportOcupacion(res?.data || []);
  } else if (tab === 'fiscal') {
    const res = await apiFetch(`/invoices/report?month=${month}&year=${year}`);
    el.innerHTML = renderReportFiscal(res?.data, month, year);
  } else if (tab === 'cxc') {
    el.innerHTML = await renderReportCxC();
    await loadCxcReport();
  }
}

function renderReportPagos(report, month, year) {
  if (!report) return '<div class="empty-state"><p>Sin datos para este período</p></div>';
  const { summary, payments } = report;
  return `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon green"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="stat-value">${summary.totalPayments}</div>
        <div class="stat-label">Cobros recibidos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="stat-value td-mono" style="font-size:1.1rem">L ${parseFloat(summary.totalHNL).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Total en Lempiras</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>
        <div class="stat-value td-mono" style="font-size:1.1rem">$ ${parseFloat(summary.totalUSD).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Total en Dólares</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></div>
        <div class="stat-value td-mono" style="font-size:1.1rem">L ${parseFloat(summary.totalLateFees).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Mora cobrada</div>
      </div>
    </div>
    <div class="card" style="padding:0">
      <div style="padding:14px 20px;border-bottom:1px solid var(--c-border);display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:0.88rem">Cobros de ${MONTHS_ES[month]} ${year}</strong>
        <button class="btn btn-ghost btn-sm" onclick="exportPagosCSV()">📥 Exportar CSV</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Inquilino</th><th>Propiedad / Unidad</th><th>Monto</th><th>Mora</th><th>Moneda</th><th>Fecha pago</th><th>Estado</th></tr></thead>
          <tbody>
            ${(payments||[]).map(p=>`<tr>
              <td>${p.contract?.tenant?.firstName||''} ${p.contract?.tenant?.lastName||''}</td>
              <td class="text-muted">${p.contract?.unit?.property?.name||''} — ${p.contract?.unit?.number||''}</td>
              <td class="td-mono">${formatMoney(p.amountPaid, p.paymentCurrency)}</td>
              <td class="td-mono" style="color:${p.lateFeeAmount>0?'var(--c-danger)':'inherit'}">${p.lateFeeAmount>0?formatMoney(p.lateFeeAmount,p.paymentCurrency):'—'}</td>
              <td><span class="badge badge-neutral">${p.paymentCurrency}</span></td>
              <td>${formatDate(p.paymentDate)}</td>
              <td>${paymentStatusBadge(p.status)}</td>
            </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin cobros en este período</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderReportMora(payments, month, year) {
  const totalMora = payments.reduce((s, p) => s + parseFloat(p.lateFeeAmount||0), 0);
  return `
    <div class="alert alert-warning" style="margin-bottom:16px">
      <strong>${payments.length} pago(s) en mora</strong> — Total mora acumulada: <strong>L ${totalMora.toLocaleString('es-HN',{minimumFractionDigits:2})}</strong>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Inquilino</th><th>Unidad</th><th>Período</th><th>Monto due</th><th>Mora</th><th>Días atraso</th><th>Vencimiento</th></tr></thead>
          <tbody>
            ${payments.map(p=>`<tr>
              <td><strong>${p.contract?.tenant?.firstName||''} ${p.contract?.tenant?.lastName||''}</strong><br>
                <small class="td-mono">${p.contract?.tenant?.phone||''}</small></td>
              <td class="text-muted">${p.contract?.unit?.property?.name||''} — ${p.contract?.unit?.number||''}</td>
              <td>${MONTHS_ES[p.periodMonth]} ${p.periodYear}</td>
              <td class="td-mono">${formatMoney(p.amountDue, p.contract?.currency)}</td>
              <td class="td-mono" style="color:var(--c-danger)">${formatMoney(p.lateFeeAmount, p.contract?.currency)}</td>
              <td style="color:var(--c-danger);font-weight:600">${p.daysLate} días</td>
              <td>${formatDate(p.dueDate)}</td>
            </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--c-text-muted)">✅ Sin pagos en mora</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderReportOcupacion(properties) {
  const totalUnits    = properties.reduce((s,p) => s + (p.units?.length||0), 0);
  const occupiedUnits = properties.reduce((s,p) => s + (p.units?.filter(u=>u.isOccupied).length||0), 0);
  const freeUnits     = totalUnits - occupiedUnits;
  const pct = totalUnits > 0 ? Math.round(occupiedUnits/totalUnits*100) : 0;

  return `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon green"></div>
        <div class="stat-value">${totalUnits}</div>
        <div class="stat-label">Total de unidades</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"></div>
        <div class="stat-value">${occupiedUnits}</div>
        <div class="stat-label">Ocupadas</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"></div>
        <div class="stat-value">${freeUnits}</div>
        <div class="stat-label">Disponibles</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${pct>=80?'green':pct>=50?'gold':'red'}"></div>
        <div class="stat-value">${pct}%</div>
        <div class="stat-label">Tasa de ocupación</div>
      </div>
    </div>
    <div class="card" style="padding:0">
      <div style="padding:14px 20px;border-bottom:1px solid var(--c-border)">
        <strong style="font-size:0.88rem">Ocupación por propiedad</strong>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Propiedad</th><th>Ciudad</th><th>Total unidades</th><th>Ocupadas</th><th>Libres</th><th>Ocupación</th></tr></thead>
          <tbody>
            ${properties.map(p=>{
              const tot  = p.units?.length||0;
              const occ  = p.units?.filter(u=>u.isOccupied).length||0;
              const free = tot - occ;
              const pctP = tot>0?Math.round(occ/tot*100):0;
              return `<tr>
                <td><strong>${p.name}</strong></td>
                <td class="text-muted">${p.city}</td>
                <td class="td-mono">${tot}</td>
                <td class="td-mono" style="color:var(--c-primary)">${occ}</td>
                <td class="td-mono" style="color:var(--c-text-muted)">${free}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:6px;background:var(--c-border);border-radius:3px">
                      <div style="width:${pctP}%;height:100%;background:var(--c-primary);border-radius:3px"></div>
                    </div>
                    <span style="font-size:0.78rem;font-weight:500;min-width:32px">${pctP}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderReportFiscal(report, month, year) {
  if (!report) return `
    <div class="alert alert-info">Sin facturas emitidas en ${MONTHS_ES[month]} ${year}.
      <a href="#" onclick="navigate('invoices')" style="margin-left:8px">Ir a Facturas SAR →</a>
    </div>`;

  const { summary, invoices } = report;
  return `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon blue"></div>
        <div class="stat-value">${summary.totalInvoices}</div>
        <div class="stat-label">Facturas emitidas</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"></div>
        <div class="stat-value td-mono" style="font-size:1.1rem">L ${parseFloat(summary.totalSubtotal).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Subtotal (sin ISV)</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"></div>
        <div class="stat-value td-mono" style="font-size:1.1rem">L ${parseFloat(summary.totalISV).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">ISV 15% recaudado</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"></div>
        <div class="stat-value td-mono" style="font-size:1.1rem">L ${parseFloat(summary.totalGeneral).toLocaleString('es-HN',{minimumFractionDigits:2})}</div>
        <div class="stat-label">Total facturado</div>
      </div>
    </div>
    <div class="card" style="padding:0">
      <div style="padding:14px 20px;border-bottom:1px solid var(--c-border);display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:0.88rem">Facturas SAR — ${MONTHS_ES[month]} ${year}</strong>
        <span class="text-muted" style="font-size:0.75rem">Reporte para declaración de ISV</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>N° Factura</th><th>CAI</th><th>Receptor</th><th>RTN</th><th>Subtotal</th><th>ISV 15%</th><th>Total</th><th>Estado</th><th>PDF</th></tr></thead>
          <tbody>
            ${(invoices||[]).map(inv=>`<tr>
              <td class="td-mono">${inv.invoiceNumber}</td>
              <td class="td-mono" style="font-size:0.72rem">${inv.cai.slice(0,12)}...</td>
              <td>${inv.receiverName}</td>
              <td class="td-mono">${inv.receiverRtn||'—'}</td>
              <td class="td-mono">${formatMoney(inv.subtotal,'HNL')}</td>
              <td class="td-mono" style="color:var(--c-warning)">${formatMoney(inv.isvAmount,'HNL')}</td>
              <td class="td-mono"><strong>${formatMoney(inv.total,'HNL')}</strong></td>
              <td><span class="badge ${inv.status==='ISSUED'?'badge-success':inv.status==='CANCELLED'?'badge-danger':'badge-neutral'}">${inv.status==='ISSUED'?'Emitida':inv.status==='CANCELLED'?'Anulada':'Borrador'}</span></td>
              <td><a href="/api/invoices/${inv.id}/pdf" target="_blank" class="btn btn-ghost btn-sm">PDF</a></td>
            </tr>`).join('')||'<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin facturas en este período</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}


// ── Reporte Cuentas por Cobrar ───────────────────────────────────
async function renderReportCxC() {
  // Cargar lista de inquilinos para el filtro
  let tenantsOptions = '<option value="">— Todos los clientes —</option>';
  try {
    const tr = await apiFetch('/tenants?limit=200');
    (tr?.data || []).forEach(t => {
      tenantsOptions += `<option value="${t.id}">${t.firstName} ${t.lastName}${t.phone ? ' · ' + t.phone : ''}</option>`;
    });
  } catch(e) { /* silenciar */ }

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().slice(0,10);

  return `
    <div class="card" style="margin-bottom:16px;padding:16px 20px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
        <div>
          <label class="form-label" style="font-size:0.78rem;margin-bottom:4px;display:block">Fecha inicio</label>
          <input id="cxc-date-from" type="date" class="form-control" value="${firstOfMonth}" style="width:150px">
        </div>
        <div>
          <label class="form-label" style="font-size:0.78rem;margin-bottom:4px;display:block">Fecha fin</label>
          <input id="cxc-date-to" type="date" class="form-control" value="${lastOfMonth}" style="width:150px">
        </div>
        <div style="flex:1;min-width:200px">
          <label class="form-label" style="font-size:0.78rem;margin-bottom:4px;display:block">Cliente / Inquilino</label>
          <select id="cxc-tenant" class="form-control">${tenantsOptions}</select>
        </div>
        <div>
          <label class="form-label" style="font-size:0.78rem;margin-bottom:4px;display:block">Estado</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0">
            <label class="cxc-check"><input type="checkbox" id="cxc-s-all" onchange="cxcToggleAll(this)" checked> <span class="badge badge-neutral">Todos</span></label>
            <label class="cxc-check"><input type="checkbox" class="cxc-status" value="PENDING" checked> <span class="badge badge-warning">Pendientes</span></label>
            <label class="cxc-check"><input type="checkbox" class="cxc-status" value="PARTIAL" checked> <span class="badge" style="background:var(--c-info,#3b82f6);color:#fff">Abonados</span></label>
            <label class="cxc-check"><input type="checkbox" class="cxc-status" value="FINANCED"> <span class="badge badge-neutral">Financiados</span></label>
            <label class="cxc-check"><input type="checkbox" class="cxc-status" value="PAID"> <span class="badge badge-success">Cobrados</span></label>
            <label class="cxc-check"><input type="checkbox" class="cxc-status" value="LATE" checked> <span class="badge badge-danger">En mora</span></label>
            <label class="cxc-check"><input type="checkbox" class="cxc-status" value="WAIVED"> <span class="badge badge-neutral">Anulados</span></label>
          </div>
        </div>
        <div>
          <button class="btn btn-primary" onclick="loadCxcReport()">🔍 Buscar</button>
        </div>
      </div>
    </div>
    <div id="cxc-results">
      <div class="empty-state"><div class="spinner"></div><p style="margin-top:12px">Cargando...</p></div>
    </div>
    <style>
      .cxc-check { display:inline-flex;align-items:center;gap:4px;cursor:pointer;user-select:none; }
      .cxc-check input { cursor:pointer; }
    </style>`;
}

function cxcToggleAll(checkbox) {
  const checked = checkbox.checked;
  document.querySelectorAll('.cxc-status').forEach(cb => { cb.checked = checked; });
}

async function loadCxcReport() {
  const dateFrom  = document.getElementById('cxc-date-from')?.value || '';
  const dateTo    = document.getElementById('cxc-date-to')?.value   || '';
  const tenantId  = document.getElementById('cxc-tenant')?.value    || '';
  const checked   = [...document.querySelectorAll('.cxc-status:checked')].map(cb => cb.value);
  const allBtn    = document.getElementById('cxc-s-all');

  const el = document.getElementById('cxc-results');
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  let url = '/payments/cxc-report?';
  if (dateFrom)  url += `dateFrom=${dateFrom}&`;
  if (dateTo)    url += `dateTo=${dateTo}&`;
  if (tenantId)  url += `tenantId=${tenantId}&`;
  if (checked.length === 0 || (allBtn && allBtn.checked)) {
    url += `statuses=ALL`;
  } else {
    url += checked.map(s => `statuses=${s}`).join('&');
  }

  const res = await apiFetch(url);
  // Store last data globally for export/print
  window._cxcLastData = res?.data;
  el.innerHTML = renderCxcResults(res?.data);
}

function renderCxcResults(data) {
  if (!data) return '<div class="empty-state"><p>Error al cargar el reporte.</p></div>';
  const { summary, tenantGroups = [], bchRate = 0 } = data;

  const STATUS_ES = { PENDING:'Pendiente', PARTIAL:'Abonado', PAID:'Cobrado', LATE:'En mora', WAIVED:'Anulado', FINANCED:'Financiado' };
  const STATUS_BADGE = {
    PENDING:'badge-warning', PARTIAL:'badge-info', PAID:'badge-success',
    LATE:'badge-danger', WAIVED:'badge-neutral', FINANCED:'badge-neutral',
  };

  const statusBadge = s => `<span class="badge ${STATUS_BADGE[s]||'badge-neutral'}">${STATUS_ES[s]||s}</span>`;

  const fmtL = n => `L ${parseFloat(n||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`;
  const fmtD = n => `$ ${parseFloat(n||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`;
  const fmtMon = (amount, currency) => currency === 'USD' ? fmtD(amount) : fmtL(amount);

  // Check localStorage for low-rate warning
  let lowRateWarn = null;
  try { lowRateWarn = JSON.parse(localStorage.getItem('cxc_low_rate_warning') || 'null'); } catch(e) {}

  const warnBanner = lowRateWarn
    ? `<div class="alert" style="background:#fff7ed;border:1px solid #f97316;color:#9a3412;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        ⚠️ <strong>Advertencia:</strong> El reporte usa una tasa de cambio <strong>inferior al BCH</strong>.
        Tasa utilizada: <strong>L ${parseFloat(lowRateWarn.rate).toFixed(4)}</strong> &nbsp;|&nbsp;
        Tasa BCH referencia: <strong>L ${parseFloat(lowRateWarn.bchRate).toFixed(4)}</strong>
        <button style="margin-left:auto;background:none;border:none;cursor:pointer;color:#9a3412;font-size:1.1rem" onclick="try{localStorage.removeItem('cxc_low_rate_warning')}catch(e){}this.parentElement.remove()">✕</button>
      </div>`
    : '';

  // Per-payment debit notes calc helper
  const getDebitNotes = (p) => (p.contract?.debitNotes||[]).filter(
    dn => dn.periodMonth === p.periodMonth && dn.periodYear === p.periodYear
  );
  const debitTotal = (p) => {
    const dns = getDebitNotes(p);
    return dns.reduce((s, dn) => {
      const amt = parseFloat(dn.amount||0);
      return s + (dn.currency === 'HNL' ? amt : amt * bchRate);
    }, 0);
  };
  const paymentBalance = (p) => {
    const due  = parseFloat(p.amountDue||0);
    const paid = parseFloat(p.amountPaid||0);
    return Math.max(0, due - paid);
  };
  const balanceHNL = (p) => {
    const bal = paymentBalance(p);
    return (p.paymentCurrency === 'HNL' ? bal : bal * bchRate) + debitTotal(p);
  };

  // Build rows grouped by tenant
  let groupedRows = '';
  let grandTotal = 0;

  for (const group of tenantGroups) {
    let clientTotal = 0;
    let clientRows  = '';

    for (const p of group.payments) {
      const unit   = p.contract?.unit;
      const prop   = unit?.property;
      const bal    = paymentBalance(p);
      const dns    = getDebitNotes(p);
      const dnTotal = debitTotal(p);
      // contractCurrency: moneda del contrato (USD/HNL) — define cómo se muestra amountDue y saldo
      // paymentCurrency:  moneda en que se hizo el pago — solo se usa para mostrar lo abonado
      const contractCurrency = p.contract?.currency || p.paymentCurrency;
      const isUSD = contractCurrency === 'USD';

      const totalHNL = (isUSD ? bal * bchRate : bal) + dnTotal;
      const isPending = ['PENDING','PARTIAL','LATE'].includes(p.status);

      if (isPending) clientTotal += totalHNL;

      const debitCell = dns.length > 0
        ? `<span title="${dns.map(dn=>`${dn.serviceType}: ${fmtMon(dn.amount,dn.currency)}`).join(', ')}" style="cursor:help;border-bottom:1px dashed #888">${fmtL(dnTotal)} (${dns.length})</span>`
        : '—';

      // T/C solo si el contrato es en USD
      const rateCell = isUSD
        ? `<span class="td-mono" style="font-size:0.78rem">L ${bchRate.toFixed(4)}</span>`
        : `<span class="text-muted" style="font-size:0.78rem">—</span>`;

      clientRows += `<tr>
        <td class="text-muted" style="padding-left:28px">${prop?.name||'—'} — ${unit?.number||''}</td>
        <td class="td-mono" style="font-size:0.82rem">${MONTHS_ES[p.periodMonth]||''} ${p.periodYear}</td>
        <td class="td-mono ${p.status==='LATE'?'text-danger':''}" style="font-size:0.82rem">${formatDate(p.dueDate)}</td>
        <td class="td-mono">${fmtMon(p.amountDue, contractCurrency)}</td>
        <td class="td-mono" style="color:var(--c-success,#22c55e)">${parseFloat(p.amountPaid||0)>0?fmtMon(p.amountPaid,p.paymentCurrency):'—'}</td>
        <td class="td-mono" style="font-weight:600;color:${bal>0?'var(--c-danger,#ef4444)':'var(--c-success,#22c55e)'}">${bal>0?fmtMon(bal,contractCurrency):'✓'}</td>
        <td class="td-mono" style="color:#888">L 0.00</td>
        <td class="td-mono" style="font-size:0.78rem">${debitCell}</td>
        <td>${rateCell}</td>
        <td class="td-mono" style="font-weight:600">${isPending ? fmtL(totalHNL) : '—'}</td>
        <td>${statusBadge(p.status)}</td>
      </tr>`;
    }

    grandTotal += clientTotal;

    groupedRows += `
      <tr style="background:var(--c-surface-alt,#f1f5f9)">
        <td colspan="11" style="padding:7px 14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:700;font-size:0.88rem">👤 ${group.tenantName}
              ${group.tenantPhone ? `<span class="text-muted td-mono" style="font-weight:400;font-size:0.78rem"> · ${group.tenantPhone}</span>` : ''}
            </span>
            <span style="font-weight:700;color:var(--c-primary)">Subtotal cliente: ${fmtL(clientTotal)}</span>
          </div>
        </td>
      </tr>
      ${clientRows}`;
  }

  // Grand total row
  const totalRow = `<tr style="background:var(--c-primary,#1e3a5f);color:#fff">
    <td colspan="9" style="padding:8px 14px;font-weight:700;font-size:0.9rem">TOTAL GLOBAL</td>
    <td class="td-mono" style="padding:8px 14px;font-weight:700;font-size:0.95rem">${fmtL(grandTotal)}</td>
    <td></td>
  </tr>`;

  return `
    ${warnBanner}
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-icon blue"></div>
        <div class="stat-value">${summary.total}</div>
        <div class="stat-label">Total registros</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"></div>
        <div class="stat-value td-mono" style="font-size:0.95rem">${fmtL(summary.grandTotalHNL)}</div>
        <div class="stat-label">Total Global HNL</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon gold"></div>
        <div class="stat-value td-mono" style="font-size:0.95rem">${fmtL(summary.totalPendingHNL)}</div>
        <div class="stat-label">Saldo Pendiente HNL</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${summary.totalLate>0?'red':'green'}"></div>
        <div class="stat-value">${summary.totalLate}</div>
        <div class="stat-label">En mora</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"></div>
        <div class="stat-value">${summary.totalPaid}</div>
        <div class="stat-label">Cobrados</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"></div>
        <div class="stat-value td-mono" style="font-size:0.82rem">L ${parseFloat(bchRate||0).toFixed(4)}</div>
        <div class="stat-label">Tasa BCH Hoy</div>
      </div>
    </div>

    <div class="card" style="padding:0">
      <div style="padding:12px 20px;border-bottom:1px solid var(--c-border);display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:0.88rem">Cuentas por Cobrar — Agrupado por Cliente</strong>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="exportCxcExcel()">📊 Exportar Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="printCxcReport()">🖨️ Imprimir</button>
        </div>
      </div>
      <div class="table-wrap">
        <table id="cxc-main-table">
          <thead>
            <tr>
              <th>Propiedad / Unidad</th>
              <th>Período</th>
              <th>Vencimiento</th>
              <th>Monto a Cobrar</th>
              <th>Abonado</th>
              <th>Saldo</th>
              <th>Mora</th>
              <th>Notas Débito</th>
              <th>T/C</th>
              <th>Total HNL</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${tenantGroups.length > 0
              ? groupedRows + totalRow
              : '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--c-text-muted)">Sin registros con los filtros seleccionados</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>`;
}

async function _cxcFetchCurrentData() {
  // Use cached data from last search if available
  const dateFrom = document.getElementById('cxc-date-from')?.value || '';
  const dateTo   = document.getElementById('cxc-date-to')?.value   || '';
  if (window._cxcLastData) return { data: window._cxcLastData, dateFrom, dateTo };

  const tenantId = document.getElementById('cxc-tenant')?.value    || '';
  const checked  = [...document.querySelectorAll('.cxc-status:checked')].map(cb => cb.value);
  let url = '/payments/cxc-report?';
  if (dateFrom)  url += `dateFrom=${dateFrom}&`;
  if (dateTo)    url += `dateTo=${dateTo}&`;
  if (tenantId)  url += `tenantId=${tenantId}&`;
  url += checked.length === 0 ? 'statuses=ALL' : checked.map(s => `statuses=${s}`).join('&');
  const res = await apiFetch(url);
  return { data: res?.data, dateFrom, dateTo };
}

async function exportCxcExcel() {
  const { data, dateFrom, dateTo } = await _cxcFetchCurrentData();
  const payments = data?.payments || [];
  const summary  = data?.summary  || {};

  const STATUS_ES = { PENDING:'Pendiente', PARTIAL:'Abonado', PAID:'Cobrado', LATE:'En mora', WAIVED:'Anulado', FINANCED:'Financiado' };
  const tenantGroups = data?.tenantGroups || [];
  const bchRate = parseFloat(data?.bchRate || 0);

  // ── Hoja de detalle agrupada por cliente ──────────────────────
  const detailRows = [
    ['Cliente','Teléfono','Propiedad','Unidad','Período','Vencimiento','Monto a Cobrar','Moneda','Abonado','Saldo','Mora','Notas Débito HNL','T/C (L/USD)','Total HNL','Estado'],
  ];

  for (const group of tenantGroups) {
    let clientTotal = 0;
    for (const p of group.payments) {
      const unit   = p.contract?.unit;
      const due    = parseFloat(p.amountDue||0);
      const paid   = parseFloat(p.amountPaid||0);
      const bal    = Math.max(0, due - paid);
      const dns    = (p.contract?.debitNotes||[]).filter(dn=>dn.periodMonth===p.periodMonth&&dn.periodYear===p.periodYear);
      const dnHNL  = dns.reduce((s,dn)=>s+parseFloat(dn.amount||0)*(dn.currency==='USD'?bchRate:1),0);
      const balHNL = (contractCurrency==='HNL' ? bal : bal * bchRate) + dnHNL;
      const isPending = ['PENDING','PARTIAL','LATE'].includes(p.status);
      if (isPending) clientTotal += balHNL;

      const contractCurrency = p.contract?.currency || p.paymentCurrency;
      detailRows.push([
        `${group.tenantName}`,
        group.tenantPhone,
        unit?.property?.name||'',
        unit?.number||'',
        `${MONTHS_ES[p.periodMonth]||''} ${p.periodYear}`,
        p.dueDate ? new Date(p.dueDate).toLocaleDateString('es-HN') : '',
        due,
        contractCurrency,
        paid,
        bal,
        0, // Mora siempre 0
        dnHNL,
        contractCurrency==='USD' ? bchRate : '',
        isPending ? parseFloat(balHNL.toFixed(2)) : '',
        STATUS_ES[p.status]||p.status,
      ]);
    }
    // Subtotal por cliente
    detailRows.push(['','','','','','','','','','','','','SUBTOTAL '+group.tenantName, parseFloat(clientTotal.toFixed(2)),'']);
  }

  // Gran total
  detailRows.push(['','','','','','','','','','','','','TOTAL GLOBAL', parseFloat(parseFloat(summary.grandTotalHNL||0).toFixed(2)),'']);

  // ── Hoja de resumen ───────────────────────────────────────────
  const summaryRows = [
    ['Concepto', 'Valor'],
    ['Total registros',        summary.total        || 0],
    ['Pendientes',             summary.totalPending  || 0],
    ['Abonados',               summary.totalPartial  || 0],
    ['Cobrados',               summary.totalPaid     || 0],
    ['En mora',                summary.totalLate     || 0],
    ['Anulados',               summary.totalWaived   || 0],
    ['Saldo pendiente HNL',    parseFloat(summary.totalPendingHNL||0)],
    ['Total Global HNL',       parseFloat(summary.grandTotalHNL||0)],
    ['Tasa BCH utilizada',     bchRate],
  ];

  // ── Construir workbook con SheetJS ────────────────────────────
  const XLSX = window.XLSX || (await import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs'));

  const wb = XLSX.utils.book_new();

  // Hoja detalle
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  // Ancho de columnas
  wsDetail['!cols'] = [30,14,22,8,14,14,16,14,16,12,8,12].map(w => ({ wch: w }));
  // Estilo de encabezado (SheetJS Community Edition no aplica estilos visuales, pero sí los registra)
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle CxC');

  // Hoja resumen
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  const filename = `cuentas-por-cobrar-${dateFrom||'inicio'}-${dateTo||'fin'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function printCxcReport() {
  const data = window._cxcLastData;
  if (!data) { toast('Primero realice una búsqueda.', 'warning'); return; }

  const { tenantGroups = [], summary = {}, bchRate = 0 } = data;
  const dateFrom  = document.getElementById('cxc-date-from')?.value || '';
  const dateTo    = document.getElementById('cxc-date-to')?.value   || '';
  const tenantSel = document.getElementById('cxc-tenant');
  const tenantLbl = tenantSel?.options[tenantSel.selectedIndex]?.text || 'Todos';
  const checked   = [...document.querySelectorAll('.cxc-status:checked')].map(cb => {
    const M = {PENDING:'Pendiente',PARTIAL:'Abonado',PAID:'Cobrado',LATE:'En mora',WAIVED:'Anulado',FINANCED:'Financiado'};
    return M[cb.value]||cb.value;
  });

  const fmtL = n => `L ${parseFloat(n||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`;
  const fmtMon = (amount, currency) => currency === 'USD'
    ? `$ ${parseFloat(amount||0).toLocaleString('es-HN',{minimumFractionDigits:2})}`
    : fmtL(amount);
  // contractCurr: usa la moneda del contrato para mostrar amountDue y saldo correctamente
  const contractCurr = p => p.contract?.currency || p.paymentCurrency;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-HN') : '—';
  const STATUS_ES = {PENDING:'Pendiente',PARTIAL:'Abonado',PAID:'Cobrado',LATE:'En mora',WAIVED:'Anulado',FINANCED:'Financiado'};
  const now = new Date().toLocaleString('es-HN');

  let lowRateWarn = null;
  try { lowRateWarn = JSON.parse(localStorage.getItem('cxc_low_rate_warning')||'null'); } catch(e){}

  // Build table rows
  let tableBody = '';
  let grandTotal = 0;

  for (const group of tenantGroups) {
    let clientTotal = 0;
    tableBody += `<tr class="group-header"><td colspan="10">👤 ${group.tenantName}${group.tenantPhone?' · '+group.tenantPhone:''}</td></tr>`;

    for (const p of group.payments) {
      const unit = p.contract?.unit;
      const due  = parseFloat(p.amountDue||0);
      const paid = parseFloat(p.amountPaid||0);
      const bal  = Math.max(0, due - paid);
      const dns  = (p.contract?.debitNotes||[]).filter(dn=>dn.periodMonth===p.periodMonth&&dn.periodYear===p.periodYear);
      const dnHNL = dns.reduce((s,dn)=>s+parseFloat(dn.amount||0)*(dn.currency==='USD'?bchRate:1),0);
      const balHNL = (contractCurr(p)==='HNL' ? bal : bal * bchRate) + dnHNL;
      const isPending = ['PENDING','PARTIAL','LATE'].includes(p.status);
      if (isPending) clientTotal += balHNL;

      const BADGE_CLASS = {PENDING:'badge-warning',PARTIAL:'badge-info',PAID:'badge-success',LATE:'badge-danger',WAIVED:'badge-neutral',FINANCED:'badge-neutral'};
      tableBody += `<tr>
        <td>${unit?.property?.name||'—'} — ${unit?.number||''}</td>
        <td>${(window.MONTHS_ES||[])[p.periodMonth]||''} ${p.periodYear}</td>
        <td class="${p.status==='LATE'?'danger':''}">${fmtDate(p.dueDate)}</td>
        <td>${fmtMon(p.amountDue,contractCurr(p))}</td>
        <td>${paid>0?fmtMon(p.amountPaid,p.paymentCurrency):'—'}</td>
        <td class="${bal>0?'danger':'success'}">${bal>0?fmtMon(bal,contractCurr(p)):'✓'}</td>
        <td>L 0.00</td>
        <td>${dns.length>0?fmtL(dnHNL)+` (${dns.length})`:'—'}</td>
        <td>${contractCurr(p)==='USD'?`L ${parseFloat(bchRate).toFixed(4)}`:'—'}</td>
        <td class="bold">${isPending?fmtL(balHNL):'—'}</td>
        <td><span class="badge ${BADGE_CLASS[p.status]||'badge-neutral'}">${STATUS_ES[p.status]||p.status}</span></td>
      </tr>`;
    }

    grandTotal += clientTotal;
    tableBody += `<tr class="subtotal-row"><td colspan="9">Subtotal — ${group.tenantName}</td><td colspan="2" class="bold">${fmtL(clientTotal)}</td></tr>`;
  }

  tableBody += `<tr class="grand-total-row"><td colspan="9">TOTAL GLOBAL</td><td colspan="2">${fmtL(grandTotal)}</td></tr>`;

  const printWin = window.open('','_blank','width=1100,height=800');
  printWin.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Cuentas por Cobrar</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:10.5px;color:#111;padding:18px 24px}
  h1{font-size:15px;font-weight:700;margin-bottom:2px}
  .subtitle{font-size:10px;color:#555;margin-bottom:10px}
  .filters{font-size:9.5px;color:#444;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:5px 10px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px}
  .filters strong{color:#111}
  .warn-box{background:#fff7ed;border:1px solid #f97316;color:#9a3412;border-radius:4px;padding:6px 10px;margin-bottom:10px;font-size:9.5px}
  .summary{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
  .sc{border:1px solid #ddd;border-radius:4px;padding:5px 10px;min-width:120px}
  .sc .val{font-size:13px;font-weight:700}.sc .lbl{font-size:8.5px;color:#666;text-transform:uppercase;letter-spacing:0.3px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#1e3a5f;color:#fff}
  thead th{padding:5px 6px;font-size:9px;font-weight:600;white-space:nowrap;text-align:left}
  tbody td{padding:3px 6px;border-bottom:1px solid #eee;font-size:9.5px;vertical-align:top}
  tbody tr:nth-child(even){background:#f9f9f9}
  tr.group-header td{background:#e8eef6;color:#1e3a5f;font-weight:700;padding:5px 10px;font-size:10px}
  tr.subtotal-row td{background:#dbeafe;color:#1e40af;font-weight:700;text-align:right;padding:4px 8px}
  tr.grand-total-row td{background:#1e3a5f;color:#fff;font-weight:700;font-size:11px;padding:6px 8px;text-align:right}
  .bold{font-weight:700}.danger{color:#c0392b}.success{color:#27ae60}
  .badge{display:inline-block;padding:1px 5px;border-radius:8px;font-size:8px;font-weight:600}
  .badge-warning{background:#fef3c7;color:#92400e}.badge-info{background:#dbeafe;color:#1e40af}
  .badge-success{background:#d1fae5;color:#065f46}.badge-danger{background:#fee2e2;color:#991b1b}
  .badge-neutral{background:#f3f4f6;color:#374151}
  .footer{margin-top:14px;font-size:8.5px;color:#888;text-align:right;border-top:1px solid #ddd;padding-top:5px}
  @media print{body{padding:8px 12px}@page{margin:10mm 8mm;size:landscape}thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head><body>
  <h1>Reporte de Cuentas por Cobrar</h1>
  <div class="subtitle">Generado el ${now}</div>
  <div class="filters">
    <span><strong>Período:</strong> ${dateFrom||'—'} al ${dateTo||'—'}</span>
    <span><strong>Cliente:</strong> ${tenantLbl}</span>
    <span><strong>Estados:</strong> ${checked.length?checked.join(', '):'Todos'}</span>
    <span><strong>Tasa BCH:</strong> L ${parseFloat(bchRate).toFixed(4)}</span>
  </div>
  ${lowRateWarn?`<div class="warn-box">⚠️ <strong>Advertencia:</strong> Se usó una tasa inferior al BCH. Tasa usada: L ${parseFloat(lowRateWarn.rate).toFixed(4)} | Tasa BCH: L ${parseFloat(lowRateWarn.bchRate).toFixed(4)}</div>`:''}
  <div class="summary">
    <div class="sc"><div class="val">${summary.total||0}</div><div class="lbl">Total registros</div></div>
    <div class="sc"><div class="val">${fmtL(summary.grandTotalHNL)}</div><div class="lbl">Total Global HNL</div></div>
    <div class="sc"><div class="val">${fmtL(summary.totalPendingHNL)}</div><div class="lbl">Saldo Pendiente HNL</div></div>
    <div class="sc"><div class="val">${summary.totalPending||0}</div><div class="lbl">Pendientes</div></div>
    <div class="sc"><div class="val">${summary.totalLate||0}</div><div class="lbl">En mora</div></div>
    <div class="sc"><div class="val">${summary.totalPaid||0}</div><div class="lbl">Cobrados</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Propiedad/Unidad</th><th>Período</th><th>Vencimiento</th><th>Monto a Cobrar</th>
      <th>Abonado</th><th>Saldo</th><th>Mora</th><th>Notas Débito</th><th>T/C</th><th>Total HNL</th><th>Estado</th>
    </tr></thead>
    <tbody>${tableBody}</tbody>
  </table>
  <div class="footer">Rentify · Cuentas por Cobrar · ${now}</div>
</body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(()=>printWin.print(), 400);
}
async function loadReport() {
  const month = parseInt(document.getElementById('report-month')?.value);
  const year  = parseInt(document.getElementById('report-year')?.value);
  const activeTab = document.querySelector('#report-tabs .tab-btn.active');
  const tabName = activeTab?.textContent?.includes('Cobros') ? 'pagos'
    : activeTab?.textContent?.includes('Mora') ? 'mora'
    : activeTab?.textContent?.includes('Ocup') ? 'ocupacion'
    : 'fiscal';
  await loadReportTab(tabName);
}

async function exportPagosCSV() {
  const month = parseInt(document.getElementById('report-month')?.value) || new Date().getMonth()+1;
  const year  = parseInt(document.getElementById('report-year')?.value)  || new Date().getFullYear();
  const res   = await apiFetch(`/payments/report?month=${month}&year=${year}`);
  const payments = res?.data?.payments || [];

  const rows = [
    ['Inquilino','Propiedad','Unidad','Monto Pagado','Moneda','Mora','Fecha Pago','Estado'],
    ...payments.map(p => [
      `${p.contract?.tenant?.firstName||''} ${p.contract?.tenant?.lastName||''}`,
      p.contract?.unit?.property?.name||'',
      p.contract?.unit?.number||'',
      p.amountPaid,
      p.paymentCurrency,
      p.lateFeeAmount||0,
      p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('es-HN') : '',
      p.status,
    ])
  ];

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `cobros-${MONTHS_ES[month]}-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Facturas SAR ───────────────────────────────────────────────
async function renderInvoices() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const res = await apiFetch(`/invoices?month=${month}&year=${year}`);
  const invoices = res?.data || [];

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Facturas SAR Honduras</h2>
        <p>Facturación fiscal con CAI, ISV 15% y cumplimiento SAR</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-new-invoice')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva factura
      </button>
    </div>

    <div class="alert alert-info" style="margin-bottom:16px">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Las facturas incluyen: <strong>CAI, correlativo, RTN emisor/receptor, ISV 15%, total en letras</strong> y la leyenda obligatoria SAR.
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>N° Factura</th><th>Receptor</th><th>RTN Receptor</th><th>Subtotal</th><th>ISV</th><th>Total</th><th>Fecha</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${invoices.map(inv => `<tr>
              <td class="td-mono"><strong>${inv.invoiceNumber}</strong></td>
              <td>${inv.receiverName}</td>
              <td class="td-mono">${inv.receiverRtn || '—'}</td>
              <td class="td-mono">${formatMoney(inv.subtotal, inv.currency)}</td>
              <td class="td-mono" style="color:var(--c-warning)">${formatMoney(inv.isvAmount, inv.currency)}</td>
              <td class="td-mono"><strong>${formatMoney(inv.total, inv.currency)}</strong></td>
              <td>${formatDate(inv.issuedAt)}</td>
              <td><span class="badge ${inv.status==='ISSUED'?'badge-success':inv.status==='CANCELLED'?'badge-danger':'badge-neutral'}">
                ${inv.status==='ISSUED'?'Emitida':inv.status==='CANCELLED'?'Anulada':'Borrador'}
              </span></td>
              <td>
                <div class="flex gap-2">
                  <a href="/api/invoices/${inv.id}/pdf" target="_blank" class="btn btn-ghost btn-sm">PDF</a>
                  ${inv.status==='ISSUED' ? `
                    <button class="btn btn-ghost btn-sm" onclick="sendInvoiceWA('${inv.id}')">WA</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="cancelInvoice('${inv.id}')">Anular</button>` : ''}
                </div>
              </td>
            </tr>`).join('') || '<tr><td colspan="9"><div class="empty-state" style="padding:30px">Sin facturas. Creá la primera usando el botón de arriba.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal nueva factura -->
    <div id="modal-new-invoice" class="modal-backdrop" style="display:none">
      <div class="modal modal-xl">
        <div class="modal-header">
          <span class="modal-title">🧾 Nueva Factura SAR</span>
          <button class="modal-close" onclick="closeModal('modal-new-invoice')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <!-- Datos del emisor -->
            <div>
              <div style="font-weight:600;font-size:0.85rem;color:var(--c-primary);margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--c-border)">DATOS DEL EMISOR (Arrendador)</div>
              <div class="form-group">
                <label class="form-label">Nombre / Razón Social <span>*</span></label>
                <input id="inv-issuer-name" class="form-control" placeholder="Tu nombre o empresa">
              </div>
              <div class="form-group">
                <label class="form-label">RTN Emisor <span>*</span></label>
                <input id="inv-issuer-rtn" class="form-control" placeholder="08011234567890" maxlength="14">
                <div class="form-hint">14 dígitos sin guiones</div>
              </div>
              <div class="form-group">
                <label class="form-label">Dirección Fiscal <span>*</span></label>
                <input id="inv-issuer-address" class="form-control" placeholder="Col. Kennedy, Calle #45">
              </div>
              <div class="form-group">
                <label class="form-label">Teléfono</label>
                <input id="inv-issuer-phone" class="form-control" placeholder="+504XXXXXXXX">
              </div>
            </div>
            <!-- Datos del receptor -->
            <div>
              <div style="font-weight:600;font-size:0.85rem;color:var(--c-primary);margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--c-border)">DATOS DEL RECEPTOR (Inquilino)</div>
              <div class="form-group">
                <label class="form-label">Nombre / Razón Social <span>*</span></label>
                <input id="inv-receiver-name" class="form-control" placeholder="Nombre del inquilino">
              </div>
              <div class="form-group">
                <label class="form-label">RTN Receptor</label>
                <input id="inv-receiver-rtn" class="form-control" placeholder="RTN del inquilino (opcional)">
              </div>
              <div class="form-group">
                <label class="form-label">Dirección</label>
                <input id="inv-receiver-address" class="form-control" placeholder="Dirección del inquilino">
              </div>
            </div>
          </div>

          <div style="font-weight:600;font-size:0.85rem;color:var(--c-primary);margin:16px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--c-border)">DATOS DE AUTORIZACIÓN SAR</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">CAI <span>*</span></label>
              <input id="inv-cai" class="form-control" placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX">
              <div class="form-hint">Código de Autorización de Impresión</div>
            </div>
            <div class="form-group">
              <label class="form-label">Rango autorizado <span>*</span></label>
              <input id="inv-range" class="form-control" placeholder="000-001-01-00000001-00000500">
            </div>
          </div>
          <div class="form-grid-3">
            <div class="form-group">
              <label class="form-label">N° de Factura <span>*</span></label>
              <input id="inv-number" class="form-control" placeholder="000-001-01-00000001">
            </div>
            <div class="form-group">
              <label class="form-label">Fecha límite CAI <span>*</span></label>
              <input id="inv-expires" class="form-control" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Moneda</label>
              <select id="inv-currency" class="form-control">
                <option value="HNL">HNL — Lempiras</option>
                <option value="USD">USD — Dólares</option>
              </select>
            </div>
          </div>

          <div style="font-weight:600;font-size:0.85rem;color:var(--c-primary);margin:16px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--c-border)">CONCEPTO Y MONTOS</div>
          <div class="form-group">
            <label class="form-label">Concepto / Descripción <span>*</span></label>
            <input id="inv-description" class="form-control" placeholder="Alquiler de apartamento — Unidad 3B">
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Subtotal (sin ISV) <span>*</span></label>
              <input id="inv-subtotal" class="form-control td-mono" type="number" step="0.01" min="0" placeholder="3000.00" oninput="calcInvoiceTotals()">
            </div>
            <div class="form-group">
              <label class="form-label">ISV %</label>
              <input id="inv-isv" class="form-control td-mono" type="number" value="15" min="0" max="100" oninput="calcInvoiceTotals()">
            </div>
          </div>
          <div style="background:var(--c-surface-alt);border-radius:var(--radius-md);padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
            <div><div class="text-muted" style="font-size:0.72rem">Subtotal</div><div class="td-mono" style="font-weight:600" id="inv-preview-subtotal">L 0.00</div></div>
            <div><div class="text-muted" style="font-size:0.72rem">ISV 15%</div><div class="td-mono" style="font-weight:600;color:var(--c-warning)" id="inv-preview-isv">L 0.00</div></div>
            <div><div class="text-muted" style="font-size:0.72rem">TOTAL</div><div class="td-mono" style="font-weight:700;color:var(--c-primary);font-size:1.1rem" id="inv-preview-total">L 0.00</div></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-invoice')">Cancelar</button>
          <button class="btn btn-primary" onclick="createInvoice()">Emitir factura</button>
        </div>
      </div>
    </div>
  `;
}

function calcInvoiceTotals() {
  const subtotal = parseFloat(document.getElementById('inv-subtotal')?.value) || 0;
  const isvPct   = parseFloat(document.getElementById('inv-isv')?.value) || 15;
  const isv      = subtotal * isvPct / 100;
  const total    = subtotal + isv;
  const currency = document.getElementById('inv-currency')?.value || 'HNL';

  document.getElementById('inv-preview-subtotal').textContent = formatMoney(subtotal, currency);
  document.getElementById('inv-preview-isv').textContent      = formatMoney(isv, currency);
  document.getElementById('inv-preview-total').textContent    = formatMoney(total, currency);
}

async function createInvoice() {
  const data = {
    issuerName:     document.getElementById('inv-issuer-name')?.value?.trim(),
    issuerRtn:      document.getElementById('inv-issuer-rtn')?.value?.trim(),
    issuerAddress:  document.getElementById('inv-issuer-address')?.value?.trim(),
    issuerPhone:    document.getElementById('inv-issuer-phone')?.value?.trim() || undefined,
    receiverName:   document.getElementById('inv-receiver-name')?.value?.trim(),
    receiverRtn:    document.getElementById('inv-receiver-rtn')?.value?.trim() || undefined,
    receiverAddress: document.getElementById('inv-receiver-address')?.value?.trim() || undefined,
    cai:            document.getElementById('inv-cai')?.value?.trim(),
    invoiceRange:   document.getElementById('inv-range')?.value?.trim(),
    invoiceNumber:  document.getElementById('inv-number')?.value?.trim(),
    expiresAt:      document.getElementById('inv-expires')?.value,
    currency:       document.getElementById('inv-currency')?.value,
    subtotal:       parseFloat(document.getElementById('inv-subtotal')?.value),
    isvPercent:     parseFloat(document.getElementById('inv-isv')?.value) || 15,
    description:    document.getElementById('inv-description')?.value?.trim(),
  };

  if (!data.issuerName || !data.issuerRtn || !data.issuerAddress ||
      !data.receiverName || !data.cai || !data.invoiceRange ||
      !data.invoiceNumber || !data.expiresAt || !data.subtotal || !data.description) {
    toast('Completá todos los campos requeridos (*).', 'warning');
    return;
  }

  const res = await apiFetch('/invoices', { method: 'POST', body: JSON.stringify(data) });
  toast('Factura emitida correctamente.');
  closeModal('modal-new-invoice');

  // Abrir PDF automáticamente
  if (res?.data?.id) {
    setTimeout(() => window.open(`/api/invoices/${res.data.id}/pdf`, '_blank'), 500);
  }
  renderInvoices();
}

async function sendInvoiceWA(id) {
  const phone = prompt('Número de WhatsApp del receptor (ej: +50499887766):');
  if (!phone) return;
  await apiFetch(`/invoices/${id}/send-whatsapp`, { method: 'POST', body: JSON.stringify({ phone }) });
  toast('Factura enviada por WhatsApp.');
}

async function cancelInvoice(id) {
  const reason = prompt('Motivo de anulación:');
  if (!reason) return;
  await apiFetch(`/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  toast('Factura anulada.');
  renderInvoices();
}



// ── Usuarios ───────────────────────────────────────────────────
const USER_ROLES = {
  ADMIN:  { label: 'Administrador', badge: 'badge-danger',  desc: 'Acceso total al sistema' },
  OWNER:  { label: 'Supervisor',    badge: 'badge-warning', desc: 'Gestión de propiedades y reportes' },
  VIEWER: { label: 'Cobrador',      badge: 'badge-info',    desc: 'Solo registro de pagos y consultas' },
};

async function renderUsers() {
  // Solo ADMIN puede ver esta sección
  if (State.user?.role !== 'ADMIN') {
    document.getElementById('page-content').innerHTML = `
      <div class="alert alert-danger">No tenés permisos para acceder a esta sección.</div>`;
    return;
  }

  const res = await apiFetch('/auth/users');
  const users = res?.data || [];

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Usuarios del Sistema</h2>
        <p>Gestioná los accesos y perfiles de usuario</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-new-user')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nuevo usuario
      </button>
    </div>

    <!-- Cards de perfiles -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
      ${Object.entries(USER_ROLES).map(([role, info]) => {
        const count = users.filter(u => u.role === role).length;
        return `
          <div class="card" style="text-align:center;padding:20px">
            <div style="font-size:2rem;margin-bottom:8px">${role==='ADMIN'?'👑':role==='OWNER'?'📋':'💰'}</div>
            <div style="font-weight:600;font-size:0.95rem">${info.label}</div>
            <div class="text-muted" style="font-size:0.78rem;margin:4px 0 12px">${info.desc}</div>
            <div style="font-family:var(--font-mono);font-size:1.8rem;font-weight:500;color:var(--c-primary)">${count}</div>
            <div class="text-muted">usuario${count !== 1 ? 's' : ''}</div>
          </div>`;
      }).join('')}
    </div>

    <!-- Tabla de usuarios -->
    <div class="card" style="padding:0">
      <div style="padding:16px 20px;border-bottom:1px solid var(--c-border)">
        <strong style="font-size:0.88rem">Todos los usuarios (${users.length})</strong>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Usuario</th><th>Correo</th><th>Teléfono</th><th>Perfil</th><th>Último acceso</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${users.map(u => {
              const roleInfo = USER_ROLES[u.role] || { label: u.role, badge: 'badge-neutral' };
              const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
              return `<tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;border-radius:50%;background:var(--c-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;flex-shrink:0">${initials}</div>
                    <strong>${u.name}</strong>
                  </div>
                </td>
                <td>${u.email}</td>
                <td class="td-mono">${u.phone || '—'}</td>
                <td><span class="badge ${roleInfo.badge}">${roleInfo.label}</span></td>
                <td class="text-muted">${u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}</td>
                <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-neutral'}">${u.isActive ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  ${u.id !== State.user?.id ? `
                    <button class="btn btn-ghost btn-sm" onclick="openEditUser('${u.id}','${u.name}','${u.email}','${u.role}','${u.phone||''}')">Editar</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--c-danger)" onclick="toggleUserStatus('${u.id}',${u.isActive})">
                      ${u.isActive ? 'Desactivar' : 'Activar'}
                    </button>` : '<span class="text-muted">— (vos)</span>'}
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="7"><div class="empty-state" style="padding:30px">No hay usuarios registrados</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal nuevo usuario -->
    <div id="modal-new-user" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Nuevo usuario</span>
          <button class="modal-close" onclick="closeModal('modal-new-user')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre completo <span>*</span></label>
            <input id="nu-name" class="form-control" placeholder="Juan Martínez">
          </div>
          <div class="form-group">
            <label class="form-label">Correo electrónico <span>*</span></label>
            <input id="nu-email" class="form-control" type="email" placeholder="usuario@ejemplo.com">
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña <span>*</span></label>
            <input id="nu-password" class="form-control" type="password" placeholder="Mínimo 8 caracteres">
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="nu-phone" class="form-control" placeholder="+504XXXXXXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Perfil <span>*</span></label>
            <select id="nu-role" class="form-control">
              <option value="ADMIN">👑 Administrador — Acceso total</option>
              <option value="OWNER" selected>📋 Supervisor — Gestión de propiedades y reportes</option>
              <option value="VIEWER">💰 Cobrador — Solo registro de pagos y consultas</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-user')">Cancelar</button>
          <button class="btn btn-primary" onclick="createUser()">Crear usuario</button>
        </div>
      </div>
    </div>

    <!-- Modal editar usuario -->
    <div id="modal-edit-user" class="modal-backdrop" style="display:none">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Editar usuario</span>
          <button class="modal-close" onclick="closeModal('modal-edit-user')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="eu-id">
          <div class="form-group">
            <label class="form-label">Nombre completo</label>
            <input id="eu-name" class="form-control">
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="eu-phone" class="form-control" placeholder="+504XXXXXXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Perfil</label>
            <select id="eu-role" class="form-control">
              <option value="ADMIN">👑 Administrador</option>
              <option value="OWNER">📋 Supervisor</option>
              <option value="VIEWER">💰 Cobrador</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-edit-user')">Cancelar</button>
          <button class="btn btn-primary" onclick="updateUser()">Guardar cambios</button>
        </div>
      </div>
    </div>
  `;
}

async function createUser() {
  const name     = document.getElementById('nu-name')?.value?.trim();
  const email    = document.getElementById('nu-email')?.value?.trim();
  const password = document.getElementById('nu-password')?.value;
  const phone    = document.getElementById('nu-phone')?.value?.trim();
  const role     = document.getElementById('nu-role')?.value;

  if (!name || !email || !password) { toast('Nombre, correo y contraseña son requeridos.', 'warning'); return; }
  if (password.length < 8) { toast('La contraseña debe tener al menos 8 caracteres.', 'warning'); return; }

  await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, phone: phone || undefined, role }),
  });
  toast('Usuario creado correctamente.');
  closeModal('modal-new-user');
  renderUsers();
}

function openEditUser(id, name, email, role, phone) {
  document.getElementById('eu-id').value = id;
  document.getElementById('eu-name').value = name;
  document.getElementById('eu-phone').value = phone;
  document.getElementById('eu-role').value = role;
  openModal('modal-edit-user');
}

async function updateUser() {
  const id    = document.getElementById('eu-id')?.value;
  const name  = document.getElementById('eu-name')?.value?.trim();
  const phone = document.getElementById('eu-phone')?.value?.trim();
  const role  = document.getElementById('eu-role')?.value;

  await apiFetch(`/auth/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, phone: phone || undefined, role }),
  });
  toast('Usuario actualizado.');
  closeModal('modal-edit-user');
  renderUsers();
}

async function toggleUserStatus(id, currentlyActive) {
  const accion = currentlyActive ? 'desactivar' : 'activar';
  if (!confirm(`¿Confirmás que querés ${accion} este usuario?`)) return;
  await apiFetch(`/auth/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ isActive: !currentlyActive }),
  });
  toast(`Usuario ${currentlyActive ? 'desactivado' : 'activado'} correctamente.`);
  renderUsers();
}


// ── Empresas ───────────────────────────────────────────────────
async function renderCompanies() {
  if (State.user?.role !== 'ADMIN') {
    document.getElementById('page-content').innerHTML =
      '<div class="alert alert-danger">Solo los administradores pueden gestionar empresas.</div>';
    return;
  }

  const res = await apiFetch('/companies');
  const companies = res?.data || [];

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Empresas</h2>
        <p>Rentify multiempresa — gestioná todas las organizaciones</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-new-company')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva empresa
      </button>
    </div>

    ${companies.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="13" width="6" height="8"/></svg>
          <h4>Sin empresas registradas</h4>
          <p>Creá la primera empresa para comenzar a operar en modo multiempresa</p>
        </div>
      </div>` : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:24px">
      ${companies.map(c => `
        <div class="card" style="cursor:pointer" onclick="openCompanyDetail('${c.id}')">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:44px;height:44px;border-radius:10px;background:var(--c-primary-lt);color:var(--c-primary);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">🏢</div>
              <div>
                <div style="font-weight:600;font-size:0.95rem">${c.name}</div>
                ${c.rtn ? `<div class="text-muted" style="font-size:0.75rem">RTN: ${c.rtn}</div>` : ''}
              </div>
            </div>
            <span class="badge ${c.isActive ? 'badge-success' : 'badge-neutral'}">${c.isActive ? 'Activa' : 'Inactiva'}</span>
          </div>
          ${c.address ? `<div class="text-muted" style="font-size:0.82rem;margin-bottom:12px">📍 ${c.address}${c.city ? ', ' + c.city : ''}</div>` : ''}
          <div style="display:flex;gap:16px;padding-top:12px;border-top:1px solid var(--c-border)">
            <div style="flex:1;text-align:center">
              <div style="font-family:var(--font-mono);font-size:1.3rem;font-weight:500;color:var(--c-primary)">${c._count?.users || 0}</div>
              <div class="text-muted" style="font-size:0.75rem">Usuarios</div>
            </div>
            <div style="flex:1;text-align:center">
              <div style="font-family:var(--font-mono);font-size:1.3rem;font-weight:500;color:var(--c-accent)">${c._count?.properties || 0}</div>
              <div class="text-muted" style="font-size:0.75rem">Propiedades</div>
            </div>
          </div>
        </div>`).join('')}
    </div>`}

    <!-- Modal nueva empresa -->
    <div id="modal-new-company" class="modal-backdrop" style="display:none">
      <div class="modal modal-lg">
        <div class="modal-header">
          <span class="modal-title">Nueva empresa</span>
          <button class="modal-close" onclick="closeModal('modal-new-company')">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nombre de la empresa <span>*</span></label>
              <input id="nc-name" class="form-control" placeholder="Inmobiliaria Ejemplo S.A.">
            </div>
            <div class="form-group">
              <label class="form-label">RTN</label>
              <input id="nc-rtn" class="form-control" placeholder="08011985123456">
              <div class="form-hint">Registro Tributario Nacional (14 dígitos)</div>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Correo electrónico</label>
              <input id="nc-email" class="form-control" type="email" placeholder="empresa@ejemplo.com">
            </div>
            <div class="form-group">
              <label class="form-label">Teléfono</label>
              <input id="nc-phone" class="form-control" placeholder="+504XXXXXXXX">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Dirección</label>
            <input id="nc-address" class="form-control" placeholder="Col. Palmira, Edificio #10">
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Ciudad</label>
              <input id="nc-city" class="form-control" value="Tegucigalpa">
            </div>
            <div class="form-group">
              <label class="form-label">Departamento</label>
              <input id="nc-dept" class="form-control" value="Francisco Morazán">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea id="nc-notes" class="form-control" rows="2" placeholder="Observaciones internas..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('modal-new-company')">Cancelar</button>
          <button class="btn btn-primary" onclick="createCompany()">Crear empresa</button>
        </div>
      </div>
    </div>
  `;
}

async function createCompany() {
  const name    = document.getElementById('nc-name')?.value?.trim();
  const rtn     = document.getElementById('nc-rtn')?.value?.trim();
  const email   = document.getElementById('nc-email')?.value?.trim();
  const phone   = document.getElementById('nc-phone')?.value?.trim();
  const address = document.getElementById('nc-address')?.value?.trim();
  const city    = document.getElementById('nc-city')?.value?.trim();
  const department = document.getElementById('nc-dept')?.value?.trim();
  const notes   = document.getElementById('nc-notes')?.value?.trim();

  if (!name) { toast('El nombre de la empresa es requerido.', 'warning'); return; }

  await apiFetch('/companies', {
    method: 'POST',
    body: JSON.stringify({ name, rtn: rtn||undefined, email: email||undefined,
      phone: phone||undefined, address: address||undefined, city, department, notes: notes||undefined }),
  });
  toast('Empresa creada correctamente.');
  closeModal('modal-new-company');
  renderCompanies();
}

async function openCompanyDetail(id) {
  const res = await apiFetch(`/companies/${id}`);
  const c = res?.data;
  if (!c) return;

  const usersRes = await apiFetch('/auth/users');
  const allUsers = usersRes?.data || [];
  const unassigned = allUsers.filter(u => !u.companyId || u.companyId === id);

  const existing = document.getElementById('modal-company-detail');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-company-detail';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header">
        <span class="modal-title">🏢 ${c.name}</span>
        <button class="modal-close" onclick="closeModal('modal-company-detail');document.getElementById('modal-company-detail').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;padding:16px;background:var(--c-surface-alt);border-radius:var(--radius-md)">
          ${c.rtn ? `<div><div class="text-muted" style="font-size:0.72rem">RTN</div><div style="font-weight:500">${c.rtn}</div></div>` : ''}
          ${c.email ? `<div><div class="text-muted" style="font-size:0.72rem">Correo</div><div>${c.email}</div></div>` : ''}
          ${c.phone ? `<div><div class="text-muted" style="font-size:0.72rem">Teléfono</div><div class="td-mono">${c.phone}</div></div>` : ''}
          ${c.address ? `<div><div class="text-muted" style="font-size:0.72rem">Dirección</div><div>${c.address}, ${c.city}</div></div>` : ''}
          <div><div class="text-muted" style="font-size:0.72rem">Estado</div><span class="badge ${c.isActive ? 'badge-success' : 'badge-neutral'}">${c.isActive ? 'Activa' : 'Inactiva'}</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <strong style="font-size:0.88rem">Usuarios (${c.users?.length || 0})</strong>
              ${unassigned.length > 0 ? `
              <div style="display:flex;gap:6px;align-items:center">
                <select id="assign-user-select" class="form-control" style="font-size:0.78rem;padding:4px 8px;width:160px">
                  <option value="">Seleccionar...</option>
                  ${unassigned.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                </select>
                <button class="btn btn-primary btn-sm" onclick="assignUserToCompany('${c.id}')">+</button>
              </div>` : ''}
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Perfil</th><th>Estado</th></tr></thead>
                <tbody>
                  ${(c.users||[]).map(u=>`<tr>
                    <td><strong>${u.name}</strong><br><small class="text-muted">${u.email}</small></td>
                    <td>${USER_ROLES[u.role]?.label||u.role}</td>
                    <td><span class="badge ${u.isActive?'badge-success':'badge-neutral'}">${u.isActive?'Activo':'Inactivo'}</span></td>
                  </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--c-text-muted)">Sin usuarios</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style="margin-bottom:10px"><strong style="font-size:0.88rem">Propiedades (${c.properties?.length || 0})</strong></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Ciudad</th><th>Unidades</th></tr></thead>
                <tbody>
                  ${(c.properties||[]).map(p=>`<tr>
                    <td><strong>${p.name}</strong></td>
                    <td class="text-muted">${p.city||'—'}</td>
                    <td class="td-mono">${p._count?.units||0}</td>
                  </tr>`).join('')||'<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--c-text-muted)">Sin propiedades</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" style="color:var(--c-danger)" onclick="toggleCompanyStatus('${c.id}',${c.isActive})">
          ${c.isActive ? 'Desactivar' : 'Activar'}
        </button>
        <button class="btn btn-ghost" onclick="closeModal('modal-company-detail');document.getElementById('modal-company-detail').remove()">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-company-detail');
}

async function assignUserToCompany(companyId) {
  const userId = document.getElementById('assign-user-select')?.value;
  if (!userId) { toast('Seleccioná un usuario.', 'warning'); return; }
  await apiFetch(`/companies/${companyId}/assign-user`, {
    method: 'PUT', body: JSON.stringify({ userId }),
  });
  toast('Usuario asignado correctamente.');
  closeModal('modal-company-detail');
  document.getElementById('modal-company-detail')?.remove();
  openCompanyDetail(companyId);
}

async function toggleCompanyStatus(id, currentlyActive) {
  if (!confirm(`¿Confirmás que querés ${currentlyActive?'desactivar':'activar'} esta empresa?`)) return;
  await apiFetch(`/companies/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !currentlyActive }) });
  toast(`Empresa ${currentlyActive?'desactivada':'activada'}.`);
  closeModal('modal-company-detail');
  document.getElementById('modal-company-detail')?.remove();
  renderCompanies();
}

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
          <div class="sidebar-section-label">Administración</div>
          <button class="nav-item" data-page="companies" onclick="navigate('companies')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="13" width="6" height="8"/></svg>
            Empresas
          </button>
          <button class="nav-item" data-page="users" onclick="navigate('users')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
            Usuarios
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
          <button class="nav-item" data-page="debit-notes" onclick="navigate('debit-notes')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Notas de Débito
          </button>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-label">Finanzas</div>
          <button class="nav-item" data-page="notifications" onclick="navigate('notifications')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Notificaciones
          </button>
          <button class="nav-item" data-page="invoices" onclick="navigate('invoices')">
            <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Facturas SAR
          </button>
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
          <div class="login-feat"><div class="login-feat-icon">📨</div><span>Notificaciones automáticas por Telegram Bot (gratis, sin límites)</span></div>
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
  // Eliminar modal anterior si existe
  const existing = document.getElementById('modal-add-unit');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-add-unit';
  modal.className = 'modal-backdrop';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Agregar unidad</span>
        <button class="modal-close" onclick="closeModal('modal-add-unit');document.getElementById('modal-add-unit').remove()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Número / Nombre de la unidad <span>*</span></label>
          <input id="unit-number" class="form-control" placeholder="Ej: Apto 1A, Local 3, Oficina 201">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Piso</label>
            <input id="unit-floor" class="form-control" type="number" min="0" placeholder="1">
          </div>
          <div class="form-group">
            <label class="form-label">Habitaciones</label>
            <input id="unit-bedrooms" class="form-control" type="number" min="0" value="1">
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Baños</label>
            <input id="unit-bathrooms" class="form-control" type="number" min="0" value="1">
          </div>
          <div class="form-group">
            <label class="form-label">Metros cuadrados</label>
            <input id="unit-sqm" class="form-control" type="number" min="0" step="0.1" placeholder="65.5">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <textarea id="unit-desc" class="form-control" rows="2" placeholder="Características adicionales..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('modal-add-unit');document.getElementById('modal-add-unit').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="submitAddUnit('${propertyId}')">Agregar unidad</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  openModal('modal-add-unit');
  // Foco automático
  setTimeout(() => document.getElementById('unit-number')?.focus(), 250);
}

async function submitAddUnit(propertyId) {
  const number    = document.getElementById('unit-number')?.value?.trim();
  const floor     = document.getElementById('unit-floor')?.value;
  const bedrooms  = parseInt(document.getElementById('unit-bedrooms')?.value || '1');
  const bathrooms = parseInt(document.getElementById('unit-bathrooms')?.value || '1');
  const sqm       = document.getElementById('unit-sqm')?.value;
  const desc      = document.getElementById('unit-desc')?.value?.trim();

  if (!number) { toast('El número o nombre de la unidad es requerido.', 'warning'); return; }

  await apiFetch(`/properties/${propertyId}/units`, {
    method: 'POST',
    body: JSON.stringify({
      number,
      floor:        floor ? parseInt(floor) : undefined,
      bedrooms,
      bathrooms,
      squareMeters: sqm ? parseFloat(sqm) : undefined,
      description:  desc || undefined,
    }),
  });

  toast('✅ Unidad agregada correctamente.');
  closeModal('modal-add-unit');
  document.getElementById('modal-add-unit')?.remove();

  // Cerrar el modal de detalle y reabrirlo con los datos actualizados
  closeModal('modal-property-detail');
  document.getElementById('modal-property-detail')?.remove();
  setTimeout(() => openPropertyDetail(propertyId), 300);
}

// ── Inicialización ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', renderApp);
