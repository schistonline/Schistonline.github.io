// ============================================
// CHAT INBOX - WhatsApp Style
// ============================================

const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const MAIN_SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const mainSupabase = window.supabase.createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY);
const chatSupabase = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

let currentUser = null;
let conversations = [];
let searchTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadConversations();
    setupEventListeners();
    setupRealtime();
});

// Check authentication
async function checkAuth() {
    const { data: { user }, error } = await mainSupabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'login.html?redirect=chat-inbox.html';
        return;
    }
    currentUser = user;
    console.log('Logged in as:', currentUser.id);
}

// Load conversations
async function loadConversations() {
    try {
        const { data, error } = await chatSupabase
            .from('conversations')
            .select(`
                *,
                participants:conversation_participants!inner(*),
                messages:messages(
                    id,
                    content,
                    created_at,
                    sender_id
                )
            `)
            .eq('participants.user_id', currentUser.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        
        conversations = data || [];
        renderConversations();
        
    } catch (error) {
        console.error('Error loading conversations:', error);
        showEmptyState();
    }
}

// Render conversations
function renderConversations() {
    const container = document.getElementById('conversationsList');
    
    if (!conversations.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No chats yet</p>
                <p style="font-size: 12px; margin-top: 8px;">Start a conversation from a product page</p>
            </div>
        `;
        return;
    }
    
    const html = conversations.map(conv => {
        // Get other participant
        const otherParticipant = conv.participants.find(p => p.user_id !== currentUser.id);
        const lastMessage = conv.messages?.[0];
        const unreadCount = conv.participants.find(p => p.user_id === currentUser.id)?.unread_count || 0;
        
        return `
            <div class="conversation-item" onclick="openChat('${conv.id}')">
                <div class="conversation-avatar">
                    ${otherParticipant?.user_type === 'supplier' ? '🏢' : '👤'}
                    <div class="online-indicator" style="display: none;"></div>
                </div>
                <div class="conversation-info">
                    <div class="conversation-title">
                        <span class="conversation-name">${escapeHtml(conv.title || (otherParticipant?.user_type === 'supplier' ? 'Supplier' : 'Buyer'))}</span>
                        <span class="conversation-time">${formatTime(conv.updated_at)}</span>
                    </div>
                    <div class="conversation-preview">
                        <span class="last-message">${escapeHtml(lastMessage?.content || 'No messages yet')}</span>
                        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Open chat
window.openChat = function(conversationId) {
    window.location.href = `chat-room.html?conversation=${conversationId}`;
};

// New chat
window.openNewChat = function() {
    window.location.href = 'new-chat.html';
};

// Settings
window.openSettings = function() {
    window.location.href = 'chat-settings.html';
};

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filterConversations(e.target.value);
            }, 300);
        });
    }
}

// Filter conversations
function filterConversations(query) {
    if (!query.trim()) {
        renderConversations();
        return;
    }
    
    const filtered = conversations.filter(conv => {
        const otherParticipant = conv.participants.find(p => p.user_id !== currentUser.id);
        const name = conv.title || (otherParticipant?.user_type === 'supplier' ? 'Supplier' : 'Buyer');
        return name.toLowerCase().includes(query.toLowerCase());
    });
    
    const container = document.getElementById('conversationsList');
    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No results found</p>
            </div>
        `;
        return;
    }
    
    // Re-render filtered conversations
    const html = filtered.map(conv => {
        const otherParticipant = conv.participants.find(p => p.user_id !== currentUser.id);
        const lastMessage = conv.messages?.[0];
        const unreadCount = conv.participants.find(p => p.user_id === currentUser.id)?.unread_count || 0;
        
        return `
            <div class="conversation-item" onclick="openChat('${conv.id}')">
                <div class="conversation-avatar">
                    ${otherParticipant?.user_type === 'supplier' ? '🏢' : '👤'}
                </div>
                <div class="conversation-info">
                    <div class="conversation-title">
                        <span class="conversation-name">${escapeHtml(conv.title || (otherParticipant?.user_type === 'supplier' ? 'Supplier' : 'Buyer'))}</span>
                        <span class="conversation-time">${formatTime(conv.updated_at)}</span>
                    </div>
                    <div class="conversation-preview">
                        <span class="last-message">${escapeHtml(lastMessage?.content || 'No messages yet')}</span>
                        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Setup realtime
function setupRealtime() {
    const subscription = chatSupabase
        .channel('inbox-updates')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'messages'
        }, () => {
            loadConversations();
        })
        .subscribe();
}

// Show empty state
function showEmptyState() {
    const container = document.getElementById('conversationsList');
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-comment-dots"></i>
            <p>No messages yet</p>
            <p style="font-size: 12px; margin-top: 8px;">Start a conversation from a product page</p>
        </div>
    `;
}

// Utilities
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}