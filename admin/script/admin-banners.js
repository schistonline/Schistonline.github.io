// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Banner Manager Object to encapsulate all functions
const BannerManager = {
    currentBannerId: null,

    // Initialize on page load
    init: async function() {
        await this.checkAdminAuth();
        await this.loadBanners();
        this.setupEventListeners();
    },

    // Setup event listeners
    setupEventListeners: function() {
        // Add any additional event listeners here
    },

    // Check admin authentication
    checkAdminAuth: async function() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) {
                window.location.href = 'admin-login.html?redirect=admin-banners.html';
                return;
            }

            const { data: profile } = await sb
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single();

            if (!profile?.is_admin) {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.showToast('Authentication error', 'error');
        }
    },

    // Load banners
    loadBanners: async function() {
        const grid = document.getElementById('bannersGrid');
        if (!grid) return;

        grid.innerHTML = '<div class="loading">Loading banners...</div>';

        try {
            let query = sb
                .from('banners')
                .select('*')
                .order('display_order', { ascending: true })
                .order('created_at', { ascending: false });

            // Apply filters
            const typeFilter = document.getElementById('typeFilter')?.value;
            const statusFilter = document.getElementById('statusFilter')?.value;

            if (typeFilter) {
                query = query.eq('banner_type', typeFilter);
            }

            if (statusFilter) {
                const now = new Date().toISOString();
                if (statusFilter === 'active') {
                    query = query
                        .eq('is_active', true)
                        .lte('start_date', now)
                        .or(`end_date.gt.${now},end_date.is.null`);
                } else if (statusFilter === 'inactive') {
                    query = query.eq('is_active', false);
                } else if (statusFilter === 'scheduled') {
                    query = query
                        .eq('is_active', true)
                        .gt('start_date', now);
                } else if (statusFilter === 'expired') {
                    query = query
                        .eq('is_active', true)
                        .lt('end_date', now);
                }
            }

            const { data: banners, error } = await query;

            if (error) throw error;

            if (!banners || banners.length === 0) {
                grid.innerHTML = '<div class="empty-state">No banners found. Click "Add New Banner" to create one.</div>';
                return;
            }

            grid.innerHTML = banners.map(banner => this.createBannerCard(banner)).join('');

        } catch (error) {
            console.error('Error loading banners:', error);
            grid.innerHTML = '<div class="error-state">Error loading banners. Please try again.</div>';
            this.showToast('Error loading banners', 'error');
        }
    },

    // Create banner card HTML
    createBannerCard: function(banner) {
        const now = new Date();
        const startDate = new Date(banner.start_date);
        const endDate = banner.end_date ? new Date(banner.end_date) : null;
        
        let status = 'inactive';
        let statusClass = 'badge-danger';
        
        if (banner.is_active) {
            if (startDate > now) {
                status = 'scheduled';
                statusClass = 'badge-warning';
            } else if (endDate && endDate < now) {
                status = 'expired';
                statusClass = 'badge-danger';
            } else {
                status = 'active';
                statusClass = 'badge-success';
            }
        }

        return `
            <div class="banner-card" data-id="${banner.id}">
                <div class="banner-preview" style="background-image: url('${banner.image_url}')">
                    <span class="banner-preview-overlay">${banner.banner_type}</span>
                </div>
                <div class="banner-content">
                    <div class="banner-title">
                        <span>${this.escapeHtml(banner.title)}</span>
                        <span class="badge ${statusClass}">${status}</span>
                    </div>
                    ${banner.description ? `<p class="banner-description">${this.escapeHtml(banner.description.substring(0, 50))}${banner.description.length > 50 ? '...' : ''}</p>` : ''}
                    
                    <div class="banner-meta">
                        <span><i class="fas fa-calendar"></i> ${new Date(banner.start_date).toLocaleDateString()}</span>
                        ${banner.end_date ? `<span><i class="fas fa-clock"></i> until ${new Date(banner.end_date).toLocaleDateString()}</span>` : ''}
                    </div>

                    <div class="banner-tags">
                        <span class="badge badge-info">Order: ${banner.display_order}</span>
                        ${banner.link_type ? `<span class="badge badge-info">${banner.link_type}</span>` : ''}
                    </div>

                    <div class="banner-actions">
                        <button class="btn btn-sm" onclick="window.bannerManager.editBanner(${banner.id})" style="flex: 1;">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.bannerManager.deleteBanner(${banner.id})" style="flex: 1;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                    <div class="banner-stats">
                        <small class="text-muted">${banner.click_count || 0} clicks</small>
                    </div>
                </div>
            </div>
        `;
    },

    // Open banner modal
    openBannerModal: function(bannerId = null) {
        const modal = document.getElementById('bannerModal');
        if (!modal) return;
        
        modal.classList.add('show');
        document.getElementById('modalTitle').textContent = bannerId ? 'Edit Banner' : 'Add New Banner';
        
        if (bannerId) {
            this.loadBannerForEdit(bannerId);
        } else {
            this.resetForm();
        }
    },

    // Close banner modal
    closeBannerModal: function() {
        const modal = document.getElementById('bannerModal');
        if (modal) {
            modal.classList.remove('show');
            this.resetForm();
        }
    },

    // Reset form
    resetForm: function() {
        const form = document.getElementById('bannerForm');
        if (form) form.reset();
        
        document.getElementById('bannerId').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        
        // Set default start date to now
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('startDate').value = `${year}-${month}-${day}T${hours}:${minutes}`;
        
        document.getElementById('isActive').checked = true;
    },

    // Load banner for editing
    loadBannerForEdit: async function(id) {
        try {
            const { data: banner, error } = await sb
                .from('banners')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            // Populate form fields
            document.getElementById('bannerId').value = banner.id;
            document.getElementById('title').value = banner.title || '';
            document.getElementById('description').value = banner.description || '';
            document.getElementById('bannerType').value = banner.banner_type || 'hero';
            document.getElementById('displayOrder').value = banner.display_order || 0;
            document.getElementById('imageUrl').value = banner.image_url || '';
            document.getElementById('mobileImageUrl').value = banner.mobile_image_url || '';
            document.getElementById('linkType').value = banner.link_type || 'internal';
            document.getElementById('linkValue').value = banner.link_value || '';
            document.getElementById('buttonText').value = banner.button_text || 'Shop Now';
            document.getElementById('backgroundColor').value = banner.background_color || '#0B4F6C';
            document.getElementById('textColor').value = banner.text_color || '#FFFFFF';
            
            // Format dates for datetime-local input
            if (banner.start_date) {
                const startDate = new Date(banner.start_date);
                document.getElementById('startDate').value = startDate.toISOString().slice(0, 16);
            }
            
            if (banner.end_date) {
                const endDate = new Date(banner.end_date);
                document.getElementById('endDate').value = endDate.toISOString().slice(0, 16);
            }
            
            document.getElementById('isActive').checked = banner.is_active !== false;

            // Set target audience
            if (banner.target_audience && banner.target_audience.length) {
                const audienceSelect = document.getElementById('targetAudience');
                Array.from(audienceSelect.options).forEach(option => {
                    option.selected = banner.target_audience.includes(option.value);
                });
            }

            // Set target regions
            if (banner.target_regions && banner.target_regions.length) {
                const regionsSelect = document.getElementById('targetRegions');
                Array.from(regionsSelect.options).forEach(option => {
                    option.selected = banner.target_regions.includes(option.value);
                });
            }

            // Show image preview
            this.showImagePreview(banner.image_url);

            // Update link hint
            this.handleLinkTypeChange();

        } catch (error) {
            console.error('Error loading banner:', error);
            this.showToast('Error loading banner', 'error');
            this.closeBannerModal();
        }
    },

    // Save banner
    saveBanner: async function(event) {
        event.preventDefault();

        try {
            const bannerData = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value || null,
                banner_type: document.getElementById('bannerType').value,
                display_order: parseInt(document.getElementById('displayOrder').value) || 0,
                image_url: document.getElementById('imageUrl').value,
                mobile_image_url: document.getElementById('mobileImageUrl').value || null,
                link_type: document.getElementById('linkType').value,
                link_value: document.getElementById('linkValue').value,
                button_text: document.getElementById('buttonText').value,
                background_color: document.getElementById('backgroundColor').value,
                text_color: document.getElementById('textColor').value,
                start_date: new Date(document.getElementById('startDate').value).toISOString(),
                end_date: document.getElementById('endDate').value ? new Date(document.getElementById('endDate').value).toISOString() : null,
                target_audience: Array.from(document.getElementById('targetAudience').selectedOptions).map(opt => opt.value),
                target_regions: Array.from(document.getElementById('targetRegions').selectedOptions).map(opt => opt.value),
                is_active: document.getElementById('isActive').checked
            };

            const bannerId = document.getElementById('bannerId').value;
            const { data: { user } } = await sb.auth.getUser();

            let result;
            if (bannerId) {
                // Update
                bannerData.updated_at = new Date().toISOString();
                result = await sb
                    .from('banners')
                    .update(bannerData)
                    .eq('id', bannerId);
            } else {
                // Insert
                bannerData.created_by = user?.id;
                bannerData.created_at = new Date().toISOString();
                result = await sb
                    .from('banners')
                    .insert([bannerData]);
            }

            if (result.error) throw result.error;

            this.showToast(bannerId ? 'Banner updated successfully' : 'Banner created successfully', 'success');
            this.closeBannerModal();
            await this.loadBanners();

        } catch (error) {
            console.error('Error saving banner:', error);
            this.showToast('Error saving banner: ' + error.message, 'error');
        }
    },

    // Edit banner (wrapper for opening modal)
    editBanner: function(id) {
        this.openBannerModal(id);
    },

    // Delete banner
    deleteBanner: function(id) {
        this.currentBannerId = id;
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.classList.add('show');
        }
    },

    // Close delete modal
    closeDeleteModal: function() {
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.classList.remove('show');
            this.currentBannerId = null;
        }
    },

    // Confirm delete
    confirmDelete: async function() {
        if (!this.currentBannerId) return;

        try {
            const { error } = await sb
                .from('banners')
                .delete()
                .eq('id', this.currentBannerId);

            if (error) throw error;

            this.showToast('Banner deleted successfully', 'success');
            this.closeDeleteModal();
            await this.loadBanners();

        } catch (error) {
            console.error('Error deleting banner:', error);
            this.showToast('Error deleting banner', 'error');
        }
    },

    // Show image preview
    showImagePreview: function(url) {
        const preview = document.getElementById('imagePreview');
        if (preview && url) {
            preview.innerHTML = `<img src="${url}" class="image-preview" alt="Preview" onerror="this.style.display='none'">`;
        }
    },

    // Handle link type change
    handleLinkTypeChange: function() {
        const type = document.getElementById('linkType').value;
        const hint = document.getElementById('linkHint');
        
        const hints = {
            'internal': 'Enter page path (e.g., /bulk-deals)',
            'external': 'Enter full URL (https://...)',
            'category': 'Enter category ID or slug',
            'ad': 'Enter ad ID',
            'supplier': 'Enter supplier ID',
            'search': 'Enter search query'
        };
        
        if (hint) {
            hint.textContent = hints[type] || 'Enter value';
        }
    },

    // Reset filters
    resetFilters: function() {
        const typeFilter = document.getElementById('typeFilter');
        const statusFilter = document.getElementById('statusFilter');
        
        if (typeFilter) typeFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        
        this.loadBanners();
    },

    // Escape HTML to prevent XSS
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Show toast notification
    showToast: function(message, type = 'info') {
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
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.bannerManager = BannerManager;
    BannerManager.init();
});

// Make functions globally accessible through window.bannerManager
window.openBannerModal = (id) => BannerManager.openBannerModal(id);
window.closeBannerModal = () => BannerManager.closeBannerModal();
window.editBanner = (id) => BannerManager.editBanner(id);
window.deleteBanner = (id) => BannerManager.deleteBanner(id);
window.closeDeleteModal = () => BannerManager.closeDeleteModal();
window.confirmDelete = () => BannerManager.confirmDelete();
window.saveBanner = (event) => BannerManager.saveBanner(event);
window.handleLinkTypeChange = () => BannerManager.handleLinkTypeChange();
window.resetFilters = () => BannerManager.resetFilters();