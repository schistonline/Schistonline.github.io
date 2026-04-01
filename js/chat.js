// ============================================
// SUPER MOBILE RESPONSIVE CHAT SYSTEM
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// ============================================
// CHAT STATE MANAGEMENT
// ============================================
const ChatSystem = {
    currentUser: null,
    currentUserProfile: null,
    conversations: [],
    contacts: [],
    pendingRequests: [],
    currentFilter: 'all',
    currentTab: 'chats',
    searchTimeout: null,
    onlineUsers: new Set(),
    realtimeSubscriptions: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        await this.checkAuth();
        await this.loadUserProfile();
        await this.loadConversations();
        await this.loadContacts();
        await this.loadPendingRequests();
        this.setupRealtimeSubscriptions();
        this.setupEventListeners();
        this.updateOnlineStatus(true);
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) {
                window.location.href = 'login.html?redirect=chat.html';
                return;
            }
            this.currentUser = user;
            console.log('✅ User authenticated:', user.id);
        } catch (error) {
            console.error('❌ Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadUserProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();
                
            if (error) throw error;
            this.currentUserProfile = data;
            console.log('✅ Profile loaded:', data.full_name);
        } catch (error) {
            console.error('❌ Error loading profile:', error);
        }
    },
    
    // ============================================
    // LOAD CONVERSATIONS
    // ============================================
    async loadConversations() {
        try {
            const loadingEl = document.getElementById('conversationsLoading');
            if (loadingEl) loadingEl.style.display = 'flex';
            
            const { data, error } = await sb
                .from('conversations')
                .select(`
                    *,
                    participant_one:profiles!conversations_participant_one_id_fkey (
                        id, full_name, business_name, avatar_url, is_verified, last_active
                    ),
                    participant_two:profiles!conversations_participant_two_id_fkey (
                        id, full_name, business_name, avatar_url, is_verified, last_active
                    ),
                    ad:ads!conversations_ad_id_fkey (
                        id, title
                    ),
                    inquiry:inquiry_requests!conversations_inquiry_id_fkey (
                        id, inquiry_number, title
                    ),
                    quote:supplier_quotes!conversations_quote_id_fkey (
                        id, quote_number, total_amount
                    ),
                    order:orders!conversations_order_id_fkey (
                        id, order_number, status
                    )
                `)
                .or(`participant_one_id.eq.${this.currentUser.id},participant_two_id.eq.${this.currentUser.id}`)
                .order('last_message_at', { ascending: false, nullsLast: true });
                
            if (error) throw error;
            
            this.conversations = data || [];
            
            // Get last message for each conversation
            for (let conv of this.conversations) {
                if (conv.last_message_id) {
                    const { data: lastMsg } = await sb
                        .from('messages')
                        .select('id, content, sender_id, created_at, is_read')
                        .eq('id', conv.last_message_id)
                        .single();
                        
                    conv.last_message = lastMsg;
                }
            }
            
            this.renderConversations();
            this.updateUnreadBadge();
            
        } catch (error) {
            console.error('❌ Error loading conversations:', error);
            this.showToast('Failed to load conversations', 'error');
        } finally {
            const loadingEl = document.getElementById('conversationsLoading');
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },
    
    // ============================================
    // LOAD CONTACTS
    // ============================================
    async loadContacts() {
        try {
            // Get all users except current user
            const { data, error } = await sb
                .from('profiles')
                .select('*')
                .neq('id', this.currentUser.id)
                .order('full_name')
                .limit(50);
                
            if (error) throw error;
            
            this.contacts = data || [];
            this.renderContacts();
            
        } catch (error) {
            console.error('❌ Error loading contacts:', error);
        }
    },
    
    // ============================================
    // LOAD PENDING REQUESTS
    // ============================================
    async loadPendingRequests() {
        try {
            // Load inquiries where user is buyer
            const { data: inquiries, error: inqError } = await sb
                .from('inquiry_requests')
                .select('id, inquiry_number, title, status, created_at')
                .eq('buyer_id', this.currentUser.id)
                .in('status', ['sent', 'pending'])
                .order('created_at', { ascending: false })
                .limit(10);
                
            if (inqError) throw inqError;
            
            // Load quotes where user is buyer and status is sent
            const { data: quotes, error: quoteError } = await sb
                .from('supplier_quotes')
                .select(`
                    id, quote_number, total_amount, status, valid_until,
                    inquiry:inquiry_requests!inquiry_id (
                        title
                    ),
                    supplier:suppliers!supplier_id (
                        business_name
                    )
                `)
                .eq('status', 'sent')
                .order('created_at', { ascending: false })
                .limit(10);
                
            if (quoteError) throw quoteError;
            
            // Load orders needing attention
            const { data: orders, error: orderError } = await sb
                .from('orders')
                .select('id, order_number, total_amount, status, created_at')
                .or(`buyer_id.eq.${this.currentUser.id},supplier_id.eq.${this.getSupplierId()}`)
                .in('status', ['pending', 'confirmed', 'processing', 'shipped'])
                .order('created_at', { ascending: false })
                .limit(10);
                
            if (orderError) throw orderError;
            
            this.pendingRequests = {
                inquiries: inquiries || [],
                quotes: quotes || [],
                orders: orders || []
            };
            
            this.renderPendingRequests();
            this.updatePendingBadge();
            
        } catch (error) {
            console.error('❌ Error loading pending requests:', error);
        }
    },
    
    // ============================================
    // RENDER CONVERSATIONS
    // ============================================
    renderConversations() {
        const container = document.getElementById('conversationsList');
        const emptyEl = document.getElementById('emptyConversations');
        
        if (!container) return;
        
        // Filter conversations
        let filtered = this.filterConversations();
        
        if (filtered.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            container.innerHTML = '';
            return;
        }
        
        if (emptyEl) emptyEl.style.display = 'none';
        
        container.innerHTML = filtered.map(conv => {
            const other = this.getOtherParticipant(conv);
            if (!other) return '';
            
            const isUnread = this.isUnread(conv);
            const unreadCount = this.getUnreadCount(conv);
            const name = other.business_name || other.full_name || 'User';
            const time = this.formatTime(conv.last_message_at || conv.updated_at);
            const preview = conv.last_message_preview || 'No messages yet';
            const context = this.getContextInfo(conv);
            
            return `
                <div class="conversation-item ${isUnread ? 'unread' : ''}" 
                     data-conversation-id="${conv.id}"
                     onclick="ChatSystem.openConversation(${conv.id})">
                    
                    <div class="conversation-avatar">
                        ${other.avatar_url ? 
                            `<img src="${other.avatar_url}" class="avatar-image" alt="${this.escapeHtml(name)}">` : 
                            `<div class="avatar-placeholder">${this.getInitials(name)}</div>`
                        }
                        <span class="status-indicator ${this.isOnline(other.id) ? 'online' : 'offline'}"></span>
                    </div>
                    
                    <div class="conversation-info">
                        <div class="conversation-header">
                            <span class="participant-name">${this.escapeHtml(name)}</span>
                            <span class="conversation-time">${time}</span>
                        </div>
                        
                        <div class="conversation-preview">
                            ${context ? `<span class="context-badge ${context.type}">${context.label}</span>` : ''}
                            <span class="last-message">${this.escapeHtml(preview)}</span>
                        </div>
                    </div>
                    
                    ${isUnread ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                </div>
            `;
        }).join('');
    },
    
    renderContacts() {
        const container = document.getElementById('contactsList');
        if (!container) return;
        
        if (this.contacts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No contacts found</h3>
                    <p>Start by finding suppliers or buyers</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.contacts.map(contact => {
            const name = contact.business_name || contact.full_name || 'User';
            const isOnline = this.isOnline(contact.id);
            
            return `
                <div class="contact-item" onclick="ChatSystem.startConversation('${contact.id}')">
                    ${contact.avatar_url ? 
                        `<img src="${contact.avatar_url}" class="contact-avatar" alt="${this.escapeHtml(name)}">` : 
                        `<div class="contact-avatar-placeholder">${this.getInitials(name)}</div>`
                    }
                    <div class="contact-info">
                        <div class="contact-name">${this.escapeHtml(name)}</div>
                        <div class="contact-status">
                            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                            ${contact.is_supplier ? 'Supplier' : 'Buyer'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    renderPendingRequests() {
        const container = document.getElementById('requestsList');
        if (!container) return;
        
        const total = (this.pendingRequests?.inquiries?.length || 0) + 
                      (this.pendingRequests?.quotes?.length || 0) + 
                      (this.pendingRequests?.orders?.length || 0);
        
        if (total === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>All caught up!</h3>
                    <p>No pending requests at the moment</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        // Render inquiries
        if (this.pendingRequests.inquiries?.length > 0) {
            html += '<h4 class="request-category">Pending Inquiries</h4>';
            html += this.pendingRequests.inquiries.map(inq => `
                <div class="request-item" onclick="window.location.href='inquiry-details.html?id=${inq.id}'">
                    <div class="request-icon inquiry">
                        <i class="fas fa-file-invoice"></i>
                    </div>
                    <div class="request-info">
                        <div class="request-title">${this.escapeHtml(inq.title || 'Inquiry')}</div>
                        <div class="request-meta">${inq.inquiry_number} • ${this.formatDate(inq.created_at)}</div>
                    </div>
                    <span class="request-badge">${inq.status}</span>
                </div>
            `).join('');
        }
        
        // Render quotes
        if (this.pendingRequests.quotes?.length > 0) {
            html += '<h4 class="request-category">New Quotes</h4>';
            html += this.pendingRequests.quotes.map(quote => `
                <div class="request-item" onclick="window.location.href='buyer-quote.html?id=${quote.id}'">
                    <div class="request-icon quote">
                        <i class="fas fa-tag"></i>
                    </div>
                    <div class="request-info">
                        <div class="request-title">Quote from ${this.escapeHtml(quote.supplier?.business_name || 'Supplier')}</div>
                        <div class="request-meta">${quote.quote_number} • UGX ${this.formatNumber(quote.total_amount)}</div>
                    </div>
                    <span class="request-badge">New</span>
                </div>
            `).join('');
        }
        
        // Render orders
        if (this.pendingRequests.orders?.length > 0) {
            html += '<h4 class="request-category">Active Orders</h4>';
            html += this.pendingRequests.orders.map(order => `
                <div class="request-item" onclick="window.location.href='purchase-order.html?id=${order.id}'">
                    <div class="request-icon order">
                        <i class="fas fa-clipboard-list"></i>
                    </div>
                    <div class="request-info">
                        <div class="request-title">Order ${order.order_number}</div>
                        <div class="request-meta">UGX ${this.formatNumber(order.total_amount)}</div>
                    </div>
                    <span class="request-badge">${order.status}</span>
                </div>
            `).join('');
        }
        
        container.innerHTML = html;
    },
    
    // ============================================
    // FILTER CONVERSATIONS
    // ============================================
    filterConversations() {
        let filtered = [...this.conversations];
        
        // Apply filter
        switch(this.currentFilter) {
            case 'unread':
                filtered = filtered.filter(conv => this.isUnread(conv));
                break;
            case 'inquiry':
                filtered = filtered.filter(conv => conv.inquiry_id);
                break;
            case 'quote':
                filtered = filtered.filter(conv => conv.quote_id);
                break;
            case 'order':
                filtered = filtered.filter(conv => conv.order_id);
                break;
            default:
                // 'all' - no filter
                break;
        }
        
        // Apply search if active
        const searchInput = document.getElementById('chatSearch');
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.toLowerCase().trim();
            filtered = filtered.filter(conv => {
                const other = this.getOtherParticipant(conv);
                if (!other) return false;
                const name = (other.business_name || other.full_name || '').toLowerCase();
                return name.includes(searchTerm);
            });
        }
        
        return filtered;
    },
    
    // ============================================
    // OPEN CONVERSATION
    // ============================================
    openConversation(conversationId) {
        // Navigate to context-chat with conversation ID
        window.location.href = `context-chat.html?conversation=${conversationId}`;
    },
    
    // ============================================
    // START NEW CONVERSATION
    // ============================================
    async startConversation(userId) {
        try {
            // Check if conversation already exists
            const { data: existing, error: searchError } = await sb
                .from('conversations')
                .select('id')
                .or(`and(participant_one_id.eq.${this.currentUser.id},participant_two_id.eq.${userId}),and(participant_one_id.eq.${userId},participant_two_id.eq.${this.currentUser.id})`)
                .is('ad_id', null)
                .is('inquiry_id', null)
                .is('quote_id', null)
                .is('order_id', null)
                .maybeSingle();
                
            if (searchError) throw searchError;
            
            if (existing) {
                this.openConversation(existing.id);
                return;
            }
            
            // Create new conversation
            const { data: newConv, error: createError } = await sb
                .from('conversations')
                .insert({
                    participant_one_id: this.currentUser.id,
                    participant_two_id: userId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
                
            if (createError) throw createError;
            
            this.openConversation(newConv.id);
            
        } catch (error) {
            console.error('Error starting conversation:', error);
            this.showToast('Failed to start conversation', 'error');
        }
    },
    
    // ============================================
    // SEARCH CONTACTS
    // ============================================
    async searchContacts(query) {
        if (!query || query.length < 2) {
            this.renderContacts();
            return;
        }
        
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('*')
                .neq('id', this.currentUser.id)
                .or(`full_name.ilike.%${query}%,business_name.ilike.%${query}%`)
                .limit(20);
                
            if (error) throw error;
            
            const container = document.getElementById('contactSearchResults');
            if (!container) return;
            
            if (data.length === 0) {
                container.innerHTML = '<div class="empty-state">No users found</div>';
                return;
            }
            
            container.innerHTML = data.map(contact => {
                const name = contact.business_name || contact.full_name || 'User';
                return `
                    <div class="contact-item" onclick="ChatSystem.startConversation('${contact.id}'); closeNewChatModal()">
                        ${contact.avatar_url ? 
                            `<img src="${contact.avatar_url}" class="contact-avatar" alt="${this.escapeHtml(name)}">` : 
                            `<div class="contact-avatar-placeholder">${this.getInitials(name)}</div>`
                        }
                        <div class="contact-info">
                            <div class="contact-name">${this.escapeHtml(name)}</div>
                            <div class="contact-status">${contact.is_supplier ? 'Supplier' : 'Buyer'}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error searching contacts:', error);
        }
    },
    
    // ============================================
    // UPDATE BADGES
    // ============================================
    updateUnreadBadge() {
        const totalUnread = this.conversations.reduce((sum, conv) => {
            return sum + this.getUnreadCount(conv);
        }, 0);
        
        const badge = document.getElementById('totalUnreadBadge');
        if (badge) {
            badge.textContent = totalUnread;
            badge.style.display = totalUnread > 0 ? 'inline' : 'none';
        }
    },
    
    updatePendingBadge() {
        const total = (this.pendingRequests?.inquiries?.length || 0) + 
                      (this.pendingRequests?.quotes?.length || 0) + 
                      (this.pendingRequests?.orders?.length || 0);
        
        const badge = document.getElementById('pendingBadge');
        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'inline' : 'none';
        }
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    getOtherParticipant(conversation) {
        if (!conversation) return null;
        return conversation.participant_one_id === this.currentUser.id 
            ? conversation.participant_two 
            : conversation.participant_one;
    },
    
    getUnreadCount(conversation) {
        if (!conversation) return 0;
        return this.currentUser.id === conversation.participant_one_id 
            ? (conversation.unread_count_one || 0)
            : (conversation.unread_count_two || 0);
    },
    
    isUnread(conversation) {
        return this.getUnreadCount(conversation) > 0;
    },
    
    isOnline(userId) {
        return this.onlineUsers.has(userId);
    },
    
    getContextInfo(conversation) {
        if (conversation.inquiry_id) {
            return { type: 'inquiry', label: 'INQ' };
        } else if (conversation.quote_id) {
            return { type: 'quote', label: 'QTE' };
        } else if (conversation.order_id) {
            return { type: 'order', label: 'ORD' };
        } else if (conversation.ad_id) {
            return { type: 'product', label: 'PROD' };
        }
        return null;
    },
    
    getSupplierId() {
        // This would need to be implemented based on your data structure
        // For now, return null
        return null;
    },
    
    getInitials(name) {
        if (!name) return 'U';
        return name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    },
    
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = moment(timestamp);
        const now = moment();
        
        if (date.isSame(now, 'day')) {
            return date.format('h:mm A');
        } else if (date.isSame(now.subtract(1, 'day'), 'day')) {
            return 'Yesterday';
        } else if (date.isAfter(now.subtract(7, 'days'))) {
            return date.format('ddd');
        } else {
            return date.format('MMM D');
        }
    },
    
    formatDate(timestamp) {
        if (!timestamp) return '';
        return moment(timestamp).format('MMM D, YYYY');
    },
    
    formatNumber(num) {
        if (!num) return '0';
        return num.toLocaleString('en-UG');
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // ============================================
    // REALTIME SUBSCRIPTIONS
    // ============================================
    setupRealtimeSubscriptions() {
        // Online presence
        const presenceChannel = sb.channel('online-users');
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                this.onlineUsers = new Set(
                    Object.values(state).flat().map(p => p.user_id)
                );
                this.renderConversations();
                this.renderContacts();
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        user_id: this.currentUser.id,
                        online_at: new Date().toISOString()
                    });
                }
            });
        
        // New messages
        const messagesChannel = sb
            .channel('new-messages')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                async (payload) => {
                    // Reload conversations to update last message
                    await this.loadConversations();
                    
                    // Show notification if not in chat
                    if (payload.new.receiver_id === this.currentUser.id) {
                        this.showNotification('New Message', 'You have a new message');
                    }
                }
            )
            .subscribe();
        
        this.realtimeSubscriptions = [presenceChannel, messagesChannel];
    },
    
    // ============================================
    // ONLINE STATUS
    // ============================================
    async updateOnlineStatus(isOnline) {
        try {
            await sb
                .from('profiles')
                .update({ last_active: new Date().toISOString() })
                .eq('id', this.currentUser.id);
        } catch (error) {
            console.error('Error updating online status:', error);
        }
    },
    
    // ============================================
    // NOTIFICATION
    // ============================================
    showNotification(title, body) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    },
    
    // ============================================
    // TOAST
    // ============================================
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#0B4F6C',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });
        
        // Filter pills
        document.querySelectorAll('.pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentFilter = e.currentTarget.dataset.filter;
                this.renderConversations();
            });
        });
        
        // Search input
        const searchInput = document.getElementById('chatSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.renderConversations();
                }, 300);
            });
        }
        
        // Clear search
        const clearSearch = document.getElementById('clearSearch');
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                const input = document.getElementById('chatSearch');
                if (input) {
                    input.value = '';
                    this.renderConversations();
                }
            });
        }
        
        // New chat button
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this.openNewChatModal());
        }
        
        // FAB button
        const fabBtn = document.getElementById('fabNewChat');
        if (fabBtn) {
            fabBtn.addEventListener('click', () => this.openNewChatModal());
        }
        
        // Empty state new chat
        const emptyStateBtn = document.getElementById('emptyStateNewChat');
        if (emptyStateBtn) {
            emptyStateBtn.addEventListener('click', () => this.openNewChatModal());
        }
        
        // Contact search in modal
        const contactSearch = document.getElementById('contactSearch');
        if (contactSearch) {
            contactSearch.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.searchContacts(e.target.value);
                }, 300);
            });
        }
        
        // Window before unload
        window.addEventListener('beforeunload', () => {
            this.realtimeSubscriptions.forEach(sub => sub.unsubscribe());
            this.updateOnlineStatus(false);
        });
        
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    },
    
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            if (pane.id === `${tab}Tab`) {
                pane.style.display = 'block';
            } else {
                pane.style.display = 'none';
            }
        });
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    openNewChatModal() {
        const modal = document.getElementById('newChatModal');
        if (modal) {
            modal.classList.add('show');
            
            // Reset search
            const searchInput = document.getElementById('contactSearch');
            if (searchInput) {
                searchInput.value = '';
            }
            
            // Show contacts
            const container = document.getElementById('contactSearchResults');
            if (container && this.contacts.length > 0) {
                container.innerHTML = this.contacts.map(contact => {
                    const name = contact.business_name || contact.full_name || 'User';
                    return `
                        <div class="contact-item" onclick="ChatSystem.startConversation('${contact.id}'); ChatSystem.closeNewChatModal()">
                            ${contact.avatar_url ? 
                                `<img src="${contact.avatar_url}" class="contact-avatar" alt="${this.escapeHtml(name)}">` : 
                                `<div class="contact-avatar-placeholder">${this.getInitials(name)}</div>`
                            }
                            <div class="contact-info">
                                <div class="contact-name">${this.escapeHtml(name)}</div>
                                <div class="contact-status">${contact.is_supplier ? 'Supplier' : 'Buyer'}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    },
    
    closeNewChatModal() {
        const modal = document.getElementById('newChatModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }
};

// ============================================
// GLOBAL MODAL FUNCTIONS
// ============================================
window.closeNewChatModal = function() {
    ChatSystem.closeNewChatModal();
};

window.closeMessageOptions = function() {
    document.getElementById('messageOptionsModal')?.classList.remove('show');
};

window.closeConversationMenu = function() {
    document.getElementById('conversationMenuModal')?.classList.remove('show');
};

// Placeholder functions for message actions
window.copyMessage = function() {
    ChatSystem.showToast('Message copied', 'success');
    closeMessageOptions();
};

window.replyToMessage = function() {
    ChatSystem.showToast('Reply feature coming soon', 'info');
    closeMessageOptions();
};

window.forwardMessage = function() {
    ChatSystem.showToast('Forward feature coming soon', 'info');
    closeMessageOptions();
};

window.deleteMessage = function() {
    if (confirm('Delete this message?')) {
        ChatSystem.showToast('Message deleted', 'success');
        closeMessageOptions();
    }
};

window.viewProfile = function() {
    window.location.href = 'profile.html';
    closeConversationMenu();
};

window.muteConversation = function() {
    ChatSystem.showToast('Conversation muted', 'success');
    closeConversationMenu();
};

window.blockUser = function() {
    if (confirm('Block this user?')) {
        ChatSystem.showToast('User blocked', 'success');
        closeConversationMenu();
    }
};

window.deleteConversation = function() {
    if (confirm('Delete this conversation? This cannot be undone.')) {
        ChatSystem.showToast('Conversation deleted', 'success');
        closeConversationMenu();
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    ChatSystem.init();
});

// Make globally available
window.ChatSystem = ChatSystem;