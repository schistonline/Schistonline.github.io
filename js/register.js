// ============================================
// REGISTER PAGE - SOURCEX B2B
// ============================================

console.log('🚀 Register page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const RegisterPage = {
    currentStep: 1,
    accountType: 'buyer',
    regions: [],
    districts: [],
    counties: [],
    
    // Form data
    formData: {
        fullName: '',
        email: '',
        phone: '',
        altPhone: '',
        countryCode: '+256',
        accountType: 'buyer',
        businessName: '',
        businessReg: '',
        tinNumber: '',
        businessType: '',
        yearEstablished: '',
        regionId: '',
        districtId: '',
        countyId: '',
        businessAddress: '',
        serviceAreas: [],
        deliveryOptions: [],
        minOrderValue: '',
        password: '',
        confirmPassword: '',
        acceptTerms: false
    },

    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Register page initializing...');
        
        try {
            await this.loadRegions();
            this.setupEventListeners();
            this.setupPasswordStrength();
            this.setupPhonePrefixes();
            
            console.log('✅ Register page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading registration form', 'error');
        }
    },

    // ============================================
    // LOAD LOCATION DATA
    // ============================================
    async loadRegions() {
        try {
            const { data, error } = await sb
                .from('regions')
                .select('id, name')
                .eq('is_active', true)
                .order('name');
                
            if (error) throw error;
            
            this.regions = data || [];
            this.populateRegionSelect();
            
        } catch (error) {
            console.error('Error loading regions:', error);
            // Fallback regions
            this.regions = [
                { id: 1, name: 'Central' },
                { id: 2, name: 'Eastern' },
                { id: 3, name: 'Northern' },
                { id: 4, name: 'Western' }
            ];
            this.populateRegionSelect();
        }
    },

    async loadDistricts(regionId) {
        try {
            const { data, error } = await sb
                .from('districts')
                .select('id, name')
                .eq('region_id', regionId)
                .eq('is_active', true)
                .order('name');
                
            if (error) throw error;
            
            this.districts = data || [];
            this.populateDistrictSelect();
            
        } catch (error) {
            console.error('Error loading districts:', error);
            this.districts = [];
            this.populateDistrictSelect();
        }
    },

    async loadCounties(districtId) {
        try {
            const { data, error } = await sb
                .from('counties')
                .select('id, name')
                .eq('district_id', districtId)
                .eq('is_active', true)
                .order('name');
                
            if (error) throw error;
            
            this.counties = data || [];
            this.populateCountySelect();
            
        } catch (error) {
            console.error('Error loading counties:', error);
            this.counties = [];
            this.populateCountySelect();
        }
    },

    populateRegionSelect() {
        const select = document.getElementById('region');
        if (!select) return;
        
        select.innerHTML = '<option value="">Select region</option>' +
            this.regions.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
    },

    populateDistrictSelect() {
        const select = document.getElementById('district');
        if (!select) return;
        
        if (this.districts.length === 0) {
            select.innerHTML = '<option value="">No districts available</option>';
            select.disabled = true;
            return;
        }
        
        select.innerHTML = '<option value="">Select district</option>' +
            this.districts.map(d => `<option value="${d.id}">${this.escapeHtml(d.name)}</option>`).join('');
        select.disabled = false;
    },

    populateCountySelect() {
        const select = document.getElementById('county');
        if (!select) return;
        
        if (this.counties.length === 0) {
            select.innerHTML = '<option value="">No counties available</option>';
            select.disabled = true;
            return;
        }
        
        select.innerHTML = '<option value="">Select county/municipality</option>' +
            this.counties.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
        select.disabled = false;
    },

    // ============================================
    // STEP NAVIGATION
    // ============================================
    goToStep(step) {
        this.currentStep = step;
        
        // Update step visibility
        document.querySelectorAll('.step').forEach((el, index) => {
            const stepNum = index + 1;
            el.classList.toggle('active', stepNum === step);
        });
        
        // Update progress indicators
        document.querySelectorAll('.progress-step').forEach((el, index) => {
            const stepNum = index + 1;
            el.classList.remove('active', 'completed');
            
            if (stepNum < step) {
                el.classList.add('completed');
            } else if (stepNum === step) {
                el.classList.add('active');
            }
        });
        
        // Update progress fill
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            const width = ((step - 1) / 2) * 100;
            progressFill.style.width = `${width}%`;
        }
        
        // Update business fields visibility based on account type
        if (step === 2) {
            this.toggleBusinessFields();
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    toggleBusinessFields() {
        const businessFields = document.querySelector('.business-fields');
        const buyerNote = document.getElementById('buyerNote');
        
        if (this.accountType === 'supplier') {
            if (businessFields) businessFields.style.display = 'block';
            if (buyerNote) buyerNote.style.display = 'none';
            document.getElementById('businessNameLabel').classList.add('required');
        } else {
            if (businessFields) businessFields.style.display = 'none';
            if (buyerNote) buyerNote.style.display = 'flex';
            document.getElementById('businessNameLabel').classList.remove('required');
        }
    },

    // ============================================
    // VALIDATION
    // ============================================
    validateStep1() {
        const fullName = document.getElementById('fullName').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        
        // Clear previous errors
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        
        if (!fullName) {
            this.showFieldError('fullName', 'Full name is required');
            return false;
        }
        
        if (!email) {
            this.showFieldError('email', 'Email is required');
            return false;
        }
        
        if (!this.validateEmail(email)) {
            this.showFieldError('email', 'Enter a valid email address');
            return false;
        }
        
        if (!phone) {
            this.showFieldError('phone', 'Phone number is required');
            return false;
        }
        
        if (!this.validatePhone(phone)) {
            this.showFieldError('phone', 'Enter a valid phone number (7-12 digits)');
            return false;
        }
        
        // Save step 1 data
        this.formData.fullName = fullName;
        this.formData.email = email;
        this.formData.phone = phone;
        this.formData.altPhone = document.getElementById('altPhone').value.trim();
        this.formData.countryCode = document.getElementById('countryCode').value;
        this.formData.accountType = this.accountType;
        
        return true;
    },

    validateStep2() {
        if (this.accountType === 'buyer') {
            // Buyers can skip business info
            return true;
        }
        
        const businessName = document.getElementById('businessName').value.trim();
        const businessType = document.getElementById('businessType').value;
        const region = document.getElementById('region').value;
        const district = document.getElementById('district').value;
        const businessAddress = document.getElementById('businessAddress').value.trim();
        
        if (!businessName) {
            this.showFieldError('businessName', 'Business name is required');
            return false;
        }
        
        if (!businessType) {
            this.showFieldError('businessType', 'Business type is required');
            return false;
        }
        
        if (!region) {
            this.showFieldError('region', 'Please select a region');
            return false;
        }
        
        if (!district) {
            this.showFieldError('district', 'Please select a district');
            return false;
        }
        
        if (!businessAddress) {
            this.showFieldError('businessAddress', 'Business address is required');
            return false;
        }
        
        // Save step 2 data
        this.formData.businessName = businessName;
        this.formData.businessReg = document.getElementById('businessReg').value.trim();
        this.formData.tinNumber = document.getElementById('tinNumber').value.trim();
        this.formData.businessType = businessType;
        this.formData.yearEstablished = document.getElementById('yearEstablished').value;
        this.formData.regionId = region;
        this.formData.districtId = district;
        this.formData.countyId = document.getElementById('county').value;
        this.formData.businessAddress = businessAddress;
        this.formData.serviceAreas = Array.from(document.getElementById('serviceAreas').selectedOptions).map(opt => opt.value);
        this.formData.deliveryOptions = Array.from(document.getElementById('deliveryOptions').selectedOptions).map(opt => opt.value);
        this.formData.minOrderValue = document.getElementById('minOrderValue').value;
        
        return true;
    },

    validateStep3() {
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const acceptTerms = document.getElementById('acceptTerms').checked;
        
        if (!password) {
            this.showFieldError('password', 'Password is required');
            return false;
        }
        
        if (password.length < 8) {
            this.showFieldError('password', 'Password must be at least 8 characters');
            return false;
        }
        
        const strength = this.checkPasswordStrength(password);
        if (strength.score < 3) {
            this.showFieldError('password', 'Password is too weak. Include uppercase, numbers, and special characters');
            return false;
        }
        
        if (password !== confirmPassword) {
            this.showFieldError('confirmPassword', 'Passwords do not match');
            return false;
        }
        
        if (!acceptTerms) {
            this.showToast('Please accept the terms and conditions', 'error');
            return false;
        }
        
        this.formData.password = password;
        this.formData.acceptTerms = acceptTerms;
        
        return true;
    },

    // ============================================
    // REGISTRATION SUBMIT
    // ============================================
    async registerUser() {
        if (!this.validateStep1() || !this.validateStep2() || !this.validateStep3()) {
            return;
        }
        
        this.showLoading(true, 'Creating your account...');
        
        try {
            // 1. Create auth user
            const { data: authData, error: authError } = await sb.auth.signUp({
                email: this.formData.email,
                password: this.formData.password,
                options: {
                    data: {
                        full_name: this.formData.fullName,
                        phone: this.formData.countryCode + this.formData.phone,
                        account_type: this.formData.accountType
                    }
                }
            });
            
            if (authError) throw authError;
            
            if (!authData.user) {
                throw new Error('User creation failed');
            }
            
            // 2. Create profile
            const profileData = {
                id: authData.user.id,
                full_name: this.formData.fullName,
                email: this.formData.email,
                phone: this.formData.countryCode + this.formData.phone,
                alt_phone: this.formData.altPhone ? this.formData.countryCode + this.formData.altPhone : null,
                country_code: this.formData.countryCode,
                is_supplier: this.formData.accountType === 'supplier',
                is_buyer: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { error: profileError } = await sb
                .from('profiles')
                .insert(profileData);
            
            if (profileError) throw profileError;
            
            // 3. Create supplier record if applicable
            if (this.formData.accountType === 'supplier') {
                const supplierData = {
                    profile_id: authData.user.id,
                    business_name: this.formData.businessName,
                    business_registration: this.formData.businessReg || null,
                    tax_id: this.formData.tinNumber || null,
                    business_type: this.formData.businessType,
                    year_established: this.formData.yearEstablished ? parseInt(this.formData.yearEstablished) : null,
                    business_phone: this.formData.countryCode + this.formData.phone,
                    business_email: this.formData.email,
                    country_code: this.formData.countryCode,
                    warehouse_location: this.formData.businessAddress,
                    warehouse_district: this.getDistrictName(this.formData.districtId),
                    service_area: this.formData.serviceAreas,
                    delivery_options: this.formData.deliveryOptions,
                    min_order_value: this.formData.minOrderValue ? parseFloat(this.formData.minOrderValue) : null,
                    verification_status: 'pending',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                const { error: supplierError } = await sb
                    .from('suppliers')
                    .insert(supplierData);
                
                if (supplierError) throw supplierError;
            }
            
            // 4. Create notification for admin
            await sb
                .from('notifications')
                .insert({
                    user_id: authData.user.id,
                    type: 'admin_alert',
                    title: 'New User Registration',
                    message: `${this.formData.fullName} (${this.formData.email}) registered as ${this.formData.accountType}`,
                    link: '/admin/users.html'
                });
            
            // 5. Show success modal
            this.showLoading(false);
            this.showSuccessModal();
            
        } catch (error) {
            console.error('Registration error:', error);
            this.showLoading(false);
            
            if (error.message.includes('User already registered')) {
                this.showErrorModal('Email already registered. Please login instead.');
            } else {
                this.showErrorModal(error.message || 'Registration failed. Please try again.');
            }
        }
    },

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    validatePhone(phone) {
        return /^[0-9]{7,12}$/.test(phone.replace(/\D/g, ''));
    },

    checkPasswordStrength(password) {
        let score = 0;
        
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        
        let strength = '';
        let color = '';
        let width = '';
        
        if (score <= 2) {
            strength = 'Weak';
            color = '#EF4444';
            width = '25%';
        } else if (score <= 3) {
            strength = 'Fair';
            color = '#F59E0B';
            width = '50%';
        } else if (score <= 4) {
            strength = 'Good';
            color = '#10B981';
            width = '75%';
        } else {
            strength = 'Strong';
            color = '#6B21E5';
            width = '100%';
        }
        
        return { score, strength, color, width };
    },

    updatePasswordStrength() {
        const password = document.getElementById('password').value;
        const strengthBar = document.querySelector('.strength-bar-fill');
        const strengthText = document.querySelector('.strength-text');
        
        if (!strengthBar || !strengthText) return;
        
        if (!password) {
            strengthBar.style.width = '0%';
            strengthBar.style.backgroundColor = '';
            strengthText.textContent = 'Enter a password';
            return;
        }
        
        const result = this.checkPasswordStrength(password);
        strengthBar.style.width = result.width;
        strengthBar.style.backgroundColor = result.color;
        strengthText.textContent = result.strength;
    },

    checkPasswordMatch() {
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirmPassword').value;
        const matchEl = document.getElementById('passwordMatch');
        
        if (!matchEl) return;
        
        if (!confirm) {
            matchEl.textContent = '';
            matchEl.className = 'password-match';
            return;
        }
        
        if (password === confirm) {
            matchEl.textContent = '✓ Passwords match';
            matchEl.className = 'password-match match';
        } else {
            matchEl.textContent = '✗ Passwords do not match';
            matchEl.className = 'password-match error';
        }
    },

    showFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        field.classList.add('error');
        
        let errorEl = document.getElementById(fieldId + 'Error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.id = fieldId + 'Error';
            field.parentNode.appendChild(errorEl);
        }
        
        errorEl.textContent = message;
        errorEl.style.color = 'var(--danger)';
        errorEl.style.fontSize = '11px';
        errorEl.style.marginTop = '4px';
        
        setTimeout(() => {
            field.classList.remove('error');
            if (errorEl) errorEl.remove();
        }, 3000);
    },

    getDistrictName(districtId) {
        const district = this.districts.find(d => d.id == districtId);
        return district ? district.name : '';
    },

    // ============================================
    // UI HELPERS
    // ============================================
    showLoading(show, message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = document.getElementById('loadingMessage');
        
        if (!overlay || !messageEl) return;
        
        if (show) {
            messageEl.textContent = message;
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    },

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        const colors = {
            success: '#10B981',
            error: '#EF4444',
            info: '#6B21E5',
            warning: '#F59E0B'
        };
        
        toast.style.backgroundColor = colors[type];
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    showSuccessModal() {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.add('show');
    },

    showErrorModal(message) {
        const modal = document.getElementById('errorModal');
        const messageEl = document.getElementById('errorMessage');
        
        if (messageEl) messageEl.textContent = message;
        if (modal) modal.classList.add('show');
    },

    closeErrorModal() {
        const modal = document.getElementById('errorModal');
        if (modal) modal.classList.remove('show');
    },

    closeSuccessModal() {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.remove('show');
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
        document.getElementById('continueToStep2').addEventListener('click', () => {
            if (this.validateStep1()) {
                this.goToStep(2);
            }
        });
        
        document.getElementById('continueToStep3').addEventListener('click', () => {
            if (this.validateStep2()) {
                this.goToStep(3);
            }
        });
        
        document.getElementById('backToStep1').addEventListener('click', () => this.goToStep(1));
        document.getElementById('backToStep2').addEventListener('click', () => this.goToStep(2));
        document.getElementById('submitRegister').addEventListener('click', () => this.registerUser());
        
        // Account type selection
        document.querySelectorAll('.account-option').forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    this.accountType = radio.value;
                    
                    // Update selected styling
                    document.querySelectorAll('.account-option').forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                }
            });
        });
        
        // Region change
        document.getElementById('region').addEventListener('change', (e) => {
            const regionId = e.target.value;
            if (regionId) {
                this.loadDistricts(regionId);
            } else {
                document.getElementById('district').innerHTML = '<option value="">First select a region</option>';
                document.getElementById('district').disabled = true;
                document.getElementById('county').innerHTML = '<option value="">First select a district</option>';
                document.getElementById('county').disabled = true;
            }
        });
        
        // District change
        document.getElementById('district').addEventListener('change', (e) => {
            const districtId = e.target.value;
            if (districtId) {
                this.loadCounties(districtId);
            } else {
                document.getElementById('county').innerHTML = '<option value="">First select a district</option>';
                document.getElementById('county').disabled = true;
            }
        });
        
        // Terms checkbox - enable/disable submit button
        document.getElementById('acceptTerms').addEventListener('change', (e) => {
            const submitBtn = document.getElementById('submitRegister');
            if (submitBtn) {
                submitBtn.disabled = !e.target.checked;
            }
        });
        
        // Phone formatting
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', () => {
                phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 12);
            });
        }
        
        const altPhoneInput = document.getElementById('altPhone');
        if (altPhoneInput) {
            altPhoneInput.addEventListener('input', () => {
                altPhoneInput.value = altPhoneInput.value.replace(/\D/g, '').slice(0, 12);
            });
        }
        
        // Password strength
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                this.updatePasswordStrength();
                this.checkPasswordMatch();
            });
        }
        
        const confirmInput = document.getElementById('confirmPassword');
        if (confirmInput) {
            confirmInput.addEventListener('input', () => this.checkPasswordMatch());
        }
        
        // Toggle password visibility
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                    input.setAttribute('type', type);
                    btn.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
                }
            });
        });
        
        // Close modals on overlay click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });
        
        // Enter key navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const activeStep = document.querySelector('.step.active');
                if (activeStep.id === 'step1') {
                    document.getElementById('continueToStep2').click();
                } else if (activeStep.id === 'step2') {
                    document.getElementById('continueToStep3').click();
                } else if (activeStep.id === 'step3') {
                    const submitBtn = document.getElementById('submitRegister');
                    if (!submitBtn.disabled) {
                        submitBtn.click();
                    }
                }
            }
        });
    },

    setupPasswordStrength() {
        // Create strength bar if not exists
        const strengthEl = document.getElementById('passwordStrength');
        if (strengthEl && !strengthEl.querySelector('.strength-bar-fill')) {
            const bar = strengthEl.querySelector('.strength-bar');
            if (bar) {
                const fill = document.createElement('div');
                fill.className = 'strength-bar-fill';
                bar.appendChild(fill);
            }
        }
    },

    setupPhonePrefixes() {
        const countryCodeSelect = document.getElementById('countryCode');
        const altPhonePrefix = document.getElementById('altPhonePrefix');
        
        if (countryCodeSelect && altPhonePrefix) {
            countryCodeSelect.addEventListener('change', () => {
                altPhonePrefix.textContent = countryCodeSelect.value;
            });
        }
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    RegisterPage.init();
});

// Make functions globally available
window.RegisterPage = RegisterPage;
window.closeErrorModal = () => RegisterPage.closeErrorModal();
window.closeSuccessModal = () => RegisterPage.closeSuccessModal();