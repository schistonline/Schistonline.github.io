// ============================================
// SUPPLIER VIDEOS MANAGEMENT
// Suppliers can view, edit, and manage their product videos
// ============================================

console.log('🎬 Supplier Videos loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SupplierVideos = {
    currentUser: null,
    supplier: null,
    videos: [],
    filteredVideos: [],
    currentPage: 1,
    itemsPerPage: 12,
    hasMore: true,
    isLoading: false,
    currentFilter: 'all',
    searchTerm: '',
    
    async init() {
        console.log('📊 Supplier Videos initializing...');
        
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadVideos();
            this.setupEventListeners();
            
            // Hide loading state
            const loadingEl = document.getElementById('loadingState');
            if (loadingEl) loadingEl.style.display = 'none';
            
            console.log('✅ Supplier Videos initialized');
        } catch (error) {
            console.error('❌ Error initializing:', error);
            this.showToast('Error loading videos', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'login.html?redirect=supplier-videos.html';
                return;
            }
            
            this.currentUser = user;
            console.log('✅ User authenticated:', user.email);
            
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
            
            this.supplier = data;
            console.log('✅ Supplier loaded:', this.supplier.business_name);
            
        } catch (error) {
            console.error('Error loading supplier:', error);
            this.showToast('Error loading supplier data', 'error');
        }
    },
    
    async loadVideos(reset = true) {
        if (!this.supplier || this.isLoading) return;
        
        this.isLoading = true;
        
        // Safely get DOM elements
        const loadingEl = document.getElementById('loadingState');
        const videosGrid = document.getElementById('videosGrid');
        const emptyEl = document.getElementById('emptyState');
        const loadMoreEl = document.getElementById('loadMore');
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            
            if (loadingEl) loadingEl.style.display = 'block';
            if (videosGrid) videosGrid.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'none';
            if (loadMoreEl) loadMoreEl.style.display = 'none';
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            let query = sb
                .from('product_videos')
                .select(`
                    *,
                    product:ads!product_videos_product_id_fkey (
                        id,
                        title,
                        price,
                        image_urls
                    )
                `)
                .eq('supplier_id', this.supplier.id)
                .order('created_at', { ascending: false });
            
            // Apply filter
            if (this.currentFilter === 'active') {
                query = query.eq('is_active', true);
            } else if (this.currentFilter === 'inactive') {
                query = query.eq('is_active', false);
            }
            
            // Apply search
            if (this.searchTerm) {
                query = query.or(`caption.ilike.%${this.searchTerm}%,product.title.ilike.%${this.searchTerm}%`);
            }
            
            const { data, error } = await query.range(from, to);
            
            if (error) throw error;
            
            if (reset) {
                this.videos = data || [];
            } else {
                this.videos = [...this.videos, ...(data || [])];
            }
            
            this.filteredVideos = [...this.videos];
            this.hasMore = (data || []).length === this.itemsPerPage;
            
            this.updateStats();
            this.renderVideos();
            
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (emptyEl) {
                emptyEl.style.display = this.filteredVideos.length === 0 ? 'block' : 'none';
            }
            
            if (loadMoreEl) {
                loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
            }
            
        } catch (error) {
            console.error('Error loading videos:', error);
            this.showToast('Error loading videos', 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    updateStats() {
        const total = this.videos.length;
        const active = this.videos.filter(v => v.is_active).length;
        const inactive = this.videos.filter(v => !v.is_active).length;
        const totalViews = this.videos.reduce((sum, v) => sum + (v.views || 0), 0);
        
        const totalEl = document.getElementById('totalVideos');
        const activeEl = document.getElementById('activeVideos');
        const inactiveEl = document.getElementById('inactiveVideos');
        const viewsEl = document.getElementById('totalViews');
        
        if (totalEl) totalEl.textContent = total;
        if (activeEl) activeEl.textContent = active;
        if (inactiveEl) inactiveEl.textContent = inactive;
        if (viewsEl) viewsEl.textContent = this.formatNumber(totalViews);
    },
    
    renderVideos() {
        const container = document.getElementById('videosGrid');
        if (!container) return;
        
        if (this.filteredVideos.length === 0) return;
        
        container.innerHTML = this.filteredVideos.map(video => this.renderVideoCard(video)).join('');
    },
    
    renderVideoCard(video) {
        const thumbnailUrl = video.thumbnail_url || video.video_url || 'https://via.placeholder.com/300x500?text=No+Thumbnail';
        const productTitle = video.product?.title || 'Unknown Product';
        const status = video.is_active ? 'active' : 'inactive';
        const createdDate = new Date(video.created_at).toLocaleDateString();
        const duration = this.formatDuration(video.duration || 0);
        
        return `
            <div class="video-card ${status}" data-video-id="${video.id}">
                <div class="video-thumbnail">
                    <img src="${thumbnailUrl}" alt="${this.escapeHtml(productTitle)}" loading="lazy">
                    <span class="video-duration">${duration}</span>
                    ${!video.is_active ? '<span class="video-status-badge inactive">Inactive</span>' : ''}
                </div>
                
                <div class="video-info">
                    <h3 class="video-title">${this.escapeHtml(productTitle)}</h3>
                    <p class="video-caption-preview">${this.escapeHtml(video.caption || '').substring(0, 60)}${video.caption?.length > 60 ? '...' : ''}</p>
                    
                    <div class="video-stats">
                        <span><i class="fas fa-eye"></i> ${video.views || 0}</span>
                        <span><i class="fas fa-heart"></i> ${video.likes || 0}</span>
                        <span><i class="fas fa-comment"></i> ${video.comments || 0}</span>
                        <span><i class="fas fa-calendar"></i> ${createdDate}</span>
                    </div>
                </div>
                
                <div class="video-actions">
                    <button class="action-btn view-btn" onclick="SupplierVideos.viewVideo(${video.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="SupplierVideos.editVideo(${video.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn toggle-btn" onclick="SupplierVideos.toggleStatus(${video.id})" title="${video.is_active ? 'Deactivate' : 'Activate'}">
                        <i class="fas ${video.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="SupplierVideos.deleteVideo(${video.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },
    
    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    async viewVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        
        // Open video in a modal or new tab
        const modal = document.getElementById('viewVideoModal');
        const modalBody = document.getElementById('viewVideoBody');
        const productTitle = video.product?.title || 'Unknown Product';
        
        if (modalBody) {
            modalBody.innerHTML = `
                <div class="video-preview-container">
                    <video controls autoplay loop>
                        <source src="${video.video_url}" type="video/mp4">
                    </video>
                </div>
                
                <div class="video-details">
                    <h2>${this.escapeHtml(productTitle)}</h2>
                    
                    <div class="detail-stats">
                        <span><i class="fas fa-eye"></i> ${video.views || 0} views</span>
                        <span><i class="fas fa-heart"></i> ${video.likes || 0} likes</span>
                        <span><i class="fas fa-comment"></i> ${video.comments || 0} comments</span>
                    </div>
                    
                    ${video.caption ? `
                        <div class="detail-caption">
                            <h3>Caption</h3>
                            <p>${this.escapeHtml(video.caption)}</p>
                        </div>
                    ` : ''}
                    
                    <div class="detail-meta">
                        <p><strong>Uploaded:</strong> ${new Date(video.created_at).toLocaleString()}</p>
                        <p><strong>Duration:</strong> ${this.formatDuration(video.duration || 0)}</p>
                        <p><strong>Status:</strong> <span class="status-badge ${video.is_active ? 'active' : 'inactive'}">${video.is_active ? 'Active' : 'Inactive'}</span></p>
                    </div>
                </div>
            `;
        }
        
        document.getElementById('viewVideoModal')?.classList.add('show');
    },
    
    async editVideo(videoId) {
        // Redirect to upload page with video ID for editing
        window.location.href = `upload-product-video.html?edit=${videoId}`;
    },
    
    async toggleStatus(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        
        const newStatus = !video.is_active;
        const action = newStatus ? 'activate' : 'deactivate';
        
        if (!confirm(`Are you sure you want to ${action} this video?`)) return;
        
        try {
            const { error } = await sb
                .from('product_videos')
                .update({ 
                    is_active: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', videoId);
            
            if (error) throw error;
            
            video.is_active = newStatus;
            this.renderVideos();
            this.updateStats();
            this.showToast(`Video ${newStatus ? 'activated' : 'deactivated'}`, 'success');
            
        } catch (error) {
            console.error('Error toggling video status:', error);
            this.showToast('Error updating video', 'error');
        }
    },
    
    async deleteVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;
        
        if (!confirm(`Are you sure you want to delete this video? This action cannot be undone.`)) return;
        
        try {
            // Delete from database
            const { error } = await sb
                .from('product_videos')
                .delete()
                .eq('id', videoId);
            
            if (error) throw error;
            
            // Try to delete from storage (optional)
            try {
                const videoPath = video.video_url.split('/').pop();
                const thumbnailPath = video.thumbnail_url?.split('/').pop();
                
                if (videoPath) {
                    await sb.storage
                        .from('product-videos')
                        .remove([`${this.supplier.id}/videos/${videoPath}`]);
                }
                
                if (thumbnailPath) {
                    await sb.storage
                        .from('product-videos')
                        .remove([`${this.supplier.id}/thumbnails/${thumbnailPath}`]);
                }
            } catch (storageError) {
                console.warn('Could not delete from storage:', storageError);
            }
            
            // Remove from local array
            this.videos = this.videos.filter(v => v.id !== videoId);
            this.filteredVideos = this.filteredVideos.filter(v => v.id !== videoId);
            
            this.renderVideos();
            this.updateStats();
            this.showToast('Video deleted successfully', 'success');
            
        } catch (error) {
            console.error('Error deleting video:', error);
            this.showToast('Error deleting video', 'error');
        }
    },
    
    filterVideos(filter) {
        this.currentFilter = filter;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        if (filter === 'all') {
            this.filteredVideos = [...this.videos];
        } else if (filter === 'active') {
            this.filteredVideos = this.videos.filter(v => v.is_active);
        } else if (filter === 'inactive') {
            this.filteredVideos = this.videos.filter(v => !v.is_active);
        }
        
        this.renderVideos();
        
        // Show/hide empty state
        const emptyEl = document.getElementById('emptyState');
        if (emptyEl) {
            emptyEl.style.display = this.filteredVideos.length === 0 ? 'block' : 'none';
        }
    },
    
    handleSearch() {
        const searchInput = document.getElementById('searchInput');
        this.searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        
        if (!this.searchTerm) {
            this.filteredVideos = [...this.videos];
        } else {
            this.filteredVideos = this.videos.filter(video => {
                const productTitle = video.product?.title || '';
                const caption = video.caption || '';
                return productTitle.toLowerCase().includes(this.searchTerm) || 
                       caption.toLowerCase().includes(this.searchTerm);
            });
        }
        
        this.renderVideos();
        
        // Show/hide empty state
        const emptyEl = document.getElementById('emptyState');
        if (emptyEl) {
            emptyEl.style.display = this.filteredVideos.length === 0 ? 'block' : 'none';
        }
    },
    
    loadMoreVideos() {
        if (!this.hasMore || this.isLoading) return;
        this.currentPage++;
        this.loadVideos(false);
    },
    
    refreshVideos() {
        this.loadVideos(true);
    },
    
    closeViewModal() {
        document.getElementById('viewVideoModal')?.classList.remove('show');
        // Stop video when closing
        const video = document.querySelector('#viewVideoModal video');
        if (video) video.pause();
    },
    
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
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    setupEventListeners() {
        // Search with debounce
        let searchTimeout;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.handleSearch(), 500);
            });
        }
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterVideos(filter);
            });
        });
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshVideos();
            });
        }
        
        // Upload button
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                window.location.href = 'upload-product-video.html';
            });
        }
        
        // Close modal on outside click
        const modal = document.getElementById('viewVideoModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeViewModal();
                }
            });
        }
        
        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeViewModal();
            }
        });
    }
};

// Global functions
window.SupplierVideos = SupplierVideos;
window.closeViewModal = () => SupplierVideos.closeViewModal();
window.viewVideo = (id) => SupplierVideos.viewVideo(id);
window.editVideo = (id) => SupplierVideos.editVideo(id);
window.toggleStatus = (id) => SupplierVideos.toggleStatus(id);
window.deleteVideo = (id) => SupplierVideos.deleteVideo(id);
window.filterVideos = (filter) => SupplierVideos.filterVideos(filter);
window.handleSearch = () => SupplierVideos.handleSearch();
window.refreshVideos = () => SupplierVideos.refreshVideos();
window.loadMoreVideos = () => SupplierVideos.loadMoreVideos();

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SupplierVideos.init());
} else {
    SupplierVideos.init();
}