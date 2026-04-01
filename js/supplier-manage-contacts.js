// ============================================
// SUPPLIER CONTACTS MANAGEMENT - FIXED VERSION
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const ContactsManager = {
    currentUser: null,
    supplier: null,
    whatsappNumbers: [],
    phoneNumbers: [],
    emailAddresses: [],
    inquiries: [],
    businessHours: {},
    
    async init() {
        console.log('📞 Loading contacts manager...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadAllContacts();
            await this.loadInquiries();
            await this.loadBusinessHours();
            this.renderAll();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading contacts', 'error');
        }
    },
    
    async checkAuth() {
        const { data: { user }, error } = await sb.auth.getUser();
        
        if (error || !user) {
            window.location.href = 'login.html?redirect=supplier-contacts.html';
            return;
        }
        
        this.currentUser = user;
        console.log('✅ User authenticated:', user.email);
    },
    
    async loadSupplier() {
        const { data, error } = await sb
            .from('suppliers')
            .select('*')
            .eq('profile_id', this.currentUser.id)
            .single();
        
        if (error) {
            console.error('Error loading supplier:', error);
            throw error;
        }
        
        this.supplier = data;
        console.log('✅ Supplier loaded:', this.supplier.business_name);
    },
    
    async loadAllContacts() {
        await Promise.all([
            this.loadWhatsAppNumbers(),
            this.loadPhoneNumbers(),
            this.loadEmailAddresses()
        ]);
    },
    
    async loadWhatsAppNumbers() {
        try {
            const { data, error } = await sb
                .from('supplier_whatsapp')
                .select('*')
                .eq('supplier_id', this.supplier.id)
                .order('is_primary', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            this.whatsappNumbers = data || [];
            console.log(`✅ Loaded ${this.whatsappNumbers.length} WhatsApp numbers`);
            
            const countEl = document.getElementById('whatsappCount');
            if (countEl) countEl.textContent = this.whatsappNumbers.length;
            
        } catch (error) {
            console.error('Error loading WhatsApp:', error);
            this.whatsappNumbers = [];
        }
    },
    
    async loadPhoneNumbers() {
        try {
            const { data, error } = await sb
                .from('supplier_phones')
                .select('*')
                .eq('supplier_id', this.supplier.id)
                .order('is_primary', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            this.phoneNumbers = data || [];
            console.log(`✅ Loaded ${this.phoneNumbers.length} phone numbers`);
            
            const countEl = document.getElementById('phoneCount');
            if (countEl) countEl.textContent = this.phoneNumbers.length;
            
        } catch (error) {
            console.error('Error loading phones:', error);
            this.phoneNumbers = [];
        }
    },
    
    async loadEmailAddresses() {
        try {
            const { data, error } = await sb
                .from('supplier_emails')
                .select('*')
                .eq('supplier_id', this.supplier.id)
                .order('is_primary', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            this.emailAddresses = data || [];
            console.log(`✅ Loaded ${this.emailAddresses.length} email addresses`);
            
            const countEl = document.getElementById('emailCount');
            if (countEl) countEl.textContent = this.emailAddresses.length;
            
        } catch (error) {
            console.error('Error loading emails:', error);
            this.emailAddresses = [];
        }
    },
    
    async loadInquiries(limit = 5) {
        try {
            const { data, error } = await sb
                .from('supplier_inquiries')
                .select('*')
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            this.inquiries = data || [];
            
            const countEl = document.getElementById('inquiryCount');
            if (countEl) countEl.textContent = this.inquiries.length;
            
        } catch (error) {
            console.error('Error loading inquiries:', error);
            this.inquiries = [];
        }
    },
    
    async loadBusinessHours() {
        try {
            // If supplier has business_hours in database, use that
            if (this.supplier && this.supplier.business_hours) {
                this.businessHours = this.supplier.business_hours;
            } else {
                // Default hours
                this.businessHours = {
                    monday: '09:00-18:00',
                    tuesday: '09:00-18:00',
                    wednesday: '09:00-18:00',
                    thursday: '09:00-18:00',
                    friday: '09:00-18:00',
                    saturday: 'Closed',
                    sunday: 'Closed'
                };
            }
        } catch (error) {
            console.error('Error loading hours:', error);
        }
    },
    
    renderAll() {
        this.renderWhatsApp();
        this.renderPhones();
        this.renderEmails();
        this.renderInquiries();
        this.renderBusinessHours();
        this.renderSettings();
    },
    
    renderWhatsApp() {
        const container = document.getElementById('whatsappGrid');
        if (!container) return;
        
        const loading = document.getElementById('whatsappLoading');
        if (loading) loading.style.display = 'none';
        
        if (this.whatsappNumbers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fab fa-whatsapp"></i>
                    <h3>No WhatsApp Numbers</h3>
                    <p>Add your first WhatsApp number to start receiving inquiries</p>
                    <button class="btn btn-primary" onclick="openAddModal('whatsapp')">
                        <i class="fas fa-plus"></i> Add WhatsApp Number
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.whatsappNumbers.map(w => `
            <div class="contact-card ${w.is_active ? '' : 'inactive'}" data-id="${w.id}">
                <div class="contact-header">
                    <div class="contact-type-badge whatsapp">
                        <i class="fab fa-whatsapp"></i>
                        <h4>${this.escapeHtml(w.label || 'WhatsApp')}</h4>
                    </div>
                    <div>
                        ${w.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                        ${!w.is_active ? '<span class="inactive-badge">Inactive</span>' : ''}
                    </div>
                </div>
                
                <div class="contact-details">
                    <div class="contact-value">${w.country_code || '+256'} ${w.whatsapp_number}</div>
                    <div class="contact-department">
                        <i class="fas fa-building"></i> ${w.department || 'General'}
                    </div>
                    <div class="contact-meta">
                        <span><i class="far fa-clock"></i> Added ${this.formatDate(w.created_at)}</span>
                    </div>
                </div>
                
                <div class="contact-actions">
                    <button class="action-btn edit-btn" onclick="editContact('whatsapp', ${w.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn toggle-btn" onclick="toggleContactStatus('whatsapp', ${w.id})" title="${w.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${w.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="confirmDelete('whatsapp', ${w.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    renderPhones() {
        const container = document.getElementById('phoneGrid');
        if (!container) return;
        
        const loading = document.getElementById('phoneLoading');
        if (loading) loading.style.display = 'none';
        
        if (this.phoneNumbers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-phone-alt"></i>
                    <h3>No Phone Numbers</h3>
                    <p>Add your business phone numbers</p>
                    <button class="btn btn-primary" onclick="openAddModal('phone')">
                        <i class="fas fa-plus"></i> Add Phone Number
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.phoneNumbers.map(p => `
            <div class="contact-card ${p.is_active ? '' : 'inactive'}" data-id="${p.id}">
                <div class="contact-header">
                    <div class="contact-type-badge phone">
                        <i class="fas fa-phone-alt"></i>
                        <h4>${this.escapeHtml(p.label || 'Phone')}</h4>
                    </div>
                    <div>
                        ${p.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                        ${!p.is_active ? '<span class="inactive-badge">Inactive</span>' : ''}
                    </div>
                </div>
                
                <div class="contact-details">
                    <div class="contact-value">${p.country_code || '+256'} ${p.phone_number}</div>
                    <div class="contact-department">
                        <i class="fas fa-building"></i> ${p.department || 'General'}
                    </div>
                    ${p.whatsapp_available ? `
                        <div class="whatsapp-indicator">
                            <i class="fab fa-whatsapp"></i> Also on WhatsApp
                        </div>
                    ` : ''}
                    <div class="contact-meta">
                        <span><i class="far fa-clock"></i> Added ${this.formatDate(p.created_at)}</span>
                    </div>
                </div>
                
                <div class="contact-actions">
                    <button class="action-btn edit-btn" onclick="editContact('phone', ${p.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn toggle-btn" onclick="toggleContactStatus('phone', ${p.id})" title="${p.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${p.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="confirmDelete('phone', ${p.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    renderEmails() {
        const container = document.getElementById('emailGrid');
        if (!container) return;
        
        const loading = document.getElementById('emailLoading');
        if (loading) loading.style.display = 'none';
        
        if (this.emailAddresses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-envelope"></i>
                    <h3>No Email Addresses</h3>
                    <p>Add your business email addresses</p>
                    <button class="btn btn-primary" onclick="openAddModal('email')">
                        <i class="fas fa-plus"></i> Add Email Address
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.emailAddresses.map(e => `
            <div class="contact-card ${e.is_active ? '' : 'inactive'}" data-id="${e.id}">
                <div class="contact-header">
                    <div class="contact-type-badge email">
                        <i class="fas fa-envelope"></i>
                        <h4>${this.escapeHtml(e.label || 'Email')}</h4>
                    </div>
                    <div>
                        ${e.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                        ${!e.is_active ? '<span class="inactive-badge">Inactive</span>' : ''}
                    </div>
                </div>
                
                <div class="contact-details">
                    <div class="contact-value">${e.email_address}</div>
                    <div class="contact-department">
                        <i class="fas fa-building"></i> ${e.department || 'General'}
                    </div>
                    <div class="contact-meta">
                        <span><i class="far fa-clock"></i> Added ${this.formatDate(e.created_at)}</span>
                    </div>
                </div>
                
                <div class="contact-actions">
                    <button class="action-btn edit-btn" onclick="editContact('email', ${e.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn toggle-btn" onclick="toggleContactStatus('email', ${e.id})" title="${e.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${e.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="confirmDelete('email', ${e.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    renderInquiries() {
        const container = document.getElementById('recentInquiries');
        if (!container) return;
        
        if (this.inquiries.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <i class="fas fa-inbox"></i>
                    <p>No inquiries yet</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.inquiries.map(inquiry => {
            const data = inquiry.inquiry_data || {};
            const methodClass = {
                'whatsapp': 'whatsapp',
                'phone': 'phone',
                'email': 'email'
            }[inquiry.contact_method] || '';
            
            return `
                <div class="inquiry-item">
                    <div class="inquiry-info">
                        <h4>${this.escapeHtml(data.name || 'Customer')}</h4>
                        <p>${this.escapeHtml(data.product_title || 'Product inquiry')} • Qty: ${data.quantity || 1}</p>
                    </div>
                    <div class="inquiry-meta">
                        <span class="inquiry-method ${methodClass}">${inquiry.contact_method}</span>
                        <div class="inquiry-date">${this.formatDate(inquiry.created_at)}</div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    renderBusinessHours() {
        const container = document.getElementById('businessHours');
        if (!container) return;
        
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        container.innerHTML = days.map(day => `
            <div class="hour-item">
                <span class="hour-day">${day.charAt(0).toUpperCase() + day.slice(1)}</span>
                <span class="hour-time">${this.businessHours[day] || 'Closed'}</span>
            </div>
        `).join('');
    },
    
    renderSettings() {
        // Preferred contact method
        const prefSelect = document.getElementById('preferredContact');
        if (prefSelect && this.supplier && this.supplier.preferred_contact_method) {
            prefSelect.value = this.supplier.preferred_contact_method;
        }
    },
    
    async addContact(type, data) {
        try {
            this.showLoading(true);
            console.log('Adding contact:', type, data);
            
            let table, insertData;
            
            switch(type) {
                case 'whatsapp':
                    table = 'supplier_whatsapp';
                    insertData = {
                        supplier_id: this.supplier.id,
                        whatsapp_number: data.number,
                        country_code: data.countryCode,
                        label: data.label,
                        department: data.department,
                        is_primary: data.isPrimary || false,
                        is_active: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    break;
                    
                case 'phone':
                    table = 'supplier_phones';
                    insertData = {
                        supplier_id: this.supplier.id,
                        phone_number: data.number,
                        country_code: data.countryCode,
                        label: data.label,
                        department: data.department,
                        is_primary: data.isPrimary || false,
                        is_active: true,
                        whatsapp_available: data.isWhatsapp || false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    break;
                    
                case 'email':
                    table = 'supplier_emails';
                    insertData = {
                        supplier_id: this.supplier.id,
                        email_address: data.email,
                        label: data.label,
                        department: data.department,
                        is_primary: data.isPrimary || false,
                        is_active: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    break;
                    
                default:
                    throw new Error('Invalid contact type');
            }
            
            console.log('Insert data:', insertData);
            console.log('Table:', table);
            
            // If setting as primary, update others first
            if (data.isPrimary) {
                await this.removePrimaryFromOthers(type);
            }
            
            const { data: result, error } = await sb
                .from(table)
                .insert(insertData)
                .select();
            
            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            
            console.log('Insert result:', result);
            
            await this.loadAllContacts();
            this.renderAll();
            this.showToast(`${type} added successfully`, 'success');
            closeModal();
            
        } catch (error) {
            console.error('Error adding contact:', error);
            this.showToast(error.message || 'Error adding contact', 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    async updateContact(type, id, data) {
        try {
            this.showLoading(true);
            console.log('Updating contact:', type, id, data);
            
            let table, updateData;
            
            switch(type) {
                case 'whatsapp':
                    table = 'supplier_whatsapp';
                    updateData = {
                        whatsapp_number: data.number,
                        country_code: data.countryCode,
                        label: data.label,
                        department: data.department,
                        is_primary: data.isPrimary || false,
                        updated_at: new Date().toISOString()
                    };
                    break;
                    
                case 'phone':
                    table = 'supplier_phones';
                    updateData = {
                        phone_number: data.number,
                        country_code: data.countryCode,
                        label: data.label,
                        department: data.department,
                        is_primary: data.isPrimary || false,
                        whatsapp_available: data.isWhatsapp || false,
                        updated_at: new Date().toISOString()
                    };
                    break;
                    
                case 'email':
                    table = 'supplier_emails';
                    updateData = {
                        email_address: data.email,
                        label: data.label,
                        department: data.department,
                        is_primary: data.isPrimary || false,
                        updated_at: new Date().toISOString()
                    };
                    break;
                    
                default:
                    throw new Error('Invalid contact type');
            }
            
            console.log('Update data:', updateData);
            console.log('Table:', table);
            console.log('ID:', id);
            
            // If setting as primary, update others first
            if (data.isPrimary) {
                await this.removePrimaryFromOthers(type);
            }
            
            const { data: result, error } = await sb
                .from(table)
                .update(updateData)
                .eq('id', id)
                .select();
            
            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            
            console.log('Update result:', result);
            
            await this.loadAllContacts();
            this.renderAll();
            this.showToast(`${type} updated successfully`, 'success');
            closeModal();
            
        } catch (error) {
            console.error('Error updating contact:', error);
            this.showToast(error.message || 'Error updating contact', 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    async removePrimaryFromOthers(type) {
        let table;
        switch(type) {
            case 'whatsapp':
                table = 'supplier_whatsapp';
                break;
            case 'phone':
                table = 'supplier_phones';
                break;
            case 'email':
                table = 'supplier_emails';
                break;
            default:
                return;
        }
        
        console.log('Removing primary from other', type, 'contacts');
        
        const { error } = await sb
            .from(table)
            .update({ is_primary: false })
            .eq('supplier_id', this.supplier.id);
        
        if (error) {
            console.error('Error removing primary:', error);
        }
    },
    
    async toggleStatus(type, id) {
        try {
            let table, currentItem;
            
            switch(type) {
                case 'whatsapp':
                    table = 'supplier_whatsapp';
                    currentItem = this.whatsappNumbers.find(w => w.id === id);
                    break;
                case 'phone':
                    table = 'supplier_phones';
                    currentItem = this.phoneNumbers.find(p => p.id === id);
                    break;
                case 'email':
                    table = 'supplier_emails';
                    currentItem = this.emailAddresses.find(e => e.id === id);
                    break;
                default:
                    return;
            }
            
            if (!currentItem) {
                console.error('Item not found:', type, id);
                return;
            }
            
            const { error } = await sb
                .from(table)
                .update({ 
                    is_active: !currentItem.is_active,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            
            await this.loadAllContacts();
            this.renderAll();
            this.showToast(`Contact ${currentItem.is_active ? 'deactivated' : 'activated'} successfully`, 'success');
            
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showToast(error.message || 'Error updating status', 'error');
        }
    },
    
    async deleteContact(type, id) {
        try {
            this.showLoading(true);
            console.log('Deleting contact:', type, id);
            
            let table;
            switch(type) {
                case 'whatsapp':
                    table = 'supplier_whatsapp';
                    break;
                case 'phone':
                    table = 'supplier_phones';
                    break;
                case 'email':
                    table = 'supplier_emails';
                    break;
                default:
                    return;
            }
            
            const { error } = await sb
                .from(table)
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            await this.loadAllContacts();
            this.renderAll();
            this.showToast('Contact deleted successfully', 'success');
            closeDeleteModal();
            
        } catch (error) {
            console.error('Error deleting contact:', error);
            this.showToast(error.message || 'Error deleting contact', 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    async updatePreferredContact(method) {
        try {
            const { error } = await sb
                .from('suppliers')
                .update({ 
                    preferred_contact_method: method,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.supplier.id);
            
            if (error) throw error;
            
            this.supplier.preferred_contact_method = method;
            this.showToast('Preferences updated successfully', 'success');
            
        } catch (error) {
            console.error('Error updating preferences:', error);
            this.showToast(error.message || 'Error updating preferences', 'error');
        }
    },
    
    async saveBusinessHours(hours) {
        try {
            this.showLoading(true);
            console.log('Saving business hours:', hours);
            
            const { error } = await sb
                .from('suppliers')
                .update({ 
                    business_hours: hours,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.supplier.id);
            
            if (error) throw error;
            
            this.businessHours = hours;
            this.supplier.business_hours = hours;
            this.renderBusinessHours();
            this.closeHoursEditor();
            this.showToast('Business hours saved successfully', 'success');
            
        } catch (error) {
            console.error('Error saving business hours:', error);
            this.showToast(error.message || 'Error saving hours', 'error');
        } finally {
            this.showLoading(false);
        }
    },
    
    openHoursEditor() {
        // Check if editor already exists
        let editor = document.getElementById('hoursEditor');
        
        if (!editor) {
            // Create editor
            editor = document.createElement('div');
            editor.id = 'hoursEditor';
            editor.className = 'hours-editor';
            
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            
            let html = `
                <div class="editor-header">
                    <h3>Edit Business Hours</h3>
                    <button class="close-editor" onclick="ContactsManager.closeHoursEditor()">&times;</button>
                </div>
                <div class="editor-body">
            `;
            
            days.forEach(day => {
                const currentValue = this.businessHours[day] || 'Closed';
                html += `
                    <div class="hour-edit-row">
                        <label>${day.charAt(0).toUpperCase() + day.slice(1)}</label>
                        <div class="hour-input-group">
                            <select class="hour-status" id="status_${day}" onchange="ContactsManager.toggleHourInput('${day}')">
                                <option value="open" ${currentValue !== 'Closed' ? 'selected' : ''}>Open</option>
                                <option value="closed" ${currentValue === 'Closed' ? 'selected' : ''}>Closed</option>
                            </select>
                            <div class="time-range" id="range_${day}" style="${currentValue === 'Closed' ? 'display: none;' : 'display: flex;'}">
                                <input type="time" class="hour-start" id="start_${day}" value="${currentValue !== 'Closed' ? currentValue.split('-')[0] : '09:00'}">
                                <span>to</span>
                                <input type="time" class="hour-end" id="end_${day}" value="${currentValue !== 'Closed' ? currentValue.split('-')[1] : '18:00'}">
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                </div>
                <div class="editor-footer">
                    <button class="btn btn-secondary" onclick="ContactsManager.closeHoursEditor()">Cancel</button>
                    <button class="btn btn-primary" onclick="ContactsManager.saveHoursFromEditor()">Save Hours</button>
                </div>
            `;
            
            editor.innerHTML = html;
            document.querySelector('.settings-section').appendChild(editor);
        }
        
        // Show editor
        editor.classList.add('show');
    },
    
    closeHoursEditor() {
        const editor = document.getElementById('hoursEditor');
        if (editor) {
            editor.classList.remove('show');
        }
    },
    
    toggleHourInput(day) {
        const status = document.getElementById(`status_${day}`).value;
        const range = document.getElementById(`range_${day}`);
        range.style.display = status === 'open' ? 'flex' : 'none';
    },
    
    saveHoursFromEditor() {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const newHours = {};
        
        days.forEach(day => {
            const status = document.getElementById(`status_${day}`).value;
            if (status === 'closed') {
                newHours[day] = 'Closed';
            } else {
                const start = document.getElementById(`start_${day}`).value;
                const end = document.getElementById(`end_${day}`).value;
                newHours[day] = `${start}-${end}`;
            }
        });
        
        this.saveBusinessHours(newHours);
    },
    
    formatDate(dateString) {
        if (!dateString) return 'Recently';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 86400000) {
            return 'Today';
        } else if (diff < 172800000) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString();
        }
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
    
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (!overlay) return;
        
        if (show) {
            overlay.classList.add('show');
        } else {
            overlay.classList.remove('show');
        }
    },
    
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                const tabId = e.target.dataset.tab;
                const tabContent = document.getElementById(tabId + 'Tab');
                if (tabContent) tabContent.classList.add('active');
            });
        });
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await this.loadAllContacts();
                await this.loadInquiries();
                this.renderAll();
                this.showToast('Contacts refreshed', 'success');
            });
        }
        
        // Auto-reply checkboxes
        const autoReplyWhatsapp = document.getElementById('autoReplyWhatsapp');
        if (autoReplyWhatsapp) {
            autoReplyWhatsapp.addEventListener('change', (e) => {
                const field = document.getElementById('whatsappAutoReplyField');
                if (field) field.style.display = e.target.checked ? 'block' : 'none';
            });
        }
        
        const autoReplyEmail = document.getElementById('autoReplyEmail');
        if (autoReplyEmail) {
            autoReplyEmail.addEventListener('change', (e) => {
                const field = document.getElementById('emailAutoReplyField');
                if (field) field.style.display = e.target.checked ? 'block' : 'none';
            });
        }
        
        // Form submission
        const contactForm = document.getElementById('contactForm');
        if (contactForm) {
            contactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmit();
            });
        }
        
        // Preferred contact change
        const preferredContact = document.getElementById('preferredContact');
        if (preferredContact) {
            preferredContact.addEventListener('change', (e) => {
                this.updatePreferredContact(e.target.value);
            });
        }
        
        // Close modal on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeModal();
                closeDeleteModal();
            }
        });
    },
    
    handleFormSubmit() {
        const type = document.getElementById('contactType').value;
        const id = document.getElementById('editId').value;
        
        console.log('Form submitted:', { type, id });
        
        // Validate required fields
        const label = document.getElementById('label').value;
        if (!label) {
            this.showToast('Label is required', 'error');
            return;
        }
        
        const data = {
            label: label,
            department: document.getElementById('department').value,
            isPrimary: document.getElementById('isPrimary').checked
        };
        
        if (type === 'email') {
            const email = document.getElementById('email').value;
            if (!email) {
                this.showToast('Email address is required', 'error');
                return;
            }
            if (!this.validateEmail(email)) {
                this.showToast('Invalid email format', 'error');
                return;
            }
            data.email = email;
        } else {
            const countryCode = document.getElementById('countryCode').value;
            const number = document.getElementById('number').value;
            
            if (!number) {
                this.showToast('Phone number is required', 'error');
                return;
            }
            const cleanNumber = number.replace(/\D/g, '');
            if (!this.validatePhone(cleanNumber)) {
                this.showToast('Invalid phone number (must be 7-12 digits)', 'error');
                return;
            }
            
            data.countryCode = countryCode;
            data.number = cleanNumber;
            
            if (type === 'phone') {
                data.isWhatsapp = document.getElementById('isWhatsapp').checked;
            }
        }
        
        console.log('Form data prepared:', data);
        
        if (id) {
            this.updateContact(type, parseInt(id), data);
        } else {
            this.addContact(type, data);
        }
    },
    
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    validatePhone(phone) {
        const re = /^[0-9]{7,12}$/;
        return re.test(phone);
    }
};

// ============================================
// GLOBAL FUNCTIONS
// ============================================

function openAddModal(type) {
    console.log('Opening add modal for:', type);
    
    const modal = document.getElementById('contactModal');
    const title = document.getElementById('modalTitle');
    const contactType = document.getElementById('contactType');
    const editId = document.getElementById('editId');
    const form = document.getElementById('contactForm');
    const phoneFields = document.getElementById('phoneFields');
    const emailField = document.getElementById('emailField');
    const whatsappCheckbox = document.getElementById('whatsappCheckbox');
    
    title.textContent = `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    contactType.value = type;
    editId.value = '';
    form.reset();
    
    // Show/hide appropriate fields
    if (type === 'email') {
        phoneFields.style.display = 'none';
        emailField.style.display = 'block';
        whatsappCheckbox.style.display = 'none';
        document.getElementById('email').required = true;
        document.getElementById('number').required = false;
    } else {
        phoneFields.style.display = 'block';
        emailField.style.display = 'none';
        document.getElementById('number').required = true;
        document.getElementById('email').required = false;
        
        if (type === 'phone') {
            whatsappCheckbox.style.display = 'block';
        } else {
            whatsappCheckbox.style.display = 'none';
        }
    }
    
    modal.classList.add('show');
}

function editContact(type, id) {
    console.log('Editing contact:', type, id);
    
    let item;
    switch(type) {
        case 'whatsapp':
            item = ContactsManager.whatsappNumbers.find(w => w.id === id);
            break;
        case 'phone':
            item = ContactsManager.phoneNumbers.find(p => p.id === id);
            break;
        case 'email':
            item = ContactsManager.emailAddresses.find(e => e.id === id);
            break;
        default:
            return;
    }
    
    if (!item) {
        console.error('Item not found');
        return;
    }
    
    console.log('Item found:', item);
    
    const modal = document.getElementById('contactModal');
    const title = document.getElementById('modalTitle');
    const contactType = document.getElementById('contactType');
    const editId = document.getElementById('editId');
    const phoneFields = document.getElementById('phoneFields');
    const emailField = document.getElementById('emailField');
    const whatsappCheckbox = document.getElementById('whatsappCheckbox');
    
    title.textContent = `Edit ${type}`;
    contactType.value = type;
    editId.value = id;
    
    if (type === 'email') {
        phoneFields.style.display = 'none';
        emailField.style.display = 'block';
        whatsappCheckbox.style.display = 'none';
        document.getElementById('email').value = item.email_address || '';
        document.getElementById('email').required = true;
        document.getElementById('number').required = false;
    } else {
        phoneFields.style.display = 'block';
        emailField.style.display = 'none';
        document.getElementById('number').required = true;
        document.getElementById('email').required = false;
        
        document.getElementById('countryCode').value = item.country_code || '+256';
        document.getElementById('number').value = item.whatsapp_number || item.phone_number || '';
        
        if (type === 'phone') {
            whatsappCheckbox.style.display = 'block';
            document.getElementById('isWhatsapp').checked = item.whatsapp_available || false;
        } else {
            whatsappCheckbox.style.display = 'none';
        }
    }
    
    document.getElementById('label').value = item.label || '';
    document.getElementById('department').value = item.department || 'sales';
    document.getElementById('isPrimary').checked = item.is_primary || false;
    
    modal.classList.add('show');
}

function toggleContactStatus(type, id) {
    if (confirm('Are you sure you want to change the status of this contact?')) {
        ContactsManager.toggleStatus(type, id);
    }
}

let deleteType, deleteId;
function confirmDelete(type, id) {
    deleteType = type;
    deleteId = id;
    document.getElementById('deleteModal').classList.add('show');
}

function closeModal() {
    document.getElementById('contactModal').classList.remove('show');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    deleteType = null;
    deleteId = null;
}

// Delete confirmation
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
        if (deleteType && deleteId) {
            ContactsManager.deleteContact(deleteType, deleteId);
        }
    });
}

function saveAutoReplySettings() {
    // Get values
    const whatsappEnabled = document.getElementById('autoReplyWhatsapp')?.checked || false;
    const whatsappMessage = document.getElementById('whatsappAutoMessage')?.value || '';
    const emailEnabled = document.getElementById('autoReplyEmail')?.checked || false;
    const emailSubject = document.getElementById('emailAutoSubject')?.value || '';
    const emailMessage = document.getElementById('emailAutoMessage')?.value || '';
    
    console.log('Auto-reply settings:', { whatsappEnabled, whatsappMessage, emailEnabled, emailSubject, emailMessage });
    
    // Here you would save to database (you may need to create an auto_reply_settings table)
    // For now, just show success message
    ContactsManager.showToast('Auto-reply settings saved (demo)', 'success');
}

// Make functions available globally
window.ContactsManager = ContactsManager;
window.openAddModal = openAddModal;
window.editContact = editContact;
window.toggleContactStatus = toggleContactStatus;
window.confirmDelete = confirmDelete;
window.closeModal = closeModal;
window.closeDeleteModal = closeDeleteModal;
window.saveAutoReplySettings = saveAutoReplySettings;
window.editBusinessHours = () => ContactsManager.openHoursEditor();

// ============================================
// INITIALIZATION
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ContactsManager.init());
} else {
    ContactsManager.init();
}