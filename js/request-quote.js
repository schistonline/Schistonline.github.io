// ============================================
// SIMPLE RFQ SYSTEM - LIKE MADE-IN-CHINA.COM
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const RFQSimple = {
    currentUser: null,
    currentStep: 1,
    products: [], // Products added by user
    categories: [],
    districts: [],
    uploadedFiles: [],
    
    // Buyer information
    buyerInfo: {
        name: '',
        company: '',
        email: '',
        phone: '',
        countryCode: '+256',
        contactPreference: 'email'
    },
    
    // RFQ data
    rfqData: {
        title: '',
        description: '',
        categoryId: '',
        expectedDelivery: '',
        shippingAddress: '',
        shippingDistrict: ''
    },

    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('🚀 Initializing RFQ System...');
        
        try {
            await this.checkAuth();
            await this.loadCategories();
            await this.loadDistricts();
            this.setupEventListeners();
            this.setMinDates();
            
            // Add first product row
            this.addProductRow();
            
            console.log('✅ RFQ System initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading data', 'error');
        }
    },

    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            if (error || !user) {
                window.location.href = 'login.html?redirect=request-quote.html';
                return;
            }
            this.currentUser = user;
            
            // Pre-fill buyer info from profile
            await this.loadUserProfile();
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },

    async loadUserProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('full_name, email, phone, country_code, business_name')
                .eq('id', this.currentUser.id)
                .single();
                
            if (error) throw error;
            
            if (data) {
                this.buyerInfo.name = data.full_name || '';
                this.buyerInfo.email = data.email || '';
                this.buyerInfo.phone = data.phone ? data.phone.replace(/^\+\d+/, '') : '';
                this.buyerInfo.countryCode = data.country_code || '+256';
                this.buyerInfo.company = data.business_name || '';
                
                // Pre-fill form
                document.getElementById('buyerName').value = this.buyerInfo.name;
                document.getElementById('companyName').value = this.buyerInfo.company;
                document.getElementById('buyerEmail').value = this.buyerInfo.email;
                document.getElementById('countryCode').value = this.buyerInfo.countryCode;
                document.getElementById('buyerPhone').value = this.buyerInfo.phone;
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },

    async loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id, name, display_name')
                .eq('is_active', true)
                .order('display_order');
                
            if (error) throw error;
            
            this.categories = data || [];
            
            const select = document.getElementById('categoryId');
            if (select) {
                let options = '<option value="">Select category (optional)</option>';
                this.categories.forEach(cat => {
                    options += `<option value="${cat.id}">${cat.display_name || cat.name}</option>`;
                });
                select.innerHTML = options;
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    },

    async loadDistricts() {
        try {
            const { data, error } = await sb
                .from('districts')
                .select('name, region:regions(name)')
                .order('name');
                
            if (error) throw error;
            
            this.districts = data || [];
            
            const select = document.getElementById('shippingDistrict');
            if (!select) return;
            
            let options = '<option value="">Select district</option>';
            
            if (this.districts.length > 0) {
                const grouped = {};
                this.districts.forEach(d => {
                    const region = d.region?.name || 'Other';
                    if (!grouped[region]) grouped[region] = [];
                    grouped[region].push(d.name);
                });
                
                Object.keys(grouped).sort().forEach(region => {
                    options += `<optgroup label="${region}">`;
                    grouped[region].sort().forEach(district => {
                        options += `<option value="${district}">${district}</option>`;
                    });
                    options += '</optgroup>';
                });
            }
            
            select.innerHTML = options;
        } catch (error) {
            console.error('Error loading districts:', error);
        }
    },

    // ============================================
    // PRODUCT MANAGEMENT
    // ============================================
    addProductRow(productData = null) {
        const container = document.getElementById('productsContainer');
        const productId = Date.now() + Math.floor(Math.random() * 1000);
        
        const product = {
            id: productId,
            name: productData?.name || '',
            quantity: productData?.quantity || '',
            unit: productData?.unit || 'pcs',
            specifications: productData?.specifications || ''
        };
        
        this.products.push(product);
        this.renderProductRows();
    },

    renderProductRows() {
        const container = document.getElementById('productsContainer');
        
        container.innerHTML = this.products.map((product, index) => `
            <div class="product-row" data-product-id="${product.id}">
                <div class="product-row-header">
                    <h4>Product ${index + 1}</h4>
                    ${this.products.length > 1 ? `
                        <button class="remove-product-btn" onclick="RFQSimple.removeProduct(${index})">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                </div>
                
                <div class="form-row">
                    <div class="form-group" style="flex: 2;">
                        <label>Product Name <span class="required">*</span></label>
                        <input type="text" 
                               class="form-control product-name" 
                               value="${this.escapeHtml(product.name)}"
                               placeholder="e.g., Office Chair, Laptop, etc."
                               onchange="RFQSimple.updateProduct(${index}, 'name', this.value)">
                    </div>
                    
                    <div class="form-group" style="flex: 1;">
                        <label>Quantity <span class="required">*</span></label>
                        <input type="number" 
                               class="form-control product-quantity" 
                               value="${product.quantity}"
                               min="1"
                               placeholder="Qty"
                               onchange="RFQSimple.updateProduct(${index}, 'quantity', this.value)">
                    </div>
                    
                    <div class="form-group" style="flex: 1;">
                        <label>Unit</label>
                        <select class="form-control product-unit" onchange="RFQSimple.updateProduct(${index}, 'unit', this.value)">
                            <option value="pcs" ${product.unit === 'pcs' ? 'selected' : ''}>Pieces</option>
                            <option value="kg" ${product.unit === 'kg' ? 'selected' : ''}>Kilograms</option>
                            <option value="ton" ${product.unit === 'ton' ? 'selected' : ''}>Tons</option>
                            <option value="meter" ${product.unit === 'meter' ? 'selected' : ''}>Meters</option>
                            <option value="liter" ${product.unit === 'liter' ? 'selected' : ''}>Liters</option>
                            <option value="carton" ${product.unit === 'carton' ? 'selected' : ''}>Cartons</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Specifications (Optional)</label>
                    <textarea class="form-control product-specs" 
                              rows="2"
                              placeholder="Size, color, material, quality requirements, etc."
                              onchange="RFQSimple.updateProduct(${index}, 'specifications', this.value)">${this.escapeHtml(product.specifications)}</textarea>
                </div>
                
                ${index < this.products.length - 1 ? '<hr class="product-divider">' : ''}
            </div>
        `).join('');
    },

    updateProduct(index, field, value) {
        if (this.products[index]) {
            this.products[index][field] = value;
        }
    },

    removeProduct(index) {
        this.products.splice(index, 1);
        this.renderProductRows();
    },

    // ============================================
    // STEP NAVIGATION
    // ============================================
    updateStep(step) {
        this.currentStep = step;
        
        // Update progress indicators
        document.querySelectorAll('.step').forEach((el, index) => {
            const stepNum = index + 1;
            el.classList.toggle('active', stepNum === step);
        });
        
        // Update step content
        document.querySelectorAll('.step-content').forEach((el, index) => {
            const stepNum = index + 1;
            el.classList.toggle('active', stepNum === step);
        });
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    validateStep1() {
        const name = document.getElementById('buyerName')?.value.trim();
        const email = document.getElementById('buyerEmail')?.value.trim();
        const preference = document.querySelector('input[name="contactPreference"]:checked')?.value;
        
        if (!name) {
            this.showToast('Please enter your name', 'error');
            return false;
        }
        
        if (!email || !this.validateEmail(email)) {
            this.showToast('Please enter a valid email address', 'error');
            return false;
        }
        
        if (!preference) {
            this.showToast('Please select your contact preference', 'error');
            return false;
        }
        
        // Save buyer info
        this.buyerInfo.name = name;
        this.buyerInfo.email = email;
        this.buyerInfo.company = document.getElementById('companyName')?.value || '';
        this.buyerInfo.countryCode = document.getElementById('countryCode')?.value || '+256';
        this.buyerInfo.phone = document.getElementById('buyerPhone')?.value || '';
        this.buyerInfo.contactPreference = preference;
        
        return true;
    },

    validateStep2() {
        // Check if at least one product has name and quantity
        let valid = false;
        
        for (const product of this.products) {
            if (product.name && product.name.trim() && product.quantity && parseInt(product.quantity) > 0) {
                valid = true;
                break;
            }
        }
        
        if (!valid) {
            this.showToast('Please add at least one product with name and quantity', 'error');
            return false;
        }
        
        return true;
    },

    validateStep3() {
        const title = document.getElementById('rfqTitle')?.value.trim();
        const terms = document.getElementById('acceptTerms')?.checked;
        
        if (!title) {
            this.showToast('Please enter an RFQ title', 'error');
            return false;
        }
        
        if (!terms) {
            this.showToast('Please accept the terms', 'error');
            return false;
        }
        
        return true;
    },

    // ============================================
    // SUBMIT RFQ
    // ============================================
    async submitRFQ() {
        // Validate all steps
        if (!this.validateStep1() || !this.validateStep2() || !this.validateStep3()) {
            return;
        }
        
        // Show loading
        this.showLoading(true);
        
        try {
            // Collect all data
            this.rfqData.title = document.getElementById('rfqTitle')?.value || '';
            this.rfqData.description = document.getElementById('rfqDescription')?.value || '';
            this.rfqData.categoryId = document.getElementById('categoryId')?.value || null;
            this.rfqData.expectedDelivery = document.getElementById('expectedDelivery')?.value || null;
            this.rfqData.shippingAddress = document.getElementById('shippingAddress')?.value || '';
            this.rfqData.shippingDistrict = document.getElementById('shippingDistrict')?.value || '';
            
            // 1. Create RFQ request
            const { data: rfq, error: rfqError } = await sb
                .from('rfq_requests')
                .insert({
                    buyer_id: this.currentUser.id,
                    buyer_name: this.buyerInfo.name,
                    buyer_email: this.buyerInfo.email,
                    buyer_phone: this.buyerInfo.phone ? this.buyerInfo.countryCode + this.buyerInfo.phone : null,
                    buyer_company: this.buyerInfo.company || null,
                    preferred_contact: this.buyerInfo.contactPreference,
                    contact_details: {
                        email: this.buyerInfo.email,
                        phone: this.buyerInfo.phone ? this.buyerInfo.countryCode + this.buyerInfo.phone : null,
                        whatsapp: this.buyerInfo.phone ? this.buyerInfo.countryCode + this.buyerInfo.phone : null
                    },
                    title: this.rfqData.title,
                    description: this.rfqData.description || null,
                    category_id: this.rfqData.categoryId || null,
                    expected_delivery_date: this.rfqData.expectedDelivery,
                    shipping_address: this.rfqData.shippingAddress || null,
                    shipping_district: this.rfqData.shippingDistrict || null,
                    status: 'pending'
                })
                .select()
                .single();
                
            if (rfqError) throw rfqError;
            
            // 2. Create RFQ items
            for (const product of this.products) {
                if (!product.name || !product.quantity) continue;
                
                const { error: itemError } = await sb
                    .from('rfq_items')
                    .insert({
                        rfq_id: rfq.id,
                        product_name: product.name,
                        quantity: parseInt(product.quantity),
                        unit: product.unit || 'pcs',
                        specifications: product.specifications ? { details: product.specifications } : null
                    });
                    
                if (itemError) throw itemError;
            }
            
            // 3. Upload attachments
            if (this.uploadedFiles.length > 0) {
                for (const file of this.uploadedFiles) {
                    const filePath = `rfqs/${rfq.id}/${Date.now()}_${file.name}`;
                    
                    const { error: uploadError } = await sb.storage
                        .from('rfq-attachments')
                        .upload(filePath, file);
                        
                    if (uploadError) throw uploadError;
                    
                    const { data: { publicUrl } } = sb.storage
                        .from('rfq-attachments')
                        .getPublicUrl(filePath);
                    
                    await sb
                        .from('rfq_attachments')
                        .insert({
                            rfq_id: rfq.id,
                            file_url: publicUrl,
                            file_name: file.name,
                            file_size: file.size,
                            file_type: file.type
                        });
                }
            }
            
            // 4. Find matching suppliers (background process)
            // Update status to matching
            await sb
                .from('rfq_requests')
                .update({ status: 'matching' })
                .eq('id', rfq.id);
            
            // Call the matching function (this could be done via Edge Function or background job)
            // For now, we'll do it synchronously
            const { data: matches, error: matchError } = await sb
                .rpc('find_matching_suppliers', { rfq_id: rfq.id });
                
            if (!matchError && matches && matches.length > 0) {
                // Insert matches
                const matchInserts = matches.map(m => ({
                    rfq_id: rfq.id,
                    supplier_id: m.supplier_id,
                    match_score: m.match_score,
                    status: 'pending'
                }));
                
                await sb.from('rfq_matches').insert(matchInserts);
                
                // Create notifications for suppliers
                const notifications = matches.map(m => ({
                    user_id: m.supplier_id,
                    type: 'new_rfq',
                    title: 'New RFQ Matching Your Products',
                    message: `You've received a new request for quotation: ${this.rfqData.title}`,
                    link: `/supplier-rfq.html?id=${rfq.id}`
                }));
                
                await sb.from('notifications').insert(notifications);
                
                // Update RFQ status
                await sb
                    .from('rfq_requests')
                    .update({ 
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    })
                    .eq('id', rfq.id);
                
                // Update match status to sent
                await sb
                    .from('rfq_matches')
                    .update({ 
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    })
                    .eq('rfq_id', rfq.id);
                
                // Show success with supplier count
                document.getElementById('supplierCount').textContent = matches.length;
            } else {
                // No matches found
                document.getElementById('supplierCount').textContent = '0';
            }
            
            // Show success modal
            document.getElementById('rfqNumber').textContent = rfq.rfq_number;
            document.getElementById('successModal').classList.add('show');
            
        } catch (error) {
            console.error('Error submitting RFQ:', error);
            this.showToast('Error submitting RFQ: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    },

    // ============================================
    // FILE UPLOAD
    // ============================================
    setupFileUpload() {
        const uploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('fileInput');
        
        if (!uploadArea || !fileInput) return;
        
        uploadArea.addEventListener('click', () => fileInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary)';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--gray-300)';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--gray-300)';
            this.handleFiles(Array.from(e.dataTransfer.files));
        });
        
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(Array.from(e.target.files));
        });
    },

    handleFiles(files) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        files.forEach(file => {
            if (file.size > maxSize) {
                this.showToast(`File ${file.name} exceeds 10MB`, 'error');
                return;
            }
            this.uploadedFiles.push(file);
        });
        
        this.renderFileList();
    },

    renderFileList() {
        const fileList = document.getElementById('fileList');
        if (!fileList) return;
        
        if (this.uploadedFiles.length === 0) {
            fileList.innerHTML = '';
            return;
        }
        
        fileList.innerHTML = this.uploadedFiles.map((file, index) => `
            <div class="file-item">
                <i class="fas ${this.getFileIcon(file.type)}"></i>
                <span class="file-name">${file.name}</span>
                <span class="file-size">${this.formatFileSize(file.size)}</span>
                <i class="fas fa-times remove-file" onclick="RFQSimple.removeFile(${index})"></i>
            </div>
        `).join('');
    },

    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        this.renderFileList();
    },

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    setMinDates() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const expectedDelivery = document.getElementById('expectedDelivery');
        if (expectedDelivery) {
            expectedDelivery.min = tomorrow.toISOString().split('T')[0];
        }
    },

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    getFileIcon(mimeType) {
        if (mimeType?.includes('pdf')) return 'fa-file-pdf';
        if (mimeType?.includes('excel') || mimeType?.includes('sheet')) return 'fa-file-excel';
        if (mimeType?.includes('image')) return 'fa-file-image';
        return 'fa-file';
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
            overlay.style.display = show ? 'flex' : 'none';
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
        
        toast.textContent = message;
        toast.style.backgroundColor = colors[type] || colors.info;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Step navigation
        document.getElementById('continueToStep2')?.addEventListener('click', () => {
            if (this.validateStep1()) {
                this.updateStep(2);
            }
        });
        
        document.getElementById('continueToStep3')?.addEventListener('click', () => {
            if (this.validateStep2()) {
                this.updateStep(3);
            }
        });
        
        document.getElementById('backToStep1')?.addEventListener('click', () => this.updateStep(1));
        document.getElementById('backToStep2')?.addEventListener('click', () => this.updateStep(2));
        
        // Add product
        document.getElementById('addProductBtn')?.addEventListener('click', () => {
            this.addProductRow();
        });
        
        // Terms checkbox
        document.getElementById('acceptTerms')?.addEventListener('change', (e) => {
            const submitBtn = document.getElementById('submitRfq');
            if (submitBtn) {
                submitBtn.disabled = !e.target.checked;
            }
        });
        
        // Submit
        document.getElementById('submitRfq')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.submitRFQ();
        });
        
        // File upload
        this.setupFileUpload();
        
        // Close modals
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    RFQSimple.init();
});

// Make functions available globally
window.RFQSimple = RFQSimple;