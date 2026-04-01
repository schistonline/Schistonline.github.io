
// ============================================
// CHAT CONFIGURATION - Use different Supabase project
// ============================================
const CHAT_SUPABASE_URL = "https://amxhpxqakqrjjihwkzcq.supabase.co"; // Replace with your chat project URL
const CHAT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g"; // Replace with your chat project anon key

// Main marketplace client for auth
const MAIN_SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const MAIN_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize clients
const mainSupabase = window.supabase.createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_ANON_KEY);
const chatSupabase = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let currentConversation = null;
let currentConversationId = null;
let messagesSubscription = null;
let typingTimeout = null;
let isTyping = false;
let conversations = [];
let messageInputElement = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing chat system...');
    
    // Get DOM elements
    messageInputElement = document.getElementById('messageInput');
    
    // Check authentication in main marketplace
    await checkAuth();
    
    if (!currentUser) {
        // Redirect to login
        window.location.href = 'login.html?redirect=chat.html';
        return;
    }
    
    // Load conversations
    await loadConversations();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup realtime presence
    setupRealtimePresence();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user }, error } = await mainSupabase.auth.getUser();
        
        if (error || !user) {
            console.log('User not logged in');
            currentUser = null;
            return;
        }
        
        currentUser = user;
        console.log('✅ User authenticated:', currentUser.id);
        
        // Set auth for chat project (using same JWT if configured)
        // If using separate JWT secrets, you'll need to get a token from your backend
        await chatSupabase.auth.setSession({
            access_token: currentUser?.session?.access_token,
            refresh_token: currentUser?.session?.refresh_token
        });
        
    } catch (error) {
        console.error('Auth error:', error);
        currentUser = null;
    }
}

// ============================================
// LOAD CONVERSATIONS
// ============================================
async function loadConversations() {
    try {
        const { data, error } = await chatSupabase
            .from('conversations')
            .select(`
                *,
                participants:conversation_participants(
                    user_id,
                    user_type,
                    last_read_at
                ),
                messages:messages(
                    content,
                    created_at,
                    sender_id
                )
            `)
            .eq('participants.user_id', currentUser.id)
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        conversations = data || [];
        renderConversationsList();
        
        // Check if there's a conversation ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const conversationId = urlParams.get('conversation');
        
        if (conversationId) {
            const conversation = conversations.find(c => c.id === conversationId);
            if (conversation) {
                await openConversation(conversation);
            }
        }
        
    } catch (error) {
        console.error('Error loading conversations:', error);
        showToast('Failed to load conversations', 'error');
    }
}

// ============================================
// RENDER CONVERSATIONS LIST
// ============================================
function renderConversationsList() {
    const container = document.getElementById('conversationsContainer');
    
    if (!container) return;
    
    if (conversations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No messages yet</p>
                <p style="font-size: 12px; margin-top: 8px;">Start a conversation from a product page</p>
            </div>
        `;
        return;
    }
    
    const html = conversations.map(conv => {
        // Get other participant
        const otherParticipant = conv.participants.find(p => p.user_id !== currentUser.id);
        const otherUserName = otherParticipant?.user_type === 'supplier' ? 'Supplier' : 'Buyer';
        
        // Get last message
        const lastMessage = conv.messages?.[0];
        const lastMessageText = lastMessage?.content || 'No messages yet';
        const lastMessageTime = lastMessage?.created_at ? formatTime(lastMessage.created_at) : '';
        
        // Get unread count
        const unreadCount = conv.unread_count || 0;
        
        // Check if active conversation
        const isActive = currentConversationId === conv.id;
        
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 data-conversation-id="${conv.id}"
                 onclick="openConversationById('${conv.id}')">
                <div class="conversation-avatar">
                    ${otherUserName.charAt(0).toUpperCase()}
                </div>
                <div class="conversation-info">
                    <div class="conversation-title">${escapeHtml(conv.title || otherUserName)}</div>
                    <div class="conversation-last-message">${escapeHtml(lastMessageText)}</div>
                </div>
                <div class="conversation-meta">
                    <div class="conversation-time">${lastMessageTime}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// ============================================
// OPEN CONVERSATION
// ============================================
async function openConversation(conversation) {
    if (!conversation) return;
    
    currentConversation = conversation;
    currentConversationId = conversation.id;
    
    // Update UI
    renderConversationsList();
    
    const chatArea = document.getElementById('chatArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInputArea = document.querySelector('.message-input-area');
    const chatTitle = document.getElementById('chatTitle');
    
    // Show chat area on mobile
    if (window.innerWidth <= 767) {
        chatArea.classList.remove('hide-on-mobile');
        chatArea.classList.add('show-on-mobile');
    }
    
    // Set chat title
    const otherParticipant = conversation.participants.find(p => p.user_id !== currentUser.id);
    const title = conversation.title || `${otherParticipant?.user_type === 'supplier' ? 'Supplier' : 'Buyer'} Chat`;
    chatTitle.textContent = title;
    
    // Show message input
    messageInputArea.style.display = 'flex';
    
    // Load messages
    await loadMessages(conversation.id);
    
    // Subscribe to new messages
    subscribeToMessages(conversation.id);
    
    // Mark messages as read
    await markMessagesAsRead(conversation.id);
    
    // Update typing indicator for this conversation
    setupTypingIndicator(conversation.id);
}

// Helper function to open by ID
window.openConversationById = async function(conversationId) {
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
        await openConversation(conversation);
    }
};

// ============================================
// LOAD MESSAGES
// ============================================
async function loadMessages(conversationId) {
    try {
        const { data, error } = await chatSupabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        renderMessages(data || []);
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
    } catch (error) {
        console.error('Error loading messages:', error);
        showToast('Failed to load messages', 'error');
    }
}

// ============================================
// RENDER MESSAGES
// ============================================
function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comment-dots"></i>
                <p>No messages yet</p>
                <p style="font-size: 12px; margin-top: 8px;">Start the conversation!</p>
            </div>
        `;
        return;
    }
    
    const html = messages.map(message => {
        const isSent = message.sender_id === currentUser.id;
        const time = formatTime(message.created_at);
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-bubble">
                    ${escapeHtml(message.content)}
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// ============================================
// SEND MESSAGE
// ============================================
async function sendMessage() {
    if (!messageInputElement) return;
    
    const content = messageInputElement.value.trim();
    if (!content || !currentConversationId) return;
    
    try {
        const { data, error } = await chatSupabase
            .from('messages')
            .insert({
                conversation_id: currentConversationId,
                sender_id: currentUser.id,
                sender_type: 'buyer', // Determine based on user role
                content: content,
                is_read: false
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Clear input
        messageInputElement.value = '';
        messageInputElement.style.height = 'auto';
        
        // Update conversation last message
        await chatSupabase
            .from('conversations')
            .update({
                last_message: content,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', currentConversationId);
        
        // Add message to UI
        const messagesContainer = document.getElementById('messagesContainer');
        const emptyState = messagesContainer.querySelector('.empty-state');
        
        if (emptyState) {
            // Remove empty state
            messagesContainer.innerHTML = '';
        }
        
        // Append new message
        const messageHtml = `
            <div class="message sent">
                <div class="message-bubble">
                    ${escapeHtml(content)}
                </div>
                <div class="message-time">Just now</div>
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Clear typing indicator
        await updateTypingStatus(false);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message', 'error');
    }
}

// ============================================
// SUBSCRIBE TO MESSAGES (Realtime)
// ============================================
function subscribeToMessages(conversationId) {
    // Unsubscribe from previous subscription
    if (messagesSubscription) {
        messagesSubscription.unsubscribe();
    }
    
    messagesSubscription = chatSupabase
        .channel(`messages:${conversationId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
        }, payload => {
            // New message received
            const newMessage = payload.new;
            
            // Ignore own messages (already added)
            if (newMessage.sender_id === currentUser.id) return;
            
            // Add message to UI
            const messagesContainer = document.getElementById('messagesContainer');
            const messageHtml = `
                <div class="message received">
                    <div class="message-bubble">
                        ${escapeHtml(newMessage.content)}
                    </div>
                    <div class="message-time">Just now</div>
                </div>
            `;
            
            messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            // Mark as read
            markMessagesAsRead(conversationId);
            
            // Update conversation list
            loadConversations();
        })
        .subscribe();
}

// ============================================
// MARK MESSAGES AS READ
// ============================================
async function markMessagesAsRead(conversationId) {
    try {
        // Update unread counts
        await chatSupabase
            .from('unread_counts')
            .upsert({
                user_id: currentUser.id,
                conversation_id: conversationId,
                unread_count: 0,
                updated_at: new Date().toISOString()
            });
        
        // Update participant last read
        await chatSupabase
            .from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', currentUser.id);
        
        // Update unread counts in UI
        renderConversationsList();
        
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

// ============================================
// TYPING INDICATOR
// ============================================
function setupTypingIndicator(conversationId) {
    if (!messageInputElement) return;
    
    messageInputElement.addEventListener('input', function() {
        updateTypingStatus(true);
        
        // Clear timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Set timeout to stop typing after 2 seconds
        typingTimeout = setTimeout(() => {
            updateTypingStatus(false);
        }, 2000);
    });
    
    // Subscribe to typing indicators
    const typingSubscription = chatSupabase
        .channel(`typing:${conversationId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'typing_indicators',
            filter: `conversation_id=eq.${conversationId}`
        }, payload => {
            const indicator = payload.new;
            if (indicator.user_id !== currentUser.id && indicator.is_typing) {
                showTypingIndicator();
            } else {
                hideTypingIndicator();
            }
        })
        .subscribe();
}

async function updateTypingStatus(isTyping) {
    if (!currentConversationId) return;
    
    try {
        await chatSupabase
            .from('typing_indicators')
            .upsert({
                conversation_id: currentConversationId,
                user_id: currentUser.id,
                is_typing: isTyping,
                updated_at: new Date().toISOString()
            });
    } catch (error) {
        console.error('Error updating typing status:', error);
    }
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('messagesContainer');
    let indicator = document.querySelector('.typing-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = '<i class="fas fa-ellipsis-h"></i> Typing...';
        messagesContainer.appendChild(indicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function hideTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// ============================================
// USER PRESENCE (Online Status)
// ============================================
async function setupRealtimePresence() {
    // Update last seen every 30 seconds
    setInterval(async () => {
        if (currentUser) {
            await chatSupabase
                .from('user_presence')
                .upsert({
                    user_id: currentUser.id,
                    last_seen: new Date().toISOString(),
                    is_online: true,
                    current_conversation_id: currentConversationId
                });
        }
    }, 30000);
    
    // Mark as offline when leaving
    window.addEventListener('beforeunload', async () => {
        if (currentUser) {
            await chatSupabase
                .from('user_presence')
                .update({ is_online: false })
                .eq('user_id', currentUser.id);
        }
    });
}

// ============================================
// CREATE NEW CONVERSATION
// ============================================
window.startConversation = async function(userId, userType, listingId = null, title = null) {
    try {
        // Check if conversation already exists
        const { data: existing, error: checkError } = await chatSupabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);
        
        if (existing && existing.length > 0) {
            // Conversation exists, open it
            const conversationId = existing[0].conversation_id;
            window.location.href = `chat.html?conversation=${conversationId}`;
            return;
        }
        
        // Create new conversation
        const { data: conversation, error: convError } = await chatSupabase
            .from('conversations')
            .insert({
                marketplace_user_id: currentUser.id,
                listing_id: listingId,
                title: title || 'New Conversation'
            })
            .select()
            .single();
        
        if (convError) throw convError;
        
        // Add participants
        await chatSupabase
            .from('conversation_participants')
            .insert([
                { conversation_id: conversation.id, user_id: currentUser.id, user_type: 'buyer' },
                { conversation_id: conversation.id, user_id: userId, user_type: userType }
            ]);
        
        // Redirect to chat
        window.location.href = `chat.html?conversation=${conversation.id}`;
        
    } catch (error) {
        console.error('Error starting conversation:', error);
        showToast('Failed to start conversation', 'error');
    }
};

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Send message button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Enter to send
    if (messageInputElement) {
        messageInputElement.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Auto-resize textarea
        messageInputElement.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
    }
    
    // Back button on mobile
    const backToListBtn = document.getElementById('backToListBtn');
    if (backToListBtn) {
        backToListBtn.addEventListener('click', function() {
            const chatArea = document.getElementById('chatArea');
            chatArea.classList.add('hide-on-mobile');
            chatArea.classList.remove('show-on-mobile');
        });
    }
}

// ============================================
// UTILITIES
// ============================================
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 16px;
        right: 16px;
        background: ${type === 'error' ? '#EF4444' : '#6B21E5'};
        color: white;
        padding: 12px 20px;
        border-radius: 30px;
        font-size: 14px;
        text-align: center;
        z-index: 2000;
        animation: slideUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
