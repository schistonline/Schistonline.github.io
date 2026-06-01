// ============================================
// SUPPLIER CONTACT PAGE - STEP-BY-STEP DESIGN
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
const ContactPage = {
    currentUser: null,
    currentStep: 1,
    supplierData: null,
    productData: null,
    inquiryData: null,
    selectedContactMethod: null,
    selectedContactNumber: null,
    selectedContactLabel: null,
    supplierWhatsApp: [],
    supplierPhones: [],
    supplierEmails: [],
    productId: null,
    quantity: 1,
    variant: null,
    
    async init() {
        console.log('📞 Loading contact page...');
        
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.productId = urlParams.get('product_id');
        this.quantity = parseInt(urlParams.get('quantity')) || 1;
        this.variant = urlParams.get('variant');
        
        console.log('Product ID:', this.productId);
        console.log('Quantity:', this.quantity);
        
        if (!this.productId) {
            this.showError('No product selected. Please go back to the product page.');
            return;
        }
        
        await this.checkAuth();
        await this.loadProductData();
        await this.loadSupplierData();
        await this.loadSupplierContacts();
        this.renderStep1();
        
        // Hide loading, show step 1
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('step1').style.display = 'block';
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            if (!error && user) {
                this.currentUser = user;
                console.log('✅ User logged in:', user.email);
            } else {
                console.log('User not logged in');
            }
        } catch (error) {
            console.log('User not logged in');
        }
    },
    
    async loadProductData() {
        try {
            console.log('Loading product data for ID:', this.productId);
            
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
            this.supplierData = data.seller;
            
            console.log('✅ Product loaded:', this.productData.title);
            console.log('✅ Supplier:', this.supplierData?.business_name || this.supplierData?.full_name);
            
            // Render product summary
            this.renderProductSummary();
            
        } catch (error) {
            console.error('Error loading product:', error);
            this.showError('Could not load product details. Please try again.');
        }
    },
    
    async loadSupplierData() {
        try {
            if (!this.supplierData) return;
            
            // Try to get supplier record from suppliers table
            const { data: supplier, error: supplierError } = await sb
                .from('suppliers')
                .select('id, business_name, verification_status, total_orders, completion_rate')
                .eq('profile_id', this.supplierData.id)
                .maybeSingle();
            
            if (!supplierError && supplier) {
                this.supplierRecord = supplier;
                console.log('✅ Supplier record found:', supplier.id);
            } else {
                console.log('No supplier record found, using profile data only');
            }
            
        } catch (error) {
            console.error('Error loading supplier record:', error);
        }
    },
    
    async loadSupplierContacts() {
        console.log('Loading supplier contacts...');
        
        let supplierId = null;
        
        // Try to get supplier ID from suppliers table first
        if (this.supplierRecord?.id) {
            supplierId = this.supplierRecord.id;
        } else {
            // Try to find supplier by profile_id
            const { data: supplier, error: supplierError } = await sb
                .from('suppliers')
                .select('id')
                .eq('profile_id', this.supplierData.id)
                .maybeSingle();
            
            if (!supplierError && supplier) {
                supplierId = supplier.id;
                console.log('✅ Found supplier ID:', supplierId);
            }
        }
        
        // Load WhatsApp numbers from supplier_whatsapp table
        if (supplierId) {
            const { data: whatsapp, error: whatsappError } = await sb
                .from('supplier_whatsapp')
                .select('*')
                .eq('supplier_id', supplierId)
                .eq('is_active', true)
                .order('is_primary', { ascending: false });
            
            if (!whatsappError && whatsapp && whatsapp.length > 0) {
                this.supplierWhatsApp = whatsapp;
                console.log('✅ WhatsApp numbers loaded:', this.supplierWhatsApp.length);
            } else {
                console.log('No WhatsApp numbers found in supplier_whatsapp table');
            }
            
            // Load phone numbers from supplier_phones table
            const { data: phones, error: phonesError } = await sb
                .from('supplier_phones')
                .select('*')
                .eq('supplier_id', supplierId)
                .eq('is_active', true)
                .order('is_primary', { ascending: false });
            
            if (!phonesError && phones && phones.length > 0) {
                this.supplierPhones = phones;
                console.log('✅ Phone numbers loaded:', this.supplierPhones.length);
            } else {
                console.log('No phone numbers found in supplier_phones table');
            }
            
            // Load emails from supplier_emails table
            const { data: emails, error: emailsError } = await sb
                .from('supplier_emails')
                .select('*')
                .eq('supplier_id', supplierId)
                .eq('is_active', true)
                .order('is_primary', { ascending: false });
            
            if (!emailsError && emails && emails.length > 0) {
                this.supplierEmails = emails;
                console.log('✅ Emails loaded:', this.supplierEmails.length);
            } else {
                console.log('No emails found in supplier_emails table');
            }
        }
        
        // FALLBACK: If no contacts found in dedicated tables, use profile data
        if (this.supplierWhatsApp.length === 0) {
            // Check if supplier has WhatsApp in profile
            if (this.supplierData?.phone) {
                console.log('Using profile phone as WhatsApp fallback');
                this.supplierWhatsApp.push({
                    id: 'profile_wa',
                    whatsapp_number: this.supplierData.phone,
                    label: 'Business WhatsApp',
                    is_primary: true,
                    department: 'General Inquiries'
                });
            }
        }
        
        if (this.supplierPhones.length === 0) {
            if (this.supplierData?.phone) {
                console.log('Using profile phone as phone fallback');
                this.supplierPhones.push({
                    id: 'profile_phone',
                    phone_number: this.supplierData.phone,
                    label: 'Business Phone',
                    is_primary: true,
                    department: 'General Inquiries'
                });
            }
        }
        
        if (this.supplierEmails.length === 0) {
            if (this.supplierData?.email) {
                console.log('Using profile email as email fallback');
                this.supplierEmails.push({
                    id: 'profile_email',
                    email_address: this.supplierData.email,
                    label: 'Business Email',
                    is_primary: true,
                    department: 'General Inquiries'
                });
            }
        }
        
        console.log('Final contacts - WhatsApp:', this.supplierWhatsApp.length, 'Phone:', this.supplierPhones.length, 'Email:', this.supplierEmails.length);
    },
    
    renderProductSummary() {
        const container = document.getElementById('productSummaryCard');
        if (!container) return;
        
        const price = this.productData.wholesale_price || this.productData.price || 0;
        const imageUrl = this.productData.image_urls?.[0] || 'https://via.placeholder.com/80x80?text=No+Image';
        
        container.innerHTML = `
            <div class="product-summary">
                <img src="${imageUrl}" alt="${this.escapeHtml(this.productData.title)}">
                <div class="product-info">
                    <h4>${this.escapeHtml(this.productData.title)}</h4>
                    <p class="product-price">UGX ${this.formatNumber(price)} per unit</p>
                    <p class="product-quantity">Quantity: ${this.quantity} unit(s)</p>
                    ${this.variant && this.variant !== 'Default' ? `<p class="product-variant">Variant: ${this.escapeHtml(this.variant)}</p>` : ''}
                    <p class="product-total">Total: UGX ${this.formatNumber(price * this.quantity)}</p>
                </div>
            </div>
        `;
    },
    
    renderStep1() {
        console.log('Rendering step 1 - Contact methods');
        
        // Supplier info
        const name = this.supplierData?.business_name || this.supplierData?.full_name || 'Supplier';
        const location = this.supplierData?.district || this.supplierData?.location || 'Uganda';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        const supplierNameEl = document.getElementById('supplierName');
        const supplierLocationEl = document.getElementById('supplierLocation');
        const supplierInitialsEl = document.getElementById('supplierInitials');
        
        if (supplierNameEl) supplierNameEl.textContent = name;
        if (supplierLocationEl) supplierLocationEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${location}`;
        if (supplierInitialsEl) supplierInitialsEl.textContent = initials;
        
        const verifiedBadge = document.getElementById('verifiedBadge');
        if (verifiedBadge && this.supplierData?.is_verified) {
            verifiedBadge.style.display = 'inline-block';
        }
        
        // Show contact options based on available data
        const whatsappOption = document.getElementById('whatsappOption');
        const phoneOption = document.getElementById('phoneOption');
        const emailOption = document.getElementById('emailOption');
        const messageOption = document.getElementById('messageOption');
        
        console.log('Showing options - WhatsApp:', this.supplierWhatsApp.length > 0);
        console.log('Showing options - Phone:', this.supplierPhones.length > 0);
        console.log('Showing options - Email:', this.supplierEmails.length > 0);
        
        if (whatsappOption) {
            if (this.supplierWhatsApp.length > 0) {
                whatsappOption.style.display = 'block';
                whatsappOption.onclick = () => this.selectContactMethod('whatsapp');
            } else {
                whatsappOption.style.display = 'none';
            }
        }
        
        if (phoneOption) {
            if (this.supplierPhones.length > 0) {
                phoneOption.style.display = 'block';
                phoneOption.onclick = () => this.selectContactMethod('phone');
            } else {
                phoneOption.style.display = 'none';
            }
        }
        
        if (emailOption) {
            if (this.supplierEmails.length > 0) {
                emailOption.style.display = 'block';
                emailOption.onclick = () => this.selectContactMethod('email');
            } else {
                emailOption.style.display = 'none';
            }
        }
        
        // In-app message always available
        if (messageOption) {
            messageOption.style.display = 'block';
            messageOption.onclick = () => this.selectContactMethod('message');
        }
        
        // If no options are showing, show a message
        if (this.supplierWhatsApp.length === 0 && this.supplierPhones.length === 0 && this.supplierEmails.length === 0) {
            console.warn('No contact methods available!');
            const container = document.getElementById('step1');
            if (container) {
                const warningDiv = document.createElement('div');
                warningDiv.className = 'warning-message';
                warningDiv.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>No contact methods available for this supplier.</p>
                    <p>Please try the in-app message option above.</p>
                `;
                container.insertBefore(warningDiv, messageOption);
            }
        }
    },
    
    selectContactMethod(method) {
        console.log('Selected contact method:', method);
        this.selectedContactMethod = method;
        
        if (method === 'whatsapp') {
            this.renderWhatsAppNumbers();
            this.goToStep(2);
        } else if (method === 'phone') {
            this.renderPhoneNumbers();
            this.goToStep(2);
        } else if (method === 'email') {
            this.renderEmails();
            this.goToStep(2);
        } else if (method === 'message') {
            // For in-app message, go directly to step 3 (form)
            this.goToStep(3);
        }
    },
    
    renderWhatsAppNumbers() {
        console.log('Rendering WhatsApp numbers:', this.supplierWhatsApp);
        
        const container = document.getElementById('whatsappNumbersList');
        const section = document.getElementById('whatsappNumbersSection');
        const continueBtn = document.getElementById('continueToStep3Btn');
        const directBtn = document.getElementById('directContactBtn');
        
        if (!container || !section) return;
        
        // Hide other sections
        const phoneSection = document.getElementById('phoneNumbersSection');
        const emailSection = document.getElementById('emailSection');
        if (phoneSection) phoneSection.style.display = 'none';
        if (emailSection) emailSection.style.display = 'none';
        
        // Show WhatsApp section
        section.style.display = 'block';
        
        // WhatsApp needs message form (continue to step 3)
        if (continueBtn) {
            continueBtn.style.display = 'block';
            continueBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Continue to Message';
        }
        if (directBtn) directBtn.style.display = 'none';
        
        container.innerHTML = this.supplierWhatsApp.map(wa => `
            <div class="contact-number-card" data-number="${wa.whatsapp_number}" onclick="ContactPage.selectContactNumber('${wa.id}', '${wa.whatsapp_number}', '${wa.label || 'WhatsApp'}')">
                <div class="contact-radio">
                    <input type="radio" name="contactNumber" value="${wa.whatsapp_number}" id="wa_${wa.id}" ${wa.is_primary ? 'checked' : ''}>
                </div>
                <div class="contact-details">
                    <div class="contact-label">
                        <i class="fab fa-whatsapp"></i> ${this.escapeHtml(wa.label || 'WhatsApp Business')}
                        ${wa.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                    </div>
                    <div class="contact-number">${wa.whatsapp_number}</div>
                    ${wa.department ? `<div class="contact-dept">${this.escapeHtml(wa.department)}</div>` : ''}
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        document.querySelectorAll('.contact-number-card').forEach(card => {
            card.addEventListener('click', () => {
                const radio = card.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    this.selectedContactNumber = radio.value;
                    document.querySelectorAll('.contact-number-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                }
            });
        });
        
        // Auto-select primary
        const primaryRadio = document.querySelector('input[type="radio"]:checked');
        if (primaryRadio) {
            this.selectedContactNumber = primaryRadio.value;
            const selectedCard = primaryRadio.closest('.contact-number-card');
            if (selectedCard) selectedCard.classList.add('selected');
        }
    },
    
    renderPhoneNumbers() {
        console.log('Rendering phone numbers:', this.supplierPhones);
        
        const container = document.getElementById('phoneNumbersList');
        const section = document.getElementById('phoneNumbersSection');
        const continueBtn = document.getElementById('continueToStep3Btn');
        const directBtn = document.getElementById('directContactBtn');
        
        if (!container || !section) return;
        
        // Hide other sections
        const whatsappSection = document.getElementById('whatsappNumbersSection');
        const emailSection = document.getElementById('emailSection');
        if (whatsappSection) whatsappSection.style.display = 'none';
        if (emailSection) emailSection.style.display = 'none';
        
        // Show phone section
        section.style.display = 'block';
        
        // Phone calls can be made directly (no message form needed)
        if (continueBtn) continueBtn.style.display = 'none';
        if (directBtn) {
            directBtn.style.display = 'block';
            directBtn.innerHTML = '<i class="fas fa-phone-alt"></i> Call Now';
        }
        
        let allPhones = [...this.supplierPhones];
        
        container.innerHTML = allPhones.map(phone => `
            <div class="contact-number-card" data-number="${phone.phone_number}" onclick="ContactPage.selectContactNumber('${phone.id}', '${phone.phone_number}', '${phone.label || 'Phone'}')">
                <div class="contact-radio">
                    <input type="radio" name="contactNumber" value="${phone.phone_number}" id="phone_${phone.id}" ${phone.is_primary ? 'checked' : ''}>
                </div>
                <div class="contact-details">
                    <div class="contact-label">
                        <i class="fas fa-phone-alt"></i> ${this.escapeHtml(phone.label || 'Phone Number')}
                        ${phone.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                    </div>
                    <div class="contact-number">${phone.phone_number}</div>
                    ${phone.department ? `<div class="contact-dept">${this.escapeHtml(phone.department)}</div>` : ''}
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        document.querySelectorAll('.contact-number-card').forEach(card => {
            card.addEventListener('click', () => {
                const radio = card.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    this.selectedContactNumber = radio.value;
                    document.querySelectorAll('.contact-number-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                }
            });
        });
    },
    
    renderEmails() {
        console.log('Rendering emails:', this.supplierEmails);
        
        const container = document.getElementById('emailDetailsList');
        const section = document.getElementById('emailSection');
        const continueBtn = document.getElementById('continueToStep3Btn');
        const directBtn = document.getElementById('directContactBtn');
        
        if (!container || !section) return;
        
        // Hide other sections
        const whatsappSection = document.getElementById('whatsappNumbersSection');
        const phoneSection = document.getElementById('phoneNumbersSection');
        if (whatsappSection) whatsappSection.style.display = 'none';
        if (phoneSection) phoneSection.style.display = 'none';
        
        // Show email section
        section.style.display = 'block';
        
        // Email needs message form (continue to step 3)
        if (continueBtn) {
            continueBtn.style.display = 'block';
            continueBtn.innerHTML = '<i class="fas fa-envelope"></i> Continue to Message';
        }
        if (directBtn) directBtn.style.display = 'none';
        
        container.innerHTML = this.supplierEmails.map(email => `
            <div class="contact-number-card" data-email="${email.email_address}" onclick="ContactPage.selectContactNumber('${email.id}', '${email.email_address}', '${email.label || 'Email'}')">
                <div class="contact-radio">
                    <input type="radio" name="contactEmail" value="${email.email_address}" id="email_${email.id}" ${email.is_primary ? 'checked' : ''}>
                </div>
                <div class="contact-details">
                    <div class="contact-label">
                        <i class="fas fa-envelope"></i> ${this.escapeHtml(email.label || 'Email Address')}
                        ${email.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                    </div>
                    <div class="contact-number">${email.email_address}</div>
                    ${email.department ? `<div class="contact-dept">${this.escapeHtml(email.department)}</div>` : ''}
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        document.querySelectorAll('.contact-number-card').forEach(card => {
            card.addEventListener('click', () => {
                const radio = card.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    this.selectedContactNumber = radio.value;
                    document.querySelectorAll('.contact-number-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                }
            });
        });
    },
    
    selectContactNumber(id, value, label) {
        console.log('Selected contact:', { id, value, label });
        this.selectedContactNumber = value;
        this.selectedContactLabel = label;
    },
    
    directContact() {
        if (this.selectedContactMethod === 'phone' && this.selectedContactNumber) {
            // Track the contact attempt
            this.trackContact('phone');
            
            // Open phone dialer
            window.location.href = `tel:${this.selectedContactNumber}`;
            this.showSuccessModal('Phone Call', `Calling ${this.selectedContactNumber}...`);
        }
    },
    
    async goToStep(step) {
        console.log('Going to step:', step);
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
        const stepNames = ['Contact Method', 'Contact Details', 'Message'];
        const stepIndicator = document.getElementById('stepIndicator');
        if (stepIndicator) {
            stepIndicator.textContent = `Step ${step} of 3: ${stepNames[step - 1]}`;
        }
        
        // If going to step 3 and no contact number selected for email/whatsapp, show error
        if (step === 3 && (this.selectedContactMethod === 'email' || this.selectedContactMethod === 'whatsapp') && !this.selectedContactNumber) {
            this.showToast('Please select a contact method first', 'error');
            this.goToStep(2);
            return;
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    
    async submitContact() {
        const name = document.getElementById('buyerName').value.trim();
        const email = document.getElementById('buyerEmail').value.trim();
        const phone = document.getElementById('buyerPhone').value.trim();
        const message = document.getElementById('buyerMessage').value.trim();
        
        if (!name || !email || !message) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        this.showLoading(true, 'Sending message...');
        
        try {
            if (this.selectedContactMethod === 'email') {
                await this.sendEmail(name, email, phone, message);
            } else if (this.selectedContactMethod === 'whatsapp') {
                await this.sendWhatsApp(name, email, phone, message);
            } else if (this.selectedContactMethod === 'message') {
                await this.sendInAppMessage(name, email, phone, message);
            }
            
            // Track the contact
            await this.trackContact(this.selectedContactMethod);
            
            this.showLoading(false);
            this.showSuccessModal('Message Sent!', 'Your inquiry has been sent successfully.');
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.showLoading(false);
            this.showToast('Failed to send message. Please try again.', 'error');
        }
    },
    
    async sendWhatsApp(name, email, phone, message) {
        const product = this.productData;
        const price = product.wholesale_price || product.price || 0;
        
        const whatsappMessage = `
*New Product Inquiry*

*From:* ${name}
*Email:* ${email}
${phone ? `*Phone:* ${phone}` : ''}

*Product:* ${product.title}
*Quantity:* ${this.quantity} unit(s)
${this.variant && this.variant !== 'Default' ? `*Variant:* ${this.variant}` : ''}
*Price:* UGX ${this.formatNumber(price)} per unit
*Total:* UGX ${this.formatNumber(price * this.quantity)}

*Message:*
${message}
        `.trim();
        
        // Save inquiry to database
        await this.saveInquiry(name, email, phone, message);
        
        // Open WhatsApp
        const encodedMessage = encodeURIComponent(whatsappMessage);
        const cleanNumber = this.selectedContactNumber.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
        
        window.open(whatsappUrl, '_blank');
    },
    
    async sendEmail(name, email, phone, message) {
        const subject = `Inquiry about ${this.productData.title}`;
        const body = `
Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
Product: ${this.productData.title}
Quantity: ${this.quantity} unit(s)
${this.variant && this.variant !== 'Default' ? `Variant: ${this.variant}` : ''}

Message:
${message}
        `.trim();
        
        // Save inquiry to database
        await this.saveInquiry(name, email, phone, message);
        
        // Open email client
        const mailtoUrl = `mailto:${this.selectedContactNumber}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
    },
    
    async sendInAppMessage(name, email, phone, message) {
        if (!this.currentUser) {
            // Save inquiry to session storage and redirect to login
            const inquiryData = {
                productId: this.productId,
                productTitle: this.productData.title,
                quantity: this.quantity,
                variant: this.variant,
                supplierId: this.supplierData.id,
                name: name,
                email: email,
                phone: phone,
                message: message
            };
            sessionStorage.setItem('pendingInquiry', JSON.stringify(inquiryData));
            window.location.href = `login.html?redirect=supplier-contact.html?product_id=${this.productId}`;
            return;
        }
        
        // Save inquiry to database
        await this.saveInquiry(name, email, phone, message);
        
        // Create conversation in chat system
        const title = `Inquiry: ${this.productData.title.substring(0, 50)}`;
        
        // Check if conversation exists
        const { data: existingConv } = await chatSb
            .from('conversations')
            .select('id')
            .eq('title', title)
            .maybeSingle();
        
        let conversationId;
        
        if (existingConv) {
            conversationId = existingConv.id;
        } else {
            const { data: newConv, error: convError } = await chatSb
                .from('conversations')
                .insert({
                    title: title,
                    created_by: this.currentUser.id,
                    marketplace_user_id: this.currentUser.id,
                    listing_id: this.productId
                })
                .select()
                .single();
            
            if (convError) throw convError;
            conversationId = newConv.id;
            
            // Add participants
            await chatSb.from('conversation_participants').insert([
                { conversation_id: conversationId, user_id: this.currentUser.id, user_type: 'buyer' },
                { conversation_id: conversationId, user_id: this.supplierData.id, user_type: 'supplier' }
            ]);
        }
        
        // Format message with inquiry details
        const fullMessage = `
**Product Inquiry**

Product: ${this.productData.title}
Quantity: ${this.quantity} unit(s)
${this.variant && this.variant !== 'Default' ? `Variant: ${this.variant}` : ''}

**Buyer Details:**
Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}

**Message:**
${message}
        `.trim();
        
        // Send message
        await chatSb.from('messages').insert({
            conversation_id: conversationId,
            sender_id: this.currentUser.id,
            sender_type: 'buyer',
            content: fullMessage,
            message_type: 'text'
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
        
        // Redirect to chat room
        setTimeout(() => {
            window.location.href = `chat-room.html?conversation=${conversationId}`;
        }, 2000);
    },
    
    async saveInquiry(name, email, phone, message) {
        try {
            await sb.from('inquiries').insert({
                product_id: this.productId,
                buyer_name: name,
                buyer_email: email,
                buyer_phone: phone,
                buyer_message: message,
                quantity: this.quantity,
                variant: this.variant,
                status: 'new',
                created_at: new Date().toISOString()
            });
            console.log('✅ Inquiry saved to database');
        } catch (error) {
            console.error('Error saving inquiry:', error);
        }
    },
    
    async trackContact(method) {
        try {
            await sb.from('ad_engagement').insert({
                ad_id: this.productId,
                user_id: this.currentUser?.id || null,
                action: method === 'whatsapp' ? 'whatsapp' : method === 'phone' ? 'call' : 'inquiry',
                metadata: {
                    method: method,
                    quantity: this.quantity,
                    variant: this.variant
                },
                performed_at: new Date().toISOString()
            });
            console.log('✅ Contact tracked:', method);
        } catch (error) {
            console.error('Error tracking contact:', error);
        }
    },
    
    showLoading(show, message = 'Processing...') {
        let overlay = document.getElementById('loadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-spinner"></div>
                <p id="loadingMessage">${message}</p>
            `;
            document.body.appendChild(overlay);
        }
        
        const msgEl = document.getElementById('loadingMessage');
        if (msgEl) msgEl.textContent = message;
        
        if (show) {
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    },
    
    showSuccessModal(title, message) {
        const titleEl = document.getElementById('successTitle');
        const messageEl = document.getElementById('successMessage');
        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.add('show');
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
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    showError(message) {
        const loadingState = document.getElementById('loadingState');
        const errorState = document.getElementById('errorState');
        const errorMessage = document.getElementById('errorMessage');
        
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'block';
        if (errorMessage) errorMessage.textContent = message;
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
    }
};

// Global functions
window.ContactPage = ContactPage;
window.goToStep = (step) => ContactPage.goToStep(step);
window.selectContactNumber = (id, value, label) => ContactPage.selectContactNumber(id, value, label);
window.directContact = () => ContactPage.directContact();
window.submitContact = () => ContactPage.submitContact();
window.closeSuccessModal = () => {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
    window.location.href = 'index.html';
};
window.redirectToHome = () => window.location.href = 'index.html';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    ContactPage.init();
});
