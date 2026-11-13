/**
 * storage.js — Centralized Data Persistence Module
 * ---------------------------------------------------------------------------
 * Encapsulates all LocalStorage read/write operations behind clean CRUD
 * functions so that replacing LocalStorage with async REST API calls
 * (Node.js / Express.js / SQL) requires changes only inside this module.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerly_transactions_v1',
  BUDGETS: 'ledgerly_budgets_v1',
  SEEDED: 'ledgerly_seeded_v1',
};

const DEFAULT_MONTHLY_BUDGET = 3500;

/**
 * Generates a unique transaction identifier.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `txn_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Returns local YYYY-MM-DD date string for today.
 * @returns {string}
 */
export function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns local YYYY-MM month key for today.
 * @returns {string}
 */
export function getCurrentMonthKey() {
  return getTodayDateString().slice(0, 7);
}

/**
 * Returns a month key shifted by offset months from a YYYY-MM base.
 * @param {string} baseMonthKey
 * @param {number} offsetMonths
 * @returns {string}
 */
function shiftMonthKey(baseMonthKey, offsetMonths) {
  const [y, m] = baseMonthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + offsetMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds realistic initial demo transactions anchored to the current month.
 * @returns {Array<Object>}
 */
function createInitialSampleTransactions() {
  const m0 = getCurrentMonthKey();
  const m1 = shiftMonthKey(m0, -1);
  const m2 = shiftMonthKey(m0, -2);
  const m3 = shiftMonthKey(m0, -3);
  const m4 = shiftMonthKey(m0, -4);
  const m5 = shiftMonthKey(m0, -5);

  return [
    // Current month
    {
      id: 'txn_demo_01',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m0}-01`,
      description: 'Primary engineering payroll deposit',
    },
    {
      id: 'txn_demo_02',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m0}-02`,
      description: 'Monthly lease payment',
    },
    {
      id: 'txn_demo_03',
      title: 'Grocery Shopping',
      amount: 320.5,
      category: 'Food',
      type: 'expense',
      date: `${m0}-05`,
      description: 'Weekly groceries and household staples',
    },
    {
      id: 'txn_demo_04',
      title: 'UI Design Consultation',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: `${m0}-07`,
      description: 'Client design system audit',
    },
    {
      id: 'txn_demo_05',
      title: 'Electric & Fiber Internet',
      amount: 168.4,
      category: 'Utilities',
      type: 'expense',
      date: `${m0}-08`,
      description: 'Monthly power and broadband bill',
    },
    {
      id: 'txn_demo_06',
      title: 'Metro Pass & Fuel',
      amount: 134,
      category: 'Transportation',
      type: 'expense',
      date: `${m0}-10`,
      description: 'Commuter transit pass and gas refill',
    },
    {
      id: 'txn_demo_07',
      title: 'Dental Checkup',
      amount: 185,
      category: 'Healthcare',
      type: 'expense',
      date: `${m0}-11`,
      description: 'Routine cleaning co-pay',
    },
    {
      id: 'txn_demo_08',
      title: 'Dinner & Coffee',
      amount: 96.25,
      category: 'Food',
      type: 'expense',
      date: `${m0}-12`,
      description: 'Team lunch and specialty coffee beans',
    },

    // Previous 5 months for rich chart trends
    {
      id: 'txn_demo_09',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m1}-01`,
      description: 'Primary payroll deposit',
    },
    {
      id: 'txn_demo_10',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m1}-02`,
      description: 'Monthly lease payment',
    },
    {
      id: 'txn_demo_11',
      title: 'Supermarket & Dining',
      amount: 615,
      category: 'Food',
      type: 'expense',
      date: `${m1}-14`,
      description: 'Groceries and dining out',
    },
    {
      id: 'txn_demo_12',
      title: 'Workstation Monitor',
      amount: 420,
      category: 'Shopping',
      type: 'expense',
      date: `${m1}-19`,
      description: '27-inch IPS display upgrade',
    },
    {
      id: 'txn_demo_13',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m2}-01`,
      description: 'Primary payroll deposit',
    },
    {
      id: 'txn_demo_14',
      title: 'Apartment Rent & Utilities',
      amount: 1620,
      category: 'Housing',
      type: 'expense',
      date: `${m2}-03`,
      description: 'Lease and municipal water',
    },
    {
      id: 'txn_demo_15',
      title: 'Online Course Bundle',
      amount: 240,
      category: 'Education',
      type: 'expense',
      date: `${m2}-15`,
      description: 'Systems architecture workshop',
    },
    {
      id: 'txn_demo_16',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m3}-01`,
      description: 'Primary payroll deposit',
    },
    {
      id: 'txn_demo_17',
      title: 'Rent & Groceries',
      amount: 2110,
      category: 'Housing',
      type: 'expense',
      date: `${m3}-04`,
      description: 'Rent plus monthly pantry restock',
    },
    {
      id: 'txn_demo_18',
      title: 'Concert & Streaming',
      amount: 195,
      category: 'Entertainment',
      type: 'expense',
      date: `${m3}-21`,
      description: 'Live music tickets and subscriptions',
    },
    {
      id: 'txn_demo_19',
      title: 'Monthly Salary & Dividend',
      amount: 5580,
      category: 'Investments',
      type: 'income',
      date: `${m4}-01`,
      description: 'Payroll and quarterly ETF dividend',
    },
    {
      id: 'txn_demo_20',
      title: 'Rent & Travel',
      amount: 2390,
      category: 'Transportation',
      type: 'expense',
      date: `${m4}-11`,
      description: 'Rent and regional rail trip',
    },
    {
      id: 'txn_demo_21',
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: `${m5}-01`,
      description: 'Primary payroll deposit',
    },
    {
      id: 'txn_demo_22',
      title: 'Housing & Food',
      amount: 1980,
      category: 'Food',
      type: 'expense',
      date: `${m5}-09`,
      description: 'Baseline living expenses',
    },
  ];
}

/**
 * Ensures initial seed data exists on first visit only.
 */
export function ensureInitialized() {
  try {
    const alreadySeeded = localStorage.getItem(STORAGE_KEYS.SEEDED);
    if (!alreadySeeded) {
      const sampleTxns = createInitialSampleTransactions();
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(sampleTxns));
      const initialBudgets = {
        defaultMonthlyLimit: DEFAULT_MONTHLY_BUDGET,
        byMonth: {
          [getCurrentMonthKey()]: DEFAULT_MONTHLY_BUDGET,
        },
      };
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(initialBudgets));
      localStorage.setItem(STORAGE_KEYS.SEEDED, 'true');
    }
  } catch (err) {
    console.error('Failed to initialize storage:', err);
  }
}

/**
 * Normalizes a raw transaction object to match the canonical schema.
 * @param {Object} raw
 * @returns {Object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Number(raw.amount) || 0,
    category: String(raw.category || 'Other'),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayDateString()),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Retrieves all stored transactions.
 * @returns {Array<Object>}
 */
export function getTransactions() {
  ensureInitialized();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Error reading transactions from storage:', err);
    return [];
  }
}

/**
 * Overwrites the entire transactions collection.
 * @param {Array<Object>} transactions
 * @returns {Array<Object>}
 */
export function saveTransactions(transactions) {
  const sanitized = Array.isArray(transactions)
    ? transactions.map(normalizeTransaction)
    : [];
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(sanitized));
  return sanitized;
}

/**
 * Adds a new transaction and persists it.
 * @param {Object} transactionInput
 * @returns {Object} The created transaction
 */
export function addTransaction(transactionInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...transactionInput,
    id: transactionInput.id || generateId(),
  });
  transactions.unshift(created);
  saveTransactions(transactions);
  return created;
}

/**
 * Updates an existing transaction by ID.
 * @param {string} id
 * @param {Object} updates
 * @returns {Object|null} The updated transaction or null if not found
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const index = transactions.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[index],
    ...updates,
    id,
  });
  transactions[index] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * @param {string} id
 * @returns {boolean} True if a record was removed
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((t) => t.id !== id);
  if (next.length === transactions.length) return false;
  saveTransactions(next);
  return true;
}

/**
 * Reads the stored budget configuration object.
 * @returns {{ defaultMonthlyLimit: number, byMonth: Record<string, number> }}
 */
function readBudgetStore() {
  ensureInitialized();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (!raw) {
      return { defaultMonthlyLimit: DEFAULT_MONTHLY_BUDGET, byMonth: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      defaultMonthlyLimit:
        typeof parsed.defaultMonthlyLimit === 'number' && parsed.defaultMonthlyLimit > 0
          ? parsed.defaultMonthlyLimit
          : DEFAULT_MONTHLY_BUDGET,
      byMonth: parsed.byMonth && typeof parsed.byMonth === 'object' ? parsed.byMonth : {},
    };
  } catch (err) {
    console.error('Error reading budget from storage:', err);
    return { defaultMonthlyLimit: DEFAULT_MONTHLY_BUDGET, byMonth: {} };
  }
}

/**
 * Retrieves budget limit for a given YYYY-MM month key.
 * @param {string} [monthKey]
 * @returns {{ month: string, monthlyLimit: number }}
 */
export function getBudget(monthKey = getCurrentMonthKey()) {
  const store = readBudgetStore();
  const specific = store.byMonth[monthKey];
  const monthlyLimit =
    typeof specific === 'number' && specific > 0 ? specific : store.defaultMonthlyLimit;
  return {
    month: monthKey,
    monthlyLimit,
  };
}

/**
 * Saves monthly budget limit for a given YYYY-MM month key.
 * @param {number} monthlyLimit
 * @param {string} [monthKey]
 * @returns {{ month: string, monthlyLimit: number }}
 */
export function saveBudget(monthlyLimit, monthKey = getCurrentMonthKey()) {
  const limit = Number(monthlyLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('Budget limit must be a positive number.');
  }
  const store = readBudgetStore();
  store.byMonth[monthKey] = Math.round(limit * 100) / 100;
  if (monthKey === getCurrentMonthKey()) {
    store.defaultMonthlyLimit = store.byMonth[monthKey];
  }
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(store));
  return {
    month: monthKey,
    monthlyLimit: store.byMonth[monthKey],
  };
}

/**
 * Resets LocalStorage back to clean initial demo transactions and default budget.
 */
export function resetDemoData() {
  const sampleTxns = createInitialSampleTransactions();
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(sampleTxns));
  localStorage.setItem(
    STORAGE_KEYS.BUDGETS,
    JSON.stringify({
      defaultMonthlyLimit: DEFAULT_MONTHLY_BUDGET,
      byMonth: { [getCurrentMonthKey()]: DEFAULT_MONTHLY_BUDGET },
    })
  );
  localStorage.setItem(STORAGE_KEYS.SEEDED, 'true');
}
