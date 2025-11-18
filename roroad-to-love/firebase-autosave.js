/**
 * ============================================
 * SYSTÈME DE SAUVEGARDE AUTOMATIQUE FIREBASE
 * ============================================
 * 
 * Fonctionnalités :
 * - Deep Proxy : Détecte TOUS les changements (même imbriqués)
 * - Debounce : Optimise les sauvegardes (1 toutes les 500ms max)
 * - Indicateur visuel : Badge "Sauvegarde..."
 * - Gestion d'erreurs : Retry automatique
 * - Logs détaillés : Debug facile
 */

// =====================================
// 1. CONFIGURATION
// =====================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAQOpAvX7SQXVxYbxN5jNd9BH5uYoGnyDM",
  authDomain: "roroad-to-love.firebaseapp.com",
  projectId: "roroad-to-love",
  storageBucket: "roroad-to-love.firebasestorage.app",
  messagingSenderId: "770468867129",
  appId: "1:770468867129:web:8f6709b7205232d4d871e8"
};

const SHARED_DOC_ID = "perla_roro";
const DEBOUNCE_DELAY = 500; // 500ms entre chaque sauvegarde
const MAX_RETRIES = 3;

// =====================================
// 2. UTILITAIRES
// =====================================

/**
 * Debounce : Retarde l'exécution d'une fonction
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Deep Proxy : Surveille tous les niveaux d'imbrication
 */
function createDeepProxy(target, onChange) {
  // Si ce n'est pas un objet, retourne tel quel
  if (typeof target !== 'object' || target === null) {
    return target;
  }

  // Si c'est un tableau ou un objet, on le proxyfie
  return new Proxy(target, {
    get(obj, prop) {
      const value = obj[prop];
      // Si la propriété est un objet, on le proxyfie aussi (récursif)
      if (typeof value === 'object' && value !== null) {
        return createDeepProxy(value, onChange);
      }
      return value;
    },

    set(obj, prop, value) {
      const oldValue = obj[prop];
      
      // Si la valeur change, on met à jour et on notifie
      if (oldValue !== value) {
        obj[prop] = value;
        
        // Appel du callback de changement
        onChange({
          path: prop,
          oldValue,
          newValue: value,
          timestamp: Date.now()
        });
      }
      
      return true;
    },

    deleteProperty(obj, prop) {
      if (prop in obj) {
        delete obj[prop];
        onChange({
          path: prop,
          action: 'delete',
          timestamp: Date.now()
        });
      }
      return true;
    }
  });
}

// =====================================
// 3. INDICATEUR VISUEL DE SAUVEGARDE
// =====================================

class SaveIndicator {
  constructor() {
    this.createIndicator();
  }

  createIndicator() {
    // Crée le badge de sauvegarde
    const indicator = document.createElement('div');
    indicator.id = 'save-indicator';
    indicator.innerHTML = `
      <style>
        #save-indicator {
          position: fixed;
          top: 10px;
          right: 10px;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          z-index: 9999;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          display: none;
        }
        #save-indicator.saving {
          background: #FEF3C7;
          color: #92400E;
          display: block;
        }
        #save-indicator.saved {
          background: #D1FAE5;
          color: #065F46;
          display: block;
        }
        #save-indicator.error {
          background: #FEE2E2;
          color: #991B1B;
          display: block;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        #save-indicator.saving {
          animation: pulse 1.5s infinite;
        }
      </style>
      <span id="save-text">💾 Sauvegarde...</span>
    `;
    document.body.appendChild(indicator);
    this.indicator = indicator;
    this.textElement = indicator.querySelector('#save-text');
  }

  show(status, message) {
    this.indicator.className = status;
    this.textElement.textContent = message;

    // Auto-hide après 2 secondes si sauvegardé ou erreur
    if (status === 'saved' || status === 'error') {
      setTimeout(() => {
        this.indicator.style.display = 'none';
      }, 2000);
    }
  }
}

// =====================================
// 4. GESTIONNAIRE DE SAUVEGARDE
// =====================================

class FirebaseAutoSave {
  constructor() {
    this.db = null;
    this.auth = null;
    this.isInitialized = false;
    this.saveQueue = [];
    this.isSaving = false;
    this.retryCount = 0;
    this.indicator = new SaveIndicator();
  }

  /**
   * Initialise Firebase
   */
  async init() {
    try {
      // Import dynamique des modules Firebase
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const { getFirestore, doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const { getAuth, signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

      // Initialisation
      const app = initializeApp(FIREBASE_CONFIG);
      this.db = getFirestore(app);
      this.auth = getAuth(app);

      // Stockage des méthodes Firestore
      this.firestoreMethods = { doc, getDoc, setDoc };

      // Connexion anonyme
      await signInAnonymously(this.auth);

      // Attente de l'authentification
      await new Promise((resolve) => {
        onAuthStateChanged(this.auth, (user) => {
          if (user) {
            console.log('✅ Firebase initialisé et connecté:', user.uid);
            this.isInitialized = true;
            resolve();
          }
        });
      });

      return true;
    } catch (error) {
      console.error('❌ Erreur d\'initialisation Firebase:', error);
      this.indicator.show('error', '❌ Erreur de connexion');
      return false;
    }
  }

  /**
   * Charge les données depuis Firebase
   */
  async load() {
    if (!this.isInitialized) {
      console.warn(⚠️ Firebase non initialisé, chargement impossible');
      return null;
    }

    try {
      const { doc, getDoc } = this.firestoreMethods;
      const docRef = doc(this.db, 'RoroadToLove', SHARED_DOC_ID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        console.log('✅ Données chargées depuis Firebase');
        return docSnap.data();
      } else {
        console.log('ℹ️ Aucune sauvegarde trouvée (premier lancement)');
        return null;
      }
    } catch (error) {
      console.error('❌ Erreur de chargement:', error);
      this.indicator.show('error', '❌ Erreur de chargement');
      return null;
    }
  }

  /**
   * Sauvegarde les données sur Firebase
   */
  async save(data) {
    if (!this.isInitialized) {
      console.warn('⚠️ Firebase non initialisé, sauvegarde impossible');
      return false;
    }

    // Si déjà en train de sauvegarder, ajouter à la queue
    if (this.isSaving) {
      this.saveQueue.push(data);
      return;
    }

    this.isSaving = true;
    this.indicator.show('saving', '💾 Sauvegarde...');

    try {
      const { doc, setDoc } = this.firestoreMethods;
      const docRef = doc(this.db, 'RoroadToLove', SHARED_DOC_ID);
      
      // Nettoyer les données (enlever les fonctions, etc.)
      const cleanData = JSON.parse(JSON.stringify(data));
      
      await setDoc(docRef, cleanData);
      
      console.log('✅ Sauvegarde réussie à', new Date().toLocaleTimeString());
      this.indicator.show('saved', '✅ Sauvegardé');
      this.retryCount = 0;
      
      // Traiter la queue si elle existe
      if (this.saveQueue.length > 0) {
        const nextData = this.saveQueue.pop();
        this.saveQueue = []; // Vider la queue
        this.isSaving = false;
        await this.save(nextData);
      } else {
        this.isSaving = false;
      }

      return true;
    } catch (error) {
      console.error('❌ Erreur de sauvegarde:', error);
      this.isSaving = false;

      // Retry automatique
      if (this.retryCount < MAX_RETRIES) {
        this.retryCount++;
        console.log(`🔄 Tentative ${this.retryCount}/${MAX_RETRIES}...`);
        this.indicator.show('saving', `🔄 Retry ${this.retryCount}...`);
        
        // Attendre 1 seconde avant de réessayer
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.save(data);
      } else {
        this.indicator.show('error', '❌ Échec de sauvegarde');
        this.retryCount = 0;
        return false;
      }
    }
  }

  /**
   * Sauvegarde avec debounce
   */
  debouncedSave = debounce((data) => {
    this.save(data);
  }, DEBOUNCE_DELAY);
}

// =====================================
// 5. FONCTION PRINCIPALE
// =====================================

/**
 * Active la sauvegarde automatique pour un objet d'état
 */
async function enableAutoSave(stateObject) {
  console.log('🚀 Initialisation du système de sauvegarde automatique...');

  // Créer le gestionnaire de sauvegarde
  const autoSave = new FirebaseAutoSave();
  
  // Initialiser Firebase
  const initialized = await autoSave.init();
  if (!initialized) {
    console.error('❌ Impossible d\'activer la sauvegarde automatique');
    return stateObject;
  }

  // Charger les données existantes
  const savedData = await autoSave.load();
  if (savedData) {
    // Fusionner les données sauvegardées avec l'état actuel
    Object.assign(stateObject, savedData);
    console.log('📦 État restauré depuis Firebase');
  }

  // Créer un Deep Proxy qui sauvegarde à chaque changement
  const proxiedState = createDeepProxy(stateObject, (change) => {
    console.log('🔄 Changement détecté:', change.path);
    autoSave.debouncedSave(stateObject);
  });

  console.log('✅ Sauvegarde automatique activée !');
  
  // Exposer le gestionnaire pour debug
  window.autoSaveDebug = {
    forceSave: () => autoSave.save(stateObject),
    forceLoad: () => autoSave.load(),
    getState: () => stateObject
  };

  return proxiedState;
}

// =====================================
// 6. EXPORT
// =====================================

export { enableAutoSave, FirebaseAutoSave, createDeepProxy };