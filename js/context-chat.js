// ============================================
// UNIFIED CONTEXT CHAT - INQUIRIES/QUOTES/ORDERS/PRODUCTS
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
// STATE MANAGEMENT
// ============================================
let ContextChat = {
    currentUser: null,
    currentUserProfile: null,
    currentContext: null, // { type: 'inquiry'|'quote'|'order'|'product', data: {} }
    conversation: null,
    messages: [],
    otherParticipant: null,
    messagePage: 1,
    hasMoreMessages: true,
    isLoadingMessages: false,
    selectedFiles: [],
    realtimeSubscriptions: [],
    typingTimeout: null,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        await this.checkAuth();
        await this.loadUserProfile();
        
        const urlParams = new URLSearchParams(window.location.search);
        const inquiryId = urlParams.get('inquiry');
        const quoteId = urlParams.get('quote');
        const orderId = urlParams.get('order');
        const conversationId = urlParams.get('conversation');
        const productId = urlParams.get('product');
        
        if (inquiryId) {
            this.currentContext = { type: 'inquiry', id: inquiryId };
            await this.loadInquiryContext(inquiryId);
        } else if (quoteId) {
            this.currentContext = { type: 'quote', id: quoteId };
            await this.loadQuoteContext(quoteId);
        } else if (orderId) {
            this.currentContext = { type: 'order', id: orderId };
            await this.loadOrderContext(orderId);
        } else if (conversationId) {
            await this.loadConversationById(conversationId);
        } else if (productId) {
            await this.loadProductContext(productId);
        } else {
            this.showToast('No context specified', 'error');
            setTimeout(() => window.history.back(), 2000);
            return;
        }
        
        await this.loadOrCreateConversation();
        await this.loadMessages();
        this.setupRealtimeSubscriptions();
        this.setupEventListeners();
        this.setupEmojiPicker();
        this.markMessagesAsRead();
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) {
                window.location.href = `login.html?redirect=${window.location.pathname}${window.location.search}`;
                return;
            }
            this.currentUser = user;
        } catch (error) {
            console.error('Auth error:', error);
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
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },
    
    // ============================================
    // CONTEXT LOADING
    // ============================================
    
    async loadInquiryContext(inquiryId) {
        try {
            const { data, error } = await sb
                .from('inquiry_requests')
                .select(`
                    *,
                    buyer:profiles!inquiry_requests_buyer_id_fkey (
                        id,
                        full_name,
                        business_name,
                        avatar_url,
                        is_verified,
                        phone,
                        email
                    ),
                    inquiry_items (*),
                    inquiry_supplier_matches (
                        supplier_id,
                        suppliers!inner (
                            id,
                            business_name,
                            profile_id,
                            profiles!suppliers_profile_id_fkey (
                                id,
                                full_name,
                                avatar_url,
                                is_verified
                            )
                        )
                    )
                `)
                .eq('id', inquiryId)
                .single();
                
            if (error) throw error;
            
            this.currentContext.data = data;
            
            // Determine other participant based on user role
            const isSupplier = this.currentUserProfile?.is_supplier;
            if (isSupplier) {
                // User is supplier - find their supplier record
                const { data: supplier } = await sb
                    .from('suppliers')
                    .select('profile_id')
                    .eq('profile_id', this.currentUser.id)
                    .single();
                
                if (supplier) {
                    // Check if this supplier is matched to the inquiry
                    const match = data.inquiry_supplier_matches?.find(m => m.supplier_id === supplier.id);
                    if (match) {
                        this.otherParticipant = data.buyer;
                    }
                }
            } else {
                // User is buyer - other participant is the first supplier
                const match = data.inquiry_supplier_matches?.[0];
                if (match) {
                    this.otherParticipant = match.suppliers?.profiles;
                }
            }
            
            this.updateUIForRole();
            
        } catch (error) {
            console.error('Error loading inquiry:', error);
            this.showToast('Failed to load inquiry details', 'error');
        }
    },
    
    async loadQuoteContext(quoteId) {
        try {
            const { data, error } = await sb
                .from('supplier_quotes')
                .select(`
                    *,
                    supplier:suppliers!supplier_id (
                        id,
                        business_name,
                        profile_id,
                        profiles!suppliers_profile_id_fkey (
                            id,
                            full_name,
                            avatar_url,
                            is_verified,
                            phone,
                            email
                        )
                    ),
                    inquiry:inquiry_requests!inquiry_id (
                        id,
                        inquiry_number,
                        title,
                        buyer_id,
                        buyer:profiles!inquiry_requests_buyer_id_fkey (
                            id,
                            full_name,
                            business_name,
                            avatar_url,
                            is_verified
                        )
                    ),
                    quote_items:supplier_quote_items (*)
                `)
                .eq('id', quoteId)
                .single();
                
            if (error) throw error;
            
            this.currentContext.data = data;
            
            // Determine other participant based on user role
            const isSupplier = this.currentUserProfile?.is_supplier;
            if (isSupplier) {
                // User is supplier - other participant is buyer
                this.otherParticipant = data.inquiry?.buyer;
            } else {
                // User is buyer - other participant is supplier
                this.otherParticipant = data.supplier?.profiles;
            }
            
            this.updateUIForRole();
            
        } catch (error) {
            console.error('Error loading quote:', error);
            this.showToast('Failed to load quote details', 'error');
        }
    },
    
    async loadOrderContext(orderId) {
        try {
            const { data, error } = await sb
                .from('orders')
                .select(`
                    *,
                    buyer:profiles!orders_buyer_id_fkey (
                        id,
                        full_name,
                        business_name,
                        avatar_url,
                        is_verified,
                        phone,
                        email
                    ),
                    supplier:suppliers!orders_supplier_id_fkey (
                        id,
                        business_name,
                        profile_id,
                        profiles!suppliers_profile_id_fkey (
                            id,
                            full_name,
                            avatar_url,
                            is_verified
                        )
                    ),
                    order_items (*),
                    delivery_tracking (*)
                `)
                .eq('id', orderId)
                .single();
                
            if (error) throw error;
            
            this.currentContext.data = data;
            
            // Determine other participant based on user role
            const isSupplier = this.currentUserProfile?.is_supplier;
            if (isSupplier) {
                // User is supplier - other participant is buyer
                this.otherParticipant = data.buyer;
            } else {
                // User is buyer - other participant is supplier
                this.otherParticipant = data.supplier?.profiles;
            }
            
            this.updateUIForRole();
            
        } catch (error) {
            console.error('Error loading order:', error);
            this.showToast('Failed to load order details', 'error');
        }
    },
    
    async loadProductContext(productId) {
        try {
            const { data, error } = await sb
                .from('ads')
                .select(`
                    *,
                    seller:profiles!ads_seller_id_fkey (
                        id,
                        full_name,
                        business_name,
                        avatar_url,
                        is_verified,
                        phone,
                        email,
                        district,
                        location
                    )
                `)
                .eq('id', productId)
                .single();
                
            if (error) throw error;
            
            this.currentContext = {
                type: 'product',
                id: productId,
                data: data
            };
            
            // Other participant is the seller
            this.otherParticipant = data.seller;
            
            this.updateUIForRole();
            
        } catch (error) {
            console.error('Error loading product:', error);
            this.showToast('Failed to load product details', 'error');
        }
    },
    
    async loadConversationById(conversationId) {
        try {
            const { data: conversation, error } = await sb
                .from('conversations')
                .select(`
                    *,
                    participant_one:profiles!conversations_participant_one_id_fkey (
                        id, full_name, business_name, avatar_url, is_verified
                    ),
                    participant_two:profiles!conversations_participant_two_id_fkey (
                        id, full_name, business_name, avatar_url, is_verified
                    ),
                    ad:ads!conversations_ad_id_fkey (
                        id, title, wholesale_price, price, image_urls, moq
                    ),
                    inquiry:inquiry_requests!conversations_inquiry_id_fkey (
                        id, inquiry_number, title, status, created_at
                    ),
                    quote:supplier_quotes!conversations_quote_id_fkey (
                        id, quote_number, total_amount, status, valid_until
                    ),
                    order:orders!conversations_order_id_fkey (
                        id, order_number, total_amount, status, created_at
                    )
                `)
                .eq('id', conversationId)
                .single();
                
            if (error) throw error;
            
            this.conversation = conversation;
            
            // Determine context type based on what's attached
            if (conversation.inquiry_id) {
                this.currentContext = { 
                    type: 'inquiry', 
                    id: conversation.inquiry_id,
                    data: conversation.inquiry 
                };
                // Load full inquiry data
                await this.loadInquiryContext(conversation.inquiry_id);
            } else if (conversation.quote_id) {
                this.currentContext = { 
                    type: 'quote', 
                    id: conversation.quote_id,
                    data: conversation.quote 
                };
                await this.loadQuoteContext(conversation.quote_id);
            } else if (conversation.order_id) {
                this.currentContext = { 
                    type: 'order', 
                    id: conversation.order_id,
                    data: conversation.order 
                };
                await this.loadOrderContext(conversation.order_id);
            } else if (conversation.ad_id) {
                this.currentContext = { 
                    type: 'product', 
                    id: conversation.ad_id,
                    data: conversation.ad 
                };
                await this.loadProductContext(conversation.ad_id);
            }
            
            // Determine other participant
            this.otherParticipant = conversation.participant_one_id === this.currentUser.id 
                ? conversation.participant_two 
                : conversation.participant_one;
            
            this.renderContextBar();
            this.updateUIForRole();
            
        } catch (error) {
            console.error('Error loading conversation:', error);
            this.showToast('Failed to load conversation', 'error');
        }
    },
    
    // ============================================
    // CONVERSATION MANAGEMENT
    // ============================================
    
    async loadOrCreateConversation() {
        if (this.conversation) return; // Already loaded via conversation ID
        
        try {
            const contextField = this.currentContext.type === 'product' ? 'ad_id' : `${this.currentContext.type}_id`;
            
            // Check if conversation exists
            let query = sb
                .from('conversations')
                .select('*')
                .eq(contextField, this.currentContext.id);
            
            // For product conversations, check both participant combinations
            if (this.currentContext.type === 'product') {
                query = query.or(`and(participant_one_id.eq.${this.currentUser.id},participant_two_id.eq.${this.otherParticipant.id}),and(participant_one_id.eq.${this.otherParticipant.id},participant_two_id.eq.${this.currentUser.id})`);
            } else {
                query = query.or(`participant_one_id.eq.${this.currentUser.id},participant_two_id.eq.${this.currentUser.id}`);
            }
            
            const { data: existing, error: searchError } = await query.maybeSingle();
                
            if (searchError) throw searchError;
            
            if (existing) {
                this.conversation = existing;
                return;
            }
            
            // Create new conversation
            const insertData = {
                participant_one_id: this.currentUser.id,
                participant_two_id: this.otherParticipant.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            if (this.currentContext.type === 'product') {
                insertData.ad_id = parseInt(this.currentContext.id);
            } else {
                insertData[`${this.currentContext.type}_id`] = parseInt(this.currentContext.id);
            }
            
            const { data, error } = await sb
                .from('conversations')
                .insert(insertData)
                .select()
                .single();
                
            if (error) throw error;
            
            this.conversation = data;
            
            // Send initial context message for new conversations
            await this.sendContextIntroMessage();
            
        } catch (error) {
            console.error('Error with conversation:', error);
            this.showToast('Failed to load conversation', 'error');
        }
    },
    
    async sendContextIntroMessage() {
        let message = '';
        
        if (this.currentContext.type === 'inquiry') {
            const inquiry = this.currentContext.data;
            message = `📋 Starting discussion about inquiry #${inquiry?.inquiry_number || ''}: ${inquiry?.title || ''}`;
        } else if (this.currentContext.type === 'quote') {
            const quote = this.currentContext.data;
            message = `💰 Discussing quote #${quote?.quote_number || ''} for UGX ${this.formatNumber(quote?.total_amount || 0)}`;
        } else if (this.currentContext.type === 'order') {
            const order = this.currentContext.data;
            message = `📦 Following up on order #${order?.order_number || ''}`;
        } else if (this.currentContext.type === 'product') {
            const product = this.currentContext.data;
            message = `👋 I'm interested in ${product?.title || 'your product'}. Can we discuss pricing and details?`;
        }
        
        // Add items summary if available
        const items = this.getContextItems();
        if (items && items.length > 0) {
            message += `\n\nItems:\n${items.slice(0, 3).map(item => 
                `• ${item.product_name || item.title || 'Item'} x${item.quantity || 1}`
            ).join('\n')}`;
            if (items.length > 3) {
                message += `\n• ...and ${items.length - 3} more items`;
            }
        }
        
        if (message && document.getElementById('messageInput')) {
            document.getElementById('messageInput').value = message;
            document.getElementById('messageInput').dispatchEvent(new Event('input'));
        }
    },
    
    // ============================================
    // MESSAGE FUNCTIONS
    // ============================================
    
    async loadMessages(reset = true) {
        if (!this.conversation || this.isLoadingMessages) return;
        
        this.isLoadingMessages = true;
        
        if (reset) {
            this.messagePage = 1;
            this.hasMoreMessages = true;
            const container = document.getElementById('messagesContainer');
            if (container) {
                container.innerHTML = '';
            }
            this.showLoading(true);
        }
        
        try {
            const from = (this.messagePage - 1) * 30;
            const to = from + 29;
            
            const { data, error } = await sb
                .from('messages')
                .select(`
                    *,
                    attachments:message_attachments(*),
                    sender:profiles!messages_sender_id_fkey (
                        id,
                        full_name,
                        avatar_url,
                        is_supplier
                    )
                `)
                .eq('conversation_id', this.conversation.id)
                .order('created_at', { ascending: false })
                .range(from, to);
                
            if (error) throw error;
            
            if (data.length < 30) {
                this.hasMoreMessages = false;
            }
            
            const newMessages = data.reverse();
            
            if (reset) {
                this.messages = newMessages;
            } else {
                this.messages = [...newMessages, ...this.messages];
            }
            
            this.renderMessages(reset);
            
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showToast('Failed to load messages', 'error');
        } finally {
            this.isLoadingMessages = false;
            this.showLoading(false);
        }
    },
    
    async sendMessage(content = null) {
        const input = document.getElementById('messageInput');
        const messageContent = content || input?.value.trim();
        
        if ((!messageContent || messageContent === '') && this.selectedFiles.length === 0) return;
        if (!this.conversation) return;
        
        try {
            this.disableInput(true);
            
            const messageData = {
                conversation_id: this.conversation.id,
                sender_id: this.currentUser.id,
                receiver_id: this.otherParticipant.id,
                content: messageContent || '(Attachment)',
                message_type: this.selectedFiles.length > 0 ? 'file' : 'text',
                created_at: new Date().toISOString()
            };
            
            // Add context ID if applicable
            if (this.currentContext) {
                if (this.currentContext.type === 'product') {
                    messageData.ad_id = parseInt(this.currentContext.id);
                } else {
                    messageData[`${this.currentContext.type}_id`] = parseInt(this.currentContext.id);
                }
            }
            
            const { data: message, error } = await sb
                .from('messages')
                .insert(messageData)
                .select()
                .single();
                
            if (error) throw error;
            
            if (this.selectedFiles.length > 0) {
                await this.uploadAttachments(message.id);
            }
            
            if (input) {
                input.value = '';
                input.style.height = 'auto';
            }
            this.selectedFiles = [];
            this.hideAttachmentPreview();
            
            this.messages.push(message);
            this.renderMessages(true);
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('Failed to send message', 'error');
        } finally {
            this.disableInput(false);
        }
    },
    
    async uploadAttachments(messageId) {
        for (const file of this.selectedFiles) {
            const filePath = `${this.conversation.id}/${Date.now()}_${file.name}`;
            
            const { error: uploadError } = await sb.storage
                .from('chat-attachments')
                .upload(filePath, file);
                
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = sb.storage
                .from('chat-attachments')
                .getPublicUrl(filePath);
            
            await sb
                .from('message_attachments')
                .insert({
                    message_id: messageId,
                    file_url: publicUrl,
                    file_name: file.name,
                    file_size: file.size,
                    file_type: file.type,
                    created_at: new Date().toISOString()
                });
        }
    },
    
    // ============================================
    // RENDERING
    // ============================================
    
    renderContextBar() {
        const bar = document.getElementById('contextBar');
        const badge = document.getElementById('contextBadge');
        const title = document.getElementById('chatTitle');
        
        if (!bar) return;
        
        if (!this.currentContext || !this.currentContext.data) {
            bar.style.display = 'none';
            if (badge) badge.textContent = 'CHAT';
            if (title) title.textContent = 'Business Chat';
            return;
        }
        
        const type = this.currentContext.type;
        const data = this.currentContext.data;
        
        // Set badge
        if (badge) {
            badge.textContent = type.toUpperCase();
            badge.className = `context-badge ${type}`;
        }
        
        // Set title
        if (title) {
            if (type === 'inquiry') {
                title.textContent = `Inquiry: ${data?.inquiry_number || ''}`;
            } else if (type === 'quote') {
                title.textContent = `Quote: ${data?.quote_number || ''}`;
            } else if (type === 'order') {
                title.textContent = `Order: ${data?.order_number || ''}`;
            } else if (type === 'product') {
                title.textContent = `Product: ${data?.title?.substring(0, 30) || ''}${data?.title?.length > 30 ? '...' : ''}`;
            } else {
                title.textContent = 'Business Chat';
            }
        }
        
        // Build context bar HTML
        let icon = '';
        let details = '';
        let actions = '';
        
        if (type === 'inquiry') {
            icon = 'fa-file-invoice';
            details = `
                <h2>${this.escapeHtml(data?.title || 'Inquiry')}</h2>
                <p>
                    <span><i class="fas fa-hashtag"></i> ${data?.inquiry_number || ''}</span>
                    <span><i class="fas fa-calendar"></i> ${this.formatDate(data?.created_at)}</span>
                    <span><i class="fas fa-tag"></i> ${data?.status || ''}</span>
                </p>
            `;
            actions = `
                <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                    <i class="fas fa-eye"></i> View Details
                </button>
            `;
        } else if (type === 'quote') {
            icon = 'fa-file-invoice';
            const items = data?.quote_items || [];
            const total = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
            
            details = `
                <h2>Quote ${data?.quote_number || ''}</h2>
                <p>
                    <span><i class="fas fa-tag"></i> UGX ${this.formatNumber(total)}</span>
                    <span><i class="fas fa-boxes"></i> ${items.length} items</span>
                    <span><i class="fas fa-calendar"></i> Valid: ${this.formatDate(data?.valid_until)}</span>
                    <span><i class="fas fa-clock"></i> ${data?.status || ''}</span>
                </p>
            `;
            
            const isSupplier = this.currentUserProfile?.is_supplier;
            if (!isSupplier && data?.status === 'sent') {
                actions = `
                    <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                        <i class="fas fa-eye"></i> Details
                    </button>
                    <button class="context-btn primary" onclick="ContextChat.showAcceptQuote()">
                        <i class="fas fa-check"></i> Accept
                    </button>
                    <button class="context-btn" onclick="ContextChat.showCounterOffer()">
                        <i class="fas fa-handshake"></i> Counter
                    </button>
                `;
            } else {
                actions = `
                    <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                `;
            }
        } else if (type === 'order') {
            icon = 'fa-clipboard-list';
            const tracking = data?.delivery_tracking?.[0];
            
            details = `
                <h2>Order ${data?.order_number || ''}</h2>
                <p>
                    <span><i class="fas fa-tag"></i> UGX ${this.formatNumber(data?.total_amount || 0)}</span>
                    <span><i class="fas fa-boxes"></i> ${data?.order_items?.length || 0} items</span>
                    <span><i class="fas fa-clock"></i> ${data?.status || ''}</span>
                    ${data?.tracking_number ? `
                        <span><i class="fas fa-truck"></i> ${data.tracking_number}</span>
                    ` : ''}
                </p>
            `;
            
            const isSupplier = this.currentUserProfile?.is_supplier;
            if (isSupplier && data?.status === 'processing') {
                actions = `
                    <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="context-btn" onclick="ContextChat.showTrackingModal()">
                        <i class="fas fa-truck"></i> Update Tracking
                    </button>
                `;
            } else if (!isSupplier && data?.status === 'shipped') {
                actions = `
                    <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                        <i class="fas fa-eye"></i> Track
                    </button>
                    <button class="context-btn primary" onclick="ContextChat.showConfirmDelivery()">
                        <i class="fas fa-check-circle"></i> Confirm Delivery
                    </button>
                `;
            } else {
                actions = `
                    <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                `;
            }
        } else if (type === 'product') {
            icon = 'fa-box';
            details = `
                <h2>${this.escapeHtml(data?.title || 'Product')}</h2>
                <p>
                    <span><i class="fas fa-tag"></i> UGX ${this.formatNumber(data?.wholesale_price || data?.price || 0)}</span>
                    ${data?.moq ? `<span><i class="fas fa-boxes"></i> MOQ: ${data.moq}</span>` : ''}
                    <span><i class="fas fa-store"></i> ${this.escapeHtml(data?.seller?.business_name || data?.seller?.full_name || 'Seller')}</span>
                </p>
            `;
            actions = `
                <button class="context-btn" onclick="ContextChat.viewContextDetails()">
                    <i class="fas fa-eye"></i> View Product
                </button>
            `;
        }
        
        bar.style.display = 'flex';
        bar.innerHTML = `
            <div class="context-info">
                <div class="context-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="context-details">
                    ${details}
                </div>
            </div>
            <div class="context-actions">
                ${actions}
            </div>
        `;
    },
    
    renderMessages(scrollToBottom = true) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        let currentDate = null;
        let html = '';
        
        if (this.messages.length === 0) {
            html = `
                <div class="empty-state-messages">
                    <i class="fas fa-comments"></i>
                    <p>No messages yet. Start the conversation!</p>
                </div>
            `;
        } else {
            this.messages.forEach(message => {
                const messageDate = new Date(message.created_at).toDateString();
                
                if (messageDate !== currentDate) {
                    currentDate = messageDate;
                    html += `
                        <div class="message-date-divider">
                            <span class="date-divider-text">${this.formatMessageDate(message.created_at)}</span>
                        </div>
                    `;
                }
                
                const isOwn = message.sender_id === this.currentUser.id;
                
                html += `
                    <div class="message-wrapper ${isOwn ? 'own-message' : ''}">
                        <div class="message-bubble">
                            <div class="message-text">${this.formatMessageText(message.content)}</div>
                            
                            ${this.renderMessageAttachments(message.attachments)}
                            
                            <div class="message-time">
                                ${this.formatTime(message.created_at)}
                                ${isOwn ? this.getMessageStatus(message) : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        
        if (scrollToBottom) {
            this.scrollToBottom();
        }
    },
    
    renderMessageAttachments(attachments) {
        if (!attachments || attachments.length === 0) return '';
        
        return attachments.map(att => {
            if (att.file_type?.startsWith('image/')) {
                return `
                    <div class="message-attachment">
                        <img src="${att.file_url}" class="attachment-image" 
                             onclick="ContextChat.viewImage('${att.file_url}')"
                             loading="lazy">
                    </div>
                `;
            } else {
                return `
                    <div class="message-attachment">
                        <a href="${att.file_url}" target="_blank" class="attachment-file">
                            <i class="fas ${this.getFileIcon(att.file_type)}"></i>
                            <div class="attachment-info">
                                <div class="attachment-name">${this.escapeHtml(att.file_name)}</div>
                                <div class="attachment-size">${this.formatFileSize(att.file_size)}</div>
                            </div>
                        </a>
                    </div>
                `;
            }
        }).join('');
    },
    
    getMessageStatus(message) {
        if (message.is_read) {
            return '<i class="fas fa-check-double read"></i>';
        } else if (message.delivered_at) {
            return '<i class="fas fa-check"></i>';
        }
        return '<i class="fas fa-clock"></i>';
    },
    
    updateUIForRole() {
        const quickActions = document.getElementById('quickActions');
        const isSupplier = this.currentUserProfile?.is_supplier;
        
        if (!quickActions || !this.currentContext) return;
        
        let actions = [];
        const type = this.currentContext.type;
        const data = this.currentContext.data;
        
        if (type === 'inquiry') {
            if (isSupplier) {
                actions = [
                    { icon: 'fa-file-invoice', text: 'Create Quote', action: 'createQuote' },
                    { icon: 'fa-question-circle', text: 'Ask Question', action: 'askQuestion' }
                ];
            } else {
                actions = [
                    { icon: 'fa-eye', text: 'View Details', action: 'viewContextDetails' },
                    { icon: 'fa-edit', text: 'Edit Inquiry', action: 'editContext' }
                ];
            }
        } else if (type === 'quote') {
            if (isSupplier) {
                actions = [
                    { icon: 'fa-eye', text: 'View Quote', action: 'viewContextDetails' },
                    { icon: 'fa-edit', text: 'Revise', action: 'showRevisionModal' }
                ];
            } else {
                actions = [
                    { icon: 'fa-eye', text: 'Details', action: 'viewContextDetails' }
                ];
                
                if (data?.status === 'sent') {
                    actions.push(
                        { icon: 'fa-check', text: 'Accept', action: 'showAcceptQuote', class: 'primary' },
                        { icon: 'fa-handshake', text: 'Counter', action: 'showCounterOffer' }
                    );
                }
            }
        } else if (type === 'order') {
            if (isSupplier) {
                actions = [
                    { icon: 'fa-eye', text: 'View Order', action: 'viewContextDetails' }
                ];
                
                if (data?.status === 'processing') {
                    actions.push({ icon: 'fa-truck', text: 'Update Tracking', action: 'showTrackingModal' });
                }
            } else {
                actions = [
                    { icon: 'fa-eye', text: 'Track', action: 'viewContextDetails' }
                ];
                
                if (data?.status === 'shipped') {
                    actions.push({ icon: 'fa-check-circle', text: 'Confirm Delivery', action: 'showConfirmDelivery', class: 'primary' });
                }
                
                if (['pending', 'confirmed', 'processing'].includes(data?.status)) {
                    actions.push({ icon: 'fa-flag', text: 'Report Issue', action: 'reportIssue' });
                }
            }
        } else if (type === 'product') {
            actions = [
                { icon: 'fa-eye', text: 'View Product', action: 'viewContextDetails' },
                { icon: 'fa-tag', text: 'Make Offer', action: 'makeOffer' }
            ];
        }
        
        if (actions.length > 0) {
            quickActions.style.display = 'flex';
            quickActions.innerHTML = actions.map(action => `
                <button class="quick-action-btn ${action.class || ''}" 
                        onclick="ContextChat.${action.action}()">
                    <i class="fas ${action.icon}"></i>
                    ${action.text}
                </button>
            `).join('');
        } else {
            quickActions.style.display = 'none';
        }
    },
    
    // ============================================
    // CONTEXT ACTIONS
    // ============================================
    
    viewContextDetails() {
        if (!this.currentContext) return;
        
        const type = this.currentContext.type;
        const id = this.currentContext.id;
        
        if (type === 'inquiry') {
            window.location.href = `inquiry-details.html?id=${id}`;
        } else if (type === 'quote') {
            const isSupplier = this.currentUserProfile?.is_supplier;
            window.location.href = isSupplier ? `supplier-quote.html?id=${id}` : `buyer-quote.html?id=${id}`;
        } else if (type === 'order') {
            window.location.href = `purchase-order.html?id=${id}`;
        } else if (type === 'product') {
            window.location.href = `B2B-product-detail.html?id=${id}`;
        }
    },
    
    editContext() {
        if (this.currentContext.type === 'inquiry') {
            window.location.href = `send-inquiry.html?edit=${this.currentContext.id}`;
        }
    },
    
    createQuote() {
        if (this.currentContext.type === 'inquiry') {
            window.location.href = `supplier-quotation.html?inquiry=${this.currentContext.id}`;
        }
    },
    
    askQuestion() {
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = 'I have a question about this inquiry. ';
            input.focus();
            input.dispatchEvent(new Event('input'));
        }
    },
    
    makeOffer() {
        const input = document.getElementById('messageInput');
        if (input && this.currentContext.data) {
            const product = this.currentContext.data;
            const suggestedPrice = Math.round((product.wholesale_price || product.price || 0) * 0.9);
            input.value = `I'd like to make an offer of UGX ${this.formatNumber(suggestedPrice)} for this product. `;
            input.focus();
            input.dispatchEvent(new Event('input'));
        }
    },
    
    // ============================================
    // QUOTE ACTIONS
    // ============================================
    
    showAcceptQuote() {
        if (this.currentContext.type !== 'quote') return;
        
        const quote = this.currentContext.data;
        const modal = document.getElementById('acceptQuoteModal');
        const summary = document.getElementById('acceptQuoteSummary');
        
        if (!modal || !summary) return;
        
        const items = quote?.quote_items || [];
        const total = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
        
        summary.innerHTML = `
            <h4>Quote Summary</h4>
            <div class="summary-row">
                <span>Quote Number:</span>
                <span>${quote?.quote_number || ''}</span>
            </div>
            <div class="summary-row">
                <span>Total Amount:</span>
                <span>UGX ${this.formatNumber(total)}</span>
            </div>
            <div class="summary-row">
                <span>Valid Until:</span>
                <span>${this.formatDate(quote?.valid_until)}</span>
            </div>
            <div class="summary-row">
                <span>Items:</span>
                <span>${items.length}</span>
            </div>
        `;
        
        modal.classList.add('show');
        
        const termsCheckbox = document.getElementById('acceptTerms');
        const confirmBtn = document.getElementById('confirmAcceptBtn');
        
        if (termsCheckbox && confirmBtn) {
            termsCheckbox.checked = false;
            confirmBtn.disabled = true;
            
            termsCheckbox.addEventListener('change', (e) => {
                confirmBtn.disabled = !e.target.checked;
            });
        }
    },
    
    async acceptQuote() {
        if (this.currentContext.type !== 'quote') return;
        
        try {
            const quote = this.currentContext.data;
            
            // Update quote status
            await sb
                .from('supplier_quotes')
                .update({ status: 'accepted' })
                .eq('id', quote.id);
            
            // Create order
            const orderNumber = 'PO-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            
            const { data: order } = await sb
                .from('orders')
                .insert({
                    order_number: orderNumber,
                    buyer_id: this.currentUser.id,
                    supplier_id: quote.supplier_id,
                    status: 'pending',
                    total_amount: quote.total_amount,
                    original_quote_id: quote.id,
                    inquiry_id: quote.inquiry_id,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            // Create order items
            const items = quote.quote_items || [];
            if (items.length > 0) {
                await sb
                    .from('order_items')
                    .insert(items.map(item => ({
                        order_id: order.id,
                        ad_id: item.product_id,
                        product_title: item.product_name,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price,
                        status: 'pending'
                    })));
            }
            
            // Send confirmation message
            const message = `✅ Quote accepted! Order #${orderNumber} has been created.`;
            const input = document.getElementById('messageInput');
            if (input) {
                input.value = message;
                await this.sendMessage();
            }
            
            this.closeAcceptQuoteModal();
            this.showToast('Quote accepted! Order created.', 'success');
            
            // Reload context to show updated status
            setTimeout(() => window.location.reload(), 2000);
            
        } catch (error) {
            console.error('Error accepting quote:', error);
            this.showToast('Failed to accept quote', 'error');
        }
    },
    
    showCounterOffer() {
        if (this.currentContext.type !== 'quote') return;
        
        const items = this.currentContext.data?.quote_items || [];
        const form = document.getElementById('counterOfferForm');
        
        if (!form) return;
        
        form.innerHTML = items.map((item, index) => `
            <div class="counter-offer-item">
                <div class="counter-item-header">
                    <span class="counter-item-name">${this.escapeHtml(item.product_name)}</span>
                    <span class="counter-item-original">
                        Original: <span>UGX ${this.formatNumber(item.unit_price)}</span>
                    </span>
                </div>
                <div class="counter-price-input">
                    <input type="number" 
                           id="counter_${index}" 
                           value="${item.unit_price}"
                           min="0" 
                           step="100"
                           onchange="ContextChat.updateCounterSummary()">
                    <span>UGX</span>
                </div>
            </div>
        `).join('');
        
        this.updateCounterSummary();
        document.getElementById('counterOfferModal')?.classList.add('show');
    },
    
    updateCounterSummary() {
        const items = this.currentContext.data?.quote_items || [];
        let originalTotal = 0;
        let newTotal = 0;
        
        items.forEach((item, index) => {
            const input = document.getElementById(`counter_${index}`);
            if (input) {
                const newPrice = parseFloat(input.value) || 0;
                originalTotal += item.total_price || (item.unit_price * item.quantity);
                newTotal += newPrice * item.quantity;
            }
        });
        
        const diff = newTotal - originalTotal;
        const summary = document.getElementById('counterOfferSummary');
        
        if (summary) {
            summary.innerHTML = `
                <div class="summary-row">
                    <span>Original Total:</span>
                    <span>UGX ${this.formatNumber(originalTotal)}</span>
                </div>
                <div class="summary-row">
                    <span>New Total:</span>
                    <span>UGX ${this.formatNumber(newTotal)}</span>
                </div>
                <div class="summary-row total">
                    <span>Difference:</span>
                    <span style="color: ${diff >= 0 ? '#10B981' : '#EF4444'}">
                        ${diff >= 0 ? '+' : '-'} UGX ${this.formatNumber(Math.abs(diff))}
                    </span>
                </div>
            `;
        }
    },
    
    async sendCounterOffer() {
        const items = this.currentContext.data?.quote_items || [];
        const message = document.getElementById('counterMessage')?.value || '';
        
        let counterDetails = [];
        let newTotal = 0;
        
        items.forEach((item, index) => {
            const input = document.getElementById(`counter_${index}`);
            if (input) {
                const newPrice = parseFloat(input.value) || 0;
                counterDetails.push(`${item.product_name}: UGX ${this.formatNumber(item.unit_price)} → UGX ${this.formatNumber(newPrice)}`);
                newTotal += newPrice * item.quantity;
            }
        });
        
        const counterMessage = `💬 Counter offer:\n${counterDetails.join('\n')}\n\nNew Total: UGX ${this.formatNumber(newTotal)}\n\n${message}`;
        
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = counterMessage;
        }
        this.closeCounterOfferModal();
        await this.sendMessage();
        this.showToast('Counter offer sent', 'success');
    },
    
    // ============================================
    // ORDER ACTIONS
    // ============================================
    
    showConfirmDelivery() {
        document.getElementById('confirmDeliveryModal')?.classList.add('show');
    },
    
    async confirmDelivery() {
        const itemsDamaged = document.getElementById('itemsDamaged')?.checked || false;
        const itemsMissing = document.getElementById('itemsMissing')?.checked || false;
        const itemsWrong = document.getElementById('itemsWrong')?.checked || false;
        const notes = document.getElementById('deliveryNotes')?.value || '';
        
        const hasIssues = itemsDamaged || itemsMissing || itemsWrong;
        
        try {
            await sb
                .from('orders')
                .update({
                    status: hasIssues ? 'disputed' : 'delivered',
                    delivered_at: new Date().toISOString()
                })
                .eq('id', this.currentContext.id);
            
            const message = hasIssues ? 
                `⚠️ Delivery completed with issues: ${[
                    itemsDamaged ? 'Damaged items' : '',
                    itemsMissing ? 'Missing items' : '',
                    itemsWrong ? 'Wrong items' : ''
                ].filter(Boolean).join(', ')}${notes ? `\n\nNotes: ${notes}` : ''}` :
                '✅ Order delivered successfully!';
            
            const input = document.getElementById('messageInput');
            if (input) {
                input.value = message;
            }
            this.closeConfirmDeliveryModal();
            await this.sendMessage();
            
            this.showToast(hasIssues ? 'Issues reported' : 'Delivery confirmed', 'success');
            
        } catch (error) {
            console.error('Error confirming delivery:', error);
            this.showToast('Failed to confirm delivery', 'error');
        }
    },
    
    showTrackingModal() {
        const order = this.currentContext.data;
        const modal = document.getElementById('trackingModal');
        
        if (modal) {
            document.getElementById('trackingNumber').value = order?.tracking_number || '';
            document.getElementById('carrier').value = order?.carrier || '';
            document.getElementById('estimatedDelivery').value = order?.estimated_delivery || '';
            modal.classList.add('show');
        }
    },
    
    async updateTracking() {
        const trackingNumber = document.getElementById('trackingNumber')?.value;
        const carrier = document.getElementById('carrier')?.value;
        const estimatedDelivery = document.getElementById('estimatedDelivery')?.value;
        
        if (!trackingNumber) {
            this.showToast('Please enter tracking number', 'error');
            return;
        }
        
        try {
            await sb
                .from('orders')
                .update({
                    tracking_number: trackingNumber,
                    carrier: carrier,
                    estimated_delivery: estimatedDelivery || null,
                    status: 'shipped',
                    shipped_at: new Date().toISOString()
                })
                .eq('id', this.currentContext.id);
            
            // Add tracking event
            await sb
                .from('delivery_tracking')
                .insert({
                    order_id: this.currentContext.id,
                    status: 'Shipped',
                    description: `Tracking number: ${trackingNumber}`,
                    created_at: new Date().toISOString()
                });
            
            const message = `📦 Tracking information added: ${trackingNumber}${carrier ? ` via ${carrier}` : ''}`;
            const input = document.getElementById('messageInput');
            if (input) {
                input.value = message;
            }
            this.closeTrackingModal();
            await this.sendMessage();
            
            this.showToast('Tracking updated', 'success');
            
        } catch (error) {
            console.error('Error updating tracking:', error);
            this.showToast('Failed to update tracking', 'error');
        }
    },
    
    reportIssue() {
        const input = document.getElementById('messageInput');
        if (input) {
            input.value = '⚠️ I need to report an issue with this order: ';
            input.focus();
            input.dispatchEvent(new Event('input'));
        }
    },
    
    // ============================================
    // REALTIME SUBSCRIPTIONS
    // ============================================
    
    setupRealtimeSubscriptions() {
        if (!this.conversation) return;
        
        // New messages
        const messagesChannel = sb
            .channel('context-messages-' + this.conversation.id)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${this.conversation.id}` },
                async (payload) => {
                    const { data: message } = await sb
                        .from('messages')
                        .select('*, attachments:message_attachments(*)')
                        .eq('id', payload.new.id)
                        .single();
                        
                    if (message) {
                        this.messages.push(message);
                        this.renderMessages(true);
                        
                        if (message.sender_id !== this.currentUser.id) {
                            this.markMessagesAsRead();
                        }
                    }
                }
            )
            .subscribe();
        
        // Typing indicators
        const typingChannel = sb
            .channel(`typing-${this.conversation.id}`)
            .on('broadcast', { event: 'typing' }, (payload) => {
                if (payload.payload.user_id !== this.currentUser.id) {
                    document.getElementById('typingIndicator').style.display = 'flex';
                }
            })
            .on('broadcast', { event: 'stop_typing' }, (payload) => {
                if (payload.payload.user_id !== this.currentUser.id) {
                    document.getElementById('typingIndicator').style.display = 'none';
                }
            })
            .subscribe();
        
        // Context updates
        if (this.currentContext) {
            const contextChannel = sb
                .channel('context-updates-' + this.currentContext.id)
                .on('postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: `${this.currentContext.type === 'product' ? 'ads' : this.currentContext.type + 's'}`, filter: `id=eq.${this.currentContext.id}` },
                    async () => {
                        // Reload context data
                        if (this.currentContext.type === 'inquiry') {
                            await this.loadInquiryContext(this.currentContext.id);
                        } else if (this.currentContext.type === 'quote') {
                            await this.loadQuoteContext(this.currentContext.id);
                        } else if (this.currentContext.type === 'order') {
                            await this.loadOrderContext(this.currentContext.id);
                        } else if (this.currentContext.type === 'product') {
                            await this.loadProductContext(this.currentContext.id);
                        }
                        this.renderContextBar();
                    }
                )
                .subscribe();
            
            this.realtimeSubscriptions = [messagesChannel, typingChannel, contextChannel];
        } else {
            this.realtimeSubscriptions = [messagesChannel, typingChannel];
        }
    },
    
    async markMessagesAsRead() {
        try {
            await sb
                .from('messages')
                .update({ is_read: true, read_at: new Date().toISOString() })
                .eq('conversation_id', this.conversation.id)
                .eq('receiver_id', this.currentUser.id)
                .eq('is_read', false);
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    
    getContextItems() {
        const data = this.currentContext?.data;
        if (!data) return [];
        
        if (this.currentContext.type === 'inquiry') {
            return data.inquiry_items || [];
        } else if (this.currentContext.type === 'quote') {
            return data.quote_items || [];
        } else if (this.currentContext.type === 'order') {
            return data.order_items || [];
        }
        return [];
    },
    
    formatDate(dateString) {
        if (!dateString) return '';
        return moment(dateString).format('MMM D, YYYY');
    },
    
    formatTime(timestamp) {
        return moment(timestamp).format('h:mm A');
    },
    
    formatMessageDate(timestamp) {
        const date = moment(timestamp);
        const now = moment();
        
        if (date.isSame(now, 'day')) return 'Today';
        if (date.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
        return date.format('MMMM D, YYYY');
    },
    
    formatMessageText(text) {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    },
    
    formatNumber(num) {
        if (!num && num !== 0) return '0';
        return parseInt(num).toLocaleString('en-UG');
    },
    
    formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },
    
    getFileIcon(mimeType) {
        if (mimeType?.includes('pdf')) return 'fa-file-pdf';
        if (mimeType?.includes('word') || mimeType?.includes('document')) return 'fa-file-word';
        if (mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) return 'fa-file-excel';
        if (mimeType?.includes('image')) return 'fa-file-image';
        if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return 'fa-file-archive';
        return 'fa-file';
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },
    
    showLoading(show) {
        const loading = document.getElementById('loadingState');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    },
    
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
        
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    
    disableInput(disabled) {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendMessageBtn');
        if (input) input.disabled = disabled;
        if (sendBtn) sendBtn.disabled = disabled;
    },
    
    autoResize(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    },
    
    checkSendButton() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn && input) {
            sendBtn.disabled = !input.value.trim() && this.selectedFiles.length === 0;
        }
    },
    
    // ============================================
    // FILE HANDLING
    // ============================================
    
    handleFileSelect(files) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        
        this.selectedFiles = Array.from(files).filter(file => {
            if (file.size > maxSize) {
                this.showToast(`${file.name} exceeds 10MB`, 'error');
                return false;
            }
            if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
                this.showToast(`File type not allowed: ${file.name}`, 'error');
                return false;
            }
            return true;
        });
        
        this.showAttachmentPreview();
    },
    
    showAttachmentPreview() {
        const preview = document.getElementById('attachmentPreview');
        if (!preview) return;
        
        if (this.selectedFiles.length === 0) {
            preview.style.display = 'none';
            return;
        }
        
        preview.style.display = 'flex';
        
        const file = this.selectedFiles[0];
        const extraCount = this.selectedFiles.length - 1;
        
        preview.innerHTML = `
            <div class="preview-file">
                <i class="fas ${this.getFileIcon(file.type)}"></i>
                <div class="preview-info">
                    <div class="preview-name">${this.escapeHtml(file.name)}${extraCount > 0 ? ` +${extraCount} more` : ''}</div>
                    <div class="preview-size">${this.formatFileSize(file.size)}</div>
                </div>
            </div>
            <i class="fas fa-times remove-attachment" onclick="ContextChat.clearAttachments()"></i>
        `;
    },
    
    hideAttachmentPreview() {
        const preview = document.getElementById('attachmentPreview');
        if (preview) preview.style.display = 'none';
    },
    
    clearAttachments() {
        this.selectedFiles = [];
        this.hideAttachmentPreview();
        this.checkSendButton();
    },
    
    // ============================================
    // EMOJI PICKER
    // ============================================
    
    setupEmojiPicker() {
        const picker = new EmojiMart.Picker({
            onEmojiSelect: (emoji) => {
                const input = document.getElementById('messageInput');
                if (input) {
                    input.value += emoji.native;
                    input.dispatchEvent(new Event('input'));
                    this.toggleEmojiPicker();
                }
            },
            theme: 'light',
            set: 'apple',
            showPreview: false
        });
        
        const emojiPicker = document.getElementById('emojiPicker');
        if (emojiPicker) {
            emojiPicker.appendChild(picker);
        }
    },
    
    toggleEmojiPicker() {
        const picker = document.getElementById('emojiPicker');
        if (picker) {
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        }
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    
    setupEventListeners() {
        // Message input
        const input = document.getElementById('messageInput');
        if (input) {
            input.addEventListener('input', (e) => {
                this.autoResize(e.target);
                this.checkSendButton();
                this.sendTypingIndicator(e.target.value.trim().length > 0);
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        
        // Send button
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        
        // Attach file
        const attachBtn = document.getElementById('attachFileBtn');
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx';
                input.onchange = (e) => this.handleFileSelect(e.target.files);
                input.click();
            });
        }
        
        // Emoji button
        const emojiBtn = document.getElementById('emojiBtn');
        if (emojiBtn) {
            emojiBtn.addEventListener('click', () => this.toggleEmojiPicker());
        }
        
        // Menu button
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => this.showMenu());
        }
        
        // Modal confirm buttons
        const confirmAcceptBtn = document.getElementById('confirmAcceptBtn');
        if (confirmAcceptBtn) {
            confirmAcceptBtn.addEventListener('click', () => this.acceptQuote());
        }
        
        const sendCounterBtn = document.getElementById('sendCounterBtn');
        if (sendCounterBtn) {
            sendCounterBtn.addEventListener('click', () => this.sendCounterOffer());
        }
        
        const confirmDeliveryBtn = document.getElementById('confirmDeliveryBtn');
        if (confirmDeliveryBtn) {
            confirmDeliveryBtn.addEventListener('click', () => this.confirmDelivery());
        }
        
        const saveTrackingBtn = document.getElementById('saveTrackingBtn');
        if (saveTrackingBtn) {
            saveTrackingBtn.addEventListener('click', () => this.updateTracking());
        }
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });
        
        // Infinite scroll
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.addEventListener('scroll', () => {
                if (container.scrollTop < 100 && this.hasMoreMessages && !this.isLoadingMessages) {
                    this.messagePage++;
                    this.loadMessages(false);
                }
            });
        }
    },
    
    sendTypingIndicator(isTyping) {
        clearTimeout(this.typingTimeout);
        
        if (!this.conversation) return;
        
        const channel = sb.channel(`typing-${this.conversation.id}`);
        channel.send({
            type: 'broadcast',
            event: isTyping ? 'typing' : 'stop_typing',
            payload: { user_id: this.currentUser.id }
        });
        
        if (isTyping) {
            this.typingTimeout = setTimeout(() => {
                this.sendTypingIndicator(false);
            }, 3000);
        }
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    
    showMenu() {
        const modal = document.getElementById('menuModal');
        const options = document.getElementById('menuOptions');
        
        if (!modal || !options || !this.currentContext) return;
        
        const type = this.currentContext.type;
        const isSupplier = this.currentUserProfile?.is_supplier;
        
        let menuItems = [
            { icon: 'fa-eye', text: 'View Details', action: 'viewContextDetails' }
        ];
        
        if (type === 'inquiry' && !isSupplier) {
            menuItems.push({ icon: 'fa-edit', text: 'Edit Inquiry', action: 'editContext' });
        }
        
        if (type === 'quote' && !isSupplier) {
            menuItems.push(
                { icon: 'fa-check', text: 'Accept Quote', action: 'showAcceptQuote' },
                { icon: 'fa-handshake', text: 'Counter Offer', action: 'showCounterOffer' }
            );
        }
        
        if (type === 'order' && isSupplier) {
            menuItems.push({ icon: 'fa-truck', text: 'Update Tracking', action: 'showTrackingModal' });
        }
        
        if (type === 'order' && !isSupplier) {
            menuItems.push({ icon: 'fa-check-circle', text: 'Confirm Delivery', action: 'showConfirmDelivery' });
        }
        
        if (type === 'product') {
            menuItems.push({ icon: 'fa-tag', text: 'Make Offer', action: 'makeOffer' });
        }
        
        menuItems.push(
            { icon: 'fa-flag', text: 'Report Issue', action: 'reportIssue' }
        );
        
        options.innerHTML = menuItems.map(item => `
            <button class="quick-action-btn ${item.class || ''}" 
                    style="width:100%; margin-bottom:8px;"
                    onclick="ContextChat.${item.action}(); ContextChat.closeMenuModal()">
                <i class="fas ${item.icon}"></i>
                ${item.text}
            </button>
        `).join('');
        
        modal.classList.add('show');
    },
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    },
    
    closeMenuModal() {
        document.getElementById('menuModal')?.classList.remove('show');
    },
    
    closeCounterOfferModal() {
        document.getElementById('counterOfferModal')?.classList.remove('show');
    },
    
    closeAcceptQuoteModal() {
        document.getElementById('acceptQuoteModal')?.classList.remove('show');
    },
    
    closeConfirmDeliveryModal() {
        document.getElementById('confirmDeliveryModal')?.classList.remove('show');
    },
    
    closeTrackingModal() {
        document.getElementById('trackingModal')?.classList.remove('show');
    },
    
    closeSuccessModal() {
        document.getElementById('successModal')?.classList.remove('show');
    },
    
    viewImage(url) {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.background = 'rgba(0,0,0,0.95)';
        modal.innerHTML = `
            <div class="modal-content" style="background: transparent; max-width: 90%;">
                <div style="text-align: right; margin-bottom: 10px;">
                    <button class="modal-close" style="color: white; font-size: 30px;" 
                            onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <img src="${url}" style="max-width: 100%; max-height: 80vh; display: block; margin: 0 auto;">
            </div>
        `;
        document.body.appendChild(modal);
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    ContextChat.init();
});

// Make globally available
window.ContextChat = ContextChat;