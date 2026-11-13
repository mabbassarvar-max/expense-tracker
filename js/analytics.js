/**
 * analytics.js — Feature 4: Expense Analytics & Dynamic Charts
 * ---------------------------------------------------------------------------
 * Computes category-wise breakdowns, monthly income vs. expenses, spending
 * distribution, highest spending category, and total savings.
 */

import { getTransactions } from './storage.js';
import {
  calculateTotals,
  calculateCategoryBreakdown,
  calculateMonthlyTrend,
  getAvailableMonths,
  getMonthlyTransactions,
  formatCurrency,
  formatMonthLabel,
  escapeHtml,
} from './transactions.js';

let incomeExpenseChart = null;
let categoryBarChart = null;
let distributionChart = null;
let analyticsPeriod = 'all';
let analyticsInitialized = false;

/**
 * Initializes Analytics period selector.
 */
export function initAnalyticsModule() {
  if (analyticsInitialized) return;
  analyticsInitialized = true;

  const periodSelect = document.getElementById('analytics-period-select');
  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      analyticsPeriod = e.target.value || 'all';
      renderAnalytics();
    });
  }
}

/**
 * Filters transactions based on selected analytics time range.
 */
function getScopedTransactions(allTransactions) {
  if (analyticsPeriod === 'all') {
    return allTransactions;
  }
  if (analyticsPeriod === '6m') {
    const months = getAvailableMonths(allTransactions).slice(0, 6);
    const allowed = new Set(months);
    return allTransactions.filter((t) => t.date && allowed.has(t.date.slice(0, 7)));
  }
  // Specific YYYY-MM month
  return getMonthlyTransactions(allTransactions, analyticsPeriod);
}

/**
 * Renders Analytics metrics, dynamic Chart.js charts, and category breakdown table.
 */
export function renderAnalytics() {
  const allTransactions = getTransactions();
  const periodSelect = document.getElementById('analytics-period-select');

  // Populate available months in period selector while preserving selection
  if (periodSelect) {
    const months = getAvailableMonths(allTransactions);
    const options = [
      { value: 'all', label: 'All Time' },
      { value: '6m', label: 'Last 6 Months' },
      ...months.map((m) => ({ value: m, label: formatMonthLabel(m) })),
    ];
    periodSelect.innerHTML = options
      .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
      .join('');
    const validValues = new Set(options.map((o) => o.value));
    if (!validValues.has(analyticsPeriod)) {
      analyticsPeriod = 'all';
    }
    periodSelect.value = analyticsPeriod;
  }

  const scoped = getScopedTransactions(allTransactions);
  const totals = calculateTotals(scoped);
  const categoryBreakdown = calculateCategoryBreakdown(scoped, 'expense');
  const monthlyTrend = calculateMonthlyTrend(
    scoped,
    analyticsPeriod === '6m' ? 6 : null
  );

  // 1. Render Key Analytics Metrics
  const topCatEl = document.getElementById('analytics-top-category');
  const topCatNoteEl = document.getElementById('analytics-top-category-note');
  const savingsEl = document.getElementById('analytics-total-savings');
  const savingsRateEl = document.getElementById('analytics-savings-rate');
  const avgEl = document.getElementById('analytics-avg-expense');
  const avgNoteEl = document.getElementById('analytics-avg-expense-note');

  const topCat = categoryBreakdown[0] || null;
  if (topCatEl) topCatEl.textContent = topCat ? topCat.category : '—';
  if (topCatNoteEl) {
    topCatNoteEl.textContent = topCat
      ? `${formatCurrency(topCat.amount)} · ${topCat.percentage.toFixed(1)}% of expenses`
      : 'No expenses in selected range';
  }

  if (savingsEl) {
    savingsEl.textContent = formatCurrency(totals.totalSavings);
    savingsEl.className = `kpi-value mono ${
      totals.totalSavings >= 0 ? 'text-income' : 'text-expense'
    }`;
  }
  if (savingsRateEl) {
    savingsRateEl.textContent =
      totals.totalIncome > 0
        ? `${totals.savingsRate.toFixed(1)}% savings rate`
        : 'No income recorded in range';
  }

  const avgExpense = totals.expenseCount > 0 ? totals.totalExpenses / totals.expenseCount : 0;
  if (avgEl) avgEl.textContent = formatCurrency(avgExpense);
  if (avgNoteEl) {
    avgNoteEl.textContent = `Across ${totals.expenseCount} ${
      totals.expenseCount === 1 ? 'expense' : 'expenses'
    }`;
  }

  // 2. Render Charts
  renderIncomeVsExpensesChart(monthlyTrend);
  renderCategoryBarChart(categoryBreakdown);
  renderDistributionChart(categoryBreakdown);

  // 3. Render Category Breakdown Table
  renderCategoryTable(categoryBreakdown, totals.totalExpenses);
}

/**
 * Chart 1: Monthly Income vs Expenses grouped bar chart.
 */
function renderIncomeVsExpensesChart(trend) {
  const canvas = document.getElementById('analytics-income-expense-chart');
  const emptyEl = document.getElementById('analytics-income-expense-empty');
  if (!canvas || !emptyEl) return;

  if (!trend.length) {
    if (incomeExpenseChart) {
      incomeExpenseChart.destroy();
      incomeExpenseChart = null;
    }
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  if (typeof window.Chart !== 'function') return;

  if (incomeExpenseChart) {
    incomeExpenseChart.destroy();
  }

  incomeExpenseChart = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: trend.map((t) => t.label),
      datasets: [
        {
          label: 'Income',
          data: trend.map((t) => t.income),
          backgroundColor: '#16A34A',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.6,
        },
        {
          label: 'Expenses',
          data: trend.map((t) => t.expenses),
          backgroundColor: '#DC2626',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
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
          ticks: { color: '#64748B', font: { family: "'DM Sans', sans-serif", size: 12 } },
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
 * Chart 2: Category-Wise Expense Breakdown horizontal bar chart.
 */
function renderCategoryBarChart(breakdown) {
  const canvas = document.getElementById('analytics-category-bar-chart');
  const emptyEl = document.getElementById('analytics-category-bar-empty');
  if (!canvas || !emptyEl) return;

  if (!breakdown.length) {
    if (categoryBarChart) {
      categoryBarChart.destroy();
      categoryBarChart = null;
    }
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  if (typeof window.Chart !== 'function') return;

  if (categoryBarChart) {
    categoryBarChart.destroy();
  }

  categoryBarChart = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          label: 'Total Spent',
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((b) => b.color),
          borderRadius: 4,
          barThickness: 20,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${formatCurrency(ctx.parsed.x)}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#F1F5F9' },
          border: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#0F172A', font: { family: "'DM Sans', sans-serif", size: 12 } },
        },
      },
    },
  });
}

/**
 * Chart 3: Spending Distribution doughnut chart.
 */
function renderDistributionChart(breakdown) {
  const canvas = document.getElementById('analytics-distribution-chart');
  const emptyEl = document.getElementById('analytics-distribution-empty');
  if (!canvas || !emptyEl) return;

  if (!breakdown.length) {
    if (distributionChart) {
      distributionChart.destroy();
      distributionChart = null;
    }
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  if (typeof window.Chart !== 'function') return;

  if (distributionChart) {
    distributionChart.destroy();
  }

  distributionChart = new window.Chart(canvas.getContext('2d'), {
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
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#334155',
            font: { family: "'DM Sans', sans-serif", size: 12 },
          },
        },
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

/**
 * Renders the Category Breakdown Table below analytics charts.
 */
function renderCategoryTable(breakdown, grandTotal) {
  const container = document.getElementById('analytics-category-table-container');
  if (!container) return;

  if (!breakdown.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-desc">No expense transactions recorded for the selected time range.</p>
      </div>
    `;
    return;
  }

  const rows = breakdown
    .map(
      (item) => `
      <tr>
        <td data-label="Category">
          <span class="legend-left">
            <span class="legend-swatch" style="background-color: ${escapeHtml(item.color)};"></span>
            <span class="txn-title">${escapeHtml(item.category)}</span>
          </span>
        </td>
        <td data-label="Entries" class="mono">${item.count}</td>
        <td data-label="Amount" class="align-right mono amount-cell">${escapeHtml(formatCurrency(item.amount))}</td>
        <td data-label="Share" class="align-right mono">${item.percentage.toFixed(1)}%</td>
        <td data-label="Distribution">
          <div class="inline-bar-wrap">
            <div class="inline-bar-track">
              <div class="inline-bar-fill" style="width: ${Math.min(100, item.percentage).toFixed(1)}%; background-color: ${escapeHtml(item.color)};"></div>
            </div>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Entries</th>
            <th class="align-right">Total Spent</th>
            <th class="align-right">Share</th>
            <th>Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th></th>
            <th class="align-right mono">${escapeHtml(formatCurrency(grandTotal))}</th>
            <th class="align-right mono">100.0%</th>
            <th></th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}
