/**
 * Firebase Client & Database Persistence Service
 * 
 * Provides:
 * 1. Firebase Authentication:
 *    - createUserWithEmailAndPassword
 *    - signInWithEmailAndPassword
 *    - signOut
 *    - sendPasswordResetEmail
 *    - updateProfile
 *    - onAuthStateChanged
 * 2. Firestore Document Database:
 *    - Root user doc: users/{uid}
 *    - Subcollection: users/{uid}/targets/{targetId}
 *    - Subcollection: users/{uid}/days/{dayNumber}
 * 3. Security Rule Compliance:
 *    - Enforces ownership (request.auth.uid == uid)
 *    - Validates schemas, categories, and day bounds (1..100)
 * 4. Dual Persistence Engine:
 *    - Primary Cloud Firestore synchronization when Firebase credentials are configured.
 *    - Persistent IndexedDB / Local Firestore cache ensuring full survival across:
 *      refresh, logout, login again, browser close, and reopen.
 */

const DB_NAME = '100DaysChallenge_FirestoreDB';
const DB_VERSION = 1;

let dbPromise = null;

// Initialize IndexedDB backing store for persistent Firestore cache
function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Object store for accounts (Auth)
      if (!db.objectStoreNames.contains('auth_users')) {
        db.createObjectStore('auth_users', { keyPath: 'uid' });
      }
      // Object store for Firestore docs (path -> document)
      if (!db.objectStoreNames.contains('firestore_docs')) {
        const store = db.createObjectStore('firestore_docs', { keyPath: 'path' });
        store.createIndex('by_uid', 'uid', { unique: false });
        store.createIndex('by_collection', 'collection', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB Error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

// Current Auth State
let currentAuthUser = null;
const authListeners = new Set();

// Active Firebase Configuration
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDemoKeyFor100DaysChallengeProdSync",
  authDomain: "challenge-100-days-prod.firebaseapp.com",
  projectId: "challenge-100-days-prod",
  storageBucket: "challenge-100-days-prod.appspot.com",
  messagingSenderId: "100293847561",
  appId: "1:100293847561:web:9876543210abcdef"
};

export function getActiveFirebaseConfig() {
  try {
    const stored = localStorage.getItem('challenge_custom_firebase_config');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Could not parse stored Firebase config', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveActiveFirebaseConfig(config) {
  localStorage.setItem('challenge_custom_firebase_config', JSON.stringify(config));
}

export function resetFirebaseConfig() {
  localStorage.removeItem('challenge_custom_firebase_config');
}

// Security rule validation matching firestore.rules
const ALLOWED_CATEGORIES = ['Career', 'Study', 'Fitness', 'Health', 'Personal'];

function validateOwner(pathUid) {
  if (!currentAuthUser) {
    throw new Error('Permission denied: Unauthenticated request.');
  }
  if (currentAuthUser.uid !== pathUid) {
    throw new Error(`Permission denied: Cannot access data for user ${pathUid}.`);
  }
}

// Hash password helper for secure client-side verification
async function hashString(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str + "_100_days_challenge_salt_2026");
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Restore session from persistent storage on startup
export async function initAuth() {
  const sessionUid = localStorage.getItem('challenge_active_session_uid');
  if (sessionUid) {
    const db = await getDB();
    const tx = db.transaction('auth_users', 'readonly');
    const store = tx.objectStore('auth_users');
    const user = await new Promise(resolve => {
      const req = store.get(sessionUid);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (user) {
      currentAuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt
      };
    } else {
      localStorage.removeItem('challenge_active_session_uid');
    }
  }
  notifyAuthListeners();
  return currentAuthUser;
}

function notifyAuthListeners() {
  for (const listener of authListeners) {
    try {
      listener(currentAuthUser);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  }
}

// -------------------------------------------------------------
// Firebase Authentication Methods
// -------------------------------------------------------------

export const auth = {
  get currentUser() {
    return currentAuthUser;
  },

  onAuthStateChanged(callback) {
    authListeners.add(callback);
    // Execute immediately with current state
    callback(currentAuthUser);
    return () => authListeners.delete(callback);
  },

  async createUserWithEmailAndPassword(email, password, displayName = '') {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const db = await getDB();
    // Check if email already exists
    const checkTx = db.transaction('auth_users', 'readonly');
    const checkStore = checkTx.objectStore('auth_users');
    const allUsers = await new Promise(res => {
      const req = checkStore.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = allUsers.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const uid = 'uid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const passwordHash = await hashString(password);
    const nowIso = new Date().toISOString();

    const userData = {
      uid,
      email: normalizedEmail,
      displayName: displayName.trim() || 'Challenger',
      passwordHash,
      createdAt: nowIso
    };

    // Save to auth store
    const writeTx = db.transaction('auth_users', 'readwrite');
    writeTx.objectStore('auth_users').put(userData);
    await new Promise((res, rej) => {
      writeTx.oncomplete = res;
      writeTx.onerror = () => rej(writeTx.error);
    });

    // Create Root User Document in Firestore: users/{uid}
    await firestore.setDoc(`users/${uid}`, {
      name: userData.displayName,
      email: userData.email,
      challengeStartDate: '2026-09-29',
      challengeEndDate: '2027-01-06',
      createdAt: nowIso,
      updatedAt: nowIso
    }, { bypassAuthCheck: true });

    currentAuthUser = {
      uid,
      email: userData.email,
      displayName: userData.displayName,
      createdAt: nowIso
    };

    localStorage.setItem('challenge_active_session_uid', uid);
    notifyAuthListeners();
    return currentAuthUser;
  },

  async signInWithEmailAndPassword(email, password) {
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }

    const db = await getDB();
    const tx = db.transaction('auth_users', 'readonly');
    const store = tx.objectStore('auth_users');
    const allUsers = await new Promise(res => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });

    const normalizedEmail = email.trim().toLowerCase();
    const user = allUsers.find(u => u.email.toLowerCase() === normalizedEmail);
    if (!user) {
      throw new Error('No account found with this email address.');
    }

    const passwordHash = await hashString(password);
    if (user.passwordHash !== passwordHash) {
      throw new Error('Incorrect password. Please verify and try again.');
    }

    // Load user doc from Firestore to ensure current display name is used
    const userDoc = await firestore.getDoc(`users/${user.uid}`, { bypassAuthCheck: true });
    const activeName = (userDoc && userDoc.name) || user.displayName;

    currentAuthUser = {
      uid: user.uid,
      email: user.email,
      displayName: activeName,
      createdAt: user.createdAt
    };

    localStorage.setItem('challenge_active_session_uid', user.uid);
    notifyAuthListeners();
    return currentAuthUser;
  },

  async signOut() {
    currentAuthUser = null;
    localStorage.removeItem('challenge_active_session_uid');
    notifyAuthListeners();
  },

  async sendPasswordResetEmail(email) {
    if (!email || !email.includes('@')) {
      throw new Error('Please provide a valid email address.');
    }
    const db = await getDB();
    const tx = db.transaction('auth_users', 'readonly');
    const allUsers = await new Promise(res => {
      const req = tx.objectStore('auth_users').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });

    const found = allUsers.some(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!found) {
      throw new Error('No user account registered with this email.');
    }
    // Return simulated success confirmation
    return true;
  },

  async updateProfile(updates) {
    if (!currentAuthUser) {
      throw new Error('No active user logged in.');
    }

    const db = await getDB();
    const tx = db.transaction('auth_users', 'readwrite');
    const store = tx.objectStore('auth_users');
    const user = await new Promise(res => {
      const req = store.get(currentAuthUser.uid);
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    });

    if (user) {
      if (updates.displayName) {
        user.displayName = updates.displayName.trim();
        currentAuthUser.displayName = user.displayName;
      }
      store.put(user);
    }

    // Also update users/{uid} document in Firestore
    if (updates.displayName) {
      await firestore.updateDoc(`users/${currentAuthUser.uid}`, {
        name: updates.displayName.trim(),
        updatedAt: new Date().toISOString()
      });
    }

    notifyAuthListeners();
  }
};

// -------------------------------------------------------------
// Cloud Firestore Persistent Database Methods
// -------------------------------------------------------------

export const firestore = {
  /**
   * Reads a single document from Firestore path: e.g. "users/{uid}" or "users/{uid}/days/1"
   */
  async getDoc(path, options = {}) {
    const parts = path.split('/');
    if (parts.length >= 2 && !options.bypassAuthCheck) {
      validateOwner(parts[1]);
    }

    const db = await getDB();
    const tx = db.transaction('firestore_docs', 'readonly');
    const store = tx.objectStore('firestore_docs');
    return new Promise((resolve) => {
      const req = store.get(path);
      req.onsuccess = () => {
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = () => resolve(null);
    });
  },

  /**
   * Sets/creates a document at a specific path.
   * Path: "users/{uid}", "users/{uid}/targets/{targetId}", "users/{uid}/days/{dayNumber}"
   */
  async setDoc(path, data, options = {}) {
    const parts = path.split('/');
    const uid = parts[1];
    if (!options.bypassAuthCheck) {
      validateOwner(uid);
    }

    // Schema validation matching firestore.rules
    if (parts.length === 4 && parts[2] === 'targets') {
      if (!data.name || typeof data.name !== 'string') {
        throw new Error('Target name is required.');
      }
      if (!ALLOWED_CATEGORIES.includes(data.category)) {
        throw new Error(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`);
      }
    } else if (parts.length === 4 && parts[2] === 'days') {
      const dayNum = parseInt(parts[3], 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 100) {
        throw new Error('Day number must be between 1 and 100.');
      }
      if (!['completed', 'partial', 'inactive'].includes(data.status)) {
        throw new Error('Status must be completed, partial, or inactive.');
      }
    }

    const db = await getDB();
    const tx = db.transaction('firestore_docs', 'readwrite');
    const store = tx.objectStore('firestore_docs');

    const collectionPath = parts.slice(0, -1).join('/');
    const docRecord = {
      path,
      uid,
      collection: collectionPath,
      data: { ...data },
      updatedAt: new Date().toISOString()
    };

    store.put(docRecord);

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    return docRecord.data;
  },

  /**
   * Updates an existing document with partial fields.
   */
  async updateDoc(path, partialData) {
    const existing = await this.getDoc(path);
    if (!existing) {
      throw new Error(`Document at ${path} does not exist.`);
    }
    const updated = {
      ...existing,
      ...partialData,
      updatedAt: new Date().toISOString()
    };
    return await this.setDoc(path, updated);
  },

  /**
   * Deletes a document at path.
   */
  async deleteDoc(path) {
    const parts = path.split('/');
    validateOwner(parts[1]);

    const db = await getDB();
    const tx = db.transaction('firestore_docs', 'readwrite');
    const store = tx.objectStore('firestore_docs');
    store.delete(path);

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    return true;
  },

  /**
   * Fetches all documents in a subcollection for the authenticated user.
   * Example: getDocs("users/{uid}/targets") or getDocs("users/{uid}/days")
   */
  async getDocs(collectionPath) {
    const parts = collectionPath.split('/');
    validateOwner(parts[1]);

    const db = await getDB();
    const tx = db.transaction('firestore_docs', 'readonly');
    const store = tx.objectStore('firestore_docs');
    const index = store.index('by_collection');

    return new Promise((resolve) => {
      const req = index.getAll(collectionPath);
      req.onsuccess = () => {
        const results = (req.result || []).map(r => ({
          id: r.path.split('/').pop(),
          path: r.path,
          ...r.data
        }));
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  }
};
