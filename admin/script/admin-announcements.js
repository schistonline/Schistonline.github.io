// ============================================
// ADMIN ANNOUNCEMENTS MANAGEMENT - FIXED VERSION
// ============================================

console.log('🚀 Admin Announcements loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
const AdminAnnouncements = {
    currentUser: null,
    announcements: [],
    filteredAnnouncements: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    async init() {
        console.log('📊 Admin Announcements initializing...');
        
        try {
            await this.checkAuth();
            await this.loadAnnouncements();
            this.setupEventListeners();
            this.updatePreview();
            
            console.log('✅ Admin Announcements initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading announcements', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'admin-login.html?redirect=admin-announcements.html';
                return;
            }
            
            // Check if user is admin
            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single();
            
            if (profileError || !profile?.is_admin) {
                window.location.href = 'index.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ Admin authenticated:', user.email);
            
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = 'admin-login.html';
        }
    },
    
    async loadAnnouncements() {
        try {
            console.log('📥 Loading announcements...');
            
            const { data, error } = await sb
                .from('admin_announcements')
                .select('*')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.announcements = data || [];
            this.filteredAnnouncements = [...this.announcements];
            
            console.log(`✅ Loaded ${this.announcements.length} announcements`);
            
            this.updateStats();
            this.renderAnnouncements();
            
        } catch (error) {
            console.error('Error loading announcements:', error);
            document.getElementById('announcementsList').innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error loading announcements</p>
                </div>
            `;
        }
    },
    
    // ============================================
    // STATS
    // ============================================
    updateStats() {
        const now = new Date();
        
        const total = this.announcements.length;
        
        // Active: is_active = true, start_date <= now, (end_date >= now or end_date is null)
        const active = this.announcements.filter(a => {
            if (!a.is_active) return false;
            
            const startDate = a.start_date ? new Date(a.start_date) : null;
            const endDate = a.end_date ? new Date(a.end_date) : null;
            
            if (startDate && startDate > now) return false;
            if (endDate && endDate < now) return false;
            
            return true;
        }).length;
        
        // Scheduled: is_active = true, start_date > now
        const scheduled = this.announcements.filter(a => {
            if (!a.is_active) return false;
            if (!a.start_date) return false;
            
            const startDate = new Date(a.start_date);
            return startDate > now;
        }).length;
        
        // Expired: end_date < now (regardless of is_active)
        const expired = this.announcements.filter(a => {
            if (!a.end_date) return false;
            
            const endDate = new Date(a.end_date);
            return endDate < now;
        }).length;
        
        document.getElementById('totalAnnouncements').textContent = total;
        document.getElementById('activeAnnouncements').textContent = active;
        document.getElementById('scheduledAnnouncements').textContent = scheduled;
        document.getElementById('expiredAnnouncements').textContent = expired;
    },
    
    // ============================================
    // RENDER ANNOUNCEMENTS
    // ============================================
    renderAnnouncements() {
        const container = document.getElementById('announcementsList');
        
        if (this.filteredAnnouncements.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bullhorn"></i>
                    <h3>No announcements found</h3>
                    <p>Create your first announcement to get started</p>
                    <button class="btn btn-primary" onclick="openAnnouncementModal()">
                        <i class="fas fa-plus"></i> New Announcement
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.filteredAnnouncements.map(a => this.renderAnnouncementCard(a)).join('');
    },
    
    renderAnnouncementCard(announcement) {
        const now = new Date();
        const startDate = announcement.start_date ? new Date(announcement.start_date) : null;
        const endDate = announcement.end_date ? new Date(announcement.end_date) : null;
        
        // Determine status
        let status = 'inactive';
        let statusText = 'Inactive';
        
        if (announcement.is_active) {
            if (startDate && startDate > now) {
                status = 'scheduled';
                statusText = 'Scheduled';
            } else if (endDate && endDate < now) {
                status = 'expired';
                statusText = 'Expired';
            } else {
                status = 'active';
                statusText = 'Active';
            }
        }
        
        const priorityClass = 
            announcement.priority === 2 ? 'urgent' :
            announcement.priority === 1 ? 'high' : 'normal';
        
        const priorityText = 
            announcement.priority === 2 ? 'Urgent' :
            announcement.priority === 1 ? 'High' : 'Normal';
        
        const audience = announcement.target_audience || ['all'];
        
        return `
            <div class="announcement-card ${status}" data-id="${announcement.id}">
                <div class="announcement-header">
                    <div class="announcement-title-section">
                        <span class="priority-badge ${priorityClass}">${priorityText}</span>
                        <h3 class="announcement-title">${this.escapeHtml(announcement.title)}</h3>
                    </div>
                    <div class="announcement-status">
                        <span class="status-badge ${status}">${statusText}</span>
                    </div>
                </div>
                
                <div class="announcement-content">
                    ${announcement.banner_image ? `
                        <div class="announcement-banner-preview">
                            <img src="${announcement.banner_image}" alt="Banner">
                        </div>
                    ` : ''}
                    <div class="announcement-message">
                        ${this.escapeHtml(announcement.message)}
                    </div>
                </div>
                
                <div class="announcement-meta">
                    <span class="meta-item">
                        <i class="fas fa-calendar-alt"></i>
                        Created: ${this.formatDate(announcement.created_at)}
                    </span>
                    ${startDate ? `
                        <span class="meta-item">
                            <i class="fas fa-play"></i>
                            Starts: ${this.formatDate(startDate)}
                        </span>
                    ` : ''}
                    ${endDate ? `
                        <span class="meta-item">
                            <i class="fas fa-stop"></i>
                            Ends: ${this.formatDate(endDate)}
                        </span>
                    ` : ''}
                    ${announcement.link ? `
                        <span class="meta-item">
                            <i class="fas fa-link"></i>
                            Has link
                        </span>
                    ` : ''}
                </div>
                
                <div class="announcement-footer">
                    <div class="target-audience">
                        ${audience.includes('all') ? 
                            '<span class="audience-tag">All Users</span>' : 
                            audience.map(a => `<span class="audience-tag">${a}</span>`).join('')
                        }
                    </div>
                    <div class="announcement-actions">
                        <button class="btn-icon" onclick="editAnnouncement(${announcement.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="duplicateAnnouncement(${announcement.id})" title="Duplicate">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="btn-icon" onclick="toggleAnnouncementStatus(${announcement.id})" title="${announcement.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="fas ${announcement.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="btn-icon btn-danger" onclick="deleteAnnouncement(${announcement.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // FILTERS
    // ============================================
    applyFilters() {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const status = document.getElementById('statusFilter')?.value || 'all';
        const priority = document.getElementById('priorityFilter')?.value || 'all';
        const audience = document.getElementById('audienceFilter')?.value || 'all';
        
        const now = new Date();
        
        this.filteredAnnouncements = this.announcements.filter(a => {
            // Search filter
            if (search && !a.title.toLowerCase().includes(search) && !a.message.toLowerCase().includes(search)) {
                return false;
            }
            
            // Status filter
            if (status !== 'all') {
                let statusMatch = false;
                
                if (status === 'active') {
                    statusMatch = a.is_active && 
                        (!a.start_date || new Date(a.start_date) <= now) &&
                        (!a.end_date || new Date(a.end_date) >= now);
                } else if (status === 'scheduled') {
                    statusMatch = a.is_active && 
                        a.start_date && new Date(a.start_date) > now;
                } else if (status === 'expired') {
                    statusMatch = a.end_date && new Date(a.end_date) < now;
                } else if (status === 'inactive') {
                    statusMatch = !a.is_active;
                }
                
                if (!statusMatch) return false;
            }
            
            // Priority filter
            if (priority !== 'all' && a.priority != priority) {
                return false;
            }
            
            // Audience filter
            if (audience !== 'all') {
                const audiences = a.target_audience || ['all'];
                if (!audiences.includes(audience) && !audiences.includes('all')) {
                    return false;
                }
            }
            
            return true;
        });
        
        this.renderAnnouncements();
    },
    
    resetFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('priorityFilter').value = 'all';
        document.getElementById('audienceFilter').value = 'all';
        this.filteredAnnouncements = [...this.announcements];
        this.renderAnnouncements();
    },
    
    // ============================================
    // CRUD OPERATIONS
    // ============================================
    openAnnouncementModal(id = null) {
        const modal = document.getElementById('announcementModal');
        
        if (id) {
            const announcement = this.announcements.find(a => a.id === id);
            if (announcement) {
                document.getElementById('modalTitle').textContent = 'Edit Announcement';
                document.getElementById('announcementId').value = announcement.id;
                document.getElementById('announcementTitle').value = announcement.title || '';
                document.getElementById('announcementMessage').value = announcement.message || '';
                document.getElementById('bannerImageUrl').value = announcement.banner_image || '';
                document.getElementById('bannerColor').value = announcement.banner_color || '#0B4F6C';
                document.getElementById('bannerColorText').value = announcement.banner_color || '#0B4F6C';
                document.getElementById('textColor').value = announcement.text_color || '#FFFFFF';
                document.getElementById('textColorText').value = announcement.text_color || '#FFFFFF';
                document.getElementById('announcementLink').value = announcement.link || '';
                document.getElementById('linkText').value = announcement.link_text || 'Learn More';
                document.getElementById('priority').value = announcement.priority || 0;
                document.getElementById('isActive').checked = announcement.is_active !== false;
                
                // Handle dates - convert to local datetime-local format
                if (announcement.start_date) {
                    const startDate = new Date(announcement.start_date);
                    document.getElementById('startDate').value = this.formatDateForInput(startDate);
                } else {
                    document.getElementById('startDate').value = '';
                }
                
                if (announcement.end_date) {
                    const endDate = new Date(announcement.end_date);
                    document.getElementById('endDate').value = this.formatDateForInput(endDate);
                } else {
                    document.getElementById('endDate').value = '';
                }
                
                // Handle audience
                const audience = announcement.target_audience || ['all'];
                const select = document.getElementById('targetAudience');
                Array.from(select.options).forEach(opt => {
                    opt.selected = audience.includes(opt.value);
                });
                
                // Show banner preview if exists
                if (announcement.banner_image) {
                    document.getElementById('bannerPreview').innerHTML = `
                        <img src="${announcement.banner_image}" style="max-width: 100%; max-height: 100px;">
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeBanner()">Remove</button>
                    `;
                }
                
                this.updatePreview();
            }
        } else {
            this.resetForm();
        }
        
        modal.classList.add('show');
    },
    
    closeAnnouncementModal() {
        document.getElementById('announcementModal').classList.remove('show');
    },
    
    resetForm() {
        document.getElementById('modalTitle').textContent = 'Create New Announcement';
        document.getElementById('announcementId').value = '';
        document.getElementById('announcementTitle').value = '';
        document.getElementById('announcementMessage').value = '';
        document.getElementById('bannerImageUrl').value = '';
        document.getElementById('bannerColor').value = '#0B4F6C';
        document.getElementById('bannerColorText').value = '#0B4F6C';
        document.getElementById('textColor').value = '#FFFFFF';
        document.getElementById('textColorText').value = '#FFFFFF';
        document.getElementById('announcementLink').value = '';
        document.getElementById('linkText').value = 'Learn More';
        document.getElementById('priority').value = '0';
        document.getElementById('isActive').checked = true;
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        
        const select = document.getElementById('targetAudience');
        Array.from(select.options).forEach(opt => {
            opt.selected = opt.value === 'all';
        });
        
        document.getElementById('bannerPreview').innerHTML = `
            <i class="fas fa-cloud-upload-alt"></i>
            <p>Click to upload banner image</p>
            <small>Recommended: 1200x200px</small>
        `;
        
        this.updatePreview();
    },
    
    async saveAnnouncement(event) {
        event.preventDefault();
        
        const id = document.getElementById('announcementId').value;
        const title = document.getElementById('announcementTitle').value;
        const message = document.getElementById('announcementMessage').value;
        
        if (!title || !message) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        // Collect selected audience
        const select = document.getElementById('targetAudience');
        const selectedAudience = Array.from(select.selectedOptions).map(opt => opt.value);
        
        // Handle dates - convert to ISO string
        let startDate = document.getElementById('startDate').value;
        let endDate = document.getElementById('endDate').value;
        
        if (startDate) {
            startDate = new Date(startDate).toISOString();
        } else {
            startDate = null;
        }
        
        if (endDate) {
            endDate = new Date(endDate).toISOString();
        } else {
            endDate = null;
        }
        
        const announcementData = {
            title,
            message,
            banner_image: document.getElementById('bannerImageUrl').value || null,
            banner_color: document.getElementById('bannerColor').value,
            text_color: document.getElementById('textColor').value,
            link: document.getElementById('announcementLink').value || null,
            link_text: document.getElementById('linkText').value,
            priority: parseInt(document.getElementById('priority').value),
            target_audience: selectedAudience.includes('all') ? ['all'] : selectedAudience,
            start_date: startDate,
            end_date: endDate,
            is_active: document.getElementById('isActive').checked,
            updated_at: new Date().toISOString()
        };
        
        try {
            if (id) {
                // Update
                const { error } = await sb
                    .from('admin_announcements')
                    .update(announcementData)
                    .eq('id', id);
                
                if (error) throw error;
                this.showToast('Announcement updated successfully', 'success');
            } else {
                // Create
                announcementData.created_by = this.currentUser.id;
                announcementData.created_at = new Date().toISOString();
                
                const { error } = await sb
                    .from('admin_announcements')
                    .insert([announcementData]);
                
                if (error) throw error;
                this.showToast('Announcement created successfully', 'success');
            }
            
            this.closeAnnouncementModal();
            await this.loadAnnouncements();
            
        } catch (error) {
            console.error('Error saving announcement:', error);
            this.showToast('Error saving announcement: ' + error.message, 'error');
        }
    },
    
    async deleteAnnouncement(id) {
        if (confirm('Are you sure you want to delete this announcement?')) {
            try {
                const { error } = await sb
                    .from('admin_announcements')
                    .delete()
                    .eq('id', id);
                
                if (error) throw error;
                
                this.showToast('Announcement deleted', 'success');
                await this.loadAnnouncements();
                
            } catch (error) {
                console.error('Error deleting announcement:', error);
                this.showToast('Error deleting announcement', 'error');
            }
        }
    },
    
    async duplicateAnnouncement(id) {
        const announcement = this.announcements.find(a => a.id === id);
        if (!announcement) return;
        
        const { id: _, created_at, updated_at, ...copyData } = announcement;
        
        copyData.title = `${copyData.title} (Copy)`;
        copyData.created_at = new Date().toISOString();
        copyData.created_by = this.currentUser.id;
        
        try {
            const { error } = await sb
                .from('admin_announcements')
                .insert([copyData]);
            
            if (error) throw error;
            
            this.showToast('Announcement duplicated', 'success');
            await this.loadAnnouncements();
            
        } catch (error) {
            console.error('Error duplicating announcement:', error);
            this.showToast('Error duplicating announcement', 'error');
        }
    },
    
    async toggleAnnouncementStatus(id) {
        const announcement = this.announcements.find(a => a.id === id);
        if (!announcement) return;
        
        try {
            const { error } = await sb
                .from('admin_announcements')
                .update({ 
                    is_active: !announcement.is_active,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            
            this.showToast(`Announcement ${announcement.is_active ? 'deactivated' : 'activated'}`, 'success');
            await this.loadAnnouncements();
            
        } catch (error) {
            console.error('Error toggling status:', error);
            this.showToast('Error updating status', 'error');
        }
    },
    
    // ============================================
    // IMAGE UPLOAD
    // ============================================
    async uploadBanner(file) {
        const fileName = `announcements/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        
        try {
            const { error } = await sb.storage
                .from('announcement-assets')
                .upload(fileName, file);
            
            if (error) throw error;
            
            const { data: { publicUrl } } = sb.storage
                .from('announcement-assets')
                .getPublicUrl(fileName);
            
            return publicUrl;
            
        } catch (error) {
            console.error('Error uploading banner:', error);
            throw error;
        }
    },
    
    removeBanner() {
        document.getElementById('bannerImageUrl').value = '';
        document.getElementById('bannerPreview').innerHTML = `
            <i class="fas fa-cloud-upload-alt"></i>
            <p>Click to upload banner image</p>
            <small>Recommended: 1200x200px</small>
        `;
    },
    
    // ============================================
    // PREVIEW
    // ============================================
    updatePreview() {
        const title = document.getElementById('announcementTitle').value || 'Announcement Title';
        const message = document.getElementById('announcementMessage').value || 'Your announcement message will appear here...';
        const bgColor = document.getElementById('bannerColor').value;
        const textColor = document.getElementById('textColor').value;
        
        const preview = document.getElementById('announcementPreview');
        preview.innerHTML = `
            <div class="preview-banner" style="background-color: ${bgColor}; color: ${textColor};">
                <div class="preview-icon">
                    <i class="fas fa-bullhorn"></i>
                </div>
                <div class="preview-content">
                    <div class="preview-title">${this.escapeHtml(title)}</div>
                    <div class="preview-message">${this.escapeHtml(message)}</div>
                </div>
            </div>
        `;
    },
    
    // ============================================
    // EXPORT
    // ============================================
    exportAnnouncements() {
        const data = this.announcements.map(a => ({
            id: a.id,
            title: a.title,
            message: a.message,
            priority: a.priority,
            is_active: a.is_active,
            start_date: a.start_date,
            end_date: a.end_date,
            target_audience: a.target_audience,
            created_at: a.created_at
        }));
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `announcements_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('Announcements exported', 'success');
    },
    
    // ============================================
    // UTILITIES
    // ============================================
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatDateForInput(date) {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
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
        document.getElementById('announcementForm').addEventListener('submit', (e) => {
            this.saveAnnouncement(e);
        });
        
        // Search input
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.applyFilters(), 300);
        });
        
        // Filter changes
        document.getElementById('statusFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('priorityFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('audienceFilter').addEventListener('change', () => this.applyFilters());
        
        // Color picker sync
        document.getElementById('bannerColor').addEventListener('input', (e) => {
            document.getElementById('bannerColorText').value = e.target.value;
            this.updatePreview();
        });
        
        document.getElementById('bannerColorText').addEventListener('input', (e) => {
            const value = e.target.value;
            if (/^#[0-9A-F]{6}$/i.test(value)) {
                document.getElementById('bannerColor').value = value;
                this.updatePreview();
            }
        });
        
        document.getElementById('textColor').addEventListener('input', (e) => {
            document.getElementById('textColorText').value = e.target.value;
            this.updatePreview();
        });
        
        document.getElementById('textColorText').addEventListener('input', (e) => {
            const value = e.target.value;
            if (/^#[0-9A-F]{6}$/i.test(value)) {
                document.getElementById('textColor').value = value;
                this.updatePreview();
            }
        });
        
        // Title and message preview updates
        document.getElementById('announcementTitle').addEventListener('input', () => this.updatePreview());
        document.getElementById('announcementMessage').addEventListener('input', () => this.updatePreview());
        
        // Image upload
        document.getElementById('bannerUploadArea').addEventListener('click', () => {
            document.getElementById('bannerImage').click();
        });
        
        document.getElementById('bannerImage').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const url = await this.uploadBanner(file);
                    document.getElementById('bannerImageUrl').value = url;
                    document.getElementById('bannerPreview').innerHTML = `
                        <img src="${url}" style="max-width: 100%; max-height: 100px;">
                        <button type="button" class="btn btn-sm btn-danger" onclick="removeBanner()">Remove</button>
                    `;
                    this.showToast('Banner uploaded', 'success');
                } catch (error) {
                    this.showToast('Error uploading banner', 'error');
                }
            }
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAnnouncementModal();
                }
            });
        });
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    AdminAnnouncements.init();
});

// Global functions
window.openAnnouncementModal = (id) => AdminAnnouncements.openAnnouncementModal(id);
window.closeAnnouncementModal = () => AdminAnnouncements.closeAnnouncementModal();
window.editAnnouncement = (id) => AdminAnnouncements.openAnnouncementModal(id);
window.deleteAnnouncement = (id) => AdminAnnouncements.deleteAnnouncement(id);
window.duplicateAnnouncement = (id) => AdminAnnouncements.duplicateAnnouncement(id);
window.toggleAnnouncementStatus = (id) => AdminAnnouncements.toggleAnnouncementStatus(id);
window.applyFilters = () => AdminAnnouncements.applyFilters();
window.resetFilters = () => AdminAnnouncements.resetFilters();
window.exportAnnouncements = () => AdminAnnouncements.exportAnnouncements();
window.removeBanner = () => AdminAnnouncements.removeBanner();
