// ============================================
// PRODUCT INQUIRY PAGE - SAVES TO NEW TABLES (FIXED)
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
        
        console.log('Product ID:', this.productId);
        console.log('Quantity:', this.quantity);
        console.log('Variant:', this.variant);
        
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
                console.log('User logged in:', this.currentUser.id);
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
                if (document.getElementById('buyerLocation')) {
                    document.getElementById('buyerLocation').value = data.location || data.district || '';
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },
    
    // ============================================
    // LOAD PRODUCT DATA - FIXED
    // ============================================
    async loadProductData() {
        try {
            // First, load the product with seller profile
            const { data: ad, error: adError } = await sb
                .from('ads')
                .select(`
                    *,
                    seller:profiles!ads_seller_id_fkey (
                        id,
                        full_name,
                        business_name,
                        email,
                        phone,
                        avatar_url,
                        location,
                        district,
                        is_verified
                    )
                `)
                .eq('id', this.productId)
                .single();
            
            if (adError) throw adError;
            if (!ad) throw new Error('Product not found');
            
            this.productData = ad;
            this.supplierData = ad.seller;
            
            console.log('Product loaded:', this.productData.title);
            console.log('Seller:', this.supplierData?.business_name || this.supplierData?.full_name);
            
            // Now try to get supplier ID from suppliers table (optional, may not exist)
            if (this.supplierData?.id) {
                const { data: supplier, error: supplierError } = await sb
                    .from('suppliers')
                    .select('id')
                    .eq('profile_id', this.supplierData.id)
                    .maybeSingle();
                
                if (!supplierError && supplier) {
                    this.supplierId = supplier.id;
                    console.log('Supplier ID found:', this.supplierId);
                } else {
                    console.log('No supplier record found, using profile ID');
                }
            }
            
            this.renderProductSummary();
            
        } catch (error) {
            console.error('Error loading product:', error);
            this.showToast(error.message || 'Error loading product', 'error');
            
            // Show error in loading state
            const loadingState = document.getElementById('loadingState');
            if (loadingState) {
                loadingState.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #EF4444; margin-bottom: 16px;"></i>
                        <h3>Error Loading Product</h3>
                        <p style="color: #6B7280;">${error.message}</p>
                        <button onclick="window.history.back()" style="margin-top: 20px; padding: 10px 20px; background: #0B4F6C; color: white; border: none; border-radius: 8px;">Go Back</button>
                    </div>
                `;
            }
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
                <img src="${imageUrl}" alt="${this.escapeHtml(this.productData.title)}" onerror="this.src='https://via.placeholder.com/100x100?text=No+Image'">
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
        const productTitleEl = document.getElementById('productTitle');
        const productPriceEl = document.getElementById('productPrice');
        const displayQuantityEl = document.getElementById('displayQuantity');
        const supplierNameEl = document.getElementById('supplierName');
        
        if (productTitleEl) productTitleEl.textContent = this.productData.title;
        if (productPriceEl) productPriceEl.textContent = `UGX ${this.formatNumber(price)} per unit`;
        if (displayQuantityEl) displayQuantityEl.textContent = `${this.quantity} unit(s)`;
        if (supplierNameEl) supplierNameEl.textContent = sellerName;
        
        const variantRow = document.getElementById('variantRow');
        const productVariantEl = document.getElementById('productVariant');
        
        if (variantRow && productVariantEl) {
            if (this.variant && this.variant !== 'Default') {
                variantRow.style.display = 'flex';
                productVariantEl.textContent = this.variant;
            } else {
                variantRow.style.display = 'none';
            }
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
        const stepIndicator = document.getElementById('stepIndicator');
        if (stepIndicator) {
            stepIndicator.textContent = `Step ${step} of 3: ${stepNames[step - 1]}`;
        }
        
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
        
        if (!presetBtns.length || !messageTextarea) return;
        
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const presetMessage = btn.getAttribute('data-message');
                if (presetMessage) {
                    const currentMessage = messageTextarea.value;
                    
                    if (currentMessage) {
                        messageTextarea.value = currentMessage + '\n\n' + presetMessage;
                    } else {
                        messageTextarea.value = presetMessage;
                    }
                    
                    messageTextarea.focus();
                    this.updateCharCount();
                }
            });
        });
    },
    
    updateCharCount() {
        const message = document.getElementById('inquiryMessage');
        const countEl = document.getElementById('messageCount');
        
        if (message && countEl) {
            const count = message.value.length;
            countEl.textContent = count;
            
            if (count > 900) {
                countEl.style.color = '#F59E0B';
            } else {
                countEl.style.color = '#6B7280';
            }
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
        const location = document.getElementById('buyerLocation')?.value.trim() || '';
        const company = document.getElementById('companyName')?.value.trim() || '';
        const message = document.getElementById('inquiryMessage').value.trim();
        const sendCopy = document.getElementById('sendCopyToEmail')?.checked || false;
        
        this.showLoading(true, 'Sending inquiry...');
        
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
            
            const inquiryNumber = 'INQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
            
            const { data: inquiryRequest, error: inquiryError } = await sb
                .from('inquiry_requests')
                .insert({
                    inquiry_number: inquiryNumber,
                    buyer_id: buyerId || null,
                    title: `Inquiry: ${this.productData.title.substring(0, 80)}`,
                    description: message.substring(0, 500),
                    status: 'pending',
                    expires_at: expiresAt.toISOString(),
                    shipping_address: location || null,
                    shipping_district: location ? location.split(',')[0].trim() : null,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (inquiryError) {
                console.error('Inquiry error:', inquiryError);
                throw new Error('Failed to create inquiry: ' + inquiryError.message);
            }
            
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
            
            if (itemError) {
                console.error('Item error:', itemError);
                // Don't throw, continue
            } else {
                console.log('✅ Inquiry item created:', inquiryItem?.id);
            }
            
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
                    console.error('Match error:', matchError);
                } else {
                    console.log('✅ Supplier match created');
                }
            }
            
            // 4. Also save to simple inquiries table for backward compatibility
            try {
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
                console.log('✅ Saved to legacy inquiries table');
            } catch (legacyError) {
                console.error('Legacy save error:', legacyError);
            }
            
            // 5. Send copy to email if requested
            if (sendCopy) {
                await this.sendEmailCopy(name, email, message, inquiryRequest.id);
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
            
            this.showLoading(false);
            this.showSuccessModal();
            
        } catch (error) {
            console.error('Error sending inquiry:', error);
            this.showLoading(false);
            this.showErrorModal(error.message);
        }
    },
    
    showLoading(show, message) {
        let overlay = document.getElementById('loadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-spinner"></div>
                <p id="loadingMessage">Loading...</p>
            `;
            document.body.appendChild(overlay);
        }
        
        const msgEl = document.getElementById('loadingMessage');
        if (msgEl && message) msgEl.textContent = message;
        
        if (show) {
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    },
    
    async createChatConversation(inquiryId, name, email, phone, company, message) {
        try {
            if (!this.supplierId) {
                console.log('No supplier ID, skipping chat creation');
                return;
            }
            
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
    
    async sendEmailCopy(name, email, message, inquiryId) {
        // This would call a Supabase Edge Function
        console.log('Would send email copy to:', email);
        console.log('Inquiry ID:', inquiryId);
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
        
        if (messageEl) {
            messageEl.innerHTML = this.currentUser ? 
                'Your inquiry has been sent successfully! The supplier will respond shortly.' :
                'Your inquiry has been saved. <a href="login.html" style="color: var(--primary);">Login</a> to track your inquiries and chat with suppliers.';
        }
        
        if (modal) modal.classList.add('show');
    },
    
    showErrorModal(message) {
        const modal = document.getElementById('errorModal');
        const messageEl = document.getElementById('errorMessage');
        
        if (messageEl) messageEl.textContent = message;
        if (modal) modal.classList.add('show');
    },
    
    closeSuccessModal() {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.remove('show');
    },
    
    closeErrorModal() {
        const modal = document.getElementById('errorModal');
        if (modal) modal.classList.remove('show');
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
        const continueToStep2 = document.getElementById('continueToStep2');
        const continueToStep3 = document.getElementById('continueToStep3');
        const backToStep1 = document.getElementById('backToStep1');
        const backToStep2 = document.getElementById('backToStep2');
        const submitBtn = document.getElementById('submitInquiryBtn');
        
        if (continueToStep2) {
            continueToStep2.addEventListener('click', () => {
                if (this.validateStep1()) this.goToStep(2);
            });
        }
        
        if (continueToStep3) {
            continueToStep3.addEventListener('click', () => {
                if (this.validateStep2()) this.goToStep(3);
            });
        }
        
        if (backToStep1) backToStep1.addEventListener('click', () => this.goToStep(1));
        if (backToStep2) backToStep2.addEventListener('click', () => this.goToStep(2));
        
        // Submit
        if (submitBtn) submitBtn.addEventListener('click', () => this.sendInquiry());
        
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
        
        // Handle Enter key in modal (optional)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSuccessModal();
                this.closeErrorModal();
            }
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
