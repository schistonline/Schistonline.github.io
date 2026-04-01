// ============================================
// EDIT PROFILE PAGE - COMPLETE
// ============================================

console.log('🚀 Edit Profile page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let EditProfileManager = {
    currentUser: null,
    profile: null,
    supplier: null,
    selectedAvatar: null,
    avatarChanged: false,
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Edit Profile page initializing...');
        
        try {
            await this.checkAuth();
            await this.loadProfile();
            await this.loadSupplier();
            
            this.populateForm();
            this.setupEventListeners();
            
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('editProfileContent').style.display = 'block';
            
            console.log('✅ Edit Profile page initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showError();
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=edit-profile.html';
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
            console.log('✅ Profile loaded:', this.profile);
            
        } catch (error) {
            console.error('Error loading profile:', error);
            throw error;
        }
    },
    
    async loadSupplier() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select('*')
                .eq('profile_id', this.currentUser.id)
                .maybeSingle();
            
            if (error) throw error;
            
            this.supplier = data;
            if (this.supplier) {
                console.log('✅ Supplier data loaded:', this.supplier.business_name);
            }
            
        } catch (error) {
            console.error('Error loading supplier data:', error);
        }
    },
    
    // ============================================
    // POPULATE FORM
    // ============================================
    populateForm() {
        // Personal info
        document.getElementById('fullName').value = this.profile.full_name || '';
        document.getElementById('email').value = this.profile.email || this.currentUser.email;
        document.getElementById('phone').value = this.profile.phone || '';
        document.getElementById('location').value = this.profile.location || '';
        document.getElementById('district').value = this.profile.district || '';
        
        // Avatar
        this.renderAvatar();
        
        // Business info (if supplier)
        if (this.supplier) {
            document.getElementById('businessName').value = this.supplier.business_name || '';
            document.getElementById('businessType').value = this.supplier.business_type || '';
            document.getElementById('tinNumber').value = this.supplier.tax_id || '';
        }
        
        // Account settings
        document.getElementById('isSupplier').checked = this.profile.is_supplier || false;
        document.getElementById('isBuyer').checked = this.profile.is_buyer !== false; // Default to true
    },
    
    renderAvatar() {
        const preview = document.getElementById('avatarPreview');
        const name = this.profile.full_name || 'User';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        if (this.selectedAvatar) {
            // Show selected avatar preview
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" alt="Avatar Preview">`;
            };
            reader.readAsDataURL(this.selectedAvatar);
        } else if (this.profile.avatar_url) {
            // Show existing avatar
            preview.innerHTML = `<img src="${this.profile.avatar_url}" alt="Avatar">`;
        } else {
            // Show initials
            preview.innerHTML = initials;
        }
    },
    
    // ============================================
    // AVATAR HANDLING
    // ============================================
    async uploadAvatar(file) {
        try {
            this.showToast('Compressing image...', 'info');
            
            // Compress image
            const compressedFile = await this.compressImage(file, 500, 0.8);
            
            const fileName = `avatars/${this.currentUser.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            
            const { error } = await sb.storage
                .from('avatars')
                .upload(fileName, compressedFile);
            
            if (error) throw error;
            
            const { data: { publicUrl } } = sb.storage
                .from('avatars')
                .getPublicUrl(fileName);
            
            return publicUrl;
            
        } catch (error) {
            console.error('Error uploading avatar:', error);
            throw error;
        }
    },
    
    compressImage(file, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    }, 'image/jpeg', quality);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    },
    
    removeAvatar() {
        this.selectedAvatar = null;
        this.avatarChanged = true;
        this.profile.avatar_url = null;
        this.renderAvatar();
    },
    
    // ============================================
    // FORM VALIDATION
    // ============================================
    validateForm() {
        const fullName = document.getElementById('fullName').value.trim();
        const email = document.getElementById('email').value.trim();
        const isSupplier = document.getElementById('isSupplier').checked;
        const businessName = document.getElementById('businessName').value.trim();
        
        if (!fullName) {
            this.showToast('Please enter your full name', 'error');
            return false;
        }
        
        if (!email) {
            this.showToast('Please enter your email', 'error');
            return false;
        }
        
        if (!this.isValidEmail(email)) {
            this.showToast('Please enter a valid email address', 'error');
            return false;
        }
        
        if (isSupplier && !businessName) {
            this.showToast('Please enter your business name to become a supplier', 'error');
            return false;
        }
        
        return true;
    },
    
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    // ============================================
    // SAVE PROFILE
    // ============================================
    async saveProfile(event) {
        event.preventDefault();
        
        if (!this.validateForm()) return;
        
        const saveBtn = document.getElementById('saveProfileBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;
        
        try {
            // Upload avatar if changed
            let avatarUrl = this.profile.avatar_url;
            
            if (this.selectedAvatar) {
                avatarUrl = await this.uploadAvatar(this.selectedAvatar);
                this.avatarChanged = true;
            } else if (this.avatarChanged && !avatarUrl) {
                avatarUrl = null;
            }
            
            // Update profile data
            const profileData = {
                full_name: document.getElementById('fullName').value.trim(),
                email: document.getElementById('email').value.trim(),
                phone: document.getElementById('phone').value.trim() || null,
                location: document.getElementById('location').value.trim() || null,
                district: document.getElementById('district').value || null,
                avatar_url: avatarUrl,
                is_supplier: document.getElementById('isSupplier').checked,
                is_buyer: document.getElementById('isBuyer').checked,
                updated_at: new Date().toISOString()
            };
            
            // Update profiles table
            const { error: profileError } = await sb
                .from('profiles')
                .update(profileData)
                .eq('id', this.currentUser.id);
            
            if (profileError) throw profileError;
            
            // Handle supplier data
            const isSupplier = document.getElementById('isSupplier').checked;
            const businessName = document.getElementById('businessName').value.trim();
            const businessType = document.getElementById('businessType').value;
            const tinNumber = document.getElementById('tinNumber').value.trim();
            
            if (isSupplier && businessName) {
                if (this.supplier) {
                    // Update existing supplier
                    const { error: supplierError } = await sb
                        .from('suppliers')
                        .update({
                            business_name: businessName,
                            business_type: businessType || null,
                            tax_id: tinNumber || null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('profile_id', this.currentUser.id);
                    
                    if (supplierError) throw supplierError;
                    
                } else {
                    // Create new supplier
                    const { error: supplierError } = await sb
                        .from('suppliers')
                        .insert({
                            profile_id: this.currentUser.id,
                            business_name: businessName,
                            business_type: businessType || null,
                            tax_id: tinNumber || null,
                            verification_status: 'pending',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    
                    if (supplierError) throw supplierError;
                }
            } else if (!isSupplier && this.supplier) {
                // Option: Deactivate supplier status? 
                // You might want to just mark as inactive rather than delete
                console.log('User is no longer a supplier');
            }
            
            this.showToast('Profile updated successfully!', 'success');
            
            // Redirect back to profile page after short delay
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1500);
            
        } catch (error) {
            console.error('Error saving profile:', error);
            this.showToast('Error saving profile: ' + error.message, 'error');
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    },
    
    // ============================================
    // UTILITY FUNCTIONS
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
    
    showError() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Form submission
        document.getElementById('profileForm').addEventListener('submit', (e) => {
            this.saveProfile(e);
        });
        
        // Avatar change
        document.getElementById('changeAvatarBtn').addEventListener('click', () => {
            document.getElementById('avatarUpload').click();
        });
        
        document.getElementById('avatarUpload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validate file type
                if (!file.type.startsWith('image/')) {
                    this.showToast('Please select an image file', 'error');
                    return;
                }
                
                // Validate file size (max 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    this.showToast('Image size should be less than 5MB', 'error');
                    return;
                }
                
                this.selectedAvatar = file;
                this.avatarChanged = true;
                this.renderAvatar();
            }
        });
        
        // Remove avatar
        document.getElementById('removeAvatarBtn').addEventListener('click', () => {
            this.removeAvatar();
        });
        
        // Toggle supplier fields visibility
        document.getElementById('isSupplier').addEventListener('change', (e) => {
            const businessFields = document.querySelectorAll('#businessName, #businessType, #tinNumber');
            const businessSection = document.querySelector('.form-section:nth-child(2)');
            
            if (e.target.checked) {
                businessSection.style.opacity = '1';
                businessFields.forEach(field => field.disabled = false);
            } else {
                businessSection.style.opacity = '0.6';
                businessFields.forEach(field => field.disabled = true);
            }
        });
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            console.log('Menu clicked');
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    EditProfileManager.init();
});

// Global functions
window.EditProfileManager = EditProfileManager;