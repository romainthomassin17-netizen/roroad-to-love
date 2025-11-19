// =====================================
// SYSTÈME DE SAUVEGARDE AUTOMATIQUE V3
// Avec gestion des conflits par timestamp
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

// =====================================
// 🆕 NOUVEAUX : Variables pour la gestion des conflits
// =====================================
let localChangesPending = false; // Indique si des changements locaux sont en attente

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
    
    // 🆕 CORRECTION : Fusion intelligente des données
    let mergedState;
    
    if (loadedState && loadedState._lastModified) {
      // Des données existent dans Firebase, on les utilise
      console.log('📦 Utilisation des données Firebase existantes');
      mergedState = loadedState;
    } else {
      // Première utilisation, on utilise l'état initial
      console.log('🆕 Première utilisation - initialisation avec état par défaut');
      mergedState = initialState;
      mergedState._lastModified = Date.now();
      mergedState._modifiedBy = 'system';
      
      // 🆕 Sauvegarde immédiate de l'état initial
      await setDoc(doc(db, "RoroadToLove", SHARED_DOC_ID), mergedState);
      console.log('💾 État initial sauvegardé dans Firebase');
    }
    
    const proxiedState = createDeepProxy(mergedState);
    
    setupRealtimeSync(proxiedState);
    
    console.log('✅ Sauvegarde automatique activée avec gestion des conflits !');
    console.log(`📊 Dernière modification: ${new Date(mergedState._lastModified).toLocaleString()} par ${mergedState._modifiedBy}`);
    
    return proxiedState;
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  }
}

// Charger depuis Firestore
async function loadState() {
  try {
    console.log('📥 Tentative de chargement des données depuis Firebase...');
    const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('✅ Données chargées depuis Firebase !');
      console.log(`📊 Dernier modif: ${new Date(data._lastModified).toLocaleString()}`);
      console.log(`👤 Modifié par: ${data._modifiedBy}`);
      console.log(`💕 Points Perla: ${data.players?.perla?.lovePoints || 0}`);
      console.log(`💕 Points Romain: ${data.players?.romain?.lovePoints || 0}`);
      return data;
    } else {
      console.log('📝 Aucune donnée trouvée dans Firebase');
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
    console.log('⏸️ Sauvegarde ignorée (déjà en cours ou chargement distant)');
    return;
  }
  
  isSaving = true;
  localChangesPending = false; // 🆕 Les changements vont être sauvegardés
  showSaveBadge('saving');
  
  try {
    const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
    const stateToSave = JSON.parse(JSON.stringify(state));
    
    // 🆕 AJOUT : Timestamp et auteur pour résoudre les conflits
    stateToSave._lastModified = Date.now();
    stateToSave._modifiedBy = state.currentPlayer || 'system';
    
    console.log(`💾 Sauvegarde par ${stateToSave._modifiedBy} à ${new Date(stateToSave._lastModified).toLocaleTimeString()}`);
    
    await setDoc(docRef, stateToSave);
    console.log('✅ Sauvegarde réussie !');
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
      
      // 🆕 Ignorer les changements venant de Firebase
      if (!isLoadingFromFirebase) {
        localChangesPending = true; // 🆕 Marquer qu'on a des changements locaux
        
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          const root = findRoot(target);
          saveState(root);
        }, 1000); // Attend 1 seconde de "calme" avant de sauvegarder
      }
      
      return true;
    }
  });
}

// Trouver la racine de l'objet
function findRoot(obj) {
  return window.globalState || obj;
}

// 🆕 AMÉLIORATION MAJEURE : Surveiller en temps réel avec gestion des conflits
function setupRealtimeSync(state) {
  const docRef = doc(db, "RoroadToLove", SHARED_DOC_ID);
  
  unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists() && !isSaving) {
      const remoteData = docSnap.data();
      
      // 🆕 VÉRIFICATION : Comparer les timestamps
      const localTimestamp = state._lastModified || 0;
      const remoteTimestamp = remoteData._lastModified || 0;
      
      // 🆕 RÈGLE 1 : Si on a des changements locaux en attente, ne PAS écraser
      if (localChangesPending && saveTimeout) {
        console.log('🛡️ Changements locaux en cours - mise à jour distante ignorée');
        return;
      }
      
      // 🆕 RÈGLE 2 : Accepter seulement si les données distantes sont plus récentes
      if (remoteTimestamp <= localTimestamp) {
        console.log('⏭️ Données distantes plus anciennes ou identiques - ignorées');
        return;
      }
      
      // 🆕 RÈGLE 3 : Les données distantes sont plus récentes, on synchronise
      console.log(`🔄 Synchronisation depuis ${remoteData._modifiedBy} (${new Date(remoteTimestamp).toLocaleTimeString()})`);
      
      isLoadingFromFirebase = true;
      
      Object.keys(remoteData).forEach(key => {
        // Compare uniquement si la valeur a vraiment changé
        if (JSON.stringify(state[key]) !== JSON.stringify(remoteData[key])) {
          console.log(`  ↳ Mise à jour: ${key}`);
          state[key] = remoteData[key];
        }
      });
      
      // 🆕 Rafraîchir l'interface si la fonction existe
      if (typeof window.updateHomeUI === 'function') {
        window.updateHomeUI();
      }
      
      // 🆕 Rafraîchir aussi les autres vues si nécessaire
      if (typeof window.renderTimeline === 'function' && window.globalState?.currentView === 'timeline') {
        window.renderTimeline();
      }
      if (typeof window.renderBank === 'function' && window.globalState?.currentView === 'bank') {
        window.renderBank();
      }
      if (typeof window.renderMailbox === 'function' && window.globalState?.currentView === 'mailbox') {
        window.renderMailbox();
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

// 🆕 BONUS : Fonction pour forcer une synchronisation manuelle (utile pour déboguer)
export async function forceSyncNow() {
  console.log('🔄 Synchronisation manuelle forcée...');
  if (window.globalState) {
    await saveState(window.globalState);
  }
}

// 🆕 BONUS : Fonction pour voir l'état de synchronisation (utile pour déboguer)
export function getSyncStatus() {
  return {
    isSaving,
    isLoadingFromFirebase,
    localChangesPending,
    lastModified: window.globalState?._lastModified,
    modifiedBy: window.globalState?._modifiedBy
  };
}
