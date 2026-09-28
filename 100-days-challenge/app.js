/**
 * 100 Days Challenge — Main Application Logic
 * Integrates:
 * - Authentication (Firebase Auth)
 * - Firestore Database Persistence (users, targets, days)
 * - IST Date Management & Simulation
 * - Streak & Habit Analytics
 * - Weekly Chart Engine
 * - 100-Day Heatmap & Modals
 */

import {
  auth,
  firestore,
  initAuth,
  getActiveFirebaseConfig,
  saveActiveFirebaseConfig,
  resetFirebaseConfig
} from './firebase-service.js';

import {
  CHALLENGE_CONFIG,
  getCurrentISTDateString,
  getChallengeDayInfo,
  getDateForDay,
  formatReadableDate,
  getAll100DaysMetadata,
  setSimulatedDate,
  getSimulatedDate
} from './date-utils.js';

import { WeeklyProgressChart } from './chart-service.js';

// Application State
const state = {
  user: null,
  userProfile: null,
  activeView: 'dashboard',
  targets: [], // list of user's target objects
  daysMap: new Map(), // dayNumber -> day record doc
  selectedDayNumber: 1, // day currently displayed in checklist
  currentChallengeDay: 1, // today's challenge day based on IST
  challengeStatus: 'active', // 'before' | 'active' | 'completed'
  targetCategoryFilter: 'all',
  weeklyChart: null
};

// ============================================================================
// Notification / Toast System
// ============================================================================
function showToast(message, type = 'normal') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ============================================================================
// Initialization & Lifecycle
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupAuthEvents();
  setupTargetEvents();
  setupChecklistEvents();
  setupActivityEvents();
  setupProfileEvents();
  setupSimulatorEvents();
  setupFirebaseConfigModal();

  // Initialize weekly chart
  state.weeklyChart = new WeeklyProgressChart('weekly-chart');

  // Restore Simulated Date if any
  const savedSimDate = getSimulatedDate();
  if (savedSimDate) {
    const sel = document.getElementById('simulator-date-select');
    if (sel) sel.value = savedSimDate;
  }

  // Calculate current challenge day in IST
  refreshChallengeTiming();

  // Listen for auth changes and initialize persistent session
  auth.onAuthStateChanged(handleAuthStateChanged);
  await initAuth();
});

function refreshChallengeTiming() {
  const dayInfo = getChallengeDayInfo();
  state.challengeStatus = dayInfo.status;
  
  if (dayInfo.status === 'before') {
    state.currentChallengeDay = 1; // Preview Day 1 for targets
  } else if (dayInfo.status === 'completed') {
    state.currentChallengeDay = 100;
  } else {
    state.currentChallengeDay = dayInfo.dayNumber;
  }

  state.selectedDayNumber = state.currentChallengeDay;
  updateHeaderBadge(dayInfo);
}

function updateHeaderBadge(dayInfo) {
  const badgeText = document.getElementById('header-day-text');
  if (!badgeText) return;

  if (dayInfo.status === 'before') {
    badgeText.textContent = `Starts 29 Sep 2026 (${dayInfo.daysUntilStart}d left)`;
  } else if (dayInfo.status === 'completed') {
    badgeText.textContent = `Day 100 Completed! 🎉`;
  } else {
    badgeText.textContent = `Day ${dayInfo.dayNumber} / 100 • IST`;
  }
}

// ============================================================================
// Navigation Management
// ============================================================================
function setupNavigation() {
  const desktopNavItems = document.querySelectorAll('.desktop-nav .nav-item');
  const mobileNavItems = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item');

  function navigateTo(viewName) {
    state.activeView = viewName;

    // Update desktop nav
    desktopNavItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update mobile nav
    mobileNavItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update views visibility
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const targetSection = document.getElementById(`${viewName}-view`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // Refresh view specific data
    if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'targets') {
      renderTargetsList();
    } else if (viewName === 'today') {
      renderTodayChecklist();
    } else if (viewName === 'activity') {
      render100DaysGrid();
    } else if (viewName === 'progress') {
      renderProgressView();
    } else if (viewName === 'profile') {
      renderProfileView();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  desktopNavItems.forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  mobileNavItems.forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Hero button to today's challenge
  const btnHeroToday = document.getElementById('btn-hero-goto-today');
  if (btnHeroToday) {
    btnHeroToday.addEventListener('click', () => navigateTo('today'));
  }

  // Dashboard quick link
  const linkDashChecklist = document.getElementById('link-dash-checklist');
  if (linkDashChecklist) {
    linkDashChecklist.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('today');
    });
  }

  // Dashboard view all activity button
  const btnViewAllActivity = document.getElementById('btn-view-all-activity');
  if (btnViewAllActivity) {
    btnViewAllActivity.addEventListener('click', () => navigateTo('activity'));
  }

  // Empty state button in checklist
  const btnGotoTargets = document.getElementById('btn-goto-targets-from-checklist');
  if (btnGotoTargets) {
    btnGotoTargets.addEventListener('click', () => navigateTo('targets'));
  }
}

// ============================================================================
// Authentication Flow
// ============================================================================
function setupAuthEvents() {
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const authErrorMsg = document.getElementById('auth-error-msg');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.style.display = 'flex';
    signupForm.style.display = 'none';
    hideAuthError();
  });

  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.style.display = 'flex';
    loginForm.style.display = 'none';
    hideAuthError();
  });

  // Password visibility toggles
  document.querySelectorAll('.toggle-password-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = '🔒';
        } else {
          input.type = 'password';
          btn.textContent = '👁️';
        }
      }
    });
  });

  // Sign In Form Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login-submit');

    setButtonLoading(btn, true);
    try {
      await auth.signInWithEmailAndPassword(email, password);
      showToast('Signed in successfully!', 'success');
    } catch (err) {
      showAuthError(err.message);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Sign Up Form Submit
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    const btn = document.getElementById('btn-signup-submit');

    if (password !== confirmPassword) {
      showAuthError('Passwords do not match. Please verify and re-enter.');
      return;
    }

    setButtonLoading(btn, true);
    try {
      await auth.createUserWithEmailAndPassword(email, password, name);
      showToast(`Account created! Welcome, ${name} 👋`, 'success');
    } catch (err) {
      showAuthError(err.message);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Forgot Password Link & Modal
  const linkForgotPw = document.getElementById('link-forgot-pw');
  const modalForgotPw = document.getElementById('modal-forgot-pw');
  const btnCloseForgotPw = document.getElementById('btn-close-forgot-pw');
  const btnCancelForgotPw = document.getElementById('btn-cancel-forgot-pw');
  const formForgotPw = document.getElementById('form-forgot-pw');

  linkForgotPw.addEventListener('click', (e) => {
    e.preventDefault();
    modalForgotPw.classList.add('open');
  });

  [btnCloseForgotPw, btnCancelForgotPw].forEach(b => {
    b.addEventListener('click', () => modalForgotPw.classList.remove('open'));
  });

  formForgotPw.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = document.getElementById('btn-submit-forgot-pw');
    setButtonLoading(btn, true);
    try {
      await auth.sendPasswordResetEmail(email);
      modalForgotPw.classList.remove('open');
      showToast('Password reset link sent to your email!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Header & Profile Sign Out
  const logoutButtons = [
    document.getElementById('btn-header-logout'),
    document.getElementById('btn-profile-logout')
  ];
  logoutButtons.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', async () => {
        await auth.signOut();
        showToast('You have been signed out.', 'normal');
      });
    }
  });

  // Demo Account Quick Fill Button
  const btnQuickDemo = document.getElementById('btn-quick-demo');
  if (btnQuickDemo) {
    btnQuickDemo.addEventListener('click', () => {
      document.getElementById('login-email').value = 'alex.challenger@example.com';
      document.getElementById('login-password').value = '100dayspass';
      document.getElementById('signup-name').value = 'Alex Morgan';
      document.getElementById('signup-email').value = 'alex.challenger@example.com';
      document.getElementById('signup-password').value = '100dayspass';
      document.getElementById('signup-confirm-password').value = '100dayspass';
      showToast('Sample credentials filled! Click Sign In or Sign Up.', 'normal');
    });
  }

  function showAuthError(msg) {
    authErrorMsg.textContent = msg;
    authErrorMsg.classList.add('visible');
  }

  function hideAuthError() {
    authErrorMsg.textContent = '';
    authErrorMsg.classList.remove('visible');
  }
}

async function handleAuthStateChanged(user) {
  const appHeader = document.getElementById('app-header');
  const mobileNav = document.getElementById('mobile-nav');
  const simulatorBanner = document.getElementById('simulator-banner');
  const authView = document.getElementById('auth-view');
  const dashboardView = document.getElementById('dashboard-view');

  if (user) {
    state.user = user;
    // Load full user doc from Firestore: users/{uid}
    const userDoc = await firestore.getDoc(`users/${user.uid}`);
    state.userProfile = userDoc || {
      name: user.displayName || 'Challenger',
      email: user.email,
      challengeStartDate: '2026-09-29',
      challengeEndDate: '2027-01-06'
    };

    // Show App Shell
    authView.classList.remove('active');
    appHeader.style.display = 'flex';
    mobileNav.style.display = 'flex';
    simulatorBanner.style.display = 'flex';
    dashboardView.classList.add('active');
    state.activeView = 'dashboard';

    // Update greeting
    updateUserGreetings();

    // Load User's Firestore Data
    await loadUserData();

    // Populate default starter habits if new user has 0 targets
    if (state.targets.length === 0) {
      await initializeDefaultTargets();
    }

    renderDashboard();
  } else {
    state.user = null;
    state.userProfile = null;
    state.targets = [];
    state.daysMap.clear();

    // Show Auth Shell
    appHeader.style.display = 'none';
    mobileNav.style.display = 'none';
    simulatorBanner.style.display = 'none';
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    authView.classList.add('active');
  }
}

function updateUserGreetings() {
  const name = (state.userProfile && state.userProfile.name) || (state.user && state.user.displayName) || 'Challenger';
  const greetingEl = document.getElementById('dash-greeting');
  if (greetingEl) {
    greetingEl.textContent = `Welcome back, ${name} 👋`;
  }
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  const textSpan = button.querySelector('.btn-text');
  const spinnerSpan = button.querySelector('.spinner');
  if (isLoading) {
    button.disabled = true;
    if (textSpan) textSpan.style.opacity = '0.5';
    if (spinnerSpan) spinnerSpan.style.display = 'inline-block';
  } else {
    button.disabled = false;
    if (textSpan) textSpan.style.opacity = '1';
    if (spinnerSpan) spinnerSpan.style.display = 'none';
  }
}

// ============================================================================
// Firestore Data Fetching & Sync
// ============================================================================
async function loadUserData() {
  if (!state.user) return;
  const uid = state.user.uid;

  try {
    // 1. Fetch Targets: users/{uid}/targets
    const targets = await firestore.getDocs(`users/${uid}/targets`);
    state.targets = targets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // 2. Fetch Daily Records: users/{uid}/days
    const days = await firestore.getDocs(`users/${uid}/days`);
    state.daysMap.clear();
    days.forEach(day => {
      state.daysMap.set(day.dayNumber, day);
    });

  } catch (err) {
    console.error('Error loading Firestore data:', err);
    showToast('Failed to load cloud data: ' + err.message, 'error');
  }
}

/**
 * Initializes recommended core daily targets if a user has none yet
 */
async function initializeDefaultTargets() {
  const sampleTargets = [
    { name: 'Solve 2 DSA problems', category: 'Study', targetValue: '2 problems', description: 'LeetCode / Codeforces practice' },
    { name: 'Study for 2 hours', category: 'Study', targetValue: '2 hours', description: 'Deep focused work sessions' },
    { name: 'Exercise for 30 minutes', category: 'Fitness', targetValue: '30 mins', description: 'Gym, running, or home workout' },
    { name: 'Drink 2L water', category: 'Health', targetValue: '2 Litres', description: 'Daily hydration tracker' },
    { name: 'Read for 20 minutes', category: 'Personal', targetValue: '20 mins', description: 'Non-fiction books / articles' }
  ];

  for (const t of sampleTargets) {
    await createTarget(t.name, t.category, t.targetValue, t.description);
  }
}

// ============================================================================
// Target Setup & Management (🎯 My Targets)
// ============================================================================
function setupTargetEvents() {
  const btnOpenAdd = document.getElementById('btn-open-add-target');
  const btnEmptyAdd = document.getElementById('btn-empty-add-target');
  const modalTarget = document.getElementById('modal-target');
  const btnCloseModal = document.getElementById('btn-close-target-modal');
  const btnCancelModal = document.getElementById('btn-cancel-target-modal');
  const formTarget = document.getElementById('form-target');

  [btnOpenAdd, btnEmptyAdd].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        document.getElementById('target-modal-title').textContent = 'Add Daily Target';
        document.getElementById('target-edit-id').value = '';
        formTarget.reset();
        modalTarget.classList.add('open');
      });
    }
  });

  [btnCloseModal, btnCancelModal].forEach(btn => {
    btn.addEventListener('click', () => modalTarget.classList.remove('open'));
  });

  formTarget.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('target-edit-id').value;
    const name = document.getElementById('target-input-name').value.trim();
    const category = document.getElementById('target-input-category').value;
    const targetValue = document.getElementById('target-input-value').value.trim();
    const desc = document.getElementById('target-input-desc').value.trim();
    const btn = document.getElementById('btn-save-target');

    setButtonLoading(btn, true);
    try {
      if (editId) {
        await updateTarget(editId, { name, category, targetValue, description: desc });
        showToast('Target updated! Historical records preserved.', 'success');
      } else {
        await createTarget(name, category, targetValue, desc);
        showToast('Target added to daily checklist!', 'success');
      }
      modalTarget.classList.remove('open');
      renderTargetsList();
      renderTodayChecklist();
      renderDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Category filter tabs
  const catTabs = document.querySelectorAll('#target-category-tabs .cat-tab');
  catTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      catTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.targetCategoryFilter = tab.dataset.category;
      renderTargetsList();
    });
  });
}

async function createTarget(name, category, targetValue = '', description = '') {
  if (!state.user) return;
  const targetId = 'target_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const targetDoc = {
    name,
    category,
    targetValue,
    description,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  await firestore.setDoc(`users/${state.user.uid}/targets/${targetId}`, targetDoc);
  state.targets.push({ id: targetId, ...targetDoc });
}

async function updateTarget(targetId, updates) {
  if (!state.user) return;
  await firestore.updateDoc(`users/${state.user.uid}/targets/${targetId}`, updates);
  
  const target = state.targets.find(t => t.id === targetId);
  if (target) {
    Object.assign(target, updates);
  }
}

async function toggleTargetActive(targetId, active) {
  if (!state.user) return;
  await firestore.updateDoc(`users/${state.user.uid}/targets/${targetId}`, { active });
  const target = state.targets.find(t => t.id === targetId);
  if (target) {
    target.active = active;
  }
  showToast(active ? 'Target enabled' : 'Target disabled (past days unchanged)', 'normal');
  renderTodayChecklist();
  renderDashboard();
}

async function deleteTarget(targetId) {
  if (!state.user) return;
  if (!confirm('Are you sure you want to delete this target? Note: Previous challenge records will remain safely intact.')) {
    return;
  }

  await firestore.deleteDoc(`users/${state.user.uid}/targets/${targetId}`);
  state.targets = state.targets.filter(t => t.id !== targetId);
  showToast('Target deleted. Historical logs preserved.', 'normal');
  renderTargetsList();
  renderTodayChecklist();
  renderDashboard();
}

function renderTargetsList() {
  const grid = document.getElementById('targets-grid');
  const emptyState = document.getElementById('targets-empty-state');
  if (!grid) return;

  grid.innerHTML = '';

  const filtered = state.targets.filter(t => {
    if (state.targetCategoryFilter === 'all') return true;
    return t.category === state.targetCategoryFilter;
  });

  if (state.targets.length === 0) {
    emptyState.style.display = 'flex';
    grid.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  grid.style.display = 'grid';

  filtered.forEach(target => {
    const card = document.createElement('div');
    card.className = `target-card ${!target.active ? 'disabled' : ''}`;

    card.innerHTML = `
      <div>
        <div class="target-top">
          <span class="cat-badge cat-${target.category}">${target.category}</span>
          <label class="switch" title="Toggle Daily Target Active">
            <input type="checkbox" class="toggle-active-input" ${target.active ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>

        <h3 class="target-name">${escapeHtml(target.name)}</h3>
        ${target.description ? `<p class="target-desc">${escapeHtml(target.description)}</p>` : ''}
        ${target.targetValue ? `<div class="target-val-badge">🎯 Goal: ${escapeHtml(target.targetValue)}</div>` : ''}
      </div>

      <div class="target-actions">
        <span style="font-size: 0.78rem; color: var(--text-muted);">
          ${target.active ? '🟢 Active Daily' : '⚪ Disabled'}
        </span>
        <div class="target-btn-group">
          <button class="icon-btn btn-edit-target" title="Edit Target">✏️</button>
          <button class="icon-btn danger btn-del-target" title="Delete Target">🗑️</button>
        </div>
      </div>
    `;

    // Active Toggle
    const toggleInput = card.querySelector('.toggle-active-input');
    toggleInput.addEventListener('change', (e) => {
      toggleTargetActive(target.id, e.target.checked);
      card.classList.toggle('disabled', !e.target.checked);
    });

    // Edit button
    const btnEdit = card.querySelector('.btn-edit-target');
    btnEdit.addEventListener('click', () => {
      document.getElementById('target-modal-title').textContent = 'Edit Daily Target';
      document.getElementById('target-edit-id').value = target.id;
      document.getElementById('target-input-name').value = target.name;
      document.getElementById('target-input-category').value = target.category;
      document.getElementById('target-input-value').value = target.targetValue || '';
      document.getElementById('target-input-desc').value = target.description || '';
      document.getElementById('modal-target').classList.add('open');
    });

    // Delete button
    const btnDel = card.querySelector('.btn-del-target');
    btnDel.addEventListener('click', () => {
      deleteTarget(target.id);
    });

    grid.appendChild(card);
  });
}

// ============================================================================
// Daily Checklist Logic (✅ Today's Challenge)
// ============================================================================
function setupChecklistEvents() {
  const btnPrev = document.getElementById('btn-prev-day');
  const btnNext = document.getElementById('btn-next-day');

  btnPrev.addEventListener('click', () => {
    if (state.selectedDayNumber > 1) {
      state.selectedDayNumber--;
      renderTodayChecklist();
    }
  });

  btnNext.addEventListener('click', () => {
    if (state.selectedDayNumber < 100) {
      state.selectedDayNumber++;
      renderTodayChecklist();
    }
  });
}

function renderTodayChecklist() {
  const dayNum = state.selectedDayNumber;
  const isFuture = dayNum > state.currentChallengeDay;
  const targetDateStr = getDateForDay(dayNum);
  const readableDate = formatReadableDate(targetDateStr, 'full');

  // Update headers
  document.getElementById('active-day-display-label').textContent = `Day ${dayNum}`;
  document.getElementById('checklist-title').textContent = `Day ${dayNum} — ${readableDate}`;
  
  const preAlert = document.getElementById('pre-challenge-alert');
  if (preAlert) {
    preAlert.style.display = state.challengeStatus === 'before' ? 'block' : 'none';
  }

  const checklistWrapper = document.getElementById('checklist-wrapper');
  const lockedCard = document.getElementById('future-day-locked-card');
  const noTargetsCard = document.getElementById('checklist-no-targets-card');

  // Handle Future Day Lock
  if (isFuture) {
    lockedCard.style.display = 'block';
    checklistWrapper.style.display = 'none';
    noTargetsCard.style.display = 'none';
    updateChecklistProgressBar(0, 0);
    setChecklistStatusPill('locked', 'Locked (Future)');
    return;
  }

  lockedCard.style.display = 'none';

  // Active targets for daily checklist
  const activeTargets = state.targets.filter(t => t.active);

  if (activeTargets.length === 0) {
    noTargetsCard.style.display = 'flex';
    checklistWrapper.style.display = 'none';
    updateChecklistProgressBar(0, 0);
    setChecklistStatusPill('inactive', 'No Targets');
    return;
  }

  noTargetsCard.style.display = 'none';
  checklistWrapper.style.display = 'flex';
  checklistWrapper.innerHTML = '';

  // Retrieve today's record from Firestore cache: users/{uid}/days/{dayNumber}
  const dayRecord = state.daysMap.get(dayNum) || {
    dayNumber: dayNum,
    date: targetDateStr,
    completedTargets: [],
    totalTargets: activeTargets.length,
    completedCount: 0,
    completionPercentage: 0,
    status: 'inactive'
  };

  const completedSet = new Set(dayRecord.completedTargets || []);

  activeTargets.forEach(target => {
    const isChecked = completedSet.has(target.id);
    const item = document.createElement('div');
    item.className = `checklist-item ${isChecked ? 'checked' : ''}`;

    item.innerHTML = `
      <div class="custom-checkbox">${isChecked ? '✓' : ''}</div>
      <div class="checklist-content">
        <div class="checklist-item-title">${escapeHtml(target.name)}</div>
        <div class="checklist-item-meta">
          <span class="cat-badge cat-${target.category}">${target.category}</span>
          ${target.targetValue ? `<span style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">🎯 ${escapeHtml(target.targetValue)}</span>` : ''}
        </div>
      </div>
    `;

    item.addEventListener('click', async () => {
      const nowChecked = !completedSet.has(target.id);
      if (nowChecked) {
        completedSet.add(target.id);
        item.classList.add('checked');
        item.querySelector('.custom-checkbox').textContent = '✓';
      } else {
        completedSet.delete(target.id);
        item.classList.remove('checked');
        item.querySelector('.custom-checkbox').textContent = '';
      }

      await saveDayProgress(dayNum, targetDateStr, Array.from(completedSet), activeTargets.length);
    });

    checklistWrapper.appendChild(item);
  });

  // Update progress bar and status badge
  updateChecklistProgressBar(completedSet.size, activeTargets.length);
}

function updateChecklistProgressBar(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  document.getElementById('checklist-count-text').textContent = `${completed} / ${total} completed`;
  document.getElementById('checklist-pct-text').textContent = `${pct}% Complete`;
  document.getElementById('checklist-progress-fill').style.width = `${pct}%`;

  if (total === 0 || completed === 0) {
    setChecklistStatusPill('inactive', 'Inactive');
  } else if (completed === total) {
    setChecklistStatusPill('completed', 'Completed');
  } else {
    setChecklistStatusPill('partial', 'Partial');
  }
}

function setChecklistStatusPill(status, label) {
  const pill = document.getElementById('checklist-status-badge');
  const icon = document.getElementById('checklist-status-icon');
  const text = document.getElementById('checklist-status-text');

  pill.className = `day-status-pill status-pill-${status}`;
  if (status === 'completed') icon.textContent = '🟢';
  else if (status === 'partial') icon.textContent = '🟡';
  else if (status === 'inactive') icon.textContent = '🔴';
  else icon.textContent = '🔒';

  text.textContent = label;
}

/**
 * Persists daily challenge record to Firestore: users/{uid}/days/{dayNumber}
 */
async function saveDayProgress(dayNumber, dateStr, completedTargetsArray, totalTargetsCount) {
  if (!state.user) return;

  const completedCount = completedTargetsArray.length;
  const pct = totalTargetsCount > 0 ? Math.round((completedCount / totalTargetsCount) * 100) : 0;

  let status = 'inactive';
  if (completedCount === totalTargetsCount && totalTargetsCount > 0) {
    status = 'completed';
  } else if (completedCount > 0) {
    status = 'partial';
  }

  const dayDoc = {
    dayNumber,
    date: dateStr,
    completedTargets: completedTargetsArray,
    totalTargets: totalTargetsCount,
    completedCount,
    completionPercentage: pct,
    status,
    updatedAt: new Date().toISOString()
  };

  // 1. Save in Firestore: users/{uid}/days/{dayNumber}
  await firestore.setDoc(`users/${state.user.uid}/days/${dayNumber}`, dayDoc);

  // 2. Update local state
  state.daysMap.set(dayNumber, dayDoc);

  // 3. Update Checklist bar
  updateChecklistProgressBar(completedCount, totalTargetsCount);

  // 4. Update Dashboard, Streak, and Weekly Chart
  renderDashboard();

  showToast(`Day ${dayNumber} saved to Firestore (${completedCount}/${totalTargetsCount})`, 'success');
}

// ============================================================================
// Streak & Progress Calculations
// ============================================================================
function calculateStats() {
  const currentDay = Math.min(Math.max(1, state.currentChallengeDay), 100);
  let activeDays = 0;
  let completedTasks = 0;
  let inactiveDays = 0;

  // Track daily records up to current challenge day
  for (let d = 1; d <= currentDay; d++) {
    const rec = state.daysMap.get(d);
    if (rec && rec.completedCount > 0) {
      activeDays++;
      completedTasks += rec.completedCount;
    } else {
      inactiveDays++;
    }
  }

  // Calculate streaks:
  // Active day means at least one target was completed.
  // Inactive day breaks streak.
  let longestStreak = 0;
  let streakCounter = 0;

  for (let d = 1; d <= currentDay; d++) {
    const rec = state.daysMap.get(d);
    const isActive = rec && rec.completedCount > 0;
    if (isActive) {
      streakCounter++;
      if (streakCounter > longestStreak) {
        longestStreak = streakCounter;
      }
    } else {
      streakCounter = 0;
    }
  }

  // Current streak:
  // Count backward from today (or yesterday if today has not completed any targets yet)
  let currentStreak = 0;
  const todayRec = state.daysMap.get(currentDay);
  const todayActive = todayRec && todayRec.completedCount > 0;

  let checkDay = todayActive ? currentDay : currentDay - 1;
  while (checkDay >= 1) {
    const rec = state.daysMap.get(checkDay);
    if (rec && rec.completedCount > 0) {
      currentStreak++;
      checkDay--;
    } else {
      break;
    }
  }

  // Overall Challenge Progress %
  const overallProgressPct = Math.round((activeDays / CHALLENGE_CONFIG.TOTAL_DAYS) * 100);

  return {
    currentDay,
    activeDays,
    longestStreak,
    currentStreak,
    completedTasks,
    inactiveDays,
    overallProgressPct
  };
}

// ============================================================================
// 1. Dashboard View Rendering
// ============================================================================
function renderDashboard() {
  const stats = calculateStats();
  const currentDay = state.currentChallengeDay;
  const targetDateStr = getDateForDay(currentDay);
  const dateFormatted = formatReadableDate(targetDateStr, 'full');

  // Banner details
  const dashDateText = document.getElementById('dash-date-text');
  const dashDayNum = document.getElementById('dash-day-number');

  if (state.challengeStatus === 'before') {
    dashDateText.textContent = `Challenge starts on 29 Sep 2026 • Get your targets ready!`;
    dashDayNum.textContent = `Pre`;
  } else if (state.challengeStatus === 'completed') {
    dashDateText.textContent = `Challenge Concluded • 29 Sep 2026 to 6 Jan 2027`;
    dashDayNum.textContent = `Day 100`;
  } else {
    dashDateText.textContent = `${dateFormatted} (IST)`;
    dashDayNum.textContent = `Day ${currentDay}`;
  }

  // 5 Stats cards
  document.getElementById('stat-current-streak').textContent = `${stats.currentStreak} Days`;
  document.getElementById('stat-longest-streak').textContent = `${stats.longestStreak} Days`;
  document.getElementById('stat-active-days').textContent = `${stats.activeDays} / 100`;
  document.getElementById('stat-completed-tasks').textContent = stats.completedTasks;
  document.getElementById('stat-inactive-days').textContent = stats.inactiveDays;

  // Overall progress card
  document.getElementById('dash-overall-pct').textContent = `${stats.overallProgressPct}%`;
  document.getElementById('dash-progress-fill').style.width = `${stats.overallProgressPct}%`;
  document.getElementById('dash-progress-fraction').textContent = `${stats.activeDays} / 100 Active Days`;
  document.getElementById('dash-days-remaining').textContent = `${Math.max(0, 100 - currentDay)} Days Left`;

  // Quick today status widget
  const todayRec = state.daysMap.get(currentDay);
  const activeTargetsCount = state.targets.filter(t => t.active).length;
  const todayCompleted = (todayRec && todayRec.completedCount) || 0;
  const todayPct = activeTargetsCount > 0 ? Math.round((todayCompleted / activeTargetsCount) * 100) : 0;

  document.getElementById('dash-today-quick-pct').textContent = `${todayPct}%`;
  document.getElementById('dash-today-quick-fill').style.width = `${todayPct}%`;
  document.getElementById('dash-today-quick-counts').textContent = `${todayCompleted} / ${activeTargetsCount} completed`;

  // Render weekly chart data (last 7 days up to currentDay)
  renderWeeklyChart(currentDay);

  // Render Recent Activity feed
  renderRecentActivityList(currentDay);
}

function renderWeeklyChart(currentDay) {
  if (!state.weeklyChart) return;

  const weeklyData = [];
  const startDay = Math.max(1, currentDay - 6);

  for (let d = startDay; d <= currentDay; d++) {
    const rec = state.daysMap.get(d);
    const dateStr = getDateForDay(d);
    const [y, m, dayOfMonth] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, dayOfMonth));
    const dayName = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short' }).format(dateObj);

    const pct = rec ? rec.completionPercentage : 0;
    const completed = rec ? rec.completedCount : 0;
    const total = rec ? rec.totalTargets : state.targets.filter(t => t.active).length;

    weeklyData.push({
      label: dayName,
      date: `Day ${d}`,
      percentage: pct,
      completed,
      total
    });
  }

  state.weeklyChart.update(weeklyData);
}

function renderRecentActivityList(currentDay) {
  const container = document.getElementById('dash-recent-activity-list');
  if (!container) return;

  container.innerHTML = '';
  const recentDays = [];
  for (let d = currentDay; d >= Math.max(1, currentDay - 4); d--) {
    recentDays.push(d);
  }

  if (recentDays.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.88rem; text-align: center; padding: 18px;">
        Your 100-day journey starts here 🌱
      </div>
    `;
    return;
  }

  recentDays.forEach(d => {
    const rec = state.daysMap.get(d);
    const dateStr = getDateForDay(d);
    const readable = formatReadableDate(dateStr, 'medium');
    const isCompleted = rec && rec.status === 'completed';
    const isPartial = rec && rec.status === 'partial';

    let statusBadge = '<span class="day-status-pill status-pill-inactive">🔴 Inactive</span>';
    if (isCompleted) {
      statusBadge = '<span class="day-status-pill status-pill-completed">🟢 Completed</span>';
    } else if (isPartial) {
      statusBadge = '<span class="day-status-pill status-pill-partial">🟡 Partial</span>';
    }

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '10px 14px';
    row.style.background = 'var(--bg-secondary)';
    row.style.borderRadius = 'var(--radius-md)';
    row.style.border = '1px solid var(--border-light)';

    row.innerHTML = `
      <div>
        <div style="font-weight: 700; color: #fff; font-size: 0.92rem;">Day ${d} — ${readable}</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
          ${rec ? `${rec.completedCount} / ${rec.totalTargets} targets (${rec.completionPercentage}%)` : 'No targets recorded'}
        </div>
      </div>
      <div>${statusBadge}</div>
    `;

    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      openDayDetailModal(d);
    });

    container.appendChild(row);
  });
}

// ============================================================================
// 100 Days Activity Page (📅 Heatmap / Grid)
// ============================================================================
function setupActivityEvents() {
  const modal = document.getElementById('modal-day-detail');
  const btnClose = document.getElementById('btn-close-day-modal');
  const btnCloseReview = document.getElementById('btn-modal-close-review');
  const btnOpenChecklist = document.getElementById('btn-modal-open-in-today');

  [btnClose, btnCloseReview].forEach(b => {
    b.addEventListener('click', () => modal.classList.remove('open'));
  });

  btnOpenChecklist.addEventListener('click', () => {
    modal.classList.remove('open');
    state.selectedDayNumber = modal._activeDayNumber || 1;
    // Switch to today view
    document.querySelector('.desktop-nav [data-view="today"]').click();
  });
}

function render100DaysGrid() {
  const grid = document.getElementById('days-heatmap-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const currentDay = state.currentChallengeDay;
  const daysMeta = getAll100DaysMetadata();

  daysMeta.forEach(meta => {
    const d = meta.dayNumber;
    const isFuture = d > currentDay;
    const isToday = d === currentDay;
    const rec = state.daysMap.get(d);

    let statusClass = 'locked';
    let statusIcon = '🔒';

    if (!isFuture) {
      if (rec && rec.status === 'completed') {
        statusClass = 'status-completed';
        statusIcon = '🟢';
      } else if (rec && rec.status === 'partial') {
        statusClass = 'status-partial';
        statusIcon = '🟡';
      } else {
        statusClass = 'status-inactive';
        statusIcon = '🔴';
      }
    }

    const cell = document.createElement('div');
    cell.className = `day-cell ${statusClass} ${isToday ? 'today-cell' : ''}`;
    cell.title = `Day ${d}: ${meta.readableDate} — ${isFuture ? 'Future (Locked)' : rec ? rec.status : 'Inactive'}`;

    cell.innerHTML = `
      <span class="cell-day-num">Day ${d}</span>
      <span class="cell-day-date">${meta.shortDate}</span>
      <span class="cell-status-icon">${statusIcon}</span>
    `;

    if (!isFuture) {
      cell.addEventListener('click', () => {
        openDayDetailModal(d);
      });
    }

    grid.appendChild(cell);
  });
}

function openDayDetailModal(dayNumber) {
  const modal = document.getElementById('modal-day-detail');
  modal._activeDayNumber = dayNumber;

  const dateStr = getDateForDay(dayNumber);
  const readable = formatReadableDate(dateStr, 'full');
  const rec = state.daysMap.get(dayNumber);

  document.getElementById('day-modal-title').textContent = `Day ${dayNumber} — ${formatReadableDate(dateStr, 'medium')}`;
  document.getElementById('day-modal-subtitle').textContent = readable;

  const badge = document.getElementById('day-modal-status-badge');
  const icon = document.getElementById('day-modal-status-icon');
  const text = document.getElementById('day-modal-status-text');
  const progressText = document.getElementById('day-modal-progress-text');
  const targetsList = document.getElementById('day-modal-targets-list');

  targetsList.innerHTML = '';

  const total = rec ? rec.totalTargets : state.targets.filter(t => t.active).length;
  const completed = rec ? rec.completedCount : 0;
  const pct = rec ? rec.completionPercentage : 0;
  const status = rec ? rec.status : 'inactive';

  progressText.textContent = `${completed}/${total} — ${pct}%`;

  badge.className = `day-status-pill status-pill-${status}`;
  if (status === 'completed') {
    icon.textContent = '🟢';
    text.textContent = 'Completed';
  } else if (status === 'partial') {
    icon.textContent = '🟡';
    text.textContent = 'Partial';
  } else {
    icon.textContent = '🔴';
    text.textContent = 'Inactive';
  }

  // Render Target Checklist with ✅ or ❌
  const completedSet = new Set(rec ? rec.completedTargets : []);

  if (state.targets.length === 0) {
    targetsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px;">No targets were configured.</div>`;
  } else {
    state.targets.forEach((target, i) => {
      const isDone = completedSet.has(target.id);
      const row = document.createElement('div');
      row.className = 'day-target-review-item';

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">#${i + 1}</span>
          <span style="font-weight: 600; color: #fff; font-size: 0.92rem;">${escapeHtml(target.name)}</span>
          <span class="cat-badge cat-${target.category}" style="font-size: 0.65rem;">${target.category}</span>
        </div>
        <div style="font-size: 1.1rem;">
          ${isDone ? '✅' : '❌'}
        </div>
      `;
      targetsList.appendChild(row);
    });
  }

  modal.classList.add('open');
}

// ============================================================================
// Habit-Wise Progress & Final Report (📈 Progress)
// ============================================================================
function renderProgressView() {
  const stats = calculateStats();
  const currentDay = state.currentChallengeDay;

  document.getElementById('prog-active-days').textContent = `${stats.activeDays} Days / 100`;
  document.getElementById('prog-inactive-days').textContent = `${stats.inactiveDays} Days`;
  document.getElementById('prog-curr-streak').textContent = `${stats.currentStreak} Days 🔥`;
  document.getElementById('prog-best-streak').textContent = `${stats.longestStreak} Days 🏆`;
  document.getElementById('prog-overall-rate').textContent = `${stats.overallProgressPct}%`;

  // Habit-wise breakdown
  const habitList = document.getElementById('habit-progress-list');
  habitList.innerHTML = '';

  if (state.targets.length === 0) {
    habitList.innerHTML = `<div style="color: var(--text-muted); padding: 18px; text-align: center;">No targets created yet.</div>`;
    return;
  }

  state.targets.forEach(target => {
    // Count days where this specific target was completed
    let timesCompleted = 0;
    for (let d = 1; d <= currentDay; d++) {
      const rec = state.daysMap.get(d);
      if (rec && rec.completedTargets && rec.completedTargets.includes(target.id)) {
        timesCompleted++;
      }
    }

    const rate = currentDay > 0 ? Math.round((timesCompleted / currentDay) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'habit-progress-card';

    card.innerHTML = `
      <div class="habit-progress-header">
        <div class="habit-title-box">
          <span class="cat-badge cat-${target.category}">${target.category}</span>
          <span style="font-weight: 700; color: #fff; font-size: 0.95rem;">${escapeHtml(target.name)}</span>
        </div>
        <span class="habit-pct">${rate}%</span>
      </div>

      <div class="progress-track" style="height: 10px;">
        <div class="progress-fill" style="width: ${rate}%; background: var(--cat-${target.category.toLowerCase()});"></div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted);">
        <span>Completed on ${timesCompleted} of ${currentDay} elapsed days</span>
        <span>${rate >= 80 ? '🌟 Consistent' : rate >= 50 ? '⚡ Good Progress' : '🌱 Needs Focus'}</span>
      </div>
    `;

    habitList.appendChild(card);
  });

  // Final Report Button setup
  const btnFinal = document.getElementById('btn-view-final-report');
  btnFinal.onclick = openFinalReportModal;
}

function openFinalReportModal() {
  const stats = calculateStats();
  const modal = document.getElementById('modal-final-report');

  document.getElementById('report-active-days').textContent = `${stats.activeDays} / 100`;
  document.getElementById('report-completed-tasks').textContent = stats.completedTasks;
  document.getElementById('report-longest-streak').textContent = `${stats.longestStreak} Days`;
  document.getElementById('report-overall-rate').textContent = `${stats.overallProgressPct}%`;
  document.getElementById('report-inactive-days').textContent = stats.inactiveDays;

  let grade = 'Master of Discipline 🎖️';
  if (stats.activeDays < 50) grade = 'Promising Starter 🌱';
  else if (stats.activeDays < 80) grade = 'Dedicated Achiever ⚡';

  document.getElementById('report-consistency-grade').textContent = grade;
  modal.classList.add('open');

  const btnClose = document.getElementById('btn-close-final-report');
  btnClose.onclick = () => modal.classList.remove('open');
}

// ============================================================================
// Profile Management (👤 Profile)
// ============================================================================
function setupProfileEvents() {
  const form = document.getElementById('profile-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('profile-name').value.trim();
    const btn = document.getElementById('btn-save-profile');

    setButtonLoading(btn, true);
    try {
      await auth.updateProfile({ displayName: newName });
      if (state.userProfile) state.userProfile.name = newName;
      updateUserGreetings();
      showToast('Profile name updated in Firestore!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

function renderProfileView() {
  if (!state.user) return;
  document.getElementById('profile-name').value = (state.userProfile && state.userProfile.name) || state.user.displayName || '';
  document.getElementById('profile-email').value = state.user.email || '';
  document.getElementById('profile-uid').value = state.user.uid || '';
  
  const createdDate = state.user.createdAt ? new Date(state.user.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }) : '28 Sep 2026';

  document.getElementById('profile-created-at').textContent = createdDate;
}

// ============================================================================
// Date Simulator / Time Machine Controls
// ============================================================================
function setupSimulatorEvents() {
  const sel = document.getElementById('simulator-date-select');
  const customInput = document.getElementById('simulator-custom-date');
  const btnApply = document.getElementById('btn-apply-simulator');
  const btnReset = document.getElementById('btn-reset-simulator');

  sel.addEventListener('change', () => {
    if (sel.value === 'custom') {
      customInput.style.display = 'inline-block';
    } else {
      customInput.style.display = 'none';
    }
  });

  btnApply.addEventListener('click', () => {
    let target = sel.value;
    if (target === 'custom') {
      target = customInput.value;
    }
    setSimulatedDate(target || null);
    refreshChallengeTiming();
    renderDashboard();
    renderTodayChecklist();
    render100DaysGrid();
    renderProgressView();
    showToast(`Time Machine active: ${target ? target : 'Actual IST'}`, 'normal');
  });

  btnReset.addEventListener('click', () => {
    setSimulatedDate(null);
    sel.value = '';
    customInput.style.display = 'none';
    refreshChallengeTiming();
    renderDashboard();
    renderTodayChecklist();
    render100DaysGrid();
    renderProgressView();
    showToast('Reset to actual local time (Asia/Kolkata).', 'normal');
  });
}

// ============================================================================
// Firebase Configuration Modal
// ============================================================================
function setupFirebaseConfigModal() {
  const btnStatus = document.getElementById('firebase-status-btn');
  const btnOpen = document.getElementById('btn-open-firebase-config');
  const modal = document.getElementById('modal-firebase-config');
  const btnClose = document.getElementById('btn-close-fb-config');
  const btnCancel = document.getElementById('btn-cancel-fb-config');
  const btnReset = document.getElementById('btn-reset-fb-config');
  const form = document.getElementById('form-firebase-config');
  const jsonArea = document.getElementById('fb-config-json');

  [btnStatus, btnOpen].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        const cfg = getActiveFirebaseConfig();
        jsonArea.value = JSON.stringify(cfg, null, 2);
        modal.classList.add('open');
      });
    }
  });

  [btnClose, btnCancel].forEach(b => {
    b.addEventListener('click', () => modal.classList.remove('open'));
  });

  btnReset.addEventListener('click', () => {
    resetFirebaseConfig();
    const cfg = getActiveFirebaseConfig();
    jsonArea.value = JSON.stringify(cfg, null, 2);
    showToast('Reset to default Firebase configuration.', 'normal');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(jsonArea.value);
      saveActiveFirebaseConfig(parsed);
      modal.classList.remove('open');
      showToast('Firebase configuration saved and connected!', 'success');
    } catch (err) {
      showToast('Invalid JSON configuration. Please check syntax.', 'error');
    }
  });
}

// Helper to escape HTML characters
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
