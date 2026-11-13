/**
 * app.js — Application Controller & View Orchestrator
 * ---------------------------------------------------------------------------
 * Coordinates navigation, modals, event delegation, Lucide icon hydration,
 * and reactive view synchronization across Dashboard, Add Transaction,
 * History, Analytics, and Budget modules.
 */

import {
  ensureInitialized,
  getTransactions,
  addTransaction,
  updateTransaction,
  resetDemoData,
  getTodayDateString,
} from './storage.js';
import {
  initTransactionsModule,
  renderAddTransactionSnapshot,
  renderHistoryView,
  populateCategorySelect,
  validateTransactionInput,
  removeTransactionById,
  exportTransactionsToCsv,
  formatCurrency,
  escapeHtml,
} from './transactions.js';
import { initDashboardModule, renderDashboard } from './dashboard.js';
import { initAnalyticsModule, renderAnalytics } from './analytics.js';
import { initBudgetModule, renderBudgetView } from './budget.js';

const VIEW_META = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Financial overview and monthly spending summary',
  },
  'add-transaction': {
    title: 'Add Transaction',
    subtitle: 'Record new income or expense entries',
  },
  history: {
    title: 'Transaction History',
    subtitle: 'Search, filter, sort, and manage all records',
  },
  analytics: {
    title: 'Expense Analytics',
    subtitle: 'Category spending distribution and savings trends',
  },
  budget: {
    title: 'Budget Management',
    subtitle: 'Monthly spending limits and threshold alerts',
  },
};

let currentView = 'dashboard';
let pendingConfirmAction = null;

/**
 * Safely renders Lucide icons whenever dynamic DOM updates occur.
 */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Displays a concise non-blocking toast notification.
 * @param {string} message
 * @param {boolean} [isError=false]
 */
function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <i data-lucide="${isError ? 'alert-circle' : 'check-circle-2'}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

/**
 * Re-renders all data-driven views so every screen stays synchronized.
 */
function renderAllViews() {
  renderDashboard({ onNavigate: navigateTo, refreshIcons });
  renderAddTransactionSnapshot();
  renderHistoryView();
  renderAnalytics();
  renderBudgetView();
  refreshIcons();
}

/**
 * Switches the active application view.
 * @param {string} viewKey
 */
function navigateTo(viewKey) {
  if (!VIEW_META[viewKey]) viewKey = 'dashboard';
  currentView = viewKey;

  // Update sidebar active state
  document.querySelectorAll('.nav-item[data-nav]').forEach((btn) => {
    const isActive = btn.dataset.nav === viewKey;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  // Update view sections
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${viewKey}`);
  });

  // Update topbar title & subtitle
  const titleEl = document.getElementById('topbar-title');
  const subtitleEl = document.getElementById('topbar-subtitle');
  if (titleEl) titleEl.textContent = VIEW_META[viewKey].title;
  if (subtitleEl) subtitleEl.textContent = VIEW_META[viewKey].subtitle;

  closeMobileSidebar();

  // Re-render target view to ensure Chart.js canvas sizes cleanly when visible
  if (viewKey === 'dashboard') {
    renderDashboard({ onNavigate: navigateTo, refreshIcons });
  } else if (viewKey === 'add-transaction') {
    renderAddTransactionSnapshot();
  } else if (viewKey === 'history') {
    renderHistoryView();
  } else if (viewKey === 'analytics') {
    renderAnalytics();
  } else if (viewKey === 'budget') {
    renderBudgetView();
  }

  refreshIcons();
}

/* ==========================================================================
   Mobile Sidebar Drawer
   ========================================================================== */

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const openBtn = document.getElementById('sidebar-open-btn');
  if (sidebar) sidebar.classList.add('is-open');
  if (backdrop) backdrop.classList.add('is-open');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const openBtn = document.getElementById('sidebar-open-btn');
  if (sidebar) sidebar.classList.remove('is-open');
  if (backdrop) backdrop.classList.remove('is-open');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
}

/* ==========================================================================
   Add / Edit Transaction Modal
   ========================================================================== */

function clearModalErrors() {
  ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
    const errEl = document.getElementById(`modal-${field}-error`);
    const inputEl = document.getElementById(`modal-${field}-input`);
    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('is-invalid');
  });
}

function setModalType(nextType, selectedCategory = '') {
  const modalTypeInput = document.getElementById('modal-type');
  const modalCategorySelect = document.getElementById('modal-category-input');
  if (modalTypeInput) modalTypeInput.value = nextType;

  document.querySelectorAll('[data-modal-type-btn]').forEach((btn) => {
    const active = btn.dataset.modalTypeBtn === nextType;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  populateCategorySelect(modalCategorySelect, nextType, selectedCategory);
}

function openTransactionModal(existingTxn = null) {
  const modal = document.getElementById('transaction-modal');
  const modalTitle = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit-btn');
  const editIdInput = document.getElementById('modal-edit-id');
  const titleInput = document.getElementById('modal-title-input');
  const amountInput = document.getElementById('modal-amount-input');
  const dateInput = document.getElementById('modal-date-input');
  const descInput = document.getElementById('modal-description-input');

  clearModalErrors();

  if (existingTxn) {
    if (modalTitle) modalTitle.textContent = 'Edit Transaction';
    if (submitBtn) submitBtn.textContent = 'Update Transaction';
    if (editIdInput) editIdInput.value = existingTxn.id;
    setModalType(existingTxn.type, existingTxn.category);
    if (titleInput) titleInput.value = existingTxn.title;
    if (amountInput) amountInput.value = String(existingTxn.amount);
    if (dateInput) dateInput.value = existingTxn.date;
    if (descInput) descInput.value = existingTxn.description || '';
  } else {
    if (modalTitle) modalTitle.textContent = 'Add Transaction';
    if (submitBtn) submitBtn.textContent = 'Save Transaction';
    if (editIdInput) editIdInput.value = '';
    setModalType('expense');
    if (titleInput) titleInput.value = '';
    if (amountInput) amountInput.value = '';
    if (dateInput) dateInput.value = getTodayDateString();
    if (descInput) descInput.value = '';
  }

  if (modal) modal.classList.remove('hidden');
  if (titleInput) titleInput.focus();
}

function closeTransactionModal() {
  const modal = document.getElementById('transaction-modal');
  if (modal) modal.classList.add('hidden');
}

/* ==========================================================================
   Confirmation Modal (Delete / Reset)
   ========================================================================== */

function openConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const okBtn = document.getElementById('confirm-ok-btn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (okBtn) okBtn.textContent = confirmLabel;
  pendingConfirmAction = onConfirm;

  if (modal) modal.classList.remove('hidden');
  if (okBtn) okBtn.focus();
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.classList.add('hidden');
  pendingConfirmAction = null;
}

/* ==========================================================================
   Bootstrap Application
   ========================================================================== */

function initApp() {
  ensureInitialized();

  // Initialize feature modules
  initTransactionsModule({
    onDataChanged: renderAllViews,
    onOpenEditModal: (txn) => openTransactionModal(txn),
    onRequestDelete: (id) => handleDeleteRequest(id),
    showToast,
    refreshIcons,
  });

  initDashboardModule({
    onNavigate: navigateTo,
    refreshIcons,
  });

  initAnalyticsModule();

  initBudgetModule({
    onDataChanged: renderAllViews,
    showToast,
    refreshIcons,
  });

  // Sidebar navigation listeners
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav);
    });
  });

  // Mobile sidebar toggles
  const openSidebarBtn = document.getElementById('sidebar-open-btn');
  const closeSidebarBtn = document.getElementById('sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (openSidebarBtn) openSidebarBtn.addEventListener('click', openMobileSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
  if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);

  // Quick Add Buttons
  const quickAddBtn = document.getElementById('quick-add-btn');
  const historyAddBtn = document.getElementById('history-add-btn');
  if (quickAddBtn) quickAddBtn.addEventListener('click', () => openTransactionModal(null));
  if (historyAddBtn) historyAddBtn.addEventListener('click', () => openTransactionModal(null));

  // Sidebar utility actions
  const exportCsvSidebarBtn = document.getElementById('export-csv-sidebar-btn');
  if (exportCsvSidebarBtn) {
    exportCsvSidebarBtn.addEventListener('click', () => exportTransactionsToCsv(showToast));
  }

  const resetSampleBtn = document.getElementById('reset-sample-btn');
  if (resetSampleBtn) {
    resetSampleBtn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Reset Demo Data',
        message:
          'This will replace your current transactions and budget settings with the initial sample dataset. Continue?',
        confirmLabel: 'Reset Data',
        onConfirm: () => {
          resetDemoData();
          renderAllViews();
          showToast('Demo data restored.');
        },
      });
    });
  }

  // Modal Transaction Form Events
  document.querySelectorAll('[data-modal-type-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setModalType(btn.dataset.modalTypeBtn);
    });
  });

  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const txnModalOverlay = document.getElementById('transaction-modal');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeTransactionModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeTransactionModal);
  if (txnModalOverlay) {
    txnModalOverlay.addEventListener('click', (e) => {
      if (e.target === txnModalOverlay) closeTransactionModal();
    });
  }

  const modalForm = document.getElementById('modal-transaction-form');
  if (modalForm) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearModalErrors();

      const editId = document.getElementById('modal-edit-id').value;
      const payload = {
        type: document.getElementById('modal-type').value,
        title: document.getElementById('modal-title-input').value,
        amount: document.getElementById('modal-amount-input').value,
        category: document.getElementById('modal-category-input').value,
        date: document.getElementById('modal-date-input').value,
        description: document.getElementById('modal-description-input').value,
      };

      const { valid, errors, sanitized } = validateTransactionInput(payload);
      if (!valid) {
        Object.entries(errors).forEach(([field, msg]) => {
          const errEl = document.getElementById(`modal-${field}-error`);
          const inputEl = document.getElementById(`modal-${field}-input`);
          if (errEl) errEl.textContent = msg;
          if (inputEl) inputEl.classList.add('is-invalid');
        });
        return;
      }

      if (editId) {
        updateTransaction(editId, sanitized);
        showToast(`Updated "${sanitized.title}".`);
      } else {
        addTransaction(sanitized);
        showToast(`Added "${sanitized.title}".`);
      }

      closeTransactionModal();
      renderAllViews();
    });
  }

  // Confirm Modal Events
  const confirmCloseBtn = document.getElementById('confirm-close-btn');
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  const confirmOkBtn = document.getElementById('confirm-ok-btn');
  const confirmOverlay = document.getElementById('confirm-modal');

  if (confirmCloseBtn) confirmCloseBtn.addEventListener('click', closeConfirmModal);
  if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', closeConfirmModal);
  if (confirmOverlay) {
    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) closeConfirmModal();
    });
  }
  if (confirmOkBtn) {
    confirmOkBtn.addEventListener('click', () => {
      if (typeof pendingConfirmAction === 'function') {
        pendingConfirmAction();
      }
      closeConfirmModal();
    });
  }

  // Global Event Delegation for Edit / Delete / Empty-state Add actions
  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;

    if (action === 'edit-txn' && id) {
      const txn = getTransactions().find((t) => t.id === id);
      if (txn) openTransactionModal(txn);
    } else if (action === 'delete-txn' && id) {
      handleDeleteRequest(id);
    } else if (action === 'open-add-modal') {
      openTransactionModal(null);
    }
  });

  // Escape key closes open modals or mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTransactionModal();
      closeConfirmModal();
      closeMobileSidebar();
    }
  });

  // Initial Render
  renderAllViews();
  navigateTo(currentView);
}

function handleDeleteRequest(id) {
  const txn = getTransactions().find((t) => t.id === id);
  if (!txn) return;

  openConfirmModal({
    title: 'Delete Transaction',
    message: `Delete "${txn.title}" (${formatCurrency(txn.amount)})? This action cannot be undone.`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      const removed = removeTransactionById(id);
      if (removed) {
        renderAllViews();
        showToast(`Deleted "${txn.title}".`);
      }
    },
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
