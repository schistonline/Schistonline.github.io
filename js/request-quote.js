// ============================================
// PROFESSIONAL RFQ SYSTEM - SINGLE PAGE VERSION
// BuyUganda.online
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const RFQSystem = {
    currentUser: null,
    products: [],
    categories: [],
    districts: [],
    attachments: [],
    selectedContactMethod: null,
    isSubmitting: false,

    async init() {
        console.log('🚀 RFQ System initializing...');
        
        try {
            await this.checkAuth();
            await this.loadCategories();
            await this.loadDistricts();
            this.setupEventListeners();
            this.setupContactPreference();
            this.setupCharacterCounter();
            this.setupFileUpload();
            this.addProductRow();
            console.log('✅ RFQ System ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading form', 'error');
        }
    },

    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
            if (user) await this.loadUserProfile();
        } catch (error) {
            console.error('Auth error:', error);
        }
    },

    async loadUserProfile() {
        if (!this.currentUser) return;
        
        try {
            const { data: profile } = await sb
                .from('profiles')
                .select('full_name, email, business_name')
                .eq('id', this.currentUser.id)
                .single();
                
            if (profile) {
                if (profile.full_name) document.getElementById('buyerName').value = profile.full_name;
                if (profile.email) document.getElementById('buyerEmail').value = profile.email;
                if (profile.business_name) document.getElementById('companyName').value = profile.business_name;
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },

    async loadCategories() {
        try {
            const { data } = await sb
                .from('categories')
                .select('id, name, display_name')
                .eq('is_active', true)
                .order('display_order')
                .limit(50);
                
            this.categories = data || [];
            const select = document.getElementById('categoryId');
            if (select && this.categories.length) {
                select.innerHTML = '<option value="">Category (optional)</option>' +
                    this.categories.map(c => `<option value="${c.id}">${c.display_name || c.name}</option>`).join('');
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },

    async loadDistricts() {
        try {
            const { data } = await sb
                .from('districts')
                .select('name')
                .order('name');
                
            this.districts = data || [];
            const select = document.getElementById('shippingDistrict');
            if (select) {
                select.innerHTML = '<option value="">Select district</option>' +
                    this.districts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
            }
        } catch (error) {
            console.error('Error loading districts:', error);
        }
    },

    setupContactPreference() {
        const options = document.querySelectorAll('.contact-option');
        const emailGroup = document.getElementById('emailGroup');
        const phoneGroup = document.getElementById('phoneGroup');
        
        options.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    options.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    this.selectedContactMethod = radio.value;
                    
                    // Show/hide contact fields based on selection
                    if (this.selectedContactMethod === 'whatsapp') {
                        if (phoneGroup) phoneGroup.style.display = 'block';
                        if (emailGroup) emailGroup.style.display = 'none';
                    } else if (this.selectedContactMethod === 'both') {
                        if (phoneGroup) phoneGroup.style.display = 'block';
                        if (emailGroup) emailGroup.style.display = 'block';
                    } else if (this.selectedContactMethod === 'email') {
                        if (emailGroup) emailGroup.style.display = 'block';
                        if (phoneGroup) phoneGroup.style.display = 'none';
                    } else if (this.selectedContactMethod === 'platform') {
                        if (emailGroup) emailGroup.style.display = 'block';
                        if (phoneGroup) phoneGroup.style.display = 'none';
                    }
                    
                    // Update submit button state
                    this.updateSubmitButton();
                }
            });
        });
        
        // Set default selection to email
        const defaultOption = document.querySelector('.contact-option[data-method="email"]');
        if (defaultOption) {
            defaultOption.click();
        }
    },

    setupCharacterCounter() {
        const textarea = document.getElementById('rfqDescription');
        const counter = document.getElementById('charCount');
        if (textarea && counter) {
            textarea.addEventListener('input', () => {
                counter.textContent = textarea.value.length;
            });
        }
    },

    setupFileUpload() {
        const fileInput = document.getElementById('fileInput');
        const uploadBox = document.querySelector('.upload-box');
        
        if (uploadBox) {
            uploadBox.addEventListener('click', () => fileInput?.click());
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                for (const file of files) {
                    if (file.size > 10 * 1024 * 1024) {
                        this.showToast(`${file.name} exceeds 10MB`, 'error');
                        continue;
                    }
                    this.attachments.push({ file, name: file.name, size: file.size, type: file.type });
                }
                this.renderFileList();
                fileInput.value = '';
            });
        }
    },

    renderFileList() {
        const container = document.getElementById('fileList');
        if (!container) return;
        
        if (this.attachments.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = this.attachments.map((file, index) => `
            <div class="file-item">
                <i class="fas ${this.getFileIcon(file.type)}"></i>
                <span style="flex:1">${this.escapeHtml(file.name)}</span>
                <span style="font-size:11px;color:#999">${this.formatFileSize(file.size)}</span>
                <button class="remove-file" onclick="RFQSystem.removeAttachment(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },

    removeAttachment(index) {
        this.attachments.splice(index, 1);
        this.renderFileList();
    },

    addProductRow(productData = null) {
        this.products.push({
            id: Date.now() + Math.random(),
            name: productData?.name || '',
            quantity: productData?.quantity || '',
            unit: productData?.unit || 'pcs',
            targetPrice: productData?.targetPrice || '',
            specs: productData?.specs || ''
        });
        this.renderProducts();
    },

    renderProducts() {
        const container = document.getElementById('productsContainer');
        if (!container) return;
        
        if (this.products.length === 0) {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">Click "Add Product" to start</div>';
            return;
        }
        
        container.innerHTML = this.products.map((product, index) => `
            <div class="product-item" data-product-id="${product.id}">
                <div class="product-header">
                    <span class="product-title">Product ${index + 1}</span>
                    ${this.products.length > 1 ? `
                        <button type="button" class="remove-product" onclick="RFQSystem.removeProduct(${index})">
                            <i class="fas fa-trash-alt"></i> Remove
                        </button>
                    ` : ''}
                </div>
                <div class="product-fields">
                    <input type="text" placeholder="Product name *" value="${this.escapeHtml(product.name)}" onchange="RFQSystem.updateProduct(${index}, 'name', this.value)">
                    <input type="number" placeholder="Quantity *" value="${product.quantity}" min="1" onchange="RFQSystem.updateProduct(${index}, 'quantity', this.value)">
                </div>
                <div class="product-fields">
                    <select onchange="RFQSystem.updateProduct(${index}, 'unit', this.value)">
                        <option value="pcs" ${product.unit === 'pcs' ? 'selected' : ''}>Piece(s)</option>
                        <option value="kg" ${product.unit === 'kg' ? 'selected' : ''}>Kilogram(s)</option>
                        <option value="tons" ${product.unit === 'tons' ? 'selected' : ''}>Ton(s)</option>
                        <option value="meters" ${product.unit === 'meters' ? 'selected' : ''}>Meter(s)</option>
                        <option value="liters" ${product.unit === 'liters' ? 'selected' : ''}>Liter(s)</option>
                        <option value="cartons" ${product.unit === 'cartons' ? 'selected' : ''}>Carton(s)</option>
                    </select>
                    <input type="number" placeholder="Target price (UGX) - optional" value="${product.targetPrice}" min="0" onchange="RFQSystem.updateProduct(${index}, 'targetPrice', this.value)">
                </div>
                <div class="product-fields full-width">
                    <textarea rows="2" placeholder="Specifications (size, color, quality, etc.)" onchange="RFQSystem.updateProduct(${index}, 'specs', this.value)">${this.escapeHtml(product.specs)}</textarea>
                </div>
            </div>
        `).join('');
    },

    updateProduct(index, field, value) {
        if (this.products[index]) {
            this.products[index][field] = value;
            this.updateSubmitButton();
        }
    },

    removeProduct(index) {
        if (this.products.length > 1) {
            this.products.splice(index, 1);
            this.renderProducts();
            this.updateSubmitButton();
        } else {
            this.showToast('You need at least one product', 'error');
        }
    },

    validateForm() {
        // Check products
        let hasValidProduct = false;
        for (const product of this.products) {
            if (product.name?.trim() && product.quantity > 0) {
                hasValidProduct = true;
                break;
            }
        }
        if (!hasValidProduct) return false;
        
        // Check contact method
        if (!this.selectedContactMethod) return false;
        
        // Check name
        const name = document.getElementById('buyerName')?.value.trim();
        if (!name) return false;
        
        // Check email if needed
        if (this.selectedContactMethod === 'email' || this.selectedContactMethod === 'both') {
            const email = document.getElementById('buyerEmail')?.value.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
        }
        
        // Check phone if needed
        if (this.selectedContactMethod === 'whatsapp' || this.selectedContactMethod === 'both') {
            const phone = document.getElementById('buyerPhone')?.value.trim();
            if (!phone) return false;
        }
        
        // Check title
        const title = document.getElementById('rfqTitle')?.value.trim();
        if (!title) return false;
        
        // Check terms
        const terms = document.getElementById('acceptTerms')?.checked;
        if (!terms) return false;
        
        return true;
    },

    updateSubmitButton() {
        const submitBtn = document.getElementById('submitRfq');
        if (submitBtn) {
            submitBtn.disabled = !this.validateForm();
        }
    },

    async uploadAttachments(rfqId) {
        const uploadedUrls = [];
        for (const attachment of this.attachments) {
            try {
                const fileName = `rfq_attachments/${rfqId}/${Date.now()}_${attachment.file.name}`;
                const { error } = await sb.storage
                    .from('rfq-attachments')
                    .upload(fileName, attachment.file);
                    
                if (error) throw error;
                
                const { data: { publicUrl } } = sb.storage
                    .from('rfq-attachments')
                    .getPublicUrl(fileName);
                    
                uploadedUrls.push({ name: attachment.name, url: publicUrl, size: attachment.size });
            } catch (error) {
                console.error('Upload error:', error);
            }
        }
        return uploadedUrls;
    },

    async submitRFQ(e) {
        e.preventDefault();
        
        if (this.isSubmitting) return;
        if (!this.validateForm()) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        this.isSubmitting = true;
        this.showLoading(true);
        
        try {
            const name = document.getElementById('buyerName').value.trim();
            const email = document.getElementById('buyerEmail')?.value.trim() || '';
            const phone = document.getElementById('buyerPhone')?.value.trim() || '';
            const countryCode = document.getElementById('countryCode')?.value || '+256';
            const company = document.getElementById('companyName')?.value.trim() || '';
            const title = document.getElementById('rfqTitle').value.trim();
            const description = document.getElementById('rfqDescription')?.value.trim() || '';
            const categoryId = document.getElementById('categoryId')?.value || null;
            const expectedDelivery = document.getElementById('expectedDelivery')?.value || null;
            const shippingAddress = document.getElementById('shippingAddress')?.value.trim() || '';
            const shippingDistrict = document.getElementById('shippingDistrict')?.value || '';
            
            const fullPhone = phone ? countryCode + phone : null;
            
            // Calculate budget
            let budgetMin = null, budgetMax = null;
            for (const product of this.products) {
                if (product.targetPrice && product.quantity) {
                    const total = parseFloat(product.quantity) * parseFloat(product.targetPrice);
                    if (budgetMin === null || total < budgetMin) budgetMin = total;
                    if (budgetMax === null || total > budgetMax) budgetMax = total;
                }
            }
            
            // Create RFQ
            const { data: rfq, error: rfqError } = await sb
                .from('rfq_requests')
                .insert({
                    buyer_id: this.currentUser?.id || null,
                    buyer_name: name,
                    buyer_email: email,
                    buyer_phone: fullPhone,
                    buyer_company: company || null,
                    preferred_contact: this.selectedContactMethod,
                    contact_details: { email, phone: fullPhone },
                    title: title,
                    description: description || null,
                    shipping_address: shippingAddress || null,
                    shipping_district: shippingDistrict || null,
                    expected_delivery_date: expectedDelivery || null,
                    budget_min: budgetMin,
                    budget_max: budgetMax,
                    status: 'pending'
                })
                .select()
                .single();
                
            if (rfqError) throw rfqError;
            
            // Create items
            for (const product of this.products) {
                if (!product.name || !product.quantity) continue;
                await sb.from('rfq_items').insert({
                    rfq_id: rfq.id,
                    product_name: product.name,
                    quantity: parseInt(product.quantity),
                    unit: product.unit || 'pcs',
                    preferred_unit_price: product.targetPrice ? parseFloat(product.targetPrice) : null,
                    specifications: product.specs || null,
                    category_id: categoryId
                });
            }
            
            // Upload attachments
            if (this.attachments.length > 0) {
                const uploaded = await this.uploadAttachments(rfq.id);
                if (uploaded.length) {
                    await sb.from('rfq_requests').update({ attachments: uploaded }).eq('id', rfq.id);
                }
            }
            
            // Log activity
            await sb.from('rfq_activity_log').insert({
                rfq_id: rfq.id,
                user_id: this.currentUser?.id || null,
                user_type: 'buyer',
                action: 'created',
                details: { title, product_count: this.products.length }
            });
            
            // Show success
            document.getElementById('rfqNumber').textContent = rfq.rfq_number;
            document.getElementById('supplierCount').textContent = '5+';
            document.getElementById('successModal').classList.add('show');
            
            // Reset form
            this.resetForm();
            
        } catch (error) {
            console.error('Submit error:', error);
            this.showToast(error.message || 'Error submitting request', 'error');
        } finally {
            this.isSubmitting = false;
            this.showLoading(false);
        }
    },

    resetForm() {
        this.products = [];
        this.attachments = [];
        this.selectedContactMethod = null;
        this.addProductRow();
        
        document.getElementById('buyerName').value = '';
        document.getElementById('buyerEmail').value = '';
        document.getElementById('buyerPhone').value = '';
        document.getElementById('companyName').value = '';
        document.getElementById('rfqTitle').value = '';
        document.getElementById('rfqDescription').value = '';
        document.getElementById('shippingAddress').value = '';
        document.getElementById('expectedDelivery').value = '';
        
        const terms = document.getElementById('acceptTerms');
        if (terms) terms.checked = false;
        
        // Reset contact preference
        const defaultOption = document.querySelector('.contact-option[data-method="email"]');
        if (defaultOption) defaultOption.click();
        
        this.updateSubmitButton();
    },

    setupEventListeners() {
        // Add product button
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => this.addProductRow());
        }
        
        // Form submit
        const form = document.getElementById('rfqForm');
        if (form) {
            form.addEventListener('submit', (e) => this.submitRFQ(e));
        }
        
        // Real-time validation on inputs
        const inputs = ['buyerName', 'buyerEmail', 'buyerPhone', 'rfqTitle', 'acceptTerms'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.updateSubmitButton());
                if (el.type === 'checkbox') {
                    el.addEventListener('change', () => this.updateSubmitButton());
                }
            }
        });
        
        // Close modal on overlay click
        const modal = document.getElementById('successModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('show');
            });
        }
    },

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('show', show);
        }
    },

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = { success: '#4caf50', error: '#ff4444', info: '#0B4F6C' };
        toast.textContent = message;
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    getFileIcon(type) {
        if (type?.includes('pdf')) return 'fa-file-pdf';
        if (type?.includes('excel') || type?.includes('sheet')) return 'fa-file-excel';
        if (type?.includes('image')) return 'fa-file-image';
        return 'fa-file';
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Global functions
window.RFQSystem = RFQSystem;
window.removeAttachment = (i) => RFQSystem.removeAttachment(i);
window.removeProduct = (i) => RFQSystem.removeProduct(i);
window.updateProduct = (i, f, v) => RFQSystem.updateProduct(i, f, v);
window.closeSuccessModal = () => {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    RFQSystem.init();
});
