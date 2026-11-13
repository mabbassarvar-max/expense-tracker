/**
 * budget.js — Feature 5: Monthly Budget Management & Alerts
 * ---------------------------------------------------------------------------
 * Allows setting monthly budget limits, tracks monthly expenses, calculates
 * remaining budget & utilization percentage, and displays 80% warning and
 * exceeded alerts.
 */

import {
  getTransactions,
  getBudget,
  saveBudget,
  getCurrentMonthKey,
} from './storage.js';
import {
  calculateTotals,
  getMonthlyTransactions,
  calculateCategoryBreakdown,
  formatCurrency,
  formatMonthLabel,
  escapeHtml,
} from './transactions.js';

let activeBudgetMonth = getCurrentMonthKey();
let budgetInitialized = false;

/**
 * Initializes Budget Management form and month selector listeners.
 * @param {{ onDataChanged: Function, showToast: Function, refreshIcons: Function }} callbacks
 */
export function initBudgetModule(callbacks) {
  if (budgetInitialized) return;
  budgetInitialized = true;

  const monthInput = document.getElementById('budget-month-select');
  const budgetForm = document.getElementById('budget-form');
  const limitInput = document.getElementById('budget-limit-input');
  const limitError = document.getElementById('budget-limit-error');
  const presetButtons = document.querySelectorAll('[data-budget-preset]');

  if (monthInput) {
    monthInput.value = activeBudgetMonth;
    monthInput.addEventListener('change', (e) => {
      activeBudgetMonth = e.target.value || getCurrentMonthKey();
      renderBudgetView();
      if (callbacks?.refreshIcons) callbacks.refreshIcons();
    });
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.budgetPreset);
      if (limitInput && val > 0) {
        limitInput.value = String(val);
        if (limitError) limitError.textContent = '';
        limitInput.classList.remove('is-invalid');
      }
    });
  });

  if (budgetForm) {
    budgetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (limitError) limitError.textContent = '';
      if (limitInput) limitInput.classList.remove('is-invalid');

      const val = Number(limitInput.value);
      if (!Number.isFinite(val) || val <= 0) {
        if (limitError) limitError.textContent = 'Enter a valid monthly budget greater than $0.';
        if (limitInput) limitInput.classList.add('is-invalid');
        return;
      }

      saveBudget(val, activeBudgetMonth);
      if (callbacks?.showToast) {
        callbacks.showToast(
          `Monthly budget for ${formatMonthLabel(activeBudgetMonth)} set to ${formatCurrency(val)}.`
        );
      }
      if (callbacks?.onDataChanged) callbacks.onDataChanged();
    });
  }
}

/**
 * Renders Budget Management metrics, progress bar, alerts, and drivers table.
 */
export function renderBudgetView() {
  const monthInput = document.getElementById('budget-month-select');
  const formSubtitle = document.getElementById('budget-form-subtitle');
  const limitInput = document.getElementById('budget-limit-input');
  const progressSubtitle = document.getElementById('budget-progress-subtitle');
  const statusLabel = document.getElementById('budget-status-label');
  const progressTrack = document.getElementById('budget-progress-track');
  const progressFill = document.getElementById('budget-progress-fill');
  const alertEl = document.getElementById('budget-status-alert');

  const metricLimit = document.getElementById('budget-metric-limit');
  const metricSpent = document.getElementById('budget-metric-spent');
  const metricRemaining = document.getElementById('budget-metric-remaining');
  const metricPercent = document.getElementById('budget-metric-percent');

  const driversSubtitle = document.getElementById('budget-drivers-subtitle');
  const driversContainer = document.getElementById('budget-drivers-container');

  if (monthInput && !monthInput.value) {
    monthInput.value = activeBudgetMonth;
  }

  const budget = getBudget(activeBudgetMonth);
  const allTransactions = getTransactions();
  const monthlyTxns = getMonthlyTransactions(allTransactions, activeBudgetMonth);
  const monthlyTotals = calculateTotals(monthlyTxns);

  const limit = budget.monthlyLimit;
  const spent = monthlyTotals.totalExpenses;
  const remaining = limit - spent;
  const utilization = limit > 0 ? (spent / limit) * 100 : 0;
  const cappedWidth = Math.min(100, Math.max(0, utilization));
  const monthLabel = formatMonthLabel(activeBudgetMonth);

  if (formSubtitle) {
    formSubtitle.textContent = `Configure spending threshold for ${monthLabel}`;
  }
  if (limitInput && document.activeElement !== limitInput) {
    limitInput.value = String(limit);
  }
  if (progressSubtitle) {
    progressSubtitle.textContent = `${utilization.toFixed(1)}% of ${monthLabel} budget utilized`;
  }

  // Update Progress Bar & ARIA
  if (progressTrack) {
    progressTrack.setAttribute('aria-valuenow', String(Math.round(utilization)));
  }
  if (progressFill) {
    progressFill.style.width = `${cappedWidth.toFixed(1)}%`;
    progressFill.classList.remove('is-warning', 'is-exceeded');
    if (utilization > 100) {
      progressFill.classList.add('is-exceeded');
    } else if (utilization >= 80) {
      progressFill.classList.add('is-warning');
    }
  }

  // Status Label & Alert Banner (Explicit icon + text, never hue-only)
  if (utilization > 100) {
    const overBy = spent - limit;
    if (statusLabel) {
      statusLabel.textContent = 'Budget Exceeded';
      statusLabel.className = 'status-text status-exceeded';
    }
    if (alertEl) {
      alertEl.className = 'alert-banner alert-danger';
      alertEl.innerHTML = `
        <div class="alert-banner-content">
          <i data-lucide="alert-octagon"></i>
          <span>
            <strong>Budget Exceeded (${utilization.toFixed(1)}%):</strong>
            Your ${escapeHtml(monthLabel)} expenses (<span class="mono">${escapeHtml(formatCurrency(spent))}</span>)
            have exceeded your <span class="mono">${escapeHtml(formatCurrency(limit))}</span> budget by
            <strong class="mono">${escapeHtml(formatCurrency(overBy))}</strong>.
          </span>
        </div>
      `;
    }
  } else if (utilization >= 80) {
    if (statusLabel) {
      statusLabel.textContent = 'Warning (80%+ Used)';
      statusLabel.className = 'status-text status-warning';
    }
    if (alertEl) {
      alertEl.className = 'alert-banner alert-warning';
      alertEl.innerHTML = `
        <div class="alert-banner-content">
          <i data-lucide="alert-triangle"></i>
          <span>
            <strong>Warning: 80% Budget Threshold Reached (${utilization.toFixed(1)}%):</strong>
            You have spent <span class="mono">${escapeHtml(formatCurrency(spent))}</span> of
            <span class="mono">${escapeHtml(formatCurrency(limit))}</span>, with
            <strong class="mono">${escapeHtml(formatCurrency(remaining))}</strong> remaining for ${escapeHtml(monthLabel)}.
          </span>
        </div>
      `;
    }
  } else {
    if (statusLabel) {
      statusLabel.textContent = 'On Track';
      statusLabel.className = 'status-text status-nominal';
    }
    if (alertEl) {
      alertEl.className = 'alert-banner hidden';
      alertEl.innerHTML = '';
    }
  }

  // Update 4 Budget Metrics
  if (metricLimit) metricLimit.textContent = formatCurrency(limit);
  if (metricSpent) metricSpent.textContent = formatCurrency(spent);
  if (metricRemaining) {
    metricRemaining.textContent =
      remaining >= 0
        ? formatCurrency(remaining)
        : `-${formatCurrency(Math.abs(remaining))}`;
    metricRemaining.className = `budget-metric-value mono ${
      remaining < 0 ? 'text-expense' : 'text-income'
    }`;
  }
  if (metricPercent) {
    metricPercent.textContent = `${utilization.toFixed(1)}%`;
    metricPercent.className = `budget-metric-value mono ${
      utilization > 100 ? 'text-expense' : utilization >= 80 ? 'text-warning' : ''
    }`;
  }

  // Monthly Expense Drivers Table
  if (driversSubtitle) {
    driversSubtitle.textContent = `Expense categories for ${monthLabel} relative to budget`;
  }
  const breakdown = calculateCategoryBreakdown(monthlyTxns, 'expense');
  if (!driversContainer) return;

  if (!breakdown.length) {
    driversContainer.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-desc">No expenses recorded in ${escapeHtml(monthLabel)} yet.</p>
      </div>
    `;
    return;
  }

  const rows = breakdown
    .map((item) => {
      const budgetShare = limit > 0 ? (item.amount / limit) * 100 : 0;
      return `
        <tr>
          <td data-label="Category">
            <span class="legend-left">
              <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)};"></span>
              <span class="txn-title">${escapeHtml(item.category)}</span>
            </span>
          </td>
          <td data-label="Entries" class="mono">${item.count}</td>
          <td data-label="Spent" class="align-right mono amount-cell">${escapeHtml(formatCurrency(item.amount))}</td>
          <td data-label="Of Budget" class="align-right mono">${budgetShare.toFixed(1)}%</td>
          <td data-label="Budget Share">
            <div class="inline-bar-wrap">
              <div class="inline-bar-track">
                <div class="inline-bar-fill" style="width: ${Math.min(100, budgetShare).toFixed(1)}%; background-color: ${escapeHtml(item.color)};"></div>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  driversContainer.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Entries</th>
            <th class="align-right">Spent</th>
            <th class="align-right">% of Budget</th>
            <th>Budget Share</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}
