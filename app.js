// ====== CONFIG ======
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

// ====== STATE ======
let currentUser = null;
let todayReminders = [];
let currentReminderId = null;
let cameraMode = "back";
let todaySchedule = [];
let revealPhotos = [];
let currentStoryIndex = 0;
let currentChatFriendId = null;
let messagesUnsubscribe = null;

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

const navBtns = document.querySelectorAll(".nav-btn");
const tabs = document.querySelectorAll(".tab");

const friendSearchInput = document.getElementById("friendSearchInput");
const searchFriendBtn = document.getElementById("searchFriendBtn");
const searchResultBox = document.getElementById("searchResultBox");
const invitationsList = document.getElementById("invitationsList");
const friendsList = document.getElementById("friendsList");

const conversationsList = document.getElementById("conversationsList");
const chatView = document.getElementById("chatView");
const messagesBox = document.getElementById("messagesBox");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");
const chatFriendName = document.getElementById("chatFriendName");
const chatFriendPhoto = document.getElementById("chatFriendPhoto");

const storiesContainer = document.getElementById("storiesContainer");
const storyImage = document.getElementById("storyImage");
const storySwapBtn = document.getElementById("storySwapBtn");
const storyUserName = document.getElementById("storyUserName");
const storyUserPhoto = document.getElementById("storyUserPhoto");
const storyCounter = document.getElementById("storyCounter");
const storiesPrev = document.getElementById("storiesPrev");
const storiesNext = document.getElementById("storiesNext");
const revealBox = document.getElementById("revealBox");

// ====== AUTH ======
googleLoginBtn.addEventListener("click", () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => console.error(err));
});

logoutBtn.addEventListener("click", () => {
    auth.signOut();
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.remove("active");
        mainScreen.classList.add("active");
        
        userName.textContent = user.displayName || "Utilisateur";
        userPhoto.src = user.photoURL || "";
        
        await initializeUserProfile(user);
        updateDateDisplay();
        generateOrLoadTodaySchedule();
        loadTodayPhotos();
        checkRevealTime();
        loadInvitations();
        loadFriends();
        loadConversations();
        setupSettingsUI();
        
        setInterval(loadTodayPhotos, 30000);
        setInterval(checkRevealTime, 60000);
        setInterval(loadInvitations, 60000);
        setInterval(loadFriends, 60000);
        setInterval(loadConversations, 30000);
        
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    } else {
        currentUser = null;
        mainScreen.classList.remove("active");
        loginScreen.classList.add("active");
        if (messagesUnsubscribe) messagesUnsubscribe();
    }
});

// ====== PROFILE ======
async function initializeUserProfile(user) {
    try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        
        if (!userDoc.exists) {
            const username = generateUsername(user.displayName);
            await db.collection("users").doc(user.uid).set({
                displayName: user.displayName,
                username: username,
                email: user.email,
                photoURL: user.photoURL,
                bio: "",
                createdAt: new Date()
            });
        }
    } catch (error) {
        console.error(error);
    }
}

function generateUsername(displayName) {
    const base = displayName.toLowerCase().replace(/\s+/g, '_').substring(0, 20);
    const random = Math.floor(Math.random() * 1000);
    return `${base}_${random}`;
}

function setupSettingsUI() {
    const profileName = document.getElementById("profileName");
    const profileUsername = document.getElementById("profileUsername");
    const profilePhoto = document.getElementById("profilePhoto");
    const editDisplayName = document.getElementById("editDisplayName");
    const editUsername = document.getElementById("editUsername");
    const editBio = document.getElementById("editBio");
    const saveProfileBtn = document.getElementById("saveProfileBtn");
    const deleteAccountBtn = document.getElementById("deleteAccountBtn");
    
    loadProfileData();
    
    saveProfileBtn.addEventListener("click", saveProfile);
    deleteAccountBtn.addEventListener("click", deleteAccount);
}

async function loadProfileData() {
    try {
        const userDoc = await db.collection("users").doc(currentUser.uid).get();
        const userData = userDoc.data();
        
        document.getElementById("profileName").textContent = userData.displayName;
        document.getElementById("profileUsername").textContent = `@${userData.username}`;
        document.getElementById("profilePhoto").src = userData.photoURL;
        
        document.getElementById("editDisplayName").value = userData.displayName;
        document.getElementById("editUsername").value = userData.username;
        document.getElementById("editBio").value = userData.bio || "";
    } catch (error) {
        console.error(error);
    }
}

async function saveProfile() {
    const displayName = document.getElementById("editDisplayName").value.trim();
    const username = document.getElementById("editUsername").value.trim().toLowerCase();
    const bio = document.getElementById("editBio").value.trim();
    
    if (!displayName || !username) {
        alert("Tous les champs sont obligatoires!");
        return;
    }
    
    try {
        const currentDoc = await db.collection("users").doc(currentUser.uid).get();
        const oldUsername = currentDoc.data().username;
        
        if (username !== oldUsername) {
            const existing = await db.collection("users").where("username", "==", username).get();
            if (!existing.empty) {
                alert("Cet @username est déjà pris!");
                return;
            }
        }
        
        await db.collection("users").doc(currentUser.uid).update({
            displayName,
            username,
            bio
        });
        
        alert("✅ Profil sauvegardé!");
        loadProfileData();
    } catch (error) {
        console.error(error);
        alert("❌ Erreur");
    }
}

async function deleteAccount() {
    if (!confirm("Êtes-vous sûr? Cette action est irréversible!")) return;
    
    try {
        await db.collection("users").doc(currentUser.uid).delete();
        await currentUser.delete();
        await auth.signOut();
    } catch (error) {
        console.error(error);
        alert("❌ Erreur");
    }
}

// ====== SCHEDULE ======
async function generateOrLoadTodaySchedule() {
    const today = new Date().toDateString();
    
    try {
        const scheduleDoc = await db.collection("schedules").doc(today).get();
        
        if (!scheduleDoc.exists) {
            const now = new Date();
            if (now.getHours() >= 7) {
                generateDailySchedule(today);
            } else {
                const timeUntil7am = new Date();
                timeUntil7am.setHours(7, 0, 0, 0);
                const delay = timeUntil7am - now;
                
                setTimeout(() => generateDailySchedule(today), delay);
                statusText.textContent = "Horaires générés à 7h du matin!";
            }
        } else {
            todaySchedule = scheduleDoc.data().times;
            initializeTodayReminders();
        }
    } catch (error) {
        console.error(error);
    }
}

async function generateDailySchedule(today) {
    const times = generateRandomTimes();
    
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
    const minGap = 30;
    
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

async function initializeTodayReminders() {
    const today = new Date().toDateString();
    
    try {
        const snapshot = await db.collection("reminders")
            .where("userId", "==", currentUser.uid)
            .where("date", "==", today)
            .get();
        
        if (snapshot.empty) {
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
        console.error(error);
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
    }
}

function scheduleReminder(reminder) {
    const now = new Date();
    const [hour, min] = reminder.time.split(":");
    const reminderTime = new Date();
    reminderTime.setHours(parseInt(hour), parseInt(min), 0);
    
    const fifteenMinAfter = new Date(reminderTime);
    fifteenMinAfter.setMinutes(fifteenMinAfter.getMinutes() + 15);
    
    if (now > fifteenMinAfter) {
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
            body: "C'est le moment! Prendre une photo (15 min)",
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
    statusText.textContent = "📤 Upload...";
    
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
            statusText.textContent = "✅ Selfie maintenant";
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
        console.error(error);
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
        
        photosGrid.innerHTML = "";
        if (snapshot.empty) {
            photosGrid.innerHTML = '<p class="empty-message">Aucune photo</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const photo = doc.data();
            const photoItem = document.createElement("div");
            photoItem.className = "photo-item";
            photoItem.innerHTML = `
                <img src="${photo.url}" alt="Photo">
                <div class="photo-time">${photo.time}</div>
            `;
            photosGrid.appendChild(photoItem);
        });
    } catch (error) {
        console.error(error);
    }
}

// ====== STORIES ======
function checkRevealTime() {
    const hour = new Date().getHours();
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
        const friendsSnapshot = await db.collection("users")
            .doc(currentUser.uid)
            .collection("friends")
            .get();
        
        revealPhotos = [];
        
        for (const friendDoc of friendsSnapshot.docs) {
            const friend = friendDoc.data();
            
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
                        frontPhotoId: reminder.frontPhotoId
                    });
                }
            });
        }
        
        if (revealPhotos.length > 0) {
            currentStoryIndex = 0;
            showStory(0);
            storiesContainer.style.display = "block";
        }
    } catch (error) {
        console.error(error);
    }
}

async function showStory(index) {
    if (index < 0 || index >= revealPhotos.length) return;
    
    currentStoryIndex = index;
    const story = revealPhotos[index];
    
    const backPhoto = await db.collection("photos").doc(story.backPhotoId).get();
    const frontPhoto = await db.collection("photos").doc(story.frontPhotoId).get();
    
    storyUserName.textContent = story.friendName;
    storyUserPhoto.src = story.friendPhoto;
    storyImage.src = backPhoto.data().url;
    storyImage.dataset.frontUrl = frontPhoto.data().url;
    storyImage.dataset.isSwapped = "false";
    storyCounter.textContent = `${index + 1}/${revealPhotos.length}`;
    
    storiesPrev.style.display = index === 0 ? "none" : "block";
    storiesNext.style.display = index === revealPhotos.length - 1 ? "none" : "block";
}

storiesPrev.addEventListener("click", () => showStory(currentStoryIndex - 1));
storiesNext.addEventListener("click", () => showStory(currentStoryIndex + 1));

storySwapBtn.addEventListener("click", () => {
    const isSwapped = storyImage.dataset.isSwapped === "true";
    if (isSwapped) {
        storyImage.src = revealPhotos[currentStoryIndex].backPhotoId;
        storyImage.dataset.isSwapped = "false";
    } else {
        storyImage.src = storyImage.dataset.frontUrl;
        storyImage.dataset.isSwapped = "true";
    }
});

// ====== FRIENDS ======
searchFriendBtn.addEventListener("click", async () => {
    let searchUsername = friendSearchInput.value.trim().toLowerCase();
    if (searchUsername.startsWith("@")) {
        searchUsername = searchUsername.substring(1);
    }
    
    if (!searchUsername) {
        alert("Tape un @username!");
        return;
    }
    
    try {
        const usersSnapshot = await db.collection("users")
            .where("username", "==", searchUsername)
            .get();
        
        searchResultBox.innerHTML = "";
        
        if (usersSnapshot.empty) {
            searchResultBox.innerHTML = '<p class="empty-message">Utilisateur non trouvé</p>';
            return;
        }
        
        const userDoc = usersSnapshot.docs[0];
        const user = userDoc.data();
        const userId = userDoc.id;
        
        if (userId === currentUser.uid) {
            searchResultBox.innerHTML = '<p class="empty-message">C\'est toi!</p>';
            return;
        }
        
        const resultDiv = document.createElement("div");
        resultDiv.className = "search-result";
        resultDiv.innerHTML = `
            <img src="${user.photoURL || ''}" alt="${user.displayName}" class="result-avatar">
            <div class="result-info">
                <p class="result-name">${user.displayName}</p>
                <p class="result-email">@${user.username}</p>
            </div>
            <button class="btn-invite" onclick="sendFriendRequest('${userId}', '${user.displayName}')">✓ Inviter</button>
        `;
        
        searchResultBox.appendChild(resultDiv);
    } catch (error) {
        console.error(error);
        searchResultBox.innerHTML = '<p class="empty-message">Erreur</p>';
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
                status: "pending",
                createdAt: new Date()
            });
        
        alert(`✅ Invitation envoyée à ${friendName}!`);
        friendSearchInput.value = "";
        searchResultBox.innerHTML = "";
    } catch (error) {
        console.error(error);
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
                <img src="${invitation.fromPhoto || ''}" alt="${invitation.fromName}" class="invite-avatar">
                <div class="invite-info">
                    <p class="invite-name">${invitation.fromName}</p>
                </div>
                <div class="invite-actions">
                    <button class="btn-accept" onclick="acceptInvitation('${doc.id}', '${invitation.fromId}', '${invitation.fromName}')">✓</button>
                    <button class="btn-refuse" onclick="refuseInvitation('${doc.id}')">✕</button>
                </div>
            `;
            invitationsList.appendChild(inviteItem);
        });
    } catch (error) {
        console.error(error);
    }
}

async function acceptInvitation(inviteId, friendId, friendName) {
    try {
        const friendDoc = await db.collection("users").doc(friendId).get();
        const friendData = friendDoc.data();
        const currentUserDoc = await db.collection("users").doc(currentUser.uid).get();
        const currentUserData = currentUserDoc.data();
        
        // Ajouter l'ami dans la collection de l'utilisateur actuel
        await db.collection("users").doc(currentUser.uid).collection("friends").doc(friendId).set({
            uid: friendId,
            displayName: friendData.displayName,
            username: friendData.username,
            email: friendData.email,
            photoURL: friendData.photoURL,
            addedAt: new Date()
        });
        
        // Ajouter l'utilisateur actuel dans la collection du friend (amitié bidirectionnelle)
        await db.collection("users").doc(friendId).collection("friends").doc(currentUser.uid).set({
            uid: currentUser.uid,
            displayName: currentUserData.displayName,
            username: currentUserData.username,
            email: currentUserData.email,
            photoURL: currentUserData.photoURL,
            addedAt: new Date()
        });
        
        // Supprimer l'invitation
        await db.collection("users")
            .doc(currentUser.uid)
            .collection("invitations")
            .doc(inviteId)
            .update({ status: "accepted" });
        
        alert(`✅ ${friendName} ajouté!`);
        loadInvitations();
        loadFriends();
        loadConversations();
    } catch (error) {
        console.error(error);
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
        console.error(error);
    }
}

// ====== FRIENDS LIST ======
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
                <img src="${friend.photoURL || ''}" alt="${friend.displayName}" class="friend-avatar">
                <div class="friend-info">
                    <p class="friend-name">${friend.displayName}</p>
                    <p class="friend-email">@${friend.username}</p>
                </div>
                <button class="btn-remove" onclick="removeFriend('${doc.id}')">✕</button>
            `;
            friendsList.appendChild(friendItem);
        });
    } catch (error) {
        console.error(error);
    }
}

async function removeFriend(friendId) {
    if (!confirm("Supprimer cet ami?")) return;
    
    try {
        await db.collection("users")
            .doc(currentUser.uid)
            .collection("friends")
            .doc(friendId)
            .delete();
        
        loadFriends();
        loadConversations();
    } catch (error) {
        console.error(error);
    }
}

// ====== MESSAGES ======
async function loadConversations() {
    if (!currentUser) return;
    
    try {
        const friendsSnapshot = await db.collection("users")
            .doc(currentUser.uid)
            .collection("friends")
            .get();
        
        conversationsList.innerHTML = "";
        
        if (friendsSnapshot.empty) {
            conversationsList.innerHTML = '<p class="empty-message">Aucun ami</p>';
            return;
        }
        
        for (const friendDoc of friendsSnapshot.docs) {
            const friend = friendDoc.data();
            
            let lastMessage = "Pas de messages";
            
            // Récupérer la conversation
            const conversation = await db.collection("messages")
                .where("participants", "array-contains", currentUser.uid)
                .get();
            
            const chatDoc = conversation.docs.find(doc => {
                const participants = doc.data().participants;
                return participants.includes(friendDoc.id);
            });
            
            if (chatDoc) {
                const messages = chatDoc.data().messages || [];
                if (messages.length > 0) {
                    const lastMsg = messages[messages.length - 1];
                    lastMessage = lastMsg.text.substring(0, 30);
                    if (lastMsg.text.length > 30) lastMessage += "...";
                }
            }
            
            const conversationItem = document.createElement("div");
            conversationItem.className = "conversation-item";
            conversationItem.innerHTML = `
                <img src="${friend.photoURL || ''}" alt="${friend.displayName}" class="conversation-avatar">
                <div class="conversation-info">
                    <p class="conversation-name">${friend.displayName}</p>
                    <p class="conversation-preview">${lastMessage}</p>
                </div>
            `;
            
            conversationItem.addEventListener("click", () => openChat(friendDoc.id, friend));
            conversationsList.appendChild(conversationItem);
        }
    } catch (error) {
        console.error(error);
    }
}

async function openChat(friendId, friend) {
    currentChatFriendId = friendId;
    chatFriendName.textContent = friend.displayName;
    chatFriendPhoto.src = friend.photoURL;
    
    document.querySelector(".conversations-list").style.display = "none";
    chatView.style.display = "flex";
    
    loadChatMessages(friendId);
}

async function loadChatMessages(friendId) {
    if (messagesUnsubscribe) messagesUnsubscribe();
    
    try {
        const conversation = await db.collection("messages")
            .where("participants", "array-contains", currentUser.uid)
            .get();
        
        let chatDoc = conversation.docs.find(doc => {
            const participants = doc.data().participants;
            return participants.includes(friendId);
        });
        
        messagesBox.innerHTML = "";
        
        if (chatDoc) {
            messagesUnsubscribe = db.collection("messages").doc(chatDoc.id)
                .onSnapshot(snapshot => {
                    const messages = snapshot.data().messages || [];
                    messagesBox.innerHTML = "";
                    
                    messages.forEach(msg => {
                        const msgDiv = document.createElement("div");
                        msgDiv.className = `message ${msg.senderId === currentUser.uid ? 'own' : ''}`;
                        const msgTime = new Date(msg.timestamp.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        msgDiv.innerHTML = `
                            <div class="message-bubble">${msg.text}</div>
                            <div class="message-time">${msgTime}</div>
                        `;
                        messagesBox.appendChild(msgDiv);
                    });
                    
                    messagesBox.scrollTop = messagesBox.scrollHeight;
                });
        }
    } catch (error) {
        console.error(error);
    }
}

sendMessageBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    
    try {
        let conversation = await db.collection("messages")
            .where("participants", "array-contains", currentUser.uid)
            .get();
        
        let chatDoc = conversation.docs.find(doc => {
            const participants = doc.data().participants;
            return participants.includes(currentChatFriendId);
        });
        
        const newMessage = {
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            text: text,
            timestamp: new Date()
        };
        
        if (chatDoc) {
            await db.collection("messages").doc(chatDoc.id).update({
                messages: firebase.firestore.FieldValue.arrayUnion(newMessage)
            });
        } else {
            await db.collection("messages").add({
                participants: [currentUser.uid, currentChatFriendId],
                messages: [newMessage],
                createdAt: new Date()
            });
        }
        
        messageInput.value = "";
    } catch (error) {
        console.error(error);
    }
}

document.querySelector(".btn-back").addEventListener("click", () => {
    chatView.style.display = "none";
    document.querySelector(".conversations-list").style.display = "block";
    if (messagesUnsubscribe) messagesUnsubscribe();
});

// ====== NAV ======
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

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => console.log(err));
}
