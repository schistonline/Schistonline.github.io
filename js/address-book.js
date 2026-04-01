// ============================================
// ADDRESS BOOK MANAGEMENT - COMPLETE
// ============================================

console.log('🚀 Address Book loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let AddressBook = {
    currentUser: null,
    addresses: [],
    currentAddress: null,
    districts: {
        'Central': ['Kampala', 'Wakiso', 'Mukono', 'Masaka', 'Entebbe', 'Kayunga', 'Kyotera', 'Luwero', 'Lwengo', 'Lyantonde', 'Mityana', 'Mpigi', 'Mubende', 'Nakasongola', 'Rakai', 'Sembabule'],
        'Western': ['Mbarara', 'Kasese', 'Kabale', 'Fort Portal', 'Bushenyi', 'Bundibugyo', 'Bushenyi', 'Hoima', 'Ibanda', 'Isingiro', 'Kabale', 'Kabarole', 'Kamwenge', 'Kanungu', 'Kasese', 'Kibaale', 'Kiruhura', 'Kiryandongo', 'Kisoro', 'Kyegegwa', 'Kyenjojo', 'Masindi', 'Mbarara', 'Mitooma', 'Ntoroko', 'Ntungamo', 'Rubirizi', 'Rukungiri'],
        'Eastern': ['Jinja', 'Mbale', 'Tororo', 'Soroti', 'Gulu', 'Amuria', 'Budaka', 'Bududa', 'Bugiri', 'Bukedea', 'Bukwa', 'Bulambuli', 'Busia', 'Butaleja', 'Buyende', 'Iganga', 'Jinja', 'Kaberamaido', 'Kaliro', 'Kamuli', 'Kapchorwa', 'Katakwi', 'Kibuku', 'Kumi', 'Kween', 'Luuka', 'Manafwa', 'Mayuge', 'Mbale', 'Namayingo', 'Namutumba', 'Ngora', 'Pallisa', 'Serere', 'Sironko', 'Soroti', 'Tororo'],
        'Northern': ['Lira', 'Arua', 'Kitgum', 'Nebbi', 'Moroto', 'Abim', 'Adjumani', 'Agago', 'Alebtong', 'Amolatar', 'Amudat', 'Amuru', 'Apac', 'Arua', 'Dokolo', 'Gulu', 'Kaabong', 'Kitgum', 'Koboko', 'Kole', 'Kotido', 'Lamwo', 'Lira', 'Maracha', 'Moroto', 'Moyo', 'Nakapiripirit', 'Napak', 'Nebbi', 'Nwoya', 'Otuke', 'Oyam', 'Pader', 'Yumbe', 'Zombo']
    },
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Address Book initializing...');
        
        try {
            await this.checkAuth();
            await this.loadAddresses();
            this.setupEventListeners();
            this.populateDistricts();
            
            console.log('✅ Address Book initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showError();
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=address-book.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'login.html';
        }
    },
    
    async loadAddresses() {
        try {
            const { data, error } = await sb
                .from('user_locations')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.addresses = data || [];
            
            document.getElementById('loadingState').style.display = 'none';
            
            if (this.addresses.length === 0) {
                document.getElementById('emptyState').style.display = 'block';
                document.getElementById('addressesContent').style.display = 'none';
            } else {
                document.getElementById('emptyState').style.display = 'none';
                document.getElementById('addressesContent').style.display = 'block';
                this.renderAddresses();
            }
            
            console.log(`✅ Loaded ${this.addresses.length} addresses`);
            
        } catch (error) {
            console.error('Error loading addresses:', error);
            this.showError();
        }
    },
    
    // ============================================
    // RENDER ADDRESSES
    // ============================================
    renderAddresses() {
        const container = document.getElementById('addressesGrid');
        
        container.innerHTML = this.addresses.map(address => this.renderAddressCard(address)).join('');
    },
    
    renderAddressCard(address) {
        const isDefault = address.is_default;
        const fullAddress = [
            address.address_line1,
            address.address_line2,
            address.city,
            address.district,
            address.region
        ].filter(Boolean).join(', ');
        
        return `
            <div class="address-card ${isDefault ? 'default' : ''}" data-address-id="${address.id}">
                <div class="address-header">
                    <div class="address-label">
                        <span class="label-name">${this.escapeHtml(address.location_name || 'Address')}</span>
                        ${isDefault ? '<span class="default-badge">Default</span>' : ''}
                    </div>
                    <div class="address-actions">
                        <button class="action-btn" onclick="AddressBook.editAddress(${address.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${!isDefault ? `
                            <button class="action-btn" onclick="AddressBook.deleteAddress(${address.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="address-details">
                    <div class="recipient-info">
                        <div class="recipient-name">${this.escapeHtml(address.recipient_name || 'Recipient')}</div>
                        <div class="recipient-phone">
                            <i class="fas fa-phone"></i> ${address.phone || 'No phone'}
                        </div>
                    </div>
                    
                    <div class="address-text">
                        <span class="address-line">${this.escapeHtml(address.address_line1)}</span>
                        ${address.address_line2 ? `<span class="address-line">${this.escapeHtml(address.address_line2)}</span>` : ''}
                        <span class="address-line">${address.city ? this.escapeHtml(address.city) + ', ' : ''}${this.escapeHtml(address.district || '')}</span>
                        <span class="address-line">${this.escapeHtml(address.region || '')}</span>
                    </div>
                    
                    ${address.landmark ? `
                        <div class="landmark">
                            <i class="fas fa-map-pin"></i> Near: ${this.escapeHtml(address.landmark)}
                        </div>
                    ` : ''}
                </div>
                
                ${address.delivery_instructions ? `
                    <div class="delivery-instructions">
                        <i class="fas fa-info-circle"></i> ${this.escapeHtml(address.delivery_instructions)}
                    </div>
                ` : ''}
                
                <div class="address-footer">
                    <div class="address-type">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${address.location_name || 'Address'}</span>
                    </div>
                    ${!isDefault ? `
                        <button class="set-default-btn" onclick="AddressBook.setDefaultAddress(${address.id})">
                            <i class="fas fa-check-circle"></i> Set as Default
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    // ============================================
    // DISTRICT MANAGEMENT
    // ============================================
    populateDistricts() {
        const regionSelect = document.getElementById('region');
        const districtSelect = document.getElementById('district');
        
        if (!regionSelect || !districtSelect) return;
        
        regionSelect.addEventListener('change', () => {
            const region = regionSelect.value;
            const districts = this.districts[region] || [];
            
            districtSelect.innerHTML = '<option value="">Select district</option>';
            
            districts.sort().forEach(district => {
                const option = document.createElement('option');
                option.value = district;
                option.textContent = district;
                districtSelect.appendChild(option);
            });
        });
    },
    
    // ============================================
    // CRUD OPERATIONS
    // ============================================
    openAddressModal(address = null) {
        this.resetForm();
        
        if (address) {
            // Edit mode
            this.currentAddress = address;
            document.getElementById('modalTitle').textContent = 'Edit Address';
            document.getElementById('addressId').value = address.id;
            document.getElementById('addressLabel').value = address.location_name || '';
            document.getElementById('recipientName').value = address.recipient_name || '';
            document.getElementById('recipientPhone').value = address.phone || '';
            document.getElementById('region').value = address.region || '';
            document.getElementById('city').value = address.city || '';
            document.getElementById('addressLine1').value = address.address_line1 || '';
            document.getElementById('addressLine2').value = address.address_line2 || '';
            document.getElementById('postalCode').value = address.postal_code || '';
            document.getElementById('landmark').value = address.landmark || '';
            document.getElementById('deliveryInstructions').value = address.delivery_instructions || '';
            document.getElementById('isDefault').checked = address.is_default || false;
            
            // Trigger region change to populate districts
            const regionSelect = document.getElementById('region');
            const event = new Event('change');
            regionSelect.dispatchEvent(event);
            
            // Set district after a short delay to allow population
            setTimeout(() => {
                document.getElementById('district').value = address.district || '';
            }, 100);
            
        } else {
            // Create mode
            this.currentAddress = null;
            document.getElementById('modalTitle').textContent = 'Add New Address';
            
            // Set default region
            document.getElementById('region').value = 'Central';
            const regionEvent = new Event('change');
            document.getElementById('region').dispatchEvent(regionEvent);
        }
        
        document.getElementById('addressModal').classList.add('show');
    },
    
    closeAddressModal() {
        document.getElementById('addressModal').classList.remove('show');
        this.resetForm();
    },
    
    resetForm() {
        document.getElementById('addressForm').reset();
        document.getElementById('addressId').value = '';
        document.getElementById('isDefault').checked = false;
    },
    
    async saveAddress(event) {
        event.preventDefault();
        
        const addressId = document.getElementById('addressId').value;
        const locationName = document.getElementById('addressLabel').value;
        const recipientName = document.getElementById('recipientName').value;
        const phone = document.getElementById('recipientPhone').value;
        const region = document.getElementById('region').value;
        const district = document.getElementById('district').value;
        const city = document.getElementById('city').value;
        const addressLine1 = document.getElementById('addressLine1').value;
        const addressLine2 = document.getElementById('addressLine2').value;
        const postalCode = document.getElementById('postalCode').value;
        const landmark = document.getElementById('landmark').value;
        const deliveryInstructions = document.getElementById('deliveryInstructions').value;
        const isDefault = document.getElementById('isDefault').checked;
        
        // Validation
        if (!locationName) {
            this.showToast('Please enter an address label', 'error');
            return;
        }
        
        if (!recipientName) {
            this.showToast('Please enter recipient name', 'error');
            return;
        }
        
        if (!phone) {
            this.showToast('Please enter phone number', 'error');
            return;
        }
        
        if (!region) {
            this.showToast('Please select region', 'error');
            return;
        }
        
        if (!district) {
            this.showToast('Please select district', 'error');
            return;
        }
        
        if (!addressLine1) {
            this.showToast('Please enter address line 1', 'error');
            return;
        }
        
        try {
            const addressData = {
                user_id: this.currentUser.id,
                location_name: locationName,
                recipient_name: recipientName,
                phone: phone,
                region: region,
                district: district,
                city: city || null,
                address_line1: addressLine1,
                address_line2: addressLine2 || null,
                postal_code: postalCode || null,
                landmark: landmark || null,
                delivery_instructions: deliveryInstructions || null,
                is_default: isDefault,
                updated_at: new Date().toISOString()
            };
            
            // If setting as default, update all other addresses first
            if (isDefault) {
                await sb
                    .from('user_locations')
                    .update({ is_default: false })
                    .eq('user_id', this.currentUser.id);
            }
            
            let result;
            
            if (addressId) {
                // Update
                result = await sb
                    .from('user_locations')
                    .update(addressData)
                    .eq('id', addressId);
                    
                if (result.error) throw result.error;
                this.showToast('Address updated successfully', 'success');
                
            } else {
                // Create
                addressData.created_at = new Date().toISOString();
                
                // If this is the first address, make it default
                if (this.addresses.length === 0) {
                    addressData.is_default = true;
                }
                
                result = await sb
                    .from('user_locations')
                    .insert([addressData]);
                    
                if (result.error) throw result.error;
                this.showToast('Address added successfully', 'success');
            }
            
            this.closeAddressModal();
            await this.loadAddresses();
            
        } catch (error) {
            console.error('Error saving address:', error);
            this.showToast('Error saving address', 'error');
        }
    },
    
    editAddress(addressId) {
        const address = this.addresses.find(a => a.id === addressId);
        if (address) {
            this.openAddressModal(address);
        }
    },
    
    async setDefaultAddress(addressId) {
        try {
            // Remove default from all addresses
            await sb
                .from('user_locations')
                .update({ is_default: false })
                .eq('user_id', this.currentUser.id);
            
            // Set new default
            const { error } = await sb
                .from('user_locations')
                .update({ 
                    is_default: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', addressId);
            
            if (error) throw error;
            
            this.showToast('Default address updated', 'success');
            await this.loadAddresses();
            
        } catch (error) {
            console.error('Error setting default address:', error);
            this.showToast('Error updating default address', 'error');
        }
    },
    
    deleteAddress(addressId) {
        this.currentAddress = this.addresses.find(a => a.id === addressId);
        document.getElementById('deleteModal').classList.add('show');
    },
    
    async confirmDelete() {
        if (!this.currentAddress) return;
        
        try {
            const { error } = await sb
                .from('user_locations')
                .delete()
                .eq('id', this.currentAddress.id);
            
            if (error) throw error;
            
            this.closeDeleteModal();
            this.showToast('Address deleted successfully', 'success');
            await this.loadAddresses();
            
        } catch (error) {
            console.error('Error deleting address:', error);
            this.showToast('Error deleting address', 'error');
        }
    },
    
    // ============================================
    // MODAL FUNCTIONS
    // ============================================
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        this.currentAddress = null;
    },
    
    closeSuccessModal() {
        document.getElementById('successModal').classList.remove('show');
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
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
    
    showError() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Add address buttons
        document.getElementById('addAddressBtn').addEventListener('click', () => {
            this.openAddressModal();
        });
        
        document.getElementById('emptyStateAddBtn').addEventListener('click', () => {
            this.openAddressModal();
        });
        
        // Form submission
        document.getElementById('addressForm').addEventListener('submit', (e) => {
            this.saveAddress(e);
        });
        
        // Confirm delete
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.confirmDelete();
        });
        
        // Menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            console.log('Menu clicked');
        });
        
        // Close modals on outside click
        document.getElementById('addressModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('addressModal')) {
                this.closeAddressModal();
            }
        });
        
        document.getElementById('deleteModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('deleteModal')) {
                this.closeDeleteModal();
            }
        });
        
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAddressModal();
                this.closeDeleteModal();
                this.closeSuccessModal();
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    AddressBook.init();
});

// Global functions
window.AddressBook = AddressBook;
window.closeAddressModal = () => AddressBook.closeAddressModal();
window.closeDeleteModal = () => AddressBook.closeDeleteModal();
window.closeSuccessModal = () => AddressBook.closeSuccessModal();
window.editAddress = (id) => AddressBook.editAddress(id);
window.deleteAddress = (id) => AddressBook.deleteAddress(id);
window.setDefaultAddress = (id) => AddressBook.setDefaultAddress(id);