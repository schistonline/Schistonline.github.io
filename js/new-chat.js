// ============================================
// NEW CHAT - COMPLETE WORKING VERSION
// ============================================

const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const MAIN_SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const mainSupabase = window.supabase.createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY);
const chatSupabase = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

let currentUser = null;
let currentTab = 'suppliers';
let selectedContact = null;
let suppliers = [];
let buyers = [];
let recentChats = [];
let searchQuery = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('New chat page loading...');
    
    // Check auth
    const { data: { user }, error } = await mainSupabase.auth.getUser();
    
    if (error || !user) {
        console.log('No user logged in, redirecting...');
        window.location.href = 'login.html?redirect=new-chat.html';
        return;
    }
    
    currentUser = user;
    console.log('Logged in as:', currentUser.id);
    
    // Setup event listeners
    setupEventListeners();
    
    // Load data
    await loadSuppliers();
    await loadBuyers();
    await loadRecentChats();
    
    // Show suppliers by default
    showTab('suppliers');
});

// Load suppliers (only verified)
async function loadSuppliers() {
    try {
        const { data, error } = await mainSupabase
            .from('suppliers')
            .select('id, business_name, business_phone, verification_status, business_email')
            .eq('verification_status', 'verified')
            .order('business_name')
            .limit(100);

        if (error) throw error;
        
        suppliers = data || [];
        console.log('Loaded verified suppliers:', suppliers.length);
        
        if (currentTab === 'suppliers') {
            renderSuppliers();
        }
        
    } catch (error) {
        console.error('Error loading suppliers:', error);
        showError('Failed to load suppliers');
    }
}

// Load buyers
async function loadBuyers() {
    try {
        const { data, error } = await mainSupabase
            .from('profiles')
            .select('id, full_name, email, phone')
            .neq('id', currentUser.id)
            .order('full_name')
            .limit(100);

        if (error) throw error;
        
        buyers = data || [];
        console.log('Loaded buyers:', buyers.length);
        
        if (currentTab === 'buyers') {
            renderBuyers();
        }
        
    } catch (error) {
        console.error('Error loading buyers:', error);
    }
}

// Load recent chats
async function loadRecentChats() {
    try {
        const { data, error } = await chatSupabase
            .from('conversations')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error loading recent chats:', error);
            recentChats = [];
            if (currentTab === 'recent') {
                renderRecentChats();
            }
            return;
        }
        
        recentChats = data || [];
        console.log('Loaded recent chats:', recentChats.length);
        
        if (currentTab === 'recent') {
            renderRecentChats();
        }
        
    } catch (error) {
        console.error('Error in loadRecentChats:', error);
        recentChats = [];
    }
}

// Render suppliers (with search filter)
function renderSuppliers() {
    const container = document.getElementById('contactsList');
    if (!container) return;
    
    // Filter by search query
    let filteredSuppliers = suppliers;
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredSuppliers = suppliers.filter(supplier => 
            (supplier.business_name && supplier.business_name.toLowerCase().includes(query)) ||
            (supplier.business_phone && supplier.business_phone.includes(query)) ||
            (supplier.business_email && supplier.business_email.toLowerCase().includes(query))
        );
    }
    
    if (!filteredSuppliers.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-store"></i>
                <p>No verified suppliers found</p>
                <p style="font-size: 12px; margin-top: 8px;">Only verified suppliers are shown</p>
                ${searchQuery ? '<p style="font-size: 12px; margin-top: 8px;">Try a different search term</p>' : ''}
            </div>
        `;
        return;
    }
    
    let html = '';
    filteredSuppliers.forEach(supplier => {
        const name = supplier.business_name || 'Unknown Supplier';
        const avatarLetter = name.charAt(0).toUpperCase();
        const phone = supplier.business_phone || '';
        const email = supplier.business_email || '';
        
        html += `
            <div class="contact-item" data-user-id="${supplier.id}" data-user-type="supplier" data-user-name="${escapeHtml(name)}">
                <div class="contact-avatar">${avatarLetter}</div>
                <div class="contact-info">
                    <div class="contact-name">${escapeHtml(name)}</div>
                    <div class="contact-details">
                        <span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>
                        ${phone ? `<span><i class="fas fa-phone"></i> ${phone}</span>` : ''}
                        ${email ? `<span><i class="fas fa-envelope"></i> ${email}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Add click handlers
    document.querySelectorAll('.contact-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const userType = item.dataset.userType;
            const userName = item.dataset.userName;
            selectContact(userType, userId, userName);
        });
    });
}

// Render buyers (with search filter)
function renderBuyers() {
    const container = document.getElementById('contactsList');
    if (!container) return;
    
    // Filter by search query
    let filteredBuyers = buyers;
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredBuyers = buyers.filter(buyer => 
            (buyer.full_name && buyer.full_name.toLowerCase().includes(query)) ||
            (buyer.email && buyer.email.toLowerCase().includes(query)) ||
            (buyer.phone && buyer.phone.includes(query))
        );
    }
    
    if (!filteredBuyers.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No buyers found</p>
                ${searchQuery ? '<p style="font-size: 12px; margin-top: 8px;">Try a different search term</p>' : ''}
            </div>
        `;
        return;
    }
    
    let html = '';
    filteredBuyers.forEach(buyer => {
        const name = buyer.full_name || 'Anonymous User';
        const avatarLetter = name.charAt(0).toUpperCase();
        
        html += `
            <div class="contact-item" data-user-id="${buyer.id}" data-user-type="buyer" data-user-name="${escapeHtml(name)}">
                <div class="contact-avatar">${avatarLetter}</div>
                <div class="contact-info">
                    <div class="contact-name">${escapeHtml(name)}</div>
                    <div class="contact-details">
                        ${buyer.email ? `<span><i class="fas fa-envelope"></i> ${buyer.email}</span>` : ''}
                        ${buyer.phone ? `<span><i class="fas fa-phone"></i> ${buyer.phone}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Add click handlers
    document.querySelectorAll('.contact-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const userType = item.dataset.userType;
            const userName = item.dataset.userName;
            selectContact(userType, userId, userName);
        });
    });
}

// Render recent chats (with search filter)
function renderRecentChats() {
    const container = document.getElementById('contactsList');
    if (!container) return;
    
    // Filter by search query
    let filteredChats = recentChats;
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredChats = recentChats.filter(chat => 
            chat.title && chat.title.toLowerCase().includes(query)
        );
    }
    
    if (!filteredChats.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No recent chats</p>
                <p style="font-size: 12px; margin-top: 8px;">Start a new conversation to see it here</p>
                ${searchQuery ? '<p style="font-size: 12px; margin-top: 8px;">Try a different search term</p>' : ''}
            </div>
        `;
        return;
    }
    
    let html = '';
    filteredChats.forEach(chat => {
        const name = chat.title || 'Unknown User';
        const avatarLetter = name.charAt(0).toUpperCase();
        const lastMessage = chat.last_message || 'No messages yet';
        const time = new Date(chat.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(chat.updated_at).toLocaleDateString();
        
        html += `
            <div class="recent-chat-item" onclick="openExistingChat('${chat.id}')">
                <div class="contact-avatar">${avatarLetter}</div>
                <div class="contact-info">
                    <div class="contact-name">${escapeHtml(name)}</div>
                    <div class="contact-details">
                        ${escapeHtml(lastMessage.substring(0, 50))}
                        <span style="margin-left: 8px; font-size: 10px;">${date === new Date().toLocaleDateString() ? time : date}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Select contact
function selectContact(type, userId, name) {
    selectedContact = { type, userId, name };
    
    // Highlight selected
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.remove('selected-contact');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('selected-contact');
    }
    
    // Show message modal
    openMessageModal();
}

// Open existing chat
window.openExistingChat = function(conversationId) {
    window.location.href = `chat-room.html?conversation=${conversationId}`;
};

// Open message modal
function openMessageModal() {
    if (!selectedContact) {
        alert('Please select a contact first');
        return;
    }
    
    const modal = document.getElementById('messageModal');
    if (modal) {
        modal.classList.add('active');
        const messageInput = document.getElementById('initialMessage');
        if (messageInput) {
            messageInput.value = '';
            messageInput.focus();
        }
    }
}

// Close modal
window.closeModal = function() {
    const modal = document.getElementById('messageModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

// Send initial message
window.sendInitialMessage = async function() {
    const message = document.getElementById('initialMessage').value.trim();
    if (!message || !selectedContact) {
        alert('Please enter a message');
        return;
    }
    
    const sendBtn = document.querySelector('.modal-btn.send');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    }
    
    try {
        console.log('Creating conversation with:', selectedContact);
        
        // Check if conversation already exists
        const { data: existing, error: checkError } = await chatSupabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', selectedContact.userId);
        
        if (checkError) {
            console.error('Error checking existing:', checkError);
        }
        
        let conversationId;
        
        if (existing && existing.length > 0) {
            conversationId = existing[0].conversation_id;
            console.log('Using existing conversation:', conversationId);
        } else {
            // Create new conversation
            const { data: conversation, error: convError } = await chatSupabase
                .from('conversations')
                .insert({
                    title: selectedContact.name,
                    created_by: currentUser.id
                })
                .select()
                .single();
            
            if (convError) {
                throw new Error('Failed to create conversation: ' + convError.message);
            }
            
            conversationId = conversation.id;
            console.log('Created new conversation:', conversationId);
            
            // Add participants
            await chatSupabase
                .from('conversation_participants')
                .insert([
                    { conversation_id: conversationId, user_id: currentUser.id, user_type: 'buyer' },
                    { conversation_id: conversationId, user_id: selectedContact.userId, user_type: selectedContact.type }
                ]);
        }
        
        // Send first message
        await chatSupabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                sender_id: currentUser.id,
                sender_type: 'buyer',
                content: message,
                message_type: 'text'
            });
        
        // Update conversation
        await chatSupabase
            .from('conversations')
            .update({
                last_message: message,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);
        
        console.log('Message sent, redirecting...');
        closeModal();
        
        // Navigate to chat
        window.location.href = `chat-room.html?conversation=${conversationId}`;
        
    } catch (error) {
        console.error('Error starting conversation:', error);
        alert('Failed to start conversation: ' + error.message);
        
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    }
};

// Show tab
function showTab(tab) {
    currentTab = tab;
    
    // Update active tab styling
    document.querySelectorAll('.tab').forEach(t => {
        if (t.dataset.tab === tab) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    
    // Clear search when switching tabs
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
    }
    
    // Render appropriate content
    if (tab === 'suppliers') {
        renderSuppliers();
    } else if (tab === 'buyers') {
        renderBuyers();
    } else if (tab === 'recent') {
        renderRecentChats();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab clicks
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab);
        });
    });
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            if (currentTab === 'suppliers') {
                renderSuppliers();
            } else if (currentTab === 'buyers') {
                renderBuyers();
            } else if (currentTab === 'recent') {
                renderRecentChats();
            }
        });
    }
    
    // Enter key in modal
    const messageInput = document.getElementById('initialMessage');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendInitialMessage();
            }
        });
    }
}

// Show error
function showError(message) {
    const container = document.getElementById('contactsList');
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}