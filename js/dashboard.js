/**
 * dashboard.js — Feature 1: Dashboard Overview & Charts
 * ---------------------------------------------------------------------------
 * Dynamically computes Total Balance, Total Income, Total Expenses, Monthly
 * Spending, Recent Transactions, Monthly Spending Overview chart, and
 * Expense Category Breakdown from persisted transactions.
 */

import { getTransactions, getBudget, getCurrentMonthKey } from './storage.js';
import {
  calculateTotals,
  getMonthlyTransactions,
  calculateCategoryBreakdown,
  calculateMonthlyTrend,
  filterAndSortTransactions,
  formatCurrency,
  formatMonthLabel,
  renderTransactionTable,
  escapeHtml,
} from './transactions.js';

let monthlyChartInstance = null;
let categoryChartInstance = null;
let activeDashboardMonth = getCurrentMonthKey();
let dashboardInitialized = false;

/**
 * Initializes dashboard toolbar controls.
 * @param {{ onNavigate: Function, refreshIcons: Function }} callbacks
 */
export function initDashboardModule(callbacks) {
  if (dashboardInitialized) return;
  dashboardInitialized = true;

  const monthInput = document.getElementById('dashboard-month-select');
  if (monthInput) {
    monthInput.value = activeDashboardMonth;
    monthInput.addEventListener('change', (e) => {
      activeDashboardMonth = e.target.value || getCurrentMonthKey();
      renderDashboard(callbacks);
      if (callbacks?.refreshIcons) callbacks.refreshIcons();
    });
  }

  // Handle quick navigation links inside dashboard
  document.querySelectorAll('#view-dashboard [data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.goto;
      if (target && callbacks?.onNavigate) callbacks.onNavigate(target);
    });
  });
}

/**
 * Renders all Dashboard KPIs, alerts, charts, and recent transactions.
 * @param {{ onNavigate?: Function }} [callbacks]
 */
export function renderDashboard(callbacks = {}) {
  const allTransactions = getTransactions();
  const totals = calculateTotals(allTransactions);

  const monthInput = document.getElementById('dashboard-month-select');
  if (monthInput && !monthInput.value) {
    monthInput.value = activeDashboardMonth;
  }

  const monthlyTxns = getMonthlyTransactions(allTransactions, activeDashboardMonth);
  const monthlyTotals = calculateTotals(monthlyTxns);
  const budget = getBudget(activeDashboardMonth);

  // 1. Update Summary KPI Cards
  const balanceEl = document.getElementById('kpi-total-balance');
  const balanceNoteEl = document.getElementById('kpi-balance-note');
  const incomeEl = document.getElementById('kpi-total-income');
  const incomeNoteEl = document.getElementById('kpi-income-note');
  const expensesEl = document.getElementById('kpi-total-expenses');
  const expensesNoteEl = document.getElementById('kpi-expenses-note');
  const monthlyEl = document.getElementById('kpi-monthly-spending');
  const monthlyNoteEl = document.getElementById('kpi-monthly-note');

  if (balanceEl) {
    balanceEl.textContent = formatCurrency(totals.totalBalance);
    balanceEl.className = `kpi-value mono ${
      totals.totalBalance >= 0 ? 'text-income' : 'text-expense'
    }`;
  }
  if (balanceNoteEl) {
    balanceNoteEl.textContent =
      totals.totalIncome > 0
        ? `${totals.savingsRate.toFixed(1)}% net savings rate`
        : 'Total income minus expenses';
  }

  if (incomeEl) incomeEl.textContent = formatCurrency(totals.totalIncome);
  if (incomeNoteEl) {
    incomeNoteEl.textContent = `${totals.incomeCount} ${
      totals.incomeCount === 1 ? 'income entry' : 'income entries'
    }`;
  }

  if (expensesEl) expensesEl.textContent = formatCurrency(totals.totalExpenses);
  if (expensesNoteEl) {
    expensesNoteEl.textContent = `${totals.expenseCount} ${
      totals.expenseCount === 1 ? 'expense entry' : 'expense entries'
    }`;
  }

  const utilization =
    budget.monthlyLimit > 0 ? (monthlyTotals.totalExpenses / budget.monthlyLimit) * 100 : 0;

  if (monthlyEl) monthlyEl.textContent = formatCurrency(monthlyTotals.totalExpenses);
  if (monthlyNoteEl) {
    monthlyNoteEl.textContent = `${utilization.toFixed(1)}% of ${formatCurrency(
      budget.monthlyLimit
    )} (${formatMonthLabel(activeDashboardMonth, true)})`;
    monthlyNoteEl.className = `kpi-note ${
      utilization > 100 ? 'text-expense' : utilization >= 80 ? 'text-warning' : ''
    }`;
  }

  // 2. Conditional Budget Alert Banner on Dashboard
  renderDashboardBudgetAlert(
    monthlyTotals.totalExpenses,
    budget.monthlyLimit,
    utilization,
    callbacks.onNavigate
  );

  // 3. Monthly Spending Overview Chart
  renderMonthlyOverviewChart(allTransactions);

  // 4. Expense Category Breakdown Chart + Legend
  const categorySubtitle = document.getElementById('dashboard-category-subtitle');
  if (categorySubtitle) {
    categorySubtitle.textContent = `${formatMonthLabel(activeDashboardMonth)} expenses by category`;
  }
  const monthlyExpenseBreakdown = calculateCategoryBreakdown(monthlyTxns, 'expense');
  renderCategoryDoughnutChart(monthlyExpenseBreakdown);

  // 5. Recent Transactions Table (Latest 5)
  const recentContainer = document.getElementById('dashboard-recent-container');
  const recent = filterAndSortTransactions(allTransactions, { sortBy: 'date-desc' }).slice(0, 5);
  renderTransactionTable(recentContainer, recent, {
    emptyTitle: 'No transactions yet',
    emptyDescription: 'Record your first income or expense to see live dashboard activity.',
  });
}

/**
 * Displays a concise warning or exceeded alert banner on the dashboard when >= 80%.
 */
function renderDashboardBudgetAlert(spent, limit, utilization, onNavigate) {
  const alertEl = document.getElementById('dashboard-budget-alert');
  if (!alertEl) return;

  if (utilization > 100) {
    const overAmount = spent - limit;
    alertEl.className = 'alert-banner alert-danger';
    alertEl.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon"></i>
        <span>
          <strong>Budget Exceeded (${utilization.toFixed(1)}%):</strong>
          ${escapeHtml(formatMonthLabel(activeDashboardMonth))} spending is
          <strong class="mono">${escapeHtml(formatCurrency(overAmount))}</strong> over your
          <span class="mono">${escapeHtml(formatCurrency(limit))}</span> limit.
        </span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="dash-manage-budget-btn">Manage Budget</button>
    `;
  } else if (utilization >= 80) {
    const remaining = limit - spent;
    alertEl.className = 'alert-banner alert-warning';
    alertEl.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-triangle"></i>
        <span>
          <strong>Budget Warning (${utilization.toFixed(1)}%):</strong>
          Approaching your ${escapeHtml(formatMonthLabel(activeDashboardMonth))} limit —
          <strong class="mono">${escapeHtml(formatCurrency(remaining))}</strong> remaining.
        </span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="dash-manage-budget-btn">Review Budget</button>
    `;
  } else {
    alertEl.className = 'alert-banner hidden';
    alertEl.innerHTML = '';
    return;
  }

  const manageBtn = document.getElementById('dash-manage-budget-btn');
  if (manageBtn && typeof onNavigate === 'function') {
    manageBtn.addEventListener('click', () => onNavigate('budget'));
  }
}

/**
 * Renders the 6-month Income vs Spending bar chart.
 */
function renderMonthlyOverviewChart(allTransactions) {
  const canvas = document.getElementById('dashboard-monthly-chart');
  const emptyEl = document.getElementById('dashboard-monthly-empty');
  if (!canvas || !emptyEl) return;

  const trend = calculateMonthlyTrend(allTransactions, 6);

  if (!trend.length) {
    if (monthlyChartInstance) {
      monthlyChartInstance.destroy();
      monthlyChartInstance = null;
    }
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  if (typeof window.Chart !== 'function') return;

  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
  }

  monthlyChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: trend.map((m) => m.label),
      datasets: [
        {
          label: 'Income',
          data: trend.map((m) => m.income),
          backgroundColor: '#16A34A',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
        {
          label: 'Expenses',
          data: trend.map((m) => m.expenses),
          backgroundColor: '#0F766E',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#475569',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748B', font: { family: "'DM Sans', sans-serif", size: 11.5 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#F1F5F9' },
          border: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
      },
    },
  });
}

/**
 * Renders the Expense Category Breakdown doughnut chart and tabular legend.
 */
function renderCategoryDoughnutChart(breakdown) {
  const canvas = document.getElementById('dashboard-category-chart');
  const emptyEl = document.getElementById('dashboard-category-empty');
  const legendEl = document.getElementById('dashboard-category-legend');
  if (!canvas || !emptyEl || !legendEl) return;

  if (!breakdown.length) {
    if (categoryChartInstance) {
      categoryChartInstance.destroy();
      categoryChartInstance = null;
    }
    emptyEl.classList.remove('hidden');
    legendEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');

  // Render crisp tabular legend (top 5 + summary if more)
  legendEl.innerHTML = breakdown
    .slice(0, 5)
    .map(
      (item) => `
      <li class="category-legend-item">
        <span class="legend-left">
          <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)};"></span>
          <span class="legend-name">${escapeHtml(item.category)}</span>
        </span>
        <span class="legend-right mono">
          <span class="legend-amount">${escapeHtml(formatCurrency(item.amount))}</span>
          <span class="legend-pct">${item.percentage.toFixed(1)}%</span>
        </span>
      </li>
    `
    )
    .join('');

  if (typeof window.Chart !== 'function') return;

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  categoryChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((b) => b.color),
          borderColor: '#FFFFFF',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = breakdown[ctx.dataIndex];
              return `${item.category}: ${formatCurrency(item.amount)} (${item.percentage.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });
}
