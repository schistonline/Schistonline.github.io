// ============================================
// PRODUCT INQUIRY PAGE - SAVES TO NEW TABLES
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const chatSb = supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const InquiryPage = {
    currentUser: null,
    productData: null,
    supplierData: null,
    supplierId: null,
    currentStep: 1,
    productId: null,
    quantity: 1,
    variant: null,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📝 Initializing inquiry page...');
        
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.productId = urlParams.get('product_id');
        this.quantity = parseInt(urlParams.get('quantity')) || 1;
        this.variant = urlParams.get('variant');
        
        if (!this.productId) {
            this.showToast('Product not found', 'error');
            setTimeout(() => window.history.back(), 2000);
            return;
        }
        
        await this.checkAuth();
        await this.loadProductData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Hide loading, show step 1
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('step1').style.display = 'block';
    },
    
    // ============================================
    // CHECK AUTHENTICATION
    // ============================================
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
            
            if (this.currentUser) {
                // Pre-fill user info if logged in
                await this.loadUserProfile();
            }
        } catch (error) {
            console.log('User not logged in');
        }
    },
    
    async loadUserProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('id, full_name, email, phone, location, district')
                .eq('id', this.currentUser.id)
                .single();
            
            if (data && !error) {
                document.getElementById('buyerName').value = data.full_name || '';
                document.getElementById('buyerEmail').value = data.email || '';
                document.getElementById('buyerPhone').value = data.phone || '';
                document.getElementById('buyerLocation').value = data.location || data.district || '';
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },
    
    // ============================================
    // LOAD PRODUCT DATA
    // ============================================
    async loadProductData() {
        try {
            const { data, error } = await sb
                .from('ads')
                .select(`
                    *,
                    seller:profiles!ads_seller_id_fkey (
                        id,
                        full_name,
                        business_name,
                        email,
                        phone,
                        avatar_url
                    ),
                    suppliers!inner (
                        id,
                        business_name
                    )
                `)
                .eq('id', this.productId)
                .single();
            
            if (error) throw error;
            
            this.productData = data;
            this.supplierData = data.seller;
            this.supplierId = data.suppliers?.id;
            
            this.renderProductSummary();
            
        } catch (error) {
            console.error('Error loading product:', error);
            this.showToast('Error loading product', 'error');
        }
    },
    
    // ============================================
    // RENDER PRODUCT SUMMARY
    // ============================================
    renderProductSummary() {
        const container = document.getElementById('productSummaryCard');
        if (!container) return;
        
        const price = this.productData.wholesale_price || this.productData.price || 0;
        const imageUrl = this.productData.image_urls?.[0] || 'https://via.placeholder.com/100x100?text=No+Image';
        const sellerName = this.supplierData?.business_name || this.supplierData?.full_name || 'Supplier';
        
        container.innerHTML = `
            <div class="product-summary">
                <img src="${imageUrl}" alt="${this.escapeHtml(this.productData.title)}">
                <div class="product-info">
                    <h4>${this.escapeHtml(this.productData.title)}</h4>
                    <div class="product-price">UGX ${this.formatNumber(price)} per unit</div>
                    <div class="product-meta">
                        <span><i class="fas fa-box"></i> Qty: ${this.quantity}</span>
                        ${this.variant && this.variant !== 'Default' ? `<span><i class="fas fa-palette"></i> ${this.escapeHtml(this.variant)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Update info rows
        document.getElementById('productTitle').textContent = this.productData.title;
        document.getElementById('productPrice').textContent = `UGX ${this.formatNumber(price)} per unit`;
        document.getElementById('displayQuantity').textContent = `${this.quantity} unit(s)`;
        document.getElementById('supplierName').textContent = sellerName;
        
        if (this.variant && this.variant !== 'Default') {
            document.getElementById('variantRow').style.display = 'flex';
            document.getElementById('productVariant').textContent = this.variant;
        }
    },
    
    // ============================================
    // STEP NAVIGATION
    // ============================================
    goToStep(step) {
        this.currentStep = step;
        
        // Update step indicators
        for (let i = 1; i <= 3; i++) {
            const indicator = document.getElementById(`step${i}Indicator`);
            const content = document.getElementById(`step${i}`);
            
            if (indicator) {
                indicator.classList.remove('active', 'completed');
                if (i === step) {
                    indicator.classList.add('active');
                } else if (i < step) {
                    indicator.classList.add('completed');
                }
            }
            
            if (content) {
                content.style.display = i === step ? 'block' : 'none';
            }
        }
        
        // Update step indicator text
        const stepNames = ['Product', 'Your Info', 'Message'];
        document.getElementById('stepIndicator').textContent = `Step ${step} of 3: ${stepNames[step - 1]}`;
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    
    // ============================================
    // VALIDATION
    // ============================================
    validateStep1() {
        return true;
    },
    
    validateStep2() {
        const name = document.getElementById('buyerName').value.trim();
        const email = document.getElementById('buyerEmail').value.trim();
        
        if (!name) {
            this.showToast('Please enter your name', 'error');
            document.getElementById('buyerName').focus();
            return false;
        }
        
        if (!email) {
            this.showToast('Please enter your email address', 'error');
            document.getElementById('buyerEmail').focus();
            return false;
        }
        
        if (!this.isValidEmail(email)) {
            this.showToast('Please enter a valid email address', 'error');
            document.getElementById('buyerEmail').focus();
            return false;
        }
        
        return true;
    },
    
    validateStep3() {
        const message = document.getElementById('inquiryMessage').value.trim();
        
        if (!message) {
            this.showToast('Please enter your message', 'error');
            document.getElementById('inquiryMessage').focus();
            return false;
        }
        
        if (message.length < 10) {
            this.showToast('Message must be at least 10 characters', 'error');
            return false;
        }
        
        return true;
    },
    
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    
    // ============================================
    // PRESET MESSAGES
    // ============================================
    setupPresetMessages() {
        const presetBtns = document.querySelectorAll('.preset-btn');
        const messageTextarea = document.getElementById('inquiryMessage');
        
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const presetMessage = btn.dataset.message;
                const currentMessage = messageTextarea.value;
                
                if (currentMessage) {
                    messageTextarea.value = currentMessage + '\n\n' + presetMessage;
                } else {
                    messageTextarea.value = presetMessage;
                }
                
                messageTextarea.focus();
                this.updateCharCount();
            });
        });
    },
    
    updateCharCount() {
        const message = document.getElementById('inquiryMessage').value;
        const count = message.length;
        document.getElementById('messageCount').textContent = count;
        
        if (count > 900) {
            document.getElementById('messageCount').style.color = '#F59E0B';
        } else {
            document.getElementById('messageCount').style.color = '#6B7280';
        }
    },
    
    // ============================================
    // SEND INQUIRY - SAVES TO NEW TABLES
    // ============================================
    async sendInquiry() {
        if (!this.validateStep3()) return;
        
        const name = document.getElementById('buyerName').value.trim();
        const email = document.getElementById('buyerEmail').value.trim();
        const phone = document.getElementById('buyerPhone').value.trim();
        const location = document.getElementById('buyerLocation').value.trim();
        const company = document.getElementById('companyName').value.trim();
        const message = document.getElementById('inquiryMessage').value.trim();
        const sendCopy = document.getElementById('sendCopyToEmail').checked;
        
        this.showToast('Sending inquiry...', 'info');
        
        try {
            // Get or create buyer profile
            let buyerId = this.currentUser?.id;
            
            if (!buyerId && email) {
                // Check if profile exists with this email
                const { data: existingProfile } = await sb
                    .from('profiles')
                    .select('id')
                    .eq('email', email)
                    .maybeSingle();
                
                if (existingProfile) {
                    buyerId = existingProfile.id;
                }
            }
            
            // 1. Create inquiry request
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
            
            const { data: inquiryRequest, error: inquiryError } = await sb
                .from('inquiry_requests')
                .insert({
                    buyer_id: buyerId || null,
                    title: `Inquiry: ${this.productData.title.substring(0, 80)}`,
                    description: message,
                    status: 'pending',
                    expires_at: expiresAt.toISOString(),
                    shipping_address: location || null,
                    shipping_district: location ? location.split(',')[0] : null,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (inquiryError) throw inquiryError;
            
            console.log('✅ Inquiry request created:', inquiryRequest.id);
            
            // 2. Create inquiry item
            const price = this.productData.wholesale_price || this.productData.price || 0;
            
            const { data: inquiryItem, error: itemError } = await sb
                .from('inquiry_items')
                .insert({
                    inquiry_id: inquiryRequest.id,
                    product_id: parseInt(this.productId),
                    product_name: this.productData.title,
                    quantity: this.quantity,
                    preferred_unit_price: price,
                    notes: this.variant && this.variant !== 'Default' ? `Variant: ${this.variant}` : null
                })
                .select()
                .single();
            
            if (itemError) throw itemError;
            
            console.log('✅ Inquiry item created:', inquiryItem.id);
            
            // 3. Create supplier match (if supplier exists)
            if (this.supplierId) {
                const { error: matchError } = await sb
                    .from('inquiry_supplier_matches')
                    .insert({
                        inquiry_id: inquiryRequest.id,
                        supplier_id: this.supplierId,
                        has_quoted: false,
                        created_at: new Date().toISOString()
                    });
                
                if (matchError) {
                    console.error('Error creating supplier match:', matchError);
                } else {
                    console.log('✅ Supplier match created');
                }
            }
            
            // 4. Also save to simple inquiries table for backward compatibility
            await sb
                .from('inquiries')
                .insert({
                    product_id: parseInt(this.productId),
                    buyer_name: name,
                    buyer_email: email,
                    buyer_phone: phone || null,
                    buyer_message: message,
                    quantity: this.quantity,
                    variant: this.variant || null,
                    status: 'new',
                    action: 'inquiry',
                    created_at: new Date().toISOString()
                });
            
            // 5. Send copy to email if requested
            if (sendCopy) {
                await this.sendEmailCopy(name, email, message);
            }
            
            // 6. If user is logged in, create chat conversation
            if (this.currentUser && this.supplierId) {
                await this.createChatConversation(inquiryRequest.id, name, email, phone, company, message);
            } else {
                // Store inquiry in session storage for after login
                sessionStorage.setItem('pendingInquiry', JSON.stringify({
                    inquiryId: inquiryRequest.id,
                    productId: this.productId,
                    productTitle: this.productData.title,
                    quantity: this.quantity,
                    variant: this.variant,
                    name: name,
                    email: email,
                    phone: phone,
                    company: company,
                    message: message,
                    supplierId: this.supplierId
                }));
            }
            
            // 7. Track the inquiry
            await this.trackInquiry(inquiryRequest.id);
            
            this.showSuccessModal();
            
        } catch (error) {
            console.error('Error sending inquiry:', error);
            this.showErrorModal(error.message);
        }
    },
    
    async createChatConversation(inquiryId, name, email, phone, company, message) {
        try {
            // Check if conversation exists
            const { data: existing } = await chatSb
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', this.supplierId)
                .maybeSingle();
            
            let conversationId;
            
            if (existing) {
                conversationId = existing.conversation_id;
            } else {
                // Create new conversation
                const { data: conversation, error: convError } = await chatSb
                    .from('conversations')
                    .insert({
                        title: `Inquiry #${inquiryId}: ${this.productData.title.substring(0, 40)}`,
                        created_by: this.currentUser.id,
                        marketplace_user_id: this.currentUser.id,
                        listing_id: this.productId,
                        inquiry_id: inquiryId
                    })
                    .select()
                    .single();
                
                if (convError) throw convError;
                conversationId = conversation.id;
                
                // Add participants
                await chatSb.from('conversation_participants').insert([
                    { conversation_id: conversationId, user_id: this.currentUser.id, user_type: 'buyer' },
                    { conversation_id: conversationId, user_id: this.supplierId, user_type: 'supplier' }
                ]);
            }
            
            // Format full message with inquiry details
            const price = this.productData.wholesale_price || this.productData.price || 0;
            const fullMessage = `
**New Inquiry #${inquiryId}**

**Product:** ${this.productData.title}
**Quantity:** ${this.quantity} unit(s)
${this.variant && this.variant !== 'Default' ? `**Variant:** ${this.variant}` : ''}
**Price:** UGX ${this.formatNumber(price)} per unit

**Buyer Information:**
• Name: ${name}
• Email: ${email}
${phone ? `• Phone: ${phone}` : ''}
${company ? `• Company: ${company}` : ''}

**Message:**
${message}

---
*This inquiry was sent via the product inquiry form.*
            `.trim();
            
            // Send message
            await chatSb.from('messages').insert({
                conversation_id: conversationId,
                sender_id: this.currentUser.id,
                sender_type: 'buyer',
                content: fullMessage,
                message_type: 'text',
                product_data: {
                    product_id: this.productId,
                    product_title: this.productData.title,
                    product_price: price,
                    quantity: this.quantity,
                    variant: this.variant,
                    inquiry_id: inquiryId
                }
            });
            
            // Update conversation
            await chatSb
                .from('conversations')
                .update({
                    last_message: message.substring(0, 100),
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);
            
            // Store conversation ID for redirect
            this.newConversationId = conversationId;
            
        } catch (error) {
            console.error('Error creating chat:', error);
        }
    },
    
    async sendEmailCopy(name, email, message) {
        // This would call a Supabase Edge Function
        console.log('Would send email copy to:', email);
        console.log('Email content:', { name, message });
    },
    
    async trackInquiry(inquiryId) {
        try {
            await sb.from('ad_engagement').insert({
                ad_id: this.productId,
                user_id: this.currentUser?.id || null,
                action: 'inquiry',
                metadata: {
                    quantity: this.quantity,
                    variant: this.variant,
                    source: 'inquiry_page',
                    inquiry_id: inquiryId
                },
                performed_at: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error tracking inquiry:', error);
        }
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    showSuccessModal() {
        const modal = document.getElementById('successModal');
        const messageEl = document.getElementById('successMessage');
        
        messageEl.innerHTML = this.currentUser ? 
            'Your inquiry has been sent successfully! The supplier will respond shortly.' :
            'Your inquiry has been saved. <a href="login.html" style="color: var(--primary);">Login</a> to track your inquiries and chat with suppliers.';
        
        modal.classList.add('show');
    },
    
    showErrorModal(message) {
        const modal = document.getElementById('errorModal');
        const messageEl = document.getElementById('errorMessage');
        
        messageEl.textContent = message;
        modal.classList.add('show');
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    closeErrorModal() {
        document.getElementById('errorModal').classList.remove('show');
    },
    
    // ============================================
    // REDIRECT FUNCTIONS
    // ============================================
    redirectToChat() {
        if (this.newConversationId) {
            window.location.href = `chat-room.html?conversation=${this.newConversationId}`;
        } else if (this.currentUser) {
            window.location.href = 'chat-inbox.html';
        } else {
            window.location.href = 'login.html';
        }
    },
    
    closeSuccessModalAndRedirect() {
        this.closeSuccessModal();
        window.location.href = 'index.html';
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#0B4F6C',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type];
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    formatNumber(num) {
        if (!num && num !== 0) return '0';
        return parseInt(num).toLocaleString('en-UG');
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Step navigation
        document.getElementById('continueToStep2')?.addEventListener('click', () => {
            if (this.validateStep1()) this.goToStep(2);
        });
        
        document.getElementById('continueToStep3')?.addEventListener('click', () => {
            if (this.validateStep2()) this.goToStep(3);
        });
        
        document.getElementById('backToStep1')?.addEventListener('click', () => this.goToStep(1));
        document.getElementById('backToStep2')?.addEventListener('click', () => this.goToStep(2));
        
        // Submit
        document.getElementById('submitInquiryBtn')?.addEventListener('click', () => this.sendInquiry());
        
        // Preset messages
        this.setupPresetMessages();
        
        // Character counter
        const messageInput = document.getElementById('inquiryMessage');
        if (messageInput) {
            messageInput.addEventListener('input', () => this.updateCharCount());
        }
        
        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', () => {
                this.closeSuccessModal();
                this.closeErrorModal();
            });
        });
    }
};

// ============================================
// GLOBAL FUNCTIONS
// ============================================
window.closeSuccessModal = () => InquiryPage.closeSuccessModal();
window.closeErrorModal = () => InquiryPage.closeErrorModal();
window.redirectToChat = () => InquiryPage.redirectToChat();
window.closeSuccessModalAndRedirect = () => InquiryPage.closeSuccessModalAndRedirect();

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    InquiryPage.init();
});
