// =====================================
// SYSTÈME DE SAUVEGARDE AUTOMATIQUE V2
// =====================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAQOpAvX7SQXVxYbxN5jNd9BH5uYoGnyDM",
  authDomain: "roroad-to-love.firebaseapp.com",
  projectId: "roroad-to-love",
  storageBucket: "roroad-to-love.firebasestorage.app",
  messagingSenderId: "770468867129",
  appId: "1:770468867129:web:8f6709b7205232d4d871e8"
};

const SHARED_DOC_ID = "perla_roro";

let app, db, auth;
let isSaving = false;
let saveTimeout = null;
let unsubscribeSnapshot = null;
let isLoadingFromFirebase = false;

// Initialisation
export async function enableAutoSave(initialState) {
  console.log('🚀 Initialisation du système de sauvegarde automatique...');
  
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    await signInAnonymously(auth);
    console.log('✅ Firebase initialisé et connecté');
    
    const loadedState = await loadState();
    const mergedState = loadedState || initialState;
    
    const proxiedState = createDeepProxy(mergedState);
    
    setupRealtimeSync(proxiedState);
    
    console.log('✅ Sauvegarde automatique activée !');
    
    return proxiedState;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  }
}

// Charger depuis Firestore
async function loadState() {
  try {
    const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log('📥 Données chargées depuis Firebase');
      return docSnap.data();
    } else {
      console.log('📝 Première utilisation - aucune donnée existante');
      return null;
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement:', error);
    return null;
  }
}

// Sauvegarder dans Firestore
async function saveState(state) {
  if (isSaving || isLoadingFromFirebase) {
    return;
  }
  
  isSaving = true;
  showSaveBadge('saving');
  
  try {
    const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
    const stateToSave = JSON.parse(JSON.stringify(state));
    await setDoc(docRef, stateToSave);
    console.log('💾 Sauvegarde réussie !');
    showSaveBadge('saved');
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error);
    showSaveBadge('error');
  } finally {
    isSaving = false;
  }
}

// Créer un Deep Proxy (surveille TOUT, même les objets imbriqués)
function createDeepProxy(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => createDeepProxy(item));
  }
  
  const proxied = {};
  
  for (const key in obj) {
    proxied[key] = createDeepProxy(obj[key]);
  }
  
  return new Proxy(proxied, {
    set(target, key, value) {
      target[key] = createDeepProxy(value);
      
      if (!isLoadingFromFirebase) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          const root = findRoot(target);
          saveState(root);
        }, 1000);
      }
      
      return true;
    }
  });
}

// Trouver la racine de l'objet
function findRoot(obj) {
  return window.globalState || obj;
}

// Surveiller en temps réel
function setupRealtimeSync(state) {
  const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
  
  unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists() && !isSaving) {
      isLoadingFromFirebase = true;
      const remoteData = docSnap.data();
      
      Object.keys(remoteData).forEach(key => {
        if (JSON.stringify(state[key]) !== JSON.stringify(remoteData[key])) {
          console.log(`🔄 Mise à jour: ${key}`);
          state[key] = remoteData[key];
        }
      });
      
      if (typeof window.updateHomeUI === 'function') {
        window.updateHomeUI();
      }
      
      isLoadingFromFirebase = false;
    }
  });
}

// Badge de sauvegarde
function showSaveBadge(status) {
  let badge = document.getElementById('save-badge');
  
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'save-badge';
    badge.style.position = 'fixed';
    badge.style.top = '20px';
    badge.style.right = '20px';
    badge.style.padding = '8px 16px';
    badge.style.borderRadius = '20px';
    badge.style.fontSize = '14px';
    badge.style.fontWeight = 'bold';
    badge.style.zIndex = '9999';
    badge.style.transition = 'all 0.3s ease';
    document.body.appendChild(badge);
  }
  
  if (status === 'saving') {
    badge.innerText = '💾 Sauvegarde...';
    badge.style.backgroundColor = '#FEF3C7';
    badge.style.color = '#92400E';
    badge.style.display = 'block';
  } else if (status === 'saved') {
    badge.innerText = '✅ Sauvegardé';
    badge.style.backgroundColor = '#D1FAE5';
    badge.style.color = '#065F46';
    badge.style.display = 'block';
    setTimeout(() => {
      badge.style.opacity = '0';
      setTimeout(() => {
        badge.style.opacity = '1';
        badge.style.display = 'none';
      }, 300);
    }, 2000);
  } else if (status === 'error') {
    badge.innerText = '❌ Erreur';
    badge.style.backgroundColor = '#FEE2E2';
    badge.style.color = '#991B1B';
    badge.style.display = 'block';
    setTimeout(() => {
      badge.style.display = 'none';
    }, 3000);
  }
}
