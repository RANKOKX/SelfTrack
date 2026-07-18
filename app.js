// ====== FIREBASE CONFIG ======
const firebaseConfig = {
    apiKey: "AIzaSyDfab21yuMosZneOeg0UyWJ151E8fvMHGs",
    authDomain: "selftrack-f1a0b.firebaseapp.com",
    projectId: "selftrack-f1a0b",
    storageBucket: "selftrack-f1a0b.firebasestorage.app",
    messagingSenderId: "785827170290",
    appId: "1:785827170290:web:7015b60e2f3bf5a5ec0d6b"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
let messaging;

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW error:", err));
}

// Initialiser Messaging après SW
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(() => {
        if (firebase.messaging.isSupported()) {
            messaging = firebase.messaging();
            setupMessaging();
        }
    });
}

// ====== VARIABLES GLOBALES ======
let currentUser = null;
let todayReminders = [];
let currentReminderId = null;
let cameraMode = "back"; // "back" ou "front"
let backPhotoData = null;
let frontPhotoData = null;

// ====== ÉLÉMENTS DOM ======
const loginScreen = document.getElementById("loginScreen");
const mainScreen = document.getElementById("mainScreen");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const cameraBtn = document.getElementById("cameraBtn");
const cameraInput = document.getElementById("cameraInput");
const userName = document.getElementById("userName");
const userPhoto = document.getElementById("userPhoto");
const currentDate = document.getElementById("currentDate");
const photosGrid = document.getElementById("photosGrid");
const statusText = document.getElementById("statusText");
const nextReminderText = document.getElementById("nextReminderText");
const statusBox = document.getElementById("statusBox");
const revealBox = document.getElementById("revealBox");
const revealedPhotos = document.getElementById("revealedPhotos");

// ====== AUTH ======
googleLoginBtn.addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => console.error("Login error:", err));
});

logoutBtn.addEventListener("click", () => {
    auth.signOut().catch(err => console.error("Logout error:", err));
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.remove("active");
        mainScreen.classList.add("active");
        
        userName.textContent = user.displayName || "Utilisateur";
        userPhoto.src = user.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23667eea'/%3E%3C/svg%3E";
        
        updateDateDisplay();
        initializeTodayReminders();
        loadTodayPhotos();
        checkRevealTime();
        
        // Auto-load photos toutes les 30 secondes
        setInterval(loadTodayPhotos, 30000);
        setInterval(checkRevealTime, 60000);
    } else {
        currentUser = null;
        mainScreen.classList.remove("active");
        loginScreen.classList.add("active");
    }
});

// ====== REMINDERS & NOTIFICATIONS ======
function initializeTodayReminders() {
    const today = new Date().toDateString();
    
    db.collection("reminders")
        .where("userId", "==", currentUser.uid)
        .where("date", "==", today)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                // Créer 3 reminders aléatoires pour aujourd'hui
                generateRemindersForToday();
            } else {
                todayReminders = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                updateReminderStatus();
            }
        })
        .catch(err => console.error("Error loading reminders:", err));
}

function generateRemindersForToday() {
    const today = new Date().toDateString();
    const times = generateRandomTimes();
    
    times.forEach((time, index) => {
        db.collection("reminders").add({
            userId: currentUser.uid,
            date: today,
            time: time,
            taken: false,
            backPhotoId: null,
            frontPhotoId: null,
            createdAt: new Date()
        }).then(doc => {
            todayReminders.push({
                id: doc.id,
                userId: currentUser.uid,
                date: today,
                time: time,
                taken: false,
                backPhotoId: null,
                frontPhotoId: null
            });
            
            if (index === 0) updateReminderStatus();
        });
    });
}

function generateRandomTimes() {
    const times = [];
    const startHour = 8;
    const endHour = 20;
    const numReminders = 3;
    
    for (let i = 0; i < numReminders; i++) {
        let randomHour = Math.floor(Math.random() * (endHour - startHour)) + startHour;
        let randomMin = Math.floor(Math.random() * 60);
        times.push(`${String(randomHour).padStart(2, '0')}:${String(randomMin).padStart(2, '0')}`);
    }
    
    return times.sort();
}

function updateReminderStatus() {
    if (!todayReminders.length) return;
    
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const nextReminder = todayReminders.find(r => !r.taken && r.time > currentTime);
    
    if (nextReminder) {
        currentReminderId = nextReminder.id;
        cameraMode = "back";
        backPhotoData = null;
        frontPhotoData = null;
        
        statusText.textContent = `Prochain rappel à ${nextReminder.time}`;
        nextReminderText.textContent = `📍 Vous serez notifiés à ${nextReminder.time}`;
        cameraBtn.style.display = "none";
        cameraBtn.textContent = "📷 Caméra Arrière";
        
        scheduleReminder(nextReminder);
    } else {
        const allTaken = todayReminders.every(r => r.taken);
        if (allTaken) {
            statusText.textContent = "✅ Toutes les photos du jour sont prises!";
            nextReminderText.textContent = "Attendez 20h pour la révélation!";
        } else {
            statusText.textContent = "Prêt pour le dernier rappel!";
        }
        cameraBtn.style.display = "none";
    }
}

function scheduleReminder(reminder) {
    const now = new Date();
    const [hour, min] = reminder.time.split(":");
    const reminderTime = new Date();
    reminderTime.setHours(parseInt(hour), parseInt(min), 0);
    
    if (reminderTime <= now) {
        cameraBtn.style.display = "block";
        showNotification(reminder);
        return;
    }
    
    const delay = reminderTime - now;
    
    setTimeout(() => {
        showNotification(reminder);
        cameraBtn.style.display = "block";
        updateReminderStatus();
    }, delay);
}

function showNotification(reminder) {
    if (messaging) {
        messaging.getToken().then(token => {
            console.log("FCM Token:", token);
        });
    }
    
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("SelfTrack 📸", {
            body: `C'est le moment! Prendre une photo à ${reminder.time}`,
            icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect fill='%23667eea' width='192' height='192'/%3E%3Ctext x='96' y='128' font-size='80' fill='white' text-anchor='middle' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E",
            tag: `reminder-${reminder.id}`,
            requireInteraction: true
        });
    }
}

// ====== CAMERA ======
cameraBtn.addEventListener("click", () => {
    cameraInput.capture = cameraMode === "back" ? "environment" : "user";
    cameraInput.click();
});

cameraInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    cameraBtn.style.display = "none";
    statusText.textContent = "📤 Upload en cours...";
    
    try {
        const timestamp = new Date().getTime();
        const cameraType = cameraMode === "back" ? "back" : "front";
        const filename = `${currentUser.uid}_${timestamp}_${cameraType}.jpg`;
        const photoRef = storage.ref(`photos/${filename}`);
        
        await photoRef.put(file);
        const photoURL = await photoRef.getDownloadURL();
        
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        // Créer le document photo
        const photoDoc = await db.collection("photos").add({
            userId: currentUser.uid,
            url: photoURL,
            time: currentTime,
            date: now.toDateString(),
            cameraType: cameraType,
            reminderId: currentReminderId,
            createdAt: new Date(),
            userName: currentUser.displayName,
            userPhoto: currentUser.photoURL
        });
        
        // Mettre à jour le reminder
        if (cameraMode === "back") {
            backPhotoData = {
                id: photoDoc.id,
                url: photoURL,
                time: currentTime
            };
            
            await db.collection("reminders").doc(currentReminderId).update({
                backPhotoId: photoDoc.id
            });
            
            cameraMode = "front";
            cameraBtn.style.display = "block";
            cameraBtn.textContent = "📷 Selfie Avant";
            statusText.textContent = "✅ Photo arrière prise! Selfie avant maintenant";
            
        } else {
            frontPhotoData = {
                id: photoDoc.id,
                url: photoURL,
                time: currentTime
            };
            
            await db.collection("reminders").doc(currentReminderId).update({
                frontPhotoId: photoDoc.id,
                taken: true
            });
            
            // Chercher le prochain reminder
            const nextReminder = todayReminders.find(r => !r.taken && r.time > `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            
            if (nextReminder) {
                currentReminderId = nextReminder.id;
                cameraMode = "back";
                backPhotoData = null;
                frontPhotoData = null;
                cameraBtn.textContent = "📷 Caméra Arrière";
            }
            
            statusText.textContent = "✅ Paire de photos sauvegardée!";
            cameraBtn.style.display = "none";
            updateReminderStatus();
        }
        
        loadTodayPhotos();
        
    } catch (error) {
        console.error("Error uploading photo:", error);
        statusText.textContent = "❌ Erreur lors de l'upload";
    }
    
    cameraInput.value = "";
});

// ====== LOAD PHOTOS ======
async function loadTodayPhotos() {
    const today = new Date().toDateString();
    
    try {
        const snapshot = await db.collection("photos")
            .where("userId", "==", currentUser.uid)
            .where("date", "==", today)
            .orderBy("createdAt", "desc")
            .get();
        
        if (snapshot.empty) {
            photosGrid.innerHTML = '<p class="empty-message">Aucune photo pour le moment</p>';
            return;
        }
        
        photosGrid.innerHTML = "";
        snapshot.forEach(doc => {
            const photo = doc.data();
            const photoItem = document.createElement("div");
            photoItem.className = "photo-item";
            photoItem.innerHTML = `
                <img src="${photo.url}" alt="Photo">
                <div class="photo-time">${photo.time} - ${photo.cameraType === "back" ? "Arrière" : "Avant"}</div>
            `;
            photosGrid.appendChild(photoItem);
        });
        
    } catch (error) {
        console.error("Error loading photos:", error);
    }
}

// ====== REVEAL AT 20H ======
function checkRevealTime() {
    const now = new Date();
    const hour = now.getHours();
    
    if (hour === 20) {
        revealBox.style.display = "block";
        loadRevealedPhotos();
    } else {
        revealBox.style.display = "none";
    }
}

async function loadRevealedPhotos() {
    const today = new Date().toDateString();
    
    try {
        const snapshot = await db.collection("reminders")
            .where("userId", "==", currentUser.uid)
            .where("date", "==", today)
            .where("taken", "==", true)
            .orderBy("time", "asc")
            .get();
        
        revealedPhotos.innerHTML = "";
        
        if (snapshot.empty) {
            revealedPhotos.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">Pas de photos pour le moment</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const reminder = doc.data();
            
            if (reminder.backPhotoId && reminder.frontPhotoId) {
                // Charger les deux photos
                db.collection("photos").doc(reminder.backPhotoId).get().then(backDoc => {
                    db.collection("photos").doc(reminder.frontPhotoId).get().then(frontDoc => {
                        const backPhoto = backDoc.data();
                        const frontPhoto = frontDoc.data();
                        
                        const revealContainer = document.createElement("div");
                        revealContainer.className = "reveal-container";
                        revealContainer.innerHTML = `
                            <div class="reveal-main">
                                <img src="${backPhoto.url}" alt="Photo arrière" class="reveal-back-photo">
                                <div class="reveal-front-wrapper" onclick="swapPhotos(this)">
                                    <img src="${frontPhoto.url}" alt="Photo avant" class="reveal-front-photo">
                                    <span class="swap-hint">Clic pour échanger</span>
                                </div>
                            </div>
                        `;
                        revealedPhotos.appendChild(revealContainer);
                    });
                });
            }
        });
        
    } catch (error) {
        console.error("Error loading revealed photos:", error);
    }
}

// ====== SWAP PHOTOS ======
function swapPhotos(element) {
    const container = element.closest(".reveal-main");
    const backPhoto = container.querySelector(".reveal-back-photo");
    const frontPhoto = container.querySelector(".reveal-front-photo");
    
    // Échanger les sources
    const tempSrc = backPhoto.src;
    backPhoto.src = frontPhoto.src;
    frontPhoto.src = tempSrc;
    
    // Petite animation
    container.classList.add("swapped");
    setTimeout(() => container.classList.remove("swapped"), 300);
}

// ====== MESSAGING SETUP ======
function setupMessaging() {
    if (!messaging) return;
    
    messaging.getToken({ vapidKey: "YOUR_VAPID_KEY" })
        .then(token => {
            console.log("FCM Token:", token);
            if (currentUser) {
                db.collection("users").doc(currentUser.uid).set(
                    { fcmToken: token },
                    { merge: true }
                ).catch(err => console.log("Error saving token:", err));
            }
        })
        .catch(err => console.error("Error getting FCM token:", err));
    
    messaging.onMessage(payload => {
        console.log("Message reçu:", payload);
    });
}

// ====== UTILS ======
function updateDateDisplay() {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const today = new Date().toLocaleDateString('fr-FR', options);
    currentDate.textContent = today;
}

if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            console.log("Notifications autorisées");
        }
    });
}

// ====== INIT ======
window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then(() => {
            console.log("Service Worker prêt");
        });
    }
});
