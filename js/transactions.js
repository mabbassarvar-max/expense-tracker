/**
 * transactions.js — Transaction Domain Logic, Pure Calculations & History UI
 * ---------------------------------------------------------------------------
 * Keeps financial calculations independent of storage so the UI and future
 * backend API layers share deterministic, testable business logic.
 */

import {
  getTransactions,
  addTransaction,
  deleteTransaction,
  getTodayDateString,
  getCurrentMonthKey,
} from './storage.js';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transportation',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gift',
  'Refund',
  'Other',
];

export const CATEGORY_COLORS = {
  Food: '#0F766E',
  Housing: '#1D4ED8',
  Transportation: '#0284C7',
  Utilities: '#D97706',
  Healthcare: '#DC2626',
  Entertainment: '#7C3AED',
  Shopping: '#DB2777',
  Education: '#059669',
  Salary: '#16A34A',
  Freelance: '#0D9488',
  Investments: '#2563EB',
  Gift: '#9333EA',
  Refund: '#CA8A04',
  Other: '#64748B',
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a numeric value as USD currency.
 * @param {number} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const num = Number(value) || 0;
  return CURRENCY_FORMATTER.format(num);
}

/**
 * Formats YYYY-MM-DD into readable short date (e.g., Nov 13, 2026).
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats YYYY-MM into readable month label (e.g., November 2026).
 * @param {string} monthKey
 * @param {boolean} [short]
 * @returns {string}
 */
export function formatMonthLabel(monthKey, short = false) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '—';
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric',
  });
}

/**
 * Escapes HTML special characters to prevent XSS in dynamic templates.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   Pure Financial Calculations (Independent of Storage)
   ========================================================================== */

/**
 * Computes dynamic totals across any list of transactions.
 * Total Balance = Total Income - Total Expenses.
 * @param {Array<Object>} transactions
 */
export function calculateTotals(transactions) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const txn of transactions) {
    const amount = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      totalIncome += amount;
      incomeCount += 1;
    } else {
      totalExpenses += amount;
      expenseCount += 1;
    }
  }

  const totalBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (totalBalance / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpenses,
    totalBalance,
    totalSavings: totalBalance,
    savingsRate,
    incomeCount,
    expenseCount,
    totalCount: transactions.length,
  };
}

/**
 * Filters transactions matching a specific YYYY-MM month key.
 * @param {Array<Object>} transactions
 * @param {string} monthKey
 * @returns {Array<Object>}
 */
export function getMonthlyTransactions(transactions, monthKey) {
  return transactions.filter((txn) => typeof txn.date === 'string' && txn.date.startsWith(monthKey));
}

/**
 * Computes category-wise totals and percentage distribution.
 * @param {Array<Object>} transactions
 * @param {'expense'|'income'|'all'} [type='expense']
 * @returns {Array<{ category: string, amount: number, count: number, percentage: number, color: string }>}
 */
export function calculateCategoryBreakdown(transactions, type = 'expense') {
  const filtered = type === 'all' ? transactions : transactions.filter((t) => t.type === type);
  const map = new Map();
  let grandTotal = 0;

  for (const txn of filtered) {
    const amount = Number(txn.amount) || 0;
    grandTotal += amount;
    const prev = map.get(txn.category) || { category: txn.category, amount: 0, count: 0 };
    prev.amount += amount;
    prev.count += 1;
    map.set(txn.category, prev);
  }

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      percentage: grandTotal > 0 ? (item.amount / grandTotal) * 100 : 0,
      color: CATEGORY_COLORS[item.category] || '#64748B',
    }));
}

/**
 * Computes chronological monthly income & expenses trend.
 * @param {Array<Object>} transactions
 * @param {number|null} [limitMonths=6] Pass null for all months present
 * @returns {Array<{ monthKey: string, label: string, income: number, expenses: number, savings: number }>}
 */
export function calculateMonthlyTrend(transactions, limitMonths = 6) {
  const monthMap = new Map();

  for (const txn of transactions) {
    if (!txn.date || txn.date.length < 7) continue;
    const monthKey = txn.date.slice(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        monthKey,
        label: formatMonthLabel(monthKey, true),
        income: 0,
        expenses: 0,
        savings: 0,
      });
    }
    const entry = monthMap.get(monthKey);
    const amt = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      entry.income += amt;
    } else {
      entry.expenses += amt;
    }
    entry.savings = entry.income - entry.expenses;
  }

  // Ensure current month exists when there are transactions or limitMonths is set
  const sortedKeys = Array.from(monthMap.keys()).sort();
  if (limitMonths && sortedKeys.length > limitMonths) {
    const slicedKeys = sortedKeys.slice(-limitMonths);
    return slicedKeys.map((k) => monthMap.get(k));
  }
  return sortedKeys.map((k) => monthMap.get(k));
}

/**
 * Extracts distinct sorted month keys (newest first) from transactions.
 * @param {Array<Object>} transactions
 * @returns {Array<string>}
 */
export function getAvailableMonths(transactions) {
  const set = new Set();
  for (const txn of transactions) {
    if (txn.date && /^\d{4}-\d{2}/.test(txn.date)) {
      set.add(txn.date.slice(0, 7));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Filters and sorts transactions according to active filter state.
 * @param {Array<Object>} transactions
 * @param {Object} filters
 */
export function filterAndSortTransactions(transactions, filters = {}) {
  const {
    search = '',
    type = 'all',
    category = 'all',
    month = 'all',
    sortBy = 'date-desc',
  } = filters;

  const query = search.trim().toLowerCase();

  const filtered = transactions.filter((txn) => {
    if (type !== 'all' && txn.type !== type) return false;
    if (category !== 'all' && txn.category !== category) return false;
    if (month !== 'all' && (!txn.date || !txn.date.startsWith(month))) return false;
    if (query) {
      const haystack = `${txn.title} ${txn.category} ${txn.description} ${txn.amount}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
      case 'amount-desc':
        return b.amount - a.amount || b.date.localeCompare(a.date);
      case 'amount-asc':
        return a.amount - b.amount || b.date.localeCompare(a.date);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    }
  });
}

/* ==========================================================================
   Form Validation & Category Population
   ========================================================================== */

/**
 * Validates transaction form input.
 * @param {Object} input
 * @returns {{ valid: boolean, errors: Record<string, string>, sanitized: Object }}
 */
export function validateTransactionInput(input) {
  const errors = {};
  const type = input.type === 'income' ? 'income' : 'expense';
  const title = String(input.title || '').trim();
  const amount = Number(input.amount);
  const category = String(input.category || '').trim();
  const date = String(input.date || '').trim();
  const description = String(input.description || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  }

  const allowedCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!category || !allowedCategories.includes(category)) {
    errors.category = 'Please select a valid category.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  }

  if (description.length > 240) {
    errors.description = 'Description must be 240 characters or less.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      title,
      amount: Math.round(amount * 100) / 100,
      category,
      type,
      date,
      description,
    },
  };
}

/**
 * Populates a <select> element with categories matching the transaction type.
 * @param {HTMLSelectElement} selectEl
 * @param {'expense'|'income'} type
 * @param {string} [selectedValue]
 */
export function populateCategorySelect(selectEl, type, selectedValue = '') {
  if (!selectEl) return;
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  selectEl.innerHTML = categories
    .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join('');

  if (selectedValue && categories.includes(selectedValue)) {
    selectEl.value = selectedValue;
  } else {
    selectEl.value = categories[0];
  }
}

/* ==========================================================================
   Shared Transaction Table Renderer
   ========================================================================== */

/**
 * Renders a responsive transaction table into a container element.
 * @param {HTMLElement} container
 * @param {Array<Object>} transactions
 * @param {{ emptyTitle?: string, emptyDescription?: string, showEmptyCta?: boolean }} [options]
 */
export function renderTransactionTable(container, transactions, options = {}) {
  if (!container) return;

  if (!transactions.length) {
    const emptyTitle = options.emptyTitle || 'No transactions found';
    const emptyDescription =
      options.emptyDescription || 'Add an income or expense entry to start tracking your finances.';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="inbox"></i></div>
        <h3 class="empty-state-title">${escapeHtml(emptyTitle)}</h3>
        <p class="empty-state-desc">${escapeHtml(emptyDescription)}</p>
        ${
          options.showEmptyCta !== false
            ? `<button type="button" class="btn btn-primary btn-sm" data-action="open-add-modal">
                 <i data-lucide="plus"></i>
                 <span>Add Transaction</span>
               </button>`
            : ''
        }
      </div>
    `;
    return;
  }

  const rowsHtml = transactions
    .map((txn) => {
      const isIncome = txn.type === 'income';
      const sign = isIncome ? '+' : '-';
      const amountClass = isIncome ? 'text-income' : '';
      const typeLabel = isIncome ? 'Income' : 'Expense';
      const typeClass = isIncome ? 'type-income' : 'type-expense';

      return `
        <tr data-txn-id="${escapeHtml(txn.id)}">
          <td data-label="Date" class="mono txn-meta-text">${escapeHtml(formatDate(txn.date))}</td>
          <td class="no-label-cell">
            <div class="txn-title-cell">
              <span class="txn-title">${escapeHtml(txn.title)}</span>
              ${
                txn.description
                  ? `<span class="txn-desc" title="${escapeHtml(txn.description)}">${escapeHtml(txn.description)}</span>`
                  : ''
              }
            </div>
          </td>
          <td data-label="Category" class="txn-meta-text">${escapeHtml(txn.category)}</td>
          <td data-label="Type"><span class="type-label ${typeClass}">${typeLabel}</span></td>
          <td data-label="Amount" class="align-right mono amount-cell ${amountClass}">
            ${sign}${escapeHtml(formatCurrency(txn.amount))}
          </td>
          <td data-label="Actions" class="align-right">
            <div class="row-actions">
              <button
                type="button"
                class="icon-btn"
                data-action="edit-txn"
                data-id="${escapeHtml(txn.id)}"
                aria-label="Edit ${escapeHtml(txn.title)}"
                title="Edit transaction"
              >
                <i data-lucide="pencil"></i>
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-danger"
                data-action="delete-txn"
                data-id="${escapeHtml(txn.id)}"
                aria-label="Delete ${escapeHtml(txn.title)}"
                title="Delete transaction"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Transaction</th>
            <th>Category</th>
            <th>Type</th>
            <th class="align-right">Amount</th>
            <th class="align-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/* ==========================================================================
   Inline Add Transaction View & History View State Controllers
   ========================================================================== */

const historyFilterState = {
  search: '',
  type: 'all',
  category: 'all',
  month: 'all',
  sortBy: 'date-desc',
};

let transactionsModuleInitialized = false;

/**
 * Sets up event listeners for the dedicated Add Transaction view and History filters.
 * @param {{ onDataChanged: Function, onOpenEditModal: Function, onRequestDelete: Function, showToast: Function }} callbacks
 */
export function initTransactionsModule(callbacks) {
  if (transactionsModuleInitialized) return;
  transactionsModuleInitialized = true;

  // --- Inline Add Transaction Form ---
  const inlineForm = document.getElementById('inline-transaction-form');
  const inlineTypeInput = document.getElementById('inline-type');
  const inlineCategorySelect = document.getElementById('inline-category');
  const inlineDateInput = document.getElementById('inline-date');
  const inlineResetBtn = document.getElementById('inline-reset-btn');
  const typeButtons = document.querySelectorAll('[data-type-btn]');

  const setInlineType = (nextType) => {
    inlineTypeInput.value = nextType;
    typeButtons.forEach((btn) => {
      const active = btn.dataset.typeBtn === nextType;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    populateCategorySelect(inlineCategorySelect, nextType);
  };

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setInlineType(btn.dataset.typeBtn);
    });
  });

  if (inlineDateInput && !inlineDateInput.value) {
    inlineDateInput.value = getTodayDateString();
  }
  populateCategorySelect(inlineCategorySelect, inlineTypeInput?.value || 'expense');

  const clearInlineErrors = () => {
    ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
      const errEl = document.getElementById(`inline-${field}-error`);
      const inputEl = document.getElementById(`inline-${field}`);
      if (errEl) errEl.textContent = '';
      if (inputEl) inputEl.classList.remove('is-invalid');
    });
  };

  const resetInlineForm = () => {
    if (!inlineForm) return;
    inlineForm.reset();
    clearInlineErrors();
    setInlineType('expense');
    if (inlineDateInput) inlineDateInput.value = getTodayDateString();
  };

  if (inlineResetBtn) {
    inlineResetBtn.addEventListener('click', resetInlineForm);
  }

  if (inlineForm) {
    inlineForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearInlineErrors();

      const payload = {
        type: inlineTypeInput.value,
        title: document.getElementById('inline-title').value,
        amount: document.getElementById('inline-amount').value,
        category: inlineCategorySelect.value,
        date: inlineDateInput.value,
        description: document.getElementById('inline-description').value,
      };

      const { valid, errors, sanitized } = validateTransactionInput(payload);
      if (!valid) {
        Object.entries(errors).forEach(([field, msg]) => {
          const errEl = document.getElementById(`inline-${field}-error`);
          const inputEl = document.getElementById(`inline-${field}`);
          if (errEl) errEl.textContent = msg;
          if (inputEl) inputEl.classList.add('is-invalid');
        });
        return;
      }

      addTransaction(sanitized);
      resetInlineForm();
      callbacks.showToast(
        `${sanitized.type === 'income' ? 'Income' : 'Expense'} "${sanitized.title}" saved.`
      );
      callbacks.onDataChanged();
    });
  }

  // --- Transaction History Filters ---
  const searchEl = document.getElementById('history-search');
  const typeEl = document.getElementById('history-type');
  const categoryEl = document.getElementById('history-category');
  const monthEl = document.getElementById('history-month');
  const sortEl = document.getElementById('history-sort');
  const clearBtn = document.getElementById('history-clear-filters');
  const exportBtn = document.getElementById('history-export-btn');

  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      historyFilterState.search = e.target.value;
      renderHistoryView();
      callbacks.refreshIcons();
    });
  }

  if (typeEl) {
    typeEl.addEventListener('change', (e) => {
      historyFilterState.type = e.target.value;
      renderHistoryView();
      callbacks.refreshIcons();
    });
  }

  if (categoryEl) {
    categoryEl.addEventListener('change', (e) => {
      historyFilterState.category = e.target.value;
      renderHistoryView();
      callbacks.refreshIcons();
    });
  }

  if (monthEl) {
    monthEl.addEventListener('change', (e) => {
      historyFilterState.month = e.target.value;
      renderHistoryView();
      callbacks.refreshIcons();
    });
  }

  if (sortEl) {
    sortEl.addEventListener('change', (e) => {
      historyFilterState.sortBy = e.target.value;
      renderHistoryView();
      callbacks.refreshIcons();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      historyFilterState.search = '';
      historyFilterState.type = 'all';
      historyFilterState.category = 'all';
      historyFilterState.month = 'all';
      historyFilterState.sortBy = 'date-desc';
      if (searchEl) searchEl.value = '';
      if (typeEl) typeEl.value = 'all';
      if (categoryEl) categoryEl.value = 'all';
      if (monthEl) monthEl.value = 'all';
      if (sortEl) sortEl.value = 'date-desc';
      renderHistoryView();
      callbacks.refreshIcons();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportTransactionsToCsv(callbacks.showToast);
    });
  }
}

/**
 * Renders the right-hand Ledger Snapshot panel on the Add Transaction view.
 */
export function renderAddTransactionSnapshot() {
  const statsContainer = document.getElementById('manage-snapshot-stats');
  const recentList = document.getElementById('manage-recent-list');
  if (!statsContainer || !recentList) return;

  const all = getTransactions();
  const currentMonth = getCurrentMonthKey();
  const monthlyTxns = getMonthlyTransactions(all, currentMonth);
  const monthlyTotals = calculateTotals(monthlyTxns);
  const allTotals = calculateTotals(all);

  statsContainer.innerHTML = `
    <div class="snapshot-stat-box">
      <span class="snapshot-stat-label">Total Balance</span>
      <span class="snapshot-stat-value mono ${allTotals.totalBalance >= 0 ? 'text-income' : 'text-expense'}">
        ${escapeHtml(formatCurrency(allTotals.totalBalance))}
      </span>
    </div>
    <div class="snapshot-stat-box">
      <span class="snapshot-stat-label">${escapeHtml(formatMonthLabel(currentMonth, true))} Spend</span>
      <span class="snapshot-stat-value mono">${escapeHtml(formatCurrency(monthlyTotals.totalExpenses))}</span>
    </div>
  `;

  const recent = filterAndSortTransactions(all, { sortBy: 'date-desc' }).slice(0, 5);
  if (!recent.length) {
    recentList.innerHTML = `<li class="compact-txn-sub">No transactions recorded yet.</li>`;
    return;
  }

  recentList.innerHTML = recent
    .map((txn) => {
      const isIncome = txn.type === 'income';
      return `
        <li class="compact-txn-item">
          <div class="compact-txn-meta">
            <span class="compact-txn-title">${escapeHtml(txn.title)}</span>
            <span class="compact-txn-sub">${escapeHtml(txn.category)} · ${escapeHtml(formatDate(txn.date))}</span>
          </div>
          <span class="mono amount-cell ${isIncome ? 'text-income' : ''}">
            ${isIncome ? '+' : '-'}${escapeHtml(formatCurrency(txn.amount))}
          </span>
        </li>
      `;
    })
    .join('');
}

/**
 * Renders the Transaction History view with live search, filter, sort, and summary strip.
 */
export function renderHistoryView() {
  const allTransactions = getTransactions();
  const categorySelect = document.getElementById('history-category');
  const monthSelect = document.getElementById('history-month');
  const countLabel = document.getElementById('history-count-label');
  const summaryStrip = document.getElementById('history-summary-strip');
  const tableContainer = document.getElementById('history-table-container');
  const clearBtn = document.getElementById('history-clear-filters');

  // Sync dynamic category dropdown options
  if (categorySelect) {
    const categoriesInUse = Array.from(
      new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...allTransactions.map((t) => t.category)])
    ).sort();
    const prevVal = historyFilterState.category;
    categorySelect.innerHTML =
      `<option value="all">All Categories</option>` +
      categoriesInUse
        .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
        .join('');
    categorySelect.value = categoriesInUse.includes(prevVal) ? prevVal : 'all';
    historyFilterState.category = categorySelect.value;
  }

  // Sync dynamic month dropdown options
  if (monthSelect) {
    const months = getAvailableMonths(allTransactions);
    const prevMonth = historyFilterState.month;
    monthSelect.innerHTML =
      `<option value="all">All Months</option>` +
      months
        .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(formatMonthLabel(m))}</option>`)
        .join('');
    monthSelect.value = months.includes(prevMonth) ? prevMonth : 'all';
    historyFilterState.month = monthSelect.value;
  }

  const filtered = filterAndSortTransactions(allTransactions, historyFilterState);
  const totals = calculateTotals(filtered);

  const hasActiveFilters =
    historyFilterState.search.trim() !== '' ||
    historyFilterState.type !== 'all' ||
    historyFilterState.category !== 'all' ||
    historyFilterState.month !== 'all' ||
    historyFilterState.sortBy !== 'date-desc';

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !hasActiveFilters);
  }

  if (countLabel) {
    countLabel.textContent =
      filtered.length === allTransactions.length
        ? `${allTransactions.length} ${allTransactions.length === 1 ? 'transaction' : 'transactions'}`
        : `Showing ${filtered.length} of ${allTransactions.length} transactions`;
  }

  if (summaryStrip) {
    summaryStrip.innerHTML = `
      <span class="summary-strip-item">
        Filtered Income: <strong class="mono text-income">${escapeHtml(formatCurrency(totals.totalIncome))}</strong>
      </span>
      <span class="summary-strip-item">
        Filtered Expenses: <strong class="mono">${escapeHtml(formatCurrency(totals.totalExpenses))}</strong>
      </span>
      <span class="summary-strip-item">
        Net Total: <strong class="mono ${totals.totalBalance >= 0 ? 'text-income' : 'text-expense'}">${escapeHtml(formatCurrency(totals.totalBalance))}</strong>
      </span>
    `;
  }

  renderTransactionTable(tableContainer, filtered, {
    emptyTitle: hasActiveFilters ? 'No matching transactions' : 'No transactions recorded yet',
    emptyDescription: hasActiveFilters
      ? 'Try clearing your search query or adjusting the category, type, or month filters.'
      : 'Start by adding your first income or expense entry.',
    showEmptyCta: !hasActiveFilters,
  });
}

/**
 * Exports all transactions (or currently filtered ones) as a CSV download.
 * @param {Function} [notify]
 */
export function exportTransactionsToCsv(notify) {
  const transactions = filterAndSortTransactions(getTransactions(), historyFilterState);
  if (!transactions.length) {
    if (notify) notify('No transactions available to export.', true);
    return;
  }

  const headers = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Description'];
  const csvEscape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const lines = [
    headers.join(','),
    ...transactions.map((t) =>
      [t.id, t.date, t.title, t.type, t.category, t.amount.toFixed(2), t.description]
        .map(csvEscape)
        .join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledgerly-transactions-${getTodayDateString()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (notify) notify(`Exported ${transactions.length} transactions to CSV.`);
}

/**
 * Deletes a transaction by ID (wrapper for app orchestration).
 * @param {string} id
 */
export function removeTransactionById(id) {
  return deleteTransaction(id);
}
