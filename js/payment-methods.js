// ============================================
// PAYMENT METHODS MANAGEMENT - COMPLETE
// ============================================

console.log('🚀 Payment Methods page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let PaymentMethodsManager = {
    currentUser: null,
    profile: null,
    paymentMethods: [],
    transactions: [],
    currentPaymentMethod: null,
    currentPaymentType: 'mobile_money',
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Payment Methods page initializing...');
        
        try {
            await this.checkAuth();
            await this.loadProfile();
            await this.loadPaymentMethods();
            await this.loadTransactions();
            await this.loadSettings();
            
            this.renderPaymentMethods();
            this.renderTransactions();
            this.setupEventListeners();
            
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('paymentContent').style.display = 'block';
            
            console.log('✅ Payment Methods page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading payment methods', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=payment-methods.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadProfile() {
        try {
            const { data, error } = await sb
                .from('profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            
            this.profile = data;
            console.log('✅ Profile loaded');
            
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    },
    
    // ============================================
    // PAYMENT METHODS
    // ============================================
    async loadPaymentMethods() {
        try {
            // For demo purposes, we'll use localStorage
            // In production, you'd have a payment_methods table in Supabase
            const savedMethods = localStorage.getItem(`payment_methods_${this.currentUser.id}`);
            
            if (savedMethods) {
                this.paymentMethods = JSON.parse(savedMethods);
            } else {
                // Sample data for demo
                this.paymentMethods = [
                    {
                        id: '1',
                        type: 'mobile_money',
                        network: 'mtn',
                        number: '0772123456',
                        accountName: 'John Doe',
                        isDefault: true
                    },
                    {
                        id: '2',
                        type: 'bank',
                        bankName: 'stanbic',
                        accountNumber: '1234567890',
                        accountName: 'John Doe Trading',
                        branch: 'Kampala Road',
                        isDefault: false
                    }
                ];
                
                // Save to localStorage
                localStorage.setItem(`payment_methods_${this.currentUser.id}`, JSON.stringify(this.paymentMethods));
            }
            
            console.log(`✅ Loaded ${this.paymentMethods.length} payment methods`);
            
        } catch (error) {
            console.error('Error loading payment methods:', error);
            this.paymentMethods = [];
        }
    },
    
    renderPaymentMethods() {
        const container = document.getElementById('paymentMethodsList');
        const defaultSelect = document.getElementById('defaultPaymentMethod');
        
        if (this.paymentMethods.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-credit-card"></i>
                    <p>No payment methods saved yet</p>
                    <button class="add-btn" onclick="PaymentMethodsManager.openAddPaymentModal()">
                        <i class="fas fa-plus"></i> Add Payment Method
                    </button>
                </div>
            `;
            
            defaultSelect.innerHTML = '<option value="">No payment methods</option>';
            return;
        }
        
        container.innerHTML = this.paymentMethods.map(method => this.renderPaymentCard(method)).join('');
        
        // Populate default method select
        let options = '<option value="">Select default method</option>';
        this.paymentMethods.forEach(method => {
            const name = this.getPaymentMethodName(method);
            options += `<option value="${method.id}" ${method.isDefault ? 'selected' : ''}>${name}</option>`;
        });
        defaultSelect.innerHTML = options;
    },
    
    renderPaymentCard(method) {
        const icon = this.getPaymentIcon(method.type);
        const title = this.getPaymentTitle(method);
        const details = this.getPaymentDetails(method);
        
        return `
            <div class="payment-card ${method.isDefault ? 'default' : ''}" data-id="${method.id}">
                <div class="payment-icon ${method.type}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="payment-details">
                    <div class="payment-title">${title}</div>
                    <div class="payment-info">
                        <span><i class="fas fa-user"></i> ${this.escapeHtml(method.accountName || 'Not set')}</span>
                        <span><i class="fas fa-hashtag"></i> ${details}</span>
                    </div>
                </div>
                <div class="payment-actions">
                    <button class="action-btn" onclick="PaymentMethodsManager.editPaymentMethod('${method.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="PaymentMethodsManager.deletePaymentMethod('${method.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },
    
    getPaymentIcon(type) {
        const icons = {
            'mobile_money': 'fa-mobile-alt',
            'bank': 'fa-university',
            'card': 'fa-credit-card'
        };
        return icons[type] || 'fa-money-bill';
    },
    
    getPaymentTitle(method) {
        switch(method.type) {
            case 'mobile_money':
                return `${method.network?.toUpperCase()} - ${method.number}`;
            case 'bank':
                return this.formatBankName(method.bankName);
            case 'card':
                return `Card ending in ${method.cardNumber?.slice(-4)}`;
            default:
                return 'Payment Method';
        }
    },
    
    getPaymentDetails(method) {
        switch(method.type) {
            case 'mobile_money':
                return method.number;
            case 'bank':
                return `****${method.accountNumber?.slice(-4)}`;
            case 'card':
                return `**** **** **** ${method.cardNumber?.slice(-4)}`;
            default:
                return '';
        }
    },
    
    getPaymentMethodName(method) {
        switch(method.type) {
            case 'mobile_money':
                return `${method.network?.toUpperCase()} - ${method.number}`;
            case 'bank':
                return `${this.formatBankName(method.bankName)} - ${method.accountNumber}`;
            case 'card':
                return `Card ending in ${method.cardNumber?.slice(-4)}`;
            default:
                return 'Payment Method';
        }
    },
    
    formatBankName(bankId) {
        const banks = {
            'stanbic': 'Stanbic Bank',
            'centenary': 'Centenary Bank',
            'dfcu': 'dfcu Bank',
            'barclays': 'Barclays Bank',
            'absa': 'ABSA Bank',
            'equity': 'Equity Bank',
            'kcb': 'KCB Bank'
        };
        return banks[bankId] || bankId;
    },
    
    // ============================================
    // ADD PAYMENT METHOD
    // ============================================
    openAddPaymentModal() {
        this.currentPaymentMethod = null;
        this.currentPaymentType = 'mobile_money';
        
        // Reset forms
        document.getElementById('mobileMoneyForm').reset();
        document.getElementById('bankForm').reset();
        document.getElementById('cardForm').reset();
        
        // Set active tab
        document.querySelectorAll('.payment-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.type === 'mobile_money');
        });
        
        document.querySelectorAll('.payment-form').forEach(form => {
            form.classList.toggle('active', form.id === 'mobileMoneyForm');
        });
        
        document.getElementById('addPaymentModal').classList.add('show');
    },
    
    switchPaymentTab(type) {
        this.currentPaymentType = type;
        
        document.querySelectorAll('.payment-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.type === type);
        });
        
        document.querySelectorAll('.payment-form').forEach(form => {
            form.classList.toggle('active', form.id === `${type}Form`);
        });
    },
    
    async savePaymentMethod() {
        try {
            let newMethod = {
                id: Date.now().toString(),
                type: this.currentPaymentType,
                isDefault: false
            };
            
            // Validate and collect data based on type
            switch(this.currentPaymentType) {
                case 'mobile_money':
                    const network = document.getElementById('mobileNetwork').value;
                    const number = document.getElementById('mobileNumber').value;
                    const accountName = document.getElementById('mobileAccountName').value;
                    const setDefault = document.getElementById('setDefaultMobile').checked;
                    
                    if (!network || !number) {
                        this.showToast('Please fill in all required fields', 'error');
                        return;
                    }
                    
                    newMethod = {
                        ...newMethod,
                        network,
                        number,
                        accountName: accountName || 'Unknown',
                        isDefault: setDefault
                    };
                    break;
                    
                case 'bank':
                    const bankName = document.getElementById('bankName').value;
                    const accountNumber = document.getElementById('accountNumber').value;
                    const bankAccountName = document.getElementById('accountName').value;
                    const branch = document.getElementById('bankBranch').value;
                    const setDefaultBank = document.getElementById('setDefaultBank').checked;
                    
                    if (!bankName || !accountNumber) {
                        this.showToast('Please fill in all required fields', 'error');
                        return;
                    }
                    
                    newMethod = {
                        ...newMethod,
                        bankName,
                        accountNumber,
                        accountName: bankAccountName || 'Unknown',
                        branch: branch || 'Main Branch',
                        isDefault: setDefaultBank
                    };
                    break;
                    
                case 'card':
                    const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
                    const expiryDate = document.getElementById('expiryDate').value;
                    const cvv = document.getElementById('cvv').value;
                    const cardholderName = document.getElementById('cardholderName').value;
                    const setDefaultCard = document.getElementById('setDefaultCard').checked;
                    
                    if (!cardNumber || !expiryDate || !cvv) {
                        this.showToast('Please fill in all required fields', 'error');
                        return;
                    }
                    
                    if (cardNumber.length < 16) {
                        this.showToast('Invalid card number', 'error');
                        return;
                    }
                    
                    if (!this.validateExpiry(expiryDate)) {
                        this.showToast('Invalid expiry date', 'error');
                        return;
                    }
                    
                    newMethod = {
                        ...newMethod,
                        cardNumber,
                        expiryDate,
                        lastFour: cardNumber.slice(-4),
                        cardholderName: cardholderName || 'Unknown',
                        isDefault: setDefaultCard
                    };
                    break;
            }
            
            // If setting as default, remove default from others
            if (newMethod.isDefault) {
                this.paymentMethods = this.paymentMethods.map(m => ({
                    ...m,
                    isDefault: false
                }));
            }
            
            // Add new method
            this.paymentMethods.push(newMethod);
            
            // Save to localStorage
            localStorage.setItem(`payment_methods_${this.currentUser.id}`, JSON.stringify(this.paymentMethods));
            
            this.closeAddPaymentModal();
            this.renderPaymentMethods();
            this.showToast('Payment method added successfully', 'success');
            
        } catch (error) {
            console.error('Error saving payment method:', error);
            this.showToast('Error saving payment method', 'error');
        }
    },
    
    validateExpiry(expiry) {
        const [month, year] = expiry.split('/');
        if (!month || !year) return false;
        
        const now = new Date();
        const currentYear = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;
        
        const expMonth = parseInt(month);
        const expYear = parseInt(year);
        
        if (expYear < currentYear) return false;
        if (expYear === currentYear && expMonth < currentMonth) return false;
        
        return true;
    },
    
    // ============================================
    // EDIT PAYMENT METHOD
    // ============================================
    editPaymentMethod(id) {
        const method = this.paymentMethods.find(m => m.id === id);
        if (!method) return;
        
        this.currentPaymentMethod = method;
        
        document.getElementById('editPaymentId').value = method.id;
        document.getElementById('editPaymentType').value = method.type;
        document.getElementById('editAccountName').value = method.accountName || '';
        document.getElementById('editSetDefault').checked = method.isDefault || false;
        
        document.getElementById('editPaymentModal').classList.add('show');
    },
    
    async updatePaymentMethod() {
        const id = document.getElementById('editPaymentId').value;
        const accountName = document.getElementById('editAccountName').value;
        const setDefault = document.getElementById('editSetDefault').checked;
        
        const index = this.paymentMethods.findIndex(m => m.id === id);
        if (index === -1) return;
        
        // If setting as default, remove default from others
        if (setDefault) {
            this.paymentMethods = this.paymentMethods.map(m => ({
                ...m,
                isDefault: false
            }));
        }
        
        // Update method
        this.paymentMethods[index] = {
            ...this.paymentMethods[index],
            accountName: accountName || this.paymentMethods[index].accountName,
            isDefault: setDefault
        };
        
        // Save to localStorage
        localStorage.setItem(`payment_methods_${this.currentUser.id}`, JSON.stringify(this.paymentMethods));
        
        this.closeEditPaymentModal();
        this.renderPaymentMethods();
        this.showToast('Payment method updated', 'success');
    },
    
    // ============================================
    // DELETE PAYMENT METHOD
    // ============================================
    deletePaymentMethod(id) {
        this.currentPaymentMethod = this.paymentMethods.find(m => m.id === id);
        document.getElementById('deleteModal').classList.add('show');
    },
    
    async confirmDelete() {
        if (!this.currentPaymentMethod) return;
        
        this.paymentMethods = this.paymentMethods.filter(m => m.id !== this.currentPaymentMethod.id);
        
        // Save to localStorage
        localStorage.setItem(`payment_methods_${this.currentUser.id}`, JSON.stringify(this.paymentMethods));
        
        this.closeDeleteModal();
        this.renderPaymentMethods();
        this.showToast('Payment method removed', 'success');
    },
    
    // ============================================
    // DEFAULT PAYMENT METHOD
    // ============================================
    async updateDefaultPaymentMethod() {
        const defaultId = document.getElementById('defaultPaymentMethod').value;
        
        this.paymentMethods = this.paymentMethods.map(m => ({
            ...m,
            isDefault: m.id === defaultId
        }));
        
        // Save to localStorage
        localStorage.setItem(`payment_methods_${this.currentUser.id}`, JSON.stringify(this.paymentMethods));
        
        this.renderPaymentMethods();
        this.showToast('Default payment method updated', 'success');
    },
    
    // ============================================
    // TRANSACTIONS
    // ============================================
    async loadTransactions() {
        try {
            // For demo purposes, we'll use mock data
            // In production, you'd load from a transactions table
            this.transactions = [
                {
                    id: 'tx1',
                    orderNumber: 'PO-2024-001',
                    amount: 2500000,
                    status: 'completed',
                    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    type: 'payment',
                    method: 'Mobile Money'
                },
                {
                    id: 'tx2',
                    orderNumber: 'PO-2024-002',
                    amount: 1750000,
                    status: 'pending',
                    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    type: 'payment',
                    method: 'Bank Transfer'
                },
                {
                    id: 'tx3',
                    orderNumber: 'PO-2024-003',
                    amount: 3200000,
                    status: 'completed',
                    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    type: 'payment',
                    method: 'Credit Card'
                },
                {
                    id: 'tx4',
                    orderNumber: 'REF-2024-001',
                    amount: 500000,
                    status: 'completed',
                    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    type: 'refund',
                    method: 'Mobile Money'
                }
            ];
            
            console.log(`✅ Loaded ${this.transactions.length} transactions`);
            
        } catch (error) {
            console.error('Error loading transactions:', error);
            this.transactions = [];
        }
    },
    
    renderTransactions() {
        const container = document.getElementById('transactionsList');
        
        if (this.transactions.length === 0) {
            container.innerHTML = '<p class="text-muted">No recent transactions</p>';
            return;
        }
        
        container.innerHTML = this.transactions.map(tx => this.renderTransactionItem(tx)).join('');
    },
    
    renderTransactionItem(transaction) {
        const date = new Date(transaction.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        
        const icon = transaction.type === 'refund' ? 'fa-undo-alt' : 'fa-arrow-right';
        const amountClass = transaction.type === 'refund' ? 'positive' : 'negative';
        const amountPrefix = transaction.type === 'refund' ? '+' : '-';
        
        return `
            <div class="transaction-item">
                <div class="transaction-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="transaction-details">
                    <div class="transaction-title">${transaction.orderNumber}</div>
                    <div class="transaction-meta">
                        <span>${date}</span>
                        <span>${transaction.method}</span>
                        <span class="transaction-status ${transaction.status}">${transaction.status}</span>
                    </div>
                </div>
                <div class="transaction-amount ${amountClass}">
                    ${amountPrefix} UGX ${this.formatNumber(transaction.amount)}
                </div>
            </div>
        `;
    },
    
    // ============================================
    // SETTINGS
    // ============================================
    async loadSettings() {
        try {
            // Load settings from localStorage
            const settings = localStorage.getItem(`payment_settings_${this.currentUser.id}`);
            
            if (settings) {
                const parsed = JSON.parse(settings);
                document.getElementById('autoPay').checked = parsed.autoPay || false;
                document.getElementById('paymentNotifications').checked = parsed.paymentNotifications !== false;
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    },
    
    async saveSettings() {
        try {
            const settings = {
                autoPay: document.getElementById('autoPay').checked,
                paymentNotifications: document.getElementById('paymentNotifications').checked
            };
            
            localStorage.setItem(`payment_settings_${this.currentUser.id}`, JSON.stringify(settings));
            this.showToast('Settings saved', 'success');
            
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('Error saving settings', 'error');
        }
    },
    
    // ============================================
    // CARD INPUT FORMATTING
    // ============================================
    formatCardNumber(input) {
        let value = input.value.replace(/\D/g, '');
        let formatted = '';
        
        for (let i = 0; i < value.length; i++) {
            if (i > 0 && i % 4 === 0) {
                formatted += ' ';
            }
            formatted += value[i];
        }
        
        input.value = formatted;
    },
    
    formatExpiry(input) {
        let value = input.value.replace(/\D/g, '');
        
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        
        input.value = value;
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeAddPaymentModal() {
        document.getElementById('addPaymentModal').classList.remove('show');
    },
    
    closeEditPaymentModal() {
        document.getElementById('editPaymentModal').classList.remove('show');
    },
    
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        this.currentPaymentMethod = null;
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
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
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Add payment button
        document.getElementById('addPaymentBtn').addEventListener('click', () => {
            this.openAddPaymentModal();
        });
        
        // Payment tabs
        document.querySelectorAll('.payment-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchPaymentTab(e.target.dataset.type);
            });
        });
        
        // Save payment button
        document.getElementById('savePaymentBtn').addEventListener('click', () => {
            this.savePaymentMethod();
        });
        
        // Update payment button
        document.getElementById('updatePaymentBtn').addEventListener('click', () => {
            this.updatePaymentMethod();
        });
        
        // Confirm delete button
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.confirmDelete();
        });
        
        // Default method change
        document.getElementById('defaultPaymentMethod').addEventListener('change', () => {
            this.updateDefaultPaymentMethod();
        });
        
        // Settings changes
        document.getElementById('autoPay').addEventListener('change', () => {
            this.saveSettings();
        });
        
        document.getElementById('paymentNotifications').addEventListener('change', () => {
            this.saveSettings();
        });
        
        // Card number formatting
        document.getElementById('cardNumber').addEventListener('input', (e) => {
            this.formatCardNumber(e.target);
        });
        
        // Expiry date formatting
        document.getElementById('expiryDate').addEventListener('input', (e) => {
            this.formatExpiry(e.target);
        });
        
        // CVV only numbers
        document.getElementById('cvv').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
        });
        
        // Mobile number formatting
        document.getElementById('mobileNumber').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 12);
        });
        
        // Account number formatting
        document.getElementById('accountNumber').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            console.log('Menu clicked');
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAddPaymentModal();
                    this.closeEditPaymentModal();
                    this.closeDeleteModal();
                    this.closeSuccessModal();
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    PaymentMethodsManager.init();
});

// Global functions
window.PaymentMethodsManager = PaymentMethodsManager;
window.closeAddPaymentModal = () => PaymentMethodsManager.closeAddPaymentModal();
window.closeEditPaymentModal = () => PaymentMethodsManager.closeEditPaymentModal();
window.closeDeleteModal = () => PaymentMethodsManager.closeDeleteModal();
window.closeSuccessModal = () => PaymentMethodsManager.closeSuccessModal();