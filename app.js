// ====== FIREBASE CONFIG ======
const firebaseConfig = {
    apiKey: "AIzaSyDfab21yuMosZneOeg0UyWJ151E8fvMHGs",
    authDomain: "selftrack-f1a0b.firebaseapp.com",
    projectId: "selftrack-f1a0b",
    storageBucket: "selftrack-f1a0b.firebasestorage.app",
    messagingSenderId: "785827170290",
    appId: "1:785827170290:web:7015b60e2f3bf5a5ec0d6b"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
let messaging;

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW error:", err));
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(() => {
        if (firebase.messaging.isSupported()) {
            messaging = firebase.messaging();
            setupMessaging();
        }
    });
}

// ====== VARIABLES ======
let currentUser = null;
let todayReminders = [];
let currentReminderId = null;
let cameraMode = "back";
let todaySchedule = [];
let revealPhotos = [];
let currentStoryIndex = 0;

// ====== DOM ======
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
const revealBox = document.getElementById("revealBox");

// Navigation
const navBtns = document.querySelectorAll(".nav-btn");
const tabs = document.querySelectorAll(".tab");

// Stories
const storiesContainer = document.getElementById("storiesContainer");
const storyImage = document.getElementById("storyImage");
const storySwapBtn = document.getElementById("storySwapBtn");
const storyUserName = document.getElementById("storyUserName");
const storyUserPhoto = document.getElementById("storyUserPhoto");
const storyCounter = document.getElementById("storyCounter");
const storiesPrev = document.getElementById("storiesPrev");
const storiesNext = document.getElementById("storiesNext");

// Friends
const friendEmailInput = document.getElementById("friendEmailInput");
const searchFriendBtn = document.getElementById("searchFriendBtn");
const searchResultBox = document.getElementById("searchResultBox");
const invitationsList = document.getElementById("invitationsList");
const friendsList = document.getElementById("friendsList");

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
        userPhoto.src = user.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23000'/%3E%3C/svg%3E";
        
        // Initialize user in database
        await db.collection("users").doc(user.uid).set({
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL
        }, { merge: true });
        
        updateDateDisplay();
        generateOrLoadTodaySchedule();
        loadTodayPhotos();
        checkRevealTime();
        loadInvitations();
        loadFriends();
        
        setInterval(loadTodayPhotos, 30000);
        setInterval(checkRevealTime, 60000);
        setInterval(loadInvitations, 60000);
        setInterval(loadFriends, 60000);
    } else {
        currentUser = null;
        mainScreen.classList.remove("active");
        loginScreen.classList.add("active");
    }
});

// ====== HORAIRES CENTRALISÉS ======
async function generateOrLoadTodaySchedule() {
    const today = new Date().toDateString();
    
    try {
        const scheduleDoc = await db.collection("schedules").doc(today).get();
        
        if (!scheduleDoc.exists) {
            // Générer les horaires à 7h du matin
            const now = new Date();
            if (now.getHours() >= 7) {
                // Après 7h, générer directement
                generateDailySchedule(today);
            } else {
                // Avant 7h, attendre 7h
                const timeUntil7am = new Date();
                timeUntil7am.setHours(7, 0, 0, 0);
                const delay = timeUntil7am - now;
                
                setTimeout(() => generateDailySchedule(today), delay);
                statusText.textContent = "Horaires générés à 7h du matin!";
            }
        } else {
            // Charger les horaires du jour
            todaySchedule = scheduleDoc.data().times;
            initializeTodayReminders();
        }
    } catch (error) {
        console.error("Error with schedule:", error);
    }
}

async function generateDailySchedule(today) {
    const times = generateRandomTimes();
    
    // Sauvegarder dans la collection globale
    await db.collection("schedules").doc(today).set({
        times: times,
        generatedAt: new Date()
    });
    
    todaySchedule = times;
    initializeTodayReminders();
}

function generateRandomTimes() {
    const times = [];
    const startHour = 8;
    const endHour = 20;
    const numReminders = 3;
    const minGap = 30; // minutes
    
    let lastHour = startHour;
    let lastMin = 0;
    
    for (let i = 0; i < numReminders; i++) {
        const minTime = lastHour * 60 + lastMin + minGap;
        const maxTime = endHour * 60;
        
        if (minTime >= maxTime) break;
        
        const randomMinutes = Math.floor(Math.random() * (maxTime - minTime)) + minTime;
        const hour = Math.floor(randomMinutes / 60);
        const min = randomMinutes % 60;
        
        times.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
        
        lastHour = hour;
        lastMin = min;
    }
    
    return times;
}

// ====== REMINDERS ======
async function initializeTodayReminders() {
    const today = new Date().toDateString();
    
    try {
        const snapshot = await db.collection("reminders")
            .where("userId", "==", currentUser.uid)
            .where("date", "==", today)
            .get();
        
        if (snapshot.empty) {
            // Créer les reminders pour les horaires du jour
            for (let time of todaySchedule) {
                await db.collection("reminders").add({
                    userId: currentUser.uid,
                    date: today,
                    time: time,
                    taken: false,
                    backPhotoId: null,
                    frontPhotoId: null,
                    missed: false,
                    createdAt: new Date()
                });
            }
            
            // Recharger
            const newSnapshot = await db.collection("reminders")
                .where("userId", "==", currentUser.uid)
                .where("date", "==", today)
                .get();
            
            todayReminders = newSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } else {
            todayReminders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        }
        
        updateReminderStatus();
    } catch (error) {
        console.error("Error initializing reminders:", error);
    }
}

function updateReminderStatus() {
    if (!todayReminders.length) return;
    
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const nextReminder = todayReminders.find(r => !r.taken && !r.missed && r.time > currentTime);
    
    if (nextReminder) {
        currentReminderId = nextReminder.id;
        cameraMode = "back";
        
        statusText.textContent = `Prochain rappel à ${nextReminder.time}`;
        nextReminderText.textContent = `📍 Vous serez notifiés à ${nextReminder.time}`;
        cameraBtn.style.display = "none";
        
        scheduleReminder(nextReminder);
    } else {
        const allDone = todayReminders.every(r => r.taken || r.missed);
        if (allDone) {
            statusText.textContent = "✅ Photos du jour terminées!";
        }
        cameraBtn.style.display = "none";
    }
}

function scheduleReminder(reminder) {
    const now = new Date();
    const [hour, min] = reminder.time.split(":");
    const reminderTime = new Date();
    reminderTime.setHours(parseInt(hour), parseInt(min), 0);
    
    // Si le temps est passé et on peut encore prendre la photo (15 min après)
    const fifteenMinAfter = new Date(reminderTime);
    fifteenMinAfter.setMinutes(fifteenMinAfter.getMinutes() + 15);
    
    if (now > fifteenMinAfter) {
        // Trop tard, marquer comme manquée
        db.collection("reminders").doc(reminder.id).update({ missed: true });
        updateReminderStatus();
        return;
    }
    
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
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("SelfTrack 📸", {
            body: `C'est le moment! Prendre une photo (15 min pour le faire)`,
            icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect fill='%23000' width='192' height='192'/%3E%3Ctext x='96' y='128' font-size='80' fill='white' text-anchor='middle' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E",
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
        
        if (cameraMode === "back") {
            await db.collection("reminders").doc(currentReminderId).update({
                backPhotoId: photoDoc.id
            });
            
            cameraMode = "front";
            cameraBtn.style.display = "block";
            statusText.textContent = "✅ Selfie avant maintenant";
            
        } else {
            await db.collection("reminders").doc(currentReminderId).update({
                frontPhotoId: photoDoc.id,
                taken: true
            });
            
            const nextReminder = todayReminders.find(r => !r.taken && !r.missed);
            
            if (nextReminder) {
                currentReminderId = nextReminder.id;
                cameraMode = "back";
            }
            
            statusText.textContent = "✅ Photos sauvegardées!";
            cameraBtn.style.display = "none";
            updateReminderStatus();
        }
        
        loadTodayPhotos();
        
    } catch (error) {
        console.error("Error uploading photo:", error);
        statusText.textContent = "❌ Erreur";
    }
    
    cameraInput.value = "";
});

// ====== PHOTOS ======
async function loadTodayPhotos() {
    const today = new Date().toDateString();
    
    try {
        const snapshot = await db.collection("photos")
            .where("userId", "==", currentUser.uid)
            .where("date", "==", today)
            .orderBy("createdAt", "desc")
            .get();
        
        if (snapshot.empty) {
            photosGrid.innerHTML = '<p class="empty-message">Aucune photo</p>';
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

// ====== STORIES RÉVÉLATION 20H ======
function checkRevealTime() {
    const now = new Date();
    const hour = now.getHours();
    
    if (hour === 20) {
        revealBox.style.display = "block";
        loadRevealStories();
    } else {
        revealBox.style.display = "none";
    }
}

async function loadRevealStories() {
    const today = new Date().toDateString();
    
    try {
        // Récupérer tous les reminders du jour (pour les amis)
        const friendsSnapshot = await db.collection("users")
            .doc(currentUser.uid)
            .collection("friends")
            .get();
        
        revealPhotos = [];
        
        // Pour chaque ami
        for (const friendDoc of friendsSnapshot.docs) {
            const friend = friendDoc.data();
            
            // Récupérer ses reminders du jour
            const remindersSnapshot = await db.collection("reminders")
                .where("userId", "==", friend.uid)
                .where("date", "==", today)
                .where("taken", "==", true)
                .get();
            
            remindersSnapshot.forEach(reminderDoc => {
                const reminder = reminderDoc.data();
                if (reminder.backPhotoId && reminder.frontPhotoId) {
                    revealPhotos.push({
                        friendId: friend.uid,
                        friendName: friend.displayName,
                        friendPhoto: friend.photoURL,
                        backPhotoId: reminder.backPhotoId,
                        frontPhotoId: reminder.frontPhotoId,
                        time: reminder.time
                    });
                }
            });
        }
        
        if (revealPhotos.length > 0) {
            currentStoryIndex = 0;
            showStory(0);
            storiesContainer.style.display = "block";
        } else {
            storiesContainer.innerHTML = '<p>Aucune photo pour le moment</p>';
        }
        
    } catch (error) {
        console.error("Error loading stories:", error);
    }
}

async function showStory(index) {
    if (index < 0 || index >= revealPhotos.length) return;
    
    currentStoryIndex = index;
    const story = revealPhotos[index];
    
    // Charger les photos
    const backPhoto = await db.collection("photos").doc(story.backPhotoId).get();
    const frontPhoto = await db.collection("photos").doc(story.frontPhotoId).get();
    
    storyUserName.textContent = story.friendName;
    storyUserPhoto.src = story.friendPhoto;
    storyImage.src = backPhoto.data().url;
    storyImage.dataset.frontUrl = frontPhoto.data().url;
    storyImage.dataset.isSwapped = "false";
    storySwapBtn.innerHTML = "📷"; // Reset swap state
    
    storyCounter.textContent = `${index + 1}/${revealPhotos.length}`;
    
    // Navigation
    storiesPrev.style.display = index === 0 ? "none" : "block";
    storiesNext.style.display = index === revealPhotos.length - 1 ? "none" : "block";
}

storiesPrev.addEventListener("click", () => showStory(currentStoryIndex - 1));
storiesNext.addEventListener("click", () => showStory(currentStoryIndex + 1));

storySwapBtn.addEventListener("click", () => {
    const isSwapped = storyImage.dataset.isSwapped === "true";
    
    if (isSwapped) {
        // Retourner à la photo arrière
        storyImage.src = revealPhotos[currentStoryIndex].backPhotoId;
        storyImage.dataset.isSwapped = "false";
    } else {
        // Aller à la photo avant
        storyImage.src = storyImage.dataset.frontUrl;
        storyImage.dataset.isSwapped = "true";
    }
});

// ====== SYSTEM D'AMIS PAR EMAIL ======
searchFriendBtn.addEventListener("click", async () => {
    const displayName = friendEmailInput.value.trim().toLowerCase();
    if (!displayName) {
        alert("Tape le nom de ton ami!");
        return;
    }
    
    try {
        const usersSnapshot = await db.collection("users")
            .get(); // Récupère TOUS les users
        
        searchResultBox.innerHTML = "";
        
        // Cherche le matching par nom (flexible)
        const matches = usersSnapshot.docs.filter(doc => 
            doc.data().displayName.toLowerCase().includes(displayName)
        );
        
        if (matches.length === 0) {
            searchResultBox.innerHTML = '<p class="empty-message">Utilisateur non trouvé</p>';
            return;
        }
        
        // Affiche tous les résultats
        matches.forEach(userDoc => {
            const user = userDoc.data();
            const userId = userDoc.id;
            
            if (userId === currentUser.uid) return; // Skip toi-même
            
            const resultDiv = document.createElement("div");
            resultDiv.className = "search-result";
            resultDiv.innerHTML = `
                <img src="${user.photoURL || 'data:image/svg+xml'}" alt="${user.displayName}" class="result-avatar">
                <div class="result-info">
                    <p class="result-name">${user.displayName}</p>
                    <p class="result-email">${user.email}</p>
                </div>
                <button class="btn-invite" onclick="sendFriendRequest('${userId}', '${user.displayName}')">✓ Inviter</button>
            `;
            
            searchResultBox.appendChild(resultDiv);
        });
        
    } catch (error) {
        console.error("Error searching:", error);
        searchResultBox.innerHTML = '<p class="empty-message">Erreur</p>';
    }
});
        
        const userDoc = usersSnapshot.docs[0];
        const user = userDoc.data();
        const userId = userDoc.id;
        
        if (userId === currentUser.uid) {
            searchResultBox.innerHTML = '<p class="empty-message">C\'est toi!</p>';
            return;
        }
        
        // Créer le div de résultat
        const resultDiv = document.createElement("div");
        resultDiv.className = "search-result";
        resultDiv.innerHTML = `
            <img src="${user.photoURL || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 48 48%27%3E%3Ccircle cx=%2724%27 cy=%2724%27 r=%2724%27 fill=%27%23999%27/%3E%3C/svg%3E'}" alt="${user.displayName}" class="result-avatar">
            <div class="result-info">
                <p class="result-name">${user.displayName || "Sans nom"}</p>
                <p class="result-email">${user.email}</p>
            </div>
            <button class="btn-invite" onclick="sendFriendRequest('${userId}', '${user.displayName}')">✓ Inviter</button>
        `;
        
        searchResultBox.appendChild(resultDiv);
        
    } catch (error) {
        console.error("Error searching:", error);
        searchResultBox.innerHTML = '<p class="empty-message">Erreur lors de la recherche</p>';
    }
});

async function sendFriendRequest(friendId, friendName) {
    try {
        await db.collection("users")
            .doc(friendId)
            .collection("invitations")
            .add({
                fromId: currentUser.uid,
                fromName: currentUser.displayName,
                fromPhoto: currentUser.photoURL,
                fromEmail: currentUser.email,
                createdAt: new Date(),
                status: "pending"
            });
        
        alert(`Invitation envoyée à ${friendName}!`);
        friendEmailInput.value = "";
        searchResultBox.innerHTML = "";
        
    } catch (error) {
        console.error("Error sending invitation:", error);
    }
}

// ====== INVITATIONS ======
async function loadInvitations() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection("users")
            .doc(currentUser.uid)
            .collection("invitations")
            .where("status", "==", "pending")
            .get();
        
        invitationsList.innerHTML = "";
        
        if (snapshot.empty) {
            invitationsList.innerHTML = '<p class="empty-message">Aucune invitation</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const invitation = doc.data();
            const inviteItem = document.createElement("div");
            inviteItem.className = "invite-item";
            inviteItem.innerHTML = `
                <img src="${invitation.fromPhoto}" alt="${invitation.fromName}" class="invite-avatar">
                <div class="invite-info">
                    <p class="invite-name">${invitation.fromName}</p>
                    <p class="invite-email">${invitation.fromEmail}</p>
                </div>
                <div class="invite-actions">
                    <button class="btn-accept" onclick="acceptInvitation('${doc.id}', '${invitation.fromId}', '${invitation.fromName}')">✓</button>
                    <button class="btn-refuse" onclick="refuseInvitation('${doc.id}')">✕</button>
                </div>
            `;
            invitationsList.appendChild(inviteItem);
        });
        
    } catch (error) {
        console.error("Error loading invitations:", error);
    }
}

async function acceptInvitation(inviteId, friendId, friendName) {
    try {
        const friendDoc = await db.collection("users").doc(friendId).get();
        const friendData = friendDoc.data();
        
        // Ajouter aux amis
        await db.collection("users").doc(currentUser.uid).collection("friends").doc(friendId).set({
            uid: friendId,
            displayName: friendData.displayName,
            email: friendData.email,
            photoURL: friendData.photoURL,
            addedAt: new Date()
        });
        
        // Marquer l'invitation comme acceptée
        await db.collection("users")
            .doc(currentUser.uid)
            .collection("invitations")
            .doc(inviteId)
            .update({ status: "accepted" });
        
        loadInvitations();
        loadFriends();
        alert(`${friendName} ajouté!`);
        
    } catch (error) {
        console.error("Error accepting invitation:", error);
    }
}

async function refuseInvitation(inviteId) {
    try {
        await db.collection("users")
            .doc(currentUser.uid)
            .collection("invitations")
            .doc(inviteId)
            .update({ status: "refused" });
        
        loadInvitations();
    } catch (error) {
        console.error("Error refusing invitation:", error);
    }
}

// ====== FRIENDS ======
async function loadFriends() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection("users")
            .doc(currentUser.uid)
            .collection("friends")
            .get();
        
        friendsList.innerHTML = "";
        
        if (snapshot.empty) {
            friendsList.innerHTML = '<p class="empty-message">Aucun ami</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const friend = doc.data();
            const friendItem = document.createElement("div");
            friendItem.className = "friend-item";
            friendItem.innerHTML = `
                <img src="${friend.photoURL}" alt="${friend.displayName}" class="friend-avatar">
                <div class="friend-info">
                    <p class="friend-name">${friend.displayName}</p>
                    <p class="friend-email">${friend.email}</p>
                </div>
                <button class="btn-remove" onclick="removeFriend('${doc.id}')">✕</button>
            `;
            friendsList.appendChild(friendItem);
        });
        
    } catch (error) {
        console.error("Error loading friends:", error);
    }
}

async function removeFriend(friendId) {
    if (confirm("Supprimer cet ami?")) {
        try {
            await db.collection("users")
                .doc(currentUser.uid)
                .collection("friends")
                .doc(friendId)
                .delete();
            
            loadFriends();
        } catch (error) {
            console.error("Error removing friend:", error);
        }
    }
}

// ====== NAVIGATION ======
navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;
        
        tabs.forEach(tab => tab.classList.remove("active"));
        navBtns.forEach(b => b.classList.remove("active"));
        
        document.getElementById(tabName + "Tab").classList.add("active");
        btn.classList.add("active");
    });
});

// ====== UTILS ======
function updateDateDisplay() {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const today = new Date().toLocaleDateString('fr-FR', options);
    currentDate.textContent = today;
}

if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

function setupMessaging() {
    if (!messaging) return;
    
    messaging.getToken({ vapidKey: "YOUR_VAPID_KEY" })
        .then(token => {
            if (currentUser) {
                db.collection("users").doc(currentUser.uid).update({ fcmToken: token });
            }
        })
        .catch(err => console.error("Error FCM:", err));
}

window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then(() => console.log("SW ready"));
    }
});
