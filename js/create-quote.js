// ============================================
// CREATE QUOTE - SUPPLIER VIEW
// BuyUganda.online
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const CHAT_SUPABASE_URL = 'https://amxhpxqakqrjjihwkzcq.supabase.co';
const CHAT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteGhweHFha3FyamppaHdremNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Nzc2NjUsImV4cCI6MjA4MzU1MzY2NX0.yIAZtz3bUc_ZxF8-f4cqW1fKJgFiRsiJdj4qgCDmM0g';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const chatSb = window.supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const CreateQuote = {
    currentUser: null,
    supplier: null,
    rfq: null,
    quoteItems: [],
    quoteId: null,
    savedQuoteData: null,

    async init() {
        console.log('🚀 Create Quote initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadRFQ();
            this.setupDateDefault();
            this.addQuoteItem();
            this.setupEventListeners();
            console.log('✅ Create Quote ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading page', 'error');
        }
    },

    async checkAuth() {
        try {
            const response = await sb.auth.getUser();
            const user = response.data.user;
            
            if (!user) {
                window.location.href = 'login.html?redirect=create-quote.html';
                return;
            }
            
            this.currentUser = user;
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },

    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('id, business_name, business_phone, business_email')
                .eq('profile_id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            this.supplier = data;
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.supplier = { id: null, business_name: 'Our Company' };
        }
    },

    async loadRFQ() {
        const urlParams = new URLSearchParams(window.location.search);
        const rfqId = urlParams.get('rfq_id');
        
        if (!rfqId) {
            this.showToast('No RFQ specified', 'error');
            setTimeout(() => {
                window.location.href = 'browse-rfqs.html';
            }, 1500);
            return;
        }
        
        try {
            const { data, error } = await sb
                .from('rfq_requests')
                .select(`
                    id,
                    rfq_number,
                    title,
                    description,
                    buyer_name,
                    buyer_email,
                    buyer_phone,
                    preferred_contact,
                    shipping_address,
                    shipping_district,
                    expected_delivery_date,
                    buyer_id,
                    rfq_items (
                        id,
                        product_name,
                        quantity,
                        unit,
                        specifications
                    )
                `)
                .eq('id', rfqId)
                .single();
                
            if (error) throw error;
            
            this.rfq = data;
            this.displayBuyerInfo();
            this.prefillItemsFromRFQ();
            
        } catch (error) {
            console.error('Error loading RFQ:', error);
            this.showToast('Error loading RFQ details', 'error');
        }
    },

    displayBuyerInfo() {
        if (!this.rfq) return;
        
        const buyerNameEl = document.getElementById('buyerName');
        const prefMethodEl = document.getElementById('prefMethod');
        const buyerContactEl = document.getElementById('buyerContact');
        const prefBadgeEl = document.getElementById('prefBadge');
        
        if (buyerNameEl) buyerNameEl.textContent = this.rfq.buyer_name || 'Anonymous Buyer';
        if (prefMethodEl) prefMethodEl.textContent = this.rfq.preferred_contact || 'email';
        
        let contactHtml = '';
        if (this.rfq.buyer_email) {
            contactHtml += `<i class="fas fa-envelope"></i> ${this.rfq.buyer_email}`;
        }
        if (this.rfq.buyer_phone) {
            if (contactHtml) contactHtml += ' | ';
            contactHtml += `<i class="fab fa-whatsapp"></i> ${this.rfq.buyer_phone}`;
        }
        if (buyerContactEl) buyerContactEl.innerHTML = contactHtml || 'Contact info not provided';
        
        if (prefBadgeEl) {
            const pref = this.rfq.preferred_contact;
            if (pref === 'whatsapp') {
                prefBadgeEl.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Buyer prefers: </span><strong>WhatsApp</strong>';
            } else if (pref === 'email') {
                prefBadgeEl.innerHTML = '<i class="fas fa-envelope"></i> <span>Buyer prefers: </span><strong>Email</strong>';
            } else if (pref === 'both') {
                prefBadgeEl.innerHTML = '<i class="fab fa-whatsapp"></i> <i class="fas fa-envelope"></i> <span>Buyer prefers: </span><strong>Both</strong>';
            } else {
                prefBadgeEl.innerHTML = '<i class="fas fa-comment-dots"></i> <span>Buyer prefers: </span><strong>Platform</strong>';
            }
        }
    },

    prefillItemsFromRFQ() {
        if (!this.rfq || !this.rfq.rfq_items) return;
        
        this.quoteItems = this.rfq.rfq_items.map(function(item) {
            return {
                product_name: item.product_name,
                quantity: item.quantity,
                unit: item.unit || 'pcs',
                unit_price: 0
            };
        });
        
        this.renderQuoteItems();
    },

    setupDateDefault() {
        const validUntil = document.getElementById('validUntil');
        if (validUntil) {
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 14);
            validUntil.value = defaultDate.toISOString().split('T')[0];
        }
    },

    addQuoteItem() {
        this.quoteItems.push({
            product_name: '',
            quantity: 1,
            unit: 'pcs',
            unit_price: 0
        });
        this.renderQuoteItems();
    },

    removeQuoteItem(index) {
        if (this.quoteItems.length > 1) {
            this.quoteItems.splice(index, 1);
            this.renderQuoteItems();
        } else {
            this.showToast('You need at least one item', 'error');
        }
    },

    updateQuoteItem(index, field, value) {
        if (this.quoteItems[index]) {
            if (field === 'quantity' || field === 'unit_price') {
                this.quoteItems[index][field] = parseFloat(value) || 0;
            } else {
                this.quoteItems[index][field] = value;
            }
            this.updateSummary();
            this.renderQuoteItems();
        }
    },

    renderQuoteItems() {
        const container = document.getElementById('quoteItemsList');
        if (!container) return;
        
        let html = '';
        for (let i = 0; i < this.quoteItems.length; i++) {
            const item = this.quoteItems[i];
            html += `
                <div class="quote-item">
                    <div class="item-header">
                        <span>Item ${i + 1}</span>
                        ${this.quoteItems.length > 1 ? `
                            <button class="remove-item" onclick="CreateQuote.removeQuoteItem(${i})">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                    <div class="item-row">
                        <input type="text" placeholder="Product name" value="${this.escapeHtml(item.product_name)}" 
                               onchange="CreateQuote.updateQuoteItem(${i}, 'product_name', this.value)">
                    </div>
                    <div class="item-row">
                        <input type="number" placeholder="Quantity" value="${item.quantity}" min="1" 
                               onchange="CreateQuote.updateQuoteItem(${i}, 'quantity', this.value)">
                        <select onchange="CreateQuote.updateQuoteItem(${i}, 'unit', this.value)">
                            <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>Pieces</option>
                            <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>Kilograms</option>
                            <option value="tons" ${item.unit === 'tons' ? 'selected' : ''}>Tons</option>
                            <option value="meters" ${item.unit === 'meters' ? 'selected' : ''}>Meters</option>
                            <option value="liters" ${item.unit === 'liters' ? 'selected' : ''}>Liters</option>
                            <option value="cartons" ${item.unit === 'cartons' ? 'selected' : ''}>Cartons</option>
                        </select>
                    </div>
                    <div class="item-price-row">
                        <input type="number" placeholder="Unit Price (UGX)" value="${item.unit_price}" min="0" step="1000" 
                               onchange="CreateQuote.updateQuoteItem(${i}, 'unit_price', this.value)">
                        <span style="font-size: 13px; color: #0B4F6C; font-weight: 500;">= UGX ${this.formatNumber(item.quantity * item.unit_price)}</span>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        this.updateSummary();
    },

    updateSummary() {
        let subtotal = 0;
        for (let i = 0; i < this.quoteItems.length; i++) {
            const item = this.quoteItems[i];
            subtotal += (item.quantity || 0) * (item.unit_price || 0);
        }
        
        const subtotalEl = document.getElementById('subtotal');
        const totalEl = document.getElementById('total');
        
        if (subtotalEl) subtotalEl.innerHTML = `UGX ${this.formatNumber(subtotal)}`;
        if (totalEl) totalEl.innerHTML = `UGX ${this.formatNumber(subtotal)}`;
    },

    validateQuote() {
        if (this.quoteItems.length === 0) {
            this.showToast('Please add at least one item', 'error');
            return false;
        }
        
        for (let i = 0; i < this.quoteItems.length; i++) {
            const item = this.quoteItems[i];
            if (!item.product_name || item.product_name.trim() === '') {
                this.showToast('Please enter product names for all items', 'error');
                return false;
            }
            if (item.quantity <= 0) {
                this.showToast('Quantity must be greater than 0', 'error');
                return false;
            }
            if (item.unit_price <= 0) {
                this.showToast('Please enter valid prices for all items', 'error');
                return false;
            }
        }
        
        const validUntil = document.getElementById('validUntil');
        if (validUntil && !validUntil.value) {
            this.showToast('Please select a valid until date', 'error');
            return false;
        }
        
        return true;
    },

    generateQuoteMessage() {
        let itemsText = '';
        for (let i = 0; i < this.quoteItems.length; i++) {
            const item = this.quoteItems[i];
            itemsText += '\n• ' + item.product_name + ': ' + item.quantity + ' ' + item.unit + ' @ UGX ' + this.formatNumber(item.unit_price) + ' = UGX ' + this.formatNumber(item.quantity * item.unit_price);
        }
        
        const total = this.quoteItems.reduce(function(sum, item) {
            return sum + (item.quantity * item.unit_price);
        }, 0);
        
        const paymentTermsSelect = document.getElementById('paymentTerms');
        const deliveryTermsSelect = document.getElementById('deliveryTerms');
        const leadTimeInput = document.getElementById('leadTime');
        const validUntilInput = document.getElementById('validUntil');
        const notesTextarea = document.getElementById('quoteNotes');
        
        const paymentTerms = paymentTermsSelect ? paymentTermsSelect.value : 'advance_full';
        const deliveryTerms = deliveryTermsSelect ? deliveryTermsSelect.value : 'ex_warehouse';
        const leadTime = leadTimeInput ? leadTimeInput.value : '7';
        const validUntil = validUntilInput ? validUntilInput.value : '';
        const notes = notesTextarea ? notesTextarea.value : '';
        
        const paymentMap = {
            'advance_full': '100% Advance Payment',
            'advance_partial': '50% Advance, 50% upon delivery',
            'credit_7': '7 Days Credit',
            'credit_15': '15 Days Credit',
            'credit_30': '30 Days Credit',
            'negotiable': 'Negotiable'
        };
        
        const deliveryMap = {
            'ex_warehouse': 'Ex-Warehouse (Buyer picks up)',
            'door_delivery': 'Door Delivery (We deliver)',
            'pickup': 'Buyer Pickup',
            'fob': 'FOB (Free on Board)',
            'cif': 'CIF (Cost, Insurance & Freight)'
        };
        
        let message = '*QUOTATION FROM ' + (this.supplier?.business_name || 'BuyUganda Supplier').toUpperCase() + '*\n\n';
        message += 'Hello ' + this.rfq.buyer_name + ',\n\n';
        message += 'Thank you for your inquiry. Here is our quotation for "' + this.rfq.title + '":\n\n';
        message += '*📦 ITEMS:*' + itemsText + '\n\n';
        message += '*💰 TOTAL: UGX ' + this.formatNumber(total) + '*\n\n';
        message += '*📋 TERMS:*\n';
        message += '• Valid Until: ' + (validUntil ? new Date(validUntil).toLocaleDateString() : 'Not set') + '\n';
        message += '• Payment Terms: ' + (paymentMap[paymentTerms] || paymentTerms) + '\n';
        message += '• Delivery Terms: ' + (deliveryMap[deliveryTerms] || deliveryTerms) + '\n';
        message += '• Lead Time: ' + leadTime + ' days\n';
        
        if (notes) {
            message += '\n*📝 NOTES:*\n' + notes + '\n';
        }
        
        message += '\nWe look forward to working with you.\n\n';
        message += 'Best regards,\n' + (this.supplier?.business_name || 'BuyUganda Supplier');
        
        return message;
    },

    generateEmailHtml() {
        let itemsHtml = '';
        for (let i = 0; i < this.quoteItems.length; i++) {
            const item = this.quoteItems[i];
            itemsHtml += `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${this.escapeHtml(item.product_name)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity} ${item.unit}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">UGX ${this.formatNumber(item.unit_price)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">UGX ${this.formatNumber(item.quantity * item.unit_price)}</td>
                <tr>
            `;
        }
        
        const total = this.quoteItems.reduce(function(sum, item) {
            return sum + (item.quantity * item.unit_price);
        }, 0);
        
        const paymentTermsSelect = document.getElementById('paymentTerms');
        const deliveryTermsSelect = document.getElementById('deliveryTerms');
        const leadTimeInput = document.getElementById('leadTime');
        const validUntilInput = document.getElementById('validUntil');
        const notesTextarea = document.getElementById('quoteNotes');
        
        const paymentTerms = paymentTermsSelect ? paymentTermsSelect.value : 'advance_full';
        const deliveryTerms = deliveryTermsSelect ? deliveryTermsSelect.value : 'ex_warehouse';
        const leadTime = leadTimeInput ? leadTimeInput.value : '7';
        const validUntil = validUntilInput ? validUntilInput.value : '';
        const notes = notesTextarea ? notesTextarea.value : '';
        
        const paymentMap = {
            'advance_full': '100% Advance Payment',
            'advance_partial': '50% Advance, 50% upon delivery',
            'credit_7': '7 Days Credit',
            'credit_15': '15 Days Credit',
            'credit_30': '30 Days Credit',
            'negotiable': 'Negotiable'
        };
        
        const deliveryMap = {
            'ex_warehouse': 'Ex-Warehouse (Buyer picks up)',
            'door_delivery': 'Door Delivery (We deliver)',
            'pickup': 'Buyer Pickup',
            'fob': 'FOB (Free on Board)',
            'cif': 'CIF (Cost, Insurance & Freight)'
        };
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Quotation from ${this.supplier?.business_name || 'BuyUganda Supplier'}</title>
            </head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: white; border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="text-align: center; border-bottom: 2px solid #0B4F6C; padding-bottom: 16px; margin-bottom: 20px;">
                        <h2 style="color: #0B4F6C; margin: 0;">QUOTATION</h2>
                        <p style="color: #666; margin: 5px 0 0;">From ${this.supplier?.business_name || 'BuyUganda Supplier'}</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <p><strong>To:</strong> ${this.escapeHtml(this.rfq.buyer_name)}</p>
                        <p><strong>RFQ:</strong> ${this.escapeHtml(this.rfq.title)}</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <thead>
                            <tr style="background: #0B4F6C; color: white;">
                                <th style="padding: 10px; text-align: left;">Product</th>
                                <th style="padding: 10px; text-align: center;">Quantity</th>
                                <th style="padding: 10px; text-align: right;">Unit Price</th>
                                <th style="padding: 10px; text-align: right;">Total</th>
                             </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">TOTAL:</td>
                                <td style="padding: 10px; text-align: right; font-weight: bold; color: #0B4F6C;">UGX ${this.formatNumber(total)}</td>
                             </tr>
                        </tfoot>
                    </table>
                    
                    <div style="background: #f8f9fa; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px; color: #0B4F6C;">Terms & Conditions</h4>
                        <p><strong>Valid Until:</strong> ${validUntil ? new Date(validUntil).toLocaleDateString() : 'Not set'}</p>
                        <p><strong>Payment Terms:</strong> ${paymentMap[paymentTerms] || paymentTerms}</p>
                        <p><strong>Delivery Terms:</strong> ${deliveryMap[deliveryTerms] || deliveryTerms}</p>
                        <p><strong>Lead Time:</strong> ${leadTime} days</p>
                        ${notes ? '<p><strong>Notes:</strong> ' + this.escapeHtml(notes) + '</p>' : ''}
                    </div>
                    
                    <div style="text-align: center; padding-top: 16px; border-top: 1px solid #eee;">
                        <p style="color: #666; font-size: 12px;">Thank you for your business!</p>
                        <p style="color: #999; font-size: 11px;">This is an automated quotation from BuyUganda.online</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    },

    async saveQuote(status) {
        if (!this.validateQuote()) return false;
        
        this.showLoading(true);
        document.getElementById('loadingMessage').textContent = 'Saving quotation...';
        
        const validUntilInput = document.getElementById('validUntil');
        const paymentTermsSelect = document.getElementById('paymentTerms');
        const deliveryTermsSelect = document.getElementById('deliveryTerms');
        const leadTimeInput = document.getElementById('leadTime');
        const notesTextarea = document.getElementById('quoteNotes');
        
        const validUntil = validUntilInput ? validUntilInput.value : '';
        const paymentTerms = paymentTermsSelect ? paymentTermsSelect.value : 'advance_full';
        const deliveryTerms = deliveryTermsSelect ? deliveryTermsSelect.value : 'ex_warehouse';
        const leadTime = leadTimeInput ? leadTimeInput.value : '7';
        const notes = notesTextarea ? notesTextarea.value : '';
        
        const items = [];
        for (let i = 0; i < this.quoteItems.length; i++) {
            const item = this.quoteItems[i];
            items.push({
                product_name: item.product_name,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price
            });
        }
        
        const total = items.reduce(function(sum, item) {
            return sum + (item.unit_price * item.quantity);
        }, 0);
        
        const quoteNumber = 'QTE-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        
        const quoteData = {
            supplier_id: this.supplier.id,
            rfq_id: this.rfq.id,
            quote_number: quoteNumber,
            items: items,
            total_amount: total,
            currency: 'UGX',
            payment_terms: [paymentTerms],
            delivery_terms: [deliveryTerms],
            lead_time_days: leadTime ? parseInt(leadTime) : null,
            notes: notes || null,
            status: status,
            valid_until: validUntil ? new Date(validUntil).toISOString() : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        try {
            let result;
            
            if (this.quoteId) {
                const { data, error } = await sb
                    .from('supplier_quotes')
                    .update(quoteData)
                    .eq('id', this.quoteId)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
            } else {
                const { data, error } = await sb
                    .from('supplier_quotes')
                    .insert(quoteData)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
                this.quoteId = result.id;
            }
            
            this.savedQuoteData = result;
            
            // Update RFQ match status
            await sb
                .from('rfq_matches')
                .upsert({
                    rfq_id: this.rfq.id,
                    supplier_id: this.supplier.id,
                    status: 'quoted',
                    quote_id: result.id,
                    quoted_at: new Date().toISOString()
                }, { onConflict: 'rfq_id, supplier_id' });
            
            return result;
            
        } catch (error) {
            console.error('Error saving quote:', error);
            this.showToast(error.message || 'Error saving quote', 'error');
            return null;
        } finally {
            this.showLoading(false);
        }
    },

    async saveAsDraft() {
        const result = await this.saveQuote('draft');
        if (result) {
            this.showToast('Quote saved as draft!', 'success');
            setTimeout(() => {
                window.location.href = 'supplier-quotations.html';
            }, 1500);
        }
    },

    async saveAndSend() {
        const result = await this.saveQuote('sent');
        if (result) {
            this.showToast('Quote saved successfully!', 'success');
            
            // Show contact actions
            const contactActions = document.getElementById('contactActions');
            if (contactActions) {
                contactActions.style.display = 'block';
                document.getElementById('saveDraftBtn').style.display = 'none';
                document.getElementById('sendQuoteBtn').style.display = 'none';
            }
            
            // Scroll to contact buttons
            contactActions.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    async contactWhatsApp() {
        if (!this.savedQuoteData) {
            this.showToast('Please save the quote first', 'error');
            return;
        }
        
        const phone = this.rfq.buyer_phone;
        if (!phone) {
            this.showToast('No phone number available for this buyer', 'error');
            return;
        }
        
        const message = this.generateQuoteMessage();
        const cleanNumber = phone.replace(/\D/g, '');
        const whatsappUrl = 'https://wa.me/' + cleanNumber + '?text=' + encodeURIComponent(message);
        
        await this.trackAction('whatsapp');
        window.open(whatsappUrl, '_blank');
        this.showToast('Opening WhatsApp...', 'success');
    },

    async contactEmail() {
        if (!this.savedQuoteData) {
            this.showToast('Please save the quote first', 'error');
            return;
        }
        
        const email = this.rfq.buyer_email;
        if (!email) {
            this.showToast('No email address available for this buyer', 'error');
            return;
        }
        
        const subject = 'Quotation for ' + this.rfq.title + ' from ' + (this.supplier?.business_name || 'BuyUganda Supplier');
        const htmlBody = this.generateEmailHtml();
        
        const mailtoUrl = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(htmlBody);
        
        await this.trackAction('email');
        window.location.href = mailtoUrl;
        this.showToast('Opening email client...', 'success');
    },

    async contactMessage() {
        if (!this.savedQuoteData) {
            this.showToast('Please save the quote first', 'error');
            return;
        }
        
        this.showLoading(true);
        document.getElementById('loadingMessage').textContent = 'Creating conversation...';
        
        try {
            // Check if conversation exists
            const { data: existing, error: checkError } = await chatSb
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', this.rfq.buyer_id);
            
            let conversationId;
            
            if (existing && existing.length > 0) {
                conversationId = existing[0].conversation_id;
            } else {
                // Create new conversation
                const { data: conversation, error: convError } = await chatSb
                    .from('conversations')
                    .insert({
                        title: 'Quote: ' + this.rfq.title,
                        created_by: this.currentUser.id,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                
                if (convError) throw convError;
                conversationId = conversation.id;
                
                // Add participants
                await chatSb
                    .from('conversation_participants')
                    .insert([
                        { conversation_id: conversationId, user_id: this.currentUser.id, user_type: 'supplier', created_at: new Date().toISOString() },
                        { conversation_id: conversationId, user_id: this.rfq.buyer_id, user_type: 'buyer', created_at: new Date().toISOString() }
                    ]);
            }
            
            // Send quote message
            const messageContent = this.generateQuoteMessage();
            const { error: msgError } = await chatSb
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    sender_id: this.currentUser.id,
                    sender_type: 'supplier',
                    content: messageContent,
                    message_type: 'quote',
                    created_at: new Date().toISOString()
                });
            
            if (msgError) throw msgError;
            
            // Update conversation last message
            await chatSb
                .from('conversations')
                .update({
                    last_message: 'Quotation sent',
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);
            
            await this.trackAction('platform_message');
            this.showToast('Message sent via platform!', 'success');
            
            // Redirect to chat
            setTimeout(() => {
                window.location.href = 'chat-room.html?conversation=' + conversationId;
            }, 1500);
            
        } catch (error) {
            console.error('Error sending platform message:', error);
            this.showToast('Failed to send message', 'error');
        } finally {
            this.showLoading(false);
        }
    },

    async trackAction(method) {
        try {
            await sb
                .from('rfq_activity_log')
                .insert({
                    rfq_id: this.rfq.id,
                    user_id: this.currentUser.id,
                    user_type: 'supplier',
                    action: 'contacted_via_' + method,
                    details: { quote_id: this.quoteId }
                });
        } catch (error) {
            console.error('Error tracking action:', error);
        }
    },

    setupEventListeners() {
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        const sendQuoteBtn = document.getElementById('sendQuoteBtn');
        const addItemBtn = document.getElementById('addItemBtn');
        const whatsappBtn = document.getElementById('whatsappBtn');
        const emailBtn = document.getElementById('emailBtn');
        const messageBtn = document.getElementById('messageBtn');
        
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', () => this.saveAsDraft());
        }
        
        if (sendQuoteBtn) {
            sendQuoteBtn.addEventListener('click', () => this.saveAndSend());
        }
        
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => this.addQuoteItem());
        }
        
        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', () => this.contactWhatsApp());
        }
        
        if (emailBtn) {
            emailBtn.addEventListener('click', () => this.contactEmail());
        }
        
        if (messageBtn) {
            messageBtn.addEventListener('click', () => this.contactMessage());
        }
    },

    formatNumber(num) {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            if (show) {
                overlay.classList.add('show');
            } else {
                overlay.classList.remove('show');
            }
        }
    },

    showToast(message, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const toastType = type || 'info';
        const colors = { success: '#4caf50', error: '#ff4444', info: '#0B4F6C' };
        toast.textContent = message;
        toast.style.backgroundColor = colors[toastType] || colors.info;
        toast.classList.add('show');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    }
};

// Global functions
window.CreateQuote = CreateQuote;
window.addQuoteItem = function() { CreateQuote.addQuoteItem(); };
window.removeQuoteItem = function(i) { CreateQuote.removeQuoteItem(i); };
window.updateQuoteItem = function(i, f, v) { CreateQuote.updateQuoteItem(i, f, v); };
window.saveAsDraft = function() { CreateQuote.saveAsDraft(); };
window.saveAndSend = function() { CreateQuote.saveAndSend(); };
window.contactWhatsApp = function() { CreateQuote.contactWhatsApp(); };
window.contactEmail = function() { CreateQuote.contactEmail(); };
window.contactMessage = function() { CreateQuote.contactMessage(); };

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    CreateQuote.init();
});