// ============================================
// CHAT ROOM - WhatsApp Style
// ============================================

const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const MAIN_SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const mainSupabase = window.supabase.createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY);
const chatSupabase = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

let currentUser = null;
let currentConversation = null;
let currentConversationId = null;
let messagesSubscription = null;
let typingTimeout = null;

// Get conversation ID from URL
const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get('conversation');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (!conversationId) {
        window.location.href = 'chat-inbox.html';
        return;
    }
    await loadConversation();
    await loadMessages();
    setupEventListeners();
    setupRealtime();
    setupTypingIndicator();
    markMessagesAsRead();
});

// Check authentication
async function checkAuth() {
    const { data: { user }, error } = await mainSupabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
}

// Load conversation details
async function loadConversation() {
    try {
        const { data, error } = await chatSupabase
            .from('conversations')
            .select(`
                *,
                participants:conversation_participants(*)
            `)
            .eq('id', conversationId)
            .single();
        
        if (error) throw error;
        
        currentConversation = data;
        currentConversationId = data.id;
        
        // Update UI with contact info
        const otherParticipant = data.participants.find(p => p.user_id !== currentUser.id);
        document.getElementById('contactName').textContent = data.title || (otherParticipant?.user_type === 'supplier' ? 'Supplier' : 'Buyer');
        document.getElementById('avatarInitials').textContent = (data.title || (otherParticipant?.user_type === 'supplier' ? 'S' : 'B')).charAt(0);
        
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

// Load messages
async function loadMessages() {
    try {
        const { data, error } = await chatSupabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        renderMessages(data || []);
        scrollToBottom();
        
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Render messages
function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    
    if (!messages.length) {
        container.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comment-dots" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>No messages yet</p>
                <p style="font-size: 12px; margin-top: 8px;">Send a message to start the conversation</p>
            </div>
        `;
        return;
    }
    
    const html = messages.map(msg => {
        const isSent = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" oncontextmenu="showContextMenu(event, '${msg.id}')">
                ${msg.reply_to_id ? `
                    <div class="reply-preview">
                        <div class="reply-sender">Replied to message</div>
                        <div class="reply-content">${escapeHtml(msg.reply_content || '...')}</div>
                    </div>
                ` : ''}
                <div class="message-bubble">
                    ${escapeHtml(msg.content)}
                </div>
                <div class="message-info">
                    <span>${time}</span>
                    ${isSent ? `<span class="message-status ${getMessageStatus(msg)}">${getMessageStatusIcon(msg)}</span>` : ''}
                </div>
                ${msg.reactions?.length ? `
                    <div class="message-reactions">
                        ${msg.reactions.map(r => `<span class="reaction">${r.reaction}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !currentConversationId) return;
    
    try {
        const { data, error } = await chatSupabase
            .from('messages')
            .insert({
                conversation_id: currentConversationId,
                sender_id: currentUser.id,
                sender_type: 'buyer',
                content: content,
                message_type: 'text'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        input.value = '';
        input.style.height = 'auto';
        
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
        addMessageToUI(data);
        scrollToBottom();
        
        // Clear typing indicator
        updateTypingStatus(false);
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

// Add message to UI
function addMessageToUI(message) {
    const container = document.getElementById('messagesContainer');
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const messageHtml = `
        <div class="message sent" data-message-id="${message.id}">
            <div class="message-bubble">
                ${escapeHtml(message.content)}
            </div>
            <div class="message-info">
                <span>${time}</span>
                <span class="message-status sent"><i class="fas fa-check"></i></span>
            </div>
        </div>
    `;
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-chat');
    if (emptyState) {
        container.innerHTML = '';
    }
    
    container.insertAdjacentHTML('beforeend', messageHtml);
}

// Setup realtime
function setupRealtime() {
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
            const newMessage = payload.new;
            if (newMessage.sender_id !== currentUser.id) {
                addReceivedMessage(newMessage);
                markMessagesAsRead();
            }
        })
        .subscribe();
}

// Add received message
function addReceivedMessage(message) {
    const container = document.getElementById('messagesContainer');
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const messageHtml = `
        <div class="message received" data-message-id="${message.id}">
            <div class="message-bubble">
                ${escapeHtml(message.content)}
            </div>
            <div class="message-info">
                <span>${time}</span>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', messageHtml);
    scrollToBottom();
}

// Mark messages as read
async function markMessagesAsRead() {
    try {
        await chatSupabase
            .from('conversation_participants')
            .update({ 
                last_read_at: new Date().toISOString(),
                unread_count: 0
            })
            .eq('conversation_id', conversationId)
            .eq('user_id', currentUser.id);
            
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

// Setup typing indicator
function setupTypingIndicator() {
    const input = document.getElementById('messageInput');
    
    input.addEventListener('input', () => {
        updateTypingStatus(true);
        
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            updateTypingStatus(false);
        }, 2000);
    });
    
    // Subscribe to typing indicators
    chatSupabase
        .channel(`typing:${conversationId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'typing_indicators',
            filter: `conversation_id=eq.${conversationId}`
        }, payload => {
            const indicator = payload.new;
            const typingIndicator = document.getElementById('typingIndicator');
            
            if (indicator.user_id !== currentUser.id && indicator.is_typing) {
                typingIndicator.style.display = 'flex';
            } else {
                typingIndicator.style.display = 'none';
            }
        })
        .subscribe();
}

// Update typing status
async function updateTypingStatus(isTyping) {
    await chatSupabase
        .from('typing_indicators')
        .upsert({
            conversation_id: conversationId,
            user_id: currentUser.id,
            is_typing: isTyping,
            updated_at: new Date().toISOString()
        });
}

// Setup event listeners
function setupEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('messageInput');
    
    sendBtn.addEventListener('click', sendMessage);
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
}

// Utilities
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function getMessageStatus(message) {
    if (message.read_by?.includes(currentUser.id)) return 'read';
    if (message.delivered_to?.includes(currentUser.id)) return 'delivered';
    return 'sent';
}

function getMessageStatusIcon(message) {
    const status = getMessageStatus(message);
    if (status === 'read') return '<i class="fas fa-check-double"></i>';
    if (status === 'delivered') return '<i class="fas fa-check-double"></i>';
    return '<i class="fas fa-check"></i>';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}