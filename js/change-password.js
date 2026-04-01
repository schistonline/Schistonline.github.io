// ============================================
// CHANGE PASSWORD - COMPLETE
// ============================================

console.log('🚀 Change Password page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let PasswordManager = {
    currentUser: null,
    passwordValid: false,
    logoutAllDevices: false,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Change Password page initializing...');
        
        try {
            await this.checkAuth();
            this.setupEventListeners();
            this.loadRecentChanges();
            
            console.log('✅ Change Password page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading page', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=change-password.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    // ============================================
    // PASSWORD VALIDATION
    // ============================================
    validatePassword(password) {
        const checks = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        
        // Update checklist
        this.updateChecklist(checks);
        
        // Calculate strength
        const strength = Object.values(checks).filter(Boolean).length;
        this.updateStrengthMeter(strength);
        
        // All checks must pass for valid password
        return Object.values(checks).every(Boolean);
    },
    
    updateChecklist(checks) {
        const items = {
            length: document.getElementById('checkLength'),
            uppercase: document.getElementById('checkUppercase'),
            lowercase: document.getElementById('checkLowercase'),
            number: document.getElementById('checkNumber'),
            special: document.getElementById('checkSpecial')
        };
        
        Object.keys(checks).forEach(key => {
            if (items[key]) {
                const icon = items[key].querySelector('i');
                if (checks[key]) {
                    items[key].classList.add('valid');
                    icon.className = 'fas fa-check-circle';
                } else {
                    items[key].classList.remove('valid');
                    icon.className = 'far fa-circle';
                }
            }
        });
    },
    
    updateStrengthMeter(strength) {
        const bar = document.getElementById('strengthBar');
        const text = document.getElementById('strengthText');
        
        bar.className = 'strength-bar';
        text.className = 'strength-text';
        
        switch(strength) {
            case 0:
            case 1:
                bar.classList.add('weak');
                text.textContent = 'Weak password';
                text.classList.add('weak');
                break;
            case 2:
            case 3:
                bar.classList.add('fair');
                text.textContent = 'Fair password';
                text.classList.add('fair');
                break;
            case 4:
                bar.classList.add('good');
                text.textContent = 'Good password';
                text.classList.add('good');
                break;
            case 5:
                bar.classList.add('strong');
                text.textContent = 'Strong password';
                text.classList.add('strong');
                break;
        }
    },
    
    checkPasswordMatch() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const matchIndicator = document.getElementById('passwordMatch');
        const matchItem = document.getElementById('checkMatch');
        const icon = matchItem?.querySelector('i');
        
        if (!confirmPassword) {
            matchIndicator.textContent = '';
            if (matchItem) {
                matchItem.classList.remove('valid');
                if (icon) icon.className = 'far fa-circle';
            }
            return false;
        }
        
        if (newPassword === confirmPassword) {
            matchIndicator.textContent = '✓ Passwords match';
            matchIndicator.className = 'password-match match';
            if (matchItem) {
                matchItem.classList.add('valid');
                if (icon) icon.className = 'fas fa-check-circle';
            }
            return true;
        } else {
            matchIndicator.textContent = '✗ Passwords do not match';
            matchIndicator.className = 'password-match error';
            if (matchItem) {
                matchItem.classList.remove('valid');
                if (icon) icon.className = 'far fa-circle';
            }
            return false;
        }
    },
    
    // ============================================
    // FORM VALIDATION
    // ============================================
    validateForm() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Check if all fields are filled
        if (!currentPassword || !newPassword || !confirmPassword) {
            this.passwordValid = false;
            document.getElementById('changePasswordBtn').disabled = true;
            return false;
        }
        
        // Validate new password strength
        const isStrong = this.validatePassword(newPassword);
        
        // Check if passwords match
        const doMatch = this.checkPasswordMatch();
        
        this.passwordValid = isStrong && doMatch;
        document.getElementById('changePasswordBtn').disabled = !this.passwordValid;
        
        return this.passwordValid;
    },
    
    // ============================================
    // PASSWORD CHANGE
    // ============================================
    async handleSubmit(event) {
        event.preventDefault();
        
        if (!this.validateForm()) {
            this.showToast('Please fix the errors above', 'error');
            return;
        }
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const logoutOthers = document.getElementById('logoutAllDevices')?.checked || false;
        
        // Show loading state
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('changePasswordBtn').disabled = true;
        
        try {
            // First verify current password by trying to sign in
            const { error: signInError } = await sb.auth.signInWithPassword({
                email: this.currentUser.email,
                password: currentPassword
            });
            
            if (signInError) {
                throw new Error('Current password is incorrect');
            }
            
            // Update password
            const { error } = await sb.auth.updateUser({
                password: newPassword
            });
            
            if (error) throw error;
            
            // Handle logout from other devices if requested
            if (logoutOthers) {
                this.showSessionModal();
            } else {
                this.showSuccess();
            }
            
        } catch (error) {
            console.error('Error changing password:', error);
            this.hideLoading();
            this.showError(error.message || 'Failed to change password');
        }
    },
    
    async confirmSessionLogout() {
        try {
            // Sign out from all other devices by changing user's session
            // This is handled by Supabase automatically when password is changed
            // But we can force it by signing out from this session too and re-signing in
            
            const { error } = await sb.auth.signOut({
                scope: 'others' // This signs out all other sessions
            });
            
            if (error) throw error;
            
            this.closeSessionModal();
            this.showSuccess('Password changed and signed out from other devices');
            
        } catch (error) {
            console.error('Error signing out other devices:', error);
            this.closeSessionModal();
            this.showSuccess(); // Password still changed successfully
        }
    },
    
    // ============================================
    // UI HELPERS
    // ============================================
    showSuccess(message = 'Your password has been changed successfully') {
        this.hideLoading();
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('show');
    },
    
    showError(message) {
        this.hideLoading();
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.add('show');
    },
    
    showSessionModal() {
        this.hideLoading();
        document.getElementById('sessionModal').classList.add('show');
    },
    
    hideLoading() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('changePasswordBtn').disabled = false;
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
        window.location.href = 'profile.html';
    },
    
    closeErrorModal() {
        document.getElementById('errorModal').classList.remove('show');
    },
    
    closeSessionModal() {
        document.getElementById('sessionModal').classList.remove('show');
    },
    
    // ============================================
    // TOGGLE PASSWORD VISIBILITY
    // ============================================
    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        const button = input.nextElementSibling;
        const icon = button.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'far fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'far fa-eye';
        }
    },
    
    // ============================================
    // LOAD RECENT CHANGES
    // ============================================
    async loadRecentChanges() {
        // This would typically come from an audit log table
        // For now, we'll show mock data
        const recentChanges = document.getElementById('recentChanges');
        const changesList = document.getElementById('changesList');
        
        // You would fetch this from a 'password_history' or 'audit_logs' table
        // For demonstration, we'll show some mock data
        const mockChanges = [
            {
                device: 'Chrome on Windows',
                time: '2 days ago',
                location: 'Kampala, Uganda',
                current: true
            },
            {
                device: 'Safari on iPhone',
                time: '5 days ago',
                location: 'Kampala, Uganda',
                current: false
            }
        ];
        
        if (mockChanges.length > 0) {
            recentChanges.style.display = 'block';
            changesList.innerHTML = mockChanges.map(change => `
                <div class="change-item">
                    <div class="change-icon">
                        <i class="fas ${change.current ? 'fa-laptop' : 'fa-mobile-alt'}"></i>
                    </div>
                    <div class="change-details">
                        <div class="change-device">${change.device} ${change.current ? '(Current)' : ''}</div>
                        <div class="change-time">${change.time}</div>
                        <div class="change-location">${change.location}</div>
                    </div>
                </div>
            `).join('');
        }
    },
    
    // ============================================
    // TOAST NOTIFICATION
    // ============================================
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
        // Form submission
        document.getElementById('passwordForm').addEventListener('submit', (e) => {
            this.handleSubmit(e);
        });
        
        // Real-time validation
        document.getElementById('newPassword').addEventListener('input', () => {
            this.validateForm();
        });
        
        document.getElementById('confirmPassword').addEventListener('input', () => {
            this.checkPasswordMatch();
            this.validateForm();
        });
        
        document.getElementById('currentPassword').addEventListener('input', () => {
            this.validateForm();
        });
        
        // Logout all devices checkbox
        document.getElementById('logoutAllDevices').addEventListener('change', (e) => {
            this.logoutAllDevices = e.target.checked;
        });
        
        // Close modals
        document.querySelectorAll('.modal-close, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeSuccessModal();
                this.closeErrorModal();
                this.closeSessionModal();
            });
        });
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            console.log('Menu clicked');
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeSuccessModal();
                    this.closeErrorModal();
                    this.closeSessionModal();
                }
            });
        });
    }
};

// ============================================
// GLOBAL FUNCTIONS
// ============================================
window.togglePassword = (inputId) => PasswordManager.togglePassword(inputId);
window.closeSuccessModal = () => PasswordManager.closeSuccessModal();
window.closeErrorModal = () => PasswordManager.closeErrorModal();
window.closeSessionModal = () => PasswordManager.closeSessionModal();
window.confirmSessionLogout = () => PasswordManager.confirmSessionLogout();

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    PasswordManager.init();
});