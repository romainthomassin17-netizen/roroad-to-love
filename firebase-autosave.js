// =====================================
// SYSTÈME DE SAUVEGARDE AUTOMATIQUE
// =====================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAQOpAvX7SQXVxYbxN5jNd9BH5uYoGnyDM",
  authDomain: "roroad-to-love.firebaseapp.com",
  projectId: "roroad-to-love",
  storageBucket: "roroad-to-love.firebasestorage.app",
  messagingSenderId: "770468867129",
  appId: "1:770468867129:web:8f6709b7205232d4d871e8"
};

// Identifiant partagé du document
const SHARED_DOC_ID = "perla_roro";

// Variables globales
let app, db, auth;
let isSaving = false;
let saveTimeout = null;
let unsubscribeSnapshot = null;

// Initialisation de Firebase
export async function enableAutoSave(initialState) {
  console.log('🚀 Initialisation du système de sauvegarde automatique...');
  
  try {
    // Initialiser Firebase
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Connexion anonyme
    await signInAnonymously(auth);
    console.log('✅ Firebase initialisé et connecté');
    
    // Charger l'état depuis Firestore
    const loadedState = await loadState();
    
    // Fusionner avec l'état initial si nécessaire
    const mergedState = loadedState || initialState;
    
    // Créer un Proxy pour surveiller les changements
    const proxiedState = createProxy(mergedState);
    
    // Activer la surveillance en temps réel
    setupRealtimeSync(proxiedState);
    
    console.log('✅ Sauvegarde automatique activée !');
    
    return proxiedState;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  }
}

// Charger l'état depuis Firestore
async function loadState() {
  try {
    const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log('📥 Données chargées depuis le cloud');
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

// Sauvegarder l'état dans Firestore
async function saveState(state) {
  if (isSaving) {
    console.log('⏭️ Sauvegarde déjà en cours, on attend...');
    return;
  }
  
  isSaving = true;
  showSaveBadge('saving');
  
  try {
    const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
    await setDoc(docRef, state);
    console.log('💾 Sauvegarde réussie !');
    showSaveBadge('saved');
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde:', error);
    showSaveBadge('error');
  } finally {
    isSaving = false;
  }
}

// Créer un Proxy pour surveiller les changements
function createProxy(state) {
  return new Proxy(state, {
    set(target, key, value) {
      target[key] = value;
      
      // Sauvegarder avec un délai pour éviter trop de sauvegardes
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveState(target);
      }, 1000); // Sauvegarde 1 seconde après le dernier changement
      
      return true;
    }
  });
}

// Surveiller les changements en temps réel
function setupRealtimeSync(state) {
  const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
  
  unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const remoteData = docSnap.data();
      
      // Mettre à jour l'état local sans déclencher de sauvegarde
      Object.keys(remoteData).forEach(key => {
        if (JSON.stringify(state[key]) !== JSON.stringify(remoteData[key])) {
          console.log(`🔄 Mise à jour: ${key}`);
          state[key] = remoteData[key];
        }
      });
      
      // Mettre à jour l'UI si nécessaire
      if (typeof window.updateHomeUI === 'function') {
        window.updateHomeUI();
      }
    }
  });
}

// Afficher un badge de sauvegarde
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
  } else if (status === 'saved') {
    badge.innerText = '✅ Sauvegardé';
    badge.style.backgroundColor = '#D1FAE5';
    badge.style.color = '#065F46';
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
    setTimeout(() => {
      badge.style.display = 'none';
    }, 3000);
  }
  
  badge.style.display = 'block';
}
```

4. **Scrollez en bas**
5. **Cliquez sur "Commit changes"**

---

### Étape 3 : Attendre et tester

1. **Attendez 1-2 minutes** (déploiement)
2. **Retournez sur votre application**
3. **Appuyez sur Ctrl+Shift+R** (forcer rechargement)
4. **Ouvrez la console** (F12)

Vous devriez voir :
```
🚀 Initialisation du système de sauvegarde automatique...
✅ Firebase initialisé et connecté
✅ Sauvegarde automatique activée !
✅ Application prête avec sauvegarde automatique !
