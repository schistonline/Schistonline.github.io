// ============================================
// SUPPLIER COMPANY PROFILE MANAGEMENT
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let CompanyProfileManager = {
    currentUser: null,
    currentSupplier: null,
    companyProfile: null,
    certifications: [],
    timelineEvents: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('🚀 Company Profile Manager initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadCompanyProfile();
            
            this.renderForm();
            this.setupEventListeners();
            
            console.log('✅ Company Profile Manager initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading company profile', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-company-profile.html';
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
                .select('*')
                .eq('profile_id', this.currentUser.id)
                .single();
            
            if (error) throw error;
            this.currentSupplier = data;
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.showToast('Error loading supplier data', 'error');
        }
    },
    
    async loadCompanyProfile() {
        try {
            const { data, error } = await sb
                .from('supplier_company_profiles')
                .select('*')
                .eq('supplier_id', this.currentSupplier.id)
                .maybeSingle();
            
            if (error) throw error;
            
            if (data) {
                this.companyProfile = data;
                this.certifications = data.certifications || [];
                this.timelineEvents = data.company_timeline || [];
            } else {
                // Create default profile object
                this.companyProfile = {
                    supplier_id: this.currentSupplier.id,
                    about: '',
                    mission: '',
                    vision: '',
                    core_values: [],
                    factory_size: '',
                    factory_location: '',
                    employee_count: null,
                    annual_revenue: '',
                    export_markets: [],
                    certifications: [],
                    company_timeline: []
                };
                this.certifications = [];
                this.timelineEvents = [];
            }
        } catch (error) {
            console.error('Error loading company profile:', error);
            this.showToast('Error loading company profile', 'error');
        }
    },
    
    // ============================================
    // RENDER FORM
    // ============================================
    renderForm() {
        // Basic info
        this.setFieldValue('about', this.companyProfile.about || '');
        this.setFieldValue('mission', this.companyProfile.mission || '');
        this.setFieldValue('vision', this.companyProfile.vision || '');
        
        const coreValues = this.companyProfile.core_values || [];
        this.setFieldValue('coreValues', coreValues.join('\n'));
        
        // Facilities
        this.setFieldValue('factorySize', this.companyProfile.factory_size || '');
        this.setFieldValue('factoryLocation', this.companyProfile.factory_location || '');
        this.setFieldValue('employeeCount', this.companyProfile.employee_count || '');
        this.setFieldValue('annualRevenue', this.companyProfile.annual_revenue || '');
        
        // Export markets
        const markets = this.companyProfile.export_markets || [];
        this.setFieldValue('exportMarkets', markets.join(', '));
        
        // Render certifications
        this.renderCertifications();
        
        // Render timeline
        this.renderTimeline();
    },
    
    setFieldValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value;
    },
    
    renderCertifications() {
        const container = document.getElementById('certificationsList');
        if (!container) return;
        
        if (this.certifications.length === 0) {
            container.innerHTML = '<p class="text-muted">No certifications added yet. Click "Add Certification" to add one.</p>';
            return;
        }
        
        container.innerHTML = this.certifications.map((cert, index) => `
            <div class="certification-item" data-index="${index}">
                <div class="certification-badge">
                    <i class="fas fa-certificate"></i>
                </div>
                <div class="certification-info">
                    <div class="certification-name">${this.escapeHtml(cert.name || 'Certification')}</div>
                    <div class="certification-meta">${this.escapeHtml(cert.issuer || '')} · ${cert.year || ''}</div>
                </div>
                <button class="btn-icon btn-danger" onclick="CompanyProfileManager.removeCertification(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },
    
    renderTimeline() {
        const container = document.getElementById('timelineList');
        if (!container) return;
        
        if (this.timelineEvents.length === 0) {
            container.innerHTML = '<p class="text-muted">No timeline events added yet. Click "Add Event" to add one.</p>';
            return;
        }
        
        container.innerHTML = this.timelineEvents.map((event, index) => `
            <div class="timeline-item" data-index="${index}">
                <div class="timeline-year">${this.escapeHtml(event.year || '')}</div>
                <div class="timeline-content">
                    <div class="timeline-title">${this.escapeHtml(event.title || '')}</div>
                    <div class="timeline-description">${this.escapeHtml(event.description || '')}</div>
                </div>
                <button class="btn-icon btn-danger" onclick="CompanyProfileManager.removeTimelineEvent(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },
    
    // ============================================
    // CERTIFICATION FUNCTIONS
    // ============================================
    addCertification() {
        document.getElementById('certificationModal').classList.add('show');
    },
    
    closeCertificationModal() {
        document.getElementById('certificationModal').classList.remove('show');
        this.resetCertificationForm();
    },
    
    resetCertificationForm() {
        this.setFieldValue('certName', '');
        this.setFieldValue('certIssuer', '');
        this.setFieldValue('certYear', '');
        const fileInput = document.getElementById('certImage');
        if (fileInput) fileInput.value = '';
    },
    
    async saveCertification() {
        const name = document.getElementById('certName')?.value;
        const issuer = document.getElementById('certIssuer')?.value;
        const year = document.getElementById('certYear')?.value;
        const imageFile = document.getElementById('certImage')?.files[0];
        
        if (!name) {
            this.showToast('Please enter certification name', 'error');
            return;
        }
        
        let imageUrl = null;
        
        if (imageFile) {
            try {
                const fileName = `certifications/${this.currentSupplier.id}/${Date.now()}_${imageFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                const { error } = await sb.storage
                    .from('supplier-assets')
                    .upload(fileName, imageFile);
                
                if (!error) {
                    const { data: { publicUrl } } = sb.storage
                        .from('supplier-assets')
                        .getPublicUrl(fileName);
                    imageUrl = publicUrl;
                }
            } catch (error) {
                console.error('Error uploading certification image:', error);
            }
        }
        
        this.certifications.push({
            name,
            issuer,
            year,
            image_url: imageUrl
        });
        
        this.renderCertifications();
        this.closeCertificationModal();
        this.showToast('Certification added successfully', 'success');
    },
    
    removeCertification(index) {
        if (confirm('Remove this certification?')) {
            this.certifications.splice(index, 1);
            this.renderCertifications();
            this.showToast('Certification removed', 'success');
        }
    },
    
    // ============================================
    // TIMELINE FUNCTIONS
    // ============================================
    addTimelineEvent() {
        const year = prompt('Enter year (e.g., 2018):');
        if (!year) return;
        
        const title = prompt('Enter event title:');
        if (!title) return;
        
        const description = prompt('Enter description (optional):');
        
        this.timelineEvents.push({
            year,
            title,
            description: description || ''
        });
        
        // Sort by year (oldest first)
        this.timelineEvents.sort((a, b) => parseInt(a.year) - parseInt(b.year));
        
        this.renderTimeline();
        this.showToast('Timeline event added', 'success');
    },
    
    removeTimelineEvent(index) {
        if (confirm('Remove this timeline event?')) {
            this.timelineEvents.splice(index, 1);
            this.renderTimeline();
            this.showToast('Timeline event removed', 'success');
        }
    },
    
    // ============================================
    // SAVE PROFILE
    // ============================================
    async saveCompanyProfile() {
        try {
            // Show loading state
            const saveBtn = document.querySelector('.btn-primary');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;
            
            // Collect form data
            const coreValues = document.getElementById('coreValues')?.value
                .split('\n')
                .map(v => v.trim())
                .filter(v => v) || [];
            
            const exportMarkets = document.getElementById('exportMarkets')?.value
                .split(',')
                .map(m => m.trim())
                .filter(m => m) || [];
            
            const profileData = {
                supplier_id: this.currentSupplier.id,
                about: document.getElementById('about')?.value || '',
                mission: document.getElementById('mission')?.value || '',
                vision: document.getElementById('vision')?.value || '',
                core_values: coreValues,
                factory_size: document.getElementById('factorySize')?.value || '',
                factory_location: document.getElementById('factoryLocation')?.value || '',
                employee_count: document.getElementById('employeeCount')?.value ? 
                    parseInt(document.getElementById('employeeCount').value) : null,
                annual_revenue: document.getElementById('annualRevenue')?.value || '',
                export_markets: exportMarkets,
                certifications: this.certifications,
                company_timeline: this.timelineEvents
            };
            
            let result;
            
            if (this.companyProfile.id) {
                // Update existing
                result = await sb.from('supplier_company_profiles')
                    .update(profileData)
                    .eq('id', this.companyProfile.id);
            } else {
                // Insert new
                result = await sb.from('supplier_company_profiles')
                    .insert(profileData);
            }
            
            if (result.error) throw result.error;
            
            // Restore button
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            
            this.showToast('Company profile saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving profile:', error);
            this.showToast('Error saving profile: ' + error.message, 'error');
            
            // Restore button
            const saveBtn = document.querySelector('.btn-primary');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                saveBtn.disabled = false;
            }
        }
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showToast(message, type = 'success') {
        // Check if toast exists, create if not
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        
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
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Modal close on outside click
        const modal = document.getElementById('certificationModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeCertificationModal();
                }
            });
        }
        
        // Close modal with close button
        const closeBtn = document.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeCertificationModal();
            });
        }
        
        // Cancel button in modal
        const cancelBtn = document.querySelector('.modal-footer .btn-outline');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeCertificationModal();
            });
        }
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    CompanyProfileManager.init();
});

// Make functions globally available
window.CompanyProfileManager = CompanyProfileManager;
window.addCertification = () => CompanyProfileManager.addCertification();
window.closeCertificationModal = () => CompanyProfileManager.closeCertificationModal();
window.saveCertification = () => CompanyProfileManager.saveCertification();
window.addTimelineEvent = () => CompanyProfileManager.addTimelineEvent();
window.saveCompanyProfile = () => CompanyProfileManager.saveCompanyProfile();

