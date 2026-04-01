// ============================================
// SUPPLIER CONTACT PAGE
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const ContactPage = {
    currentUser: null,
    inquiryData: null,
    productData: null,
    supplierData: null,
    supplierId: null,
    supplierWhatsApp: [],
    
    // Additional fields for direct query param flow
    productId: null,
    productTitle: null,
    quantity: null,
    variant: null,
    
    async init() {
        console.log('📞 Loading contact page...');

        // First, check if there is a pending inquiry in sessionStorage (old flow)
        const inquiryJson = sessionStorage.getItem('pendingInquiry');
        if (inquiryJson) {
            try {
                this.inquiryData = JSON.parse(inquiryJson);
                console.log('✅ Inquiry data loaded from sessionStorage:', this.inquiryData);
                await this.loadProductDataFromInquiry();
                await this.loadSupplierInfo();
                await this.renderPage();
                document.getElementById('loadingState').style.display = 'none';
                document.getElementById('contactContent').style.display = 'block';
                return;
            } catch (error) {
                console.error('Error parsing inquiry data:', error);
            }
        }

        // If no pendingInquiry, check URL parameters (new flow)
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('product_id');
        if (productId) {
            console.log('🔄 Using query parameters (direct from product page)');
            this.productId = productId;
            this.productTitle = urlParams.get('product_title');
            this.quantity = parseInt(urlParams.get('quantity')) || 1;
            this.variant = urlParams.get('variant');
            this.supplierId = urlParams.get('supplier_id');

            await this.loadProductDataFromId();
            await this.showInlineForm();
            document.getElementById('loadingState').style.display = 'none';
            return;
        }

        // No data at all – show error
        this.showError('No inquiry data found. Please start from product page.');
    },
    
    async loadProductDataFromId() {
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
                        avatar_url,
                        location,
                        district,
                        is_verified
                    )
                `)
                .eq('id', this.productId)
                .single();
            if (error) throw error;
            this.productData = data;
            this.supplierProfile = data.seller;
            await this.getSupplierId(data.seller_id);
        } catch (error) {
            console.error('Error loading product:', error);
            this.showError('Could not load product details.');
        }
    },
    
    async loadProductDataFromInquiry() {
        // Load product based on inquiryData.productId
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
                        avatar_url,
                        location,
                        district,
                        is_verified
                    )
                `)
                .eq('id', this.inquiryData.productId)
                .single();
            if (error) throw error;
            this.productData = data;
            this.supplierProfile = data.seller;
            await this.getSupplierId(data.seller_id);
        } catch (error) {
            console.error('Error loading product:', error);
            this.showError('Could not load product details.');
        }
    },
    
    async getSupplierId(profileId) {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('id, business_name, verification_status, total_orders, completion_rate')
                .eq('profile_id', profileId)
                .maybeSingle();
                
            if (!error && data) {
                this.supplierId = data.id;
                this.supplierData = data;
            }
        } catch (error) {
            console.error('Error getting supplier ID:', error);
        }
    },
    
    async loadSupplierInfo() {
        try {
            if (!this.supplierId) return;
            
            // Load WhatsApp numbers
            const { data: whatsapp, error: whatsappError } = await sb
                .from('supplier_whatsapp')
                .select('*')
                .eq('supplier_id', this.supplierId)
                .eq('is_active', true)
                .order('is_primary', { ascending: false });
                
            if (!whatsappError) {
                this.supplierWhatsApp = whatsapp || [];
            }
            
        } catch (error) {
            console.error('Error loading supplier info:', error);
        }
    },
    
    async showInlineForm() {
        // Display the inline form section
        const formSection = document.getElementById('inquiryFormSection');
        const productSummaryDiv = document.getElementById('inlineProductSummary');
        if (!formSection || !productSummaryDiv) return;
    
        // Show the product summary
        const imageUrl = this.productData.image_urls?.[0] || 'https://via.placeholder.com/50';
        const price = this.productData.wholesale_price || this.productData.price || 0;
        productSummaryDiv.innerHTML = `
            <img src="${imageUrl}" alt="${this.escapeHtml(this.productTitle)}">
            <div>
                <h4>${this.escapeHtml(this.productTitle)}</h4>
                <p>Quantity: ${this.quantity} unit(s)${this.variant && this.variant !== 'Default' ? ` · Color: ${this.variant}` : ''}</p>
                <p>Price: UGX ${this.formatNumber(price)} per unit</p>
            </div>
        `;
    
        formSection.style.display = 'block';
        document.getElementById('contactContent').style.display = 'block';
    
        // Handle form submission
        const form = document.getElementById('inlineInquiryForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('inlineName').value.trim();
            const email = document.getElementById('inlineEmail').value.trim();
            const phone = document.getElementById('inlinePhone').value.trim();
            const message = document.getElementById('inlineMessage').value.trim();
    
            if (!name || !email) {
                alert('Please enter your name and email.');
                return;
            }
    
            // Build inquiryData
            this.inquiryData = {
                productId: this.productId,
                productTitle: this.productTitle,
                quantity: this.quantity,
                color: this.variant && this.variant !== 'Default' ? this.variant : null,
                name: name,
                email: email,
                phone: phone,
                message: message,
                supplierId: this.supplierId
            };
    
            // Hide form and render contact options
            formSection.style.display = 'none';
            await this.renderPage();  // This will render the contact options using this.inquiryData
        });
    },
    
    renderPage() {
        this.renderSummary();
        this.renderSupplierInfo();
        this.renderContactOptions();
        this.setupEventListeners();
        
        // Show summary card after form is filled (if it was hidden)
        const summaryCard = document.getElementById('summaryCard');
        if (summaryCard) summaryCard.style.display = 'block';
    },
    
    renderSummary() {
        const product = this.productData;
        const inquiry = this.inquiryData;
        
        // Product summary
        const summaryEl = document.getElementById('productSummary');
        if (summaryEl) {
            const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/60';
            const price = product.wholesale_price || product.price || 0;
            
            summaryEl.innerHTML = `
                <img src="${imageUrl}" alt="${this.escapeHtml(product.title)}">
                <div class="product-info">
                    <div class="product-title">${this.escapeHtml(product.title)}</div>
                    <div class="product-price">UGX ${this.formatNumber(price)}</div>
                </div>
            `;
        }
        
        // Inquiry details
        const detailsEl = document.getElementById('inquiryDetails');
        if (detailsEl) {
            detailsEl.innerHTML = `
                <div class="detail-row">
                    <span class="label">Quantity:</span>
                    <span class="value quantity">${inquiry.quantity} units</span>
                </div>
                ${inquiry.color && inquiry.color !== 'Default' ? `
                    <div class="detail-row">
                        <span class="label">Color:</span>
                        <span class="value color">${inquiry.color}</span>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="label">Name:</span>
                    <span class="value">${this.escapeHtml(inquiry.name)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Email:</span>
                    <span class="value">${this.escapeHtml(inquiry.email)}</span>
                </div>
                ${inquiry.phone ? `
                    <div class="detail-row">
                        <span class="label">Phone:</span>
                        <span class="value">${this.escapeHtml(inquiry.phone)}</span>
                    </div>
                ` : ''}
                ${inquiry.message ? `
                    <div class="detail-message">
                        <strong>Message:</strong><br>
                        ${this.escapeHtml(inquiry.message)}
                    </div>
                ` : ''}
            `;
        }
        
        // Edit button
        document.getElementById('editInquiryBtn').addEventListener('click', () => {
            window.history.back();
        });
    },
    
    renderSupplierInfo() {
        const supplier = this.supplierProfile;
        const supplierData = this.supplierData;
        
        if (!supplier) return;
        
        const name = supplier.business_name || supplier.full_name || 'Business Seller';
        const location = supplier.district || supplier.location || 'Uganda';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        document.getElementById('supplierName').textContent = name;
        document.getElementById('supplierLocation').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${location}`;
        document.getElementById('supplierInitials').textContent = initials;
        
        if (supplier.is_verified || supplierData?.verification_status === 'verified') {
            document.getElementById('verifiedBadge').style.display = 'inline-block';
        }
        
        // Phone
        if (supplier.phone) {
            const phoneOption = document.getElementById('phoneOption');
            const phoneEl = document.getElementById('supplierPhone');
            const callBtn = document.getElementById('callBtn');
            
            phoneOption.style.display = 'block';
            phoneEl.textContent = supplier.phone;
            callBtn.href = `tel:${supplier.phone}`;
        }
        
        // Email
        if (supplier.email) {
            const emailOption = document.getElementById('emailOption');
            const emailEl = document.getElementById('supplierEmail');
            const emailBtn = document.getElementById('emailBtn');
            
            emailOption.style.display = 'block';
            emailEl.textContent = supplier.email;
            
            // Create mailto with inquiry details
            const subject = `Inquiry about ${this.productData.title}`;
            const body = this.generateEmailBody();
            emailBtn.href = `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }
    },
    
    renderContactOptions() {
        // WhatsApp options
        if (this.supplierWhatsApp.length > 0) {
            const whatsappOption = document.getElementById('whatsappOption');
            const numbersContainer = document.getElementById('whatsappNumbers');
            
            whatsappOption.style.display = 'block';
            
            numbersContainer.innerHTML = this.supplierWhatsApp.map(w => `
                <div class="whatsapp-number-item">
                    <input type="radio" name="whatsappNumber" value="${w.whatsapp_number}" 
                           ${w.is_primary ? 'checked' : ''} id="wa_${w.id}">
                    <div class="number-details">
                        <strong>${w.label || w.department || 'Sales'}</strong>
                        <span class="number">${w.whatsapp_number}</span>
                    </div>
                    ${w.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                </div>
            `).join('');
            
            document.getElementById('sendWhatsAppBtn').addEventListener('click', () => {
                this.sendWhatsApp();
            });
        }
        
        // Message option always available
        document.getElementById('sendMessageBtn').addEventListener('click', () => {
            this.sendInAppMessage();
        });
        
        // Save for later
        document.getElementById('saveForLaterBtn').addEventListener('click', () => {
            this.saveForLater();
        });
    },
    
    generateEmailBody() {
        const inquiry = this.inquiryData;
        const product = this.productData;
        const price = product.wholesale_price || product.price || 0;
        
        return `
Dear Supplier,

I am interested in your product:

Product: ${product.title}
${inquiry.color && inquiry.color !== 'Default' ? `Color: ${inquiry.color}` : ''}
Quantity: ${inquiry.quantity} units
Price per unit: UGX ${this.formatNumber(price)}
Total: UGX ${this.formatNumber(price * inquiry.quantity)}

My Details:
Name: ${inquiry.name}
Email: ${inquiry.email}
${inquiry.phone ? `Phone: ${inquiry.phone}` : ''}

${inquiry.message || 'Please provide more information about this product, including availability and delivery options.'}

Thank you,
${inquiry.name}
        `.trim();
    },
    
    sendWhatsApp() {
        const selectedRadio = document.querySelector('input[name="whatsappNumber"]:checked');
        if (!selectedRadio) {
            this.showToast('Please select a WhatsApp number', 'error');
            return;
        }
        
        const whatsappNumber = selectedRadio.value;
        const inquiry = this.inquiryData;
        const product = this.productData;
        const price = product.wholesale_price || product.price || 0;
        
        const message = `
*${inquiry.name}* (${inquiry.email}${inquiry.phone ? ', ' + inquiry.phone : ''}) is interested in:

*Product:* ${product.title}
${inquiry.color && inquiry.color !== 'Default' ? `*Color:* ${inquiry.color}` : ''}
*Quantity:* ${inquiry.quantity}
*Price per unit:* UGX ${this.formatNumber(price)}
*Total:* UGX ${this.formatNumber(price * inquiry.quantity)}

*Message:* ${inquiry.message || 'Please provide more information.'}
        `.trim();
        
        const encodedMessage = encodeURIComponent(message);
        const cleanNumber = whatsappNumber.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
        
        this.trackContact('whatsapp');
        window.open(whatsappUrl, '_blank');
        this.showSuccessModal('WhatsApp', 'Your inquiry has been prepared for WhatsApp.');
    },
    
    async sendInAppMessage() {
        if (!this.currentUser) {
            window.location.href = `login.html?redirect=supplier-contact.html`;
            return;
        }
        
        try {
            const inquiry = this.inquiryData;
            const product = this.productData;
            const price = product.wholesale_price || product.price || 0;
            
            // Check if conversation exists
            const { data: existingConv } = await sb
                .from('conversations')
                .select('id')
                .or(`and(participant_one_id.eq.${this.currentUser.id},participant_two_id.eq.${this.supplierProfile.id}),and(participant_one_id.eq.${this.supplierProfile.id},participant_two_id.eq.${this.currentUser.id})`)
                .eq('ad_id', product.id)
                .maybeSingle();
            
            let conversationId;
            
            if (existingConv) {
                conversationId = existingConv.id;
            } else {
                const { data: newConv } = await sb
                    .from('conversations')
                    .insert({
                        participant_one_id: this.currentUser.id,
                        participant_two_id: this.supplierProfile.id,
                        ad_id: product.id
                    })
                    .select()
                    .single();
                    
                conversationId = newConv.id;
            }
            
            // Create message
            const messageContent = `
Inquiry from ${inquiry.name} (${inquiry.email}${inquiry.phone ? ', ' + inquiry.phone : ''}):

Product: ${product.title}${inquiry.color && inquiry.color !== 'Default' ? ` (${inquiry.color})` : ''}
Quantity: ${inquiry.quantity}
Total: UGX ${this.formatNumber(price * inquiry.quantity)}

${inquiry.message || 'Please provide more information.'}
            `.trim();
            
            await sb
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    sender_id: this.currentUser.id,
                    receiver_id: this.supplierProfile.id,
                    ad_id: product.id,
                    content: messageContent,
                    message_type: 'text'
                });
            
            this.trackContact('message');
            
            // Clear session storage
            sessionStorage.removeItem('pendingInquiry');
            
            // Redirect to chat
            window.location.href = `context-chat.html?conversation=${conversationId}`;
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showToast('Failed to send message', 'error');
        }
    },
    
    async saveForLater() {
        if (!this.currentUser) {
            window.location.href = `login.html?redirect=supplier-contact.html`;
            return;
        }
        
        try {
            // Save inquiry to a "saved inquiries" table
            // You may need to create this table
            await sb
                .from('saved_inquiries')
                .insert({
                    user_id: this.currentUser.id,
                    product_id: this.productData.id,
                    inquiry_data: this.inquiryData,
                    created_at: new Date().toISOString()
                });
            
            this.showToast('Inquiry saved for later', 'success');
            
        } catch (error) {
            console.error('Error saving inquiry:', error);
            this.showToast('Failed to save inquiry', 'error');
        }
    },
    
    async trackContact(method) {
        try {
            await sb
                .from('ad_engagement')
                .insert({
                    ad_id: this.productData.id,
                    user_id: this.currentUser?.id || null,
                    action: method === 'whatsapp' ? 'whatsapp' : 'inquiry',
                    metadata: {
                        method,
                        quantity: this.inquiryData.quantity,
                        color: this.inquiryData.color
                    }
                });
        } catch (error) {
            console.error('Error tracking contact:', error);
        }
    },
    
    showSuccessModal(method, message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('show');
    },
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#0B4F6C'
        };
        
        toast.style.backgroundColor = colors[type];
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    showError(message) {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
        document.getElementById('errorMessage').textContent = message;
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
    
    setupEventListeners() {
        // Close modals
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                document.getElementById('successModal').classList.remove('show');
            }
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ContactPage.init());
} else {
    ContactPage.init();
}

// Global functions for modal
window.closeSuccessModal = function() {
    document.getElementById('successModal').classList.remove('show');
};

window.redirectToHome = function() {
    window.location.href = 'index.html';
};

window.redirectToSaved = function() {
    window.location.href = 'saved-items.html';
};